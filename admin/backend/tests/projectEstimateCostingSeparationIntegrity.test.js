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
  frontend.includes('["materials", "Materials"]') &&
    frontend.includes('title="Required Materials"') &&
    frontend.includes("isTransactionMode"),
  "Required Materials must be restored only for linked customer transactions.",
);

assert(
  !frontend.includes('title="Additional Items"') &&
    !frontend.includes("addOtherItem"),
  "Additional Items must remain retired from new/editable estimation costing.",
);

assert(
  frontend.includes("applyEstimateCostingItemPolicy") &&
    frontend.includes("isHistoricalLockedEstimate"),
  "Editable estimates must still remove Additional Items while locked historical quotations retain their original rows.",
);

assert(
  frontend.includes('.filter((item) => isFilledItem(item) && !isOtherItem(item))'),
  "Editable payloads must continue excluding Additional Items.",
);

assert(
  frontend.includes("quotationInventoryIssues") &&
    frontend.includes("Add the required material before sending the quotation."),
  "Transaction Send Quotation must depend on Required Materials readiness.",
);

const approveStart = estimation.indexOf("exports.approveEstimation = async");
assert(approveStart >= 0, "approveEstimation handler must exist.");
const approveSection = estimation.slice(approveStart);
assert(
  approveSection.includes("checkQuotationInventoryReadiness(conn") &&
    approveSection.includes("INVENTORY_NOT_READY_FOR_QUOTATION"),
  "Backend Send Quotation must re-check required inventory and stock readiness.",
);

assert(
  estimation.includes("Additional Items are no longer part of Project Estimate") &&
    estimation.includes('["other", "manual"].includes'),
  "Backend must continue rejecting Additional Items from new/editable saves.",
);

assert(
  reservation.includes('reason: "NO_INVENTORY_MATERIALS"') &&
    consumption.includes('reservationReconciliation.reason === "NO_INVENTORY_MATERIALS"'),
  "Production material reservation/consumption compatibility path must remain intact.",
);

assert(
  reservation.includes("blueprint_material_reservations") &&
    consumption.includes("stock_movements"),
  "Material reservation/consumption backend must remain intact.",
);

console.log("PASS: Project Estimate transaction material separation checks passed.");
