// triangleShape.js — Triangle prism custom shape for BlueprintDesign
import * as THREE from "three";

// ── Library item ──────────────────────────────────────────────────────────────
export const TRIANGLE_TYPES = [
  {
    label: "Triangle Prism",
    type: "shape_triangle",
    category: "Custom Shapes",
    w: 500,
    h: 400,
    d: 500,
    fill: "#c4a882",
    material: "Oak Wood",
    unitPrice: 0,
    blueprintStyle: "box",
  },
];

// ── Three.js builder ──────────────────────────────────────────────────────────
// Builds an isoceles triangle prism.
// w = base width, h = height of triangle face, d = depth (extrusion)
export function addTriangleShape(
  root,
  selectableMeshes,
  w,
  h,
  d,
  material,
  rootId,
) {
  const hw = w / 2;
  const hh = h / 2;

  // Triangle points: bottom-left, bottom-right, top-center
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(0, hh);
  shape.closePath();

  const bevel = Math.min(6, d * 0.05, w * 0.04, h * 0.04);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, d - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 4,
  });
  geo.center();

  // Rotate so triangle stands upright and depth goes into Z
  geo.rotateX(Math.PI / 2);

  const mesh = new THREE.Mesh(geo, material.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  root.add(mesh);
  selectableMeshes.push(mesh);
  return mesh;
}
