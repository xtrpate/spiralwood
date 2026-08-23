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

    if (["my", "admin", "customer"].includes(tab)) {
      where.push("b.creator_id = ? AND b.is_deleted = 0");
      params.push(parseInt(req.user.id));

      if (tab === "admin") {
        where.push("b.client_id IS NULL");
      }

      if (tab === "customer") {
        where.push("b.client_id IS NOT NULL");
      }
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
              b.design_data, b.view_3d_data,
              b.is_template, b.is_gallery, b.is_deleted, b.archived_at,
              b.created_at, b.updated_at,
              u.name AS creator_name,
              c.name AS client_name,
              EXISTS (
                SELECT 1
                FROM orders linked_order
                WHERE linked_order.blueprint_id = b.id
              ) AS has_linked_order,
              EXISTS (
                SELECT 1
                FROM orders active_order
                WHERE active_order.blueprint_id = b.id
                  AND LOWER(COALESCE(active_order.status, '')) NOT IN ('completed', 'cancelled')
              ) AS has_active_linked_order,
              (
                SELECT linked_order.order_number
                FROM orders linked_order
                WHERE linked_order.blueprint_id = b.id
                ORDER BY linked_order.id DESC
                LIMIT 1
              ) AS linked_order_number,
              (
                SELECT linked_order.status
                FROM orders linked_order
                WHERE linked_order.blueprint_id = b.id
                ORDER BY linked_order.id DESC
                LIMIT 1
              ) AS linked_order_status,
              CASE
                WHEN b.is_deleted = 0
                  AND (b.is_template = 1 OR b.is_gallery = 1)
                  AND EXISTS (
                    SELECT 1
                    FROM products published_product
                    WHERE published_product.blueprint_id = b.id
                      AND published_product.is_published = 1
                      AND published_product.is_active = 1
                  )
                  THEN 1
                ELSE 0
              END AS is_customer_visible,
              CASE
                WHEN b.is_deleted = 1
                  AND NOT EXISTS (
                    SELECT 1
                    FROM orders retained_order
                    WHERE retained_order.blueprint_id = b.id
                  )
                  THEN GREATEST(0, 30 - DATEDIFF(CURDATE(), DATE(COALESCE(b.archived_at, b.updated_at, b.created_at))))
                ELSE NULL
              END AS archive_days_left,
              CASE
                WHEN b.is_deleted = 1
                  AND NOT EXISTS (
                    SELECT 1
                    FROM orders retained_order
                    WHERE retained_order.blueprint_id = b.id
                  )
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


    // WISDOM SAVED BLUEPRINT COMPONENT PREVIEW FALLBACK V1
    // Older blueprints may keep their real furniture geometry in
    // blueprint_components even when design_data/view_3d_data is empty.
    const previewBlueprintIds = [
      ...new Set(
        rows
          .map((row) => Number(row.id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    if (previewBlueprintIds.length > 0) {
      const previewPlaceholders = previewBlueprintIds.map(() => "?").join(",");
      const [previewComponentRows] = await pool.query(
        `SELECT *
         FROM blueprint_components
         WHERE blueprint_id IN (${previewPlaceholders})
         ORDER BY blueprint_id ASC, id ASC`,
        previewBlueprintIds,
      );

      const previewComponentsByBlueprintId = new Map();

      for (const component of previewComponentRows) {
        const blueprintId = Number(component.blueprint_id);
        if (!previewComponentsByBlueprintId.has(blueprintId)) {
          previewComponentsByBlueprintId.set(blueprintId, []);
        }
        previewComponentsByBlueprintId.get(blueprintId).push(component);
      }

      for (const row of rows) {
        const blueprintId = Number(row.id);
        row.components =
          Number.isInteger(blueprintId) && blueprintId > 0
            ? previewComponentsByBlueprintId.get(blueprintId) || []
            : [];
      }
    } else {
      for (const row of rows) {
        row.components = [];
      }
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       ${baseFrom}
       ${whereSQL}`,
      params,
    );

    const currentUserId = parseInt(req.user.id);
    const [[tabCounts]] = await pool.query(
      `SELECT
         SUM(CASE
               WHEN creator_id = ? AND is_deleted = 0 AND client_id IS NULL
               THEN 1 ELSE 0
             END) AS admin,
         SUM(CASE
               WHEN creator_id = ? AND is_deleted = 0 AND client_id IS NOT NULL
               THEN 1 ELSE 0
             END) AS customer,
         SUM(CASE
               WHEN is_deleted = 1
               THEN 1 ELSE 0
             END) AS archive
       FROM blueprints`,
      [currentUserId, currentUserId],
    );

    res.json({
      rows,
      total,
      counts: {
        admin: Number(tabCounts?.admin) || 0,
        customer: Number(tabCounts?.customer) || 0,
        archive: Number(tabCounts?.archive) || 0,
      },
    });
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
              EXISTS (
                SELECT 1
                FROM orders linked_order
                WHERE linked_order.blueprint_id = b.id
              ) AS has_linked_order,
              EXISTS (
                SELECT 1
                FROM orders active_order
                WHERE active_order.blueprint_id = b.id
                  AND LOWER(COALESCE(active_order.status, '')) NOT IN ('completed', 'cancelled')
              ) AS has_active_linked_order,
              CASE
                WHEN b.is_deleted = 0
                  AND (b.is_template = 1 OR b.is_gallery = 1)
                  AND EXISTS (
                    SELECT 1
                    FROM products published_product
                    WHERE published_product.blueprint_id = b.id
                      AND published_product.is_published = 1
                      AND published_product.is_active = 1
                  )
                  THEN 1
                ELSE 0
              END AS is_customer_visible,
              CASE
                WHEN b.is_deleted = 1
                  AND NOT EXISTS (
                    SELECT 1
                    FROM orders retained_order
                    WHERE retained_order.blueprint_id = b.id
                  )
                  THEN GREATEST(0, 30 - DATEDIFF(CURDATE(), DATE(COALESCE(b.archived_at, b.updated_at, b.created_at))))
                ELSE NULL
              END AS archive_days_left,
              CASE
                WHEN b.is_deleted = 1
                  AND NOT EXISTS (
                    SELECT 1
                    FROM orders retained_order
                    WHERE retained_order.blueprint_id = b.id
                  )
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
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const blueprintId = parseInt(req.params.id);

    // Serialize saves for the same Blueprint before allocating the next
    // revision number.
    const [[bp]] = await conn.query(
      "SELECT * FROM blueprints WHERE id = ? FOR UPDATE",
      [blueprintId],
    );

    if (!bp) {
      await conn.rollback();
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
      await conn.rollback();
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
      await conn.rollback();
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
      const [[latestRevision]] = await conn.query(
        `SELECT revision_number
         FROM blueprint_revisions
         WHERE blueprint_id = ?
         ORDER BY revision_number DESC
         LIMIT 1
         FOR UPDATE`,
        [blueprintId],
      );

      const nextRevisionNumber =
        Number(latestRevision?.revision_number || 0) + 1;

      await conn.query(
        `INSERT INTO blueprint_revisions
          (blueprint_id, revision_number, stage_at_save, revision_data, revised_by)
         VALUES (?,?,?,?,?)`,
        [
          blueprintId,
          nextRevisionNumber,
          bp.stage,
          bp.design_data,
          parseInt(req.user.id),
        ],
      );
    }

    const sets = Object.keys(filtered)
      .map((key) => `${key} = ?`)
      .join(", ");

    await conn.query(
      `UPDATE blueprints
       SET ${sets}
       WHERE id = ?`,
      [...Object.values(filtered), blueprintId],
    );

    await conn.commit();

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
    try {
      await conn.rollback();
    } catch (rollbackError) {
      console.error("update blueprint rollback error:", rollbackError);
    }

    console.error("update blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── DELETE /api/blueprints/:id (soft delete → archive) ───────────────────────
exports.archive = async (req, res) => {
  try {
    const blueprintId = parseInt(req.params.id);

    const [[bp]] = await pool.query(
      `SELECT id, stage, is_deleted, is_template, is_gallery
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [blueprintId],
    );

    if (!bp) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    if (Number(bp.is_deleted) === 1) {
      return res.status(400).json({ message: "Blueprint is already archived." });
    }

    const [[activeLinkedOrder]] = await pool.query(
      `SELECT id, order_number, status
       FROM orders
       WHERE blueprint_id = ?
         AND LOWER(COALESCE(status, '')) NOT IN ('completed', 'cancelled')
       ORDER BY id DESC
       LIMIT 1`,
      [blueprintId],
    );

    if (activeLinkedOrder) {
      const statusLabel = String(activeLinkedOrder.status || "active")
        .replace(/_/g, " ")
        .trim();

      return res.status(409).json({
        code: "BLUEPRINT_LINKED_TO_ACTIVE_ORDER",
        message: `Cannot archive this working design while order ${
          activeLinkedOrder.order_number || activeLinkedOrder.id
        } is ${statusLabel}. Complete or cancel the order first.`,
        order_number: activeLinkedOrder.order_number || null,
        order_status: activeLinkedOrder.status || null,
      });
    }

    const [[publishedProduct]] = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM products p
         WHERE p.blueprint_id = ?
           AND p.is_published = 1
           AND p.is_active = 1
       ) AS has_published_product`,
      [blueprintId],
    );

    const isCustomerVisible =
      (Number(bp.is_template) === 1 || Number(bp.is_gallery) === 1) &&
      Number(publishedProduct?.has_published_product) === 1;

    const customerVisibilityConfirmed = ["1", "true", "yes"].includes(
      String(req.query?.confirm_customer_visibility || "")
        .trim()
        .toLowerCase(),
    );

    if (isCustomerVisible && !customerVisibilityConfirmed) {
      return res.status(409).json({
        code: "BLUEPRINT_VISIBLE_TO_CUSTOMERS",
        requires_confirmation: true,
        message:
          "This design is currently available to customers. Confirm archiving to remove it from the customer catalog.",
      });
    }

    const [updateResult] = await pool.query(
      `UPDATE blueprints
       SET is_deleted = 1,
           stage = 'archived',
           archived_at = NOW()
       WHERE id = ?`,
      [blueprintId],
    );

    if (updateResult.affectedRows > 0) {
      req.auditRecord = {
        id: blueprintId,
        old: { stage: bp.stage, archived: Boolean(Number(bp.is_deleted)) },
        new: {
          stage: "archived",
          archived: true,
          removed_from_customer_catalog: isCustomerVisible,
        },
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
