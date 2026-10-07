const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const frontend = read("../frontend/src/pages/blueprints/EstimationPage.jsx");
const crud = read("controllers/admin/blueprintController.crud.js");
const estimation = read("controllers/admin/blueprintController.estimation.js");
const routes = read("routes/admin.js");

assert(
  crud.includes("o.fulfillment_method") &&
    crud.includes("fulfillment_method:") &&
    crud.includes('? "pickup"') &&
    crud.includes(': "delivery"'),
  "Blueprint order_context must expose canonical pickup/delivery fulfillment.",
);

assert(
  frontend.includes('fulfillmentMethod: "unknown"') &&
    frontend.includes("const isFulfillmentResolved =") &&
    frontend.includes('fulfillmentMethod === "pickup"') &&
    frontend.includes('fulfillmentMethod === "delivery"') &&
    !frontend.includes('blueprint?.order_context?.fulfillment_method || "delivery"'),
  "Frontend must fail closed until Pickup or Delivery is explicitly resolved.",
);

assert(
  frontend.includes('...(isDelivery ? [["delivery", "Delivery"]] : [])') &&
    frontend.includes("isTransactionMode && !isFulfillmentResolved") &&
    frontend.includes("(!isTransactionMode || isDelivery)"),
  "Delivery UI and Logistics must render only after canonical Delivery resolution.",
);

assert(
  frontend.includes('["materials", "Materials"]') &&
    frontend.includes('title="Required Materials"') &&
    frontend.includes("getQuotationInventoryIssues"),
  "Transaction mode must restore inventory-connected Required Materials.",
);

assert(
  frontend.includes("OversizedDeliveryEstimatorPanel") &&
    frontend.includes("isTransactionMode") &&
    frontend.includes("transactionDeliveryFee"),
  "Delivery transaction mode must restore oversized-delivery review without affecting standalone mode.",
);

const saveStart = estimation.indexOf("exports.saveEstimation = async");
const approveStart = estimation.indexOf("exports.approveEstimation = async");
const saveSection = estimation.slice(saveStart, approveStart);

[
  "ORDER_NOT_CONFIRMED",
  "CONTRACT_EXISTS",
  "VERIFIED_PAYMENT_EXISTS",
  "PENDING_PAYMENT_EXISTS",
].forEach((marker) =>
  assert(saveSection.includes(marker), "Missing transaction lifecycle gate: " + marker),
);

assert(
  saveSection.includes("const overheadCostInput = isPickupOrder ? 0") &&
    saveSection.includes("preservedAdditionalDeliveryFee") &&
    saveSection.includes("if (isPickupOrder)") &&
    saveSection.includes("} else {") &&
    saveSection.includes("oversized_delivery_decision"),
  "Pickup must zero Logistics and clear stale delivery metadata while Delivery preserves its reviewed decision.",
);

assert(
  saveSection.includes("UPDATE orders") &&
    saveSection.includes("down_payment = ?") &&
    saveSection.includes("Number((totals.grand_total * 0.3).toFixed(2))"),
  "Linked-order estimation save must synchronize quotation totals and the 30% down payment.",
);

const approveSection = estimation.slice(approveStart);
assert(
  approveSection.includes("PICKUP_DELIVERY_CHARGE_CONFLICT") &&
    approveSection.includes("checkQuotationInventoryReadiness(conn") &&
    approveSection.includes("SET status = 'sent'") &&
    approveSection.includes('changeType: "quotation_sent"'),
  "Send Quotation must reject stale Pickup delivery charges before stock readiness and atomic draft-to-sent transition.",
);

assert(
  routes.includes('logAction("send_blueprint_estimation", "estimations")') &&
    routes.includes("blueprints.approveEstimation"),
  "Transaction Send Quotation route must be active and audited.",
);

console.log("PASS: Transaction Estimation / Pickup / Delivery restoration integrity checks passed.");
