// shapes/woodworkingProfile3D.js
// WISDOM Blueprint Custom Shape 3D + Woodworking Operations V5B.
// Partial-depth operations use layered ExtrudeGeometry instead of an
// additional CSG dependency. Through-holes remain native THREE.Shape holes.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  getWoodworkingProfileDescriptor,
  getWoodworkingProfileLocalPoints,
  getValidProfileCutouts,
  getProfileCutoutLocalPoints,
} from "../data/woodworkingProfile";
import {
  normalizeWoodworkingOperations,
  getWoodworkingOperationFootprint,
  getWoodworkingOperationFootprintPoints,
  getWoodworkingOperationStatus,
} from "../data/woodworkingOperations";

const PROFILE_EPSILON = 1e-5;

function orientProfileGeometry(geometry, plane) {
  if (plane === "xz") {
    // XY profile -> XZ profile, extrusion Z -> local Y thickness.
    geometry.rotateX(Math.PI / 2);
    return;
  }

  if (plane === "yz") {
    // XY profile -> YZ profile, extrusion Z -> local X thickness.
    geometry.rotateY(Math.PI / 2);
  }
}

function appendUniquePoint(target, point) {
  const next = [
    Number(point?.[0]) || 0,
    Number(point?.[1]) || 0,
  ];
  const last = target[target.length - 1];

  if (
    last &&
    Math.hypot(
      last[0] - next[0],
      last[1] - next[1],
    ) <= PROFILE_EPSILON
  ) {
    return;
  }

  target.push(next);
}

function makePath(points = []) {
  if (!points.length) return null;

  const path = new THREE.Path();
  path.moveTo(points[0][0], points[0][1]);

  for (let index = 1; index < points.length; index += 1) {
    path.lineTo(points[index][0], points[index][1]);
  }

  path.closePath();
  return path;
}

function makeShape(outerPoints = []) {
  if (!outerPoints.length) return null;

  const shape = new THREE.Shape();
  shape.moveTo(outerPoints[0][0], outerPoints[0][1]);

  for (
    let index = 1;
    index < outerPoints.length;
    index += 1
  ) {
    shape.lineTo(
      outerPoints[index][0],
      outerPoints[index][1],
    );
  }

  shape.closePath();
  return shape;
}

function operationCutsFromHighSide(operation, plane) {
  // Make Face A intuitive in the 3D editor:
  // XZ horizontal board => Face A is the physical top (+Y).
  // XY => Face A is +Z. YZ => Face A is +X.
  const faceAFromHighExtrusion = plane !== "xz";

  return operation.surface === "face_a"
    ? faceAFromHighExtrusion
    : !faceAFromHighExtrusion;
}

function addThroughCutoutPaths(shape, throughCutouts = []) {
  throughCutouts.forEach((cutout) => {
    const points = getProfileCutoutLocalPoints(
      cutout,
      cutout.type === "round" ? 48 : 4,
    );
    const hole = makePath(points);

    if (hole) shape.holes.push(hole);
  });
}

function addOperationHolePaths(
  shape,
  component,
  operations = [],
) {
  operations
    .filter((operation) => operation.type !== "rabbet")
    .forEach((operation) => {
      const points = getWoodworkingOperationFootprintPoints(
        component,
        operation,
        operation.type === "bore" ? 48 : 4,
      );
      const hole = makePath(points);

      if (hole) shape.holes.push(hole);
    });
}

function applySingleRabbetToOuterPoints(
  sourcePoints,
  component,
  operation,
) {
  const points = sourcePoints.map(([u, v]) => [u, v]);
  if (points.length < 3) return points;

  const footprint = getWoodworkingOperationFootprint(
    component,
    operation,
  );
  const edge = operation.edge;
  const horizontal = edge === "top" || edge === "bottom";
  const boundaryValue =
    edge === "top"
      ? footprint.maxV
      : edge === "bottom"
        ? footprint.minV
        : edge === "right"
          ? footprint.maxU
          : footprint.minU;
  const targetMin = horizontal
    ? footprint.minU
    : footprint.minV;
  const targetMax = horizontal
    ? footprint.maxU
    : footprint.maxV;
  const tolerance = 0.05;

  let targetIndex = -1;

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const start = points[index];
    const end = points[nextIndex];
    const startBoundary = horizontal ? start[1] : start[0];
    const endBoundary = horizontal ? end[1] : end[0];

    if (
      Math.abs(startBoundary - boundaryValue) > tolerance ||
      Math.abs(endBoundary - boundaryValue) > tolerance
    ) {
      continue;
    }

    const startAlong = horizontal ? start[0] : start[1];
    const endAlong = horizontal ? end[0] : end[1];

    if (
      targetMin >= Math.min(startAlong, endAlong) - tolerance &&
      targetMax <= Math.max(startAlong, endAlong) + tolerance
    ) {
      targetIndex = index;
      break;
    }
  }

  if (targetIndex < 0) return points;

  const result = [];

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const start = points[index];
    const end = points[nextIndex];

    appendUniquePoint(result, start);

    if (index !== targetIndex) continue;

    const startAlong = horizontal ? start[0] : start[1];
    const endAlong = horizontal ? end[0] : end[1];
    const ascending = endAlong >= startAlong;

    const enterAlong = ascending ? targetMin : targetMax;
    const exitAlong = ascending ? targetMax : targetMin;

    const outerPoint = (along) =>
      horizontal
        ? [along, boundaryValue]
        : [boundaryValue, along];

    const innerPoint = (along) => {
      if (edge === "top") {
        return [along, footprint.minV];
      }
      if (edge === "bottom") {
        return [along, footprint.maxV];
      }
      if (edge === "left") {
        return [footprint.maxU, along];
      }
      return [footprint.minU, along];
    };

    appendUniquePoint(result, outerPoint(enterAlong));
    appendUniquePoint(result, innerPoint(enterAlong));
    appendUniquePoint(result, innerPoint(exitAlong));
    appendUniquePoint(result, outerPoint(exitAlong));
  }

  if (
    result.length > 2 &&
    Math.hypot(
      result[0][0] - result[result.length - 1][0],
      result[0][1] - result[result.length - 1][1],
    ) <= PROFILE_EPSILON
  ) {
    result.pop();
  }

  return result;
}

function applyActiveRabbets(
  outerPoints,
  component,
  operations = [],
) {
  const rabbets = operations
    .filter((operation) => operation.type === "rabbet")
    .slice()
    .sort((a, b) => {
      const edgeCompare = String(a.edge).localeCompare(
        String(b.edge),
      );
      if (edgeCompare !== 0) return edgeCompare;
      return (Number(a.offset) || 0) - (Number(b.offset) || 0);
    });

  return rabbets.reduce(
    (points, operation) =>
      applySingleRabbetToOuterPoints(
        points,
        component,
        operation,
      ),
    outerPoints.map(([u, v]) => [u, v]),
  );
}

function makeLayerGeometry(
  component,
  outerPoints,
  throughCutouts,
  activeOperations,
  zStart,
  zEnd,
) {
  const layerOuter = applyActiveRabbets(
    outerPoints,
    component,
    activeOperations,
  );
  const shape = makeShape(layerOuter);

  if (!shape) return null;

  addThroughCutoutPaths(shape, throughCutouts);
  addOperationHolePaths(
    shape,
    component,
    activeOperations,
  );

  const layerDepth = Math.max(
    PROFILE_EPSILON,
    zEnd - zStart,
  );

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: layerDepth,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 16,
  });

  geometry.translate(0, 0, zStart);
  return geometry;
}

function buildProfileGeometry(
  component,
  descriptor,
  outerPoints,
  throughCutouts,
  validOperations,
) {
  const thickness = Math.max(1, descriptor.thickness);

  if (!validOperations.length) {
    const geometry = makeLayerGeometry(
      component,
      outerPoints,
      throughCutouts,
      [],
      0,
      thickness,
    );

    if (!geometry) return null;

    geometry.translate(0, 0, -thickness / 2);
    return geometry;
  }

  const boundaries = [0, thickness];

  validOperations.forEach((operation) => {
    const cutsFromHigh = operationCutsFromHighSide(
      operation,
      descriptor.plane,
    );
    const split = cutsFromHigh
      ? thickness - operation.depth
      : operation.depth;

    boundaries.push(
      Math.max(0, Math.min(thickness, split)),
    );
  });

  const sorted = Array.from(
    new Set(
      boundaries.map((value) =>
        Math.round(value * 1000000) / 1000000,
      ),
    ),
  ).sort((a, b) => a - b);

  const geometries = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const zStart = sorted[index];
    const zEnd = sorted[index + 1];

    if (zEnd - zStart <= PROFILE_EPSILON) continue;

    const mid = (zStart + zEnd) / 2;
    const activeOperations = validOperations.filter(
      (operation) => {
        const cutsFromHigh = operationCutsFromHighSide(
          operation,
          descriptor.plane,
        );

        return cutsFromHigh
          ? mid >= thickness - operation.depth - PROFILE_EPSILON
          : mid <= operation.depth + PROFILE_EPSILON;
      },
    );

    const geometry = makeLayerGeometry(
      component,
      outerPoints,
      throughCutouts,
      activeOperations,
      zStart,
      zEnd,
    );

    if (geometry) geometries.push(geometry);
  }

  if (!geometries.length) return null;

  let geometry;

  if (geometries.length === 1) {
    geometry = geometries[0];
  } else {
    geometry = mergeGeometries(geometries, false);

    geometries.forEach((item) => item.dispose());

    if (!geometry) {
      return null;
    }
  }

  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

function addWoodworkingProfile3D(
  root,
  selectableMeshes,
  component,
  material,
  rootId,
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return null;

  const outerPoints = getWoodworkingProfileLocalPoints(
    component,
    {
      curveSegments: 56,
      cornerSegments: 8,
    },
  );

  if (!outerPoints?.length) return null;

  const throughCutouts = getValidProfileCutouts(component);
  const cutoutPolygons = throughCutouts.map((cutout) =>
    getProfileCutoutLocalPoints(
      cutout,
      cutout.type === "round" ? 48 : 4,
    ),
  );

  const operations = normalizeWoodworkingOperations(
    component.woodworkingOperations,
  );

  const validationContext = {
    outerPoints,
    cutoutPolygons,
  };

  const validOperations = operations.filter(
    (operation) =>
      getWoodworkingOperationStatus(
        component,
        operation,
        validationContext,
      ).valid,
  );

  const geometry = buildProfileGeometry(
    component,
    descriptor,
    outerPoints,
    throughCutouts,
    validOperations,
  );

  if (!geometry) return null;

  orientProfileGeometry(geometry, descriptor.plane);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  mesh.userData.profileKind = descriptor.kind;
  mesh.userData.profilePlane = descriptor.plane;
  mesh.userData.woodworkingOperationsVersion = 2;
  mesh.userData.validWoodworkingOperationCount =
    validOperations.length;

  root.add(mesh);
  selectableMeshes.push(mesh);

  return mesh;
}

export { addWoodworkingProfile3D };