"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..", "..");
const controllerPath = path.join(
  root,
  "admin",
  "backend",
  "controllers",
  "staff",
  "pos.fulfillment.js",
);
const routePath = path.join(
  root,
  "admin",
  "backend",
  "routes",
  "pos.fulfillment.js",
);
const riderUiPath = path.join(
  root,
  "admin",
  "frontend",
  "src",
  "pages",
  "staff",
  "DeliveryManagement.jsx",
);

const controller = fs.readFileSync(controllerPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const riderUi = fs.readFileSync(riderUiPath, "utf8");

assert.match(
  controller,
  /if \(isCompletingDeliveryNow\) \{[\s\S]*?isActiveDeliveryRider\(req\.user\)[\s\S]*?Only the assigned active delivery rider may complete this delivery\./,
  "all actual delivery completion must be assigned-active-rider only",
);

assert.match(
  controller,
  /if \(isCompletingDeliveryNow\) \{[\s\S]*?if \(!uploadedReceiptPath\)[\s\S]*?fresh Proof of Delivery photo/,
  "all actual delivery completion must require a fresh POD",
);

assert.match(
  route,
  /\/deliveries\/:id\/retry-collection[\s\S]*?retryDeliveryCollection/,
  "payment-only retry route must be wired",
);

assert.match(
  controller,
  /exports\.retryDeliveryCollection = async[\s\S]*?orderStatus !== "delivered" \|\| deliveryStatus !== "delivered"/,
  "payment recovery must stay scoped to already Delivered handoffs",
);

assert.match(
  controller,
  /exports\.retryDeliveryCollection = async[\s\S]*?NO_REJECTED_DELIVERY_COLLECTION/,
  "payment recovery must require prior rejected rider collection history",
);

assert.match(
  controller,
  /exports\.retryDeliveryCollection = async[\s\S]*?hasPendingPayment[\s\S]*?DELIVERY_COLLECTION_REVIEW_PENDING/,
  "payment recovery must block duplicate pending review rows",
);

assert.match(
  controller,
  /Corrected collection submitted after a rejected rider payment\.[\s\S]*?VALUES \(\?, \?, 'cash', \?, NULL, NULL, 'pending', \?\)/,
  "payment recovery must create a new pending cash transaction instead of rewriting history",
);

assert.match(
  controller,
  /delivery_status_unchanged: true[\s\S]*?proof_of_delivery_unchanged: true[\s\S]*?acknowledgement_unchanged: true/,
  "audit record must state that delivery evidence remains unchanged",
);

assert.match(
  riderUi,
  /Record Payment Again/,
  "rider UI must expose rejected-payment recovery",
);

assert.match(
  riderUi,
  /Use Undo Delivery only if this order was marked[\s\S]*?Delivered by mistake\./,
  "Undo Delivery wording must be limited to physical delivery-status correction",
);

assert.doesNotMatch(
  riderUi,
  /undo it to correct the collection\s+amount or proof of delivery/i,
  "old wording must not tell riders to Undo Delivery for payment or POD-only corrections",
);

console.log(
  "✅ Delivery C2 rider completion / rejected-payment recovery policy integrity checks passed.",
);
