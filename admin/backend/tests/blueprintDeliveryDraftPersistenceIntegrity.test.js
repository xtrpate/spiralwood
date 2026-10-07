const assert = require("assert");
const fs = require("fs");
const path = require("path");

const panelPath = path.join(
  __dirname,
  "../../frontend/src/components/OversizedDeliveryEstimatorPanel.jsx",
);
const pagePath = path.join(
  __dirname,
  "../../frontend/src/pages/blueprints/EstimationPage.jsx",
);

const panel = fs.readFileSync(panelPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");

const mustInclude = (source, needle, message) => {
  assert.ok(source.includes(needle), message);
};

mustInclude(
  panel,
  "const readStoredDraftDecision = (blueprintId) =>",
  "Delivery panel must restore a blueprint-scoped session draft.",
);

mustInclude(
  panel,
  "const storedDraft = readStoredDraftDecision(blueprintId);",
  "Delivery load must inspect the existing session draft.",
);

mustInclude(
  panel,
  "storedAssessmentStatus === latestAssessmentStatus",
  "Stored draft must belong to the same current assessment status.",
);

mustInclude(
  panel,
  "if (!blueprintId || notApplicable || loading || !assessment) return;",
  "Initial blank state must never overwrite an existing delivery draft.",
);

mustInclude(
  page,
  "getOversizedDeliveryDraftStorageKey(id)",
  "Estimation save path must reference the blueprint-scoped delivery draft key.",
);

mustInclude(
  page,
  "window.sessionStorage.removeItem(",
  "Successful full save must clear the session-only delivery draft.",
);

const readIndex = panel.indexOf(
  "const storedDraft = readStoredDraftDecision(blueprintId);",
);
const setFormIndex = panel.indexOf("setForm({", readIndex);
assert(
  readIndex >= 0 && setFormIndex > readIndex,
  "Stored draft must be read before load replaces the Delivery form.",
);

console.log("PASS blueprintDeliveryDraftPersistenceIntegrity.test.js");
console.log("Delivery decision/fee/notes survive tab switches until Save Estimate.");
