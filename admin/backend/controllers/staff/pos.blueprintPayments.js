const pool = require("../../config/db");
const {
  getRestrictedPaymentSummary,
  recordCashPayment,
} = require("../../services/blueprintCashPaymentService");
const { parseStrictPositiveInt } = require("../../utils/validators");

const normalize = (value) => String(value || "").trim().toLowerCase();

const safeParseJson = (value, fallback = null) => {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getOrderDraftPreviewMap = async (dbPool, orderIds = []) => {
  const ids = Array.from(
    new Set(
      orderIds
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  );

  if (!ids.length) return new Map();

  const placeholders = ids.map(() => "?").join(",");
  const [items] = await dbPool.query(
    `SELECT order_id, customization_json
     FROM order_items
     WHERE order_id IN (${placeholders})
       AND customization_json IS NOT NULL
     ORDER BY order_id ASC, id ASC`,
    ids,
  );

  const previewByOrderId = new Map();

  items.forEach((item) => {
    const orderId = Number(item.order_id);
    if (previewByOrderId.has(orderId)) return;

    const customization = safeParseJson(item.customization_json, {}) || {};
    const editorSnapshot =
      customization?.editor_snapshot &&
      typeof customization.editor_snapshot === "object" &&
      !Array.isArray(customization.editor_snapshot)
        ? customization.editor_snapshot
        : null;

    if (
      !editorSnapshot ||
      !Array.isArray(editorSnapshot.components) ||
      editorSnapshot.components.length === 0
    ) {
      return;
    }

    previewByOrderId.set(orderId, {
      components: editorSnapshot.components,
      worldSize:
        editorSnapshot.worldSize && typeof editorSnapshot.worldSize === "object"
          ? editorSnapshot.worldSize
          : null,
    });
  });

  return previewByOrderId;
};

// Strict order-number validation: trimmed, non-empty, max 50 chars,
// no control characters or line breaks. Exact-equality lookup only --
// never LIKE, never a wildcard.
const isValidOrderNumber = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 50) return false;
  // Reject any ASCII control character (0x00-0x1F, 0x7F), which also
  // rejects embedded newlines/tabs/carriage returns.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return false;
  return true;
};

// Safe, human-readable "who handled this payment" text. Never returns a
// raw user id, and never lets a customer-triggered PayMongo verification
// (issued_by/verified_by pointing at a technical FK owner, not a real
// staff processor) be displayed as a person's name.
const buildProcessorDisplay = ({ paymentMethod, status, verifierName }) => {
  const method = normalize(paymentMethod);
  const normalizedStatus = normalize(status);

  if (method === "paymongo") return "PayMongo / Online Payment";
  if (normalizedStatus === "verified" && verifierName) return verifierName;
  if (normalizedStatus === "pending" && !verifierName) return "Pending verification";
  if (normalizedStatus === "verified" && !verifierName) return "System";
  return "—";
};

// Payment history for the exact searched blueprint order only. Receipt
// info is joined strictly by payment_transaction_id + receipt_type =
// 'blueprint_payment' -- never by order_id, and never "the latest
// receipt for this order" (one order can have many receipts). No proof
// file paths, no raw PayMongo payloads, no raw user ids are selected or
// returned.
const getPaymentHistoryForOrder = async (dbPool, orderId) => {
  const [rows] = await dbPool.query(
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

  return rows.map((row) => {
    const status = normalize(row.status);
    const isVerified = status === "verified";

    // Defense in depth: even though the JOIN already restricts receipts
    // to the correct payment_transaction_id + receipt_type, a receipt
    // link is only ever surfaced to the UI when the payment itself is
    // verified -- matching the "View Receipt only when verified AND
    // receipt_id AND receipt_number exist" rule exactly.
    const receiptId = isVerified ? row.receipt_id ?? null : null;
    const receiptNumber = isVerified ? row.receipt_number ?? null : null;

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
      receipt_id: receiptId,
      receipt_number: receiptNumber,
    };
  });
};


exports.listOrders = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        o.id AS order_id,
        o.order_number,
        o.status AS order_status,
        o.payment_status,
        o.payment_method AS initial_payment_method,
        o.total,
        o.blueprint_id,
        o.created_at,
        o.updated_at,

        COALESCE(
          NULLIF(TRIM(o.walkin_customer_name), ''),
          NULLIF(TRIM(customer.name), ''),
          'Customer'
        ) AS customer_name,

        COALESCE(
          NULLIF(TRIM(b.title), ''),
          'Blueprint'
        ) AS blueprint_title,

        b.thumbnail_url,
        b.design_data AS blueprint_design_data,
        b.view_3d_data AS blueprint_view_3d_data,

        COALESCE(
          SUM(
            CASE
              WHEN LOWER(COALESCE(pt.status, '')) = 'verified'
                THEN pt.amount
              ELSE 0
            END
          ),
          0
        ) AS verified_total,

        COALESCE(
          SUM(
            CASE
              WHEN LOWER(COALESCE(pt.status, '')) = 'pending'
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS pending_payment_count

      FROM orders o
      LEFT JOIN users customer
        ON customer.id = o.customer_id
      LEFT JOIN blueprints b
        ON b.id = o.blueprint_id
      LEFT JOIN payment_transactions pt
        ON pt.order_id = o.id

      WHERE o.order_type = 'blueprint'

      GROUP BY
        o.id,
        o.order_number,
        o.status,
        o.payment_status,
        o.payment_method,
        o.total,
        o.blueprint_id,
        o.created_at,
        o.updated_at,
        o.walkin_customer_name,
        customer.name,
        b.title,
        b.thumbnail_url,
        b.design_data,
        b.view_3d_data

      ORDER BY o.updated_at DESC, o.id DESC
      LIMIT 200
      `,
      [],
    );

    const draftPreviewByOrderId = await getOrderDraftPreviewMap(
      pool,
      rows.map((row) => row.order_id),
    );

    const orders = rows.map((row) => {
      const total = Number(row.total || 0);
      const verifiedTotal = Number(row.verified_total || 0);
      const pendingPaymentCount = Number(row.pending_payment_count || 0);
      const remainingBalance = Math.max(0, total - verifiedTotal);
      const storedStatus = normalize(row.payment_status) || "unpaid";

      return {
        order_id: row.order_id,
        order_number: row.order_number,
        order_status: row.order_status,
        payment_status:
          pendingPaymentCount > 0 && storedStatus !== "paid"
            ? "pending"
            : storedStatus,
        stored_payment_status: storedStatus,
        initial_payment_method: row.initial_payment_method || null,
        total,
        verified_total: verifiedTotal,
        remaining_balance: remainingBalance,
        pending_payment_count: pendingPaymentCount,
        customer_name: row.customer_name,
        blueprint_id: row.blueprint_id,
        blueprint_title: row.blueprint_title,
        thumbnail_url: row.thumbnail_url || null,
        blueprint_design_data: row.blueprint_design_data || null,
        blueprint_view_3d_data: row.blueprint_view_3d_data || null,
        draft_editor_snapshot:
          draftPreviewByOrderId.get(Number(row.order_id)) || null,
        created_at: row.created_at,
      };
    });

    return res.json({ orders });
  } catch (err) {
    console.error("[pos.blueprintPayments listOrders]", err);
    return res.status(500).json({
      message: "Failed to load blueprint payments.",
    });
  }
};
exports.lookupByOrderNumber = async (req, res) => {
  const rawOrderNumber = req.query.order_number;

  if (!isValidOrderNumber(rawOrderNumber)) {
    return res.status(400).json({ message: "Enter a valid order number." });
  }

  const orderNumber = rawOrderNumber.trim();

  try {
    const [[row]] = await pool.query(
      `
      SELECT
        o.id,
        o.blueprint_id,
        COALESCE(
          NULLIF(TRIM(o.walkin_customer_name), ''),
          NULLIF(TRIM(customer.name), ''),
          'Customer'
        ) AS customer_name,
        COALESCE(
          NULLIF(TRIM(b.title), ''),
          'Blueprint'
        ) AS blueprint_title,
        b.thumbnail_url,
        b.design_data AS blueprint_design_data,
        b.view_3d_data AS blueprint_view_3d_data
      FROM orders o
      LEFT JOIN users customer
        ON customer.id = o.customer_id
      LEFT JOIN blueprints b
        ON b.id = o.blueprint_id
      WHERE o.order_number = ?
      LIMIT 1
      `,
      [orderNumber],
    );

    if (!row) {
      return res.status(404).json({ message: "Order not found." });
    }

    const summary = await getRestrictedPaymentSummary(pool, row.id);
    const paymentHistory = await getPaymentHistoryForOrder(pool, row.id);
    const draftPreviewByOrderId = await getOrderDraftPreviewMap(pool, [row.id]);

    return res.json({
      ...summary,
      customer_name: row.customer_name,
      blueprint_id: row.blueprint_id || null,
      blueprint_title: row.blueprint_title,
      thumbnail_url: row.thumbnail_url || null,
      blueprint_design_data: row.blueprint_design_data || null,
      blueprint_view_3d_data: row.blueprint_view_3d_data || null,
      draft_editor_snapshot:
        draftPreviewByOrderId.get(Number(row.id)) || null,
      payment_history: paymentHistory,
    });
  } catch (err) {
    console.error("[pos.blueprintPayments lookupByOrderNumber]", err);
    return res.status(500).json({ message: "Failed to look up order." });
  }
};

exports.recordPayment = async (req, res) => {
  req.auditRecord = null;

  const orderId = parseStrictPositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: "Invalid order id." });
  }

  const bodyKeys = Object.keys(req.body || {});
  if (bodyKeys.length !== 1 || bodyKeys[0] !== "amount") {
    return res.status(400).json({ message: "Request must contain only an amount field." });
  }

  try {
    const result = await recordCashPayment({
      pool,
      orderId,
      amountRaw: req.body.amount,
      verifiedByUserId: req.user.id,
    });

    if (result.httpStatus === 200 && result.auditRecord) {
      req.auditRecord = result.auditRecord;
    } else {
      req.auditRecord = null;
    }

    return res.status(result.httpStatus).json(result.body);
  } catch (err) {
    req.auditRecord = null;
    console.error("[pos.blueprintPayments recordPayment]", err);
    return res.status(500).json({ message: "Failed to record cash payment." });
  }
};