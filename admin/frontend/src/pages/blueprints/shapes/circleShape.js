// circleShape.js — Circle / Cylinder custom shape for BlueprintDesign
import * as THREE from "three";

// ── Library item ──────────────────────────────────────────────────────────────
export const CIRCLE_TYPES = [
  {
    label: "Circle / Cylinder",
    type: "shape_circle",
    category: "Custom Shapes",
    w: 500,
    h: 400,
    d: 500,
    fill: "#d9c2a5",
    material: "Oak Wood",
    unitPrice: 0,
    blueprintStyle: "box",
    segments: 64,
  },
];

// ── Three.js builder ──────────────────────────────────────────────────────────
// w = diameter X, h = height (extrusion depth), d = diameter Z
// When w === d it's a perfect cylinder; otherwise an elliptical cylinder.
export function addCircleShape(
  root,
  selectableMeshes,
  w,
  h,
  d,
  material,
  rootId,
) {
  const rx = w / 2; // radius on X axis
  const rz = d / 2; // radius on Z axis

  // Build an ellipse shape on the XY plane
  const shape = new THREE.Shape();
  const segs = 64;
  for (let i = 0; i <= segs; i++) {
    const angle = (i / segs) * Math.PI * 2;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * rz; // use Z radius for the Y extent pre-rotation
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  const bevel = Math.min(8, h * 0.06);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, h - bevel * 2),
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: segs,
  });
  geo.center();

  // Rotate so the flat faces are on top and bottom (XZ plane)
  geo.rotateX(Math.PI / 2);

  const mesh = new THREE.Mesh(geo, material.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  root.add(mesh);
  selectableMeshes.push(mesh);
  return mesh;
}
