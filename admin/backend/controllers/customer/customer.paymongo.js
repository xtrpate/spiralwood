// controllers/customer/customer.paymongo.js

const crypto = require("crypto");
const db = require("../../config/db");
const {
  retrieveCheckoutSession,
} = require("../../services/paymongoService");
const { writeAuditLogSafe } = require("../../middleware/auditLog");
const {
  emitOrderStatusUpdate,
  emitOrderPaymentUpdate,
} = require("../../utils/orderStatusSocket");
const {
  createStandardOnlineReceipt,
} = require("../../services/receiptService");
const {
  ensureReceiptForVerifiedPayment,
} = require("../../services/blueprintReceiptService");
const {
  resolveLifecycleByOrder,
} = require("../../services/blueprintLifecycleService");
const {
  isPostProductionWithdrawal,
  loadApprovedCancellationDecision,
} = require("../../services/blueprintCancellationPolicy");
const {
  resolveInitialOnlinePaymentAmount,
  validateInitialPayMongoSessionContext,
  analyzeInitialPayMongoSession,
  summarizeVerifiedPaymentRows,
} = require("../../services/blueprintInitialOnlinePaymentService");
const {
  calcDownPaymentAmount,
  parseDecimalToCentsStrict,
  centsToDecimalString,
} = require("../../utils/paymentAmounts");
const {
  resolvePaymongoReceiptMethod,
  resolvePaymongoReceiptMethodFromSession,
} = require("../../utils/paymongoReceiptChannel");

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

const registerPaymongoWebhookEvent = async (
  conn,
  { eventId, eventType, livemode },
) => {
  try {
    await conn.query(
      `INSERT INTO paymongo_webhook_events
       (
         event_id,
         event_type,
         livemode,
         status,
         received_at,
         processed_at,
         last_error
       )
       VALUES (?, ?, ?, 'processing', NOW(), NULL, NULL)`,
      [eventId, eventType, livemode ? 1 : 0],
    );

    return {
      alreadyProcessed: false,
      status: "processing",
    };
  } catch (error) {
    /*
     * event_id is the PRIMARY KEY.
     *
     * If another webhook delivery with the same event ID is already
     * committed, MySQL raises ER_DUP_ENTRY.
     *
     * This is intentionally handled at the database level so two
     * concurrent deliveries cannot both become the owner of the
     * same event.
     */
    if (error?.code !== "ER_DUP_ENTRY") {
      throw error;
    }

    const [[existingEvent]] = await conn.query(
      `SELECT
         event_id,
         event_type,
         livemode,
         status,
         received_at,
         processed_at
       FROM paymongo_webhook_events
       WHERE event_id = ?
       LIMIT 1
       FOR UPDATE`,
      [eventId],
    );

    if (!existingEvent) {
      throw error;
    }

    if (
      existingEvent.status === "processed" ||
      existingEvent.status === "ignored"
    ) {
      return {
        alreadyProcessed: true,
        status: existingEvent.status,
        existingEvent,
      };
    }

    /*
     * Under the new transaction design, a "processing" row should
     * never remain committed because event registration and payment
     * processing are committed together.
     *
     * If one is encountered, do not process it concurrently.
     * Returning an error causes PayMongo to retry the delivery.
     */
    const processingError = new Error(
      `PayMongo webhook event ${eventId} is already being processed.`,
    );

    processingError.code = "PAYMONGO_WEBHOOK_EVENT_PROCESSING";

    throw processingError;
  }
};

const markPaymongoWebhookEventProcessed = async (conn, eventId) => {
  const [result] = await conn.query(
    `UPDATE paymongo_webhook_events
     SET
       status = 'processed',
       processed_at = NOW(),
       last_error = NULL
     WHERE event_id = ?
       AND status = 'processing'`,
    [eventId],
  );

  if (result.affectedRows !== 1) {
    throw new Error(
      `Unable to mark PayMongo webhook event ${eventId} as processed.`,
    );
  }
};

const parsePaymongoSignature = (header) => {
  const parts = String(header || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const result = {
    timestamp: null,
    testSignature: null,
    liveSignature: null,
  };

  for (const part of parts) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (key === "t") {
      result.timestamp = value;
    } else if (key === "te") {
      result.testSignature = value;
    } else if (key === "li") {
      result.liveSignature = value;
    }
  }

  return result;
};

const safeCompare = (expected, received) => {
  if (!expected || !received) {
    return false;
  }

  const expectedBuffer = Buffer.from(String(expected), "utf8");
  const receivedBuffer = Buffer.from(String(received), "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const verifyPaymongoSignature = (rawBody, signatureHeader, secret) => {
  if (!rawBody || !signatureHeader || !secret) {
    return false;
  }

  const { timestamp, testSignature, liveSignature } =
    parsePaymongoSignature(signatureHeader);

  if (!timestamp) {
    return false;
  }

  const timestampNumber = Number(timestamp);

  if (!Number.isInteger(timestampNumber)) {
    return false;
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);

  if (
    Math.abs(currentTimestamp - timestampNumber) >
    WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const signaturePayload = `${timestamp}.${rawBody}`;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signaturePayload)
    .digest("hex");

  const isTestMode = String(process.env.PAYMONGO_SECRET_KEY || "").startsWith(
    "sk_test_",
  );

  const receivedSignature = isTestMode ? testSignature : liveSignature;

  return safeCompare(expectedSignature, receivedSignature);
};

const getPaymongoAmountCents = (session) => {
  const amount = Number(session?.attributes?.payments?.[0]?.attributes?.amount);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};

const amountsMatchOrderTotal = (providerAmountCents, orderTotal) => {
  if (!Number.isSafeInteger(providerAmountCents)) return false;
  const expectedCents = Math.round(Number(orderTotal || 0) * 100);
  return providerAmountCents === expectedCents;
};

const normalizeWebhookValue = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const extractBlueprintWebhookPaidAmount = (session) => {
  const attributes = session?.attributes || {};

  const payments = Array.isArray(attributes.payments)
    ? attributes.payments
    : [];

  const paidPayments = payments.filter(
    (payment) => normalizeWebhookValue(payment?.attributes?.status) === "paid",
  );

  if (paidPayments.length > 1) {
    return {
      ok: false,
      reason: "AMBIGUOUS_SUCCESSFUL_PAYMENTS",
      paidCents: null,
    };
  }

  const successfulPayment = paidPayments[0] || null;

  const paymentIntent = attributes.payment_intent || null;

  const intentSucceeded =
    normalizeWebhookValue(paymentIntent?.attributes?.status) === "succeeded";

  const paymentAmountCents = successfulPayment
    ? Number(successfulPayment?.attributes?.amount)
    : null;

  const intentAmountCents = intentSucceeded
    ? Number(paymentIntent?.attributes?.amount)
    : null;

  if (
    successfulPayment &&
    (!Number.isSafeInteger(paymentAmountCents) || paymentAmountCents <= 0)
  ) {
    return {
      ok: false,
      reason: "INVALID_PROVIDER_PAID_AMOUNT",
      paidCents: null,
    };
  }

  if (
    intentSucceeded &&
    !successfulPayment &&
    (!Number.isSafeInteger(intentAmountCents) || intentAmountCents <= 0)
  ) {
    return {
      ok: false,
      reason: "INVALID_PROVIDER_PAID_AMOUNT",
      paidCents: null,
    };
  }

  if (
    paymentAmountCents !== null &&
    intentAmountCents !== null &&
    Number.isSafeInteger(intentAmountCents) &&
    paymentAmountCents !== intentAmountCents
  ) {
    return {
      ok: false,
      reason: "PROVIDER_PAID_AMOUNT_MISMATCH",
      paidCents: null,
    };
  }

  const paidCents =
    successfulPayment !== null
      ? paymentAmountCents
      : intentSucceeded
        ? intentAmountCents
        : null;

  if (!Number.isSafeInteger(paidCents) || paidCents <= 0) {
    return {
      ok: false,
      reason: "NO_SUCCESSFUL_PAYMENT",
      paidCents: null,
    };
  }

  return {
    ok: true,
    reason: null,
    paidCents,
    paymentMethodSnapshot:
      resolvePaymongoReceiptMethod(successfulPayment),
  };
};

const resolveBlueprintWebhookPaymentPurpose = ({
  session,
  orderId,
  verifiedTotalCents,
}) => {
  const metadata =
    session?.attributes?.metadata &&
    typeof session.attributes.metadata === "object" &&
    !Array.isArray(session.attributes.metadata)
      ? session.attributes.metadata
      : {};

  const metadataOrderId =
    metadata.order_id !== undefined &&
    metadata.order_id !== null &&
    String(metadata.order_id).trim() !== ""
      ? String(metadata.order_id).trim()
      : null;

  const metadataOrderType =
    metadata.order_type !== undefined &&
    metadata.order_type !== null &&
    String(metadata.order_type).trim() !== ""
      ? normalizeWebhookValue(metadata.order_type)
      : null;

  const metadataPurpose =
    metadata.payment_purpose !== undefined &&
    metadata.payment_purpose !== null &&
    String(metadata.payment_purpose).trim() !== ""
      ? normalizeWebhookValue(metadata.payment_purpose)
      : null;

  if (metadataOrderId !== null && metadataOrderId !== String(orderId)) {
    return {
      ok: false,
      reason: "SESSION_ORDER_ID_MISMATCH",
    };
  }

  if (metadataOrderType !== null && metadataOrderType !== "blueprint") {
    return {
      ok: false,
      reason: "SESSION_ORDER_TYPE_MISMATCH",
    };
  }

  if (
    metadataPurpose !== null &&
    !["initial_payment", "remaining_balance"].includes(metadataPurpose)
  ) {
    return {
      ok: false,
      reason: "SESSION_PAYMENT_PURPOSE_INVALID",
    };
  }

  /*
   * New WISDOM sessions explicitly identify their payment purpose.
   *
   * Older blueprint sessions may not contain payment_purpose.
   * In that case:
   *   verifiedTotal = 0  -> initial payment
   *   verifiedTotal > 0  -> remaining balance
   */
  const purpose =
    metadataPurpose ||
    (Number(verifiedTotalCents || 0) > 0
      ? "remaining_balance"
      : "initial_payment");

  return {
    ok: true,
    purpose,
    metadata,
    legacy: metadataPurpose === null,
  };
};

const processBlueprintPayMongoWebhook = async (
  conn,
  { orderId, sessionId, session },
) => {
  const parsedOrderId = Number(orderId);
  const providerSessionId = String(sessionId || "").trim();

  if (!Number.isSafeInteger(parsedOrderId) || parsedOrderId <= 0) {
    return {
      ok: false,
      httpStatus: 400,
      reason: "INVALID_ORDER_ID",
      message: "Invalid blueprint order reference.",
    };
  }

  if (!/^cs_[A-Za-z0-9]+$/.test(providerSessionId)) {
    return {
      ok: false,
      httpStatus: 400,
      reason: "INVALID_SESSION_ID",
      message: "Invalid PayMongo Checkout Session reference.",
    };
  }

  const lifecycle = await resolveLifecycleByOrder(conn, {
    orderId: parsedOrderId,
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
    return {
      ok: false,
      httpStatus: 409,
      reason: "LIFECYCLE_INCONSISTENT",
      message: "Blueprint payment state could not be resolved safely.",
    };
  }

  const order = lifecycle.order;

  if (normalizeWebhookValue(order.order_type) !== "blueprint") {
    return {
      ok: false,
      httpStatus: 409,
      reason: "NOT_BLUEPRINT",
      message: "This payment does not belong to a blueprint order.",
    };
  }

  const cancellationDecision =
    normalizeWebhookValue(order.status) === "cancelled"
      ? await loadApprovedCancellationDecision(conn, order.id, {
          forUpdate: true,
        })
      : null;
  const collectiblePostProductionWithdrawal =
    normalizeWebhookValue(order.status) === "cancelled" &&
    isPostProductionWithdrawal(cancellationDecision);

  if (
    normalizeWebhookValue(order.status) === "completed" ||
    (normalizeWebhookValue(order.status) === "cancelled" &&
      !collectiblePostProductionWithdrawal)
  ) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "ORDER_CLOSED",
      message: "This blueprint order is already closed.",
    };
  }

  const orderTotalCents = parseDecimalToCentsStrict(order.total);

  const estimationTotalCents = parseDecimalToCentsStrict(
    lifecycle.estimation.grand_total,
  );

  if (
    orderTotalCents === null ||
    orderTotalCents <= 0 ||
    estimationTotalCents === null ||
    estimationTotalCents <= 0 ||
    orderTotalCents !== estimationTotalCents
  ) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "ORDER_TOTAL_INCONSISTENT",
      message:
        "The blueprint order total does not match its approved quotation.",
    };
  }

  /*
   * Lock every real payment transaction belonging to the order.
   * This serializes:
   *   - duplicate webhook delivery
   *   - customer redirect verification
   *   - concurrent payment actions
   */
  const [paymentRows] = await conn.query(
    `SELECT
       id,
       amount,
       payment_method,
       proof_url,
       status
     FROM payment_transactions
     WHERE order_id = ?
     ORDER BY id
     FOR UPDATE`,
    [parsedOrderId],
  );

  /*
   * Exact provider-session idempotency.
   *
   * proof_url is the existing PayMongo provider-reference field used
   * by the current blueprint verification flow.
   */
  const existingProviderPayment = paymentRows.find(
    (row) =>
      normalizeWebhookValue(row.payment_method) === "paymongo" &&
      normalizeWebhookValue(row.status) === "verified" &&
      String(row.proof_url || "").trim() === providerSessionId,
  );

  if (existingProviderPayment) {
    const existingAmountCents = parseDecimalToCentsStrict(
      existingProviderPayment.amount,
    );

    return {
      ok: true,
      alreadyProcessed: true,
      paymentTransactionId: Number(existingProviderPayment.id),
      paymentStatus: normalizeWebhookValue(order.payment_status) || "unpaid",
      orderStatus: order.status,
      oldPaymentStatus: normalizeWebhookValue(order.payment_status) || "unpaid",
      oldOrderStatus: order.status,
      amountCents: existingAmountCents,
      paymentPurpose: null,
      providerSessionPresent: true,
    };
  }

  /*
   * A webhook may contain metadata for an old session that is no
   * longer active. Never attach such a payment to the order.
   */
  if (String(order.paymongo_session_id || "").trim() !== providerSessionId) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "STALE_PROVIDER_SESSION",
      message:
        "This PayMongo session is no longer the active payment session for the order.",
    };
  }

  const paymentSummary = summarizeVerifiedPaymentRows(paymentRows);

  if (paymentSummary.hasInvalidAmount) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "INVALID_PAYMENT_RECORD",
      message: "Existing payment records for this order are inconsistent.",
    };
  }

  if (paymentSummary.hasPendingPayment) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "PENDING_PAYMENT_EXISTS",
      message: "Another payment is already awaiting review for this order.",
    };
  }

  if (paymentSummary.verifiedTotalCents > orderTotalCents) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "PAYMENT_TOTAL_OVER_ORDER",
      message: "Existing verified payments already exceed the order total.",
    };
  }

  const purposeResult = resolveBlueprintWebhookPaymentPurpose({
    session,
    orderId: parsedOrderId,
    verifiedTotalCents: paymentSummary.verifiedTotalCents,
  });

  if (!purposeResult.ok) {
    return {
      ok: false,
      httpStatus: 409,
      reason: purposeResult.reason,
      message:
        "The PayMongo session metadata does not match this blueprint order.",
    };
  }

  const paymentPurpose = purposeResult.purpose;

  let paymentAmountCents = null;
  let paymentMethodSnapshot = "paymongo";

  if (paymentPurpose === "initial_payment") {
    /*
     * Reuse the existing strict initial-payment validation.
     * This keeps webhook verification subject to the same
     * 30%-100% rules already used by customer redirect verification.
     */
    if (paymentSummary.verifiedTotalCents > 0) {
      return {
        ok: false,
        httpStatus: 409,
        reason: "INITIAL_PAYMENT_ALREADY_EXISTS",
        message:
          "Another verified payment already exists for this blueprint order.",
      };
    }

    const amountBounds = resolveInitialOnlinePaymentAmount({
      orderTotalRaw: order.total,
      amountRaw: undefined,
    });

    if (!amountBounds.ok) {
      return {
        ok: false,
        httpStatus: 409,
        reason: "INVALID_INITIAL_PAYMENT_BOUNDS",
        message: "The initial blueprint payment amount could not be validated.",
      };
    }

    const providerContext = validateInitialPayMongoSessionContext(session, {
      orderId: parsedOrderId,
    });

    if (!providerContext.ok) {
      return {
        ok: false,
        httpStatus: 409,
        reason: providerContext.reason,
        message:
          "The PayMongo initial-payment session does not match this order.",
      };
    }

    const analysis = analyzeInitialPayMongoSession(session, {
      fallbackExpectedCents: amountBounds.minimumCents,
    });

    if (
      !analysis.ok ||
      !analysis.hasSuccessfulPayment ||
      !Number.isSafeInteger(analysis.expectedCents) ||
      !Number.isSafeInteger(analysis.paidCents)
    ) {
      return {
        ok: false,
        httpStatus: 409,
        reason: analysis.reason || "INVALID_INITIAL_PAYMENT_SESSION",
        message: "The PayMongo initial payment could not be verified safely.",
      };
    }

    const expectedAmountValidation = resolveInitialOnlinePaymentAmount({
      orderTotalRaw: order.total,
      amountRaw: centsToDecimalString(analysis.expectedCents),
    });

    if (!expectedAmountValidation.ok) {
      return {
        ok: false,
        httpStatus: 409,
        reason: "INVALID_INITIAL_PAYMENT_AMOUNT",
        message:
          "The PayMongo initial-payment amount is outside the allowed range.",
      };
    }

    if (analysis.paidCents !== analysis.expectedCents) {
      return {
        ok: false,
        httpStatus: 409,
        reason: "INITIAL_PROVIDER_AMOUNT_MISMATCH",
        message: "The PayMongo paid amount does not match the checkout amount.",
      };
    }

    paymentAmountCents = analysis.paidCents;
    paymentMethodSnapshot =
      analysis.paymentMethodSnapshot || "paymongo";
  } else {
    /*
     * Remaining balance:
     * PayMongo must have paid the exact current balance.
     */
    if (paymentSummary.verifiedTotalCents <= 0) {
      return {
        ok: false,
        httpStatus: 409,
        reason: "REMAINING_PAYMENT_WITHOUT_INITIAL_PAYMENT",
        message:
          "A verified initial payment is required before the remaining balance.",
      };
    }

    const remainingCents = orderTotalCents - paymentSummary.verifiedTotalCents;

    if (remainingCents <= 0) {
      return {
        ok: false,
        httpStatus: 409,
        reason: "ORDER_ALREADY_FULLY_PAID",
        message: "The blueprint order is already fully paid.",
      };
    }

    const providerResult = extractBlueprintWebhookPaidAmount(session);

    if (!providerResult.ok) {
      return {
        ok: false,
        httpStatus: 409,
        reason: providerResult.reason,
        message: "The PayMongo remaining payment could not be verified safely.",
      };
    }

    if (providerResult.paidCents !== remainingCents) {
      return {
        ok: false,
        httpStatus: 409,
        reason: "REMAINING_PROVIDER_AMOUNT_MISMATCH",
        message:
          "The PayMongo paid amount does not match the current remaining balance.",
      };
    }

    paymentAmountCents = remainingCents;
    paymentMethodSnapshot =
      providerResult.paymentMethodSnapshot || "paymongo";
  }

  if (!Number.isSafeInteger(paymentAmountCents) || paymentAmountCents <= 0) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "INVALID_PAYMENT_AMOUNT",
      message: "The PayMongo payment amount is invalid.",
    };
  }

  if (
    paymentSummary.verifiedTotalCents + paymentAmountCents >
    orderTotalCents
  ) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "PAYMENT_OVERPAYMENT",
      message: "Recording this PayMongo payment would exceed the order total.",
    };
  }

  const oldPaymentStatus =
    normalizeWebhookValue(order.payment_status) || "unpaid";

  const oldOrderStatus = order.status;

  const finalVerifiedCents =
    paymentSummary.verifiedTotalCents + paymentAmountCents;

  const nextPaymentStatus =
    finalVerifiedCents >= orderTotalCents
      ? "paid"
      : finalVerifiedCents > 0
        ? "partial"
        : "unpaid";

  let nextOrderStatus = order.status;

  if (
    paymentPurpose === "initial_payment" &&
    oldOrderStatus === "confirmed" &&
    lifecycle.contract?.signed_at
  ) {
    nextOrderStatus = "contract_released";
  }

  const [insertResult] = await conn.execute(
    `INSERT INTO payment_transactions
    (
      order_id,
      amount,
      payment_method,
      proof_url,
      paymongo_reference,
      verified_by,
      verified_at,
      status,
      notes
    )
   VALUES (?, ?, 'paymongo', ?, ?, NULL, NOW(), 'verified', ?)`,
    [
      order.id,
      centsToDecimalString(paymentAmountCents),
      providerSessionId,
      providerSessionId,
      paymentPurpose === "initial_payment"
        ? "Initial blueprint payment automatically verified via PayMongo webhook."
        : "Remaining blueprint payment automatically verified via PayMongo webhook.",
    ],
  );

  if (
    insertResult.affectedRows !== 1 ||
    !Number.isSafeInteger(insertResult.insertId) ||
    insertResult.insertId <= 0
  ) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "PAYMENT_INSERT_FAILED",
      message: "The PayMongo payment could not be recorded.",
    };
  }

  const [orderUpdateResult] = await conn.execute(
    `UPDATE orders
     SET payment_status = ?,
         status = ?,
         payment_url = NULL,
         paymongo_session_id = NULL,
         updated_at = NOW()
     WHERE id = ?
       AND paymongo_session_id = ?`,
    [nextPaymentStatus, nextOrderStatus, order.id, providerSessionId],
  );

  if (orderUpdateResult.affectedRows !== 1) {
    return {
      ok: false,
      httpStatus: 409,
      reason: "ORDER_STATE_UPDATE_FAILED",
      message:
        "The PayMongo payment could not be attached safely to the order.",
    };
  }

  return {
    ok: true,
    alreadyProcessed: false,
    paymentTransactionId: insertResult.insertId,
    paymentStatus: nextPaymentStatus,
    orderStatus: nextOrderStatus,
    oldPaymentStatus,
    oldOrderStatus,
    amountCents: paymentAmountCents,
    paymentPurpose,
    paymentMethodSnapshot,
    providerSessionPresent: true,
  };
};

const createReceiptIfNeeded = async (
  conn,
  order,
  paymentTransactionId,
  paymentMethodSnapshot = "paymongo",
) => {
  const [[existingReceipt]] = await conn.query(
    `SELECT id
     FROM receipts
     WHERE order_id = ?
       AND payment_transaction_id = ?
       AND receipt_type = 'pos_sale'
     LIMIT 1`,
    [order.id, paymentTransactionId],
  );

  if (existingReceipt) {
    return existingReceipt.id;
  }

  const [items] = await conn.query(
    `SELECT product_name, quantity, unit_price
     FROM order_items
     WHERE order_id = ?
     ORDER BY id ASC`,
    [order.id],
  );

  const receiptNumber = `OR-${Date.now()}`;

  const receipt = await createStandardOnlineReceipt(conn, {
    orderId: order.id,
    paymentTransactionId,
    receiptNumber,
    issuedTo: order.customer_name || order.walkin_customer_name || "Customer",
    issuedBy: order.customer_id,
    totalAmount: Number(order.total || 0),
    providerReference: order.paymongo_session_id || null,
    paymentMethodSnapshot,
    itemsSnapshot: JSON.stringify(items || []),
  });

  return receipt?.receiptId || null;
};

exports.handlePaymongoWebhook = async (req, res) => {
  const rawBody = req.rawBody;

  try {
    const webhookSecret = String(
      process.env.PAYMONGO_WEBHOOK_SECRET || "",
    ).trim();

    if (!webhookSecret) {
      console.error(
        "[PayMongo Webhook] PAYMONGO_WEBHOOK_SECRET is not configured.",
      );

      return res.status(500).json({
        message: "Webhook secret is not configured.",
      });
    }

    const signatureHeader = req.headers["paymongo-signature"];

    const isValidSignature = verifyPaymongoSignature(
      rawBody,
      signatureHeader,
      webhookSecret,
    );

    if (!isValidSignature) {
      console.warn("[PayMongo Webhook] Invalid signature.");

      return res.status(401).json({
        message: "Invalid webhook signature.",
      });
    }

    const payload = req.body;

    const eventData = payload?.data;

    const eventType = eventData?.attributes?.type || eventData?.type || null;

    const eventId = String(eventData?.id || "").trim() || null;

    const supportedPaymongoEventTypes = new Set([
      "checkout_session.payment.paid",
      "payment.failed",
      "qrph.expired",
    ]);

    /*
     * Unknown PayMongo events are acknowledged safely.
     *
     * Payment lifecycle events that WISDOM explicitly handles are:
     *
     *   checkout_session.payment.paid
     *   payment.failed
     *   qrph.expired
     *
     * The latter two are attempt-level events. They must NOT be treated
     * as Checkout Session expiry.
     */
    if (!supportedPaymongoEventTypes.has(eventType)) {
      return res.status(200).json({
        received: true,
        ignored: true,
        event_type: eventType,
      });
    }

    if (!eventId) {
      console.warn("[PayMongo Webhook] Missing PayMongo event ID.");

      return res.status(400).json({
        received: false,
        processed: false,
        message: "Missing PayMongo webhook event ID.",
      });
    }

    /*
     * PayMongo Hosted Checkout webhook structure:
     *
     * payload.data.attributes.data
     *    -> Checkout Session resource
     *
     * The current WISDOM checkout stores:
     * metadata.order_id
     * paymongo_session_id
     */

    const session = eventData?.attributes?.data || eventData?.data || null;

    const sessionId = String(session?.id || "").trim();

    const metadata = session?.attributes?.metadata || {};

    const metadataOrderId = Number(metadata?.order_id);

    /*
     * Receipt-channel enrichment only.
     *
     * PayMongo's authenticated Checkout Session retrieval includes the
     * payments array, including each paid Payment's source.type. Webhook
     * payloads can arrive without enough source detail for a customer-facing
     * receipt label, which previously caused a confirmed GCash checkout to be
     * stored as generic "paymongo" / displayed as "Online Payment".
     *
     * IMPORTANT:
     * - The original signed webhook payload remains the source for the
     *   existing amount/status/payment verification logic below.
     * - Retrieval failure does NOT reject or roll back a legitimate payment.
     * - Unknown/missing channel safely stays "paymongo".
     */
    let receiptPaymentMethodSnapshot =
      resolvePaymongoReceiptMethodFromSession(session);

    if (
      eventType === "checkout_session.payment.paid" &&
      /^cs_[A-Za-z0-9]+$/.test(sessionId)
    ) {
      try {
        const retrievedSession = await retrieveCheckoutSession(
          sessionId,
          { timeoutMs: 10000 },
        );

        if (
          String(retrievedSession?.id || "").trim() === sessionId
        ) {
          const retrievedMethod =
            resolvePaymongoReceiptMethodFromSession(retrievedSession);

          if (retrievedMethod !== "paymongo") {
            receiptPaymentMethodSnapshot = retrievedMethod;
          }
        }
      } catch {
        console.warn(
          "[PayMongo Webhook] Receipt channel enrichment unavailable; using safe fallback.",
        );
      }
    }

    if (!sessionId && !metadataOrderId) {
      console.warn(
        "[PayMongo Webhook] Missing Checkout Session ID and order ID.",
      );

      return res.status(200).json({
        received: true,
        ignored: true,
        reason: "missing_order_reference",
      });
    }

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const eventLivemode = Boolean(eventData?.attributes?.livemode);

      const webhookEventResult = await registerPaymongoWebhookEvent(conn, {
        eventId,
        eventType,
        livemode: eventLivemode,
      });

      /*
       * The same PayMongo event has already completed successfully.
       *
       * Do not execute any payment, receipt, order, or inventory logic.
       */
      if (webhookEventResult.alreadyProcessed) {
        await conn.rollback();

        console.log(
          `[PayMongo Webhook] Duplicate event ignored. ` +
            `event_id=${eventId} ` +
            `status=${webhookEventResult.status}`,
        );

        return res.status(200).json({
          received: true,
          processed: false,
          already_processed: true,
          event_id: eventId,
          event_type: eventType,
        });
      }

      /*
       * Attempt-level events do NOT create payment_transactions and do NOT
       * change the order's payment_status.
       *
       * PayMongo Checkout Sessions remain active across payment attempts.
       * A payment.failed or qrph.expired event only describes the current
       * payment attempt/payment method.
       *
       * The persistent webhook-event table records the event exactly once.
       */
      if (eventType === "payment.failed" || eventType === "qrph.expired") {
        await markPaymongoWebhookEventProcessed(conn, eventId);

        await conn.commit();

        console.log(
          `[PayMongo Webhook] Attempt event recorded. ` +
            `event_id=${eventId} ` +
            `event_type=${eventType}`,
        );

        return res.status(200).json({
          received: true,
          processed: true,
          attempt_event: true,
          event_id: eventId,
          event_type: eventType,
        });
      }

      let order = null;

      /*
       * Primary lookup:
       * WISDOM already stores the PayMongo Checkout Session ID.
       */
      if (sessionId) {
        const [rows] = await conn.query(
          `SELECT *
           FROM orders
           WHERE paymongo_session_id = ?
           LIMIT 1`,
          [sessionId],
        );

        order = rows[0] || null;
      }

      /*
       * Fallback lookup:
       * The Checkout Session metadata contains WISDOM's order ID.
       */
      if (!order && Number.isInteger(metadataOrderId) && metadataOrderId > 0) {
        const [rows] = await conn.query(
          `SELECT *
           FROM orders
           WHERE id = ?
           LIMIT 1
           FOR UPDATE`,
          [metadataOrderId],
        );

        order = rows[0] || null;
      }

      if (!order) {
        await conn.rollback();

        console.warn(
          `[PayMongo Webhook] Order not found. session=${sessionId}`,
        );

        /*
         * Return 200 so PayMongo does not repeatedly retry an event
         * that WISDOM cannot associate with an order.
         */
        return res.status(200).json({
          received: true,
          ignored: true,
          reason: "order_not_found",
        });
      }

      /*
       * Blueprint/custom orders use the same PayMongo webhook as
       * standard orders, but they need their own reconciliation rules
       * because one blueprint order can contain:
       *
       *   initial payment
       *   +
       *   remaining balance payment
       *
       * Standard customer orders continue through the existing webhook
       * logic below.
       */
      const orderType = String(order.order_type || "standard")
        .trim()
        .toLowerCase();

      if (orderType === "blueprint") {
        const blueprintWebhookResult = await processBlueprintPayMongoWebhook(
          conn,
          {
            orderId: order.id,
            sessionId,
            session,
          },
        );

        if (!blueprintWebhookResult.ok) {
          await conn.rollback();

          console.warn(
            "[PayMongo Webhook] Blueprint payment rejected.",
            JSON.stringify({
              orderId: order.id,
              orderNumber: order.order_number,
              reason: blueprintWebhookResult.reason,
            }),
          );

          return res
            .status(Number(blueprintWebhookResult.httpStatus) || 409)
            .json({
              received: true,
              processed: false,
              message:
                blueprintWebhookResult.message ||
                "Blueprint payment could not be reconciled safely.",
              reason: blueprintWebhookResult.reason,
              order_id: order.id,
            });
        }

        /*
         * Blueprint PayMongo payments must complete the full payment
         * lifecycle inside the SAME database transaction:
         *
         *   payment transaction
         *        ↓
         *   order payment/status update
         *        ↓
         *   blueprint receipt
         *        ↓
         *   material reservation
         *        ↓
         *   COMMIT
         *
         * The webhook has no authenticated staff/admin user, so the
         * receipt is intentionally issued_by = NULL. The audit log below
         * records actorType = "webhook".
         *
         * alreadyProcessed is handled separately so a duplicate webhook
         * does not attempt to recreate the receipt unnecessarily.
         */
        const blueprintReceiptResult = await ensureReceiptForVerifiedPayment(
          conn,
          {
            orderId: order.id,
            paymentTransactionId: blueprintWebhookResult.paymentTransactionId,
            issuedByUserId: null,
            paymentMethodSnapshot:
              receiptPaymentMethodSnapshot !== "paymongo"
                ? receiptPaymentMethodSnapshot
                : blueprintWebhookResult.paymentMethodSnapshot || "paymongo",
          },
        );

        await markPaymongoWebhookEventProcessed(conn, eventId);

        await conn.commit();

        const paymentStatusChanged =
          String(blueprintWebhookResult.oldPaymentStatus || "")
            .trim()
            .toLowerCase() !==
          String(blueprintWebhookResult.paymentStatus || "")
            .trim()
            .toLowerCase();

        const orderStatusChanged =
          String(blueprintWebhookResult.oldOrderStatus || "")
            .trim()
            .toLowerCase() !==
          String(blueprintWebhookResult.orderStatus || "")
            .trim()
            .toLowerCase();

        const io = req.app.get("io");

        if (orderStatusChanged && blueprintWebhookResult.orderStatus) {
          emitOrderStatusUpdate(io, {
            orderId: order.id,
            orderNumber: order.order_number,
            status: blueprintWebhookResult.orderStatus,
            customerId: order.customer_id,
          });
        } else if (paymentStatusChanged) {
          emitOrderPaymentUpdate(io, {
            orderId: order.id,
            orderNumber: order.order_number,
            paymentStatus: blueprintWebhookResult.paymentStatus,
            paymentMethod: "paymongo",
            paymentTransactionId: blueprintWebhookResult.paymentTransactionId,
            customerId: order.customer_id,
          });
        }

        await writeAuditLogSafe({
          userId: null,
          action: "confirm_paymongo_webhook_payment",
          tableName: "payment_transactions",
          recordId: blueprintWebhookResult.paymentTransactionId,
          oldValues: {
            order_id: order.id,
            order_status: blueprintWebhookResult.oldOrderStatus || null,
            payment_status: blueprintWebhookResult.oldPaymentStatus || null,
            payment_purpose: blueprintWebhookResult.paymentPurpose || null,
            payment_transaction_existed: Boolean(
              blueprintWebhookResult.alreadyProcessed,
            ),
          },
          newValues: {
            order_id: order.id,
            payment_transaction_id: blueprintWebhookResult.paymentTransactionId,
            payment_transaction_created:
              !blueprintWebhookResult.alreadyProcessed,
            amount: Number(blueprintWebhookResult.amountCents || 0) / 100,
            payment_method: "paymongo",
            payment_purpose: blueprintWebhookResult.paymentPurpose || null,
            payment_transaction_status: "verified",
            order_status: blueprintWebhookResult.orderStatus || null,
            payment_status: blueprintWebhookResult.paymentStatus || null,
            event_type: eventType,
            webhook_event_id: eventId,
            provider_session_present: true,
          },
          ipAddress: req.ip || null,
          actorType: "webhook",
          responseStatus: 200,
        });

        return res.status(200).json({
          received: true,
          processed: true,
          already_processed: Boolean(blueprintWebhookResult.alreadyProcessed),
          event_type: eventType,
          order_id: order.id,
          order_number: order.order_number,
          payment_status: blueprintWebhookResult.paymentStatus || null,
        });
      }

      /*
       * Idempotency:
       * PayMongo may deliver the same webhook more than once.
       * Do not create another payment transaction if one already exists.
       */
      let paymentTransactionCreated = false;

      let [[paymentTransaction]] = await conn.query(
        `SELECT id, amount, status
         FROM payment_transactions
         WHERE order_id = ?
           AND LOWER(payment_method) = 'paymongo'
           AND LOWER(status) = 'verified'
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE`,
        [order.id],
      );

      const providerAmountCents = getPaymongoAmountCents(session);

      const successfulProviderPayment =
        Array.isArray(session?.attributes?.payments)
          ? session.attributes.payments.find(
              (payment) =>
                normalizeWebhookValue(payment?.attributes?.status) === "paid",
            ) || null
          : null;

      const providerPaymentId =
        String(successfulProviderPayment?.id || "").trim() || null;

      const paymentMethodSnapshot =
        receiptPaymentMethodSnapshot !== "paymongo"
          ? receiptPaymentMethodSnapshot
          : resolvePaymongoReceiptMethod(successfulProviderPayment);

      if (!amountsMatchOrderTotal(providerAmountCents, order.total)) {
        await conn.rollback();

        console.warn(
          "[PayMongo Webhook] Amount mismatch.",
          JSON.stringify({
            orderId: order.id,
            orderNumber: order.order_number,
            expectedCents: Math.round(Number(order.total || 0) * 100),
            receivedCents: providerAmountCents,
            sessionId,
          }),
        );

        return res.status(400).json({
          message: "Payment amount does not match the order total.",
        });
      }

      if (!paymentTransaction) {
        const amountFromWebhook = providerAmountCents / 100;

        /*
         * Store the Checkout Session ID as the provider reference.
         * The existing system already uses PayMongo session information
         * when verifying payments.
         */
        const [insertResult] = await conn.query(
          `INSERT INTO payment_transactions
   (
     order_id,
     amount,
     payment_method,
     proof_url,
     paymongo_reference,
     status,
     verified_at,
     notes
   )
 VALUES (?, ?, 'paymongo', ?, ?, 'verified', NOW(), ?)`,
          [
            order.id,
            amountFromWebhook,
            sessionId || "",
            sessionId || null,
            "Automatically verified via PayMongo webhook.",
          ],
        );

        paymentTransaction = {
          id: insertResult.insertId,
          amount: amountFromWebhook,
          status: "verified",
        };
        paymentTransactionCreated = true;
      }

      /*
       * Match the existing WISDOM payment state used by
       * customer.orders.verifyPayment().
       */
      await conn.query(
        `UPDATE orders
         SET payment_status = 'paid',
             status = 'confirmed'
         WHERE id = ?`,
        [order.id],
      );

      /*
       * Create the normal online receipt if one does not already exist.
       * This keeps webhook processing safe when the customer also
       * returns through the existing success URL.
       */
      const receiptId = await createReceiptIfNeeded(
        conn,
        order,
        paymentTransaction.id,
        paymentMethodSnapshot,
      );

      await markPaymongoWebhookEventProcessed(conn, eventId);

      await conn.commit();

      const paymentStatusChanged =
        String(order.payment_status || "")
          .trim()
          .toLowerCase() !== "paid";

      const orderStatusChanged =
        String(order.status || "")
          .trim()
          .toLowerCase() !== "confirmed";

      const io = req.app.get("io");

      if (orderStatusChanged) {
        emitOrderStatusUpdate(io, {
          orderId: order.id,
          orderNumber: order.order_number,
          status: "confirmed",
          customerId: order.customer_id,
        });
      } else if (paymentStatusChanged) {
        emitOrderPaymentUpdate(io, {
          orderId: order.id,
          orderNumber: order.order_number,
          paymentStatus: "paid",
          paymentMethod: "paymongo",
          paymentTransactionId: paymentTransaction.id,
          customerId: order.customer_id,
        });
      }

      await writeAuditLogSafe({
        userId: null,
        action: "confirm_paymongo_webhook_payment",
        tableName: "payment_transactions",
        recordId: paymentTransaction.id,
        oldValues: {
          order_id: order.id,
          order_status: order.status || null,
          payment_status: order.payment_status || null,
          verified_paymongo_payment_existed: !paymentTransactionCreated,
        },
        newValues: {
          order_id: order.id,
          payment_transaction_id: paymentTransaction.id,
          payment_transaction_created: paymentTransactionCreated,
          amount: Number(paymentTransaction.amount || 0),
          payment_method: "paymongo",
          payment_transaction_status: "verified",
          order_status: "confirmed",
          payment_status: "paid",
          receipt_id: receiptId,
          event_type: eventType,
          webhook_event_id: eventId,
          provider_session_present: Boolean(sessionId),
        },
        ipAddress: req.ip || null,
        actorType: "webhook",
        responseStatus: 200,
      });

      console.log(
        `[PayMongo Webhook] Payment confirmed. ` +
          `order=${order.order_number} ` +
          `order_id=${order.id} ` +
          `session=${sessionId}`,
      );

      return res.status(200).json({
        received: true,
        processed: true,
        event_type: eventType,
        order_id: order.id,
        order_number: order.order_number,
      });
    } catch (dbError) {
      await conn.rollback();

      console.error("[PayMongo Webhook] Database processing error:", dbError);

      return res.status(500).json({
        message: "Webhook processing failed.",
      });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("[PayMongo Webhook] Handler error:", error);

    return res.status(500).json({
      message: "Webhook processing failed.",
    });
  }
};
