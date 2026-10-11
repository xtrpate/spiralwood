import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CUSTOMER_WOOD_TYPES, resolveCustomerWoodType,
  previewCustomerWoodTypes, WOOD_PREVIEW_FINISH_ID, getRequestedWoodTypeSummary,
} from "../src/pages/customer/customerWoodTypes.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const viewer = fs.readFileSync(path.join(dir, "../src/pages/customer/customer3dviewer.jsx"), "utf8");
const workbench = fs.readFileSync(path.join(dir, "../src/pages/customer/CustomerTemplateWorkbench.jsx"), "utf8");
const furnitureData = fs.readFileSync(path.join(dir, "../src/pages/blueprints/data/furnitureTypes.js"), "utf8");

test("W1R: exactly ten approved customer wood species and no browser prices", () => {
  assert.deepEqual(CUSTOMER_WOOD_TYPES.map((w) => w.label), [
    "Mahogany", "Pine", "Acacia", "Narra", "Tanguile", "Gmelina",
    "Rubberwood", "Teak", "Oak", "Maple",
  ]);
  assert.equal(new Set(CUSTOMER_WOOD_TYPES.map((w) => w.id)).size, 10);
  for (const wood of CUSTOMER_WOOD_TYPES) {
    assert.deepEqual(Object.keys(wood).sort(), ["id", "label", "swatch"]);
    assert.match(furnitureData, new RegExp('id: "' + WOOD_PREVIEW_FINISH_ID[wood.id] + '"'));
  }
  assert.equal(resolveCustomerWoodType(" NARRA "), "Narra");
  assert.equal(resolveCustomerWoodType("Marine Plywood"), "");
});

test("W1R: only ten wood choices in the whole and per-part circles, no +27", () => {
  assert.match(viewer, /aria-label="Whole Furniture Wood Type"/);
  assert.match(viewer, /\{partGroups\.map\(\(group\) => \{/);
  assert.match(viewer, /choices\.map\(\(wood\) => \(/);
  assert.match(viewer, /handleWoodTypeChange\(wood\.label, woodTargetIds\)/);
  assert.match(viewer, /handleWoodTypeChange\(wood\.label, components\.map/);
  assert.doesNotMatch(viewer, /aria-label="Wood Type"/);
  assert.doesNotMatch(viewer, /getFinishPreviewChoices|finishCatalog|\+27|showAllWoodTypes/);
  assert.equal(previewCustomerWoodTypes("", 3).length, 3);
  assert.equal(previewCustomerWoodTypes("Narra", 3)[2].label, "Narra");
});

test("W1R: mixed wood requests are represented without lying about one species", () => {
  assert.equal(getRequestedWoodTypeSummary([{ requested_wood_type: "Oak" }]), "Oak");
  assert.equal(getRequestedWoodTypeSummary([
    { requested_wood_type: "Oak" }, { requested_wood_type: "Pine" },
  ]), "Mixed Wood Types");
  assert.equal(getRequestedWoodTypeSummary([{ material: "Marine Plywood" }]), "");
  assert.match(viewer, /requested_wood_types_by_part/);
  assert.match(viewer, /metadata: summarizeMetadata\(components\)/);
});

test("W1R: preserves part structure, serializes requests through normalized cart parts", () => {
  assert.match(viewer, /material: component\.material,/);
  assert.match(viewer, /requested_wood_type: chosen\.label/);
  assert.match(viewer, /requested_wood_type: ""/);
  assert.match(workbench, /requested_wood_type: resolveCustomerWoodType\(item\?\.requested_wood_type\)/);
  assert.match(workbench, /components: normalizedComponents/);
  assert.match(workbench, /wood_type: woodType/);
  assert.match(viewer, /const CUSTOMER_PART_GEOMETRY_EDITING_ENABLED = false/);
});
