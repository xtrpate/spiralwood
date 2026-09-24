// controllers/warrantyController.js (Admin)
// WISDOM Warranty + Inventory V1.0.0
const db = require("../../config/db");
const {
  getPhilippineDateBoundsUtc,
  getPhilippineDateKey,
} = require("../../utils/philippineTime");
const { signUploadPath } = require("../../utils/signedUrl");
const { createNotificationSafe } = require("../../utils/notificationHelper");
const {
  getResolutionOptions,
  fulfillClaimWithInventory,
} = require("../../services/warrantyInventoryService");

const splitStoredProofs = (value) => {
  const parts = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  return { photo_url: parts[0] || null, proof_url: parts[1] || null };
};


const OPERATIONS_WARRANTY_DATE_FILTERS = new Set([
  "all",
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "this_year",
  "custom",
]);

const formatUtcDateKeyForOperationsWarrantyReport = (date) =>
  [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");

const shiftOperationsWarrantyDateKey = (dateKey, days) => {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return formatUtcDateKeyForOperationsWarrantyReport(
    new Date(Date.UTC(year, month - 1, day + days)),
  );
};

const buildOperationsWarrantyDateRange = ({ dateFilter, from, to }) => {
  const normalizedFilter = String(dateFilter || "all")
    .trim()
    .toLowerCase();

  if (!OPERATIONS_WARRANTY_DATE_FILTERS.has(normalizedFilter)) {
    const error = new Error("Invalid operations warranty date filter.");
    error.status = 400;
    throw error;
  }

  if (normalizedFilter === "all") {
    return { startUtc: null, endUtc: null };
  }

  if (normalizedFilter === "custom") {
    const fromKey = String(from || "").trim();
    const toKey = String(to || "").trim();

    if (fromKey && toKey && fromKey > toKey) {
      const error = new Error("Start date cannot be after end date.");
      error.status = 400;
      throw error;
    }

    try {
      return {
        startUtc: fromKey
          ? getPhilippineDateBoundsUtc(fromKey).startUtc
          : null,
        endUtc: toKey
          ? getPhilippineDateBoundsUtc(toKey).nextStartUtc
          : null,
      };
    } catch {
      const error = new Error(
        "Operations warranty dates must use valid YYYY-MM-DD values.",
      );
      error.status = 400;
      throw error;
    }
  }

  const todayKey = getPhilippineDateKey();
  const [year, month, day] = todayKey.split("-").map(Number);

  let startKey = todayKey;
  let endKey = shiftOperationsWarrantyDateKey(todayKey, 1);

  if (normalizedFilter === "yesterday") {
    startKey = shiftOperationsWarrantyDateKey(todayKey, -1);
    endKey = todayKey;
  } else if (normalizedFilter === "this_week") {
    // Preserve the Operations Report's existing Sunday-Saturday week.
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    startKey = shiftOperationsWarrantyDateKey(todayKey, -dayOfWeek);
    endKey = shiftOperationsWarrantyDateKey(startKey, 7);
  } else if (normalizedFilter === "this_month") {
    startKey = [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      "01",
    ].join("-");
    endKey = formatUtcDateKeyForOperationsWarrantyReport(
      new Date(Date.UTC(year, month, 1)),
    );
  } else if (normalizedFilter === "this_year") {
    startKey = `${String(year).padStart(4, "0")}-01-01`;
    endKey = `${String(year + 1).padStart(4, "0")}-01-01`;
  }

  return {
    startUtc: getPhilippineDateBoundsUtc(startKey).startUtc,
    endUtc: getPhilippineDateBoundsUtc(endKey).startUtc,
  };
};

const mapOperationsWarrantyClaim = (row) => {
  const { photo_url, proof_url } = splitStoredProofs(row.proof_url);

  return {
    ...row,
    claim_quantity: Number(row.claim_quantity || 1),
    ordered_quantity: Number(row.ordered_quantity || 0),
    description: row.reason,
    issue_description: row.reason,
    photo_url: signUploadPath(photo_url),
    proof_url: signUploadPath(proof_url),
    replacement_receipt: signUploadPath(row.replacement_receipt),
    reason: undefined,
  };
};

const getOperationsWarrantyReport = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      200,
      Math.max(1, parseInt(req.query.limit, 10) || 20),
    );
    const offset = (page - 1) * limit;
    const includeSummary =
      String(req.query.include_summary || "1").trim() !== "0";

    const where = ["1=1"];
    const params = [];

    const search = String(req.query.search || "").trim();

    if (search.length > 120) {
      return res
        .status(400)
        .json({ message: "Search must be 120 characters or less." });
    }

    if (search) {
      const pattern = `%${search}%`;

      where.push(`(
        CAST(w.id AS CHAR) LIKE ?
        OR CAST(COALESCE(w.order_id, 0) AS CHAR) LIKE ?
        OR CAST(COALESCE(w.order_item_id, 0) AS CHAR) LIKE ?
        OR CAST(COALESCE(w.customer_id, 0) AS CHAR) LIKE ?
        OR COALESCE(w.product_name, '') LIKE ?
        OR CAST(COALESCE(w.claim_quantity, 0) AS CHAR) LIKE ?
        OR COALESCE(w.reason, '') LIKE ?
        OR COALESCE(w.admin_note, '') LIKE ?
        OR CAST(COALESCE(w.warranty_expiry, '') AS CHAR) LIKE ?
        OR COALESCE(w.status, '') LIKE ?
        OR COALESCE(w.resolution_type, '') LIKE ?
        OR COALESCE(w.resolution_notes, '') LIKE ?
        OR COALESCE(w.replacement_source, '') LIKE ?
        OR COALESCE(w.return_disposition, '') LIKE ?
        OR CAST(COALESCE(w.fulfilled_at, '') AS CHAR) LIKE ?
        OR CAST(COALESCE(w.fulfilled_by, 0) AS CHAR) LIKE ?
        OR CAST(COALESCE(w.created_at, '') AS CHAR) LIKE ?
        OR CAST(COALESCE(w.updated_at, '') AS CHAR) LIKE ?
        OR COALESCE(o.order_number, '') LIKE ?
        OR CAST(COALESCE(oi.quantity, 0) AS CHAR) LIKE ?
        OR COALESCE(c.name, o.walkin_customer_name, 'Customer') LIKE ?
        OR COALESCE(fulfiller.name, '') LIKE ?
      )`);

      params.push(...Array(22).fill(pattern));
    }

    const { startUtc, endUtc } = buildOperationsWarrantyDateRange({
      dateFilter: req.query.date_filter,
      from: req.query.from,
      to: req.query.to,
    });

    // Preserve the Operations Report's previous warranty date priority:
    // created_at first; updated_at only as a fallback.
    const reportDateSql = "COALESCE(w.created_at, w.updated_at)";

    if (startUtc) {
      where.push(`${reportDateSql} >= ?`);
      params.push(startUtc);
    }

    if (endUtc) {
      where.push(`${reportDateSql} < ?`);
      params.push(endUtc);
    }

    const joinsSql = `
      LEFT JOIN orders o ON o.id = w.order_id
      LEFT JOIN order_items oi ON oi.id = w.order_item_id
      LEFT JOIN users c ON c.id = w.customer_id
      LEFT JOIN users fulfiller ON fulfiller.id = w.fulfilled_by`;

    const whereSql = where.join(" AND ");

    const [rows] = await db.query(
      `SELECT
         w.id,
         w.order_id,
         w.order_item_id,
         w.customer_id,
         w.product_name,
         w.claim_quantity,
         w.reason,
         w.admin_note,
         w.proof_url,
         w.warranty_expiry,
         w.status,
         w.replacement_receipt,
         w.resolution_type,
         w.resolution_notes,
         w.replacement_source,
         w.return_disposition,
         w.fulfilled_at,
         w.fulfilled_by,
         w.created_at,
         w.updated_at,
         o.order_number,
         oi.quantity AS ordered_quantity,
         COALESCE(c.name, o.walkin_customer_name, 'Customer') AS customer_name,
         fulfiller.name AS fulfilled_by_name
       FROM warranties w
       ${joinsSql}
       WHERE ${whereSql}
       ORDER BY
         FIELD(
           w.status,
           'pending',
           'approved',
           'fulfilled',
           'rejected',
           'cancelled'
         ),
         w.created_at DESC,
         w.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const response = {
      claims: rows.map(mapOperationsWarrantyClaim),
      page,
      limit,
    };

    if (includeSummary) {
      const [[summaryRow]] = await db.query(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(
             CASE
               WHEN LOWER(COALESCE(w.status, '')) IN (
                 'pending',
                 'scheduled',
                 'in_progress'
               )
               THEN 1 ELSE 0
             END
           ), 0) AS pending,
           COALESCE(SUM(
             CASE
               WHEN LOWER(COALESCE(w.status, '')) IN (
                 'completed',
                 'resolved',
                 'delivered',
                 'done'
               )
               THEN 1 ELSE 0
             END
           ), 0) AS completed
         FROM warranties w
         ${joinsSql}
         WHERE ${whereSql}`,
        params,
      );

      response.total = Number(summaryRow?.total || 0);
      response.summary = {
        pending: Number(summaryRow?.pending || 0),
        completed: Number(summaryRow?.completed || 0),
      };
    }

    return res.json(response);
  } catch (err) {
    if (Number(err?.status) === 400) {
      return res.status(400).json({ message: err.message });
    }

    console.error("[admin.warranty GET operations report]", err);
    return res.status(500).json({
      message: "Failed to load warranty operations report.",
    });
  }
};

exports.getClaims = async (req, res) => {
  if (String(req.query.operations_report || "").trim() === "1") {
    return getOperationsWarrantyReport(req, res);
  }

  try {
    const [rows] = await db.query(
      `SELECT
         w.id, w.order_id, w.order_item_id, w.customer_id, w.product_name,
         w.claim_quantity, w.reason, w.admin_note, w.proof_url, w.warranty_expiry,
         w.status, w.replacement_receipt, w.resolution_type, w.resolution_notes,
         w.replacement_source, w.return_disposition, w.fulfilled_at, w.fulfilled_by,
         w.created_at, w.updated_at, o.order_number,
         oi.quantity AS ordered_quantity,
         COALESCE(c.name, o.walkin_customer_name, 'Customer') AS customer_name,
         fulfiller.name AS fulfilled_by_name
       FROM warranties w
       LEFT JOIN orders o ON o.id = w.order_id
       LEFT JOIN order_items oi ON oi.id = w.order_item_id
       LEFT JOIN users c ON c.id = w.customer_id
       LEFT JOIN users fulfiller ON fulfiller.id = w.fulfilled_by
       ORDER BY FIELD(w.status, 'pending', 'approved', 'fulfilled', 'rejected', 'cancelled'), w.created_at DESC`,
      [],
    );

    return res.json(rows.map((row) => {
      const { photo_url, proof_url } = splitStoredProofs(row.proof_url);
      return {
        ...row,
        claim_quantity: Number(row.claim_quantity || 1),
        ordered_quantity: Number(row.ordered_quantity || 0),
        description: row.reason,
        photo_url: signUploadPath(photo_url),
        proof_url: signUploadPath(proof_url),
        replacement_receipt: signUploadPath(row.replacement_receipt),
        reason: undefined,
      };
    }));
  } catch (err) {
    console.error("[admin.warranty GET]", err);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

exports.decideClaim = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const decision = String(req.body?.decision || "").trim().toLowerCase();
  const adminNote = String(req.body?.admin_note || "").trim();
  if (!id) return res.status(400).json({ message: "Valid warranty claim ID is required." });
  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ message: "Decision must be either approved or rejected." });
  }
  if (decision === "rejected" && !adminNote) {
    return res.status(400).json({ message: "Please provide the rejection reason or admin note." });
  }

  try {
    const [[claim]] = await db.query(
      `SELECT w.id, w.status, w.customer_id, w.order_id, w.product_name, o.order_number
       FROM warranties w LEFT JOIN orders o ON o.id = w.order_id
       WHERE w.id = ? LIMIT 1`,
      [id],
    );
    if (!claim) return res.status(404).json({ message: "Warranty claim not found." });
    const currentStatus = String(claim.status || "").toLowerCase();
    if (currentStatus === "fulfilled") {
      return res.status(400).json({ message: "This warranty claim is already fulfilled and can no longer be changed." });
    }
    if (currentStatus !== "pending") {
      return res.status(400).json({ message: "Only pending warranty claims can be approved or rejected." });
    }

    await db.query(
      `UPDATE warranties SET status = ?, admin_note = ?, updated_at = NOW() WHERE id = ?`,
      [decision, adminNote || null, id],
    );

    if (claim.customer_id) {
      const orderLabel = claim.order_number || `#${claim.order_id}`;
      await createNotificationSafe(db, {
        userId: claim.customer_id,
        type: "warranty_update",
        title: decision === "approved" ? "Warranty Claim Approved" : "Warranty Claim Not Approved",
        message: decision === "approved"
          ? `Your warranty claim for ${claim.product_name} from Order ${orderLabel} has been approved. Our team will proceed with the warranty service.`
          : `We could not approve your warranty claim for ${claim.product_name} from Order ${orderLabel}. Reason: ${adminNote}`,
        targetType: "warranty", targetId: claim.id, targetOrderId: claim.order_id,
      });
    }

    req.auditRecord = { id, old: { status: currentStatus }, new: { status: decision, has_admin_note: Boolean(adminNote) } };
    return res.json({ message: decision === "approved" ? "Warranty claim approved successfully." : "Warranty claim rejected successfully." });
  } catch (err) {
    console.error("[admin.warranty decide]", err);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

exports.getResolutionOptions = async (req, res) => {
  try {
    const data = await getResolutionOptions(req.params.id);
    return res.json(data);
  } catch (err) {
    const status = Number(err?.status) || 500;
    return res.status(status).json({ message: err?.message || "Failed to load warranty resolution options.", ...(err?.details ? { details: err.details } : {}) });
  }
};

exports.fulfillClaim = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Valid warranty claim ID is required." });

  const uploadedReceipt = req.file?.path || (req.file?.filename ? `uploads/warranty-replacements/${req.file.filename}` : null);
  try {
    const result = await fulfillClaimWithInventory({
      claimId: id,
      actorId: req.user.id,
      receiptPath: uploadedReceipt,
      resolutionType: req.body?.resolution_type,
      resolutionNotes: req.body?.resolution_notes,
      replacementSource: req.body?.replacement_source,
      returnDisposition: req.body?.return_disposition,
      materials: req.body?.materials_json,
    });

    const claim = result.claim;
    if (claim.customer_id) {
      const orderLabel = claim.order_number || `#${claim.order_id}`;
      await createNotificationSafe(db, {
        userId: claim.customer_id,
        type: "warranty_update",
        title: "Warranty Service Completed",
        message: `Your warranty claim for ${claim.product_name} x${claim.claim_quantity} from Order ${orderLabel} has been completed. You can view the fulfillment proof in your warranty details.`,
        targetType: "warranty", targetId: claim.id, targetOrderId: claim.order_id,
      });
    }

    req.auditRecord = {
      id,
      old: { status: "approved" },
      new: {
        status: "fulfilled",
        resolution_type: result.resolution_type,
        replacement_source: result.replacement_source,
        return_disposition: result.return_disposition,
        material_lines: result.material_lines,
        has_replacement_receipt: true,
        receipt_uploaded_this_update: Boolean(uploadedReceipt),
      },
    };
    return res.json({ message: "Warranty claim resolved and fulfilled successfully." });
  } catch (err) {
    console.error("[admin.warranty fulfill]", err);
    const status = Number(err?.status) || 500;
    return res.status(status).json({ message: err?.message || "Warranty fulfillment failed.", ...(err?.details ? { details: err.details } : {}) });
  }
};
