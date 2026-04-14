// trapezoidShape.js — Trapezoid prism custom shape for BlueprintDesign
import * as THREE from "three";

// ── Library item ──────────────────────────────────────────────────────────────
export const TRAPEZOID_TYPES = [
  {
    label: "Trapezoid",
    type: "shape_trapezoid",
    category: "Custom Shapes",
    w: 600, // bottom base width
    h: 400, // height of trapezoid face
    d: 400, // depth (extrusion)
    fill: "#c8aa80",
    material: "Pine Wood",
    unitPrice: 0,
    blueprintStyle: "box",
    topRatio: 0.5, // top width = w * topRatio  (0.1 – 0.9)
  },
];

// ── Three.js builder ──────────────────────────────────────────────────────────
// w      = bottom base width
// h      = face height
// d      = depth / extrusion
// topRatio = top width as fraction of bottom (default 0.5)
export function addTrapezoidShape(
  root,
  selectableMeshes,
  w,
  h,
  d,
  material,
  rootId,
  topRatio = 0.5,
) {
  const clampedRatio = Math.max(0.05, Math.min(0.98, topRatio));
  const topW = w * clampedRatio;
  const hw = w / 2;
  const thw = topW / 2;
  const hh = h / 2;

  // Four corners: bottom-left, bottom-right, top-right, top-left
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(thw, hh);
  shape.lineTo(-thw, hh);
  shape.closePath();

  const bevel = Math.min(6, d * 0.04, w * 0.03, h * 0.03);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, d - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelSegments: 3,
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
