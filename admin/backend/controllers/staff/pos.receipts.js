// controllers/staff/pos.receipts_reports.js (or similar)
const db = require("../../config/db");
const { parseStrictPositiveInt } = require("../../utils/validators");
const {
  parseDecimalToCentsStrict,
  centsToAmount,
} = require("../../utils/paymentAmounts");

// Business/site settings now live in website_content (content_type='setting'),
// replacing the removed website_settings table. These are the safe fallbacks
// used when an optional content_key row does not exist yet.
const DEFAULT_THANK_YOU_MESSAGE = "Thank you for your purchase!";

const isCashierRequest = (req) =>
  req.user?.role === "staff" && req.user?.staff_type === "cashier";

const RECEIPT_DATA_ERROR_MESSAGE =
  "Receipt data is inconsistent and cannot be displayed safely.";

const hasStoredValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const parseStoredPositiveInt = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  const parsed = Number(str);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const validatePosReceiptItem = (item) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  if (typeof item.product_name !== "string") return false;

  const productName = item.product_name.trim();
  const quantity = parseStoredPositiveInt(item.quantity);
  const unitPriceCents = parseDecimalToCentsStrict(item.unit_price);

  if (
    productName.length === 0 ||
    productName.length > 500 ||
    quantity === null ||
    unitPriceCents === null
  ) {
    return false;
  }

  if (
    hasStoredValue(item.product_id) &&
    parseStoredPositiveInt(item.product_id) === null
  ) {
    return false;
  }

  for (const field of ["variation_name", "wood_type"]) {
    if (
      item[field] !== undefined &&
      item[field] !== null &&
      typeof item[field] !== "string"
    ) {
      return false;
    }
  }

  for (const field of ["subtotal", "production_cost"]) {
    if (
      hasStoredValue(item[field]) &&
      parseDecimalToCentsStrict(item[field]) === null
    ) {
      return false;
    }
  }

  return true;
};

const parsePosReceiptItems = (receipt) => {
  try {
    const parsed = JSON.parse(receipt.items_snapshot);
    return Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(validatePosReceiptItem)
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const BLUEPRINT_PAYMENT_LABELS = new Set([
  "down_payment",
  "partial_payment",
  "balance_payment",
  "full_payment",
]);
const POS_PAYMENT_LABELS = new Set([
  "partial_payment",
  "balance_payment",
  "full_payment",
]);

const isPaymentLabelConsistent = ({
  paymentLabel,
  previousPaidCents,
  amountPaidCents,
  totalPaidAfterCents,
  remainingBalanceCents,
  orderTotalCents,
}) => {
  if (amountPaidCents <= 0 || orderTotalCents <= 0) return false;

  switch (paymentLabel) {
    case "full_payment":
      return (
        previousPaidCents === 0 &&
        totalPaidAfterCents === orderTotalCents &&
        remainingBalanceCents === 0
      );
    case "balance_payment":
      return (
        previousPaidCents > 0 &&
        totalPaidAfterCents === orderTotalCents &&
        remainingBalanceCents === 0
      );
    case "down_payment":
    case "partial_payment":
      return (
        totalPaidAfterCents < orderTotalCents &&
        remainingBalanceCents > 0
      );
    default:
      return false;
  }
};

const parseBlueprintReceiptSnapshot = (receipt) => {
  try {
    const parsed = JSON.parse(receipt.items_snapshot || "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    if (parsed.order_type !== "blueprint") return null;
    if (typeof parsed.order_number !== "string") return null;
    if (
      parsed.blueprint_title !== undefined &&
      parsed.blueprint_title !== null &&
      typeof parsed.blueprint_title !== "string"
    ) {
      return null;
    }
    if (
      parsed.payment_label !== undefined &&
      parsed.payment_label !== null &&
      typeof parsed.payment_label !== "string"
    ) {
      return null;
    }

    const orderNumber = parsed.order_number.trim();
    const blueprintTitle = String(parsed.blueprint_title || "").trim();
    const paymentLabel = String(parsed.payment_label || "")
      .trim()
      .toLowerCase();

    if (!orderNumber || orderNumber.length > 150) return null;
    if (blueprintTitle.length > 500) return null;
    if (paymentLabel && !BLUEPRINT_PAYMENT_LABELS.has(paymentLabel)) {
      return null;
    }

    return {
      order_type: "blueprint",
      order_number: orderNumber,
      blueprint_title: blueprintTitle || null,
      payment_label: paymentLabel || null,
    };
  } catch {
    return null;
  }
};

const buildBlueprintReceiptPaymentSummary = (receipt, snapshot) => {
  const paymentLabel = String(receipt.payment_label || "")
    .trim()
    .toLowerCase();

  if (!BLUEPRINT_PAYMENT_LABELS.has(paymentLabel)) return null;
  if (snapshot?.payment_label && snapshot.payment_label !== paymentLabel) {
    return null;
  }

  const totalCents = parseDecimalToCentsStrict(receipt.total_amount);
  const previousPaidCents = parseDecimalToCentsStrict(
    receipt.previous_paid_amount,
  );
  const amountPaidCents = parseDecimalToCentsStrict(receipt.amount_paid);
  const totalPaidAfterCents = parseDecimalToCentsStrict(
    receipt.total_paid_after,
  );
  const remainingBalanceCents = parseDecimalToCentsStrict(
    receipt.remaining_balance_after,
  );

  if (
    totalCents === null ||
    previousPaidCents === null ||
    amountPaidCents === null ||
    totalPaidAfterCents === null ||
    remainingBalanceCents === null ||
    totalCents <= 0 ||
    amountPaidCents <= 0
  ) {
    return null;
  }

  if (previousPaidCents + amountPaidCents !== totalPaidAfterCents) {
    return null;
  }

  if (totalPaidAfterCents + remainingBalanceCents !== totalCents) {
    return null;
  }

  if (
    !isPaymentLabelConsistent({
      paymentLabel,
      previousPaidCents,
      amountPaidCents,
      totalPaidAfterCents,
      remainingBalanceCents,
      orderTotalCents: totalCents,
    })
  ) {
    return null;
  }

  const isFullyPaid = remainingBalanceCents === 0;

  return {
    payment_label: paymentLabel,
    order_total: centsToAmount(totalCents),
    previous_paid: centsToAmount(previousPaidCents),
    payment_received: centsToAmount(amountPaidCents),
    total_paid_after: centsToAmount(totalPaidAfterCents),
    remaining_balance: centsToAmount(remainingBalanceCents),
    status: isFullyPaid ? "Fully Paid" : "Partially Paid",
    is_fully_paid: isFullyPaid,
  };
};

const buildPosReceiptPaymentSummary = (receipt) => {
  const orderTotalCents = parseDecimalToCentsStrict(receipt.total_amount);
  if (orderTotalCents === null) return null;

  const progressFields = [
    receipt.previous_paid_amount,
    receipt.amount_paid,
    receipt.total_paid_after,
    receipt.remaining_balance_after,
  ];
  const hasPaymentProgressSnapshot =
    hasStoredValue(receipt.payment_label) ||
    progressFields.some(hasStoredValue);

  // Legacy POS receipts predate payment-progress snapshot columns. Those
  // receipts represent a completed POS sale, so the immutable receipt total
  // is also the amount paid and the remaining balance is zero.
  if (!hasPaymentProgressSnapshot) {
    return {
      order_total: centsToAmount(orderTotalCents),
      previous_paid: 0,
      payment_received: centsToAmount(orderTotalCents),
      total_paid_after: centsToAmount(orderTotalCents),
      remaining_balance: 0,
      status: "Fully Paid",
      is_fully_paid: true,
      has_payment_progress: false,
    };
  }

  if (!progressFields.every(hasStoredValue)) return null;

  const paymentLabel = String(receipt.payment_label || "")
    .trim()
    .toLowerCase();
  if (!POS_PAYMENT_LABELS.has(paymentLabel)) return null;

  const previousPaidCents = parseDecimalToCentsStrict(
    receipt.previous_paid_amount,
  );
  const amountPaidCents = parseDecimalToCentsStrict(receipt.amount_paid);
  const totalPaidAfterCents = parseDecimalToCentsStrict(
    receipt.total_paid_after,
  );
  const remainingBalanceCents = parseDecimalToCentsStrict(
    receipt.remaining_balance_after,
  );

  if (
    previousPaidCents === null ||
    amountPaidCents === null ||
    totalPaidAfterCents === null ||
    remainingBalanceCents === null
  ) {
    return null;
  }

  if (previousPaidCents + amountPaidCents !== totalPaidAfterCents) {
    return null;
  }

  if (totalPaidAfterCents + remainingBalanceCents !== orderTotalCents) {
    return null;
  }

  if (
    !isPaymentLabelConsistent({
      paymentLabel,
      previousPaidCents,
      amountPaidCents,
      totalPaidAfterCents,
      remainingBalanceCents,
      orderTotalCents,
    })
  ) {
    return null;
  }

  const isFullyPaid = remainingBalanceCents === 0;

  return {
    order_total: centsToAmount(orderTotalCents),
    previous_paid: centsToAmount(previousPaidCents),
    payment_received: centsToAmount(amountPaidCents),
    total_paid_after: centsToAmount(totalPaidAfterCents),
    remaining_balance: centsToAmount(remainingBalanceCents),
    status: isFullyPaid ? "Fully Paid" : "Partially Paid",
    is_fully_paid: isFullyPaid,
    has_payment_progress: true,
  };
};

const preparePosReceiptForResponse = (rawReceipt) => {
  const items = parsePosReceiptItems(rawReceipt);
  const paymentSummary = buildPosReceiptPaymentSummary(rawReceipt);

  if (!items || !paymentSummary) return null;

  const snapshotPaymentMethod = String(
    rawReceipt.payment_method_snapshot || "",
  )
    .trim()
    .toLowerCase();
  const hasCashSnapshot =
    hasStoredValue(rawReceipt.cash_received) ||
    hasStoredValue(rawReceipt.change_amount);
  const hasProviderSnapshot = hasStoredValue(rawReceipt.provider_reference);

  let paymentMethod = snapshotPaymentMethod;
  if (!paymentMethod && hasCashSnapshot) {
    paymentMethod = "cash";
  } else if (!paymentMethod && hasProviderSnapshot) {
    paymentMethod = "paymongo";
  }
  const customerDisplay =
    String(rawReceipt.issued_to || "").trim() || "Customer";
  const processorDisplay =
    paymentMethod === "paymongo"
      ? "Online Payment"
      : String(rawReceipt.staff_name || "").trim() || "Staff";

  return {
    ...rawReceipt,
    items,
    payment_method: paymentMethod,
    customer_display: customerDisplay,
    processor_display: processorDisplay,
    payment_summary: paymentSummary,
  };
};

/* ── Get Receipt by ID ── */
exports.getReceiptById = async (req, res) => {
  const cashierOwnOnly = isCashierRequest(req);
  const receiptId = parseStrictPositiveInt(req.params.id);

  if (!receiptId) {
    return res.status(400).json({ message: "Invalid receipt id." });
  }

  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [rows] = await db.query(
      `
      SELECT
        r.*,
        DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
        DATE_FORMAT(r.printed_at, '%Y-%m-%dT%H:%i:%s.000Z') AS printed_at,
        o.order_number,
        o.walkin_customer_name,
        o.walkin_customer_phone,
        o.payment_method,
        o.subtotal,
        o.tax,
        o.discount,
        o.delivery_fee,
        o.total,
        o.notes,
        u.name AS staff_name
      FROM receipts r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN users u ON u.id = r.issued_by
      WHERE r.id = ?
        AND r.receipt_type = 'pos_sale'
        ${cashierOwnOnly ? "AND r.issued_by = ?" : ""}
      LIMIT 1
      `,
      [receiptId, ...(cashierOwnOnly ? [req.user.id] : [])],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const receipt = preparePosReceiptForResponse(rows[0]);

    if (!receipt) {
      console.error(
        "GET /api/pos/receipts/:id integrity error: invalid receipt snapshot.",
      );
      return res.status(500).json({ message: RECEIPT_DATA_ERROR_MESSAGE });
    }

    // IMPORTANT FIX:
    // website_settings was merged into website_content; settings now live
    // as rows where content_type = 'setting', keyed by content_key/content.
    const [settings] = await db.query(
      `
      SELECT content_key, content
      FROM website_content
      WHERE content_type = 'setting'
        AND is_visible = 1
        AND content_key IN (
          'site_name',
          'site_logo',
          'business_address',
          'business_phone',
          'gcash_number',
          'warranty_period_days',
          'thank_you_message',
          'return_policy_note'
        )
      `,
      [],
    );

    const biz = {};
    settings.forEach((s) => {
      biz[s.content_key] = s.content;
    });

    const parsedWarrantyDays = parseInt(biz.warranty_period_days, 10);

    biz.business_name = biz.site_name || "Spiral Wood Services";
    biz.site_logo = biz.site_logo || null;
    biz.gcash_number = biz.gcash_number || null;
    biz.warranty_period_days =
      Number.isInteger(parsedWarrantyDays) && parsedWarrantyDays > 0
        ? parsedWarrantyDays
        : null;
    biz.thank_you_message = biz.thank_you_message || DEFAULT_THANK_YOU_MESSAGE;
    biz.return_policy_note = biz.return_policy_note || null;

    receipt.business = biz;

    return res.json(receipt);
  } catch (err) {
    console.error("GET /api/pos/receipts/:id error:", err);
    return res.status(500).json({ message: "Failed to load receipt." });
  }
};

/* ── Get Receipt by Order ID ── */
exports.getReceiptByOrderId = async (req, res) => {
  const cashierOwnOnly = isCashierRequest(req);
  const orderId = parseStrictPositiveInt(req.query.order_id);

  if (!orderId) {
    return res.status(400).json({ message: "A valid order_id is required." });
  }

  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [rows] = await db.query(
      `
      SELECT
        r.*,
        DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
        DATE_FORMAT(r.printed_at, '%Y-%m-%dT%H:%i:%s.000Z') AS printed_at,
        o.order_number,
        o.walkin_customer_name,
        o.walkin_customer_phone,
        o.payment_method,
        o.subtotal,
        o.tax,
        o.discount,
        o.delivery_fee,
        o.total,
        o.notes,
        u.name AS staff_name
      FROM receipts r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN users u ON u.id = r.issued_by
      WHERE r.order_id = ?
        AND r.receipt_type = 'pos_sale'
        ${cashierOwnOnly ? "AND r.issued_by = ?" : ""}
      ORDER BY r.id DESC
      LIMIT 1
      `,
      [orderId, ...(cashierOwnOnly ? [req.user.id] : [])],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const receipt = preparePosReceiptForResponse(rows[0]);

    if (!receipt) {
      console.error(
        "GET /api/pos/receipts?order_id= integrity error: invalid receipt snapshot.",
      );
      return res.status(500).json({ message: RECEIPT_DATA_ERROR_MESSAGE });
    }

    return res.json(receipt);
  } catch (err) {
    console.error("GET /api/pos/receipts?order_id= error:", err);
    return res.status(500).json({ message: "Failed to load receipt." });
  }
};

/* ── Get Blueprint Payment Receipt by ID (staff/cashier/admin only) ──
   Deliberately separate from getReceiptById above: a blueprint payment
   receipt has a completely different shape (payment progress, not a
   product cart) and must never be reachable through the POS receipt
   endpoint. Always selects by the exact receipt id -- never "the latest
   receipt for this order", since one blueprint order can now have many
   receipts. ── */
exports.getBlueprintReceiptById = async (req, res) => {
  try {
    const id = parseStrictPositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid receipt id." });
    }

    const [rows] = await db.query(
      `
      SELECT
        r.id,
        r.order_id,
        r.payment_transaction_id,
        r.receipt_type,
        r.payment_method_snapshot,
        r.payment_label,
        r.previous_paid_amount,
        r.amount_paid,
        r.total_paid_after,
        r.remaining_balance_after,
        r.provider_reference,
        r.receipt_number,
        r.issued_to,
        r.total_amount,
        r.items_snapshot,
        r.printed_at,
        r.created_at,
        o.order_number,
        o.order_type,
        u.name AS processor_name
      FROM receipts r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN users u ON u.id = r.issued_by
      WHERE r.id = ?
        AND r.receipt_type = 'blueprint_payment'
      LIMIT 1
      `,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const receipt = rows[0];

    // Defense in depth: receipt_type already guarantees this, but never
    // trust a single condition alone for something this sensitive.
    if (String(receipt.order_type || "").trim().toLowerCase() !== "blueprint") {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const snapshot = parseBlueprintReceiptSnapshot(receipt);
    const paymentSummary = snapshot
      ? buildBlueprintReceiptPaymentSummary(receipt, snapshot)
      : null;

    if (!snapshot || !paymentSummary) {
      console.error(
        "GET /api/pos/blueprint-receipts/:id integrity error: invalid receipt snapshot.",
      );
      return res.status(500).json({ message: RECEIPT_DATA_ERROR_MESSAGE });
    }

    // Processor display: PayMongo payments are always shown as processed
    // by PayMongo / Online Payment, never as the customer who happened to
    // trigger the verification call (issued_by is a technical FK owner
    // for that path, not a real staff processor). Raw issued_by is never
    // returned to the client either way.
    const paymentMethod = String(receipt.payment_method_snapshot || "")
      .trim()
      .toLowerCase();
    const processorDisplay =
      paymentMethod === "paymongo"
        ? "PayMongo / Online Payment"
        : receipt.processor_name || "Staff";

    const [settings] = await db.query(
      `
      SELECT content_key, content
      FROM website_content
      WHERE content_type = 'setting'
        AND is_visible = 1
        AND content_key IN (
          'site_name',
          'site_logo',
          'business_address',
          'business_phone',
          'thank_you_message'
        )
      `,
      [],
    );

    const biz = {};
    settings.forEach((s) => {
      biz[s.content_key] = s.content;
    });
    biz.business_name = biz.site_name || "Spiral Wood Services";
    biz.site_logo = biz.site_logo || null;
    biz.thank_you_message = biz.thank_you_message || DEFAULT_THANK_YOU_MESSAGE;

    return res.json({
      id: receipt.id,
      order_id: receipt.order_id,
      order_number: snapshot.order_number,
      blueprint_title: snapshot.blueprint_title,
      receipt_number: receipt.receipt_number,
      payment_method_snapshot: receipt.payment_method_snapshot,
      payment_label: paymentSummary.payment_label,
      previous_paid_amount: paymentSummary.previous_paid,
      amount_paid: paymentSummary.payment_received,
      total_paid_after: paymentSummary.total_paid_after,
      remaining_balance_after: paymentSummary.remaining_balance,
      provider_reference: receipt.provider_reference,
      issued_to: String(receipt.issued_to || "").trim() || "Customer",
      total_amount: paymentSummary.order_total,
      processor_display: processorDisplay,
      printed_at: receipt.printed_at,
      created_at: receipt.created_at,
      payment_status: paymentSummary.status,
      business: biz,
    });
  } catch (err) {
    console.error("GET /api/pos/blueprint-receipts/:id error:", err);
    return res.status(500).json({ message: "Failed to load receipt." });
  }
};

/* ── POS Sales Reports ── */
exports.getReports = async (req, res) => {
  const { period = "daily", from, to, staff_id } = req.query;

  let groupBy, dateExpr;
  switch (period) {
    case "weekly":
      dateExpr = "YEARWEEK(o.created_at, 1)";
      groupBy = dateExpr;
      break;
    case "monthly":
      dateExpr = "DATE_FORMAT(o.created_at, '%Y-%m')";
      groupBy = dateExpr;
      break;
    case "yearly":
      dateExpr = "YEAR(o.created_at)";
      groupBy = dateExpr;
      break;
    default:
      dateExpr = "DATE(o.created_at)";
      groupBy = dateExpr;
  }

  try {
    let where = "WHERE o.type = 'walkin' AND o.status NOT IN ('cancelled')";
    const params = [];

    if (from) {
      where += " AND DATE(o.created_at) >= ?";
      params.push(from);
    }
    if (to) {
      where += " AND DATE(o.created_at) <= ?";
      params.push(to);
    }

    const receiptJoin =
      (staff_id && req.user.role === "admin") || req.user.role === "staff"
        ? "INNER JOIN receipts r ON r.order_id = o.id"
        : "LEFT JOIN receipts r ON r.order_id = o.id";

    if (staff_id && req.user.role === "admin") {
      where += " AND r.issued_by = ?";
      params.push(parseInt(staff_id)); // Added parseInt for safety
    } else if (req.user.role === "staff") {
      where += " AND r.issued_by = ?";
      params.push(req.user.id);
    }

    // ── FIXED: Switched to .query ──
    const [summary] = await db.query(
      `
      SELECT ${dateExpr} AS period_label,
             COUNT(o.id) AS order_count,
             COALESCE(SUM(o.subtotal), 0) AS subtotal,
             COALESCE(SUM(o.discount), 0) AS discount,
             COALESCE(SUM(o.total), 0) AS total_sales
      FROM orders o
      ${receiptJoin}
      ${where}
      GROUP BY ${groupBy}
      ORDER BY period_label DESC
      LIMIT 30
      `,
      params,
    );

    // ── FIXED: Switched to .query ──
    const [totals] = await db.query(
      `
      SELECT COUNT(o.id) AS total_orders,
             COALESCE(SUM(o.total), 0) AS grand_total,
             COALESCE(SUM(o.discount), 0) AS total_discount
      FROM orders o
      ${receiptJoin}
      ${where}
      `,
      params,
    );

    // ── FIXED: Switched to .query ──
    const [topProducts] = await db.query(
      `
      SELECT oi.product_name,
             SUM(oi.quantity) AS qty,
             COALESCE(SUM(COALESCE(oi.subtotal, oi.unit_price * oi.quantity)), 0) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      ${receiptJoin}
      ${where}
      GROUP BY oi.product_name
      ORDER BY qty DESC
      LIMIT 10
      `,
      params,
    );

    // ── FIXED: Switched to .query ──
    const [paymentBreakdown] = await db.query(
      `
      SELECT o.payment_method, COUNT(*) AS count,
             COALESCE(SUM(o.total), 0) AS total
      FROM orders o
      ${receiptJoin}
      ${where}
      GROUP BY o.payment_method
      `,
      params,
    );

    return res.json({
      summary,
      totals: totals[0],
      top_products: topProducts,
      payment_breakdown: paymentBreakdown,
    });
  } catch (err) {
    console.error("GET /api/pos/reports error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
