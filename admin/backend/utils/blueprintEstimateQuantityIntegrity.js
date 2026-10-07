const STRUCTURAL_SOURCE_TYPES = new Set([
  "component",
  "cutlist",
  "blueprint_part",
]);

const normalizeText = (value = "") =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeUnit = (value = "pc") =>
  normalizeText(value || "pc").toLowerCase() || "pc";

const normalizeIdentityName = (value = "") => {
  let result = normalizeText(value).toLowerCase();

  // Normalize display decoration only. Quantity validation remains strict.
  // Two passes handle legacy names such as:
  //   "Shelfs (Oak Natural)" -> "shelf"
  //   "Shelf (Oak Natural)s" -> "shelf"
  for (let pass = 0; pass < 2; pass += 1) {
    result = result
      .replace(/\s*\([^)]*\)\s*$/g, "")
      .replace(/\s+#?\d+\s*$/g, "")
      .trim();

    if (/ies$/i.test(result)) {
      result = result.replace(/ies$/i, "y");
    } else if (/s$/i.test(result) && !/ss$/i.test(result)) {
      result = result.replace(/s$/i, "");
    }
  }

  return result
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+#?\d+\s*$/g, "")
    .trim();
};

const getDimensionIdentity = (value = "") => {
  const match = normalizeText(value).match(
    /\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?/i,
  );

  return match ? match[0].replace(/\s+/g, "").toLowerCase() : "";
};

const getStructuralIdentity = (item = {}) =>
  [
    normalizeIdentityName(item.name || item.description || item.label || ""),
    getDimensionIdentity(item.note || item.description || ""),
    normalizeUnit(item.unit || "pc"),
  ].join("|");

const normalizeOrderQuantity = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
};

const roundQuantity = (value, unit = "pc") => {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const normalizedUnit = normalizeUnit(unit);

  if (["sq.m", "sqm", "m²", "m2"].includes(normalizedUnit)) {
    return Number(Math.max(0.0001, safe).toFixed(4));
  }

  return Number(safe.toFixed(6));
};

const addQuantity = (map, identity, quantity, unit) => {
  if (!identity || identity.startsWith("||")) return;

  const next =
    Number(map.get(identity)?.quantity || 0) +
    Number(roundQuantity(quantity, unit) || 0);

  map.set(identity, {
    quantity: roundQuantity(next, unit),
    unit: normalizeUnit(unit),
  });
};

const buildCanonicalBlueprintPartQuantities = (
  designData = {},
  orderQuantity = 1,
) => {
  const expected = new Map();
  const orderQty = normalizeOrderQuantity(orderQuantity);
  const cutListRows = Array.isArray(designData?.conversionCutListRows)
    ? designData.conversionCutListRows
    : [];

  if (cutListRows.length) {
    cutListRows.forEach((row, index) => {
      const useArea =
        String(row?.estimationUnit || "").trim().toLowerCase() ===
        "panel_area";
      const unit = useArea ? "sq.m" : "pc";
      const name =
        row?.sampleLabel ||
        [row?.partFamily || "Part", row?.partRole || "Item"]
          .filter(Boolean)
          .join(" — ") ||
        `Cut List Item ${index + 1}`;
      const note = [
        row?.material || "—",
        row?.widthMm && row?.heightMm && row?.depthMm
          ? `${row.widthMm}×${row.heightMm}×${row.depthMm} mm`
          : null,
        row?.thicknessMm ? `${row.thicknessMm} mm thick` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const baseQuantity = useArea
        ? Number(Number(row?.totalAreaSqM || 0).toFixed(4)) || 0.0001
        : Math.max(1, Number(row?.qty || 1) || 1);
      const quantity = useArea
        ? Number((baseQuantity * orderQty).toFixed(4))
        : baseQuantity * orderQty;

      addQuantity(
        expected,
        getStructuralIdentity({ name, note, unit }),
        quantity,
        unit,
      );
    });

    return expected;
  }

  const components = Array.isArray(designData?.components)
    ? designData.components
    : [];

  components.forEach((component, index) => {
    if (component?.type === "reference_proxy") return;

    const name = component?.label || component?.name || `Component ${index + 1}`;
    const unit = "pc";
    const note = `${component?.material || "—"} · ${component?.width || 0}×${component?.height || 0}×${component?.depth || 0} mm`;
    const quantity =
      (Number(component?.qty) || Number(component?.quantity) || 1) * orderQty;

    addQuantity(
      expected,
      getStructuralIdentity({ name, note, unit }),
      quantity,
      unit,
    );
  });

  return expected;
};

const isStructuralSubmittedItem = (item = {}, expected = new Map()) => {
  const sourceType = normalizeText(item?.source_type || item?.sourceType)
    .toLowerCase();
  const sourceKey = normalizeText(item?.source_key || item?.sourceKey);
  const identity = getStructuralIdentity(item);

  return (
    STRUCTURAL_SOURCE_TYPES.has(sourceType) ||
    sourceKey.startsWith("component:") ||
    sourceKey.startsWith("cutrow:") ||
    sourceKey.startsWith("group:") ||
    expected.has(identity)
  );
};

const createQuantityMismatchError = (message, details = []) => {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = "BLUEPRINT_PART_QUANTITY_MISMATCH";
  error.details = details;
  return error;
};

const validateBlueprintEstimateQuantities = ({
  designData = {},
  orderQuantity = 1,
  items = [],
} = {}) => {
  const expected = buildCanonicalBlueprintPartQuantities(
    designData,
    orderQuantity,
  );

  if (expected.size === 0) {
    return {
      validated: false,
      reason: "NO_CANONICAL_BLUEPRINT_PARTS",
      expected_count: 0,
    };
  }

  const actual = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const sourceType = normalizeText(item?.source_type || item?.sourceType)
      .toLowerCase();

    if (sourceType === "inventory_material") return;
    if (!isStructuralSubmittedItem(item, expected)) return;

    const identity = getStructuralIdentity(item);
    const unit = normalizeUnit(item?.unit || "pc");

    addQuantity(actual, identity, Number(item?.quantity || 0), unit);
  });

  const issues = [];

  for (const [identity, expectedEntry] of expected.entries()) {
    const actualEntry = actual.get(identity);
    const expectedQuantity = Number(expectedEntry.quantity || 0);
    const actualQuantity = Number(actualEntry?.quantity || 0);
    const tolerance =
      ["sq.m", "sqm", "m²", "m2"].includes(expectedEntry.unit) ? 0.0001 : 0.000001;

    if (!actualEntry || Math.abs(expectedQuantity - actualQuantity) > tolerance) {
      issues.push({
        identity,
        expected_quantity: expectedQuantity,
        actual_quantity: actualQuantity,
      });
    }
  }

  for (const [identity, actualEntry] of actual.entries()) {
    if (!expected.has(identity)) {
      issues.push({
        identity,
        expected_quantity: 0,
        actual_quantity: Number(actualEntry.quantity || 0),
      });
    }
  }

  if (issues.length) {
    throw createQuantityMismatchError(
      "Blueprint furniture-part quantities no longer match the saved design and order quantity. Refresh the estimate items before saving.",
      issues,
    );
  }

  return {
    validated: true,
    reason: null,
    expected_count: expected.size,
  };
};

module.exports = {
  buildCanonicalBlueprintPartQuantities,
  getStructuralIdentity,
  validateBlueprintEstimateQuantities,
};
