const db = require("../../config/db");
const {
  resolveLifecycleByBlueprint,
} = require("../../services/blueprintLifecycleService");
const {
  assessOrderDelivery,
} = require("../../utils/oversizedDelivery");

const parsePositiveInt = (value) => {
  const text = String(value ?? "").trim();

  if (!/^[1-9][0-9]*$/.test(text)) {
    return null;
  }

  const parsed = Number(text);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
};

const parseJsonSafe = (value, fallback = {}) => {
  try {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    return typeof value === "string"
      ? JSON.parse(value)
      : value;
  } catch {
    return fallback;
  }
};

const clampPercentage = (value, fallback = 0) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, number));
};

const roundMoney = (value) =>
  Number((Number(value) || 0).toFixed(2));

const toNullableCoordinate = (
  value,
  { min, max },
) => {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) &&
    number >= min &&
    number <= max
    ? number
    : null;
};

const normalizeOrderSummary = (order = {}) => ({
  id: Number(order.id),
  order_number: String(order.order_number || "").trim() || null,
  blueprint_id: Number(order.blueprint_id || 0) || null,
  status: String(order.status || "").trim() || null,
  delivery_address:
    String(
      order.delivery_address ||
        order.customer_address ||
        order.address ||
        "",
    ).trim() || null,
  delivery_lat: toNullableCoordinate(
    order.delivery_lat ??
      order.address_lat ??
      order.latitude,
    { min: -90, max: 90 },
  ),
  delivery_lng: toNullableCoordinate(
    order.delivery_lng ??
      order.address_lng ??
      order.longitude,
    { min: -180, max: 180 },
  ),
});

const normalizeDecisionFromMeta = (
  meta = {},
  assessment = null,
) => {
  const decision = String(
    meta.oversized_delivery_decision || "",
  )
    .trim()
    .toLowerCase();

  return {
    decision:
      decision ||
      (assessment?.status === "standard"
        ? "not_required"
        : "pending"),
    additional_delivery_fee: roundMoney(
      meta.additional_delivery_fee || 0,
    ),
    reason:
      String(
        meta.oversized_delivery_reason || "",
      ).trim() || "",
    truck_type:
      String(
        meta.oversized_truck_type || "",
      ).trim() || "",
    decided_by:
      Number(meta.oversized_delivery_decided_by || 0) || null,
    decided_at:
      String(
        meta.oversized_delivery_decided_at || "",
      ).trim() || null,
  };
};

const loadOrderDeliverySummary = async (
  conn,
  orderId,
) => {
  const [rows] = await conn.query(
    `SELECT
       id,
       order_number,
       blueprint_id,
       status,
       order_type,
       delivery_address,
       delivery_lat,
       delivery_lng
     FROM orders
     WHERE id = ?
     LIMIT 1`,
    [Number(orderId)],
  );

  return rows[0] || null;
};

const loadLatestEstimation = async (
  conn,
  blueprintId,
  { forUpdate = false } = {},
) => {
  const lockClause = forUpdate ? " FOR UPDATE" : "";

  const [rows] = await conn.query(
    `SELECT
       id,
       blueprint_id,
       version,
       material_cost,
       labor_cost,
       tax,
       discount,
       grand_total,
       estimation_data,
       status,
       created_at,
       updated_at
     FROM estimations
     WHERE blueprint_id = ?
     ORDER BY version DESC, id DESC
     LIMIT 1${lockClause}`,
    [blueprintId],
  );

  return rows[0] || null;
};

const buildEstimationSummary = (
  estimation,
  assessment = null,
) => {
  if (!estimation) {
    return null;
  }

  const meta =
    parseJsonSafe(estimation.estimation_data, {}) || {};

  return {
    id: Number(estimation.id),
    blueprint_id: Number(estimation.blueprint_id),
    version: Number(estimation.version || 1),
    status: String(estimation.status || "").trim() || null,
    decision: normalizeDecisionFromMeta(meta, assessment),
  };
};

const resolveBlueprintContext = async (
  conn,
  blueprintId,
) => {
  const lifecycle = await resolveLifecycleByBlueprint(conn, {
    blueprintId,
  });

  if (lifecycle.status === "BLOCKED") {
    const error = new Error(
      lifecycle.message ||
        "The blueprint lifecycle could not be resolved safely.",
    );

    error.statusCode = 409;
    error.lifecycleReason = lifecycle.reason || null;
    error.integrityWarning = true;
    throw error;
  }

  if (!lifecycle.order) {
    const error = new Error(
      "No customer order is currently linked to this blueprint.",
    );

    error.statusCode = 404;
    error.lifecycleReason = lifecycle.reason || null;
    throw error;
  }

  const fullOrder = await loadOrderDeliverySummary(
    conn,
    lifecycle.order.id,
  );

  const assessment = await assessOrderDelivery(
    conn,
    lifecycle.order.id,
  );

  return {
    lifecycle: {
      ...lifecycle,
      order: fullOrder || lifecycle.order,
    },
    assessment,
  };
};

exports.getByBlueprint = async (req, res) => {
  const blueprintId = parsePositiveInt(req.params.blueprintId);

  if (!blueprintId) {
    return res.status(400).json({
      message: "A valid blueprint ID is required.",
    });
  }

  let conn;

  try {
    conn = await db.getConnection();

    const {
      lifecycle,
      assessment,
    } = await resolveBlueprintContext(conn, blueprintId);

    const estimation = await loadLatestEstimation(
      conn,
      blueprintId,
    );

    return res.json({
      blueprint_id: blueprintId,
      order: normalizeOrderSummary(lifecycle.order),
      assessment,
      estimation: buildEstimationSummary(
        estimation,
        assessment,
      ),
    });
  } catch (error) {
    const isExpectedNoLinkedOrder =
      Number(error?.statusCode || 0) === 404 &&
      String(error?.message || "").trim() ===
        "No customer order is currently linked to this blueprint.";

    if (!isExpectedNoLinkedOrder) {
      console.error(
        "[admin oversized delivery GET BY BLUEPRINT]",
        error,
      );
    }

    return res.status(error.statusCode || 500).json({
      message:
        error.statusCode
          ? error.message
          : "Unable to assess the blueprint delivery size.",
      lifecycle_reason: error.lifecycleReason || null,
      integrity_warning:
        Boolean(error.integrityWarning) || undefined,
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.getByOrder = async (req, res) => {
  const orderId = parsePositiveInt(req.params.orderId);

  if (!orderId) {
    return res.status(400).json({
      message: "A valid order ID is required.",
    });
  }

  let conn;

  try {
    conn = await db.getConnection();

    const order = await loadOrderDeliverySummary(
      conn,
      orderId,
    );

    if (!order) {
      return res.status(404).json({
        message: "Order not found.",
      });
    }

    const normalizedOrderType = String(
      order.order_type || "",
    )
      .trim()
      .toLowerCase();

    if (normalizedOrderType !== "blueprint") {
      return res.status(400).json({
        message:
          "Oversized furniture assessment is only available for blueprint/custom orders.",
      });
    }

    const blueprintId =
      Number(order.blueprint_id || 0) || null;

    const assessment = await assessOrderDelivery(conn, orderId);

    const estimation = blueprintId
      ? await loadLatestEstimation(conn, blueprintId)
      : null;

    return res.json({
      order: normalizeOrderSummary(order),
      assessment,
      estimation: buildEstimationSummary(
        estimation,
        assessment,
      ),
    });
  } catch (error) {
    console.error(
      "[admin oversized delivery GET BY ORDER]",
      error,
    );

    return res.status(500).json({
      message: "Unable to assess the order delivery size.",
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.saveDecisionByBlueprint = async (req, res) => {
  const blueprintId = parsePositiveInt(req.params.blueprintId);

  if (!blueprintId) {
    return res.status(400).json({
      message: "A valid blueprint ID is required.",
    });
  }

  const requestedDecision = String(
    req.body?.decision || "",
  )
    .trim()
    .toLowerCase();

  const requestedFee = Number(
    req.body?.additional_delivery_fee,
  );

  const reason = String(
    req.body?.reason || "",
  ).trim();

  const truckType = String(
    req.body?.truck_type || "",
  ).trim();

  if (
    ![
      "fee_required",
      "no_additional_fee",
    ].includes(requestedDecision)
  ) {
    return res.status(400).json({
      message:
        "Choose either an additional larger-truck fee or no additional fee required.",
    });
  }

  if (reason.length > 500) {
    return res.status(400).json({
      message:
        "The delivery assessment reason must not exceed 500 characters.",
    });
  }

  if (truckType.length > 100) {
    return res.status(400).json({
      message:
        "The truck type must not exceed 100 characters.",
    });
  }

  if (!reason) {
    return res.status(400).json({
      message:
        "Assessment notes are required for the oversized-delivery decision.",
    });
  }

  /* WISDOM INPUT VALIDATION BATCH 2 V1.0.0
     Additional delivery fee is currency: zero is valid, negatives are not. */
  if (
    requestedDecision === "fee_required" &&
    (
      !Number.isFinite(requestedFee) ||
      requestedFee < 0 ||
      requestedFee > 1000000
    )
  ) {
    return res.status(400).json({
      message:
        "Enter a valid additional delivery fee of 0 or more.",
    });
  }

  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const {
      lifecycle,
      assessment,
    } = await resolveBlueprintContext(conn, blueprintId);

    if (
      assessment.status === "not_configured" ||
      assessment.status === "manual_review"
    ) {
      await conn.rollback();

      return res.status(409).json({
        message:
          "Complete the standard-truck limits and saved furniture dimensions before making the delivery decision.",
        integrity_reason:
          "DELIVERY_ASSESSMENT_INCOMPLETE",
        assessment,
      });
    }

    if (assessment.status !== "oversized") {
      await conn.rollback();

      return res.status(409).json({
        message:
          "This design is within the configured standard-truck limits, so no oversized-delivery fee decision is required.",
        integrity_reason:
          "DELIVERY_ASSESSMENT_NOT_OVERSIZED",
        assessment,
      });
    }

    const estimation = await loadLatestEstimation(
      conn,
      blueprintId,
      { forUpdate: true },
    );

    if (!estimation) {
      await conn.rollback();

      return res.status(409).json({
        message:
          "Save the estimation draft first before recording the oversized-delivery decision.",
        integrity_reason:
          "ESTIMATION_DRAFT_REQUIRED",
      });
    }

    const estimationStatus = String(
      estimation.status || "",
    )
      .trim()
      .toLowerCase();

    if (estimationStatus !== "draft") {
      await conn.rollback();

      return res.status(409).json({
        message:
          "The quotation has already been sent or finalized and can no longer be changed.",
        integrity_reason:
          "ESTIMATION_NOT_EDITABLE",
      });
    }

    const meta =
      parseJsonSafe(
        estimation.estimation_data,
        {},
      ) || {};

    const additionalDeliveryFee =
      requestedDecision === "fee_required"
        ? roundMoney(requestedFee)
        : 0;

    const materialCost =
      roundMoney(estimation.material_cost);

    const laborCost =
      roundMoney(estimation.labor_cost);

    const overheadCost =
      roundMoney(meta.overhead_cost || 0);

    const taxRate = clampPercentage(
      meta.tax_rate,
      12,
    );

    const discountRate = clampPercentage(
      meta.discount_rate ??
        meta.discount ??
        0,
      0,
    );

    const subtotal = roundMoney(
      materialCost +
        laborCost +
        overheadCost +
        additionalDeliveryFee,
    );

    const discountAmount = roundMoney(
      subtotal * (discountRate / 100),
    );

    const afterDiscount = Math.max(
      0,
      subtotal - discountAmount,
    );

    const taxAmount = roundMoney(
      afterDiscount * (taxRate / 100),
    );

    const grandTotal = roundMoney(
      afterDiscount + taxAmount,
    );

    const decidedBy =
      Number(
        req.user?.id ||
          req.user?.user_id ||
          0,
      ) || null;

    const decidedAt = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const updatedMeta = {
      ...meta,
      additional_delivery_fee:
        additionalDeliveryFee,
      oversized_delivery_decision:
        requestedDecision,
      oversized_delivery_reason:
        reason,
      oversized_truck_type:
        truckType,
      oversized_delivery_decided_by:
        decidedBy,
      oversized_delivery_decided_at:
        decidedAt,
      delivery_requirement:
        assessment,
      material_cost:
        materialCost,
      labor_cost:
        laborCost,
      overhead_cost:
        overheadCost,
      subtotal,
      tax_rate:
        taxRate,
      discount_mode:
        "percentage",
      discount:
        discountRate,
      discount_rate:
        discountRate,
      discount_amount:
        discountAmount,
      tax_amount:
        taxAmount,
      grand_total:
        grandTotal,
    };

    const [estimationUpdate] = await conn.query(
      `UPDATE estimations
       SET tax = ?,
           discount = ?,
           grand_total = ?,
           estimation_data = ?,
           updated_at = NOW()
       WHERE id = ?
         AND blueprint_id = ?
         AND status = 'draft'`,
      [
        taxAmount,
        discountAmount,
        grandTotal,
        JSON.stringify(updatedMeta),
        estimation.id,
        blueprintId,
      ],
    );

    if (estimationUpdate.affectedRows !== 1) {
      await conn.rollback();

      return res.status(409).json({
        message:
          "The estimation changed before the delivery decision could be saved. Refresh and try again.",
        integrity_reason:
          "ESTIMATION_STATE_CHANGED",
      });
    }

    const order = lifecycle.order;

    const [orderUpdate] = await conn.query(
      `UPDATE orders
       SET subtotal = ?,
           tax = ?,
           discount = ?,
           total = ?,
           down_payment = ?,
           updated_at = NOW()
       WHERE id = ?
         AND order_type = 'blueprint'
         AND status = 'confirmed'`,
      [
        subtotal,
        taxAmount,
        discountAmount,
        grandTotal,
        roundMoney(grandTotal * 0.3),
        order.id,
      ],
    );

    if (orderUpdate.affectedRows !== 1) {
      await conn.rollback();

      return res.status(409).json({
        message:
          "The linked order changed before the delivery decision could be saved. Refresh and try again.",
        integrity_reason:
          "ORDER_STATE_CHANGED",
      });
    }

    await conn.commit();

    return res.json({
      message:
        requestedDecision === "fee_required"
          ? "Additional larger-truck delivery fee saved."
          : "No additional delivery fee decision saved.",
      blueprint_id: blueprintId,
      order: normalizeOrderSummary(order),
      assessment,
      estimation: {
        id: Number(estimation.id),
        version: Number(estimation.version || 1),
        status: "draft",
        material_cost: materialCost,
        labor_cost: laborCost,
        overhead_cost: overheadCost,
        additional_delivery_fee:
          additionalDeliveryFee,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount: discountRate,
        discount_amount: discountAmount,
        grand_total: grandTotal,
        decision: normalizeDecisionFromMeta(
          updatedMeta,
          assessment,
        ),
      },
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error(
      "[admin oversized delivery SAVE DECISION]",
      error,
    );

    return res.status(error.statusCode || 500).json({
      message:
        error.statusCode
          ? error.message
          : "Unable to save the oversized-delivery decision.",
      lifecycle_reason:
        error.lifecycleReason || null,
      integrity_warning:
        Boolean(error.integrityWarning) || undefined,
    });
  } finally {
    if (conn) conn.release();
  }
};
