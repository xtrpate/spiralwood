import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api, { buildAssetUrl } from "../../services/api";
import { buildEstimateProductionSnapshot } from "./data/estimateProductionSummary";

const UNIT_OPTIONS = [
  "pc",
  "pcs",
  "sheet",
  "sq.m",
  "m",
  "ft",
  "kg",
  "L",
  "roll",
  "set",
  "lot",
  "job",
  "service",
];

const AUTO_SOURCE_TYPES = new Set(["component", "cutlist", "blueprint_part"]);

const WOOD_FINISH_LABEL_MAP = {
  "oak-natural": "Oak Natural",
  "pine-light": "Pine Light",
  "maple-cream": "Maple Cream",
  "beech-honey": "Beech Honey",
  "walnut-dark": "Walnut Dark",
  "mahogany-rich": "Mahogany Rich",
  "teak-golden": "Teak Golden",
  "ash-beige": "Ash Beige",
};

const WOOD_FINISH_PRICE_MAP = {
  "oak-natural": 1,
  "pine-light": 0.92,
  "maple-cream": 1.08,
  "beech-honey": 1.05,
  "walnut-dark": 1.22,
  "mahogany-rich": 1.18,
  "teak-golden": 1.28,
  "ash-beige": 1.1,
};

const MATERIAL_AREA_RATE_MAP = {
  pine: 1450,
  oak: 1750,
  maple: 1900,
  beech: 1850,
  walnut: 2250,
  mahogany: 2150,
  teak: 2350,
  ash: 1950,
  default: 1650,
};

const TEMPLATE_GROUP_PRICE_MAP = {
  template_dining_table: 16200,
  template_bed_frame: 19800,
  template_wardrobe: 24800,
  template_coffee_table: 7800,
  template_closet_wardrobe: 0,
};

const PART_PREFIX_GROUP_PRICE_MAP = {
  dt_: TEMPLATE_GROUP_PRICE_MAP.template_dining_table,
  bed_: TEMPLATE_GROUP_PRICE_MAP.template_bed_frame,
  wr_: TEMPLATE_GROUP_PRICE_MAP.template_wardrobe,
  ct_: TEMPLATE_GROUP_PRICE_MAP.template_coffee_table,
};

const normalizeText = (value = "") =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const formatMoney = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateDisplay = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getBlueprintDisplayTitle = (blueprint = {}) =>
  normalizeText(blueprint?.title) || "Untitled Blueprint";

const getCustomerDisplayName = (blueprint = {}) =>
  normalizeText(
    blueprint?.client_name ||
      blueprint?.customer_name ||
      blueprint?.walkin_customer_name ||
      "",
  ) || "Unassigned";

const formatEstimateStatus = (value = "") => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "Draft";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const isAreaUnit = (unit = "") =>
  ["sq.m", "sqm", "m²", "m2"].includes(String(unit).trim().toLowerCase());

const getItemAmount = (item = {}) =>
  (Number(item.quantity || 0) || 0) * (Number(item.unit_cost || 0) || 0);

const makeLocalKey = (prefix = "row") =>
  `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;

const normalizeItem = (raw = {}, index = 0) => {
  const rawMaterialId = raw.raw_material_id
    ? Number(raw.raw_material_id)
    : null;
  const requestedType = String(raw.source_type || raw.sourceType || "")
    .trim()
    .toLowerCase();
  const sourceType = requestedType || (rawMaterialId ? "inventory_material" : "other");
  const unit = normalizeText(raw.unit || "pc") || "pc";
  const numericQty = Number(raw.quantity ?? raw.qty ?? 1);

  return {
    id: raw.id || null,
    component_id: raw.component_id ? Number(raw.component_id) : null,
    raw_material_id: rawMaterialId,
    name: normalizeText(raw.name || raw.description || raw.label || ""),
    quantity: isAreaUnit(unit)
      ? Number(Math.max(0.0001, numericQty || 0.0001).toFixed(4))
      : Math.max(1, Number.isFinite(numericQty) ? numericQty : 1),
    unit,
    unit_cost:
      raw.unit_cost === "" || raw.unit_cost === null
        ? ""
        : Number(raw.unit_cost ?? raw.unitCost ?? raw.unit_price ?? 0) || 0,
    note: normalizeText(raw.note || ""),
    source_key: normalizeText(raw.source_key || raw.sourceKey || ""),
    source_type: sourceType,
    _source_type_explicit: Boolean(requestedType),
    _row_key:
      raw._row_key ||
      normalizeText(raw.source_key || raw.sourceKey || "") ||
      (raw.id ? `db:${raw.id}` : makeLocalKey(`${sourceType || "row"}-${index}`)),
  };
};

const serializeItem = (item = {}) => ({
  id: item.id || undefined,
  component_id: item.component_id || null,
  raw_material_id: item.raw_material_id || null,
  name: normalizeText(item.name),
  description: normalizeText(item.name),
  quantity: Number(item.quantity || 0),
  unit: normalizeText(item.unit || "pc") || "pc",
  unit_cost: Number(item.unit_cost || 0),
  note: normalizeText(item.note),
  source_key: normalizeText(item.source_key),
  source_type:
    normalizeText(item.source_type || "") ||
    (item.raw_material_id ? "inventory_material" : "other"),
});

const isFilledItem = (item = {}) =>
  Boolean(
    normalizeText(item.name) ||
      item.raw_material_id ||
      Number(item.unit_cost || 0) > 0 ||
      normalizeText(item.note),
  );

const isInventoryItem = (item = {}) =>
  String(item.source_type || "").trim().toLowerCase() === "inventory_material";

const isBlueprintPartItem = (item = {}) => {
  if (isInventoryItem(item)) return false;
  const sourceType = String(item.source_type || "").toLowerCase();
  const sourceKey = String(item.source_key || "");
  return (
    AUTO_SOURCE_TYPES.has(sourceType) ||
    sourceKey.startsWith("component:") ||
    sourceKey.startsWith("cutrow:") ||
    sourceKey.startsWith("group:")
  );
};

const isOtherItem = (item = {}) =>
  !isInventoryItem(item) && !isBlueprintPartItem(item);

const parseBlueprintDesignData = (blueprint = {}) => {
  try {
    return typeof blueprint?.design_data === "string"
      ? JSON.parse(blueprint.design_data || "{}")
      : blueprint?.design_data || {};
  } catch {
    return {};
  }
};

const getWoodFinishMultiplier = (component = {}) => {
  const finish = String(component?.finish || "").trim();
  if (finish && WOOD_FINISH_PRICE_MAP[finish]) {
    return Number(WOOD_FINISH_PRICE_MAP[finish]) || 1;
  }

  const material = String(component?.material || "").toLowerCase();
  const match = Object.keys(MATERIAL_AREA_RATE_MAP).find(
    (key) => key !== "default" && material.includes(key),
  );
  if (!match) return 1;
  return MATERIAL_AREA_RATE_MAP[match] / MATERIAL_AREA_RATE_MAP.oak;
};

const getWoodFinishLabel = (component = {}) =>
  WOOD_FINISH_LABEL_MAP[String(component?.finish || "").trim()] || "";

const getMaterialRateKey = (material = "") => {
  const value = String(material || "").toLowerCase();
  return (
    Object.keys(MATERIAL_AREA_RATE_MAP).find(
      (key) => key !== "default" && value.includes(key),
    ) || "default"
  );
};

const getComponentVolume = (component = {}) =>
  Math.max(1, Number(component?.width) || 0) *
  Math.max(1, Number(component?.height) || 0) *
  Math.max(1, Number(component?.depth) || 0);

const getRecoveredGroupUnitPrice = (component = {}) => {
  const explicit = Number(component?.groupUnitPrice) || 0;
  if (explicit > 0) return explicit;

  const templateType = String(component?.templateType || "").trim();
  if (templateType && TEMPLATE_GROUP_PRICE_MAP[templateType]) {
    return Number(TEMPLATE_GROUP_PRICE_MAP[templateType]) || 0;
  }

  const type = String(component?.type || "").toLowerCase();
  const prefix = Object.keys(PART_PREFIX_GROUP_PRICE_MAP).find((item) =>
    type.startsWith(item),
  );
  return prefix ? PART_PREFIX_GROUP_PRICE_MAP[prefix] : 0;
};

const getComponentSurfaceAreaSqM = (width = 0, height = 0, depth = 0) => {
  const w = Math.max(1, Number(width) || 0);
  const h = Math.max(1, Number(height) || 0);
  const d = Math.max(1, Number(depth) || 0);
  return (2 * (w * h + w * d + h * d)) / 1000000;
};

const getComponentFloorPrice = (component = {}) => {
  const hint = `${component?.label || ""} ${component?.name || ""} ${component?.type || ""}`.toLowerCase();
  if (/(leg|post|support|foot|base)/i.test(hint)) return 650;
  if (/(top|tabletop|panel|shelf|door|drawer)/i.test(hint)) return 1200;
  if (/(apron|rail|brace|stretcher)/i.test(hint)) return 450;
  return 350;
};

const getResolvedUnitPrice = (component = {}, allComponents = []) => {
  const multiplier = getWoodFinishMultiplier(component);
  const direct = Number(component?.unitPrice) || 0;
  if (direct > 0) return Number((direct * multiplier).toFixed(2));

  const groupUnitPrice = getRecoveredGroupUnitPrice(component);
  if (component?.groupId && groupUnitPrice > 0) {
    const groupItems = allComponents.filter(
      (item) => item.groupId === component.groupId,
    );
    const totalVolume = groupItems.reduce(
      (sum, item) => sum + getComponentVolume(item),
      0,
    );
    if (totalVolume > 0) {
      return Number(
        (
          groupUnitPrice *
          (getComponentVolume(component) / totalVolume) *
          multiplier
        ).toFixed(2),
      );
    }
  }

  const width = Math.max(1, Number(component?.width) || 0);
  const height = Math.max(1, Number(component?.height) || 0);
  const depth = Math.max(1, Number(component?.depth) || 18);
  const areaRate =
    MATERIAL_AREA_RATE_MAP[getMaterialRateKey(component?.material)] ||
    MATERIAL_AREA_RATE_MAP.default;
  const thickness = Math.max(12, Math.min(width, height, depth));
  const thicknessFactor = Math.max(0.9, Math.min(1.8, thickness / 25));
  const surfaceArea = Math.max(
    getComponentSurfaceAreaSqM(width, height, depth),
    0.08,
  );
  const base = Math.max(
    getComponentFloorPrice(component),
    surfaceArea * areaRate * thicknessFactor,
  );
  return Number((base * multiplier).toFixed(2));
};

const getDefaultCutListUnitCost = (row = {}) => {
  const isArea =
    String(row?.estimationUnit || "").toLowerCase() === "panel_area";
  const areaRate =
    MATERIAL_AREA_RATE_MAP[getMaterialRateKey(row?.material)] ||
    MATERIAL_AREA_RATE_MAP.default;
  if (isArea) return Number(areaRate.toFixed(2));
  const base = String(row?.cutListType || "").toLowerCase() === "cabinet_body"
    ? 2800
    : 1200;
  return Number((base * (areaRate / MATERIAL_AREA_RATE_MAP.default)).toFixed(2));
};

const condenseAutoItems = (rows = []) => {
  const grouped = new Map();
  const output = [];

  rows.forEach((raw, index) => {
    const row = normalizeItem(raw, index);
    const numbered = row.name.match(/^(.*?)(?:\s+#?\d+)(\s*\([^)]*\))?$/i);
    if (!numbered) {
      output.push(row);
      return;
    }

    const base = normalizeText(`${numbered[1] || ""}${numbered[2] || ""}`);
    const key = [
      base.toLowerCase(),
      row.unit.toLowerCase(),
      Number(row.unit_cost || 0).toFixed(2),
      row.note.toLowerCase(),
    ].join("|");

    if (!grouped.has(key)) {
      const seed = {
        ...row,
        name: base,
        quantity: 0,
        source_key: `group:${key}`,
        _row_key: `group:${key}`,
      };
      grouped.set(key, seed);
      output.push(seed);
    }

    grouped.get(key).quantity += Number(row.quantity || 0);
  });

  return output.map((row) => ({
    ...row,
    name:
      Number(row.quantity || 0) > 1 && !/s$/i.test(row.name)
        ? `${row.name}s`
        : row.name,
  }));
};

const buildAutoItemsFromComponents = (components = []) =>
  condenseAutoItems(
    components.map((component) => {
      const finishLabel = getWoodFinishLabel(component);
      const material = normalizeText(component?.material || "—") || "—";
      return {
        name: `${component.label || "Component"}${finishLabel ? ` (${finishLabel})` : ""}`,
        quantity: Number(component.qty) || 1,
        unit: "pc",
        unit_cost: getResolvedUnitPrice(component, components),
        note: `${finishLabel ? `${finishLabel} · ` : ""}${material} · ${component.width || 0}×${component.height || 0}×${component.depth || 0} mm`,
        source_key: `component:${component.id || component.partCode || component.label || ""}`,
        source_type: "component",
      };
    }),
  );

const buildAutoItemsFromCutList = (rows = []) =>
  condenseAutoItems(
    rows.map((row, index) => {
      const useArea =
        String(row?.estimationUnit || "").toLowerCase() === "panel_area";
      const name =
        row?.sampleLabel ||
        [row?.partFamily || "Part", row?.partRole || "Item"]
          .filter(Boolean)
          .join(" — ");
      const note = [
        row?.material || "—",
        row?.widthMm && row?.heightMm && row?.depthMm
          ? `${row.widthMm}×${row.heightMm}×${row.depthMm} mm`
          : null,
        row?.thicknessMm ? `${row.thicknessMm} mm thick` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return {
        name,
        quantity: useArea
          ? Number(Number(row?.totalAreaSqM || 0).toFixed(4)) || 0.0001
          : Math.max(1, Number(row?.qty || 1) || 1),
        unit: useArea ? "sq.m" : "pc",
        unit_cost: getDefaultCutListUnitCost(row),
        note,
        source_key:
          row?.id ||
          `cutrow:${index}:${row?.partFamily || ""}:${row?.partRole || ""}`,
        source_type: "cutlist",
      };
    }),
  );

const buildPreferredAutoItems = (design = {}) => {
  if (
    Array.isArray(design?.conversionCutListRows) &&
    design.conversionCutListRows.length
  ) {
    return buildAutoItemsFromCutList(design.conversionCutListRows);
  }
  return buildAutoItemsFromComponents(
    Array.isArray(design?.components) ? design.components : [],
  );
};

const normalizeIdentityName = (value = "") => {
  let result = normalizeText(value)
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .toLowerCase();
  if (/ies$/i.test(result)) result = result.replace(/ies$/i, "y");
  else if (/s$/i.test(result) && !/ss$/i.test(result)) {
    result = result.replace(/s$/i, "");
  }
  return result;
};

const getDimensionIdentity = (note = "") => {
  const match = normalizeText(note).match(
    /\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?/i,
  );
  return match ? match[0].replace(/\s+/g, "").toLowerCase() : "";
};

const getLegacyIdentity = (item = {}) =>
  `${normalizeIdentityName(item.name)}|${getDimensionIdentity(item.note)}`;

const mergeAutoRows = (latestRows = [], savedAutoRows = [], legacyRows = []) => {
  const exactMap = new Map();
  const identityMap = new Map();

  [...savedAutoRows, ...legacyRows].forEach((row) => {
    if (row.source_key) exactMap.set(row.source_key, row);
    const identity = getLegacyIdentity(row);
    if (!identity || identity === "|") return;
    const current = identityMap.get(identity);
    if (!current || Number(row.unit_cost || 0) > Number(current.unit_cost || 0)) {
      identityMap.set(identity, row);
    }
  });

  return latestRows.map((raw, index) => {
    const row = normalizeItem(raw, index);
    const match = exactMap.get(row.source_key) || identityMap.get(getLegacyIdentity(row));
    if (!match) return row;
    return {
      ...row,
      unit_cost:
        Number(match.unit_cost || 0) > 0 ? Number(match.unit_cost) : row.unit_cost,
      quantity:
        Number(match.quantity || 0) > 0 ? Number(match.quantity) : row.quantity,
      unit: normalizeText(match.unit) || row.unit,
      note: normalizeText(match.note) || row.note,
      _row_key: row.source_key || row._row_key,
    };
  });
};

const reconcileLoadedItems = (rows = [], latestAutoRows = []) => {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map(normalizeItem)
    .filter(isFilledItem);
  const inventoryRows = normalized.filter(isInventoryItem);
  const savedAutoRows = normalized.filter(isBlueprintPartItem);
  const remaining = normalized.filter(
    (row) => !isInventoryItem(row) && !isBlueprintPartItem(row),
  );
  const latestIdentitySet = new Set(latestAutoRows.map(getLegacyIdentity));
  const legacyAutoRows = remaining.filter((row) => {
    const explicitOther =
      row.source_type === "other" && row._source_type_explicit;
    if (explicitOther) return false;
    const identity = getLegacyIdentity(row);
    return identity && latestIdentitySet.has(identity);
  });
  const otherRows = remaining
    .filter((row) => !legacyAutoRows.includes(row))
    .map((row) => ({
      ...row,
      source_type: "other",
      source_key: row.source_key || makeLocalKey("other"),
    }));

  const autoRows = latestAutoRows.length
    ? mergeAutoRows(latestAutoRows, savedAutoRows, legacyAutoRows)
    : savedAutoRows;

  const seenInventoryIds = new Set();
  const uniqueInventory = inventoryRows.filter((row) => {
    const id = Number(row.raw_material_id || 0);
    if (!id || seenInventoryIds.has(id)) return false;
    seenInventoryIds.add(id);
    return true;
  });

  return [...autoRows, ...uniqueInventory, ...otherRows];
};

const getDraftRows = (draft = {}) => {
  if (Array.isArray(draft?.rows)) return draft.rows;
  if (Array.isArray(draft?.lineItems)) return draft.lineItems;
  if (Array.isArray(draft?.line_items)) return draft.line_items;
  return [];
};

const getValidationErrors = ({ items = [], costs = {} } = {}) => {
  const errors = [];
  const filled = items.filter(isFilledItem);
  if (!filled.length) errors.push("Add at least one estimate item before saving.");

  const seenMaterialIds = new Set();
  filled.forEach((item, index) => {
    const label = `Item ${index + 1}`;
    if (isInventoryItem(item) && !item.raw_material_id) {
      errors.push(`${label}: Select an inventory material.`);
    }
    if (!normalizeText(item.name)) errors.push(`${label}: Description is required.`);
    if (normalizeText(item.name).length > 255) {
      errors.push(`${label}: Description must not exceed 255 characters.`);
    }
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      errors.push(`${label}: Quantity must be greater than 0.`);
    }
    if (
      !isInventoryItem(item) &&
      (!Number.isFinite(Number(item.unit_cost)) || Number(item.unit_cost) <= 0)
    ) {
      errors.push(`${label}: Rate must be greater than 0.`);
    }
    if (
      isInventoryItem(item) &&
      (!Number.isFinite(Number(item.unit_cost || 0)) || Number(item.unit_cost || 0) < 0)
    ) {
      errors.push(`${label}: Inventory tracking cost cannot be negative.`);
    }
    if (normalizeText(item.note).length > 500) {
      errors.push(`${label}: Remarks must not exceed 500 characters.`);
    }
    if (isInventoryItem(item) && item.raw_material_id) {
      const materialId = Number(item.raw_material_id);
      if (seenMaterialIds.has(materialId)) {
        errors.push(`${label}: The same inventory material cannot be added twice.`);
      }
      seenMaterialIds.add(materialId);
    }
  });

  const labor = Number(costs.labor_cost ?? 0);
  const logistics = Number(costs.overhead_cost ?? 0);
  const discount = Number(costs.discount ?? 0);
  const tax = Number(costs.tax_rate ?? 0);
  if (!Number.isFinite(labor) || labor < 0) errors.push("Labor cost cannot be negative.");
  if (!Number.isFinite(logistics) || logistics < 0) {
    errors.push("Logistics cost cannot be negative.");
  }
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    errors.push("Discount must be between 0% and 100%.");
  }
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
    errors.push("VAT must be between 0% and 100%.");
  }
  return errors;
};

const showFirstValidationError = (errors = []) => {
  if (!errors.length) return false;
  toast.error(`${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}`);
  return true;
};

const resolveAttachmentUrl = (src) => {
  const raw = String(src || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  return buildAssetUrl(raw);
};

const isImageAttachment = (attachment = {}) => {
  const mime = String(attachment?.mime_type || attachment?.type || "").toLowerCase();
  const url = String(attachment?.file_url || attachment?.url || "").toLowerCase();
  return mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(url);
};

const collectBlueprintReferenceFiles = (design = {}) => {
  const refs = design?.reference_files || design?.referenceFiles || {};
  return Object.entries(refs)
    .map(([view, file]) => {
      if (!file) return null;
      if (typeof file === "string") {
        return { id: `blueprint-${view}`, file_url: file, file_name: `${view} reference`, type: "image" };
      }
      return {
        id: `blueprint-${view}`,
        file_url: file.url || file.file_url || "",
        file_name: file.name || file.file_name || `${view} reference`,
        mime_type: file.mime_type || file.type || "",
      };
    })
    .filter((file) => file?.file_url);
};

const IMAGE_CUSTOMIZATION_KEY_PATTERN =
  /(^|_)(image|photo|picture|preview|attachment|reference|file)($|_)|(^|_)(url|uri)$/i;

const getImageMimeType = (src = "") => {
  const match = String(src).match(/^data:(image\/[^;,]+)[;,]/i);
  return match?.[1] || "";
};

const isCustomizationImageValue = (key, value) => {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return false;
  if (/^data:image\//i.test(normalizedValue)) return true;
  if (!IMAGE_CUSTOMIZATION_KEY_PATTERN.test(String(key || ""))) return false;
  return (
    /^(https?:|blob:|\/|uploads\/|assets\/)/i.test(normalizedValue) ||
    /\.(jpg|jpeg|png|webp|gif|svg)(?:[?#].*)?$/i.test(normalizedValue)
  );
};

const collectCustomizationReferenceFiles = (orderContext = {}) => {
  const files = [];
  (Array.isArray(orderContext?.items) ? orderContext.items : []).forEach((item, itemIndex) => {
    const customization = item?.customization || {};
    Object.entries(customization).forEach(([key, value], fieldIndex) => {
      if (typeof value !== "string" || !isCustomizationImageValue(key, value)) return;
      const fileUrl = value.trim();
      files.push({
        id: `customization-${item?.order_item_id || itemIndex}-${key}-${fieldIndex}`,
        file_url: fileUrl,
        file_name: `${humanizeKey(key).replace(/\s+(Url|Uri)$/i, "")} reference`,
        mime_type: getImageMimeType(fileUrl) || "image/*",
      });
    });
  });
  return files;
};

const humanizeKey = (key = "") =>
  String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getCustomizationEntries = (orderContext = {}) => {
  const entries = [];
  (Array.isArray(orderContext?.items) ? orderContext.items : []).forEach((item) => {
    const customization = item?.customization || {};
    Object.entries(customization).forEach(([key, value]) => {
      if (value === null || value === undefined || typeof value === "object") return;
      const normalizedValue = String(value).trim();
      if (!normalizedValue || isCustomizationImageValue(key, normalizedValue)) return;
      entries.push({
        label: humanizeKey(key),
        value: normalizedValue,
      });
    });
  });
  return entries.slice(0, 12);
};

const formatInventoryQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
};

const getInventoryAvailability = (item = {}, material = null) => {
  const unit = String(material?.unit || item?.unit || "").trim();

  if (!material) {
    return {
      state: "unselected",
      label: "Select material",
      detail: "Choose an inventory item first.",
      unit,
      available: 0,
      required: Number(item?.quantity) || 0,
      shortage: 0,
      remaining: 0,
    };
  }

  const availableValue = Number(
    material.available_quantity ?? material.quantity,
  );
  const requiredValue = Number(item.quantity);
  const reorderValue = Number(material.reorder_point);
  const available = Number.isFinite(availableValue) ? Math.max(0, availableValue) : 0;
  const reorderPoint = Number.isFinite(reorderValue) ? Math.max(0, reorderValue) : 0;

  if (!Number.isFinite(requiredValue) || requiredValue <= 0) {
    return {
      state: "invalid",
      label: "Enter quantity",
      detail: "Required quantity must be greater than 0.",
      unit,
      available,
      required: requiredValue,
      shortage: 0,
      remaining: available,
    };
  }

  const required = requiredValue;
  const shortage = Math.max(0, required - available);
  const remaining = Math.max(0, available - required);

  if (shortage > 0) {
    return {
      state: "insufficient",
      label: "Insufficient",
      detail: `Shortage: ${formatInventoryQuantity(shortage)} ${unit}`.trim(),
      unit,
      available,
      required,
      shortage,
      remaining: 0,
    };
  }

  const lowAfterRequirement = remaining <= reorderPoint;
  return {
    state: lowAfterRequirement ? "sufficient_low" : "sufficient",
    label: "Sufficient",
    detail: `${
      lowAfterRequirement ? "Low after requirement" : "Remaining"
    }: ${formatInventoryQuantity(remaining)} ${unit}`.trim(),
    unit,
    available,
    required,
    shortage: 0,
    remaining,
  };
};

const getAvailabilityColors = (state) => {
  if (state === "insufficient") {
    return { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" };
  }
  if (state === "sufficient_low") {
    return { background: "#fffbeb", border: "#fde68a", color: "#92400e" };
  }
  if (state === "sufficient") {
    return { background: "#f0fdf4", border: "#bbf7d0", color: "#166534" };
  }
  return { background: "#f4f4f5", border: "#e4e4e7", color: "#52525b" };
};

function EstimateTable({
  title,
  helper,
  section,
  rows,
  rawMaterials,
  readOnly,
  onAdd,
  onRemove,
  onUpdate,
  subtotal,
  inventoryTrackingOnly = false,
}) {
  const isInventory = section === "inventory";
  const showInventoryPricing = isInventory && !inventoryTrackingOnly;
  const emptyText =
    section === "blueprint"
      ? "No blueprint components are available. Use Refresh Components after saving the design."
      : section === "inventory"
        ? "No required inventory materials added yet."
        : "No additional items added yet.";
  const columnCount = isInventory
    ? showInventoryPricing
      ? 10
      : 8
    : 8;
  const inventoryChecks = isInventory
    ? rows.map((item) => {
        const material = rawMaterials.find(
          (row) => Number(row.id) === Number(item.raw_material_id),
        );
        return {
          item,
          material,
          availability: getInventoryAvailability(item, material),
        };
      })
    : [];
  const shortageChecks = inventoryChecks.filter(
    (entry) => entry.availability.state === "insufficient",
  );
  const completedChecks = inventoryChecks.filter(
    (entry) =>
      entry.availability.state === "sufficient" ||
      entry.availability.state === "sufficient_low",
  );

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <div style={sectionHeader}>
        <div>
          <h3 style={sectionTitle}>{title}</h3>
          <p style={helperText}>{helper}</p>
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            disabled={readOnly}
            style={readOnly ? { ...btnAdd, ...btnDisabled } : btnAdd}
          >
            + Add {section === "inventory" ? "Required Material" : "Additional Item"}
          </button>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={estimateTableStyle}>
          <thead>
            <tr style={tableHeadRow}>
              <th style={{ ...th, width: "5%" }}>No.</th>
              <th style={{ ...th, width: isInventory ? "30%" : "28%" }}>
                {isInventory ? "Inventory Material" : "Description"}
              </th>
              {isInventory && <th style={{ ...th, width: "13%" }}>Available Stock</th>}
              <th style={{ ...th, width: "10%" }}>Unit</th>
              <th style={{ ...th, width: "10%" }}>Quantity</th>
              {isInventory && <th style={{ ...th, width: "18%" }}>Stock Status</th>}
              {(!isInventory || showInventoryPricing) && (
                <th style={{ ...th, width: "12%" }}>Unit Rate</th>
              )}
              {(!isInventory || showInventoryPricing) && (
                <th style={{ ...th, width: "13%" }}>Line Total</th>
              )}
              <th style={{ ...th, width: isInventory ? "27%" : "20%" }}>Notes</th>
              <th style={{ ...th, width: "5%" }} />
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={columnCount} style={emptyCell}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((item, index) => {
                const selectedMaterial = rawMaterials.find(
                  (material) => Number(material.id) === Number(item.raw_material_id),
                );
                const availability = isInventory
                  ? getInventoryAvailability(item, selectedMaterial)
                  : null;
                const availabilityColors = getAvailabilityColors(availability?.state);
                const selectedOnHandQuantity = selectedMaterial
                  ? selectedMaterial.on_hand_quantity ?? selectedMaterial.quantity
                  : 0;
                const selectedReservedQuantity = selectedMaterial
                  ? selectedMaterial.reserved_quantity ?? 0
                  : 0;
                const selectedAvailableQuantity = selectedMaterial
                  ? selectedMaterial.available_quantity ?? selectedMaterial.quantity
                  : 0;
                const selectedPendingNeedQuantity = selectedMaterial
                  ? selectedMaterial.pending_need_quantity ?? 0
                  : 0;
                return (
                  <tr key={item._row_key} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={{ ...td, color: "#71717a", fontWeight: 800 }}>
                      {index + 1}
                    </td>
                    <td style={td}>
                      {isInventory ? (
                        <select
                          value={item.raw_material_id || ""}
                          onChange={(event) =>
                            onUpdate(item._row_key, "raw_material_id", event.target.value)
                          }
                          style={{ ...cellInput, ...readOnlyFieldStyle(readOnly), width: "100%" }}
                          disabled={readOnly}
                        >
                          <option value="">Select material...</option>
                          {rawMaterials.map((material) => (
                            <option key={material.id} value={material.id}>
                              {material.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={item.name}
                          onChange={(event) => onUpdate(item._row_key, "name", event.target.value)}
                          style={{ ...cellInput, ...readOnlyFieldStyle(readOnly), width: "100%", fontWeight: 600 }}
                          placeholder={section === "blueprint" ? "Blueprint part" : "e.g. Custom carved design"}
                          maxLength={255}
                          disabled={readOnly}
                        />
                      )}
                    </td>
                    {isInventory && (
                      <td style={td}>
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                          {selectedMaterial
                            ? `${formatInventoryQuantity(selectedAvailableQuantity)} ${selectedMaterial.unit || ""}`
                            : "—"}
                        </div>
                        {selectedMaterial && (
                          <div style={{ fontSize: 10, color: "#71717a", marginTop: 3 }}>
                            On hand {formatInventoryQuantity(selectedOnHandQuantity)} · Reserved {formatInventoryQuantity(selectedReservedQuantity)}
                          </div>
                        )}
                        {selectedMaterial && Number(selectedPendingNeedQuantity) > 0 && (
                          <div style={{ fontSize: 10, color: "#991b1b", marginTop: 3 }}>
                            Pending need {formatInventoryQuantity(selectedPendingNeedQuantity)} {selectedMaterial.unit || ""}
                          </div>
                        )}
                      </td>
                    )}
                    <td style={td}>
                      {isInventory ? (
                        <input
                          value={item.unit || selectedMaterial?.unit || ""}
                          readOnly
                          style={{ ...cellInput, width: "100%", background: "#fafafa", color: "#71717a" }}
                        />
                      ) : (
                        <select
                          value={item.unit}
                          onChange={(event) => onUpdate(item._row_key, "unit", event.target.value)}
                          style={{ ...cellInput, ...readOnlyFieldStyle(readOnly), width: "100%" }}
                          disabled={readOnly}
                        >
                          {UNIT_OPTIONS.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        min={isAreaUnit(item.unit) ? "0.0001" : "0.01"}
                        step={isAreaUnit(item.unit) ? "0.0001" : "0.01"}
                        value={item.quantity}
                        onChange={(event) => onUpdate(item._row_key, "quantity", event.target.value)}
                        style={{ ...cellInput, ...readOnlyFieldStyle(readOnly), width: "100%" }}
                        disabled={readOnly}
                      />
                    </td>
                    {isInventory && (
                      <td style={td}>
                        <div
                          style={{
                            padding: "7px 9px",
                            borderRadius: 8,
                            border: `1px solid ${availabilityColors.border}`,
                            background: availabilityColors.background,
                            color: availabilityColors.color,
                            minWidth: 130,
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 800 }}>
                            {availability.label}
                          </div>
                          <div style={{ fontSize: 10, marginTop: 2, lineHeight: 1.35 }}>
                            {availability.detail}
                          </div>
                        </div>
                      </td>
                    )}
                    {(!isInventory || showInventoryPricing) && (
                      <td style={td}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_cost}
                          onChange={(event) => onUpdate(item._row_key, "unit_cost", event.target.value)}
                          style={{ ...cellInput, ...readOnlyFieldStyle(readOnly), width: "100%" }}
                          placeholder="0.00"
                          disabled={readOnly}
                        />
                      </td>
                    )}
                    {(!isInventory || showInventoryPricing) && (
                      <td style={{ ...td, fontWeight: 800, whiteSpace: "nowrap" }}>
                        {formatMoney(getItemAmount(item))}
                      </td>
                    )}
                    <td style={td}>
                      <input
                        value={item.note}
                        onChange={(event) => onUpdate(item._row_key, "note", event.target.value)}
                        style={{ ...cellInput, ...readOnlyFieldStyle(readOnly), width: "100%" }}
                        placeholder={isInventory ? "Size, thickness, finish..." : "Reference photo, inclusions, details..."}
                        maxLength={500}
                        disabled={readOnly}
                      />
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => onRemove(item._row_key)}
                          style={btnRemove}
                          title="Remove row"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            {isInventory && inventoryTrackingOnly ? (
              <tr style={tableFooterRow}>
                <td colSpan={columnCount} style={{ ...td, padding: "14px 16px" }}>
                  {shortageChecks.length > 0 ? (
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        color: "#991b1b",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        Inventory shortage detected
                      </div>
                      {shortageChecks.map(({ item, material, availability }) => (
                        <div key={item._row_key} style={{ fontSize: 12, marginTop: 4 }}>
                          {material?.name || item.name}: required {formatInventoryQuantity(availability.required)} {availability.unit}, available {formatInventoryQuantity(availability.available)} {availability.unit}, shortage {formatInventoryQuantity(availability.shortage)} {availability.unit}.
                        </div>
                      ))}
                      <div style={{ fontSize: 11, marginTop: 7, color: "#7f1d1d" }}>
                        The estimate may still be saved or sent. This phase only reports availability; stock is not reserved or deducted yet.
                      </div>
                    </div>
                  ) : rows.length > 0 && completedChecks.length === rows.length ? (
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid #bbf7d0",
                        background: "#f0fdf4",
                        color: "#166534",
                        fontWeight: 700,
                      }}
                    >
                      All selected inventory materials are currently sufficient. Stock is not reserved or deducted yet.
                    </div>
                  ) : (
                    <div style={{ color: "#52525b", fontWeight: 700 }}>
                      Internal stock requirement only. These materials are not charged again in the quotation.
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              <tr style={tableFooterRow}>
                <td
                  colSpan={isInventory ? 6 : 5}
                  style={{ ...td, textAlign: "right", fontWeight: 800 }}
                >
                  {title} Subtotal
                </td>
                <td style={{ ...td, fontWeight: 800, fontSize: 15, whiteSpace: "nowrap" }}>
                  {formatMoney(subtotal)}
                </td>
                <td colSpan={2} />
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}


function ProductionSnapshotPanel({ snapshot }) {
  const parts = Array.isArray(snapshot?.parts) ? snapshot.parts : [];
  const summary = snapshot?.summary || {};
  const isReady = summary.handoffStatus === "READY";

  return (
    <div style={productionSnapshotCard}>
      <div style={productionSnapshotHeader}>
        <div>
          <div style={productionEyebrow}>Internal Production Reference</div>
          <h3 style={{ ...sectionTitle, marginTop: 5 }}>
            Blueprint Production Requirements
          </h3>
          <p style={{ ...helperText, maxWidth: 850 }}>
            Use the saved Blueprint details as a guide when preparing the estimate.
            Required Inventory Materials are still selected manually by the Admin.
            This panel does not reserve, deduct, or automatically match inventory.
          </p>
        </div>
        <div
          style={{
            ...productionStatus,
            ...(isReady ? productionStatusReady : productionStatusReview),
          }}
        >
          <span style={productionStatusLabel}>Handoff Status</span>
          <strong>{summary.handoffStatus || "REVIEW"}</strong>
        </div>
      </div>

      <div style={productionSummaryGrid}>
        {[
          ["Production Parts", summary.productionParts || 0],
          ["Material Types", summary.materialTypes || 0],
          ["Edge-Treated Parts", summary.edgeTreatedParts || 0],
          ["Hardware Qty", summary.hardwareQty || 0],
          ["Custom Profiles", summary.customProfiles || 0],
          ["Machining Ops", summary.machiningOps || 0],
        ].map(([label, value]) => (
          <div key={label} style={productionMetricCard}>
            <span style={productionMetricLabel}>{label}</span>
            <strong style={productionMetricValue}>{value}</strong>
          </div>
        ))}
      </div>

      {!parts.length ? (
        <div style={productionEmpty}>
          No saved Blueprint production parts are available yet. Save the Blueprint
          design first, then return to Project Estimate.
        </div>
      ) : (
        <>
          {Number(summary.incompletePartCount || 0) > 0 && (
            <div style={productionReviewNotice}>
              Review {summary.incompletePartCount} part
              {summary.incompletePartCount === 1 ? "" : "s"} with missing production
              identity data before finalizing the quotation.
            </div>
          )}

          <div style={productionGuide}>
            <strong>Inventory remains manual.</strong>
            <span>
              Read the requirements below, then use the existing Required Inventory
              Materials section to choose the actual stock items and quantities.
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={productionTable}>
              <thead>
                <tr style={productionTableHead}>
                  <th style={{ ...productionTh, width: "17%" }}>Part</th>
                  <th style={{ ...productionTh, width: "7%" }}>Qty</th>
                  <th style={{ ...productionTh, width: "20%" }}>Cut Size</th>
                  <th style={{ ...productionTh, width: "19%" }}>Material / Grain</th>
                  <th style={{ ...productionTh, width: "37%" }}>Production Notes</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => {
                  const detailLines = [
                    ...part.edgeLines,
                    ...part.hardwareLines,
                    ...part.cutoutLines,
                    ...part.notchLines,
                    ...part.operationLines,
                  ];

                  return (
                    <tr key={part.id} style={productionRow}>
                      <td style={productionTd}>
                        <div style={productionPartCode}>{part.code}</div>
                        <div style={productionPartName}>{part.name}</div>
                        {part.completenessIssues.length > 0 && (
                          <div style={productionPartReview}>
                            Review: {part.completenessIssues.join(", ")}
                          </div>
                        )}
                      </td>
                      <td style={{ ...productionTd, fontWeight: 850 }}>
                        {part.quantity}
                      </td>
                      <td style={productionTd}>
                        <span style={productionMono}>{part.cutSize}</span>
                      </td>
                      <td style={productionTd}>
                        <div style={{ fontWeight: 800 }}>{part.material}</div>
                        <div style={productionSecondary}>{part.grain}</div>
                      </td>
                      <td style={productionTd}>
                        <div style={productionTagWrap}>
                          {(part.productionTags.length
                            ? part.productionTags
                            : ["Standard part"]
                          ).map((tag) => (
                            <span key={`${part.id}-${tag}`} style={productionTag}>
                              {tag}
                            </span>
                          ))}
                        </div>

                        {detailLines.length > 0 ? (
                          <div style={productionDetailList}>
                            {detailLines.map((line, index) => (
                              <div key={`${part.id}-detail-${index}`}>• {line}</div>
                            ))}
                          </div>
                        ) : (
                          <div style={productionSecondary}>
                            No special machining, hardware, or edge treatment assigned.
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={productionFooterNote}>
            Production metadata is reference-only. Pricing remains controlled by the
            existing Blueprint Components, Additional Items, Labor, Logistics, and
            quotation fields.
          </div>
        </>
      )}
    </div>
  );
}

const getOversizedDeliveryDraftStorageKey = (blueprintId) =>
  `wisdom_oversized_delivery_draft:${blueprintId}`;

const readOversizedDeliveryDraft = (blueprintId) => {
  try {
    const value = window.sessionStorage.getItem(
      getOversizedDeliveryDraftStorageKey(blueprintId),
    );
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export default function EstimationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [blueprint, setBlueprint] = useState(null);
  const [estimation, setEstimation] = useState(null);
  const [oversizedDeliveryDraft, setOversizedDeliveryDraft] =
    useState(null);
  const [items, setItems] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [discussion, setDiscussion] = useState([]);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [costs, setCosts] = useState({
    labor_cost: 0,
    overhead_cost: 0,
    tax_rate: 12,
    discount: 0,
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const parsedDesign = useMemo(() => parseBlueprintDesignData(blueprint), [blueprint]);
  const productionSnapshot = useMemo(
    () => buildEstimateProductionSnapshot(parsedDesign),
    [parsedDesign],
  );
  const preferredAutoItems = useMemo(
    () => buildPreferredAutoItems(parsedDesign),
    [parsedDesign],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [blueprintResponse, estimationResponse, materialsResponse] = await Promise.all([
          api.get(`/blueprints/${id}`),
          api.get(`/blueprints/${id}/estimation`).catch((error) => {
            if (error?.response?.status === 404) return { data: null };
            throw error;
          }),
          api.get("/inventory/raw", { params: { page: 1, limit: 1000 } }),
        ]);

        if (cancelled) return;
        const loadedBlueprint = blueprintResponse.data;
        const loadedDesign = parseBlueprintDesignData(loadedBlueprint);
        const latestAutoRows = buildPreferredAutoItems(loadedDesign);
        setBlueprint(loadedBlueprint);
        setRawMaterials(
          Array.isArray(materialsResponse.data?.rows)
            ? materialsResponse.data.rows
            : [],
        );

        const savedEstimation = estimationResponse.data;
        if (savedEstimation) {
          setEstimation(savedEstimation);
          const loadedItems = reconcileLoadedItems(
            Array.isArray(savedEstimation.items) ? savedEstimation.items : [],
            latestAutoRows,
          );
          setItems(loadedItems.length ? loadedItems : latestAutoRows);
          setCosts({
            labor_cost: Number(savedEstimation.labor_cost || 0),
            overhead_cost: Number(savedEstimation.overhead_cost || 0),
            tax_rate: Number(savedEstimation.tax_rate ?? 12),
            discount: Number(savedEstimation.discount || 0),
            notes: savedEstimation.notes || "",
          });
        } else {
          const draftCandidates = [];
          if (location.state?.estimateDraft) draftCandidates.push(location.state.estimateDraft);
          try {
            const stored = JSON.parse(localStorage.getItem("wisdom_estimate_draft") || "null");
            if (stored) draftCandidates.push(stored);
          } catch {
            // Ignore malformed local draft.
          }
          const matchedDraft = draftCandidates.find(
            (draft) => String(draft?.blueprintId ?? draft?.blueprint_id ?? "") === String(id),
          );
          const draftRows = getDraftRows(matchedDraft);
          setItems(
            draftRows.length
              ? reconcileLoadedItems(draftRows, latestAutoRows)
              : latestAutoRows,
          );
        }

        const orderId = loadedBlueprint?.order_id || loadedBlueprint?.order_context?.order_id;
        if (orderId) {
          setDiscussionLoading(true);
          try {
            const discussionResponse = await api.get(`/orders/${orderId}/discussion`);
            if (!cancelled) {
              setDiscussion(
                Array.isArray(discussionResponse.data?.discussion)
                  ? discussionResponse.data.discussion
                  : [],
              );
            }
          } catch (error) {
            console.error("Failed to load customer discussion:", error);
            if (!cancelled) setDiscussion([]);
          } finally {
            if (!cancelled) setDiscussionLoading(false);
          }
        }
      } catch (error) {
        console.error(error);
        toast.error(error?.response?.data?.message || "Failed to load estimation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, location.state]);

  useEffect(() => {
    setOversizedDeliveryDraft(
      readOversizedDeliveryDraft(id),
    );

    const handleDraftChange = (event) => {
      if (
        String(event?.detail?.blueprintId || "") !== String(id)
      ) {
        return;
      }

      setOversizedDeliveryDraft(
        event?.detail?.oversized_delivery || null,
      );
    };

    window.addEventListener(
      "wisdom:oversized-delivery-draft-changed",
      handleDraftChange,
    );

    return () => {
      window.removeEventListener(
        "wisdom:oversized-delivery-draft-changed",
        handleDraftChange,
      );
    };
  }, [id]);

  useEffect(() => {
    const handleOversizedDeliveryUpdate = (event) => {
      const detail = event?.detail || {};

      if (
        String(detail.blueprintId || "") !== String(id)
      ) {
        return;
      }

      const nextEstimation = detail.estimation || {};
      const nextFee = Number(
        nextEstimation?.decision?.additional_delivery_fee ??
          nextEstimation?.additional_delivery_fee ??
          0,
      );

      setEstimation((current) => ({
        ...(current || {}),
        ...nextEstimation,
        additional_delivery_fee:
          Number.isFinite(nextFee) && nextFee > 0
            ? nextFee
            : 0,
      }));
    };

    window.addEventListener(
      "wisdom:oversized-delivery-updated",
      handleOversizedDeliveryUpdate,
    );

    return () => {
      window.removeEventListener(
        "wisdom:oversized-delivery-updated",
        handleOversizedDeliveryUpdate,
      );
    };
  }, [id]);

  const blueprintItems = useMemo(() => items.filter(isBlueprintPartItem), [items]);
  const inventoryItems = useMemo(() => items.filter(isInventoryItem), [items]);
  const otherItems = useMemo(() => items.filter(isOtherItem), [items]);

  const inventoryPricingMode =
    estimation?.inventory_pricing_mode === "legacy_billable"
      ? "legacy_billable"
      : "tracking_only";
  const inventoryTrackingOnly = inventoryPricingMode === "tracking_only";

  const blueprintSubtotal = blueprintItems.reduce((sum, item) => sum + getItemAmount(item), 0);
  const inventorySubtotal = inventoryItems.reduce((sum, item) => sum + getItemAmount(item), 0);
  const otherSubtotal = otherItems.reduce((sum, item) => sum + getItemAmount(item), 0);
  const quoteItemsSubtotal =
    blueprintSubtotal +
    otherSubtotal +
    (inventoryTrackingOnly ? 0 : inventorySubtotal);
  const laborCost = Number(costs.labor_cost || 0);
  const logisticsCost = Number(costs.overhead_cost || 0);
  const draftDeliveryDecision = String(
    oversizedDeliveryDraft?.decision || "",
  )
    .trim()
    .toLowerCase();
  const additionalDeliveryFee = Math.max(
    0,
    Number(
      oversizedDeliveryDraft?.assessment_status === "oversized"
        ? draftDeliveryDecision === "fee_required"
          ? oversizedDeliveryDraft?.additional_delivery_fee || 0
          : 0
        : estimation?.additional_delivery_fee || 0,
    ),
  );
  const subtotal =
    quoteItemsSubtotal +
    laborCost +
    logisticsCost +
    additionalDeliveryFee;
  const discountRate = Math.max(0, Math.min(100, Number(costs.discount || 0)));
  const discountAmount = subtotal * (discountRate / 100);
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = afterDiscount * (Math.max(0, Number(costs.tax_rate || 0)) / 100);
  const grandTotal = afterDiscount + taxAmount;

  const status = formatEstimateStatus(estimation?.status);
  const isApproved = String(estimation?.status || "").toLowerCase() === "approved";
  const isSent = String(estimation?.status || "").toLowerCase() === "sent";
  const isReadOnly = isApproved || isSent;
  const validUntil = new Date(estimation?.updated_at || estimation?.created_at || Date.now());
  validUntil.setDate(validUntil.getDate() + 30);

  const customerMessages = useMemo(
    () =>
      discussion
        .filter((entry) => String(entry?.sender_role || "").toLowerCase() === "customer")
        .slice(-6),
    [discussion],
  );
  const discussionAttachments = useMemo(
    () => discussion.flatMap((entry) => (Array.isArray(entry.attachments) ? entry.attachments : [])),
    [discussion],
  );
  const blueprintReferenceFiles = useMemo(
    () => collectBlueprintReferenceFiles(parsedDesign),
    [parsedDesign],
  );
  const customizationReferenceFiles = useMemo(
    () => collectCustomizationReferenceFiles(blueprint?.order_context),
    [blueprint],
  );
  const referenceFiles = useMemo(() => {
    const seen = new Set();
    return [
      ...blueprintReferenceFiles,
      ...customizationReferenceFiles,
      ...discussionAttachments,
    ].filter((file) => {
      const key = String(file.file_url || file.url || "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [blueprintReferenceFiles, customizationReferenceFiles, discussionAttachments]);
  const customizationEntries = useMemo(
    () => getCustomizationEntries(blueprint?.order_context),
    [blueprint],
  );

  const updateItem = (rowKey, field, value) => {
    if (isReadOnly) return;
    setItems((current) =>
      current.map((item) => {
        if (item._row_key !== rowKey) return item;
        if (field === "raw_material_id") {
          const material = rawMaterials.find(
            (row) => Number(row.id) === Number(value),
          );
          return {
            ...item,
            raw_material_id: material ? Number(material.id) : null,
            name: material?.name || "",
            unit: material?.unit || "pc",
            unit_cost: 0,
            source_type: "inventory_material",
          };
        }
        if (field === "name") return { ...item, name: String(value).slice(0, 255) };
        if (field === "note") return { ...item, note: String(value).slice(0, 500) };
        return { ...item, [field]: value };
      }),
    );
  };

  const removeItem = (rowKey) => {
    if (isReadOnly) return;
    setItems((current) => current.filter((item) => item._row_key !== rowKey));
  };

  const addInventoryItem = () => {
    if (isReadOnly) return;
    setItems((current) => [
      ...current,
      normalizeItem({
        raw_material_id: null,
        name: "",
        quantity: 1,
        unit: "pc",
        unit_cost: 0,
        note: "",
        source_key: makeLocalKey("inventory"),
        source_type: "inventory_material",
      }),
    ]);
  };

  const addOtherItem = () => {
    if (isReadOnly) return;
    setItems((current) => [
      ...current,
      normalizeItem({
        name: "",
        quantity: 1,
        unit: "pc",
        unit_cost: "",
        note: "",
        source_key: makeLocalKey("other"),
        source_type: "other",
      }),
    ]);
  };

  const handleRegenerate = () => {
    if (isReadOnly) {
      toast.error("Sent or approved estimates cannot be refreshed.");
      return;
    }
    if (!preferredAutoItems.length) {
      toast.error("No blueprint design data is available to refresh.");
      return;
    }
    const shouldReplace = window.confirm(
      "Refresh blueprint components from the latest design? Existing matching prices will be preserved. Required materials and additional items will remain unchanged.",
    );
    if (!shouldReplace) return;

    const mergedAuto = mergeAutoRows(preferredAutoItems, blueprintItems, []);
    setItems([...mergedAuto, ...inventoryItems, ...otherItems]);
    toast.success("Blueprint components refreshed. Required materials and additional items were preserved.");
  };

  const buildPayload = (
    deliveryDraft = oversizedDeliveryDraft,
  ) => {
    const filledItems = items.filter(isFilledItem).map(serializeItem);
    return {
      items: filledItems,
      oversized_delivery: deliveryDraft,
      labor_cost: laborCost,
      overhead_cost: logisticsCost,
      tax_rate: Number(costs.tax_rate || 0),
      discount: discountRate,
      notes: normalizeText(costs.notes),
      inventory_pricing_mode: "tracking_only",
      material_cost: quoteItemsSubtotal,
      items_total: quoteItemsSubtotal,
      additional_delivery_fee: additionalDeliveryFee,
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      grand_total: grandTotal,
    };
  };

  const handleSave = async () => {
    if (isReadOnly) {
      toast.error("Sent or approved estimates are locked.");
      return;
    }

    const validationErrors = getValidationErrors({ items, costs });
    if (showFirstValidationError(validationErrors)) return;

    const currentDeliveryDraft =
      readOversizedDeliveryDraft(id) ||
      oversizedDeliveryDraft;

    if (
      currentDeliveryDraft?.assessment_status === "oversized" &&
      !currentDeliveryDraft?.complete
    ) {
      toast.error(
        "Complete the oversized-delivery decision before saving the estimate.",
      );
      return;
    }

    let estimationSaved = false;
    setSaving(true);

    try {
      const response = await api.post(
        `/blueprints/${id}/estimation`,
        buildPayload(currentDeliveryDraft),
      );

      let saved = response.data?.estimation || null;
      estimationSaved = Boolean(
        saved?.id || response.data?.id,
      );

      if (
        currentDeliveryDraft?.assessment_status === "oversized"
      ) {
        const deliveryResponse = await api.patch(
          `/oversized-delivery/blueprints/${id}/decision`,
          {
            decision: currentDeliveryDraft.decision,
            additional_delivery_fee:
              currentDeliveryDraft.decision === "fee_required"
                ? Number(
                    currentDeliveryDraft.additional_delivery_fee ||
                      0,
                  )
                : 0,
            reason: String(
              currentDeliveryDraft.reason || "",
            ).trim(),
            truck_type: String(
              currentDeliveryDraft.truck_type || "",
            ).trim(),
          },
        );

        const deliveryEstimation =
          deliveryResponse.data?.estimation || {};
        const nextDecision =
          deliveryEstimation?.decision || {};

        saved = {
          ...(saved || {}),
          ...deliveryEstimation,
          additional_delivery_fee: Number(
            deliveryEstimation.additional_delivery_fee ??
              nextDecision.additional_delivery_fee ??
              0,
          ),
          decision: nextDecision,
        };

        window.dispatchEvent(
          new CustomEvent(
            "wisdom:oversized-delivery-updated",
            {
              detail: {
                blueprintId: String(id),
                estimation: saved,
              },
            },
          ),
        );
      }

      if (saved) {
        setEstimation(saved);
        setItems(
          reconcileLoadedItems(
            saved.items || [],
            preferredAutoItems,
          ),
        );
        setCosts((current) => ({
          ...current,
          discount: Number(
            saved.discount ?? current.discount,
          ),
        }));
      }

      setBlueprint((current) =>
        current
          ? { ...current, stage: "estimation" }
          : current,
      );

      window.dispatchEvent(
        new CustomEvent("wisdom:estimation-saved", {
          detail: {
            blueprintId: String(id),
            estimation: saved,
          },
        }),
      );

      toast.success(
        currentDeliveryDraft?.assessment_status === "oversized"
          ? "Estimate and oversized-delivery decision saved."
          : "Estimate saved. Review it before sending the quotation.",
      );
    } catch (error) {
      console.error(error);

      const serverMessage =
        error?.response?.data?.message || "";

      toast.error(
        estimationSaved
          ? `The estimate was saved, but the delivery decision failed: ${
              serverMessage || "Please review the decision and save again."
            }`
          : serverMessage || "Failed to save estimation.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSendQuote = async () => {
    if (!estimation?.id) {
      toast.error("Save the estimate first before sending the quotation.");
      return;
    }
    const validationErrors = getValidationErrors({ items, costs });
    if (showFirstValidationError(validationErrors)) return;

    setApproving(true);
    try {
      const response = await api.patch(`/blueprints/${id}/estimation/approve`);
      setEstimation((current) => ({
        ...(current || {}),
        ...(response.data?.estimation || {}),
        status: "sent",
      }));
      setBlueprint((current) => (current ? { ...current, stage: "approval" } : current));
      toast.success("Quotation sent to the customer for approval.");
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to send quotation.");
    } finally {
      setApproving(false);
    }
  };

  const handleGenerateContract = () => {
    if (!isApproved || !blueprint?.order_id) {
      toast.error("Only a customer-approved quotation linked to an order can generate a contract.");
      return;
    }
    navigate("/admin/contracts", {
      state: {
        contractDraft: {
          blueprint_id: String(id),
          order_id: String(blueprint.order_id),
        },
      },
    });
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const money = (value) =>
      `PHP ${Number(value || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

    doc.setFillColor(24, 24, 27);
    doc.rect(0, 0, pageWidth, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Spiral Wood Services", margin, 18);
    doc.setFontSize(16);
    doc.text("QUOTATION", pageWidth - margin, 18, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Blueprint: ${getBlueprintDisplayTitle(blueprint)}`, margin, 28);
    doc.text(`Customer: ${getCustomerDisplayName(blueprint)}`, margin, 33);
    doc.text(`Order: ${blueprint?.order_number || "—"}`, margin, 38);
    doc.text(`Status: ${status}`, pageWidth - margin, 28, { align: "right" });
    doc.text(`Date: ${new Date().toLocaleDateString("en-PH")}`, pageWidth - margin, 33, { align: "right" });
    doc.line(margin, 43, pageWidth - margin, 43);

    const addSection = (title, sectionRows, startY) => {
      if (!sectionRows.length) return startY;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(title.toUpperCase(), margin, startY);
      autoTable(doc, {
        startY: startY + 3,
        margin: { left: margin, right: margin },
        theme: "grid",
        head: [["#", "Description", "Unit", "Qty", "Rate", "Amount"]],
        body: sectionRows.map((item, index) => [
          index + 1,
          item.note ? `${item.name}\n${item.note}` : item.name,
          item.unit,
          Number(item.quantity || 0),
          money(item.unit_cost),
          money(getItemAmount(item)),
        ]),
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.5 },
        headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255] },
        columnStyles: {
          0: { cellWidth: 9, halign: "center" },
          1: { cellWidth: 87 },
          2: { cellWidth: 17, halign: "center" },
          3: { cellWidth: 16, halign: "center" },
          4: { cellWidth: 27, halign: "right" },
          5: { cellWidth: 27, halign: "right" },
        },
      });
      return doc.lastAutoTable.finalY + 8;
    };

    let y = 51;
    y = addSection("Blueprint Components", blueprintItems, y);
    if (!inventoryTrackingOnly) {
      y = addSection("Required Inventory Materials", inventoryItems, y);
    }
    y = addSection("Additional Items", otherItems, y);

    if (y > 220) {
      doc.addPage();
      y = 20;
    }

    const summaryRows = [
      ["Blueprint Components", money(blueprintSubtotal)],
      ...(!inventoryTrackingOnly
        ? [["Required Inventory Materials", money(inventorySubtotal)]]
        : []),
      ["Additional Items", money(otherSubtotal)],
      ["Labor", money(laborCost)],
      ["Logistics", money(logisticsCost)],
      ...(additionalDeliveryFee > 0
        ? [["Additional Delivery Fee", money(additionalDeliveryFee)]]
        : []),
      ["Subtotal", money(subtotal)],
      [`Discount (${discountRate}%)`, `(${money(discountAmount)})`],
      [`VAT (${Number(costs.tax_rate || 0)}%)`, money(taxAmount)],
      ["GRAND TOTAL", money(grandTotal)],
    ];

    autoTable(doc, {
      startY: y,
      margin: { left: 105, right: margin },
      theme: "plain",
      body: summaryRows,
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
      didParseCell: (data) => {
        if (data.row.index === summaryRows.length - 1) {
          data.cell.styles.fillColor = [24, 24, 27];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const notesY = Math.min(doc.lastAutoTable.finalY + 10, 260);
    if (costs.notes) {
      doc.setFont("helvetica", "bold");
      doc.text("Quotation Notes", margin, notesY);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(costs.notes, 175), margin, notesY + 5);
    }

    doc.save(`quotation_BP-${String(id).padStart(4, "0")}_${Date.now()}.pdf`);
    toast.success("Quotation PDF exported.");
  };

  if (loading) return <div style={center}>Loading estimate...</div>;
  if (!blueprint) return <div style={center}>Blueprint not found.</div>;

  return (
    <div style={pageShell}>
      <div style={pageHeader}>
        <div style={titleBlock}>
          <button type="button" onClick={() => navigate(-1)} style={btnBack}>← Back</button>
          <div>
            <h1 style={pageTitle}>Project Estimate — {getBlueprintDisplayTitle(blueprint)}</h1>
            <p style={pageSubTitle}>
              Blueprint #{String(id).padStart(5, "0")} · Customer: {getCustomerDisplayName(blueprint)}
              {blueprint.order_number ? ` · Order: ${blueprint.order_number}` : ""}
            </p>
          </div>
        </div>

        <div style={headerActions}>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isReadOnly || !preferredAutoItems.length}
            style={isReadOnly || !preferredAutoItems.length ? { ...btnGhost, ...btnDisabled } : btnGhost}
          >
            Refresh Components
          </button>
          <button type="button" onClick={exportPDF} style={btnGhost}>Export PDF</button>
          {isApproved ? (
            <button
              type="button"
              onClick={handleGenerateContract}
              disabled={!blueprint?.order_id}
              style={!blueprint?.order_id ? { ...btnPrimary, ...btnDisabled } : btnPrimary}
            >
              Generate Contract
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSendQuote}
              disabled={!estimation?.id || approving || isSent}
              style={!estimation?.id || approving || isSent ? { ...btnGhost, ...btnDisabled } : btnPrimary}
            >
              {isSent ? "Quotation Sent" : approving ? "Sending..." : "Send Quotation"}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || isReadOnly}
            style={saving || isReadOnly ? { ...btnPrimary, ...btnDisabled } : btnPrimary}
          >
            {saving ? "Saving..." : "Save Estimate"}
          </button>
        </div>
      </div>

      <div style={metaGrid}>
        <div style={metaCard}><span style={metaLabel}>Quotation Status</span><span style={statusValue}>{status}</span></div>
        <div style={metaCard}><span style={metaLabel}>Valid Until</span><span style={metaValue}>{formatDateDisplay(validUntil)}</span></div>
        <div style={metaCard}><span style={metaLabel}>Prepared By</span><span style={metaValue}>Spiral Wood Services</span></div>
      </div>

      {isReadOnly && (
        <div style={lockedBanner}>
          {isApproved
            ? "This quotation is customer-approved. All estimate sections are locked."
            : "This quotation was sent to the customer. Editing is locked while waiting for the customer decision."}
        </div>
      )}

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={sectionHeaderSmall}>
          <h3 style={sectionTitle}>Customer Request</h3>
          <p style={helperText}>
            Review the order request, design specifications, messages, and reference files before preparing the quotation.
          </p>
        </div>
        <div style={{ padding: 20 }}>
          <div style={requestGrid}>
            <div style={requestInfoCard}>
              <span style={metaLabel}>Order Overview</span>
              <strong>{blueprint.order_number || "No linked order"}</strong>
              {blueprint.order_context?.order_notes && (
                <p style={requestText}>{blueprint.order_context.order_notes}</p>
              )}
              {blueprint.order_context?.delivery_request_notes && (
                <p style={requestText}>
                  Delivery note: {blueprint.order_context.delivery_request_notes}
                </p>
              )}
              {!blueprint.order_context?.order_notes &&
                !blueprint.order_context?.delivery_request_notes && (
                  <p style={mutedText}>No order notes recorded.</p>
                )}
            </div>
            <div style={requestInfoCard}>
              <span style={metaLabel}>Design Specifications</span>
              {customizationEntries.length ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {customizationEntries.map((entry, index) => (
                    <div key={`${entry.label}-${index}`} style={detailRow}>
                      <span>{entry.label}</span><strong>{entry.value}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={mutedText}>No structured customization details recorded.</p>
              )}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ ...metaLabel, marginBottom: 8 }}>Customer Messages</div>
            {discussionLoading ? (
              <p style={mutedText}>Loading customer discussion...</p>
            ) : customerMessages.length ? (
              <div style={messageList}>
                {customerMessages.map((entry) => (
                  <div key={entry.id} style={messageCard}>
                    <div style={{ fontWeight: 700 }}>{entry.message || "Attachment uploaded."}</div>
                    <div style={{ fontSize: 11, color: "#71717a", marginTop: 5 }}>
                      {formatDateTime(entry.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={mutedText}>No customer discussion messages recorded.</p>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ ...metaLabel, marginBottom: 8 }}>Customer References</div>
            {referenceFiles.length ? (
              <div style={attachmentGrid}>
                {referenceFiles.map((file) => {
                  const href = resolveAttachmentUrl(file.file_url || file.url);
                  return (
                    <a key={file.id || href} href={href} target="_blank" rel="noreferrer" style={attachmentCard}>
                      {isImageAttachment(file) ? (
                        <img src={href} alt={file.file_name || "Reference"} style={attachmentImage} />
                      ) : (
                        <div style={filePlaceholder}>FILE</div>
                      )}
                      <div style={attachmentLabel}>{file.file_name || "Reference file"}</div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p style={mutedText}>No reference files available.</p>
            )}
          </div>
        </div>
      </div>

      <ProductionSnapshotPanel snapshot={productionSnapshot} />

      <EstimateTable
        title="Blueprint Components"
        helper="Generated from the latest blueprint design. Confirm each component, quantity, unit rate, and note."
        section="blueprint"
        rows={blueprintItems}
        rawMaterials={rawMaterials}
        readOnly={isReadOnly}
        onRemove={removeItem}
        onUpdate={updateItem}
        subtotal={blueprintSubtotal}
      />

      <EstimateTable
        title="Required Inventory Materials"
        helper="Select the materials required for production. Available stock excludes quantities already reserved for paid blueprint orders. Saving this estimate does not reserve or deduct stock."
        section="inventory"
        rows={inventoryItems}
        rawMaterials={rawMaterials}
        readOnly={isReadOnly}
        onAdd={addInventoryItem}
        onRemove={removeItem}
        onUpdate={updateItem}
        subtotal={inventorySubtotal}
        inventoryTrackingOnly={inventoryTrackingOnly}
      />

      <EstimateTable
        title="Additional Items"
        helper="Add billable custom work, special materials, and customer-requested changes that are not included in the blueprint components."
        section="other"
        rows={otherItems}
        rawMaterials={rawMaterials}
        readOnly={isReadOnly}
        onAdd={addOtherItem}
        onRemove={removeItem}
        onUpdate={updateItem}
        subtotal={otherSubtotal}
      />

      <div style={chargesGrid}>
        <div style={card}>
          <div style={sectionHeaderSmall}>
            <h3 style={sectionTitle}>Quotation Details</h3>
            <p style={helperText}>Enter the service charges, adjustments, tax, and quotation notes.</p>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelSm}>Labor Cost (₱)</label>
              <input type="number" min="0" step="0.01" value={costs.labor_cost} onChange={(event) => !isReadOnly && setCosts((current) => ({ ...current, labor_cost: event.target.value }))} style={{ ...inputFull, ...readOnlyFieldStyle(isReadOnly) }} disabled={isReadOnly} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelSm}>Logistics Cost (₱)</label>
              <input type="number" min="0" step="0.01" value={costs.overhead_cost} onChange={(event) => !isReadOnly && setCosts((current) => ({ ...current, overhead_cost: event.target.value }))} style={{ ...inputFull, ...readOnlyFieldStyle(isReadOnly) }} disabled={isReadOnly} />
            </div>
            <div style={dualFieldGrid}>
              <div>
                <label style={labelSm}>Discount (%)</label>
                <input type="number" min="0" max="100" step="0.01" value={costs.discount} onChange={(event) => !isReadOnly && setCosts((current) => ({ ...current, discount: event.target.value }))} style={{ ...inputFull, ...readOnlyFieldStyle(isReadOnly) }} disabled={isReadOnly} />
              </div>
              <div>
                <label style={labelSm}>VAT (%)</label>
                <input type="number" min="0" max="100" step="0.01" value={costs.tax_rate} onChange={(event) => !isReadOnly && setCosts((current) => ({ ...current, tax_rate: event.target.value }))} style={{ ...inputFull, ...readOnlyFieldStyle(isReadOnly) }} disabled={isReadOnly} />
              </div>
            </div>
            <div>
              <label style={labelSm}>Quotation Notes</label>
              <textarea value={costs.notes} onChange={(event) => !isReadOnly && setCosts((current) => ({ ...current, notes: event.target.value.slice(0, 500) }))} rows={5} style={{ ...inputFull, ...readOnlyFieldStyle(isReadOnly), resize: "vertical" }} maxLength={500} disabled={isReadOnly} placeholder="Add terms, inclusions, exclusions, or delivery notes..." />
            </div>
          </div>
        </div>

        <div style={{ ...card, alignSelf: "start" }}>
          <div style={sectionHeaderSmall}>
            <h3 style={sectionTitle}>Quotation Summary</h3>
            <p style={helperText}>Confirm the quotation breakdown before saving or sending it to the customer.</p>
          </div>
          <div style={{ padding: 24 }}>
            {[
              ["Blueprint Components", blueprintSubtotal],
              ...(!inventoryTrackingOnly
                ? [["Required Inventory Materials", inventorySubtotal]]
                : []),
              ["Additional Items", otherSubtotal],
              ["Labor", laborCost],
              ["Logistics", logisticsCost],
              ...(additionalDeliveryFee > 0
                ? [["Additional Delivery Fee", additionalDeliveryFee]]
                : []),
            ].map(([label, value]) => (
              <div key={label} style={summaryRow}>
                <span style={summaryLabel}>{label}</span>
                <strong>{formatMoney(value)}</strong>
              </div>
            ))}
            {inventoryTrackingOnly && (
              <div style={{ ...summaryRow, alignItems: "flex-start" }}>
                <span style={summaryLabel}>Required Inventory</span>
                <strong style={{ textAlign: "right", maxWidth: 190 }}>
                  {inventoryItems.length
                    ? `${inventoryItems.length} tracked material${inventoryItems.length === 1 ? "" : "s"} — not charged again`
                    : "None added"}
                </strong>
              </div>
            )}
            <div style={{ borderTop: "1px solid #e4e4e7", margin: "16px 0" }} />
            <div style={summaryRow}><strong>Subtotal</strong><strong>{formatMoney(subtotal)}</strong></div>
            {discountRate > 0 && (
              <div style={summaryRow}><span style={{ ...summaryLabel, color: "#dc2626" }}>Discount ({discountRate}%)</span><strong style={{ color: "#dc2626" }}>({formatMoney(discountAmount)})</strong></div>
            )}
            <div style={summaryRow}><span style={summaryLabel}>VAT ({costs.tax_rate}%)</span><strong>{formatMoney(taxAmount)}</strong></div>
            <div style={grandTotalBox}><span>Total Quotation</span><strong>{formatMoney(grandTotal)}</strong></div>
            {estimation && (
              <div style={savedInfo}>
                Last saved {formatDateDisplay(estimation.updated_at || estimation.created_at)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const pageShell = {
  maxWidth: 1240,
  margin: "0 auto",
  padding: "0 0 48px",
};

const card = {
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e4e4e7",
  boxShadow: "0 8px 24px rgba(24,24,27,.04)",
  overflow: "hidden",
};

const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 300,
  color: "#71717a",
  fontSize: 14,
  fontWeight: 650,
};

const pageHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 20,
  marginBottom: 16,
  padding: "20px 22px",
  flexWrap: "wrap",
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  boxShadow: "0 8px 24px rgba(24,24,27,.04)",
};

const titleBlock = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  minWidth: 280,
  flex: "1 1 480px",
};

const pageTitle = {
  fontSize: 25,
  fontWeight: 850,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.025em",
  lineHeight: 1.2,
};

const pageSubTitle = {
  fontSize: 12,
  color: "#71717a",
  margin: "7px 0 0",
  lineHeight: 1.5,
};

const headerActions = {
  marginLeft: "auto",
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const metaGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginBottom: 20,
};

const metaCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "15px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 7,
  minHeight: 64,
  boxShadow: "0 1px 2px rgba(24,24,27,.03)",
};

const metaLabel = {
  fontSize: 9,
  fontWeight: 850,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

const metaValue = {
  fontSize: 15,
  fontWeight: 800,
  color: "#18181b",
};

const statusValue = {
  ...metaValue,
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  padding: "5px 9px",
  borderRadius: 999,
  background: "#f4f4f5",
  border: "1px solid #e4e4e7",
  fontSize: 12,
};

const lockedBanner = {
  marginBottom: 20,
  padding: "13px 16px",
  borderRadius: 12,
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#78350f",
  fontSize: 12,
  fontWeight: 650,
  lineHeight: 1.5,
};

const sectionHeader = {
  padding: "18px 22px",
  borderBottom: "1px solid #e4e4e7",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 14,
  background: "#fff",
};

const sectionHeaderSmall = {
  padding: "17px 22px",
  borderBottom: "1px solid #e4e4e7",
  background: "#fff",
};

const sectionTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 850,
  color: "#18181b",
  letterSpacing: "-0.01em",
};

const helperText = {
  margin: "6px 0 0",
  fontSize: 11,
  color: "#71717a",
  lineHeight: 1.55,
  maxWidth: 760,
};

const productionSnapshotCard = {
  ...card,
  marginBottom: 20,
  overflow: "hidden",
};

const productionSnapshotHeader = {
  padding: "20px 22px",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 20,
  flexWrap: "wrap",
  borderBottom: "1px solid #e4e4e7",
  background: "#fff",
};

const productionEyebrow = {
  fontSize: 9,
  fontWeight: 900,
  color: "#52525b",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
};

const productionStatus = {
  minWidth: 126,
  padding: "10px 12px",
  display: "grid",
  gap: 3,
  textAlign: "right",
  borderRadius: 0,
};

const productionStatusReady = {
  background: "#ecfdf5",
  color: "#166534",
  borderLeft: "3px solid #22c55e",
};

const productionStatusReview = {
  background: "#fff7ed",
  color: "#9a3412",
  borderLeft: "3px solid #f97316",
};

const productionStatusLabel = {
  fontSize: 8,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  opacity: 0.78,
};

const productionSummaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: 0,
  borderBottom: "1px solid #e4e4e7",
  background: "#fafafa",
};

const productionMetricCard = {
  minHeight: 72,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: 8,
  borderRight: "1px solid #e4e4e7",
  background: "#fafafa",
};

const productionMetricLabel = {
  fontSize: 8,
  fontWeight: 900,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

const productionMetricValue = {
  fontSize: 20,
  lineHeight: 1,
  color: "#18181b",
};

const productionGuide = {
  margin: "16px 18px 0",
  padding: "12px 14px",
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  fontSize: 11,
  lineHeight: 1.5,
  color: "#3f3f46",
  background: "#f4f4f5",
  borderLeft: "3px solid #18181b",
};

const productionReviewNotice = {
  margin: "16px 18px 0",
  padding: "11px 13px",
  fontSize: 11,
  fontWeight: 700,
  color: "#9a3412",
  background: "#fff7ed",
  borderLeft: "3px solid #f97316",
};

const productionEmpty = {
  padding: 28,
  color: "#71717a",
  textAlign: "center",
  fontSize: 12,
  lineHeight: 1.6,
  background: "#fcfcfd",
};

const productionTable = {
  width: "100%",
  minWidth: 1040,
  marginTop: 16,
  borderCollapse: "separate",
  borderSpacing: 0,
  tableLayout: "fixed",
  fontSize: 11,
};

const productionTableHead = {
  background: "#18181b",
};

const productionTh = {
  padding: "11px 12px",
  textAlign: "left",
  color: "#fff",
  fontSize: 8,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  borderRight: "1px solid #3f3f46",
};

const productionRow = {
  background: "#fff",
};

const productionTd = {
  padding: "12px",
  verticalAlign: "top",
  borderBottom: "1px solid #e4e4e7",
  color: "#27272a",
  lineHeight: 1.45,
};

const productionPartCode = {
  fontSize: 10,
  fontWeight: 900,
  color: "#18181b",
  letterSpacing: "0.04em",
};

const productionPartName = {
  marginTop: 3,
  fontSize: 11,
  fontWeight: 700,
  color: "#3f3f46",
};

const productionPartReview = {
  marginTop: 6,
  fontSize: 9,
  fontWeight: 750,
  color: "#c2410c",
};

const productionMono = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 10,
  fontWeight: 700,
  color: "#18181b",
};

const productionSecondary = {
  marginTop: 4,
  fontSize: 9,
  color: "#71717a",
  lineHeight: 1.4,
};

const productionTagWrap = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
  marginBottom: 7,
};

const productionTag = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  padding: "4px 7px",
  background: "#f4f4f5",
  color: "#3f3f46",
  fontSize: 8,
  fontWeight: 800,
  borderRadius: 0,
};

const productionDetailList = {
  display: "grid",
  gap: 3,
  fontSize: 9,
  color: "#52525b",
  lineHeight: 1.45,
};

const productionFooterNote = {
  padding: "12px 18px 16px",
  color: "#71717a",
  fontSize: 9,
  lineHeight: 1.5,
  background: "#fff",
};

const estimateTableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 12,
  tableLayout: "fixed",
  minWidth: 1040,
};

const tableHeadRow = {
  background: "#f8f8fa",
};

const tableFooterRow = {
  background: "#fafafa",
  borderTop: "2px solid #e4e4e7",
};

const th = {
  textAlign: "left",
  padding: "12px 11px",
  fontSize: 9,
  fontWeight: 850,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.11em",
  borderBottom: "1px solid #e4e4e7",
  whiteSpace: "nowrap",
};

const td = {
  padding: "11px",
  color: "#27272a",
  verticalAlign: "middle",
  background: "#fff",
};

const emptyCell = {
  ...td,
  padding: 34,
  textAlign: "center",
  color: "#71717a",
  background: "#fcfcfd",
};

const cellInput = {
  minHeight: 38,
  padding: "8px 10px",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  fontSize: 12,
  color: "#18181b",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const inputFull = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 9,
  fontSize: 13,
  color: "#18181b",
  background: "#fff",
  boxSizing: "border-box",
  outline: "none",
};

const readOnlyFieldStyle = (locked) =>
  locked
    ? {
        background: "#f4f4f5",
        color: "#71717a",
        cursor: "not-allowed",
      }
    : {};

const labelSm = {
  fontSize: 12,
  fontWeight: 800,
  color: "#27272a",
  display: "block",
  marginBottom: 7,
};

const chargesGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 20,
  alignItems: "start",
};

const dualFieldGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
  marginBottom: 16,
};

const summaryRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "9px 0",
  gap: 16,
};

const summaryLabel = {
  color: "#71717a",
  fontSize: 12,
  fontWeight: 650,
};

const grandTotalBox = {
  marginTop: 18,
  background: "#18181b",
  borderRadius: 12,
  padding: "18px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  color: "#fff",
  fontSize: 18,
  fontWeight: 800,
};

const savedInfo = {
  marginTop: 14,
  padding: "10px 12px",
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 9,
  fontSize: 11,
  color: "#71717a",
  textAlign: "center",
};

const requestGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 14,
};

const requestInfoCard = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 96,
  background: "#fcfcfd",
};

const requestText = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.55,
  color: "#3f3f46",
};

const mutedText = {
  margin: 0,
  fontSize: 11,
  color: "#71717a",
  lineHeight: 1.5,
};

const detailRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexWrap: "wrap",
  gap: 10,
  paddingBottom: 6,
  borderBottom: "1px solid #f0f0f2",
  fontSize: 11,
  color: "#52525b",
};

const messageList = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const messageCard = {
  padding: 13,
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  background: "#fafafa",
  fontSize: 12,
  lineHeight: 1.45,
};

const attachmentGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: 12,
};

const attachmentCard = {
  display: "block",
  textDecoration: "none",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  overflow: "hidden",
  background: "#fff",
  boxShadow: "0 1px 2px rgba(24,24,27,.03)",
};

const attachmentImage = {
  width: "100%",
  height: 118,
  objectFit: "cover",
  display: "block",
  background: "#f4f4f5",
};

const filePlaceholder = {
  height: 118,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f4f5",
  fontWeight: 850,
  color: "#71717a",
};

const attachmentLabel = {
  padding: "9px 10px",
  fontSize: 11,
  fontWeight: 750,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const btnPrimary = {
  minHeight: 38,
  padding: "9px 16px",
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const btnGhost = {
  minHeight: 38,
  padding: "9px 14px",
  background: "#f4f4f5",
  color: "#27272a",
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 750,
  whiteSpace: "nowrap",
};

const btnBack = {
  minWidth: 72,
  padding: "8px 11px",
  background: "#f4f4f5",
  color: "#52525b",
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 750,
};

const btnAdd = {
  minHeight: 36,
  padding: "8px 13px",
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const btnRemove = {
  width: 32,
  height: 32,
  padding: 0,
  background: "#fef2f2",
  color: "#b91c1c",
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
};

const btnDisabled = {
  opacity: 0.5,
  cursor: "not-allowed",
};
