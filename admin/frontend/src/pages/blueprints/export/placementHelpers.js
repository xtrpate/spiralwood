// export/placementHelpers.js — Placement, exploded view, and export scaling helpers
import {
  get2DBounds,
  getProjectedBox,
  getMirroredBox,
  getChairGroupOrigin,
  getNextChairOrigin,
  isChairPartType,
} from "../data/componentUtils";

const FLOOR_OFFSET = 40;
const EXPORT_PAGE_W = 1200;
const EXPORT_PAGE_H = 820;
const DRAWING_PADDING = 56;
const TITLE_BLOCK_H = 96;
const PAPER_MARGIN = 28;

function compactText(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTokenText(value = "") {
  return compactText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function isDiningTableGroup(groupComponents = []) {
  if (!Array.isArray(groupComponents) || groupComponents.length < 6)
    return false;
  const matches = groupComponents.filter((comp) => {
    const partCode = compactText(comp?.partCode);
    const type = compactText(comp?.type);
    const groupLabel = compactText(comp?.groupLabel);
    const templateType = compactText(comp?.templateType);
    const label = compactText(comp?.label);

    return (
      /^DT[-_]/i.test(partCode) ||
      /^dt_/i.test(type) ||
      /dining table/i.test(groupLabel) ||
      /dining table/i.test(templateType) ||
      /top panel|apron|leg/i.test(label)
    );
  }).length;

  return matches >= Math.max(5, Math.floor(groupComponents.length * 0.65));
}

function getDiningTablePartRole(comp = {}) {
  const partCode = normalizeTokenText(comp?.partCode);
  const label = normalizeTokenText(comp?.label);
  const type = normalizeTokenText(comp?.type);

  if (
    /\btop\b/.test(partCode) ||
    /top panel/.test(label) ||
    /table top/.test(type)
  ) {
    return "top";
  }

  if (/\baf\b/.test(partCode) || /front apron/.test(label)) return "frontApron";
  if (/\bar2\b/.test(partCode) || /right apron/.test(label))
    return "rightApron";
  if (/\bal\b/.test(partCode) || /left apron/.test(label)) return "leftApron";
  if (
    /\bar\b/.test(partCode) ||
    /rear apron/.test(label) ||
    /back apron/.test(label)
  ) {
    return "rearApron";
  }
  if (/\bfl\b/.test(partCode) || /front leg l/.test(label)) return "frontLegL";
  if (/\bfr\b/.test(partCode) || /front leg r/.test(label)) return "frontLegR";
  if (/\bbl\b/.test(partCode) || /back leg l/.test(label)) return "backLegL";
  if (/\bbr\b/.test(partCode) || /back leg r/.test(label)) return "backLegR";

  return "other";
}

function getDiningTableVisualSize(comp, role) {
  const width = Number(comp?.width) || 0;
  const height = Number(comp?.height) || 0;
  const depth = Number(comp?.depth) || 0;

  switch (role) {
    case "top":
      return {
        w: Math.max(280, Math.min(380, width * 0.16)),
        h: Math.max(88, Math.min(122, depth * 0.11)),
      };

    case "frontApron":
    case "rearApron":
      return {
        w: Math.max(250, Math.min(340, Math.max(width, depth) * 0.19)),
        h: Math.max(36, Math.min(56, Math.max(height, depth) * 0.36)),
      };

    case "leftApron":
    case "rightApron":
      return {
        w: Math.max(50, Math.min(76, Math.min(width, depth) * 1.15)),
        h: Math.max(144, Math.min(214, Math.max(width, depth) * 0.21)),
      };

    default:
      return {
        w: Math.max(54, Math.min(76, Math.max(width, depth) * 0.68)),
        h: Math.max(160, Math.min(250, height * 0.28)),
      };
  }
}

function getDiningTableExplodedBox(comp) {
  const role = getDiningTablePartRole(comp);
  const { w, h } = getDiningTableVisualSize(comp, role);

  const slots = {
    top: { x: 600, y: 72, labelSide: "top", labelLane: 0 },
    leftApron: { x: 214, y: 214, labelSide: "left", labelLane: 0 },
    frontApron: { x: 410, y: 250, labelSide: "left", labelLane: 1 },
    rearApron: { x: 790, y: 250, labelSide: "right", labelLane: 1 },
    rightApron: { x: 986, y: 214, labelSide: "right", labelLane: 0 },
    frontLegL: { x: 276, y: 438, labelSide: "left", labelLane: 2 },
    backLegL: { x: 430, y: 438, labelSide: "left", labelLane: 3 },
    frontLegR: { x: 770, y: 438, labelSide: "right", labelLane: 2 },
    backLegR: { x: 924, y: 438, labelSide: "right", labelLane: 3 },
    other: { x: 600, y: 462, labelSide: "bottom", labelLane: 1 },
  };

  const slot = slots[role] || slots.other;

  return {
    x: slot.x - w / 2,
    y: slot.y,
    w,
    h,
    labelSide: slot.labelSide,
    labelLane: slot.labelLane,
  };
}

function getGenericExplodedBox(comp, index, groupComponents = []) {
  const total = Array.isArray(groupComponents) ? groupComponents.length : 0;
  const cols = total <= 4 ? 2 : total <= 8 ? 3 : 4;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = cols === 4 ? 220 : cols === 3 ? 290 : 380;
  const cellH = 180;

  const visualW = Math.max(
    88,
    Math.min(
      cols === 4 ? 172 : 228,
      Math.max(Number(comp?.width) || 0, Number(comp?.depth) || 0) * 0.18,
    ),
  );
  const visualH = Math.max(
    58,
    Math.min(
      142,
      Math.max(Number(comp?.height) || 0, Number(comp?.depth) || 0) * 0.18,
    ),
  );

  const labelSide = col < cols / 2 ? "left" : "right";
  const laneBase = row * 2 + (col < cols / 2 ? col : cols - col - 1);

  return {
    x: 110 + col * cellW + (cellW - visualW) / 2,
    y: 90 + row * cellH + (cellH - visualH) / 2,
    w: visualW,
    h: visualH,
    labelSide,
    labelLane: Math.max(0, Math.min(5, laneBase)),
  };
}

function getExplodedBox(comp, groupComponents, index) {
  if (isDiningTableGroup(groupComponents)) {
    return getDiningTableExplodedBox(comp);
  }

  const isChairGroup = groupComponents.some(
    (c) => c.groupType === "chair" || isChairPartType(c.type),
  );

  return isChairGroup
    ? getChairExplodedBox(comp, groupComponents)
    : getGenericExplodedBox(comp, index, groupComponents);
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

function getScaledExportItems(
  selectedComponents,
  view,
  pageW = EXPORT_PAGE_W,
  pageH = EXPORT_PAGE_H,
) {
  const drawingArea = getExportDrawingArea(pageW, pageH);
  const rawItems = getExportRawItems(selectedComponents, view);
  const bounds2D = get2DBounds(rawItems);

  if (!bounds2D) {
    return {
      drawingArea,
      rawItems: [],
      scaledItems: [],
      bounds2D: null,
      overallScreenBounds: null,
    };
  }

  const scale = Math.min(
    drawingArea.w / Math.max(bounds2D.width, 1),
    drawingArea.h / Math.max(bounds2D.height, 1),
    view === "exploded" ? 0.82 : 1.1,
  );

  const offsetX = drawingArea.x + (drawingArea.w - bounds2D.width * scale) / 2;
  const offsetY = drawingArea.y + (drawingArea.h - bounds2D.height * scale) / 2;

  const scaledItems = rawItems.map((item) => ({
    ...item,
    screenBox: {
      x: offsetX + (item.box.x - bounds2D.minX) * scale,
      y: offsetY + (item.box.y - bounds2D.minY) * scale,
      w: Math.max(8, item.box.w * scale),
      h: Math.max(8, item.box.h * scale),
      labelSide: item.box.labelSide || null,
      labelLane: Number.isFinite(item.box.labelLane)
        ? item.box.labelLane
        : null,
    },
  }));

  const overallScreenBounds = scaledItems.length
    ? {
        minX: Math.min(...scaledItems.map((i) => i.screenBox.x)),
        minY: Math.min(...scaledItems.map((i) => i.screenBox.y)),
        maxX: Math.max(
          ...scaledItems.map((i) => i.screenBox.x + i.screenBox.w),
        ),
        maxY: Math.max(
          ...scaledItems.map((i) => i.screenBox.y + i.screenBox.h),
        ),
      }
    : null;

  return {
    drawingArea,
    rawItems,
    scaledItems,
    bounds2D,
    overallScreenBounds,
  };
}

export {
  getChairManualPlacement,
  getChairExplodedBox,
  getGenericExplodedBox,
  getExplodedBox,
  getExportDrawingArea,
  getExportRawItems,
  getScaledExportItems,
};
