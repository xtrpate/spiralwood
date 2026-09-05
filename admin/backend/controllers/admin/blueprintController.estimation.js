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

const checkQuotationInventoryReadiness = async (
  conn,
  { estimation, orderId } = {},
) => {
  const estimationMeta = safeJsonParse(estimation?.estimation_data, {}) || {};
  const snapshotItems = Array.isArray(estimationMeta.items)
    ? estimationMeta.items
    : [];

  const inventoryItems = snapshotItems.filter(
    (item) =>
      String(item?.source_type || item?.sourceType || "")
        .trim()
        .toLowerCase() === "inventory_material",
  );

  if (!inventoryItems.length) {
    return {
      ready: false,
      issues: [
        {
          code: "NO_REQUIRED_INVENTORY_MATERIALS",
          message:
            "Add at least one Required Inventory Material before sending the quotation.",
        },
      ],
    };
  }

  const issues = [];
  const requirements = new Map();

  inventoryItems.forEach((item, index) => {
    const materialId = Number(item?.raw_material_id);
    const quantity = Number(item?.quantity);

    if (!Number.isSafeInteger(materialId) || materialId <= 0) {
      issues.push({
        code: "INVENTORY_MATERIAL_NOT_SELECTED",
        item_index: index,
        message: `Required Inventory Material row ${index + 1} has no selected inventory item.`,
      });
      return;
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      issues.push({
        code: "INVALID_INVENTORY_QUANTITY",
        material_id: materialId,
        item_index: index,
        message: `Required Inventory Material row ${index + 1} must have a whole-number quantity of at least 1.`,
      });
      return;
    }

    const current = requirements.get(materialId) || 0;
    requirements.set(materialId, current + quantity);
  });

  if (issues.length) return { ready: false, issues };

  const materialIds = [...requirements.keys()].sort((a, b) => a - b);
  const placeholders = materialIds.map(() => "?").join(",");

  const [materialRows] = await conn.query(
    `SELECT id, name, unit, quantity, stock_status, is_active
     FROM raw_materials
     WHERE id IN (${placeholders})
     ORDER BY id
     FOR UPDATE`,
    materialIds,
  );

  const [reservationRows] = await conn.query(
    `SELECT id, order_id, material_id, quantity, status
     FROM blueprint_material_reservations
     WHERE material_id IN (${placeholders})
       AND status = 'reserved'
       AND order_id <> ?
     ORDER BY material_id, id
     FOR UPDATE`,
    [...materialIds, Number(orderId)],
  );

  const materialMap = new Map(
    materialRows.map((row) => [Number(row.id), row]),
  );
  const reservedElsewhere = new Map();

  reservationRows.forEach((row) => {
    const materialId = Number(row.material_id);
    const quantity = Number(row.quantity) || 0;
    reservedElsewhere.set(
      materialId,
      (reservedElsewhere.get(materialId) || 0) + quantity,
    );
  });

  for (const materialId of materialIds) {
    const material = materialMap.get(materialId);
    const required = Number(requirements.get(materialId) || 0);

    if (!material) {
      issues.push({
        code: "RAW_MATERIAL_NOT_FOUND",
        material_id: materialId,
        required,
        message: `Selected inventory material #${materialId} no longer exists. Refresh the estimate and select another material.`,
      });
      continue;
    }

    if (Number(material.is_active) === 0) {
      issues.push({
        code: "RAW_MATERIAL_INACTIVE",
        material_id: materialId,
        material_name: material.name,
        required,
        message: `${material.name || `Material #${materialId}`} is archived or inactive and cannot be used for this quotation.`,
      });
      continue;
    }

    const onHand = Math.max(0, Number(material.quantity) || 0);
    const reserved = Math.max(0, Number(reservedElsewhere.get(materialId)) || 0);
    const available = Math.max(0, onHand - reserved);

    if (available + 1e-9 < required) {
      issues.push({
        code: "INSUFFICIENT_AVAILABLE_INVENTORY",
        material_id: materialId,
        material_name: material.name,
        unit: material.unit,
        required,
        on_hand: onHand,
        reserved_elsewhere: reserved,
        available,
        shortage: Math.max(0, required - available),
        message: `${material.name || `Material #${materialId}`} requires ${required} ${material.unit || "unit"}, but only ${available} ${material.unit || "unit"} is currently available after existing reservations.`,
      });
    }
  }

  return { ready: issues.length === 0, issues };
};

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

    const isPickupOrder =
      String(lifecycle.order?.fulfillment_method || "delivery")
        .trim()
        .toLowerCase() === "pickup";

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
    const overheadCostInput = isPickupOrder ? 0 : Number(overhead_cost);
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

    const preservedAdditionalDeliveryFee = isPickupOrder
      ? 0
      : existingDeliveryDecision === "fee_required"
        ? Math.max(
            0,
            Number(
              existingEstimationMeta.additional_delivery_fee,
            ) || 0,
          )
        : 0;

    const preservedDeliveryMeta = {};
    if (isPickupOrder) {
      preservedDeliveryMeta.fulfillment_method = "pickup";
    }

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

    const inventoryReadiness = await checkQuotationInventoryReadiness(conn, {
      estimation: latestEstimation,
      orderId: order.id,
    });

    if (!inventoryReadiness.ready) {
      await conn.rollback();
      const firstIssue = inventoryReadiness.issues?.[0];
      return res.status(409).json({
        message:
          firstIssue?.message ||
          "Quotation cannot be sent until required inventory materials are complete and sufficient.",
        integrity_reason: "INVENTORY_NOT_READY_FOR_QUOTATION",
        inventory_issues: inventoryReadiness.issues || [],
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
