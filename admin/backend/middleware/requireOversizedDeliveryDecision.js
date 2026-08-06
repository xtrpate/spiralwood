const db = require("../config/db");
const {
  resolveLifecycleByBlueprint,
} = require("../services/blueprintLifecycleService");
const {
  assessOrderDelivery,
} = require("../utils/oversizedDelivery");

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

const normalizeDecision = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const hasAssessmentNote = (meta = {}) =>
  Boolean(
    String(meta.oversized_delivery_reason || "").trim() ||
      String(meta.oversized_truck_type || "").trim(),
  );

module.exports = async function requireOversizedDeliveryDecision(
  req,
  res,
  next,
) {
  const blueprintId = parsePositiveInt(req.params.id);

  if (!blueprintId) {
    return res.status(400).json({
      message: "A valid blueprint ID is required.",
    });
  }

  let conn;

  try {
    conn = await db.getConnection();

    const lifecycle = await resolveLifecycleByBlueprint(conn, {
      blueprintId,
    });

    if (lifecycle.status === "BLOCKED") {
      return res.status(409).json({
        message:
          lifecycle.message ||
          "The blueprint lifecycle could not be resolved safely.",
        integrity_reason:
          lifecycle.reason || "BLUEPRINT_LIFECYCLE_BLOCKED",
        conflicting_order_ids:
          lifecycle.conflicting_order_ids || [],
      });
    }

    // Leave ordinary not-found/state validation to the existing
    // blueprintController.approveEstimation handler.
    if (!lifecycle.order || !lifecycle.estimation) {
      return next();
    }

    const assessment = await assessOrderDelivery(
      conn,
      lifecycle.order.id,
    );

    req.oversizedDeliveryAssessment = assessment;

    if (assessment.status === "standard") {
      return next();
    }

    if (
      assessment.status === "not_configured" ||
      assessment.status === "manual_review"
    ) {
      return res.status(409).json({
        message:
          "Complete the standard-truck limits and saved furniture dimensions before sending the quotation.",
        integrity_reason:
          "DELIVERY_ASSESSMENT_INCOMPLETE",
        assessment,
      });
    }

    if (assessment.status !== "oversized") {
      return next();
    }

    const meta =
      parseJsonSafe(
        lifecycle.estimation.estimation_data,
        {},
      ) || {};

    const decision = normalizeDecision(
      meta.oversized_delivery_decision,
    );

    const additionalDeliveryFee = Number(
      meta.additional_delivery_fee || 0,
    );

    const hasNote = hasAssessmentNote(meta);

    const hasValidFeeDecision =
      decision === "fee_required" &&
      Number.isFinite(additionalDeliveryFee) &&
      additionalDeliveryFee > 0 &&
      hasNote;

    const hasValidNoFeeDecision =
      decision === "no_additional_fee" &&
      Number.isFinite(additionalDeliveryFee) &&
      additionalDeliveryFee === 0 &&
      hasNote;

    if (
      !hasValidFeeDecision &&
      !hasValidNoFeeDecision
    ) {
      return res.status(409).json({
        message:
          "Complete the oversized-delivery fee decision before sending the quotation. Enter an additional fee with a reason/truck type, or mark No additional fee required with an assessment note.",
        integrity_reason:
          "OVERSIZED_DELIVERY_DECISION_PENDING",
        assessment,
        oversized_delivery_decision:
          decision || "pending",
      });
    }

    return next();
  } catch (error) {
    console.error(
      "[requireOversizedDeliveryDecision]",
      error,
    );

    return res.status(error.statusCode || 500).json({
      message:
        error.statusCode
          ? error.message
          : "Unable to validate the oversized-delivery decision.",
      integrity_reason:
        error.lifecycleReason || undefined,
    });
  } finally {
    if (conn) conn.release();
  }
};
