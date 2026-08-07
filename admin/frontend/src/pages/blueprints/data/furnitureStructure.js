// data/furnitureStructure.js
// Canonical Blueprint Project -> Assembly -> Part metadata.
//
// Existing Blueprint behavior still uses groupId/groupLabel/groupType in many
// places. This module keeps those legacy fields synchronized with the new
// assembly metadata so old blueprints remain loadable while the editor moves
// toward the production-oriented structure in the master plan.

const FURNITURE_STRUCTURE_VERSION = 1;

const TEMPLATE_ASSEMBLY_TYPE_MAP = Object.freeze({
  template_dining_table: "dining_table",
  template_coffee_table: "coffee_table",
  template_wardrobe: "wardrobe",
  template_closet_wardrobe: "wardrobe",
  template_bed_frame: "bed_frame",
  template_dining_chair: "dining_chair",
  chair_template: "dining_chair",
});

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function inferAssemblyType(component = {}, assemblyId = null) {
  const explicitType = cleanText(component.assemblyType);
  if (explicitType) return explicitType;

  const templateType = cleanText(component.templateType);
  if (TEMPLATE_ASSEMBLY_TYPE_MAP[templateType]) {
    return TEMPLATE_ASSEMBLY_TYPE_MAP[templateType];
  }

  const groupType = cleanText(component.groupType).toLowerCase();
  if (groupType === "chair") return "dining_chair";

  const partType = cleanText(component.type).toLowerCase();

  if (partType.startsWith("dt_")) return "dining_table";
  if (partType.startsWith("ct_")) return "coffee_table";
  if (partType.startsWith("bed_")) return "bed_frame";
  if (partType.startsWith("wr_")) return "wardrobe";

  if (partType.includes("wardrobe") || partType.includes("closet")) {
    return "wardrobe";
  }
  if (partType.includes("cabinet")) return "cabinet";
  if (partType.includes("table")) return "table";

  if (groupType && groupType !== "assembly") return groupType;

  return assemblyId ? "furniture" : "";
}

function resolveLegacyGroupType(component = {}, assemblyType = "", assemblyId = null) {
  const existingGroupType = cleanText(component.groupType);
  if (existingGroupType) return existingGroupType;

  if (!assemblyId) return null;
  if (assemblyType === "dining_chair") return "chair";
  return "assembly";
}

function normalizeFurnitureStructureFields(component = {}) {
  // Legacy groupId remains authoritative during the transition because the
  // current Move/Rotate/Resize/Duplicate tools already update it. This also
  // guarantees that a duplicated assembly receives a fresh assemblyId.
  const legacyGroupId = cleanText(component.groupId);
  const explicitAssemblyId = cleanText(component.assemblyId);
  const assemblyId = legacyGroupId || explicitAssemblyId || null;

  // Same rule for names: existing rename behavior currently edits groupLabel.
  const legacyGroupLabel = cleanText(component.groupLabel);
  const explicitAssemblyName = cleanText(component.assemblyName);
  const assemblyName = legacyGroupLabel || explicitAssemblyName || "";

  const assemblyType = inferAssemblyType(component, assemblyId);
  const groupType = resolveLegacyGroupType(
    component,
    assemblyType,
    assemblyId,
  );

  const partRole =
    cleanText(component.partRole) || cleanText(component.assemblyRole);
  const assemblyRole =
    cleanText(component.assemblyRole) || partRole;

  const parentPartId = cleanText(component.parentPartId) || null;
  const savedVersion = Number(component.structureVersion) || 0;

  return {
    structureVersion: Math.max(FURNITURE_STRUCTURE_VERSION, savedVersion),
    assemblyId,
    assemblyName,
    assemblyType,
    parentPartId,
    partRole,

    // Backward-compatible aliases used by the current editor.
    groupId: assemblyId,
    groupLabel: assemblyName,
    groupType,
    assemblyRole,
  };
}

function getAssemblyIdentity(component = {}) {
  const normalized = normalizeFurnitureStructureFields(component);

  return {
    id: normalized.assemblyId,
    name: normalized.assemblyName,
    type: normalized.assemblyType,
  };
}

export {
  FURNITURE_STRUCTURE_VERSION,
  TEMPLATE_ASSEMBLY_TYPE_MAP,
  normalizeFurnitureStructureFields,
  getAssemblyIdentity,
};