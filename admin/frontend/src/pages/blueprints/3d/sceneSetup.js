import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";

const BACKGROUND_COLOR = 0x16263d;

function createAxisLine(start, end, material, renderOrder = 3) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...start),
      new THREE.Vector3(...end),
    ]),
    material,
  );
  line.renderOrder = renderOrder;
  return line;
}

function addBlueprintLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));

  const hemisphere = new THREE.HemisphereLight(0xf4f8ff, 0x223248, 1.45);
  scene.add(hemisphere);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(1400, 2200, 1200);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(4096, 4096);
  keyLight.shadow.camera.left = -3200;
  keyLight.shadow.camera.right = 3200;
  keyLight.shadow.camera.top = 3200;
  keyLight.shadow.camera.bottom = -3200;
  keyLight.shadow.camera.near = 200;
  keyLight.shadow.camera.far = 7000;
  keyLight.shadow.bias = 0.00035;
  keyLight.shadow.normalBias = 0.85;
  keyLight.shadow.radius = 2;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.15);
  fillLight.position.set(-1500, 1000, 1300);
  scene.add(fillLight);

  const frontLight = new THREE.DirectionalLight(0xffffff, 0.95);
  frontLight.position.set(0, 900, 1800);
  scene.add(frontLight);

  const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.6);
  rimLight.position.set(-1100, 700, -900);
  scene.add(rimLight);

  const topLight = new THREE.DirectionalLight(0xffffff, 0.65);
  topLight.position.set(0, 2600, 0);
  scene.add(topLight);
}

function addBlueprintFloor(scene, floorY) {
  const floorBase = new THREE.Mesh(
    new THREE.PlaneGeometry(6800, 6800),
    new THREE.MeshStandardMaterial({
      color: 0x17345a,
      roughness: 0.97,
      metalness: 0.0,
      emissive: 0x0a1422,
      emissiveIntensity: 0.28,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  floorBase.rotation.x = -Math.PI / 2;
  floorBase.position.y = floorY - 1.5;
  floorBase.receiveShadow = true;
  floorBase.renderOrder = 0;
  scene.add(floorBase);

  const minorGrid = new THREE.GridHelper(6000, 120, 0x5ea3e6, 0x274d78);
  minorGrid.position.y = floorY + 0.35;
  minorGrid.material.transparent = true;
  minorGrid.material.opacity = 0.34;
  minorGrid.material.depthWrite = false;
  minorGrid.renderOrder = 1;
  scene.add(minorGrid);

  const majorGrid = new THREE.GridHelper(6000, 24, 0xb9e3ff, 0x6ea8dc);
  majorGrid.position.y = floorY + 0.75;
  majorGrid.material.transparent = true;
  majorGrid.material.opacity = 0.72;
  majorGrid.material.depthWrite = false;
  majorGrid.renderOrder = 2;
  scene.add(majorGrid);

  const axisMaterialX = new THREE.LineBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    toneMapped: false,
  });
  const axisMaterialY = new THREE.LineBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    toneMapped: false,
  });
  const axisMaterialZ = new THREE.LineBasicMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    toneMapped: false,
  });

  scene.add(
    createAxisLine(
      [-3000, floorY + 1.05, 0],
      [3000, floorY + 1.05, 0],
      axisMaterialX,
    ),
  );
  scene.add(
    createAxisLine([0, floorY, 0], [0, 2800, 0], axisMaterialY),
  );
  scene.add(
    createAxisLine(
      [0, floorY + 1.05, -3000],
      [0, floorY + 1.05, 3000],
      axisMaterialZ,
    ),
  );
}

export function createBlueprintSceneFoundation({
  mount,
  width,
  height,
  canvasHeight,
  gridSize,
  rotationSnapDegrees,
}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.setClearColor(BACKGROUND_COLOR);

  mount.innerHTML = "";
  mount.appendChild(renderer.domElement);

  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.outline = "none";
  canvas.tabIndex = 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 12000);
  camera.position.set(1100, 760, 1100);

  addBlueprintLights(scene);

  const floorY = -canvasHeight / 2;
  addBlueprintFloor(scene, floorY);

  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.rotateSpeed = 0.9;
  orbit.panSpeed = 1;
  orbit.zoomSpeed = 1.05;
  orbit.minDistance = 140;
  orbit.maxDistance = 9500;
  orbit.maxPolarAngle = Math.PI / 2.02;
  orbit.target.set(0, 160, 0);
  orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  orbit.update();

  const transform = new TransformControls(camera, canvas);
  transform.setSpace("world");
  transform.setSize(0.86);
  transform.translationSnap = gridSize;
  transform.rotationSnap = THREE.MathUtils.degToRad(rotationSnapDegrees);
  scene.add(transform);

  const rootGroup = new THREE.Group();
  scene.add(rootGroup);

  const selectionOutlineGroup = new THREE.Group();
  selectionOutlineGroup.name = "selection-outline-group";
  scene.add(selectionOutlineGroup);

  const previewGroup = new THREE.Group();
  previewGroup.name = "placement-preview-group";
  scene.add(previewGroup);

  return {
    renderer,
    canvas,
    scene,
    camera,
    orbit,
    transform,
    rootGroup,
    selectionOutlineGroup,
    previewGroup,
    floorY,
  };
}

export function disposeObject3DResources(object) {
  object?.traverse?.((node) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) {
      node.material.forEach((material) => material?.dispose?.());
    } else {
      node.material?.dispose?.();
    }
  });
}

export function clearObject3DChildren(group) {
  if (!group) return;

  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    disposeObject3DResources(child);
  }
}
