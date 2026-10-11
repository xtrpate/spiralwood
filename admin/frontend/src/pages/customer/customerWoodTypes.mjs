// WISDOM W1: Customer wood species choices (visual swatches only).
// Do NOT put internal unit costs in a customer-facing JavaScript bundle.
// Wood species requested by the customer is separate from blueprint part material.
export const CUSTOMER_WOOD_TYPES = Object.freeze([
  { id: "mahogany", label: "Mahogany", swatch: "#93533D" },
  { id: "pine", label: "Pine", swatch: "#E2C698" },
  { id: "acacia", label: "Acacia", swatch: "#A8794B" },
  { id: "narra", label: "Narra", swatch: "#9C5737" },
  { id: "tanguile", label: "Tanguile", swatch: "#B88969" },
  { id: "gmelina", label: "Gmelina", swatch: "#D0B785" },
  { id: "rubberwood", label: "Rubberwood", swatch: "#C7AC78" },
  { id: "teak", label: "Teak", swatch: "#AE783E" },
  { id: "oak", label: "Oak", swatch: "#CDA574" },
  { id: "maple", label: "Maple", swatch: "#E4C99B" },
]);

export function resolveCustomerWoodType(input) {
  const normalized = String(input ?? "").trim().toLowerCase();
  return CUSTOMER_WOOD_TYPES.find((wood) => wood.label.toLowerCase() === normalized)?.label || "";
}


// A visual preview only: use an existing texture palette. This does NOT
// change the actual material, board thickness, or inventory pricing.
export const WOOD_PREVIEW_FINISH_ID = Object.freeze({
  mahogany: "mahogany-rich",
  pine: "pine-light",
  acacia: "golden-pecan",
  narra: "red-mahogany",
  tanguile: "colonial-maple",
  gmelina: "beech-honey",
  rubberwood: "ash-beige",
  teak: "teak-golden",
  oak: "oak-natural",
  maple: "maple-cream",
});

export function previewCustomerWoodTypes(activeLabel = "", limit = 3) {
  const first = CUSTOMER_WOOD_TYPES.slice(0, Math.max(1, Number(limit) || 3));
  const active = CUSTOMER_WOOD_TYPES.find((wood) => wood.label === activeLabel);
  if (!active || first.some((wood) => wood.id === active.id)) return first;
  return [...first.slice(0, first.length - 1), active];
}

export function getRequestedWoodTypeSummary(components = []) {
  const parts = Array.isArray(components) ? components : [];
  const unique = [...new Set(parts.map((comp) => resolveCustomerWoodType(comp?.requested_wood_type)).filter(Boolean))];
  if (!unique.length) return "";
  const everyPartSpecified = parts.every((comp) => resolveCustomerWoodType(comp?.requested_wood_type));
  return unique.length === 1 && everyPartSpecified ? unique[0] : "Mixed Wood Types";
}
