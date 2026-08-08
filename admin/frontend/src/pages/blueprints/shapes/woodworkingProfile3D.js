// shapes/woodworkingProfile3D.js
// Builds Custom Shape Foundation V1 parts from the same profile data used by 2D.

import * as THREE from "three";
import {
  getWoodworkingProfileDescriptor,
  getWoodworkingProfileLocalPoints,
} from "../data/woodworkingProfile";

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

function addWoodworkingProfile3D(
  root,
  selectableMeshes,
  component,
  material,
  rootId,
) {
  const descriptor = getWoodworkingProfileDescriptor(component);
  if (!descriptor) return null;

  const points = getWoodworkingProfileLocalPoints(component, {
    curveSegments: 56,
    cornerSegments: 8,
  });

  if (!points?.length) return null;

  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);

  for (let index = 1; index < points.length; index += 1) {
    shape.lineTo(points[index][0], points[index][1]);
  }

  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, descriptor.thickness),
    steps: 1,
    bevelEnabled: false,
    curveSegments: 16,
  });

  geometry.center();
  orientProfileGeometry(geometry, descriptor.plane);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rootId = rootId;
  mesh.userData.profileKind = descriptor.kind;
  mesh.userData.profilePlane = descriptor.plane;

  root.add(mesh);
  selectableMeshes.push(mesh);

  return mesh;
}

export { addWoodworkingProfile3D };