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
      "cash",
      itemsSnapshot,
    ],
  );

  return { receiptId: result.insertId, receiptNumber };
};

module.exports = { createPosSaleReceipt };