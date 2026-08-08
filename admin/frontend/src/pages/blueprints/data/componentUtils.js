// data/componentUtils.js — Component utility and normalization functions
import { normalizeCornerRadius } from "../shapes/roundedBox";
import {
  WOOD_FINISH_MAP,
  WOOD_FINISHES,
  CHAIR_PART_SET,
  VIEWS,
} from "./furnitureTypes";
import {
  snap,
  roundToPrecision,
  normalizeDimensionMm,
  makeId,
} from "./utils";
import { normalizeFurnitureStructureFields } from "./furnitureStructure";
import { normalizeProductionMetadata } from "./productionMetadata";
import { normalizeHardwareRequirements } from "./hardwareMetadata";
import { normalizeWoodworkingProfileMetadata } from "./woodworkingProfile";
import { normalizeWoodworkingOperations } from "./woodworkingOperations";

const GRID_SIZE = 20;
const MIN_COMPONENT_DIMENSION_MM = 1;

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function isHexColor(value = "") {
  return HEX_COLOR_RE.test(String(value || "").trim());
}

const LEGACY_UNIQUE_PART_CODES = {
  ct_top_panel: "CT-TOP",
  ct_lower_shelf: "CT-SH",
  ct_front_apron: "CT-AF",
  ct_rear_apron: "CT-AR",
  dt_top_panel: "DT-TOP",
  bed_headboard: "BED-HB",
  bed_footboard: "BED-FB",
  wr_top_panel: "WR-TOP",
  wr_bottom_panel: "WR-BOT",
  wr_back_panel: "WR-BK",
};

const PRODUCTION_ROLE_PREFIXES = {
  top_panel: "TOP",
  bottom_panel: "BOT",
  back_panel: "BK",
  side_panel: "SIDE",
  shelf: "SH",
  leg: "LEG",
  apron_rail: "RAIL",
  rail: "RAIL",
  door: "DR",
  drawer_front: "DF",
  drawer_side: "DS",
  drawer_back: "DB",
  drawer_bottom: "DBOT",
  support_panel: "SUP",
  board_panel: "PNL",
};

function cleanPartIdentityText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getTrailingNumber(value = "") {
  const match = cleanPartIdentityText(value).match(/(\d+)\s*$/);
  return match ? match[1] : "";
}

function getSideToken(label = "") {
  const text = cleanPartIdentityText(label).toLowerCase();

  if (/\bfront\b/.test(text) && /\bleft\b|\bl\b/.test(text)) return "FL";
  if (/\bfront\b/.test(text) && /\bright\b|\br\b/.test(text)) return "FR";
  if (/\bback\b|\brear\b/.test(text) && /\bleft\b|\bl\b/.test(text)) return "BL";
  if (/\bback\b|\brear\b/.test(text) && /\bright\b|\br\b/.test(text)) return "BR";
  if (/\bleft\b/.test(text)) return "L";
  if (/\bright\b/.test(text)) return "R";

  return "";
}

function getKnownLegacyPartCode(component = {}) {
  const type = cleanPartIdentityText(component.type).toLowerCase();
  const label = cleanPartIdentityText(component.label);
  const labelLower = label.toLowerCase();

  if (LEGACY_UNIQUE_PART_CODES[type]) {
    return LEGACY_UNIQUE_PART_CODES[type];
  }

  if (type === "ct_leg") {
    const side = getSideToken(label);
    if (side) return `CT-${side}`;
  }

  if (type === "dt_leg") {
    const side = getSideToken(label);
    if (side) return `DT-${side}`;
  }

  if (type === "dt_apron_long") {
    if (labelLower.includes("front")) return "DT-AF";
    if (labelLower.includes("rear") || labelLower.includes("back")) {
      return "DT-AR";
    }
  }

  if (type === "dt_apron_short") {
    if (labelLower.includes("left")) return "DT-AL";
    if (labelLower.includes("right")) return "DT-AR2";
  }

  if (type === "bed_side_rail") {
    if (labelLower.includes("left")) return "BED-SL";
    if (labelLower.includes("right")) return "BED-SR";
  }

  if (type === "bed_slat") {
    const number = getTrailingNumber(label);
    if (number) return `BED-ST${number}`;
  }

  if (type === "wr_side_panel") {
    if (labelLower.includes("left")) return "WR-SL";
    if (labelLower.includes("right")) return "WR-SR";
  }

  if (type === "wr_shelf" || type === "wr_top_shelf") {
    const number = getTrailingNumber(label);
    if (number) return `WR-SH${number}`;
  }

  if (type === "wr_door") {
    if (labelLower.includes("left")) return "WR-DL";
    if (labelLower.includes("right")) return "WR-DR";
  }

  if (type === "chair_seat_panel") return "SP";

  if (type === "chair_front_leg") {
    if (labelLower.includes("left")) return "FL";
    if (labelLower.includes("right")) return "FR";
  }

  if (type === "chair_back_leg") {
    if (labelLower.includes("left")) return "BL";
    if (labelLower.includes("right")) return "BR";
  }

  if (type === "chair_front_rail") return "FRT";
  if (type === "chair_rear_rail") return "RRT";

  if (type === "chair_side_rail") {
    if (labelLower.includes("left")) return "SRL";
    if (labelLower.includes("right")) return "SRR";
  }

  if (type === "chair_back_slat") {
    const number = getTrailingNumber(label);
    if (number) return `BS${number}`;
  }

  return "";
}

function hashProductionIdentity(value = "") {
  const text = String(value || "");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

function getProductionPartPrefix(component = {}) {
  const role = cleanPartIdentityText(
    component.partRole ?? component.part_role ?? component.assemblyRole ?? "",
  )
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (PRODUCTION_ROLE_PREFIXES[role]) {
    return PRODUCTION_ROLE_PREFIXES[role];
  }

  const type = cleanPartIdentityText(component.type || "part")
    .toUpperCase()
    .replace(/^FURNITURE_/, "")
    .replace(/^CUSTOM_/, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!type || type === "COMPONENT") return "PT";

  const tokens = type.split("-").filter(Boolean);
  if (tokens.length > 1) {
    return tokens
      .slice(0, 3)
      .map((token) => token.slice(0, 3))
      .join("-")
      .slice(0, 12);
  }

  return type.slice(0, 10);
}

function resolveProductionPartCode(component = {}) {
  const existing = cleanPartIdentityText(
    component.partCode ?? component.part_code ?? "",
  );

  if (existing) return existing;

  const knownCode = getKnownLegacyPartCode(component);
  if (knownCode) return knownCode;

  const prefix = getProductionPartPrefix(component);
  const identity = [
    component.id,
    component.type,
    component.label,
    component.partRole ?? component.part_role,
    component.groupId ?? component.group_id,
    component.groupLabel ?? component.group_label,
    component.assemblyId ?? component.assembly_id,
    component.x ?? component.position_x,
    component.y ?? component.position_y,
    component.z ?? component.position_z,
    component.width ?? component.width_mm,
    component.height ?? component.height_mm,
    component.depth ?? component.depth_mm,
  ]
    .map((value) => cleanPartIdentityText(value))
    .join("|");

  return `${prefix}-${hashProductionIdentity(identity || "part")}`;
}

function isChairPartType(type) {
  return CHAIR_PART_SET.has(type);
}

function getViewSheetCode(view) {
  return VIEWS.find((v) => v.key === view)?.sheet || "A-101";
}

function getWoodFinish(finishId = "") {
  return WOOD_FINISH_MAP[finishId] || WOOD_FINISHES[0];
}

function isWoodLikeMaterial(material = "") {
  return /wood|oak|teak|walnut|mahogany|pine|maple|beech|ash|veneer|plywood|marine/i.test(
    String(material),
  );
}

function getDefaultFinishId(material = "") {
  if (!isWoodLikeMaterial(material)) return "";

  if (/walnut/i.test(material)) return "walnut-dark";
  if (/mahogany/i.test(material)) return "mahogany-rich";
  if (/teak/i.test(material)) return "teak-golden";
  if (/pine/i.test(material)) return "pine-light";
  if (/maple/i.test(material)) return "maple-cream";
  if (/beech/i.test(material)) return "beech-honey";
  if (/ash/i.test(material)) return "ash-beige";

  return "oak-natural";
}

function applyWoodFinish(comp = {}, finishId = "") {
  if (!finishId) {
    return {
      finish: "",
      fill: comp.fill,
      material: comp.material,
    };
  }

  const finish = getWoodFinish(finishId);

  return {
    finish: finish.id,
    fill: finish.front,
    // Finish controls appearance only. Keep the structural board material
    // separate so Marine Plywood does not silently become Oak Wood, etc.
    material: comp.material || finish.material,
  };
}

function normalizeComponent(c) {
  const rawMaterial =
    String(c.material || c.wood_type || "Marine Plywood").trim() ||
    "Marine Plywood";

  const explicitFill = String(c.fill ?? c.color ?? "").trim();
  const explicitColor = String(c.color ?? c.fill ?? "").trim();
  const explicitFinishColor = String(
    c.finish_color ?? explicitColor ?? explicitFill ?? ""
  ).trim();
  const explicitFinish = String(
    c.finish ?? c.finish_id ?? c.woodFinish ?? ""
  ).trim();
  const explicitColorMode = String(c.color_mode || "").trim();

  const preserveSolidColor =
    explicitColorMode === "solid" ||
    (isHexColor(explicitFill || explicitColor || explicitFinishColor) &&
      !explicitFinish);

  const resolvedFinishId = preserveSolidColor
    ? ""
    : explicitFinish || getDefaultFinishId(rawMaterial);

  const finish = resolvedFinishId ? getWoodFinish(resolvedFinishId) : null;

  const resolvedFill = preserveSolidColor
    ? explicitFill || explicitColor || explicitFinishColor || "#d9c2a5"
    : resolvedFinishId
      ? finish?.front || explicitFill || explicitColor || "#d9c2a5"
      : explicitFill || explicitColor || explicitFinishColor || "#d9c2a5";

  // Material and finish are separate production properties.
  // A visual oak/walnut/etc. finish must not overwrite the saved substrate.
  const resolvedMaterial = rawMaterial;

  const structure = normalizeFurnitureStructureFields(c);
  const productionMetadata = normalizeProductionMetadata({
    ...c,
    material: resolvedMaterial,
  });
  const hardwareRequirements = normalizeHardwareRequirements(
    c.hardwareRequirements ??
      c.hardware_requirements ??
      c.hardware ??
      [],
  );
  const woodworkingProfile = normalizeWoodworkingProfileMetadata(c);
  const woodworkingOperations = normalizeWoodworkingOperations(
    c.woodworkingOperations ??
      c.woodworking_operations ??
      [],
  );

  const resolvedId = c.id || makeId();
  const resolvedPartCode = resolveProductionPartCode({
    ...c,
    id: resolvedId,
  });

  return {
    id: resolvedId,

    // Canonical Project -> Assembly -> Part metadata. Legacy group fields are
    // intentionally kept in sync until all editor tools have migrated.
    assemblyId: structure.assemblyId,
    assemblyName: structure.assemblyName,
    assemblyType: structure.assemblyType,
    parentPartId: structure.parentPartId,
    partRole: structure.partRole,
    structureVersion: structure.structureVersion,
    groupId: structure.groupId,
    groupLabel: structure.groupLabel,
    groupType: structure.groupType,

    partCode: resolvedPartCode,
    category: c.category || "Custom",
    blueprintStyle: c.blueprintStyle || "box",
    type: c.type || "custom_component",
    label: c.label || "Component",
    // Keep saved component coordinates and sizes at production-level
    // millimeter precision. Placement and move tools still use the 20 mm
    // grid explicitly through snap(), but normalization must not force an
    // 18 mm board or a resize-derived edge back onto that grid.
    x: roundToPrecision(Number(c.x) || 0),
    y: roundToPrecision(Number(c.y) || 0),
    z: roundToPrecision(Number(c.z) || 0),
    width: normalizeDimensionMm(
      Number(c.width) || 120,
      MIN_COMPONENT_DIMENSION_MM,
    ),
    height: normalizeDimensionMm(
      Number(c.height) || 80,
      MIN_COMPONENT_DIMENSION_MM,
    ),
    depth: normalizeDimensionMm(
      Number(c.depth) || 60,
      MIN_COMPONENT_DIMENSION_MM,
    ),
    rotationX: roundToPrecision(Number(c.rotationX) || 0, 0.1),
    rotationY: roundToPrecision(Number(c.rotationY) || 0, 0.1),
    rotationZ: roundToPrecision(Number(c.rotationZ) || 0, 0.1),
    fill: resolvedFill,
    color: explicitColor || resolvedFill,
    material: resolvedMaterial,
    wood_type: String(c.wood_type || rawMaterial).trim() || rawMaterial,
    finish: resolvedFinishId,
    finish_id: resolvedFinishId,
    woodFinish: resolvedFinishId,
    finish_color: explicitFinishColor || resolvedFill,
    color_mode: preserveSolidColor
      ? "solid"
      : resolvedFinishId
        ? "wood"
        : explicitColorMode,

    // Canonical woodworking production metadata. These fields intentionally
    // stay inside the Blueprint component payload so Save / Reload preserves
    // them without linking to live inventory.
    grainDirection: productionMetadata.grainDirection,
    edgeTreatments: productionMetadata.edgeTreatments,

    // Hardware requirements belong to the Blueprint part. They are production
    // metadata only and intentionally do not reference/deduct live inventory.
    hardwareRequirements,

    // Custom Shape Foundation V1 metadata. Kept in the Blueprint component
    // payload so Undo/Redo, Duplicate, Save/Reload, and future Cut List logic
    // all read the same shape definition.
    ...(woodworkingProfile || {}),

    // Woodworking Operations V5A production metadata. Geometry application
    // is intentionally deferred to V5B, but Save/Reload and Duplicate must
    // preserve the exact operation plan now.
    woodworkingOperations,

    unitPrice: Number(c.unitPrice) || 0,
    groupUnitPrice: Number(c.groupUnitPrice) || 0,
    templateType: c.templateType || "",
    ...(structure.assemblyRole
      ? { assemblyRole: structure.assemblyRole }
      : {}),
    ...(c.resizeRuleX
      ? { resizeRuleX: String(c.resizeRuleX) }
      : {}),
    ...(Number(c.smartResizeVersion) > 0
      ? { smartResizeVersion: Number(c.smartResizeVersion) }
      : {}),
    qty: Math.max(1, Number(c.qty) || 1),
    locked: !!c.locked,
    cornerRadius: normalizeCornerRadius(c.cornerRadius),
    topRatio: Math.max(0.05, Math.min(0.98, Number(c.topRatio) || 0.5)),
  };
}

function getProjectedBox(comp, view) {
  if (view === "front" || view === "back") {
    return { x: comp.x, y: comp.y, w: comp.width, h: comp.height };
  }
  if (view === "left" || view === "right") {
    return { x: comp.z, y: comp.y, w: comp.depth, h: comp.height };
  }
  if (view === "top") {
    return { x: comp.x, y: comp.z, w: comp.width, h: comp.depth };
  }
  return null;
}

function getComponentsBounds3D(components) {
  if (!components.length) return null;

  const minX = Math.min(...components.map((c) => c.x));
  const minY = Math.min(...components.map((c) => c.y));
  const minZ = Math.min(...components.map((c) => c.z));
  const maxX = Math.max(...components.map((c) => c.x + c.width));
  const maxY = Math.max(...components.map((c) => c.y + c.height));
  const maxZ = Math.max(...components.map((c) => c.z + c.depth));

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ,
  };
}

function get2DBounds(items) {
  if (!items.length) return null;

  const minX = Math.min(...items.map((i) => i.box.x));
  const minY = Math.min(...items.map((i) => i.box.y));
  const maxX = Math.max(...items.map((i) => i.box.x + i.box.w));
  const maxY = Math.max(...items.map((i) => i.box.y + i.box.h));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getSelectionGroup(components, selectedComp) {
  if (!selectedComp) return [];
  if (selectedComp.groupId)
    return components.filter((c) => c.groupId === selectedComp.groupId);
  return [selectedComp];
}

function shouldMirrorView(view) {
  return view === "back" || view === "right";
}

function getMirroredBox(box, bounds, view) {
  if (!shouldMirrorView(view) || !bounds) return box;
  return {
    ...box,
    x: bounds.minX + bounds.width - (box.x - bounds.minX) - box.w,
  };
}

function getNextChairOrigin(components) {
  const chairGroups = [
    ...new Set(
      components.filter((c) => c.groupType === "chair").map((c) => c.groupId),
    ),
  ];

  if (!chairGroups.length) return { x: 80, z: 80 };

  let maxX = 80;
  chairGroups.forEach((gid) => {
    const parts = components.filter((c) => c.groupId === gid);
    const bounds = getComponentsBounds3D(parts);
    if (bounds) maxX = Math.max(maxX, bounds.maxX + 220);
  });

  return { x: maxX, z: 80 };
}

function getChairGroupOrigin(groupComponents) {
  const seat = groupComponents.find((c) => c.type === "chair_seat_panel");
  if (seat) return { x: seat.x, z: seat.z - 20 };

  const bounds = getComponentsBounds3D(groupComponents);
  if (bounds) return { x: bounds.minX, z: bounds.minZ };

  return { x: 80, z: 80 };
}

function createChairPart(overrides) {
  const baseMaterial = overrides.material || "Oak Wood";
  const finishId = overrides.finish || getDefaultFinishId(baseMaterial);
  const finishData = finishId
    ? applyWoodFinish({ material: baseMaterial }, finishId)
    : {};

  return normalizeComponent({
    fill: finishData.fill || "#d9c2a5",
    material: finishData.material || baseMaterial,
    finish: finishData.finish || "",
    qty: 1,
    locked: false,
    category: "Chair Parts",
    blueprintStyle: "chair_part",
    ...overrides,
  });
}

function createAssemblyPart(overrides) {
  const baseMaterial = overrides.material || "Oak Wood";
  const finishId = overrides.finish || getDefaultFinishId(baseMaterial);
  const finishData = finishId
    ? applyWoodFinish({ material: baseMaterial }, finishId)
    : {};

  return normalizeComponent({
    fill: finishData.fill || overrides.fill || "#d9c2a5",
    material: finishData.material || baseMaterial,
    finish: finishData.finish || "",
    qty: 1,
    locked: false,
    category: "Furniture Parts",
    blueprintStyle: "part",
    groupType: "assembly",
    ...overrides,
  });
}

function getNextAssemblyOrigin(components) {
  const bounds = getComponentsBounds3D(components);
  if (!bounds) return { x: 200, z: 160 };

  return {
    x: snap(bounds.maxX + 260),
    z: 160,
  };
}

export {
  isChairPartType,
  getViewSheetCode,
  getWoodFinish,
  isWoodLikeMaterial,
  getDefaultFinishId,
  applyWoodFinish,
  resolveProductionPartCode,
  normalizeComponent,
  getProjectedBox,
  getComponentsBounds3D,
  get2DBounds,
  getSelectionGroup,
  shouldMirrorView,
  getMirroredBox,
  getNextChairOrigin,
  getChairGroupOrigin,
  createChairPart,
  createAssemblyPart,
  getNextAssemblyOrigin,
};
