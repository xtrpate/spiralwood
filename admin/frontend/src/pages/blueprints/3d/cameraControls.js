import * as THREE from "three";

export function isTypingElement(element) {
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable
  );
}

export function moveCameraFromKeyboard({
  camera,
  orbit,
  keys = {},
  delta = 0,
}) {
  if (!camera || !orbit) return false;

  const moveDir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  camera.getWorldDirection(forward);
  forward.y = 0;

  if (forward.lengthSq() > 0) {
    forward.normalize();
  }

  right.crossVectors(forward, up).normalize();

  if (keys["KeyW"]) moveDir.add(forward);
  if (keys["KeyS"]) moveDir.sub(forward);
  if (keys["KeyD"]) moveDir.add(right);
  if (keys["KeyA"]) moveDir.sub(right);
  if (keys["KeyE"]) moveDir.y += 1;
  if (keys["KeyQ"]) moveDir.y -= 1;

  if (moveDir.lengthSq() === 0) return false;

  const speed = (keys["ShiftLeft"] || keys["ShiftRight"] ? 2200 : 1100) * delta;

  moveDir.normalize().multiplyScalar(speed);
  camera.position.add(moveDir);
  orbit.target.add(moveDir);
  return true;
}

export function captureCameraView(camera, orbit) {
  if (!camera || !orbit) return null;

  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: orbit.target.clone(),
    zoom: camera.zoom,
  };
}

export function restoreCameraView(camera, orbit, snapshot) {
  if (!camera || !orbit || !snapshot) return false;

  camera.position.copy(snapshot.position);
  camera.quaternion.copy(snapshot.quaternion);
  camera.zoom = snapshot.zoom ?? camera.zoom;
  camera.updateProjectionMatrix();
  orbit.target.copy(snapshot.target);
  orbit.update();
  return true;
}

export function centerCameraOnObject({
  camera,
  orbit,
  object,
  instant = false,
}) {
  if (!object || !camera || !orbit) return false;

  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  orbit.target.copy(center);

  if (instant) {
    const maxSize = Math.max(size.x, size.y, size.z, 120);
    const fitHeightDistance =
      maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
    const fitWidthDistance = fitHeightDistance / camera.aspect;
    const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.9;

    camera.position.set(
      center.x + distance,
      center.y + distance * 0.65,
      center.z + distance,
    );
    camera.near = 0.5;
    camera.far = Math.max(12000, distance * 6);
    camera.updateProjectionMatrix();
  }

  orbit.update();
  return true;
}
