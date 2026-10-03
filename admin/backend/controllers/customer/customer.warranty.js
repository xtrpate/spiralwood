// controllers/customer/customer.warranty.js
// WISDOM Warranty + Inventory V1.0.0 — exact order-item claims
const db = require("../../config/db");
const { signUploadPath } = require("../../utils/signedUrl");
const { createNotificationSafe } = require("../../utils/notificationHelper");
const { writeAuditLogSafe } = require("../../middleware/auditLog");
const { getPhilippineDateKey } = require("../../utils/philippineTime");
const { parseStrictPositiveInt } = require("../../utils/validators");
const {
  parseOrderWarrantyPolicySnapshot,
} = require("../../utils/warrantyPolicy");

const MAX_WARRANTY_DESCRIPTION_LENGTH = 1000;
const CUSTOMER_WARRANTY_PAGE_SIZE = 10;
const CUSTOMER_WARRANTY_MAX_PAGE_SIZE = 50;

/*
 * Warranty starts at the real customer handoff:
 * - pickup: orders.picked_up_at
 * - delivery: latest successful deliveries.delivered_date
 * - legacy fallback only: order updated_at / created_at
 *
 * Event timestamps are stored in UTC. Convert the handoff instant to the
 * Philippine calendar date before adding the policy duration.
 */
const LATEST_SUCCESSFUL_DELIVERY_SQL = `
  (SELECT MAX(d.delivered_date)
   FROM deliveries d
   WHERE d.order_id = o.id
     AND d.delivered_date IS NOT NULL
     AND d.status IN ('delivered', 'completed'))
`;

const WARRANTY_HANDOFF_UTC_SQL = `
  CASE
    WHEN LOWER(COALESCE(o.fulfillment_method, '')) = 'pickup'
      THEN COALESCE(o.picked_up_at, o.updated_at, o.created_at)
    ELSE COALESCE(
      ${LATEST_SUCCESSFUL_DELIVERY_SQL},
      o.updated_at,
      o.created_at
    )
  END
`;

const WARRANTY_HANDOFF_PH_DATE_SQL = `
  DATE(DATE_ADD((${WARRANTY_HANDOFF_UTC_SQL}), INTERVAL 8 HOUR))
`;

const WARRANTY_EXPIRY_DATE_SQL = `
  DATE_ADD(
    (${WARRANTY_HANDOFF_PH_DATE_SQL}),
    INTERVAL o.warranty_period_days_snapshot DAY
  )
`;

const splitStoredProofs = (value) => {
  const parts = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return { photo_url: parts[0] || null, proof_url: parts[1] || null };
};

const getSubmittedEvidenceUrl = (req, fieldName) => {
  const durableUrl = String(
    req.warrantyEvidenceAssets?.[fieldName]?.file_url || "",
  ).trim();
  if (durableUrl) return durableUrl;

  // Keep direct-controller regression tests and legacy local submission
  // fixtures compatible. The real customer route now supplies durable assets.
  const legacyFilename = String(
    req.files?.[fieldName]?.[0]?.filename || "",
  ).trim();
  return legacyFilename ? `uploads/warranty/${legacyFilename}` : null;
};

const isWarrantySubmissionLockConflict = (err) =>
  ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(
    String(err?.code || ""),
  ) || [1205, 1213].includes(Number(err?.errno));

const getEligibleOrders = async (req, res) => {
  try {
    const todayKey = getPhilippineDateKey();

    // Fail closed instead of silently applying today's website setting to an
    // old order whose immutable warranty-policy snapshot is missing/corrupt.
    const [[invalidWarrantyOrder]] = await db.query(
      `SELECT o.id AS invalid_warranty_order_id
       FROM orders o
       WHERE o.customer_id = ?
         AND o.status = 'completed'
         AND o.payment_status = 'paid'
         AND (
           o.warranty_period_days_snapshot IS NULL
           OR o.warranty_period_days_snapshot < 1
           OR o.warranty_period_days_snapshot > 3650
           OR NULLIF(TRIM(o.warranty_policy_version_snapshot), '') IS NULL
           OR o.warranty_policy_effective_at IS NULL
         )
       LIMIT 1`,
      [req.user.id],
    );

    if (invalidWarrantyOrder) {
      return res.status(409).json({
        message:
          "Warranty policy record for this order is incomplete. Please contact support.",
      });
    }

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
         ${LATEST_SUCCESSFUL_DELIVERY_SQL} AS delivered_date,
         ${WARRANTY_HANDOFF_UTC_SQL} AS warranty_handoff_at,
         DATE_FORMAT((${WARRANTY_EXPIRY_DATE_SQL}), '%Y-%m-%d') AS warranty_expiry,
         oi.id AS order_item_id,
         oi.product_id,
         oi.product_name,
         oi.quantity,
         p.type AS product_type
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.customer_id = ?
         AND o.status = 'completed'
         AND o.payment_status = 'paid'
         AND o.warranty_period_days_snapshot BETWEEN 1 AND 3650
         AND NULLIF(TRIM(o.warranty_policy_version_snapshot), '') IS NOT NULL
         AND o.warranty_policy_effective_at IS NOT NULL
         AND (${WARRANTY_EXPIRY_DATE_SQL}) >= ?
         AND NOT EXISTS (
           SELECT 1
           FROM warranties w
           WHERE w.order_id = o.id
             AND w.customer_id = o.customer_id
             AND LOWER(COALESCE(w.status, '')) IN ('pending', 'approved')
             AND (w.order_item_id = oi.id OR w.order_item_id IS NULL)
         )
       ORDER BY warranty_handoff_at DESC, oi.id ASC`,
      [req.user.id, todayKey],
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
    return res
      .status(500)
      .json({ message: "Server error." });
  }
};

const mapCustomerWarrantyClaim = (row) => {
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
};

const parseCustomerWarrantyPaging = (query = {}) => {
  const rawPage = query?.page;
  const rawLimit = query?.limit;

  const requestedPage =
    rawPage === undefined ? 1 : parseStrictPositiveInt(rawPage);
  const limit =
    rawLimit === undefined
      ? CUSTOMER_WARRANTY_PAGE_SIZE
      : parseStrictPositiveInt(rawLimit);

  if (!requestedPage) {
    const err = new Error("Page must be a positive whole number.");
    err.status = 400;
    throw err;
  }

  if (!limit || limit > CUSTOMER_WARRANTY_MAX_PAGE_SIZE) {
    const err = new Error(
      `Limit must be a positive whole number no greater than ${CUSTOMER_WARRANTY_MAX_PAGE_SIZE}.`,
    );
    err.status = 400;
    throw err;
  }

  return { requestedPage, limit };
};

const CUSTOMER_WARRANTY_SELECT_SQL = `
  SELECT
    w.id, w.order_id, w.order_item_id, o.order_number, w.product_name,
    w.claim_quantity, w.reason, w.admin_note, w.proof_url, w.status,
    w.warranty_expiry, w.replacement_receipt, w.resolution_type,
    w.resolution_notes, w.replacement_source, w.return_disposition,
    w.fulfilled_at, w.created_at, w.updated_at
  FROM warranties w
  LEFT JOIN orders o ON o.id = w.order_id`;

const getClaims = async (req, res) => {
  try {
    const { requestedPage, limit } = parseCustomerWarrantyPaging(req.query);

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM warranties
       WHERE customer_id = ?`,
      [req.user.id],
    );

    const total = Number(countRow?.total || 0);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const page =
      totalPages === 0
        ? 1
        : Math.min(requestedPage, Math.max(1, totalPages));
    const offset = (page - 1) * limit;

    let rows = [];
    if (total > 0) {
      [rows] = await db.query(
        `${CUSTOMER_WARRANTY_SELECT_SQL}
         WHERE w.customer_id = ?
         ORDER BY w.created_at DESC, w.id DESC
         LIMIT ? OFFSET ?`,
        [req.user.id, limit, offset],
      );
    }

    return res.json({
      claims: rows.map(mapCustomerWarrantyClaim),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1 && totalPages > 0,
      },
    });
  } catch (err) {
    if (Number(err?.status) === 400) {
      return res.status(400).json({ message: err.message });
    }

    console.error("[customer.warranty GET]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

const getClaimById = async (req, res) => {
  const id = parseStrictPositiveInt(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ message: "Valid warranty claim ID is required." });
  }

  try {
    const { limit } = parseCustomerWarrantyPaging({
      limit: req.query?.limit,
    });

    const [[row]] = await db.query(
      `${CUSTOMER_WARRANTY_SELECT_SQL}
       WHERE w.id = ?
         AND w.customer_id = ?
       LIMIT 1`,
      [id, req.user.id],
    );

    if (!row) {
      return res.status(404).json({ message: "Warranty claim not found." });
    }

    const [[positionRow]] = await db.query(
      `SELECT COUNT(*) AS preceding
       FROM warranties newer
       INNER JOIN warranties target
         ON target.id = ?
        AND target.customer_id = ?
       WHERE newer.customer_id = ?
         AND (
           newer.created_at > target.created_at
           OR (
             newer.created_at = target.created_at
             AND newer.id > target.id
           )
         )`,
      [id, req.user.id, req.user.id],
    );

    const preceding = Number(positionRow?.preceding || 0);
    const page = Math.floor(preceding / limit) + 1;

    return res.json({
      claim: mapCustomerWarrantyClaim(row),
      pagination: {
        page,
        limit,
      },
    });
  } catch (err) {
    if (Number(err?.status) === 400) {
      return res.status(400).json({ message: err.message });
    }

    console.error("[customer.warranty GET one]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

const submitClaim = async (req, res) => {
  const orderId = parseStrictPositiveInt(req.body?.order_id);
  const orderItemId = parseStrictPositiveInt(req.body?.order_item_id);
  const claimQuantity = parseStrictPositiveInt(req.body?.claim_quantity);
  const rawDescription = req.body?.description;

  if (!orderId) {
    return res
      .status(400)
      .json({ message: "Please select an eligible completed and paid order." });
  }
  if (!orderItemId) {
    return res.status(400).json({
      message: "Please select the exact affected item from the order.",
    });
  }
  if (!claimQuantity) {
    return res.status(400).json({
      message: "Claim quantity must be a whole number greater than 0.",
    });
  }
  if (typeof rawDescription !== "string") {
    return res.status(400).json({
      message: "Description of the issue must be text.",
    });
  }

  const description = rawDescription.trim();

  if (!description) {
    return res
      .status(400)
      .json({ message: "Description of the issue is required." });
  }

  if (description.length > MAX_WARRANTY_DESCRIPTION_LENGTH) {
    return res.status(400).json({
      message: `Description of the issue must not exceed ${MAX_WARRANTY_DESCRIPTION_LENGTH} characters.`,
    });
  }

  const photoUrl = getSubmittedEvidenceUrl(req, "photo");
  const proofUrl = getSubmittedEvidenceUrl(req, "proof");

  if (!photoUrl || !proofUrl) {
    return res.status(400).json({
      message: "Both defect photo and proof of purchase are required.",
    });
  }

  const combinedUrls = [photoUrl, proofUrl].join(",");
  let connection = null;
  let transactionOpen = false;
  let commitAttempted = false;
  let commitConfirmed = false;

  const rollbackWithResponse = async (status, message) => {
    if (connection && transactionOpen) {
      await connection.rollback();
      transactionOpen = false;
    }
    return res.status(status).json({ message });
  };

  try {
    const todayKey = getPhilippineDateKey();

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionOpen = true;

    /*
     * Lock the exact purchased order-item row first. Every submission for the
     * same item must acquire this lock, so concurrent requests are serialized
     * before the existing-claim check and INSERT.
     */
    const [[item]] = await connection.query(
      `SELECT
         o.id AS order_id, o.order_number, o.customer_id, o.status, o.payment_status,
         o.warranty_period_days_snapshot,
         o.warranty_policy_version_snapshot,
         o.warranty_policy_effective_at,
         DATE_FORMAT((${WARRANTY_EXPIRY_DATE_SQL}), '%Y-%m-%d') AS warranty_expiry,
         ((${WARRANTY_EXPIRY_DATE_SQL}) >= ?) AS warranty_is_active,
         oi.id AS order_item_id, oi.product_id, oi.product_name, oi.quantity AS ordered_quantity
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = ? AND o.id = ? AND oi.id = ?
       LIMIT 1
       FOR UPDATE`,
      [todayKey, req.user.id, orderId, orderItemId],
    );

    if (!item) {
      return await rollbackWithResponse(
        404,
        "The selected order item was not found for this customer.",
      );
    }

    try {
      parseOrderWarrantyPolicySnapshot(item);
    } catch {
      return await rollbackWithResponse(
        409,
        "Warranty policy record for this order is incomplete. Please contact support.",
      );
    }

    if (String(item.status || "").toLowerCase() !== "completed") {
      return await rollbackWithResponse(
        400,
        "Only completed orders can be used for warranty claims.",
      );
    }

    if (String(item.payment_status || "").toLowerCase() !== "paid") {
      return await rollbackWithResponse(
        400,
        "Only fully paid orders are eligible for warranty claims.",
      );
    }

    if (!item.warranty_expiry || Number(item.warranty_is_active) !== 1) {
      return await rollbackWithResponse(
        400,
        "This order is no longer within the warranty period.",
      );
    }

    const orderedQuantity = Number(item.ordered_quantity || 0);
    if (claimQuantity > orderedQuantity) {
      return await rollbackWithResponse(
        400,
        `Claim quantity cannot exceed the ordered quantity (${orderedQuantity}).`,
      );
    }

    /*
     * Recheck under the transaction after the order-item lock is acquired.
     * The FOR UPDATE read is a current read, so a request that waited for a
     * competing submission will see the winner's committed claim here.
     */
    const [existingClaims] = await connection.query(
      `SELECT id, status
       FROM warranties
       WHERE customer_id = ? AND order_id = ?
         AND LOWER(COALESCE(status, '')) IN ('pending', 'approved')
         AND (order_item_id = ? OR order_item_id IS NULL)
       LIMIT 1
       FOR UPDATE`,
      [req.user.id, item.order_id, item.order_item_id],
    );

    if (existingClaims.length) {
      return await rollbackWithResponse(
        409,
        "An active warranty claim already exists for this order item. Refresh your warranty claims to view its latest status.",
      );
    }

    const [result] = await connection.query(
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

    commitAttempted = true;
    await connection.commit();
    commitConfirmed = true;
    req.warrantySubmissionRetainUploads = true;
    transactionOpen = false;
    connection.release();
    connection = null;

    /*
     * Side effects happen only after the claim itself is committed. A stale or
     * concurrent loser never reaches audit/notification creation.
     */
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
      const [admins] = await db.query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active = 1`,
      );
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
      console.error(
        "[customer.warranty notification skipped]",
        notificationErr.message || notificationErr,
      );
    }

    return res.status(201).json({
      message: "Warranty claim submitted successfully.",
      claim_id: result.insertId,
    });
  } catch (err) {
    const lockConflict = isWarrantySubmissionLockConflict(err);
    const commitOutcomeUncertain =
      commitAttempted && !commitConfirmed && !lockConflict;

    if (commitConfirmed || commitOutcomeUncertain) {
      req.warrantySubmissionRetainUploads = true;
    }

    if (commitOutcomeUncertain) {
      console.error(
        "[customer.warranty commit outcome uncertain]",
        "Retaining uploaded evidence because the warranty claim may already be committed.",
      );
    }

    if (connection && transactionOpen) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error(
          "[customer.warranty rollback failed]",
          rollbackErr.message || rollbackErr,
        );
      }
      transactionOpen = false;
    }

    if (lockConflict) {
      return res.status(409).json({
        message:
          "Another warranty submission is being processed for this item. Refresh and try again.",
      });
    }

    console.error("[customer.warranty POST]", err);
    return res
      .status(500)
      .json({ message: "Server error." });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
const cancelClaim = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res
      .status(400)
      .json({ message: "Valid warranty claim ID is required." });
  }

  try {
    const [[claim]] = await db.query(
      `SELECT id, customer_id, status
       FROM warranties
       WHERE id = ? AND customer_id = ?
       LIMIT 1`,
      [id, req.user.id],
    );
    if (!claim)
      return res.status(404).json({ message: "Warranty claim not found." });

    const currentStatus = String(claim.status || "")
      .trim()
      .toLowerCase();
    if (currentStatus !== "pending") {
      return res
        .status(400)
        .json({ message: "Only pending warranty claims can be cancelled." });
    }

    const [result] = await db.query(
      `UPDATE warranties
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = ? AND customer_id = ? AND status = 'pending'`,
      [id, req.user.id],
    );
    if (!result.affectedRows) {
      return res.status(409).json({
        message:
          "This warranty claim can no longer be cancelled. Refresh the page and try again.",
      });
    }

    req.auditRecord = {
      id: claim.id,
      old: { status: "pending" },
      new: {
        status: "cancelled",
        cancelled_by_customer_id: Number(req.user.id),
      },
    };
    return res.json({ message: "Warranty claim cancelled successfully." });
  } catch (err) {
    console.error("[customer.warranty cancel]", err);
    return res
      .status(500)
      .json({ message: "Server error." });
  }
};

module.exports = { getEligibleOrders, getClaims, getClaimById, submitClaim, cancelClaim };
