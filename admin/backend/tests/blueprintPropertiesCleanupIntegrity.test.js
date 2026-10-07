const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const propertiesPath = path.join(
  repoRoot,
  "admin/frontend/src/pages/blueprints/3d/components/PropertiesPanel.jsx",
);
const componentUtilsPath = path.join(
  repoRoot,
  "admin/frontend/src/pages/blueprints/data/componentUtils.js",
);
const productionMetadataPath = path.join(
  repoRoot,
  "admin/frontend/src/pages/blueprints/data/productionMetadata.js",
);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const properties = read(propertiesPath);
const componentUtils = read(componentUtilsPath);
const productionMetadata = read(productionMetadataPath);

[
  "EDGE_TREATMENT_OPTIONS",
  "EDGE_KEYS",
  "../../data/hardwareMetadata",
  "hardwareDraftType",
  "hardwareDraftName",
  "hardwareDraftQuantity",
  "hardwareDraftNote",
  "getHardwareRequirements",
  "updateHardwareRequirement",
  "removeHardwareRequirement",
  "addHardwareRequirement",
  "Add Hardware Requirement",
  "Hardware requirements only.",
  "Edge Treatment",
].forEach((token) => {
  assert(
    !properties.includes(token),
    `Removed Properties UI token is still present: ${token}`,
  );
});

[
  "Board Material",
  "Wood Finish",
  "Grain Direction",
  '<label style={S.floatingLabel}>Qty</label>',
  "handleNumericChange",
  "applyStyleChange",
  "applySelectionChange",
  "selectedComp.qty || 1",
].forEach((token) => {
  assert(
    properties.includes(token),
    `Required Properties control/behavior is missing: ${token}`,
  );
});

assert(
  componentUtils.includes("edgeTreatments: productionMetadata.edgeTreatments"),
  "Legacy edgeTreatments preservation path is missing.",
);
assert(
  componentUtils.includes("hardwareRequirements,"),
  "Legacy hardwareRequirements preservation path is missing.",
);
assert(
  componentUtils.includes("normalizeHardwareRequirements"),
  "Hardware compatibility normalization is missing.",
);
assert(
  productionMetadata.includes("normalizeEdgeTreatments("),
  "Edge treatment normalization compatibility path is missing.",
);
assert(
  productionMetadata.includes("component?.edgeTreatments"),
  "Saved edgeTreatments are no longer read during normalization.",
);

console.log(
  "PASS: Blueprint Properties cleanup hides Edge Treatment/Hardware controls while preserving legacy metadata and core production properties.",
);
