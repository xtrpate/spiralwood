const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const base = "admin/frontend/src/pages/blueprints/";
const panel = read(base + "3d/components/FurnitureToolsPanel.jsx");
const library = read(base + "3d/components/FurnitureLibraryPanel.jsx");
const guide = read(base + "3d/components/ToolsGuide.jsx");
const publishing = read(base + "components/BlueprintPublishModal.jsx");
const persistence = read(base + "hooks/useBlueprintPersistence.js");
const keyboard = read(base + "hooks/useBlueprintKeyboardShortcuts.js");
const output = read(base + "export/exportBuilders.js");
const outputHook = read(base + "hooks/useBlueprintExport.js");

assert(
  !/key:\s*"(?:duplicate|validate)"/.test(panel),
  "Copy / Check tab should not be exposed in the Blueprint tools",
);
assert(
  !panel.includes("Run Validation") && !panel.includes("Mirror X"),
  "Retired manual validation / mirror actions are still exposed",
);
for (const label of [
  "Simple Table Builder", "Base Cabinet Builder", "Wardrobe Builder",
  "Shelf Layout", "Door Builder", "Drawer Builder",
  "Controlled Assembly Resize", "Select Whole Furniture",
]) {
  assert(panel.includes(label), "Required Blueprint control missing: " + label);
}
assert(
  panel.includes("showCabinetVariants ? (") &&
    panel.includes("SHOW_ADVANCED_BUILD_TOOLS ? ("),
  "Advanced builders must be collapsed or hidden, not removed from data flow",
);
assert(
  panel.includes("Apply Gap") && panel.includes("onGapSelection"),
  "Spacing must remain actionable after hiding advanced Arrange options",
);
assert(
  library.includes('"Custom Shape Parts", "Custom Shapes"') &&
    library.includes('tab.key !== "custom"'),
  "Custom shape groups must be hidden from All, Search, and Custom tabs",
);
assert(
  !library.includes("getTemplateLibraryPartGroups") &&
    library.includes('item.type === "template_closet_wardrobe"'),
  "Hide redundant template-part collections and alternative Wardrobe option only in the picker",
);
const arrangeBlock = panel.split('{activeToolTab === "arrange" ? (')[1]?.split('{activeToolTab === "resize" ? (')[0] || "";
const flushAt = arrangeBlock.indexOf('>Flush Snap</div>');
const advancedAt = arrangeBlock.lastIndexOf("{SHOW_ADVANCED_ARRANGE_TOOLS ? (", flushAt);
assert(
  flushAt > 0 && advancedAt >= 0 &&
    arrangeBlock.slice(advancedAt, flushAt).includes('>'),
  "Flush Snap must remain implemented but inaccessible in the simplified Arrange UI",
);
assert(
  guide.includes('["Align"') &&
    !guide.includes('["Flush Snap"'),
  "Tools guide must match the new visible Arrange controls",
);
assert(
  !/key:\s*"(?:copy|check)"/.test(guide),
  "Tools guide must not advertise hidden tools",
);
assert(
  !publishing.includes("Customer description") &&
    persistence.includes("publishForm.description"),
  "Customer Description must be hidden without removing publication fallback",
);
const compositor = output.split("function buildAllExportPages(")[1];
assert(compositor, "Official output builder not found");
assert(
  compositor.includes("...buildExplodedPartsSchedulePages") &&
    !compositor.includes("...buildMaterialsPagesHtml"),
  "Official output must keep part cut-size/material schedule without duplicate materials pages",
);
assert(
  output.includes("function buildMaterialsPagesHtml"),
  "Do not remove backward-compatible materials page helper",
);
for (const guard of [
  "getOfficialOutputFidelityIssues", "hasUnsavedDesignChanges",
  "designValidationReport?.errors",
]) {
  assert(outputHook.includes(guard), "Official PDF/Print guard missing: " + guard);
}
for (const shortcut of ['key === "c"', 'key === "v"', 'key === "d"']) {
  assert(keyboard.includes(shortcut), "Copy/duplicate shortcut missing: " + shortcut);
}
console.log("PASS: Blueprint Management UI cleanup static integrity checks passed.");
