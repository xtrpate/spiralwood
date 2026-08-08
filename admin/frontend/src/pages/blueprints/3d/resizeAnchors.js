import * as THREE from "three";
import { normalizeDimensionMm, roundToPrecision } from "../data/utils";

export const DEFAULT_RESIZE_ANCHORS = Object.freeze({
  width: "center",
  height: "center",
  depth: "center",
});

const VALID_ANCHORS = {
  width: new Set(["left", "center", "right"]),
  height: new Set(["bottom", "center", "top"]),
  depth: new Set(["front", "center", "back"]),
};

export function normalizeResizeAnchors(value = {}) {
  return {
    width: VALID_ANCHORS.width.has(value?.width)
      ? value.width
      : DEFAULT_RESIZE_ANCHORS.width,
    height: VALID_ANCHORS.height.has(value?.height)
      ? value.height
      : DEFAULT_RESIZE_ANCHORS.height,
    depth: VALID_ANCHORS.depth.has(value?.depth)
      ? value.depth
      : DEFAULT_RESIZE_ANCHORS.depth,
  };
}

function rotationQuaternionFromComponent(comp = {}) {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(Number(comp.rotationX) || 0),
      THREE.MathUtils.degToRad(Number(comp.rotationY) || 0),
      THREE.MathUtils.degToRad(Number(comp.rotationZ) || 0),
      "XYZ",
    ),
  );
}

function worldCenterFromComponent(comp, canvasW, canvasH, canvasD) {
  return new THREE.Vector3(
    Number(comp.x || 0) + Number(comp.width || 0) / 2 - canvasW / 2,
    canvasH / 2 - (Number(comp.y || 0) + Number(comp.height || 0) / 2),
    Number(comp.z || 0) + Number(comp.depth || 0) / 2 - canvasD / 2,
  );
}

export function buildAnchoredResizeUpdates({
  comp,
  nextWidth,
  nextHeight,
  nextDepth,
  anchors = DEFAULT_RESIZE_ANCHORS,
  canvasW,
  canvasH,
  canvasD,
  quaternion = null,
}) {
  if (!comp) return null;

  const normalizedAnchors = normalizeResizeAnchors(anchors);

  const oldWidth = normalizeDimensionMm(comp.width, 1);
  const oldHeight = normalizeDimensionMm(comp.height, 1);
  const oldDepth = normalizeDimensionMm(comp.depth, 1);

  const width = normalizeDimensionMm(nextWidth ?? oldWidth, 1);
  const height = normalizeDimensionMm(nextHeight ?? oldHeight, 1);
  const depth = normalizeDimensionMm(nextDepth ?? oldDepth, 1);

  const center = worldCenterFromComponent(
    comp,
    Number(canvasW) || 0,
    Number(canvasH) || 0,
    Number(canvasD) || 0,
  );

  const rotation =
    quaternion?.clone?.() || rotationQuaternionFromComponent(comp);
  rotation.normalize();

  const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
  const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  const axisZ = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);

  const widthDelta = width - oldWidth;
  const heightDelta = height - oldHeight;
  const depthDelta = depth - oldDepth;

  if (normalizedAnchors.width === "left") {
    center.addScaledVector(axisX, widthDelta / 2);
  } else if (normalizedAnchors.width === "right") {
    center.addScaledVector(axisX, -widthDelta / 2);
  }

  // Component Y grows downward, while Three.js local +Y points upward.
  if (normalizedAnchors.height === "bottom") {
    center.addScaledVector(axisY, heightDelta / 2);
  } else if (normalizedAnchors.height === "top") {
    center.addScaledVector(axisY, -heightDelta / 2);
  }

  if (normalizedAnchors.depth === "front") {
    center.addScaledVector(axisZ, depthDelta / 2);
  } else if (normalizedAnchors.depth === "back") {
    center.addScaledVector(axisZ, -depthDelta / 2);
  }

  return {
    x: roundToPrecision(center.x - width / 2 + canvasW / 2),
    y: roundToPrecision(canvasH / 2 - center.y - height / 2),
    z: roundToPrecision(center.z - depth / 2 + canvasD / 2),
    width,
    height,
    depth,
  };
}