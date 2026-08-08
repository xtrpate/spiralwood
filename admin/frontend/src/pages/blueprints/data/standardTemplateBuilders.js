// data/standardTemplateBuilders.js
// Standard furniture assembly builders extracted from templateComponents.js.
// Behavior, dimensions, materials, labels, and part codes are unchanged.

import { createAssemblyPart } from "./componentUtils";
import { makeGroupId } from "./utils";
import { createClosetWardrobeComponents } from "./closetTemplate";

const FLOOR_OFFSET = 40;

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

export {
  createDiningTableTemplateComponents,
  createBedTemplateComponents,
  createWardrobeTemplateComponents,
  createCoffeeTableTemplateComponents,
  buildFurnitureTemplateParts,
  createClosetWardrobeComponents,
};
