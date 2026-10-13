// WISDOM W4-A3 — draft-only display rows for customer-requested wood.
// No plank counts or wood substitutions are inferred from 3D geometry.
// A saved/approved quotation's material snapshot is never modified here.
const normalize = (value) => String(value ?? "").trim().toLowerCase();

export function getRequestedWoodTypesFromDesign(design = {}) {
  const parts = Array.isArray(design?.components) ? design.components : [];
  return [...new Set(parts.map((part) => normalize(part?.requested_wood_type)).filter(Boolean))];
}

export function resolveWoodInventoryId(woodType, woodCatalog = []) {
  const type = normalize(woodType);
  if (!type || !Array.isArray(woodCatalog)) return null;
  const matches = woodCatalog.filter((wood) => normalize(wood?.id) === type);
  if (matches.length !== 1 || matches[0]?.source !== "raw_materials.unit_cost") return null;
  const id = Number(matches[0]?.raw_material_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function ensureRequestedWoodRows(items = [], design = {}, { locked = false, woodCatalog = [] } = {}) {
  if (!Array.isArray(items)) return [];
  if (locked) return items;
  const expected = getRequestedWoodTypesFromDesign(design);
  if (!expected.length) return items;
  const found = new Set(items.filter((item) =>
    ["wood_reference", "inventory_material"].includes(normalize(item?.source_type)) &&
    normalize(item?.wood_type),
  ).map((item) => normalize(item.wood_type)));
  const additions = expected.filter((type) => !found.has(type)).map((type) => {
    const row = Array.isArray(woodCatalog)
      ? woodCatalog.find((wood) => normalize(wood?.id) === type)
      : null;
    return {
      id: null,
      component_id: null,
      raw_material_id: null,
      wood_type: type,
      name: row?.name || `${type.charAt(0).toUpperCase()}${type.slice(1)} Plank`,
      description: row?.name || `${type} Plank`,
      quantity: "", // deliberately empty: only Admin may determine real plank quantities
      unit: "plank", // legacy draft representation; W4-A2 backend converts to Inventory pcs
      unit_cost: 0,
      note: "",
      source_type: "wood_reference",
      source_key: `customer-required-wood:${type}`,
      _row_key: `customer-required-wood:${type}`,
    };
  });
  return additions.length ? [...items, ...additions] : items;
}
