const db = require("../../config/db");
const {
  resolveLifecycleByOrder,
} = require("../../services/blueprintLifecycleService");
const {
  assessOrderDelivery,
} = require("../../utils/oversizedDelivery");
const { parseStrictPositiveInt } = require("../../utils/validators");

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const parseJsonSafe = (value, fallback = {}) => {
  try {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Customer-facing read endpoint for the authoritative delivery-size assessment.
 *
 * Important:
 * - Customer ownership is checked before any assessment is returned.
 * - Dimensions are recalculated from the saved order-item customization data.
 * - Browser-supplied oversized flags are never trusted.
 * - Quotation delivery-fee details are exposed only after the quotation is sent
 *   or approved, so draft admin decisions are not shown prematurely.
 */
exports.getOrderDeliveryAssessment = async (req, res) => {
  const orderId = parseStrictPositiveInt(req.params.id);

  if (!orderId) {
    return res.status(400).json({
      message: "Invalid custom request ID.",
    });
  }

  let conn;

  try {
    conn = await db.getConnection();

    const [orders] = await conn.execute(
      `SELECT
         id,
         order_number,
         customer_id,
         order_type
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1`,
      [orderId, req.user.id],
    );

    if (!orders.length) {
      return res.status(404).json({
        message: "Custom request not found.",
      });
    }

    const order = orders[0];
    const assessment = await assessOrderDelivery(conn, order.id);

    if (assessment.status === "not_applicable") {
      return res.json({
        order_id: order.id,
        order_number: order.order_number,
        fulfillment_method: "pickup",
        assessment,
        quotation_delivery: null,
      });
    }

    const lifecycle = await resolveLifecycleByOrder(conn, {
      orderId: order.id,
    });

    let quotationDelivery = null;

    if (
      lifecycle.status === "OK" &&
      lifecycle.estimation &&
      ["sent", "approved"].includes(normalize(lifecycle.estimation.status))
    ) {
      const estimationData =
        parseJsonSafe(lifecycle.estimation.estimation_data, {}) || {};

      const decision = normalize(
        estimationData.oversized_delivery_decision,
      );

      quotationDelivery = {
        decision:
          decision ||
          (assessment.status === "standard"
            ? "not_required"
            : "pending"),
        additional_delivery_fee: Math.max(
          0,
          Number(estimationData.additional_delivery_fee || 0),
        ),
        reason: String(
          estimationData.oversized_delivery_reason || "",
        ).trim(),
        truck_type: String(
          estimationData.oversized_truck_type || "",
        ).trim(),
      };
    }

    return res.json({
      order_id: order.id,
      order_number: order.order_number,
      assessment,
      quotation_delivery: quotationDelivery,
    });
  } catch (error) {
    console.error(
      "[customer.deliveryAssessment GET ORDER ASSESSMENT]",
      error,
    );

    return res.status(500).json({
      message: "Unable to load the delivery-size assessment.",
    });
  } finally {
    if (conn) conn.release();
  }
};
