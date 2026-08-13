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

module.exports = { createPosSaleReceipt, createStandardOnlineReceipt };