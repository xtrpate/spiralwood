import * as THREE from "three";

function forceAxisMaterial(object, hex) {
  if (!object?.material) return;

  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];

  materials.forEach((material) => {
    if (material.color) material.color.setHex(hex);
    material.depthTest = false;
    material.transparent = true;
    material.opacity = 1;
    material.toneMapped = false;
    material.fog = false;
  });
}

export function applyTransformGizmoAppearance(transform) {
  if (!transform) return;

  transform.traverse((child) => {
    const name = child.name || "";
    const geometryType = child.geometry?.type || "";

    const isXAxis = name === "X";
    const isYAxis = name === "Y";
    const isZAxis = name === "Z";

    if (
      name.includes("XY") ||
      name.includes("YZ") ||
      name.includes("XZ") ||
      name === "E" ||
      name === "XYZ" ||
      name === "XYZE" ||
      name.includes("START") ||
      name.includes("END") ||
      name.includes("DELTA") ||
      name.includes("AXIS") ||
      name.includes("helper") ||
      geometryType === "PlaneGeometry" ||
      geometryType === "BoxGeometry"
    ) {
      child.visible = false;
      return;
    }

    if (!isXAxis && !isYAxis && !isZAxis) {
      if (child.type === "Line" || child.type === "Mesh") {
        child.visible = false;
      }
      return;
    }

    child.visible = true;

    if (isXAxis) forceAxisMaterial(child, 0xff3b30);
    if (isYAxis) forceAxisMaterial(child, 0x34c759);
    if (isZAxis) forceAxisMaterial(child, 0x0a84ff);
  });
}

export function configureTransformMode({
  transform,
  mode,
  translationSnap,
  rotationSnapDegrees,
}) {
  if (!transform) return;

  if (mode === "rotate") transform.setMode("rotate");
  else if (mode === "scale") transform.setMode("scale");
  else transform.setMode("translate");

  transform.translationSnap = mode === "translate" ? translationSnap : null;
  transform.rotationSnap =
    mode === "rotate"
      ? THREE.MathUtils.degToRad(rotationSnapDegrees)
      : null;

  transform.showX = true;
  transform.showY = true;
  transform.showZ = true;

  applyTransformGizmoAppearance(transform);
}
