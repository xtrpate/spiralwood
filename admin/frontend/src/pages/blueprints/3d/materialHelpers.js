// 3d/materialHelpers.js — Three.js geometry and material helper functions
import * as THREE from "three";
import {
  addRoundedBox,
  addSmartBox,
  addSmartPanel,
} from "../shapes/roundedBox";
import { WOOD_FINISH_MAP, WOOD_FINISHES } from "../data/furnitureTypes";
import { getWoodFinish } from "../data/componentUtils";
import { clamp } from "../data/utils";
import { createRoundedBoxGeometry } from "./cornerRadius";

function getMaterialPalette(comp) {
  const finish = comp.finish ? getWoodFinish(comp.finish) : null;

  if (finish) {
    return {
      front: finish.front,
      carcass: finish.carcass,
      inside: finish.inside,
      edge: finish.edge,
      fabric: finish.front,
      accent: finish.accent,
    };
  }

  const material = String(comp.material || "").toLowerCase();

  if (material.includes("solid surface")) {
    return {
      front: "#b88a61",
      carcass: "#8f6c4f",
      inside: "#dcc6af",
      edge: "#f3dcc0",
      fabric: "#dcc6af",
      accent: "#6b4f37",
    };
  }

  if (material.includes("metal")) {
    return {
      front: "#a3b2c6",
      carcass: "#64748b",
      inside: "#d8e0ea",
      edge: "#eef3f8",
      fabric: "#cbd5e1",
      accent: "#1f2937",
    };
  }

  if (material.includes("upholstery")) {
    return {
      front: "#94a3b8",
      carcass: "#475569",
      inside: "#cbd5e1",
      edge: "#f8fafc",
      fabric: "#94a3b8",
      accent: "#334155",
    };
  }

  if (material.includes("laminated")) {
    return {
      front: "#e6dacd",
      carcass: "#9d7a5a",
      inside: "#f6ebdf",
      edge: "#fff7ef",
      fabric: "#f1e4d5",
      accent: "#7c5d42",
    };
  }

  if (
    material.includes("oak") ||
    material.includes("wood") ||
    material.includes("teak")
  ) {
    return {
      front: comp.fill || "#d6b38a",
      carcass: "#a7794d",
      inside: "#ead1b8",
      edge: "#f6e7d6",
      fabric: "#d6b38a",
      accent: "#6f4e37",
    };
  }

  return {
    front: comp.fill || "#d9c2a5",
    carcass: "#8b6b4a",
    inside: "#efe4d6",
    edge: "#f9eddf",
    fabric: "#d9c2a5",
    accent: "#6b4f37",
  };
}

function createMaterial(fill, selected, editing) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(fill || "#d9c2a5"),
    roughness: 0.38,
    metalness: 0.04,
    clearcoat: 0.34,
    clearcoatRoughness: 0.28,
    reflectivity: 0.52,
    sheen: 0.32,
    sheenRoughness: 0.42,
    transparent: false,
    opacity: 1,
    emissive: editing ? new THREE.Color("#60a5fa") : new THREE.Color("#000000"),
    emissiveIntensity: editing ? 0.18 : selected ? 0.08 : 0,
  });
}

function addEdgeHighlight(root, targetMesh, color = 0xf3e6d6, opacity = 0.1) {
  const geo = new THREE.EdgesGeometry(targetMesh.geometry);
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    }),
  );
  lines.position.copy(targetMesh.position);
  lines.rotation.copy(targetMesh.rotation);
  lines.scale.copy(targetMesh.scale);
  lines.userData.rootId = targetMesh.userData.rootId;
  root.add(lines);
}

function addBoxPart(
  root,
  selectableMeshes,
  dims,
  pos,
  material,
  rootId,
  castShadow = true,
  radius = 0,
) {
  const geometry = createRoundedBoxGeometry(dims[0], dims[1], dims[2], radius);

  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  root.add(mesh);
  selectableMeshes.push(mesh);
  return mesh;
}

function addRoundedPanel(
  root,
  selectableMeshes,
  w,
  h,
  d,
  x,
  y,
  z,
  material,
  rootId,
  radius = 0,
) {
  const shape = new THREE.Shape();
  const r = Math.min(6, w * 0.08, h * 0.08);

  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.8,
    bevelThickness: 0.8,
  });
  geo.center();

  const targetRadius = radius > 0 ? radius : Math.min(6, w * 0.08, h * 0.08);

  // USE THE NEW GEOMETRY GENERATOR HERE
  const geometry = createRoundedBoxGeometry(w, h, d, targetRadius);

  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  root.add(mesh);
  selectableMeshes.push(mesh);
  return mesh;
}

function addCylinderPart(
  root,
  selectableMeshes,
  radiusTop,
  radiusBottom,
  height,
  radialSegments,
  pos,
  material,
  rootId,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    material.clone(),
  );
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  root.add(mesh);
  selectableMeshes.push(mesh);
  return mesh;
}

function addHandle(root, selectableMeshes, x, y, z, horizontal, rootId) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x111827,
    metalness: 0.95,
    roughness: 0.14,
    clearcoat: 0.4,
  });

  const len = horizontal ? 18 : 14;
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, len, 24),
    mat,
  );

  if (horizontal) bar.rotation.z = Math.PI / 2;

  bar.position.set(x, y, z + 2.8);
  bar.castShadow = true;
  bar.receiveShadow = true;
  bar.userData.rootId = rootId;
  root.add(bar);
  selectableMeshes.push(bar);

  const leftPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 3, 16),
    mat,
  );
  const rightPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 3, 16),
    mat,
  );

  if (horizontal) {
    leftPost.position.set(x - len / 3, y, z + 1.4);
    rightPost.position.set(x + len / 3, y, z + 1.4);
  } else {
    leftPost.position.set(x, y - len / 3, z + 1.4);
    rightPost.position.set(x, y + len / 3, z + 1.4);
  }

  [leftPost, rightPost].forEach((p) => {
    p.rotation.x = Math.PI / 2;
    p.castShadow = true;
    p.receiveShadow = true;
    p.userData.rootId = rootId;
    root.add(p);
    selectableMeshes.push(p);
  });
}

function addShelfLine(root, selectableMeshes, w, d, y, rootId) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xefe3d6,
    roughness: 0.84,
    metalness: 0,
  });

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), mat);
  shelf.position.set(0, y, 0);
  shelf.castShadow = false;
  shelf.receiveShadow = true;
  shelf.userData.rootId = rootId;
  root.add(shelf);
  selectableMeshes.push(shelf);
}

function addInnerShadowPanel(root, w, h, d, x, y, z, rootId) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color: 0x4b3a2a,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.1,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  root.add(mesh);
}

function buildCasework3D(
  root,
  selectableMeshes,
  comp,
  palette,
  frontMat,
  carcassMat,
  insideMat,
  countertopMat,
  r = 0,
) {
  const w = comp.width;
  const h = comp.height;
  const d = comp.depth;
  const t = Math.max(16, Math.min(BOARD * 2.5, Math.min(w, h, d) * 0.08));
  const isBaseLike = [
    "base_cabinet",
    "sideboard",
    "tv_stand",
    "kitchen_cabinet",
  ].includes(comp.type);
  const isOpen = OPEN_SHELF_SET.has(comp.type);
  const isDrawerType =
    comp.type === "dresser" ||
    comp.type === "nightstand" ||
    comp.type === "drawer";
  const toeKick = isBaseLike ? Math.max(30, Math.min(100, h * 0.08)) : 0;
  const bodyH = h - toeKick;
  const yOffset = toeKick / 2;

  const top = addSmartBox(
    root,
    selectableMeshes,
    [w, t, d],
    [0, bodyH / 2 - t / 2 + yOffset, 0],
    carcassMat,
    comp.id,
    r,
  );
  const bottom = addSmartBox(
    root,
    selectableMeshes,
    [w, t, d],
    [0, -bodyH / 2 + t / 2 + yOffset, 0],
    carcassMat,
    comp.id,
    r,
  );
  const left = addSmartBox(
    root,
    selectableMeshes,
    [t, bodyH, d],
    [-w / 2 + t / 2, yOffset, 0],
    carcassMat,
    comp.id,
    r,
  );
  const right = addSmartBox(
    root,
    selectableMeshes,
    [t, bodyH, d],
    [w / 2 - t / 2, yOffset, 0],
    carcassMat,
    comp.id,
    r,
  );
  const back = addSmartBox(
    root,
    selectableMeshes,
    [w - t * 2, bodyH - t * 2, Math.max(4, t * 0.4)],
    [0, yOffset, -d / 2 + Math.max(4, t * 0.4) / 2],
    insideMat,
    comp.id,
    r,
  );

  if (toeKick > 0) {
    addSmartBox(
      root,
      selectableMeshes,
      [w - t * 2, toeKick, d * 0.68],
      [0, -h / 2 + toeKick / 2, d * 0.08],
      new THREE.MeshStandardMaterial({
        color: 0x5b4632,
        roughness: 0.9,
        metalness: 0,
      }),
      comp.id,
      r,
    );
  }

  if (comp.type === "kitchen_cabinet") {
    addSmartPanel(
      root,
      selectableMeshes,
      w,
      34,
      d + 26,
      0,
      bodyH / 2 + 22,
      0,
      countertopMat,
      comp.id,
      r,
    );
    const upperW = w;
    const upperH = Math.min(820, Math.round(h * 0.38));
    const upperD = Math.max(300, Math.round(d * 0.56));
    const upperY = yOffset + bodyH / 2 + upperH / 2 + 240;
    addSmartBox(
      root,
      selectableMeshes,
      [upperW, 22, upperD],
      [0, upperY + upperH / 2 - 11, -30],
      carcassMat,
      comp.id,
      r,
    );
    addSmartBox(
      root,
      selectableMeshes,
      [upperW, 22, upperD],
      [0, upperY - upperH / 2 + 11, -30],
      carcassMat,
      comp.id,
      r,
    );
    addSmartBox(
      root,
      selectableMeshes,
      [22, upperH, upperD],
      [-upperW / 2 + 11, upperY, -30],
      carcassMat,
      comp.id,
      r,
    );
    addSmartBox(
      root,
      selectableMeshes,
      [22, upperH, upperD],
      [upperW / 2 - 11, upperY, -30],
      carcassMat,
      comp.id,
      r,
    );
  }

  if (isOpen) {
    const shelves = 4;
    for (let i = 1; i <= shelves; i += 1) {
      const y = yOffset + bodyH / 2 - (bodyH / (shelves + 1)) * i;
      addShelfLine(root, selectableMeshes, w - t * 2 - 10, d - 14, y, comp.id);
    }
  } else if (isDrawerType) {
    const rows =
      comp.type === "nightstand"
        ? 2
        : Math.max(3, Math.min(5, Math.round(bodyH / 260)));
    for (let i = 0; i < rows; i += 1) {
      const rowH = bodyH / rows;
      const y = yOffset + bodyH / 2 - rowH * (i + 0.5);
      addSmartPanel(
        root,
        selectableMeshes,
        w - 10,
        rowH - 10,
        4,
        0,
        y,
        d / 2 - 2,
        frontMat,
        comp.id,
        r,
      );
      addHandle(root, selectableMeshes, 0, y, d / 2, true, comp.id);
    }
  } else {
    const doorW = w / 2 - 6;
    addSmartPanel(
      root,
      selectableMeshes,
      doorW,
      bodyH - 10,
      4,
      -w / 4,
      yOffset,
      d / 2 - 2,
      frontMat,
      comp.id,
      r,
    );
    addSmartPanel(
      root,
      selectableMeshes,
      doorW,
      bodyH - 10,
      4,
      w / 4,
      yOffset,
      d / 2 - 2,
      frontMat,
      comp.id,
      r,
    );
    addHandle(root, selectableMeshes, -8, yOffset, d / 2, false, comp.id);
    addHandle(root, selectableMeshes, 8, yOffset, d / 2, false, comp.id);
  }

  addInnerShadowPanel(
    root,
    w - t * 2 - 4,
    bodyH - t * 2 - 4,
    d - 18,
    0,
    yOffset,
    -4,
    comp.id,
  );
  [top, bottom, left, right, back].forEach((m) =>
    addEdgeHighlight(root, m, palette.edge, 0.1),
  );
}

function buildTable3D(
  root,
  selectableMeshes,
  comp,
  palette,
  frontMat,
  carcassMat,
  r = 0,
) {
  const w = comp.width;
  const h = comp.height;
  const d = comp.depth;
  const topT = Math.max(24, Math.min(50, h * 0.08));
  const leg = clamp(Math.min(w, d) * 0.08, 28, 70);
  const apronH = Math.max(24, h * 0.08);
  const topY = h / 2 - topT / 2;
  const legY = -topT / 2;
  const insetX = w / 2 - leg / 2 - Math.max(40, w * 0.08);
  const insetZ = d / 2 - leg / 2 - Math.max(40, d * 0.08);
  const apronY = topY - topT / 2 - apronH / 2;

  const top = addSmartPanel(
    root,
    selectableMeshes,
    w,
    topT,
    d,
    0,
    topY,
    0,
    frontMat,
    comp.id,
    r,
  );

  const legs = [
    [-insetX, legY, -insetZ],
    [insetX, legY, -insetZ],
    [-insetX, legY, insetZ],
    [insetX, legY, insetZ],
  ].map((pos) =>
    addSmartBox(
      root,
      selectableMeshes,
      [leg, h - topT, leg],
      pos,
      carcassMat,
      comp.id,
      r,
    ),
  );

  const apronMat = new THREE.MeshStandardMaterial({
    color: palette.carcass,
    roughness: 0.7,
    metalness: 0.03,
  });
  addSmartBox(
    root,
    selectableMeshes,
    [w - leg * 2, apronH, 24],
    [0, apronY, -insetZ],
    apronMat,
    comp.id,
    r,
  );
  addSmartBox(
    root,
    selectableMeshes,
    [w - leg * 2, apronH, 24],
    [0, apronY, insetZ],
    apronMat,
    comp.id,
    r,
  );
  addSmartBox(
    root,
    selectableMeshes,
    [24, apronH, d - leg * 2],
    [-insetX, apronY, 0],
    apronMat,
    comp.id,
    r,
  );
  addSmartBox(
    root,
    selectableMeshes,
    [24, apronH, d - leg * 2],
    [insetX, apronY, 0],
    apronMat,
    comp.id,
    r,
  );

  addEdgeHighlight(root, top, palette.edge, 0.08);
  legs.forEach((m) => addEdgeHighlight(root, m, palette.edge, 0.06));
}

function buildBench3D(
  root,
  selectableMeshes,
  comp,
  palette,
  frontMat,
  carcassMat,
  withBack = false,
  r = 0,
) {
  const w = comp.width;
  const h = comp.height;
  const d = comp.depth;
  const seatT = Math.max(24, h * 0.08);
  const leg = clamp(Math.min(w, d) * 0.08, 28, 60);
  const seatY = h / 2 - seatT / 2 - (withBack ? h * 0.18 : 0);
  const insetX = w / 2 - leg / 2 - Math.max(50, w * 0.08);
  const insetZ = d / 2 - leg / 2 - Math.max(35, d * 0.12);
  const legH = h - seatT - (withBack ? h * 0.18 : 0);

  const seat = addSmartPanel(
    root,
    selectableMeshes,
    w,
    seatT,
    d,
    0,
    seatY,
    0,
    frontMat,
    comp.id,
    r,
  );
  const leftLeg = addSmartBox(
    root,
    selectableMeshes,
    [leg, legH, leg],
    [-insetX, -seatT / 2, -insetZ],
    carcassMat,
    comp.id,
    r,
  );
  const rightLeg = addSmartBox(
    root,
    selectableMeshes,
    [leg, legH, leg],
    [insetX, -seatT / 2, -insetZ],
    carcassMat,
    comp.id,
    r,
  );
  const leftLeg2 = addSmartBox(
    root,
    selectableMeshes,
    [leg, legH, leg],
    [-insetX, -seatT / 2, insetZ],
    carcassMat,
    comp.id,
    r,
  );
  const rightLeg2 = addSmartBox(
    root,
    selectableMeshes,
    [leg, legH, leg],
    [insetX, -seatT / 2, insetZ],
    carcassMat,
    comp.id,
    r,
  );

  if (withBack) {
    addSmartPanel(
      root,
      selectableMeshes,
      w,
      Math.max(24, h * 0.18),
      28,
      0,
      h / 2 - seatT - h * 0.18,
      d / 2 - 14,
      frontMat,
      comp.id,
      r,
    );
  }

  addEdgeHighlight(root, seat, palette.edge, 0.08);
  [leftLeg, rightLeg, leftLeg2, rightLeg2].forEach((m) =>
    addEdgeHighlight(root, m, palette.edge, 0.06),
  );
}

function buildSofa3D(root, selectableMeshes, comp, palette, r = 0) {
  const w = comp.width;
  const h = comp.height;
  const d = comp.depth;
  const seatH = Math.max(180, h * 0.28);
  const backH = Math.max(260, h * 0.34);
  const armW = Math.max(140, w * 0.12);

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: palette.accent,
    roughness: 0.75,
    metalness: 0.02,
    clearcoat: 0.08,
  });

  const fabricMat = new THREE.MeshPhysicalMaterial({
    color: palette.fabric,
    roughness: 0.9,
    metalness: 0,
    clearcoat: 0.02,
  });

  addSmartPanel(
    root,
    selectableMeshes,
    w,
    seatH,
    d,
    0,
    -h / 2 + seatH / 2 + 60,
    0,
    fabricMat,
    comp.id,
    r,
  );
  addSmartPanel(
    root,
    selectableMeshes,
    w,
    backH,
    140,
    0,
    h / 2 - backH / 2,
    -d / 2 + 70,
    fabricMat,
    comp.id,
    r,
  );
  addSmartPanel(
    root,
    selectableMeshes,
    armW,
    seatH + backH * 0.35,
    d,
    -w / 2 + armW / 2,
    -h / 2 + (seatH + backH * 0.35) / 2 + 50,
    0,
    fabricMat,
    comp.id,
    r,
  );
  addSmartPanel(
    root,
    selectableMeshes,
    armW,
    seatH + backH * 0.35,
    d,
    w / 2 - armW / 2,
    -h / 2 + (seatH + backH * 0.35) / 2 + 50,
    0,
    fabricMat,
    comp.id,
    r,
  );

  const cushionW = (w - armW * 2 - 40) / 3;
  for (let i = 0; i < 3; i += 1) {
    addSmartPanel(
      root,
      selectableMeshes,
      cushionW,
      seatH - 24,
      d * 0.72,
      -w / 2 + armW + 20 + cushionW / 2 + i * cushionW,
      -h / 2 + seatH / 2 + 72,
      0,
      fabricMat,
      comp.id,
      r,
    );
  }

  addSmartBox(
    root,
    selectableMeshes,
    [w - 60, 60, d - 60],
    [0, -h / 2 + 30, 0],
    frameMat,
    comp.id,
    r,
  );
}

function buildBed3D(
  root,
  selectableMeshes,
  comp,
  palette,
  frontMat,
  carcassMat,
  r = 0,
) {
  const w = comp.width;
  const h = comp.height;
  const d = comp.depth;
  const frameH = Math.max(180, h * 0.2);
  const headboardH = Math.max(460, h * 0.55);

  addSmartPanel(
    root,
    selectableMeshes,
    w,
    frameH,
    d,
    0,
    -h / 2 + frameH / 2 + 40,
    0,
    frontMat,
    comp.id,
    r,
  );
  addSmartPanel(
    root,
    selectableMeshes,
    w,
    headboardH,
    60,
    0,
    h / 2 - headboardH / 2,
    -d / 2 + 30,
    carcassMat,
    comp.id,
    r,
  );

  const mattressMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5f5f4,
    roughness: 0.95,
    metalness: 0,
  });
  addSmartPanel(
    root,
    selectableMeshes,
    w - 40,
    180,
    d - 60,
    0,
    -h / 2 + frameH + 90,
    0,
    mattressMat,
    comp.id,
    r,
  );
}

function buildOfficeChair3D(root, selectableMeshes, comp, palette) {
  const w = comp.width;
  const h = comp.height;
  const d = comp.depth;

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: palette.accent,
    roughness: 0.3,
    metalness: 0.92,
    clearcoat: 0.4,
  });

  const fabricMat = new THREE.MeshPhysicalMaterial({
    color: palette.fabric,
    roughness: 0.9,
    metalness: 0,
  });

  addRoundedPanel(
    root,
    selectableMeshes,
    w * 0.58,
    70,
    d * 0.58,
    0,
    -40,
    0,
    fabricMat,
    comp.id,
  );
  addRoundedPanel(
    root,
    selectableMeshes,
    w * 0.5,
    h * 0.34,
    70,
    0,
    h * 0.18,
    -d * 0.18,
    fabricMat,
    comp.id,
  );
  addCylinderPart(
    root,
    selectableMeshes,
    18,
    18,
    h * 0.36,
    24,
    [0, -h * 0.18, 0],
    frameMat,
    comp.id,
  );

  const baseY = -h / 2 + 70;
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, w * 0.38, 18),
    frameMat,
  );
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0, baseY, 0);
  arm.userData.rootId = comp.id;
  arm.castShadow = true;
  arm.receiveShadow = true;
  root.add(arm);
  selectableMeshes.push(arm);

  for (let i = 0; i < 5; i += 1) {
    const angle = (Math.PI * 2 * i) / 5;
    const wheelArm = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.22, 10, 20),
      frameMat,
    );
    wheelArm.position.set(
      Math.cos(angle) * w * 0.16,
      baseY,
      Math.sin(angle) * d * 0.16,
    );
    wheelArm.rotation.y = -angle;
    wheelArm.userData.rootId = comp.id;
    wheelArm.castShadow = true;
    wheelArm.receiveShadow = true;
    root.add(wheelArm);
    selectableMeshes.push(wheelArm);

    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 18, 16, 18),
      frameMat,
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(
      Math.cos(angle) * w * 0.3,
      baseY - 12,
      Math.sin(angle) * d * 0.3,
    );
    wheel.userData.rootId = comp.id;
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    root.add(wheel);
    selectableMeshes.push(wheel);
  }
}

function buildLounger3D(
  root,
  selectableMeshes,
  comp,
  palette,
  frontMat,
  carcassMat,
  r = 0,
) {
  const w = comp.width;
  const h = comp.height;
  const d = comp.depth;

  const seat = addSmartPanel(
    root,
    selectableMeshes,
    w,
    70,
    d * 0.58,
    0,
    -h * 0.18,
    -d * 0.12,
    frontMat,
    comp.id,
    r,
  );
  const back = addSmartPanel(
    root,
    selectableMeshes,
    w,
    70,
    d * 0.4,
    0,
    h * 0.16,
    d * 0.2,
    frontMat,
    comp.id,
    r,
  );
  back.rotation.x = -Math.PI / 5;

  const frame1 = addSmartBox(
    root,
    selectableMeshes,
    [36, h * 0.52, 36],
    [-w / 2 + 40, -h * 0.28, -d * 0.18],
    carcassMat,
    comp.id,
    r,
  );
  const frame2 = addSmartBox(
    root,
    selectableMeshes,
    [36, h * 0.52, 36],
    [w / 2 - 40, -h * 0.28, -d * 0.18],
    carcassMat,
    comp.id,
    r,
  );

  addEdgeHighlight(root, seat, palette.edge, 0.08);
  addEdgeHighlight(root, frame1, palette.edge, 0.06);
  addEdgeHighlight(root, frame2, palette.edge, 0.06);
}

function buildPatioSet3D(
  root,
  selectableMeshes,
  comp,
  palette,
  frontMat,
  carcassMat,
  r = 0,
) {
  const tableW = comp.width * 0.36;
  const tableD = comp.depth * 0.36;
  const tableH = comp.height * 0.44;

  const pseudoComp = {
    ...comp,
    width: tableW,
    height: tableH,
    depth: tableD,
    id: comp.id,
  };
  buildTable3D(
    root,
    selectableMeshes,
    pseudoComp,
    palette,
    frontMat,
    carcassMat,
    r,
  );

  const chairMat = new THREE.MeshPhysicalMaterial({
    color: palette.front,
    roughness: 0.7,
    metalness: 0.02,
  });

  const positions = [
    [-comp.width * 0.34, -comp.height * 0.1, -comp.depth * 0.26],
    [comp.width * 0.34, -comp.height * 0.1, -comp.depth * 0.26],
    [-comp.width * 0.34, -comp.height * 0.1, comp.depth * 0.26],
    [comp.width * 0.34, -comp.height * 0.1, comp.depth * 0.26],
  ];

  positions.forEach(([x, y, z]) => {
    addSmartPanel(
      root,
      selectableMeshes,
      240,
      40,
      240,
      x,
      y,
      z,
      chairMat,
      comp.id,
      r,
    );
    addSmartPanel(
      root,
      selectableMeshes,
      240,
      220,
      26,
      x,
      y + 120,
      z - 108,
      chairMat,
      comp.id,
      r,
    );
    addSmartBox(
      root,
      selectableMeshes,
      [28, 220, 28],
      [x - 90, y - 100, z - 90],
      carcassMat,
      comp.id,
      r,
    );
    addSmartBox(
      root,
      selectableMeshes,
      [28, 220, 28],
      [x + 90, y - 100, z - 90],
      carcassMat,
      comp.id,
      r,
    );
    addSmartBox(
      root,
      selectableMeshes,
      [28, 220, 28],
      [x - 90, y - 100, z + 90],
      carcassMat,
      comp.id,
      r,
    );
    addSmartBox(
      root,
      selectableMeshes,
      [28, 220, 28],
      [x + 90, y - 100, z + 90],
      carcassMat,
      comp.id,
      r,
    );
  });
}

export {
  clamp,
  getMaterialPalette,
  createMaterial,
  addEdgeHighlight,
  addInnerShadowPanel,
  addShelfLine,
  addHandle,
  addBoxPart,
  addRoundedPanel,
  addCylinderPart,
};
