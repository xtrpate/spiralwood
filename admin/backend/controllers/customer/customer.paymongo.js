// controllers/customer/customer.paymongo.js

const crypto = require("crypto");
const db = require("../../config/db");
const { writeAuditLogSafe } = require("../../middleware/auditLog");
const {
  emitOrderStatusUpdate,
  emitOrderPaymentUpdate,
} = require("../../utils/orderStatusSocket");
const {
  createStandardOnlineReceipt,
} = require("../../services/receiptService");

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

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

const createReceiptIfNeeded = async (conn, order, paymentTransactionId) => {
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

    if (eventType !== "checkout_session.payment.paid") {
      return res.status(200).json({
        received: true,
        ignored: true,
        event_type: eventType,
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
       * For this first webhook implementation, only handle
       * standard customer orders.
       *
       * Blueprint/custom-order payment continues using the existing
       * custom-order verification flow.
       */
      const orderType = String(order.order_type || "standard")
        .trim()
        .toLowerCase();

      if (orderType === "blueprint") {
        await conn.rollback();

        return res.status(200).json({
          received: true,
          ignored: true,
          reason: "blueprint_order_uses_existing_verification",
          order_id: order.id,
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
             (order_id, amount, payment_method, proof_url,
              status, verified_at, notes)
           VALUES (?, ?, 'paymongo', ?, 'verified', NOW(), ?)`,
          [
            order.id,
            amountFromWebhook,
            sessionId || "",
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
      );

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
