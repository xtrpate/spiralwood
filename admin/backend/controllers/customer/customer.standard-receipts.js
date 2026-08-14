// controllers/customer/customer.standard-receipts.js
//
// Customer-facing, read-only receipt access for STANDARD / ready-to-ship
// orders. A receipt is never returned from URL ids alone: the SQL requires
// the authenticated customer to own the exact order, the receipt to belong
// to that exact order, the order to be STANDARD, and the linked payment
// transaction to be VERIFIED.

const db = require("../../config/db");
const { parseStrictPositiveInt } = require("../../utils/validators");

exports.getReceiptById = async (req, res) => {
  const orderId = parseStrictPositiveInt(req.params.id);
  const receiptId = parseStrictPositiveInt(req.params.receiptId);

  if (!orderId || !receiptId) {
    return res.status(400).json({ message: "Invalid request." });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        r.id,
        r.receipt_number,
        r.payment_method_snapshot,
        r.payment_label,
        r.previous_paid_amount,
        r.amount_paid,
        r.total_paid_after,
        r.remaining_balance_after,
        r.provider_reference,
        r.issued_to,
        r.total_amount,
        r.items_snapshot,
        r.printed_at,
        r.created_at,
        o.order_number,
        pt.status AS payment_status
      FROM receipts r
      INNER JOIN orders o
        ON o.id = r.order_id
        AND o.customer_id = ?
        AND o.order_type = 'standard'
      INNER JOIN payment_transactions pt
        ON pt.id = r.payment_transaction_id
        AND pt.order_id = o.id
        AND LOWER(pt.status) = 'verified'
      WHERE r.id = ?
        AND r.order_id = ?
        AND r.receipt_type = 'pos_sale'
      LIMIT 1
      `,
      [req.user.id, receiptId, orderId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Receipt not found." });
    }

    const receipt = rows[0];

    let items = [];
    try {
      const parsed = JSON.parse(receipt.items_snapshot || "[]");
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      items = [];
    }

    const [settings] = await db.query(
      `
      SELECT content_key, content
      FROM website_content
      WHERE content_type = 'setting'
        AND is_visible = 1
        AND content_key IN (
          'site_name',
          'business_phone',
          'thank_you_message'
        )
      `,
      [],
    );

    const business = {};
    for (const row of settings) {
      business[row.content_key] = row.content;
    }

    const remainingBalance = Number(
      receipt.remaining_balance_after || 0,
    );

    return res.json({
      id: receipt.id,
      order_id: orderId,
      order_number: receipt.order_number,
      receipt_number: receipt.receipt_number,
      payment_method_snapshot: receipt.payment_method_snapshot,
      payment_label: receipt.payment_label,
      previous_paid_amount:
        receipt.previous_paid_amount ?? 0,
      amount_paid:
        receipt.amount_paid ?? receipt.total_amount ?? 0,
      total_paid_after:
        receipt.total_paid_after ?? receipt.total_amount ?? 0,
      remaining_balance_after:
        receipt.remaining_balance_after ?? 0,
      provider_reference: receipt.provider_reference,
      issued_to: receipt.issued_to,
      total_amount: receipt.total_amount,
      printed_at: receipt.printed_at,
      created_at: receipt.created_at,
      payment_status:
        remainingBalance <= 0 ? "Fully Paid" : "Partially Paid",
      items,
      business: {
        business_name:
          business.site_name || "Spiral Wood Services",
        business_address:
          "8 Laot Street, Near Gavino, Prenza I, Marilao, 3019 Bulacan",
        business_phone: business.business_phone || "",
        thank_you_message:
          business.thank_you_message ||
          "Thank you for your payment.",
      },
    });
  } catch (err) {
    console.error(
      "[customer.standard-receipts getReceiptById]",
      err,
    );
    return res
      .status(500)
      .json({ message: "Failed to load receipt." });
  }
};
