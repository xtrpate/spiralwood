// roundedBox.js — Rounded corners for ALL objects in BlueprintDesign
import * as THREE from "three";

// ── Library item ─────────────────────────────────────────────────────────────
export const ROUNDED_BOX_TYPES = [
  {
    label: "Rounded Corner Box",
    type: "rounded_box",
    category: "Custom Shapes",
    w: 600,
    h: 400,
    d: 400,
    fill: "#d9c2a5",
    material: "Oak Wood",
    unitPrice: 0,
    blueprintStyle: "box",
    cornerRadius: 40,
  },
];

export const ROUNDED_BOX_DEFAULT_RADIUS = 40;

// ── Normalize cornerRadius field ──────────────────────────────────────────────
export function normalizeCornerRadius(value) {
  return Math.max(0, Math.min(500, Number(value) || 0));
}

// ── Core: build a rounded-corner box using ExtrudeGeometry ───────────────────
// Used when cornerRadius > 0. Falls back to BoxGeometry when r = 0.
export function addRoundedBox(
  root,
  selectableMeshes,
  w,
  h,
  d,
  r,
  material,
  rootId,
) {
  const radius = Math.max(0, Math.min(r, w / 2 - 1, h / 2 - 1, d / 2 - 1));

  if (radius <= 0) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      material.clone(),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.rootId = rootId;
    root.add(mesh);
    selectableMeshes.push(mesh);
    return mesh;
  }

  const shape = new THREE.Shape();
  const hw = w / 2,
    hh = h / 2;
  shape.moveTo(-hw + radius, -hh);
  shape.lineTo(hw - radius, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + radius);
  shape.lineTo(hw, hh - radius);
  shape.quadraticCurveTo(hw, hh, hw - radius, hh);
  shape.lineTo(-hw + radius, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - radius);
  shape.lineTo(-hw, -hh + radius);
  shape.quadraticCurveTo(-hw, -hh, -hw + radius, -hh);

  const bevel = Math.min(radius * 0.4, d * 0.18, 12);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, d - bevel * 2),
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 10,
  });
  geo.center();

  const mesh = new THREE.Mesh(geo, material.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  root.add(mesh);
  selectableMeshes.push(mesh);
  return mesh;
}

// ── Smart Box: addBoxPart replacement that respects cornerRadius ──────────────
// Drop-in replacement for addBoxPart(root, sel, dims, pos, mat, id)
// Pass r = comp.cornerRadius (or 0 for no rounding)
export function addSmartBox(
  root,
  selectableMeshes,
  dims,
  pos,
  material,
  rootId,
  r = 0,
) {
  const mesh =
    r > 0
      ? addRoundedBox(
          root,
          selectableMeshes,
          dims[0],
          dims[1],
          dims[2],
          r,
          material,
          rootId,
        )
      : (() => {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(dims[0], dims[1], dims[2]),
            material.clone(),
          );
          m.castShadow = true;
          m.receiveShadow = true;
          m.userData.rootId = rootId;
          root.add(m);
          selectableMeshes.push(m);
          return m;
        })();
  mesh.position.set(pos[0], pos[1], pos[2]);
  return mesh;
}

// ── Smart Panel: addRoundedPanel replacement that respects cornerRadius ───────
// Drop-in replacement for addRoundedPanel(root, sel, w, h, d, x, y, z, mat, id)
// When r > 0 uses addRoundedBox instead (gives sharper bevel control)
export function addSmartPanel(
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
  r = 0,
) {
  if (r > 0) {
    const mesh = addRoundedBox(
      root,
      selectableMeshes,
      w,
      h,
      d,
      r,
      material,
      rootId,
    );
    mesh.position.set(x, y, z);
    return mesh;
  }
  // Original addRoundedPanel logic
  const shape = new THREE.Shape();
  const rp = Math.min(6, w * 0.08, h * 0.08);
  shape.moveTo(-w / 2 + rp, -h / 2);
  shape.lineTo(w / 2 - rp, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rp);
  shape.lineTo(w / 2, h / 2 - rp);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - rp, h / 2);
  shape.lineTo(-w / 2 + rp, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rp);
  shape.lineTo(-w / 2, -h / 2 + rp);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rp, -h / 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.8,
    bevelThickness: 0.8,
  });
  geo.center();
  const mesh = new THREE.Mesh(geo, material.clone());
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  root.add(mesh);
  selectableMeshes.push(mesh);
  return mesh;
}
