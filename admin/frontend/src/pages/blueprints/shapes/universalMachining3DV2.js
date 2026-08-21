// shapes/universalMachining3DV2.js
// WISDOM Universal Part Machining 3D V2.0.2
// Reuses the proven Custom Shape V5B extrusion engine on the ACTUAL rendered
// target mesh. This avoids the V1 issue where a cutter could miss visually
// offset parts such as wardrobe doors/drawer fronts.

import * as THREE from "three";
import { addWoodworkingProfile3D } from "./woodworkingProfile3D";
import { isWoodworkingProfileComponent } from "../data/woodworkingProfile";
import {
  getUniversalMachiningCapability,
  getUniversalMachiningCutouts,
  getUniversalMachiningCutoutStatus,
  getUniversalMachiningDescriptor,
  getUniversalMachiningOperationStatus,
  hasUniversalMachiningMetadata,
} from "../data/universalMachiningV2";
import { normalizeWoodworkingOperations } from "../data/woodworkingOperations";

const TARGET_EPSILON = 0.75;
const ROTATION_EPSILON = 1e-4;
const MAX_CONTOUR_POINTS = 24;
const SUPPORTED_GEOMETRY_TYPES = new Set([
  "BoxGeometry",
  "ExtrudeGeometry",
]);

function nearlyZero(value) {
  return Math.abs(Number(value) || 0) <= ROTATION_EPSILON;
}

function hasSimpleLocalTransform(mesh) {
  if (!mesh?.isMesh) return false;

  const unitScale =
    Math.abs((Number(mesh.scale?.x) || 1) - 1) <= ROTATION_EPSILON &&
    Math.abs((Number(mesh.scale?.y) || 1) - 1) <= ROTATION_EPSILON &&
    Math.abs((Number(mesh.scale?.z) || 1) - 1) <= ROTATION_EPSILON;

  return (
    nearlyZero(mesh.rotation?.x) &&
    nearlyZero(mesh.rotation?.y) &&
    nearlyZero(mesh.rotation?.z) &&
    unitScale
  );
}

function projectVector(vector, plane) {
  if (plane === "xz") return [vector.x, vector.z];
  if (plane === "yz") return [vector.z, vector.y];
  return [vector.x, vector.y];
}

function getPlaneSize(size, plane) {
  if (plane === "xz") {
    return { u: size.x, v: size.z, thickness: size.y };
  }
  if (plane === "yz") {
    return { u: size.z, v: size.y, thickness: size.x };
  }
  return { u: size.x, v: size.y, thickness: size.z };
}

function getMeshLocalBounds(mesh) {
  const geometry = mesh?.geometry;
  if (!geometry?.attributes?.position) return null;

  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return null;

  const box = geometry.boundingBox.clone();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  if (
    ![size.x, size.y, size.z].every(
      (value) => Number.isFinite(value) && value > 0.05,
    )
  ) {
    return null;
  }

  return { box, size, center };
}

function getCandidateData(root, mesh, plane) {
  if (
    !mesh?.isMesh ||
    mesh.parent !== root ||
    !mesh.geometry ||
    !SUPPORTED_GEOMETRY_TYPES.has(mesh.geometry.type) ||
    !hasSimpleLocalTransform(mesh) ||
    Array.isArray(mesh.material)
  ) {
    return null;
  }

  const bounds = getMeshLocalBounds(mesh);
  if (!bounds) return null;

  const rootCenter = bounds.center.clone().add(mesh.position);
  const [centerU, centerV] = projectVector(rootCenter, plane);
  const planeSize = getPlaneSize(bounds.size, plane);

  return {
    mesh,
    ...bounds,
    centerU,
    centerV,
    u: planeSize.u,
    v: planeSize.v,
    thickness: planeSize.thickness,
    projectedArea: planeSize.u * planeSize.v,
  };
}

function getReferencePoint(component, cutouts, operations) {
  const firstCutout = cutouts[0];
  if (firstCutout) {
    return {
      u: Number(firstCutout.u) || 0,
      v: Number(firstCutout.v) || 0,
    };
  }

  const firstOperation = operations[0];
  if (firstOperation && firstOperation.type !== "rabbet") {
    return {
      u: Number(firstOperation.u) || 0,
      v: Number(firstOperation.v) || 0,
    };
  }

  return { u: 0, v: 0 };
}

function chooseTargetMesh(root, component, plane, cutouts, operations) {
  const reference = getReferencePoint(component, cutouts, operations);
  const candidates = [];

  root.children.forEach((child) => {
    const candidate = getCandidateData(root, child, plane);
    if (!candidate) return;

    const withinU =
      Math.abs(reference.u - candidate.centerU) <=
      candidate.u / 2 + TARGET_EPSILON;
    const withinV =
      Math.abs(reference.v - candidate.centerV) <=
      candidate.v / 2 + TARGET_EPSILON;

    if (!withinU || !withinV) return;
    candidates.push(candidate);
  });

  if (!candidates.length) return null;

  // V2.0.2 safety: a normal editable part must resolve to one physical
  // machining surface. Do not silently cut an arbitrary child of a composite
  // furniture object when several rendered meshes overlap the same point.
  if (candidates.length !== 1) {
    return null;
  }

  return candidates[0];
}

function cross2(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) -
    (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull2(points = []) {
  const uniqueMap = new Map();
  points.forEach(([x, y]) => {
    const key = `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, [x, y]);
  });

  const sorted = Array.from(uniqueMap.values()).sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  );
  if (sorted.length <= 3) return sorted;

  const lower = [];
  sorted.forEach((point) => {
    while (
      lower.length >= 2 &&
      cross2(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-7
    ) {
      lower.pop();
    }
    lower.push(point);
  });

  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (
      upper.length >= 2 &&
      cross2(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-7
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function sampleContour(points = [], maxPoints = MAX_CONTOUR_POINTS) {
  if (points.length <= maxPoints) return points;
  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.floor((index * points.length) / maxPoints);
    return points[Math.min(points.length - 1, sourceIndex)];
  });
}

function buildTargetContourRatios(target, plane) {
  const position = target.mesh.geometry?.attributes?.position;
  if (!position) return null;

  const points = [];
  for (let index = 0; index < position.count; index += 1) {
    const vector = new THREE.Vector3(
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    );
    const [u, v] = projectVector(vector, plane);
    points.push([u - projectVector(target.center, plane)[0], v - projectVector(target.center, plane)[1]]);
  }

  const hull = sampleContour(convexHull2(points));
  if (hull.length < 3) return null;

  return hull.map(([u, v]) => [
    Math.max(-0.5, Math.min(0.5, u / Math.max(1, target.u))),
    Math.max(-0.5, Math.min(0.5, v / Math.max(1, target.v))),
  ]);
}

function shiftCutoutToTarget(cutout, target) {
  return {
    ...cutout,
    u: (Number(cutout.u) || 0) - target.centerU,
    v: (Number(cutout.v) || 0) - target.centerV,
  };
}

function shiftOperationToTarget(operation, target) {
  return {
    ...operation,
    u: (Number(operation.u) || 0) - target.centerU,
    v: (Number(operation.v) || 0) - target.centerV,
  };
}

function getTargetProfileRadius(component, target, plane) {
  // createRoundedBoxGeometry rounds the local XY outline and extrudes in Z.
  // Therefore the radius is relevant only when machining Front / Back.
  if (plane !== "xy") return 0;

  const type = String(component?.type || "").trim().toLowerCase();
  let radius = Math.max(0, Number(component?.cornerRadius) || 0);

  // Wardrobe drawer fronts use a fixed 3 mm visual corner radius even when
  // component.cornerRadius is zero.
  if (type === "wr_drawer_front") {
    radius = 3;
  }

  // addRoundedPanel defaults to a small radius for these single-board parts.
  if (
    radius <= 0 &&
    ["chair_seat_panel", "chair_back_slat", "countertop"].includes(type)
  ) {
    radius = Math.min(6, target.u * 0.08, target.v * 0.08);
  }

  return Math.max(
    0,
    Math.min(radius, Math.max(0, Math.min(target.u, target.v) / 2 - 0.5)),
  );
}

function makeTargetProfileComponent(component, target, plane, cutouts, operations) {
  // Do NOT rebuild the outer board from render triangles. ExtrudeGeometry
  // contains triangulation vertices that are implementation details, and
  // using/sampling them as a saved contour can create accidental large
  // notches or missing corners. The actual target bounds are authoritative.
  const radius = getTargetProfileRadius(component, target, plane);
  const rounded = radius > 0.01;

  return {
    ...component,
    type: rounded ? "wood_profile_rounded" : "wood_profile_rectangle",
    profileKind: rounded ? "rounded" : "rectangle",
    profilePlane: plane,
    profileRadius: radius,
    profileContourPoints: [],
    profileContourBulges: [],
    profileEdgeNotches: [],
    profileFilletRadius: 0,
    profileCutouts: cutouts.map((item) => shiftCutoutToTarget(item, target)),
    woodworkingOperations: operations.map((item) =>
      shiftOperationToTarget(item, target),
    ),
    width: target.size.x,
    height: target.size.y,
    depth: target.size.z,
  };
}

function replacementMatchesTargetBounds(replacement, target) {
  const geometry = replacement?.geometry;
  if (!geometry?.attributes?.position) return false;

  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return false;

  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const tolerance = 1.25;

  return (
    Math.abs(size.x - target.size.x) <= tolerance &&
    Math.abs(size.y - target.size.y) <= tolerance &&
    Math.abs(size.z - target.size.z) <= tolerance
  );
}

function removeOldEdgeHelpers(root, rootId) {
  const stale = root.children.filter(
    (child) =>
      child?.isLineSegments &&
      String(child?.userData?.rootId || "") === String(rootId || ""),
  );

  stale.forEach((line) => {
    root.remove(line);
    line.geometry?.dispose?.();
    if (Array.isArray(line.material)) {
      line.material.forEach((material) => material?.dispose?.());
    } else {
      line.material?.dispose?.();
    }
  });
}

function replaceTargetMesh(
  root,
  selectableMeshes,
  component,
  target,
  profileComponent,
) {
  const tempRoot = new THREE.Group();
  const tempSelectable = [];
  const replacement = addWoodworkingProfile3D(
    tempRoot,
    tempSelectable,
    profileComponent,
    target.mesh.material,
    component.id,
  );

  if (!replacement?.geometry) return null;

  // Fail closed if the regenerated board no longer matches the physical
  // target envelope. This prevents a bad machining rebuild from replacing
  // the original part.
  if (!replacementMatchesTargetBounds(replacement, target)) {
    tempRoot.remove(replacement);
    replacement.geometry?.dispose?.();
    replacement.material?.dispose?.();
    return null;
  }

  // Match the actual source geometry center, not the saved component center.
  // This is the key V2 fix for visually offset drawer fronts/doors.
  replacement.geometry.translate(
    target.center.x,
    target.center.y,
    target.center.z,
  );
  replacement.geometry.computeBoundingBox();
  replacement.geometry.computeBoundingSphere();

  tempRoot.remove(replacement);
  replacement.position.copy(target.mesh.position);
  replacement.rotation.copy(target.mesh.rotation);
  replacement.scale.copy(target.mesh.scale);
  replacement.castShadow = target.mesh.castShadow;
  replacement.receiveShadow = target.mesh.receiveShadow;
  replacement.userData = {
    ...target.mesh.userData,
    ...replacement.userData,
    rootId: component.id,
    universalMachiningVersion: 2,
    universalMachiningReplacement: true,
  };

  const parent = target.mesh.parent;
  if (!parent) {
    replacement.geometry.dispose();
    replacement.material?.dispose?.();
    return null;
  }

  const selectableIndex = selectableMeshes.indexOf(target.mesh);
  const sourceMaterial = target.mesh.material;
  const materialSharedElsewhere = root.children.some(
    (child) =>
      child !== target.mesh &&
      child?.isMesh &&
      child.material === sourceMaterial,
  );

  parent.remove(target.mesh);
  parent.add(replacement);

  if (selectableIndex >= 0) {
    selectableMeshes[selectableIndex] = replacement;
  } else {
    selectableMeshes.push(replacement);
  }

  target.mesh.geometry?.dispose?.();
  if (!materialSharedElsewhere) {
    sourceMaterial?.dispose?.();
  }
  removeOldEdgeHelpers(root, component.id);
  return replacement;
}

function applyUniversalMachining3D(root, selectableMeshes, component) {
  if (
    !root ||
    !component?.id ||
    isWoodworkingProfileComponent(component) ||
    !hasUniversalMachiningMetadata(component)
  ) {
    return root;
  }

  const capability = getUniversalMachiningCapability(component);
  if (!capability.supported) {
    root.userData.universalMachiningStatus = {
      applied: false,
      code: capability.code,
      message: capability.message,
    };
    return root;
  }

  const descriptor = getUniversalMachiningDescriptor(component);
  if (!descriptor) return root;

  const cutouts = getUniversalMachiningCutouts(component).filter(
    (cutout) => getUniversalMachiningCutoutStatus(component, cutout).valid,
  );
  const operations = normalizeWoodworkingOperations(
    component?.woodworkingOperations ??
      component?.woodworking_operations ??
      [],
  ).filter(
    (operation) =>
      getUniversalMachiningOperationStatus(component, operation).valid,
  );

  if (!cutouts.length && !operations.length) return root;

  const target = chooseTargetMesh(
    root,
    component,
    descriptor.plane,
    cutouts,
    operations,
  );

  if (!target) {
    root.userData.universalMachiningStatus = {
      applied: false,
      code: "no_target_surface",
      message:
        "No compatible rendered board surface was found at the machining position.",
    };
    return root;
  }

  const profileComponent = makeTargetProfileComponent(
    component,
    target,
    descriptor.plane,
    cutouts,
    operations,
  );

  if (!profileComponent) {
    root.userData.universalMachiningStatus = {
      applied: false,
      code: "target_profile",
      message: "The selected rendered surface could not be converted safely.",
    };
    return root;
  }

  const replacement = replaceTargetMesh(
    root,
    selectableMeshes,
    component,
    target,
    profileComponent,
  );

  root.userData.universalMachiningStatus = replacement
    ? {
        applied: true,
        code: "applied",
        message: "Machining applied to the actual rendered surface.",
        cutoutCount: cutouts.length,
        operationCount: operations.length,
      }
    : {
        applied: false,
        code: "replacement_failed",
        message: "The original part was preserved because machining could not be rebuilt safely.",
      };

  return root;
}

export { applyUniversalMachining3D };
