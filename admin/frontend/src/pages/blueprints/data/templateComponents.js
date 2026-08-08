// data/templateComponents.js — Assembly template component builders
import {
  normalizeComponent,
  createChairPart,  getDefaultFinishId,
  applyWoodFinish,
  get2DBounds,
  getChairGroupOrigin,
  getComponentsBounds3D,
  getMirroredBox,
  getNextChairOrigin,
  getProjectedBox,
  isChairPartType,
} from "./componentUtils";
import { makeGroupId } from "./utils";
import {
  createDiningTableTemplateComponents,
  createBedTemplateComponents,
  createWardrobeTemplateComponents,
  createCoffeeTableTemplateComponents,
  buildFurnitureTemplateParts,
  createClosetWardrobeComponents,
} from "./standardTemplateBuilders";

const GRID_SIZE = 20;
const FLOOR_OFFSET = 40;
const BOARD = 18;

function snap(v) {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}
function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

const IMPORT_TEMPLATE_DEFAULTS = {
  template_closet_wardrobe: {
    label: "Imported Closet / Wardrobe",
    w: 2400,
    h: 2400,
    d: 600,
  },
  template_wardrobe: {
    label: "Imported Wardrobe",
    w: 1800,
    h: 2200,
    d: 600,
  },
  template_coffee_table: {
    label: "Imported Coffee Table",
    w: 1000,
    h: 450,
    d: 600,
  },
  template_dining_table: {
    label: "Imported Dining Table",
    w: 1800,
    h: 760,
    d: 900,
  },
  template_bed_frame: {
    label: "Imported Bed Frame",
    w: 1600,
    h: 1100,
    d: 2000,
  },
};

function getImportedFurnitureTemplateType(savedData = {}, blueprintData = {}) {
  return (
    savedData?.importTemplateType ||
    savedData?.import_type ||
    blueprintData?.import_template_type ||
    "template_closet_wardrobe"
  );
}

function getImportedFurnitureDims(
  savedData = {},
  blueprintData = {},
  templateType = "template_closet_wardrobe",
) {
  const defaults =
    IMPORT_TEMPLATE_DEFAULTS[templateType] ||
    IMPORT_TEMPLATE_DEFAULTS.template_closet_wardrobe;

  const source =
    savedData?.importDimensions ||
    savedData?.referenceDimensions ||
    blueprintData?.import_dimensions ||
    blueprintData?.reference_dimensions ||
    {};

  return {
    w: Math.max(
      GRID_SIZE,
      snap(Number(source.w ?? source.width ?? defaults.w) || defaults.w),
    ),
    h: Math.max(
      GRID_SIZE,
      snap(Number(source.h ?? source.height ?? defaults.h) || defaults.h),
    ),
    d: Math.max(
      GRID_SIZE,
      snap(Number(source.d ?? source.depth ?? defaults.d) || defaults.d),
    ),
  };
}

function scaleAssemblyComponentsToTarget(
  baseParts,
  targetDims,
  originX,
  originZ,
  canvasH,
  groupId,
  groupLabel,
  templateType,
) {
  const baseBounds = getComponentsBounds3D(baseParts);
  if (!baseBounds) return [];

  const floorY = canvasH - FLOOR_OFFSET;
  const scaleX = targetDims.w / Math.max(baseBounds.width, 1);
  const scaleY = targetDims.h / Math.max(baseBounds.height, 1);
  const scaleZ = targetDims.d / Math.max(baseBounds.depth, 1);

  return baseParts.map((part) =>
    normalizeComponent({
      ...part,
      id: makeId(),
      groupId,
      groupLabel,
      groupType: "assembly",
      templateType,
      x: originX + (part.x - baseBounds.minX) * scaleX,
      y: floorY - targetDims.h + (part.y - baseBounds.minY) * scaleY,
      z: originZ + (part.z - baseBounds.minZ) * scaleZ,
      width: part.width * scaleX,
      height: part.height * scaleY,
      depth: part.depth * scaleZ,
    }),
  );
}

function createImportedFurnitureComponents(
  savedData = {},
  referenceFile = null,
  blueprintData = {},
  worldSize = { w: 6400, h: 3200, d: 5200 },
) {
  const templateType = getImportedFurnitureTemplateType(
    savedData,
    blueprintData,
  );

  const defaults =
    IMPORT_TEMPLATE_DEFAULTS[templateType] ||
    IMPORT_TEMPLATE_DEFAULTS.template_closet_wardrobe;

  const groupId = makeGroupId();
  const groupLabel =
    blueprintData?.title || referenceFile?.name || defaults.label;

  const dims = getImportedFurnitureDims(savedData, blueprintData, templateType);

  const originX = snap((worldSize.w - dims.w) / 2);
  const originZ = snap((worldSize.d - dims.d) / 2);

  const baseParts = buildFurnitureTemplateParts({
    templateType,
    buildId: groupId,
    originX: 0,
    originZ: 0,
    canvasH: worldSize.h,
    groupLabel,
  });

  return scaleAssemblyComponentsToTarget(
    baseParts,
    dims,
    originX,
    originZ,
    worldSize.h,
    groupId,
    groupLabel,
    templateType,
  );
}

function createDiningChairTemplateComponents(
  originX,
  originZ,
  canvasH,
  groupId,
  groupLabel,
) {
  const floorY = canvasH - FLOOR_OFFSET;
  const seatTop = floorY - 450;
  const seatThickness = 20;
  const frontLegH = 430;
  const backLegH = 920;
  const legW = 35;
  const seatW = 420;
  const seatD = 420;
  const slatGap = 72;

  const base = {
    groupId,
    groupLabel,
    groupType: "chair",
    material: "Oak Wood",
    category: "Chair Parts",
    blueprintStyle: "chair_part",
  };

  return [
    createChairPart({
      ...base,
      type: "chair_seat_panel",
      label: "Seat Panel",
      partCode: "SP",
      x: originX,
      y: seatTop,
      z: originZ + 20,
      width: seatW,
      height: seatThickness,
      depth: seatD,
      fill: "#dbc3a5",
      unitPrice: 1200,
    }),
    createChairPart({
      ...base,
      type: "chair_front_leg",
      label: "Front Leg L",
      partCode: "FL",
      x: originX,
      y: floorY - frontLegH,
      z: originZ + 20,
      width: legW,
      height: frontLegH,
      depth: legW,
      fill: "#c49a6c",
      unitPrice: 650,
    }),
    createChairPart({
      ...base,
      type: "chair_front_leg",
      label: "Front Leg R",
      partCode: "FR",
      x: originX + seatW - legW,
      y: floorY - frontLegH,
      z: originZ + 20,
      width: legW,
      height: frontLegH,
      depth: legW,
      fill: "#c49a6c",
      unitPrice: 650,
    }),
    createChairPart({
      ...base,
      type: "chair_back_leg",
      label: "Back Leg L",
      partCode: "BL",
      x: originX,
      y: floorY - backLegH,
      z: originZ + seatD - legW + 20,
      width: legW,
      height: backLegH,
      depth: legW,
      fill: "#bb9060",
      unitPrice: 950,
    }),
    createChairPart({
      ...base,
      type: "chair_back_leg",
      label: "Back Leg R",
      partCode: "BR",
      x: originX + seatW - legW,
      y: floorY - backLegH,
      z: originZ + seatD - legW + 20,
      width: legW,
      height: backLegH,
      depth: legW,
      fill: "#bb9060",
      unitPrice: 950,
    }),
    createChairPart({
      ...base,
      type: "chair_front_rail",
      label: "Front Rail",
      partCode: "FRT",
      x: originX + legW,
      y: seatTop + 28,
      z: originZ + 35,
      width: seatW - legW * 2,
      height: 20,
      depth: 20,
      fill: "#cda678",
      unitPrice: 480,
    }),
    createChairPart({
      ...base,
      type: "chair_rear_rail",
      label: "Rear Rail",
      partCode: "RRT",
      x: originX + legW,
      y: seatTop + 28,
      z: originZ + seatD - 20,
      width: seatW - legW * 2,
      height: 20,
      depth: 20,
      fill: "#cda678",
      unitPrice: 480,
    }),
    createChairPart({
      ...base,
      type: "chair_side_rail",
      label: "Side Rail L",
      partCode: "SRL",
      x: originX + 8,
      y: seatTop + 28,
      z: originZ + 55,
      width: 20,
      height: 20,
      depth: seatD - 110,
      fill: "#cda678",
      unitPrice: 520,
    }),
    createChairPart({
      ...base,
      type: "chair_side_rail",
      label: "Side Rail R",
      partCode: "SRR",
      x: originX + seatW - 28,
      y: seatTop + 28,
      z: originZ + 55,
      width: 20,
      height: 20,
      depth: seatD - 110,
      fill: "#cda678",
      unitPrice: 520,
    }),
    createChairPart({
      ...base,
      type: "chair_back_slat",
      label: "Back Slat 1",
      partCode: "BS1",
      x: originX + 50,
      y: seatTop - 120,
      z: originZ + seatD - 15,
      width: 320,
      height: 18,
      depth: 20,
      fill: "#d7b589",
      unitPrice: 350,
    }),
    createChairPart({
      ...base,
      type: "chair_back_slat",
      label: "Back Slat 2",
      partCode: "BS2",
      x: originX + 50,
      y: seatTop - 120 - slatGap,
      z: originZ + seatD - 15,
      width: 320,
      height: 18,
      depth: 20,
      fill: "#d7b589",
      unitPrice: 350,
    }),
    createChairPart({
      ...base,
      type: "chair_back_slat",
      label: "Back Slat 3",
      partCode: "BS3",
      x: originX + 50,
      y: seatTop - 120 - slatGap * 2,
      z: originZ + seatD - 15,
      width: 320,
      height: 18,
      depth: 20,
      fill: "#d7b589",
      unitPrice: 350,
    }),
    createChairPart({
      ...base,
      type: "chair_back_slat",
      label: "Back Slat 4",
      partCode: "BS4",
      x: originX + 50,
      y: seatTop - 120 - slatGap * 3,
      z: originZ + seatD - 15,
      width: 320,
      height: 18,
      depth: 20,
      fill: "#d7b589",
      unitPrice: 350,
    }),
  ];
}

function buildDiningChairParts({
  buildId = makeGroupId(),
  originX = 80,
  originZ = 80,
  canvasH = 3200,
  groupLabel = "Dining Chair 1",
} = {}) {
  const parts = createDiningChairTemplateComponents(
    originX,
    originZ,
    canvasH,
    buildId,
    groupLabel,
  );

  const bounds = getComponentsBounds3D(parts);

  return {
    buildId,
    groupLabel,
    parts,
    overall: bounds
      ? {
          w: bounds.width,
          h: bounds.height,
          d: bounds.depth,
        }
      : null,
  };
}

function scaleChairComponentsToTarget(
  baseParts,
  targetDims,
  originX,
  originZ,
  canvasH,
  groupId,
  groupLabel,
) {
  const baseBounds = getComponentsBounds3D(baseParts);
  if (!baseBounds) return [];

  const floorY = canvasH - FLOOR_OFFSET;
  const scaleX = targetDims.w / Math.max(baseBounds.width, 1);
  const scaleY = targetDims.h / Math.max(baseBounds.height, 1);
  const scaleZ = targetDims.d / Math.max(baseBounds.depth, 1);

  return baseParts.map((part) =>
    normalizeComponent({
      ...part,
      id: makeId(),
      groupId,
      groupLabel,
      groupType: "chair",
      x: originX + (part.x - baseBounds.minX) * scaleX,
      y: floorY - targetDims.h + (part.y - baseBounds.minY) * scaleY,
      z: originZ + (part.z - baseBounds.minZ) * scaleZ,
      width: part.width * scaleX,
      height: part.height * scaleY,
      depth: part.depth * scaleZ,
    }),
  );
}

function getImportedDiningChairDims(savedData = {}, blueprintData = {}) {
  const source =
    savedData?.importDimensions ||
    savedData?.referenceDimensions ||
    blueprintData?.import_dimensions ||
    blueprintData?.reference_dimensions ||
    {};

  return {
    w: Math.max(
      GRID_SIZE,
      snap(Number(source.w ?? source.width ?? 460) || 460),
    ),
    h: Math.max(
      GRID_SIZE,
      snap(Number(source.h ?? source.height ?? 920) || 920),
    ),
    d: Math.max(
      GRID_SIZE,
      snap(Number(source.d ?? source.depth ?? 520) || 520),
    ),
  };
}

function createImportedDiningChairComponents(
  savedData = {},
  referenceFile = null,
  blueprintData = {},
  worldSize = { w: 6400, h: 3200, d: 5200 },
) {
  const groupId = makeGroupId();
  const groupLabel =
    blueprintData?.title || referenceFile?.name || "Imported Dining Chair";

  const dims = getImportedDiningChairDims(savedData, blueprintData);

  const originX = snap((worldSize.w - dims.w) / 2);
  const originZ = snap((worldSize.d - dims.d) / 2);

  const baseParts = createDiningChairTemplateComponents(
    0,
    0,
    worldSize.h,
    groupId,
    groupLabel,
  );

  return scaleChairComponentsToTarget(
    baseParts,
    dims,
    originX,
    originZ,
    worldSize.h,
    groupId,
    groupLabel,
  );
}

const TEMPLATE_LIBRARY_SPECS = [
  {
    label: "Wooden Dining Table",
    type: "template_dining_table",
    category: "Furniture Templates",
    fill: "#be9366",
    material: "Oak Wood",
    unitPrice: 9800,
    blueprintStyle: "assembly_template",
    cornerRadius: 0,
    thumbnailPng: "/library-thumbs/wooden-dining-table.png",
    w: 1800,
    h: 760,
    d: 900,
  },
  {
    label: "Wooden Bed Frame",
    type: "template_bed_frame",
  },
  {
    label: "Wooden Wardrobe / Cabinet",
    type: "template_wardrobe",
  },
  {
    label: "Wooden Coffee Table",
    type: "template_coffee_table",
  },
  {
    label: "Closet / Wardrobe Cabinet",
    type: "template_closet_wardrobe",
  },
];

function mapTemplatePartToLibraryItem(part = {}, templateInfo = {}) {
  return {
    label: part.label || "Part",
    type: part.type || "part",
    category: `${templateInfo.label || "Template"} Parts`,
    sourceTemplateType: templateInfo.type || "",
    sourceTemplateLabel: templateInfo.label || "",
    partCode: part.partCode || "",
    w: Number(part.width) || GRID_SIZE,
    h: Number(part.height) || GRID_SIZE,
    d: Number(part.depth) || GRID_SIZE,
    fill: part.fill || "#d9c2a5",
    material: part.material || "Oak Wood",
    unitPrice: Number(part.unitPrice) || 0,
    blueprintStyle: part.blueprintStyle || "part",
    cornerRadius: Number(part.cornerRadius) || 0,
    isTemplatePart: true,
  };
}

function getFurnitureTemplatePartGroups() {
  return TEMPLATE_LIBRARY_SPECS.map((templateInfo) => {
    const rawParts = buildFurnitureTemplateParts({
      templateType: templateInfo.type,
      buildId: makeGroupId(),
      originX: 0,
      originZ: 0,
      canvasH: 3200,
      groupLabel: templateInfo.label,
    });

    return {
      label: `${templateInfo.label} Parts`,
      items: rawParts.map((part) =>
        mapTemplatePartToLibraryItem(part, templateInfo),
      ),
    };
  }).filter((group) => Array.isArray(group.items) && group.items.length > 0);
}

function getChairTemplatePartGroups() {
  const templateInfo = {
    label: "Dining Chair Template",
    type: "chair_template",
  };

  const rawParts = createDiningChairTemplateComponents(
    0,
    0,
    3200,
    makeGroupId(),
    templateInfo.label,
  );

  return [
    {
      label: `${templateInfo.label} Parts`,
      items: rawParts.map((part) =>
        mapTemplatePartToLibraryItem(part, templateInfo),
      ),
    },
  ];
}

function getTemplateLibraryPartGroups() {
  return [...getFurnitureTemplatePartGroups(), ...getChairTemplatePartGroups()];
}

export {
  createDiningTableTemplateComponents,
  createBedTemplateComponents,
  createWardrobeTemplateComponents,
  createCoffeeTableTemplateComponents,
  createDiningChairTemplateComponents,
  buildFurnitureTemplateParts,
  buildDiningChairParts,
  createImportedDiningChairComponents,
  createClosetWardrobeComponents,
  createImportedFurnitureComponents,
  getTemplateLibraryPartGroups,
};
