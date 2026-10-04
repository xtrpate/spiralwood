"use strict";

const CANCELLATION_RESOLUTION = Object.freeze({
  PRE_PRODUCTION: "pre_production_cancellation",
  POST_PRODUCTION: "post_production_withdrawal",
});

const POST_PRODUCTION_STAGES = new Set([
  "production",
  "ready_for_pickup",
  "shipping",
]);

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const classifyCancellationResolution = (orderStatus) =>
  POST_PRODUCTION_STAGES.has(normalize(orderStatus))
    ? CANCELLATION_RESOLUTION.POST_PRODUCTION
    : CANCELLATION_RESOLUTION.PRE_PRODUCTION;

const isPostProductionWithdrawal = (decision) =>
  normalize(decision?.resolution_type) ===
  CANCELLATION_RESOLUTION.POST_PRODUCTION;

const loadApprovedCancellationDecision = async (
  conn,
  orderId,
  { forUpdate = false } = {},
) => {
  const [rows] = await conn.query(
    `SELECT
       id,
       order_id,
       status,
       resolution_type,
       order_status_at_request,
       order_status_at_review,
       reviewed_at,
       requested_at
     FROM custom_cancellation_requests
     WHERE order_id = ?
       AND status = 'approved'
     ORDER BY COALESCE(reviewed_at, requested_at) DESC, id DESC
     LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [orderId],
  );

  return rows[0] || null;
};

module.exports = {
  CANCELLATION_RESOLUTION,
  POST_PRODUCTION_STAGES,
  classifyCancellationResolution,
  isPostProductionWithdrawal,
  loadApprovedCancellationDecision,
};
