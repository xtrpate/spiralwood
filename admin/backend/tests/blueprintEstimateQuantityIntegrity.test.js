const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  buildCanonicalBlueprintPartQuantities,
  validateBlueprintEstimateQuantities,
} = require("../utils/blueprintEstimateQuantityIntegrity");

const makeLegDesign = () => ({
  components: [1, 2, 3, 4].map((index) => ({
    id: `leg-${index}`,
    label: `Leg #${index}`,
    material: "Oak",
    width: 40,
    height: 700,
    depth: 40,
    qty: 1,
  })),
});

const validLegRow = (quantity, rate = 900) => ({
  name: "Legs",
  quantity,
  unit: "pc",
  unit_cost: rate,
  note: "Oak · 40×700×40 mm",
  source_key: "group:legs",
  source_type: "component",
});

const expectMismatch = (fn) => {
  assert.throws(fn, (error) => {
    assert.strictEqual(error.code, "BLUEPRINT_PART_QUANTITY_MISMATCH");
    assert.strictEqual(error.statusCode, 409);
    return true;
  });
};

// Four physical Blueprint legs must remain quantity four, regardless of an
// old saved estimate rate.
const design = makeLegDesign();
const expected = buildCanonicalBlueprintPartQuantities(design, 1);
assert.strictEqual(expected.size, 1);
assert.strictEqual([...expected.values()][0].quantity, 4);

assert.doesNotThrow(() =>
  validateBlueprintEstimateQuantities({
    designData: design,
    orderQuantity: 1,
    items: [validLegRow(4, 1250)],
  }),
);

// Historical fan-out corruption (four rows each carrying qty 4 = 16) must fail.
expectMismatch(() =>
  validateBlueprintEstimateQuantities({
    designData: design,
    orderQuantity: 1,
    items: [1, 2, 3, 4].map(() => validLegRow(4)),
  }),
);

// Order quantity is multiplied exactly once.
assert.doesNotThrow(() =>
  validateBlueprintEstimateQuantities({
    designData: design,
    orderQuantity: 2,
    items: [validLegRow(8, 1500)],
  }),
);

expectMismatch(() =>
  validateBlueprintEstimateQuantities({
    designData: design,
    orderQuantity: 2,
    items: [validLegRow(4, 1500)],
  }),
);

// Rate may change; structural quantity may not.
assert.doesNotThrow(() =>
  validateBlueprintEstimateQuantities({
    designData: design,
    orderQuantity: 1,
    items: [
      validLegRow(4, 9999),
      {
        name: "Rush carving",
        quantity: 1,
        unit: "pc",
        unit_cost: 500,
        source_type: "other",
        source_key: "other:rush",
      },
      {
        name: "Oak Board",
        quantity: 3,
        unit: "board",
        unit_cost: 0,
        raw_material_id: 10,
        source_type: "inventory_material",
      },
    ],
  }),
);

// Regression from Blueprint #254 runtime evidence:
// expected "shelf|1764×18×560|pc" qty 3
// actual legacy row "shelf (oak natural)|1764×18×560|pc" qty 3.
const shelfDesign = {
  components: [1, 2, 3].map((index) => ({
    id: `shelf-${index}`,
    label: `Shelf ${index}`,
    material: "Plywood + Laminate",
    width: 1764,
    height: 18,
    depth: 560,
    qty: 1,
  })),
};

const legacyDecoratedShelf = (quantity) => ({
  name: "Shelf (Oak Natural)s",
  quantity,
  unit: "pc",
  unit_cost: 1000,
  note: "Oak Natural · Plywood + Laminate · 1764×18×560 mm",
  source_key: "group:legacy-shelf",
  source_type: "component",
});

assert.doesNotThrow(() =>
  validateBlueprintEstimateQuantities({
    designData: shelfDesign,
    orderQuantity: 1,
    items: [legacyDecoratedShelf(3)],
  }),
);

expectMismatch(() =>
  validateBlueprintEstimateQuantities({
    designData: shelfDesign,
    orderQuantity: 1,
    items: [legacyDecoratedShelf(2)],
  }),
);

expectMismatch(() =>
  validateBlueprintEstimateQuantities({
    designData: shelfDesign,
    orderQuantity: 1,
    items: [legacyDecoratedShelf(4)],
  }),
);

// Area cut-list quantities also honor the order multiplier.
const areaDesign = {
  conversionCutListRows: [
    {
      id: "panel-a",
      sampleLabel: "Side Panel",
      material: "Plywood",
      widthMm: 500,
      heightMm: 700,
      depthMm: 18,
      thicknessMm: 18,
      estimationUnit: "panel_area",
      totalAreaSqM: 0.35,
      qty: 1,
    },
  ],
};

assert.doesNotThrow(() =>
  validateBlueprintEstimateQuantities({
    designData: areaDesign,
    orderQuantity: 2,
    items: [
      {
        name: "Side Panel",
        quantity: 0.7,
        unit: "sq.m",
        unit_cost: 2500,
        note: "Plywood · 500×700×18 mm · 18 mm thick",
        source_type: "cutlist",
        source_key: "panel-a",
      },
    ],
  }),
);

// Static regression checks for the frontend and controller wiring.
const frontendPath = path.join(
  __dirname,
  "../../frontend/src/pages/blueprints/EstimationPage.jsx",
);
const controllerPath = path.join(
  __dirname,
  "../controllers/admin/blueprintController.estimation.js",
);

const frontendSource = fs.readFileSync(frontendPath, "utf8");
const controllerSource = fs.readFileSync(controllerPath, "utf8");

assert(
  frontendSource.includes("const getBlueprintOrderQuantity = (blueprint = {}) =>"),
  "Frontend must derive the linked order quantity.",
);
assert(
  frontendSource.includes("buildPreferredAutoItems(parsedDesign, blueprintOrderQuantity)"),
  "Frontend auto rows must apply the order quantity.",
);
assert(
  frontendSource.includes("disabled={readOnly || isBlueprint}"),
  "Blueprint structural fields must be locked in Project Estimate.",
);

const mergeStart = frontendSource.indexOf("const mergeAutoRows = (");
const mergeEnd = frontendSource.indexOf(
  "const reconcileLoadedItems =",
  mergeStart,
);
assert(mergeStart >= 0 && mergeEnd > mergeStart);
const mergeSource = frontendSource.slice(mergeStart, mergeEnd);
assert(
  !mergeSource.includes("Number(match.quantity"),
  "Saved historical quantity must never overwrite the latest Blueprint quantity.",
);
assert(
  !mergeSource.includes("normalizeText(match.unit)"),
  "Saved historical unit must never overwrite the latest Blueprint unit.",
);
assert(
  !mergeSource.includes("normalizeText(match.note)"),
  "Saved historical notes must never overwrite the latest Blueprint structure.",
);

const condenseStart = frontendSource.indexOf("const condenseAutoItems =");
const condenseEnd = frontendSource.indexOf(
  "const buildAutoItemsFromComponents =",
  condenseStart,
);
assert(condenseStart >= 0 && condenseEnd > condenseStart);
const condenseSource = frontendSource.slice(condenseStart, condenseEnd);
assert(
  !condenseSource.includes("${row.name}s"),
  "Grouped Blueprint structural labels must not append a plural suffix after finish metadata.",
);

assert(
  controllerSource.includes("validateBlueprintEstimateQuantities({"),
  "Backend save path must validate Blueprint-part quantities.",
);
assert(
  controllerSource.includes("ORDER BY id ASC") &&
    controllerSource.includes("LIMIT 1") &&
    controllerSource.includes("FOR UPDATE"),
  "Backend must read the linked order-item quantity under the save transaction.",
);

console.log(
  "PASS: Project Estimate quantity integrity, Blueprint-authoritative structure, order multiplier, rate-only preservation, and backend guard checks passed.",
);
