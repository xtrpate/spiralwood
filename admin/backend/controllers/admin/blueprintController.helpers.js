// controllers/blueprintController.js
const path = require("path");
const pool = require("../../config/db");
const { v2: cloudinary } = require("cloudinary");
const {
  resolveLifecycleByBlueprint,
  resolveLifecycleByOrder,
} = require("../../services/blueprintLifecycleService");
const { createNotificationSafe } = require("../../utils/notificationHelper");
const { writeAuditLogSafe } = require("../../middleware/auditLog");

// ── Helpers ──────────────────────────────────────────────────────────────────
function safeJsonParse(value, fallback = {}) {
  try {
    if (value == null || value === "") return fallback;
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

// Stable comparison helpers for the JSON-text blueprint columns, used only
// to detect whether a value meaningfully changed for audit purposes — the
// normalized output is never logged, only the boolean comparison result.
function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortJsonValue(value[key]);
        return result;
      }, {});
  }
  return value;
}
function normalizeJsonForComparison(value, fallback) {
  return JSON.stringify(sortJsonValue(safeJsonParse(value, fallback)));
}
const ESTIMATION_ITEM_SOURCE_TYPES = new Set([
  "component",
  "cutlist",
  "blueprint_part",
  "inventory_material",
  "other",
  "manual",
]);

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeEstimationItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const quantity = Number(item.quantity) || 1;
      const unitCost = Number(item.unit_cost) || 0;
      const rawMaterialId = item.raw_material_id
        ? Number(item.raw_material_id)
        : null;
      const requestedSourceType = String(
        item.source_type || item.sourceType || "",
      )
        .trim()
        .toLowerCase();
      const sourceType = ESTIMATION_ITEM_SOURCE_TYPES.has(requestedSourceType)
        ? requestedSourceType
        : rawMaterialId
          ? "inventory_material"
          : requestedSourceType || "other";
      const normalizedUnitCost =
        sourceType === "inventory_material" ? 0 : unitCost;
      const subtotal =
        sourceType === "inventory_material"
          ? 0
          : item.subtotal != null
            ? Number(item.subtotal) || 0
            : quantity * normalizedUnitCost;

      return {
        id: item.id || index + 1,
        component_id: item.component_id ? Number(item.component_id) : null,
        raw_material_id: rawMaterialId,
        name: String(item.name || item.description || "").trim(),
        description: String(item.description || item.name || "").trim(),
        quantity,
        unit: String(item.unit || "pc").trim() || "pc",
        unit_cost: normalizedUnitCost,
        note: String(item.note || "").trim(),
        source_key: String(item.source_key || item.sourceKey || "").trim(),
        source_type: sourceType,
        subtotal,
      };
    })
    .filter((item) => item.name.trim() !== "");
}

function validateEstimationItems(items = []) {
  if (!Array.isArray(items)) {
    throw createValidationError("Estimation items must be an array.");
  }

  if (!items.length) {
    throw createValidationError(
      "Add at least one estimate item before saving.",
    );
  }

  if (items.length > 250) {
    throw createValidationError(
      "An estimate cannot contain more than 250 items.",
    );
  }

  const seenInventoryMaterialIds = new Set();

  items.forEach((rawItem, index) => {
    const rowLabel = `Item ${index + 1}`;
    const name = String(rawItem?.name || rawItem?.description || "").trim();
    const note = String(rawItem?.note || "").trim();
    const unit = String(rawItem?.unit || "pc").trim();
    const quantity = Number(rawItem?.quantity);
    const unitCost = Number(rawItem?.unit_cost);
    const rawMaterialId = rawItem?.raw_material_id
      ? Number(rawItem.raw_material_id)
      : null;
    const requestedSourceType = String(
      rawItem?.source_type || rawItem?.sourceType || "",
    )
      .trim()
      .toLowerCase();
    const sourceType = ESTIMATION_ITEM_SOURCE_TYPES.has(requestedSourceType)
      ? requestedSourceType
      : rawMaterialId
        ? "inventory_material"
        : requestedSourceType || "other";

    if (!name) {
      throw createValidationError(`${rowLabel}: Description is required.`);
    }

    if (name.length > 255) {
      throw createValidationError(
        `${rowLabel}: Description must not exceed 255 characters.`,
      );
    }

    const requiresWholeQuantity =
      sourceType === "inventory_material" || sourceType === "other";

    if (
      requiresWholeQuantity &&
      (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000)
    ) {
      throw createValidationError(
        `${rowLabel}: Quantity must be a whole number of at least 1.`,
      );
    }

    if (
      !requiresWholeQuantity &&
      (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000)
    ) {
      throw createValidationError(
        `${rowLabel}: Quantity must be greater than 0 and within the allowed range.`,
      );
    }

    if (
      sourceType !== "inventory_material" &&
      (!Number.isFinite(unitCost) || unitCost < 0.01 || unitCost > 100000000)
    ) {
      throw createValidationError(
        `${rowLabel}: Rate must be at least 0.01 and within the allowed range.`,
      );
    }

    if (
      sourceType === "inventory_material" &&
      (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 100000000)
    ) {
      throw createValidationError(
        `${rowLabel}: Inventory tracking cost cannot be negative.`,
      );
    }

    if (!unit || unit.length > 30) {
      throw createValidationError(
        `${rowLabel}: Unit is required and must not exceed 30 characters.`,
      );
    }

    if (note.length > 500) {
      throw createValidationError(
        `${rowLabel}: Remarks must not exceed 500 characters.`,
      );
    }

    if (
      requestedSourceType &&
      !ESTIMATION_ITEM_SOURCE_TYPES.has(requestedSourceType)
    ) {
      throw createValidationError(`${rowLabel}: Invalid estimate item type.`);
    }

    if (rawMaterialId !== null) {
      if (!Number.isInteger(rawMaterialId) || rawMaterialId <= 0) {
        throw createValidationError(
          `${rowLabel}: Invalid raw material selection.`,
        );
      }

      if (sourceType === "inventory_material") {
        if (seenInventoryMaterialIds.has(rawMaterialId)) {
          throw createValidationError(
            `${rowLabel}: The same inventory material cannot be added twice.`,
          );
        }
        seenInventoryMaterialIds.add(rawMaterialId);
      }
    }

    if (sourceType === "inventory_material" && rawMaterialId === null) {
      throw createValidationError(
        `${rowLabel}: Select an inventory material before saving.`,
      );
    }

    if (sourceType === "other" && rawMaterialId !== null) {
      throw createValidationError(
        `${rowLabel}: Other/additional work cannot be linked to inventory.`,
      );
    }
  });
}

function getItemSubtotal(item = {}) {
  return (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0);
}

function groupDraftItems(items = []) {
  const grouped = new Map();

  for (const raw of Array.isArray(items) ? items : []) {
    const quantity = Number(raw.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const unitCost = Number(raw.unit_cost || 0) || 0;
    const key = [
      String(raw.raw_material_id || ""),
      String(raw.name || "")
        .trim()
        .toLowerCase(),
      String(raw.unit || "pc")
        .trim()
        .toLowerCase(),
      String(raw.note || "")
        .trim()
        .toLowerCase(),
    ].join("|");

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: grouped.size + 1,
        component_id: null,
        raw_material_id: raw.raw_material_id || null,
        name: String(raw.name || "Item").trim(),
        description: String(raw.description || raw.name || "Item").trim(),
        quantity,
        unit: raw.unit || "pc",
        unit_cost: unitCost,
        note: String(raw.note || "").trim(),
        source_key: String(raw.source_key || raw.sourceKey || "").trim(),
        source_type: String(
          raw.source_type || raw.sourceType || "blueprint_part",
        )
          .trim()
          .toLowerCase(),
        subtotal: Number((quantity * unitCost).toFixed(2)),
      });
      continue;
    }

    const existing = grouped.get(key);
    existing.quantity = Number((existing.quantity + quantity).toFixed(4));
    existing.subtotal = Number(
      (existing.quantity * existing.unit_cost).toFixed(2),
    );
  }

  return Array.from(grouped.values()).map((item, index) => ({
    ...item,
    id: index + 1,
  }));
}

function findRawMaterialMatch(rawMaterials = [], candidate = "") {
  const needle = String(candidate || "")
    .trim()
    .toLowerCase();

  if (!needle) return null;

  return (
    rawMaterials.find(
      (row) =>
        String(row.name || "")
          .trim()
          .toLowerCase() === needle,
    ) ||
    rawMaterials.find((row) =>
      needle.includes(
        String(row.name || "")
          .trim()
          .toLowerCase(),
      ),
    ) ||
    rawMaterials.find((row) =>
      String(row.name || "")
        .trim()
        .toLowerCase()
        .includes(needle),
    ) ||
    null
  );
}

function computeEstimationTotals({
  items = [],
  labor_cost = 0,
  overhead_cost = 0,
  additional_delivery_fee = 0,
  tax_rate = 12,
  discount = 0,
  inventory_pricing_mode = "tracking_only",
}) {
  const inventoryTrackingOnly =
    String(inventory_pricing_mode || "tracking_only").toLowerCase() !==
    "legacy_billable";
  const material_cost = items.reduce((sum, item) => {
    if (
      inventoryTrackingOnly &&
      String(item?.source_type || "")
        .trim()
        .toLowerCase() === "inventory_material"
    ) {
      return sum;
    }
    return sum + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0);
  }, 0);

  const laborCost = Number(labor_cost) || 0;
  const overheadCost = Number(overhead_cost) || 0;
  const additionalDeliveryFee = Math.max(
    0,
    Number(additional_delivery_fee) || 0,
  );
  const discountRate = Math.max(0, Math.min(100, Number(discount) || 0));
  const taxRate = Math.max(0, Math.min(100, Number(tax_rate) || 0));

  const subtotal =
    material_cost + laborCost + overheadCost + additionalDeliveryFee;
  const discount_amount = subtotal * (discountRate / 100);
  const afterDiscount = Math.max(0, subtotal - discount_amount);
  const tax_amount = afterDiscount * (taxRate / 100);
  const grand_total = afterDiscount + tax_amount;

  return {
    material_cost,
    items_total: material_cost,
    labor_cost: laborCost,
    overhead_cost: overheadCost,
    additional_delivery_fee: additionalDeliveryFee,
    tax_rate: taxRate,
    discount: discountRate,
    discount_rate: discountRate,
    discount_amount,
    subtotal,
    tax_amount,
    grand_total,
  };
}

async function buildAutoEstimationDraft(conn, blueprintId) {
  const [[blueprint]] = await conn.query(
    `SELECT id, title, design_data
     FROM blueprints
     WHERE id = ?
     LIMIT 1`,
    [parseInt(blueprintId)],
  );

  if (!blueprint) return null;

  const designData = safeJsonParse(blueprint.design_data, {}) || {};

  const [[linkedOrder]] = await conn.query(
    `SELECT
        o.id AS order_id,
        o.order_number,
        oi.product_id,
        oi.product_name,
        oi.customization_json,
        COALESCE(NULLIF(oi.quantity, 0), 1) AS order_quantity
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.blueprint_id = ?
      ORDER BY oi.id ASC
      LIMIT 1`,
    [parseInt(blueprintId)],
  );

  const orderQty = Math.max(1, Number(linkedOrder?.order_quantity) || 1);

  const customization =
    safeJsonParse(linkedOrder?.customization_json, {}) || {};

  // ── FIXED: Added empty array [] ──
  const [rawMaterialRows] = await conn.query(
    `SELECT id, name, unit, unit_cost
     FROM raw_materials
     ORDER BY name ASC`,
    [],
  );

  let resolvedProductId = Number(linkedOrder?.product_id) || null;

  if (!resolvedProductId && linkedOrder?.product_name) {
    const [[matchedProduct]] = await conn.query(
      `SELECT id, name, production_cost
       FROM products
       WHERE name = ?
       ORDER BY id DESC
       LIMIT 1`,
      [linkedOrder.product_name],
    );

    if (matchedProduct?.id) {
      resolvedProductId = Number(matchedProduct.id) || null;
    }
  }

  if (resolvedProductId) {
    const [bomRows] = await conn.query(
      `SELECT
          bom.raw_material_id,
          bom.quantity AS bom_quantity,
          rm.name AS material_name,
          rm.unit,
          rm.unit_cost
        FROM bill_of_materials bom
        INNER JOIN raw_materials rm ON rm.id = bom.raw_material_id
        WHERE bom.product_id = ?
        ORDER BY rm.name ASC`,
      [resolvedProductId],
    );

    if (bomRows.length) {
      const items = bomRows.map((row, index) => {
        const quantity = (Number(row.bom_quantity) || 0) * orderQty;
        const unitCost = Number(row.unit_cost) || 0;

        return {
          id: index + 1,
          component_id: null,
          raw_material_id: Number(row.raw_material_id) || null,
          name: row.material_name || `Material ${index + 1}`,
          description: `Auto-filled from BOM for ${linkedOrder?.product_name || blueprint.title || "blueprint product"}`,
          quantity,
          unit: row.unit || "pc",
          unit_cost: unitCost,
          note: "Auto-generated from bill of materials",
          source_key: `bom:${row.raw_material_id}`,
          source_type: "blueprint_part",
          subtotal: quantity * unitCost,
        };
      });

      const totals = computeEstimationTotals({
        items,
        labor_cost: 0,
        overhead_cost: 0,
        tax_rate: 12,
        discount: 0,
      });

      return {
        source: "bom",
        status: "draft",
        version: 0,
        notes: `Auto-generated from BOM for ${linkedOrder?.product_name || blueprint.title || "blueprint product"}. Review and adjust before saving.`,
        items,
        ...totals,
      };
    }

    const [[product]] = await conn.query(
      `SELECT id, name, production_cost
       FROM products
       WHERE id = ?
       LIMIT 1`,
      [resolvedProductId],
    );

    if (product && Number(product.production_cost) > 0) {
      const items = [
        {
          id: 1,
          component_id: null,
          raw_material_id: null,
          name:
            product.name ||
            linkedOrder?.product_name ||
            blueprint.title ||
            "Blueprint Product",
          description: "Fallback production-cost estimate",
          quantity: orderQty,
          unit: "unit",
          unit_cost: Number(product.production_cost) || 0,
          note: "Auto-generated from product production cost fallback",
          source_key: `product:${resolvedProductId || product.id}`,
          source_type: "blueprint_part",
          subtotal: orderQty * (Number(product.production_cost) || 0),
        },
      ];

      const totals = computeEstimationTotals({
        items,
        labor_cost: 0,
        overhead_cost: 0,
        tax_rate: 12,
        discount: 0,
      });

      return {
        source: "product_production_cost",
        status: "draft",
        version: 0,
        notes: `No BOM found. Auto-generated from product production cost fallback for ${product.name || linkedOrder?.product_name || blueprint.title || "product"}.`,
        items,
        ...totals,
      };
    }
  }

  const [componentRows] = await conn.query(
    `SELECT
        bc.raw_material_id,
        rm.name AS material_name,
        rm.unit,
        rm.unit_cost,
        SUM(COALESCE(bc.quantity, 1)) AS component_quantity,
        COUNT(*) AS component_count
      FROM blueprint_components bc
      INNER JOIN raw_materials rm ON rm.id = bc.raw_material_id
      WHERE bc.blueprint_id = ?
        AND bc.raw_material_id IS NOT NULL
      GROUP BY bc.raw_material_id, rm.name, rm.unit, rm.unit_cost
      ORDER BY rm.name ASC`,
    [parseInt(blueprintId)],
  );

  if (componentRows.length) {
    const items = componentRows.map((row, index) => {
      const quantity = (Number(row.component_quantity) || 0) * orderQty;
      const unitCost = Number(row.unit_cost) || 0;

      return {
        id: index + 1,
        component_id: null,
        raw_material_id: Number(row.raw_material_id) || null,
        name: row.material_name || `Material ${index + 1}`,
        description: `Component-based auto estimate (${Number(row.component_count) || 0} component refs)`,
        quantity,
        unit: row.unit || "pc",
        unit_cost: unitCost,
        note: "Auto-generated from blueprint component raw material mapping",
        source_key: `component-material:${row.raw_material_id}`,
        source_type: "component",
        subtotal: quantity * unitCost,
      };
    });

    const totals = computeEstimationTotals({
      items,
      labor_cost: 0,
      overhead_cost: 0,
      tax_rate: 12,
      discount: 0,
    });

    return {
      source: "blueprint_components",
      status: "draft",
      version: 0,
      notes:
        "No BOM found. Auto-generated from blueprint component raw material mapping.",
      items,
      ...totals,
    };
  }

  const cutListRows = Array.isArray(designData?.conversionCutListRows)
    ? designData.conversionCutListRows
    : [];

  if (cutListRows.length) {
    const groupedItems = groupDraftItems(
      cutListRows.map((row, index) => {
        const materialName =
          row?.material ||
          row?.boardMaterial ||
          customization?.wood_type ||
          "Material";

        const matchedMaterial = findRawMaterialMatch(
          rawMaterialRows,
          materialName,
        );

        const isAreaUnit =
          String(row?.estimationUnit || "")
            .trim()
            .toLowerCase() === "panel_area";

        const quantity = isAreaUnit
          ? Number(
              ((Number(row?.totalAreaSqM || 0) || 0) * orderQty).toFixed(4),
            )
          : Math.max(1, (Number(row?.qty || 0) || 1) * orderQty);

        const name =
          row?.sampleLabel ||
          [row?.partFamily, row?.partRole].filter(Boolean).join(" / ") ||
          `Cut List Item ${index + 1}`;

        const note = [
          materialName || null,
          row?.widthMm && row?.heightMm
            ? `${row.widthMm}×${row.heightMm}${row?.depthMm ? `×${row.depthMm}` : ""} mm`
            : null,
          row?.thicknessMm ? `${row.thicknessMm} mm thick` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return {
          component_id: null,
          raw_material_id: matchedMaterial?.id || null,
          name,
          description: name,
          quantity,
          unit: matchedMaterial?.unit || (isAreaUnit ? "sq.m" : "pc"),
          unit_cost: Number(matchedMaterial?.unit_cost || 0),
          note,
          source_key:
            row?.id ||
            `cutrow:${index}:${row?.partFamily || ""}:${row?.partRole || ""}`,
          source_type: "cutlist",
          subtotal: quantity * Number(matchedMaterial?.unit_cost || 0),
        };
      }),
    );

    if (groupedItems.length) {
      const totals = computeEstimationTotals({
        items: groupedItems,
        labor_cost: 0,
        overhead_cost: 0,
        tax_rate: 12,
        discount: 0,
      });

      return {
        source: "design_data_cutlist",
        status: "draft",
        version: 0,
        notes:
          "Auto-generated from blueprint cut list data. Review and adjust before saving.",
        items: groupedItems,
        ...totals,
      };
    }
  }

  const designComponents = Array.isArray(designData?.components)
    ? designData.components
    : [];

  if (designComponents.length) {
    const groupedItems = groupDraftItems(
      designComponents.map((row, index) => {
        const materialName =
          row?.material ||
          row?.wood_type ||
          customization?.wood_type ||
          "Material";

        const matchedMaterial = findRawMaterialMatch(
          rawMaterialRows,
          materialName,
        );

        const quantity =
          Math.max(1, Number(row?.qty || row?.quantity || 1)) * orderQty;

        const width = Number(row?.width || row?.widthMm || 0);
        const height = Number(row?.height || row?.heightMm || 0);
        const depth = Number(row?.depth || row?.depthMm || 0);

        const name =
          row?.label || row?.name || row?.type || `Component ${index + 1}`;

        const note = [
          materialName || null,
          width || height || depth ? `${width}×${height}×${depth} mm` : null,
          row?.finish ? `Finish: ${row.finish}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return {
          component_id: null,
          raw_material_id: matchedMaterial?.id || null,
          name,
          description: name,
          quantity,
          unit: matchedMaterial?.unit || "pc",
          unit_cost: Number(matchedMaterial?.unit_cost || 0),
          note,
          source_key:
            row?.id || `component:${index}:${row?.type || row?.name || "item"}`,
          source_type: "component",
          subtotal: quantity * Number(matchedMaterial?.unit_cost || 0),
        };
      }),
    );

    if (groupedItems.length) {
      const totals = computeEstimationTotals({
        items: groupedItems,
        labor_cost: 0,
        overhead_cost: 0,
        tax_rate: 12,
        discount: 0,
      });

      return {
        source: "design_data_components",
        status: "draft",
        version: 0,
        notes:
          "Auto-generated from blueprint component data. Review and adjust before saving.",
        items: groupedItems,
        ...totals,
      };
    }
  }

  return null;
}

function getBlueprintFileMeta(file) {
  if (!file) {
    return {
      source: null,
      file_url: null,
      file_type: null,
      default_thumbnail_url: null,
    };
  }

  const ext = path
    .extname(file.originalname || "")
    .replace(".", "")
    .toLowerCase();

  const allowed = new Set(["pdf", "png", "jpg", "jpeg", "svg"]);

  if (!allowed.has(ext)) {
    const err = new Error(
      "Only PDF, PNG, JPG, JPEG, and SVG blueprint files are allowed.",
    );
    err.statusCode = 400;
    throw err;
  }

  const file_url = file.path; // Grab the live Cloudinary URL!
  const default_thumbnail_url = ["png", "jpg", "jpeg", "svg"].includes(ext)
    ? file_url
    : null;

  return {
    source: "imported",
    file_url,
    file_type: ext,
    default_thumbnail_url,
  };
}

const REFERENCE_VIEWS = ["front", "back", "left", "right", "top"];

function createEmptyReferenceFiles() {
  return {
    front: null,
    back: null,
    left: null,
    right: null,
    top: null,
  };
}

function normalizeReferenceFilesMap(value = {}, fallbackTitle = "") {
  const next = createEmptyReferenceFiles();

  REFERENCE_VIEWS.forEach((view) => {
    const normalized = normalizeReferenceFile(
      value?.[view],
      fallbackTitle ? `${fallbackTitle} ${view}` : `${view} reference`,
    );

    if (normalized) {
      next[view] = normalized;
    }
  });

  return next;
}

function buildUploadedReferenceFiles(uploadedFiles = {}, fallbackTitle = "") {
  const next = createEmptyReferenceFiles();

  REFERENCE_VIEWS.forEach((view) => {
    const file = uploadedFiles?.[view];
    if (!file) return;

    const meta = getBlueprintFileMeta(file);

    next[view] = normalizeReferenceFile(
      {
        url: meta.file_url,
        type: meta.file_type,
        name: file.originalname || `${fallbackTitle || "Reference"} ${view}`,
        source: "imported",
      },
      fallbackTitle ? `${fallbackTitle} ${view}` : `${view} reference`,
    );
  });

  return next;
}

function hasAnyReferenceFiles(referenceFiles = {}) {
  return REFERENCE_VIEWS.some((view) => referenceFiles?.[view]?.url);
}

function normalizeReferenceFile(value, fallbackTitle = "") {
  const url = value?.url || value?.file_url || null;
  const type = String(value?.type || value?.file_type || "")
    .trim()
    .toLowerCase();

  if (!url || !type) return null;

  return {
    url,
    type,
    name:
      value?.name ||
      (fallbackTitle ? `${fallbackTitle}.${type}` : path.basename(url)),
    source: "imported",
  };
}

function mergeDesignData(value, blueprintLike = {}, fallbackTitle = "") {
  const base = safeJsonParse(value, {});
  const designData =
    base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};

  if (!Array.isArray(designData.components)) designData.components = [];
  if (!designData.unit) designData.unit = "mm";

  const existingReferenceFiles = normalizeReferenceFilesMap(
    designData.reference_files || designData.referenceFiles,
    fallbackTitle,
  );

  const incomingReferenceFiles = normalizeReferenceFilesMap(
    blueprintLike.reference_files || blueprintLike.referenceFiles,
    fallbackTitle,
  );

  const existingReference = normalizeReferenceFile(
    designData.reference_file || designData.referenceFile,
    fallbackTitle,
  );

  const blueprintReference = normalizeReferenceFile(
    blueprintLike,
    fallbackTitle,
  );

  const finalReferenceFiles = createEmptyReferenceFiles();

  REFERENCE_VIEWS.forEach((view) => {
    finalReferenceFiles[view] =
      incomingReferenceFiles[view] || existingReferenceFiles[view] || null;
  });

  if (!finalReferenceFiles.front) {
    finalReferenceFiles.front = blueprintReference || existingReference || null;
  }

  if (hasAnyReferenceFiles(finalReferenceFiles)) {
    designData.reference_files = finalReferenceFiles;
    designData.reference_file = finalReferenceFiles.front || null;
  } else {
    delete designData.reference_files;
    delete designData.reference_file;
  }

  delete designData.referenceFiles;
  delete designData.referenceFile;

  return JSON.stringify(designData);
}

function normalizeSource(sourceValue, hasFile = false) {
  if (hasFile) return "imported";

  const value = String(sourceValue || "")
    .trim()
    .toLowerCase();

  if (value === "imported") return "imported";
  if (value === "manual") return "created";
  if (value === "created") return "created";

  return "created";
}

async function backfillLegacyArchivedDates() {
  await pool.query(
    `UPDATE blueprints
     SET archived_at = COALESCE(updated_at, created_at, NOW())
     WHERE is_deleted = 1
       AND archived_at IS NULL`,
  );
}

async function snapshotAndDetachBlueprintProducts(conn, blueprintIds = []) {
  if (!Array.isArray(blueprintIds) || !blueprintIds.length) return;

  const bpPlaceholders = blueprintIds.map(() => "?").join(",");

  const [blueprintRows] = await conn.query(
    `SELECT id, title, description, stage, source, file_url, file_type,
            thumbnail_url, design_data, view_3d_data, base_price,
            is_template, is_gallery, created_at, updated_at
       FROM blueprints
       WHERE id IN (${bpPlaceholders})
       FOR UPDATE`,
    blueprintIds,
  );

  if (!blueprintRows.length) return;

  const [componentRows] = await conn.query(
    `SELECT *
       FROM blueprint_components
       WHERE blueprint_id IN (${bpPlaceholders})
       ORDER BY blueprint_id ASC, id ASC`,
    blueprintIds,
  );

  const componentsByBlueprint = new Map();
  for (const component of componentRows) {
    const blueprintId = Number(component.blueprint_id);
    if (!componentsByBlueprint.has(blueprintId)) {
      componentsByBlueprint.set(blueprintId, []);
    }
    componentsByBlueprint.get(blueprintId).push(component);
  }

  const blueprintById = new Map(
    blueprintRows.map((row) => [Number(row.id), row]),
  );

  const [linkedProducts] = await conn.query(
    `SELECT id, blueprint_id
       FROM products
       WHERE blueprint_id IN (${bpPlaceholders})
         AND type = 'blueprint'
       ORDER BY id ASC
       FOR UPDATE`,
    blueprintIds,
  );

  for (const product of linkedProducts) {
    const blueprintId = Number(product.blueprint_id);
    const blueprint = blueprintById.get(blueprintId);
    if (!blueprint) continue;

    const components = componentsByBlueprint.get(blueprintId) || [];

    await conn.query(
      `INSERT INTO product_blueprint_snapshots
         (product_id, source_blueprint_id, title, description, thumbnail_url,
          file_url, file_type, source, design_data, view_3d_data,
          components_json, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         source_blueprint_id = VALUES(source_blueprint_id),
         title = VALUES(title),
         description = VALUES(description),
         thumbnail_url = VALUES(thumbnail_url),
         file_url = VALUES(file_url),
         file_type = VALUES(file_type),
         source = VALUES(source),
         design_data = VALUES(design_data),
         view_3d_data = VALUES(view_3d_data),
         components_json = VALUES(components_json),
         captured_at = NOW()`,
      [
        Number(product.id),
        blueprintId,
        blueprint.title || null,
        blueprint.description || null,
        blueprint.thumbnail_url || null,
        blueprint.file_url || null,
        blueprint.file_type || null,
        blueprint.source || null,
        blueprint.design_data || null,
        blueprint.view_3d_data || null,
        JSON.stringify(components),
      ],
    );
  }

  if (linkedProducts.length > 0) {
    // Product and any order references survive the editable Blueprint.
    // Hide/detach the Product so a deleted design cannot remain customer-visible.
    // Price, stock, images and BOM are intentionally untouched.
    await conn.query(
      `UPDATE products
       SET blueprint_id = NULL,
           is_published = 0,
           is_active = 0,
           is_featured = 0
       WHERE blueprint_id IN (${bpPlaceholders})
         AND type = 'blueprint'`,
      blueprintIds,
    );
  }
}

async function deleteBlueprintCascade(conn, blueprintIds = []) {
  if (!Array.isArray(blueprintIds) || !blueprintIds.length) return;

  const bpPlaceholders = blueprintIds.map(() => "?").join(",");

  // Preserve linked Product design/history before Blueprint rows are removed.
  await snapshotAndDetachBlueprintProducts(conn, blueprintIds);

  const [estimationRows] = await conn.query(
    `SELECT id
     FROM estimations
     WHERE blueprint_id IN (${bpPlaceholders})`,
    blueprintIds,
  );

  const estimationIds = estimationRows.map((row) => row.id);

  if (estimationIds.length) {
    const estPlaceholders = estimationIds.map(() => "?").join(",");

    await conn.query(
      `DELETE FROM estimation_items
       WHERE estimation_id IN (${estPlaceholders})`,
      estimationIds,
    );
  }

  await conn.query(
    `DELETE FROM blueprint_revisions
     WHERE blueprint_id IN (${bpPlaceholders})`,
    blueprintIds,
  );

  await conn.query(
    `DELETE FROM blueprint_components
     WHERE blueprint_id IN (${bpPlaceholders})`,
    blueprintIds,
  );

  await conn.query(
    `DELETE FROM estimations
     WHERE blueprint_id IN (${bpPlaceholders})`,
    blueprintIds,
  );

  await conn.query(
    `DELETE FROM blueprints
     WHERE id IN (${bpPlaceholders})`,
    blueprintIds,
  );
}

async function purgeExpiredArchivedBlueprints() {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [expiredRows] = await conn.query(
      `SELECT b.id, b.title, b.archived_at
       FROM blueprints b
       LEFT JOIN orders o ON o.blueprint_id = b.id
       WHERE b.is_deleted = 1
         AND COALESCE(b.archived_at, b.updated_at, b.created_at) IS NOT NULL
         AND DATEDIFF(CURDATE(), DATE(COALESCE(b.archived_at, b.updated_at, b.created_at))) >= 30
         AND o.id IS NULL
       GROUP BY b.id`,
    );

    if (!expiredRows.length) {
      await conn.commit();
      return;
    }

    const blueprintIds = expiredRows.map((row) => row.id);

    await deleteBlueprintCascade(conn, blueprintIds);

    await conn.commit();

    // The purge above is an automatic, irreversible system action. Record it
    // only after the deletion transaction succeeds so failed/rolled-back
    // purges never appear as successful Audit Log entries.
    for (const blueprint of expiredRows) {
      await writeAuditLogSafe({
        userId: null,
        action: "system_purge_expired_blueprint",
        tableName: "blueprints",
        recordId: blueprint.id,
        oldValues: {
          title: blueprint.title || null,
          archived_at: blueprint.archived_at || null,
        },
        newValues: {
          result: "permanently_deleted",
          reason: "archive_retention_expired",
          retention_days: 30,
        },
        ipAddress: null,
      });
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── GET /api/blueprints ───────────────────────────────────────────────────────

module.exports = {
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
};
