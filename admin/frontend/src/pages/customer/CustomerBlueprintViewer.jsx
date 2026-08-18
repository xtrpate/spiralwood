import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { buildAssetUrl } from "../../services/api";
import { createFurnitureObject } from "../blueprints/3d/createFurnitureObjects";
import { extractCustomerBlueprintScene } from "./customerBlueprintAdapter";

const mmToCameraDistance = (size, fov, aspect) => {
  const fitHeightDistance =
    size / (2 * Math.tan(THREE.MathUtils.degToRad(fov * 0.5)));
  const fitWidthDistance = fitHeightDistance / Math.max(aspect, 0.1);
  return Math.max(fitHeightDistance, fitWidthDistance);
};

const resolveAsset = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("/template-previews/") ||
    raw.startsWith("/images/") ||
    raw.startsWith("/assets/")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const disposeMaterial = (material) => {
  if (!material) return;
  Object.values(material).forEach((value) => {
    if (value?.isTexture) value.dispose?.();
  });
  material.dispose?.();
};

const disposeObjectTree = (root) => {
  if (!root) return;

  while (root.children.length) {
    const child = root.children[0];
    root.remove(child);

    child.traverse?.((obj) => {
      obj.geometry?.dispose?.();

      if (Array.isArray(obj.material)) {
        obj.material.forEach((mat) => disposeMaterial(mat));
      } else {
        disposeMaterial(obj.material);
      }
    });
  }
};

const makeHumanReference = (heightMm = 1700, buildScale = 1) => {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xb7c0cc,
    roughness: 0.95,
    metalness: 0.02,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 24), bodyMat);
  head.position.y = 1700 - 110;
  group.add(head);

  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(135, 165, 760, 24),
    bodyMat,
  );
  torso.position.y = 1050;
  group.add(torso);

  const hip = new THREE.Mesh(
    new THREE.CylinderGeometry(120, 140, 180, 20),
    bodyMat,
  );
  hip.position.y = 610;
  group.add(hip);

  const leftLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(52, 44, 760, 16),
    bodyMat,
  );
  leftLeg.position.set(-48, 250, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(52, 44, 760, 16),
    bodyMat,
  );
  rightLeg.position.set(48, 250, 0);
  group.add(rightLeg);

  const leftArm = new THREE.Mesh(
    new THREE.CylinderGeometry(38, 34, 620, 16),
    bodyMat,
  );
  leftArm.position.set(-215, 1080, 0);
  leftArm.rotation.z = THREE.MathUtils.degToRad(-18);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(
    new THREE.CylinderGeometry(38, 34, 620, 16),
    bodyMat,
  );
  rightArm.position.set(215, 1080, 0);
  rightArm.rotation.z = THREE.MathUtils.degToRad(18);
  group.add(rightArm);

  group.scale.set(buildScale, heightMm / 1700, buildScale);

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });

  return group;
};

const makeSoftContactShadow = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    gradient.addColorStop(0, "rgba(0,0,0,0.22)");
    gradient.addColorStop(0.45, "rgba(0,0,0,0.12)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 2;
  mesh.renderOrder = 2;
  return mesh;
};

const safeColor = (value) => {
  try {
    return new THREE.Color(value || "#d6c3ab");
  } catch {
    return new THREE.Color("#d6c3ab");
  }
};

const parseMaybeJson = (value, fallback = {}) => {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const extractDirect3DItems = (source = {}) => {
  if (!source || typeof source !== "object") return [];

  const candidates = [
    source.components,
    source.objects,
    source.items,
    source.parts,
    source.meshes,
    source.scene?.components,
    source.scene?.objects,
    source.sceneData?.components,
    source.sceneData?.objects,
    source.view3d?.components,
    source.view3d?.objects,
    source.saved3d?.components,
    source.saved3d?.objects,
    source.saved3D?.components,
    source.saved3D?.objects,
  ];

  const found = candidates.find(Array.isArray);
  return found || [];
};

const hasExactAdmin3DSource = (blueprint = {}) => {
  const rawView3d = parseMaybeJson(blueprint?.view_3d_data, {});
  const rawDesign = parseMaybeJson(blueprint?.design_data, {});

  if (extractDirect3DItems(rawView3d).length > 0) return true;

  // WISDOM CUSTOMER BLUEPRINT VIEWER DETECTION V1
  if (extractDirect3DItems(rawDesign).length > 0) return true;
  if (extractDirect3DItems(blueprint).length > 0) return true;

  const nestedDesignSources = [
    rawDesign?.scene,
    rawDesign?.sceneData,
    rawDesign?.view3d,
    rawDesign?.saved3d,
    rawDesign?.saved3D,
  ].filter(Boolean);

  return nestedDesignSources.some(
    (source) => extractDirect3DItems(source).length > 0,
  );
};

// WISDOM PERSISTENT GENERATED PREVIEW CACHE V1.0.6
const COMPACT_PREVIEW_CACHE_PREFIX = "wisdom:generated-blueprint-preview:v3:";

const compactPreviewHash = (value = "") => {
  const text = String(value || "");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};

const buildCompactPreviewCacheKey = (
  blueprint = {},
  preset = "iso",
  compactHeight = 240,
) => {
  let geometrySource = "";

  try {
    geometrySource = JSON.stringify({
      id: blueprint?.id || "",
      updated_at: blueprint?.updated_at || blueprint?.updatedAt || "",
      components: blueprint?.components || null,
      design_data: blueprint?.design_data || null,
      view_3d_data: blueprint?.view_3d_data || null,
    });
  } catch {
    geometrySource = String(blueprint?.id || "");
  }

  return (
    COMPACT_PREVIEW_CACHE_PREFIX +
    compactPreviewHash(
      [preset, compactHeight, geometrySource].join("|"),
    )
  );
};

const readGeneratedCompactPreview = (cacheKey) => {
  if (!cacheKey || typeof window === "undefined") return "";

  try {
    return window.localStorage.getItem(cacheKey) || "";
  } catch {
    return "";
  }
};

const writeGeneratedCompactPreview = (cacheKey, dataUrl) => {
  if (
    !cacheKey ||
    !dataUrl ||
    typeof window === "undefined" ||
    !String(dataUrl).startsWith("data:image/")
  ) {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, dataUrl);
    return;
  } catch {
    // Keep this cache isolated from the rest of the application. If browser
    // storage is full, prune only generated WISDOM preview entries.
  }

  try {
    const previewKeys = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(COMPACT_PREVIEW_CACHE_PREFIX)) {
        previewKeys.push(key);
      }
    }

    previewKeys.slice(0, Math.max(8, previewKeys.length - 36)).forEach((key) => {
      window.localStorage.removeItem(key);
    });

    window.localStorage.setItem(cacheKey, dataUrl);
  } catch {
    // Preview caching is an optimization only; rendering still works without it.
  }
};

const formatMm = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} mm` : "—";
};

const buildRenderableObject = (component) => {
  try {
    return createFurnitureObject(component, false, false, []);
  } catch {
    const fallback = new THREE.Group();

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(component.width, component.height, component.depth),
      new THREE.MeshStandardMaterial({
        color: safeColor(component.fill),
        roughness: 0.82,
        metalness: 0.03,
      }),
    );

    fallback.add(mesh);
    return fallback;
  }
};

export default function CustomerBlueprintViewer({
  blueprint,
  targetDimensionsMm,
  readOnly = true,
  showHumanControls = true,
  compact = false,
  defaultPreset = "iso",
  defaultShowHuman = true,
  compactHeight = 240,
}) {
  const mountRef = useRef(null);
  const previewHostRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneRef = useRef(null);
  const productGroupRef = useRef(null);
  const helperGroupRef = useRef(null);
  const floorRef = useRef(null);
  const frameRef = useRef(0);
  const viewPresetRef = useRef(defaultPreset);

  const [showHuman, setShowHuman] = useState(defaultShowHuman);
  const [viewPreset, setViewPreset] = useState(defaultPreset);
  const [humanHeightMm, setHumanHeightMm] = useState(1700);
  const [humanBuild, setHumanBuild] = useState(1);
  const [fallbackImageError, setFallbackImageError] = useState(false);
  const [compactPreviewVisible, setCompactPreviewVisible] = useState(!compact);
  const [webglContextLost, setWebglContextLost] = useState(false);
  const [compactSnapshotUrl, setCompactSnapshotUrl] = useState(() =>
    compact
      ? readGeneratedCompactPreview(
          buildCompactPreviewCacheKey(
            blueprint,
            defaultPreset,
            compactHeight,
          ),
        )
      : "",
  );

  useEffect(() => {
    setViewPreset(defaultPreset);
  }, [defaultPreset, blueprint?.id]);

  useEffect(() => {
    setShowHuman(defaultShowHuman);
  }, [defaultShowHuman, blueprint?.id]);

  const sceneData = useMemo(
    () => extractCustomerBlueprintScene(blueprint),
    [blueprint],
  );

  const compactPreviewCacheKey = useMemo(
    () =>
      compact
        ? buildCompactPreviewCacheKey(
            blueprint,
            defaultPreset,
            compactHeight,
          )
        : "",
    [blueprint, compact, compactHeight, defaultPreset],
  );

  useEffect(() => {
    setFallbackImageError(false);
    setWebglContextLost(false);

    setCompactSnapshotUrl(
      compact
        ? readGeneratedCompactPreview(compactPreviewCacheKey)
        : "",
    );
  }, [
    blueprint?.id,
    sceneData?.thumbnail_url,
    sceneData?.components,
    compact,
    compactPreviewCacheKey,
  ]);

  useEffect(() => {
    // WISDOM MOBILE COMPACT 3D LIFECYCLE V1
    // Full modal viewers stay mounted as before. Compact gallery viewers
    // only keep a WebGL context while they are near the visible viewport.
    if (!compact) {
      setCompactPreviewVisible(true);
      return undefined;
    }

    const host = previewHostRef.current;

    if (!host || typeof IntersectionObserver === "undefined") {
      setCompactPreviewVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setCompactPreviewVisible(Boolean(entry?.isIntersecting));
      },
      {
        root: null,
        rootMargin: "180px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(host);

    return () => observer.disconnect();
  }, [compact, blueprint?.id]);

  const displayBounds = useMemo(() => {
    const base = sceneData?.defaultDimensions || {};

    return {
      width:
        Number(targetDimensionsMm?.widthMm) > 0
          ? Number(targetDimensionsMm.widthMm)
          : Number(base.width_mm) > 0
            ? Number(base.width_mm)
            : Number(sceneData?.bounds?.width) || 0,
      height:
        Number(targetDimensionsMm?.heightMm) > 0
          ? Number(targetDimensionsMm.heightMm)
          : Number(base.height_mm) > 0
            ? Number(base.height_mm)
            : Number(sceneData?.bounds?.height) || 0,
      depth:
        Number(targetDimensionsMm?.depthMm) > 0
          ? Number(targetDimensionsMm.depthMm)
          : Number(base.depth_mm) > 0
            ? Number(base.depth_mm)
            : Number(sceneData?.bounds?.depth) || 0,
    };
  }, [sceneData, targetDimensionsMm]);

  const fitCameraToObject = useCallback((preset = "iso") => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const productGroup = productGroupRef.current;

    if (!camera || !controls || !productGroup || !productGroup.children.length) {
      return;
    }

    const bounds = new THREE.Box3().setFromObject(productGroup);
    if (bounds.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);

    const maxSize = Math.max(size.x, size.y, size.z, 1);
    const distance =
      mmToCameraDistance(maxSize, camera.fov, camera.aspect) * (compact ? 1.55 : 1.85);

    let position;
    const target = center.clone();

    if (preset === "front") {
      camera.up.set(0, 1, 0);
      target.y += size.y * 0.08;
      position = new THREE.Vector3(
        center.x,
        center.y + size.y * 0.12,
        center.z + distance,
      );
    } else if (preset === "left") {
      camera.up.set(0, 1, 0);
      target.y += size.y * 0.08;
      position = new THREE.Vector3(
        center.x - distance,
        center.y + size.y * 0.12,
        center.z,
      );
    } else if (preset === "top") {
      camera.up.set(0, 0, -1);
      position = new THREE.Vector3(
        center.x,
        center.y + distance * 1.05,
        center.z,
      );
    } else {
      camera.up.set(0, 1, 0);
      position = new THREE.Vector3(
        center.x + distance * 0.9,
        center.y + distance * 0.48,
        center.z + distance * 0.9,
      );
    }

    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  }, [compact]);

  useEffect(() => {
    viewPresetRef.current = viewPreset;
    if (floorRef.current) {
      floorRef.current.visible = !compact && viewPreset === "iso";
    }
    fitCameraToObject(viewPreset);
  }, [viewPreset, fitCameraToObject, compact]);

  useEffect(() => {
    if (compact && !compactPreviewVisible) return undefined;
    if (compact && compactSnapshotUrl) return undefined;
    if (webglContextLost) return undefined;

    const mount = mountRef.current;
    if (!mount) return undefined;

    const width = mount.clientWidth || 640;
    const height = mount.clientHeight || (compact ? compactHeight : 420);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: compact,
    });

    renderer.setSize(width, height);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, compact ? 1.3 : 1.8),
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = compact ? 1.06 : 1.1;
    renderer.setClearColor(0xf6f2ec, 1);

    // WISDOM CUSTOMER 3D FURNITURE REALISM V1.0.3
    // Compact cards still render once and are cached as images.
    // Only visual rendering is improved.

    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    // WISDOM COMPACT CONTEXT RETRY V1.0.5
    const handleContextLost = (event) => {
      event.preventDefault();
      setWebglContextLost(true);

      if (compact) {
        window.setTimeout(() => {
          setWebglContextLost(false);
        }, 180);
      }
    };

    renderer.domElement.addEventListener(
      "webglcontextlost",
      handleContextLost,
      false,
    );

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f2ec);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 20000);
    camera.position.set(1800, 1100, 1800);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !compact;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableRotate = !compact;
    controls.enableZoom = !compact;
    controls.minDistance = 400;
    controls.maxDistance = 12000;
    controls.maxPolarAngle = Math.PI / 2.02;

    const ambient = new THREE.AmbientLight(
      0xffffff,
      compact ? 0.76 : 0.82,
    );
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(
      0xfffdf8,
      0xd6c2a6,
      0.92,
    );
    scene.add(hemi);

    const key = new THREE.DirectionalLight(
      0xfffbf5,
      compact ? 1.72 : 1.62,
    );
    key.position.set(1750, 2450, 1550);
    key.castShadow = true;
    key.shadow.mapSize.set(
      compact ? 1024 : 2048,
      compact ? 1024 : 2048,
    );
    key.shadow.camera.left = -3200;
    key.shadow.camera.right = 3200;
    key.shadow.camera.top = 3200;
    key.shadow.camera.bottom = -3200;
    key.shadow.camera.near = 100;
    key.shadow.camera.far = 8000;
    key.shadow.bias = -0.00012;
    key.shadow.normalBias = 0.7;
    key.shadow.radius = 3;
    scene.add(key);

    const fill = new THREE.DirectionalLight(
      0xffeee0,
      compact ? 0.44 : 0.5,
    );
    fill.position.set(-1300, 1050, 1150);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.24);
    rim.position.set(-900, 1450, -1600);
    scene.add(rim);

    const showroomBase = new THREE.Mesh(
      new THREE.CircleGeometry(4300, 96),
      new THREE.MeshStandardMaterial({
        color: 0xefe9dc,
        roughness: 1,
        metalness: 0,
      }),
    );
    showroomBase.rotation.x = -Math.PI / 2;
    showroomBase.position.y = 0;
    showroomBase.visible = !compact && viewPresetRef.current === "iso";
    scene.add(showroomBase);

    const productGroup = new THREE.Group();
    const helperGroup = new THREE.Group();
    scene.add(productGroup);
    scene.add(helperGroup);

    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = controls;
    sceneRef.current = scene;
    productGroupRef.current = productGroup;
    helperGroupRef.current = helperGroup;
    floorRef.current = showroomBase;

    // WISDOM COMPACT RUNTIME SNAPSHOT STABILITY V1.0.5
    const handleResize = () => {
      if (compact) return;

      const nextWidth = mount.clientWidth || 640;
      const nextHeight = mount.clientHeight || 420;

      renderer.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      fitCameraToObject(viewPresetRef.current);
    };

    const renderFrame = () => {
      controls.update();
      renderer.render(scene, camera);
    };

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      renderFrame();
    };

    if (compact) {
      // Compact cards are static previews. Do not run permanent loops.
      try {
        renderFrame();
      } catch (error) {
        console.warn("[customer-blueprint compact init]", error);
        setWebglContextLost(true);
      }
    } else {
      animate();
    }

    if (!compact) {
      window.addEventListener("resize", handleResize);
    }

    return () => {
      cancelAnimationFrame(frameRef.current);
      if (!compact) {
        window.removeEventListener("resize", handleResize);
      }
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
        false,
      );

      disposeObjectTree(helperGroupRef.current);
      disposeObjectTree(productGroupRef.current);

      controls.dispose();

      if (compact) {
        try {
          renderer.forceContextLoss?.();
        } catch {
          // Best-effort compact context release.
        }
      }

      renderer.dispose();

      if (rendererRef.current === renderer) rendererRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
      if (controlsRef.current === controls) controlsRef.current = null;
      if (sceneRef.current === scene) sceneRef.current = null;
      if (productGroupRef.current === productGroup) productGroupRef.current = null;
      if (helperGroupRef.current === helperGroup) helperGroupRef.current = null;
      if (floorRef.current === showroomBase) floorRef.current = null;

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [
    fitCameraToObject,
    compact,
    compactPreviewVisible,
    webglContextLost,
    compactSnapshotUrl,
  ]);

  useEffect(() => {
    const productGroup = productGroupRef.current;
    const helperGroup = helperGroupRef.current;
    const floor = floorRef.current;

    if (!productGroup || !helperGroup) return;

    disposeObjectTree(productGroup);
    disposeObjectTree(helperGroup);

    if (!sceneData.components.length) return;

    const worldW = sceneData.worldSize?.w || 6400;
    const worldH = sceneData.worldSize?.h || 3200;
    const worldD = sceneData.worldSize?.d || 5200;

    sceneData.components.forEach((component) => {
      const object3D = buildRenderableObject(component);

      const x = component.x + component.width / 2 - worldW / 2;
      const y = worldH / 2 - (component.y + component.height / 2);
      const z = component.z + component.depth / 2 - worldD / 2;

      object3D.position.set(x, y, z);
      object3D.rotation.set(
        THREE.MathUtils.degToRad(component.rotationX || 0),
        THREE.MathUtils.degToRad(component.rotationY || 0),
        THREE.MathUtils.degToRad(component.rotationZ || 0),
      );

      productGroup.add(object3D);
    });

    const scaleX =
      displayBounds?.width && sceneData.bounds?.width
        ? displayBounds.width / sceneData.bounds.width
        : 1;

    const scaleY =
      displayBounds?.height && sceneData.bounds?.height
        ? displayBounds.height / sceneData.bounds.height
        : 1;

    const scaleZ =
      displayBounds?.depth && sceneData.bounds?.depth
        ? displayBounds.depth / sceneData.bounds.depth
        : 1;

    productGroup.scale.set(
      Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
      Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1,
      Number.isFinite(scaleZ) && scaleZ > 0 ? scaleZ : 1,
    );

    productGroup.updateMatrixWorld(true);

    let productBox = new THREE.Box3().setFromObject(productGroup);
    const center = new THREE.Vector3();
    productBox.getCenter(center);

    productGroup.position.set(-center.x, -productBox.min.y, -center.z);
    productGroup.updateMatrixWorld(true);

    productBox = new THREE.Box3().setFromObject(productGroup);

    const size = productBox.getSize(new THREE.Vector3());
    const boxCenter = productBox.getCenter(new THREE.Vector3());

    const contactShadow = makeSoftContactShadow();
    contactShadow.scale.set(
      Math.max(280, size.x * 1.08),
      Math.max(220, size.z * 1.08),
      1,
    );
    contactShadow.position.set(boxCenter.x, 2, boxCenter.z);
    helperGroup.add(contactShadow);

    if (showHuman && viewPreset !== "top") {
      const human = makeHumanReference(
        Math.max(1200, Math.min(2300, Number(humanHeightMm) || 1700)),
        Math.max(0.75, Math.min(1.35, Number(humanBuild) || 1)),
      );

      human.position.set(
        productBox.max.x + Math.max(160, size.x * 0.08),
        0,
        productBox.max.z - Math.max(80, size.z * 0.08),
      );

      helperGroup.add(human);
    }

    if (floor) {
      floor.visible = !compact && viewPreset === "iso";
    }

    fitCameraToObject(viewPresetRef.current);

    if (compact && !webglContextLost) {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;

      if (renderer && scene && camera) {
        try {
          renderer.render(scene, camera);

          // WISDOM CAPTURE COMPACT RUNTIME PREVIEW V1.0.5
          // Generated from the real Three.js furniture scene; never from
          // blueprint.thumbnail_url / preview_image_url.
          const runtimeFrame = renderer.domElement.toDataURL(
            "image/webp",
            0.9,
          );
          if (
            runtimeFrame &&
            runtimeFrame.startsWith("data:image/") &&
            runtimeFrame.length > 100
          ) {
            setCompactSnapshotUrl(runtimeFrame);
            writeGeneratedCompactPreview(
              compactPreviewCacheKey,
              runtimeFrame,
            );
          }
        } catch (error) {
          console.warn("[customer-blueprint compact render]", error);
          setWebglContextLost(true);
        }
      }
    }
  }, [
    sceneData,
    displayBounds,
    showHuman,
    humanHeightMm,
    humanBuild,
    viewPreset,
    fitCameraToObject,
    compact,
    compactPreviewVisible,
    webglContextLost,
    compactPreviewCacheKey,
  ]);

  const exactAdmin3D = useMemo(
    () => hasExactAdmin3DSource(blueprint),
    [blueprint],
  );

  // WISDOM COMPACT REAL-FURNITURE PREVIEW HOTFIX V1
  const has3D =
    exactAdmin3D &&
    Array.isArray(sceneData.components) &&
    sceneData.components.length > 0 &&
    sceneData.bounds &&
    sceneData.bounds.width > 20 &&
    sceneData.bounds.height > 20 &&
    (compact
      ? sceneData.bounds.depth >= 1
      : sceneData.bounds.depth > 20);

  return (
    <div
      ref={previewHostRef}
      className="cust-viewer-card"
      style={
        compact
          ? {
              minHeight: compactHeight,
              border: "none",
              borderRadius: 0,
              background: "#f7f2ea",
              boxShadow: "none",
            }
          : undefined
      }
    >
      {!compact ? (
        <div className="cust-viewer-toolbar">
          <div className="cust-viewer-toolbar-left">
            <span className="cust-viewer-chip">
              {readOnly ? "Template Preview" : "Live Preview"}
            </span>
            <span className="cust-viewer-chip cust-viewer-chip-muted">
              {formatMm(displayBounds?.width)} × {formatMm(displayBounds?.height)} ×{" "}
              {formatMm(displayBounds?.depth)}
            </span>
          </div>

          <div className="cust-viewer-toolbar-right">
            {["iso", "front", "left", "top"].map((preset) => (
              <button
                key={preset}
                type="button"
                className={`cust-viewer-btn ${viewPreset === preset ? "active" : ""}`}
                onClick={() => setViewPreset(preset)}
              >
                {preset === "iso"
                  ? "Iso"
                  : preset === "front"
                    ? "Front"
                    : preset === "left"
                      ? "Left"
                      : "Top"}
              </button>
            ))}

            <button
              type="button"
              className={`cust-viewer-btn ${showHuman ? "active" : ""}`}
              onClick={() => setShowHuman((value) => !value)}
            >
              Human
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="cust-viewer-stage"
        style={compact ? { minHeight: compactHeight, background: "#f7f2ea" } : undefined}
      >
        {has3D && compact && compactSnapshotUrl ? (
          <img
            src={compactSnapshotUrl}
            alt=""
            aria-hidden="true"
            className="cust-viewer-runtime-snapshot"
            style={{
              display: "block",
              width: "100%",
              height: compactHeight,
              objectFit: "contain",
              background: "#f7f2ea",
            }}
          />
        ) : has3D &&
        (!compact || compactPreviewVisible) &&
        !webglContextLost ? (
          <div
            ref={mountRef}
            className="cust-viewer-canvas"
            style={compact ? { height: compactHeight } : undefined}
          />
        ) : has3D && compact && !compactPreviewVisible ? (
          <div
            className="cust-viewer-empty"
            style={{ minHeight: compactHeight, padding: 0, background: "#f7f2ea" }}
            aria-hidden="true"
          />
        ) : !compact && sceneData?.thumbnail_url && !fallbackImageError ? (
          <div
            className="cust-viewer-fallback"
            style={compact ? { minHeight: compactHeight, padding: 0 } : undefined}
          >
            <img
              src={resolveAsset(sceneData.thumbnail_url)}
              alt={sceneData.title}
              className="cust-viewer-fallback-img"
              style={compact ? { height: compactHeight, borderRadius: 0 } : undefined}
              loading="lazy"
              decoding="async"
              onError={() => setFallbackImageError(true)}
            />
            {!compact ? (
              <div className="cust-viewer-fallback-note">
                No exact admin-saved 3D scene found for this template yet. Showing the saved admin thumbnail instead.
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="cust-viewer-empty"
            style={
              compact
                ? {
                    minHeight: compactHeight,
                    padding: 0,
                    background: "#f7f2ea",
                  }
                : undefined
            }
          >
            {!compact ? (
              <>
                <div className="cust-viewer-empty-icon">—</div>
                <div>No 3D preview available yet</div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {!compact && showHumanControls ? (
        <div className="cust-viewer-controls">
          <label className="cust-viewer-range">
            <span>Human Height</span>
            <input
              type="range"
              min="1200"
              max="2300"
              step="10"
              value={humanHeightMm}
              onChange={(e) => setHumanHeightMm(Number(e.target.value) || 1700)}
            />
            <small>{Math.round(humanHeightMm)} mm</small>
          </label>

          <label className="cust-viewer-range">
            <span>Human Build</span>
            <input
              type="range"
              min="0.75"
              max="1.35"
              step="0.01"
              value={humanBuild}
              onChange={(e) => setHumanBuild(Number(e.target.value) || 1)}
            />
            <small>{humanBuild.toFixed(2)}× body scale</small>
          </label>
        </div>
      ) : null}

      {!compact ? (
        <div className="cust-viewer-help">
          Drag to rotate • Scroll to zoom • Human scale is only a visual reference
        </div>
      ) : null}
    </div>
  );
}