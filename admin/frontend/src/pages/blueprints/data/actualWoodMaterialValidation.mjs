// W5: Customer-selected wood means actual solid wood, never a color/veneer.
// Pure helpers. Admin must review construction; this does not size/cost lumber.

const clean = (value) => String(value ?? "").trim();
const normalized = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");
const SIGNATURE_VERSION = "w5-actual-wood-v1";

export function getRequestedActualWood(component = {}) {
  return clean(component?.requested_wood_type);
}

export function matchesRequestedActualWood(component = {}) {
  const requested = normalized(getRequestedActualWood(component));
  if (!requested) return true; // Legacy blueprints without a request are unchanged.
  const material = normalized(component?.material);
  // Explicit solid wood only; "Mahogany Veneer", "Pine Plywood" and
  // generic "Solid Wood" must never satisfy an actual species request.
  return material === requested ||
    material === `${requested} wood` ||
    material === `solid ${requested}` ||
    material === `solid ${requested} wood`;
}

const numeric = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(3)) : null;
};

export function getActualWoodValidationSignature(component = {}) {
  // This is a manual review stamp, invalidated when material or the relevant
  // production specification changes (including a duplicated part's id).
  return JSON.stringify([
    SIGNATURE_VERSION,
    clean(component.id),
    clean(component.partCode),
    normalized(getRequestedActualWood(component)),
    normalized(component.material),
    numeric(component.width), numeric(component.height), numeric(component.depth),
    numeric(component.qty ?? 1),
    normalized(component.constructionMethod || "single"),
    numeric(component.constructionLayerCount ?? 2),
    clean(component.constructionStockId),
  ]);
}

export function getActualWoodValidationStatus(component = {}) {
  const request = getRequestedActualWood(component);
  if (!request) return "not_required";
  if (!matchesRequestedActualWood(component)) return "material_mismatch";
  return component.woodMaterialValidationSignature ===
    getActualWoodValidationSignature(component)
    ? "confirmed" : "unconfirmed";
}

export function getActualWoodMaterialIssues(components = []) {
  return (Array.isArray(components) ? components : [])
    .filter((part) => part && part.type !== "reference_proxy")
    .flatMap((part, index) => {
      const status = getActualWoodValidationStatus(part);
      if (status === "confirmed" || status === "not_required") return [];
      return [{
        componentId: part.id ?? null,
        partCode: clean(part.partCode),
        label: clean(part.label) || `Part ${index + 1}`,
        requestedWood: getRequestedActualWood(part),
        currentMaterial: clean(part.material),
        status,
      }];
    });
}

export function getPartsScheduleMaterialText(component = {}) {
  const actual = clean(component.material) || "Material not set";
  const requested = getRequestedActualWood(component);
  if (!requested) return actual;
  if (getActualWoodValidationStatus(component) === "confirmed") {
    return `${actual} (requested ${requested})`;
  }
  return `${actual} — UNVERIFIED (requested ${requested})`;
}
