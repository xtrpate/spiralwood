import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { createFurnitureObject } from "../blueprints/3d/createFurnitureObjects";
import { WOOD_FINISHES } from "../blueprints/data/furnitureTypes";
import { applyWoodFinish } from "../blueprints/data/componentUtils";

const WORLD_W = 6400;
const WORLD_H = 3200;
const WORLD_D = 5200;
const FLOOR_OFFSET = 40;
const MAX_HISTORY = 60;
const SELECTION_COLOR = 0x38bdf8;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const isHexColor = (value) => HEX_COLOR_RE.test(String(value || "").trim());

const getSolidColorHex = (component = {}) => {
  const candidates = [
    component?.fill,
    component?.color,
    component?.finish_color,
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (isHexColor(text)) return text;
  }
  return "";
};

const applySolidColorOverride = (object3d, hex) => {
  if (!object3d || !isHexColor(hex)) return;

  object3d.traverse((child) => {
    if (!child?.isMesh || !child.material) return;
    const patchMaterial = (material) => {
      if (!material) return material;
      const cloned = material.clone();
      cloned.map = null;
      cloned.normalMap = null;
      cloned.roughnessMap = null;
      cloned.metalnessMap = null;
      if (cloned.color) cloned.color = new THREE.Color(hex);
      cloned.needsUpdate = true;
      return cloned;
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map(patchMaterial);
    } else {
      child.material = patchMaterial(child.material);
    }
  });
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clampNumber = (value, min, max) => {
  let next = toNum(value, min || 0);
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  return next;
};

const cloneDeep = (value) => JSON.parse(JSON.stringify(value ?? null));

const buildBoundsFromComponents = (items = []) => {
  if (!Array.isArray(items) || !items.length) {
    return { width_mm: 0, height_mm: 0, depth_mm: 0 };
  }
  const normalized = items
    .map((item) => ({
      x: toNum(item?.x, 0),
      y: toNum(item?.y, 0),
      z: toNum(item?.z, 0),
      width: Math.max(1, toNum(item?.width, 0)),
      height: Math.max(1, toNum(item?.height, 0)),
      depth: Math.max(1, toNum(item?.depth, 0)),
    }))
    .filter((item) => item.width > 0 && item.height > 0 && item.depth > 0);

  if (!normalized.length) return { width_mm: 0, height_mm: 0, depth_mm: 0 };

  const minX = Math.min(...normalized.map((c) => c.x));
  const minY = Math.min(...normalized.map((c) => c.y));
  const minZ = Math.min(...normalized.map((c) => c.z));
  const maxX = Math.max(...normalized.map((c) => c.x + c.width));
  const maxY = Math.max(...normalized.map((c) => c.y + c.height));
  const maxZ = Math.max(...normalized.map((c) => c.z + c.depth));

  return {
    width_mm: Math.max(1, Math.round(maxX - minX)),
    height_mm: Math.max(1, Math.round(maxY - minY)),
    depth_mm: Math.max(1, Math.round(maxZ - minZ)),
  };
};

const getComponentExtents = (items = []) => {
  if (!Array.isArray(items) || !items.length) return null;
  const normalized = items
    .map((item) => ({
      x: toNum(item?.x, 0),
      y: toNum(item?.y, 0),
      z: toNum(item?.z, 0),
      width: Math.max(1, toNum(item?.width, 0)),
      height: Math.max(1, toNum(item?.height, 0)),
      depth: Math.max(1, toNum(item?.depth, 0)),
    }))
    .filter((item) => item.width > 0 && item.height > 0 && item.depth > 0);

  if (!normalized.length) return null;
  const minX = Math.min(...normalized.map((c) => c.x));
  const minY = Math.min(...normalized.map((c) => c.y));
  const minZ = Math.min(...normalized.map((c) => c.z));
  const maxX = Math.max(...normalized.map((c) => c.x + c.width));
  const maxY = Math.max(...normalized.map((c) => c.y + c.height));
  const maxZ = Math.max(...normalized.map((c) => c.z + c.depth));

  return { minX, minY, minZ, maxX, maxY, maxZ };
};

const normalizeDimensions = (source = {}) => ({
  width_mm: toNum(source?.width_mm ?? source?.width ?? source?.w, 0),
  height_mm: toNum(source?.height_mm ?? source?.height ?? source?.h, 0),
  depth_mm: toNum(source?.depth_mm ?? source?.depth ?? source?.d, 0),
});

const summarizeMetadata = (items = []) => {
  const first = Array.isArray(items) ? items.find(Boolean) : null;
  return {
    wood_type: String(first?.material || "").trim(),
    finish_color: String(
      first?.finish_id ||
        first?.woodFinish ||
        first?.finish ||
        first?.fill ||
        "",
    ).trim(),
    hardware: "",
    door_style: "",
  };
};

const getFinishPreviewColor = (finishId, fallback = "") => {
  const match = Array.isArray(WOOD_FINISHES)
    ? WOOD_FINISHES.find((item) => item.id === finishId)
    : null;
  return (
    match?.color ||
    match?.hex ||
    match?.previewColor ||
    match?.baseColor ||
    fallback ||
    ""
  );
};

const getPartAxisLabels = (comp) => {
  const text = `${comp?.label || ""} ${comp?.type || ""}`.toLowerCase();
  const flatKeywords = [
    "panel",
    "seat",
    "shelf",
    "top",
    "slat",
    "rail",
    "board",
    "surface",
  ];
  const looksFlat = flatKeywords.some((keyword) => text.includes(keyword));
  return {
    width: "Width",
    height: looksFlat ? "Thickness" : "Height",
    depth: "Depth",
  };
};

const normalizeViewerComponent = (comp = {}) => {
  const fill = String(comp?.fill ?? comp?.color ?? "").trim();
  const color = String(comp?.color ?? comp?.fill ?? "").trim();
  const finish = String(
    comp?.finish ?? comp?.finish_id ?? comp?.woodFinish ?? "",
  ).trim();
  const finishColor = String(comp?.finish_color ?? color ?? fill ?? "").trim();

  const colorMode =
    String(comp?.color_mode || "").trim() ||
    (isHexColor(fill || color || finishColor) && !finish
      ? "solid"
      : finish
        ? "wood"
        : "");

  return {
    ...comp,
    id: comp?.id ?? `comp_${Math.random().toString(36).slice(2, 10)}`,
    x: toNum(comp?.x, 0),
    y: toNum(comp?.y, 0),
    z: toNum(comp?.z, 0),
    width: Math.max(1, toNum(comp?.width ?? comp?.width_mm, 1)),
    height: Math.max(1, toNum(comp?.height ?? comp?.height_mm, 1)),
    depth: Math.max(1, toNum(comp?.depth ?? comp?.depth_mm, 1)),
    rotationX: toNum(comp?.rotationX, 0),
    rotationY: toNum(comp?.rotationY, 0),
    rotationZ: toNum(comp?.rotationZ, 0),
    fill: fill || (isHexColor(finishColor) ? finishColor : "#d9c2a5"),
    color: color || fill || (isHexColor(finishColor) ? finishColor : ""),
    finish,
    finish_id: String(comp?.finish_id ?? finish).trim(),
    woodFinish: String(comp?.woodFinish ?? finish).trim(),
    finish_color: finishColor,
    color_mode: colorMode,
    material:
      String(comp?.material || comp?.wood_type || "Marine Plywood").trim() ||
      "Marine Plywood",
    label: comp?.label || comp?.name || comp?.type || "Part", // Fallback label
  };
};

const normalizeViewerComponents = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => normalizeViewerComponent(item))
    .filter(
      (item) =>
        Number.isFinite(item.x) &&
        Number.isFinite(item.y) &&
        Number.isFinite(item.z) &&
        Number.isFinite(item.width) &&
        Number.isFinite(item.height) &&
        Number.isFinite(item.depth) &&
        item.width > 0 &&
        item.height > 0 &&
        item.depth > 0,
    );

export default function Customer3DViewer({
  initialComponents = [],
  initialDimensions = null,
  customizationRules = {},
  isCustomizable = true,
  readOnly = false,
  applyLabel = "Add to Custom Cart",
  commentsLabel = "Additional Comments",
  commentsPlaceholder = "Optional notes for this custom draft...",
  referencePhotos = [],
  uploadError = "",
  onPickReferencePhotos,
  onRemoveReferencePhoto,
  onApply,
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const orbitRef = useRef(null);
  const rootGroupRef = useRef(null);
  const personGroupRef = useRef(null);
  const boundsBoxRef = useRef(new THREE.Box3());
  const selectionHelpersRef = useRef([]);

  const canvasSizeRef = useRef({ width: 1, height: 1 });
  const labelWRef = useRef(null);
  const labelHRef = useRef(null);
  const labelDRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });

  const [components, setComponents] = useState(() =>
    normalizeViewerComponents(initialComponents),
  );
  const [selectedCompIds, setSelectedCompIds] = useState([]);

  const [unit, setUnit] = useState("cm");
  const [showPerson, setShowPerson] = useState(true);
  const [personHeightMm, setPersonHeightMm] = useState(1700);
  const [selectionMode, setSelectionMode] = useState(false);
  const [activeView, setActiveView] = useState("3D");
  const [customHex, setCustomHex] = useState("#1e293b");

  const [quantity, setQuantity] = useState(1);
  const [comments, setComments] = useState("");

  const [overallDrafts, setOverallDrafts] = useState({
    width: "",
    height: "",
    depth: "",
  });
  const [partDrafts, setPartDrafts] = useState({
    width: "",
    height: "",
    depth: "",
  });

  // 👉 AUTO-GROUPING FOR SHORTCUT BUTTONS
  const partGroups = useMemo(() => {
    const groups = [];
    components.forEach((c) => {
      const existing = groups.find(
        (g) =>
          Math.abs(g.width - c.width) < 1 &&
          Math.abs(g.height - c.height) < 1 &&
          Math.abs(g.depth - c.depth) < 1 &&
          g.material === c.material,
      );
      if (existing) {
        existing.ids.push(c.id);
      } else {
        groups.push({
          label: c.label,
          width: c.width,
          height: c.height,
          depth: c.depth,
          material: c.material,
          ids: [c.id],
        });
      }
    });
    return groups;
  }, [components]);

  const pushHistorySnapshot = useCallback((snapshot) => {
    historyRef.current.past.push(cloneDeep(snapshot));
    if (historyRef.current.past.length > MAX_HISTORY) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
  }, []);

  const handleUndo = useCallback(() => {
    if (!historyRef.current.past.length || readOnly) return;
    const currentSnapshot = cloneDeep(components);
    const previousSnapshot = historyRef.current.past.pop();
    historyRef.current.future.unshift(currentSnapshot);
    setComponents(normalizeViewerComponents(previousSnapshot));
  }, [components, readOnly]);

  const handleRedo = useCallback(() => {
    if (!historyRef.current.future.length || readOnly) return;
    const currentSnapshot = cloneDeep(components);
    const nextSnapshot = historyRef.current.future.shift();
    historyRef.current.past.push(currentSnapshot);
    setComponents(normalizeViewerComponents(nextSnapshot));
  }, [components, readOnly]);

  const commitComponents = useCallback(
    (updater) => {
      setComponents((prev) => {
        const prevNormalized = normalizeViewerComponents(prev);
        const nextRaw =
          typeof updater === "function" ? updater(prevNormalized) : updater;
        const nextNormalized = normalizeViewerComponents(nextRaw);
        pushHistorySnapshot(prevNormalized);
        return nextNormalized;
      });
    },
    [pushHistorySnapshot],
  );

  const convertMmToUnit = useCallback((mmVal, targetUnit) => {
    if (!mmVal) return "";
    if (targetUnit === "cm") return (mmVal / 10).toFixed(1);
    if (targetUnit === "m") return (mmVal / 1000).toFixed(2);
    if (targetUnit === "inches") return (mmVal / 25.4).toFixed(1);
    if (targetUnit === "ft") return (mmVal / 304.8).toFixed(2);
    if (targetUnit === "yd") return (mmVal / 914.4).toFixed(2);
    return Math.round(mmVal).toString();
  }, []);

  const convertUnitToMm = useCallback((unitVal, currentUnit) => {
    const num = parseFloat(unitVal);
    if (isNaN(num)) return 0;
    if (currentUnit === "cm") return num * 10;
    if (currentUnit === "m") return num * 1000;
    if (currentUnit === "inches") return num * 25.4;
    if (currentUnit === "ft") return num * 304.8;
    if (currentUnit === "yd") return num * 914.4;
    return num;
  }, []);

  const formatUnitLabel = useCallback(
    (mmVal) => {
      return `${convertMmToUnit(mmVal, unit)} ${unit}`;
    },
    [unit, convertMmToUnit],
  );

  const editable = useMemo(
    () => ({
      width: customizationRules?.editable?.width !== false,
      height: customizationRules?.editable?.height !== false,
      depth: customizationRules?.editable?.depth !== false,
      finish_color: customizationRules?.editable?.finish_color !== false,
      comments: customizationRules?.editable?.comments !== false,
      quantity: customizationRules?.editable?.quantity !== false,
    }),
    [customizationRules],
  );

  const overallBounds = useMemo(() => {
    const current = buildBoundsFromComponents(components);
    if (current.width_mm > 0 || current.height_mm > 0 || current.depth_mm > 0)
      return current;
    return normalizeDimensions(initialDimensions || {});
  }, [components, initialDimensions]);

  const selectedGroup = useMemo(() => {
    if (!selectedCompIds.length) return [];
    return components.filter((c) => selectedCompIds.includes(c.id));
  }, [components, selectedCompIds]);

  const sampleSelectedPart = selectedGroup[0] || null;

  useEffect(() => {
    setOverallDrafts({
      width: convertMmToUnit(overallBounds.width_mm, unit),
      height: convertMmToUnit(overallBounds.height_mm, unit),
      depth: convertMmToUnit(overallBounds.depth_mm, unit),
    });

    if (sampleSelectedPart) {
      setPartDrafts({
        width: convertMmToUnit(sampleSelectedPart.width, unit),
        height: convertMmToUnit(sampleSelectedPart.height, unit),
        depth: convertMmToUnit(sampleSelectedPart.depth, unit),
      });
    }
  }, [overallBounds, sampleSelectedPart, unit, convertMmToUnit]);

  // THREE.JS INIT
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    canvasSizeRef.current = { width: w, height: h };

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f8fafc");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.5, 12000);
    camera.position.set(1500, 1000, 1500);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(1000, 2000, 1000);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 1.1);
    fillLight.position.set(-1500, 600, -1500);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.ShadowMaterial({ opacity: 0.14 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -(WORLD_H / 2) + FLOOR_OFFSET - 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const personGroup = new THREE.Group();
    scene.add(personGroup);
    personGroupRef.current = personGroup;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.06;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.minDistance = 500;
    orbit.maxDistance = 5000;
    orbit.target.set(0, 0, 0);
    orbitRef.current = orbit;

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);
    rootGroupRef.current = rootGroup;

    const handleResize = () => {
      if (!mountRef.current) return;
      const newW = Math.max(1, mountRef.current.clientWidth);
      const newH = Math.max(1, mountRef.current.clientHeight);
      canvasSizeRef.current = { width: newW, height: newH };
      renderer.setSize(newW, newH);
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);

      if (boundsBoxRef.current && !boundsBoxRef.current.isEmpty()) {
        const box = boundsBoxRef.current;
        const cWidth = canvasSizeRef.current.width;
        const cHeight = canvasSizeRef.current.height;
        const offset = 100;

        const pW = new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.min.y,
          box.max.z + offset,
        );
        const pH = new THREE.Vector3(
          box.max.x + offset,
          (box.min.y + box.max.y) / 2,
          box.max.z,
        );
        const pD = new THREE.Vector3(
          box.max.x + offset,
          box.min.y,
          (box.min.z + box.max.z) / 2,
        );

        const updateDiv = (divRef, vec) => {
          if (!divRef.current) return;
          const projected = vec.clone().project(camera);

          if (projected.z > 1) {
            divRef.current.style.display = "none";
            return;
          }
          divRef.current.style.display = "block";
          const x = (projected.x * 0.5 + 0.5) * cWidth;
          const y = (-projected.y * 0.5 + 0.5) * cHeight;
          divRef.current.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        };

        updateDiv(labelWRef, pW);
        updateDiv(labelHRef, pH);
        updateDiv(labelDRef, pD);
      }
    };
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      orbit.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 👉 SEPARATE EFFECT FOR SELECTION CLICKS
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current || !rootGroupRef.current)
      return;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const rootGroup = rootGroupRef.current;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let startX = 0;
    let startY = 0;

    const onPointerDown = (e) => {
      startX = e.clientX;
      startY = e.clientY;
    };
    const onPointerUp = (event) => {
      if (!selectionMode || readOnly) return;

      const dragDist = Math.hypot(
        event.clientX - startX,
        event.clientY - startY,
      );
      if (dragDist > 5) return; // User was spinning the camera

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(rootGroup.children, true);

      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData?.id && obj.parent) {
          obj = obj.parent;
        }

        if (obj?.userData?.id) {
          const clickedId = obj.userData.id;
          const target = components.find((c) => c.id === clickedId);
          if (target) {
            // Find Siblings
            const siblings = components.filter(
              (c) =>
                Math.abs(c.width - target.width) < 1 &&
                Math.abs(c.height - target.height) < 1 &&
                Math.abs(c.depth - target.depth) < 1 &&
                c.material === target.material,
            );
            setSelectedCompIds(siblings.map((s) => s.id));
          }
        }
      } else {
        setSelectedCompIds([]); // Clicked empty space
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    return () => {
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
    };
  }, [selectionMode, readOnly, components]);

  // BUILD 3D OBJECTS (Runs ONLY when components change, stops disappearing bug)
  useEffect(() => {
    const rootGroup = rootGroupRef.current;
    if (!rootGroup) return;

    while (rootGroup.children.length) {
      const child = rootGroup.children[0];
      rootGroup.remove(child);
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
    }

    const dummySelectable = [];
    const boundsBox = new THREE.Box3();
    const safeComponents = normalizeViewerComponents(components);

    safeComponents.forEach((comp) => {
      try {
        const obj = createFurnitureObject(comp, false, false, dummySelectable);
        if (!obj) return;

        obj.userData.id = comp.id;
        obj.traverse((child) => {
          if (child.isMesh) child.userData.id = comp.id;
        });

        const solidHex = getSolidColorHex(comp);
        if (
          solidHex &&
          (comp?.color_mode === "solid" ||
            (!comp?.finish && !comp?.finish_id && !comp?.woodFinish))
        ) {
          applySolidColorOverride(obj, solidHex);
        }

        const localX = comp.x + comp.width / 2 - WORLD_W / 2;
        const localY = WORLD_H / 2 - (comp.y + comp.height / 2);
        const localZ = comp.z + comp.depth / 2 - WORLD_D / 2;

        obj.position.set(localX, localY, localZ);
        obj.rotation.set(
          THREE.MathUtils.degToRad(comp.rotationX || 0),
          THREE.MathUtils.degToRad(comp.rotationY || 0),
          THREE.MathUtils.degToRad(comp.rotationZ || 0),
        );

        rootGroup.add(obj);
        boundsBox.expandByObject(obj);
      } catch (error) {
        console.error("Customer3DViewer render failed:", comp, error);
      }
    });

    boundsBoxRef.current.copy(boundsBox);

    if (!boundsBox.isEmpty()) {
      const offset = 100;
      const tick = 25;
      const linePoints = [];

      linePoints.push(
        boundsBox.min.x,
        boundsBox.min.y,
        boundsBox.max.z + offset,
      );
      linePoints.push(
        boundsBox.max.x,
        boundsBox.min.y,
        boundsBox.max.z + offset,
      );
      linePoints.push(
        boundsBox.min.x,
        boundsBox.min.y,
        boundsBox.max.z + offset - tick,
      );
      linePoints.push(
        boundsBox.min.x,
        boundsBox.min.y,
        boundsBox.max.z + offset + tick,
      );
      linePoints.push(
        boundsBox.max.x,
        boundsBox.min.y,
        boundsBox.max.z + offset - tick,
      );
      linePoints.push(
        boundsBox.max.x,
        boundsBox.min.y,
        boundsBox.max.z + offset + tick,
      );

      linePoints.push(
        boundsBox.max.x + offset,
        boundsBox.min.y,
        boundsBox.max.z,
      );
      linePoints.push(
        boundsBox.max.x + offset,
        boundsBox.max.y,
        boundsBox.max.z,
      );
      linePoints.push(
        boundsBox.max.x + offset - tick,
        boundsBox.min.y,
        boundsBox.max.z,
      );
      linePoints.push(
        boundsBox.max.x + offset + tick,
        boundsBox.min.y,
        boundsBox.max.z,
      );
      linePoints.push(
        boundsBox.max.x + offset - tick,
        boundsBox.max.y,
        boundsBox.max.z,
      );
      linePoints.push(
        boundsBox.max.x + offset + tick,
        boundsBox.max.y,
        boundsBox.max.z,
      );

      linePoints.push(
        boundsBox.max.x + offset,
        boundsBox.min.y,
        boundsBox.min.z,
      );
      linePoints.push(
        boundsBox.max.x + offset,
        boundsBox.min.y,
        boundsBox.max.z,
      );
      linePoints.push(
        boundsBox.max.x + offset - tick,
        boundsBox.min.y,
        boundsBox.min.z,
      );
      linePoints.push(
        boundsBox.max.x + offset + tick,
        boundsBox.min.y,
        boundsBox.min.z,
      );
      linePoints.push(
        boundsBox.max.x + offset - tick,
        boundsBox.min.y,
        boundsBox.max.z,
      );
      linePoints.push(
        boundsBox.max.x + offset + tick,
        boundsBox.min.y,
        boundsBox.max.z,
      );

      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(linePoints, 3),
      );
      const lineMat = new THREE.LineBasicMaterial({ color: 0x334155 });
      const dimensionLines = new THREE.LineSegments(lineGeo, lineMat);
      rootGroup.add(dimensionLines);
    }
  }, [components]); // 👉 Separated to stop disappearing bug

  // 👉 SEPARATE EFFECT JUST FOR HIGHLIGHTS
  useEffect(() => {
    if (!sceneRef.current || !rootGroupRef.current) return;

    selectionHelpersRef.current.forEach((h) => {
      sceneRef.current.remove(h);
      if (h.geometry) h.geometry.dispose();
      if (h.material) h.material.dispose();
    });
    selectionHelpersRef.current = [];

    if (!selectedCompIds.length) return;

    selectedCompIds.forEach((id) => {
      let target = null;
      rootGroupRef.current.traverse((child) => {
        if (child.userData?.id === id && !target) target = child;
      });

      if (target) {
        const helper = new THREE.BoxHelper(target, SELECTION_COLOR);
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.material.opacity = 0.95;
        helper.renderOrder = 999;
        sceneRef.current.add(helper);
        selectionHelpersRef.current.push(helper);
      }
    });
  }, [selectedCompIds, components]);

  // BUILD THE PERSON
  useEffect(() => {
    if (!personGroupRef.current || !rootGroupRef.current) return;
    const group = personGroupRef.current;
    group.clear();

    if (!showPerson || components.length === 0) return;

    const personHeight = clampNumber(personHeightMm, 1200, 2300);
    const floorY = -(WORLD_H / 2) + FLOOR_OFFSET;

    const headRadius = Math.max(70, Math.round(personHeight * 0.065));
    const neckHeight = Math.max(18, Math.round(personHeight * 0.02));
    const torsoHeight = Math.max(260, Math.round(personHeight * 0.33));
    const hipHeight = Math.max(18, Math.round(personHeight * 0.02));
    const legHeight = Math.max(
      280,
      Math.round(
        personHeight -
          (headRadius * 2 + neckHeight + torsoHeight + hipHeight + 24),
      ),
    );

    const shoulderWidth = Math.max(180, Math.round(personHeight * 0.16));
    const torsoDepth = Math.max(110, Math.round(personHeight * 0.08));
    const legWidth = Math.max(55, Math.round(personHeight * 0.032));
    const legDepth = Math.max(55, Math.round(personHeight * 0.032));
    const legGap = Math.max(26, Math.round(shoulderWidth * 0.18));
    const footWidth = legWidth + 24;
    const footHeight = 24;
    const footDepth = legDepth + 90;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.95,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.95,
    });
    const footMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 1,
    });

    const leftFoot = new THREE.Mesh(
      new THREE.BoxGeometry(footWidth, footHeight, footDepth),
      footMat,
    );
    leftFoot.position.set(
      -(legGap / 2 + legWidth / 2),
      floorY + footHeight / 2,
      footDepth * 0.08,
    );

    const rightFoot = new THREE.Mesh(
      new THREE.BoxGeometry(footWidth, footHeight, footDepth),
      footMat,
    );
    rightFoot.position.set(
      legGap / 2 + legWidth / 2,
      floorY + footHeight / 2,
      footDepth * 0.08,
    );

    const leftLeg = new THREE.Mesh(
      new THREE.BoxGeometry(legWidth, legHeight, legDepth),
      bodyMat,
    );
    leftLeg.position.set(
      -(legGap / 2 + legWidth / 2),
      floorY + footHeight + legHeight / 2,
      0,
    );

    const rightLeg = new THREE.Mesh(
      new THREE.BoxGeometry(legWidth, legHeight, legDepth),
      bodyMat,
    );
    rightLeg.position.set(
      legGap / 2 + legWidth / 2,
      floorY + footHeight + legHeight / 2,
      0,
    );

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(shoulderWidth, torsoHeight, torsoDepth),
      bodyMat,
    );
    torso.position.set(
      0,
      floorY + footHeight + legHeight + hipHeight + torsoHeight / 2,
      0,
    );

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(headRadius, 24, 24),
      headMat,
    );
    head.position.set(
      0,
      floorY +
        footHeight +
        legHeight +
        hipHeight +
        torsoHeight +
        neckHeight +
        headRadius,
      0,
    );

    [leftFoot, rightFoot, leftLeg, rightLeg, torso, head].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    const box = boundsBoxRef.current;
    if (!box.isEmpty()) {
      const furnitureWidth = Math.max(1, box.max.x - box.min.x);
      const gap = Math.max(
        220,
        Math.min(420, Math.round(furnitureWidth * 0.18)),
      );
      group.position.set(
        box.min.x - gap - shoulderWidth / 2,
        0,
        (box.min.z + box.max.z) / 2,
      );
    }
  }, [showPerson, personHeightMm, components]);

  // 👉 RULE 4: CAMERA CONTROLLER (Locks 2D Views & Unlocks the Floor)
  const changeCameraView = (viewMode) => {
    if (
      !boundsBoxRef.current ||
      boundsBoxRef.current.isEmpty() ||
      !cameraRef.current ||
      !orbitRef.current
    )
      return;

    const box = boundsBoxRef.current;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.8 + 500;

    // Lock camera rotation if it's a flat orthographic view
    orbitRef.current.enableRotate = viewMode === "3D";

    if (viewMode === "3D") {
      orbitRef.current.maxPolarAngle = Math.PI / 2 - 0.05; // Puts the floor back
    } else {
      orbitRef.current.maxPolarAngle = Math.PI; // Allows camera to go 100% underneath
    }

    switch (viewMode) {
      case "Front":
        cameraRef.current.position.set(center.x, center.y, center.z + distance);
        break;
      case "Back":
        cameraRef.current.position.set(center.x, center.y, center.z - distance);
        break;
      case "Side":
        cameraRef.current.position.set(center.x - distance, center.y, center.z);
        break;
      case "Top":
        // 👉 FIX: Added + 0.1 to Z to prevent Gimbal Lock
        cameraRef.current.position.set(
          center.x,
          center.y + distance,
          center.z + 0.1,
        );
        break;
      case "Bottom":
        // 👉 FIX: Added + 0.1 to Z to prevent Gimbal Lock
        cameraRef.current.position.set(
          center.x,
          center.y - distance,
          center.z + 0.1,
        );
        break;
      case "3D":
      default:
        cameraRef.current.position.set(
          center.x + distance * 0.8,
          center.y + distance * 0.6,
          center.z + distance * 0.8,
        );
        break;
    }

    orbitRef.current.target.copy(center);
    orbitRef.current.update();
    setActiveView(viewMode);
  };

  const handleOverallDraftChange = (axis, value) => {
    setOverallDrafts((prev) => ({ ...prev, [axis]: value }));
  };

  const commitOverallDimension = (axis) => {
    if (!isCustomizable || readOnly) return;
    if (!Array.isArray(components) || !components.length) return;

    const rawUnitValue = overallDrafts?.[axis];
    const parsedMmValue = convertUnitToMm(rawUnitValue, unit);

    const currentValueMm =
      axis === "width"
        ? Number(overallBounds.width_mm || 0)
        : axis === "height"
          ? Number(overallBounds.height_mm || 0)
          : Number(overallBounds.depth_mm || 0);

    if (parsedMmValue <= 0 || currentValueMm <= 0) {
      setOverallDrafts((prev) => ({
        ...prev,
        [axis]: String(convertMmToUnit(currentValueMm, unit)),
      }));
      return;
    }

    const nextValueMm = Math.max(1, Math.round(parsedMmValue));
    if (nextValueMm === currentValueMm) return;

    const scale = nextValueMm / currentValueMm;
    const extents = getComponentExtents(components);

    if (!extents || !Number.isFinite(scale) || scale <= 0) return;

    const centerX = (extents.minX + extents.maxX) / 2;
    const centerZ = (extents.minZ + extents.maxZ) / 2;
    const bottomY = extents.maxY;

    commitComponents((prev) =>
      prev.map((c) => {
        if (axis === "width")
          return {
            ...c,
            x: Math.round(centerX + (Number(c.x || 0) - centerX) * scale),
            width: Math.max(1, Math.round(Number(c.width || 0) * scale)),
          };
        if (axis === "height")
          return {
            ...c,
            y: Math.round(bottomY - (bottomY - Number(c.y || 0)) * scale),
            height: Math.max(1, Math.round(Number(c.height || 0) * scale)),
          };
        return {
          ...c,
          z: Math.round(centerZ + (Number(c.z || 0) - centerZ) * scale),
          depth: Math.max(1, Math.round(Number(c.depth || 0) * scale)),
        };
      }),
    );
  };

  const commitPartDimension = (axis, rawUnitValue) => {
    if (!isCustomizable || readOnly || !selectedGroup.length) return;

    const parsedMmValue = convertUnitToMm(rawUnitValue, unit);
    const currentValueMm = Number(sampleSelectedPart?.[axis] || 0);

    if (parsedMmValue <= 0 || currentValueMm <= 0) return;

    const nextValueMm = Math.max(1, Math.round(parsedMmValue));
    if (nextValueMm === currentValueMm) return;

    commitComponents((prev) =>
      prev.map((c) => {
        if (!selectedCompIds.includes(c.id)) return c;
        if (axis === "width")
          return {
            ...c,
            x: c.x - (nextValueMm - c.width) / 2,
            width: nextValueMm,
          };
        if (axis === "height")
          return {
            ...c,
            y: c.y - (nextValueMm - c.height) / 2,
            height: nextValueMm,
          };
        return {
          ...c,
          z: c.z - (nextValueMm - c.depth) / 2,
          depth: nextValueMm,
        };
      }),
    );
  };

  const handleFinishChange = (finishId) => {
    if (!isCustomizable || readOnly || !editable.finish_color) return;
    const targetIds = selectedCompIds.length
      ? selectedCompIds
      : components.map((c) => c.id);

    commitComponents((prev) =>
      prev.map((c) => {
        if (!targetIds.includes(c.id)) return c;

        const next = applyWoodFinish(c, finishId);
        const previewHex = getFinishPreviewColor(
          finishId,
          next?.fill || c.fill || c.color || "",
        );
        return {
          ...c,
          ...next,
          fill: previewHex || next?.fill || c.fill || c.color || "",
          color: previewHex || c.color || c.fill || "",
          finish: finishId || "",
          finish_id: finishId || "",
          woodFinish: finishId || "",
          finish_color: previewHex || c.finish_color || "",
          color_mode: finishId ? "wood" : "",
        };
      }),
    );
  };

  const handleColorChange = (hex) => {
    if (!isCustomizable || readOnly || !editable.finish_color) return;
    setCustomHex(hex);

    const targetIds = selectedCompIds.length
      ? selectedCompIds
      : components.map((c) => c.id);

    commitComponents((prev) =>
      prev.map((c) => {
        if (!targetIds.includes(c.id)) return c;
        return {
          ...c,
          fill: hex,
          color: hex,
          finish_color: hex,
          finish: "",
          finish_id: "",
          woodFinish: "",
          color_mode: "solid",
        };
      }),
    );
  };

  const handleApply = () => {
    if (typeof onApply !== "function") return;
    onApply({
      quantity: Math.max(1, Number(quantity || 1)),
      comments: String(comments || "").trim(),
      bounds: {
        width: overallBounds.width_mm,
        height: overallBounds.height_mm,
        depth: overallBounds.depth_mm,
      },
      defaultDimensions: {
        width_mm: overallBounds.width_mm,
        height_mm: overallBounds.height_mm,
        depth_mm: overallBounds.depth_mm,
      },
      worldSize: { width_mm: WORLD_W, height_mm: WORLD_H, depth_mm: WORLD_D },
      components: cloneDeep(components),
      metadata: summarizeMetadata(components),
    });
  };

  const undoDisabled = !historyRef.current.past.length;
  const redoDisabled = !historyRef.current.future.length;

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <div style={styles.topBarMeta}>
          <div style={styles.topBarEyebrow}>
            {readOnly ? "Approved Template Preview" : "Live Configurator"}
          </div>
          <div style={styles.topBarTitle}>
            {formatUnitLabel(overallBounds.width_mm)} ×{" "}
            {formatUnitLabel(overallBounds.height_mm)} ×{" "}
            {formatUnitLabel(overallBounds.depth_mm)}
          </div>
        </div>

        <div style={styles.topBarActions}>
          {!readOnly ? (
            <div style={styles.compactGroup}>
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoDisabled}
                style={{
                  ...styles.toolBtn,
                  ...(undoDisabled ? styles.toolBtnDisabled : {}),
                }}
              >
                Undo
              </button>

              <button
                type="button"
                onClick={handleRedo}
                disabled={redoDisabled}
                style={{
                  ...styles.toolBtn,
                  ...(redoDisabled ? styles.toolBtnDisabled : {}),
                }}
              >
                Redo
              </button>
            </div>
          ) : null}

          <div style={styles.unitToggleGroup}>
            {["cm", "m", "inches", "ft", "yd", "mm"].map((u, index, arr) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                style={{
                  ...styles.unitBtn,
                  ...(index !== arr.length - 1 ? styles.unitBtnDivider : {}),
                  ...(unit === u ? styles.unitBtnActive : {}),
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.viewerShell}>
        <div style={styles.canvasWrap}>
          <div style={styles.cameraToolbar}>
            {["3D", "Front", "Back", "Side", "Top", "Bottom"].map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => changeCameraView(view)}
                style={{
                  ...styles.cameraBtn,
                  ...(activeView === view ? styles.cameraBtnActive : {}),
                }}
              >
                {view}
              </button>
            ))}
          </div>

          <div ref={mountRef} style={styles.canvasContainer} />

          <div ref={labelWRef} style={styles.floatingLabel}>
            {formatUnitLabel(overallBounds.width_mm)}
          </div>
          <div ref={labelHRef} style={styles.floatingLabel}>
            {formatUnitLabel(overallBounds.height_mm)}
          </div>
          <div ref={labelDRef} style={styles.floatingLabel}>
            {formatUnitLabel(overallBounds.depth_mm)}
          </div>
        </div>

        <aside style={styles.sidebar}>
          <div style={styles.sidebarScroll}>
            <section style={styles.sidebarSection}>
              <div style={styles.sidebarSectionHeader}>
                <div style={styles.sidebarSectionTitle}>Template Configurator</div>
              </div>

              <p style={styles.sidebarSectionNote}>
                Adjust only the admin-approved values. Structure stays based on the
                saved template.
              </p>

              <div style={styles.metricsGrid}>
                <div style={styles.metricCard}>
                  <span style={styles.metricLabel}>Width</span>
                  <strong style={styles.metricValue}>
                    {formatUnitLabel(overallBounds.width_mm)}
                  </strong>
                </div>

                <div style={styles.metricCard}>
                  <span style={styles.metricLabel}>Height</span>
                  <strong style={styles.metricValue}>
                    {formatUnitLabel(overallBounds.height_mm)}
                  </strong>
                </div>

                <div style={styles.metricCard}>
                  <span style={styles.metricLabel}>Depth</span>
                  <strong style={styles.metricValue}>
                    {formatUnitLabel(overallBounds.depth_mm)}
                  </strong>
                </div>
              </div>
            </section>

            <section
              style={{
                ...styles.sidebarSection,
                ...(selectionMode ? styles.sidebarSectionActive : {}),
              }}
            >
              <div style={styles.sectionRow}>
                <label style={styles.label}>Specific Part Editing</label>

                <label style={styles.inlineCheck}>
                  <input
                    type="checkbox"
                    checked={selectionMode}
                    onChange={(e) => {
                      setSelectionMode(e.target.checked);
                      if (!e.target.checked) setSelectedCompIds([]);
                    }}
                  />
                  <span style={selectionMode ? styles.inlineCheckActive : null}>
                    Select Parts
                  </span>
                </label>
              </div>

              {selectionMode ? (
                <>
                  <div style={styles.helperText}>
                    Tap a part in the 3D view, or use the quick-select buttons
                    below.
                  </div>

                  <div style={styles.chipRow}>
                    {partGroups.map((group, index) => {
                      const isSelected =
                        selectedCompIds.length > 0 &&
                        selectedCompIds.includes(group.ids[0]);

                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setSelectedCompIds(group.ids)}
                          style={{
                            ...styles.miniBtn,
                            ...(isSelected ? styles.miniBtnActive : {}),
                          }}
                        >
                          {group.label} ({group.ids.length})
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={styles.helperTextMuted}>
                  Turn this on if you want to edit a repeated group like legs,
                  shelves, or panels instead of scaling the whole furniture.
                </div>
              )}
            </section>

            {selectionMode && selectedGroup.length > 0 && sampleSelectedPart ? (
              <section style={styles.sidebarSection}>
                <div style={styles.sectionRow}>
                  <label style={styles.label}>
                    Editing {selectedGroup.length} Identical Part(s)
                  </label>

                  <button
                    type="button"
                    onClick={() => setSelectedCompIds([])}
                    style={styles.clearBtn}
                  >
                    Clear
                  </button>
                </div>

                <div style={styles.dimensionGrid}>
                  <div style={styles.inputGroup}>
                    <span style={styles.dimLabel}>
                      {getPartAxisLabels(sampleSelectedPart).width}
                    </span>
                    <input
                      type="number"
                      value={partDrafts.width}
                      onChange={(e) =>
                        setPartDrafts((prev) => ({
                          ...prev,
                          width: e.target.value,
                        }))
                      }
                      onBlur={(e) => commitPartDimension("width", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commitPartDimension("width", e.target.value);
                        }
                      }}
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.dimLabel}>
                      {getPartAxisLabels(sampleSelectedPart).height}
                    </span>
                    <input
                      type="number"
                      value={partDrafts.height}
                      onChange={(e) =>
                        setPartDrafts((prev) => ({
                          ...prev,
                          height: e.target.value,
                        }))
                      }
                      onBlur={(e) =>
                        commitPartDimension("height", e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commitPartDimension("height", e.target.value);
                        }
                      }}
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.dimLabel}>
                      {getPartAxisLabels(sampleSelectedPart).depth}
                    </span>
                    <input
                      type="number"
                      value={partDrafts.depth}
                      onChange={(e) =>
                        setPartDrafts((prev) => ({
                          ...prev,
                          depth: e.target.value,
                        }))
                      }
                      onBlur={(e) => commitPartDimension("depth", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commitPartDimension("depth", e.target.value);
                        }
                      }}
                      style={styles.input}
                    />
                  </div>
                </div>
              </section>
            ) : (
              <section style={styles.sidebarSection}>
                <div style={styles.sectionRow}>
                  <label style={styles.label}>Overall Dimensions ({unit})</label>
                  <span style={styles.pill}>Proportional</span>
                </div>

                <div style={styles.dimensionGrid}>
                  <div style={styles.inputGroup}>
                    <span style={styles.dimLabel}>Width</span>
                    <input
                      type="number"
                      value={overallDrafts.width}
                      disabled={!isCustomizable || readOnly}
                      onChange={(e) =>
                        handleOverallDraftChange("width", e.target.value)
                      }
                      onBlur={() => commitOverallDimension("width")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitOverallDimension("width");
                      }}
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.dimLabel}>Height</span>
                    <input
                      type="number"
                      value={overallDrafts.height}
                      disabled={!isCustomizable || readOnly}
                      onChange={(e) =>
                        handleOverallDraftChange("height", e.target.value)
                      }
                      onBlur={() => commitOverallDimension("height")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitOverallDimension("height");
                      }}
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.inputGroup}>
                    <span style={styles.dimLabel}>Depth</span>
                    <input
                      type="number"
                      value={overallDrafts.depth}
                      disabled={!isCustomizable || readOnly}
                      onChange={(e) =>
                        handleOverallDraftChange("depth", e.target.value)
                      }
                      onBlur={() => commitOverallDimension("depth")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitOverallDimension("depth");
                      }}
                      style={styles.input}
                    />
                  </div>
                </div>
              </section>
            )}

            <section
              style={{
                ...styles.sidebarSection,
                ...(readOnly || !editable.finish_color
                  ? styles.sidebarSectionDisabled
                  : {}),
              }}
            >
              <div style={styles.sectionRow}>
                <label style={styles.label}>Finish & Paint</label>
                {selectedGroup.length > 0 ? (
                  <span style={styles.pill}>Applies to selection</span>
                ) : null}
              </div>

              <div style={styles.inputGroup}>
                <span style={styles.dimLabel}>Standard Wood Finish</span>
                <select
                  onChange={(e) => handleFinishChange(e.target.value)}
                  style={styles.input}
                  disabled={readOnly || !editable.finish_color}
                >
                  <option value="">Original / Custom</option>
                  {WOOD_FINISHES?.map((finish) => (
                    <option key={finish.id} value={finish.id}>
                      {finish.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.colorPickerRow}>
                <input
                  type="color"
                  value={customHex}
                  onChange={(e) => handleColorChange(e.target.value)}
                  style={styles.colorPicker}
                  disabled={readOnly || !editable.finish_color}
                />

                <input
                  type="text"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  onBlur={(e) => handleColorChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleColorChange(e.target.value);
                  }}
                  placeholder="#HexCode"
                  style={{ ...styles.input, fontFamily: "monospace" }}
                  disabled={readOnly || !editable.finish_color}
                />
              </div>
            </section>

            <section style={styles.sidebarSection}>
              <div style={styles.sectionRow}>
                <label style={styles.label}>Human Scale Reference</label>

                <label style={styles.inlineCheck}>
                  <input
                    type="checkbox"
                    checked={showPerson}
                    onChange={(e) => setShowPerson(e.target.checked)}
                  />
                  <span>Show</span>
                </label>
              </div>

              {showPerson ? (
                <div style={styles.inputGroup}>
                  <span style={styles.dimLabel}>Height ({unit})</span>
                  <input
                    type="number"
                    step="0.1"
                    value={convertMmToUnit(personHeightMm, unit)}
                    onChange={(e) =>
                      setPersonHeightMm(convertUnitToMm(e.target.value, unit))
                    }
                    style={styles.input}
                  />
                </div>
              ) : null}
            </section>
          </div>

          {!readOnly ? (
            <div style={styles.sidebarFooter}>
              <div style={styles.footerHeader}>
                <div>
                  <div style={styles.footerTitle}>Finalize</div>
                  <div style={styles.footerNote}>
                    Set quantity, upload references, add a message, then add to
                    cart.
                  </div>
                </div>

                <div style={styles.qtyBox}>
                  <button
                    type="button"
                    disabled={!editable.quantity}
                    onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                    style={styles.qtyBtn}
                  >
                    −
                  </button>

                  <strong style={styles.qtyValue}>{quantity}</strong>

                  <button
                    type="button"
                    disabled={!editable.quantity}
                    onClick={() => setQuantity((prev) => Math.max(1, prev + 1))}
                    style={styles.qtyBtn}
                  >
                    +
                  </button>
                </div>
              </div>

              <div style={styles.footerField}>
                <div style={styles.uploadHeader}>
                  <label style={styles.footerLabel}>Reference Photos</label>
                  <span style={styles.uploadHint}>
                    Up to 5 images • JPG / JPEG / PNG / WEBP • 5MB each
                  </span>
                </div>

                <label style={styles.uploadButton}>
                  Upload Photos
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    multiple
                    hidden
                    onChange={onPickReferencePhotos}
                  />
                </label>

                {uploadError ? (
                  <div style={styles.uploadError}>{uploadError}</div>
                ) : null}

                {referencePhotos?.length ? (
                  <div style={styles.photoGrid}>
                    {referencePhotos.map((photo) => (
                      <div key={photo.id} style={styles.photoCard}>
                        <div style={styles.photoThumb}>
                          <img
                            src={photo.data_url}
                            alt={photo.name}
                            style={styles.photoThumbImg}
                          />
                        </div>

                        <div style={styles.photoMeta}>
                          <div style={styles.photoName}>{photo.name}</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveReferencePhoto?.(photo.id)}
                          style={styles.photoRemove}
                          aria-label={`Remove ${photo.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div style={styles.footerField}>
                <label style={styles.footerLabel}>{commentsLabel}</label>
                <textarea
                  rows={4}
                  maxLength={500}
                  value={comments}
                  disabled={!editable.comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={commentsPlaceholder}
                  style={styles.textarea}
                />
              </div>

              <button
                type="button"
                onClick={handleApply}
                style={styles.applyBtn}
              >
                {applyLabel}
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

const styles = {
  root: {
    display: "grid",
    gap: 8,
    minHeight: 0,
    fontFamily: "Montserrat, sans-serif",
  },

  topBar: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 12px",
    border: "1px solid #d9dee4",
    background: "#ffffff",
  },

  topBarMeta: {
    display: "grid",
    gap: 2,
  },

  topBarEyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#6b7280",
  },

  topBarTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#111111",
  },

  topBarActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  compactGroup: {
    display: "flex",
    gap: 6,
  },

  toolBtn: {
    height: 32,
    padding: "0 12px",
    borderRadius: 0,
    border: "1px solid #111111",
    background: "#ffffff",
    color: "#111111",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },

  toolBtnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },

  unitToggleGroup: {
    display: "flex",
    border: "1px solid #111111",
    background: "#ffffff",
  },

  unitBtn: {
    minWidth: 40,
    height: 32,
    padding: "0 10px",
    border: "none",
    background: "#ffffff",
    color: "#111111",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },

  unitBtnDivider: {
    borderRight: "1px solid #d9d9d9",
  },

  unitBtnActive: {
    background: "#111111",
    color: "#ffffff",
  },

  viewerShell: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 340px",
    height: "clamp(640px, 78vh, 820px)",
    minHeight: 640,
    border: "1px solid #d9dee4",
    background: "#ffffff",
    overflow: "hidden",
  },

  canvasWrap: {
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    background: "#f7f7f7",
  },

  canvasContainer: {
    width: "100%",
    height: "100%",
    minHeight: 640,
    backgroundColor: "#f7f7f7",
  },

  cameraToolbar: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 10,
    display: "grid",
    gridTemplateColumns: "repeat(6, auto)",
    gap: 0,
    width: "max-content",
    border: "1px solid #cfcfcf",
    background: "#ffffff",
    boxSizing: "border-box",
  },

  cameraBtn: {
    minWidth: 48,
    height: 34,
    padding: "0 12px",
    border: "none",
    borderRight: "1px solid #cfcfcf",
    background: "#ffffff",
    color: "#111111",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    boxSizing: "border-box",
  },

  cameraBtnActive: {
    background: "#111111",
    color: "#ffffff",
  },

  floatingLabel: {
    position: "absolute",
    left: 0,
    top: 0,
    background: "#ffffff",
    color: "#111111",
    padding: "4px 8px",
    borderRadius: 0,
    fontSize: "11px",
    fontWeight: "700",
    border: "1px solid #111111",
    pointerEvents: "none",
    transform: "translate(-50%, -50%)",
    display: "none",
    whiteSpace: "nowrap",
    zIndex: 10,
  },

  sidebar: {
    minWidth: 0,
    minHeight: 0,
    borderLeft: "1px solid #d9dee4",
    backgroundColor: "#ffffff",
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr) auto",
  },

  sidebarScroll: {
    minHeight: 0,
    overflowY: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  sidebarSection: {
    display: "grid",
    gap: 8,
    padding: 10,
    border: "1px solid #d9dee4",
    background: "#ffffff",
  },

  sidebarSectionActive: {
    borderColor: "#111111",
  },

  sidebarSectionDisabled: {
    opacity: 0.55,
    pointerEvents: "none",
  },

  sidebarSectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  sidebarSectionTitle: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#111111",
  },

  sidebarSectionNote: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.55,
    color: "#525252",
  },

  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  },

  metricCard: {
    padding: "8px 8px 10px",
    border: "1px solid #e5e7eb",
    background: "#fafafa",
    display: "grid",
    gap: 4,
  },

  metricLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#6b7280",
  },

  metricValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "#111111",
  },

  sectionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  label: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#111111",
  },

  inlineCheck: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#444444",
    cursor: "pointer",
  },

  inlineCheckActive: {
    color: "#111111",
    fontWeight: 700,
  },

  helperText: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "#111111",
    border: "1px dashed #cbd5e1",
    background: "#fafafa",
    padding: "8px 10px",
  },

  helperTextMuted: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "#6b7280",
    background: "#fafafa",
    border: "1px solid #ececec",
    padding: "8px 10px",
  },

  chipRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },

  miniBtn: {
    padding: "6px 8px",
    fontSize: 11,
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #d9d9d9",
    borderRadius: 0,
    cursor: "pointer",
    fontWeight: 700,
  },

  miniBtnActive: {
    background: "#111111",
    color: "#ffffff",
    borderColor: "#111111",
  },

  clearBtn: {
    height: 28,
    padding: "0 10px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },

  pill: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#111111",
    background: "#f3f4f6",
    padding: "5px 8px",
    whiteSpace: "nowrap",
  },

  dimensionGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },

  inputGroup: {
    display: "grid",
    gap: 4,
  },

  dimLabel: {
    fontSize: 10,
    color: "#6b7280",
    display: "block",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },

  input: {
    width: "100%",
    height: 38,
    padding: "0 10px",
    borderRadius: 0,
    border: "1px solid #111111",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#111111",
  },

  colorPickerRow: {
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr)",
    gap: 8,
    alignItems: "center",
  },

  colorPicker: {
    width: 44,
    height: 38,
    padding: 0,
    border: "1px solid #111111",
    borderRadius: 0,
    cursor: "pointer",
    overflow: "hidden",
    background: "none",
  },

  sidebarFooter: {
    borderTop: "1px solid #d9dee4",
    background: "#ffffff",
    padding: 12,
    display: "grid",
    gap: 10,
  },

  footerHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },

  footerTitle: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#111111",
  },

  footerNote: {
    fontSize: 11,
    lineHeight: 1.45,
    color: "#6b7280",
    marginTop: 4,
  },

  qtyBox: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    border: "1px solid #111111",
    background: "#ffffff",
    height: 36,
  },

  qtyBtn: {
    width: 34,
    height: 34,
    border: "none",
    background: "#ffffff",
    color: "#111111",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    borderRight: "1px solid #d9d9d9",
  },

  qtyValue: {
    minWidth: 34,
    textAlign: "center",
    fontSize: 14,
    color: "#111111",
    fontWeight: 700,
  },

  footerField: {
    display: "grid",
    gap: 6,
  },

  footerLabel: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#111111",
  },

  uploadHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },

  uploadHint: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: 600,
  },

  uploadButton: {
    minHeight: 38,
    padding: "0 12px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  },

  uploadError: {
    fontSize: 11,
    color: "#b91c1c",
    border: "1px solid #fecaca",
    background: "#fef2f2",
    padding: "8px 10px",
  },

  photoGrid: {
    display: "grid",
    gap: 8,
  },

  photoCard: {
    display: "grid",
    gridTemplateColumns: "48px minmax(0, 1fr) 28px",
    alignItems: "center",
    gap: 8,
    border: "1px solid #e5e7eb",
    background: "#fafafa",
    padding: 6,
  },

  photoThumb: {
    width: 48,
    height: 48,
    overflow: "hidden",
    background: "#ffffff",
    border: "1px solid #d9d9d9",
  },

  photoThumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  photoMeta: {
    minWidth: 0,
  },

  photoName: {
    fontSize: 11,
    fontWeight: 700,
    color: "#111111",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  photoRemove: {
    width: 28,
    height: 28,
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
  },

  textarea: {
    width: "100%",
    minHeight: 86,
    resize: "none",
    borderRadius: 0,
    border: "1px solid #111111",
    padding: 10,
    font: "inherit",
    fontSize: 13,
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#111111",
  },

  applyBtn: {
    height: 46,
    borderRadius: 0,
    border: "1px solid #111111",
    background: "#111111",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    letterSpacing: "0.02em",
  },
};