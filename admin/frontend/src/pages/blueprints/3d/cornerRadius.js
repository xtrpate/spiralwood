import * as THREE from "three";

export function createRoundedBoxGeometry(
  width,
  height,
  depth,
  radius,
  smoothness = 5,
) {
  // Fallback to standard sharp box if radius is 0 or undefined
  if (!radius || radius <= 0) {
    return new THREE.BoxGeometry(width, height, depth);
  }

  // Safety clamp: prevent the radius from overlapping itself and breaking the geometry
  const maxRadius = Math.min(width / 2, height / 2);
  const safeRadius = Math.min(radius, maxRadius);

  const shape = new THREE.Shape();
  const w2 = width / 2;
  const h2 = height / 2;

  // Draw the rounded rectangle profile
  shape.moveTo(-w2 + safeRadius, -h2);
  shape.lineTo(w2 - safeRadius, -h2);
  shape.quadraticCurveTo(w2, -h2, w2, -h2 + safeRadius);
  shape.lineTo(w2, h2 - safeRadius);
  shape.quadraticCurveTo(w2, h2, w2 - safeRadius, h2);
  shape.lineTo(-w2 + safeRadius, h2);
  shape.quadraticCurveTo(-w2, h2, -w2, h2 - safeRadius);
  shape.lineTo(-w2, -h2 + safeRadius);
  shape.quadraticCurveTo(-w2, -h2, -w2 + safeRadius, -h2);

  const extrudeSettings = {
    depth: depth,
    bevelEnabled: false,
    curveSegments: smoothness,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // ExtrudeGeometry extrudes from Z=0 to Z=depth.
  // We center it so the pivot point matches a standard BoxGeometry perfectly.
  geometry.center();

  return geometry;
}
