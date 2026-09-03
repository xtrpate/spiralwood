// controllers/orderController.js – Order Management (Admin) [SCHEMA-CORRECTED]
// controllers/orderController.js – Order Management (Admin) [SCHEMA-CORRECTED]
const pool = require("../../config/db");
const { signUploadPath } = require("../../utils/signedUrl");
const {
  storeUploadBuffer,
  cleanupStoredUpload,
} = require("../../utils/adaptiveUpload");
const {
  resolveLifecycleByOrder,
} = require("../../services/blueprintLifecycleService");
const { parseStrictPositiveInt } = require("../../utils/validators");
const { calcDownPaymentAmount } = require("../../utils/paymentAmounts");
const {
  buildPaymentSummaryFromRows,
} = require("../../services/blueprintCashPaymentService");
const {
  ensureReceiptForVerifiedPayment,
} = require("../../services/blueprintReceiptService");
const {
  ensureStandardVerifiedPaymentReceipt,
} = require("../../services/receiptService");
const {
  consumeBlueprintMaterialsForProduction,
  BlueprintMaterialConsumptionError,
} = require("../../services/blueprintMaterialConsumptionService");
const {
  releaseBlueprintMaterialsForCancellation,
  BlueprintMaterialReleaseError,
} = require("../../services/blueprintMaterialReleaseService");
const {
  createNotification,
  createNotificationSafe,
} = require("../../utils/notificationHelper");
const {
  isSettingEnabled,
  getGlobalEmailFooter,
  sendBrevoEmail,
} = require("../../utils/emailHelper");

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

function normalizeTaskRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

const BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const REQUIRED_BLUEPRINT_TASK_ROLES =
  BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS.map(normalizeTaskRole);

const getTaskRoleLabel = (role) =>
  BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS.find(
    (label) => normalizeTaskRole(label) === normalizeTaskRole(role),
  ) || role;

const safeParseJson = (value, fallback = null) => {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeCustomRequestItem = (item = {}) => {
  const customization = safeParseJson(item.customization_json, null);

  const editorSnapshot =
    customization?.editor_snapshot &&
    typeof customization.editor_snapshot === "object" &&
    !Array.isArray(customization.editor_snapshot)
      ? customization.editor_snapshot
      : null;

  return {
    ...item,
    customization,
    display_name:
      customization?.base_blueprint_title ||
      item.product_name ||
      "Custom Furniture",
    preview_image_url:
      customization?.preview_image_url || customization?.image_url || "",
    requested_blueprint_id: Number(customization?.blueprint_id || 0) || null,
    requested_base_blueprint_title: customization?.base_blueprint_title || "",
    requested_wood_type: customization?.wood_type || "",
    requested_finish_color:
      customization?.finish_color || customization?.color || "",
    requested_door_style: customization?.door_style || "",
    requested_hardware: customization?.hardware || "",
    requested_assembly_choice: ["included", "none"].includes(
      normalize(customization?.assembly_choice),
    )
      ? normalize(customization?.assembly_choice)
      : "",
    requested_width: Number(customization?.width) || 0,
    requested_height: Number(customization?.height) || 0,
    requested_depth: Number(customization?.depth) || 0,
    requested_unit: customization?.unit || "mm",
    requested_comments: customization?.comments || "",
    customization_snapshot:
      customization?.customization_snapshot &&
      typeof customization.customization_snapshot === "object"
        ? customization.customization_snapshot
        : null,
    editor_snapshot: editorSnapshot,
  };
};

const sendSystemNotificationSafe = async (
  conn,
  userId,
  {
    type = "custom_request_update",
    title,
    message,
    targetType = null,
    targetId = null,
    targetOrderId = null,
  },
) => {
  await createNotificationSafe(conn, {
    userId,
    type,
    title,
    message,
    targetType,
    targetId,
    targetOrderId,
  });
};

const buildCustomRequestBlueprintPayload = ({
  order,
  customItem,
  baseBlueprint = null,
  adminUserId,
}) => {
  const customization = safeParseJson(customItem?.customization_json, {}) || {};

  const editorSnapshot =
    customization?.editor_snapshot &&
    typeof customization.editor_snapshot === "object" &&
    !Array.isArray(customization.editor_snapshot)
      ? customization.editor_snapshot
      : null;

  const baseDesign =
    safeParseJson(baseBlueprint?.design_data, {}) &&
    typeof safeParseJson(baseBlueprint?.design_data, {}) === "object"
      ? safeParseJson(baseBlueprint?.design_data, {})
      : {};

  const baseView3d =
    safeParseJson(baseBlueprint?.view_3d_data, {}) &&
    typeof safeParseJson(baseBlueprint?.view_3d_data, {}) === "object"
      ? safeParseJson(baseBlueprint?.view_3d_data, {})
      : {};

  const titleBase =
    customization?.base_blueprint_title ||
    baseBlueprint?.title ||
    customItem?.product_name ||
    "Custom Furniture";

  const worldSize =
    editorSnapshot?.worldSize && typeof editorSnapshot.worldSize === "object"
      ? editorSnapshot.worldSize
      : baseDesign?.worldSize ||
        baseView3d?.worldSize || {
          w: 6400,
          h: 3200,
          d: 5200,
        };

  const components = Array.isArray(editorSnapshot?.components)
    ? editorSnapshot.components
    : Array.isArray(baseDesign?.components)
      ? baseDesign.components
      : Array.isArray(baseView3d?.components)
        ? baseView3d.components
        : [];

  const requestMeta = {
    order_id: order.id,
    order_number: order.order_number,
    requested_wood_type: customization?.wood_type || "",
    requested_finish_color:
      customization?.finish_color || customization?.color || "",
    requested_door_style: customization?.door_style || "",
    requested_hardware: customization?.hardware || "",
    requested_assembly_choice: ["included", "none"].includes(
      normalize(customization?.assembly_choice),
    )
      ? normalize(customization?.assembly_choice)
      : "",
    requested_width: Number(customization?.width) || 0,
    requested_height: Number(customization?.height) || 0,
    requested_depth: Number(customization?.depth) || 0,
    requested_unit: customization?.unit || "mm",
    requested_comments: customization?.comments || "",
    source_blueprint_id: Number(customization?.blueprint_id || 0) || null,
  };

  const designData = {
    ...(baseDesign && typeof baseDesign === "object" ? baseDesign : {}),
    components,
    worldSize,
    customer_request: requestMeta,
    derived_from_blueprint_id: baseBlueprint?.id || null,
    derived_from_blueprint_title: baseBlueprint?.title || null,
  };

  const view3dData = {
    ...(baseView3d && typeof baseView3d === "object" ? baseView3d : {}),
    components,
    worldSize,
    customer_request: requestMeta,
    derived_from_blueprint_id: baseBlueprint?.id || null,
    derived_from_blueprint_title: baseBlueprint?.title || null,
  };

  return {
    title: `${titleBase} — ${order.order_number}`,
    description: `Working custom-request blueprint for ${order.order_number}.`,
    creator_id: adminUserId,
    client_id: order.customer_id || null,
    source: "created",
    stage: "estimation",
    file_url: baseBlueprint?.file_url || null,
    file_type: baseBlueprint?.file_type || null,
    thumbnail_url:
      customization?.preview_image_url ||
      customization?.image_url ||
      baseBlueprint?.thumbnail_url ||
      null,
    design_data: JSON.stringify(designData),
    view_3d_data: JSON.stringify(view3dData),
    locked_fields: JSON.stringify([]),
    is_template: 0,
    is_gallery: 0,
    is_deleted: 0,
    archived_at: null,
  };
};

const getCustomRequestOrderForAdmin = async (conn, orderId) => {
  const [[order]] = await conn.query(
    `SELECT
        o.id,
        o.order_number,
        o.customer_id,
        o.status,
        o.order_type,
        o.notes,
        o.blueprint_id
      FROM orders o
      WHERE o.id = ?
      LIMIT 1
      FOR UPDATE`,
    [parseInt(orderId)],
  );

  if (!order) {
    return { error: { code: 404, message: "Order not found." } };
  }

  if (normalize(order.order_type) !== "blueprint") {
    return {
      error: {
        code: 400,
        message: "This action is only allowed for custom blueprint requests.",
      },
    };
  }

  return { order };
};

exports.approveCustomRequest = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const orderId = parseInt(req.params.id);
    const adminNote = String(req.body?.note || "").trim();

    await conn.beginTransaction();

    const result = await getCustomRequestOrderForAdmin(conn, orderId);
    if (result.error) {
      await conn.rollback();
      return res
        .status(result.error.code)
        .json({ message: result.error.message });
    }

    const { order } = result;
    const currentStatus = normalize(order.status);

    if (currentStatus !== "pending") {
      await conn.rollback();
      return res.status(400).json({
        message: "Only pending custom requests can be approved.",
      });
    }

    let resolvedBlueprintId = Number(order.blueprint_id || 0) || null;
    const oldBlueprintId = resolvedBlueprintId;

    if (!resolvedBlueprintId) {
      const [[customItem]] = await conn.query(
        `SELECT id, product_name, customization_json
         FROM order_items
         WHERE order_id = ?
           AND customization_json IS NOT NULL
         ORDER BY id ASC
         LIMIT 1`,
        [orderId],
      );

      if (customItem) {
        const customization =
          safeParseJson(customItem.customization_json, {}) || {};

        const requestedBlueprintId =
          Number(customization?.blueprint_id || 0) || null;

        let baseBlueprint = null;

        if (requestedBlueprintId) {
          const [[bp]] = await conn.query(
            `SELECT
                id,
                title,
                description,
                file_url,
                file_type,
                thumbnail_url,
                design_data,
                view_3d_data
             FROM blueprints
             WHERE id = ?
             LIMIT 1`,
            [requestedBlueprintId],
          );

          baseBlueprint = bp || null;
        }

        const draftBlueprint = buildCustomRequestBlueprintPayload({
          order,
          customItem,
          baseBlueprint,
          adminUserId: req.user.id,
        });

        const [insertBlueprint] = await conn.query(
          `INSERT INTO blueprints
            (
              title,
              description,
              creator_id,
              client_id,
              source,
              stage,
              file_url,
              file_type,
              thumbnail_url,
              design_data,
              view_3d_data,
              locked_fields,
              is_template,
              is_gallery,
              is_deleted,
              archived_at
            )
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            draftBlueprint.title,
            draftBlueprint.description,
            draftBlueprint.creator_id,
            draftBlueprint.client_id,
            draftBlueprint.source,
            draftBlueprint.stage,
            draftBlueprint.file_url,
            draftBlueprint.file_type,
            draftBlueprint.thumbnail_url,
            draftBlueprint.design_data,
            draftBlueprint.view_3d_data,
            draftBlueprint.locked_fields,
            draftBlueprint.is_template,
            draftBlueprint.is_gallery,
            draftBlueprint.is_deleted,
            draftBlueprint.archived_at,
          ],
        );

        resolvedBlueprintId = insertBlueprint.insertId;
      }
    }

    await conn.query(
      `UPDATE orders
       SET status = 'confirmed',
           blueprint_id = COALESCE(?, blueprint_id)
       WHERE id = ?`,
      [resolvedBlueprintId, orderId],
    );

    if (resolvedBlueprintId) {
      await conn.query(
        `UPDATE blueprints
         SET client_id = COALESCE(client_id, ?),
             stage = 'estimation'
         WHERE id = ?`,
        [order.customer_id || null, resolvedBlueprintId],
      );
    }

    await sendSystemNotificationSafe(conn, order.customer_id, {
      type: "custom_request_approved",
      title: "Custom Request Approved",
      message: adminNote
        ? `Your custom furniture request ${order.order_number} has been approved. Our team will now prepare your quotation. Note from our team: ${adminNote}`
        : `Your custom furniture request ${order.order_number} has been approved. Our team will now prepare your quotation.`,
      targetType: "custom_request",
      targetId: order.id,
      targetOrderId: order.id,
    });

    await conn.commit();

    req.auditRecord = {
      id: orderId,
      old: { status: currentStatus, blueprint_id: oldBlueprintId },
      new: {
        status: "confirmed",
        blueprint_id: resolvedBlueprintId,
        admin_note_provided: Boolean(adminNote),
        changed_fields: [
          "status",
          ...(oldBlueprintId !== resolvedBlueprintId ? ["blueprint_id"] : []),
        ],
      },
    };

    return res.json({
      message: "Custom request approved successfully.",
      blueprint_id: resolvedBlueprintId,
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({
      message: err.message || "Failed to approve custom request.",
    });
  } finally {
    conn.release();
  }
};

exports.requestCustomRequestRevision = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const orderId = parseInt(req.params.id);
    const adminNote = String(req.body?.note || "").trim();

    await conn.beginTransaction();

    const result = await getCustomRequestOrderForAdmin(conn, orderId);
    if (result.error) {
      await conn.rollback();
      return res
        .status(result.error.code)
        .json({ message: result.error.message });
    }

    const { order } = result;
    const currentStatus = normalize(order.status);

    if (["cancelled", "completed"].includes(currentStatus)) {
      await conn.rollback();
      return res.status(400).json({
        message: "This custom request can no longer be sent back for revision.",
      });
    }

    await sendSystemNotificationSafe(conn, order.customer_id, {
      type: "custom_request_revision",
      title: "Changes Requested",
      message: adminNote
        ? `We need a few changes to your custom furniture request ${order.order_number}. Feedback: ${adminNote} Open your request to review and update the design.`
        : `We need a few changes to your custom furniture request ${order.order_number}. Open your request to review and update the design.`,
      targetType: "custom_request",
      targetId: order.id,
      targetOrderId: order.id,
    });

    await conn.commit();

    return res.json({
      message: "Revision request sent successfully.",
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({
      message: err.message || "Failed to request revision.",
    });
  } finally {
    conn.release();
  }
};

exports.rejectCustomRequest = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const orderId = parseInt(req.params.id);
    const reason = String(req.body?.reason || req.body?.note || "").trim();

    await conn.beginTransaction();

    const result = await getCustomRequestOrderForAdmin(conn, orderId);
    if (result.error) {
      await conn.rollback();
      return res
        .status(result.error.code)
        .json({ message: result.error.message });
    }

    const { order } = result;
    const currentStatus = normalize(order.status);

    if (currentStatus !== "pending") {
      await conn.rollback();
      return res.status(400).json({
        message: "Only pending custom requests can be rejected.",
      });
    }

    await conn.query(
      `UPDATE orders
       SET status = 'cancelled',
           cancellation_reason = ?,
           cancelled_at = NOW()
       WHERE id = ?`,
      [reason || "Rejected by admin during custom request review.", orderId],
    );

    await sendSystemNotificationSafe(conn, order.customer_id, {
      type: "custom_request_rejected",
      title: "Custom Request Could Not Be Approved",
      message: reason
        ? `We could not approve your custom furniture request ${order.order_number}. Reason: ${reason}`
        : `We could not approve your custom furniture request ${order.order_number}. Please contact our team if you need assistance.`,
      targetType: "custom_request",
      targetId: order.id,
      targetOrderId: order.id,
    });

    await conn.commit();

    req.auditRecord = {
      id: orderId,
      old: { status: currentStatus },
      new: {
        status: "cancelled",
        rejection_reason_provided: Boolean(reason),
        changed_fields: ["status", "cancellation_reason", "cancelled_at"],
      },
    };

    return res.json({
      message: "Custom request rejected successfully.",
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({
      message: err.message || "Failed to reject custom request.",
    });
  } finally {
    conn.release();
  }
};

exports.getAll = async (req, res) => {
  try {
    const {
      status,
      channel,
      orderType,
      search,
      from,
      to,
      page = 1,
      limit = 20,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = ["1=1"];
    const params = [];

    if (status) {
      where.push("o.status = ?");
      params.push(status);
    }
    if (orderType) {
      where.push("LOWER(o.order_type) = ?");
      params.push(orderType.toLowerCase());
    }

    if (channel) {
      where.push("LOWER(o.type) = ?");
      params.push(channel.toLowerCase());
    }
    if (from && to) {
      where.push("DATE(o.created_at) BETWEEN ? AND ?");
      params.push(from, to);
    }
    if (search) {
      where.push(
        "(COALESCE(u.name, o.walkin_customer_name) LIKE ? OR o.id = ? OR o.order_number LIKE ?)",
      );
      params.push(`%${search}%`, parseInt(search) || 0, `%${search}%`);
    }

    const [orders] = await pool.query(
      `SELECT
              o.id,
              o.order_number,
              o.order_type,
              o.blueprint_id,
              o.type AS channel,
              o.status,
              o.total AS total_amount,
              o.payment_method,
              o.payment_status,
              o.created_at,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              COALESCE(u.name, o.walkin_customer_name) AS customer_name,
              COALESCE(u.email, '') AS customer_email,
              COALESCE(u.phone, o.walkin_customer_phone) AS customer_phone,
              u.profile_photo AS customer_profile_photo,
              (
                SELECT COALESCE(NULLIF(oi.product_name, ''), p.name, 'Order item')
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
                ORDER BY oi.id ASC
                LIMIT 1
              ) AS item_name,
              COALESCE(
                b.thumbnail_url,
                (
                  SELECT COALESCE(
                    CASE
                      WHEN JSON_VALID(oi2.customization_json) THEN
                        NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(oi2.customization_json, '$.preview_image_url')), 'null'), '')
                      ELSE NULL
                    END,
                    CASE
                      WHEN JSON_VALID(oi2.customization_json) THEN
                        NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(oi2.customization_json, '$.image_url')), 'null'), '')
                      ELSE NULL
                    END,
                    p2.image_url
                  )
                  FROM order_items oi2
                  LEFT JOIN products p2 ON p2.id = oi2.product_id
                  WHERE oi2.order_id = o.id
                  ORDER BY oi2.id ASC
                  LIMIT 1
                )
              ) AS thumbnail_url,
              b.title AS blueprint_title,
              b.design_data AS blueprint_design_data,
              b.view_3d_data AS blueprint_view_3d_data,
              (
                SELECT oi3.customization_json
                FROM order_items oi3
                WHERE oi3.order_id = o.id
                  AND oi3.customization_json IS NOT NULL
                ORDER BY oi3.id ASC
                LIMIT 1
              ) AS blueprint_item_customization_json
       FROM orders o
       LEFT JOIN users u ON u.id = o.customer_id
       LEFT JOIN blueprints b ON b.id = o.blueprint_id
       WHERE ${where.join(" AND ")}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)],
    );

    // WISDOM ADMIN ORDER SAVED COMPONENT PREVIEW FALLBACK V1
    const orderBlueprintIds = [
      ...new Set(
        orders
          .map((order) => Number(order.blueprint_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    if (orderBlueprintIds.length > 0) {
      const componentPlaceholders = orderBlueprintIds.map(() => "?").join(",");
      const [componentRows] = await pool.query(
        `SELECT *
         FROM blueprint_components
         WHERE blueprint_id IN (${componentPlaceholders})
         ORDER BY blueprint_id ASC, id ASC`,
        orderBlueprintIds,
      );

      const componentsByBlueprintId = new Map();

      for (const component of componentRows) {
        const blueprintId = Number(component.blueprint_id);
        if (!componentsByBlueprintId.has(blueprintId)) {
          componentsByBlueprintId.set(blueprintId, []);
        }
        componentsByBlueprintId.get(blueprintId).push(component);
      }

      for (const order of orders) {
        const blueprintId = Number(order.blueprint_id);
        order.blueprint_components =
          Number.isInteger(blueprintId) && blueprintId > 0
            ? componentsByBlueprintId.get(blueprintId) || []
            : [];
      }
    } else {
      for (const order of orders) {
        order.blueprint_components = [];
      }
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o LEFT JOIN users u ON u.id = o.customer_id
       WHERE ${where.join(" AND ")}`,
      params,
    );

    const [[summary]] = await pool.query(
      `SELECT
          COUNT(*) AS total_orders,
          COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(o.status, '')) = 'pending'
              OR LOWER(COALESCE(o.payment_status, '')) = 'pending'
            THEN 1 ELSE 0 END), 0) AS needs_review,
          COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(o.order_type, '')) = 'blueprint'
            THEN 1 ELSE 0 END), 0) AS custom_requests,
          COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(o.order_type, '')) = 'blueprint'
              AND LOWER(COALESCE(o.status, '')) = 'pending'
            THEN 1 ELSE 0 END), 0) AS quote_needed,
          COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid'
            THEN 1 ELSE 0 END), 0) AS paid_orders,
          COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(o.type, '')) = 'online'
            THEN 1 ELSE 0 END), 0) AS online_orders,
          COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(o.status, '')) = 'pending'
            THEN 1 ELSE 0 END), 0) AS pending_orders,
          COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(o.status, '')) = 'completed'
            THEN 1 ELSE 0 END), 0) AS completed_orders
       FROM orders o
       LEFT JOIN users u ON u.id = o.customer_id
       WHERE ${where.join(" AND ")}`,
      params,
    );

    res.json({ orders, total, summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const path = require("path");

const adminToPositiveInt = (value, fallback = 0) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const adminNormalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const adminSafeTextOrNull = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const adminInsertDiscussionNotificationSafe = async (
  conn,
  userId,
  {
    type = "order_update",
    title,
    message,
    targetType = null,
    targetId = null,
    targetOrderId = null,
  },
) => {
  await createNotificationSafe(conn, {
    userId,
    type,
    title,
    message,
    targetType,
    targetId,
    targetOrderId,
  });
};

exports.getOne = async (req, res) => {
  try {
    const orderId = parseStrictPositiveInt(req.params.id);
    if (!orderId) {
      return res.status(400).json({ message: "Invalid order id." });
    }

    const [[order]] = await pool.query(
      `SELECT 
          o.*,
          o.type AS channel,
          o.total AS total_amount,
          COALESCE(u.name, o.walkin_customer_name) AS customer_name,
          COALESCE(u.email, '') AS customer_email,
          COALESCE(u.phone, o.walkin_customer_phone) AS customer_phone,
          COALESCE(u.address, o.delivery_address) AS customer_address
       FROM orders o
       LEFT JOIN users u ON u.id = o.customer_id
       WHERE o.id = ?`,
      [orderId],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const [rawItems] = await pool.query(
      `SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC`,
      [orderId],
    );

    const items = rawItems.map(normalizeCustomRequestItem);

    const customRequestItems =
      normalize(order.order_type) === "blueprint"
        ? items.filter((item) => Boolean(item.customization))
        : [];

    const [paymentTransactions] = await pool.query(
      `SELECT 
          pt.*,
          u.name AS verified_by
       FROM payment_transactions pt
       LEFT JOIN users u ON u.id = pt.verified_by
       WHERE pt.order_id = ?
       ORDER BY pt.created_at DESC, pt.id DESC`,
      [orderId],
    );

    paymentTransactions.forEach((p) => {
      if (p.proof_url) p.proof_url = signUploadPath(p.proof_url);
      // Real, persisted payment_transactions rows — never synthetic.
      p.persisted = true;
      p.is_legacy_synthetic = false;
    });

    // `payments` is the DISPLAY array (legacy-compatible) — it may also
    // contain the synthetic initial_* row below. `paymentTransactions`
    // stays real-rows-only and is the sole source for every financial
    // total below; the two must never be conflated again.
    const payments = [...paymentTransactions];

    if (order.payment_proof && paymentTransactions.length === 0) {
      payments.push({
        id: `initial_${order.id}`,
        order_id: order.id,
        amount: order.total_amount,
        payment_method: order.payment_method,
        proof_url: signUploadPath(order.payment_proof),
        status: order.payment_status === "paid" ? "verified" : "pending",
        notes: "Initial order placement proof.",
        created_at: order.created_at,
        verified_by: null,
        // Never a real transaction — must never be counted toward any
        // financial total or contract eligibility, only shown for
        // backward-compatible legacy proof display.
        persisted: false,
        is_legacy_synthetic: true,
      });
    }

    const [[delivery]] = await pool.query(
      `SELECT * FROM deliveries 
       WHERE order_id = ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [orderId],
    );

    if (delivery?.signed_receipt) {
      delivery.signed_receipt = signUploadPath(delivery.signed_receipt);
    }

    // Resolved through the lifecycle service instead of a raw
    // blueprint_id-only query. Canonical blueprint id always comes from
    // order.blueprint_id (never contract.blueprint_id) — note this is a
    // deliberate behavior change from before: if a contract's blueprint_id
    // ever diverges from its order's own blueprint_id (e.g. a mismatched
    // manual entry), the order's own linkage now always wins. `pool` can be
    // passed directly here since this is a pure read with no locking.
    const lifecycle = await resolveLifecycleByOrder(pool, { orderId });
    const contract = lifecycle.contract || null;
    const latestEstimation = lifecycle.estimation || null;

    const [blueprintTasks] = await pool.query(
      `SELECT
          pt.*,
          assignee.name AS assigned_to_name,
          assigner.name AS assigned_by_name
       FROM project_tasks pt
       LEFT JOIN users assignee ON assignee.id = pt.assigned_to
       LEFT JOIN users assigner ON assigner.id = pt.assigned_by
       WHERE pt.order_id = ?
       ORDER BY pt.created_at DESC, pt.id DESC`,
      [orderId],
    );

    // Financial totals use ONLY real, persisted payment_transactions rows
    // — never the display-only `payments` array, which may still contain
    // the synthetic initial_* row. order.payment_status is never treated
    // as proof of a verified amount here.
    const verifiedPaymentTotal = paymentTransactions
      .filter((payment) => normalize(payment.status) === "verified")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const totalAmount = Number(order.total_amount || order.total || 0);
    const paymentBalance = Math.max(0, totalAmount - verifiedPaymentTotal);

    // Pending/rejected checks intentionally still read the DISPLAY array
    // (payments, including the synthetic row) — this only affects the
    // informational paymentStatusDisplay label below, never a financial
    // total, and preserves the existing legacy behavior of showing a
    // legacy pending proof as pending.
    const hasPendingPayment = payments.some(
      (payment) => normalize(payment.status) === "pending",
    );
    const hasRejectedPayment = payments.some(
      (payment) => normalize(payment.status) === "rejected",
    );

    // Legacy order.payment_status is only trusted for cash/COD/COP orders
    // (where "paid" is set at pickup/delivery time, not via an uploaded
    // proof). For every other payment method, "paid"/"partial" must be
    // earned by real, persisted, verified payment_transactions rows —
    // never inherited from a raw order.payment_status value that could
    // reflect nothing more than a synthetic legacy proof.
    const legacyCashMarkedPaid =
      ["cash", "cod", "cop"].includes(normalize(order.payment_method)) &&
      normalize(order.payment_status) === "paid";

    let paymentStatusDisplay = "unpaid";

    if (legacyCashMarkedPaid) {
      paymentStatusDisplay = "paid";
    } else if (verifiedPaymentTotal >= totalAmount && totalAmount > 0) {
      paymentStatusDisplay = "paid";
    } else if (verifiedPaymentTotal > 0) {
      paymentStatusDisplay = "partial";
    } else if (hasPendingPayment) {
      paymentStatusDisplay = "pending";
    } else if (hasRejectedPayment) {
      paymentStatusDisplay = "rejected";
    }

    if (order.payment_proof) {
      order.payment_proof = signUploadPath(order.payment_proof);
    }

    // Correction 13: build the restricted payment summary from the rows
    // THIS request already fetched (order, latestEstimation,
    // paymentTransactions) -- never a second, independently-fetched
    // snapshot -- so this response and the shared service can never
    // disagree about the same request's data. Must run BEFORE the
    // paymongo_session_id/payment_url fields are stripped from `order`
    // below, since buildPaymentSummaryFromRows needs them to compute
    // hasPayMongoSessionData.
    const blueprintCashPaymentSummary =
      normalize(order.order_type) === "blueprint"
        ? buildPaymentSummaryFromRows({
            order,
            estimation: latestEstimation,
            paymentRows: paymentTransactions,
          })
        : null;

    // Raw PayMongo session fields are never sent to the frontend -- only
    // the derived boolean already folded into blueprintCashPaymentSummary
    // above is. Deleted from `order` here, before the response spread.
    delete order.paymongo_session_id;
    delete order.payment_url;

    res.json({
      ...order,
      items,
      payments,
      delivery: delivery || null,
      contract: contract || null,
      blueprint_tasks: blueprintTasks,
      payment_verified_total: verifiedPaymentTotal,
      payment_balance: paymentBalance,
      payment_status_display: paymentStatusDisplay,
      blueprint_cash_payment: blueprintCashPaymentSummary,
      custom_request_items: customRequestItems,
      has_custom_request_data: customRequestItems.length > 0,
      latest_estimation: latestEstimation,
      lifecycle_integrity_warning: lifecycle.integrity_warning,
      lifecycle_integrity_reason: lifecycle.reason,
      can_create_replacement_estimation:
        lifecycle.can_create_replacement_estimation,
      recovery_block_reason: lifecycle.recovery_block_reason,
      conflicting_order_ids: lifecycle.conflicting_order_ids,
    });
  } catch (err) {
    console.error("[orderController.getOne]", err);
    res.status(500).json({ message: "Failed to load order details." });
  }
};

async function restoreStandardOrderStock(conn, orderId) {
  const [[order]] = await conn.query(
    `SELECT order_type FROM orders WHERE id = ? LIMIT 1`,
    [orderId],
  );

  if (!order || normalize(order.order_type) === "blueprint") return;

  const [items] = await conn.query(
    `SELECT product_id, quantity
   FROM order_items
   WHERE order_id = ?`,
    [orderId],
  );

  for (const item of items) {
    await conn.query(
      `UPDATE products
     SET stock = stock + ?
     WHERE id = ?`,
      [item.quantity, item.product_id],
    );

    await conn.query(
      `UPDATE products
     SET stock_status = CASE
       WHEN stock <= 0 THEN 'out_of_stock'
       WHEN stock <= reorder_point THEN 'low_stock'
       ELSE 'in_stock'
     END
     WHERE id = ?`,
      [item.product_id],
    );
  }
}

exports.updateStatus = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const nextStatus = normalize(req.body?.status);
    const cancellationReason = String(
      req.body?.reason || req.body?.cancellation_reason || "",
    ).trim();
    const valid = [
      "pending",
      "confirmed",
      "contract_released",
      "production",
      "shipping",
      "delivered",
      "completed",
      "cancelled",
    ];

    if (!valid.includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    await conn.beginTransaction();

    const [[order]] = await conn.query(
      `SELECT
          o.*,
          o.type AS channel,
          o.total AS total_amount,
          c.id AS contract_id,
          c.blueprint_id AS contract_blueprint_id
       FROM orders o
       LEFT JOIN contracts c ON c.order_id = o.id
       WHERE o.id = ?
       LIMIT 1
       FOR UPDATE`,
      [parseInt(req.params.id)],
    );

    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: "Order not found." });
    }

    const currentStatus = normalize(order.status);
    const currentChannel = normalize(order.channel || order.type);
    const normalizedPaymentMethod = normalize(order.payment_method);
    const isWalkInOrder =
      currentChannel === "walkin" || currentChannel === "walk-in";

    const blueprintId =
      order.contract_blueprint_id || order.blueprint_id || null;
    const isBlueprintOrder =
      normalize(order.order_type) === "blueprint" || Boolean(blueprintId);

    const hasDeliveryRequirement = Boolean(
      String(order.delivery_address || "").trim(),
    );

    const isStandardOrder = !isBlueprintOrder;

    const isStandardPickupOrder =
      isStandardOrder && normalizedPaymentMethod === "cop";

    const isStandardDeliveryOrder = isStandardOrder && !isStandardPickupOrder;

    const effectiveStatusTransitions = isBlueprintOrder
      ? isWalkInOrder
        ? {
            pending: ["confirmed", "cancelled"],
            confirmed: ["contract_released", "cancelled"],
            contract_released: ["production", "cancelled"],
            production: ["completed", "cancelled"],
            shipping: ["completed"],
            delivered: ["completed"],
            completed: [],
            cancelled: [],
          }
        : {
            pending: ["confirmed", "cancelled"],
            confirmed: ["contract_released", "cancelled"],
            contract_released: ["production", "cancelled"],
            production: ["shipping", "cancelled"],
            shipping: ["delivered", "completed"],
            delivered: ["completed"],
            completed: [],
            cancelled: [],
          }
      : isWalkInOrder
        ? hasDeliveryRequirement
          ? {
              pending: ["confirmed", "cancelled"],
              confirmed: ["shipping", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["shipping", "cancelled"],
              shipping: ["delivered", "cancelled"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            }
          : {
              pending: ["confirmed", "cancelled"],
              confirmed: ["completed", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["completed", "cancelled"],
              shipping: ["completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            }
        : isStandardPickupOrder
          ? {
              pending: ["confirmed", "cancelled"],
              confirmed: ["completed", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["completed", "cancelled"],
              shipping: ["completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            }
          : {
              pending: ["confirmed", "cancelled"],
              confirmed: ["shipping", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["shipping", "cancelled"],
              shipping: ["delivered", "completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            };

    const allowedNextStatuses = effectiveStatusTransitions[currentStatus] || [];

    if (!allowedNextStatuses.includes(nextStatus)) {
      await conn.rollback();
      return res.status(400).json({
        message: `Invalid status transition from "${currentStatus}" to "${nextStatus}".`,
      });
    }

    const usesManagedDeliveryFlow = hasDeliveryRequirement;

    if (usesManagedDeliveryFlow && nextStatus === "shipping") {
      await conn.rollback();
      return res.status(409).json({
        message:
          "Shipping starts automatically when the assigned rider marks the delivery In Transit.",
      });
    }

    if (usesManagedDeliveryFlow && nextStatus === "delivered") {
      await conn.rollback();
      return res.status(409).json({
        message:
          "Delivered is recorded automatically when the assigned rider completes the delivery.",
      });
    }

    if (
      usesManagedDeliveryFlow &&
      nextStatus === "completed" &&
      currentStatus !== "delivered"
    ) {
      await conn.rollback();
      return res.status(409).json({
        message:
          "Complete the actual delivery first. A delivery order can only be completed after Delivered.",
      });
    }
    const totalAmount = Number(order.total_amount || order.total || 0);

    const [[paymentSummary]] = await conn.query(
      `SELECT
         COALESCE(
           SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END),
           0
         ) AS verified_total
       FROM payment_transactions
       WHERE order_id = ?`,
      [parseInt(req.params.id)],
    );

    const verifiedPaymentTotal = Number(paymentSummary?.verified_total || 0);
    const paymentBalance = Math.max(0, totalAmount - verifiedPaymentTotal);

    const requiredBlueprintDownPayment = calcDownPaymentAmount(totalAmount);

    // orders.payment_status is not trusted here — it can be stale or
    // inconsistent (that inconsistency is part of the original bug class
    // this whole fix addresses). Verified payment_transactions rows are
    // the only source of truth for whether the required down payment has
    // actually been received.
    const hasRequiredBlueprintDownPayment =
      verifiedPaymentTotal >= Math.max(0, requiredBlueprintDownPayment - 0.01);

    const isFullyPaid =
      totalAmount > 0 && verifiedPaymentTotal >= totalAmount - 0.01;

    // Resolved through the lifecycle service instead of a raw
    // blueprint_id-only query. Always uses order.blueprint_id as the
    // canonical source internally (not the pre-computed `blueprintId`
    // above, which can also pull from contract.blueprint_id) — matches the
    // same canonical-source rule used everywhere else in this fix.
    const lifecycle = isBlueprintOrder
      ? await resolveLifecycleByOrder(conn, {
          orderId: parseInt(req.params.id),
        })
      : null;

    const lifecycleGatedStatuses = [
      "contract_released",
      "production",
      "shipping",
      "delivered",
      "completed",
    ];

    // ── Comprehensive blueprint lifecycle gate ──────────────────────────
    // Re-checked fresh on EVERY advancing transition, never assuming an
    // earlier stage already verified this — a historically corrupted
    // order may already be sitting in an advanced status (contract_
    // released, production, even completed) with a broken lifecycle
    // underneath it, so every transition attempt re-validates everything
    // from scratch rather than trusting the state machine alone.
    if (isBlueprintOrder && lifecycleGatedStatuses.includes(nextStatus)) {
      const failures = [];

      if (!lifecycle || lifecycle.status !== "OK") {
        failures.push(
          lifecycle?.message ||
            "This blueprint order's lifecycle is blocked, unresolved, or missing required records.",
        );
      }

      const bp = lifecycle?.blueprint || null;
      const est = lifecycle?.estimation || null;

      if (!bp) {
        failures.push("Blueprint order must be linked to a real blueprint.");
      }

      if (!est) {
        failures.push(
          "Blueprint order needs a saved, lifecycle-valid estimation.",
        );
      } else {
        if (normalize(est.status) !== "approved") {
          failures.push("Blueprint order must have an approved estimation.");
        }
        if (!(Number(est.grand_total || 0) > 0)) {
          failures.push(
            "The approved estimation total must be greater than zero.",
          );
        }
        if (!(totalAmount > 0)) {
          failures.push(
            "Blueprint order total must be finalized before this transition.",
          );
        }
        if (Math.abs(totalAmount - Number(est.grand_total || 0)) > 0.01) {
          failures.push(
            "Order total does not match the approved estimation total. Refresh and re-save the estimation before continuing.",
          );
        }
      }

      if (!order.contract_id) {
        failures.push("A contract must exist for this order.");
      }

      if (nextStatus === "completed") {
        if (!isFullyPaid) {
          failures.push(
            "Order cannot be completed until the remaining balance is fully paid.",
          );
        }
      } else if (!hasRequiredBlueprintDownPayment) {
        failures.push(
          "Blueprint orders require at least a 30% verified down payment.",
        );
      }

      if (failures.length) {
        await conn.rollback();
        return res.status(400).json({
          message: failures[0],
          failures,
          integrity_reason: lifecycle?.reason || null,
          conflicting_order_ids: lifecycle?.conflicting_order_ids || null,
        });
      }
    }

    if (isBlueprintOrder && nextStatus === "production") {
      if (currentStatus !== "contract_released") {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Blueprint/custom orders cannot go straight to production. Release the contract first.",
        });
      }
    }

    if (
      isBlueprintOrder &&
      ["shipping", "delivered", "completed"].includes(nextStatus)
    ) {
      const [taskRows] = await conn.query(
        `SELECT task_role, status
        FROM project_tasks
        WHERE order_id = ?`,
        [parseInt(req.params.id)],
      );

      const existingRoleSet = new Set(
        taskRows.map((row) => normalizeTaskRole(row.task_role)).filter(Boolean),
      );

      const completedRoleSet = new Set(
        taskRows
          .filter((row) => normalize(row.status) === "completed")
          .map((row) => normalizeTaskRole(row.task_role))
          .filter(Boolean),
      );

      const missingRoles = REQUIRED_BLUEPRINT_TASK_ROLES.filter(
        (role) => !existingRoleSet.has(role),
      );

      const incompleteRoles = REQUIRED_BLUEPRINT_TASK_ROLES.filter(
        (role) => !completedRoleSet.has(role),
      );

      if (missingRoles.length) {
        await conn.rollback();
        return res.status(400).json({
          message: `Complete the required production task packet first: ${missingRoles
            .map(getTaskRoleLabel)
            .join(", ")}.`,
        });
      }

      if (incompleteRoles.length) {
        await conn.rollback();
        return res.status(400).json({
          message: `Finish all required production tasks before moving to ${nextStatus}: ${incompleteRoles
            .map(getTaskRoleLabel)
            .join(", ")}.`,
        });
      }
    }

    if (
      !isWalkInOrder &&
      !isBlueprintOrder &&
      normalizedPaymentMethod !== "cod" &&
      ["shipping", "delivered"].includes(nextStatus) &&
      paymentBalance > 0
    ) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Standard non-COD delivery orders must be fully paid before shipping or delivered.",
      });
    }

    // Standard/walk-in orders keep their original, unconditional
    // full-payment-before-completed rule — untouched by the blueprint-
    // specific gate above, which only runs for isBlueprintOrder.
    if (!isBlueprintOrder && nextStatus === "completed" && paymentBalance > 0) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Order cannot be completed until the remaining balance is fully paid.",
      });
    }

    let materialConsumptionResult = null;
    let materialReleaseResult = null;

    if (isBlueprintOrder && nextStatus === "production") {
      materialConsumptionResult = await consumeBlueprintMaterialsForProduction(
        conn,
        {
          orderId: parseInt(req.params.id),
          actorUserId: req.user.id,
        },
      );
    }

    if (isBlueprintOrder && nextStatus === "cancelled") {
      materialReleaseResult = await releaseBlueprintMaterialsForCancellation(
        conn,
        {
          orderId: parseInt(req.params.id),
          actorUserId: req.user.id,
          releaseReason:
            cancellationReason ||
            `Order cancelled by admin from ${currentStatus}.`,
        },
      );
    }

    const [statusUpdateResult] = await conn.query(
      `UPDATE orders
       SET status = ?
       WHERE id = ? AND status = ?`,
      [nextStatus, parseInt(req.params.id), currentStatus],
    );

    // Guard against a race condition where another request already
    // changed this order's status between the SELECT above and this
    // UPDATE (e.g. double-click, or two staff acting on it at once).
    if (statusUpdateResult.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({
        message:
          "This order's status was already changed. Please refresh and try again.",
      });
    }

    // Standard (non-blueprint) orders deduct product stock at creation time,
    // so cancellation restores that product stock. Blueprint orders use
    // reservation release above and must never run the standard restock path.
    if (nextStatus === "cancelled" && !isBlueprintOrder) {
      await restoreStandardOrderStock(conn, parseInt(req.params.id));
    }

    // Keep delivery-attempt history immutable when the order reaches a
    // terminal state. A failed attempt must stay failed even after a later
    // rescheduled attempt succeeds and the order is completed.
    if (nextStatus === "completed") {
      const [[latestSuccessfulDelivery]] = await conn.query(
        `SELECT id
         FROM deliveries
         WHERE order_id = ?
           AND status = 'delivered'
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [parseInt(req.params.id)],
      );

      if (latestSuccessfulDelivery?.id) {
        await conn.query(
          `UPDATE deliveries
           SET status = 'completed'
           WHERE id = ?
             AND status = 'delivered'`,
          [latestSuccessfulDelivery.id],
        );
      }
    } else if (nextStatus === "cancelled") {
      // Only cancel the currently actionable attempts. Historical failed
      // or delivered attempts remain unchanged for audit/history.
      await conn.query(
        `UPDATE deliveries
         SET status = 'cancelled'
         WHERE order_id = ?
           AND status IN ('scheduled', 'in_transit')`,
        [parseInt(req.params.id)],
      );
    }

    if (nextStatus === "completed" && order.customer_id) {
      await createNotificationSafe(conn, {
        userId: order.customer_id,
        type: "order_update",
        title: "Order Completed",
        message: `Your order ${order.order_number || `#${order.id}`} has been completed. Thank you for choosing Spiral Wood Services.`,
        targetType: "order",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    await conn.commit();

    // 👉 C. Automated Customer Triggers (Toggles)
    if (order.customer_id) {
      try {
        const [userRows] = await conn.query(
          "SELECT email, name FROM users WHERE id = ? LIMIT 1",
          [order.customer_id],
        );
        const customer = userRows[0];
        if (customer?.email) {
          const footerHtml = await getGlobalEmailFooter(conn);
          let sendEmail = false;
          let subject = "";
          let messageBody = "";

          if (nextStatus === "confirmed") {
            const enabled = await isSettingEnabled(
              conn,
              "email_order_confirmed",
            );
            if (enabled) {
              sendEmail = true;
              subject = `Order Confirmed: ${order.order_number || `#${order.id}`}`;
              messageBody = `Great news! Your order <strong>${order.order_number || `#${order.id}`}</strong> has been confirmed and is being prepared.`;
            }
          } else if (nextStatus === "production") {
            const enabled = await isSettingEnabled(
              conn,
              "email_production_started",
            );
            if (enabled) {
              sendEmail = true;
              subject = `Production Started: ${order.order_number || `#${order.id}`}`;
              messageBody = `Your custom blueprint order <strong>${order.order_number || `#${order.id}`}</strong> has entered the workshop production phase.`;
            }
          } else if (nextStatus === "shipping") {
            const enabled = await isSettingEnabled(
              conn,
              "email_out_for_delivery",
            );
            if (enabled) {
              sendEmail = true;
              subject = `Out for Delivery: ${order.order_number || `#${order.id}`}`;
              messageBody = `Your order <strong>${order.order_number || `#${order.id}`}</strong> is out for delivery with our rider.`;
            }
          }

          if (sendEmail) {
            await sendBrevoEmail({
              toEmail: customer.email,
              toName: customer.name || "Customer",
              subject,
              htmlContent: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
                  <h2 style="color:#8B4513">Spiral Wood Services</h2>
                  <p>Hi ${customer.name || "Customer"},</p>
                  <p>${messageBody}</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${footerHtml}
                  </table>
                </div>
              `,
            });
          }
        }
      } catch (toggleEmailErr) {
        console.error("[Customer Trigger Email Error]", toggleEmailErr.message);
      }
    }

    req.auditRecord = {
      id: parseInt(req.params.id),
      old: { status: currentStatus },
      new: {
        status: nextStatus,
        ...(materialConsumptionResult
          ? {
              material_consumption_reason: materialConsumptionResult.reason,
              material_reservation_ids:
                materialConsumptionResult.reservation_ids || [],
              stock_movement_ids:
                materialConsumptionResult.stock_movement_ids || [],
              materials_consumed: materialConsumptionResult.consumed_count || 0,
            }
          : {}),
        ...(materialReleaseResult
          ? {
              material_release_reason: materialReleaseResult.reason,
              released_material_reservation_ids:
                materialReleaseResult.reservation_ids || [],
              materials_released: materialReleaseResult.released_count || 0,
            }
          : {}),
      },
    };
    res.json({
      message: `Order status updated to "${nextStatus}".`,
      ...(materialConsumptionResult
        ? { material_consumption: materialConsumptionResult }
        : {}),
      ...(materialReleaseResult
        ? { material_release: materialReleaseResult }
        : {}),
    });
  } catch (err) {
    await conn.rollback();

    if (err instanceof BlueprintMaterialConsumptionError) {
      return res.status(err.statusCode || 409).json({
        message: err.message,
        integrity_reason: err.code,
        ...(err.details ? { details: err.details } : {}),
      });
    }

    if (err instanceof BlueprintMaterialReleaseError) {
      return res.status(err.statusCode || 409).json({
        message: err.message,
        integrity_reason: err.code,
        ...(err.details ? { details: err.details } : {}),
      });
    }

    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.accept = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const [result] = await pool.query(
      "UPDATE orders SET status = 'confirmed' WHERE id = ? AND status = 'pending'",
      [orderId],
    );

    if (result.affectedRows === 1) {
      req.auditRecord = {
        id: orderId,
        old: { status: "pending" },
        new: {
          status: "confirmed",
          order_accepted: true,
          changed_fields: ["status"],
        },
      };

      try {
        const [[order]] = await pool.query(
          `SELECT id, customer_id, order_number FROM orders WHERE id = ? LIMIT 1`,
          [orderId],
        );
        if (order?.customer_id) {
          await createNotificationSafe(pool, {
            userId: order.customer_id,
            type: "order_update",
            title: "Order Confirmed",
            message: `Your order ${order.order_number || `#${order.id}`} has been confirmed. Our team will prepare it for the next step.`,
            targetType: "order",
            targetId: order.id,
            targetOrderId: order.id,
          });
        }
      } catch (notificationErr) {
        console.error(
          "[orderController.accept notification skipped]",
          notificationErr.message || notificationErr,
        );
      }
    }

    res.json({ message: "Order accepted." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.decline = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { reason } = req.body;
    const orderId = parseInt(req.params.id);

    const [declineResult] = await conn.query(
      "UPDATE orders SET status = 'cancelled', cancellation_reason = ?, cancelled_at = NOW() WHERE id = ? AND status = 'pending'",
      [reason || "", orderId],
    );

    // Only restore stock if this call actually changed the row (guards
    // against double-click / already-declined orders).
    if (declineResult.affectedRows > 0) {
      await restoreStandardOrderStock(conn, orderId);
    }

    await conn.commit();

    if (declineResult.affectedRows === 1) {
      try {
        const [[order]] = await pool.query(
          `SELECT id, customer_id, order_number FROM orders WHERE id = ? LIMIT 1`,
          [orderId],
        );
        if (order?.customer_id) {
          const declineReason = String(reason || "").trim();
          await createNotificationSafe(pool, {
            userId: order.customer_id,
            type: "order_update",
            title: "Order Could Not Be Approved",
            message: declineReason
              ? `We could not approve Order ${order.order_number || `#${order.id}`}. Reason: ${declineReason}`
              : `We could not approve Order ${order.order_number || `#${order.id}`}. Please contact our team if you need assistance.`,
            targetType: "order",
            targetId: order.id,
            targetOrderId: order.id,
          });
        }
      } catch (notificationErr) {
        console.error(
          "[orderController.decline notification skipped]",
          notificationErr.message || notificationErr,
        );
      }

      req.auditRecord = {
        id: orderId,
        old: { status: "pending" },
        new: {
          status: "cancelled",
          order_declined: true,
          decline_reason_provided: Boolean(String(reason || "").trim()),
          changed_fields: ["status", "cancellation_reason", "cancelled_at"],
        },
      };
    }

    res.json({ message: "Order declined." });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.verifyPayment = async (req, res) => {
  // Strict, local (function-scoped) positive-integer validator — kept
  // inline rather than as a new top-level helper so this entire change
  // stays contained within verifyPayment's own body.
  const isStrictPositiveIntString = (value) => {
    const text = String(value ?? "").trim();
    if (!/^[1-9][0-9]*$/.test(text)) return false;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed > 0;
  };

  const orderId = isStrictPositiveIntString(req.params.id)
    ? Number(req.params.id)
    : null;

  if (!orderId) {
    return res.status(400).json({ message: "Invalid order id." });
  }

  const { payment_id, action } = req.body;
  const normalizedAction = normalize(action);

  if (!["verified", "rejected"].includes(normalizedAction)) {
    return res.status(400).json({ message: "Invalid payment action." });
  }

  // payment_id must be exactly one of two structurally valid forms: a
  // strict positive-integer string (a real payment_transactions id), or
  // exactly "initial_<orderId>" matching the already-validated route
  // order id (the legacy synthetic display row). Anything else — a
  // decimal, scientific notation, a mismatched embedded id, trailing
  // garbage like "initial_35_extra" — is rejected outright.
  const paymentIdStr = String(payment_id ?? "").trim();
  const isSyntheticConversion = paymentIdStr === `initial_${orderId}`;
  const realPaymentId = isStrictPositiveIntString(paymentIdStr)
    ? Number(paymentIdStr)
    : null;

  if (!isSyntheticConversion && realPaymentId === null) {
    return res.status(400).json({ message: "Invalid payment id." });
  }

  let conn = null;
  let transactionActive = false;
  let connectionReusable = true;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    // ── Lock the canonical order FIRST — before lifecycle resolution,
    // before payment-transaction locking, before any write. Matches the
    // project-wide order-first lock discipline.
    const [[order]] = await conn.query(
      `SELECT
          id,
          customer_id,
          order_number,
          order_type,
          status,
          total,
          blueprint_id,
          payment_method,
          payment_proof
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    if (!order) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Order not found." });
    }

    const isBlueprintOrder = normalize(order.order_type) === "blueprint";

    // ── Blueprint verification lifecycle gate — action=verified only.
    // Rejection stays exempt from every check in this block, so an
    // unsafe pending proof can always be closed out without advancing
    // financial state, regardless of order status or lifecycle health.
    let lifecycle = null;
    let approvedMaximumTotal = Number(order.total || 0);

    if (normalizedAction === "verified" && isBlueprintOrder) {
      lifecycle = await resolveLifecycleByOrder(conn, {
        orderId,
        lockOrder: true,
        lockBlueprint: true,
      });

      const est = lifecycle.estimation;
      const bp = lifecycle.blueprint;
      const ord = lifecycle.order;

      const canonicalMatchesLocked =
        Boolean(ord) && Number(ord.id) === Number(order.id);

      const currentOrderStatus = normalize(order.status);
      const ALLOWED_VERIFY_STATUSES = [
        "confirmed",
        "contract_released",
        "production",
        "shipping",
        "delivered",
      ];
      const statusAllowed =
        ALLOWED_VERIFY_STATUSES.includes(currentOrderStatus);

      const blueprintArchived =
        Number(bp?.is_deleted) === 1 || normalize(bp?.stage) === "archived";

      const estimationApproved = normalize(est?.status) === "approved";
      const estimationTotalPositive =
        Number.isFinite(Number(est?.grand_total)) &&
        Number(est?.grand_total) > 0;
      const orderTotalPositive =
        Number.isFinite(Number(order.total)) && Number(order.total) > 0;
      const totalsMatch =
        !!est &&
        Math.abs(Number(order.total || 0) - Number(est.grand_total || 0)) <=
          0.01;

      const hasContract = Boolean(lifecycle.contract);

      // A confirmed order must NOT already have a contract; every later
      // stage must already have a real one. Never auto-repaired or
      // relinked here — a mismatch simply blocks verification.
      const contractConsistent =
        currentOrderStatus === "confirmed" ? !hasContract : hasContract;

      const lifecycleUnsafe =
        lifecycle.status !== "OK" ||
        !ord ||
        !bp ||
        !est ||
        !canonicalMatchesLocked ||
        blueprintArchived ||
        !estimationApproved ||
        !estimationTotalPositive ||
        !orderTotalPositive ||
        !totalsMatch ||
        !statusAllowed ||
        !contractConsistent;

      if (lifecycleUnsafe) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message:
            lifecycle.message ||
            "This order's blueprint lifecycle or status is not in a verifiable state, so this payment cannot be verified until it is manually reviewed.",
          integrity_reason: lifecycle.reason,
          conflicting_order_ids: lifecycle.conflicting_order_ids,
        });
      }

      approvedMaximumTotal = Number(est.grand_total || 0);
    }

    // ── Lock the COMPLETE real payment_transactions set for this order
    // — never just the single target row. This is what lets two admins
    // reviewing two different pending transactions on the same order
    // serialize correctly instead of each computing a stale rollup.
    const [paymentSet] = await conn.query(
      `SELECT
          id,
          order_id,
          status,
          amount,
          payment_method,
          proof_url
       FROM payment_transactions
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    let targetAmount = null;
    let realTargetId = null;

    if (isSyntheticConversion) {
      // Legacy initial_<orderId> conversion — allowed only when every
      // structural condition holds, regardless of verify vs reject.
      if (!order.payment_proof) {
        await conn.rollback();
        transactionActive = false;
        return res
          .status(400)
          .json({ message: "No legacy payment proof exists for this order." });
      }

      const legacyMethodValid = [
        "cash",
        "gcash",
        "bank_transfer",
        "cod",
        "cop",
        "paymongo",
      ].includes(normalize(order.payment_method));

      if (!legacyMethodValid) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message: "Order payment method is invalid for a legacy conversion.",
        });
      }

      // The zero-real-transactions requirement preserves the exact
      // getOne behavior that only ever creates the synthetic row when no
      // real transaction exists — if one now exists, the synthetic row
      // is stale and must never be converted into a second, duplicate
      // legacy transaction.
      if (paymentSet.length > 0) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message:
            "A real payment transaction already exists for this order; the legacy proof can no longer be converted directly.",
          integrity_reason: "PAYMENT_STATE_CHANGED",
        });
      }

      // Server-derived synthetic amount — always the locked order total,
      // never a client-supplied value — still subject to every
      // verification-time amount/overpayment gate below.
      targetAmount = Number(order.total || 0);
    } else {
      const target = paymentSet.find(
        (row) => Number(row.id) === Number(realPaymentId),
      );

      if (!target) {
        await conn.rollback();
        transactionActive = false;
        return res.status(404).json({ message: "Payment record not found." });
      }

      if (normalize(target.status) !== "pending") {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message:
            "This payment was already reviewed. Please refresh and try again.",
          integrity_reason: "PAYMENT_STATE_CHANGED",
        });
      }

      targetAmount = Number(target.amount || 0);
      realTargetId = target.id;
    }

    // ── Verify-time overpayment gate — action=verified only. Never
    // trusts orders.payment_status, the synthetic display row, or any
    // client-supplied total/balance — only the locked, real, persisted
    // transaction set computed just above.
    if (normalizedAction === "verified") {
      if (!(targetAmount > 0)) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({ message: "Payment amount is invalid." });
      }

      if (!(approvedMaximumTotal > 0)) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message: "Order total is invalid; this payment cannot be verified.",
        });
      }

      const verifiedTotalBefore = paymentSet
        .filter((row) => normalize(row.status) === "verified")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);

      if (verifiedTotalBefore + targetAmount > approvedMaximumTotal + 0.01) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message: "Verifying this payment would exceed the order total.",
          integrity_reason: "PAYMENT_OVERPAYMENT",
        });
      }
    }

    // ── Guarded write ────────────────────────────────────────────────
    let writtenPaymentTransactionId = realTargetId;

    if (isSyntheticConversion) {
      // Insert exactly one real transaction, using only canonical locked
      // order values — never client-controlled amount, method, proof
      // URL, or order id.
      const [syntheticInsertResult] = await conn.query(
        `INSERT INTO payment_transactions
          (order_id, amount, payment_method, proof_url, verified_by, verified_at, status, notes)
         VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
        [
          order.id,
          targetAmount,
          order.payment_method,
          order.payment_proof,
          req.user.id,
          normalizedAction,
          `Initial order payment ${normalizedAction}.`,
        ],
      );
      writtenPaymentTransactionId = syntheticInsertResult.insertId;
    } else {
      const [updateResult] = await conn.query(
        `UPDATE payment_transactions
         SET status = ?, verified_by = ?, verified_at = NOW()
         WHERE id = ? AND order_id = ? AND status = 'pending'`,
        [normalizedAction, req.user.id, realTargetId, order.id],
      );

      if (updateResult.affectedRows === 0) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message:
            "This payment was already reviewed. Please refresh and try again.",
          integrity_reason: "PAYMENT_STATE_CHANGED",
        });
      }
    }

    // ── Recompute order payment status from real, persisted rows only —
    // a fresh query, never the pre-write locked set, so it reflects the
    // write that just happened.
    const [[freshSummary]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END), 0) AS verified_total,
         MAX(CASE WHEN LOWER(status) = 'pending' THEN 1 ELSE 0 END) AS has_pending,
         MAX(CASE WHEN LOWER(status) = 'rejected' THEN 1 ELSE 0 END) AS has_rejected
       FROM payment_transactions
       WHERE order_id = ?`,
      [order.id],
    );

    const totalAmount = Number(order.total || 0);
    const verifiedTotal = Number(freshSummary?.verified_total || 0);

    let nextPaymentStatus = "unpaid";

    if (verifiedTotal >= totalAmount && totalAmount > 0) {
      nextPaymentStatus = "paid";
    } else if (verifiedTotal > 0) {
      nextPaymentStatus = "partial";
    } else if (Number(freshSummary?.has_pending)) {
      nextPaymentStatus = "pending";
    } else if (Number(freshSummary?.has_rejected)) {
      nextPaymentStatus = "rejected";
    }

    await conn.query(
      `UPDATE orders
       SET payment_status = ?
       WHERE id = ?`,
      [nextPaymentStatus, order.id],
    );

    // Receipt — only for a real "verified" outcome on a blueprint order.
    // Never for: action=rejected, a non-blueprint order, an
    // already-reviewed transaction (blocked earlier by the guarded
    // UPDATE's affectedRows check), or a failed guarded update. Created
    // inside this same transaction, before commit; a failure here rolls
    // back the payment review and the payment_status update together.
    let receiptResult = null;
    if (normalizedAction === "verified" && isBlueprintOrder) {
      receiptResult = await ensureReceiptForVerifiedPayment(conn, {
        orderId: order.id,
        paymentTransactionId: writtenPaymentTransactionId,
        issuedByUserId: req.user.id,
      });
    } else if (
      normalizedAction === "verified" &&
      normalize(order.order_type) === "standard"
    ) {
      // WISDOM STANDARD COD / READY-TO-SHIP RECEIPT V1
      // Rider collection remains pending. Only a successful admin
      // verification reaches this branch and creates the receipt.
      receiptResult = await ensureStandardVerifiedPaymentReceipt(conn, {
        orderId: order.id,
        paymentTransactionId: writtenPaymentTransactionId,
        issuedByUserId: req.user.id,
      });
    }

    if (order.customer_id) {
      const paymentAmountLabel = Number(targetAmount || 0).toLocaleString(
        "en-PH",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      );
      const remainingBalance = Math.max(0, totalAmount - verifiedTotal);
      const remainingBalanceLabel = remainingBalance.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const orderLabel = order.order_number || `#${order.id}`;

      await createNotificationSafe(conn, {
        userId: order.customer_id,
        type: "payment_update",
        title:
          normalizedAction === "verified"
            ? "Payment Verified"
            : "Payment Could Not Be Verified",
        message:
          normalizedAction === "verified"
            ? nextPaymentStatus === "paid"
              ? `Your ₱${paymentAmountLabel} payment for Order ${orderLabel} has been verified. This order is now fully paid.`
              : `Your ₱${paymentAmountLabel} payment for Order ${orderLabel} has been verified. Remaining balance: ₱${remainingBalanceLabel}.`
            : `We could not verify your ₱${paymentAmountLabel} payment for Order ${orderLabel}. Please review the payment details or contact our team for assistance.`,
        targetType: "order",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    await conn.commit();
    transactionActive = false;

    req.auditRecord = {
      id: order.id,
      new: {
        payment_id,
        action: normalizedAction,
        payment_status: nextPaymentStatus,
        ...(receiptResult
          ? {
              receipt_id: receiptResult.receiptId,
              receipt_number: receiptResult.receiptNumber,
              payment_label: receiptResult.paymentLabel,
            }
          : {}),
      },
    };

    return res.json({
      message: `Payment ${normalizedAction}.`,
      payment_status: nextPaymentStatus,
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch (rollbackErr) {
        console.error(
          "[orderController.verifyPayment] rollback failed:",
          rollbackErr.message || rollbackErr,
        );
        connectionReusable = false;
      }
    }
    console.error("[orderController.verifyPayment]", err);
    return res.status(500).json({ message: "Failed to review payment." });
  } finally {
    if (conn) {
      if (connectionReusable) {
        conn.release();
      } else {
        conn.destroy();
      }
    }
  }
};

exports.uploadDeliveryReceipt = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const orderId = parseInt(req.params.id);
    const url = `/uploads/deliveries/${req.file.filename}`;

    // Delivery history is attempt-based. Uploading proof for the current
    // delivery must never rewrite older failed/delivered attempts.
    const [[latestDelivery]] = await pool.query(
      `SELECT id
       FROM deliveries
       WHERE order_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [orderId],
    );

    if (!latestDelivery) {
      return res.status(404).json({ message: "Delivery record not found." });
    }

    const [result] = await pool.query(
      `UPDATE deliveries
       SET signed_receipt = ?,
           status = CASE
             WHEN status = 'completed' THEN 'completed'
             ELSE 'delivered'
           END,
           delivered_date = COALESCE(delivered_date, NOW())
       WHERE id = ?`,
      [url, latestDelivery.id],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "No delivery record found for this order.",
      });
    }

    await pool.query(
      `UPDATE orders
       SET status = CASE
         WHEN status IN ('shipping', 'production') THEN 'delivered'
         ELSE status
       END
       WHERE id = ? AND status NOT IN ('completed', 'cancelled')`,
      [orderId],
    );

    res.json({
      message: "Signed delivery receipt uploaded successfully.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAssignableStaff = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const [[order]] = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.blueprint_id, c.blueprint_id AS contract_blueprint_id
       FROM orders o
       LEFT JOIN contracts c ON c.order_id = o.id
       WHERE o.id = ?`,
      [orderId],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const blueprintId =
      order.contract_blueprint_id || order.blueprint_id || null;

    if (!blueprintId) {
      return res.status(400).json({
        message: "This order is not linked to a blueprint.",
      });
    }

    // ── FIXED: Added empty array [] ──
    const [staff] = await pool.query(
      `SELECT
          u.id,
          u.name,
          u.role,
          u.phone,
          (
            SELECT COUNT(DISTINCT COALESCE(pt.order_id, pt.blueprint_id, pt.id))
            FROM project_tasks pt
            WHERE pt.assigned_to = u.id
              AND pt.status IN ('pending', 'in_progress')
          ) AS active_task_count
       FROM users u
       WHERE u.role = 'staff'
        AND u.staff_type = 'indoor'
        AND u.is_active = 1
       ORDER BY active_task_count ASC, u.name ASC`,
      [],
    );

    res.json({
      blueprint_id: blueprintId,
      staff,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.assignStaff = async (req, res) => {
  const conn = await pool.getConnection();
  let transactionActive = false;

  try {
    const orderId = parseStrictPositiveInt(req.params.id);
    const staffId = parseStrictPositiveInt(req.body?.staff_id);
    const { due_date, note } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "Invalid order ID." });
    }

    if (!staffId || !due_date) {
      return res.status(400).json({
        message: "Assigned indoor staff and due date are required.",
      });
    }

    const parsedDueDate = new Date(due_date);
    if (Number.isNaN(parsedDueDate.getTime())) {
      return res.status(400).json({
        message: "Due date is invalid.",
      });
    }

    await conn.beginTransaction();
    transactionActive = true;

    const [[order]] = await conn.query(
      `SELECT o.*, c.blueprint_id AS contract_blueprint_id
       FROM orders o
       LEFT JOIN contracts c ON c.order_id = o.id
       WHERE o.id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    if (!order) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Order not found." });
    }

    const blueprintId =
      order.contract_blueprint_id || order.blueprint_id || null;

    if (!blueprintId) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "This order is not linked to a blueprint.",
      });
    }

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "This order is not a blueprint production order.",
      });
    }

    if (
      !["contract_released", "production"].includes(normalize(order.status))
    ) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Indoor staff assignment is only allowed after contract release or during production.",
      });
    }

    const [[staff]] = await conn.query(
      `SELECT id, name, role, staff_type, is_active
       FROM users
       WHERE id = ? AND role = 'staff' AND staff_type = 'indoor'
       LIMIT 1
       FOR UPDATE`,
      [staffId],
    );

    if (!staff || !staff.is_active) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Selected indoor staff member is not available.",
      });
    }

    const placeholders = REQUIRED_BLUEPRINT_TASK_ROLES.map(() => "?").join(
      ", ",
    );

    const [existingPacket] = await conn.query(
      `SELECT id, task_role, status, assigned_to
       FROM project_tasks
       WHERE order_id = ?
         AND LOWER(REPLACE(task_role, ' ', '_')) IN (${placeholders})
       FOR UPDATE`,
      [orderId, ...REQUIRED_BLUEPRINT_TASK_ROLES],
    );

    if (existingPacket.length > 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "A production packet already exists for this order. Update the existing packet instead of assigning again.",
      });
    }

    // Assignment is also a production-entry path. Consume the complete
    // reservation set before any task or status write. If the order already
    // entered production through the manual status path, the service returns
    // ALREADY_CONSUMED and does not deduct twice.
    const materialConsumptionResult =
      await consumeBlueprintMaterialsForProduction(conn, {
        orderId,
        actorUserId: req.user.id,
      });

    const createdTaskIds = [];
    for (const stepLabel of BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS) {
      const title = `${order.order_number || `Order #${orderId}`} — ${stepLabel}`;
      const description = note
        ? `Production step: ${stepLabel}\n\nAdmin production note: ${note}`
        : `Production step: ${stepLabel}`;

      const [taskResult] = await conn.query(
        `INSERT INTO project_tasks
          (
            order_id,
            blueprint_id,
            assigned_to,
            assigned_by,
            task_role,
            title,
            description,
            due_date,
            status,
            is_read
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
        [
          orderId,
          blueprintId,
          staffId,
          req.user.id,
          stepLabel,
          title,
          description,
          due_date,
        ],
      );
      createdTaskIds.push(taskResult.insertId);
    }

    await createNotification(conn, {
      userId: staffId,
      type: "assignment",
      title: "New Production Order Assigned",
      message: `You have been assigned the full production workflow for ${order.order_number || `Order #${orderId}`}. Complete Cutting Machine, Edge Banding, Horizontal Drilling, Retouching, and Packing.`,
      targetType: "task",
      targetId: createdTaskIds[0],
      targetOrderId: orderId,
    });

    const orderStatusChanged = normalize(order.status) === "contract_released";

    if (orderStatusChanged) {
      const [statusUpdateResult] = await conn.query(
        `UPDATE orders
         SET status = 'production'
         WHERE id = ?
           AND status = 'contract_released'`,
        [orderId],
      );

      if (statusUpdateResult.affectedRows !== 1) {
        throw new BlueprintMaterialConsumptionError(
          "ORDER_STATUS_CHANGED",
          "This order's status changed while production was starting. Please refresh and try again.",
          409,
        );
      }
    }

    await conn.commit();
    transactionActive = false;

    req.auditRecord = {
      id: orderId,
      old: orderStatusChanged ? { status: normalize(order.status) } : null,
      new: {
        assigned_staff_id: staffId,
        task_ids: createdTaskIds,
        task_roles: BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS,
        material_consumption_reason: materialConsumptionResult.reason,
        material_reservation_ids:
          materialConsumptionResult.reservation_ids || [],
        stock_movement_ids: materialConsumptionResult.stock_movement_ids || [],
        materials_consumed: materialConsumptionResult.consumed_count || 0,
        ...(orderStatusChanged ? { status: "production" } : {}),
      },
    };
    return res.json({
      message:
        "Indoor staff assigned to the full production workflow successfully.",
      steps_created: BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS.length,
      material_consumption: materialConsumptionResult,
    });
  } catch (err) {
    if (transactionActive) {
      await conn.rollback();
      transactionActive = false;
    }

    if (err instanceof BlueprintMaterialConsumptionError) {
      return res.status(err.statusCode || 409).json({
        message: err.message,
        integrity_reason: err.code,
        ...(err.details ? { details: err.details } : {}),
      });
    }

    return res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

/**
 * PATCH /orders/:id/reassign-staff
 * Transfers pending and explicitly on-hold production tasks to a new primary
 * indoor staff member. An actively in-progress step must be put on hold first.
 * Completed tasks and their historical ownership are never touched.
 */
exports.reassignStaff = async (req, res) => {
  const parseStrictPositiveInt = (value) => {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    }
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };

  const orderId = parseStrictPositiveInt(req.params.id);
  const newStaffId = parseStrictPositiveInt(req.body?.staff_id);

  if (!orderId) {
    return res.status(400).json({ message: "Invalid order ID." });
  }
  if (!newStaffId) {
    return res
      .status(400)
      .json({ message: "A valid staff member is required." });
  }

  let conn = null;
  let transactionActive = false;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [[order]] = await conn.query(
      `SELECT id, order_number, status, order_type, blueprint_id
       FROM orders
       WHERE id = ?
       FOR UPDATE`,
      [orderId],
    );

    if (!order) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Order not found." });
    }

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "This order is not a blueprint production order.",
      });
    }

    if (!order.blueprint_id) {
      await conn.rollback();
      transactionActive = false;
      return res
        .status(400)
        .json({ message: "This order is not linked to a blueprint." });
    }

    if (
      !["contract_released", "production"].includes(normalize(order.status))
    ) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Staff reassignment is only allowed after contract release or during production.",
      });
    }

    const [ownerRows] = await conn.query(
      `SELECT id FROM orders WHERE blueprint_id = ?`,
      [order.blueprint_id],
    );
    if (ownerRows.length > 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order's blueprint is referenced by more than one order. Manual review required.",
      });
    }

    const [[blueprint]] = await conn.query(
      `SELECT id, is_deleted FROM blueprints WHERE id = ? FOR UPDATE`,
      [order.blueprint_id],
    );
    if (!blueprint || blueprint.is_deleted) {
      await conn.rollback();
      transactionActive = false;
      return res
        .status(400)
        .json({ message: "This order's linked blueprint no longer exists." });
    }

    const blueprintId = blueprint.id;

    const [[newStaff]] = await conn.query(
      `SELECT id, name, role, staff_type, is_active
       FROM users
       WHERE id = ? AND role = 'staff' AND staff_type = 'indoor'
       FOR UPDATE`,
      [newStaffId],
    );

    if (!newStaff || !newStaff.is_active) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Only active indoor staff can be assigned to project tasks.",
      });
    }

    const [packet] = await conn.query(
      `SELECT id, task_role, status, assigned_to, assigned_by, order_id, blueprint_id,
              accepted_at, completed_at
       FROM project_tasks
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    const mismatchedRow = packet.find(
      (row) => row.order_id !== orderId || row.blueprint_id !== blueprintId,
    );
    if (mismatchedRow) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order's production packet references an unexpected order or blueprint.",
      });
    }

    const rolesByKey = new Map();
    for (const row of packet) {
      const key = normalizeTaskRole(row.task_role);
      if (!REQUIRED_BLUEPRINT_TASK_ROLES.includes(key)) continue;
      if (rolesByKey.has(key)) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message:
            "This order's production packet has a duplicate step and cannot be reassigned automatically.",
        });
      }
      rolesByKey.set(key, row);
    }

    const missingRoles = REQUIRED_BLUEPRINT_TASK_ROLES.filter(
      (key) => !rolesByKey.has(key),
    );

    if (packet.length !== 5 || missingRoles.length > 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order does not have a complete five-step production packet.",
      });
    }

    const SUPPORTED_TASK_STATUSES = [
      "pending",
      "in_progress",
      "blocked",
      "completed",
    ];
    const invalidStatusRow = packet.find(
      (row) => !SUPPORTED_TASK_STATUSES.includes(normalize(row.status)),
    );
    if (invalidStatusRow) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order's production packet contains an unsupported task status.",
      });
    }

    const activeRow = packet.find(
      (row) => normalize(row.status) === "in_progress",
    );
    if (activeRow) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Put the active production step on hold before reassigning the remaining work.",
      });
    }

    const allCompleted = packet.every(
      (row) => normalize(row.status) === "completed",
    );
    if (allCompleted) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "All production steps are already completed. There is nothing to reassign.",
      });
    }

    const eligibleRows = packet.filter(
      (row) =>
        ["pending", "blocked"].includes(normalize(row.status)) &&
        row.assigned_to !== newStaffId,
    );

    if (eligibleRows.length === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(200).json({
        message:
          "The selected staff member is already assigned to all remaining production steps.",
      });
    }

    let totalAffected = 0;
    for (const row of eligibleRows) {
      const [result] = await conn.query(
        `UPDATE project_tasks
         SET assigned_to = ?, assigned_by = ?, updated_at = NOW()
         WHERE id = ? AND status = ? AND assigned_to = ?`,
        [newStaffId, req.user.id, row.id, row.status, row.assigned_to],
      );
      totalAffected += result.affectedRows;
    }

    if (totalAffected !== eligibleRows.length) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "Production tasks changed before this reassignment was completed. Refresh and try again.",
      });
    }

    const distinctPreviousStaffIds = [
      ...new Set(packet.map((row) => row.assigned_to).filter(Boolean)),
    ];

    let staffNameById = new Map();
    if (distinctPreviousStaffIds.length > 0) {
      const placeholders = distinctPreviousStaffIds.map(() => "?").join(", ");
      const [nameRows] = await conn.query(
        `SELECT id, name FROM users WHERE id IN (${placeholders})`,
        distinctPreviousStaffIds,
      );
      staffNameById = new Map(nameRows.map((row) => [row.id, row.name]));
    }

    const orderLabel = order.order_number || "Order #" + orderId;

    await createNotification(conn, {
      userId: newStaffId,
      type: "assignment",
      title: "Production Steps Reassigned to You",
      message: `You have been assigned ${eligibleRows.length} remaining production step(s) for ${orderLabel}. Any on-hold step remains on hold until you resume it.`,
      targetType: "task",
      targetId: eligibleRows[0].id,
      targetOrderId: orderId,
    });

    const lostByStaff = new Map();
    for (const row of eligibleRows) {
      if (!row.assigned_to) continue;
      if (!lostByStaff.has(row.assigned_to)) {
        lostByStaff.set(row.assigned_to, []);
      }
      lostByStaff.get(row.assigned_to).push(row.task_role);
    }

    for (const [oldStaffId, roles] of lostByStaff.entries()) {
      const firstLostRow = eligibleRows.find(
        (row) => row.assigned_to === oldStaffId,
      );
      await createNotification(conn, {
        userId: oldStaffId,
        type: "assignment",
        title: "Reassigned Off Production Steps",
        message: `You have been reassigned off ${roles.length} remaining production step(s) for ${orderLabel}. Your completed work remains on record.`,
        targetType: "task",
        targetId: firstLostRow ? firstLostRow.id : null,
        targetOrderId: orderId,
      });
    }

    const previousAssignments = eligibleRows.map((row) => ({
      task_id: row.id,
      task_role: getTaskRoleLabel(row.task_role),
      original_status: row.status,
      previous_staff_id: row.assigned_to,
      previous_staff_name: staffNameById.get(row.assigned_to) || null,
      previous_assigned_by: row.assigned_by,
      accepted_at: row.accepted_at || null,
    }));

    const completedTasksPreserved = packet
      .filter((row) => normalize(row.status) === "completed")
      .map((row) => ({
        task_id: row.id,
        task_role: getTaskRoleLabel(row.task_role),
        status: row.status,
        assigned_staff_id: row.assigned_to,
        assigned_staff_name: staffNameById.get(row.assigned_to) || null,
        completed_at: row.completed_at || null,
      }));

    const auditRecord = {
      id: orderId,
      old: {
        blueprint_id: blueprintId,
        previous_assignments: previousAssignments,
      },
      new: {
        blueprint_id: blueprintId,
        new_staff_id: newStaffId,
        new_staff_name: newStaff.name || null,
        new_assigned_by: req.user.id,
        transferred_task_ids: eligibleRows.map((row) => row.id),
        transferred_task_roles: eligibleRows.map((row) =>
          getTaskRoleLabel(row.task_role),
        ),
        transferred_task_original_statuses: eligibleRows.map(
          (row) => row.status,
        ),
        completed_tasks_preserved: completedTasksPreserved,
      },
    };

    const responseBody = {
      message: eligibleRows.length + " production step(s) reassigned successfully.",
      transferred_task_ids: eligibleRows.map((row) => row.id),
      preserved_completed_task_ids: completedTasksPreserved.map(
        (task) => task.task_id,
      ),
    };

    await conn.commit();
    transactionActive = false;

    req.auditRecord = auditRecord;
    return res.json(responseBody);
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error(
          "[orders.reassignStaff] rollback failed:",
          rollbackErr.message,
        );
      }
      transactionActive = false;
    }
    return res.status(500).json({ message: "Server error." });
  } finally {
    if (conn) conn.release();
  }
};

// ── Helper: mirrors the production-step sequence rules already enforced in
// controllers/staff/pos.tasks.js (validateProductionSequence), reusing the
// task-role constants/normalizers already defined above in this file. ──
async function validateProductionStepTransition({
  orderId,
  taskRole,
  currentStatus,
  nextStatus,
}) {
  const stepIndex = REQUIRED_BLUEPRINT_TASK_ROLES.indexOf(
    normalizeTaskRole(taskRole),
  );

  if (orderId && stepIndex !== -1) {
    const [packetRows] = await pool.query(
      `SELECT task_role, status FROM project_tasks WHERE order_id = ?`,
      [orderId],
    );

    const packetMap = new Map(
      packetRows.map((row) => [normalizeTaskRole(row.task_role), row]),
    );

    for (let i = 0; i < stepIndex; i += 1) {
      const previousRole = REQUIRED_BLUEPRINT_TASK_ROLES[i];
      const previousStep = packetMap.get(previousRole);

      if (!previousStep || normalize(previousStep.status) !== "completed") {
        return `Complete ${getTaskRoleLabel(previousRole)} first before starting ${getTaskRoleLabel(
          normalizeTaskRole(taskRole),
        )}.`;
      }
    }
  }

  if (
    nextStatus === "in_progress" &&
    !["pending", "blocked"].includes(currentStatus)
  ) {
    return "Only a pending or blocked step can be started.";
  }

  if (nextStatus === "completed" && currentStatus !== "in_progress") {
    return "Only an in-progress step can be marked as completed.";
  }

  if (nextStatus === "blocked" && currentStatus !== "in_progress") {
    return "Only an in-progress step can be marked as blocked.";
  }

  return null;
}

exports.updateTaskStatus = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const taskId = parseInt(req.params.taskId);
    const { status } = req.body;
    const holdReason = String(req.body?.hold_reason || "").trim();

    const valid = ["pending", "in_progress", "completed", "blocked"];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: "Invalid task status." });
    }

    if (status === "blocked") {
      if (!holdReason) {
        return res.status(400).json({
          message: "A reason is required before putting production work on hold.",
        });
      }
      if (holdReason.length > 500) {
        return res.status(400).json({
          message: "Hold reason must be 500 characters or fewer.",
        });
      }
    }

    const [[task]] = await pool.query(
      `SELECT * FROM project_tasks WHERE id = ? AND order_id = ?`,
      [taskId, orderId],
    );

    if (!task) {
      return res
        .status(404)
        .json({ message: "Task not found for this order." });
    }

    const currentStatus = normalize(task.status);
    const nextStatus = normalize(status);

    if (currentStatus === "completed" && nextStatus !== "completed") {
      return res.status(400).json({
        message: "Completed tasks can no longer be changed.",
      });
    }

    const sequenceError = await validateProductionStepTransition({
      orderId,
      taskRole: task.task_role,
      currentStatus,
      nextStatus,
    });

    if (sequenceError) {
      return res.status(400).json({ message: sequenceError });
    }

    const completedAt =
      nextStatus === "completed" && currentStatus !== "completed"
        ? new Date()
        : nextStatus !== "completed"
          ? null
          : task.completed_at;

    let acceptedAt = task.accepted_at || null;
    if (!acceptedAt && nextStatus === "in_progress") {
      acceptedAt = new Date();
    }

    const [result] = await pool.query(
      `UPDATE project_tasks
       SET status = ?, completed_at = ?, accepted_at = ?, is_read = 1, updated_at = NOW()
       WHERE id = ? AND order_id = ? AND status = ?`,
      [status, completedAt, acceptedAt, taskId, orderId, task.status],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message:
          "Task status changed before this update was completed. Refresh and try again.",
      });
    }

    req.auditRecord = {
      id: taskId,
      old: {
        status: currentStatus,
        accepted_at: task.accepted_at || null,
        completed_at: task.completed_at || null,
      },
      new: {
        status: nextStatus,
        accepted_at: acceptedAt,
        completed_at: completedAt,
        ...(nextStatus === "blocked" ? { hold_reason: holdReason } : {}),
      },
    };

    res.json({
      message:
        nextStatus === "blocked"
          ? "Production step put on hold."
          : nextStatus === "in_progress" && currentStatus === "blocked"
            ? "Production step resumed."
            : "Task status updated successfully.",
      task: {
        id: taskId,
        status: nextStatus,
        accepted_at: acceptedAt,
        completed_at: completedAt,
        hold_reason: nextStatus === "blocked" ? holdReason : null,
      },
    });
  } catch (err) {
    console.error("orders.updateTaskStatus:", err);
    res.status(500).json({ message: "Failed to update task status." });
  }
};

exports.recordManualPayment = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const orderId = parseInt(req.params.id);
    const amount = Number(req.body?.amount || 0);
    const paymentMethod = normalize(req.body?.payment_method || "cash");
    const notes = String(req.body?.notes || "").trim();

    if (!(amount > 0)) {
      return res.status(400).json({
        message: "Amount must be greater than zero.",
      });
    }

    if (!["cash", "gcash", "bank_transfer"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method.",
      });
    }

    await conn.beginTransaction();

    const [[order]] = await conn.query(
      `SELECT id, total, status
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId],
    );

    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: "Order not found." });
    }

    if (normalize(order.status) !== "delivered") {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Remaining balance can only be recorded after the order is delivered.",
      });
    }

    const [[summary]] = await conn.query(
      `SELECT
         COALESCE(
           SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END),
           0
         ) AS verified_total
       FROM payment_transactions
       WHERE order_id = ?`,
      [orderId],
    );

    const totalAmount = Number(order.total || 0);
    const verifiedTotal = Number(summary?.verified_total || 0);
    const currentBalance = Math.max(0, totalAmount - verifiedTotal);

    if (currentBalance <= 0.009) {
      await conn.rollback();
      return res.status(400).json({
        message: "This order is already fully paid.",
      });
    }

    if (amount > currentBalance + 0.01) {
      await conn.rollback();
      return res.status(400).json({
        message: `Amount exceeds the remaining balance of ₱${currentBalance.toLocaleString(
          "en-PH",
          { minimumFractionDigits: 2 },
        )}.`,
      });
    }

    await conn.query(
      `INSERT INTO payment_transactions
        (
          order_id,
          amount,
          payment_method,
          proof_url,
          verified_by,
          verified_at,
          status,
          notes
        )
       VALUES (?, ?, ?, '', ?, NOW(), 'verified', ?)`,
      [
        orderId,
        amount,
        paymentMethod,
        req.user.id,
        notes || "Manual remaining balance recorded after delivery.",
      ],
    );

    const newVerifiedTotal = verifiedTotal + amount;

    let nextPaymentStatus = "unpaid";
    if (newVerifiedTotal >= totalAmount - 0.01 && totalAmount > 0) {
      nextPaymentStatus = "paid";
    } else if (newVerifiedTotal > 0) {
      nextPaymentStatus = "partial";
    }

    await conn.query(
      `UPDATE orders
       SET payment_status = ?
       WHERE id = ?`,
      [nextPaymentStatus, orderId],
    );

    await conn.commit();

    res.json({
      message:
        nextPaymentStatus === "paid"
          ? "Remaining balance recorded. The order can now be completed."
          : "Payment recorded successfully.",
      payment_status: nextPaymentStatus,
      remaining_balance: Math.max(0, totalAmount - newVerifiedTotal),
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.getOrderDiscussion = async (req, res) => {
  const orderId = adminToPositiveInt(req.params.id, 0);

  if (!orderId) {
    return res.status(400).json({ message: "Invalid order ID." });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // ── FIXED: Switched to .query ──
    const [orders] = await conn.query(
      `SELECT id, order_number, customer_id, order_type
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId],
    );

    if (!orders.length) {
      return res.status(404).json({ message: "Order not found." });
    }

    const order = orders[0];

    if (
      String(order.order_type || "")
        .trim()
        .toLowerCase() !== "blueprint"
    ) {
      return res.status(400).json({
        message:
          "Discussion thread is available for blueprint custom orders only.",
      });
    }

    // ── FIXED: Switched to .query ──
    const [messageRows] = await conn.query(
      `SELECT
          m.id,
          m.order_id,
          m.order_item_id,
          m.sender_id,
          m.sender_role,
          m.message,
          m.created_at,
          m.updated_at,
          u.name AS sender_name
        FROM custom_order_messages m
        LEFT JOIN users u
          ON u.id = m.sender_id
        WHERE m.order_id = ?
        ORDER BY m.created_at ASC, m.id ASC`,
      [orderId],
    );

    // ── FIXED: Switched to .query ──
    const [attachmentRows] = await conn.query(
      `SELECT
          id,
          order_id,
          order_item_id,
          message_id,
          uploaded_by,
          file_url,
          file_name,
          mime_type,
          file_size,
          attachment_type,
          created_at
        FROM custom_order_attachments
        WHERE order_id = ?
        ORDER BY created_at ASC, id ASC`,
      [orderId],
    );

    const normalizedAttachments = attachmentRows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      order_item_id: row.order_item_id || null,
      message_id: row.message_id || null,
      uploaded_by: row.uploaded_by || null,
      file_url: signUploadPath(adminSafeTextOrNull(row.file_url)),
      file_name: adminSafeTextOrNull(row.file_name),
      mime_type: adminSafeTextOrNull(row.mime_type),
      file_size: Number(row.file_size || 0) || null,
      attachment_type: adminNormalizeText(row.attachment_type),
      created_at: row.created_at || null,
    }));

    const attachmentsByMessageId = normalizedAttachments.reduce((acc, item) => {
      const key = Number(item.message_id || 0);
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const messages = messageRows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      order_item_id: row.order_item_id || null,
      sender_id: row.sender_id || null,
      sender_role: adminNormalizeText(row.sender_role) || "customer",
      sender_name: adminSafeTextOrNull(row.sender_name) || "User",
      message: adminSafeTextOrNull(row.message),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      attachments: attachmentsByMessageId[row.id] || [],
    }));

    return res.json({
      order_id: order.id,
      order_number: order.order_number,
      discussion: messages,
    });
  } catch (err) {
    console.error("[admin.order getOrderDiscussion]", err);
    return res.status(500).json({
      message: "Failed to load discussion thread.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.postOrderDiscussionMessage = async (req, res) => {
  const orderId = adminToPositiveInt(req.params.id, 0);
  const message = String(req.body?.message || "").trim();
  const files = Array.isArray(req.files) ? req.files : [];

  if (!orderId) {
    return res.status(400).json({ message: "Invalid order ID." });
  }

  if (!message && !files.length) {
    return res.status(400).json({
      message: "Write a message or upload at least one attachment.",
    });
  }

  let conn;
  let transactionActive = false;
  let committed = false;
  const storedAssets = [];

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [orders] = await conn.query(
      `SELECT id, order_number, customer_id, order_type
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId],
    );

    if (!orders.length) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Order not found." });
    }

    const order = orders[0];

    if (
      String(order.order_type || "")
        .trim()
        .toLowerCase() !== "blueprint"
    ) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Discussion thread is available for blueprint custom orders only.",
      });
    }

    for (const file of files) {
      const stored = await storeUploadBuffer({
        file,
        folder: "custom-request-assets",
      });
      storedAssets.push(stored);
    }

    const senderRole =
      String(req.user?.role || "")
        .trim()
        .toLowerCase() === "admin"
        ? "admin"
        : "staff";

    const [messageResult] = await conn.query(
      `INSERT INTO custom_order_messages
        (order_id, order_item_id, sender_id, sender_role, message)
       VALUES (?, NULL, ?, ?, ?)`,
      [
        order.id,
        req.user?.id || null,
        senderRole,
        message || "Uploaded attachment.",
      ],
    );

    const messageId = messageResult.insertId;

    for (const asset of storedAssets) {
      await conn.query(
        `INSERT INTO custom_order_attachments
          (order_id, order_item_id, message_id, uploaded_by, file_url, file_name, mime_type, file_size, attachment_type)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'chat_attachment')`,
        [
          order.id,
          messageId,
          req.user?.id || null,
          asset.file_url,
          asset.file_name,
          asset.mime_type,
          asset.file_size,
        ],
      );
    }

    await adminInsertDiscussionNotificationSafe(conn, order.customer_id, {
      type: "custom_request_admin_reply",
      title: "New Team Reply",
      message: `Spiral Wood Services sent a new discussion reply for ${order.order_number}.`,
      targetType: "custom_request",
      targetId: order.id,
      targetOrderId: order.id,
    });

    await conn.commit();
    transactionActive = false;
    committed = true;

    return res.json({
      message: files.length
        ? "Discussion reply and attachment sent successfully."
        : "Discussion reply sent successfully.",
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch {}
    }

    console.error("[admin.order postOrderDiscussionMessage]", err);
    const status = Number(err.status) || 500;
    return res.status(status).json({
      message:
        status === 502
          ? "Attachment storage is unavailable right now. Please try again."
          : status < 500
            ? err.message
            : "Failed to send discussion reply.",
    });
  } finally {
    if (!committed && storedAssets.length) {
      await Promise.allSettled(
        storedAssets.map((asset) => cleanupStoredUpload(asset)),
      );
    }
    if (conn) conn.release();
  }
};
