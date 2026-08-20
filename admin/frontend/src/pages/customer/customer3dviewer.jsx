import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import api from "../../services/api";
import OversizedDeliveryWarning from "../../components/OversizedDeliveryWarning";
import { assessOversizedDelivery } from "../../utils/oversizedDelivery";

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

/* WISDOM CUSTOMIZE GUIDED EXPERIENCE V1.0.14.11 */

const CUSTOMIZE_GUIDE_STEPS = [
  {
    label: "Choose Design",
    title: "Choose a design",
    instruction:
      "Pick the furniture design you want to customize. Check the 3D preview before you continue.",
  },
  {
    label: "Set Size",
    title: "Set the size",
    instruction:
      "Enter the width, height, and depth that fit your room or available space.",
  },
  {
    label: "Edit Parts",
    title: "Edit parts",
    instruction:
      "Click Edit Design, then click a part of the furniture if you want to change only that part.",
  },
  {
    label: "Choose Finish",
    title: "Choose a finish",
    instruction:
      "Choose the wood finish or color you want. You can apply it to the full design or only the selected part.",
  },
  {
    label: "Review Design",
    title: "Review your design",
    instruction:
      "Review the size and finish of your design. Change the quantity if you want more than one piece. Notes and reference photos are optional. Use them only to show extra details or design ideas.",
  },
  {
    label: "Submit Request",
    title: "Submit your request",
    instruction:
      "Add the design to your cart. You can review it again before you place your custom request.",
  },
];

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
  onViewCustomize,
  applyLabel = "Add to Custom Cart",
  commentsLabel = "Additional Comments",
  commentsPlaceholder = "Optional notes for this custom draft...",
  initialQuantity = 1,
  initialComments = "",
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
  const customizeFeedbackTimerRef = useRef(null);
  const finishMenuRef = useRef(null);
  const initialViewFramedRef = useRef(false);

  const [components, setComponents] = useState(() =>
    normalizeViewerComponents(initialComponents),
  );
  const [selectedCompIds, setSelectedCompIds] = useState([]);

  const [unit, setUnit] = useState("mm");
  const [showPerson, setShowPerson] = useState(true);
  const [personHeightMm, setPersonHeightMm] = useState(1700);
  const [selectionMode, setSelectionMode] = useState(false);
  const [activeView, setActiveView] = useState("3D");
  const [customHex, setCustomHex] = useState("#1e293b");
  const [finishMenuOpen, setFinishMenuOpen] = useState(false);

  const [customizeProgressStep, setCustomizeProgressStep] = useState(
    readOnly ? 1 : 2,
  );
  const [customizeGuideStep, setCustomizeGuideStep] = useState(() =>
    readOnly ? 0 : 1,
  );
  const [customizeFeedback, setCustomizeFeedback] = useState("");
  const [showCustomizeGuide, setShowCustomizeGuide] = useState(() => !readOnly);

  const [quantity, setQuantity] = useState(() => {
    const parsed = Number(initialQuantity);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
  });
  const [comments, setComments] = useState(() => String(initialComments || ""));
  const [standardTruckLimits, setStandardTruckLimits] = useState(null);

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

  const rememberCustomizeGuide = useCallback(() => {
    // Skip only this current customize session. Opening Customize again
    // starts with the guide visible so first-time users are never stranded.
    setShowCustomizeGuide(false);
  }, []);

  const openCustomizeGuide = useCallback(() => {
    setCustomizeGuideStep(
      Math.max(
        0,
        Math.min(CUSTOMIZE_GUIDE_STEPS.length - 1, customizeProgressStep - 1),
      ),
    );
    setShowCustomizeGuide(true);
  }, [customizeProgressStep]);

  const goToNextCustomizeGuideStep = useCallback(() => {
    setCustomizeGuideStep((current) => {
      if (current >= CUSTOMIZE_GUIDE_STEPS.length - 1) {
        rememberCustomizeGuide();
        return current;
      }

      return current + 1;
    });
  }, [rememberCustomizeGuide]);

  // Keep the open tutorial aligned with real completed customization steps.
  // Manual Back/Next still lets the customer review the instructions freely.
  useEffect(() => {
    if (readOnly || !showCustomizeGuide) return;

    const progressGuideIndex = Math.max(
      0,
      Math.min(CUSTOMIZE_GUIDE_STEPS.length - 1, customizeProgressStep - 1),
    );

    setCustomizeGuideStep((current) => Math.max(current, progressGuideIndex));
  }, [customizeProgressStep, readOnly, showCustomizeGuide]);

  const showCustomizeFeedback = useCallback((message) => {
    if (customizeFeedbackTimerRef.current) {
      clearTimeout(customizeFeedbackTimerRef.current);
    }

    setCustomizeFeedback(String(message || ""));

    customizeFeedbackTimerRef.current = setTimeout(() => {
      setCustomizeFeedback("");
      customizeFeedbackTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(
    () => () => {
      if (customizeFeedbackTimerRef.current) {
        clearTimeout(customizeFeedbackTimerRef.current);
      }
    },
    [],
  );

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

  const viewMetadata = useMemo(() => {
    const firstComponent = Array.isArray(components)
      ? components.find(Boolean) || {}
      : {};

    const material =
      String(
        firstComponent?.material || firstComponent?.wood_type || "",
      ).trim() || "Standard material";

    const finishId = String(
      firstComponent?.finish_id ||
        firstComponent?.woodFinish ||
        firstComponent?.finish ||
        "",
    ).trim();

    const finishMatch = Array.isArray(WOOD_FINISHES)
      ? WOOD_FINISHES.find((item) => item?.id === finishId)
      : null;

    const finish =
      finishMatch?.label ||
      finishId ||
      (firstComponent?.color_mode === "solid"
        ? "Custom color"
        : "Original finish");

    return { material, finish };
  }, [components]);

  useEffect(() => {
    let active = true;

    api
      .get("/customer/blueprints/delivery-config")
      .then((response) => {
        if (!active) return;

        setStandardTruckLimits(
          response.data?.configured
            ? response.data.standard_truck_limits_mm
            : null,
        );
      })
      .catch((error) => {
        console.error("Failed to load standard-truck delivery limits:", error);

        if (active) {
          setStandardTruckLimits(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const deliveryAssessment = useMemo(
    () => assessOversizedDelivery(overallBounds, standardTruckLimits),
    [overallBounds, standardTruckLimits],
  );

  const selectedGroup = useMemo(() => {
    if (!selectedCompIds.length) return [];
    return components.filter((c) => selectedCompIds.includes(c.id));
  }, [components, selectedCompIds]);

  const sampleSelectedPart = selectedGroup[0] || null;
  const activeFinishId = String(
    (sampleSelectedPart || components[0])?.finish_id ||
      (sampleSelectedPart || components[0])?.woodFinish ||
      (sampleSelectedPart || components[0])?.finish ||
      "",
  ).trim();

  const activeWoodFinish = Array.isArray(WOOD_FINISHES)
    ? WOOD_FINISHES.find((finish) => finish.id === activeFinishId) || null
    : null;

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

  useEffect(() => {
    if (!finishMenuOpen || typeof document === "undefined") return undefined;

    const handleOutsideFinishMenu = (event) => {
      if (
        finishMenuRef.current &&
        !finishMenuRef.current.contains(event.target)
      ) {
        setFinishMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideFinishMenu);

    return () => {
      document.removeEventListener("mousedown", handleOutsideFinishMenu);
    };
  }, [finishMenuOpen]);
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
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7f5f1");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.5, 12000);
    camera.position.set(1500, 700, 1500);
    cameraRef.current = camera;

    // WISDOM CUSTOMER 3D FURNITURE REALISM V1.0.3
    // Reduce flat ambient wash while preserving the existing material system.
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const hemisphereLight = new THREE.HemisphereLight(0xfffdf8, 0xd8c5aa, 0.45);
    scene.add(hemisphereLight);

    const keyLight = new THREE.DirectionalLight(0xfffbf5, 2.85);
    keyLight.position.set(1300, 2250, 1400);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -3400;
    keyLight.shadow.camera.right = 3400;
    keyLight.shadow.camera.top = 3400;
    keyLight.shadow.camera.bottom = -3400;
    keyLight.shadow.camera.near = 100;
    keyLight.shadow.camera.far = 8000;
    keyLight.shadow.bias = -0.00012;
    keyLight.shadow.normalBias = 0.7;
    keyLight.shadow.radius = 3;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffeee2, 0.64);
    fillLight.position.set(-1450, 850, 1100);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.26);
    rimLight.position.set(-1000, 1400, -1650);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.ShadowMaterial({ opacity: 0.18 }),
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

    // Keep the 3D viewer interactive.
    // The page itself can still scroll from the options/sidebar area.
    orbit.enabled = true;

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
          box.min.z - offset,
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

  const fitReadOnlyCameraToFurniture = (viewMode = "3D") => {
    if (
      !readOnly ||
      !boundsBoxRef.current ||
      boundsBoxRef.current.isEmpty() ||
      !cameraRef.current ||
      !orbitRef.current
    ) {
      return false;
    }

    const box = boundsBoxRef.current;
    const camera = cameraRef.current;
    const orbit = orbitRef.current;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const safeWidth = Math.max(1, size.x);
    const safeHeight = Math.max(1, size.y);
    const safeDepth = Math.max(1, size.z);
    const maxDim = Math.max(safeWidth, safeHeight, safeDepth);

    const verticalFov = THREE.MathUtils.degToRad(camera.fov || 40);
    const canvasAspect =
      Number(canvasSizeRef.current.width || 1) /
      Math.max(1, Number(canvasSizeRef.current.height || 1));
    const safeAspect = Math.max(
      0.5,
      Number(camera.aspect || canvasAspect || 1),
    );
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);

    const fitPlaneDistance = (planeWidth, planeHeight) => {
      const distanceForHeight = planeHeight / (2 * Math.tan(verticalFov / 2));
      const distanceForWidth = planeWidth / (2 * Math.tan(horizontalFov / 2));

      return Math.max(distanceForHeight, distanceForWidth) * 1.18;
    };

    let distance = 0;

    if (viewMode === "Front" || viewMode === "Back") {
      distance = fitPlaneDistance(safeWidth, safeHeight);
    } else if (viewMode === "Side") {
      distance = fitPlaneDistance(safeDepth, safeHeight);
    } else if (viewMode === "Top" || viewMode === "Bottom") {
      distance = fitPlaneDistance(safeWidth, safeDepth);
    } else {
      const radius =
        Math.sqrt(
          safeWidth * safeWidth +
            safeHeight * safeHeight +
            safeDepth * safeDepth,
        ) / 2;

      const limitingFov = Math.max(
        THREE.MathUtils.degToRad(18),
        Math.min(verticalFov, horizontalFov),
      );

      distance = (radius / Math.sin(limitingFov / 2)) * 1.18;
    }

    distance = Math.max(700, distance);

    // Avoid the old fixed 5000 max-distance clamp that could crop large items.
    orbit.minDistance = Math.max(120, Math.min(500, distance * 0.1));
    orbit.maxDistance = Math.max(5000, distance * 2.5, maxDim * 4);

    camera.near = Math.max(0.5, Math.min(20, distance * 0.002));
    camera.far = Math.max(12000, distance + maxDim * 8);
    camera.updateProjectionMatrix();

    orbit.enableRotate = viewMode === "3D";
    orbit.maxPolarAngle = viewMode === "3D" ? Math.PI / 2 - 0.05 : Math.PI;

    switch (viewMode) {
      case "Front":
        camera.position.set(center.x, center.y, center.z + distance);
        break;
      case "Back":
        camera.position.set(center.x, center.y, center.z - distance);
        break;
      case "Side":
        camera.position.set(center.x - distance, center.y, center.z);
        break;
      case "Top":
        camera.position.set(center.x, center.y + distance, center.z + 0.1);
        break;
      case "Bottom":
        camera.position.set(center.x, center.y - distance, center.z + 0.1);
        break;
      case "3D":
      default: {
        const direction = new THREE.Vector3(1, 0.72, 1).normalize();
        camera.position.copy(
          center.clone().add(direction.multiplyScalar(distance)),
        );
        break;
      }
    }

    orbit.target.copy(center);
    orbit.update();
    setActiveView(viewMode);
    return true;
  };

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

    if (readOnly && !boundsBox.isEmpty()) {
      requestAnimationFrame(() => {
        fitReadOnlyCameraToFurniture("3D");
      });
    } else if (
      !readOnly &&
      !boundsBox.isEmpty() &&
      !initialViewFramedRef.current
    ) {
      requestAnimationFrame(() => {
        const center = new THREE.Vector3();
        boundsBox.getCenter(center);
        const size = new THREE.Vector3();
        boundsBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 1.8 + 500;

        if (cameraRef.current && orbitRef.current) {
          cameraRef.current.position.set(
            center.x + distance * 0.8,
            center.y + distance * 0.3,
            center.z + distance * 0.8,
          );
          orbitRef.current.target.copy(center);
          orbitRef.current.update();
        }
        initialViewFramedRef.current = true;
      });
    }

    if (!boundsBox.isEmpty()) {
      const offset = 100;
      const tick = 25;
      const linePoints = [];

      // 1. WIDTH LINE (Front Bottom)
      linePoints.push(
        boundsBox.min.x,
        boundsBox.min.y,
        boundsBox.max.z + offset,
        boundsBox.max.x,
        boundsBox.min.y,
        boundsBox.max.z + offset,
        // Width Ticks
        boundsBox.min.x,
        boundsBox.min.y,
        boundsBox.max.z + offset - tick,
        boundsBox.min.x,
        boundsBox.min.y,
        boundsBox.max.z + offset + tick,
        boundsBox.max.x,
        boundsBox.min.y,
        boundsBox.max.z + offset - tick,
        boundsBox.max.x,
        boundsBox.min.y,
        boundsBox.max.z + offset + tick,
      );

      // 2. HEIGHT LINE (Back Right Corner)
      const backZ = boundsBox.min.z - offset;
      linePoints.push(
        boundsBox.max.x + offset,
        boundsBox.min.y,
        backZ,
        boundsBox.max.x + offset,
        boundsBox.max.y,
        backZ,
        // Height Ticks
        boundsBox.max.x + offset - tick,
        boundsBox.min.y,
        backZ,
        boundsBox.max.x + offset + tick,
        boundsBox.min.y,
        backZ,
        boundsBox.max.x + offset - tick,
        boundsBox.max.y,
        backZ,
        boundsBox.max.x + offset + tick,
        boundsBox.max.y,
        backZ,
      );

      // 3. DEPTH LINE (Right Side Bottom)
      linePoints.push(
        boundsBox.max.x + offset,
        boundsBox.min.y,
        boundsBox.min.z,
        boundsBox.max.x + offset,
        boundsBox.min.y,
        boundsBox.max.z,
        // Depth Ticks
        boundsBox.max.x + offset - tick,
        boundsBox.min.y,
        boundsBox.min.z,
        boundsBox.max.x + offset + tick,
        boundsBox.min.y,
        boundsBox.min.z,
        boundsBox.max.x + offset - tick,
        boundsBox.min.y,
        boundsBox.max.z,
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
  }, [components]);

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

    // New proportions for a solid, unified blocky look
    const headRadius = Math.max(75, Math.round(personHeight * 0.075));
    const torsoHeight = Math.max(380, Math.round(personHeight * 0.38));
    const footHeight = 24;
    const legHeight = Math.max(
      280,
      Math.round(
        personHeight - (headRadius * 2 + torsoHeight + footHeight - 15),
      ),
    );

    const shoulderWidth = Math.max(240, Math.round(personHeight * 0.2));
    const torsoDepth = Math.max(120, Math.round(personHeight * 0.08));

    const legWidth = Math.max(75, Math.round(shoulderWidth * 0.35));
    const legDepth = Math.max(90, Math.round(torsoDepth * 0.8));
    const legGap = Math.max(25, Math.round(shoulderWidth * 0.15));

    const footDepth = legDepth + 30;

    // Single, uniform smooth material for the whole body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.85,
      metalness: 0.05,
    });

    const leftFoot = new THREE.Mesh(
      new THREE.BoxGeometry(legWidth, footHeight, footDepth),
      bodyMat,
    );
    leftFoot.position.set(
      -(legGap / 2 + legWidth / 2),
      floorY + footHeight / 2,
      (footDepth - legDepth) / 2,
    );

    const rightFoot = new THREE.Mesh(
      new THREE.BoxGeometry(legWidth, footHeight, footDepth),
      bodyMat,
    );
    rightFoot.position.set(
      legGap / 2 + legWidth / 2,
      floorY + footHeight / 2,
      (footDepth - legDepth) / 2,
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
    torso.position.set(0, floorY + footHeight + legHeight + torsoHeight / 2, 0);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(headRadius, 32, 32),
      bodyMat,
    );
    // Sink the head slightly into the torso so it rests naturally without a neck gap
    head.position.set(
      0,
      floorY + footHeight + legHeight + torsoHeight + headRadius - 15,
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

    if (readOnly && fitReadOnlyCameraToFurniture(viewMode)) {
      return;
    }

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
          center.y + distance * 0.3,
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

    setCustomizeProgressStep((current) => Math.max(current, 3));
    showCustomizeFeedback("Size updated.");
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

    setCustomizeProgressStep((current) => Math.max(current, 4));
    showCustomizeFeedback("Part size updated. Choose a finish when ready.");
  };

  const handleFinishChange = (finishId) => {
    if (!isCustomizable || readOnly || !editable.finish_color) return;
    setCustomizeProgressStep((current) => Math.max(current, 5));
    showCustomizeFeedback(
      finishId
        ? "Finish applied. Review your design."
        : "Finish reset. Review your design.",
    );
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
    if (isHexColor(hex)) {
      setCustomizeProgressStep((current) => Math.max(current, 5));
      showCustomizeFeedback("Color applied. Review your design.");
    } else {
      setCustomizeProgressStep((current) => Math.max(current, 4));
    }
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
    setCustomizeProgressStep(6);
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
      delivery_requirement: deliveryAssessment,
    });
  };

  const undoDisabled = !historyRef.current.past.length;
  const redoDisabled = !historyRef.current.future.length;

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <div style={styles.topBarMeta}>
          <div style={styles.topBarEyebrow}>
            {readOnly ? "Design Preview" : "Customize Design"}
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

      <div
        className={`customer-3d-viewer-shell ${
          !readOnly ? "customer-3d-viewer-shell-customize" : ""
        }`}
        style={{
          ...styles.viewerShell,
          ...(!readOnly ? styles.customizeViewerShell : {}),
        }}
      >
        <div
          className="customer-3d-viewer-canvas-wrap"
          style={{
            ...styles.canvasWrap,
            ...(!readOnly ? styles.customizeCanvasWrap : {}),
          }}
        >
          {!readOnly ? (
            <>
              <div
                style={styles.customizeViewerControls}
                className="cust-mobile-controls"
              >
                <div
                  style={styles.customizeViewerControlRow}
                  className="cust-mobile-control-row"
                >
                  <div
                    style={{
                      ...styles.cameraToolbar,
                      ...styles.cameraToolbarInline,
                    }}
                  >
                    {["3D", "Front", "Back", "Side", "Top", "Bottom"].map(
                      (view) => (
                        <button
                          key={view}
                          type="button"
                          onClick={() => changeCameraView(view)}
                          style={{
                            ...styles.cameraBtn,
                            ...(view === "Bottom" ? styles.cameraBtnLast : {}),
                            ...(activeView === view
                              ? styles.cameraBtnActive
                              : {}),
                          }}
                        >
                          {view}
                        </button>
                      ),
                    )}
                  </div>

                  <div
                    style={styles.customizeProgressArea}
                    className="cust-mobile-hide"
                  >
                    <div style={styles.customizeProgressHeader}>
                      <div>
                        <div style={styles.customizeProgressEyebrow}>
                          Customization Progress
                        </div>
                        <div style={styles.customizeProgressSummary}>
                          Step {customizeProgressStep} of{" "}
                          {CUSTOMIZE_GUIDE_STEPS.length}
                        </div>
                      </div>
                    </div>

                    <div style={styles.customizeStepsScroll}>
                      <div style={styles.customizeSteps}>
                        {CUSTOMIZE_GUIDE_STEPS.map((step, index) => {
                          const stepNumber = index + 1;
                          const isComplete = stepNumber < customizeProgressStep;
                          const isActive = stepNumber === customizeProgressStep;

                          return (
                            <div key={step.label} style={styles.customizeStep}>
                              <div style={styles.customizeStepRail}>
                                <span
                                  style={{
                                    ...styles.customizeStepBadge,
                                    ...(isComplete
                                      ? styles.customizeStepBadgeComplete
                                      : {}),
                                    ...(isActive
                                      ? styles.customizeStepBadgeActive
                                      : {}),
                                  }}
                                >
                                  {isComplete ? "✓" : stepNumber}
                                </span>

                                {index < CUSTOMIZE_GUIDE_STEPS.length - 1 ? (
                                  <span
                                    style={{
                                      ...styles.customizeStepLine,
                                      ...(isComplete
                                        ? styles.customizeStepLineComplete
                                        : {}),
                                    }}
                                  />
                                ) : null}
                              </div>

                              <span
                                style={{
                                  ...styles.customizeStepLabel,
                                  ...(isActive || isComplete
                                    ? styles.customizeStepLabelReached
                                    : {}),
                                }}
                              >
                                {step.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={styles.customizeGuideDock}
                  className="cust-mobile-guide-dock"
                >
                  <button
                    type="button"
                    onClick={openCustomizeGuide}
                    style={styles.customizeGuideHelpBtn}
                  >
                    How to Customize?
                  </button>

                  {showCustomizeGuide ? (
                    <div
                      style={styles.customizeGuideCard}
                      className="cust-mobile-guide-card"
                    >
                      <div style={styles.customizeGuideCardTop}>
                        <div>
                          <div style={styles.customizeGuideStepMeta}>
                            GUIDE {customizeGuideStep + 1} OF{" "}
                            {CUSTOMIZE_GUIDE_STEPS.length}
                          </div>
                          <div style={styles.customizeGuideTitle}>
                            {CUSTOMIZE_GUIDE_STEPS[customizeGuideStep].title}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={rememberCustomizeGuide}
                          style={styles.customizeGuideSkipBtn}
                        >
                          Skip guide
                        </button>
                      </div>

                      <div style={styles.customizeGuideInstruction}>
                        {CUSTOMIZE_GUIDE_STEPS[customizeGuideStep].instruction}
                      </div>

                      <div style={styles.customizeGuideActions}>
                        {customizeGuideStep > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomizeGuideStep((current) =>
                                Math.max(0, current - 1),
                              )
                            }
                            style={styles.customizeGuideSecondaryBtn}
                          >
                            Back
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={goToNextCustomizeGuideStep}
                          style={styles.customizeGuidePrimaryBtn}
                        >
                          {customizeGuideStep ===
                          CUSTOMIZE_GUIDE_STEPS.length - 1
                            ? "Got it"
                            : "Next"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={styles.customizeCanvasStage}>
                <div ref={mountRef} style={styles.canvasContainer} />

                <div
                  ref={labelWRef}
                  className="customer-3d-floating-label"
                  style={styles.floatingLabel}
                >
                  {formatUnitLabel(overallBounds.width_mm)}
                </div>

                <div
                  ref={labelHRef}
                  className="customer-3d-floating-label"
                  style={styles.floatingLabel}
                >
                  {formatUnitLabel(overallBounds.height_mm)}
                </div>

                <div
                  ref={labelDRef}
                  className="customer-3d-floating-label"
                  style={styles.floatingLabel}
                >
                  {formatUnitLabel(overallBounds.depth_mm)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={styles.cameraToolbar}>
                {["3D", "Front", "Back", "Side", "Top", "Bottom"].map(
                  (view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => changeCameraView(view)}
                      style={{
                        ...styles.cameraBtn,
                        ...(view === "Bottom" ? styles.cameraBtnLast : {}),
                        ...(activeView === view ? styles.cameraBtnActive : {}),
                      }}
                    >
                      {view}
                    </button>
                  ),
                )}
              </div>

              <div ref={mountRef} style={styles.canvasContainer} />

              <div
                ref={labelWRef}
                className="customer-3d-floating-label"
                style={styles.floatingLabel}
              >
                {formatUnitLabel(overallBounds.width_mm)}
              </div>

              <div
                ref={labelHRef}
                className="customer-3d-floating-label"
                style={styles.floatingLabel}
              >
                {formatUnitLabel(overallBounds.height_mm)}
              </div>

              <div
                ref={labelDRef}
                className="customer-3d-floating-label"
                style={styles.floatingLabel}
              >
                {formatUnitLabel(overallBounds.depth_mm)}
              </div>
            </>
          )}
        </div>

        {readOnly ? (
          <aside
            style={{
              ...styles.sidebar,
              gridTemplateRows: "minmax(0, 1fr)",
            }}
          >
            <div style={styles.viewSidebarScroll}>
              <section style={styles.viewDetailsCard}>
                <div style={styles.viewDetailsTitle}>Design Details</div>
                <p style={styles.viewDetailsNote}>
                  Review the key details of this furniture design.
                </p>

                <div style={styles.viewDetailsDivider} />

                <div style={styles.viewDetailsGroup}>
                  <div style={styles.viewDetailsGroupTitle}>Dimensions</div>

                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Width</span>
                    <strong style={styles.viewDetailValue}>
                      {formatUnitLabel(overallBounds.width_mm)}
                    </strong>
                  </div>

                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Height</span>
                    <strong style={styles.viewDetailValue}>
                      {formatUnitLabel(overallBounds.height_mm)}
                    </strong>
                  </div>

                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Depth</span>
                    <strong style={styles.viewDetailValue}>
                      {formatUnitLabel(overallBounds.depth_mm)}
                    </strong>
                  </div>
                </div>

                <div style={styles.viewDetailsDivider} />

                <div style={styles.viewDetailsGroup}>
                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Material</span>
                    <strong style={styles.viewDetailValue}>
                      {viewMetadata.material}
                    </strong>
                  </div>

                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Finish</span>
                    <strong style={styles.viewDetailValue}>
                      {viewMetadata.finish}
                    </strong>
                  </div>

                  <div style={styles.viewDetailRowLast}>
                    <span style={styles.viewDetailLabel}>Order Type</span>
                    <strong style={styles.viewDetailValue}>
                      Made to Order
                    </strong>
                  </div>
                </div>
              </section>

              {typeof onViewCustomize === "function" ? (
                <button
                  type="button"
                  onClick={onViewCustomize}
                  style={styles.viewCustomizeBtn}
                >
                  Customize
                </button>
              ) : null}
            </div>
          </aside>
        ) : (
          <aside
            style={{
              ...styles.sidebar,
              ...styles.customizeSidebarScrollable,
            }}
          >
            <div style={styles.sidebarScroll}>
              <div style={styles.customizeOptionalToolsHeading}>
                <span style={styles.customizeOptionalToolsTitle}>
                  Optional Tools
                </span>
                <span style={styles.customizeOptionalToolsNote}>
                  Use only when needed
                </span>
              </div>

              <section
                style={{
                  ...styles.sidebarSection,
                  ...styles.customizeOptionalSection,
                  ...(showCustomizeGuide && customizeGuideStep + 1 === 3
                    ? styles.customizeActiveSection
                    : {}),
                }}
              >
                <div style={styles.sectionRow}>
                  <label style={styles.label}>Edit Individual Parts</label>

                  <button
                    type="button"
                    aria-pressed={selectionMode}
                    onClick={() => {
                      const nextEnabled = !selectionMode;
                      setSelectionMode(nextEnabled);

                      if (nextEnabled) {
                        setCustomizeProgressStep((current) =>
                          Math.max(current, 3),
                        );
                        showCustomizeFeedback(
                          "Edit mode is on. Select a furniture part.",
                        );
                      } else {
                        setSelectedCompIds([]);
                        showCustomizeFeedback("Edit mode is off.");
                      }
                    }}
                    style={{
                      ...styles.editDesignBtn,
                      ...(selectionMode ? styles.editDesignBtnActive : {}),
                    }}
                  >
                    {selectionMode ? "EDITING ON" : "EDIT DESIGN"}
                  </button>
                </div>

                {selectionMode ? (
                  <>
                    <div style={styles.helperText}>
                      Editing mode is on. Select a part in the 3D preview, or
                      choose one from the list below.
                    </div>

                    <select
                      value={
                        selectedCompIds.length
                          ? String(
                              partGroups.findIndex((group) =>
                                group.ids.some((id) =>
                                  selectedCompIds.includes(id),
                                ),
                              ),
                            )
                          : ""
                      }
                      onChange={(e) => {
                        const index = Number(e.target.value);
                        if (!Number.isInteger(index) || index < 0) {
                          setSelectedCompIds([]);
                          return;
                        }

                        const group = partGroups[index];
                        setSelectedCompIds(group?.ids || []);
                        if (group?.ids?.length) {
                          showCustomizeFeedback("Furniture part selected.");
                        }
                      }}
                      style={styles.partGroupSelect}
                    >
                      <option value="">Choose a furniture part</option>
                      {partGroups.map((group, index) => (
                        <option key={`${group.label}_${index}`} value={index}>
                          {group.label} ({group.ids.length})
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div style={styles.helperTextMuted}>
                    Need to change a leg, shelf, or panel? Choose Edit Design,
                    then select the part you want to adjust.
                  </div>
                )}
              </section>

              {selectionMode &&
              selectedGroup.length > 0 &&
              sampleSelectedPart ? (
                <section
                  style={{
                    ...styles.sidebarSection,
                    ...(showCustomizeGuide && customizeGuideStep + 1 === 3
                      ? styles.customizeActiveSection
                      : {}),
                  }}
                >
                  <div style={styles.sectionRow}>
                    <label style={styles.label}>
                      Selected Parts: {selectedGroup.length}
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
                        onBlur={(e) =>
                          commitPartDimension("width", e.target.value)
                        }
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
                        onBlur={(e) =>
                          commitPartDimension("depth", e.target.value)
                        }
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
                <section
                  style={{
                    ...styles.sidebarSection,
                    ...styles.customizeSizeSection,
                    ...(showCustomizeGuide && customizeGuideStep + 1 === 2
                      ? styles.customizeActiveSection
                      : {}),
                  }}
                >
                  <div style={styles.sectionRow}>
                    <label style={styles.label}>Furniture Size ({unit})</label>
                    <span style={styles.pill}>Keeps proportions</span>
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
                          if (e.key === "Enter")
                            commitOverallDimension("width");
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
                          if (e.key === "Enter")
                            commitOverallDimension("height");
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
                          if (e.key === "Enter")
                            commitOverallDimension("depth");
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
                  ...styles.customizeFinishSection,
                  ...(readOnly || !editable.finish_color
                    ? styles.sidebarSectionDisabled
                    : {}),
                  ...(showCustomizeGuide && customizeGuideStep + 1 === 4
                    ? styles.customizeActiveSection
                    : {}),
                }}
              >
                <div style={styles.sectionRow}>
                  <label style={styles.label}>Finish & Color</label>
                  {selectedGroup.length > 0 ? (
                    <span style={styles.pill}>Applies to selection</span>
                  ) : null}
                </div>

                <div style={styles.inputGroup}>
                  <span style={styles.dimLabel}>Wood Finish</span>
                  <div ref={finishMenuRef} style={styles.finishDropdown}>
                    <button
                      type="button"
                      disabled={readOnly || !editable.finish_color}
                      aria-haspopup="listbox"
                      aria-expanded={finishMenuOpen}
                      onClick={() => setFinishMenuOpen((open) => !open)}
                      style={{
                        ...styles.finishSelectButton,
                        ...(readOnly || !editable.finish_color
                          ? styles.finishSelectButtonDisabled
                          : {}),
                      }}
                    >
                      <span style={styles.finishOptionContent}>
                        <span
                          aria-hidden="true"
                          style={{
                            ...styles.finishSwatch,
                            background:
                              activeWoodFinish?.front ||
                              activeWoodFinish?.carcass ||
                              "#ffffff",
                          }}
                        />
                        <span style={styles.finishOptionLabel}>
                          {activeWoodFinish?.label || "Original / Custom"}
                        </span>
                      </span>

                      <span style={styles.finishSelectChevron}>v</span>
                    </button>

                    {finishMenuOpen ? (
                      <div style={styles.finishMenu} role="listbox">
                        <button
                          type="button"
                          role="option"
                          aria-selected={!activeFinishId}
                          onClick={() => {
                            handleFinishChange("");
                            setFinishMenuOpen(false);
                          }}
                          style={{
                            ...styles.finishMenuItem,
                            ...(!activeFinishId
                              ? styles.finishMenuItemActive
                              : {}),
                          }}
                        >
                          <span style={styles.finishOptionContent}>
                            <span
                              aria-hidden="true"
                              style={{
                                ...styles.finishSwatch,
                                ...styles.finishSwatchOriginal,
                              }}
                            />
                            <span style={styles.finishOptionLabel}>
                              Original / Custom
                            </span>
                          </span>
                        </button>

                        {WOOD_FINISHES?.map((finish) => (
                          <button
                            key={finish.id}
                            type="button"
                            role="option"
                            aria-selected={activeFinishId === finish.id}
                            onClick={() => {
                              handleFinishChange(finish.id);
                              setFinishMenuOpen(false);
                            }}
                            style={{
                              ...styles.finishMenuItem,
                              ...(activeFinishId === finish.id
                                ? styles.finishMenuItemActive
                                : {}),
                            }}
                          >
                            <span style={styles.finishOptionContent}>
                              <span
                                aria-hidden="true"
                                style={{
                                  ...styles.finishSwatch,
                                  background:
                                    finish.front ||
                                    finish.carcass ||
                                    finish.inside ||
                                    "#dddddd",
                                }}
                              />
                              <span style={styles.finishOptionLabel}>
                                {finish.label}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
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

              <section
                style={{
                  ...styles.sidebarSection,
                  ...styles.customizeHumanSection,
                }}
              >
                <div style={styles.sectionRow}>
                  <label style={styles.label}>Human Size Reference</label>

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
              <div
                style={{
                  ...styles.sidebarFooter,
                  ...(showCustomizeGuide &&
                  (customizeGuideStep + 1 === 5 || customizeGuideStep + 1 === 6)
                    ? styles.customizeActiveFooter
                    : {}),
                }}
              >
                <div style={styles.footerHeader}>
                  <div>
                    <div style={styles.footerTitle}>Order Details</div>
                    <div style={styles.footerNote}>
                      Add reference photos or notes if needed.
                    </div>
                  </div>

                  <div style={styles.qtyBox}>
                    <button
                      type="button"
                      disabled={!editable.quantity}
                      onClick={() => {
                        setCustomizeProgressStep((current) =>
                          Math.max(current, 5),
                        );
                        setQuantity((prev) => Math.max(1, prev - 1));
                        showCustomizeFeedback("Quantity updated.");
                      }}
                      style={styles.qtyBtn}
                    >
                      −
                    </button>

                    <strong style={styles.qtyValue}>{quantity}</strong>

                    <button
                      type="button"
                      disabled={!editable.quantity}
                      onClick={() => {
                        setCustomizeProgressStep((current) =>
                          Math.max(current, 5),
                        );
                        setQuantity((prev) => Math.max(1, prev + 1));
                        showCustomizeFeedback("Quantity updated.");
                      }}
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
                      onChange={(event) => {
                        setCustomizeProgressStep((current) =>
                          Math.max(current, 5),
                        );
                        onPickReferencePhotos?.(event);
                        if (event.target.files?.length) {
                          showCustomizeFeedback("Photo selected.");
                        }
                      }}
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

                <div
                  style={{
                    ...styles.footerField,
                    ...styles.notesFooterField,
                  }}
                >
                  <label style={styles.footerLabel}>{commentsLabel}</label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={comments}
                    disabled={!editable.comments}
                    onChange={(e) => {
                      setComments(e.target.value);
                      if (String(e.target.value || "").trim()) {
                        setCustomizeProgressStep((current) =>
                          Math.max(current, 5),
                        );
                      }
                    }}
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
        )}
      </div>

      <style>{`
        @media (max-width: 960px) {
          .cust-mobile-hide {
            display: none !important;
          }
          .cust-mobile-controls {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 10px 12px !important;
          }
          .cust-mobile-control-row {
            grid-template-columns: 1fr !important;
            gap: 0 !important;
            display: block !important;
          }
          .cust-mobile-guide-dock {
            padding-top: 0 !important;
            margin: 0 !important;
            justify-items: end !important;
          }
          /* Anchors the popup card safely to the right edge so it doesn't spill off screen */
          .cust-mobile-guide-card {
            left: auto !important;
            right: 0 !important;
            width: min(340px, calc(100vw - 24px)) !important;
          }
        }
      `}</style>
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
    fontWeight: 600,
    letterSpacing: "0.06em",
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

  customizeProgressArea: {
    minWidth: 0,
    display: "grid",
    gap: 3,
    padding: 0,
    border: "none",
    alignSelf: "center",
  },

  customizeProgressHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },

  customizeProgressEyebrow: {
    fontSize: 9,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: "0.055em",
    textTransform: "uppercase",
    color: "#6b7280",
  },

  customizeProgressSummary: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 1.25,
    fontWeight: 700,
    color: "#111111",
  },

  customizeGuideHelpBtn: {
    minHeight: 30,
    padding: "0 12px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#111111",
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },

  customizeStepsScroll: {
    minWidth: 0,
    overflowX: "auto",
    overflowY: "hidden",
    paddingBottom: 1,
  },

  customizeSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(86px, 1fr))",
    minWidth: 580,
    gap: 0,
  },

  customizeStep: {
    minWidth: 0,
    display: "grid",
    gap: 5,
    alignContent: "start",
  },

  customizeStepRail: {
    display: "flex",
    alignItems: "center",
    minWidth: 0,
  },

  customizeStepBadge: {
    width: 28,
    height: 28,
    flex: "0 0 28px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #cfd3d8",
    borderRadius: 0,
    background: "#ffffff",
    color: "#8a9098",
    fontSize: 11,
    lineHeight: 1,
    fontWeight: 700,
    boxSizing: "border-box",
  },

  customizeStepBadgeComplete: {
    borderColor: "#111111",
    background: "#111111",
    color: "#ffffff",
  },

  customizeStepBadgeActive: {
    border: "1px solid #111111",
    background: "#111111",
    color: "#ffffff",
  },

  customizeStepLine: {
    height: 1,
    flex: 1,
    minWidth: 18,
    background: "#d9dde2",
  },

  customizeStepLineComplete: {
    background: "#111111",
  },

  customizeStepLabel: {
    paddingRight: 8,
    fontSize: 10,
    lineHeight: 1.25,
    fontWeight: 500,
    color: "#969ca4",
    whiteSpace: "nowrap",
  },

  customizeStepLabelReached: {
    color: "#111111",
    fontWeight: 700,
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
    fontWeight: 600,
    cursor: "pointer",
  },

  unitBtnDivider: {
    borderRight: "1px solid #d9d9d9",
  },

  unitBtnActive: {
    background: "#111111",
    color: "#ffffff",
    fontWeight: 700,
  },

  viewerShell: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 340px",
    height: "clamp(500px, 66vh, 600px)",
    minHeight: 500,
    border: "1px solid #d9dee4",
    background: "#ffffff",
    overflow: "hidden",
  },

  customizeViewerShell: {
    gridTemplateColumns: "minmax(0, 1fr) 350px",
    height: "min(735px, calc(100vh - 178px))",
    minHeight: 0,
  },

  rightShiftFillSpaceV10: {
    minHeight: 0,
    boxSizing: "border-box",
  },

  rightShiftMoreV10_1: {
    minHeight: 0,
    boxSizing: "border-box",
  },

  noScrollDesktopFit: {
    boxSizing: "border-box",
  },

  canvasWrap: {
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    background: "#f7f7f7",
  },

  customizeCanvasWrap: {
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    overflow: "visible",
  },

  customizeViewerControls: {
    minWidth: 0,
    position: "relative",
    zIndex: 20,
    display: "grid",
    gap: 8,
    padding: "8px 12px 9px",
    borderBottom: "none",
    background: "#f7f7f7",
    boxSizing: "border-box",
  },

  customizeViewerControlRow: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    alignItems: "start",
    gap: 14,
  },

  customizeGuideDock: {
    minWidth: 0,
    position: "relative",
    display: "grid",
    justifyItems: "start",
    gap: 8,
    paddingTop: 1,
  },

  customizeCanvasStage: {
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
    background: "#f7f7f7",
  },

  canvasContainer: {
    width: "100%",
    height: "100%",
    minHeight: 0,
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
    border: "none",
    background: "transparent",
    boxSizing: "border-box",
  },

  cameraToolbarInline: {
    position: "static",
    top: "auto",
    left: "auto",
    zIndex: 1,
    alignSelf: "center",
  },

  cameraBtn: {
    minWidth: 48,
    height: 34,
    padding: "0 12px",
    border: "1px solid #cfcfcf",
    borderRight: "none",
    background: "#ffffff",
    color: "#111111",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    boxSizing: "border-box",
  },

  cameraBtnActive: {
    background: "#111111",
    color: "#ffffff",
    fontWeight: 700,
  },

  cameraBtnLast: {
    borderRight: "1px solid #cfcfcf",
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

  viewSidebarScroll: {
    minHeight: 0,
    overflowY: "auto",
    padding: "18px 16px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  viewDetailsCard: {
    border: "none",
    background: "transparent",
    padding: 0,
  },

  viewDetailsTitle: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.3,
    fontWeight: 700,
    color: "#111111",
  },

  viewDetailsNote: {
    margin: "6px 0 0",
    fontSize: 13,
    lineHeight: 1.55,
    fontWeight: 400,
    color: "#6b7280",
  },

  viewDetailsDivider: {
    height: 1,
    background: "#e5e7eb",
    margin: "15px 0",
  },

  viewDetailsGroup: {
    display: "grid",
    gap: 0,
  },

  viewDetailsGroupTitle: {
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 600,
    color: "#333333",
  },

  viewDetailRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    minHeight: 40,
    borderBottom: "1px solid #eeeeee",
  },

  viewDetailRowLast: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    minHeight: 40,
  },

  viewDetailLabel: {
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 400,
    color: "#6b7280",
  },

  viewDetailValue: {
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 600,
    color: "#111111",
    textAlign: "right",
  },

  viewCustomizeBtn: {
    width: "100%",
    minHeight: 44,
    padding: "0 16px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#111111",
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 1,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  sidebar: {
    minWidth: 0,
    minHeight: 0,
    borderLeft: "1px solid #d9dee4",
    backgroundColor: "#ffffff",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    overflow: "hidden",
  },

  customizeSidebarScrollable: {
    display: "block",
    minHeight: 0,
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehaviorY: "contain",
    scrollbarGutter: "stable",
  },

  fullHeightNoScrollLayout: {
    minHeight: 0,
    height: "100%",
  },

  sidebarScroll: {
    minHeight: 0,
    overflow: "visible",
    padding: "7px 8px 6px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridAutoRows: "max-content",
    alignContent: "start",
    gap: 6,
  },

  uniformControlWidth: {
    width: "100%",
    boxSizing: "border-box",
  },

  customizeSidebarSectionWide: {
    gridColumn: "1 / -1",
  },

  customizeIntroSection: {
    gridColumn: "1 / -1",
    order: 1,
    border: "none",
    background: "transparent",
    padding: "0 1px 2px",
  },

  customizeCurrentStepCard: {
    display: "grid",
    gap: 4,
    marginTop: 3,
    padding: "7px 8px",
    border: "none",
    background: "#f5f5f5",
    boxShadow: "inset 3px 0 0 #111111",
  },

  customizeCurrentStepMeta: {
    fontSize: 8.75,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: "0.055em",
    color: "#6b7280",
  },

  customizeCurrentStepTitle: {
    fontSize: 12,
    lineHeight: 1.25,
    fontWeight: 700,
    color: "#111111",
  },

  customizeCurrentStepInstruction: {
    fontSize: 10.25,
    lineHeight: 1.45,
    fontWeight: 400,
    color: "#4b5563",
  },

  customizeFeedback: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
    fontSize: 9.75,
    lineHeight: 1.3,
    fontWeight: 600,
    color: "#111111",
  },

  customizeFeedbackIcon: {
    width: 15,
    height: 15,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 15px",
    background: "#111111",
    color: "#ffffff",
    fontSize: 8,
    fontWeight: 700,
  },

  customizeGuideCard: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    zIndex: 40,
    width: "min(430px, calc(100vw - 80px))",
    display: "grid",
    gap: 8,
    marginTop: 0,
    padding: "10px 12px",
    border: "1px solid #111111",
    background: "#ffffff",
    boxSizing: "border-box",
  },

  customizeGuideCardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  customizeGuideStepMeta: {
    fontSize: 9,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "#6b7280",
  },

  customizeGuideTitle: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 1.3,
    fontWeight: 700,
    color: "#111111",
  },

  customizeGuideInstruction: {
    fontSize: 12,
    lineHeight: 1.55,
    fontWeight: 400,
    color: "#374151",
  },

  customizeGuideSkipBtn: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "#6b7280",
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },

  customizeGuideActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },

  customizeGuideSecondaryBtn: {
    minHeight: 29,
    padding: "0 10px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  customizeGuidePrimaryBtn: {
    minHeight: 29,
    padding: "0 12px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#111111",
    color: "#ffffff",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  customizeSizeSection: {
    gridColumn: "1 / -1",
    order: 2,
  },

  customizeFinishSection: {
    gridColumn: "1 / -1",
    order: 3,
  },

  customizeOptionalToolsHeading: {
    gridColumn: "1 / -1",
    order: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "1px 1px 0",
    minHeight: 18,
  },

  customizeOptionalToolsTitle: {
    fontSize: 12,
    lineHeight: 1.3,
    fontWeight: 700,
    color: "#111111",
  },

  customizeOptionalToolsNote: {
    fontSize: 10,
    lineHeight: 1.3,
    fontWeight: 400,
    color: "#7a7f87",
  },

  customizeOptionalSection: {
    order: 5,
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    minHeight: 72,
    height: "100%",
  },

  customizeHumanSection: {
    order: 6,
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    minHeight: 72,
    height: "100%",
  },

  sidebarSection: {
    display: "grid",
    gap: 4,
    padding: "7px",
    border: "1px solid #e2e5e9",
    background: "#ffffff",
    alignContent: "start",
    boxSizing: "border-box",
  },

  sidebarSectionActive: {
    border: "1px solid #111111",
  },

  customizeActiveSection: {
    border: "2px solid #111111",
    background: "#ffffff",
    boxShadow: "none",
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
    fontSize: 13,
    lineHeight: 1.25,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "none",
    color: "#111111",
  },

  sidebarSectionNote: {
    margin: 0,
    fontSize: 10.25,
    lineHeight: 1.3,
    fontWeight: 400,
    color: "#6b7280",
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
    fontSize: 11.5,
    lineHeight: 1.25,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "none",
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

  editDesignBtn: {
    minHeight: 28,
    padding: "0 9px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 9.5,
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: "0.02em",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },

  editDesignBtnActive: {
    background: "#111111",
    color: "#ffffff",
  },

  helperText: {
    fontSize: 10.5,
    lineHeight: 1.35,
    color: "#111111",
    border: "1px dashed #cbd5e1",
    background: "#fafafa",
    padding: "6px 7px",
  },

  helperTextMuted: {
    fontSize: 9.75,
    lineHeight: 1.28,
    fontWeight: 400,
    color: "#6b7280",
    background: "transparent",
    border: "none",
    padding: 0,
  },

  partGroupSelect: {
    width: "100%",
    height: 34,
    minHeight: 34,
    padding: "0 9px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 11,
    fontWeight: 600,
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
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
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: "0.01em",
    textTransform: "none",
    color: "#4b5563",
    background: "#f3f4f6",
    padding: "4px 6px",
    whiteSpace: "nowrap",
  },

  dimensionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 5,
  },

  inputGroup: {
    display: "grid",
    gap: 3,
  },

  dimLabel: {
    fontSize: 10.5,
    color: "#6b7280",
    display: "block",
    fontWeight: 600,
    letterSpacing: "0.01em",
    textTransform: "none",
  },

  input: {
    width: "100%",
    height: 34,
    minHeight: 34,
    padding: "0 9px",
    borderRadius: 0,
    border: "1px solid #111111",
    fontSize: 11.5,
    outline: "none",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#111111",
  },

  finishDropdown: {
    position: "relative",
    width: "100%",
    minWidth: 0,
    zIndex: 25,
  },

  finishSelectButton: {
    width: "100%",
    height: 34,
    minHeight: 34,
    padding: "0 8px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 11.5,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    boxSizing: "border-box",
  },

  finishSelectButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },

  finishOptionContent: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  finishSwatch: {
    width: 18,
    height: 18,
    minWidth: 18,
    flex: "0 0 18px",
    border: "1px solid #9ca3af",
    boxSizing: "border-box",
    background: "#ffffff",
  },

  finishSwatchOriginal: {
    background:
      "linear-gradient(135deg, #ffffff 0%, #ffffff 48%, #d1d5db 49%, #d1d5db 51%, #ffffff 52%, #ffffff 100%)",
  },

  finishOptionLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "left",
  },

  finishSelectChevron: {
    flex: "0 0 auto",
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
  },

  finishMenu: {
    position: "absolute",
    top: "calc(100% + 2px)",
    left: 0,
    right: 0,
    zIndex: 80,
    maxHeight: 260,
    overflowY: "auto",
    border: "1px solid #111111",
    background: "#ffffff",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
    padding: 0,
  },

  finishMenuItem: {
    width: "100%",
    minHeight: 34,
    padding: "6px 8px",
    border: "none",
    borderBottom: "1px solid #eeeeee",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    display: "flex",
    alignItems: "center",
    fontSize: 11.5,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    textAlign: "left",
    boxSizing: "border-box",
  },

  finishMenuItemActive: {
    background: "#f3f4f6",
    fontWeight: 700,
  },
  colorPickerRow: {
    display: "grid",
    gridTemplateColumns: "36px minmax(0, 1fr)",
    gap: 6,
    alignItems: "center",
  },

  colorPicker: {
    width: 36,
    minWidth: 36,
    height: 34,
    padding: 0,
    border: "1px solid #111111",
    borderRadius: 0,
    cursor: "pointer",
    overflow: "hidden",
    background: "none",
  },

  sidebarFooter: {
    minHeight: 0,
    height: "auto",
    overflow: "visible",
    borderTop: "1px solid #d9dee4",
    borderRight: "1px solid transparent",
    borderBottom: "1px solid transparent",
    borderLeft: "1px solid transparent",
    background: "#ffffff",
    padding: "8px 9px 12px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "auto auto auto auto",
    rowGap: 8,
    alignItems: "start",
  },

  customizeActiveFooter: {
    borderTop: "2px solid #111111",
    borderRight: "2px solid #111111",
    borderBottom: "2px solid #111111",
    borderLeft: "2px solid #111111",
    background: "#ffffff",
    boxShadow: "none",
  },

  orderDetailsStackedUniform: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    boxSizing: "border-box",
  },

  orderDetailsStackedUniform: {
    width: "100%",
    boxSizing: "border-box",
  },

  footerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    minHeight: 32,
  },

  footerTitle: {
    fontSize: 12.5,
    lineHeight: 1.25,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "none",
    color: "#111111",
  },

  footerNote: {
    fontSize: 10.25,
    lineHeight: 1.3,
    fontWeight: 400,
    color: "#6b7280",
    marginTop: 1,
  },

  qtyBox: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    border: "1px solid #111111",
    background: "#ffffff",
    width: 100,
    height: 32,
    flex: "0 0 auto",
  },

  qtyBtn: {
    width: 31,
    height: 30,
    border: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 12,
    cursor: "pointer",
  },

  qtyValue: {
    minWidth: 38,
    textAlign: "center",
    fontSize: 12,
    fontWeight: 600,
    color: "#111111",
  },

  footerField: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 3,
    width: "100%",
    minHeight: 0,
    minWidth: 0,
    alignContent: "start",
  },

  notesFooterField: {
    height: "auto",
    gridTemplateRows: "auto auto",
    alignContent: "start",
  },

  footerLabel: {
    fontSize: 11.5,
    lineHeight: 1.25,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "none",
    color: "#111111",
  },

  uploadHeader: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 3,
    width: "100%",
  },

  uploadHint: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: 600,
  },

  uploadButton: {
    width: "100%",
    height: 34,
    minHeight: 34,
    padding: "0 12px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 11.5,
    lineHeight: 1,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    boxSizing: "border-box",
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
    minHeight: 92,
    height: 92,
    resize: "vertical",
    borderRadius: 0,
    border: "1px solid #111111",
    padding: "8px 9px",
    font: "inherit",
    fontSize: 11.5,
    lineHeight: 1.35,
    boxSizing: "border-box",
    outline: "none",
    background: "#ffffff",
    color: "#111111",
    alignSelf: "start",
  },

  applyBtn: {
    width: "100%",
    height: 36,
    minHeight: 36,
    margin: 0,
    borderRadius: 0,
    border: "1px solid #111111",
    background: "#111111",
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 1,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    boxSizing: "border-box",
  },

  balancedActionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
};
