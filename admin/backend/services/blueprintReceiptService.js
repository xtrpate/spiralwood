// services/blueprintReceiptService.js
//
// Centralized, idempotent blueprint payment receipt creation.
//
// CONTRACT WITH CALLERS — same discipline as blueprintLifecycleService.js:
//   - Accepts an already-open, already-transactional mysql2 connection
//     (conn). This module NEVER begins a transaction, commits, rolls back,
//     or releases the connection. The caller owns the transaction end to
//     end; a thrown Error here must be caught by the caller's own
//     try/catch, which then rolls back everything (order write, payment
//     transaction, order.payment_status update) in one atomic unit.
//   - Must be called only AFTER the caller has already inserted/updated the
//     target payment_transactions row to status = 'verified', and BEFORE
//     the caller's own conn.commit().
//
// LOCK ORDER (must not be reordered):
//   1. Canonical order (via resolveLifecycleByOrder, lockOrder: true)
//   2. Blueprint + approved estimation (same call, lockBlueprint/
//      lockEstimation: true) — order is always locked first internally by
//      blueprintLifecycleService, matching the project-wide convention.
//   3. Complete payment_transactions set for the order (FOR UPDATE)
//   4. Locate + validate the target payment row within that locked set
//   5. Check for an existing receipt by payment_transaction_id
//   6. Insert the receipt only when none exists
//
// MONEY: integer cents only for every comparison/calculation. Decimal
// columns are always written using centsToDecimalString() — never a raw
// JavaScript float. centsToAmount() is used ONLY for the human-readable
// numbers in this function's return value (for API responses/UI), never
// for a persisted column or a comparison.

const {
  parseDecimalToCentsStrict,
  calcDownPaymentAmount,
  centsToDecimalString,
  centsToAmount,
} = require("../utils/paymentAmounts");
const { resolveLifecycleByOrder } = require("./blueprintLifecycleService");

const normalize = (value) => String(value || "").trim().toLowerCase();

const isPositiveInt = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0;
};

// Safe checkout-session-style identifier only. Never a file path (proof
// uploads look like "/uploads/proofs/..." or "/uploads/delivery-receipts/
// ..." and must never end up here).
const PAYMONGO_REFERENCE_PATTERN = /^cs_[A-Za-z0-9]+$/;

// Validates a row found by a locking lookup on
// receipts.payment_transaction_id before it is ever treated as an
// idempotent success. A row existing at all is not sufficient proof it is
// the right row — it must also belong to the exact order being processed
// and be a blueprint payment receipt, never a POS sale receipt or a
// receipt attached to a different order. Throws (never silently returns
// a mismatched row) when either check fails.
const validateExistingReceiptRow = (existing, orderIdNum) => {
  if (!existing) return null;

  if (Number(existing.order_id) !== orderIdNum) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: existing receipt does not match the expected blueprint payment.",
    );
  }
  if (normalize(existing.receipt_type) !== "blueprint_payment") {
    throw new Error(
      "ensureReceiptForVerifiedPayment: existing receipt does not match the expected blueprint payment.",
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
};

async function ensureReceiptForVerifiedPayment(
  conn,
  { orderId, paymentTransactionId, issuedByUserId },
) {
  const orderIdNum = Number(orderId);
  const paymentTransactionIdNum = Number(paymentTransactionId);
  const issuedByNum = Number(issuedByUserId);

  if (!isPositiveInt(orderIdNum)) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: orderId must be a positive integer.",
    );
  }
  if (!isPositiveInt(paymentTransactionIdNum)) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: paymentTransactionId must be a positive integer.",
    );
  }
  if (!isPositiveInt(issuedByNum)) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: issuedByUserId must be a positive integer.",
    );
  }

  // ── 1 + 2: lock order, then blueprint + approved estimation ──────────
  const lifecycle = await resolveLifecycleByOrder(conn, {
    orderId: orderIdNum,
    lockOrder: true,
    lockBlueprint: true,
    lockEstimation: true,
  });

  if (lifecycle.status !== "OK" || !lifecycle.order) {
    throw new Error(
      `ensureReceiptForVerifiedPayment: order lifecycle not resolvable (${lifecycle.reason || "unknown"}).`,
    );
  }

  const order = lifecycle.order;

  if (normalize(order.order_type) !== "blueprint") {
    throw new Error(
      "ensureReceiptForVerifiedPayment: order is not a blueprint order.",
    );
  }

  const blueprint = lifecycle.blueprint;
  const estimation = lifecycle.estimation;

  if (!estimation || normalize(estimation.status) !== "approved") {
    throw new Error(
      "ensureReceiptForVerifiedPayment: no approved estimation for this order.",
    );
  }

  // ── 3: lock the complete payment_transactions set for this order ─────
  const [paymentRows] = await conn.query(
    `SELECT id, amount, payment_method, proof_url, status
     FROM payment_transactions
     WHERE order_id = ?
     ORDER BY id
     FOR UPDATE`,
    [orderIdNum],
  );

  // ── 4: locate + validate the target payment ───────────────────────────
  const targetRow = paymentRows.find(
    (row) => Number(row.id) === paymentTransactionIdNum,
  );

  if (!targetRow) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: payment transaction not found for this order.",
    );
  }
  if (normalize(targetRow.status) !== "verified") {
    throw new Error(
      "ensureReceiptForVerifiedPayment: payment transaction is not verified.",
    );
  }

  const amountPaidCents = parseDecimalToCentsStrict(targetRow.amount);
  if (amountPaidCents === null || amountPaidCents <= 0) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: target payment amount is invalid.",
    );
  }

  let totalPaidAfterCents = 0;
  for (const row of paymentRows) {
    if (normalize(row.status) !== "verified") continue;
    const cents = parseDecimalToCentsStrict(row.amount);
    if (cents === null) {
      throw new Error(
        "ensureReceiptForVerifiedPayment: an existing verified payment amount is inconsistent.",
      );
    }
    totalPaidAfterCents += cents;
  }

  const previousPaidCents = totalPaidAfterCents - amountPaidCents;
  if (previousPaidCents < 0) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: previous paid amount computed negative.",
    );
  }

  const orderTotalCents = parseDecimalToCentsStrict(order.total);
  if (orderTotalCents === null || orderTotalCents <= 0) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: order total is invalid.",
    );
  }

  // Never hide an overpayment behind Math.max — a locked verified total
  // that exceeds the order total is a real integrity failure and must
  // abort the whole caller transaction, not silently clamp to zero.
  if (totalPaidAfterCents > orderTotalCents) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: verified total exceeds the order total.",
    );
  }

  const remainingBalanceAfterCents = orderTotalCents - totalPaidAfterCents;
  if (remainingBalanceAfterCents < 0) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: remaining balance computed negative.",
    );
  }

  // Exact 30% required minimum, computed from the LOCKED approved
  // estimation's grand_total via the project's single shared helper —
  // never re-derived with floating-point multiplication here.
  const requiredMinimumRaw = calcDownPaymentAmount(estimation.grand_total);
  const requiredMinimumCents = parseDecimalToCentsStrict(
    typeof requiredMinimumRaw === "number"
      ? requiredMinimumRaw.toFixed(2)
      : requiredMinimumRaw,
  );
  if (requiredMinimumCents === null || requiredMinimumCents <= 0) {
    throw new Error(
      "ensureReceiptForVerifiedPayment: could not compute the required minimum down payment.",
    );
  }

  // ── 5: idempotency check — an existing receipt for this exact payment
  // transaction always wins; never insert a second one. A LOCKING
  // (FOR UPDATE) read is required here, not an ordinary consistent read:
  // under REPEATABLE READ, an ordinary SELECT could still be looking at
  // an older snapshot and miss a receipt a concurrent transaction just
  // committed. ───────────────────────────────────────────────────────
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
    [paymentTransactionIdNum],
  );

  if (existingRows.length > 0) {
    const validated = validateExistingReceiptRow(existingRows[0], orderIdNum);
    if (validated) return validated;
  }

  // ── Payment-label classification — server-locked totals only ─────────
  let paymentLabel;
  if (previousPaidCents === 0 && totalPaidAfterCents === orderTotalCents) {
    paymentLabel = "full_payment";
  } else if (previousPaidCents > 0 && totalPaidAfterCents === orderTotalCents) {
    paymentLabel = "balance_payment";
  } else if (
    previousPaidCents < requiredMinimumCents &&
    totalPaidAfterCents >= requiredMinimumCents &&
    totalPaidAfterCents < orderTotalCents
  ) {
    paymentLabel = "down_payment";
  } else {
    paymentLabel = "partial_payment";
  }

  // ── provider_reference — PayMongo checkout-session id only, never a
  // proof-upload file path (gcash/bank/rider-cash all store a path in
  // proof_url, which must never be copied here). ───────────────────────
  const paymentMethod = normalize(targetRow.payment_method);
  let providerReference = null;
  if (paymentMethod === "paymongo") {
    const proof = String(targetRow.proof_url || "").trim();
    if (proof.length > 0 && proof.length <= 150 && PAYMONGO_REFERENCE_PATTERN.test(proof)) {
      providerReference = proof;
    }
  }

  const [[customerRow]] = await conn.query(
    `SELECT name FROM users WHERE id = ? LIMIT 1`,
    [order.customer_id],
  );
  const issuedTo = String(customerRow?.name || "Customer").slice(0, 200);

  const blueprintTitle = blueprint?.title || null;
  const receiptNumber = `BP-${Date.now()}-${paymentTransactionIdNum}`.slice(0, 50);

  const itemsSnapshot = JSON.stringify({
    order_type: "blueprint",
    order_number: order.order_number,
    blueprint_title: blueprintTitle,
    payment_label: paymentLabel,
  });

  const previousPaidAmountStr = centsToDecimalString(previousPaidCents);
  const amountPaidStr = centsToDecimalString(amountPaidCents);
  const totalPaidAfterStr = centsToDecimalString(totalPaidAfterCents);
  const remainingBalanceAfterStr = centsToDecimalString(remainingBalanceAfterCents);
  const totalAmountStr = centsToDecimalString(orderTotalCents);

  let insertResult;
  try {
    [insertResult] = await conn.query(
      `INSERT INTO receipts
        (order_id, payment_transaction_id, receipt_type, payment_method_snapshot,
         payment_label, previous_paid_amount, amount_paid, total_paid_after,
         remaining_balance_after, provider_reference, receipt_number, issued_to,
         issued_by, total_amount, cash_received, change_amount, items_snapshot,
         printed_at)
       VALUES (?, ?, 'blueprint_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL)`,
      [
        orderIdNum,
        paymentTransactionIdNum,
        paymentMethod,
        paymentLabel,
        previousPaidAmountStr,
        amountPaidStr,
        totalPaidAfterStr,
        remainingBalanceAfterStr,
        providerReference,
        receiptNumber,
        issuedTo,
        issuedByNum,
        totalAmountStr,
        itemsSnapshot,
      ],
    );
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      // Could be a genuine race on UNIQUE(payment_transaction_id) — the
      // correct, expected idempotency path — or an unrelated
      // UNIQUE(receipt_number) collision, which is a real error and must
      // NOT be swallowed. Only the first case is safe to treat as
      // success, and only once validated as the exact matching blueprint
      // receipt. A locking (FOR UPDATE) read is used for the same reason
      // as the pre-INSERT check above — an ordinary read here could
      // still miss the concurrently-committed row under REPEATABLE READ.
      const [retryRows] = await conn.query(
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
        [paymentTransactionIdNum],
      );
      if (retryRows.length > 0) {
        const validated = validateExistingReceiptRow(retryRows[0], orderIdNum);
        if (validated) return validated;
      }
      throw err;
    }
    throw err;
  }

  return {
    receiptId: insertResult.insertId,
    receiptNumber,
    paymentLabel,
    previousPaidAmount: centsToAmount(previousPaidCents),
    amountPaid: centsToAmount(amountPaidCents),
    totalPaidAfter: centsToAmount(totalPaidAfterCents),
    remainingBalanceAfter: centsToAmount(remainingBalanceAfterCents),
    isNew: true,
  };
}

module.exports = { ensureReceiptForVerifiedPayment };