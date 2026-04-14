// data/templateComponents.js — Assembly template component builders
import {
  normalizeComponent,
  createChairPart,
  createAssemblyPart,
  getDefaultFinishId,
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
import { createClosetWardrobeComponents } from "./closetTemplate";

const GRID_SIZE = 20;
const FLOOR_OFFSET = 40;
const BOARD = 18;

function snap(v) {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}
function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function createDiningTableTemplateComponents(
  originX,
  originZ,
  canvasH,
  groupId,
  groupLabel,
) {
  const floorY = canvasH - FLOOR_OFFSET;
  const w = 1800;
  const h = 760;
  const d = 900;
  const topT = 40;
  const legW = 80;
  const apronH = 90;
  const apronT = 25;
  const inset = 70;
  const legH = h - topT;

  return [
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "dt_top_panel",
      label: "Top Panel",
      partCode: "DT-TOP",
      x: originX,
      y: floorY - h,
      z: originZ,
      width: w,
      height: topT,
      depth: d,
      fill: "#be9366",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "dt_leg",
      label: "Front Leg L",
      partCode: "DT-FL",
      x: originX + inset,
      y: floorY - legH,
      z: originZ + inset,
      width: legW,
      height: legH,
      depth: legW,
      fill: "#a7794d",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "dt_leg",
      label: "Front Leg R",
      partCode: "DT-FR",
      x: originX + w - inset - legW,
      y: floorY - legH,
      z: originZ + inset,
      width: legW,
      height: legH,
      depth: legW,
      fill: "#a7794d",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "dt_leg",
      label: "Back Leg L",
      partCode: "DT-BL",
      x: originX + inset,
      y: floorY - legH,
      z: originZ + d - inset - legW,
      width: legW,
      height: legH,
      depth: legW,
      fill: "#a7794d",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "dt_leg",
      label: "Back Leg R",
      partCode: "DT-BR",
      x: originX + w - inset - legW,
      y: floorY - legH,
      z: originZ + d - inset - legW,
      width: legW,
      height: legH,
      depth: legW,
      fill: "#a7794d",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "dt_apron_long",
      label: "Front Apron",
      partCode: "DT-AF",
      x: originX + inset + legW,
      y: floorY - h + topT,
      z: originZ + inset,
      width: w - inset * 2 - legW * 2,
      height: apronH,
      depth: apronT,
      fill: "#b88958",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "dt_apron_long",
      label: "Rear Apron",
      partCode: "DT-AR",
      x: originX + inset + legW,
      y: floorY - h + topT,
      z: originZ + d - inset - apronT,
      width: w - inset * 2 - legW * 2,
      height: apronH,
      depth: apronT,
      fill: "#b88958",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "dt_apron_short",
      label: "Left Apron",
      partCode: "DT-AL",
      x: originX + inset,
      y: floorY - h + topT,
      z: originZ + inset + legW,
      width: apronT,
      height: apronH,
      depth: d - inset * 2 - legW * 2,
      fill: "#b88958",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "dt_apron_short",
      label: "Right Apron",
      partCode: "DT-AR2",
      x: originX + w - inset - apronT,
      y: floorY - h + topT,
      z: originZ + inset + legW,
      width: apronT,
      height: apronH,
      depth: d - inset * 2 - legW * 2,
      fill: "#b88958",
      material: "Oak Wood",
    }),
  ];
}

function createBedTemplateComponents(
  originX,
  originZ,
  canvasH,
  groupId,
  groupLabel,
) {
  const floorY = canvasH - FLOOR_OFFSET;
  const w = 1600;
  const h = 1100;
  const d = 2000;
  const boardT = 40;
  const sideRailH = 220;
  const footH = 420;
  const slatH = 25;

  return [
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "bed_headboard",
      label: "Headboard",
      partCode: "BED-HB",
      x: originX,
      y: floorY - h,
      z: originZ + d - boardT,
      width: w,
      height: h,
      depth: boardT,
      fill: "#c79d73",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "bed_footboard",
      label: "Footboard",
      partCode: "BED-FB",
      x: originX,
      y: floorY - footH,
      z: originZ,
      width: w,
      height: footH,
      depth: boardT,
      fill: "#b88958",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "bed_side_rail",
      label: "Left Side Rail",
      partCode: "BED-SL",
      x: originX,
      y: floorY - sideRailH - 180,
      z: originZ + boardT,
      width: boardT,
      height: sideRailH,
      depth: d - boardT * 2,
      fill: "#a7794d",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "bed_side_rail",
      label: "Right Side Rail",
      partCode: "BED-SR",
      x: originX + w - boardT,
      y: floorY - sideRailH - 180,
      z: originZ + boardT,
      width: boardT,
      height: sideRailH,
      depth: d - boardT * 2,
      fill: "#a7794d",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "bed_slat",
      label: "Slat 1",
      partCode: "BED-ST1",
      x: originX + boardT,
      y: floorY - 180,
      z: originZ + 260,
      width: w - boardT * 2,
      height: slatH,
      depth: 70,
      fill: "#d7b589",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "bed_slat",
      label: "Slat 2",
      partCode: "BED-ST2",
      x: originX + boardT,
      y: floorY - 180,
      z: originZ + 620,
      width: w - boardT * 2,
      height: slatH,
      depth: 70,
      fill: "#d7b589",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "bed_slat",
      label: "Slat 3",
      partCode: "BED-ST3",
      x: originX + boardT,
      y: floorY - 180,
      z: originZ + 980,
      width: w - boardT * 2,
      height: slatH,
      depth: 70,
      fill: "#d7b589",
      material: "Oak Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "bed_slat",
      label: "Slat 4",
      partCode: "BED-ST4",
      x: originX + boardT,
      y: floorY - 180,
      z: originZ + 1340,
      width: w - boardT * 2,
      height: slatH,
      depth: 70,
      fill: "#d7b589",
      material: "Oak Wood",
    }),
  ];
}

function createWardrobeTemplateComponents(
  originX,
  originZ,
  canvasH,
  groupId,
  groupLabel,
) {
  const floorY = canvasH - FLOOR_OFFSET;
  const w = 1800;
  const h = 2200;
  const d = 600;
  const t = 18;

  return [
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_side_panel",
      label: "Left Side Panel",
      partCode: "WR-SL",
      x: originX,
      y: floorY - h,
      z: originZ,
      width: t,
      height: h,
      depth: d,
      fill: "#8b5e3c",
      material: "Plywood + Laminate",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_side_panel",
      label: "Right Side Panel",
      partCode: "WR-SR",
      x: originX + w - t,
      y: floorY - h,
      z: originZ,
      width: t,
      height: h,
      depth: d,
      fill: "#8b5e3c",
      material: "Plywood + Laminate",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_top_panel",
      label: "Top Panel",
      partCode: "WR-TOP",
      x: originX + t,
      y: floorY - h,
      z: originZ,
      width: w - t * 2,
      height: t,
      depth: d,
      fill: "#6b4026",
      material: "Plywood + Laminate",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_bottom_panel",
      label: "Bottom Panel",
      partCode: "WR-BOT",
      x: originX + t,
      y: floorY - t,
      z: originZ,
      width: w - t * 2,
      height: t,
      depth: d,
      fill: "#6b4026",
      material: "Plywood + Laminate",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_back_panel",
      label: "Back Panel",
      partCode: "WR-BK",
      x: originX + t,
      y: floorY - h + t,
      z: originZ,
      width: w - t * 2,
      height: h - t * 2,
      depth: 12,
      fill: "#c3a38b",
      material: "Plywood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_shelf",
      label: "Shelf 1",
      partCode: "WR-SH1",
      x: originX + t,
      y: floorY - 1700,
      z: originZ + 40,
      width: w - t * 2,
      height: t,
      depth: d - 40,
      fill: "#b88958",
      material: "Plywood + Laminate",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_shelf",
      label: "Shelf 2",
      partCode: "WR-SH2",
      x: originX + t,
      y: floorY - 1200,
      z: originZ + 40,
      width: w - t * 2,
      height: t,
      depth: d - 40,
      fill: "#b88958",
      material: "Plywood + Laminate",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_shelf",
      label: "Shelf 3",
      partCode: "WR-SH3",
      x: originX + t,
      y: floorY - 700,
      z: originZ + 40,
      width: w - t * 2,
      height: t,
      depth: d - 40,
      fill: "#b88958",
      material: "Plywood + Laminate",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_door",
      label: "Left Door",
      partCode: "WR-DL",
      x: originX + t,
      y: floorY - h + t,
      z: originZ + d - t,
      width: (w - t * 2) / 2,
      height: h - t * 2,
      depth: t,
      fill: "#6b4026",
      material: "Laminated Board",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "wr_door",
      label: "Right Door",
      partCode: "WR-DR",
      x: originX + t + (w - t * 2) / 2,
      y: floorY - h + t,
      z: originZ + d - t,
      width: (w - t * 2) / 2,
      height: h - t * 2,
      depth: t,
      fill: "#6b4026",
      material: "Laminated Board",
    }),
  ];
}

function createCoffeeTableTemplateComponents(
  originX,
  originZ,
  canvasH,
  groupId,
  groupLabel,
) {
  const floorY = canvasH - FLOOR_OFFSET;
  const w = 1000;
  const h = 450;
  const d = 600;
  const topT = 36;
  const legW = 70;
  const shelfT = 22;
  const apronH = 70;
  const inset = 55;
  const legH = h - topT;

  return [
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "ct_top_panel",
      label: "Top Panel",
      partCode: "CT-TOP",
      x: originX,
      y: floorY - h,
      z: originZ,
      width: w,
      height: topT,
      depth: d,
      fill: "#8b5a2b",
      material: "Walnut Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "ct_leg",
      label: "Front Leg L",
      partCode: "CT-FL",
      x: originX + inset,
      y: floorY - legH,
      z: originZ + inset,
      width: legW,
      height: legH,
      depth: legW,
      fill: "#6b4026",
      material: "Walnut Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "ct_leg",
      label: "Front Leg R",
      partCode: "CT-FR",
      x: originX + w - inset - legW,
      y: floorY - legH,
      z: originZ + inset,
      width: legW,
      height: legH,
      depth: legW,
      fill: "#6b4026",
      material: "Walnut Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "ct_leg",
      label: "Back Leg L",
      partCode: "CT-BL",
      x: originX + inset,
      y: floorY - legH,
      z: originZ + d - inset - legW,
      width: legW,
      height: legH,
      depth: legW,
      fill: "#6b4026",
      material: "Walnut Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "ct_leg",
      label: "Back Leg R",
      partCode: "CT-BR",
      x: originX + w - inset - legW,
      y: floorY - legH,
      z: originZ + d - inset - legW,
      width: legW,
      height: legH,
      depth: legW,
      fill: "#6b4026",
      material: "Walnut Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "ct_lower_shelf",
      label: "Lower Shelf",
      partCode: "CT-SH",
      x: originX + 110,
      y: floorY - 170,
      z: originZ + 90,
      width: w - 220,
      height: shelfT,
      depth: d - 180,
      fill: "#7a4a24",
      material: "Walnut Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "ct_front_apron",
      label: "Front Apron",
      partCode: "CT-AF",
      x: originX + inset + legW,
      y: floorY - h + topT,
      z: originZ + inset,
      width: w - inset * 2 - legW * 2,
      height: apronH,
      depth: 22,
      fill: "#7a4a24",
      material: "Walnut Wood",
    }),
    createAssemblyPart({
      groupId,
      groupLabel,
      type: "ct_rear_apron",
      label: "Rear Apron",
      partCode: "CT-AR",
      x: originX + inset + legW,
      y: floorY - h + topT,
      z: originZ + d - inset - 22,
      width: w - inset * 2 - legW * 2,
      height: apronH,
      depth: 22,
      fill: "#7a4a24",
      material: "Walnut Wood",
    }),
  ];
}

function buildFurnitureTemplateParts({
  templateType,
  buildId = makeGroupId(),
  originX = 200,
  originZ = 160,
  canvasH = 3200,
  groupLabel = "Furniture Build",
} = {}) {
  switch (templateType) {
    case "template_dining_table":
      return createDiningTableTemplateComponents(
        originX,
        originZ,
        canvasH,
        buildId,
        groupLabel,
      );

    case "template_bed_frame":
      return createBedTemplateComponents(
        originX,
        originZ,
        canvasH,
        buildId,
        groupLabel,
      );

    case "template_wardrobe":
      return createWardrobeTemplateComponents(
        originX,
        originZ,
        canvasH,
        buildId,
        groupLabel,
      );

    case "template_coffee_table":
      return createCoffeeTableTemplateComponents(
        originX,
        originZ,
        canvasH,
        buildId,
        groupLabel,
      );

    case "template_closet_wardrobe":
      return createClosetWardrobeComponents(
        originX,
        originZ,
        canvasH,
        buildId,
        groupLabel,
      );

    default:
      return [];
  }
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

function getChairManualPlacement(
  typeDef,
  existingGroupComponents,
  allComponents,
  canvasH,
) {
  const floorY = canvasH - FLOOR_OFFSET;
  const seatTop = floorY - 450;

  const origin = existingGroupComponents.length
    ? getChairGroupOrigin(existingGroupComponents)
    : getNextChairOrigin(allComponents);

  const sameType = existingGroupComponents.filter(
    (c) => c.type === typeDef.type,
  );
  const count = sameType.length;

  switch (typeDef.type) {
    case "chair_seat_panel":
      return {
        label: "Seat Panel",
        partCode: "SP",
        x: origin.x,
        y: seatTop,
        z: origin.z + 20,
        width: 420,
        height: 20,
        depth: 420,
      };

    case "chair_front_leg":
      return {
        label:
          count === 0
            ? "Front Leg L"
            : count === 1
              ? "Front Leg R"
              : `Front Leg ${count + 1}`,
        partCode: count === 0 ? "FL" : count === 1 ? "FR" : `FL${count + 1}`,
        x: origin.x + (count % 2 === 0 ? 0 : 385) + Math.max(0, count - 1) * 25,
        y: floorY - 430,
        z: origin.z + 20,
        width: 35,
        height: 430,
        depth: 35,
      };

    case "chair_back_leg":
      return {
        label:
          count === 0
            ? "Back Leg L"
            : count === 1
              ? "Back Leg R"
              : `Back Leg ${count + 1}`,
        partCode: count === 0 ? "BL" : count === 1 ? "BR" : `BL${count + 1}`,
        x: origin.x + (count % 2 === 0 ? 0 : 385) + Math.max(0, count - 1) * 25,
        y: floorY - 920,
        z: origin.z + 405,
        width: 35,
        height: 920,
        depth: 35,
      };

    case "chair_front_rail":
      return {
        label: count === 0 ? "Front Rail" : `Front Rail ${count + 1}`,
        partCode: count === 0 ? "FRT" : `FRT${count + 1}`,
        x: origin.x + 35,
        y: seatTop + 28 + count * 24,
        z: origin.z + 35,
        width: 350,
        height: 20,
        depth: 20,
      };

    case "chair_rear_rail":
      return {
        label: count === 0 ? "Rear Rail" : `Rear Rail ${count + 1}`,
        partCode: count === 0 ? "RRT" : `RRT${count + 1}`,
        x: origin.x + 35,
        y: seatTop + 28 + count * 24,
        z: origin.z + 400,
        width: 350,
        height: 20,
        depth: 20,
      };

    case "chair_side_rail":
      return {
        label:
          count === 0
            ? "Side Rail L"
            : count === 1
              ? "Side Rail R"
              : `Side Rail ${count + 1}`,
        partCode: count === 0 ? "SRL" : count === 1 ? "SRR" : `SR${count + 1}`,
        x: origin.x + (count % 2 === 0 ? 8 : 392),
        y: seatTop + 28,
        z: origin.z + 55 + Math.max(0, count - 1) * 18,
        width: 20,
        height: 20,
        depth: 310,
      };

    case "chair_back_slat":
      return {
        label: `Back Slat ${count + 1}`,
        partCode: `BS${count + 1}`,
        x: origin.x + 50,
        y: seatTop - 120 - count * 72,
        z: origin.z + 405,
        width: 320,
        height: 18,
        depth: 20,
      };

    default:
      return {
        label: typeDef.label,
        partCode: "",
        x: origin.x,
        y: floorY - typeDef.h,
        z: origin.z,
        width: typeDef.w,
        height: typeDef.h,
        depth: typeDef.d,
      };
  }
}

function getChairExplodedBox(comp, groupComponents) {
  const slatIndex = groupComponents
    .filter((c) => c.type === "chair_back_slat")
    .sort((a, b) => a.y - b.y)
    .findIndex((c) => c.id === comp.id);

  const frontLegIndex = groupComponents
    .filter((c) => c.type === "chair_front_leg")
    .sort((a, b) => a.x - b.x)
    .findIndex((c) => c.id === comp.id);

  const backLegIndex = groupComponents
    .filter((c) => c.type === "chair_back_leg")
    .sort((a, b) => a.x - b.x)
    .findIndex((c) => c.id === comp.id);

  const sideRailIndex = groupComponents
    .filter((c) => c.type === "chair_side_rail")
    .sort((a, b) => a.x - b.x)
    .findIndex((c) => c.id === comp.id);

  switch (comp.type) {
    case "chair_back_slat":
      return {
        x: 260,
        y: 50 + Math.max(0, slatIndex) * 58,
        w: comp.width,
        h: Math.max(22, comp.height * 2),
      };

    case "chair_back_leg":
      return {
        x: backLegIndex <= 0 ? 95 : 620,
        y: 120,
        w: 42,
        h: Math.max(260, comp.height * 0.72),
      };

    case "chair_seat_panel":
      return {
        x: 235,
        y: 340,
        w: comp.width * 0.82,
        h: Math.max(42, comp.depth * 0.22),
      };

    case "chair_front_leg":
      return {
        x: frontLegIndex <= 0 ? 155 : 570,
        y: 450,
        w: 40,
        h: Math.max(190, comp.height * 0.65),
      };

    case "chair_front_rail":
      return {
        x: 260,
        y: 455,
        w: comp.width * 0.75,
        h: Math.max(20, comp.height * 1.3),
      };

    case "chair_rear_rail":
      return {
        x: 260,
        y: 505,
        w: comp.width * 0.75,
        h: Math.max(20, comp.height * 1.3),
      };

    case "chair_side_rail":
      return {
        x: sideRailIndex <= 0 ? 190 : 615,
        y: 372,
        w: 28,
        h: Math.max(130, comp.depth * 0.72),
      };

    default:
      return {
        x: comp.x,
        y: comp.y,
        w: comp.width,
        h: comp.height,
      };
  }
}

function getGenericExplodedBox(comp, index) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 80 + col * 270,
    y: 70 + row * 190,
    w: Math.max(90, Math.min(240, comp.width * 0.18)),
    h: Math.max(70, Math.min(150, comp.height * 0.18)),
  };
}

function getExplodedBox(comp, groupComponents, index) {
  const isChairGroup = groupComponents.some(
    (c) => c.groupType === "chair" || isChairPartType(c.type),
  );
  return isChairGroup
    ? getChairExplodedBox(comp, groupComponents)
    : getGenericExplodedBox(comp, index);
}

function getExportDrawingArea(pageW = EXPORT_PAGE_W, pageH = EXPORT_PAGE_H) {
  return {
    x: PAPER_MARGIN + DRAWING_PADDING,
    y: PAPER_MARGIN + DRAWING_PADDING,
    w: pageW - PAPER_MARGIN * 2 - DRAWING_PADDING * 2,
    h: pageH - PAPER_MARGIN * 2 - TITLE_BLOCK_H - DRAWING_PADDING * 1.45,
  };
}

function getExportRawItems(selectedComponents, view) {
  if (!selectedComponents.length) return [];

  if (view === "exploded") {
    return selectedComponents.map((comp, index) => ({
      comp,
      box: getExplodedBox(comp, selectedComponents, index),
    }));
  }

  const projected = selectedComponents
    .map((comp) => {
      const box = getProjectedBox(comp, view);
      if (!box) return null;
      return { comp, box };
    })
    .filter(Boolean);

  const bounds = get2DBounds(projected);

  return projected.map((item) => ({
    ...item,
    box: getMirroredBox(item.box, bounds, view),
  }));
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
