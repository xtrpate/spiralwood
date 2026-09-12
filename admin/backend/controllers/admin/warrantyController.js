// controllers/warrantyController.js (Admin)
// WISDOM Warranty + Inventory V1.0.0
const db = require("../../config/db");
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

exports.getClaims = async (req, res) => {
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
