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
  frontend.includes('useState("estimate")') &&
    !frontend.includes('role="tablist" aria-label="Estimate sections"'),
  "Project Estimate must open as one admin-only costing view with no Request/Components/Delivery/Quotation tabs.",
);

assert(
  frontend.includes('title="Furniture Parts"') &&
    frontend.includes(">Estimate Details<") &&
    frontend.includes(">Estimate Summary<"),
  "Admin-only Project Estimate must keep Furniture Parts and the costing details/summary.",
);

assert(
  frontend.includes("<label style={labelSm}>Logistics (₱)</label>") &&
    frontend.includes('["Logistics", logisticsCost]'),
  "Logistics must remain visible and included in Project Estimate totals.",
);

assert(
  frontend.includes("<span>Estimated Total</span>") &&
    frontend.includes('doc.text("PROJECT ESTIMATE"') &&
    frontend.includes('["ESTIMATED TOTAL", money(grandTotal)]') &&
    frontend.includes("project_estimate_BP-"),
  "Project Estimate UI/PDF must use estimate wording instead of customer quotation wording.",
);

assert(
  !frontend.includes("onClick={handleSendQuoteClick}") &&
    !frontend.includes(">Create Project Agreement<"),
  "Project Estimate header must not expose Send Quotation or Create Project Agreement.",
);

assert(
  frontend.includes('activeEstimateTab === "delivery" && !isPickup'),
  "Hidden Delivery estimator must not mount in the admin-only estimate view.",
);

const saveStart = estimation.indexOf("exports.saveEstimation = async");
const approveStart = estimation.indexOf("exports.approveEstimation = async");
assert(saveStart >= 0 && approveStart > saveStart, "Estimation controller sections are missing.");
const saveSection = estimation.slice(saveStart, approveStart);

assert(
  !saveSection.includes("UPDATE orders") &&
    !saveSection.includes("SET stage = 'estimation'"),
  "Saving Project Estimate must not mutate linked Order financials or Blueprint workflow stage.",
);

assert(
  !saveSection.includes("ORDER_NOT_CONFIRMED") &&
    !saveSection.includes("CONTRACT_EXISTS") &&
    !saveSection.includes("VERIFIED_PAYMENT_EXISTS") &&
    !saveSection.includes("PENDING_PAYMENT_EXISTS"),
  "Internal Project Estimate saving must not be gated by customer order/contract/payment workflow state.",
);

assert(
  saveSection.includes("const overheadCostInput = Number(overhead_cost);") &&
    saveSection.includes("additional_delivery_fee: 0"),
  "Internal Estimate must retain Logistics while excluding editable delivery-decision fees.",
);

const retiredRouteStart = routes.indexOf('"/blueprints/:id/estimation/approve"');
assert(retiredRouteStart >= 0, "Legacy quotation route marker is missing.");
const retiredRoute = routes.slice(retiredRouteStart, retiredRouteStart + 500);
assert(
  retiredRoute.includes("status(410)") &&
    retiredRoute.includes("Project Estimation is admin-only") &&
    !retiredRoute.includes("blueprints.approveEstimation"),
  "Backend must reject attempts to send a customer quotation from Project Estimation.",
);

const allPagesStart = builders.indexOf("function buildAllExportPages(");
assert(allPagesStart >= 0, "Blueprint export builder is missing.");
const allPages = builders.slice(allPagesStart);
assert(
  !builders.includes('import { buildWoodworkingDetailsPages }') &&
    !allPages.includes("buildWoodworkingDetailsPages({"),
  "Requested Technical Blueprint — Woodworking Details sheets must be removed from Preview/PDF/Print output.",
);

assert(
  !explodedSchedule.includes("Inventory selection remains manual in Project Estimate") &&
    !explodedSchedule.includes("<b>INVENTORY NOTE</b>"),
  "Blueprint export must not claim that inventory selection happens in Project Estimate.",
);

console.log("PASS: Project Estimate admin-only integrity checks passed.");
