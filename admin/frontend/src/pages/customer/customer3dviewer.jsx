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
      cloned.aoMap = null;
      cloned.emissiveMap = null;
      cloned.bumpMap = null;
      cloned.alphaMap = null;

      if (cloned.color) {
        cloned.color = new THREE.Color(hex);
      }

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

const uniqueIds = (items = []) => [
  ...new Set((Array.isArray(items) ? items : []).filter(Boolean)),
];

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

  if (!normalized.length) {
    return { width_mm: 0, height_mm: 0, depth_mm: 0 };
  }

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

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
    depth: Math.max(1, Math.round(maxZ - minZ)),
  };
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

const formatMm = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} mm` : "—";
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
    width: "Width (mm)",
    height: looksFlat ? "Thickness (mm)" : "Height (mm)",
    depth: "Depth (mm)",
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

const getComponentFinishValue = (comp = {}) =>
  String(comp?.finish_id || comp?.woodFinish || comp?.finish || "").trim();

const getComponentColorValue = (comp = {}) =>
  String(comp?.fill || comp?.color || "")
    .trim()
    .toLowerCase();

const getSharedSelectionValue = (
  components = [],
  selectedIds = [],
  resolver,
) => {
  if (!selectedIds.length) return "";
  const selected = components.filter((comp) => selectedIds.includes(comp.id));
  const values = [
    ...new Set(selected.map((item) => resolver(item)).filter(Boolean)),
  ];
  return values.length === 1 ? values[0] : "";
};

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
  const selectionHelpersRef = useRef([]);
  const pointerStateRef = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    shiftMode: false,
    moved: false,
  });
  const selectedIdsRef = useRef([]);
  const historyRef = useRef({
    past: [],
    future: [],
  });

  const [components, setComponents] = useState(() =>
    normalizeViewerComponents(initialComponents),
  );
  const [selectedCompIds, setSelectedCompIds] = useState([]);
  const [marqueeRect, setMarqueeRect] = useState(null);

  const [showPerson, setShowPerson] = useState(true);
  const [personHeightInput, setPersonHeightInput] = useState("5.6");

  const [quantity, setQuantity] = useState(1);
  const [comments, setComments] = useState("");

  const [dimensionDrafts, setDimensionDrafts] = useState({
    width: "",
    height: "",
    depth: "",
  });

  const [overallDrafts, setOverallDrafts] = useState({
    width: "",
    height: "",
    depth: "",
  });

  useEffect(() => {
    selectedIdsRef.current = selectedCompIds;
  }, [selectedCompIds]);

  const pushHistorySnapshot = useCallback((snapshot) => {
    historyRef.current.past.push(cloneDeep(snapshot));
    if (historyRef.current.past.length > MAX_HISTORY) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
  }, []);

  const restoreSnapshot = useCallback((snapshot, preferredSelection = []) => {
    const normalized = normalizeViewerComponents(snapshot);

    setComponents(normalized);

    const availableIds = new Set(normalized.map((item) => item.id));
    const nextSelection = uniqueIds(preferredSelection).filter((id) =>
      availableIds.has(id),
    );

    setSelectedCompIds(nextSelection);
  }, []);

  const commitComponents = useCallback(
    (updater, options = {}) => {
      setComponents((prev) => {
        const prevNormalized = normalizeViewerComponents(prev);
        const nextRaw =
          typeof updater === "function" ? updater(prevNormalized) : updater;
        const nextNormalized = normalizeViewerComponents(nextRaw);

        pushHistorySnapshot(prevNormalized);

        const availableIds = new Set(nextNormalized.map((item) => item.id));
        const nextSelectionBase = Array.isArray(options.nextSelectionIds)
          ? options.nextSelectionIds
          : selectedIdsRef.current;

        const filteredSelection = uniqueIds(nextSelectionBase).filter((id) =>
          availableIds.has(id),
        );

        const fallbackSelection =
          filteredSelection.length > 0
            ? filteredSelection
            : options.keepEmptySelection
              ? []
              : nextNormalized[0]
                ? [nextNormalized[0].id]
                : [];

        setSelectedCompIds(fallbackSelection);

        return nextNormalized;
      });
    },
    [pushHistorySnapshot],
  );

  const handleUndo = useCallback(() => {
    if (!historyRef.current.past.length) return;

    const currentSnapshot = cloneDeep(components);
    const previousSnapshot = historyRef.current.past.pop();

    historyRef.current.future.unshift(currentSnapshot);
    restoreSnapshot(previousSnapshot, selectedIdsRef.current);
  }, [components, restoreSnapshot]);

  const handleRedo = useCallback(() => {
    if (!historyRef.current.future.length) return;

    const currentSnapshot = cloneDeep(components);
    const nextSnapshot = historyRef.current.future.shift();

    historyRef.current.past.push(currentSnapshot);
    restoreSnapshot(nextSnapshot, selectedIdsRef.current);
  }, [components, restoreSnapshot]);

  const selectAllParts = useCallback(() => {
    setSelectedCompIds(components.map((item) => item.id));
  }, [components]);

  const clearSelection = useCallback(() => {
    setSelectedCompIds([]);
  }, []);

  const deleteSelected = useCallback(() => {
    if (readOnly) return;
    if (!selectedIdsRef.current.length) return;

    const toDelete = new Set(selectedIdsRef.current);
    const remaining = components.filter((item) => !toDelete.has(item.id));
    const nextSelection = remaining[0] ? [remaining[0].id] : [];

    commitComponents((prev) => prev.filter((item) => !toDelete.has(item.id)), {
      nextSelectionIds: nextSelection,
      keepEmptySelection: !nextSelection.length,
    });
  }, [commitComponents, components, readOnly]);

  useEffect(() => {
    const normalizedInitial = normalizeViewerComponents(initialComponents);

    historyRef.current = { past: [], future: [] };
    setComponents(normalizedInitial);
    setSelectedCompIds(
      !readOnly && normalizedInitial[0] ? [normalizedInitial[0].id] : [],
    );
    setQuantity(1);
    setComments("");
  }, [initialComponents, readOnly]);

  const editable = useMemo(
    () => ({
      width: customizationRules?.editable?.width !== false,
      height: customizationRules?.editable?.height !== false,
      depth: customizationRules?.editable?.depth !== false,
      wood_type: customizationRules?.editable?.wood_type !== false,
      finish_color: customizationRules?.editable?.finish_color !== false,
      comments: customizationRules?.editable?.comments !== false,
      quantity: customizationRules?.editable?.quantity !== false,
    }),
    [customizationRules],
  );

  const personHeightMm = useMemo(() => {
    const parts = String(personHeightInput).split(".");
    const ft = parseInt(parts[0], 10) || 0;
    const inc = parts[1] ? parseInt(parts[1].substring(0, 2), 10) : 0;
    return (ft * 12 + inc) * 25.4;
  }, [personHeightInput]);

  const isAllSelected =
    components.length > 0 && selectedCompIds.length === components.length;

  const selectedComp = useMemo(() => {
    if (selectedCompIds.length !== 1) return null;
    return components.find((c) => c.id === selectedCompIds[0]) || null;
  }, [components, selectedCompIds]);

  const selectedAxisLabels = useMemo(
    () => getPartAxisLabels(selectedComp),
    [selectedComp],
  );

  const selectionLabel = useMemo(() => {
    if (!selectedCompIds.length) return "Select a part";
    if (selectedCompIds.length === 1) {
      return `Editing: ${selectedComp?.label || "Selected Part"}`;
    }
    return `Editing: ${selectedCompIds.length} parts`;
  }, [selectedComp, selectedCompIds]);

  const selectedFinishValue = useMemo(
    () =>
      getSharedSelectionValue(
        components,
        selectedCompIds,
        getComponentFinishValue,
      ),
    [components, selectedCompIds],
  );

  const selectedColorValue = useMemo(
    () =>
      getSharedSelectionValue(
        components,
        selectedCompIds,
        getComponentColorValue,
      ),
    [components, selectedCompIds],
  );

  useEffect(() => {
    if (!selectedComp) {
      setDimensionDrafts({
        width: "",
        height: "",
        depth: "",
      });
      return;
    }

    setDimensionDrafts({
      width: String(selectedComp.width ?? ""),
      height: String(selectedComp.height ?? ""),
      depth: String(selectedComp.depth ?? ""),
    });
  }, [selectedComp]);

  const overallBounds = useMemo(() => {
    const current = buildBoundsFromComponents(components);

    if (current.width_mm > 0 || current.height_mm > 0 || current.depth_mm > 0) {
      return current;
    }

    return normalizeDimensions(initialDimensions || {});
  }, [components, initialDimensions]);

  useEffect(() => {
    setOverallDrafts({
      width: String(overallBounds.width_mm || ""),
      height: String(overallBounds.height_mm || ""),
      depth: String(overallBounds.depth_mm || ""),
    });
  }, [overallBounds.width_mm, overallBounds.height_mm, overallBounds.depth_mm]);

  const clearSelectionHelpers = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    selectionHelpersRef.current.forEach((helper) => {
      scene.remove(helper);

      if (helper.geometry) helper.geometry.dispose();

      if (helper.material) {
        if (Array.isArray(helper.material)) {
          helper.material.forEach((mat) => mat.dispose?.());
        } else {
          helper.material.dispose?.();
        }
      }
    });

    selectionHelpersRef.current = [];
  }, []);

  const findTopLevelObjectById = useCallback((id) => {
    const root = rootGroupRef.current;
    if (!root) return null;

    for (const child of root.children) {
      if (child.userData?.id === id) return child;
    }

    let found = null;
    root.traverse((child) => {
      if (!found && child.userData?.id === id) {
        found = child;
      }
    });

    return found;
  }, []);

  const getIdsInSelectionRect = useCallback((clientRect) => {
    const root = rootGroupRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;

    if (!root || !camera || !renderer) return [];

    const ids = [];
    const canvasRect = renderer.domElement.getBoundingClientRect();

    root.children.forEach((object) => {
      const id = object.userData?.id;
      if (!id) return;

      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return;

      const center = new THREE.Vector3();
      box.getCenter(center);
      center.project(camera);

      const screenX = ((center.x + 1) / 2) * canvasRect.width + canvasRect.left;
      const screenY =
        ((-center.y + 1) / 2) * canvasRect.height + canvasRect.top;

      if (
        screenX >= clientRect.left &&
        screenX <= clientRect.right &&
        screenY >= clientRect.top &&
        screenY <= clientRect.bottom
      ) {
        ids.push(id);
      }
    });

    return uniqueIds(ids);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;

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

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      pointerStateRef.current = {
        isDown: true,
        startX: event.clientX,
        startY: event.clientY,
        shiftMode: !!event.shiftKey,
        moved: false,
      };

      if (event.shiftKey) {
        orbit.enabled = false;

        const rect = renderer.domElement.getBoundingClientRect();
        setMarqueeRect({
          left: event.clientX - rect.left,
          top: event.clientY - rect.top,
          width: 0,
          height: 0,
        });
      }
    };

    const onPointerMove = (event) => {
      const pointer = pointerStateRef.current;
      if (!pointer.isDown) return;

      const dx = event.clientX - pointer.startX;
      const dy = event.clientY - pointer.startY;
      const distance = Math.hypot(dx, dy);

      if (distance > 4) {
        pointer.moved = true;
      }

      if (!pointer.shiftMode) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const left = Math.min(pointer.startX, event.clientX) - rect.left;
      const top = Math.min(pointer.startY, event.clientY) - rect.top;
      const width = Math.abs(event.clientX - pointer.startX);
      const height = Math.abs(event.clientY - pointer.startY);

      setMarqueeRect({
        left,
        top,
        width,
        height,
      });
    };

    const onPointerUp = (event) => {
      const pointer = pointerStateRef.current;
      pointer.isDown = false;

      orbit.enabled = true;

      const dragDistance = Math.hypot(
        event.clientX - pointer.startX,
        event.clientY - pointer.startY,
      );

      if (pointer.shiftMode && pointer.moved) {
        const clientRect = {
          left: Math.min(pointer.startX, event.clientX),
          top: Math.min(pointer.startY, event.clientY),
          right: Math.max(pointer.startX, event.clientX),
          bottom: Math.max(pointer.startY, event.clientY),
        };

        const idsInBox = getIdsInSelectionRect(clientRect);
        if (idsInBox.length) {
          setSelectedCompIds((prev) => uniqueIds([...prev, ...idsInBox]));
        }

        setMarqueeRect(null);
        return;
      }

      setMarqueeRect(null);

      if (dragDistance > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(rootGroup.children, true);

      let clickedId = null;

      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData?.id && obj.parent) {
          obj = obj.parent;
        }

        if (obj?.userData?.id) {
          clickedId = obj.userData.id;
        }
      }

      if (clickedId) {
        if (event.shiftKey) {
          setSelectedCompIds((prev) =>
            prev.includes(clickedId)
              ? prev.filter((id) => id !== clickedId)
              : [...prev, clickedId],
          );
        } else {
          setSelectedCompIds([clickedId]);
        }
        return;
      }

      if (!event.shiftKey) {
        setSelectedCompIds([]);
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const handleResize = () => {
      if (!mountRef.current) return;
      const newW = Math.max(1, mountRef.current.clientWidth);
      const newH = Math.max(1, mountRef.current.clientHeight);
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
    };
    animate();

    return () => {
      clearSelectionHelpers();
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      cancelAnimationFrame(animId);
      orbit.dispose();
      renderer.dispose();

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [clearSelectionHelpers, getIdsInSelectionRect]);

  useEffect(() => {
    const rootGroup = rootGroupRef.current;
    if (!rootGroup) return;

    while (rootGroup.children.length) {
      const child = rootGroup.children[0];
      rootGroup.remove(child);
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose?.());
          } else {
            obj.material.dispose?.();
          }
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
          if (child.isMesh) {
            child.userData.id = comp.id;
          }
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
        console.error("Customer3DViewer render component failed:", comp, error);
      }
    });

    if (!boundsBox.isEmpty() && orbitRef.current) {
      const center = new THREE.Vector3();
      boundsBox.getCenter(center);
      orbitRef.current.target.copy(center);
      orbitRef.current.update();
    }
  }, [components]);

  useEffect(() => {
    if (!sceneRef.current) return;

    clearSelectionHelpers();

    if (!selectedCompIds.length) return;

    selectedCompIds.forEach((id) => {
      const target = findTopLevelObjectById(id);
      if (!target) return;

      const helper = new THREE.BoxHelper(target, SELECTION_COLOR);

      if (helper.material) {
        const mats = Array.isArray(helper.material)
          ? helper.material
          : [helper.material];

        mats.forEach((mat) => {
          mat.depthTest = false;
          mat.transparent = true;
          mat.opacity = 0.95;
        });
      }

      helper.renderOrder = 999;
      sceneRef.current.add(helper);
      selectionHelpersRef.current.push(helper);
    });

    return () => {
      clearSelectionHelpers();
    };
  }, [
    clearSelectionHelpers,
    findTopLevelObjectById,
    selectedCompIds,
    components,
  ]);

  useEffect(() => {
    if (!personGroupRef.current || !rootGroupRef.current) return;

    const group = personGroupRef.current;
    group.clear();
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);

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
      metalness: 0.02,
    });

    const headMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.95,
      metalness: 0.02,
    });

    const footMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 1,
      metalness: 0,
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

    const box = new THREE.Box3().setFromObject(rootGroupRef.current);
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

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tag = String(event.target?.tagName || "").toLowerCase();
      const isTyping =
        ["input", "textarea", "select"].includes(tag) ||
        event.target?.isContentEditable;

      const hasModifier = event.ctrlKey || event.metaKey;
      const lowerKey = String(event.key || "").toLowerCase();

      if (hasModifier && lowerKey === "a") {
        event.preventDefault();
        selectAllParts();
        return;
      }

      if (hasModifier && lowerKey === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (
        (hasModifier && lowerKey === "y") ||
        (hasModifier && event.shiftKey && lowerKey === "z")
      ) {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (isTyping) return;

      if ((event.key === "Delete" || event.key === "Backspace") && !readOnly) {
        if (selectedIdsRef.current.length) {
          event.preventDefault();
          deleteSelected();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelected, handleRedo, handleUndo, readOnly, selectAllParts]);

  const handleDimensionDraftChange = (axis, value) => {
    setDimensionDrafts((prev) => ({
      ...prev,
      [axis]: value,
    }));
  };

  const handleOverallDraftChange = (axis, value) => {
    setOverallDrafts((prev) => ({
      ...prev,
      [axis]: value,
    }));
  };

  const commitOverallDimension = (axis) => {
    if (!isCustomizable || readOnly) return;
    if (!Array.isArray(components) || !components.length) return;

    const rawValue = overallDrafts?.[axis];
    const parsed = Number(rawValue);

    const currentValue =
      axis === "width"
        ? Number(overallBounds.width_mm || 0)
        : axis === "height"
          ? Number(overallBounds.height_mm || 0)
          : Number(overallBounds.depth_mm || 0);

    if (!Number.isFinite(parsed) || parsed <= 0 || currentValue <= 0) {
      setOverallDrafts((prev) => ({
        ...prev,
        [axis]: String(currentValue || ""),
      }));
      return;
    }

    const nextValue = Math.max(1, Math.round(parsed));
    if (nextValue === currentValue) return;

    const scale = nextValue / currentValue;
    const extents = getComponentExtents(components);

    if (!extents || !Number.isFinite(scale) || scale <= 0) return;

    commitComponents((prev) =>
      prev.map((c) => {
        if (axis === "width") {
          return {
            ...c,
            x: Math.round(
              extents.minX + (Number(c.x || 0) - extents.minX) * scale,
            ),
            width: Math.max(1, Math.round(Number(c.width || 0) * scale)),
          };
        }

        if (axis === "height") {
          return {
            ...c,
            y: Math.round(
              extents.minY + (Number(c.y || 0) - extents.minY) * scale,
            ),
            height: Math.max(1, Math.round(Number(c.height || 0) * scale)),
          };
        }

        return {
          ...c,
          z: Math.round(
            extents.minZ + (Number(c.z || 0) - extents.minZ) * scale,
          ),
          depth: Math.max(1, Math.round(Number(c.depth || 0) * scale)),
        };
      }),
    );

    setOverallDrafts((prev) => ({
      ...prev,
      [axis]: String(nextValue),
    }));
  };

  const commitComponentDimension = (axis) => {
    if (!isCustomizable || readOnly) return;
    if (selectedCompIds.length !== 1 || !selectedComp) return;

    const rawValue = dimensionDrafts?.[axis];
    const parsed = Number(rawValue);
    const currentValue = Number(selectedComp?.[axis] || 0);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDimensionDrafts((prev) => ({
        ...prev,
        [axis]: String(currentValue || ""),
      }));
      return;
    }

    const nextValue = Math.max(1, Math.round(parsed));
    if (nextValue === currentValue) return;

    const selectedId = selectedComp.id;

    commitComponents((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, [axis]: nextValue } : c)),
    );

    setDimensionDrafts((prev) => ({
      ...prev,
      [axis]: String(nextValue),
    }));
  };

  const handleFinishChange = (finishId) => {
    if (!isCustomizable || readOnly || !editable.finish_color) return;

    // Apply to ALL components, not just selected ones!
    commitComponents((prev) =>
      prev.map((c) => {
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

    // Apply to ALL components!
    commitComponents((prev) =>
      prev.map((c) => {
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
      worldSize: {
        width_mm: WORLD_W,
        height_mm: WORLD_H,
        depth_mm: WORLD_D,
      },
      components: cloneDeep(components),
      metadata: summarizeMetadata(components),
    });
  };

  const finishDisabled =
    !selectedCompIds.length ||
    !isCustomizable ||
    readOnly ||
    !editable.finish_color;

  const undoDisabled = !historyRef.current.past.length;
  const redoDisabled = !historyRef.current.future.length;
  const deleteDisabled = readOnly || !selectedCompIds.length;
  const singleSelectionOnly = selectedCompIds.length !== 1;

  const swatchColors = [
    "#ffffff",
    "#1e293b",
    "#dc2626",
    "#16a34a",
    "#2563eb",
    "#d97706",
    "#6d28d9",
  ];

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <div>
          <div style={styles.topBarTitle}>
            {readOnly ? "Template Preview" : "Live Configurator"}
          </div>
          <div style={styles.topBarDims}>
            {formatMm(overallBounds.width_mm)} ×{" "}
            {formatMm(overallBounds.height_mm)} ×{" "}
            {formatMm(overallBounds.depth_mm)}
          </div>
        </div>

        <div style={styles.topBarActions}>
          {!readOnly ? (
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoDisabled}
                style={{
                  ...styles.toolBtn,
                  ...(undoDisabled ? styles.toolBtnDisabled : null),
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
                  ...(redoDisabled ? styles.toolBtnDisabled : null),
                }}
              >
                Redo
              </button>

              <button
                type="button"
                onClick={isAllSelected ? clearSelection : selectAllParts}
                disabled={!components.length}
                style={{
                  ...styles.toolBtn,
                  ...styles.primaryToolBtn,
                  ...(!components.length ? styles.toolBtnDisabled : null),
                }}
              >
                {isAllSelected ? "Clear" : "Select All"}
              </button>

              <button
                type="button"
                onClick={deleteSelected}
                disabled={deleteDisabled}
                style={{
                  ...styles.toolBtn,
                  ...styles.dangerToolBtn,
                  ...(deleteDisabled ? styles.toolBtnDisabled : null),
                }}
              >
                Delete
              </button>
            </>
          ) : null}

          <span
            style={{
              ...styles.modeBadge,
              background: readOnly ? "#e2e8f0" : "#dcfce7",
              color: readOnly ? "#475569" : "#166534",
            }}
          >
            {readOnly ? "Read Only" : "Editable"}
          </span>
        </div>
      </div>

      <div style={styles.viewerShell}>
        <div style={styles.canvasWrap}>
          <div ref={mountRef} style={styles.canvasContainer} />
          {marqueeRect ? (
            <div
              style={{
                ...styles.marqueeBox,
                left: marqueeRect.left,
                top: marqueeRect.top,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          ) : null}
        </div>

        <aside style={styles.sidebar}>
          <div style={styles.sidebarScroll}>
            <div style={styles.sidebarBlock}>
              <h3 style={styles.sidebarTitle}>Template Customization</h3>
              <p style={styles.helpText}>
                Adjust the overall dimensions below. The system will
                automatically scale all parts of the furniture proportionally to
                maintain the design.
              </p>
            </div>

            {/* PERSON SCALE SECTION */}
            <div style={styles.sidebarBlock}>
              <div style={styles.sectionRow}>
                <label style={styles.label}>Person Scale</label>
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
                <div>
                  <span style={styles.dimLabel}>Height (Feet.Inches)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={personHeightInput}
                    onChange={(e) => setPersonHeightInput(e.target.value)}
                    style={styles.input}
                  />
                </div>
              ) : null}
            </div>

            {/* OVERALL SIZE SECTION (This is the only size editor they get!) */}
            <div style={styles.sidebarBlock}>
              <div style={styles.sectionRow}>
                <label style={styles.label}>Overall Dimensions</label>
                <span style={styles.miniPill}>Proportional Scaling</span>
              </div>

              <div style={styles.dimGrid}>
                <div>
                  <span style={styles.dimLabel}>Width (mm)</span>
                  <input
                    type="number"
                    value={overallDrafts.width}
                    disabled={!isCustomizable || readOnly}
                    onChange={(e) =>
                      handleOverallDraftChange("width", e.target.value)
                    }
                    onBlur={() => commitOverallDimension("width")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitOverallDimension("width");
                      }
                    }}
                    style={styles.input}
                  />
                </div>
                <div>
                  <span style={styles.dimLabel}>Height (mm)</span>
                  <input
                    type="number"
                    value={overallDrafts.height}
                    disabled={!isCustomizable || readOnly}
                    onChange={(e) =>
                      handleOverallDraftChange("height", e.target.value)
                    }
                    onBlur={() => commitOverallDimension("height")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitOverallDimension("height");
                      }
                    }}
                    style={styles.input}
                  />
                </div>
                <div>
                  <span style={styles.dimLabel}>Depth (mm)</span>
                  <input
                    type="number"
                    value={overallDrafts.depth}
                    disabled={!isCustomizable || readOnly}
                    onChange={(e) =>
                      handleOverallDraftChange("depth", e.target.value)
                    }
                    onBlur={() => commitOverallDimension("depth")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitOverallDimension("depth");
                      }
                    }}
                    style={styles.input}
                  />
                </div>
              </div>
            </div>

            {/* FINISHES & COLORS (Now applies to the whole item) */}
            <div
              style={{
                ...styles.sidebarBlock,
                opacity: readOnly ? 0.5 : 1,
                pointerEvents: readOnly ? "none" : "auto",
              }}
            >
              <label style={styles.label}>Wood Finish</label>
              <select
                onChange={(e) => handleFinishChange(e.target.value)}
                style={styles.input}
              >
                <option value="">Original / Custom</option>
                {WOOD_FINISHES?.map((finish) => (
                  <option key={finish.id} value={finish.id}>
                    {finish.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                ...styles.sidebarBlock,
                opacity: readOnly ? 0.5 : 1,
                pointerEvents: readOnly ? "none" : "auto",
              }}
            >
              <label style={styles.label}>Solid Color</label>
              <div style={styles.colorRow}>
                {swatchColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleColorChange(color)}
                    style={{ ...styles.colorSwatch, background: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          {!readOnly ? (
            <div style={styles.sidebarFooter}>
              <div style={styles.footerTopRow}>
                <div>
                  <div style={styles.footerTitle}>Finalize</div>
                  <div style={styles.footerSubtext}>
                    Quantity, note, then add to cart.
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
                <label style={styles.footerLabel}>{commentsLabel}</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={comments}
                  disabled={!editable.comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={commentsPlaceholder}
                  style={styles.textarea}
                />
                <div style={styles.counterText}>{comments.length}/500</div>
              </div>

              <div style={styles.footerField}>
                <label style={styles.footerLabel}>Reference Photos</label>

                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  multiple
                  onChange={onPickReferencePhotos}
                  style={styles.uploadInput}
                />

                {uploadError ? (
                  <div style={styles.errorText}>{uploadError}</div>
                ) : (
                  <div style={styles.helperText}>
                    Upload pegs, inspiration images, actual space photos, or
                    sketches.
                  </div>
                )}

                {Array.isArray(referencePhotos) && referencePhotos.length ? (
                  <div style={styles.photoGrid}>
                    {referencePhotos.map((photo) => (
                      <div key={photo.id} style={styles.photoCard}>
                        <img
                          src={photo.data_url}
                          alt={photo.name || "Reference"}
                          style={styles.photoThumb}
                        />

                        <div style={styles.photoMeta}>
                          <div style={styles.photoName}>
                            {photo.name || "Reference Photo"}
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveReferencePhoto?.(photo.id)}
                            style={styles.photoRemoveBtn}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
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
    gap: 10,
    minHeight: 0,
  },

  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 12px",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 14,
    background: "#f8fafc",
  },

  topBarTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
  },

  topBarDims: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
    fontWeight: 600,
  },

  topBarActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  toolBtn: {
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#334155",
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
  },

  primaryToolBtn: {
    background: "#eff6ff",
    border: "1px solid #93c5fd",
    color: "#1d4ed8",
  },

  dangerToolBtn: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#be123c",
  },

  toolBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  modeBadge: {
    fontSize: 12,
    fontWeight: 800,
    padding: "8px 12px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },

  viewerShell: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 340px",
    height: "clamp(520px, 68vh, 620px)",
    minHeight: 520,
    borderRadius: 18,
    overflow: "hidden",
    background: "#ffffff",
    border: "1px solid rgba(15, 23, 42, 0.08)",
  },

  canvasWrap: {
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    background: "#f8fafc",
  },

  canvasContainer: {
    width: "100%",
    height: "100%",
    minHeight: 520,
    backgroundColor: "#f8fafc",
  },

  marqueeBox: {
    position: "absolute",
    border: "1px dashed #0ea5e9",
    background: "rgba(14, 165, 233, 0.12)",
    pointerEvents: "none",
    zIndex: 5,
  },

  sidebar: {
    minWidth: 0,
    minHeight: 0,
    borderLeft: "1px solid #e2e8f0",
    backgroundColor: "#fff",
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr) auto",
  },

  sidebarScroll: {
    minHeight: 0,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  sidebarBlock: {
    display: "grid",
    gap: 8,
    padding: 12,
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "#ffffff",
  },

  quickHintRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  quickHint: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: 800,
  },

  sidebarTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
  },

  helpText: {
    margin: 0,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.5,
  },

  sectionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  sectionActionRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  label: {
    fontSize: 14,
    fontWeight: 800,
    color: "#334155",
  },

  inlineCheck: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#475569",
  },

  miniPill: {
    fontSize: 11,
    fontWeight: 800,
    color: "#475569",
    background: "#f1f5f9",
    borderRadius: 999,
    padding: "6px 10px",
    whiteSpace: "nowrap",
  },

  dimGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },

  dimLabel: {
    fontSize: 11,
    color: "#64748b",
    display: "block",
    marginBottom: 4,
    fontWeight: 700,
  },

  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  },

  helperText: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.45,
  },

  actionBtn: {
    padding: "7px 10px",
    backgroundColor: "#e2e8f0",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
    whiteSpace: "nowrap",
  },

  deleteActionBtn: {
    backgroundColor: "#fff1f2",
    color: "#be123c",
  },

  actionBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  colorRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "2px solid #cbd5e1",
    cursor: "pointer",
  },

  colorSwatchActive: {
    boxShadow: "0 0 0 3px rgba(56, 189, 248, 0.35)",
    transform: "scale(1.04)",
  },

  sidebarFooter: {
    borderTop: "1px solid #e2e8f0",
    background: "#ffffff",
    padding: 14,
    display: "grid",
    gap: 12,
    boxShadow: "0 -8px 24px rgba(15, 23, 42, 0.05)",
  },

  footerTopRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  footerTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0f172a",
  },

  footerSubtext: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 3,
  },

  qtyBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 6,
    borderRadius: 12,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },

  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
  },

  qtyValue: {
    minWidth: 24,
    textAlign: "center",
    fontSize: 15,
    color: "#0f172a",
  },

  footerField: {
    display: "grid",
    gap: 6,
  },

  footerLabel: {
    fontSize: 13,
    fontWeight: 800,
    color: "#334155",
  },

  textarea: {
    width: "100%",
    resize: "none",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    padding: 12,
    font: "inherit",
    boxSizing: "border-box",
    background: "#fff",
  },

  counterText: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "right",
  },

  applyBtn: {
    height: 46,
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(90deg, #166534 0%, #10b981 100%)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  },

  uploadInput: {
    width: "100%",
    font: "inherit",
  },

  errorText: {
    fontSize: 12,
    color: "#b91c1c",
    fontWeight: 700,
  },

  photoGrid: {
    display: "grid",
    gap: 8,
  },

  photoCard: {
    display: "grid",
    gridTemplateColumns: "56px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    padding: 8,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
  },

  photoThumb: {
    width: 56,
    height: 56,
    objectFit: "cover",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
  },

  photoMeta: {
    minWidth: 0,
    display: "grid",
    gap: 6,
  },

  photoName: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  photoRemoveBtn: {
    width: "fit-content",
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#be123c",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
};
