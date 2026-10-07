const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const read = (rel) =>
  fs.readFileSync(path.join(repoRoot, rel), "utf8").replace(/\\r\\n/g, "\\n");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const frontend = read("../frontend/src/pages/blueprints/EstimationPage.jsx");
const estimation = read("controllers/admin/blueprintController.estimation.js");
const routes = read("routes/admin.js");
const builders = read("../frontend/src/pages/blueprints/export/exportBuilders.js");
const explodedSchedule = read(
  "../frontend/src/pages/blueprints/export/explodedPartsSchedule.js",
);

assert(
  frontend.includes("const isTransactionMode = Boolean(") &&
    frontend.includes('loadedOrderId ? "request" : "estimate"'),
  "Estimation page must explicitly separate linked-order transaction mode from standalone Project Estimate mode.",
);

assert(
  frontend.includes('!isTransactionMode && activeEstimateTab === "estimate"') &&
    frontend.includes('"Project Estimate"') &&
    frontend.includes("<span>") &&
    frontend.includes('"Estimated Total"'),
  "Standalone mode must retain the simple Project Estimate calculator.",
);

assert(
  frontend.includes("{isTransactionMode &&") &&
    frontend.includes('["request", "Request"]') &&
    frontend.includes('["components", "Components"]') &&
    frontend.includes('["materials", "Materials"]') &&
    frontend.includes('["quotation", "Quotation"]'),
  "Transaction-only tabs must be restored without exposing them in standalone mode.",
);

assert(
  frontend.includes("Create Project Agreement") &&
    frontend.includes("Send Quotation") &&
    frontend.includes("isTransactionMode &&"),
  "Transaction actions must be available only in linked-order mode.",
);

const saveStart = estimation.indexOf("exports.saveEstimation = async");
const approveStart = estimation.indexOf("exports.approveEstimation = async");
assert(saveStart >= 0 && approveStart > saveStart, "Estimation controller sections are missing.");
const saveSection = estimation.slice(saveStart, approveStart);

assert(
  saveSection.includes("const isTransactionEstimate = Boolean(order);") &&
    saveSection.includes("if (isTransactionEstimate) {"),
  "Backend save must branch explicitly between standalone and transaction estimation.",
);

assert(
  saveSection.includes("UPDATE orders") &&
    saveSection.includes("SET stage = 'estimation'") &&
    saveSection.includes("if (isTransactionEstimate)"),
  "Only the transaction branch may synchronize Order financials and Blueprint workflow stage.",
);

assert(
  routes.includes('logAction("send_blueprint_estimation", "estimations")') &&
    routes.includes("blueprints.approveEstimation") &&
    !routes.includes("Project Estimation is admin-only. Sending quotations"),
  "Guarded Send Quotation route must be restored for transaction mode.",
);

const allPagesStart = builders.indexOf("function buildAllExportPages(");
assert(allPagesStart >= 0, "Blueprint export builder is missing.");
const allPages = builders.slice(allPagesStart);
assert(
  !builders.includes('import { buildWoodworkingDetailsPages }') &&
    !allPages.includes("buildWoodworkingDetailsPages({"),
  "Woodworking Details sheets must remain retired from Blueprint export.",
);

assert(
  !explodedSchedule.includes("Inventory selection remains manual in Project Estimate") &&
    !explodedSchedule.includes("<b>INVENTORY NOTE</b>"),
  "Obsolete Project Estimate inventory note must remain removed.",
);

console.log("PASS: Project Estimate standalone/transaction dual-mode integrity checks passed.");
