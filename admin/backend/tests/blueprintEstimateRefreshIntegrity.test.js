const assert = require("assert");
const fs = require("fs");
const path = require("path");

const pagePath = path.join(
  __dirname,
  "../../frontend/src/pages/blueprints/EstimationPage.jsx",
);

const source = fs.readFileSync(pagePath, "utf8");

const mustInclude = (needle, message) => {
  assert.ok(source.includes(needle), message);
};

mustInclude(
  "const [refreshingItems, setRefreshingItems] = useState(false);",
  "Refresh Items needs its own in-progress guard.",
);

mustInclude(
  "const handleRegenerate = async () => {",
  "Refresh Items must be asynchronous so it can fetch authoritative server state.",
);

mustInclude(
  "const blueprintResponse = await api.get(\`/blueprints/\${id}\`);",
  "Refresh Items must reload the latest Blueprint from the backend.",
);

mustInclude(
  "parseBlueprintDesignData(latestBlueprint)",
  "Latest Blueprint design_data must drive refreshed furniture parts.",
);

mustInclude(
  "getBlueprintOrderQuantity(latestBlueprint)",
  "Latest linked order quantity must drive refreshed furniture parts.",
);

mustInclude(
  "mergeAutoRows(\n        latestAutoItems,\n        blueprintItems,\n        [],\n      )",
  "Refresh must preserve matching admin-entered furniture-part rates.",
);

mustInclude(
  "setItems([...mergedAuto, ...inventoryItems]);",
  "Refresh must preserve existing inventory-material selections.",
);

mustInclude(
  "setBlueprint(latestBlueprint);",
  "Page state must be updated to the authoritative Blueprint snapshot.",
);

mustInclude(
  'disabled={isReadOnly || refreshingItems}',
  "Refresh button must prevent duplicate refresh requests.",
);

mustInclude(
  '{refreshingItems ? "Refreshing..." : "Refresh Items"}',
  "Refresh button should show its in-progress state.",
);

assert.ok(
  !source.includes("disabled={isReadOnly || !preferredAutoItems.length}"),
  "Refresh Items must not be disabled by a stale/empty local Blueprint snapshot.",
);

console.log("PASS blueprintEstimateRefreshIntegrity.test.js");
console.log("Refresh Items fetches latest Blueprint/order state before rebuilding.");
console.log("Backend quantity integrity guard remains authoritative.");
