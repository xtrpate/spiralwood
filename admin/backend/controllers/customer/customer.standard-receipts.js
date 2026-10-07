// controllers/customer/customer.standard-receipts.js
//
// Customer-facing, read-only receipt access for STANDARD / ready-to-ship
// orders. A receipt is never returned from URL ids alone: the SQL requires
// the authenticated customer to own the exact order, the receipt to belong
// to that exact order, the order to be STANDARD, and the linked payment
// transaction to be VERIFIED.

const db = require("../../config/db");
const { parseStrictPositiveInt } = require("../../utils/validators");
const {
  parseDecimalToCentsStrict,
  centsToAmount,
} = require("../../utils/paymentAmounts");
const {
  READY_MADE_VAT_RATE,
  computeReadyMadeVatInclusiveBreakdown,
} = require("../../utils/readyMadeVat");

const parseImmutableStandardItems = (rawSnapshot) => {
  try {
    const parsed = JSON.parse(rawSnapshot || "[]");

    if (Array.isArray(parsed)) return parsed;

    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.snapshot_version === 2 &&
      Array.isArray(parsed.items)
    ) {
      return parsed.items;
    }

    return [];
  } catch {
    return [];
  }
};

const buildImmutableStandardFinancialSummary = (
  items,
  receiptTotalAmount,
) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  let subtotalCents = 0;

  for (const item of items) {
    if (
      typeof item?.product_name !== "string" ||
      item.product_name.trim() === ""
    ) {
      return null;
    }

    const quantity = Number(item.quantity);
    const unitPriceCents = parseDecimalToCentsStrict(item.unit_price);

    if (
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      unitPriceCents === null
    ) {
      return null;
    }

    const lineCents = unitPriceCents * quantity;
    if (!Number.isSafeInteger(lineCents)) return null;

    subtotalCents += lineCents;
    if (!Number.isSafeInteger(subtotalCents)) return null;
  }

  const totalCents = parseDecimalToCentsStrict(receiptTotalAmount);

  // Standard customer checkout currently has no receipt-level discount or
  // delivery fee. If immutable item math does not equal immutable receipt
  // total, do not guess adjustments and do not fabricate a tax breakdown.
  if (totalCents === null || subtotalCents !== totalCents) {
    return null;
  }

  const breakdown = computeReadyMadeVatInclusiveBreakdown({
    subtotalCents,
    discountCents: 0,
    deliveryFeeCents: 0,
  });

  if (!breakdown || breakdown.totalCents !== totalCents) {
    return null;
  }

  return {
    pricing_mode: "vat_inclusive",
    vat_rate: READY_MADE_VAT_RATE,
    subtotal: centsToAmount(breakdown.subtotalCents),
    discount: 0,
    delivery_fee: 0,
    vatable_sales: centsToAmount(breakdown.vatableSalesCents),
    vat_exempt_sales: 0,
    zero_rated_sales: 0,
    tax: centsToAmount(breakdown.taxCents),
    total: centsToAmount(breakdown.totalCents),
  };
};

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
        pt.status AS payment_status,
        verifier.name AS verifier_name,
        issuer.name AS issuer_name
      FROM receipts r
      INNER JOIN orders o
        ON o.id = r.order_id
        AND o.customer_id = ?
        AND o.order_type = 'standard'
      INNER JOIN payment_transactions pt
        ON pt.id = r.payment_transaction_id
        AND pt.order_id = o.id
        AND LOWER(pt.status) = 'verified'
      LEFT JOIN users verifier
        ON verifier.id = pt.verified_by
      LEFT JOIN users issuer
        ON issuer.id = r.issued_by
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

    const items = parseImmutableStandardItems(receipt.items_snapshot);
    const financialSummary = buildImmutableStandardFinancialSummary(
      items,
      receipt.total_amount,
    );

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

    const snapshotPaymentMethod = String(
      receipt.payment_method_snapshot || "",
    )
      .trim()
      .toLowerCase();

    const hasProviderReference =
      receipt.provider_reference !== undefined &&
      receipt.provider_reference !== null &&
      String(receipt.provider_reference).trim() !== "";

    const isPaymongoProvider =
      snapshotPaymentMethod === "paymongo" || hasProviderReference;

    const processorDisplay = isPaymongoProvider
      ? "PayMongo"
      : String(
          receipt.verifier_name ||
            receipt.issuer_name ||
            "",
        ).trim() || "Staff";

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
      processor_display: processorDisplay,
      items,
      financial_summary: financialSummary,
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
