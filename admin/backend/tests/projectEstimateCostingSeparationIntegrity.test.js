const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const frontend = read("../frontend/src/pages/blueprints/EstimationPage.jsx");
const estimation = read("controllers/admin/blueprintController.estimation.js");
const reservation = read("services/blueprintMaterialReservationService.js");
const consumption = read("services/blueprintMaterialConsumptionService.js");

assert(
  !frontend.includes('["materials", "Materials"]') &&
    !frontend.includes('title="Required Materials"'),
  "Project Estimate must not expose the Materials tab or Required Materials table.",
);
assert(
  !frontend.includes('title="Additional Items"') &&
    !frontend.includes("Required Inventory"),
  "Project Estimate must not expose Additional Items or Required Inventory summary UI.",
);
assert(
  frontend.includes("applyEstimateCostingItemPolicy") &&
    frontend.includes("isHistoricalLockedEstimate"),
  "Editable estimates must remove Additional Items while locked historical quotations retain their original rows.",
);
assert(
  frontend.includes('.filter((item) => isFilledItem(item) && !isOtherItem(item))'),
  "Editable Project Estimate payloads must exclude Additional Items.",
);
assert(
  !frontend.includes("quotationInventoryIssues") &&
    !frontend.includes("Add the required material before sending the quotation."),
  "Frontend Send Quotation must not depend on Required Materials.",
);

const approveStart = estimation.indexOf("exports.approveEstimation = async");
assert(approveStart >= 0, "approveEstimation handler must exist.");
const approveSection = estimation.slice(approveStart);
assert(
  !approveSection.includes("checkQuotationInventoryReadiness(conn"),
  "Backend Send Quotation must not block on Required Materials/stock readiness.",
);
assert(
  estimation.includes("Additional Items are no longer part of Project Estimate") &&
    estimation.includes('["other", "manual"].includes'),
  "Backend must reject Additional Items from new/editable Project Estimate saves.",
);

assert(
  reservation.includes('reason: "NO_INVENTORY_MATERIALS"') &&
    consumption.includes('reservationReconciliation.reason === "NO_INVENTORY_MATERIALS"'),
  "Existing production flow must retain its explicit no-inventory-material compatibility path.",
);
assert(
  reservation.includes("blueprint_material_reservations") &&
    consumption.includes("stock_movements"),
  "Material reservation/consumption backend must remain intact for historical/existing tracked projects.",
);

console.log("PASS: Project Estimate costing separation integrity checks passed.");
