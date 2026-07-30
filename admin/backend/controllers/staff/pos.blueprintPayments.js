const pool = require("../../config/db");
const {
  getRestrictedPaymentSummary,
  recordCashPayment,
} = require("../../services/blueprintCashPaymentService");
const { parseStrictPositiveInt } = require("../../utils/validators");

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

exports.lookupByOrderNumber = async (req, res) => {
  const rawOrderNumber = req.query.order_number;

  if (!isValidOrderNumber(rawOrderNumber)) {
    return res.status(400).json({ message: "Enter a valid order number." });
  }

  const orderNumber = rawOrderNumber.trim();

  try {
    const [[row]] = await pool.query(
      `SELECT id FROM orders WHERE order_number = ? LIMIT 1`,
      [orderNumber],
    );

    if (!row) {
      return res.status(404).json({ message: "Order not found." });
    }

    const summary = await getRestrictedPaymentSummary(pool, row.id);
    return res.json(summary);
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