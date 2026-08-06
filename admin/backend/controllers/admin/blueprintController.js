// controllers/blueprintController.js
// Route-facing Blueprint handlers. Shared imports, validators, normalizers,
// and estimation/reference helpers live in blueprintController.helpers.js.
const {
  path,
  pool,
  resolveLifecycleByBlueprint,
  resolveLifecycleByOrder,
  createNotificationSafe,
  safeJsonParse,
  sortJsonValue,
  normalizeJsonForComparison,
  ESTIMATION_ITEM_SOURCE_TYPES,
  createValidationError,
  normalizeEstimationItems,
  validateEstimationItems,
  getItemSubtotal,
  groupDraftItems,
  findRawMaterialMatch,
  computeEstimationTotals,
  buildAutoEstimationDraft,
  getBlueprintFileMeta,
  REFERENCE_VIEWS,
  createEmptyReferenceFiles,
  normalizeReferenceFilesMap,
  buildUploadedReferenceFiles,
  hasAnyReferenceFiles,
  normalizeReferenceFile,
  mergeDesignData,
  normalizeSource,
  backfillLegacyArchivedDates,
  deleteBlueprintCascade,
  purgeExpiredArchivedBlueprints,
} = require("./blueprintController.helpers");

exports.getAll = async (req, res) => {
  try {
    await backfillLegacyArchivedDates();
    await purgeExpiredArchivedBlueprints();

    const { tab = "my", page = 1, limit = 20, search = "" } = req.query;

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const where = [];
    const params = [];

    if (tab === "my") {
      where.push("b.creator_id = ? AND b.is_deleted = 0");
      params.push(parseInt(req.user.id));
    }

    if (tab === "imports") {
      where.push("b.source = 'imported' AND b.is_deleted = 0");
    }

    if (tab === "gallery") {
      where.push(
        "(b.is_template = 1 OR b.is_gallery = 1) AND b.is_deleted = 0",
      );
    }

    if (tab === "archive") {
      where.push("b.is_deleted = 1");
    }

    if (String(search).trim()) {
      const keyword = `%${String(search).trim()}%`;
      where.push(`(
        b.title LIKE ?
        OR COALESCE(b.description, '') LIKE ?
        OR COALESCE(u.name, '') LIKE ?
        OR COALESCE(c.name, '') LIKE ?
        OR COALESCE(b.file_type, '') LIKE ?
      )`);
      params.push(keyword, keyword, keyword, keyword, keyword);
    }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const baseFrom = `
      FROM blueprints b
      JOIN users u ON u.id = b.creator_id
      LEFT JOIN users c ON c.id = b.client_id
    `;

    const [rows] = await pool.query(
      `SELECT b.id, b.title, b.description, b.stage, b.source,
              b.file_url, b.file_type, b.thumbnail_url,
              b.is_template, b.is_gallery, b.is_deleted, b.archived_at,
              b.created_at, b.updated_at,
              u.name AS creator_name,
              c.name AS client_name,
              CASE
                WHEN b.is_deleted = 1
                  THEN GREATEST(0, 30 - DATEDIFF(CURDATE(), DATE(COALESCE(b.archived_at, b.updated_at, b.created_at))))
                ELSE NULL
              END AS archive_days_left,
              CASE
                WHEN b.is_deleted = 1
                  THEN DATE_ADD(DATE(COALESCE(b.archived_at, b.updated_at, b.created_at)), INTERVAL 30 DAY)
                ELSE NULL
              END AS archive_expires_at
       ${baseFrom}
       ${whereSQL}
       ORDER BY
         CASE
           WHEN b.is_deleted = 1 THEN COALESCE(b.archived_at, b.updated_at, b.created_at)
           ELSE b.updated_at
         END DESC,
         b.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limitNum), parseInt(offset)],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       ${baseFrom}
       ${whereSQL}`,
      params,
    );

    res.json({ rows, total });
  } catch (err) {
    console.error("getAll blueprints error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── GET /api/blueprints/:id ───────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [[bp]] = await pool.query(
      `SELECT b.*, u.name AS creator_name, c.name AS client_name,
              CASE
                WHEN b.is_deleted = 1
                  THEN GREATEST(0, 30 - DATEDIFF(CURDATE(), DATE(COALESCE(b.archived_at, b.updated_at, b.created_at))))
                ELSE NULL
              END AS archive_days_left,
              CASE
                WHEN b.is_deleted = 1
                  THEN DATE_ADD(DATE(COALESCE(b.archived_at, b.updated_at, b.created_at)), INTERVAL 30 DAY)
                ELSE NULL
              END AS archive_expires_at
       FROM blueprints b
       JOIN users u ON u.id = b.creator_id
       LEFT JOIN users c ON c.id = b.client_id
       WHERE b.id = ?`,
      [parseInt(req.params.id)],
    );

    if (!bp) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    const [components] = await pool.query(
      "SELECT * FROM blueprint_components WHERE blueprint_id = ?",
      [parseInt(req.params.id)],
    );

    const [revisions] = await pool.query(
      `SELECT br.*, u.name AS revised_by_name
       FROM blueprint_revisions br
       LEFT JOIN users u ON u.id = br.revised_by
       WHERE br.blueprint_id = ?
       ORDER BY br.revision_number DESC`,
      [parseInt(req.params.id)],
    );

    const [linkedOrderRows] = await pool.query(
      `SELECT
          o.id AS order_id,
          o.order_number,
          o.customer_id,
          o.status AS order_status,
          o.payment_status,
          o.notes AS order_notes,
          o.delivery_request_notes,
          oi.id AS order_item_id,
          oi.product_name,
          oi.quantity AS order_quantity,
          oi.customization_json
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.blueprint_id = ?
       ORDER BY o.id ASC, oi.id ASC`,
      [parseInt(req.params.id)],
    );

    const linkedOrderIds = [
      ...new Set(
        linkedOrderRows
          .map((row) => Number(row.order_id) || null)
          .filter(Boolean),
      ),
    ];

    const orderContext =
      linkedOrderIds.length === 1 && linkedOrderRows.length
        ? {
            order_id: linkedOrderRows[0].order_id,
            order_number: linkedOrderRows[0].order_number,
            customer_id: linkedOrderRows[0].customer_id,
            order_status: linkedOrderRows[0].order_status,
            payment_status: linkedOrderRows[0].payment_status,
            order_notes: linkedOrderRows[0].order_notes || null,
            delivery_request_notes:
              linkedOrderRows[0].delivery_request_notes || null,
            items: linkedOrderRows.map((row) => ({
              order_item_id: row.order_item_id || null,
              product_name: row.product_name || null,
              quantity: Number(row.order_quantity || 0) || 0,
              customization:
                safeJsonParse(row.customization_json, {}) || {},
            })),
          }
        : null;

    const normalizedDesignData = mergeDesignData(bp.design_data, bp, bp.title);

    res.json({
      ...bp,
      order_id: orderContext?.order_id || null,
      order_number: orderContext?.order_number || null,
      order_context: orderContext,
      order_context_warning:
        linkedOrderIds.length > 1 ? "MULTIPLE_LINKED_ORDERS" : null,
      design_data: normalizedDesignData,
      components,
      revision_history: revisions,
    });
  } catch (err) {
    console.error("getOne blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── POST /api/blueprints ──────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const {
      title,
      description,
      client_id,
      is_template,
      is_gallery,
      stage,
      source,
      thumbnail_url,
      design_data,
    } = req.body;

    if (!String(title || "").trim()) {
      return res.status(400).json({ message: "Blueprint title is required." });
    }

    const finalTitle = String(title).trim();
    const uploadedReferenceFiles = buildUploadedReferenceFiles(
      req.referenceFiles,
      finalTitle,
    );
    const primaryReference = uploadedReferenceFiles.front || null;
    const fileMeta = getBlueprintFileMeta(req.file);
    const normalizedSource = normalizeSource(
      source,
      !!req.file || hasAnyReferenceFiles(uploadedReferenceFiles),
    );
    const finalStage = String(stage || "").trim() || "design";
    const finalThumbnail =
      thumbnail_url ||
      primaryReference?.url ||
      fileMeta.default_thumbnail_url ||
      null;

    const finalDesignData = mergeDesignData(
      design_data,
      {
        file_url: primaryReference?.url || fileMeta.file_url,
        file_type: primaryReference?.type || fileMeta.file_type,
        reference_files: uploadedReferenceFiles,
      },
      finalTitle,
    );

    const [r] = await pool.query(
      `INSERT INTO blueprints
        (title, description, creator_id, client_id, source, stage, file_url, file_type, thumbnail_url, design_data, is_template, is_gallery, is_deleted, archived_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        finalTitle,
        description || null,
        parseInt(req.user.id),
        client_id ? parseInt(client_id) : null,
        fileMeta.source || normalizedSource,
        finalStage,
        fileMeta.file_url,
        fileMeta.file_type,
        finalThumbnail,
        finalDesignData,
        Number(is_template) ? 1 : 0,
        Number(is_gallery) ? 1 : 0,
        0,
        null,
      ],
    );

    req.auditRecord = {
      id: r.insertId,
      new: {
        stage: finalStage,
        source: fileMeta.source || normalizedSource,
        is_template: Boolean(Number(is_template)),
        is_gallery: Boolean(Number(is_gallery)),
        file_uploaded: Boolean(req.file),
        reference_files_uploaded: hasAnyReferenceFiles(uploadedReferenceFiles),
      },
    };

    res.status(201).json({
      message: "Blueprint created.",
      id: r.insertId,
      blueprint: {
        id: r.insertId,
        title: finalTitle,
        source: fileMeta.source || normalizedSource,
        stage: finalStage,
        file_url: primaryReference?.url || fileMeta.file_url,
        file_type: primaryReference?.type || fileMeta.file_type,
        thumbnail_url: finalThumbnail,
        design_data: finalDesignData,
      },
    });
  } catch (err) {
    console.error("create blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── PUT /api/blueprints/:id ───────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const [[bp]] = await pool.query("SELECT * FROM blueprints WHERE id = ?", [
      parseInt(req.params.id),
    ]);

    if (!bp) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    const locked = safeJsonParse(bp.locked_fields, []);
    const updates = { ...req.body };
    const uploadedReferenceFiles = buildUploadedReferenceFiles(
      req.referenceFiles,
      bp.title || "",
    );
    const hasUploadedReferenceFiles = hasAnyReferenceFiles(
      uploadedReferenceFiles,
    );
    const fileMeta = getBlueprintFileMeta(req.file);

    locked.forEach((field) => delete updates[field]);

    const allowedCols = [
      "title",
      "description",
      "stage",
      "design_data",
      "view_3d_data",
      "locked_fields",
      "thumbnail_url",
      "is_template",
      "is_gallery",
      "client_id",
      "source",
      "file_url",
      "file_type",
      "base_price",
    ];

    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowedCols.includes(key)),
    );

    const incomingHasDesignData = Object.prototype.hasOwnProperty.call(
      filtered,
      "design_data",
    );

    if (req.file) {
      filtered.source = fileMeta.source;
      filtered.file_url = fileMeta.file_url;
      filtered.file_type = fileMeta.file_type;

      if (!filtered.thumbnail_url) {
        filtered.thumbnail_url = fileMeta.default_thumbnail_url;
      }
    }

    if (filtered.source) {
      filtered.source = normalizeSource(
        filtered.source,
        !!req.file || hasUploadedReferenceFiles,
      );
    }

    if (filtered.title != null && !String(filtered.title).trim()) {
      return res
        .status(400)
        .json({ message: "Blueprint title cannot be empty." });
    }

    if (filtered.title != null) {
      filtered.title = String(filtered.title).trim();
    }

    if (incomingHasDesignData || req.file || hasUploadedReferenceFiles) {
      filtered.design_data = mergeDesignData(
        incomingHasDesignData ? filtered.design_data : bp.design_data,
        {
          file_url: filtered.file_url || bp.file_url,
          file_type: filtered.file_type || bp.file_type,
          reference_files: uploadedReferenceFiles,
        },
        filtered.title || bp.title,
      );
    }

    if (!Object.keys(filtered).length) {
      return res.status(400).json({ message: "No updatable fields." });
    }

    // Compare bp (old row, SELECT * already fetched above) against the
    // final normalized `filtered` values — a key being present in
    // `filtered` only means it was submitted/derived, not that its value
    // actually differs from what's already stored.
    const BOOLEAN_NUMERIC_FIELDS = ["is_template", "is_gallery"];
    const NULLABLE_ID_FIELDS = ["client_id"];
    const JSON_FIELDS = ["design_data", "view_3d_data", "locked_fields"];
    const normNum = (v) =>
      v === null || v === undefined || v === "" ? null : Number(v);

    const actualChangedFields = Object.keys(filtered).filter((key) => {
      const oldVal = bp[key];
      const newVal = filtered[key];
      if (BOOLEAN_NUMERIC_FIELDS.includes(key)) {
        return Boolean(Number(oldVal)) !== Boolean(Number(newVal));
      }
      if (NULLABLE_ID_FIELDS.includes(key)) {
        return normNum(oldVal) !== normNum(newVal);
      }
      if (JSON_FIELDS.includes(key)) {
        const fallback = key === "locked_fields" ? [] : {};
        return (
          normalizeJsonForComparison(oldVal, fallback) !==
          normalizeJsonForComparison(newVal, fallback)
        );
      }
      return String(oldVal ?? "") !== String(newVal ?? "");
    });

    if (incomingHasDesignData) {
      const [[{ maxRev }]] = await pool.query(
        `SELECT COALESCE(MAX(revision_number), 0) AS maxRev
         FROM blueprint_revisions
         WHERE blueprint_id = ?`,
        [parseInt(req.params.id)],
      );

      await pool.query(
        `INSERT INTO blueprint_revisions
          (blueprint_id, revision_number, stage_at_save, revision_data, revised_by)
         VALUES (?,?,?,?,?)`,
        [
          parseInt(req.params.id),
          maxRev + 1,
          bp.stage,
          bp.design_data,
          parseInt(req.user.id),
        ],
      );
    }

    const sets = Object.keys(filtered)
      .map((key) => `${key} = ?`)
      .join(", ");

    await pool.query(
      `UPDATE blueprints
       SET ${sets}
       WHERE id = ?`,
      [...Object.values(filtered), parseInt(req.params.id)],
    );

    // A revision row is written whenever incomingHasDesignData is true,
    // even if the normalized design content turns out equivalent — that
    // write is real and must be captured even when actualChangedFields
    // ends up empty. An empty fields_changed array is expected/valid
    // whenever revision_created is true but no other column changed.
    const revisionCreated = incomingHasDesignData;

    if (actualChangedFields.length > 0 || revisionCreated) {
      req.auditRecord = {
        id: parseInt(req.params.id),
        new: {
          fields_changed: actualChangedFields,
          stage_changed: actualChangedFields.includes("stage"),
          design_data_changed: actualChangedFields.includes("design_data"),
          file_uploaded: Boolean(req.file),
          reference_files_uploaded: hasUploadedReferenceFiles,
          revision_created: revisionCreated,
        },
      };
    }

    res.json({
      message: "Blueprint updated.",
      blueprint: {
        id: Number(req.params.id),
        ...filtered,
      },
    });
  } catch (err) {
    console.error("update blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── DELETE /api/blueprints/:id (soft delete → archive) ───────────────────────
exports.archive = async (req, res) => {
  try {
    const [[bp]] = await pool.query(
      `SELECT id, stage, is_deleted
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (!bp) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    const [updateResult] = await pool.query(
      `UPDATE blueprints
       SET is_deleted = 1,
           stage = 'archived',
           archived_at = NOW()
       WHERE id = ?`,
      [parseInt(req.params.id)],
    );

    if (updateResult.affectedRows > 0) {
      req.auditRecord = {
        id: parseInt(req.params.id),
        old: { stage: bp.stage, archived: Boolean(Number(bp.is_deleted)) },
        new: { stage: "archived", archived: true },
      };
    }

    res.json({ message: "Blueprint archived." });
  } catch (err) {
    console.error("archive blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── PATCH /api/blueprints/:id/restore ────────────────────────────────────────
exports.restore = async (req, res) => {
  try {
    const [[bp]] = await pool.query(
      `SELECT id, stage, is_deleted, archived_at
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (!bp) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    const wasArchived =
      Number(bp.is_deleted) === 1 ||
      bp.archived_at != null ||
      bp.stage === "archived";

    await pool.query(
      `UPDATE blueprints
       SET is_deleted = 0,
           archived_at = NULL,
           stage = CASE
             WHEN stage = 'archived' THEN 'design'
             ELSE stage
           END
       WHERE id = ?`,
      [parseInt(req.params.id)],
    );

    if (wasArchived) {
      const newStage = bp.stage === "archived" ? "design" : bp.stage;
      req.auditRecord = {
        id: parseInt(req.params.id),
        old: { stage: bp.stage, archived: Boolean(Number(bp.is_deleted)) },
        new: { restored: true, archived: false, stage: newStage },
      };
    }

    res.json({ message: "Blueprint restored." });
  } catch (err) {
    console.error("restore blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── DELETE /api/blueprints/:id/permanent ─────────────────────────────────────
exports.permanentDelete = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[bp]] = await conn.query(
      `SELECT id, is_deleted, stage
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (!bp) {
      await conn.rollback();
      return res.status(404).json({ message: "Blueprint not found." });
    }

    if (Number(bp.is_deleted) !== 1) {
      await conn.rollback();
      return res.status(400).json({
        message: "Only archived blueprints can be permanently deleted.",
      });
    }

    const [[linkedOrder]] = await conn.query(
      `SELECT id
       FROM orders
       WHERE blueprint_id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (linkedOrder) {
      await conn.rollback();
      return res.status(400).json({
        message: "Cannot permanently delete blueprint linked to an order.",
      });
    }

    await deleteBlueprintCascade(conn, [Number(req.params.id)]);

    await conn.commit();

    req.auditRecord = {
      id: parseInt(req.params.id),
      old: { archived: true, stage: bp.stage },
      new: { permanently_deleted: true },
    };

    res.json({ message: "Blueprint permanently deleted." });
  } catch (err) {
    await conn.rollback();
    console.error("permanentDelete blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── GET /api/blueprints/:id/estimation ───────────────────────────────────────
exports.getEstimation = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const blueprintId = parseInt(req.params.id);
    const lifecycle = await resolveLifecycleByBlueprint(conn, { blueprintId });

    // ── MULTIPLE_ORDER_OWNERS: no auto-draft, no active estimation ────────
    // Never guessed, never served — manual review required.
    if (lifecycle.reason === "MULTIPLE_ORDER_OWNERS") {
      return res.status(409).json({
        message: lifecycle.message,
        integrity_warning: true,
        integrity_reason: lifecycle.reason,
        conflicting_order_ids: lifecycle.conflicting_order_ids,
      });
    }

    // ── STALE_ESTIMATION: never serve the stale row as the active one ─────
    if (lifecycle.reason === "STALE_ESTIMATION") {
      const response = {
        id: null,
        blueprint_id: Number(blueprintId),
        integrity_warning: true,
        integrity_reason: lifecycle.reason,
        stale_candidate: lifecycle.stale_candidate
          ? {
              id: lifecycle.stale_candidate.id,
              created_at: lifecycle.stale_candidate.created_at,
              status: lifecycle.stale_candidate.status,
              grand_total: lifecycle.stale_candidate.grand_total,
            }
          : null,
        can_create_replacement_estimation:
          lifecycle.can_create_replacement_estimation,
        recovery_block_reason: lifecycle.recovery_block_reason,
      };

      // Only attach an unpersisted recovery draft when recovery is actually
      // allowed — reuses the same generator as the NO_ESTIMATION path below.
      if (lifecycle.can_create_replacement_estimation) {
        const autoDraft = await buildAutoEstimationDraft(conn, blueprintId);

        if (autoDraft) {
          Object.assign(response, {
            version: autoDraft.version || 0,
            status: autoDraft.status || "draft",
            auto_generated: true,
            auto_source: autoDraft.source || "unknown",
            is_recovery_draft: true,
            persisted: false,
            items: autoDraft.items || [],
            material_cost: autoDraft.material_cost || 0,
            items_total: autoDraft.items_total || 0,
            inventory_pricing_mode: "tracking_only",
            labor_cost: autoDraft.labor_cost || 0,
            overhead_cost: autoDraft.overhead_cost || 0,
            additional_delivery_fee:
              autoDraft.additional_delivery_fee || 0,
            tax_rate: autoDraft.tax_rate ?? 12,
            discount: autoDraft.discount || 0,
            notes: autoDraft.notes || "",
            subtotal: autoDraft.subtotal || 0,
            tax_amount: autoDraft.tax_amount || 0,
            grand_total: autoDraft.grand_total || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      return res.json(response);
    }

    // ── NO_ESTIMATION (or a resolved-but-missing blueprint): preserve the
    //    existing auto-draft behavior exactly, unchanged from before. ──────
    if (!lifecycle.estimation) {
      const autoDraft = await buildAutoEstimationDraft(conn, blueprintId);

      if (!autoDraft) {
        return res.status(404).json({ message: "No estimation yet." });
      }

      return res.json({
        id: null,
        blueprint_id: Number(blueprintId),
        version: autoDraft.version || 0,
        status: autoDraft.status || "draft",
        auto_generated: true,
        auto_source: autoDraft.source || "unknown",
        items: autoDraft.items || [],
        material_cost: autoDraft.material_cost || 0,
        items_total: autoDraft.items_total || 0,
        inventory_pricing_mode: "tracking_only",
        labor_cost: autoDraft.labor_cost || 0,
        overhead_cost: autoDraft.overhead_cost || 0,
        additional_delivery_fee:
          autoDraft.additional_delivery_fee || 0,
        tax_rate: autoDraft.tax_rate ?? 12,
        discount: autoDraft.discount || 0,
        notes: autoDraft.notes || "",
        subtotal: autoDraft.subtotal || 0,
        tax_amount: autoDraft.tax_amount || 0,
        grand_total: autoDraft.grand_total || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // ── Normal path: lifecycle-valid estimation only ───────────────────────
    const est = lifecycle.estimation;

    const [itemRows] = await conn.query(
      `SELECT id, estimation_id, component_id, raw_material_id, description, quantity, unit_cost, subtotal
       FROM estimation_items
       WHERE estimation_id = ?
       ORDER BY id ASC`,
      [parseInt(est.id)],
    );

    const meta = safeJsonParse(est.estimation_data, {});
    const dbItems = itemRows.map((row) => ({
      id: row.id,
      component_id: row.component_id || null,
      raw_material_id: row.raw_material_id || null,
      name: row.description || "",
      description: row.description || "",
      quantity: Number(row.quantity) || 1,
      unit: "pc",
      unit_cost: Number(row.unit_cost) || 0,
      note: "",
      source_key: "",
      source_type: row.raw_material_id ? "inventory_material" : "other",
      subtotal:
        row.subtotal != null
          ? Number(row.subtotal) || 0
          : (Number(row.quantity) || 0) * (Number(row.unit_cost) || 0),
    }));

    const normalizedItems = normalizeEstimationItems(
      Array.isArray(meta.items) && meta.items.length ? meta.items : dbItems,
    );
    const inventory_pricing_mode =
      String(meta.inventory_pricing_mode || "").toLowerCase() ===
      "tracking_only"
        ? "tracking_only"
        : String(est.status || "").toLowerCase() === "draft"
          ? "tracking_only"
          : "legacy_billable";

    const materialCostRaw = Number(est.material_cost);
    const laborCostRaw = Number(est.labor_cost);
    const taxRaw = Number(est.tax);
    const grandTotalRaw = Number(est.grand_total);
    const storedDiscountAmountRaw = Number(est.discount);

    const normalizedMaterialCost = computeEstimationTotals({
      items: normalizedItems,
      inventory_pricing_mode,
    }).material_cost;

    const material_cost = Number.isFinite(materialCostRaw)
      ? materialCostRaw
      : normalizedMaterialCost;
    const labor_cost = Number.isFinite(laborCostRaw)
      ? laborCostRaw
      : Number(meta.labor_cost || 0);
    const overhead_cost = Number(meta.overhead_cost) || 0;
    const additional_delivery_fee = Math.max(
      0,
      Number(meta.additional_delivery_fee) || 0,
    );
    const tax_rate = Number(meta.tax_rate ?? 12);
    const subtotal =
      material_cost +
      labor_cost +
      overhead_cost +
      additional_delivery_fee;

    const storedDiscountAmount = Number.isFinite(storedDiscountAmountRaw)
      ? storedDiscountAmountRaw
      : 0;
    const usesPercentageDiscount =
      String(meta.discount_mode || "").toLowerCase() === "percentage";
    const discount = usesPercentageDiscount
      ? Number(meta.discount_rate ?? meta.discount ?? 0) || 0
      : subtotal > 0
        ? Number(((storedDiscountAmount / subtotal) * 100).toFixed(4))
        : 0;

    const computed = computeEstimationTotals({
      items: normalizedItems,
      labor_cost,
      overhead_cost,
      additional_delivery_fee,
      tax_rate,
      discount,
      inventory_pricing_mode,
    });

    const discount_amount = usesPercentageDiscount
      ? Number(meta.discount_amount ?? computed.discount_amount) || 0
      : storedDiscountAmount;
    const tax_amount = Number.isFinite(taxRaw) ? taxRaw : computed.tax_amount;
    const grand_total = Number.isFinite(grandTotalRaw)
      ? grandTotalRaw
      : computed.grand_total;

    res.json({
      ...est,
      items: normalizedItems,
      material_cost,
      items_total: material_cost,
      inventory_pricing_mode,
      labor_cost,
      overhead_cost,
      additional_delivery_fee,
      tax_rate,
      discount,
      discount_amount,
      notes: meta.notes || "",
      subtotal,
      tax_amount,
      grand_total,
      integrity_warning: false,
      created_at: est.created_at || new Date().toISOString(),
      updated_at: est.updated_at || est.created_at || new Date().toISOString(),
    });
  } catch (err) {
    console.error("getEstimation error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── POST /api/blueprints/:id/estimation ──────────────────────────────────────
exports.saveEstimation = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const blueprintId = parseInt(req.params.id);

    const [[bp]] = await conn.query(
      `SELECT id, stage, is_deleted
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [blueprintId],
    );

    if (!bp) {
      await conn.rollback();
      return res.status(404).json({ message: "Blueprint not found." });
    }

    if (Number(bp.is_deleted) === 1) {
      await conn.rollback();
      return res
        .status(400)
        .json({ message: "Cannot save estimation for archived blueprint." });
    }

    const initialLifecycle = await resolveLifecycleByBlueprint(conn, {
      blueprintId,
    });

    // MULTIPLE_ORDER_OWNERS always blocks — never guessed, manual review
    // required regardless of any other condition. Structural ambiguity
    // across multiple orders isn't something a single-row lock can
    // protect against, so this check runs against the unlocked
    // classification.
    if (initialLifecycle.reason === "MULTIPLE_ORDER_OWNERS") {
      await conn.rollback();
      return res.status(409).json({
        message: initialLifecycle.message,
        integrity_reason: initialLifecycle.reason,
        conflicting_order_ids: initialLifecycle.conflicting_order_ids,
      });
    }

    if (
      initialLifecycle.status === "BLOCKED" &&
      initialLifecycle.reason !== "STALE_ESTIMATION"
    ) {
      // Realistically only BLUEPRINT_NOT_FOUND can reach here from a
      // blueprint-scoped call (e.g. a race where the blueprint was
      // deleted between the check above and this resolution).
      await conn.rollback();
      return res.status(409).json({
        message: initialLifecycle.message,
        integrity_reason: initialLifecycle.reason,
      });
    }

    // ── Concurrency protection ─────────────────────────────────────────
    // Re-resolve under a common lock (order+blueprint if linked, else the
    // blueprint row alone) with current (FOR UPDATE) reads of everything
    // that gates this write, so nothing here uses a pre-lock snapshot.
    let lifecycle = initialLifecycle;

    if (initialLifecycle.order) {
      lifecycle = await resolveLifecycleByOrder(conn, {
        orderId: initialLifecycle.order.id,
        lockOrder: true,
        lockBlueprint: true,
        lockEstimation: true,
        lockContext: true,
      });

      if (lifecycle.reason === "MULTIPLE_ORDER_OWNERS") {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
          conflicting_order_ids: lifecycle.conflicting_order_ids,
        });
      }

      if (
        lifecycle.status === "BLOCKED" &&
        lifecycle.reason !== "STALE_ESTIMATION"
      ) {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
        });
      }
    } else {
      lifecycle = await resolveLifecycleByBlueprint(conn, {
        blueprintId,
        lockBlueprint: true,
        lockEstimation: true,
      });

      if (lifecycle.reason === "MULTIPLE_ORDER_OWNERS") {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
          conflicting_order_ids: lifecycle.conflicting_order_ids,
        });
      }

      if (
        lifecycle.status === "BLOCKED" &&
        lifecycle.reason !== "STALE_ESTIMATION"
      ) {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
        });
      }
    }

    // Re-checked against the just-locked blueprint row, not the earlier
    // unlocked read at the top of this function.
    if (
      lifecycle.blueprint &&
      (Number(lifecycle.blueprint.is_deleted) === 1 ||
        String(lifecycle.blueprint.stage || "").toLowerCase() === "archived")
    ) {
      await conn.rollback();
      return res.status(409).json({
        message: "Cannot save estimation for archived blueprint.",
        integrity_reason: "BLUEPRINT_ARCHIVED",
      });
    }

    // STALE_ESTIMATION blocks unless the (now-locked, re-checked)
    // resolver confirms a replacement is still safe to create.
    if (
      lifecycle.reason === "STALE_ESTIMATION" &&
      !lifecycle.can_create_replacement_estimation
    ) {
      await conn.rollback();
      return res.status(409).json({
        message: lifecycle.message,
        integrity_reason: lifecycle.reason,
        recovery_block_reason: lifecycle.recovery_block_reason,
      });
    }

    // Final order-state gate, re-checked against the locked row. A
    // linked order must be exactly "confirmed" — "pending" is no longer
    // accepted here, since a blueprint only ever gets linked to an order
    // once that order has already been approved into "confirmed" by
    // approveCustomRequest. Blueprint-only context (no linked order)
    // skips this gate entirely.
    const order = lifecycle.order;

    if (order) {
      const normalizedStatus = String(order.status || "").toLowerCase();

      if (normalizedStatus !== "confirmed") {
        await conn.rollback();
        return res.status(409).json({
          message: `Order status is "${order.status}"; must be exactly "confirmed" to save an estimation.`,
          integrity_reason: "ORDER_NOT_CONFIRMED",
        });
      }

      if (lifecycle.contract) {
        await conn.rollback();
        return res.status(409).json({
          message: "A contract already exists for this order.",
          integrity_reason: "CONTRACT_EXISTS",
        });
      }

      if (lifecycle.verified_payment_total > 0) {
        await conn.rollback();
        return res.status(409).json({
          message: `Order already has a verified payment total of ${lifecycle.verified_payment_total}.`,
          integrity_reason: "VERIFIED_PAYMENT_EXISTS",
        });
      }

      if (lifecycle.has_pending_payment_transaction) {
        await conn.rollback();
        return res.status(409).json({
          message: "Order has a pending payment proof awaiting review.",
          integrity_reason: "PENDING_PAYMENT_EXISTS",
        });
      }
    }

    const {
      items = [],
      labor_cost = 0,
      overhead_cost = 0,
      tax_rate = 12,
      discount = 0,
      notes = "",
    } = req.body;

    validateEstimationItems(items);

    const laborCostInput = Number(labor_cost);
    const overheadCostInput = Number(overhead_cost);
    const taxRateInput = Number(tax_rate);
    const discountInput = Number(discount);
    const notesInput = String(notes || "").trim();

    if (!Number.isFinite(laborCostInput) || laborCostInput < 0) {
      throw createValidationError("Labor cost cannot be negative.");
    }
    if (!Number.isFinite(overheadCostInput) || overheadCostInput < 0) {
      throw createValidationError("Logistics cost cannot be negative.");
    }
    if (
      !Number.isFinite(taxRateInput) ||
      taxRateInput < 0 ||
      taxRateInput > 100
    ) {
      throw createValidationError("VAT must be between 0% and 100%.");
    }
    if (
      !Number.isFinite(discountInput) ||
      discountInput < 0 ||
      discountInput > 100
    ) {
      throw createValidationError("Discount must be between 0% and 100%.");
    }
    if (notesInput.length > 500) {
      throw createValidationError("Remarks must not exceed 500 characters.");
    }

    let normalizedItems = normalizeEstimationItems(items);

    const rawMaterialIds = [
      ...new Set(
        normalizedItems
          .map((item) => Number(item.raw_material_id) || null)
          .filter(Boolean),
      ),
    ];

    if (rawMaterialIds.length) {
      const placeholders = rawMaterialIds.map(() => "?").join(",");
      const [rawMaterialRows] = await conn.query(
        `SELECT id, name, unit, quantity, unit_cost, stock_status
         FROM raw_materials
         WHERE id IN (${placeholders})`,
        rawMaterialIds,
      );

      if (rawMaterialRows.length !== rawMaterialIds.length) {
        throw createValidationError(
          "One or more selected inventory materials no longer exist. Refresh and try again.",
        );
      }

      const rawMaterialMap = new Map(
        rawMaterialRows.map((row) => [Number(row.id), row]),
      );

      normalizedItems = normalizedItems.map((item) => {
        if (!item.raw_material_id) return item;

        const material = rawMaterialMap.get(Number(item.raw_material_id));
        if (!material) return item;

        if (item.source_type !== "inventory_material") {
          return item;
        }

        return {
          ...item,
          name: String(material.name || item.name).trim(),
          description: String(material.name || item.description).trim(),
          unit: String(material.unit || item.unit || "pc").trim() || "pc",
          unit_cost: 0,
          subtotal: 0,
          source_type: "inventory_material",
        };
      });
    }

    const existingEstimationMeta =
      safeJsonParse(
        lifecycle.estimation?.estimation_data,
        {},
      ) || {};

    const existingDeliveryDecision = String(
      existingEstimationMeta.oversized_delivery_decision || "",
    )
      .trim()
      .toLowerCase();

    const preservedAdditionalDeliveryFee =
      existingDeliveryDecision === "fee_required"
        ? Math.max(
            0,
            Number(
              existingEstimationMeta.additional_delivery_fee,
            ) || 0,
          )
        : 0;

    const preservedDeliveryMeta = {};

    [
      "oversized_delivery_decision",
      "oversized_delivery_reason",
      "oversized_truck_type",
      "oversized_delivery_decided_by",
      "oversized_delivery_decided_at",
      "delivery_requirement",
    ].forEach((key) => {
      if (
        Object.prototype.hasOwnProperty.call(
          existingEstimationMeta,
          key,
        )
      ) {
        preservedDeliveryMeta[key] =
          existingEstimationMeta[key];
      }
    });

    const totals = computeEstimationTotals({
      items: normalizedItems,
      labor_cost: laborCostInput,
      overhead_cost: overheadCostInput,
      additional_delivery_fee:
        preservedAdditionalDeliveryFee,
      tax_rate: taxRateInput,
      discount: discountInput,
      inventory_pricing_mode: "tracking_only",
    });

    // Version calculation uses the lifecycle-valid estimation only — a
    // stale row is never used to derive the next version number, so a
    // reused blueprint_id can no longer inflate a fresh blueprint's first
    // real estimation into "version 4" or similar.
    const version = lifecycle.estimation
      ? Number(lifecycle.estimation.version || 0) + 1
      : 1;

    const estimation_data = JSON.stringify({
      ...preservedDeliveryMeta,
      items: normalizedItems,
      labor_cost: totals.labor_cost,
      overhead_cost: totals.overhead_cost,
      additional_delivery_fee:
        totals.additional_delivery_fee,
      tax_rate: totals.tax_rate,
      discount_mode: "percentage",
      discount: totals.discount_rate,
      discount_rate: totals.discount_rate,
      discount_amount: totals.discount_amount,
      notes: notesInput,
      inventory_pricing_mode: "tracking_only",
      material_cost: totals.material_cost,
      items_total: totals.items_total,
      subtotal: totals.subtotal,
      tax_amount: totals.tax_amount,
      grand_total: totals.grand_total,
    });

    const [insertResult] = await conn.query(
      `INSERT INTO estimations
        (blueprint_id, version, material_cost, labor_cost, tax, discount, grand_total, estimation_data, status)
       VALUES (?,?,?,?,?,?,?,?,'draft')`,
      [
        blueprintId,
        version,
        totals.material_cost,
        totals.labor_cost,
        totals.tax_amount,
        totals.discount_amount,
        totals.grand_total,
        estimation_data,
      ],
    );

    for (const item of normalizedItems) {
      await conn.query(
        `INSERT INTO estimation_items
          (estimation_id, component_id, raw_material_id, description, quantity, unit_cost)
        VALUES (?,?,?,?,?,?)`,
        [
          insertResult.insertId,
          item.component_id || null,
          item.raw_material_id || null,
          item.name,
          item.quantity,
          item.unit_cost,
        ],
      );
    }

    await conn.query(
      `UPDATE blueprints
       SET stage = 'estimation'
       WHERE id = ? AND is_deleted = 0`,
      [blueprintId],
    );

    // Restricted to the ONE canonical linked order, locked and re-checked
    // moments earlier — never a blanket WHERE blueprint_id = ? match.
    // The WHERE clause repeats order_type/status as a final DB-level
    // backstop even though both were already verified under lock above,
    // and affectedRows is checked so the new estimation can never be
    // committed while the order it belongs to silently failed to update.
    if (order) {
      const [orderUpdateResult] = await conn.query(
        `UPDATE orders
         SET subtotal = ?,
             tax = ?,
             discount = ?,
             total = ?,
             down_payment = ?,
             updated_at = NOW()
         WHERE id = ?
           AND order_type = 'blueprint'
           AND status = 'confirmed'`,
        [
          totals.subtotal,
          totals.tax_amount,
          totals.discount_amount,
          totals.grand_total,
          Number((totals.grand_total * 0.3).toFixed(2)),
          order.id,
        ],
      );

      if (orderUpdateResult.affectedRows === 0) {
        await conn.rollback();
        return res.status(409).json({
          message:
            "Order status changed before the estimation could be saved. Please refresh and try again.",
          integrity_reason: "ORDER_STATE_CHANGED",
        });
      }
    }

    await conn.commit();

    req.auditRecord = {
      id: insertResult.insertId,
      old: null,
      new: {
        blueprint_id: blueprintId,
        estimation_created: true,
        version,
        status: "draft",
        changed_fields: ["estimation"],
      },
    };

    res.status(201).json({
      message: "Estimation saved.",
      id: insertResult.insertId,
      estimation: {
        id: insertResult.insertId,
        blueprint_id: blueprintId,
        version,
        items: normalizedItems,
        material_cost: totals.material_cost,
        items_total: totals.items_total,
        inventory_pricing_mode: "tracking_only",
        labor_cost: totals.labor_cost,
        overhead_cost: totals.overhead_cost,
        additional_delivery_fee:
          totals.additional_delivery_fee,
        tax_rate: totals.tax_rate,
        discount: totals.discount_rate,
        discount_amount: totals.discount_amount,
        notes: notesInput,
        subtotal: totals.subtotal,
        tax_amount: totals.tax_amount,
        grand_total: totals.grand_total,
        status: "draft",
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("saveEstimation error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.approveEstimation = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const blueprintId = Number(req.params.id) || 0;

    const [[bp]] = await conn.query(
      `SELECT id, is_deleted
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [blueprintId],
    );

    if (!bp) {
      await conn.rollback();
      return res.status(404).json({ message: "Blueprint not found." });
    }

    if (Number(bp.is_deleted) === 1) {
      await conn.rollback();
      return res.status(400).json({
        message: "Cannot send estimation for archived blueprint.",
      });
    }

    const initialLifecycle = await resolveLifecycleByBlueprint(conn, {
      blueprintId,
    });

    if (initialLifecycle.status === "BLOCKED") {
      await conn.rollback();
      return res.status(409).json({
        message: initialLifecycle.message,
        integrity_reason: initialLifecycle.reason,
        conflicting_order_ids: initialLifecycle.conflicting_order_ids,
        can_create_replacement_estimation:
          initialLifecycle.can_create_replacement_estimation,
        recovery_block_reason: initialLifecycle.recovery_block_reason,
      });
    }

    // Common order+blueprint lock + current (FOR UPDATE) reads of the
    // estimation and contract/payment context — see
    // blueprintLifecycleService.js header comment for why each is needed.
    let lifecycle = initialLifecycle;

    if (initialLifecycle.order) {
      lifecycle = await resolveLifecycleByOrder(conn, {
        orderId: initialLifecycle.order.id,
        lockOrder: true,
        lockBlueprint: true,
        lockEstimation: true,
        lockContext: true,
      });

      if (lifecycle.status === "BLOCKED") {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
          conflicting_order_ids: lifecycle.conflicting_order_ids,
          can_create_replacement_estimation:
            lifecycle.can_create_replacement_estimation,
          recovery_block_reason: lifecycle.recovery_block_reason,
        });
      }
    }

    // Re-checked against the just-locked blueprint row, not the earlier
    // unlocked read at the top of this function.
    if (
      lifecycle.blueprint &&
      (Number(lifecycle.blueprint.is_deleted) === 1 ||
        String(lifecycle.blueprint.stage || "").toLowerCase() === "archived")
    ) {
      await conn.rollback();
      return res.status(409).json({
        message: "Cannot send estimation for archived blueprint.",
        integrity_reason: "BLUEPRINT_ARCHIVED",
      });
    }

    if (!lifecycle.estimation) {
      await conn.rollback();
      return res.status(404).json({
        message: "No estimation found to send.",
      });
    }

    const latestEstimation = lifecycle.estimation;
    const order = lifecycle.order;

    if (!order) {
      await conn.rollback();
      return res.status(400).json({
        message: "This blueprint is not yet linked to an order.",
      });
    }

    if (String(order.status || "").toLowerCase() !== "confirmed") {
      await conn.rollback();
      return res.status(400).json({
        message: `Order must be confirmed before a quotation can be sent (current status: "${order.status}").`,
      });
    }

    if (lifecycle.contract) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "A contract already exists for this order; the quotation can no longer be sent for revision.",
      });
    }

    if (lifecycle.verified_payment_total > 0) {
      await conn.rollback();
      return res.status(400).json({
        message: `Order already has a verified payment total of ${lifecycle.verified_payment_total}; this quotation can no longer be revised or re-sent.`,
      });
    }

    if (lifecycle.has_pending_payment_transaction) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Order has a pending payment proof awaiting review; resolve it through the normal payment-review flow before sending a new quotation.",
      });
    }

    const currentStatus = String(latestEstimation.status || "")
      .trim()
      .toLowerCase();

    if (currentStatus === "approved") {
      await conn.commit();
      return res.json({
        message: "Quotation is already approved by the customer.",
        estimation: latestEstimation,
      });
    }

    if (currentStatus === "sent") {
      await conn.commit();
      return res.json({
        message: "Quotation is already sent to the customer.",
        estimation: latestEstimation,
      });
    }

    if (currentStatus === "rejected") {
      await conn.rollback();
      return res.status(409).json({
        message:
          "This quotation was rejected by the customer and needs a revised estimation before it can be sent again.",
        integrity_reason: "ESTIMATION_REJECTED",
      });
    }

    if (currentStatus !== "draft") {
      await conn.rollback();
      return res.status(409).json({
        message:
          "Quotation state changed before it could be sent. Please refresh and try again.",
        integrity_reason: "ESTIMATION_STATE_CHANGED",
      });
    }

    // affectedRows is defense-in-depth; the lockEstimation read above
    // already row-locks this exact record.
    const [updateResult] = await conn.query(
      `UPDATE estimations
       SET status = 'sent',
           approved_by = NULL,
           approved_at = NULL,
           updated_at = NOW()
       WHERE id = ?
         AND status = 'draft'`,
      [parseInt(latestEstimation.id)],
    );

    if (updateResult.affectedRows === 0) {
      const [[freshEstimation]] = await conn.query(
        `SELECT *
         FROM estimations
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [parseInt(latestEstimation.id)],
      );

      await conn.rollback();

      if (!freshEstimation) {
        return res.status(404).json({ message: "No estimation found to send." });
      }

      const freshStatus = String(freshEstimation.status || "")
        .trim()
        .toLowerCase();

      if (freshStatus === "sent") {
        return res.json({
          message: "Quotation is already sent to the customer.",
          estimation: freshEstimation,
        });
      }

      if (freshStatus === "approved") {
        return res.json({
          message: "Quotation is already approved by the customer.",
          estimation: freshEstimation,
        });
      }

      if (freshStatus === "rejected") {
        return res.status(409).json({
          message:
            "This quotation was rejected by the customer and needs a revised estimation before it can be sent again.",
          integrity_reason: "ESTIMATION_REJECTED",
        });
      }

      return res.status(409).json({
        message:
          "Quotation state changed before it could be sent. Please refresh and try again.",
        integrity_reason: "ESTIMATION_STATE_CHANGED",
      });
    }

    await conn.query(
      `UPDATE blueprints
       SET stage = 'approval'
       WHERE id = ?`,
      [blueprintId],
    );

    if (Number(order.customer_id) > 0) {
      await createNotificationSafe(conn, {
        userId: parseInt(order.customer_id),
        type: "estimation_sent",
        title: "Quotation Ready for Review",
        message: `Your quotation for ${order.order_number || `order #${order.id}`} is ready. Please review it from your custom request page.`,
        targetType: "custom_request",
        targetId: order.id,
        targetOrderId: order.id,
      });
    }

    const [[sentEstimation]] = await conn.query(
      `SELECT *
       FROM estimations
       WHERE id = ?
       LIMIT 1`,
      [parseInt(latestEstimation.id)],
    );

    await conn.commit();

    req.auditRecord = {
      id: parseInt(latestEstimation.id),
      old: { status: currentStatus },
      new: {
        status: "sent",
        changed_fields: [
          "status",
          ...(latestEstimation.approved_by != null ? ["approved_by"] : []),
          ...(latestEstimation.approved_at != null ? ["approved_at"] : []),
        ],
      },
    };

    return res.json({
      message: "Quotation sent to customer for approval.",
      estimation: sentEstimation,
    });
  } catch (err) {
    await conn.rollback();
    console.error("approveEstimation error:", err);
    return res.status(err.statusCode || 500).json({
      message: err.message || "Failed to send quotation to customer.",
    });
  } finally {
    conn.release();
  }
};