const pool = require("../../config/db");
const {
  getRestrictedPaymentSummary,
  recordCashPayment,
} = require("../../services/blueprintCashPaymentService");
const { parseStrictPositiveInt } = require("../../utils/validators");
const { parseDecimalToCentsStrict } = require("../../utils/paymentAmounts");
const { createNotificationSafe } = require("../../utils/notificationHelper");

const normalize = (value) => String(value || "").trim().toLowerCase();

const safeParseJson = (value, fallback = null) => {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getOrderDraftPreviewMap = async (dbPool, orderIds = []) => {
  const ids = Array.from(
    new Set(
      orderIds
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  );

  if (!ids.length) return new Map();

  const placeholders = ids.map(() => "?").join(",");
  const [items] = await dbPool.query(
    `SELECT order_id, customization_json
     FROM order_items
     WHERE order_id IN (${placeholders})
       AND customization_json IS NOT NULL
     ORDER BY order_id ASC, id ASC`,
    ids,
  );

  const previewByOrderId = new Map();

  items.forEach((item) => {
    const orderId = Number(item.order_id);
    if (previewByOrderId.has(orderId)) return;

    const customization = safeParseJson(item.customization_json, {}) || {};
    const editorSnapshot =
      customization?.editor_snapshot &&
      typeof customization.editor_snapshot === "object" &&
      !Array.isArray(customization.editor_snapshot)
        ? customization.editor_snapshot
        : null;

    if (
      !editorSnapshot ||
      !Array.isArray(editorSnapshot.components) ||
      editorSnapshot.components.length === 0
    ) {
      return;
    }

    previewByOrderId.set(orderId, {
      components: editorSnapshot.components,
      worldSize:
        editorSnapshot.worldSize && typeof editorSnapshot.worldSize === "object"
          ? editorSnapshot.worldSize
          : null,
    });
  });

  return previewByOrderId;
};

// Strict order-number validation: trimmed, non-empty, max 50 chars,
// no control characters or line breaks. Exact-equality lookup only --
// never LIKE, never a wildcard.
const isValidOrderNumber = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 50) return false;
  // Reject any ASCII control character (0x00-0x1F, 0x7F), which also
  // rejects embedded newlines/tabs/carriage returns.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return false;
  return true;
};

// Safe, human-readable "who handled this payment" text. Never returns a
// raw user id, and never lets a customer-triggered PayMongo verification
// (issued_by/verified_by pointing at a technical FK owner, not a real
// staff processor) be displayed as a person's name.
const PICKUP_ACKNOWLEDGEMENT_TEXT =
  "I confirm that I received the furniture listed for this order from Spiral Wood Services.";

const normalizePickupRecipientType = (value) => {
  const key = normalize(value).replace(/\s+/g, "_");
  return ["customer", "authorized_representative"].includes(key) ? key : null;
};

const normalizePickupSignature = (value) => {
  const raw = String(value || "").trim();
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!match || raw.length > 250000) return null;

  let bytes;
  try {
    bytes = Buffer.from(match[1], "base64");
  } catch {
    return null;
  }

  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 500 || !bytes.subarray(0, 8).equals(pngHeader)) {
    return null;
  }

  return raw;
};

const getPickupAcknowledgementForOrder = async (dbPool, orderId) => {
  const [[row]] = await dbPool.query(
    `SELECT
       pa.id,
       pa.order_id,
       pa.received_by_name,
       pa.recipient_type,
       pa.signature_data,
       pa.acknowledgement_text,
       pa.note,
       pa.acknowledged_at,
       pa.released_by,
       u.name AS released_by_name
     FROM pickup_acknowledgements pa
     LEFT JOIN users u ON u.id = pa.released_by
     WHERE pa.order_id = ?
     LIMIT 1`,
    [orderId],
  );

  return row || null;
};

const buildProcessorDisplay = ({ paymentMethod, status, verifierName }) => {
  const method = normalize(paymentMethod);
  const normalizedStatus = normalize(status);

  if (method === "paymongo") return "PayMongo / Online Payment";
  if (normalizedStatus === "verified" && verifierName) return verifierName;
  if (normalizedStatus === "pending" && !verifierName) return "Pending verification";
  if (normalizedStatus === "verified" && !verifierName) return "System";
  return "—";
};

// Payment history for the exact searched blueprint order only. Receipt
// info is joined strictly by payment_transaction_id + receipt_type =
// 'blueprint_payment' -- never by order_id, and never "the latest
// receipt for this order" (one order can have many receipts). No proof
// file paths, no raw PayMongo payloads, no raw user ids are selected or
// returned.
const getPaymentHistoryForOrder = async (dbPool, orderId) => {
  const [rows] = await dbPool.query(
    `
    SELECT
      pt.id AS payment_transaction_id,
      pt.created_at,
      pt.amount,
      pt.payment_method,
      pt.status,
      u.name AS verifier_name,
      r.id AS receipt_id,
      r.receipt_number,
      r.payment_label
    FROM payment_transactions pt
    LEFT JOIN users u ON u.id = pt.verified_by
    LEFT JOIN receipts r
      ON r.payment_transaction_id = pt.id
      AND r.receipt_type = 'blueprint_payment'
    WHERE pt.order_id = ?
    ORDER BY pt.created_at DESC, pt.id DESC
    `,
    [orderId],
  );

  return rows.map((row) => {
    const status = normalize(row.status);
    const isVerified = status === "verified";

    // Defense in depth: even though the JOIN already restricts receipts
    // to the correct payment_transaction_id + receipt_type, a receipt
    // link is only ever surfaced to the UI when the payment itself is
    // verified -- matching the "View Receipt only when verified AND
    // receipt_id AND receipt_number exist" rule exactly.
    const receiptId = isVerified ? row.receipt_id ?? null : null;
    const receiptNumber = isVerified ? row.receipt_number ?? null : null;

    return {
      payment_transaction_id: row.payment_transaction_id,
      created_at: row.created_at,
      amount: row.amount,
      payment_method: row.payment_method,
      status: row.status,
      payment_label: isVerified ? row.payment_label ?? null : null,
      processor_display: buildProcessorDisplay({
        paymentMethod: row.payment_method,
        status: row.status,
        verifierName: row.verifier_name,
      }),
      receipt_id: receiptId,
      receipt_number: receiptNumber,
    };
  });
};


exports.listOrders = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        o.id AS order_id,
        o.order_number,
        o.status AS order_status,
        o.payment_status,
        o.payment_method AS initial_payment_method,
        o.fulfillment_method,
        o.picked_up_at,
        o.total,
        o.blueprint_id,
        o.created_at,
        o.updated_at,

        COALESCE(
          NULLIF(TRIM(o.walkin_customer_name), ''),
          NULLIF(TRIM(customer.name), ''),
          'Customer'
        ) AS customer_name,

        COALESCE(
          NULLIF(TRIM(b.title), ''),
          'Blueprint'
        ) AS blueprint_title,

        b.thumbnail_url,
        b.design_data AS blueprint_design_data,
        b.view_3d_data AS blueprint_view_3d_data,

        COALESCE(
          SUM(
            CASE
              WHEN LOWER(COALESCE(pt.status, '')) = 'verified'
                THEN pt.amount
              ELSE 0
            END
          ),
          0
        ) AS verified_total,

        COALESCE(
          SUM(
            CASE
              WHEN LOWER(COALESCE(pt.status, '')) = 'pending'
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS pending_payment_count

      FROM orders o
      LEFT JOIN users customer
        ON customer.id = o.customer_id
      LEFT JOIN blueprints b
        ON b.id = o.blueprint_id
      LEFT JOIN payment_transactions pt
        ON pt.order_id = o.id

      WHERE o.order_type = 'blueprint'

      GROUP BY
        o.id,
        o.order_number,
        o.status,
        o.payment_status,
        o.payment_method,
        o.fulfillment_method,
        o.picked_up_at,
        o.total,
        o.blueprint_id,
        o.created_at,
        o.updated_at,
        o.walkin_customer_name,
        customer.name,
        b.title,
        b.thumbnail_url,
        b.design_data,
        b.view_3d_data

      ORDER BY o.updated_at DESC, o.id DESC
      LIMIT 200
      `,
      [],
    );

    const draftPreviewByOrderId = await getOrderDraftPreviewMap(
      pool,
      rows.map((row) => row.order_id),
    );

    const orders = rows.map((row) => {
      const total = Number(row.total || 0);
      const verifiedTotal = Number(row.verified_total || 0);
      const pendingPaymentCount = Number(row.pending_payment_count || 0);
      const remainingBalance = Math.max(0, total - verifiedTotal);
      const storedStatus = normalize(row.payment_status) || "unpaid";

      return {
        order_id: row.order_id,
        order_number: row.order_number,
        order_status: row.order_status,
        payment_status:
          pendingPaymentCount > 0 && storedStatus !== "paid"
            ? "pending"
            : storedStatus,
        stored_payment_status: storedStatus,
        initial_payment_method: row.initial_payment_method || null,
        fulfillment_method:
          normalize(row.fulfillment_method) === "pickup" ? "pickup" : "delivery",
        picked_up_at: row.picked_up_at || null,
        total,
        verified_total: verifiedTotal,
        remaining_balance: remainingBalance,
        pending_payment_count: pendingPaymentCount,
        customer_name: row.customer_name,
        blueprint_id: row.blueprint_id,
        blueprint_title: row.blueprint_title,
        thumbnail_url: row.thumbnail_url || null,
        blueprint_design_data: row.blueprint_design_data || null,
        blueprint_view_3d_data: row.blueprint_view_3d_data || null,
        draft_editor_snapshot:
          draftPreviewByOrderId.get(Number(row.order_id)) || null,
        created_at: row.created_at,
      };
    });

    return res.json({ orders });
  } catch (err) {
    console.error("[pos.blueprintPayments listOrders]", err);
    return res.status(500).json({
      message: "Failed to load blueprint payments.",
    });
  }
};
exports.lookupByOrderNumber = async (req, res) => {
  const rawOrderNumber = req.query.order_number;

  if (!isValidOrderNumber(rawOrderNumber)) {
    return res.status(400).json({ message: "Enter a valid order number." });
  }

  const orderNumber = rawOrderNumber.trim();

  try {
    const [[row]] = await pool.query(
      `
      SELECT
        o.id,
        o.blueprint_id,
        COALESCE(
          NULLIF(TRIM(o.walkin_customer_name), ''),
          NULLIF(TRIM(customer.name), ''),
          'Customer'
        ) AS customer_name,
        COALESCE(
          NULLIF(TRIM(b.title), ''),
          'Blueprint'
        ) AS blueprint_title,
        b.thumbnail_url,
        b.design_data AS blueprint_design_data,
        b.view_3d_data AS blueprint_view_3d_data
      FROM orders o
      LEFT JOIN users customer
        ON customer.id = o.customer_id
      LEFT JOIN blueprints b
        ON b.id = o.blueprint_id
      WHERE o.order_number = ?
      LIMIT 1
      `,
      [orderNumber],
    );

    if (!row) {
      return res.status(404).json({ message: "Order not found." });
    }

    const summary = await getRestrictedPaymentSummary(pool, row.id);
    const paymentHistory = await getPaymentHistoryForOrder(pool, row.id);
    const pickupAcknowledgement = await getPickupAcknowledgementForOrder(pool, row.id);
    const draftPreviewByOrderId = await getOrderDraftPreviewMap(pool, [row.id]);

    return res.json({
      ...summary,
      customer_name: row.customer_name,
      blueprint_id: row.blueprint_id || null,
      blueprint_title: row.blueprint_title,
      thumbnail_url: row.thumbnail_url || null,
      blueprint_design_data: row.blueprint_design_data || null,
      blueprint_view_3d_data: row.blueprint_view_3d_data || null,
      draft_editor_snapshot:
        draftPreviewByOrderId.get(Number(row.id)) || null,
      payment_history: paymentHistory,
      pickup_acknowledgement: pickupAcknowledgement,
    });
  } catch (err) {
    console.error("[pos.blueprintPayments lookupByOrderNumber]", err);
    return res.status(500).json({ message: "Failed to look up order." });
  }
};

exports.recordPayment = async (req, res) => {
  req.auditRecord = null;

  const orderId = parseStrictPositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: "Invalid order id." });
  }

  const bodyKeys = Object.keys(req.body || {});
  if (bodyKeys.length !== 1 || bodyKeys[0] !== "amount") {
    return res.status(400).json({ message: "Request must contain only an amount field." });
  }

  try {
    const result = await recordCashPayment({
      pool,
      orderId,
      amountRaw: req.body.amount,
      verifiedByUserId: req.user.id,
    });

    if (result.httpStatus === 200 && result.auditRecord) {
      req.auditRecord = result.auditRecord;
    } else {
      req.auditRecord = null;
    }

    return res.status(result.httpStatus).json(result.body);
  } catch (err) {
    req.auditRecord = null;
    console.error("[pos.blueprintPayments recordPayment]", err);
    return res.status(500).json({ message: "Failed to record cash payment." });
  }
};

exports.markPickedUp = async (req, res) => {
  req.auditRecord = null;
  const orderId = parseStrictPositiveInt(req.params.id);
  if (!orderId) return res.status(400).json({ message: "Invalid order id." });

  const bodyKeys = Object.keys(req.body || {}).sort();
  const allowedBodyKeys = ["note", "received_by_name", "recipient_type", "signature_data"].sort();
  if (bodyKeys.some((key) => !allowedBodyKeys.includes(key))) {
    return res.status(400).json({ message: "Unexpected pickup acknowledgement field." });
  }

  const receivedByName = String(req.body?.received_by_name || "").trim().replace(/\s+/g, " ");
  const recipientType = normalizePickupRecipientType(req.body?.recipient_type);
  const signatureData = normalizePickupSignature(req.body?.signature_data);
  const note = String(req.body?.note || "").trim();

  if (!receivedByName || receivedByName.length > 150) {
    return res.status(400).json({ message: "Enter the name of the person receiving the furniture." });
  }
  if (!recipientType) {
    return res.status(400).json({ message: "Choose Customer or Authorized Representative." });
  }
  if (!signatureData) {
    return res.status(400).json({ message: "A valid customer or recipient signature is required before pickup release." });
  }
  if (note.length > 500) {
    return res.status(400).json({ message: "Pickup note must be 500 characters or fewer." });
  }

  let conn = null;
  let transactionActive = false;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [[order]] = await conn.query(
      `SELECT id, order_number, customer_id, order_type, status, payment_status,
              total, fulfillment_method, picked_up_at
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    if (!order || normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Blueprint order not found." });
    }
    if (normalize(order.fulfillment_method) !== "pickup") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({ message: "Only pickup orders can use pickup acknowledgement." });
    }
    if (order.picked_up_at || normalize(order.status) === "completed") {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({ message: "This order has already been picked up." });
    }
    if (normalize(order.status) !== "ready_for_pickup") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({ message: "This furniture is not ready for pickup yet." });
    }

    const [[existingAcknowledgement]] = await conn.query(
      `SELECT id FROM pickup_acknowledgements WHERE order_id = ? LIMIT 1 FOR UPDATE`,
      [orderId],
    );
    if (existingAcknowledgement) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({ message: "A pickup acknowledgement already exists for this order." });
    }

    const [tasks] = await conn.query(
      `SELECT task_role, status
       FROM project_tasks
       WHERE order_id = ?
       FOR UPDATE`,
      [orderId],
    );
    const statusByRole = new Map(
      tasks.map((row) => [
        String(row.task_role || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_"),
        normalize(row.status),
      ]),
    );
    const requiredRoles = ["cutting_machine", "edge_banding", "horizontal_drilling", "retouching", "packing"];
    const productionComplete = requiredRoles.every(
      (role) => statusByRole.get(role) === "completed",
    );
    if (!productionComplete) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({ message: "All required production tasks must be completed before pickup." });
    }

    const [payments] = await conn.query(
      `SELECT id, amount, status
       FROM payment_transactions
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );
    let verifiedCents = 0;
    for (const payment of payments) {
      const cents = parseDecimalToCentsStrict(payment.amount);
      if (cents === null) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({ message: "This order's payment records are inconsistent." });
      }
      const status = normalize(payment.status);
      if (status === "pending") {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({ message: "A payment is still awaiting verification." });
      }
      if (status === "verified") verifiedCents += cents;
    }
    const totalCents = parseDecimalToCentsStrict(order.total);
    if (totalCents === null || totalCents <= 0 || verifiedCents !== totalCents || normalize(order.payment_status) !== "paid") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({ message: "The full balance must be verified before releasing this furniture." });
    }

    const [acknowledgementInsert] = await conn.execute(
      `INSERT INTO pickup_acknowledgements
        (order_id, received_by_name, recipient_type, signature_data,
         acknowledgement_text, note, released_by, acknowledged_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        orderId,
        receivedByName,
        recipientType,
        signatureData,
        PICKUP_ACKNOWLEDGEMENT_TEXT,
        note || null,
        req.user.id,
      ],
    );

    if (acknowledgementInsert.affectedRows !== 1 || !acknowledgementInsert.insertId) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({ message: "The pickup acknowledgement could not be saved. No release was recorded." });
    }

    const [updateResult] = await conn.execute(
      `UPDATE orders
       SET status = 'completed', picked_up_at = NOW(), picked_up_by = ?, updated_at = NOW()
       WHERE id = ? AND status = 'ready_for_pickup' AND picked_up_at IS NULL`,
      [req.user.id, orderId],
    );
    if (updateResult.affectedRows !== 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({ message: "This order's pickup state changed. No release was recorded." });
    }

    const [[acknowledgement]] = await conn.query(
      `SELECT
         pa.id, pa.order_id, pa.received_by_name, pa.recipient_type,
         pa.signature_data, pa.acknowledgement_text, pa.note,
         pa.acknowledged_at, pa.released_by, u.name AS released_by_name
       FROM pickup_acknowledgements pa
       LEFT JOIN users u ON u.id = pa.released_by
       WHERE pa.id = ?
       LIMIT 1`,
      [acknowledgementInsert.insertId],
    );

    const orderLabel = order.order_number || ("#" + order.id);
    if (order.customer_id) {
      await createNotificationSafe(conn, {
        userId: order.customer_id,
        type: "pickup_completed",
        title: "Pickup Completed",
        message: "Order " + orderLabel + " was handed over and your signed pickup acknowledgement was recorded.",
        targetType: "order",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    await conn.commit();
    transactionActive = false;
    req.auditRecord = {
      id: orderId,
      old: { status: order.status, picked_up_at: null },
      new: {
        status: "completed",
        fulfillment_method: "pickup",
        pickup_acknowledgement_id: acknowledgementInsert.insertId,
        recipient_type: recipientType,
        signature_recorded: true,
      },
    };

    return res.json({
      message: "Pickup confirmed and acknowledgement saved.",
      order_status: "completed",
      picked_up_at: acknowledgement?.acknowledged_at || null,
      pickup_acknowledgement: acknowledgement || null,
    });
  } catch (err) {
    req.auditRecord = null;
    if (conn && transactionActive) {
      try { await conn.rollback(); } catch {}
    }
    console.error("[pos.blueprintPayments markPickedUp]", err);
    return res.status(500).json({ message: "Failed to confirm pickup. No release was recorded." });
  } finally {
    if (conn) conn.release();
  }
};
