const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs
    .readFileSync(path.join(repoRoot, relativePath), "utf8")
    .replace(/\r\n/g, "\n");

const header = read(
  "admin/frontend/src/pages/blueprints/components/BlueprintEditorHeader.jsx",
);
const design = read("admin/frontend/src/pages/blueprints/BlueprintDesign.jsx");
const hook = read(
  "admin/frontend/src/pages/blueprints/hooks/useBlueprintExport.js",
);
const builders = read(
  "admin/frontend/src/pages/blueprints/export/exportBuilders.js",
);
const sheetUtils = read(
  "admin/frontend/src/pages/blueprints/export/exportSheetUtils.js",
);
const dataUtils = read("admin/frontend/src/pages/blueprints/data/utils.js");
const pdfExport = read(
  "admin/frontend/src/pages/blueprints/export/blueprintPdfDownload.js",
);
const packageJson = JSON.parse(
  read("admin/frontend/package.json"),
);
const packageLock = JSON.parse(
  read("admin/frontend/package-lock.json"),
);

assert(header.includes("Preview Sheets"), "Preview Sheets button is missing");
assert(header.includes("Download PDF"), "Download PDF button is missing");
assert(header.includes("Print Sheets"), "Print Sheets button is missing");
assert(
  !header.includes(">\n              Export Sheets\n"),
  "Old Export Sheets label is still present",
);

assert(
  hook.includes('component.type !== "reference_proxy"'),
  "Reference proxy filtering is missing",
);
assert(
  hook.includes("hasUnsavedDesignChanges"),
  "Unsaved output guard is missing",
);
assert(
  hook.includes("designValidationReport?.errors"),
  "Validation error guard is missing",
);
assert(
  hook.includes("downloadBlueprintPdf"),
  "PDF download integration is missing",
);
assert(
  !hook.includes("selectedComp ? selectedComponents : components"),
  "Output still silently changes scope based on selection",
);

assert(
  design.includes("previewExportSheets={previewExportSheets}"),
  "BlueprintDesign does not pass preview output action",
);
assert(
  design.includes("downloadExportPdf={downloadExportPdf}"),
  "BlueprintDesign does not pass PDF output action",
);
assert(
  design.includes("designValidationReport"),
  "BlueprintDesign validation report wiring is missing",
);

assert(
  sheetUtils.includes("if (projectText) return projectText;"),
  "Blueprint project title is not preserved",
);
assert(
  dataUtils.includes('timeZone: "Asia/Manila"'),
  "Blueprint date is not pinned to Asia/Manila",
);
assert(builders.includes("Parts Share"), "Material Parts Share label is missing");
assert(
  builders.includes("sharePct: totalQty > 0"),
  "Material share is not based on part quantity",
);
assert(
  builders.includes("size: A4 landscape;"),
  "Print output is not set to A4 landscape",
);

const allPagesStart = builders.indexOf("function buildAllExportPages(");
assert(allPagesStart >= 0, "buildAllExportPages is missing");
const allPagesBody = builders.slice(allPagesStart);
const orthographicIndex = allPagesBody.indexOf('["front", "back", "left", "right", "top", "exploded"]');
const threeDIndex = allPagesBody.indexOf("build3DViewPageSvg({");
assert(orthographicIndex >= 0, "Orthographic output block is missing");
assert(threeDIndex >= 0, "3D output block is missing");
assert(
  orthographicIndex < threeDIndex,
  "3D sheet is still generated before A-101 through A-106",
);

assert(
  packageJson.dependencies?.html2canvas === "1.4.1",
  "html2canvas must be a pinned direct dependency",
);
assert(
  packageLock.packages?.[""]?.dependencies?.html2canvas === "1.4.1",
  "package-lock root does not pin html2canvas",
);
assert(
  packageLock.packages?.["node_modules/html2canvas"]?.version === "1.4.1",
  "package-lock html2canvas package is missing",
);
assert(
  packageLock.packages?.["node_modules/html2canvas"]?.optional !== true,
  "html2canvas is still optional even though PDF download requires it",
);

assert(
  pdfExport.includes('import html2canvas from "html2canvas"'),
  "html2canvas renderer is not used",
);
assert(pdfExport.includes('from "jspdf"'), "jsPDF dependency is not used");
assert(
  pdfExport.includes('frame.srcdoc = html'),
  "Isolated PDF render frame is missing",
);
assert(
  pdfExport.includes("html2canvas(page"),
  "Blueprint sheet DOM capture is missing",
);
assert(pdfExport.includes("pdf.save(filename)"), "PDF save action is missing");
assert(
  pdfExport.includes('timeZone: "Asia/Manila"'),
  "PDF filename date is not pinned to Asia/Manila",
);

assert(
  builders.includes("ORTHOGRAPHIC_DIMENSION_GUTTER_X = 56"),
  "Orthographic sheets do not reserve horizontal dimension space",
);
assert(
  builders.includes("TOP_VIEW_HEADER_GUTTER_Y = 50"),
  "Top View does not reserve a header-safe dimension band",
);
assert(
  builders.includes("function applyOrthographicDimensionGutters"),
  "Orthographic dimension-gutter layout helper is missing",
);
assert(
  builders.includes('view === "top"'),
  "Top View safe-header layout branch is missing",
);
assert(
  builders.includes("applyOrthographicDimensionGutters({"),
  "2D export does not apply safe dimension gutters",
);

console.log("PASS: Blueprint output/download integrity checks passed.");
