// 3d/materialHelpers.js — Three.js geometry and material helper functions
import * as THREE from "three";
import { createProceduralFurnitureMaterial } from "./proceduralMaterialFactory";
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

function createFurnitureMaterial(
  comp,
  fill,
  role = "front",
  overrides = {},
) {
  return createProceduralFurnitureMaterial(
    comp || {},
    fill || "#d9c2a5",
    role,
    overrides,
  );
}

function createMaterial(fill, selected, editing, comp = null, role = "front") {
  return createFurnitureMaterial(
    comp || {},
    fill || "#d9c2a5",
    role,
    {
      // Selection and edit state are already shown by the blue outline and
      // transform gizmo. Never tint the material during rebuilds.
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: 0,
    },
  );
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
  const mat = createFurnitureMaterial(
    { material: "Brushed Metal", grainDirection: "none" },
    "#1f2937",
    "metal",
    {
      metalness: 0.94,
      roughness: 0.2,
      clearcoat: 0.3,
    },
  );

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

function addShelfLine(
  root,
  selectableMeshes,
  w,
  d,
  y,
  rootId,
  material = null,
) {
  const mat = material
    ? material.clone()
    : createFurnitureMaterial(
        { material: "Marine Plywood", grainDirection: "width" },
        "#efe3d6",
        "inside",
      );

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

export {
  clamp,
  getMaterialPalette,
  createMaterial,
  createFurnitureMaterial,
  addEdgeHighlight,
  addInnerShadowPanel,
  addShelfLine,
  addHandle,
  addBoxPart,
  addRoundedPanel,
  addCylinderPart,
};
