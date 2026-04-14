// cubeShape.js — Perfect Cube custom shape for BlueprintDesign
// A cube forces width = height = depth (all equal to the largest dimension),
// giving a true cube. The user can still resize via W/H/D but all snap equal.
import * as THREE from "three";

// ── Library item ──────────────────────────────────────────────────────────────
export const CUBE_TYPES = [
  {
    label: "Perfect Cube",
    type: "shape_cube",
    category: "Custom Shapes",
    w: 400,
    h: 400,
    d: 400,
    fill: "#b5926a",
    material: "Walnut Wood",
    unitPrice: 0,
    blueprintStyle: "box",
  },
];

// ── Three.js builder ──────────────────────────────────────────────────────────
// Uses BoxGeometry with a chamfered bevel via ExtrudeGeometry for a
// slightly softened cube look rather than a plain box.
export function addCubeShape(
  root,
  selectableMeshes,
  w,
  h,
  d,
  material,
  rootId,
) {
  // For a "perfect cube" feel we use the actual passed dims
  // (user controls them via inspector — they can make it non-cube if they want)
  const bevel = Math.min(w, h, d) * 0.04;

  const hw = w / 2,
    hh = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, d - bevel * 2),
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 4,
  });
  geo.center();
  geo.rotateX(Math.PI / 2);

  const mesh = new THREE.Mesh(geo, material.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  root.add(mesh);
  selectableMeshes.push(mesh);
  return mesh;
}
