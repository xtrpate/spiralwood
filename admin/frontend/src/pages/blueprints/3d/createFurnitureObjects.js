// 3d/createFurnitureObject.js — Dispatch function that builds 3D objects by type
import * as THREE from "three";
import {
  getMaterialPalette,
  createMaterial,
  createFurnitureMaterial,
  addEdgeHighlight,
  addBoxPart,
  addRoundedPanel,
  addCylinderPart,
} from "./materialHelpers";
import {
  buildCasework3D,
  buildTable3D,
  buildBench3D,
  buildSofa3D,
  buildBed3D,
  buildOfficeChair3D,
  buildLounger3D,
  buildPatioSet3D,
} from "./buildFunctions3D";
import { addRoundedBox, addSmartBox } from "../shapes/roundedBox";
import { addCircleShape } from "../shapes/circleShape";
import { addTriangleShape } from "../shapes/triangleShape";
import { addCubeShape } from "../shapes/cubeShape";
import { addTrapezoidShape } from "../shapes/trapezoidShape";
import { addWoodworkingProfile3D } from "../shapes/woodworkingProfile3D";
import { isWoodworkingProfileComponent } from "../data/woodworkingProfile";
import { CASEWORK_SET, TABLE_SET, BENCH_SET } from "../data/furnitureTypes";
import { createDiningChairTemplateComponents } from "../data/templateComponents";

const FLOOR_OFFSET = 40;

const WARDROBE_PART_SET = new Set([
  "wr_side_panel",
  "wr_divider",
  "wr_back_panel",
  "wr_top_panel",
  "wr_bottom_panel",
  "wr_top_shelf",
  "wr_shelf",
  "wr_door",
  "wr_base_top",
  "wr_drawer_front",
  "wr_drawer_side",
  "wr_drawer_back",
  "wr_drawer_bottom",
  "wr_drawer_handle",
  "wr_rod",
  "wr_support_panel",
  "wr_table",
]);

// Visual-only overlay clearance. Wardrobe shelves and carcass panels can end
// on the same front plane as door components in saved template geometry.
// Moving only the rendered door/front mesh slightly outward prevents
// depth-buffer competition while preserving all saved component coordinates.
const WARDROBE_DOOR_VISUAL_CLEARANCE = 3;

// WISDOM WARDROBE SHELF CONTACT STABILITY V1
// Internal shelves are saved flush against side/divider/back boundaries.
// Since every part is a separate closed mesh, those flush end faces can be
// coplanar and compete in the depth buffer. Keep the real component size
// unchanged and inset only the rendered shelf by an imperceptible 1 mm per
// side so orbiting the camera cannot reveal flickering contact faces.
const WARDROBE_SHELF_VISUAL_CLEARANCE = 1;

function toneColor(color, amount = 0) {
  const c = new THREE.Color(color || "#c08a5a");

  if (amount >= 0) {
    c.lerp(new THREE.Color("#ffffff"), Math.min(1, amount));
  } else {
    c.lerp(new THREE.Color("#000000"), Math.min(1, Math.abs(amount)));
  }

  return c;
}

function makeWardrobeMaterial(
  comp,
  color,
  role = "front",
  overrides = {},
) {
  return createFurnitureMaterial(
    comp,
    toneColor(color, 0),
    role,
    {
      roughness: 0.48,
      metalness: 0.03,
      clearcoat: 0.18,
      clearcoatRoughness: 0.34,
      ...overrides,
    },
  );
}

function buildWardrobePart3D(root, selectableMeshes, comp, palette, r = 0) {
  const w = comp.width;
  const h = comp.height;
  const d = comp.depth;

  const base = comp.fill || palette.front || "#bc8756";

  const faceMat = makeWardrobeMaterial(comp, base, "front", {
    roughness: 0.42,
    clearcoat: 0.24,
  });

  const carcassMat = makeWardrobeMaterial(
    comp,
    toneColor(base, -0.14),
    "carcass",
    { roughness: 0.58, clearcoat: 0.12 },
  );

  const backMat = makeWardrobeMaterial(
    comp,
    toneColor(base, -0.08),
    "inside",
    { roughness: 0.78, clearcoat: 0.04 },
  );

  const drawerBoxMat = makeWardrobeMaterial(
    comp,
    toneColor(base, -0.24),
    "inside",
    { roughness: 0.76, clearcoat: 0.04 },
  );

  const metalMat = createFurnitureMaterial(
    { ...comp, material: "Brushed Metal", grainDirection: "none" },
    comp.fill || "#c9ced6",
    "metal",
    {
      roughness: 0.22,
      metalness: 0.92,
      clearcoat: 0.38,
      clearcoatRoughness: 0.16,
    },
  );
  const FACE_GAP = 0.8;

  if (comp.type === "wr_rod") {
    const radius = Math.max(4, Math.min(h, d) * 0.28);

    const bar = addCylinderPart(
      root,
      selectableMeshes,
      radius,
      radius,
      w,
      28,
      [0, 0, 0],
      metalMat,
      comp.id,
    );
    bar.rotation.z = Math.PI / 2;

    const bracketOffset = w / 2 - 10;
    const bracketW = 8;
    const bracketH = Math.max(10, radius * 1.6);
    const bracketD = Math.max(12, radius * 2);

    addBoxPart(
      root,
      selectableMeshes,
      [bracketW, bracketH, bracketD],
      [-bracketOffset, 0, 0],
      metalMat,
      comp.id,
      false,
      2,
    );

    addBoxPart(
      root,
      selectableMeshes,
      [bracketW, bracketH, bracketD],
      [bracketOffset, 0, 0],
      metalMat,
      comp.id,
      false,
      2,
    );

    return true;
  }

  if (comp.type === "wr_drawer_handle") {
    const barH = Math.max(6, h * 0.45);
    const barD = Math.max(6, d * 0.45);
    const postW = 6;
    const postH = Math.max(6, h * 0.4);
    const postD = Math.max(10, d * 0.8);
    const postOffset = Math.max(18, w * 0.28);

    addBoxPart(
      root,
      selectableMeshes,
      [w, barH, barD],
      [0, 0, barD * 0.3],
      metalMat,
      comp.id,
      false,
      3,
    );

    addBoxPart(
      root,
      selectableMeshes,
      [postW, postH, postD],
      [-postOffset, 0, -postD * 0.15],
      metalMat,
      comp.id,
      false,
      2,
    );

    addBoxPart(
      root,
      selectableMeshes,
      [postW, postH, postD],
      [postOffset, 0, -postD * 0.15],
      metalMat,
      comp.id,
      false,
      2,
    );

    return true;
  }

  if (comp.type === "wr_door") {
    addBoxPart(
      root,
      selectableMeshes,
      [w, h, d],
      [0, 0, WARDROBE_DOOR_VISUAL_CLEARANCE],
      faceMat,
      comp.id,
      true,
      Math.min(r, 3),
    );

    return true;
  }

  if (
    comp.type === "wr_side_panel" ||
    comp.type === "wr_divider" ||
    comp.type === "wr_support_panel"
  ) {
    addBoxPart(
      root,
      selectableMeshes,
      [w, h, d],
      [0, 0, 0],
      carcassMat,
      comp.id,
      true,
      Math.min(r, 3),
    );

    return true;
  }

  if (comp.type === "wr_back_panel") {
    const body = addBoxPart(
      root,
      selectableMeshes,
      [w, h, Math.max(8, d)],
      [0, 0, 0],
      backMat,
      comp.id,
      false,
      0,
    );

    addEdgeHighlight(root, body, toneColor(base, 0.18).getHex(), 0.04);
    return true;
  }

  if (comp.type === "wr_top_shelf" || comp.type === "wr_shelf") {
    // Render-only clearance: component.width/depth remain untouched, so
    // measurements, editing, BOM data and saved blueprint coordinates stay exact.
    const maxWidthClearance = Math.max(0, (w - 1) / 2);
    const maxDepthClearance = Math.max(0, (d - 1) / 2);
    const widthClearance = Math.min(
      WARDROBE_SHELF_VISUAL_CLEARANCE,
      maxWidthClearance,
    );
    const depthClearance = Math.min(
      WARDROBE_SHELF_VISUAL_CLEARANCE,
      maxDepthClearance,
    );

    addBoxPart(
      root,
      selectableMeshes,
      [
        Math.max(1, w - widthClearance * 2),
        h,
        Math.max(1, d - depthClearance * 2),
      ],
      [0, 0, 0],
      faceMat,
      comp.id,
      true,
      Math.min(r, 3),
    );

    return true;
  }

  if (
    comp.type === "wr_top_panel" ||
    comp.type === "wr_bottom_panel" ||
    comp.type === "wr_base_top" ||
    comp.type === "wr_table"
  ) {
    addBoxPart(
      root,
      selectableMeshes,
      [w, h, d],
      [0, 0, 0],
      faceMat,
      comp.id,
      true,
      Math.min(r, 3),
    );

    return true;
  }

  if (comp.type === "wr_drawer_front") {
    addBoxPart(
      root,
      selectableMeshes,
      [w, h, Math.max(18, d)],
      [0, 0, WARDROBE_DOOR_VISUAL_CLEARANCE],
      faceMat,
      comp.id,
      true,
      3,
    );

    return true;
  }

  if (
    comp.type === "wr_drawer_side" ||
    comp.type === "wr_drawer_back" ||
    comp.type === "wr_drawer_bottom"
  ) {
    addBoxPart(
      root,
      selectableMeshes,
      [w, h, d],
      [0, 0, 0],
      drawerBoxMat,
      comp.id,
      true,
      0,
    );

    return true;
  }

  const body = addBoxPart(
    root,
    selectableMeshes,
    [w, h, d],
    [0, 0, 0],
    faceMat,
    comp.id,
    true,
    Math.min(r, 2),
  );

  addEdgeHighlight(root, body, toneColor(base, 0.24).getHex(), 0.06);
  return true;
}

function createFurnitureObject(comp, selected, editing, selectableMeshes) {
  const root = new THREE.Group();
  root.userData.id = comp.id;

  const w = comp.width;
  const h = comp.height;
  const d = comp.depth;
  const r = Number(comp.cornerRadius) || 0;
  const palette = getMaterialPalette(comp);

  const frontMat = createMaterial(
    palette.front,
    selected,
    editing,
    comp,
    "front",
  );
  const carcassMat = createFurnitureMaterial(
    comp,
    palette.carcass,
    "carcass",
    { roughness: 0.58, clearcoat: 0.1, clearcoatRoughness: 0.52 },
  );
  const insideMat = createFurnitureMaterial(
    comp,
    palette.inside,
    "inside",
    { roughness: 0.74, clearcoat: 0.04, clearcoatRoughness: 0.72 },
  );
  const countertopMat = createFurnitureMaterial(
    comp,
    palette.front,
    "countertop",
    { roughness: 0.26, clearcoat: 0.38, clearcoatRoughness: 0.22 },
  );

  if (isWoodworkingProfileComponent(comp)) {
    const profileMesh = addWoodworkingProfile3D(
      root,
      selectableMeshes,
      comp,
      frontMat,
      comp.id,
    );

    if (profileMesh) {
      addEdgeHighlight(root, profileMesh, palette.edge, 0.07);
    }

    return root;
  }

  if (WARDROBE_PART_SET.has(comp.type)) {
    buildWardrobePart3D(root, selectableMeshes, comp, palette, r);
    return root;
  }
  if (comp.type === "chair_seat_panel") {
    const seat = addRoundedPanel(
      root,
      selectableMeshes,
      w,
      Math.max(12, h),
      d,
      0,
      0,
      0,
      frontMat,
      comp.id,
      r,
    );
    addEdgeHighlight(root, seat, palette.edge, 0.09);
    return root;
  }

  if (comp.type === "chair_front_leg" || comp.type === "chair_back_leg") {
    const leg = addBoxPart(
      root,
      selectableMeshes,
      [w, h, d],
      [0, 0, 0],
      frontMat,
      comp.id,
      true,
      r,
    );
    addEdgeHighlight(root, leg, palette.edge, 0.08);
    return root;
  }

  if (
    comp.type === "chair_front_rail" ||
    comp.type === "chair_rear_rail" ||
    comp.type === "chair_side_rail"
  ) {
    const rail = addBoxPart(
      root,
      selectableMeshes,
      [w, h, d],
      [0, 0, 0],
      frontMat,
      comp.id,
      true,
      r,
    );
    addEdgeHighlight(root, rail, palette.edge, 0.08);
    return root;
  }

  if (comp.type === "chair_back_slat") {
    const slat = addRoundedPanel(
      root,
      selectableMeshes,
      w,
      Math.max(12, h),
      d,
      0,
      0,
      0,
      frontMat,
      comp.id,
      r,
    );
    addEdgeHighlight(root, slat, palette.edge, 0.08);
    return root;
  }

  if (TABLE_SET.has(comp.type)) {
    buildTable3D(
      root,
      selectableMeshes,
      comp,
      palette,
      frontMat,
      carcassMat,
      r,
    );
    return root;
  }

  if (BENCH_SET.has(comp.type)) {
    buildBench3D(
      root,
      selectableMeshes,
      comp,
      palette,
      frontMat,
      carcassMat,
      comp.type === "garden_bench",
      r,
    );
    return root;
  }

  if (
    CASEWORK_SET.has(comp.type) ||
    ["upper_cabinet", "base_cabinet", "drawer"].includes(comp.type)
  ) {
    buildCasework3D(
      root,
      selectableMeshes,
      comp,
      palette,
      frontMat,
      carcassMat,
      insideMat,
      countertopMat,
      r,
    );
    return root;
  }

  if (comp.type === "sofa") {
    buildSofa3D(root, selectableMeshes, comp, palette, r);
    return root;
  }

  if (comp.type === "bed_frame") {
    buildBed3D(root, selectableMeshes, comp, palette, frontMat, carcassMat, r);
    return root;
  }

  if (comp.type === "office_chair") {
    buildOfficeChair3D(root, selectableMeshes, comp, palette, r);
    return root;
  }

  if (comp.type === "lounger") {
    buildLounger3D(
      root,
      selectableMeshes,
      comp,
      palette,
      frontMat,
      carcassMat,
      r,
    );
    return root;
  }

  if (comp.type === "patio_dining_set") {
    buildPatioSet3D(
      root,
      selectableMeshes,
      comp,
      palette,
      frontMat,
      carcassMat,
      r,
    );
    return root;
  }

  if (comp.type === "hardware") {
    const knobMat = createFurnitureMaterial(
      { ...comp, material: "Brushed Metal", grainDirection: "none" },
      "#1f2937",
      "metal",
      { metalness: 0.94, roughness: 0.2, clearcoat: 0.34 },
    );

    const knob = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.18, w * 0.18, Math.max(8, d), 28),
      knobMat,
    );
    knob.rotation.x = Math.PI / 2;
    knob.castShadow = true;
    knob.receiveShadow = true;
    knob.userData.rootId = comp.id;
    root.add(knob);
    selectableMeshes.push(knob);
    return root;
  }

  if (comp.type === "countertop") {
    const top = addRoundedPanel(
      root,
      selectableMeshes,
      w,
      Math.max(12, h),
      d,
      0,
      0,
      0,
      countertopMat,
      comp.id,
      r,
    );
    addEdgeHighlight(root, top, 0xf2dcc2, 0.08);
    return root;
  }

  if (comp.type === "reference_proxy") {
    const boardMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      roughness: 0.78,
      metalness: 0.02,
      clearcoat: 0.08,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.88,
      metalness: 0.04,
    });

    const board = addBoxPart(
      root,
      selectableMeshes,
      [w, h, Math.max(20, d)],
      [0, 0, 0],
      boardMat,
      comp.id,
      true,
      r,
    );

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 24, h + 24, Math.max(10, d * 0.35)),
      frameMat,
    );
    frame.position.set(0, 0, -Math.max(20, d) * 0.18);
    frame.castShadow = true;
    frame.receiveShadow = true;
    frame.userData.rootId = comp.id;
    root.add(frame);
    selectableMeshes.push(frame);

    addEdgeHighlight(root, board, 0xffffff, 0.1);
    return root;
  }

  if (comp.type === "dining_chair") {
    const pseudoParts = createDiningChairTemplateComponents(
      0,
      0,
      h + FLOOR_OFFSET + 80,
      comp.id,
      comp.label,
    );
    const seat = pseudoParts.find((p) => p.type === "chair_seat_panel");
    const frontLegL = pseudoParts.find((p) => p.partCode === "FL");
    const frontLegR = pseudoParts.find((p) => p.partCode === "FR");
    const backLegL = pseudoParts.find((p) => p.partCode === "BL");
    const backLegR = pseudoParts.find((p) => p.partCode === "BR");

    if (seat)
      addRoundedPanel(
        root,
        selectableMeshes,
        seat.width,
        seat.height,
        seat.depth,
        0,
        0,
        0,
        frontMat,
        comp.id,
        r,
      );
    if (frontLegL)
      addBoxPart(
        root,
        selectableMeshes,
        [frontLegL.width, frontLegL.height, frontLegL.depth],
        [-w / 2 + 18, -h / 2 + frontLegL.height / 2, -d / 2 + 40],
        carcassMat,
        comp.id,
        true,
        r,
      );
    if (frontLegR)
      addBoxPart(
        root,
        selectableMeshes,
        [frontLegR.width, frontLegR.height, frontLegR.depth],
        [w / 2 - 18, -h / 2 + frontLegR.height / 2, -d / 2 + 40],
        carcassMat,
        comp.id,
        true,
        r,
      );
    if (backLegL)
      addBoxPart(
        root,
        selectableMeshes,
        [backLegL.width, backLegL.height, backLegL.depth],
        [-w / 2 + 18, 0, d / 2 - 20],
        carcassMat,
        comp.id,
        true,
        r,
      );
    if (backLegR)
      addBoxPart(
        root,
        selectableMeshes,
        [backLegR.width, backLegR.height, backLegR.depth],
        [w / 2 - 18, 0, d / 2 - 20],
        carcassMat,
        comp.id,
        true,
        r,
      );
    addRoundedPanel(
      root,
      selectableMeshes,
      w * 0.76,
      18,
      20,
      0,
      h * 0.16,
      d / 2 - 14,
      frontMat,
      comp.id,
      r,
    );
    addRoundedPanel(
      root,
      selectableMeshes,
      w * 0.76,
      18,
      20,
      0,
      h * 0.28,
      d / 2 - 14,
      frontMat,
      comp.id,
      r,
    );
    addRoundedPanel(
      root,
      selectableMeshes,
      w * 0.76,
      18,
      20,
      0,
      h * 0.4,
      d / 2 - 14,
      frontMat,
      comp.id,
      r,
    );
    return root;
  }

  if (comp.type === "rounded_box") {
    const boxR = Number(comp.cornerRadius) || 20;

    const hasFaceOpenings = [
      comp.faceOpenTop,
      comp.faceOpenBottom,
      comp.faceOpenFront,
      comp.faceOpenBack,
      comp.faceOpenLeft,
      comp.faceOpenRight,
    ].some(Boolean);

    const hasFaceEdits = [
      comp.faceInsetTop,
      comp.faceInsetBottom,
      comp.faceInsetFront,
      comp.faceInsetBack,
      comp.faceInsetLeft,
      comp.faceInsetRight,
      comp.faceExtrudeTop,
      comp.faceExtrudeBottom,
      comp.faceExtrudeFront,
      comp.faceExtrudeBack,
      comp.faceExtrudeLeft,
      comp.faceExtrudeRight,
    ].some((value) => Number(value) > 0);

    const renderAsShell = !!comp.isHollow || hasFaceOpenings || hasFaceEdits;

    const body = addRoundedBox(
      root,
      selectableMeshes,
      w,
      h,
      d,
      boxR,
      frontMat,
      comp.id,
      {
        isHollow: renderAsShell,
        wallThickness: comp.wallThickness,
        bottomThickness: comp.bottomThickness,
        selectedFace: comp.selectedFace,

        faceOpenTop: comp.faceOpenTop,
        faceOpenBottom: comp.faceOpenBottom,
        faceOpenFront: comp.faceOpenFront,
        faceOpenBack: comp.faceOpenBack,
        faceOpenLeft: comp.faceOpenLeft,
        faceOpenRight: comp.faceOpenRight,

        faceInsetTop: comp.faceInsetTop,
        faceInsetBottom: comp.faceInsetBottom,
        faceInsetFront: comp.faceInsetFront,
        faceInsetBack: comp.faceInsetBack,
        faceInsetLeft: comp.faceInsetLeft,
        faceInsetRight: comp.faceInsetRight,

        faceExtrudeTop: comp.faceExtrudeTop,
        faceExtrudeBottom: comp.faceExtrudeBottom,
        faceExtrudeFront: comp.faceExtrudeFront,
        faceExtrudeBack: comp.faceExtrudeBack,
        faceExtrudeLeft: comp.faceExtrudeLeft,
        faceExtrudeRight: comp.faceExtrudeRight,
      },
    );

    if (!renderAsShell && body?.isMesh) {
      addEdgeHighlight(root, body, palette.edge, 0.09);
    }

    return root;
  }

  // ── Custom Shapes ──────────────────────────────────────────────────────
  if (comp.type === "shape_circle") {
    const mesh = addCircleShape(
      root,
      selectableMeshes,
      w,
      h,
      d,
      frontMat,
      comp.id,
      r,
    );
    addEdgeHighlight(root, mesh, palette.edge, 0.07);
    return root;
  }

  if (comp.type === "shape_triangle") {
    const mesh = addTriangleShape(
      root,
      selectableMeshes,
      w,
      h,
      d,
      frontMat,
      comp.id,
      r,
    );
    addEdgeHighlight(root, mesh, palette.edge, 0.07);
    return root;
  }

  if (comp.type === "shape_cube") {
    const mesh = addCubeShape(
      root,
      selectableMeshes,
      w,
      h,
      d,
      frontMat,
      comp.id,
      r,
    );
    addEdgeHighlight(root, mesh, palette.edge, 0.07);
    return root;
  }

  if (comp.type === "shape_trapezoid") {
    const ratio = Number(comp.topRatio) || 0.5;
    const mesh = addTrapezoidShape(
      root,
      selectableMeshes,
      w,
      h,
      d,
      frontMat,
      comp.id,
      ratio,
      r,
    );
    addEdgeHighlight(root, mesh, palette.edge, 0.07);
    return root;
  }

  const body = addBoxPart(
    root,
    selectableMeshes,
    [w, h, d],
    [0, 0, 0],
    frontMat,
    comp.id,
    true,
    r,
  );
  addEdgeHighlight(root, body, palette.edge, 0.07);
  return root;
}

export { createFurnitureObject };
