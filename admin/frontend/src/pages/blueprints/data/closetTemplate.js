import { createAssemblyPart } from "./componentUtils";

const FLOOR_OFFSET = 40;
const SURFACE_EPS = 1;

export function createClosetWardrobeComponents(
  originX,
  originZ,
  canvasH,
  groupId,
  groupLabel,
) {
  const floorY = canvasH - FLOOR_OFFSET;

  // overall size
  const w = 3200;
  const h = 2400;
  const d = 600;

  // board thickness
  const t = 18;
  const backT = 12;
  const shelfT = 18;
  const shelfDepth = d - 28;
  const frontInset = 10;
  const backBottomOverlap = 8;

  // openings
  const bay1W = 740;
  const bay2W = 700;
  const bay3W = 930;
  const bay4W = 740;

  const innerX = originX + t;

  const bay1X = innerX;
  const div1X = bay1X + bay1W;

  const bay2X = div1X + t;
  const div2X = bay2X + bay2W;

  const bay3X = div2X + t;
  const div3X = bay3X + bay3W;

  const bay4X = div3X + t;

  const topY = floorY - h;
  const topShelfY = topY + 255;
  const rodY = topShelfY + 58;

  const topAddOnX = originX + t;
  const topAddOnW = w - t * 2;
  const topAddOnZ = originZ + frontInset;
  const topAddOnD = shelfDepth;

  // base
  const baseTopT = 18;
  const baseFaceH = 96;
  const baseTopY = floorY - baseFaceH - baseTopT;
  const baseDepth = d - 18;

  // shelves
  const bay2Shelf1Y = topY + 650;
  const bay2Shelf2Y = topY + 1020;
  const bay1ExtraShelfY = topY + 1545;

  // drawers
  const bay2DrawerCoverY = topY + 1685;
  const bay2DrawerFrontH = 210;
  const bay2DrawerGap = 8;
  const bay2Drawer1Y = bay2DrawerCoverY + shelfT + 5;
  const bay2Drawer2Y = bay2Drawer1Y + bay2DrawerFrontH + bay2DrawerGap;

  const bay3PedestalW = 320;
  const bay3DrawerCoverY = topY + 1940;
  const bay3DrawerY = bay3DrawerCoverY + shelfT + 5;
  const bay3DrawerFrontW = bay3PedestalW - 28;
  const bay3PedestalSideX = bay3X + bay3PedestalW - t;

  const bay3TableTopY = topY + 1135;
  const bay3TableZ = originZ + 140;
  const bay3TableD = 430;
  const bay3TableX = bay3PedestalSideX;
  const bay3TableW = bay3W - (bay3PedestalW - t);

  const C = {
    carcass: "#8A5C38",
    divider: "#7A4F2F",
    shelf: "#A87449",
    drawerFront: "#BC8456",
    drawerBox: "#76492B",
    drawerBottom: "#99663E",
    back: "#6A4025",
    metal: "#C9CED6",
  };

  const part = (data) =>
    createAssemblyPart({
      groupId,
      groupLabel,
      category: "Furniture Parts",
      blueprintStyle: "part",
      ...data,
    });

  const buildRaisedBase = ({ x, width, suffix }) => [
    part({
      type: "wr_base_top",
      label: `Base Top ${suffix}`,
      partCode: `WR-BT${suffix}`,
      x,
      y: baseTopY,
      z: originZ,
      width,
      height: baseTopT,
      depth: baseDepth,
      fill: C.shelf,
    }),
  ];

  const buildDrawerUnit = ({ x, y, frontW, frontH, suffix }) => {
    const frontZ = originZ + d - 18 + SURFACE_EPS;
    const bodyW = frontW - 24;
    const boxZ = originZ + 40;

    return [
      part({
        type: "wr_drawer_front",
        label: `Drawer Front ${suffix}`,
        partCode: `WR-DF${suffix}`,
        x,
        y,
        z: frontZ,
        width: frontW,
        height: frontH,
        depth: 18,
        fill: C.drawerFront,
      }),
      part({
        type: "wr_drawer_side",
        label: `Drawer Side L ${suffix}`,
        partCode: `WR-DSL${suffix}`,
        x: x + 12,
        y: y + 16,
        z: boxZ,
        width: 12,
        height: 120,
        depth: 400,
        fill: C.drawerBox,
      }),
      part({
        type: "wr_drawer_side",
        label: `Drawer Side R ${suffix}`,
        partCode: `WR-DSR${suffix}`,
        x: x + frontW - 24,
        y: y + 16,
        z: boxZ,
        width: 12,
        height: 120,
        depth: 400,
        fill: C.drawerBox,
      }),
      part({
        type: "wr_drawer_back",
        label: `Drawer Back ${suffix}`,
        partCode: `WR-DB${suffix}`,
        x: x + 24,
        y: y + 16,
        z: boxZ + 388,
        width: bodyW - 24,
        height: 120,
        depth: 12,
        fill: C.drawerBox,
      }),
      part({
        type: "wr_drawer_bottom",
        label: `Drawer Bottom ${suffix}`,
        partCode: `WR-DP${suffix}`,
        x: x + 12,
        y: y + 130,
        z: boxZ + 12,
        width: bodyW,
        height: 6,
        depth: 360,
        fill: C.drawerBottom,
      }),
      part({
        type: "wr_drawer_handle",
        label: `Handle ${suffix}`,
        partCode: `WR-HDL${suffix}`,
        x: x + frontW / 2 - 50,
        y: y + frontH / 2 - 8,
        z: originZ + d + 6,
        width: 100,
        height: 16,
        depth: 12,
        fill: C.metal,
      }),
    ];
  };

  return [
    // outer
    part({
      type: "wr_side_panel",
      label: "Left Side",
      partCode: "WR-SPL",
      x: originX,
      y: topY,
      z: originZ,
      width: t,
      height: h,
      depth: d,
      fill: C.carcass,
    }),
    part({
      type: "wr_side_panel",
      label: "Right Side",
      partCode: "WR-SPR",
      x: originX + w - t,
      y: topY,
      z: originZ,
      width: t,
      height: h,
      depth: d,
      fill: C.carcass,
    }),

    part({
      type: "wr_back_panel",
      label: "Back",
      partCode: "WR-BK",
      x: originX + t,
      y: topY + t,
      z: originZ,
      width: w - t * 2,
      height: h - t + backBottomOverlap,
      depth: backT,
      fill: C.back,
    }),

    // dividers
    part({
      type: "wr_divider",
      label: "Div1",
      partCode: "WR-D1",
      x: div1X,
      y: topY + t,
      z: originZ,
      width: t,
      height: h - t * 2,
      depth: d,
      fill: C.divider,
    }),
    part({
      type: "wr_divider",
      label: "Div2",
      partCode: "WR-D2",
      x: div2X,
      y: topY + t,
      z: originZ,
      width: t,
      height: h - t * 2,
      depth: d,
      fill: C.divider,
    }),
    part({
      type: "wr_divider",
      label: "Div3",
      partCode: "WR-D3",
      x: div3X,
      y: topY + t,
      z: originZ,
      width: t,
      height: h - t * 2,
      depth: d,
      fill: C.divider,
    }),

    // top shelves
    part({
      type: "wr_shelf",
      label: "Top AddOn",
      partCode: "WR-TOP",
      x: topAddOnX,
      y: topY,
      z: topAddOnZ,
      width: topAddOnW,
      height: shelfT,
      depth: topAddOnD,
      fill: C.shelf,
    }),

    // rods
    part({
      type: "wr_rod",
      label: "Rod1",
      partCode: "WR-R1",
      x: bay1X + 40,
      y: rodY,
      z: originZ + d * 0.6,
      width: bay1W - 80,
      height: 16,
      depth: 16,
      fill: C.metal,
    }),
    part({
      type: "wr_rod",
      label: "Rod3",
      partCode: "WR-R3",
      x: bay3X + 40,
      y: rodY,
      z: originZ + d * 0.6,
      width: bay3W - 80,
      height: 16,
      depth: 16,
      fill: C.metal,
    }),
    part({
      type: "wr_rod",
      label: "Rod4",
      partCode: "WR-R4",
      x: bay4X + 40,
      y: rodY,
      z: originZ + d * 0.6,
      width: bay4W - 80,
      height: 16,
      depth: 16,
      fill: C.metal,
    }),

    // bases
    ...buildRaisedBase({ x: bay1X, width: bay1W, suffix: "1" }),
    ...buildRaisedBase({ x: bay2X, width: bay2W, suffix: "2" }),
    ...buildRaisedBase({ x: bay3X, width: bay3W, suffix: "3" }),
    ...buildRaisedBase({ x: bay4X, width: bay4W, suffix: "4" }),

    // center shelves
    part({
      type: "wr_shelf",
      label: "Center1",
      partCode: "WR-C1",
      x: bay2X,
      y: bay2Shelf1Y,
      z: originZ + frontInset,
      width: bay2W,
      height: shelfT,
      depth: shelfDepth,
      fill: C.shelf,
    }),
    part({
      type: "wr_shelf",
      label: "Center2",
      partCode: "WR-C2",
      x: bay2X,
      y: bay2Shelf2Y,
      z: originZ + frontInset,
      width: bay2W,
      height: shelfT,
      depth: shelfDepth,
      fill: C.shelf,
    }),

    // drawers
    ...buildDrawerUnit({
      x: bay2X + 10,
      y: bay2Drawer1Y,
      frontW: bay2W - 20,
      frontH: bay2DrawerFrontH,
      suffix: "1",
    }),
    ...buildDrawerUnit({
      x: bay2X + 10,
      y: bay2Drawer2Y,
      frontW: bay2W - 20,
      frontH: bay2DrawerFrontH,
      suffix: "2",
    }),

    // small drawer
    ...buildDrawerUnit({
      x: bay3X + 12,
      y: bay3DrawerY,
      frontW: bay3DrawerFrontW,
      frontH: 160,
      suffix: "3",
    }),

    // table
    part({
      type: "wr_table",
      label: "Side Table",
      partCode: "WR-TBL",
      x: bay3TableX,
      y: bay3TableTopY,
      z: bay3TableZ,
      width: bay3TableW,
      height: shelfT,
      depth: bay3TableD,
      fill: C.shelf,
    }),
  ];
}
