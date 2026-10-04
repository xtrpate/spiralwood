"use strict";

const assert = require("assert");
const {
  CANCELLATION_RESOLUTION,
  classifyCancellationResolution,
  isPostProductionWithdrawal,
} = require("../services/blueprintCancellationPolicy");

assert.strictEqual(
  classifyCancellationResolution("confirmed"),
  CANCELLATION_RESOLUTION.PRE_PRODUCTION,
);
assert.strictEqual(
  classifyCancellationResolution("contract_released"),
  CANCELLATION_RESOLUTION.PRE_PRODUCTION,
);
assert.strictEqual(
  classifyCancellationResolution("production"),
  CANCELLATION_RESOLUTION.POST_PRODUCTION,
);
assert.strictEqual(
  classifyCancellationResolution("ready_for_pickup"),
  CANCELLATION_RESOLUTION.POST_PRODUCTION,
);
assert.strictEqual(
  classifyCancellationResolution("shipping"),
  CANCELLATION_RESOLUTION.POST_PRODUCTION,
);
assert.strictEqual(
  isPostProductionWithdrawal({
    resolution_type: CANCELLATION_RESOLUTION.POST_PRODUCTION,
  }),
  true,
);
assert.strictEqual(
  isPostProductionWithdrawal({
    resolution_type: CANCELLATION_RESOLUTION.PRE_PRODUCTION,
  }),
  false,
);

console.log("PASS: post-production withdrawal policy classification");
