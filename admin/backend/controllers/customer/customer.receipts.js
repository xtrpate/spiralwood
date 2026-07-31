// controllers/customer/customer.receipts.js
//
// Customer-facing read-only access to their OWN blueprint payment
// receipts. Deliberately kept separate from customer.customorders.js
// (already very large) and from the staff receipt controllers — this
// file trusts nothing from the URL alone and re-derives ownership on
// every request.
//
// SECURITY CONTRACT (every endpoint in this file):
//   1. authenticate + requireCustomer at the route level.
//   2. Route :id (order id) and :receiptId are validated as strict
//      positive integers before touching the database.
//   3. The canonical order is always re-queried and must satisfy BOTH
//      orders.customer_id = req.user.id AND orders.order_type =
//      'blueprint' before anything else is returned.
//   4. For a single receipt, the query additionally requires
//      receipts.id = :receiptId AND receipts.order_id = :id AND
//      receipts.receipt_type = 'blueprint_payment', AND the linked
//      payment_transactions row belongs to the same order and is
//      status = 'verified'. All of this is enforced in one SQL
//      statement's WHERE clause, not via separate trusting reads, so a
//      mismatch on any single condition simply yields zero rows.
//   5. A mismatch and a "does not exist" are both reported as a plain
//      404 — never distinguishable, so this endpoint cannot be used to
//      probe whether another customer's receipt exists.
//   6. Never selects proof_url, items_snapshot, raw issued_by/
//      verified_by ids, or any PayMongo payload. provider_reference is
//      passed through only because blueprintReceiptService.js already
//      restricts it to a safe checkout-session-style value or NULL.

const db = require("../../config/db");
const { parseStrictPositiveInt } = require("../../utils/validators");

const normalize = (value) => String(value || "").trim().toLowerCase();

// Same rules as the staff/cashier payment-history display (Phase 2B) —
// kept as an independent copy here rather than a shared import, since
// this file must not create a dependency on staff-only controllers.
const buildProcessorDisplay = ({ paymentMethod, status, verifierName }) => {
  const method = normalize(paymentMethod);
  const normalizedStatus = normalize(status);

  if (method === "paymongo") return "PayMongo / Online Payment";
  if (normalizedStatus === "verified" && verifierName) return verifierName;
  if (normalizedStatus === "pending" && !verifierName) return "Pending verification";
  if (normalizedStatus === "verified" && !verifierName) return "System";
  return "—";
};

// Resolves the order for :id, but only ever returns it when it is
// actually owned by the authenticated customer AND is a blueprint
// order. Returns null for every other case (not found, wrong owner,
// wrong order type) — callers must treat null as a plain 404, with no
// further distinction surfaced to the client.
const getOwnedBlueprintOrder = async (orderId, customerId) => {
  const [[order]] = await db.query(
    `SELECT id, order_number, customer_id, order_type
     FROM orders
     WHERE id = ?
     LIMIT 1`,
    [orderId],
  );

  if (!order) return null;
  if (Number(order.customer_id) !== Number(customerId)) return null;
  if (normalize(order.order_type) !== "blueprint") return null;

  return order;
};

/* ── List: GET /:id/receipts ──────────────────────────────────────── */
exports.listReceipts = async (req, res) => {
  const orderId = parseStrictPositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: "Invalid order id." });
  }

  try {
    const order = await getOwnedBlueprintOrder(orderId, req.user.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const [rows] = await db.query(
      `
      SELECT
        pt.id AS payment_transaction_id,
        pt.created_at,
        pt.amount,
        pt.payment_method,
        pt.status,
        u.name AS verifier_name,
        r.id AS receipt_id,
        r.receipt_number,
        r.payment_label
      FROM payment_transactions pt
      LEFT JOIN users u ON u.id = pt.verified_by
      LEFT JOIN receipts r
        ON r.payment_transaction_id = pt.id
        AND r.receipt_type = 'blueprint_payment'
      WHERE pt.order_id = ?
      ORDER BY pt.created_at DESC, pt.id DESC
      `,
      [orderId],
    );

    const paymentHistory = rows.map((row) => {
      const status = normalize(row.status);
      const isVerified = status === "verified";

      return {
        payment_transaction_id: row.payment_transaction_id,
        created_at: row.created_at,
        amount: row.amount,
        payment_method: row.payment_method,
        status: row.status,
        payment_label: isVerified ? row.payment_label ?? null : null,
        processor_display: buildProcessorDisplay({
          paymentMethod: row.payment_method,
          status: row.status,
          verifierName: row.verifier_name,
        }),
        receipt_id: isVerified ? row.receipt_id ?? null : null,
        receipt_number: isVerified ? row.receipt_number ?? null : null,
      };
    });

    return res.json({
      order_id: order.id,
      order_number: order.order_number,
      payment_history: paymentHistory,
    });
  } catch (err) {
    console.error("[customer.receipts listReceipts]", err);
    return res.status(500).json({ message: "Failed to load payment history." });
  }
};

/* ── Detail: GET /:id/receipts/:receiptId ─────────────────────────── */
exports.getReceiptById = async (req, res) => {
  const orderId = parseStrictPositiveInt(req.params.id);
  const receiptId = parseStrictPositiveInt(req.params.receiptId);

  if (!orderId || !receiptId) {
    return res.status(400).json({ message: "Invalid request." });
  }

  try {
    // Ownership is re-derived from scratch and every condition from the
    // security contract above is enforced in this one query. A failure
    // on ANY condition (wrong customer, wrong order, wrong receipt type,
    // wrong linked order on the payment transaction, or a
    // not-yet/never-verified payment) simply returns zero rows.
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
        r.printed_at,
        r.created_at,
        o.order_number,
        bp.title AS blueprint_title,
        pt.status AS payment_status,
        u.name AS verifier_name
      FROM receipts r
      JOIN orders o
        ON o.id = r.order_id
        AND o.customer_id = ?
        AND o.order_type = 'blueprint'
      JOIN payment_transactions pt
        ON pt.id = r.payment_transaction_id
        AND pt.order_id = o.id
        AND pt.status = 'verified'
      LEFT JOIN blueprints bp ON bp.id = o.blueprint_id
      LEFT JOIN users u ON u.id = pt.verified_by
      WHERE r.id = ?
        AND r.order_id = ?
        AND r.receipt_type = 'blueprint_payment'
      LIMIT 1
      `,
      [req.user.id, receiptId, orderId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Receipt not found." });
    }

    const receipt = rows[0];

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

    const processorDisplay = buildProcessorDisplay({
      paymentMethod: receipt.payment_method_snapshot,
      status: receipt.payment_status,
      verifierName: receipt.verifier_name,
    });

    const remainingBalance = Number(receipt.remaining_balance_after || 0);

    return res.json({
      id: receipt.id,
      order_number: receipt.order_number,
      blueprint_title: receipt.blueprint_title || null,
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
    console.error("[customer.receipts getReceiptById]", err);
    return res.status(500).json({ message: "Failed to load receipt." });
  }
};