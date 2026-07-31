// controllers/staff/pos.receipts_reports.js (or similar)
const db = require("../../config/db");

/* ── Get Receipt by ID ── */
exports.getReceiptById = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [rows] = await db.query(
      `
      SELECT
        r.*,
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
      LIMIT 1
      `,
      [parseInt(req.params.id)],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const receipt = rows[0];

    try {
      receipt.items = JSON.parse(receipt.items_snapshot || "[]");
    } catch {
      receipt.items = [];
    }

    // IMPORTANT FIX:
    // website_settings uses column `value`, not `setting_value`
    // ── FIXED: Switched to .query and added empty array [] ──
    const [settings] = await db.query(
      `
      SELECT setting_key, value
      FROM website_settings
      WHERE setting_key IN (
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
      biz[s.setting_key] = s.value;
    });

    biz.business_name = biz.site_name || "Spiral Wood Services";
    receipt.business = biz;

    return res.json(receipt);
  } catch (err) {
    console.error("GET /api/pos/receipts/:id error:", err);
    return res.status(500).json({
      message: "Failed to load receipt",
      error: err.message,
    });
  }
};

/* ── Get Receipt by Order ID ── */
exports.getReceiptByOrderId = async (req, res) => {
  const { order_id } = req.query;

  if (!order_id) {
    return res.status(400).json({ message: "order_id required" });
  }

  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [rows] = await db.query(
      `
      SELECT
        r.*,
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
      ORDER BY r.id DESC
      LIMIT 1
      `,
      [parseInt(order_id)],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const receipt = rows[0];

    try {
      receipt.items = JSON.parse(receipt.items_snapshot || "[]");
    } catch {
      receipt.items = [];
    }

    return res.json(receipt);
  } catch (err) {
    console.error("GET /api/pos/receipts?order_id= error:", err);
    return res.status(500).json({
      message: "Failed to load receipt",
      error: err.message,
    });
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
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
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

    let blueprintTitle = null;
    let snapshotOrderNumber = null;
    try {
      const snapshot = JSON.parse(receipt.items_snapshot || "{}");
      blueprintTitle = snapshot.blueprint_title || null;
      snapshotOrderNumber = snapshot.order_number || null;
    } catch {
      blueprintTitle = null;
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
      SELECT setting_key, value
      FROM website_settings
      WHERE setting_key IN (
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
      biz[s.setting_key] = s.value;
    });
    biz.business_name = biz.site_name || "Spiral Wood Services";

    const remainingBalance = Number(receipt.remaining_balance_after || 0);

    return res.json({
      id: receipt.id,
      order_id: receipt.order_id,
      order_number: receipt.order_number || snapshotOrderNumber,
      blueprint_title: blueprintTitle,
      receipt_number: receipt.receipt_number,
      payment_method_snapshot: receipt.payment_method_snapshot,
      payment_label: receipt.payment_label,
      previous_paid_amount: receipt.previous_paid_amount,
      amount_paid: receipt.amount_paid,
      total_paid_after: receipt.total_paid_after,
      remaining_balance_after: receipt.remaining_balance_after,
      provider_reference: receipt.provider_reference,
      issued_to: receipt.issued_to,
      total_amount: receipt.total_amount,
      processor_display: processorDisplay,
      printed_at: receipt.printed_at,
      created_at: receipt.created_at,
      payment_status: remainingBalance <= 0 ? "Fully Paid" : "Partially Paid",
      business: biz,
    });
  } catch (err) {
    console.error("GET /api/pos/blueprint-receipts/:id error:", err);
    return res.status(500).json({
      message: "Failed to load receipt",
      error: err.message,
    });
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
