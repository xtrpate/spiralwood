// data/hardwareMetadata.js
// Blueprint-only hardware requirement metadata.
// This does NOT reserve, price, purchase, or deduct live inventory.

const HARDWARE_TYPE_OPTIONS = [
  { value: "concealed_hinge", label: "Concealed Hinge" },
  { value: "drawer_slide", label: "Drawer Slide" },
  { value: "handle_knob", label: "Handle / Knob" },
  { value: "shelf_pin", label: "Shelf Pin" },
  { value: "hanging_rail", label: "Hanging Rail" },
  { value: "screw", label: "Screw" },
  { value: "dowel", label: "Dowel" },
  { value: "bracket", label: "Bracket" },
  { value: "wall_anchor", label: "Wall Anchor" },
  { value: "other", label: "Other Hardware" },
];

const HARDWARE_TYPE_LABELS = Object.fromEntries(
  HARDWARE_TYPE_OPTIONS.map((item) => [item.value, item.label]),
);

const VALID_HARDWARE_TYPES = new Set(
  HARDWARE_TYPE_OPTIONS.map((item) => item.value),
);

function cleanText(value = "", maxLength = 200) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeHardwareType(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return VALID_HARDWARE_TYPES.has(normalized) ? normalized : "other";
}

function getHardwareTypeLabel(type = "") {
  return HARDWARE_TYPE_LABELS[normalizeHardwareType(type)] || "Other Hardware";
}

function normalizeHardwareRequirement(requirement = {}, index = 0) {
  const type = normalizeHardwareType(requirement?.type);
  const name =
    cleanText(requirement?.name, 150) ||
    getHardwareTypeLabel(type);

  const parsedQuantity = Number(requirement?.quantity);
  const quantity = Number.isFinite(parsedQuantity)
    ? Math.max(1, Math.min(9999, Math.round(parsedQuantity)))
    : 1;

  return {
    id:
      cleanText(requirement?.id, 120) ||
      `hardware-${Date.now()}-${index}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    type,
    name,
    quantity,
    installationNote: cleanText(
      requirement?.installationNote ??
        requirement?.installation_note ??
        requirement?.note ??
        "",
      500,
    ),
  };
}

function normalizeHardwareRequirements(value = []) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 100)
    .map((item, index) => normalizeHardwareRequirement(item, index));
}

function createHardwareRequirement({
  type = "concealed_hinge",
  name = "",
  quantity = 1,
  installationNote = "",
} = {}) {
  return normalizeHardwareRequirement({
    id: `hardware-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`,
    type,
    name,
    quantity,
    installationNote,
  });
}

export {
  HARDWARE_TYPE_OPTIONS,
  HARDWARE_TYPE_LABELS,
  normalizeHardwareType,
  getHardwareTypeLabel,
  normalizeHardwareRequirement,
  normalizeHardwareRequirements,
  createHardwareRequirement,
};