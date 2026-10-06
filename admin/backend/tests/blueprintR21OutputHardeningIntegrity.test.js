const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs
    .readFileSync(path.join(repoRoot, relativePath), "utf8")
    .replace(/\r\n/g, "\n");

async function loadPureEsm(relativePath) {
  const source = read(relativePath);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(url);
}

(async () => {
  const utilsPath =
    "admin/frontend/src/pages/blueprints/data/technicalOutputUtils.js";
  const utils = await loadPureEsm(utilsPath);

  assert.strictEqual(
    utils.getOfficialOutputFidelityIssues([
      {
        id: "plain",
        type: "wr_shelf",
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
      },
    ]).length,
    0,
    "Normal unrotated rectangular production part must remain officially exportable",
  );

  const rotationIssues = utils.getOfficialOutputFidelityIssues([
    {
      id: "rotated",
      type: "wr_shelf",
      partCode: "P-01",
      rotationZ: 15,
    },
  ]);
  assert.strictEqual(rotationIssues.length, 1, "Rotated part must be detected");
  assert(
    rotationIssues[0].reasons.includes("rotation"),
    "Rotation fidelity reason is missing",
  );

  const profileIssues = utils.getOfficialOutputFidelityIssues([
    { id: "profile", type: "wood_profile_oval" },
  ]);
  assert.strictEqual(
    profileIssues.length,
    1,
    "Custom woodworking profile must be detected",
  );
  assert(
    profileIssues[0].reasons.includes("custom_profile"),
    "Custom-profile fidelity reason is missing",
  );


  const smallPlan = utils.buildMaterialsPaginationPlan(
    Array.from({ length: 9 }, (_, index) => ({ index })),
    [{ material: "Oak" }],
  );
  assert.strictEqual(smallPlan.combined, true, "Small cut list must stay on one page");
  assert.strictEqual(smallPlan.totalPages, 1, "Small cut list page count changed");

  const largeRows = Array.from({ length: 22 }, (_, index) => ({ index }));
  const largePlan = utils.buildMaterialsPaginationPlan(
    largeRows,
    [{ material: "Oak" }, { material: "Plywood" }],
  );
  assert.strictEqual(largePlan.combined, false, "Large cut list must paginate");
  assert.deepStrictEqual(
    largePlan.partPages.map((rows) => rows.length),
    [13, 9],
    "22-part cut list must split into deterministic continuation pages",
  );
  assert.strictEqual(
    largePlan.totalPages,
    3,
    "22-part cut list must produce one summary plus two cut-list pages",
  );
  assert.deepStrictEqual(
    largePlan.partPages.flat(),
    largeRows,
    "Pagination must not lose, duplicate, or reorder cut-list rows",
  );

  const rightPlacement = utils.getSafeVerticalDimensionPlacement(
    { minX: 100, maxX: 400 },
    { x: 50, w: 500 },
    28,
    20,
  );
  assert.strictEqual(rightPlacement.side, "right", "Safe right side should be preferred");
  assert.strictEqual(rightPlacement.anchorX, 400);
  assert.strictEqual(rightPlacement.offset, 28);

  const leftPlacement = utils.getSafeVerticalDimensionPlacement(
    { minX: 120, maxX: 525 },
    { x: 50, w: 500 },
    28,
    20,
  );
  assert.strictEqual(leftPlacement.side, "left", "Crowded right side must fall back left");
  assert.strictEqual(leftPlacement.anchorX, 120);
  assert.strictEqual(leftPlacement.offset, -28);

  const hook = read(
    "admin/frontend/src/pages/blueprints/hooks/useBlueprintExport.js",
  );
  const builders = read(
    "admin/frontend/src/pages/blueprints/export/exportBuilders.js",
  );
  const model = read(
    "admin/frontend/src/pages/blueprints/2d/useBlueprintCanvasModel.js",
  );
  const canvas = read(
    "admin/frontend/src/pages/blueprints/2d/blueprintComponents.jsx",
  );
  const paper = read(
    "admin/frontend/src/pages/blueprints/2d/blueprintPaperComponents.jsx",
  );

  assert(
    hook.includes("getOfficialOutputFidelityIssues"),
    "Official output fidelity guard is not wired",
  );
  assert(
    hook.includes("PREVIEW ONLY"),
    "Preview-only fidelity warning is missing",
  );
  assert(
    hook.includes("Official PDF/Print is blocked"),
    "Official PDF/Print block message is missing",
  );
  assert(
    builders.includes("buildMaterialsPaginationPlan"),
    "Materials pagination plan is not wired",
  );
  assert(
    builders.includes("buildMaterialsPagesHtml"),
    "Materials multi-page builder is missing",
  );
  assert(
    builders.includes("materials-continuation-note"),
    "Materials continuation notice is missing",
  );
  assert(
    model.includes("BLUEPRINT_METADATA_BAND_H"),
    "2D metadata safe-band reservation is missing",
  );
  assert(
    canvas.includes("metadataBand"),
    "2D metadata band is not rendered",
  );
  assert(
    canvas.includes("scaledItems.length <= 1"),
    "Multi-part orthographic inline-label suppression is missing",
  );
  assert(
    !canvas.includes("scaledItems.length <= 8 || isSelected"),
    "Old dense-label threshold still allows multi-part label collisions",
  );
  assert(
    canvas.includes("getSafeVerticalDimensionPlacement"),
    "Live 2D dimension safe-side helper is missing",
  );
  assert(
    builders.includes("getSafeVerticalDimensionPlacement"),
    "Export dimension safe-side helper is missing",
  );
  assert(
    paper.includes('align={isRightSide ? "left" : "right"}'),
    "Left-side vertical dimension text alignment is missing",
  );
  assert(
    paper.includes("compactTitleBlockDimensions"),
    "Live title-block dimension compaction is missing",
  );
  assert(
    paper.includes("width={100}"),
    "Live title-block dimensions are not constrained to their own column",
  );
  assert(
    paper.includes("text={dimensionValue}"),
    "Live title-block dimensions do not use the compact value",
  );

  console.log("PASS: Blueprint R2.1 output hardening integrity checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
