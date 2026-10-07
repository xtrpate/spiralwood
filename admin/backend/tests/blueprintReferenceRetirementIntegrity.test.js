const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..", "..");

const read = (rel) =>
  fs.readFileSync(path.join(repoRoot, rel), "utf8").replace(/\r\n/g, "\n");
const exists = (rel) => fs.existsSync(path.join(repoRoot, rel));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const design = read("admin/frontend/src/pages/blueprints/BlueprintDesign.jsx");
const header = read(
  "admin/frontend/src/pages/blueprints/components/BlueprintEditorHeader.jsx",
);
const loader = read(
  "admin/frontend/src/pages/blueprints/hooks/useBlueprintLoader.js",
);
const persistence = read(
  "admin/frontend/src/pages/blueprints/hooks/useBlueprintPersistence.js",
);
const canvas = read(
  "admin/frontend/src/pages/blueprints/2d/blueprintComponents.jsx",
);
const canvasModel = read(
  "admin/frontend/src/pages/blueprints/2d/useBlueprintCanvasModel.js",
);
const list = read("admin/frontend/src/pages/blueprints/BlueprintsPage.jsx");
const compat = read(
  "admin/frontend/src/pages/blueprints/data/blueprintCompatibilityUtils.js",
);
const upload = read("admin/backend/config/upload.js");
const routes = read("admin/backend/routes/admin.js");
const helpers = read(
  "admin/backend/controllers/admin/blueprintController.helpers.js",
);
const crud = read(
  "admin/backend/controllers/admin/blueprintController.crud.js",
);
const estimation = read(
  "admin/backend/controllers/admin/blueprintController.estimation.js",
);
const customerWorkbench = read(
  "admin/frontend/src/pages/customer/CustomerTemplateWorkbench.jsx",
);

[
  "Reference Status",
  "Reference Tools",
  "Trace Rect",
  "Set Scale",
  "Clear Traces",
  "Clear Scale",
  "Convert Reference",
  "Re-convert Reference",
  "useBlueprintReferenceWorkspace",
  "hasAnyReferenceFile",
  '"REFERENCE MODE"',
  '"No reference loaded"',
  "Reference ready ·",
].forEach((text) =>
  assert(!design.includes(text), `Blueprint editor still contains retired Reference UI/state: ${text}`),
);

assert(
  !header.includes('["reference", "editable"]') &&
    !header.includes("switchToReferenceMode") &&
    !header.includes("switchToEditableMode"),
  "Blueprint header still exposes retired Reference/Editable mode switching.",
);

assert(
  !canvas.includes("REFERENCE IMAGE") &&
    !canvas.includes("REFERENCE PDF LOADED") &&
    !canvas.includes("traceObjects") &&
    !canvas.includes("referenceCalibration"),
  "2D Blueprint canvas still contains reference/tracing behavior.",
);

assert(
  !canvasModel.includes("referenceFile") &&
    !canvasModel.includes("useReferenceImage"),
  "Canvas model still loads reference images.",
);

assert(
  !loader.includes("referenceFiles") &&
    !loader.includes("referenceCalibration") &&
    !loader.includes("traceObjects") &&
    !loader.includes("setEditorMode"),
  "Blueprint loader still initializes retired reference/tracing state.",
);

assert(
  persistence.includes('"reference_files"') &&
    persistence.includes("delete cleanedSavedDesignData[key]"),
  "Blueprint persistence must strip legacy reference metadata on future saves.",
);

assert(
  !persistence.includes("\n        importComments,") &&
    persistence.includes("...(cleanedSavedDesignData?.blueprintSetup || {})"),
  "Blueprint persistence still rewrites retired import metadata.",
);

assert(
  !list.includes("EMPTY_REFERENCE_FILES") &&
    !list.includes("traceObjectsByView") &&
    !list.includes("referenceCalibrationByView") &&
    !list.includes("Open Source File") &&
    !list.includes("isImported") &&
    !list.includes("function getBlueprintIcon("),
  "Blueprint list/create flow still contains import/reference UI or seed data.",
);

assert(
  !upload.includes("front_reference") &&
    !upload.includes("back_reference") &&
    !upload.includes("left_reference") &&
    !upload.includes("right_reference") &&
    !upload.includes("top_reference") &&
    !upload.includes("reference_file") &&
    !upload.includes("uploadBlueprintFile"),
  "Backend upload config still accepts Blueprint import/reference files.",
);

assert(
  !routes.includes("upload.uploadBlueprintFile"),
  "Blueprint routes still invoke retired Blueprint file upload middleware.",
);

[
  "buildUploadedReferenceFiles",
  "normalizeReferenceFilesMap",
  "normalizeReferenceFile",
  "hasAnyReferenceFiles",
  "REFERENCE_VIEWS",
  "getBlueprintFileMeta",
  "normalizeSource",
].forEach((name) => {
  assert(!helpers.includes(name), `Backend helper still exposes ${name}.`);
  assert(!crud.includes(name), `Blueprint CRUD still uses ${name}.`);
});

assert(
  !helpers.includes("module.exports = {\n  path,"),
  "Backend helper still exports removed path symbol.",
);

assert(
  !crud.includes("req.referenceFiles") &&
    !crud.includes("req.file") &&
    !crud.includes("hasUploadedReferenceFiles") &&
    !crud.includes("\n  path,"),
  "Blueprint CRUD still contains retired Blueprint upload state.",
);

assert(
  !estimation.includes("\n  path,"),
  "Estimation controller still destructures the retired helper path export.",
);

[
  "admin/frontend/src/pages/blueprints/hooks/useBlueprintReferenceWorkspace.js",
  "admin/frontend/src/pages/blueprints/2d/useBlueprintTraceInteraction.js",
  "admin/frontend/src/pages/blueprints/data/referenceTraceUtils.js",
  "admin/frontend/src/pages/blueprints/data/conversionCutListUtils.js",
  "admin/frontend/src/pages/utils.js",
].forEach((rel) =>
  assert(!exists(rel), `Retired legacy file still exists: ${rel}`),
);

assert(
  compat.includes("importTemplateType") &&
    compat.includes("DEFAULT_IMPORT_DIMENSIONS"),
  "Required customer/template compatibility aliases were removed.",
);

assert(
  customerWorkbench.includes("reference_photos") &&
    customerWorkbench.includes("MAX_REFERENCE_PHOTOS"),
  "Customer customization reference photos must remain untouched.",
);

console.log("PASS: BP-REF-1 retirement integrity including runtime guards.");
