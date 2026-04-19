// src/pages/blueprints/EstimationPage.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BLANK_ITEM = {
  name: "",
  quantity: 1,
  unit: "pc",
  unit_cost: "",
  note: "",
  source_key: "",
  source_type: "manual",
};

const MATERIAL_TABLE_COLUMNS = [
  { label: "#", width: "5%" },
  { label: "Description", width: "26%" },
  { label: "Unit", width: "9%" },
  { label: "Qty", width: "10%" },
  { label: "Rate (₱)", width: "13%" },
  { label: "Amount (₱)", width: "13%" },
  { label: "Remarks", width: "19%" },
  { label: "", width: "5%" },
];

const formatMoney = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normalizeText = (value = "") =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const getBlueprintDisplayTitle = (blueprint = {}) =>
  normalizeText(blueprint?.title) || "Untitled Blueprint";

const getCustomerDisplayName = (blueprint = {}) =>
  normalizeText(
    blueprint?.client_name ||
      blueprint?.customer_name ||
      blueprint?.client?.name ||
      blueprint?.customer?.name ||
      blueprint?.walkin_customer_name ||
      "",
  ) || "Unassigned";

const formatDateDisplay = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getValidUntilDate = (value, days = 30) => {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return new Date();

  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
};

const formatEstimateStatus = (value = "") => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "Draft";

  return raw.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const isApprovedEstimateStatus = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase() === "approved";

const isSentEstimateStatus = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase() === "sent";

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
  "oak-natural": 1.0,
  "pine-light": 0.92,
  "maple-cream": 1.08,
  "beech-honey": 1.05,
  "walnut-dark": 1.22,
  "mahogany-rich": 1.18,
  "teak-golden": 1.28,
  "ash-beige": 1.1,
};

const getWoodFinishMultiplier = (comp = {}) => {
  const finishId = String(comp?.finish || "").trim();

  if (finishId && WOOD_FINISH_PRICE_MAP[finishId]) {
    return Number(WOOD_FINISH_PRICE_MAP[finishId]) || 1;
  }

  const material = String(comp?.material || "").toLowerCase();

  if (material.includes("pine")) return 0.92;
  if (material.includes("oak")) return 1.0;
  if (material.includes("maple")) return 1.08;
  if (material.includes("beech")) return 1.05;
  if (material.includes("walnut")) return 1.22;
  if (material.includes("mahogany")) return 1.18;
  if (material.includes("teak")) return 1.28;
  if (material.includes("ash")) return 1.1;

  return 1;
};

const getWoodFinishLabel = (comp = {}) => {
  const finishId = String(comp?.finish || "").trim();
  return WOOD_FINISH_LABEL_MAP[finishId] || "";
};

const getMaterialDisplayName = (comp = {}) => {
  const finishLabel = getWoodFinishLabel(comp);
  const material = String(comp?.material || "—").trim() || "—";
  return finishLabel ? `${finishLabel} / ${material}` : material;
};

const isAreaUnit = (unit = "") =>
  ["sq.m", "sqm", "m²", "m2"].includes(String(unit).trim().toLowerCase());

const getItemAmount = (item = {}) =>
  (Number(item.quantity || 0) || 0) * (Number(item.unit_cost || 0) || 0);

const LABOR_LIKE_ROW_RE =
  /\b(labor|fabrication|assembly|installation|install|carpentry|service)\b/i;

const isLaborLikeItem = (item = {}) =>
  LABOR_LIKE_ROW_RE.test(`${item?.name || ""} ${item?.note || ""}`);

const normalizeItem = (raw = {}) => {
  const unit = raw.unit || "pc";
  const numericQty = Number(raw.quantity ?? raw.qty ?? 1) || 0;

  return {
    name: normalizeText(raw.name || raw.description || raw.label || ""),
    quantity: isAreaUnit(unit)
      ? Number(Math.max(0.0001, numericQty || 0.0001).toFixed(4))
      : Math.max(1, Math.round(numericQty || 1)),
    unit,
    unit_cost:
      Number(
        raw.unit_cost ?? raw.unitCost ?? raw.unit_price ?? raw.unitPrice ?? 0,
      ) || 0,
    note: normalizeText(raw.note || ""),
    source_key: raw.source_key ?? raw.sourceKey ?? "",
    source_type: raw.source_type ?? raw.sourceType ?? "",
  };
};

const isFilledEstimateRow = (item = {}) => {
  const normalized = normalizeItem(item);
  return Boolean(
    normalizeText(normalized.name) ||
    normalizeText(normalized.note) ||
    Number(normalized.unit_cost || 0) > 0,
  );
};

const NUMBERED_SUFFIX_RE = /^(.*?)(?:\s+#?\d+)(\s*\([^)]*\))?$/i;

const getCondenseNameInfo = (name = "") => {
  const cleaned = normalizeText(name);
  if (!cleaned) {
    return {
      canGroup: false,
      baseLabel: "",
      normalizedKey: "",
    };
  }

  const match = cleaned.match(NUMBERED_SUFFIX_RE);
  if (!match) {
    return {
      canGroup: false,
      baseLabel: cleaned,
      normalizedKey: cleaned.toLowerCase(),
    };
  }

  const base = normalizeText(match[1] || "");
  const suffix = normalizeText(match[2] || "");
  const baseLabel = normalizeText(`${base}${suffix ? ` ${suffix}` : ""}`);

  return {
    canGroup: Boolean(base),
    baseLabel,
    normalizedKey: baseLabel.toLowerCase(),
  };
};

const pluralizeEstimateLabel = (label = "", qty = 1) => {
  if (qty <= 1) return label;

  const cleaned = normalizeText(label);
  if (!cleaned) return label;

  const match = cleaned.match(/^(.*?)(\s*\([^)]*\))?$/);
  const core = normalizeText(match?.[1] || cleaned);
  const suffix = match?.[2] || "";

  let pluralCore = core;

  if (/s$/i.test(core)) {
    pluralCore = core;
  } else if (/y$/i.test(core) && !/[aeiou]y$/i.test(core)) {
    pluralCore = `${core.slice(0, -1)}ies`;
  } else {
    pluralCore = `${core}s`;
  }

  return `${pluralCore}${suffix}`;
};

const condenseAutoGeneratedItems = (rows = []) => {
  const groupedMap = new Map();
  const orderedRows = [];

  rows.forEach((rawRow) => {
    const row = normalizeItem(rawRow);

    if (!isFilledEstimateRow(row)) return;

    const { canGroup, baseLabel, normalizedKey } = getCondenseNameInfo(
      row.name,
    );

    if (!canGroup) {
      orderedRows.push(row);
      return;
    }

    const key = [
      normalizedKey,
      normalizeText(row.unit).toLowerCase(),
      Number(row.unit_cost || 0).toFixed(2),
      normalizeText(row.note).toLowerCase(),
      normalizeText(row.source_type || "").toLowerCase(),
    ].join("|");

    if (!groupedMap.has(key)) {
      const seed = {
        ...row,
        name: baseLabel,
        quantity: 0,
        source_key: `group:${key}`,
        source_type: row.source_type || "component",
      };

      groupedMap.set(key, seed);
      orderedRows.push(seed);
    }

    const target = groupedMap.get(key);
    const nextQty = Number(target.quantity || 0) + Number(row.quantity || 0);

    target.quantity = isAreaUnit(row.unit)
      ? Number(nextQty.toFixed(4))
      : Math.max(1, Math.round(nextQty));
  });

  return orderedRows.map((row) => {
    const qty = Number(row.quantity || 0);
    return normalizeItem({
      ...row,
      name: qty > 1 ? pluralizeEstimateLabel(row.name, qty) : row.name,
    });
  });
};

const splitEstimationItems = (rows = []) => {
  const result = {
    materialItems: [],
    laborRowsTotal: 0,
  };

  rows.forEach((row) => {
    const normalized = normalizeItem(row);

    if (!isFilledEstimateRow(normalized)) return;

    if (isLaborLikeItem(normalized)) {
      result.laborRowsTotal += getItemAmount(normalized);
      return;
    }

    result.materialItems.push(normalized);
  });

  return result;
};

const getDraftRows = (draft = {}) => {
  if (Array.isArray(draft?.rows)) return draft.rows;
  if (Array.isArray(draft?.lineItems)) return draft.lineItems;
  if (Array.isArray(draft?.line_items)) return draft.line_items;
  return [];
};

const getComponentVolume = (comp = {}) =>
  Math.max(1, Number(comp?.width) || 0) *
  Math.max(1, Number(comp?.height) || 0) *
  Math.max(1, Number(comp?.depth) || 0);

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

const CUTLIST_PIECE_RATE_MAP = {
  cabinet_body: 2800,
  other: 1200,
};

const getMaterialRateKey = (material = "") => {
  const value = String(material || "").toLowerCase();

  if (value.includes("pine")) return "pine";
  if (value.includes("oak")) return "oak";
  if (value.includes("maple")) return "maple";
  if (value.includes("beech")) return "beech";
  if (value.includes("walnut")) return "walnut";
  if (value.includes("mahogany")) return "mahogany";
  if (value.includes("teak")) return "teak";
  if (value.includes("ash")) return "ash";

  return "default";
};

const getDefaultCutListUnitCost = (row = {}) => {
  const estimationUnit = String(row?.estimationUnit || "").toLowerCase();
  const cutListType = String(row?.cutListType || "").toLowerCase();
  const materialRateKey = getMaterialRateKey(row?.material);
  const areaRate =
    MATERIAL_AREA_RATE_MAP[materialRateKey] || MATERIAL_AREA_RATE_MAP.default;

  if (estimationUnit === "panel_area") {
    return Number(areaRate.toFixed(2));
  }

  if (cutListType === "cabinet_body") {
    const basePieceRate =
      CUTLIST_PIECE_RATE_MAP.cabinet_body || CUTLIST_PIECE_RATE_MAP.other;

    const widthFactor = Math.max(
      0.85,
      Math.min(1.35, (Number(row?.widthMm) || 600) / 600),
    );
    const heightFactor = Math.max(
      0.85,
      Math.min(1.35, (Number(row?.heightMm) || 720) / 720),
    );
    const depthFactor = Math.max(
      0.85,
      Math.min(1.25, (Number(row?.depthMm) || 500) / 500),
    );

    const materialFactor = areaRate / MATERIAL_AREA_RATE_MAP.default;

    return Number(
      (
        basePieceRate *
        widthFactor *
        heightFactor *
        depthFactor *
        materialFactor
      ).toFixed(2),
    );
  }

  return Number(
    (
      (CUTLIST_PIECE_RATE_MAP.other || 1200) *
      (areaRate / MATERIAL_AREA_RATE_MAP.default)
    ).toFixed(2),
  );
};

const getRecoveredGroupUnitPrice = (comp = {}) => {
  const explicit = Number(comp?.groupUnitPrice) || 0;
  if (explicit > 0) return explicit;

  const templateType = String(comp?.templateType || "").trim();
  if (templateType && TEMPLATE_GROUP_PRICE_MAP[templateType]) {
    return Number(TEMPLATE_GROUP_PRICE_MAP[templateType]) || 0;
  }

  const type = String(comp?.type || "").toLowerCase();
  const matchedPrefix = Object.keys(PART_PREFIX_GROUP_PRICE_MAP).find(
    (prefix) => type.startsWith(prefix),
  );
  if (matchedPrefix) {
    return Number(PART_PREFIX_GROUP_PRICE_MAP[matchedPrefix]) || 0;
  }

  const label = String(comp?.groupLabel || comp?.label || "").toLowerCase();
  if (label.includes("dining table"))
    return TEMPLATE_GROUP_PRICE_MAP.template_dining_table;
  if (label.includes("bed")) return TEMPLATE_GROUP_PRICE_MAP.template_bed_frame;
  if (label.includes("wardrobe"))
    return TEMPLATE_GROUP_PRICE_MAP.template_wardrobe;
  if (label.includes("coffee table"))
    return TEMPLATE_GROUP_PRICE_MAP.template_coffee_table;

  return 0;
};

const getComponentSurfaceAreaSqM = (width = 0, height = 0, depth = 0) => {
  const w = Math.max(1, Number(width) || 0);
  const h = Math.max(1, Number(height) || 0);
  const d = Math.max(1, Number(depth) || 0);

  return (2 * (w * h + w * d + h * d)) / 1000000;
};

const getComponentFloorPrice = (comp = {}) => {
  const hint = `${comp?.label || ""} ${comp?.name || ""} ${comp?.type || ""}`
    .toLowerCase()
    .trim();

  if (/(leg|post|support|foot|base)/i.test(hint)) return 650;
  if (/(top|tabletop|panel|shelf|door|drawer)/i.test(hint)) return 1200;
  if (/(apron|rail|brace|stretcher)/i.test(hint)) return 450;

  return 350;
};

const getResolvedUnitPrice = (comp = {}, allComponents = []) => {
  const multiplier = getWoodFinishMultiplier(comp);

  const direct = Number(comp?.unitPrice) || 0;
  if (direct > 0) {
    return Number((direct * multiplier).toFixed(2));
  }

  const groupUnitPrice = getRecoveredGroupUnitPrice(comp);
  if (comp?.groupId && groupUnitPrice > 0) {
    const volume = getComponentVolume(comp);
    const groupItems = allComponents.filter((c) => c.groupId === comp.groupId);
    const totalVolume = groupItems.reduce(
      (sum, c) => sum + getComponentVolume(c),
      0,
    );

    if (volume && totalVolume) {
      const allocatedBase = groupUnitPrice * (volume / totalVolume);
      return Number((allocatedBase * multiplier).toFixed(2));
    }
  }

  const width = Math.max(1, Number(comp?.width) || 0);
  const height = Math.max(1, Number(comp?.height) || 0);
  const depth = Math.max(1, Number(comp?.depth) || 18);

  const materialRateKey = getMaterialRateKey(comp?.material);
  const areaRate =
    MATERIAL_AREA_RATE_MAP[materialRateKey] || MATERIAL_AREA_RATE_MAP.default;

  const thicknessMm = Math.max(12, Math.min(width, height, depth));
  const thicknessFactor = Math.max(0.9, Math.min(1.8, thicknessMm / 25));

  const surfaceAreaSqM = Math.max(
    getComponentSurfaceAreaSqM(width, height, depth),
    0.08,
  );

  const floorPrice = getComponentFloorPrice(comp);

  const fallbackBase = Math.max(
    floorPrice,
    surfaceAreaSqM * areaRate * thicknessFactor,
  );

  return Number((fallbackBase * multiplier).toFixed(2));
};

const buildAutoItemsFromComponents = (components = []) =>
  condenseAutoGeneratedItems(
    components.map((c) => {
      const finishLabel = getWoodFinishLabel(c);
      const materialLabel = getMaterialDisplayName(c);

      return normalizeItem({
        name: `${c.label || "Component"}${finishLabel ? ` (${finishLabel})` : ""}`,
        quantity: Number(c.qty) || 1,
        unit: "pc",
        unit_cost: getResolvedUnitPrice(c, components),
        note: `${materialLabel} · ${c.width || 0}×${c.height || 0}×${c.depth || 0} mm`,
        source_key: `component:${c.id || c.partCode || c.label || ""}`,
        source_type: "component",
      });
    }),
  );

const buildAutoItemsFromCutListRows = (rows = []) =>
  condenseAutoGeneratedItems(
    rows.map((row) => {
      const useAreaUnit =
        String(row?.estimationUnit || "").toLowerCase() === "panel_area";

      const quantity = useAreaUnit
        ? Number(Number(row?.totalAreaSqM || 0).toFixed(4)) || 0.0001
        : Math.max(1, Number(row?.qty || 1) || 1);

      const unit = useAreaUnit ? "sq.m" : "pc";

      const name =
        row?.sampleLabel ||
        [row?.partFamily || "Part", row?.partRole || "Item"]
          .filter(Boolean)
          .join(" / ");

      const noteParts = [
        row?.material || "—",
        row?.cutListType || "—",
        row?.widthMm && row?.heightMm && row?.depthMm
          ? `${row.widthMm}×${row.heightMm}×${row.depthMm} mm`
          : null,
        row?.thicknessMm ? `${row.thicknessMm} mm thick` : null,
        row?.qty ? `${row.qty} part${Number(row.qty) > 1 ? "s" : ""}` : null,
        useAreaUnit && row?.totalAreaSqM
          ? `${Number(row.totalAreaSqM).toFixed(4)} sq.m total`
          : null,
        !useAreaUnit && row?.totalVolumeCuM
          ? `${Number(row.totalVolumeCuM).toFixed(4)} cu.m total`
          : null,
      ].filter(Boolean);

      return normalizeItem({
        name,
        quantity,
        unit,
        unit_cost: getDefaultCutListUnitCost(row),
        note: noteParts.join(" · "),
        source_key:
          row?.id ||
          `cutrow:${[
            row?.partFamily || "",
            row?.partRole || "",
            row?.material || "",
            row?.widthMm || 0,
            row?.heightMm || 0,
            row?.depthMm || 0,
            row?.thicknessMm || 0,
          ].join("|")}`,
        source_type: "cutlist",
      });
    }),
  );

const parseBlueprintDesignData = (blueprint = {}) => {
  try {
    return typeof blueprint?.design_data === "string"
      ? JSON.parse(blueprint.design_data || "{}")
      : blueprint?.design_data || {};
  } catch {
    return {};
  }
};

const buildPreferredAutoItems = (design = {}) => {
  if (
    Array.isArray(design?.conversionCutListRows) &&
    design.conversionCutListRows.length
  ) {
    return buildAutoItemsFromCutListRows(design.conversionCutListRows);
  }

  return buildAutoItemsFromComponents(design?.components || []);
};

const getItemMergeKey = (item = {}) => {
  if (item?.source_key) return String(item.source_key);
  return [
    normalizeText(item?.name || "").toLowerCase(),
    normalizeText(item?.unit || "").toLowerCase(),
    normalizeText(item?.note || "").toLowerCase(),
  ].join("|");
};

const normalizeEstimateNameKey = (value = "") => {
  const cleaned = normalizeText(value);
  if (!cleaned) return "";

  const { baseLabel } = getCondenseNameInfo(cleaned);

  let normalized = normalizeText(baseLabel || cleaned)
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .toLowerCase();

  if (/ies$/i.test(normalized)) {
    normalized = normalized.replace(/ies$/i, "y");
  } else if (/s$/i.test(normalized) && !/ss$/i.test(normalized)) {
    normalized = normalized.replace(/s$/i, "");
  }

  return normalized;
};

const normalizeLegacyAutoName = (value = "") => normalizeEstimateNameKey(value);

const isLikelyLegacyAutoDuplicate = (item = {}, autoNameSet = new Set()) => {
  const sourceKey = String(item?.source_key || "").trim();
  const sourceType = String(item?.source_type || "")
    .trim()
    .toLowerCase();

  if (sourceKey || sourceType === "manual") return false;

  const normalizedName = normalizeLegacyAutoName(item?.name || "");
  if (!normalizedName || !autoNameSet.has(normalizedName)) return false;

  return Number(item?.unit_cost || 0) <= 0;
};

const getEstimateLooseKey = (item = {}) => {
  const normalizedName = normalizeLegacyAutoName(item?.name || "");
  const normalizedUnit = normalizeText(item?.unit || "pc").toLowerCase();

  const noteText = normalizeText(item?.note || "");
  const dimensionMatch = noteText.match(
    /\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?/i,
  );

  const dimensionKey = dimensionMatch
    ? dimensionMatch[0].replace(/\s+/g, "").toLowerCase()
    : "";

  return [normalizedName, normalizedUnit, dimensionKey].join("|");
};

const removeZeroCostDuplicateRows = (rows = []) => {
  const positiveRowMap = new Map();

  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map(normalizeItem)
    .filter(isFilledEstimateRow);

  normalizedRows.forEach((row) => {
    const looseKey = getEstimateLooseKey(row);
    const unitCost = Number(row.unit_cost || 0) || 0;

    if (!looseKey || unitCost <= 0) return;

    const existing = positiveRowMap.get(looseKey);
    if (!existing || unitCost > existing.unit_cost) {
      positiveRowMap.set(looseKey, {
        unit_cost: unitCost,
      });
    }
  });

  return normalizedRows.filter((row) => {
    const looseKey = getEstimateLooseKey(row);
    const unitCost = Number(row.unit_cost || 0) || 0;

    if (!looseKey) return true;
    if (unitCost > 0) return true;

    return !positiveRowMap.has(looseKey);
  });
};

const mergeAutoItemsWithExistingPrices = (
  autoItems = [],
  existingItems = [],
) => {
  const existingMap = new Map();

  existingItems.forEach((item) => {
    const key = getItemMergeKey(item);
    if (!key) return;

    existingMap.set(key, {
      unit_cost: Number(item?.unit_cost || 0) || 0,
      quantity: item?.quantity,
      unit: item?.unit,
      note: item?.note,
      name: item?.name,
    });
  });

  return autoItems.map((item) => {
    const match = existingMap.get(getItemMergeKey(item));

    if (!match) return normalizeItem(item);

    const savedUnitCost = Number(match.unit_cost || 0) || 0;

    return normalizeItem({
      ...item,
      name: normalizeText(match.name) || item.name,
      quantity:
        Number(match.quantity || 0) > 0
          ? Number(match.quantity)
          : item.quantity,
      unit: match.unit || item.unit,
      note: normalizeText(match.note) || item.note,
      unit_cost: savedUnitCost > 0 ? savedUnitCost : item.unit_cost,
    });
  });
};

const isAutoGeneratedItem = (item = {}) => {
  const sourceType = String(item?.source_type || "").toLowerCase();
  const sourceKey = String(item?.source_key || "");

  return (
    sourceType === "component" ||
    sourceType === "cutlist" ||
    sourceKey.startsWith("component:") ||
    sourceKey.startsWith("cutrow:") ||
    sourceKey.startsWith("group:")
  );
};

const splitExistingItemsBySource = (items = []) => {
  const autoItems = [];
  const manualItems = [];

  items.forEach((item) => {
    if (isAutoGeneratedItem(item)) {
      autoItems.push(normalizeItem(item));
      return;
    }

    manualItems.push(
      normalizeItem({
        ...item,
        source_type: item?.source_type || "manual",
      }),
    );
  });

  return { autoItems, manualItems };
};

const reconcileEstimateRowsWithBlueprint = (
  rows = [],
  latestBlueprintAutoItems = [],
) => {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizeItem);

  const { autoItems: taggedAutoItems, manualItems: maybeManualItems } =
    splitExistingItemsBySource(normalizedRows);

  const latestAutoLooseKeySet = new Set(
    (Array.isArray(latestBlueprintAutoItems) ? latestBlueprintAutoItems : [])
      .map((item) => getEstimateLooseKey(item))
      .filter(Boolean),
  );

  const recoveredLegacyAutoItems = maybeManualItems.filter((item) => {
    if (!isFilledEstimateRow(item)) return false;

    const looseKey = getEstimateLooseKey(item);
    return Boolean(looseKey) && latestAutoLooseKeySet.has(looseKey);
  });

  const trueManualItems = maybeManualItems.filter((item) => {
    if (!isFilledEstimateRow(item)) return false;

    const looseKey = getEstimateLooseKey(item);
    return !looseKey || !latestAutoLooseKeySet.has(looseKey);
  });

  const mergedAutoItems = latestBlueprintAutoItems.length
    ? mergeAutoItemsWithExistingPrices(latestBlueprintAutoItems, [
        ...taggedAutoItems,
        ...recoveredLegacyAutoItems,
      ])
    : condenseAutoGeneratedItems([
        ...taggedAutoItems,
        ...recoveredLegacyAutoItems,
      ]);

  const latestAutoNameSet = new Set(
    latestBlueprintAutoItems.map((item) =>
      normalizeLegacyAutoName(item?.name || ""),
    ),
  );

  const preservedManualItems = trueManualItems.filter((item) => {
    if (!isFilledEstimateRow(item)) return false;

    return !isLikelyLegacyAutoDuplicate(item, latestAutoNameSet);
  });

  return removeZeroCostDuplicateRows([
    ...mergedAutoItems,
    ...preservedManualItems,
  ]);
};

const getEstimateValidationErrors = ({ items = [], costs = {} } = {}) => {
  const errors = [];
  const normalizedItems = items.map(normalizeItem).filter(isFilledEstimateRow);

  if (!normalizedItems.length) {
    errors.push("Add at least one material row before saving.");
  }

  normalizedItems.forEach((row, index) => {
    if (!normalizeText(row.name)) {
      errors.push(`Row ${index + 1}: Description is required.`);
    }

    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`Row ${index + 1}: Quantity must be greater than 0.`);
    }

    const unitCost = Number(row.unit_cost);
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      errors.push(`Row ${index + 1}: Rate must be greater than 0.`);
    }

    if (normalizeText(row.name).length > 120) {
      errors.push(
        `Row ${index + 1}: Description must not exceed 120 characters.`,
      );
    }

    if (normalizeText(row.note).length > 180) {
      errors.push(`Row ${index + 1}: Remarks must not exceed 180 characters.`);
    }
  });

  const laborCost = Number(costs.labor_cost ?? 0);
  if (!Number.isFinite(laborCost) || laborCost < 0) {
    errors.push("Labor cost cannot be negative.");
  }

  const overheadCost = Number(costs.overhead_cost ?? 0);
  if (!Number.isFinite(overheadCost) || overheadCost < 0) {
    errors.push("Logistics cost cannot be negative.");
  }

  const discountRate = Number(costs.discount ?? 0);
  if (
    !Number.isFinite(discountRate) ||
    discountRate < 0 ||
    discountRate > 100
  ) {
    errors.push("Discount must be between 0% and 100%.");
  }

  const taxRate = Number(costs.tax_rate ?? 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    errors.push("VAT must be between 0% and 100%.");
  }

  return errors;
};

const showFirstValidationError = (errors = []) => {
  if (!errors.length) return false;

  const extra = errors.length > 1 ? ` (+${errors.length - 1} more)` : "";
  toast.error(`${errors[0]}${extra}`);
  return true;
};

export default function EstimationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [blueprint, setBlueprint] = useState(null);
  const [est, setEst] = useState(null);
  const [items, setItems] = useState([{ ...BLANK_ITEM }]);
  const [costs, setCosts] = useState({
    material_cost: 0,
    labor_cost: 0,
    overhead_cost: 0,
    tax_rate: 12,
    discount: 0,
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const parsedDesign = useMemo(
    () => parseBlueprintDesignData(blueprint),
    [blueprint],
  );

  const preferredAutoItems = useMemo(() => {
    return buildPreferredAutoItems(parsedDesign);
  }, [parsedDesign]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [bpRes, estRes] = await Promise.all([
          api.get(`/blueprints/${id}`),
          api.get(`/blueprints/${id}/estimation`).catch(() => ({ data: null })),
        ]);

        setBlueprint(bpRes.data);

        if (estRes.data) {
          setEst(estRes.data);

          const savedItems = Array.isArray(estRes.data.items)
            ? estRes.data.items.map(normalizeItem)
            : [];

          let latestDesign = {};
          try {
            latestDesign =
              typeof bpRes.data.design_data === "string"
                ? JSON.parse(bpRes.data.design_data || "{}")
                : bpRes.data.design_data || {};
          } catch {
            latestDesign = {};
          }

          const latestBlueprintAutoItems =
            buildPreferredAutoItems(latestDesign);

          const groupedSavedItems = reconcileEstimateRowsWithBlueprint(
            savedItems,
            latestBlueprintAutoItems,
          );

          const {
            materialItems: cleanedSavedItems,
            laborRowsTotal: savedLaborRowsTotal,
          } = splitEstimationItems(groupedSavedItems);

          setItems(
            cleanedSavedItems.length ? cleanedSavedItems : [{ ...BLANK_ITEM }],
          );

          const savedLaborField = Number(estRes.data.labor_cost || 0) || 0;

          setCosts({
            material_cost: estRes.data.material_cost || 0,
            labor_cost:
              savedLaborField > 0 ? savedLaborField : savedLaborRowsTotal,
            overhead_cost: estRes.data.overhead_cost || 0,
            tax_rate: estRes.data.tax_rate ?? 12,
            discount: estRes.data.discount || 0,
            notes: estRes.data.notes || "",
          });
          return;
        }

        let design = {};
        try {
          design =
            typeof bpRes.data.design_data === "string"
              ? JSON.parse(bpRes.data.design_data || "{}")
              : bpRes.data.design_data || {};
        } catch {
          design = {};
        }

        const draftFromState = location.state?.estimateDraft;
        let draftFromStorage = null;
        try {
          draftFromStorage = JSON.parse(
            localStorage.getItem("wisdom_estimate_draft") || "null",
          );
        } catch {
          draftFromStorage = null;
        }

        const matchedDraft =
          [draftFromState, draftFromStorage].find((draft) => {
            const draftBlueprintId = String(
              draft?.blueprintId ?? draft?.blueprint_id ?? "",
            );
            return draftBlueprintId === String(id);
          }) || null;

        const draftRows = getDraftRows(matchedDraft);

        const latestBlueprintAutoItems = buildPreferredAutoItems(design);

        if (draftRows.length) {
          const groupedDraftRows = reconcileEstimateRowsWithBlueprint(
            draftRows,
            latestBlueprintAutoItems,
          );

          const {
            materialItems: cleanedDraftItems,
            laborRowsTotal: draftLaborRowsTotal,
          } = splitEstimationItems(groupedDraftRows);

          setItems(
            cleanedDraftItems.length ? cleanedDraftItems : [{ ...BLANK_ITEM }],
          );

          if (draftLaborRowsTotal > 0) {
            setCosts((prev) => ({
              ...prev,
              labor_cost: draftLaborRowsTotal,
            }));
          }
        } else {
          setItems(
            latestBlueprintAutoItems.length
              ? latestBlueprintAutoItems
              : [{ ...BLANK_ITEM }],
          );
        }
      } catch (err) {
        console.error(err);
        toast.error(
          err?.response?.data?.message || "Failed to load estimation.",
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, location.state]);

  const { materialItems, laborRowsTotal } = useMemo(
    () => splitEstimationItems(items),
    [items],
  );

  const materialsSubtotal = materialItems.reduce(
    (sum, it) => sum + getItemAmount(it),
    0,
  );

  const laborFieldCost = Number(costs.labor_cost) || 0;
  const effectiveLaborCost =
    laborFieldCost > 0 ? laborFieldCost : laborRowsTotal;

  const overheadCost = Number(costs.overhead_cost) || 0;
  const subtotal = materialsSubtotal + effectiveLaborCost + overheadCost;

  const discountRate = Math.max(0, Math.min(100, Number(costs.discount) || 0));

  const discountAmount = subtotal * (discountRate / 100);
  const afterDisc = Math.max(0, subtotal - discountAmount);

  const taxAmt = afterDisc * ((Number(costs.tax_rate) || 0) / 100);
  const grandTotal = afterDisc + taxAmt;

  const displayTitle = getBlueprintDisplayTitle(blueprint);
  const customerDisplay = getCustomerDisplayName(blueprint);
  const estimateStatus = formatEstimateStatus(est?.status);
  const isQuoteApproved = isApprovedEstimateStatus(est?.status);
  const isQuoteSent = isSentEstimateStatus(est?.status);
  const isReadOnly = isQuoteApproved || isQuoteSent;
  const preparedBy = "Spiral Wood Services";
  const validUntil = getValidUntilDate(est?.updated_at || est?.created_at);
  const canGenerateContract = isQuoteApproved && Boolean(blueprint?.order_id);

  const readOnlyFieldStyle = isReadOnly ? fieldLocked : {};
  const validationErrors = useMemo(
    () => getEstimateValidationErrors({ items, costs }),
    [items, costs],
  );

  const addItem = () => {
    if (isReadOnly) {
      toast.error("Approved estimates are locked and can no longer be edited.");
      return;
    }

    setItems((prev) => [
      ...prev,
      normalizeItem({
        ...BLANK_ITEM,
        source_key: `manual:${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        source_type: "manual",
      }),
    ]);
  };

  const removeItem = (i) => {
    if (isReadOnly) {
      toast.error("Approved estimates are locked and can no longer be edited.");
      return;
    }

    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateItem = (i, key, val) => {
    if (isReadOnly) return;

    const nextValue =
      key === "name"
        ? String(val).slice(0, 120)
        : key === "note"
          ? String(val).slice(0, 180)
          : val;

    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, [key]: nextValue } : it)),
    );
  };

  const setCost = (k, v) => {
    if (isReadOnly) return;
    setCosts((c) => ({ ...c, [k]: v }));
  };

  const handleRegenerateFromBlueprint = () => {
    if (isReadOnly) {
      toast.error("Approved estimates cannot be regenerated.");
      return;
    }

    if (!preferredAutoItems.length) {
      toast.error("No blueprint conversion data available to regenerate.");
      return;
    }

    const shouldReplace = window.confirm(
      "Papalitan nito ang current estimation rows gamit ang latest blueprint conversion data. Itutuloy?",
    );

    if (!shouldReplace) return;

    const { autoItems: existingAutoItems, manualItems } =
      splitExistingItemsBySource(items);

    const mergedAutoItems = mergeAutoItemsWithExistingPrices(
      preferredAutoItems,
      existingAutoItems,
    );

    setItems(
      removeZeroCostDuplicateRows([
        ...mergedAutoItems,
        ...manualItems.filter(isFilledEstimateRow),
      ]),
    );
    toast.success(
      "Estimation rows regenerated from blueprint. Matching prices and manual rows were preserved.",
    );
  };

  const handleSave = async () => {
    if (isReadOnly) {
      toast.error("Approved estimates are locked and can no longer be saved.");
      return;
    }

    const reconciledRows = reconcileEstimateRowsWithBlueprint(
      items,
      preferredAutoItems,
    );

    setItems(reconciledRows.length ? reconciledRows : [{ ...BLANK_ITEM }]);

    const saveValidationErrors = getEstimateValidationErrors({
      items: reconciledRows,
      costs,
    });

    if (showFirstValidationError(saveValidationErrors)) {
      return;
    }

    setSaving(true);
    try {
      const { materialItems: cleanedItems } =
        splitEstimationItems(reconciledRows);

      const payload = {
        items: cleanedItems.map(normalizeItem),
        ...costs,
        material_cost: materialsSubtotal,
        items_total: materialsSubtotal,
        labor_cost: effectiveLaborCost,
        subtotal,
        tax_amount: taxAmt,
        grand_total: grandTotal,
      };

      const res = await api.post(`/blueprints/${id}/estimation`, payload);

      if (res?.data?.estimation) {
        setEst(res.data.estimation);
      }

      setBlueprint((prev) => (prev ? { ...prev, stage: "estimation" } : prev));

      setItems(cleanedItems.length ? cleanedItems : [{ ...BLANK_ITEM }]);

      toast.success(
        "Estimate saved. You can now send the quotation to the customer for approval.",
      );
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to save estimation.");
    } finally {
      setSaving(false);
    }
  };

  const handleApproveEstimation = async () => {
    if (!est?.id) {
      toast.error("Save the estimate first before approving.");
      return;
    }

    const reconciledRows = reconcileEstimateRowsWithBlueprint(
      items,
      preferredAutoItems,
    );

    setItems(reconciledRows.length ? reconciledRows : [{ ...BLANK_ITEM }]);

    const approvalValidationErrors = getEstimateValidationErrors({
      items: reconciledRows,
      costs,
    });

    if (showFirstValidationError(approvalValidationErrors)) {
      return;
    }

    const shouldApprove = window.confirm(
      "This will send the latest quotation to the customer for review and approval. Continue?",
    );

    if (!shouldApprove) return;

    setApproving(true);
    try {
      const res = await api.patch(`/blueprints/${id}/estimation/approve`);

      setEst((prev) => ({
        ...(prev || {}),
        ...(res?.data?.estimation || {}),
        status: "sent",
      }));

      setBlueprint((prev) => (prev ? { ...prev, stage: "approval" } : prev));

      toast.success("Quotation sent to customer for approval.");
    } catch (err) {
      console.error(err);
      toast.error(
        err?.response?.data?.message || "Failed to approve estimation.",
      );
    } finally {
      setApproving(false);
    }
  };

  const handleGenerateContract = () => {
    if (!est?.id) {
      toast.error(
        "Save and approve the estimate first before generating a contract.",
      );
      return;
    }

    if (!isApprovedEstimateStatus(est?.status)) {
      toast.error(
        "Only customer-approved quotations can proceed to contract generation.",
      );
      return;
    }

    if (!blueprint?.order_id) {
      toast.error("This blueprint is not linked to an order.");
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
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const bp = blueprint || {};
    const customer = getCustomerDisplayName(bp);
    const title = getBlueprintDisplayTitle(bp);
    const preparedDate = new Date().toLocaleDateString("en-PH");
    const reference = `BP-${String(id).padStart(4, "0")}`;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const usableWidth = pageWidth - margin * 2;

    const darkAccent = [24, 24, 27];
    const dark = [17, 24, 39];
    const text = [55, 65, 81];
    const muted = [107, 114, 128];
    const border = [218, 223, 230];
    const soft = [247, 249, 252];

    const money = (value) =>
      `PHP ${Number(value || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

    doc.setFillColor(...darkAccent);
    doc.rect(0, 0, pageWidth, 8, "F");

    doc.setTextColor(...dark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Spiral Wood Services", margin, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("8 Sitio Laot, Prenza 1, Marilao, Bulacan", margin, 24);
    doc.text("spiralwoodservices.com", margin, 28);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...darkAccent);
    doc.text("QUOTATION", pageWidth - margin, 18, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...text);
    doc.text(`Reference No.: ${reference}`, pageWidth - margin, 25, {
      align: "right",
    });
    doc.text(`Date: ${preparedDate}`, pageWidth - margin, 30, {
      align: "right",
    });

    doc.setDrawColor(...darkAccent);
    doc.setLineWidth(0.7);
    doc.line(margin, 34, pageWidth - margin, 34);

    const boxY = 40;
    const leftBoxW = 98;
    const rightBoxW = usableWidth - leftBoxW - 6;

    doc.setDrawColor(...border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, boxY, leftBoxW, 28, 2, 2, "FD");
    doc.roundedRect(margin + leftBoxW + 6, boxY, rightBoxW, 28, 2, 2, "FD");

    doc.setFillColor(...soft);
    doc.roundedRect(margin, boxY, leftBoxW, 9, 2, 2, "F");
    doc.roundedRect(margin + leftBoxW + 6, boxY, rightBoxW, 9, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...dark);
    doc.text("CLIENT DETAILS", margin + 3, boxY + 6);
    doc.text("ESTIMATE DETAILS", margin + leftBoxW + 9, boxY + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...text);
    doc.text(`Blueprint: ${title}`, margin + 3, boxY + 14);
    doc.text(`Customer: ${customer}`, margin + 3, boxY + 20);
    doc.text(`Document: Project Estimate`, margin + 3, boxY + 26);

    const rightInfoX = margin + leftBoxW + 9;
    doc.text(`Validity: 30 days from quotation date`, rightInfoX, boxY + 14);
    doc.text(`Status: ${estimateStatus}`, rightInfoX, boxY + 20);
    doc.text(`Prepared by: ${preparedBy}`, rightInfoX, boxY + 26);

    const tableStartY = 76;
    const pdfItems = materialItems;

    const bodyRows = pdfItems.length
      ? pdfItems.map((it, i) => {
          const qty = Number(it.quantity || 0);
          const unitCost = Number(it.unit_cost || 0);
          const amount = qty * unitCost;

          return [
            i + 1,
            it.note ? `${it.name || "—"}\n${it.note}` : it.name || "—",
            it.unit || "pc",
            qty,
            money(unitCost),
            money(amount),
          ];
        })
      : [["1", "No line items", "-", "-", money(0), money(0)]];

    autoTable(doc, {
      startY: tableStartY,
      margin: { left: margin, right: margin },
      theme: "grid",
      head: [["#", "Description", "Unit", "Qty", "Rate", "Amount"]],
      body: bodyRows,
      styles: {
        font: "helvetica",
        fontSize: 9,
        textColor: dark,
        lineColor: border,
        lineWidth: 0.2,
        cellPadding: 3,
        valign: "middle",
      },
      headStyles: {
        fillColor: darkAccent,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: soft,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 86 },
        2: { cellWidth: 18, halign: "center" },
        3: { cellWidth: 16, halign: "center" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 28, halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          data.cell.styles.minCellHeight = 14;
        }
      },
    });

    const sectionTop = doc.lastAutoTable.finalY + 10;

    const notesX = margin;
    const notesW = 110;
    const summaryX = margin + notesW + 6;
    const summaryW = usableWidth - notesW - 6;

    const defaultNotes =
      "This quotation is subject to final confirmation of specifications, material availability, delivery schedule, and client approval. Any revisions or additional requests may affect the final cost.";
    const notesText = costs.notes?.trim() ? costs.notes.trim() : defaultNotes;
    const notesLines = doc.splitTextToSize(notesText, notesW - 8);
    const notesH = Math.max(46, 16 + notesLines.length * 4.6 + 8);

    doc.setDrawColor(...border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(notesX, sectionTop, notesW, notesH, 2, 2, "FD");
    doc.setFillColor(...soft);
    doc.roundedRect(notesX, sectionTop, notesW, 10, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...dark);
    doc.text("REMARKS", notesX + 4, sectionTop + 6.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    doc.setTextColor(...text);
    doc.text(notesLines, notesX + 4, sectionTop + 16);

    const summaryRows = [
      ["Materials Subtotal", money(materialsSubtotal)],
      ["Labor", money(effectiveLaborCost)],
      ["Logistics", money(overheadCost)],
      ["Subtotal", money(subtotal)],
      [`Discount (${discountRate}%)`, `(${money(discountAmount)})`],
      [`VAT (${Number(costs.tax_rate) || 0}%)`, money(taxAmt)],
    ];

    const rowGap = 8;
    const summaryH = 16 + summaryRows.length * rowGap + 18;

    doc.setDrawColor(...border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(summaryX, sectionTop, summaryW, summaryH, 2, 2, "FD");
    doc.setFillColor(...soft);
    doc.roundedRect(summaryX, sectionTop, summaryW, 10, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...dark);
    doc.text("SUMMARY", summaryX + 4, sectionTop + 6.5);

    let rowY = sectionTop + 17;
    summaryRows.forEach(([label, value], idx) => {
      const isDiscount = idx === 4;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(
        isDiscount ? 220 : muted[0],
        isDiscount ? 38 : muted[1],
        isDiscount ? 38 : muted[2],
      );
      doc.text(label, summaryX + 4, rowY);

      doc.setTextColor(
        isDiscount ? 220 : dark[0],
        isDiscount ? 38 : dark[1],
        isDiscount ? 38 : dark[2],
      );
      doc.text(value, summaryX + summaryW - 4, rowY, { align: "right" });

      if (idx !== summaryRows.length - 1) {
        doc.setDrawColor(...border);
        doc.line(summaryX + 4, rowY + 2.8, summaryX + summaryW - 4, rowY + 2.8);
      }

      rowY += rowGap;
    });

    doc.setFillColor(...darkAccent);
    doc.roundedRect(
      summaryX,
      sectionTop + summaryH - 14,
      summaryW,
      14,
      2,
      2,
      "F",
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text("GRAND TOTAL", summaryX + 4, sectionTop + summaryH - 5);

    doc.setFontSize(12);
    doc.text(
      money(grandTotal),
      summaryX + summaryW - 4,
      sectionTop + summaryH - 5,
      {
        align: "right",
      },
    );

    let sigY = Math.max(sectionTop + notesH, sectionTop + summaryH) + 24;
    if (sigY > pageHeight - 40) sigY = pageHeight - 40;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...dark);
    doc.text("Prepared by:", margin, sigY);
    doc.text("Accepted by:", 112, sigY);

    doc.setDrawColor(...darkAccent);
    doc.setLineWidth(0.5);
    doc.line(margin, sigY + 16, 84, sigY + 16);
    doc.line(112, sigY + 16, pageWidth - margin, sigY + 16);

    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text("Authorized Representative / Signature / Date", margin, sigY + 22);
    doc.text("Client Signature / Date", 112, sigY + 22);

    doc.setDrawColor(...border);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(
      `Generated on ${new Date().toLocaleString("en-PH")}`,
      margin,
      pageHeight - 8,
    );
    doc.text(reference, pageWidth - margin, pageHeight - 8, {
      align: "right",
    });

    doc.save(`quotation_${reference}_${Date.now()}.pdf`);
    toast.success("Quotation PDF exported.");
  };

  if (loading) return <div style={center}>Loading estimate...</div>;
  if (!blueprint) return <div style={center}>Blueprint not found.</div>;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", paddingBottom: 40 }}>
      <div style={pageHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigate(`/admin/blueprints/${id}/design`)}
            style={btnBack}
          >
            ← Back to Design
          </button>

          <div>
            <h1 style={pageTitle}>Project Estimate — {displayTitle}</h1>
            <p style={pageSubTitle}>
              Blueprint #{String(id).padStart(5, "0")} · Customer:{" "}
              {customerDisplay}
            </p>
          </div>
        </div>

        <div style={headerActions}>
          <button
            onClick={handleRegenerateFromBlueprint}
            disabled={isReadOnly || !preferredAutoItems.length}
            style={
              isReadOnly || !preferredAutoItems.length
                ? { ...btnGhost, ...btnDisabled }
                : btnGhost
            }
          >
            Regenerate Rows
          </button>

          <button onClick={exportPDF} style={btnGhost}>
            Export PDF
          </button>

          {est?.status === "approved" ? (
            <button
              onClick={handleGenerateContract}
              disabled={!canGenerateContract}
              style={
                !canGenerateContract
                  ? { ...btnPrimary, ...btnDisabled }
                  : btnPrimary
              }
            >
              Generate Contract
            </button>
          ) : (
            <button
              onClick={handleApproveEstimation}
              disabled={!est?.id || approving || isQuoteSent}
              style={
                !est?.id || approving || isQuoteSent
                  ? { ...btnGhost, ...btnDisabled }
                  : btnPrimary
              }
            >
              {isQuoteSent ? "Quotation Sent" : "Send Quote"}
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || isReadOnly}
            style={
              saving || isReadOnly
                ? { ...btnPrimary, ...btnDisabled }
                : btnPrimary
            }
          >
            {saving ? "Saving..." : "Save Estimate"}
          </button>
        </div>
      </div>

      <div style={metaGrid}>
        <div style={metaCard}>
          <span style={metaLabel}>Status</span>
          <span style={metaValue}>{estimateStatus}</span>
        </div>

        <div style={metaCard}>
          <span style={metaLabel}>Valid Until</span>
          <span style={metaValue}>{formatDateDisplay(validUntil)}</span>
        </div>

        <div style={metaCard}>
          <span style={metaLabel}>Prepared By</span>
          <span style={metaValue}>{preparedBy}</span>
        </div>
      </div>

      {isReadOnly && (
        <div style={lockedBanner}>
          {isQuoteApproved
            ? "This quotation is already customer-approved. Editing, row regeneration, and saving are now disabled. You may still export the quotation and generate the contract."
            : "This quotation has already been sent to the customer. Editing, row regeneration, and saving are temporarily disabled while waiting for the customer decision."}
        </div>
      )}

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={sectionHeader}>
          <div>
            <h3 style={sectionTitle}>Materials</h3>
            <p style={helperText}>
              Use this section for billable material groups only. Enter labor
              and logistics below.
            </p>
          </div>

          <button
            onClick={addItem}
            disabled={isReadOnly}
            style={isReadOnly ? { ...btnAdd, ...btnDisabled } : btnAdd}
          >
            Add Row
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              tableLayout: "fixed",
              minWidth: 800,
            }}
          >
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {MATERIAL_TABLE_COLUMNS.map((col) => (
                  <th
                    key={col.label || col.width}
                    style={{ ...th, width: col.width }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {items.map((item, i) => {
                const rowTotal =
                  Number(item.quantity || 0) * Number(item.unit_cost || 0);

                return (
                  <tr
                    key={item.source_key || i}
                    style={{ borderBottom: "1px solid #f4f4f5" }}
                  >
                    <td
                      style={{
                        ...td,
                        color: "#71717a",
                        fontWeight: 800,
                        width: "5%",
                      }}
                    >
                      {i + 1}
                    </td>

                    <td style={td}>
                      <input
                        value={item.name}
                        onChange={(e) => updateItem(i, "name", e.target.value)}
                        style={{
                          ...cellInput,
                          ...readOnlyFieldStyle,
                          width: "100%",
                          fontWeight: 600,
                        }}
                        placeholder="e.g. Carcass Panels"
                        maxLength={120}
                        disabled={isReadOnly}
                      />
                    </td>

                    <td style={td}>
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(i, "unit", e.target.value)}
                        style={{
                          ...cellInput,
                          ...readOnlyFieldStyle,
                          width: "100%",
                        }}
                        disabled={isReadOnly}
                      >
                        {[
                          "pc",
                          "sq.m",
                          "sheet",
                          "kg",
                          "m",
                          "ft",
                          "set",
                          "lot",
                          "L",
                        ].map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>

                    <td style={td}>
                      <input
                        type="number"
                        min={isAreaUnit(item.unit) ? "0.0001" : "1"}
                        step={isAreaUnit(item.unit) ? "0.0001" : "1"}
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(i, "quantity", e.target.value)
                        }
                        style={{
                          ...cellInput,
                          ...readOnlyFieldStyle,
                          width: "100%",
                        }}
                        disabled={isReadOnly}
                      />
                    </td>

                    <td style={td}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) =>
                          updateItem(i, "unit_cost", e.target.value)
                        }
                        style={{
                          ...cellInput,
                          ...readOnlyFieldStyle,
                          width: "100%",
                        }}
                        placeholder="0.00"
                        disabled={isReadOnly}
                      />
                    </td>

                    <td
                      style={{
                        ...td,
                        fontWeight: 800,
                        color: "#0a0a0a",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatMoney(rowTotal)}
                    </td>

                    <td style={td}>
                      <input
                        value={item.note}
                        onChange={(e) => updateItem(i, "note", e.target.value)}
                        style={{
                          ...cellInput,
                          ...readOnlyFieldStyle,
                          width: "100%",
                        }}
                        placeholder="Material, finish, size, inclusions..."
                        maxLength={180}
                        disabled={isReadOnly}
                      />
                    </td>

                    <td style={{ ...td, textAlign: "center" }}>
                      {!isReadOnly && items.length > 1 && (
                        <button
                          onClick={() => removeItem(i)}
                          style={btnRemove}
                          title="Remove row"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr
                style={{
                  background: "#fafafa",
                  borderTop: "2px solid #e4e4e7",
                }}
              >
                <td
                  colSpan={5}
                  style={{
                    ...td,
                    textAlign: "right",
                    fontWeight: 800,
                    color: "#18181b",
                  }}
                >
                  Materials Subtotal
                </td>
                <td
                  style={{
                    ...td,
                    fontWeight: 800,
                    color: "#0a0a0a",
                    fontSize: 15,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatMoney(materialsSubtotal)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 20 }}
      >
        <div style={card}>
          <div style={sectionHeaderSmall}>
            <div>
              <h3 style={sectionTitle}>Charges</h3>
              <p style={helperText}>
                Enter non-material amounts such as labor, logistics, discount,
                and VAT.
              </p>
            </div>
          </div>

          <div style={{ padding: "20px 24px" }}>
            {[
              { key: "labor_cost", label: "Labor Cost (₱)" },
              { key: "overhead_cost", label: "Logistics Cost (₱)" },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={labelSm}>{label}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costs[key]}
                  onChange={(e) => setCost(key, e.target.value)}
                  style={{ ...inputFull, ...readOnlyFieldStyle }}
                  placeholder="0.00"
                  disabled={isReadOnly}
                />
              </div>
            ))}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <label style={labelSm}>Discount (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={costs.discount}
                  onChange={(e) => setCost("discount", e.target.value)}
                  style={{ ...inputFull, ...readOnlyFieldStyle }}
                  placeholder="0.00"
                  disabled={isReadOnly}
                />
              </div>

              <div>
                <label style={labelSm}>VAT (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={costs.tax_rate}
                  onChange={(e) => setCost("tax_rate", e.target.value)}
                  style={{ ...inputFull, ...readOnlyFieldStyle }}
                  disabled={isReadOnly}
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={labelSm}>Remarks</label>
              <textarea
                value={costs.notes}
                onChange={(e) => setCost("notes", e.target.value.slice(0, 500))}
                rows={4}
                style={{
                  ...inputFull,
                  ...readOnlyFieldStyle,
                  resize: "vertical",
                }}
                placeholder="Terms, delivery notes, payment reminders, inclusions or exclusions..."
                maxLength={500}
                disabled={isReadOnly}
              />
            </div>
          </div>
        </div>

        <div style={{ ...card, alignSelf: "start" }}>
          <div style={sectionHeaderSmall}>
            <div>
              <h3 style={sectionTitle}>Summary</h3>
              <p style={helperText}>
                Review the final computation before saving or approving the
                estimate.
              </p>
            </div>
          </div>

          <div style={{ padding: "24px" }}>
            {[
              {
                label: "Materials Subtotal",
                val: materialsSubtotal,
                color: "#18181b",
              },
              {
                label: "Labor",
                val: effectiveLaborCost,
                color: "#18181b",
              },
              {
                label: "Logistics",
                val: overheadCost,
                color: "#18181b",
              },
            ].map((row) => (
              <div key={row.label} style={summaryRow}>
                <span
                  style={{ color: "#71717a", fontSize: 13, fontWeight: 600 }}
                >
                  {row.label}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: row.color,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatMoney(row.val)}
                </span>
              </div>
            ))}

            <div style={{ borderTop: "1px solid #e4e4e7", margin: "16px 0" }} />

            <div style={summaryRow}>
              <span style={{ color: "#18181b", fontSize: 13, fontWeight: 800 }}>
                Subtotal
              </span>
              <span
                style={{
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  color: "#0a0a0a",
                }}
              >
                {formatMoney(subtotal)}
              </span>
            </div>

            {discountRate > 0 && (
              <div style={summaryRow}>
                <span
                  style={{ color: "#dc2626", fontSize: 13, fontWeight: 700 }}
                >
                  Discount ({discountRate}%)
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: "#dc2626",
                    whiteSpace: "nowrap",
                  }}
                >
                  ({formatMoney(discountAmount)})
                </span>
              </div>
            )}

            <div style={summaryRow}>
              <span style={{ color: "#71717a", fontSize: 13, fontWeight: 600 }}>
                VAT ({costs.tax_rate}%)
              </span>
              <span
                style={{
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  color: "#18181b",
                }}
              >
                {formatMoney(taxAmt)}
              </span>
            </div>

            <div
              style={{
                marginTop: 20,
                background: "#18181b",
                borderRadius: 12,
                padding: "20px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  color: "#a1a1aa",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "1px",
                }}
              >
                GRAND TOTAL
              </span>
              <span
                style={{
                  color: "#ffffff",
                  fontSize: 28,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  letterSpacing: "-0.02em",
                }}
              >
                {formatMoney(grandTotal)}
              </span>
            </div>

            {est && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  background: "#fafafa",
                  border: "1px solid #e4e4e7",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "#52525b",
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                Estimation previously saved on{" "}
                {new Date(est.updated_at || est.created_at).toLocaleDateString(
                  "en-PH",
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const card = {
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e4e4e7",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  overflow: "hidden",
};

const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 300,
  color: "#71717a",
  fontSize: 14,
  fontWeight: 600,
};

const pageHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};

const pageTitle = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};

const pageSubTitle = {
  fontSize: 13,
  color: "#52525b",
  margin: "4px 0 0",
};

const headerActions = {
  marginLeft: "auto",
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const metaGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginBottom: 20,
};

const metaCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "16px 20px",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const metaLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const metaValue = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.01em",
};

const lockedBanner = {
  marginBottom: 20,
  padding: "14px 16px",
  borderRadius: 12,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  color: "#18181b",
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 500,
};

const sectionHeader = {
  padding: "20px 24px",
  borderBottom: "1px solid #e4e4e7",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  background: "#fafafa",
};

const sectionHeaderSmall = {
  padding: "16px 24px",
  borderBottom: "1px solid #e4e4e7",
  background: "#fafafa",
};

const sectionTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
  color: "#0a0a0a",
};

const helperText = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "#71717a",
  lineHeight: 1.5,
};

const th = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  borderBottom: "1px solid #e4e4e7",
};

const td = {
  padding: "14px 14px",
  color: "#18181b",
  verticalAlign: "middle",
};

const labelSm = {
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
  display: "block",
  marginBottom: 8,
};

const inputFull = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  boxSizing: "border-box",
  outline: "none",
};

const cellInput = {
  padding: "8px 10px",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  fontSize: 13,
  color: "#18181b",
  outline: "none",
  boxSizing: "border-box",
};

const fieldLocked = {
  background: "#fafafa",
  color: "#71717a",
  cursor: "not-allowed",
};

const summaryRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 0",
  borderBottom: "1px solid #f4f4f5",
  gap: 12,
};

const btnPrimary = {
  padding: "10px 20px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnGhost = {
  padding: "10px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "all 0.2s",
};

const btnBack = {
  padding: "8px 12px",
  background: "#ffffff",
  color: "#52525b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "all 0.2s",
};

const btnAdd = {
  padding: "8px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnRemove = {
  padding: "6px 10px",
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnDisabled = {
  opacity: 0.6,
  cursor: "not-allowed",
};
