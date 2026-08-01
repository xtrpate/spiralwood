const {
  roundMoney,
  calcDownPaymentAmount,
  parseDecimalToCentsStrict,
  parseStrictMoneyToCents,
  centsToDecimalString,
  centsToAmount,
} = require("../utils/paymentAmounts");
const {
  resolveLifecycleByOrder,
} = require("./blueprintLifecycleService");
const {
  ensureReceiptForVerifiedPayment,
} = require("./blueprintReceiptService");

const normalize = (value) => String(value || "").trim().toLowerCase();

const ALLOWED_STATUSES = [
  "confirmed",
  "contract_released",
  "production",
  "shipping",
  "delivered",
];

const REASON = {
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  NOT_BLUEPRINT: "NOT_BLUEPRINT",
  INVALID_ORDER_STATUS: "INVALID_ORDER_STATUS",
  QUOTATION_NOT_APPROVED: "QUOTATION_NOT_APPROVED",
  INVALID_ORDER_TOTAL: "INVALID_ORDER_TOTAL",
  PAYMENT_AMOUNT_INCONSISTENT: "PAYMENT_AMOUNT_INCONSISTENT",
  PAYMENT_TOTAL_INCONSISTENT: "PAYMENT_TOTAL_INCONSISTENT",
  PAYMENT_STATUS_INCONSISTENT: "PAYMENT_STATUS_INCONSISTENT",
  LIFECYCLE_INCONSISTENT: "LIFECYCLE_INCONSISTENT",
  ALREADY_FULLY_PAID: "ALREADY_FULLY_PAID",
  PAYMENT_PENDING_REVIEW: "PAYMENT_PENDING_REVIEW",
  PAYMONGO_SESSION_PRESENT: "PAYMONGO_SESSION_PRESENT",
  PAYMENT_METHOD_NOT_CASH: "PAYMENT_METHOD_NOT_CASH",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  AMOUNT_BELOW_MINIMUM: "AMOUNT_BELOW_MINIMUM",
  AMOUNT_EXCEEDS_BALANCE: "AMOUNT_EXCEEDS_BALANCE",
};

const INTEGRITY_REASON_CODES = new Set([
  REASON.PAYMENT_AMOUNT_INCONSISTENT,
  REASON.PAYMENT_TOTAL_INCONSISTENT,
  REASON.PAYMENT_STATUS_INCONSISTENT,
  REASON.LIFECYCLE_INCONSISTENT,
]);

const httpStatusForReason = (code) =>
  INTEGRITY_REASON_CODES.has(code) ? 409 : 400;

const REASON_MESSAGE = {
  ORDER_NOT_FOUND: "Order not found.",
  NOT_BLUEPRINT: "This is not a blueprint order.",
  INVALID_ORDER_STATUS:
    "This order's current status does not allow a store payment.",
  QUOTATION_NOT_APPROVED: "The quotation has not been approved.",
  INVALID_ORDER_TOTAL: "The order total is not finalized yet.",
  PAYMENT_AMOUNT_INCONSISTENT:
    "One or more recorded payment amounts are inconsistent. Please contact support.",
  PAYMENT_TOTAL_INCONSISTENT:
    "This order's verified payments exceed its total. Please contact support.",
  PAYMENT_STATUS_INCONSISTENT:
    "This order's payment status is inconsistent. Please contact support.",
  LIFECYCLE_INCONSISTENT:
    "This order's blueprint lifecycle is inconsistent. Please contact support.",
  ALREADY_FULLY_PAID: "This order has already been fully paid.",
  PAYMENT_PENDING_REVIEW:
    "A payment is already awaiting review for this order.",
  PAYMONGO_SESSION_PRESENT:
    "This order's payment state is inconsistent. Please contact support.",
  PAYMENT_METHOD_NOT_CASH: "This order is not set to Cash at Store.",
  INVALID_AMOUNT: "Enter a valid payment amount.",
  AMOUNT_BELOW_MINIMUM: "The amount is below the minimum required payment.",
  AMOUNT_EXCEEDS_BALANCE: "The amount exceeds the remaining balance.",
};

const summarizePaymentRowsStrict = (rows) => {
  let verifiedCents = 0;
  let hasPendingPayment = false;
  let hasInvalidAmount = false;

  for (const row of rows) {
    const cents = parseDecimalToCentsStrict(row.amount);
    if (cents === null) {
      hasInvalidAmount = true;
      continue;
    }

    const status = normalize(row.status);
    if (status === "verified") {
      const nextTotal = verifiedCents + cents;
      if (!Number.isSafeInteger(nextTotal)) {
        hasInvalidAmount = true;
        continue;
      }
      verifiedCents = nextTotal;
    } else if (status === "pending") {
      hasPendingPayment = true;
    }
  }

  return { verifiedCents, hasPendingPayment, hasInvalidAmount };
};

const derivePaymentStatus = (verifiedCents, totalCents) => {
  if (verifiedCents > totalCents) return null;
  if (verifiedCents === totalCents) return "paid";
  if (verifiedCents > 0) return "partial";
  return "unpaid";
};

const computeRequiredMinimumCents = (orderTotalCents) => {
  const orderTotalAmount = centsToAmount(orderTotalCents);
  const requiredMinimumAmount = calcDownPaymentAmount(orderTotalAmount);
  const cents = parseDecimalToCentsStrict(requiredMinimumAmount.toFixed(2));

  if (
    cents === null ||
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    cents > orderTotalCents
  ) {
    return null;
  }

  return cents;
};

const evaluate = ({
  order,
  estimation,
  verifiedTotalCents,
  hasPendingPayment,
  hasInvalidAmount,
  hasPayMongoSessionData,
}) => {
  const build = (code) => ({
    eligible: false,
    reason_code: code,
    reason_message: REASON_MESSAGE[code],
  });

  if (!order) return build(REASON.ORDER_NOT_FOUND);
  if (normalize(order.order_type) !== "blueprint") {
    return build(REASON.NOT_BLUEPRINT);
  }
  if (!ALLOWED_STATUSES.includes(normalize(order.status))) {
    return build(REASON.INVALID_ORDER_STATUS);
  }
  if (!estimation || normalize(estimation.status) !== "approved") {
    return build(REASON.QUOTATION_NOT_APPROVED);
  }

  const orderTotalCents = parseDecimalToCentsStrict(order.total);
  if (orderTotalCents === null || orderTotalCents <= 0) {
    return build(REASON.INVALID_ORDER_TOTAL);
  }

  if (hasInvalidAmount) {
    return build(REASON.PAYMENT_AMOUNT_INCONSISTENT);
  }

  if (verifiedTotalCents > orderTotalCents) {
    return build(REASON.PAYMENT_TOTAL_INCONSISTENT);
  }

  const derivedStatus = derivePaymentStatus(verifiedTotalCents, orderTotalCents);

  if (normalize(order.payment_status) !== derivedStatus) {
    return build(REASON.PAYMENT_STATUS_INCONSISTENT);
  }

  if (derivedStatus === "paid") {
    return build(REASON.ALREADY_FULLY_PAID);
  }
  if (hasPendingPayment) {
    return build(REASON.PAYMENT_PENDING_REVIEW);
  }
  if (hasPayMongoSessionData) {
    return build(REASON.PAYMONGO_SESSION_PRESENT);
  }
  if (verifiedTotalCents === 0 && normalize(order.payment_method) !== "cash") {
    return build(REASON.PAYMENT_METHOD_NOT_CASH);
  }

  const requiredMinimumCents = computeRequiredMinimumCents(orderTotalCents);
  if (requiredMinimumCents === null) {
    return build(REASON.INVALID_ORDER_TOTAL);
  }

  return {
    eligible: true,
    reason_code: null,
    reason_message: null,
    orderTotalCents,
    requiredMinimumCents,
    derivedStatus,
  };
};

const computeLimits = ({ orderTotalCents, requiredMinimumCents, verifiedTotalCents }) => {
  const minEligibleCents =
    verifiedTotalCents < requiredMinimumCents
      ? requiredMinimumCents - verifiedTotalCents
      : 1;
  const maxEligibleCents = orderTotalCents - verifiedTotalCents;
  return { minEligibleCents, maxEligibleCents };
};

const buildQuickAmountsCents = ({
  orderTotalCents,
  verifiedTotalCents,
  requiredMinimumCents,
  maxEligibleCents,
}) => {
  const options = new Set();

  if (verifiedTotalCents === 0) {
    options.add(requiredMinimumCents);
    options.add(Math.round(orderTotalCents * 0.5));
    options.add(orderTotalCents);
  } else if (verifiedTotalCents < requiredMinimumCents) {
    options.add(requiredMinimumCents - verifiedTotalCents);
    options.add(maxEligibleCents);
  } else {
    options.add(maxEligibleCents);
  }

  return [...options]
    .filter((c) => c > 0 && c <= maxEligibleCents)
    .sort((a, b) => a - b);
};

const buildSummary = ({ order, estimation, paymentRows }) => {
  if (!order) {
    return {
      order_id: null,
      order_number: null,
      order_type: null,
      order_status: null,
      initial_payment_method: null,
      payment_status: null,
      total: 0,
      verified_total: 0,
      remaining_balance: 0,
      minimum_required_total: 0,
      minimum_additional_payment: 0,
      can_record_payment: false,
      reason_code: REASON.ORDER_NOT_FOUND,
      reason_message: REASON_MESSAGE.ORDER_NOT_FOUND,
      quick_amounts: [],
    };
  }

  const { verifiedCents: verifiedTotalCents, hasPendingPayment, hasInvalidAmount } =
    summarizePaymentRowsStrict(paymentRows);
  const hasPayMongoSessionData = Boolean(
    order.paymongo_session_id || order.payment_url,
  );

  const eligibility = evaluate({
    order,
    estimation,
    verifiedTotalCents,
    hasPendingPayment,
    hasInvalidAmount,
    hasPayMongoSessionData,
  });

  const orderTotalCents =
    eligibility.orderTotalCents ?? parseDecimalToCentsStrict(order.total) ?? 0;
  const rawRequiredMinimumCents =
    orderTotalCents > 0 ? computeRequiredMinimumCents(orderTotalCents) : null;
  const requiredMinimumCents =
    eligibility.requiredMinimumCents ?? rawRequiredMinimumCents ?? 0;
  const derivedStatus =
    eligibility.derivedStatus ??
    (orderTotalCents > 0 && !hasInvalidAmount
      ? derivePaymentStatus(verifiedTotalCents, orderTotalCents)
      : null);

  const { maxEligibleCents } = computeLimits({
    orderTotalCents,
    requiredMinimumCents,
    verifiedTotalCents,
  });

  const quickAmountsCents = eligibility.eligible
    ? buildQuickAmountsCents({
        orderTotalCents,
        verifiedTotalCents,
        requiredMinimumCents,
        maxEligibleCents,
      })
    : [];

  return {
    order_id: order.id,
    order_number: order.order_number,
    order_type: order.order_type,
    order_status: order.status,
    initial_payment_method: order.payment_method || null,
    payment_status: derivedStatus,
    total: roundMoney(orderTotalCents / 100),
    verified_total: roundMoney(verifiedTotalCents / 100),
    remaining_balance: roundMoney(Math.max(0, maxEligibleCents) / 100),
    minimum_required_total: roundMoney(requiredMinimumCents / 100),
    minimum_additional_payment: eligibility.eligible
      ? roundMoney(Math.max(0, requiredMinimumCents - verifiedTotalCents) / 100)
      : 0,
    can_record_payment: eligibility.eligible,
    reason_code: eligibility.reason_code,
    reason_message: eligibility.reason_message,
    quick_amounts: quickAmountsCents.map((c) => roundMoney(c / 100)),
  };
};

exports.getRestrictedPaymentSummary = async (conn, orderId) => {
  const lifecycle = await resolveLifecycleByOrder(conn, { orderId });

  if (lifecycle.status !== "OK") {
    if (!lifecycle.order) {
      return buildSummary({ order: null, estimation: null, paymentRows: [] });
    }

    const [paymentRows] = await conn.query(
      `SELECT amount, status FROM payment_transactions WHERE order_id = ?`,
      [orderId],
    );

    const summary = buildSummary({
      order: lifecycle.order,
      estimation: null,
      paymentRows,
    });

    return {
      ...summary,
      can_record_payment: false,
      reason_code: REASON.LIFECYCLE_INCONSISTENT,
      reason_message: REASON_MESSAGE.LIFECYCLE_INCONSISTENT,
      quick_amounts: [],
    };
  }

  const [paymentRows] = await conn.query(
    `SELECT amount, status FROM payment_transactions WHERE order_id = ?`,
    [orderId],
  );

  return buildSummary({
    order: lifecycle.order,
    estimation: lifecycle.estimation || null,
    paymentRows,
  });
};

exports.buildPaymentSummaryFromRows = buildSummary;

exports.recordCashPayment = async ({ pool, orderId, amountRaw, verifiedByUserId }) => {
  const parsedAmount = parseStrictMoneyToCents(amountRaw);
  if (!parsedAmount) {
    return {
      httpStatus: 400,
      body: {
        message: REASON_MESSAGE.INVALID_AMOUNT,
        reason_code: REASON.INVALID_AMOUNT,
      },
    };
  }
  const { amountCents } = parsedAmount;
  const amountDecimalString = centsToDecimalString(amountCents);

  let conn = null;
  let transactionActive = false;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const lifecycle = await resolveLifecycleByOrder(conn, {
      orderId,
      lockOrder: true,
      lockBlueprint: true,
      lockEstimation: true,
    });

    if (
      lifecycle.status !== "OK" ||
      !lifecycle.order ||
      !lifecycle.blueprint ||
      !lifecycle.estimation
    ) {
      await conn.rollback();
      transactionActive = false;
      return {
        httpStatus: 409,
        body: {
          message: REASON_MESSAGE.LIFECYCLE_INCONSISTENT,
          reason_code: REASON.LIFECYCLE_INCONSISTENT,
        },
      };
    }

    const order = lifecycle.order;
    const estimation = lifecycle.estimation;

    const [lockedRows] = await conn.query(
      `SELECT id, amount, payment_method, status
       FROM payment_transactions
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    const {
      verifiedCents: verifiedTotalBeforeCents,
      hasPendingPayment,
      hasInvalidAmount,
    } = summarizePaymentRowsStrict(lockedRows);

    const hasPayMongoSessionData = Boolean(
      order.paymongo_session_id || order.payment_url,
    );

    const eligibility = evaluate({
      order,
      estimation,
      verifiedTotalCents: verifiedTotalBeforeCents,
      hasPendingPayment,
      hasInvalidAmount,
      hasPayMongoSessionData,
    });

    if (!eligibility.eligible) {
      await conn.rollback();
      transactionActive = false;
      return {
        httpStatus: httpStatusForReason(eligibility.reason_code),
        body: {
          message: eligibility.reason_message,
          reason_code: eligibility.reason_code,
        },
      };
    }

    const {
      orderTotalCents,
      requiredMinimumCents,
      derivedStatus: derivedPreviousPaymentStatus,
    } = eligibility;

    const { minEligibleCents, maxEligibleCents } = computeLimits({
      orderTotalCents,
      requiredMinimumCents,
      verifiedTotalCents: verifiedTotalBeforeCents,
    });

    if (amountCents < minEligibleCents) {
      await conn.rollback();
      transactionActive = false;
      return {
        httpStatus: 400,
        body: {
          message: REASON_MESSAGE.AMOUNT_BELOW_MINIMUM,
          reason_code: REASON.AMOUNT_BELOW_MINIMUM,
        },
      };
    }
    if (amountCents > maxEligibleCents) {
      await conn.rollback();
      transactionActive = false;
      return {
        httpStatus: 400,
        body: {
          message: REASON_MESSAGE.AMOUNT_EXCEEDS_BALANCE,
          reason_code: REASON.AMOUNT_EXCEEDS_BALANCE,
        },
      };
    }

    const projectedTotalCents = verifiedTotalBeforeCents + amountCents;

    if (projectedTotalCents > orderTotalCents) {
      await conn.rollback();
      transactionActive = false;
      return {
        httpStatus: 400,
        body: {
          message: REASON_MESSAGE.AMOUNT_EXCEEDS_BALANCE,
          reason_code: REASON.AMOUNT_EXCEEDS_BALANCE,
        },
      };
    }

    const nextStatus =
      projectedTotalCents === orderTotalCents
        ? "paid"
        : projectedTotalCents > 0
          ? "partial"
          : "unpaid";

    const [insertResult] = await conn.execute(
      `INSERT INTO payment_transactions
        (order_id, amount, payment_method, proof_url, verified_by, verified_at, status, notes)
       VALUES (?, ?, 'cash', NULL, ?, NOW(), 'verified', ?)`,
      [orderId, amountDecimalString, verifiedByUserId, "Cash payment recorded at store."],
    );

    if (
      insertResult.affectedRows !== 1 ||
      !Number.isSafeInteger(insertResult.insertId) ||
      insertResult.insertId <= 0
    ) {
      await conn.rollback();
      transactionActive = false;
      return {
        httpStatus: 409,
        body: { message: "Failed to record the payment. Please try again." },
      };
    }

    const [updateResult] = await conn.execute(
      `UPDATE orders
       SET payment_status = ?
       WHERE id = ?
         AND order_type = 'blueprint'
         AND payment_status = ?
         AND paymongo_session_id IS NULL
         AND payment_url IS NULL`,
      [nextStatus, orderId, derivedPreviousPaymentStatus],
    );

    if (updateResult.affectedRows !== 1) {
      await conn.rollback();
      transactionActive = false;
      return {
        httpStatus: 409,
        body: { message: "This order's state changed. Please refresh and try again." },
      };
    }

    const [finalPaymentRows] = await conn.query(
      `SELECT id, amount, payment_method, status
       FROM payment_transactions
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    const {
      verifiedCents: finalVerifiedCents,
      hasPendingPayment: finalHasPendingRow,
      hasInvalidAmount: finalHasInvalidAmount,
    } = summarizePaymentRowsStrict(finalPaymentRows);

    const insertedRow = finalPaymentRows.find(
      (row) => Number(row.id) === Number(insertResult.insertId),
    );
    const insertedRowCents = insertedRow
      ? parseDecimalToCentsStrict(insertedRow.amount)
      : null;

    const finalStatus =
      finalHasInvalidAmount || finalVerifiedCents > orderTotalCents
        ? null
        : finalVerifiedCents === orderTotalCents
          ? "paid"
          : finalVerifiedCents > 0
            ? "partial"
            : "unpaid";

    const [[reReadOrderRow]] = await conn.query(
      `SELECT payment_status, paymongo_session_id, payment_url, status, order_type
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    const finalConditionsMet =
      !finalHasInvalidAmount &&
      insertResult.affectedRows === 1 &&
      Number.isSafeInteger(insertResult.insertId) &&
      insertResult.insertId > 0 &&
      Boolean(insertedRow) &&
      normalize(insertedRow.status) === "verified" &&
      normalize(insertedRow.payment_method) === "cash" &&
      insertedRowCents !== null &&
      insertedRowCents === amountCents &&
      finalVerifiedCents === projectedTotalCents &&
      finalVerifiedCents <= orderTotalCents &&
      !finalHasPendingRow &&
      finalStatus !== null &&
      finalStatus === nextStatus &&
      Boolean(reReadOrderRow) &&
      normalize(reReadOrderRow.payment_status) === finalStatus &&
      reReadOrderRow.paymongo_session_id === null &&
      reReadOrderRow.payment_url === null &&
      ALLOWED_STATUSES.includes(normalize(reReadOrderRow.status)) &&
      normalize(reReadOrderRow.order_type) === "blueprint";

    if (!finalConditionsMet) {
      await conn.rollback();
      transactionActive = false;
      return {
        httpStatus: 409,
        body: { message: "Payment verification mismatch. Please contact support." },
      };
    }

    // Receipt is created inside this same transaction, only after every
    // integrity check above has passed, and before commit -- a failure
    // here throws, is caught below, and rolls back the payment
    // transaction and order.payment_status update together with it.
    const receiptResult = await ensureReceiptForVerifiedPayment(conn, {
      orderId,
      paymentTransactionId: insertResult.insertId,
      issuedByUserId: verifiedByUserId,
    });

    const preparedAuditRecord = {
      id: insertResult.insertId,
      old: {
        payment_status: derivedPreviousPaymentStatus,
        verified_total: roundMoney(verifiedTotalBeforeCents / 100),
      },
      new: {
        order_id: orderId,
        payment_method: "cash",
        amount: centsToAmount(amountCents),
        verified_total: roundMoney(finalVerifiedCents / 100),
        remaining_balance: roundMoney((orderTotalCents - finalVerifiedCents) / 100),
        payment_status: finalStatus,
        receipt_id: receiptResult.receiptId,
        receipt_number: receiptResult.receiptNumber,
        payment_label: receiptResult.paymentLabel,
      },
    };

    await conn.commit();
    transactionActive = false;

    return {
      httpStatus: 200,
      auditRecord: preparedAuditRecord,
      body: {
        success: true,
        message: "Cash payment recorded successfully.",
        payment_transaction_id: insertResult.insertId,
        amount_recorded: centsToAmount(amountCents),
        verified_total: roundMoney(finalVerifiedCents / 100),
        remaining_balance: roundMoney((orderTotalCents - finalVerifiedCents) / 100),
        payment_status: finalStatus,
        receipt_id: receiptResult.receiptId,
        receipt_number: receiptResult.receiptNumber,
        payment_label: receiptResult.paymentLabel,
      },
    };
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
    }
    console.error("[blueprintCashPaymentService recordCashPayment]", err);
    return { httpStatus: 500, body: { message: "Failed to record cash payment." } };
  } finally {
    if (conn) conn.release();
  }
};

exports.REASON = REASON;