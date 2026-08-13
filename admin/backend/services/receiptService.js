// services/receiptService.js
//
// Shared receipt-creation service.
//
// PHASE 1 SCOPE: only createPosSaleReceipt is implemented, and it is only
// called from controllers/staff/pos.orders.js for successful cashier CASH
// sales. Blueprint payment receipts are Phase 2 work and are intentionally
// NOT implemented here yet — the schema (backend/migrations/
// 003_expand_receipts_for_payment_transactions.sql) already reserves the
// columns a Phase 2 blueprint receipt helper will need, but no such helper
// is added in this file until Phase 2 is approved.
//
// PHASE 3D-A ADDITIVE CHANGE: createPosSaleReceipt now accepts an optional
// paymentMethodSnapshot parameter (defaults to "cash"), so the new POS QR
// payment verification flow (controllers/staff/pos.qrPayments.js) can
// pass "paymongo" for its receipts. Every existing caller
// (controllers/staff/pos.orders.js) does not pass this parameter, so the
// default applies and the stored value — and therefore all existing cash
// POS behavior — is completely unchanged.
//
// Contract for createPosSaleReceipt:
//   - Must be called with a connection (conn) that already has an ACTIVE
//     transaction, in the same transaction that inserted the order and its
//     verified payment_transactions row.
//   - The caller owns beginTransaction/commit/rollback. This function does
//     not commit or rollback anything itself.
//   - Throws on failure (including a duplicate payment_transaction_id,
//     which the database's UNIQUE constraint will reject with
//     ER_DUP_ENTRY) so the caller's existing catch/rollback block aborts
//     the whole sale — no partial state, no orphaned stock deduction.
//   - Cashier identity (issuedBy) must be the authenticated user id from
//     req.user.id. This function does not accept or trust any
//     frontend-supplied identity field.
//   - paymentMethodSnapshot must be exactly "cash" or "paymongo" — any
//     other value throws rather than being silently coerced or stored,
//     matching this codebase's "no silent coercions" convention.

const {
  parseDecimalToCentsStrict,
  centsToDecimalString,
  centsToAmount,
} = require("../utils/paymentAmounts");

const ALLOWED_PAYMENT_METHOD_SNAPSHOTS = new Set(["cash", "paymongo"]);

const createPosSaleReceipt = async (
  conn,
  {
    orderId,
    paymentTransactionId,
    receiptNumber,
    issuedTo,
    issuedBy,
    totalAmount,
    cashReceived = null,
    changeAmount = null,
    itemsSnapshot,
    paymentMethodSnapshot = "cash",
  },
) => {
  if (!orderId) {
    throw new Error("createPosSaleReceipt: orderId is required.");
  }
  if (!paymentTransactionId) {
    throw new Error(
      "createPosSaleReceipt: paymentTransactionId is required.",
    );
  }
  if (!receiptNumber) {
    throw new Error("createPosSaleReceipt: receiptNumber is required.");
  }
  if (!issuedBy) {
    throw new Error(
      "createPosSaleReceipt: issuedBy (authenticated user id) is required.",
    );
  }
  if (!itemsSnapshot) {
    throw new Error("createPosSaleReceipt: itemsSnapshot is required.");
  }
  if (!ALLOWED_PAYMENT_METHOD_SNAPSHOTS.has(paymentMethodSnapshot)) {
    throw new Error(
      `createPosSaleReceipt: unsupported paymentMethodSnapshot "${paymentMethodSnapshot}".`,
    );
  }

  const [result] = await conn.query(
    `
    INSERT INTO receipts
      (order_id, payment_transaction_id, receipt_type, receipt_number,
       issued_to, issued_by, total_amount, cash_received, change_amount,
       payment_method_snapshot, items_snapshot, printed_at)
    VALUES (?, ?, 'pos_sale', ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      orderId,
      paymentTransactionId,
      receiptNumber,
      issuedTo || "Walk-in Customer",
      issuedBy,
      totalAmount,
      cashReceived,
      changeAmount,
      paymentMethodSnapshot,
      itemsSnapshot,
    ],
  );

  return { receiptId: result.insertId, receiptNumber };
};



// WISDOM STANDARD ONLINE RECEIPT V1
// Standard storefront PayMongo orders use the existing 'pos_sale' receipt
// classification because the current schema intentionally has only
// pos_sale / blueprint_payment. No migration is needed. This helper differs
// from cashier POS receipts in one important way: the receipt is system/provider
// issued, so issued_by remains NULL rather than falsely attributing it to the
// customer who happened to return from PayMongo.
const createStandardOnlineReceipt = async (
  conn,
  {
    orderId,
    paymentTransactionId,
    receiptNumber,
    issuedTo,
    totalAmount,
    itemsSnapshot,
    providerReference = null,
    issuedBy,
  },
) => {
  if (!orderId) throw new Error("createStandardOnlineReceipt: orderId is required.");
  if (!paymentTransactionId) {
    throw new Error("createStandardOnlineReceipt: paymentTransactionId is required.");
  }
  if (!receiptNumber) {
    throw new Error("createStandardOnlineReceipt: receiptNumber is required.");
  }
  if (!itemsSnapshot) {
    throw new Error("createStandardOnlineReceipt: itemsSnapshot is required.");
  }
  if (!issuedBy) {
    throw new Error(
      "createStandardOnlineReceipt: issuedBy (owning customer user id) is required.",
    );
  }

  const [result] = await conn.query(
    `
    INSERT INTO receipts
      (order_id, payment_transaction_id, receipt_type, receipt_number,
       issued_to, issued_by, total_amount, cash_received, change_amount,
       payment_method_snapshot, payment_label, previous_paid_amount,
       amount_paid, total_paid_after, remaining_balance_after,
       provider_reference, items_snapshot, printed_at)
    VALUES (?, ?, 'pos_sale', ?, ?, ?, ?, NULL, NULL,
            'paymongo', 'full_payment', 0, ?, ?, 0, ?, ?, NOW())
    `,
    [
      orderId,
      paymentTransactionId,
      receiptNumber,
      issuedTo || "Customer",
      issuedBy,
      totalAmount,
      totalAmount,
      totalAmount,
      providerReference,
      itemsSnapshot,
    ],
  );

  return { receiptId: result.insertId, receiptNumber };
};



// WISDOM STANDARD VERIFIED PAYMENT RECEIPT V1
// Creates one immutable customer payment receipt only AFTER a STANDARD
// order payment_transactions row is already VERIFIED. The caller owns the
// surrounding database transaction.
//
// Important lifecycle rule:
// - Rider delivery collection remains PENDING and does not call this helper.
// - Admin verification calls this helper in the same transaction that changes
//   that pending row to VERIFIED.
// - Existing PayMongo return verification remains unchanged.
const STANDARD_RECEIPT_PAYMENT_METHODS = new Set([
  "cash",
  "gcash",
  "bank_transfer",
  "paymongo",
]);

const normalizeStandardReceipt = (value) =>
  String(value || "").trim().toLowerCase();

const positiveStandardReceiptId = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

const ensureStandardVerifiedPaymentReceipt = async (
  conn,
  { orderId, paymentTransactionId, issuedByUserId },
) => {
  const orderIdNum = positiveStandardReceiptId(orderId);
  const paymentIdNum = positiveStandardReceiptId(paymentTransactionId);
  const issuedByNum = positiveStandardReceiptId(issuedByUserId);

  if (!orderIdNum) {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: invalid orderId.",
    );
  }

  if (!paymentIdNum) {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: invalid paymentTransactionId.",
    );
  }

  if (!issuedByNum) {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: invalid issuedByUserId.",
    );
  }

  const [[order]] = await conn.query(
    `SELECT
       id,
       order_number,
       customer_id,
       order_type,
       total,
       walkin_customer_name,
       paymongo_session_id
     FROM orders
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [orderIdNum],
  );

  if (!order) {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: order not found.",
    );
  }

  if (normalizeStandardReceipt(order.order_type) !== "standard") {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: order is not standard.",
    );
  }

  const [paymentRows] = await conn.query(
    `SELECT id, amount, payment_method, status
     FROM payment_transactions
     WHERE order_id = ?
     ORDER BY id ASC
     FOR UPDATE`,
    [orderIdNum],
  );

  const targetPayment = paymentRows.find(
    (row) => Number(row.id) === paymentIdNum,
  );

  if (!targetPayment) {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: payment not found.",
    );
  }

  if (normalizeStandardReceipt(targetPayment.status) !== "verified") {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: payment is not verified.",
    );
  }

  const paymentMethod = normalizeStandardReceipt(
    targetPayment.payment_method,
  );

  if (!STANDARD_RECEIPT_PAYMENT_METHODS.has(paymentMethod)) {
    throw new Error(
      `ensureStandardVerifiedPaymentReceipt: unsupported payment method "${paymentMethod}".`,
    );
  }

  const orderTotalCents = parseDecimalToCentsStrict(order.total);
  const amountPaidCents = parseDecimalToCentsStrict(
    targetPayment.amount,
  );

  if (orderTotalCents === null || orderTotalCents <= 0) {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: invalid order total.",
    );
  }

  if (amountPaidCents === null || amountPaidCents <= 0) {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: invalid payment amount.",
    );
  }

  let totalPaidAfterCents = 0;

  for (const row of paymentRows) {
    if (normalizeStandardReceipt(row.status) !== "verified") continue;

    const amountCents = parseDecimalToCentsStrict(row.amount);

    if (amountCents === null) {
      throw new Error(
        "ensureStandardVerifiedPaymentReceipt: invalid verified payment amount.",
      );
    }

    totalPaidAfterCents += amountCents;
  }

  if (totalPaidAfterCents > orderTotalCents) {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: verified total exceeds order total.",
    );
  }

  const previousPaidCents = totalPaidAfterCents - amountPaidCents;

  if (previousPaidCents < 0) {
    throw new Error(
      "ensureStandardVerifiedPaymentReceipt: previous paid amount is invalid.",
    );
  }

  const remainingBalanceAfterCents =
    orderTotalCents - totalPaidAfterCents;

  const [existingRows] = await conn.query(
    `SELECT
       id,
       order_id,
       receipt_type,
       receipt_number,
       payment_label,
       previous_paid_amount,
       amount_paid,
       total_paid_after,
       remaining_balance_after
     FROM receipts
     WHERE payment_transaction_id = ?
     LIMIT 1
     FOR UPDATE`,
    [paymentIdNum],
  );

  if (existingRows.length) {
    const existing = existingRows[0];

    if (
      Number(existing.order_id) !== orderIdNum ||
      normalizeStandardReceipt(existing.receipt_type) !== "pos_sale"
    ) {
      throw new Error(
        "ensureStandardVerifiedPaymentReceipt: existing receipt does not match this standard payment.",
      );
    }

    return {
      receiptId: existing.id,
      receiptNumber: existing.receipt_number,
      paymentLabel: existing.payment_label,
      previousPaidAmount: existing.previous_paid_amount,
      amountPaid: existing.amount_paid,
      totalPaidAfter: existing.total_paid_after,
      remainingBalanceAfter: existing.remaining_balance_after,
      isNew: false,
    };
  }

  let paymentLabel = "partial_payment";

  if (
    previousPaidCents === 0 &&
    totalPaidAfterCents === orderTotalCents
  ) {
    paymentLabel = "full_payment";
  } else if (
    previousPaidCents > 0 &&
    totalPaidAfterCents === orderTotalCents
  ) {
    paymentLabel = "balance_payment";
  }

  const [[customer]] = await conn.query(
    `SELECT name
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [order.customer_id],
  );

  const issuedTo = String(
    customer?.name ||
      order.walkin_customer_name ||
      "Customer",
  ).slice(0, 200);

  const [items] = await conn.query(
    `SELECT product_name, quantity, unit_price
     FROM order_items
     WHERE order_id = ?
     ORDER BY id ASC`,
    [orderIdNum],
  );

  const receiptNumber =
    `OR-${Date.now()}-${paymentIdNum}`.slice(0, 50);

  const totalAmount = centsToDecimalString(orderTotalCents);
  const previousPaidAmount =
    centsToDecimalString(previousPaidCents);
  const amountPaid = centsToDecimalString(amountPaidCents);
  const totalPaidAfter =
    centsToDecimalString(totalPaidAfterCents);
  const remainingBalanceAfter =
    centsToDecimalString(remainingBalanceAfterCents);

  const providerReference =
    paymentMethod === "paymongo"
      ? String(order.paymongo_session_id || "")
          .trim()
          .slice(0, 150) || null
      : null;

  const [insertResult] = await conn.query(
    `INSERT INTO receipts
      (
        order_id,
        payment_transaction_id,
        receipt_type,
        payment_method_snapshot,
        payment_label,
        previous_paid_amount,
        amount_paid,
        total_paid_after,
        remaining_balance_after,
        provider_reference,
        receipt_number,
        issued_to,
        issued_by,
        total_amount,
        cash_received,
        change_amount,
        items_snapshot,
        printed_at
      )
     VALUES (
       ?, ?, 'pos_sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       NULL, NULL, ?, NOW()
     )`,
    [
      orderIdNum,
      paymentIdNum,
      paymentMethod,
      paymentLabel,
      previousPaidAmount,
      amountPaid,
      totalPaidAfter,
      remainingBalanceAfter,
      providerReference,
      receiptNumber,
      issuedTo,
      issuedByNum,
      totalAmount,
      JSON.stringify(items || []),
    ],
  );

  return {
    receiptId: insertResult.insertId,
    receiptNumber,
    paymentLabel,
    previousPaidAmount: centsToAmount(previousPaidCents),
    amountPaid: centsToAmount(amountPaidCents),
    totalPaidAfter: centsToAmount(totalPaidAfterCents),
    remainingBalanceAfter: centsToAmount(
      remainingBalanceAfterCents,
    ),
    isNew: true,
  };
};


module.exports = {
  createPosSaleReceipt,
  createStandardOnlineReceipt,
  ensureStandardVerifiedPaymentReceipt,
};