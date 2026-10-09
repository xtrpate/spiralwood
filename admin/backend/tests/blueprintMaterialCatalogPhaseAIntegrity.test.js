const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { APPROVED_BLUEPRINT_MATERIALS, buildBlueprintMaterialCatalog } = require("../utils/blueprintMaterialCatalog");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(repoRoot, file), "utf8");
const base = "admin/frontend/src/pages/blueprints/";

assert.strictEqual(APPROVED_BLUEPRINT_MATERIALS.length, 15, "Exactly 15 approved furniture material specifications");
assert.strictEqual(new Set(APPROVED_BLUEPRINT_MATERIALS.map((x) => x.key)).size, 15, "Catalog keys unique");
const stock = APPROVED_BLUEPRINT_MATERIALS.map((entry, i) => ({
  id: i + 101, name: entry.name, unit: entry.unit, material_form: entry.material_form,
  length_mm: entry.length_mm, width_mm: entry.width_mm, thickness_mm: entry.thickness_mm, is_active: 1,
  unit_cost: 9999, quantity: 12, supplier_id: 4,
}));
const matched = buildBlueprintMaterialCatalog(stock);
assert.strictEqual(matched.length, 15);
matched.forEach((x, index) => {
  assert.strictEqual(x.status, "available");
  assert.strictEqual(x.raw_material_id, stock[index].id);
  assert(!("unit_cost" in x) && !("quantity" in x) && !("supplier_id" in x),
    "Public catalog must never leak costs, supplier or stock counts");
});
const wrongThickness = buildBlueprintMaterialCatalog([
  { ...stock[0], thickness_mm: 36 }, ...stock.slice(1),
]);
assert.strictEqual(wrongThickness[0].status, "missing");
assert.strictEqual(wrongThickness[0].raw_material_id, null);
const duplicate = buildBlueprintMaterialCatalog([...stock, { ...stock[0], id: 999 }]);
assert.strictEqual(duplicate[0].status, "ambiguous", "Ambiguous material IDs must fail closed");
assert.strictEqual(duplicate[0].raw_material_id, null);
const inactive = buildBlueprintMaterialCatalog(stock.map((x, i) => i === 0 ? { ...x, is_active: 0 } : x));
assert.strictEqual(inactive[0].status, "missing");

const component = read(base + "data/componentUtils.js");
const signature = read(base + "data/designValidation.js");
const admin3d = read(base + "3d/components/PropertiesPanel.jsx");
const admin2d = read(base + "BlueprintDesign.jsx");
const customer = read("admin/frontend/src/pages/customer/customer3dviewer.jsx");
const cart = read("admin/frontend/src/pages/customer/customizepage.jsx");
const hook = read(base + "data/useBlueprintMaterialCatalog.js");
const route = read("admin/backend/routes/customer.blueprints.js");
const controller = read("admin/backend/controllers/customer/customer.blueprints.js");
const estimate = read("admin/backend/controllers/admin/blueprintController.estimation.js");
const customerAdapter = read("admin/frontend/src/pages/customer/customerBlueprintAdapter.js");
const customerBackend = read("admin/backend/controllers/customer/customer.customorders.js");

assert(component.includes("raw_material_id: Number.isSafeInteger"), "Save/Reload normalization must preserve material IDs");
assert(signature.includes("raw_material_id: Number(component.raw_material_id)"), "Unsaved changes must track material IDs");
assert(cart.includes("raw_material_id: Number(component?.raw_material_id)"), "Custom-cart identity must include selected material IDs");
assert(admin3d.includes("materialAssignmentPatch") && admin2d.includes("materialAssignmentPatch"),
  "Admin 2D/3D must share approved material selection");
assert(customer.includes("handleApprovedMaterialChange") && customer.includes("materialFitsPart"),
  "Customer must preserve other thicknesses while selecting material");
assert(hook.includes("/customer/blueprints/material-catalog"), "Admin and Customer must use the same catalog endpoint");
assert(hook.includes("export function materialFitsPart("), "Material selector must check actual stock dimensions");
assert(admin2d.includes("materialFitsPart") && admin3d.includes("materialFitsPart"), "Admin assignment must reject uncuttable components");
assert(route.indexOf('router.get("/material-catalog",') >= 0 &&
  route.indexOf('router.get("/material-catalog",') < route.indexOf('router.get("/:id",'),
  "Catalog route must precede dynamic blueprint ID");
assert(controller.includes("buildBlueprintMaterialCatalog(rows)"), "Public catalog must use exact inventory matching");
assert(customerAdapter.includes("raw_material_id:") &&
  customerAdapter.includes("Number(raw.raw_material_id)"), 
  "Customer Blueprint scene adapter must preserve material identity from Admin design");
const submitSanitizer = customerBackend.split("const sanitizeEditorSnapshotForStorage =")[1]?.split("const sanitizeCustomizationSnapshotForStorage =")[0] || "";
assert(submitSanitizer.includes("raw_material_id:") &&
  submitSanitizer.includes("Number(comp.raw_material_id)"),
  "Customer submitted order snapshot sanitizer must preserve actual material ID");
assert(estimate.includes('inventory_pricing_mode: "tracking_only"'),
  "Existing non-billable inventory material estimation mode must remain unchanged");
console.log("PASS: Phase A catalog identity, compatibility and no-pricing-regression static checks.");
