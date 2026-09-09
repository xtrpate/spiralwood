// controllers/customer/customer.warranty.js
// WISDOM Warranty + Inventory V1.0.0 — exact order-item claims
const db = require("../../config/db");
const { signUploadPath } = require("../../utils/signedUrl");
const { createNotificationSafe } = require("../../utils/notificationHelper");
const { writeAuditLogSafe } = require("../../middleware/auditLog");

const WARRANTY_PERIOD_KEY = "warranty_period_days";
const WARRANTY_POLICY_VERSION_KEY = "warranty_policy_version";
const WARRANTY_POLICY_VERSION = "2";
const DEFAULT_WARRANTY_PERIOD_DAYS = 365;

const getWarrantyPeriodDays = async () => {
  const [rows] = await db.query(
    `SELECT content_key, content
     FROM website_content
     WHERE content_type = 'setting'
       AND content_key IN (?, ?)`,
    [WARRANTY_PERIOD_KEY, WARRANTY_POLICY_VERSION_KEY],
  );

  const values = new Map(rows.map((row) => [String(row.content_key), row.content]));
  if (String(values.get(WARRANTY_POLICY_VERSION_KEY) || "") !== WARRANTY_POLICY_VERSION) {
    return DEFAULT_WARRANTY_PERIOD_DAYS;
  }

  const configuredDays = Number(values.get(WARRANTY_PERIOD_KEY));
  if (!Number.isInteger(configuredDays) || configuredDays < 1 || configuredDays > 3650) {
    return DEFAULT_WARRANTY_PERIOD_DAYS;
  }
  return configuredDays;
};

const splitStoredProofs = (value) => {
  const parts = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  return { photo_url: parts[0] || null, proof_url: parts[1] || null };
};

const getEligibleOrders = async (req, res) => {
  try {
    const warrantyPeriodDays = await getWarrantyPeriodDays();
    const [rows] = await db.query(
      `SELECT
         o.id,
         o.order_number,
         o.created_at,
         o.status,
         o.payment_status,
         o.total,
         o.delivery_address,
         o.order_type,
         d.delivered_date,
         DATE_ADD(COALESCE(d.delivered_date, o.updated_at, o.created_at), INTERVAL ? DAY) AS warranty_expiry,
         oi.id AS order_item_id,
         oi.product_id,
         oi.product_name,
         oi.quantity,
         p.type AS product_type
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       WHERE o.customer_id = ?
         AND o.status = 'completed'
         AND o.payment_status = 'paid'
         AND DATE_ADD(COALESCE(d.delivered_date, o.updated_at, o.created_at), INTERVAL ? DAY) >= CURDATE()
         AND NOT EXISTS (
           SELECT 1
           FROM warranties w
           WHERE w.order_id = o.id
             AND w.customer_id = o.customer_id
             AND w.status <> 'cancelled'
             AND (w.order_item_id = oi.id OR w.order_item_id IS NULL)
         )
       ORDER BY COALESCE(d.delivered_date, o.created_at) DESC, oi.id ASC`,
      [warrantyPeriodDays, req.user.id, warrantyPeriodDays],
    );

    const grouped = [];
    const byId = new Map();
    for (const row of rows) {
      let order = byId.get(Number(row.id));
      if (!order) {
        order = {
          id: row.id,
          order_number: row.order_number,
          created_at: row.created_at,
          status: row.status,
          payment_status: row.payment_status,
          total: row.total,
          delivery_address: row.delivery_address,
          delivered_date: row.delivered_date,
          warranty_expiry: row.warranty_expiry,
          order_type: row.order_type,
          products: [],
        };
        byId.set(Number(row.id), order);
        grouped.push(order);
      }
      order.products.push({
        order_item_id: Number(row.order_item_id),
        product_id: row.product_id,
        product_name: row.product_name,
        quantity: Number(row.quantity || 1),
        product_type: row.product_type || null,
      });
    }

    return res.json(grouped);
  } catch (err) {
    console.error("[customer.warranty eligible-orders]", err);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

const getClaims = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         w.id, w.order_id, w.order_item_id, o.order_number, w.product_name,
         w.claim_quantity, w.reason, w.admin_note, w.proof_url, w.status,
         w.warranty_expiry, w.replacement_receipt, w.resolution_type,
         w.resolution_notes, w.replacement_source, w.return_disposition,
         w.fulfilled_at, w.created_at, w.updated_at
       FROM warranties w
       LEFT JOIN orders o ON o.id = w.order_id
       WHERE w.customer_id = ?
       ORDER BY w.created_at DESC`,
      [req.user.id],
    );

    return res.json(rows.map((row) => {
      const { photo_url, proof_url } = splitStoredProofs(row.proof_url);
      return {
        ...row,
        claim_quantity: Number(row.claim_quantity || 1),
        description: row.reason,
        photo_url: signUploadPath(photo_url),
        proof_url: signUploadPath(proof_url),
        replacement_receipt: signUploadPath(row.replacement_receipt),
        reason: undefined,
      };
    }));
  } catch (err) {
    console.error("[customer.warranty GET]", err);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

const submitClaim = async (req, res) => {
  const orderId = Number(req.body?.order_id);
  const orderItemId = Number(req.body?.order_item_id);
  const claimQuantity = Number(req.body?.claim_quantity);
  const description = String(req.body?.description || "").trim();

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: "Please select an eligible completed and paid order." });
  }
  if (!Number.isInteger(orderItemId) || orderItemId <= 0) {
    return res.status(400).json({ message: "Please select the exact affected item from the order." });
  }
  if (!Number.isInteger(claimQuantity) || claimQuantity <= 0) {
    return res.status(400).json({ message: "Claim quantity must be a whole number greater than 0." });
  }
  if (!description) {
    return res.status(400).json({ message: "Description of the issue is required." });
  }

  const photoUrl = req.files?.photo?.[0] ? `uploads/warranty/${req.files.photo[0].filename}` : null;
  const proofUrl = req.files?.proof?.[0] ? `uploads/warranty/${req.files.proof[0].filename}` : null;
  if (!photoUrl || !proofUrl) {
    return res.status(400).json({ message: "Both defect photo and proof of purchase are required." });
  }
  const combinedUrls = [photoUrl, proofUrl].join(",");

  try {
    const warrantyPeriodDays = await getWarrantyPeriodDays();
    const [[item]] = await db.query(
      `SELECT
         o.id AS order_id, o.order_number, o.customer_id, o.status, o.payment_status,
         DATE_ADD(COALESCE(d.delivered_date, o.updated_at, o.created_at), INTERVAL ? DAY) AS warranty_expiry,
         oi.id AS order_item_id, oi.product_id, oi.product_name, oi.quantity AS ordered_quantity
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN deliveries d ON d.order_id = o.id
       WHERE o.customer_id = ? AND o.id = ? AND oi.id = ?
       LIMIT 1`,
      [warrantyPeriodDays, req.user.id, orderId, orderItemId],
    );

    if (!item) {
      return res.status(404).json({ message: "The selected order item was not found for this customer." });
    }
    if (String(item.status || "").toLowerCase() !== "completed") {
      return res.status(400).json({ message: "Only completed orders can be used for warranty claims." });
    }
    if (String(item.payment_status || "").toLowerCase() !== "paid") {
      return res.status(400).json({ message: "Only fully paid orders are eligible for warranty claims." });
    }

    const expiry = item.warranty_expiry ? new Date(item.warranty_expiry) : null;
    if (!expiry || Number.isNaN(expiry.getTime()) || expiry < new Date()) {
      return res.status(400).json({ message: "This order is no longer within the warranty period." });
    }

    const orderedQuantity = Number(item.ordered_quantity || 0);
    if (claimQuantity > orderedQuantity) {
      return res.status(400).json({
        message: `Claim quantity cannot exceed the ordered quantity (${orderedQuantity}).`,
      });
    }

    const [existingClaims] = await db.query(
      `SELECT id, status
       FROM warranties
       WHERE customer_id = ? AND order_id = ? AND status <> 'cancelled'
         AND (order_item_id = ? OR order_item_id IS NULL)
       LIMIT 1`,
      [req.user.id, item.order_id, item.order_item_id],
    );
    if (existingClaims.length) {
      return res.status(400).json({
        message: "An active warranty claim already exists for this exact order item.",
      });
    }

    const [result] = await db.query(
      `INSERT INTO warranties
         (customer_id, order_id, order_item_id, product_name, claim_quantity,
          reason, proof_url, warranty_expiry, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user.id,
        item.order_id,
        item.order_item_id,
        item.product_name,
        claimQuantity,
        description,
        combinedUrls,
        item.warranty_expiry,
      ],
    );

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "submit_warranty_claim",
      tableName: "warranties",
      recordId: result.insertId,
      newValues: {
        order_id: item.order_id,
        order_item_id: item.order_item_id,
        order_number: item.order_number,
        product_name: item.product_name,
        claim_quantity: claimQuantity,
        status: "pending",
        evidence_uploaded: true,
      },
      ipAddress: req.ip || null,
    });

    try {
      const [admins] = await db.query(`SELECT id FROM users WHERE role = 'admin' AND is_active = 1`);
      const customerName = req.user.name || "A customer";
      for (const admin of admins) {
        await createNotificationSafe(db, {
          userId: admin.id,
          type: "warranty_claim",
          title: "New Warranty Claim",
          message: `${customerName} submitted a warranty claim for ${item.product_name} x${claimQuantity} from Order ${item.order_number}. Review the issue and uploaded proof.`,
          targetType: "warranty",
          targetId: result.insertId,
          targetOrderId: item.order_id,
        });
      }
    } catch (notificationErr) {
      console.error("[customer.warranty notification skipped]", notificationErr.message || notificationErr);
    }

    return res.status(201).json({
      message: "Warranty claim submitted successfully.",
      claim_id: result.insertId,
    });
  } catch (err) {
    console.error("[customer.warranty POST]", err);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

const cancelClaim = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Valid warranty claim ID is required." });
  }

  try {
    const [[claim]] = await db.query(
      `SELECT id, customer_id, status
       FROM warranties
       WHERE id = ? AND customer_id = ?
       LIMIT 1`,
      [id, req.user.id],
    );
    if (!claim) return res.status(404).json({ message: "Warranty claim not found." });

    const currentStatus = String(claim.status || "").trim().toLowerCase();
    if (currentStatus !== "pending") {
      return res.status(400).json({ message: "Only pending warranty claims can be cancelled." });
    }

    const [result] = await db.query(
      `UPDATE warranties
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = ? AND customer_id = ? AND status = 'pending'`,
      [id, req.user.id],
    );
    if (!result.affectedRows) {
      return res.status(409).json({
        message: "This warranty claim can no longer be cancelled. Refresh the page and try again.",
      });
    }

    req.auditRecord = {
      id: claim.id,
      old: { status: "pending" },
      new: { status: "cancelled", cancelled_by_customer_id: Number(req.user.id) },
    };
    return res.json({ message: "Warranty claim cancelled successfully." });
  } catch (err) {
    console.error("[customer.warranty cancel]", err);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

module.exports = { getEligibleOrders, getClaims, submitClaim, cancelClaim };
