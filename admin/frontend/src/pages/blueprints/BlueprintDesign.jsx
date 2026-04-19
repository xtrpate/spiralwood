// BlueprintDesign.jsx — Main component (orchestrates all modules)
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Line,
  Arrow,
  Group,
  Circle,
  Image as KonvaImage,
} from "react-konva";
import api from "../../services/api";
import toast from "react-hot-toast";

// ── Data & Types ──────────────────────────────────────────────────────────────
import {
  COMPONENT_LIBRARY_GROUPS,
  VIEWS,
  EXPORT_VIEWS,
  FURNITURE_TEMPLATE_SET,
  QUICK_LIBRARY_COMPONENTS,
  CHAIR_PART_SET,
  CASEWORK_SET,
  TABLE_SET,
  BENCH_SET,
  ROOM_FURNITURE_COMPONENT_TYPES,
  CABINET_COMPONENT_TYPES,
  CHAIR_TEMPLATE_TYPES,
  CHAIR_PART_TYPES,
  WOOD_FINISHES,
} from "./data/furnitureTypes";
import {
  normalizeComponent,
  getComponentsBounds3D,
  get2DBounds,
  getProjectedBox,
  getSelectionGroup,
  isChairPartType,
  applyWoodFinish,
  isWoodLikeMaterial,
  getDefaultFinishId,
  getNextChairOrigin,
  getChairGroupOrigin,
  shouldMirrorView,
  getMirroredBox,
  createAssemblyPart,
  getNextAssemblyOrigin,
} from "./data/componentUtils";
import {
  snap,
  makeId,
  makeGroupId,
  clamp,
  cloneComponents,
  mmToDisplay,
  displayToMm,
  formatDims,
  getNowStamp,
  resolveAssetUrl,
  isImageReferenceFile,
  createEmptyReferenceFiles,
  getReferenceFilesFromBlueprint,
  getReferenceFileFromBlueprint,
  getEditorMode,
} from "./data/utils";
import {
  resolveInitialComponents,
  useReferenceImage,
} from "./data/initHelpers";
import {
  createDiningTableTemplateComponents,
  createBedTemplateComponents,
  createWardrobeTemplateComponents,
  createCoffeeTableTemplateComponents,
  createDiningChairTemplateComponents,
  buildFurnitureTemplateParts,
  buildDiningChairParts,
  createImportedFurnitureComponents,
  createImportedDiningChairComponents,
} from "./data/templateComponents";

// ── Export / Print ────────────────────────────────────────────────────────────
import {
  buildAllExportPages,
  buildBlueprintDocumentHtml,
} from "./export/exportBuilders";
import {
  getChairManualPlacement,
  getScaledExportItems,
} from "./export/placementHelpers";

// ── 2D Blueprint Rendering ────────────────────────────────────────────────────
import {
  DimensionLine,
  BlueprintTitleBlock,
  BlueprintPaper,
  Canvas2D,
} from "./2d/blueprintComponents";

// ── 3D Viewer ─────────────────────────────────────────────────────────────────
import { ThreeDViewer } from "./3d/threeDViewer";

// ── Styles ────────────────────────────────────────────────────────────────────
import S from "./styles/blueprintStyles";

// ── Constants ─────────────────────────────────────────────────────────────────
const GRID_SIZE = 20;
const BOARD = 18;
const PAPER_MARGIN = 28;
const TITLE_BLOCK_H = 96;
const DRAWING_PADDING = 56;
const MM_PER_INCH = 25.4;
const FLOOR_OFFSET = 40;
const EXPORT_PAGE_W = 1200;
const EXPORT_PAGE_H = 820;
const WORLD_W = 8000;
const WORLD_H = 5000;
const WORLD_D = 8000;

const DEFAULT_IMPORT_TEMPLATE_TYPE = "template_closet_wardrobe";
const DEFAULT_IMPORT_DIMENSIONS = { w: 2400, h: 2400, d: 600 };
const CREATE_TEMPLATE_TYPE_MAP = {
  cabinet: "template_closet_wardrobe",
  table: "template_dining_table",
  bed: "template_bed_frame",
  chair: "template_dining_chair",
  coffee_table: "template_coffee_table",
};

const TRACE_TYPE_OPTIONS = [
  { value: "drawer", label: "Drawer Section" },
  { value: "door", label: "Door Section" },
  { value: "body", label: "Body Only" },
];

const TRACE_TYPE_LABELS = {
  drawer: "Drawer Section",
  door: "Door Section",
  body: "Body Only",
};

const REFERENCE_TRACE_VIEWS = ["front", "back", "left", "right", "top"];

function createEmptyReferenceCalibrationByView() {
  return REFERENCE_TRACE_VIEWS.reduce((acc, viewKey) => {
    acc[viewKey] = normalizeReferenceCalibration();
    return acc;
  }, {});
}

function createEmptyTraceObjectsByView() {
  return REFERENCE_TRACE_VIEWS.reduce((acc, viewKey) => {
    acc[viewKey] = [];
    return acc;
  }, {});
}

function normalizeReferenceCalibrationByView(value = {}) {
  const next = createEmptyReferenceCalibrationByView();

  const hasViewMap =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    REFERENCE_TRACE_VIEWS.some((viewKey) => value?.[viewKey]);

  if (hasViewMap) {
    REFERENCE_TRACE_VIEWS.forEach((viewKey) => {
      next[viewKey] = normalizeReferenceCalibration(value?.[viewKey]);
    });
    return next;
  }

  next.front = normalizeReferenceCalibration(value);
  return next;
}

function normalizeTraceObjectsByView(value = {}) {
  const next = createEmptyTraceObjectsByView();

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const viewKey = normalizeTraceView(
        item?.view || item?.traceView || item?.projectionView || "front",
      );
      next[viewKey].push(normalizeTraceObject(item, viewKey));
    });
    return next;
  }

  REFERENCE_TRACE_VIEWS.forEach((viewKey) => {
    next[viewKey] = normalizeTraceObjects(value?.[viewKey], viewKey);
  });

  return next;
}

function flattenTraceObjectsByView(value = {}) {
  return REFERENCE_TRACE_VIEWS.flatMap((viewKey) =>
    normalizeTraceObjects(value?.[viewKey], viewKey),
  );
}

function normalizeReferenceCalibration(value = {}) {
  const rawPoints = Array.isArray(value?.points)
    ? value.points.slice(0, 2)
    : [];

  const points = rawPoints
    .map((point) => ({
      x: Number(point?.x) || 0,
      y: Number(point?.y) || 0,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  const realDistanceMm = Math.max(0, Number(value?.realDistanceMm) || 0);
  const pixelsPerMm = Math.max(0, Number(value?.pixelsPerMm) || 0);

  return {
    points,
    realDistanceMm,
    pixelsPerMm,
    isCalibrated:
      points.length === 2 &&
      realDistanceMm > 0 &&
      pixelsPerMm > 0 &&
      Boolean(value?.isCalibrated),
  };
}

function normalizeTraceView(rawView = "front") {
  const value = String(rawView || "front").toLowerCase();

  if (value === "back") return "back";
  if (value === "left") return "left";
  if (value === "right") return "right";
  if (value === "top") return "top";
  return "front";
}

function normalizeProjectionView(rawView = "front") {
  const value = normalizeTraceView(rawView);

  if (value === "back") return "front";
  if (value === "right") return "left";
  return value;
}

function normalizeTraceObject(obj = {}, fallbackView = "front") {
  const view = normalizeTraceView(
    obj?.view || obj?.traceView || obj?.projectionView || fallbackView,
  );

  const type = ["drawer", "door", "body"].includes(obj?.type)
    ? obj.type
    : ["drawer", "door", "body"].includes(obj?.traceType)
      ? obj.traceType
      : "door";

  const width = Math.max(GRID_SIZE, snap(Number(obj?.width) || 0));
  const height = Math.max(GRID_SIZE, snap(Number(obj?.height) || 0));

  return {
    id: obj?.id || makeId(),
    type,
    traceType: type,
    label: obj?.label || TRACE_TYPE_LABELS[type] || "Trace Object",
    x: snap(Number(obj?.x) || 0),
    y: snap(Number(obj?.y) || 0),
    width,
    height,
    view,
    traceView: view,
    projectionView: normalizeProjectionView(view),
  };
}

function normalizeTraceObjects(list = [], fallbackView = "front") {
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => normalizeTraceObject(item, fallbackView))
    .filter((item) => item.width > 0 && item.height > 0);
}

function sanitizeReferenceFile(file) {
  if (!file?.url) return null;

  const type = String(file?.type || file?.file_type || "")
    .trim()
    .toLowerCase();

  if (!type) return null;

  return {
    url: file.url,
    type,
    name: file.name || "Reference File",
    source: file.source || "imported",
  };
}
function isLikelyChairReference({
  importTemplateType,
  importDimensions,
  traceObjectsByView,
}) {
  const dims = {
    w: Number(importDimensions?.w) || 0,
    h: Number(importDimensions?.h) || 0,
    d: Number(importDimensions?.d) || 0,
  };

  const perViewCounts = REFERENCE_TRACE_VIEWS.map(
    (viewKey) => (traceObjectsByView?.[viewKey] || []).length,
  );

  const hasSingleOutlinePerView = perViewCounts.every((count) => count === 1);

  const compactChairSized =
    dims.w > 0 &&
    dims.h > 0 &&
    dims.d > 0 &&
    dims.w <= 1100 &&
    dims.h <= 1400 &&
    dims.d <= 1100;

  const explicitChairTemplate = [
    "chair_template",
    "template_dining_chair",
    "template_accent_chair",
    "template_lounge_chair",
  ].includes(importTemplateType);

  return (
    explicitChairTemplate || (compactChairSized && hasSingleOutlinePerView)
  );
}

function sanitizeReferenceFiles(files = {}) {
  return {
    front: sanitizeReferenceFile(files?.front),
    back: sanitizeReferenceFile(files?.back),
    left: sanitizeReferenceFile(files?.left),
    right: sanitizeReferenceFile(files?.right),
    top: sanitizeReferenceFile(files?.top),
  };
}

function resolveImportTemplateType(savedData = {}, blueprintData = {}) {
  return (
    savedData?.importTemplateType ||
    savedData?.import_type ||
    blueprintData?.import_template_type ||
    DEFAULT_IMPORT_TEMPLATE_TYPE
  );
}

function sanitizeImportDimensions(
  source = {},
  fallback = DEFAULT_IMPORT_DIMENSIONS,
) {
  return {
    w: Math.max(
      GRID_SIZE,
      snap(Number(source?.w ?? source?.width ?? fallback.w) || fallback.w),
    ),
    h: Math.max(
      GRID_SIZE,
      snap(Number(source?.h ?? source?.height ?? fallback.h) || fallback.h),
    ),
    d: Math.max(
      GRID_SIZE,
      snap(Number(source?.d ?? source?.depth ?? fallback.d) || fallback.d),
    ),
  };
}

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const createObjectId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `obj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function openBlueprintWindow(html, autoPrint = false) {
  const win = window.open(
    "about:blank",
    "_blank",
    "width=1280,height=900,resizable=yes,scrollbars=yes",
  );

  if (!win) {
    toast.error("Popup blocked. I-allow ang popups para sa export/print.");
    return false;
  }

  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (err) {
    console.error("openBlueprintWindow write error:", err);
    toast.error("Failed to prepare export/print window.");
    try {
      win.close();
    } catch {}
    return false;
  }

  try {
    win.opener = null;
  } catch {}

  const triggerPrint = () => {
    if (!autoPrint || win.closed) return;

    const run = () => {
      try {
        win.focus();
        setTimeout(() => {
          try {
            win.print();
          } catch (printErr) {
            console.error("print error:", printErr);
            toast.error("Failed to open print dialog.");
          }
        }, 250);
      } catch (focusErr) {
        console.error("focus/print error:", focusErr);
      }
    };

    if (win.document.readyState === "complete") {
      run();
      return;
    }

    win.addEventListener(
      "load",
      () => {
        run();
      },
      { once: true },
    );
  };

  triggerPrint();
  return true;
}

export default function BlueprintDesign() {
  const { id } = useParams();
  const navigate = useNavigate();

  const WORLD_W = 6400;
  const WORLD_H = 3200;
  const WORLD_D = 5200;

  const SHEET_W = 900;
  const SHEET_H = 580;

  const [blueprint, setBlueprint] = useState(null);
  const [components, setComponents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [clipboardObject, setClipboardObject] = useState(null);
  const [edit3DId, setEdit3DId] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("front");
  const [lockedFields, setLockedFields] = useState([]);
  const [transformMode, setTransformMode] = useState("translate");
  const [unit, setUnit] = useState("mm");
  const [activeChairBuild, setActiveChairBuild] = useState(null);
  const [referenceFiles, setReferenceFiles] = useState(
    createEmptyReferenceFiles(),
  );
  const [referenceFile, setReferenceFile] = useState(null);
  const [editorMode, setEditorMode] = useState("editable");
  const [importTemplateType, setImportTemplateType] = useState(
    DEFAULT_IMPORT_TEMPLATE_TYPE,
  );
  const [importDimensions, setImportDimensions] = useState(
    DEFAULT_IMPORT_DIMENSIONS,
  );
  const [importComments, setImportComments] = useState("");
  const [pendingPlacement, setPendingPlacement] = useState(null);

  // --- Publish to Catalog State ---
  const [publishModal, setPublishModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishForm, setPublishForm] = useState({
    name: blueprint?.title || "",
    description: "Custom 3D designed product.",
    category_id: "2",
    type: "blueprint",
    online_price: 0,
    production_cost: "0",
    stock: "999",
  });

  // ── Undo / Redo history ──────────────────────────────────────────────────
  const historyRef = useRef([]); // past snapshots
  const futureRef = useRef([]); // redo snapshots
  const skipHistoryRef = useRef(false); // skip next push (used on undo/redo itself)
  const [referenceCalibrationByView, setReferenceCalibrationByView] = useState(
    createEmptyReferenceCalibrationByView(),
  );

  const [traceObjectsByView, setTraceObjectsByView] = useState(
    createEmptyTraceObjectsByView(),
  );

  const [traceTool, setTraceTool] = useState("select");
  const [selectedTraceId, setSelectedTraceId] = useState(null);
  const designTotal = useMemo(() => {
    return components.reduce(
      (sum, c) => sum + Number(c.qty || 1) * Number(c.unitPrice || 0),
      0,
    );
  }, [components]);
  const [newTraceType, setNewTraceType] = useState("door");
  // Call this before any destructive setComponents to record the current state
  const pushHistory = useCallback((snapshot) => {
    if (skipHistoryRef.current) return;
    historyRef.current = [...historyRef.current.slice(-49), snapshot]; // keep last 50
    futureRef.current = [];
  }, []);

  const handleUndo = useCallback(() => {
    if (!historyRef.current.length) {
      toast("Nothing to undo.");
      return;
    }

    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [components, ...futureRef.current.slice(0, 49)];

    skipHistoryRef.current = true;
    setComponents(prev);
    setSelectedId(null);
    setSelectedIds([]);
    setEdit3DId(null);
    skipHistoryRef.current = false;

    toast.success("Undo");
  }, [components]);

  const handleRedo = useCallback(() => {
    if (!futureRef.current.length) {
      toast("Nothing to redo.");
      return;
    }

    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    historyRef.current = [...historyRef.current, components];

    skipHistoryRef.current = true;
    setComponents(next);
    setSelectedId(null);
    setSelectedIds([]);
    setEdit3DId(null);
    skipHistoryRef.current = false;

    toast.success("Redo");
  }, [components]);
  // ─────────────────────────────────────────────────────────────────────────
  const isLocked = useCallback(
    (comp) =>
      comp?.locked ||
      lockedFields.includes(comp?.type) ||
      lockedFields.includes("all"),
    [lockedFields],
  );

  const removeSelected = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error(
        "Reference mode ito. Walang editable components na puwedeng burahin.",
      );
      return;
    }

    const idsToRemove = new Set(
      selectedIds.length > 0 ? selectedIds : [selectedId].filter(Boolean),
    );

    if (!idsToRemove.size) return;

    const hasLocked = components.some(
      (c) => idsToRemove.has(c.id) && isLocked(c),
    );

    if (hasLocked) {
      toast.error("Cannot delete. One or more selected components are locked.");
      return;
    }

    pushHistory(components);
    setComponents((prev) => prev.filter((c) => !idsToRemove.has(c.id)));
    setSelectedId(null);
    setSelectedIds([]);
    setEdit3DId(null);

    toast.success(`Deleted ${idsToRemove.size} object(s).`);
  }, [editorMode, selectedId, selectedIds, components, isLocked, pushHistory]);

  useEffect(() => {
    const validIdSet = new Set(components.map((c) => c.id));
    const filteredSelectedIds = (selectedIds || []).filter((id) =>
      validIdSet.has(id),
    );

    if (filteredSelectedIds.length !== (selectedIds || []).length) {
      setSelectedIds(filteredSelectedIds);
    }

    if (!components.length) {
      if (selectedId) setSelectedId(null);
      if (selectedIds.length) setSelectedIds([]);
      if (edit3DId) setEdit3DId(null);
      return;
    }

    const nextPrimary =
      selectedId && validIdSet.has(selectedId)
        ? selectedId
        : filteredSelectedIds[filteredSelectedIds.length - 1] || null;

    if (selectedId !== nextPrimary) {
      setSelectedId(nextPrimary);
    }

    if (!nextPrimary && edit3DId) {
      setEdit3DId(null);
    } else if (nextPrimary && (!edit3DId || !validIdSet.has(edit3DId))) {
      setEdit3DId(nextPrimary);
    }
  }, [components, selectedId, selectedIds, edit3DId]);

  useEffect(() => {
    if (!id || id === "new") {
      setReferenceFiles(createEmptyReferenceFiles());
      setReferenceFile(null);
      setEditorMode("editable");
      setImportTemplateType(DEFAULT_IMPORT_TEMPLATE_TYPE);
      setImportDimensions(DEFAULT_IMPORT_DIMENSIONS);
      setImportComments("");

      setView("front");
      setComponents([]);
      setSelectedId(null);
      setEdit3DId(null);
      setReferenceCalibrationByView(createEmptyReferenceCalibrationByView());
      setTraceObjectsByView(createEmptyTraceObjectsByView());
      setSelectedTraceId(null);
      return;
    }

    api
      .get(`/blueprints/${id}`)
      .then((r) => {
        setBlueprint(r.data);

        let parsedLockedFields = [];
        let saved = {};

        try {
          parsedLockedFields = JSON.parse(r.data.locked_fields || "[]");
        } catch (err) {
          console.error("Invalid locked_fields JSON:", err);
          parsedLockedFields = [];
        }

        try {
          saved = JSON.parse(r.data.design_data || "{}");
        } catch (err) {
          console.error("Invalid design_data JSON:", err);
          saved = {};
        }

        const loadedTemplateType = resolveImportTemplateType(saved, r.data);
        const loadedImportDimensions = sanitizeImportDimensions(
          saved.importDimensions ||
            saved.referenceDimensions ||
            r.data.import_dimensions ||
            r.data.reference_dimensions ||
            DEFAULT_IMPORT_DIMENSIONS,
          DEFAULT_IMPORT_DIMENSIONS,
        );

        const loadedReferenceFiles = getReferenceFilesFromBlueprint(
          saved,
          r.data,
        );
        const refFile = getReferenceFileFromBlueprint(saved, r.data, "front");
        const resolvedMode = getEditorMode(saved, loadedReferenceFiles);

        let loadedComponents = resolveInitialComponents(
          {
            ...saved,
            importTemplateType: loadedTemplateType,
            importDimensions: loadedImportDimensions,
          },
          refFile,
          r.data,
          {
            w: WORLD_W,
            h: WORLD_H,
            d: WORLD_D,
          },
        );

        const loadedStartMode =
          saved.startMode || saved?.blueprintSetup?.startMode || "scratch";

        const loadedFurnitureType =
          saved.furnitureType ||
          saved?.blueprintSetup?.furnitureType ||
          "cabinet";

        if (!loadedComponents.length && loadedStartMode === "template") {
          const templateType =
            CREATE_TEMPLATE_TYPE_MAP[loadedFurnitureType] ||
            DEFAULT_IMPORT_TEMPLATE_TYPE;

          loadedComponents =
            templateType === "template_dining_chair"
              ? createImportedDiningChairComponents(
                  {
                    importTemplateType: templateType,
                    importDimensions: loadedImportDimensions,
                  },
                  null,
                  { title: r.data.title || "Chair Template" },
                  { w: WORLD_W, h: WORLD_H, d: WORLD_D },
                )
              : createImportedFurnitureComponents(
                  {
                    importTemplateType: templateType,
                    importDimensions: loadedImportDimensions,
                  },
                  null,
                  {
                    title: r.data.title || "Furniture Template",
                    import_template_type: templateType,
                  },
                  { w: WORLD_W, h: WORLD_H, d: WORLD_D },
                );
        }

        setLockedFields(
          Array.isArray(parsedLockedFields) ? parsedLockedFields : [],
        );
        setComponents(loadedComponents);
        setSelectedId(loadedComponents[0]?.id || null);
        setEdit3DId(null);
        setUnit(saved.unit || "mm");
        setReferenceFiles(loadedReferenceFiles);
        setReferenceFile(
          loadedReferenceFiles?.front ||
            loadedReferenceFiles?.back ||
            loadedReferenceFiles?.left ||
            loadedReferenceFiles?.right ||
            loadedReferenceFiles?.top ||
            refFile ||
            null,
        );
        setEditorMode(resolvedMode);
        setImportTemplateType(loadedTemplateType);
        setImportDimensions(loadedImportDimensions);
        setImportComments(saved.importComments || "");
        const normalizedCalibrationByView = normalizeReferenceCalibrationByView(
          saved.referenceCalibrationByView ||
            saved.reference_calibration_by_view ||
            saved.referenceCalibration,
        );

        const normalizedTraceObjectsByView = normalizeTraceObjectsByView(
          saved.traceObjectsByView ||
            saved.trace_objects_by_view ||
            saved.traceObjects,
        );

        setReferenceCalibrationByView(normalizedCalibrationByView);
        setTraceObjectsByView(normalizedTraceObjectsByView);
        setSelectedTraceId(null);

        setView("front");
      })
      .catch(() => toast.error("Failed to load blueprint."));
  }, [id]);

  const selectedComp = components.find((c) => c.id === selectedId) || null;

  const activeReferenceView = useMemo(() => {
    return REFERENCE_TRACE_VIEWS.includes(view) ? view : "front";
  }, [view]);

  const activeReferenceCalibration = useMemo(() => {
    return (
      referenceCalibrationByView?.[activeReferenceView] ||
      normalizeReferenceCalibration()
    );
  }, [referenceCalibrationByView, activeReferenceView]);

  const activeTraceObjects = useMemo(() => {
    return Array.isArray(traceObjectsByView?.[activeReferenceView])
      ? traceObjectsByView[activeReferenceView]
      : [];
  }, [traceObjectsByView, activeReferenceView]);

  const allTraceObjects = useMemo(() => {
    return flattenTraceObjectsByView(traceObjectsByView);
  }, [traceObjectsByView]);

  const setActiveReferenceCalibration = useCallback(
    (nextValue) => {
      setReferenceCalibrationByView((prev) => {
        const current =
          prev?.[activeReferenceView] || normalizeReferenceCalibration();

        const resolved =
          typeof nextValue === "function" ? nextValue(current) : nextValue;

        return {
          ...createEmptyReferenceCalibrationByView(),
          ...prev,
          [activeReferenceView]: normalizeReferenceCalibration(resolved),
        };
      });
    },
    [activeReferenceView],
  );

  const setActiveTraceObjects = useCallback(
    (nextValue) => {
      setTraceObjectsByView((prev) => {
        const current = Array.isArray(prev?.[activeReferenceView])
          ? prev[activeReferenceView]
          : [];

        const resolved =
          typeof nextValue === "function" ? nextValue(current) : nextValue;

        return {
          ...createEmptyTraceObjectsByView(),
          ...prev,
          [activeReferenceView]: normalizeTraceObjects(
            resolved,
            activeReferenceView,
          ),
        };
      });
    },
    [activeReferenceView],
  );

  useEffect(() => {
    setSelectedTraceId(null);
  }, [activeReferenceView]);

  const hasAnyReferenceFile = useMemo(() => {
    return Object.values(referenceFiles || {}).some((file) => file?.url);
  }, [referenceFiles]);

  const activeReferenceLoaded = useMemo(() => {
    return Boolean(referenceFiles?.[activeReferenceView]?.url);
  }, [referenceFiles, activeReferenceView]);

  const totalTraceCount = useMemo(() => {
    return Array.isArray(allTraceObjects) ? allTraceObjects.length : 0;
  }, [allTraceObjects]);

  const referenceViewSummaries = useMemo(() => {
    return REFERENCE_TRACE_VIEWS.map((viewKey) => {
      const traceCount = Array.isArray(traceObjectsByView?.[viewKey])
        ? traceObjectsByView[viewKey].length
        : 0;

      const hasFile = Boolean(referenceFiles?.[viewKey]?.url);
      const isCalibrated = Boolean(
        referenceCalibrationByView?.[viewKey]?.isCalibrated,
      );

      return {
        key: viewKey,
        label: viewKey.toUpperCase(),
        hasFile,
        traceCount,
        isCalibrated,
        hasTrace: traceCount > 0,
      };
    });
  }, [referenceFiles, traceObjectsByView, referenceCalibrationByView]);

  const loadedButUntracedViews = useMemo(() => {
    return referenceViewSummaries.filter(
      (item) => item.hasFile && !item.hasTrace,
    );
  }, [referenceViewSummaries]);

  const tracedViews = useMemo(() => {
    return referenceViewSummaries.filter((item) => item.hasTrace);
  }, [referenceViewSummaries]);

  const tracedWithoutFileViews = useMemo(() => {
    return referenceViewSummaries.filter(
      (item) => !item.hasFile && item.hasTrace,
    );
  }, [referenceViewSummaries]);

  const usableTraceObjectsByView = useMemo(() => {
    return REFERENCE_TRACE_VIEWS.reduce((acc, viewKey) => {
      const rawList = Array.isArray(traceObjectsByView?.[viewKey])
        ? traceObjectsByView[viewKey]
        : [];

      acc[viewKey] = normalizeTraceObjects(rawList, viewKey).filter(
        (obj) => Number(obj?.width) > 5 && Number(obj?.height) > 5,
      );

      return acc;
    }, createEmptyTraceObjectsByView());
  }, [traceObjectsByView]);

  const usableFrontBackTraceCount = useMemo(() => {
    return (
      (usableTraceObjectsByView.front?.length || 0) +
      (usableTraceObjectsByView.back?.length || 0)
    );
  }, [usableTraceObjectsByView]);

  const usableSideTraceCount = useMemo(() => {
    return (
      (usableTraceObjectsByView.left?.length || 0) +
      (usableTraceObjectsByView.right?.length || 0)
    );
  }, [usableTraceObjectsByView]);

  const usableTopTraceCount = useMemo(() => {
    return usableTraceObjectsByView.top?.length || 0;
  }, [usableTraceObjectsByView]);

  const hasUsableFrontOrBackTrace = useMemo(() => {
    return usableFrontBackTraceCount > 0;
  }, [usableFrontBackTraceCount]);

  const loadedViewsWithoutUsableTrace = useMemo(() => {
    return referenceViewSummaries.filter(
      (item) =>
        item.hasFile &&
        (usableTraceObjectsByView?.[item.key]?.length || 0) === 0,
    );
  }, [referenceViewSummaries, usableTraceObjectsByView]);

  const optionalLoadedViewsWithoutUsableTrace = useMemo(() => {
    return loadedViewsWithoutUsableTrace.filter((item) =>
      ["left", "right", "top"].includes(item.key),
    );
  }, [loadedViewsWithoutUsableTrace]);

  const canConvertReference = useMemo(() => {
    return Boolean(hasAnyReferenceFile && hasUsableFrontOrBackTrace);
  }, [hasAnyReferenceFile, hasUsableFrontOrBackTrace]);

  const convertReadinessTone = useMemo(() => {
    if (!hasAnyReferenceFile || !hasUsableFrontOrBackTrace) return "warning";
    if (
      optionalLoadedViewsWithoutUsableTrace.length ||
      tracedWithoutFileViews.length
    ) {
      return "partial";
    }
    return "ready";
  }, [
    hasAnyReferenceFile,
    hasUsableFrontOrBackTrace,
    optionalLoadedViewsWithoutUsableTrace,
    tracedWithoutFileViews,
  ]);

  const convertRequirementFeedback = useMemo(() => {
    if (!hasAnyReferenceFile) {
      return "No reference view uploaded yet.";
    }

    if (!hasUsableFrontOrBackTrace) {
      if (!activeReferenceLoaded && !totalTraceCount) {
        return `No reference file loaded in active ${activeReferenceView.toUpperCase()} view.`;
      }

      if (usableSideTraceCount || usableTopTraceCount) {
        return `Front or Back trace is required. Current usable traces: ${[
          usableSideTraceCount ? "SIDE" : null,
          usableTopTraceCount ? "TOP" : null,
        ]
          .filter(Boolean)
          .join(" + ")} only.`;
      }

      if (totalTraceCount) {
        return "Front or Back trace is required before convert. Current traces are not usable yet.";
      }

      if (activeReferenceLoaded) {
        return `No traced cabinet section yet in active ${activeReferenceView.toUpperCase()} view. Front or Back trace is required.`;
      }

      return "No traced cabinet section yet in FRONT or BACK view.";
    }

    if (tracedWithoutFileViews.length) {
      return `Warning: may traces sa ${tracedWithoutFileViews
        .map((item) => item.label)
        .join(", ")} pero walang matching reference file.`;
    }

    if (optionalLoadedViewsWithoutUsableTrace.length) {
      return `Ready to convert using FRONT/BACK. ${optionalLoadedViewsWithoutUsableTrace
        .map((item) => item.label)
        .join(
          ", ",
        )} has no usable trace, so the converter will match nearest TOP/SIDE sections first and use fallback depth only when needed.`;
    }

    return `Ready to convert using ${[
      usableFrontBackTraceCount ? "FRONT/BACK" : null,
      usableSideTraceCount ? "SIDE" : null,
      usableTopTraceCount ? "TOP" : null,
    ]
      .filter(Boolean)
      .join(" + ")} trace data.`;
  }, [
    hasAnyReferenceFile,
    activeReferenceLoaded,
    activeReferenceView,
    hasUsableFrontOrBackTrace,
    usableSideTraceCount,
    usableTopTraceCount,
    totalTraceCount,
    tracedWithoutFileViews,
    optionalLoadedViewsWithoutUsableTrace,
    usableFrontBackTraceCount,
  ]);

  const selectedComponents = useMemo(() => {
    const activeIds = Array.from(new Set((selectedIds || []).filter(Boolean)));

    if (activeIds.length) {
      const activeSet = new Set(activeIds);
      return components.filter((c) => activeSet.has(c.id));
    }

    return getSelectionGroup(components, selectedComp);
  }, [components, selectedComp, selectedIds]);

  const hasRealComponents = useMemo(() => {
    return Array.isArray(components)
      ? components.some((c) => c.type !== "reference_proxy")
      : false;
  }, [components]);

  const selectedBounds3D = useMemo(() => {
    return getComponentsBounds3D(selectedComponents);
  }, [selectedComponents]);

  const selectedLabel = useMemo(() => {
    if (!selectedComp) return "";
    if (selectedIds.length > 1) return `${selectedIds.length} Selected Objects`;
    return selectedComp.groupLabel || selectedComp.label;
  }, [selectedComp, selectedIds]);

  const selectedMaterialText = useMemo(() => {
    if (!selectedComponents.length) return "—";
    return (
      [
        ...new Set(selectedComponents.map((c) => c.material).filter(Boolean)),
      ].join(", ") || "—"
    );
  }, [selectedComponents]);

  const selectedDimsText = useMemo(() => {
    if (!selectedBounds3D) return "—";
    return formatDims(
      selectedBounds3D.width,
      selectedBounds3D.height,
      selectedBounds3D.depth,
      unit,
    );
  }, [selectedBounds3D, unit]);

  const getSelectionBoundsXYZ = useCallback((items = []) => {
    if (!Array.isArray(items) || !items.length) return null;

    const minX = Math.min(...items.map((c) => Number(c.x) || 0));
    const minY = Math.min(...items.map((c) => Number(c.y) || 0));
    const minZ = Math.min(...items.map((c) => Number(c.z) || 0));

    const maxX = Math.max(
      ...items.map((c) => (Number(c.x) || 0) + (Number(c.width) || 0)),
    );
    const maxY = Math.max(
      ...items.map((c) => (Number(c.y) || 0) + (Number(c.height) || 0)),
    );
    const maxZ = Math.max(
      ...items.map((c) => (Number(c.z) || 0) + (Number(c.depth) || 0)),
    );

    return {
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      centerZ: (minZ + maxZ) / 2,
      width: maxX - minX,
      height: maxY - minY,
      depth: maxZ - minZ,
    };
  }, []);

  const activeSelectionIds3D = useMemo(() => {
    const ids = Array.from(new Set((selectedIds || []).filter(Boolean)));
    if (ids.length) return ids;
    return selectedId ? [selectedId] : [];
  }, [selectedId, selectedIds]);

  const activeSelectedComponents3D = useMemo(() => {
    if (!activeSelectionIds3D.length) return [];
    const activeSet = new Set(activeSelectionIds3D);
    return components.filter((c) => activeSet.has(c.id));
  }, [components, activeSelectionIds3D]);

  const hasLockedSmartSelection3D = useMemo(() => {
    return activeSelectedComponents3D.some((c) => isLocked(c));
  }, [activeSelectedComponents3D, isLocked]);

  const canUseSmartActions3D =
    editorMode === "editable" &&
    activeSelectedComponents3D.length > 0 &&
    !hasLockedSmartSelection3D;

  // ── Copy / Paste ─────────────────────────────────────────────────────────
  const copySelectedObject = useCallback(() => {
    if (!selectedComponents.length) {
      toast.error("Pumili muna ng object sa 3D view.");
      return;
    }

    setClipboardObject(deepClone(selectedComponents));

    toast.success(
      selectedComponents.length > 1
        ? `${selectedComponents.length} object(s) copied.`
        : `${selectedComponents[0]?.label || "Object"} copied.`,
    );
  }, [selectedComponents]);

  const pasteCopiedObject = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error("Reference mode ito. Lumipat muna sa editable mode.");
      return;
    }

    const sourceItems = Array.isArray(clipboardObject)
      ? clipboardObject
      : clipboardObject
        ? [clipboardObject]
        : [];

    if (!sourceItems.length) {
      toast.error("Wala pang copied object.");
      return;
    }

    const OFFSET = 160;
    const groupIdMap = new Map();

    const pasted = sourceItems.map((item) => {
      let nextGroupId = item.groupId || null;

      if (item.groupId) {
        if (!groupIdMap.has(item.groupId)) {
          groupIdMap.set(item.groupId, makeGroupId());
        }
        nextGroupId = groupIdMap.get(item.groupId);
      }

      return normalizeComponent({
        ...deepClone(item),
        id: createObjectId(),
        groupId: nextGroupId,
        x: snap((Number(item.x) || 0) + OFFSET),
        y: snap(Number(item.y) || 0),
        z: snap((Number(item.z) || 0) + OFFSET),
        locked: false,
      });
    });

    pushHistory(components);
    setComponents((prev) => [...prev, ...pasted]);
    setSelectedIds(pasted.map((item) => item.id));
    setSelectedId(pasted[0]?.id || null);
    setEdit3DId(pasted[0]?.id || null);

    toast.success(
      pasted.length > 1
        ? `${pasted.length} object(s) pasted.`
        : `${pasted[0]?.label || "Object"} pasted.`,
    );
  }, [editorMode, clipboardObject, components, pushHistory]);
  // ─────────────────────────────────────────────────────────────────────────
  const getAssemblyItemsFromComponent = useCallback(
    (compOrId) => {
      const comp =
        typeof compOrId === "string"
          ? components.find((item) => item.id === compOrId)
          : compOrId;

      if (!comp) return [];

      const resultMap = new Map();
      const addItems = (items = []) => {
        (items || []).forEach((item) => {
          if (item?.id) resultMap.set(item.id, item);
        });
      };

      // First try the shared selection-group helper because it already knows
      // how the editor treats grouped / linked parts.
      addItems(getSelectionGroup(components, comp));

      // Strongest assembly link: exact groupId match.
      if (comp.groupId) {
        addItems(components.filter((item) => item.groupId === comp.groupId));
      }

      // Fallback for older / mixed data where one or more parts in the same
      // assembly were saved without groupId. Only attach loose parts that share
      // the same label/type metadata as the active grouped assembly.
      if (comp.groupId && comp.groupLabel) {
        addItems(
          components.filter((item) => {
            if (!item?.id || item.id === comp.id) return false;
            const sameGroupType = comp.groupType
              ? item.groupType === comp.groupType
              : true;

            return (
              sameGroupType &&
              item.groupLabel === comp.groupLabel &&
              (!item.groupId || item.groupId === comp.groupId)
            );
          }),
        );
      }

      // Last-resort fallback for legacy assemblies that have no groupId at all
      // but still share the same logical group label/type.
      if (
        resultMap.size <= 1 &&
        !comp.groupId &&
        comp.groupLabel &&
        comp.groupType
      ) {
        const looseAssemblyItems = components.filter((item) => {
          if (!item?.id) return false;
          return (
            item.groupLabel === comp.groupLabel &&
            item.groupType === comp.groupType
          );
        });

        if (looseAssemblyItems.length > 1 && looseAssemblyItems.length <= 12) {
          addItems(looseAssemblyItems);
        }
      }

      return resultMap.size ? Array.from(resultMap.values()) : [comp];
    },
    [components],
  );

  const getAssemblyIdsFromComponent = useCallback(
    (compOrId) =>
      getAssemblyItemsFromComponent(compOrId).map((item) => item.id),
    [getAssemblyItemsFromComponent],
  );

  const getGroupAwareSelectionIds = useCallback(
    ({ preferWholeAssembly = false } = {}) => {
      const explicitIds = Array.from(
        new Set((selectedIds || []).filter(Boolean)),
      );
      const baseIds = explicitIds.length
        ? explicitIds
        : [selectedId].filter(Boolean);

      if (!baseIds.length) return [];
      if (!preferWholeAssembly) return baseIds;

      const expanded = new Map();

      baseIds.forEach((id) => {
        getAssemblyItemsFromComponent(id).forEach((item) => {
          if (item?.id) expanded.set(item.id, item);
        });
      });

      return expanded.size ? Array.from(expanded.keys()) : baseIds;
    },
    [selectedId, selectedIds, getAssemblyItemsFromComponent],
  );

  const cloneSelectionWithOffsets = useCallback(
    (
      sourceItems,
      { copies = 1, offsetX = 0, offsetY = 0, offsetZ = 0 } = {},
    ) => {
      const clones = [];

      const getCloneAssemblyKey = (item) => {
        const hasSharedLabelAssembly =
          item.groupLabel &&
          sourceItems.filter(
            (other) =>
              other.groupLabel === item.groupLabel &&
              other.groupType === item.groupType,
          ).length > 1;

        if (hasSharedLabelAssembly) {
          return `label:${item.groupType || "group"}:${item.groupLabel}`;
        }

        if (item.groupId) {
          return `group:${item.groupId}`;
        }

        return null;
      };

      for (let copyIndex = 1; copyIndex <= copies; copyIndex += 1) {
        const groupIdMap = new Map();

        sourceItems.forEach((item) => {
          const cloneGroupKey = getCloneAssemblyKey(item);
          let nextGroupId = item.groupId || null;

          if (cloneGroupKey) {
            if (!groupIdMap.has(cloneGroupKey)) {
              groupIdMap.set(cloneGroupKey, makeGroupId());
            }
            nextGroupId = groupIdMap.get(cloneGroupKey);
          }

          clones.push(
            normalizeComponent({
              ...deepClone(item),
              id: createObjectId(),
              groupId: nextGroupId,
              x: snap((Number(item.x) || 0) + offsetX * copyIndex),
              y: snap((Number(item.y) || 0) + offsetY * copyIndex),
              z: snap((Number(item.z) || 0) + offsetZ * copyIndex),
              locked: false,
            }),
          );
        });
      }

      return clones;
    },
    [],
  );

  const selectWholeAssembly = useCallback(() => {
    const primaryId = selectedId || selectedIds[0] || null;

    if (!primaryId) {
      toast.error("Select one part first.");
      return;
    }

    const assemblyItems = getAssemblyItemsFromComponent(primaryId);
    const assemblyIds = assemblyItems.map((item) => item.id);

    if (assemblyIds.length <= 1) {
      toast("Selected object is not part of an assembly.");
      return;
    }

    setSelectedIds(assemblyIds);
    setSelectedId(primaryId);
    setEdit3DId(primaryId);

    toast.success(
      `Selected whole assembly (${assemblyIds.length} part${assemblyIds.length !== 1 ? "s" : ""}).`,
    );
  }, [selectedId, selectedIds, getAssemblyItemsFromComponent]);

  const duplicateWholeAssembly = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error("Reference mode ito. Lumipat muna sa editable mode.");
      return;
    }

    const sourceIds = getGroupAwareSelectionIds({ preferWholeAssembly: true });
    if (!sourceIds.length) {
      toast.error("Select one assembly first.");
      return;
    }

    const sourceItems = components.filter((item) =>
      sourceIds.includes(item.id),
    );
    if (!sourceItems.length) return;

    const hasAssembly = sourceItems.length > 1;
    if (!hasAssembly) {
      toast("Selected object is not part of an assembly.");
      return;
    }

    if (sourceItems.some((item) => isLocked(item))) {
      toast.error(
        "Cannot duplicate. One or more selected components are locked.",
      );
      return;
    }

    const duplicated = cloneSelectionWithOffsets(sourceItems, {
      copies: 1,
      offsetX: 120,
      offsetZ: 120,
    });

    pushHistory(components);
    setComponents((prev) => [...prev, ...duplicated]);
    setSelectedIds(duplicated.map((item) => item.id));
    setSelectedId(duplicated[0]?.id || null);
    setEdit3DId(duplicated[0]?.id || null);

    toast.success(`Whole assembly duplicated (${duplicated.length} parts).`);
  }, [
    editorMode,
    components,
    isLocked,
    pushHistory,
    getGroupAwareSelectionIds,
    cloneSelectionWithOffsets,
  ]);

  const arrayDuplicateSelection = useCallback(
    (axis, copies = 1, spacing = 0) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const sourceIds = getGroupAwareSelectionIds({
        preferWholeAssembly: true,
      });
      if (!sourceIds.length) {
        toast.error("Select an object or assembly first.");
        return;
      }

      const sourceItems = components.filter((item) =>
        sourceIds.includes(item.id),
      );
      if (!sourceItems.length) return;

      if (sourceItems.some((item) => isLocked(item))) {
        toast.error(
          "Cannot create array. One or more selected components are locked.",
        );
        return;
      }

      const safeCopies = Math.max(1, Math.min(20, Number(copies) || 0));
      const safeSpacing = snap(Math.max(0, Number(spacing) || 0));
      const bounds = getSelectionBoundsXYZ(sourceItems);
      if (!bounds) return;

      const span =
        axis === "x"
          ? Math.max(GRID_SIZE, bounds.width)
          : axis === "y"
            ? Math.max(GRID_SIZE, bounds.height)
            : Math.max(GRID_SIZE, bounds.depth);

      const step = snap(span + safeSpacing);
      const duplicated = cloneSelectionWithOffsets(sourceItems, {
        copies: safeCopies,
        offsetX: axis === "x" ? step : 0,
        offsetY: axis === "y" ? step : 0,
        offsetZ: axis === "z" ? step : 0,
      });

      pushHistory(components);
      setComponents((prev) => [...prev, ...duplicated]);
      setSelectedIds(duplicated.map((item) => item.id));
      setSelectedId(duplicated[0]?.id || null);
      setEdit3DId(duplicated[0]?.id || null);
      setTransformMode("translate");

      toast.success(
        `Array ${axis.toUpperCase()} created: ${safeCopies} copy${safeCopies !== 1 ? "ies" : "y"} (${duplicated.length} objects).`,
      );
    },
    [
      editorMode,
      components,
      isLocked,
      pushHistory,
      getGroupAwareSelectionIds,
      getSelectionBoundsXYZ,
      cloneSelectionWithOffsets,
    ],
  );

  // ── Duplicate selected component(s) ─────────────────────────────────────
  const duplicateSelected = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error("Reference mode ito. Lumipat muna sa editable mode.");
      return;
    }

    // Normal duplicate should copy exactly what is currently selected.
    // Whole assembly duplication has its own dedicated action.
    const baseSelectionIds = getGroupAwareSelectionIds({
      preferWholeAssembly: false,
    });

    if (!baseSelectionIds.length) {
      toast("No component selected.");
      return;
    }

    const selectedSet = new Set(baseSelectionIds);
    const toDuplicate = components.filter((c) => selectedSet.has(c.id));

    if (!toDuplicate.length) return;

    const hasLockedSelection = toDuplicate.some((c) => isLocked(c));
    if (hasLockedSelection) {
      toast.error(
        "Cannot duplicate. One or more selected components are locked.",
      );
      return;
    }

    const duplicated = cloneSelectionWithOffsets(toDuplicate, {
      copies: 1,
      offsetX: 120,
      offsetZ: 120,
    });

    pushHistory(components);
    setComponents((prev) => [...prev, ...duplicated]);
    setSelectedIds(duplicated.map((item) => item.id));
    setSelectedId(duplicated[0]?.id || null);
    setEdit3DId(duplicated[0]?.id || null);

    const duplicatedAssembly = false;

    toast.success(
      duplicatedAssembly
        ? `Duplicated assembly (${duplicated.length} parts).`
        : duplicated.length > 1
          ? `Duplicated ${duplicated.length} object(s).`
          : `Duplicated ${duplicated[0]?.label || "object"}.`,
    );
  }, [
    editorMode,
    selectedIds,
    components,
    isLocked,
    pushHistory,
    getGroupAwareSelectionIds,
    cloneSelectionWithOffsets,
  ]);

  const toggleLockSelected = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error("Reference mode ito. Lumipat muna sa editable mode.");
      return;
    }

    const targetIds =
      selectedIds.length > 0 ? selectedIds : [selectedId].filter(Boolean);

    if (!targetIds.length) {
      toast.error("Pumili muna ng object.");
      return;
    }

    const targetSet = new Set(targetIds);
    const targetComponents = components.filter((c) => targetSet.has(c.id));

    if (!targetComponents.length) return;

    const shouldLock = targetComponents.some((c) => !c.locked);

    pushHistory(components);
    setComponents((prev) =>
      prev.map((c) =>
        targetSet.has(c.id)
          ? normalizeComponent({
              ...c,
              locked: shouldLock,
            })
          : c,
      ),
    );

    toast.success(
      shouldLock
        ? `Locked ${targetIds.length} object(s).`
        : `Unlocked ${targetIds.length} object(s).`,
    );
  }, [editorMode, selectedId, selectedIds, components, pushHistory]);

  const cancelPendingPlacement = useCallback(() => {
    if (!pendingPlacement) return;
    setPendingPlacement(null);
    toast("Placement cancelled.");
  }, [pendingPlacement]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const activeEl = document.activeElement;
      const tag = activeEl?.tagName?.toLowerCase();
      const isTyping =
        activeEl?.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select";

      const key = String(e.key || "").toLowerCase();
      const code = String(e.code || "").toLowerCase();
      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      if (key === "escape") {
        if (pendingPlacement) {
          e.preventDefault();
          e.stopPropagation();
          cancelPendingPlacement();
          return;
        }

        setSelectedId(null);
        setSelectedIds([]);
        setEdit3DId(null);
        return;
      }

      if (
        !isTyping &&
        ctrlOrMeta &&
        !e.shiftKey &&
        (key === "z" || code === "keyz")
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleUndo();
        return;
      }

      if (
        !isTyping &&
        ctrlOrMeta &&
        (key === "y" ||
          code === "keyy" ||
          ((key === "z" || code === "keyz") && e.shiftKey))
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleRedo();
        return;
      }

      if (isTyping) return;

      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        e.stopPropagation();
        removeSelected();
        return;
      }

      if (ctrlOrMeta && key === "a") {
        e.preventDefault();
        e.stopPropagation();
        if (components.length > 0) {
          const allIds = components.map((c) => c.id);
          setSelectedIds(allIds);
          setSelectedId(allIds[0] || null);
          setEdit3DId(allIds[0] || null);
          toast.success(`All ${components.length} object(s) selected.`);
        }
        return;
      }

      if (ctrlOrMeta && key === "d") {
        e.preventDefault();
        e.stopPropagation();
        duplicateSelected();
        return;
      }

      if (ctrlOrMeta && key === "c") {
        e.preventDefault();
        e.stopPropagation();
        copySelectedObject();
        return;
      }

      if (ctrlOrMeta && key === "v") {
        e.preventDefault();
        e.stopPropagation();
        pasteCopiedObject();
        return;
      }

      if (ctrlOrMeta && key === "l") {
        e.preventDefault();
        e.stopPropagation();
        toggleLockSelected();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    components,
    pendingPlacement,
    cancelPendingPlacement,
    handleUndo,
    handleRedo,
    duplicateSelected,
    copySelectedObject,
    pasteCopiedObject,
    removeSelected,
    toggleLockSelected,
  ]);
  // ─────────────────────────────────────────────────────────────────────────

  const getPlacedGenericComponentData = useCallback(
    (typeDef, placed) => {
      const FLOOR = FLOOR_OFFSET;
      const BASE_MARGIN = 120;
      const GAP_X = 180;
      const GAP_Z = 240;
      const START_X = snap(WORLD_W * 0.36);
      const START_Z = snap(WORLD_D * 0.28);
      const floorY = WORLD_H - FLOOR;

      const generic = placed.filter((c) => !c.groupType);

      const layoutPlaced = (() => {
        let cursorX = START_X;
        let cursorZ = START_Z;
        let rowDepth = 0;
        const rows = [];

        generic.forEach((comp) => {
          if (cursorX + comp.width > WORLD_W - BASE_MARGIN) {
            cursorX = START_X;
            cursorZ += rowDepth + GAP_Z;
            rowDepth = 0;
          }
          rows.push({ x: cursorX, z: cursorZ, comp });
          cursorX += comp.width + GAP_X;
          rowDepth = Math.max(rowDepth, comp.depth);
        });

        return { rows, cursorX, cursorZ, rowDepth };
      })();

      let x = layoutPlaced.cursorX;
      let z = layoutPlaced.cursorZ;
      let rowDepth = layoutPlaced.rowDepth;

      if (x + typeDef.w > WORLD_W - BASE_MARGIN) {
        x = START_X;
        z += rowDepth + GAP_Z;
        rowDepth = 0;
      }

      const cabinetish = generic.filter((c) =>
        [
          "base_cabinet",
          "upper_cabinet",
          "kitchen_cabinet",
          "tv_stand",
          "sideboard",
          "wardrobe",
          "bookshelf",
          "bookcase",
          "dresser",
          "nightstand",
        ].includes(c.type),
      );
      const lastCabinetish = cabinetish[cabinetish.length - 1];

      switch (typeDef.type) {
        case "upper_cabinet":
          return {
            x,
            y: floorY - typeDef.h - 900,
            z,
            width: typeDef.w,
            height: typeDef.h,
            depth: typeDef.d,
            rotationY: 0,
          };

        case "countertop": {
          const host = generic
            .filter((c) =>
              [
                "base_cabinet",
                "kitchen_cabinet",
                "sideboard",
                "tv_stand",
              ].includes(c.type),
            )
            .slice(-1)[0];
          if (host) {
            return {
              x: host.x,
              y: host.y - typeDef.h,
              z: host.z,
              width: Math.max(typeDef.w, host.width),
              height: typeDef.h,
              depth: Math.max(typeDef.d, host.depth),
              rotationY: 0,
            };
          }
          return {
            x,
            y: floorY - typeDef.h - 900,
            z,
            width: typeDef.w,
            height: typeDef.h,
            depth: typeDef.d,
            rotationY: 0,
          };
        }

        case "door_single":
        case "door_double":
        case "shelf":
        case "hardware": {
          const host = lastCabinetish;
          if (host) {
            return {
              x:
                host.x +
                snap(
                  Math.max(
                    0,
                    (host.width - Math.min(typeDef.w, host.width)) / 2,
                  ),
                ),
              y:
                typeDef.type === "shelf"
                  ? host.y + snap(Math.max(40, host.height * 0.3))
                  : host.y +
                    snap(
                      Math.max(
                        0,
                        (host.height - Math.min(typeDef.h, host.height)) / 2,
                      ),
                    ),
              z:
                typeDef.type === "shelf"
                  ? host.z + 20
                  : host.z + Math.max(0, host.depth - typeDef.d),
              width:
                typeDef.type === "hardware"
                  ? typeDef.w
                  : Math.min(typeDef.w, Math.max(typeDef.w, host.width)),
              height:
                typeDef.type === "hardware"
                  ? typeDef.h
                  : Math.min(typeDef.h, host.height),
              depth:
                typeDef.type === "shelf"
                  ? Math.min(typeDef.d, host.depth - 20)
                  : typeDef.d,
              rotationY: host.rotationY || 0,
            };
          }
          return {
            x,
            y: floorY - typeDef.h,
            z,
            width: typeDef.w,
            height: typeDef.h,
            depth: typeDef.d,
            rotationY: 0,
          };
        }

        default:
          return {
            x,
            y: floorY - typeDef.h,
            z,
            width: typeDef.w,
            height: typeDef.h,
            depth: typeDef.d,
            rotationY: 0,
          };
      }
    },
    [WORLD_H, WORLD_W],
  );

  const startManualChairBuild = useCallback(() => {
    const buildCount =
      [
        ...new Set(
          components
            .filter((c) => c.groupType === "chair")
            .map((c) => c.groupId),
        ),
      ].length + 1;
    const groupId = makeGroupId();
    const groupLabel = `Manual Chair ${buildCount}`;
    setActiveChairBuild({ id: groupId, label: groupLabel });
    setView("front");
    toast.success(`Manual build started: ${groupLabel}`);
  }, [components]);

  const updateComp = useCallback(
    (cid, attrs, options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Nasa reference mode ka. Lumipat muna sa editable mode.");
        return;
      }

      const shouldApplyToSelection = !!options.applyToSelection;
      const targetIds =
        shouldApplyToSelection &&
        selectedIds.includes(cid) &&
        selectedIds.length > 1
          ? selectedIds
          : [cid];

      if (!targetIds.length) return;

      if (!options.skipHistory) {
        pushHistory(components);
      }

      const targetSet = new Set(targetIds);

      setComponents((prev) =>
        prev.map((c) =>
          targetSet.has(c.id) ? normalizeComponent({ ...c, ...attrs }) : c,
        ),
      );
    },
    [editorMode, components, pushHistory, selectedIds],
  );

  const updateManyComps = useCallback(
    (changesById = {}, options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Nasa reference mode ka. Lumipat muna sa editable mode.");
        return;
      }

      const entries = Object.entries(changesById).filter(
        ([, attrs]) => attrs && Object.keys(attrs).length,
      );

      if (!entries.length) return;

      if (!options.skipHistory) {
        pushHistory(components);
      }

      const changeMap = new Map(entries);

      setComponents((prev) =>
        prev.map((c) => {
          const attrs = changeMap.get(c.id);
          return attrs ? normalizeComponent({ ...c, ...attrs }) : c;
        }),
      );
    },
    [editorMode, components, pushHistory],
  );

  const getSmartAxisMeta = useCallback((axis) => {
    if (axis === "x") return { posKey: "x", sizeKey: "width", label: "X" };
    if (axis === "y") return { posKey: "y", sizeKey: "height", label: "Y" };
    return { posKey: "z", sizeKey: "depth", label: "Z" };
  }, []);

  const applySelectionGap3D = useCallback(
    (axis, gap = 0, anchorMode = "preserve-first") => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot apply equal gap. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error("Select at least 2 objects to apply gap.");
        return;
      }

      const safeGap = snap(Math.max(0, Number(gap) || 0));
      const { posKey, sizeKey, label } = getSmartAxisMeta(axis);

      const sorted = [...activeSelectedComponents3D].sort(
        (a, b) =>
          (Number(a[posKey]) || 0) - (Number(b[posKey]) || 0) ||
          (Number(a[sizeKey]) || 0) - (Number(b[sizeKey]) || 0),
      );

      const bounds = getSelectionBoundsXYZ(sorted);
      if (!bounds) return;

      const totalSpan =
        sorted.reduce((sum, comp) => sum + (Number(comp[sizeKey]) || 0), 0) +
        safeGap * Math.max(0, sorted.length - 1);

      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      let cursor = Number(first[posKey]) || 0;

      if (anchorMode === "preserve-last") {
        const lastEnd =
          (Number(last[posKey]) || 0) + (Number(last[sizeKey]) || 0);
        cursor = snap(lastEnd - totalSpan);
      } else if (anchorMode === "center") {
        const axisCenter =
          axis === "x"
            ? bounds.centerX
            : axis === "y"
              ? bounds.centerY
              : bounds.centerZ;

        cursor = snap(axisCenter - totalSpan / 2);
      }

      const changesById = {};

      sorted.forEach((comp) => {
        changesById[comp.id] = {
          [posKey]: snap(cursor),
        };

        cursor += (Number(comp[sizeKey]) || 0) + safeGap;
      });

      updateManyComps(changesById);
      setTransformMode("translate");

      const modeLabel =
        anchorMode === "preserve-last"
          ? "Preserve Last"
          : anchorMode === "center"
            ? "Center"
            : "Preserve First";

      toast.success(
        `Applied ${safeGap}mm equal gap on ${label} axis (${modeLabel}).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartAxisMeta,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const distributeSelection3D = useCallback(
    (axis, anchorMode = "preserve-first") => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot distribute. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 3) {
        toast.error("Select at least 3 objects to distribute.");
        return;
      }

      const { posKey, sizeKey, label } = getSmartAxisMeta(axis);

      const sorted = [...activeSelectedComponents3D].sort(
        (a, b) =>
          (Number(a[posKey]) || 0) - (Number(b[posKey]) || 0) ||
          (Number(a[sizeKey]) || 0) - (Number(b[sizeKey]) || 0),
      );

      const bounds = getSelectionBoundsXYZ(sorted);
      if (!bounds) return;

      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      const minStart = Number(first[posKey]) || 0;
      const maxEnd = (Number(last[posKey]) || 0) + (Number(last[sizeKey]) || 0);

      const totalSize = sorted.reduce(
        (sum, comp) => sum + (Number(comp[sizeKey]) || 0),
        0,
      );

      const gapCount = sorted.length - 1;
      const totalGap = maxEnd - minStart - totalSize;

      if (gapCount <= 0) return;

      if (totalGap < 0) {
        toast.error(
          "Selection span is too tight to distribute without overlap.",
        );
        return;
      }

      const evenGap = snap(totalGap / gapCount);
      const totalLineSpan = totalSize + evenGap * gapCount;

      let cursor = minStart;

      if (anchorMode === "preserve-last") {
        cursor = snap(maxEnd - totalLineSpan);
      } else if (anchorMode === "center") {
        const axisCenter =
          axis === "x"
            ? bounds.centerX
            : axis === "y"
              ? bounds.centerY
              : bounds.centerZ;

        cursor = snap(axisCenter - totalLineSpan / 2);
      }

      const changesById = {};

      sorted.forEach((comp) => {
        changesById[comp.id] = {
          [posKey]: snap(cursor),
        };

        cursor += (Number(comp[sizeKey]) || 0) + evenGap;
      });

      updateManyComps(changesById);
      setTransformMode("translate");

      const modeLabel =
        anchorMode === "preserve-last"
          ? "Preserve Last"
          : anchorMode === "center"
            ? "Center"
            : "Preserve First";

      toast.success(
        `Distributed ${sorted.length} object(s) on ${label} axis (${modeLabel}).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartAxisMeta,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const autoLegLayout3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot auto-layout legs. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length !== 5) {
        toast.error("Select exactly 1 tabletop/body and 4 leg parts.");
        return;
      }

      const selected = [...activeSelectedComponents3D];

      // host = pinakamalaking top footprint
      const host = [...selected].sort((a, b) => {
        const areaA = (Number(a.width) || 0) * (Number(a.depth) || 0);
        const areaB = (Number(b.width) || 0) * (Number(b.depth) || 0);
        return areaB - areaA;
      })[0];

      const legs = selected.filter((item) => item.id !== host?.id);

      if (!host || legs.length !== 4) {
        toast.error("Need 1 host and 4 leg parts.");
        return;
      }

      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostDepth = Number(host.depth) || 0;
      const undersideY = snap(hostY + (Number(host.height) || 0));
      const safeInset = snap(Math.max(0, Number(inset) || 0));

      if (hostWidth < GRID_SIZE || hostDepth < GRID_SIZE) {
        toast.error("Host size is too small for leg layout.");
        return;
      }

      // hanapin apron/frame parts sa same assembly
      const assemblyItems = host.groupId
        ? components.filter((item) => item.groupId === host.groupId)
        : selected;

      const apronLikeParts = assemblyItems.filter((item) => {
        if (item.id === host.id) return false;

        const text =
          `${item.label || ""} ${item.partCode || ""} ${item.type || ""}`.toLowerCase();

        return text.includes("apron") || text.includes("rail");
      });

      let layoutMinX;
      let layoutMaxX;
      let layoutMinZ;
      let layoutMaxZ;
      let usedApronBounds = false;

      const apronBounds = apronLikeParts.length
        ? getSelectionBoundsXYZ(apronLikeParts)
        : null;

      if (apronBounds) {
        // apron-aware: legs align to frame/apron bounds
        layoutMinX = snap(apronBounds.minX);
        layoutMaxX = snap(apronBounds.maxX);
        layoutMinZ = snap(apronBounds.minZ);
        layoutMaxZ = snap(apronBounds.maxZ);
        usedApronBounds = true;
      } else {
        // fallback: old tabletop-based inset logic
        layoutMinX = snap(hostX + safeInset);
        layoutMaxX = snap(hostX + hostWidth - safeInset);
        layoutMinZ = snap(hostZ + safeInset);
        layoutMaxZ = snap(hostZ + hostDepth - safeInset);
      }

      if (
        layoutMaxX - layoutMinX < GRID_SIZE ||
        layoutMaxZ - layoutMinZ < GRID_SIZE
      ) {
        toast.error("Layout bounds are too small for leg placement.");
        return;
      }

      // current positions ang basis para malaman alin ang FL/FR/BL/BR
      const sortedLegs = [...legs].sort(
        (a, b) =>
          (Number(a.z) || 0) - (Number(b.z) || 0) ||
          (Number(a.x) || 0) - (Number(b.x) || 0),
      );

      const [legFL, legFR, legBL, legBR] = sortedLegs;

      const changesById = {
        [legFL.id]: {
          x: snap(layoutMinX),
          y: undersideY,
          z: snap(layoutMinZ),
        },
        [legFR.id]: {
          x: snap(layoutMaxX - (Number(legFR.width) || 0)),
          y: undersideY,
          z: snap(layoutMinZ),
        },
        [legBL.id]: {
          x: snap(layoutMinX),
          y: undersideY,
          z: snap(layoutMaxZ - (Number(legBL.depth) || 0)),
        },
        [legBR.id]: {
          x: snap(layoutMaxX - (Number(legBR.width) || 0)),
          y: undersideY,
          z: snap(layoutMaxZ - (Number(legBR.depth) || 0)),
        },
      };

      updateManyComps(changesById);
      setSelectedId(host.id);
      setEdit3DId(host.id);
      setTransformMode("translate");

      toast.success(
        usedApronBounds
          ? "Leg Layout applied using apron/frame bounds."
          : "Leg Layout applied.",
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      components,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const getSmartBuilderHostAndTargets3D = useCallback(() => {
    if (!activeSelectedComponents3D.length) {
      return { host: null, targets: [] };
    }

    const getHostScore = (comp) => {
      const text =
        `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
          .toLowerCase()
          .trim();

      let score = 0;

      if (
        text.includes("body") ||
        text.includes("core") ||
        text.includes("cabinet") ||
        text.includes("carcass") ||
        text.includes("case") ||
        text.includes("box")
      ) {
        score += 5000;
      }

      if (
        text.includes("panel") ||
        text.includes("shelf") ||
        text.includes("door") ||
        text.includes("drawer") ||
        text.includes("leg")
      ) {
        score -= 1000;
      }

      const volume =
        (Number(comp?.width) || 0) *
        (Number(comp?.height) || 0) *
        (Number(comp?.depth) || 0);

      return score + volume;
    };

    const sorted = [...activeSelectedComponents3D].sort((a, b) => {
      const scoreDiff = getHostScore(b) - getHostScore(a);
      if (scoreDiff !== 0) return scoreDiff;

      if (b.id === selectedId) return 1;
      if (a.id === selectedId) return -1;
      return 0;
    });

    const host = sorted[0] || null;
    const targets = sorted.filter((item) => item.id !== host?.id);

    return { host, targets };
  }, [activeSelectedComponents3D, selectedId]);

  const getCabinetBuilderContext3D = useCallback(() => {
    const primaryId = selectedId || selectedIds[0] || null;

    if (!primaryId) {
      toast.error("Select a cabinet part first.");
      return null;
    }

    const assemblyItems = getAssemblyItemsFromComponent(primaryId)
      .map((item) => normalizeComponent(item))
      .filter((item) => item?.id);

    if (!assemblyItems.length) {
      toast.error("No cabinet assembly found from the current selection.");
      return null;
    }

    const textOf = (item) =>
      `${item?.label || ""} ${item?.partCode || ""} ${item?.type || ""}`
        .toLowerCase()
        .trim();

    const isFrontLike = (item) => {
      const text = textOf(item);
      return (
        item?.type === "door_front_panel" ||
        item?.type === "drawer_front_panel" ||
        item?.type === "body_front_panel" ||
        text.includes("front") ||
        text.includes("door") ||
        text.includes("drawer")
      );
    };

    const isDividerLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_divider" || text.includes("divider");
    };

    const isShelfLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_shelf" || text.includes("shelf");
    };

    const isBackLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_back_panel" || text.includes("back");
    };

    const isSideLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_side_panel" || text.includes("side");
    };

    const isTopLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_top_panel" || text.includes("top");
    };

    const isBottomLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_bottom_panel" || text.includes("bottom");
    };

    const frontParts = assemblyItems.filter(isFrontLike);
    const dividerParts = assemblyItems.filter(isDividerLike);
    const shelfParts = assemblyItems.filter(isShelfLike);
    const backParts = assemblyItems.filter(isBackLike);
    const sideParts = assemblyItems.filter(isSideLike);
    const topParts = assemblyItems.filter(isTopLike);
    const bottomParts = assemblyItems.filter(isBottomLike);

    const bodyParts = assemblyItems.filter(
      (item) => !frontParts.some((f) => f.id === item.id),
    );
    const shellParts = bodyParts.filter(
      (item) =>
        sideParts.some((p) => p.id === item.id) ||
        topParts.some((p) => p.id === item.id) ||
        bottomParts.some((p) => p.id === item.id) ||
        backParts.some((p) => p.id === item.id),
    );

    const shellBounds = getSelectionBoundsXYZ(
      bodyParts.length ? bodyParts : assemblyItems,
    );
    if (!shellBounds) {
      toast.error("Unable to compute cabinet bounds.");
      return null;
    }

    const thicknessSamples = [
      ...sideParts.map((p) => Number(p.width) || 0),
      ...topParts.map((p) => Number(p.height) || 0),
      ...bottomParts.map((p) => Number(p.height) || 0),
      ...dividerParts.map((p) => Number(p.width) || 0),
      ...shelfParts.map((p) => Number(p.height) || 0),
    ].filter((value) => value > 0);

    const thickness = snap(
      Math.max(
        GRID_SIZE,
        thicknessSamples.length ? Math.min(...thicknessSamples) : 20,
      ),
    );

    const backThicknessSamples = backParts
      .map((p) => Number(p.depth) || 0)
      .filter((value) => value > 0);

    const backThickness = snap(
      Math.max(
        GRID_SIZE,
        backThicknessSamples.length
          ? Math.min(...backThicknessSamples)
          : thickness,
      ),
    );

    const inner = {
      minX: snap(shellBounds.minX + thickness),
      maxX: snap(shellBounds.maxX - thickness),
      minY: snap(shellBounds.minY + thickness),
      maxY: snap(shellBounds.maxY - thickness),
      minZ: snap(shellBounds.minZ + backThickness),
      maxZ: snap(shellBounds.maxZ),
    };

    const innerWidth = snap(Math.max(GRID_SIZE, inner.maxX - inner.minX));
    const innerHeight = snap(Math.max(GRID_SIZE, inner.maxY - inner.minY));
    const innerDepth = snap(Math.max(GRID_SIZE, inner.maxZ - inner.minZ));

    if (
      innerWidth < GRID_SIZE ||
      innerHeight < GRID_SIZE ||
      innerDepth < GRID_SIZE
    ) {
      toast.error("Cabinet interior is too small.");
      return null;
    }

    const sortedDividers = [...dividerParts].sort(
      (a, b) => (Number(a.x) || 0) - (Number(b.x) || 0),
    );

    const bayRects = [];
    let currentBayX = inner.minX;

    sortedDividers.forEach((divider, index) => {
      const dividerX = snap(Number(divider.x) || currentBayX);
      const bayWidth = snap(dividerX - currentBayX);

      if (bayWidth > GRID_SIZE) {
        bayRects.push({
          bayIndex: index + 1,
          x: currentBayX,
          y: inner.minY,
          z: inner.minZ,
          width: bayWidth,
          height: innerHeight,
          depth: innerDepth,
        });
      }

      currentBayX = snap(dividerX + (Number(divider.width) || thickness));
    });

    const lastBayWidth = snap(inner.maxX - currentBayX);
    if (lastBayWidth > GRID_SIZE) {
      bayRects.push({
        bayIndex: bayRects.length + 1,
        x: currentBayX,
        y: inner.minY,
        z: inner.minZ,
        width: lastBayWidth,
        height: innerHeight,
        depth: innerDepth,
      });
    }

    if (!bayRects.length) {
      bayRects.push({
        bayIndex: 1,
        x: inner.minX,
        y: inner.minY,
        z: inner.minZ,
        width: innerWidth,
        height: innerHeight,
        depth: innerDepth,
      });
    }

    const overlapsBay = (part, bay) => {
      const partMinX = Number(part.x) || 0;
      const partMaxX = partMinX + (Number(part.width) || 0);
      const bayMinX = Number(bay.x) || 0;
      const bayMaxX = bayMinX + (Number(bay.width) || 0);
      const overlap = Math.min(partMaxX, bayMaxX) - Math.max(partMinX, bayMinX);
      return (
        overlap >
        Math.max(
          GRID_SIZE,
          Math.min(Number(part.width) || 0, Number(bay.width) || 0) * 0.25,
        )
      );
    };

    const openingRects = [];

    bayRects.forEach((bay) => {
      const bayShelves = shelfParts
        .filter((shelf) => overlapsBay(shelf, bay))
        .sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));

      let cursorY = bay.y;
      let rowIndex = 1;

      bayShelves.forEach((shelf) => {
        const shelfY = snap(Number(shelf.y) || cursorY);
        const openingHeight = snap(shelfY - cursorY);

        if (openingHeight > GRID_SIZE) {
          openingRects.push({
            bayIndex: bay.bayIndex,
            rowIndex,
            x: bay.x,
            y: cursorY,
            z: bay.z,
            width: bay.width,
            height: openingHeight,
            depth: bay.depth,
          });
          rowIndex += 1;
        }

        cursorY = snap(shelfY + (Number(shelf.height) || thickness));
      });

      const finalOpeningHeight = snap(bay.y + bay.height - cursorY);
      if (finalOpeningHeight > GRID_SIZE) {
        openingRects.push({
          bayIndex: bay.bayIndex,
          rowIndex,
          x: bay.x,
          y: cursorY,
          z: bay.z,
          width: bay.width,
          height: finalOpeningHeight,
          depth: bay.depth,
        });
      }
    });

    const overallRect = {
      x: inner.minX,
      y: inner.minY,
      z: inner.minZ,
      width: innerWidth,
      height: innerHeight,
      depth: innerDepth,
    };

    const styleSource = shellParts[0] ||
      bodyParts[0] ||
      assemblyItems[0] || {
        material: "Marine Plywood",
        fill: "#d9c2a5",
        finish: "",
        groupType: "assembly",
        groupLabel: "Cabinet Box",
      };

    const buildPart = (overrides = {}) =>
      normalizeComponent({
        ...deepClone(styleSource),
        id: createObjectId(),
        groupId: styleSource.groupId || makeGroupId(),
        groupLabel: styleSource.groupLabel || "Cabinet Box",
        groupType: styleSource.groupType || "assembly",
        qty: 1,
        locked: false,
        blueprintStyle: "box",
        rotationY: 0,
        material:
          overrides.material ?? styleSource.material ?? "Marine Plywood",
        finish: overrides.finish ?? styleSource.finish ?? "",
        fill: overrides.fill ?? styleSource.fill ?? "#d9c2a5",
        unitPrice: overrides.unitPrice ?? styleSource.unitPrice ?? 0,
        ...overrides,
      });

    return {
      primaryId,
      assemblyItems,
      shellParts,
      bodyParts,
      frontParts,
      dividerParts: sortedDividers,
      shelfParts,
      backParts,
      sideParts,
      topParts,
      bottomParts,
      shellBounds,
      inner,
      overallRect,
      bayRects,
      openingRects,
      thickness,
      backThickness,
      frontZ: snap(shellBounds.maxZ),
      buildPart,
      removeInteriorAndFrontIds: new Set([
        ...sortedDividers.map((p) => p.id),
        ...shelfParts.map((p) => p.id),
        ...frontParts.map((p) => p.id),
      ]),
      removeFrontIds: new Set(frontParts.map((p) => p.id)),
    };
  }, [
    selectedId,
    selectedIds,
    getAssemblyItemsFromComponent,
    getSelectionBoundsXYZ,
  ]);

  const getSmartHelperSelection3D = useCallback(
    (mode = "front") => {
      const explicit = getSmartBuilderHostAndTargets3D();

      if (explicit.host && explicit.targets.length) {
        return {
          ...explicit,
          ctx: null,
          sourceMode: "explicit",
        };
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) {
        return {
          host: null,
          targets: [],
          ctx: null,
          sourceMode: "none",
        };
      }

      const host =
        ctx.shellParts?.[0] ||
        ctx.bodyParts?.[0] ||
        ctx.assemblyItems?.[0] ||
        null;

      if (!host) {
        return {
          host: null,
          targets: [],
          ctx,
          sourceMode: "none",
        };
      }

      const uniqueById = (items = []) => {
        const map = new Map();
        (items || []).forEach((item) => {
          if (item?.id && !map.has(item.id)) {
            map.set(item.id, item);
          }
        });
        return Array.from(map.values());
      };

      let targets = [];

      if (mode === "shelf") {
        targets = uniqueById(ctx.shelfParts || []);
      } else if (mode === "panel") {
        targets = uniqueById([
          ...(ctx.dividerParts || []),
          ...(ctx.sideParts || []),
          ...(ctx.backParts || []),
        ]);
      } else {
        targets = uniqueById(ctx.frontParts || []);
      }

      return {
        host,
        targets,
        ctx,
        sourceMode: "auto",
      };
    },
    [getSmartBuilderHostAndTargets3D, getCabinetBuilderContext3D],
  );

  const buildSelectionLine3D = useCallback(
    (axis = "x", gap = 0, anchorMode = "preserve-first") => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build line. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error("Select at least 2 objects to build a line.");
        return;
      }

      const safeGap = snap(Math.max(0, Number(gap) || 0));
      const { posKey, sizeKey, label } = getSmartAxisMeta(axis);

      const crossAxes = ["x", "y", "z"].filter((key) => key !== axis);
      const crossSizeMap = {
        x: "width",
        y: "height",
        z: "depth",
      };

      const sorted = [...activeSelectedComponents3D].sort(
        (a, b) =>
          (Number(a[posKey]) || 0) - (Number(b[posKey]) || 0) ||
          (Number(a[sizeKey]) || 0) - (Number(b[sizeKey]) || 0),
      );

      const anchor = sorted[0];
      const last = sorted[sorted.length - 1];
      if (!anchor || !last) return;

      const bounds = getSelectionBoundsXYZ(sorted);
      if (!bounds) return;

      const totalSpan =
        sorted.reduce((sum, comp) => sum + (Number(comp[sizeKey]) || 0), 0) +
        safeGap * Math.max(0, sorted.length - 1);

      let cursor = Number(anchor[posKey]) || 0;

      if (anchorMode === "preserve-last") {
        const lastEnd =
          (Number(last[posKey]) || 0) + (Number(last[sizeKey]) || 0);
        cursor = snap(lastEnd - totalSpan);
      } else if (anchorMode === "center") {
        const axisCenter =
          axis === "x"
            ? bounds.centerX
            : axis === "y"
              ? bounds.centerY
              : bounds.centerZ;

        cursor = snap(axisCenter - totalSpan / 2);
      }

      const anchorCenters = {
        x: (Number(anchor.x) || 0) + (Number(anchor.width) || 0) / 2,
        y: (Number(anchor.y) || 0) + (Number(anchor.height) || 0) / 2,
        z: (Number(anchor.z) || 0) + (Number(anchor.depth) || 0) / 2,
      };

      const changesById = {};

      sorted.forEach((comp) => {
        const nextAttrs = {
          [posKey]: snap(cursor),
        };

        crossAxes.forEach((crossAxis) => {
          const sizeKeyForAxis = crossSizeMap[crossAxis];
          const size = Number(comp[sizeKeyForAxis]) || 0;
          nextAttrs[crossAxis] = snap(anchorCenters[crossAxis] - size / 2);
        });

        changesById[comp.id] = nextAttrs;
        cursor += (Number(comp[sizeKey]) || 0) + safeGap;
      });

      updateManyComps(changesById);
      setTransformMode("translate");

      const modeLabel =
        anchorMode === "preserve-last"
          ? "Preserve Last"
          : anchorMode === "center"
            ? "Center"
            : "Preserve First";

      toast.success(`Built clean line on ${label} axis (${modeLabel}).`);
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartAxisMeta,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const autoShelfStack3D = useCallback(
    (inset = 40, gap = null) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot auto-stack shelves. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("shelf");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No shelf parts found in this cabinet assembly. Build shelves first or select shelf parts."
            : "Select 1 host body and 1 or more shelf parts.",
        );
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const inner = {
        minX: snap((Number(host.x) || 0) + safeInset),
        minY: snap((Number(host.y) || 0) + safeInset),
        minZ: snap((Number(host.z) || 0) + safeInset),
        maxX: snap(
          (Number(host.x) || 0) + (Number(host.width) || 0) - safeInset,
        ),
        maxY: snap(
          (Number(host.y) || 0) + (Number(host.height) || 0) - safeInset,
        ),
        maxZ: snap(
          (Number(host.z) || 0) + (Number(host.depth) || 0) - safeInset,
        ),
      };

      const innerWidth = snap(Math.max(GRID_SIZE, inner.maxX - inner.minX));
      const innerHeight = snap(Math.max(GRID_SIZE, inner.maxY - inner.minY));
      const innerDepth = snap(Math.max(GRID_SIZE, inner.maxZ - inner.minZ));

      if (
        innerWidth < GRID_SIZE ||
        innerHeight < GRID_SIZE ||
        innerDepth < GRID_SIZE
      ) {
        toast.error("Host interior is too small for shelf stack.");
        return;
      }

      const shelves = [...targets].sort(
        (a, b) =>
          (Number(a.y) || 0) - (Number(b.y) || 0) ||
          (Number(a.height) || 0) - (Number(b.height) || 0),
      );

      const totalShelfThickness = shelves.reduce(
        (sum, shelf) =>
          sum + Math.max(GRID_SIZE, snap(Number(shelf.height) || GRID_SIZE)),
        0,
      );

      const gapCount = shelves.length + 1;
      const computedGap =
        gap === null || gap === undefined || gap === ""
          ? snap(Math.max(0, (innerHeight - totalShelfThickness) / gapCount))
          : snap(Math.max(0, Number(gap) || 0));

      const requiredHeight = totalShelfThickness + computedGap * gapCount;

      if (requiredHeight > innerHeight + 0.001) {
        toast.error("Not enough vertical space for the selected shelves.");
        return;
      }

      const changesById = {};
      let cursorY = inner.minY + computedGap;

      shelves.forEach((shelf) => {
        const shelfThickness = Math.max(
          GRID_SIZE,
          snap(Math.min(Number(shelf.height) || GRID_SIZE, innerHeight)),
        );

        changesById[shelf.id] = {
          x: inner.minX,
          y: snap(cursorY),
          z: inner.minZ,
          width: innerWidth,
          height: shelfThickness,
          depth: innerDepth,
        };

        cursorY += shelfThickness + computedGap;
      });

      updateManyComps(changesById);
      setSelectedId(host.id);
      setEdit3DId(host.id);
      setTransformMode("translate");
      toast.success(
        `Auto Shelf Stack applied (${shelves.length} shelf${shelves.length !== 1 ? "ves" : ""}).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      updateManyComps,
    ],
  );

  const panelPairSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build panel pair. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("panel");
      const source = targets?.[0] || null;

      if (!host || !source) {
        toast.error(
          sourceMode === "auto"
            ? "No panel-like parts found in this cabinet assembly. Select a divider, side panel, or back panel."
            : "Select 1 host body and 1 panel part.",
        );
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const innerHeight = snap(Math.max(GRID_SIZE, hostHeight - safeInset * 2));
      const innerDepth = snap(Math.max(GRID_SIZE, hostDepth - safeInset * 2));
      const maxPanelThickness = Math.max(
        GRID_SIZE,
        Math.floor((hostWidth - safeInset * 2) / 2),
      );

      const panelThickness = snap(
        Math.max(
          GRID_SIZE,
          Math.min(Number(source.width) || GRID_SIZE, maxPanelThickness),
        ),
      );

      if (innerHeight < GRID_SIZE || innerDepth < GRID_SIZE) {
        toast.error("Host interior is too small for panel pair.");
        return;
      }

      const baseLabel = String(source.label || "Panel")
        .replace(/left/gi, "")
        .replace(/right/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      const basePartCode = String(source.partCode || "PANEL")
        .replace(/[-_ ]?(L|R)$/i, "")
        .trim();

      const leftPanelAttrs = {
        x: snap((Number(host.x) || 0) + safeInset),
        y: snap((Number(host.y) || 0) + safeInset),
        z: snap((Number(host.z) || 0) + safeInset),
        width: panelThickness,
        height: innerHeight,
        depth: innerDepth,
        label: `${baseLabel || "Panel"} Left`,
        partCode: `${basePartCode || "PANEL"}-L`,
      };

      const rightPanelId = createObjectId();
      const rightPanel = normalizeComponent({
        ...deepClone(source),
        id: rightPanelId,
        x: snap((Number(host.x) || 0) + hostWidth - safeInset - panelThickness),
        y: snap((Number(host.y) || 0) + safeInset),
        z: snap((Number(host.z) || 0) + safeInset),
        width: panelThickness,
        height: innerHeight,
        depth: innerDepth,
        label: `${baseLabel || "Panel"} Right`,
        partCode: `${basePartCode || "PANEL"}-R`,
        locked: false,
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .map((item) =>
            item.id === source.id
              ? normalizeComponent({
                  ...item,
                  ...leftPanelAttrs,
                })
              : item,
          )
          .concat(rightPanel),
      );

      setSelectedIds([source.id, rightPanelId]);
      setSelectedId(source.id);
      setEdit3DId(source.id);
      setTransformMode("translate");

      toast.success("Panel Pair applied.");
    },
    [
      editorMode,
      hasLockedSmartSelection3D,

      getSmartHelperSelection3D,
      components,
      pushHistory,
    ],
  );

  const frontPairSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build front pair. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("front");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No front parts found in this cabinet assembly. Create cabinet fronts first or select a front part."
            : "Select 1 host body and 1 front part.",
        );
        return;
      }

      const getFrontSourceScore = (comp) => {
        const text =
          `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
            .toLowerCase()
            .trim();

        const width = Math.max(GRID_SIZE, Number(comp?.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(comp?.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(comp?.depth) || GRID_SIZE);
        const volume = width * height * depth;
        const frontArea = width * height;
        const thinRatio = depth / Math.max(width, height);

        let score = 0;

        if (text.includes("front")) score += 6000;
        if (text.includes("door")) score += 5000;
        if (text.includes("panel")) score += 4000;
        if (text.includes("drawer")) score += 1500;
        if (text.includes("shelf") || text.includes("leg")) score -= 2500;
        if (
          text.includes("body") ||
          text.includes("cabinet") ||
          text.includes("core")
        )
          score -= 4000;

        score += frontArea * 0.2;
        score -= volume * 0.0005;
        score -= thinRatio * 1000;

        return score;
      };

      const sortedTargets = [...targets].sort((a, b) => {
        const scoreDiff = getFrontSourceScore(b) - getFrontSourceScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        return 0;
      });

      const source = sortedTargets[0] || null;
      const extraTargetIds = new Set(
        sortedTargets.slice(1).map((item) => item.id),
      );

      if (!source) {
        toast.error("Select 1 host body and 1 front part.");
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const usableWidth = snap(
        Math.max(GRID_SIZE * 2, hostWidth - safeInset * 2),
      );
      const usableHeight = snap(
        Math.max(GRID_SIZE, hostHeight - safeInset * 2),
      );

      if (usableWidth < GRID_SIZE * 2 || usableHeight < GRID_SIZE) {
        toast.error("Host front face is too small for front pair.");
        return;
      }

      const pairGap = snap(
        Math.max(0, Math.min(20, usableWidth - GRID_SIZE * 2)),
      );
      const frontWidth = snap(Math.max(GRID_SIZE, (usableWidth - pairGap) / 2));

      const sourceDepth = Math.max(
        GRID_SIZE,
        Number(source.depth) || GRID_SIZE,
      );
      const maxFaceThickness = Math.max(GRID_SIZE, hostDepth - safeInset);
      const faceThickness = snap(
        Math.max(GRID_SIZE, Math.min(sourceDepth, maxFaceThickness)),
      );

      const sourceText =
        `${source.label || ""} ${source.partCode || ""} ${source.type || ""}`
          .toLowerCase()
          .trim();

      const isDoorLike = sourceText.includes("door");
      const isPanelLike = sourceText.includes("panel") || !isDoorLike;

      const leftLabel = isDoorLike
        ? "Left Front Door"
        : isPanelLike
          ? "Left Front Panel"
          : "Left Front";

      const rightLabel = isDoorLike
        ? "Right Front Door"
        : isPanelLike
          ? "Right Front Panel"
          : "Right Front";

      const leftCode = isDoorLike ? "FRONT-L" : "FRONT-PANEL-L";
      const rightCode = isDoorLike ? "FRONT-R" : "FRONT-PANEL-R";

      const faceX = snap(hostX + safeInset);
      const faceY = snap(hostY + safeInset);
      const faceZ = snap(hostZ + hostDepth - faceThickness);

      const leftFrontAttrs = {
        x: faceX,
        y: faceY,
        z: faceZ,
        width: frontWidth,
        height: usableHeight,
        depth: faceThickness,
        label: leftLabel,
        partCode: leftCode,
        locked: false,
      };

      const rightFrontId = createObjectId();
      const rightFront = normalizeComponent({
        ...deepClone(source),
        id: rightFrontId,
        x: snap(faceX + frontWidth + pairGap),
        y: faceY,
        z: faceZ,
        width: frontWidth,
        height: usableHeight,
        depth: faceThickness,
        label: rightLabel,
        partCode: rightCode,
        locked: false,
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .filter((item) => !extraTargetIds.has(item.id))
          .map((item) =>
            item.id === source.id
              ? normalizeComponent({
                  ...item,
                  ...leftFrontAttrs,
                })
              : item,
          )
          .concat(rightFront),
      );

      setSelectedIds([source.id, rightFrontId]);
      setSelectedId(source.id);
      setEdit3DId(source.id);
      setTransformMode("translate");

      toast.success(
        extraTargetIds.size
          ? `Front Pair applied. Extra selected front part(s) replaced: ${extraTargetIds.size}.`
          : "Front Pair applied.",
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      components,
      pushHistory,
      selectedId,
    ],
  );

  const doorSplitSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build door split. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("front");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No door/front parts found in this cabinet assembly. Create cabinet fronts first or select a door/front part."
            : "Select 1 host body and 1 door/front part.",
        );
        return;
      }

      const getDoorSourceScore = (comp) => {
        const text =
          `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
            .toLowerCase()
            .trim();

        const width = Math.max(GRID_SIZE, Number(comp?.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(comp?.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(comp?.depth) || GRID_SIZE);
        const frontArea = width * height;
        const volume = width * height * depth;

        let score = 0;
        if (text.includes("door")) score += 8000;
        if (text.includes("front")) score += 5000;
        if (text.includes("panel")) score += 2000;
        if (text.includes("drawer")) score -= 3000;
        if (text.includes("shelf") || text.includes("leg")) score -= 4000;
        if (
          text.includes("body") ||
          text.includes("cabinet") ||
          text.includes("core")
        )
          score -= 5000;

        score += frontArea * 0.2;
        score -= volume * 0.0005;
        return score;
      };

      const sortedTargets = [...targets].sort((a, b) => {
        const scoreDiff = getDoorSourceScore(b) - getDoorSourceScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        return 0;
      });

      const source = sortedTargets[0] || null;
      const extraTargetIds = new Set(
        sortedTargets.slice(1).map((item) => item.id),
      );

      if (!source) {
        toast.error("Select 1 host body and 1 door/front part.");
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const usableWidth = snap(
        Math.max(GRID_SIZE * 2, hostWidth - safeInset * 2),
      );
      const usableHeight = snap(
        Math.max(GRID_SIZE, hostHeight - safeInset * 2),
      );

      if (usableWidth < GRID_SIZE * 2 || usableHeight < GRID_SIZE) {
        toast.error("Host front face is too small for door split.");
        return;
      }

      const centerGap = snap(Math.max(8, Math.min(24, usableWidth * 0.02)));
      const eachWidth = snap(Math.floor((usableWidth - centerGap) / 2));

      if (eachWidth < GRID_SIZE) {
        toast.error("Not enough width for split doors.");
        return;
      }

      const sourceDepth = Math.max(
        GRID_SIZE,
        Number(source.depth) || GRID_SIZE,
      );
      const maxFaceThickness = Math.max(GRID_SIZE, hostDepth - safeInset);
      const faceThickness = snap(
        Math.max(GRID_SIZE, Math.min(sourceDepth, maxFaceThickness)),
      );

      const faceX = snap(hostX + safeInset);
      const faceY = snap(hostY + safeInset);
      const faceZ = snap(hostZ + hostDepth - faceThickness);

      const leftDoorAttrs = {
        x: faceX,
        y: faceY,
        z: faceZ,
        width: eachWidth,
        height: usableHeight,
        depth: faceThickness,
        label: "Left Door",
        partCode: "DOOR-L",
        locked: false,
      };

      const rightDoorId = createObjectId();
      const rightDoor = normalizeComponent({
        ...deepClone(source),
        id: rightDoorId,
        x: snap(faceX + eachWidth + centerGap),
        y: faceY,
        z: faceZ,
        width: eachWidth,
        height: usableHeight,
        depth: faceThickness,
        label: "Right Door",
        partCode: "DOOR-R",
        locked: false,
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .filter((item) => !extraTargetIds.has(item.id))
          .map((item) =>
            item.id === source.id
              ? normalizeComponent({
                  ...item,
                  ...leftDoorAttrs,
                })
              : item,
          )
          .concat(rightDoor),
      );

      setSelectedIds([source.id, rightDoorId]);
      setSelectedId(source.id);
      setEdit3DId(source.id);
      setTransformMode("translate");

      toast.success(
        extraTargetIds.size
          ? `Door Split applied. Extra selected front part(s) removed: ${extraTargetIds.size}.`
          : "Door Split applied.",
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      components,
      pushHistory,
      selectedId,
    ],
  );

  const drawerStackSelection3D = useCallback(
    (inset = 40, desiredCount = 3) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build drawer stack. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("front");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No drawer/front parts found in this cabinet assembly. Create cabinet fronts first or select a drawer/front part."
            : "Select 1 host body and 1 drawer/front part.",
        );
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const safeCount = Math.max(
        2,
        Math.min(
          8,
          Number(desiredCount) || (targets.length > 1 ? targets.length : 3),
        ),
      );

      const getDrawerSourceScore = (comp) => {
        const text =
          `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
            .toLowerCase()
            .trim();

        const width = Math.max(GRID_SIZE, Number(comp?.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(comp?.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(comp?.depth) || GRID_SIZE);
        const frontArea = width * height;
        const volume = width * height * depth;

        let score = 0;
        if (text.includes("drawer")) score += 7000;
        if (text.includes("front")) score += 4500;
        if (text.includes("panel")) score += 2500;
        if (text.includes("door")) score -= 2500;
        if (text.includes("shelf") || text.includes("leg")) score -= 4000;
        if (
          text.includes("body") ||
          text.includes("cabinet") ||
          text.includes("core")
        )
          score -= 5000;

        score += frontArea * 0.2;
        score -= volume * 0.0005;

        return score;
      };

      const sortedTargets = [...targets].sort((a, b) => {
        const scoreDiff = getDrawerSourceScore(b) - getDrawerSourceScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        return 0;
      });

      const source = sortedTargets[0] || null;
      if (!source) {
        toast.error("Select 1 host body and 1 drawer/front part.");
        return;
      }

      const templateTargets = sortedTargets.slice(0, safeCount);
      const extraTargetIds = new Set(
        sortedTargets.slice(safeCount).map((item) => item.id),
      );

      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const usableWidth = snap(Math.max(GRID_SIZE, hostWidth - safeInset * 2));
      const usableHeight = snap(
        Math.max(GRID_SIZE * 2, hostHeight - safeInset * 2),
      );

      if (usableWidth < GRID_SIZE || usableHeight < GRID_SIZE * 2) {
        toast.error("Host front face is too small for drawer stack.");
        return;
      }

      const templateDepth = Math.max(
        GRID_SIZE,
        Number(source.depth) || GRID_SIZE,
      );
      const maxFaceThickness = Math.max(GRID_SIZE, hostDepth - safeInset);
      const faceThickness = snap(
        Math.max(GRID_SIZE, Math.min(templateDepth, maxFaceThickness)),
      );

      const preferredGap = Math.max(8, Math.min(20, snap(usableHeight * 0.02)));
      const maxGap = Math.max(0, usableHeight - GRID_SIZE * 2 * safeCount);
      const drawerGap = snap(
        Math.min(preferredGap, maxGap / Math.max(1, safeCount - 1)),
      );
      const eachHeight = snap(
        Math.floor(
          (usableHeight - drawerGap * Math.max(0, safeCount - 1)) / safeCount,
        ),
      );

      if (eachHeight < GRID_SIZE * 2) {
        toast.error(
          "Not enough vertical space for the requested drawer count.",
        );
        return;
      }

      const totalStackHeight =
        eachHeight * safeCount + drawerGap * Math.max(0, safeCount - 1);
      const stackOffsetY = snap(
        Math.max(0, (usableHeight - totalStackHeight) / 2),
      );

      const faceX = snap(hostX + safeInset);
      const faceY = snap(hostY + safeInset + stackOffsetY);
      const faceZ = snap(hostZ + hostDepth - faceThickness);

      const resultIds = [];
      const createdParts = [];
      const updateMap = new Map();

      for (let index = 0; index < safeCount; index += 1) {
        const target = templateTargets[index] || null;
        const nextId = target?.id || createObjectId();
        const y = snap(faceY + index * (eachHeight + drawerGap));
        const label = `Drawer Front ${index + 1}`;
        const partCode = `DRAWER-${String(index + 1).padStart(2, "0")}`;

        const nextAttrs = {
          x: faceX,
          y,
          z: faceZ,
          width: usableWidth,
          height: eachHeight,
          depth: faceThickness,
          label,
          partCode,
          locked: false,
        };

        resultIds.push(nextId);

        if (target) {
          updateMap.set(target.id, nextAttrs);
        } else {
          createdParts.push(
            normalizeComponent({
              ...deepClone(source),
              id: nextId,
              ...nextAttrs,
            }),
          );
        }
      }

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .filter((item) => !extraTargetIds.has(item.id))
          .map((item) => {
            const attrs = updateMap.get(item.id);
            return attrs
              ? normalizeComponent({
                  ...item,
                  ...attrs,
                })
              : item;
          })
          .concat(createdParts),
      );

      setSelectedIds(resultIds);
      setSelectedId(resultIds[0] || null);
      setEdit3DId(resultIds[0] || null);
      setTransformMode("translate");

      toast.success(
        extraTargetIds.size
          ? `Drawer Stack applied (${safeCount} drawers). Extra selected part(s) removed: ${extraTargetIds.size}.`
          : `Drawer Stack applied (${safeCount} drawers).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      components,
      pushHistory,
      selectedId,
    ],
  );

  const faceFitSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot face-fit. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("front");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No front parts found in this cabinet assembly. Create cabinet fronts first or select a front part."
            : "Select 1 host body and 1 front part.",
        );
        return;
      }

      const getFaceSourceScore = (comp) => {
        const text =
          `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
            .toLowerCase()
            .trim();

        const width = Math.max(GRID_SIZE, Number(comp?.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(comp?.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(comp?.depth) || GRID_SIZE);
        const frontArea = width * height;
        const volume = width * height * depth;

        let score = 0;
        if (text.includes("front")) score += 7000;
        if (text.includes("door")) score += 5000;
        if (text.includes("panel")) score += 4500;
        if (text.includes("drawer")) score += 3000;
        if (text.includes("shelf") || text.includes("leg")) score -= 3500;
        if (
          text.includes("body") ||
          text.includes("cabinet") ||
          text.includes("core")
        )
          score -= 5000;

        score += frontArea * 0.2;
        score -= volume * 0.0005;
        return score;
      };

      const sortedTargets = [...targets].sort((a, b) => {
        const scoreDiff = getFaceSourceScore(b) - getFaceSourceScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        return 0;
      });

      const source = sortedTargets[0] || null;
      const extraTargetIds = new Set(
        sortedTargets.slice(1).map((item) => item.id),
      );

      if (!source) {
        toast.error("Select 1 host body and 1 front part.");
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const usableWidth = snap(Math.max(GRID_SIZE, hostWidth - safeInset * 2));
      const usableHeight = snap(
        Math.max(GRID_SIZE, hostHeight - safeInset * 2),
      );

      if (usableWidth < GRID_SIZE || usableHeight < GRID_SIZE) {
        toast.error("Host front face is too small for face fit.");
        return;
      }

      const sourceDepth = Math.max(
        GRID_SIZE,
        Number(source.depth) || GRID_SIZE,
      );
      const maxFaceThickness = Math.max(GRID_SIZE, hostDepth - safeInset);
      const faceThickness = snap(
        Math.max(GRID_SIZE, Math.min(sourceDepth, maxFaceThickness)),
      );

      const sourceText =
        `${source.label || ""} ${source.partCode || ""} ${source.type || ""}`
          .toLowerCase()
          .trim();

      const isDoorLike = sourceText.includes("door");
      const isDrawerLike = sourceText.includes("drawer");
      const isPanelLike =
        sourceText.includes("panel") || (!isDoorLike && !isDrawerLike);

      const faceLabel = isDoorLike
        ? "Front Door"
        : isDrawerLike
          ? "Front Drawer"
          : isPanelLike
            ? "Front Panel"
            : "Front Face";

      const faceCode = isDoorLike
        ? "DOOR-F"
        : isDrawerLike
          ? "DRAWER-F"
          : isPanelLike
            ? "FRONT-PANEL"
            : "FRONT-FIT";

      const faceAttrs = {
        x: snap(hostX + safeInset),
        y: snap(hostY + safeInset),
        z: snap(hostZ + hostDepth - faceThickness),
        width: usableWidth,
        height: usableHeight,
        depth: faceThickness,
        label: faceLabel,
        partCode: faceCode,
        locked: false,
      };

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .filter((item) => !extraTargetIds.has(item.id))
          .map((item) =>
            item.id === source.id
              ? normalizeComponent({
                  ...item,
                  ...faceAttrs,
                })
              : item,
          ),
      );

      setSelectedIds([source.id]);
      setSelectedId(source.id);
      setEdit3DId(source.id);
      setTransformMode("translate");

      toast.success(
        extraTargetIds.size
          ? `Face Fit applied. Extra selected front part(s) removed: ${extraTargetIds.size}.`
          : "Face Fit applied.",
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      components,
      pushHistory,
      selectedId,
    ],
  );

  const insideFitSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot inside-fit. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error("Select 1 host body and 1 or more parts to fit inside.");
        return;
      }

      const { host, targets } = getSmartBuilderHostAndTargets3D();

      if (!host || !targets.length) {
        toast.error("Select 1 host body and 1 or more parts to fit inside.");
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));

      const inner = {
        minX: snap((Number(host.x) || 0) + safeInset),
        minY: snap((Number(host.y) || 0) + safeInset),
        minZ: snap((Number(host.z) || 0) + safeInset),
        maxX: snap(
          (Number(host.x) || 0) + (Number(host.width) || 0) - safeInset,
        ),
        maxY: snap(
          (Number(host.y) || 0) + (Number(host.height) || 0) - safeInset,
        ),
        maxZ: snap(
          (Number(host.z) || 0) + (Number(host.depth) || 0) - safeInset,
        ),
      };

      const innerWidth = snap(Math.max(GRID_SIZE, inner.maxX - inner.minX));
      const innerHeight = snap(Math.max(GRID_SIZE, inner.maxY - inner.minY));
      const innerDepth = snap(Math.max(GRID_SIZE, inner.maxZ - inner.minZ));

      if (
        innerWidth < GRID_SIZE ||
        innerHeight < GRID_SIZE ||
        innerDepth < GRID_SIZE
      ) {
        toast.error("Host interior is too small for inside fit.");
        return;
      }

      const hostCenterZ = (Number(host.z) || 0) + (Number(host.depth) || 0) / 2;
      const changesById = {};

      targets.forEach((target) => {
        const width = Math.max(GRID_SIZE, Number(target.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(target.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(target.depth) || GRID_SIZE);

        const axisOrder = [
          { axis: "x", value: width },
          { axis: "y", value: height },
          { axis: "z", value: depth },
        ].sort((a, b) => a.value - b.value);

        const thinAxis = axisOrder[0]?.axis || "y";

        if (thinAxis === "x") {
          const panelWidth = snap(Math.min(width, innerWidth));
          const currentCenterX = (Number(target.x) || 0) + width / 2;
          const clampedCenterX = clamp(
            currentCenterX,
            inner.minX + panelWidth / 2,
            inner.maxX - panelWidth / 2,
          );

          changesById[target.id] = {
            x: snap(clampedCenterX - panelWidth / 2),
            y: inner.minY,
            z: inner.minZ,
            width: panelWidth,
            height: innerHeight,
            depth: innerDepth,
          };

          return;
        }

        if (thinAxis === "y") {
          const panelHeight = snap(Math.min(height, innerHeight));
          const currentCenterY = (Number(target.y) || 0) + height / 2;
          const clampedCenterY = clamp(
            currentCenterY,
            inner.minY + panelHeight / 2,
            inner.maxY - panelHeight / 2,
          );

          changesById[target.id] = {
            x: inner.minX,
            y: snap(clampedCenterY - panelHeight / 2),
            z: inner.minZ,
            width: innerWidth,
            height: panelHeight,
            depth: innerDepth,
          };

          return;
        }

        const panelDepth = snap(Math.min(depth, innerDepth));
        const currentCenterZ = (Number(target.z) || 0) + depth / 2;
        const stickToBack = currentCenterZ >= hostCenterZ;

        changesById[target.id] = {
          x: inner.minX,
          y: inner.minY,
          z: stickToBack ? snap(inner.maxZ - panelDepth) : inner.minZ,
          width: innerWidth,
          height: innerHeight,
          depth: panelDepth,
        };
      });

      updateManyComps(changesById);
      setTransformMode("translate");
      toast.success(
        `Inside Fit applied (${targets.length} part${targets.length !== 1 ? "s" : ""}).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartBuilderHostAndTargets3D,
      updateManyComps,
    ],
  );

  const alignSelection3D = useCallback(
    (axis, mode) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot align. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error("Select at least 2 objects to align.");
        return;
      }

      const bounds = getSelectionBoundsXYZ(activeSelectedComponents3D);
      if (!bounds) return;

      const changesById = {};

      activeSelectedComponents3D.forEach((comp) => {
        const width = Number(comp.width) || 0;
        const height = Number(comp.height) || 0;
        const depth = Number(comp.depth) || 0;

        const nextAttrs = {};

        if (axis === "x") {
          if (mode === "min") nextAttrs.x = snap(bounds.minX);
          if (mode === "center") nextAttrs.x = snap(bounds.centerX - width / 2);
          if (mode === "max") nextAttrs.x = snap(bounds.maxX - width);
        }

        if (axis === "y") {
          if (mode === "min") nextAttrs.y = snap(bounds.minY);
          if (mode === "center")
            nextAttrs.y = snap(bounds.centerY - height / 2);
          if (mode === "max") nextAttrs.y = snap(bounds.maxY - height);
        }

        if (axis === "z") {
          if (mode === "min") nextAttrs.z = snap(bounds.minZ);
          if (mode === "center") nextAttrs.z = snap(bounds.centerZ - depth / 2);
          if (mode === "max") nextAttrs.z = snap(bounds.maxZ - depth);
        }

        changesById[comp.id] = nextAttrs;
      });

      updateManyComps(changesById);
      setTransformMode("translate");
      toast.success(`Aligned ${activeSelectedComponents3D.length} object(s).`);
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const flushSelection3D = useCallback(
    (axis, direction) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot flush snap. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error(
          "Select at least 2 objects. The active object will snap against the others.",
        );
        return;
      }

      const movingId = activeSelectionIds3D.includes(selectedId)
        ? selectedId
        : activeSelectionIds3D[0];

      const movingComp =
        activeSelectedComponents3D.find((c) => c.id === movingId) ||
        activeSelectedComponents3D[0];

      const anchorItems = activeSelectedComponents3D.filter(
        (c) => c.id !== movingComp.id,
      );

      if (!movingComp || !anchorItems.length) {
        toast.error(
          "Flush snap needs one active object and at least one anchor.",
        );
        return;
      }

      const anchorBounds = getSelectionBoundsXYZ(anchorItems);
      if (!anchorBounds) return;

      const nextAttrs = {};

      if (axis === "x") {
        nextAttrs.x = snap(
          direction === "negative"
            ? anchorBounds.minX - (Number(movingComp.width) || 0)
            : anchorBounds.maxX,
        );
      }

      if (axis === "y") {
        nextAttrs.y = snap(
          direction === "negative"
            ? anchorBounds.minY - (Number(movingComp.height) || 0)
            : anchorBounds.maxY,
        );
      }

      if (axis === "z") {
        nextAttrs.z = snap(
          direction === "negative"
            ? anchorBounds.minZ - (Number(movingComp.depth) || 0)
            : anchorBounds.maxZ,
        );
      }

      updateManyComps({
        [movingComp.id]: nextAttrs,
      });

      setTransformMode("translate");
      toast.success(`${movingComp.label || "Object"} snapped flush.`);
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      activeSelectionIds3D,
      selectedId,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const mirrorDuplicateSelection3D = useCallback(
    (axis) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot mirror duplicate. One or more selected components are locked.",
        );
        return;
      }

      if (!activeSelectedComponents3D.length) {
        toast.error("Select at least 1 object to mirror duplicate.");
        return;
      }

      const sourceItems = activeSelectedComponents3D.map((item) =>
        deepClone(item),
      );
      const bounds = getSelectionBoundsXYZ(sourceItems);
      if (!bounds) return;

      const GAP = GRID_SIZE * 2;
      const mirrorPlane =
        axis === "x" ? bounds.maxX + GAP / 2 : bounds.maxZ + GAP / 2;

      const groupIdMap = new Map();

      const duplicated = sourceItems.map((item) => {
        let nextGroupId = item.groupId || null;

        if (item.groupId) {
          if (!groupIdMap.has(item.groupId)) {
            groupIdMap.set(item.groupId, makeGroupId());
          }
          nextGroupId = groupIdMap.get(item.groupId);
        }

        const width = Number(item.width) || 0;
        const depth = Number(item.depth) || 0;

        const next = {
          ...deepClone(item),
          id: createObjectId(),
          groupId: nextGroupId,
          locked: false,
          label: item.label ? `${item.label} Mirror` : "Mirrored Object",
        };

        if (axis === "x") {
          const centerX = (Number(item.x) || 0) + width / 2;
          const mirroredCenterX = 2 * mirrorPlane - centerX;
          next.x = snap(mirroredCenterX - width / 2);
        }

        if (axis === "z") {
          const centerZ = (Number(item.z) || 0) + depth / 2;
          const mirroredCenterZ = 2 * mirrorPlane - centerZ;
          next.z = snap(mirroredCenterZ - depth / 2);
        }

        return normalizeComponent(next);
      });

      pushHistory(components);
      setComponents((prev) => [...prev, ...duplicated]);
      setSelectedIds(duplicated.map((item) => item.id));
      setSelectedId(duplicated[0]?.id || null);
      setEdit3DId(duplicated[0]?.id || null);
      setTransformMode("translate");

      toast.success(`Created ${duplicated.length} mirrored duplicate(s).`);
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSelectionBoundsXYZ,
      components,
      pushHistory,
    ],
  );

  const buildCabinetBox3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (view !== "3d") {
        toast.error("Sa 3D view lang puwede gamitin ang Cabinet Box Builder.");
        return;
      }

      const outerWidth = snap(
        Math.max(GRID_SIZE * 4, Number(options.width) || 1200),
      );
      const outerHeight = snap(
        Math.max(GRID_SIZE * 5, Number(options.height) || 2000),
      );
      const outerDepth = snap(
        Math.max(GRID_SIZE * 3, Number(options.depth) || 600),
      );
      const maxThickness = snap(
        Math.max(
          GRID_SIZE,
          Math.min(
            100,
            Math.floor(outerWidth / 3),
            Math.floor(outerHeight / 3),
            Math.floor(outerDepth / 3),
          ),
        ),
      );
      const thickness = snap(
        clamp(Number(options.thickness) || GRID_SIZE, GRID_SIZE, maxThickness),
      );
      const shelfCount = Math.max(
        0,
        Math.min(8, Math.round(Number(options.shelfCount) || 0)),
      );
      const withDivider = Boolean(options.withDivider);
      const backThickness = GRID_SIZE;

      if (
        outerWidth - thickness * 2 < GRID_SIZE ||
        outerHeight - thickness * 2 < GRID_SIZE ||
        outerDepth - backThickness < GRID_SIZE
      ) {
        toast.error(
          "Cabinet size is too small for the chosen thickness. Increase size or lower thickness.",
        );
        return;
      }

      const origin = getNextAssemblyOrigin(components);
      const originX = snap(origin.x);
      const originZ = snap(origin.z);
      const floorY = WORLD_H - FLOOR_OFFSET;
      const topY = snap(floorY - outerHeight);

      const material = "Marine Plywood";
      const defaultFinish = getDefaultFinishId(material);
      const finishData = defaultFinish
        ? applyWoodFinish({ material }, defaultFinish)
        : { material, fill: "#d9c2a5", finish: "" };

      const buildCount =
        [
          ...new Set(
            components
              .filter((c) => c.groupType === "assembly")
              .map((c) => c.groupId),
          ),
        ].length + 1;

      const groupId = makeGroupId();
      const groupLabel = `Cabinet Box ${buildCount}`;
      const part = (overrides) =>
        createAssemblyPart({
          groupId,
          groupLabel,
          material: finishData.material || material,
          finish: finishData.finish || "",
          fill: finishData.fill || "#d9c2a5",
          ...overrides,
        });

      const innerWidth = outerWidth - thickness * 2;
      const innerHeight = outerHeight - thickness * 2;
      const innerDepth = outerDepth - backThickness;

      const parts = [
        part({
          type: "wr_side_panel",
          label: "Left Side Panel",
          partCode: "CB-SIDE-L",
          x: originX,
          y: topY,
          z: originZ,
          width: thickness,
          height: outerHeight,
          depth: outerDepth,
        }),
        part({
          type: "wr_side_panel",
          label: "Right Side Panel",
          partCode: "CB-SIDE-R",
          x: originX + outerWidth - thickness,
          y: topY,
          z: originZ,
          width: thickness,
          height: outerHeight,
          depth: outerDepth,
        }),
        part({
          type: "wr_top_panel",
          label: "Top Panel",
          partCode: "CB-TOP",
          x: originX + thickness,
          y: topY,
          z: originZ,
          width: innerWidth,
          height: thickness,
          depth: outerDepth,
        }),
        part({
          type: "wr_bottom_panel",
          label: "Bottom Panel",
          partCode: "CB-BOT",
          x: originX + thickness,
          y: floorY - thickness,
          z: originZ,
          width: innerWidth,
          height: thickness,
          depth: outerDepth,
        }),
        part({
          type: "wr_back_panel",
          label: "Back Panel",
          partCode: "CB-BACK",
          x: originX + thickness,
          y: topY + thickness,
          z: originZ,
          width: innerWidth,
          height: innerHeight,
          depth: backThickness,
          material: "Panel Board",
        }),
      ];

      let dividerLeftShelfWidth = innerWidth;
      let dividerRightShelfWidth = 0;
      let dividerRightShelfX = originX + thickness;

      if (withDivider && innerWidth - thickness >= GRID_SIZE * 2) {
        const dividerLeftWidth = snap(
          Math.max(
            GRID_SIZE,
            Math.floor((innerWidth - thickness) / 2 / GRID_SIZE) * GRID_SIZE,
          ),
        );
        dividerRightShelfWidth = snap(
          Math.max(GRID_SIZE, innerWidth - thickness - dividerLeftWidth),
        );
        dividerLeftShelfWidth = dividerLeftWidth;
        dividerRightShelfX = originX + thickness + dividerLeftWidth + thickness;

        parts.push(
          part({
            type: "wr_divider",
            label: "Center Divider",
            partCode: "CB-DIV",
            x: originX + thickness + dividerLeftWidth,
            y: topY + thickness,
            z: originZ + backThickness,
            width: thickness,
            height: innerHeight,
            depth: innerDepth,
          }),
        );
      }

      if (shelfCount > 0) {
        const innerTopY = topY + thickness;
        const shelfTravel = Math.max(0, innerHeight - thickness);

        for (let index = 1; index <= shelfCount; index += 1) {
          const shelfY = snap(
            innerTopY + (shelfTravel * index) / (shelfCount + 1),
          );

          if (withDivider && dividerRightShelfWidth >= GRID_SIZE) {
            parts.push(
              part({
                type: "wr_shelf",
                label: `Fixed Shelf ${index} Left`,
                partCode: `CB-SH${String(index).padStart(2, "0")}L`,
                x: originX + thickness,
                y: shelfY,
                z: originZ + backThickness,
                width: dividerLeftShelfWidth,
                height: thickness,
                depth: innerDepth,
              }),
            );
            parts.push(
              part({
                type: "wr_shelf",
                label: `Fixed Shelf ${index} Right`,
                partCode: `CB-SH${String(index).padStart(2, "0")}R`,
                x: dividerRightShelfX,
                y: shelfY,
                z: originZ + backThickness,
                width: dividerRightShelfWidth,
                height: thickness,
                depth: innerDepth,
              }),
            );
          } else {
            parts.push(
              part({
                type: "wr_shelf",
                label: `Fixed Shelf ${index}`,
                partCode: `CB-SH${String(index).padStart(2, "0")}`,
                x: originX + thickness,
                y: shelfY,
                z: originZ + backThickness,
                width: innerWidth,
                height: thickness,
                depth: innerDepth,
              }),
            );
          }
        }
      }

      pushHistory(components);
      setComponents((prev) => [...prev, ...parts]);
      setSelectedIds(parts.map((item) => item.id));
      setSelectedId(parts[0]?.id || null);
      setEdit3DId(parts[0]?.id || null);
      setTransformMode("translate");

      toast.success(
        `${groupLabel} generated (${parts.length} part${parts.length !== 1 ? "s" : ""}).`,
      );
    },
    [components, editorMode, view, WORLD_H, pushHistory],
  );

  const createDoorPairFrontParts3D = useCallback(
    (ctx, rect, options = {}, codePrefix = "FRONT", labelPrefix = "Front") => {
      const reveal = snap(Math.max(0, Number(options.reveal) || 0));
      const frontGap = snap(Math.max(0, Number(options.frontGap) || 0));
      const frontThickness = snap(
        Math.max(GRID_SIZE, Number(options.frontThickness) || ctx.thickness),
      );

      const usableWidth = snap(Math.max(GRID_SIZE, rect.width - reveal * 2));
      const usableHeight = snap(Math.max(GRID_SIZE, rect.height - reveal * 2));
      const baseX = snap(rect.x + reveal);
      const baseY = snap(rect.y + reveal);
      const baseZ = snap(ctx.frontZ - frontThickness);

      if (usableWidth < GRID_SIZE * 2 + frontGap) {
        return [
          ctx.buildPart({
            type: "door_front_panel",
            label: `${labelPrefix} Door`,
            partCode: `${codePrefix}`,
            x: baseX,
            y: baseY,
            z: baseZ,
            width: usableWidth,
            height: usableHeight,
            depth: frontThickness,
          }),
        ];
      }

      const safeGap = snap(
        Math.min(frontGap, Math.max(0, usableWidth - GRID_SIZE * 2)),
      );
      const eachWidth = snap((usableWidth - safeGap) / 2);

      return [
        ctx.buildPart({
          type: "door_front_panel",
          label: `${labelPrefix} Left Door`,
          partCode: `${codePrefix}-L`,
          x: baseX,
          y: baseY,
          z: baseZ,
          width: eachWidth,
          height: usableHeight,
          depth: frontThickness,
        }),
        ctx.buildPart({
          type: "door_front_panel",
          label: `${labelPrefix} Right Door`,
          partCode: `${codePrefix}-R`,
          x: snap(baseX + eachWidth + safeGap),
          y: baseY,
          z: baseZ,
          width: eachWidth,
          height: usableHeight,
          depth: frontThickness,
        }),
      ];
    },
    [],
  );

  const createDrawerStackFrontParts3D = useCallback(
    (
      ctx,
      rect,
      options = {},
      codePrefix = "DRAWER",
      labelPrefix = "Drawer",
    ) => {
      const reveal = snap(Math.max(0, Number(options.reveal) || 0));
      const frontGap = snap(Math.max(0, Number(options.frontGap) || 0));
      const drawerCount = Math.max(
        2,
        Math.min(8, Number(options.drawerCount) || 3),
      );
      const frontThickness = snap(
        Math.max(GRID_SIZE, Number(options.frontThickness) || ctx.thickness),
      );

      const usableWidth = snap(Math.max(GRID_SIZE, rect.width - reveal * 2));
      const usableHeight = snap(
        Math.max(GRID_SIZE * 2, rect.height - reveal * 2),
      );
      const baseX = snap(rect.x + reveal);
      const baseY = snap(rect.y + reveal);
      const baseZ = snap(ctx.frontZ - frontThickness);

      const maxGap = Math.max(0, usableHeight - GRID_SIZE * 2 * drawerCount);
      const safeGap = snap(
        Math.min(frontGap, maxGap / Math.max(1, drawerCount - 1)),
      );
      const eachHeight = snap(
        Math.floor(
          (usableHeight - safeGap * Math.max(0, drawerCount - 1)) / drawerCount,
        ),
      );

      if (eachHeight < GRID_SIZE * 2) {
        toast.error(
          "Not enough opening height for the requested drawer count.",
        );
        return [];
      }

      const parts = [];

      for (let index = 0; index < drawerCount; index += 1) {
        parts.push(
          ctx.buildPart({
            type: "drawer_front_panel",
            label: `${labelPrefix} ${index + 1}`,
            partCode: `${codePrefix}-${String(index + 1).padStart(2, "0")}`,
            x: baseX,
            y: snap(baseY + index * (eachHeight + safeGap)),
            z: baseZ,
            width: usableWidth,
            height: eachHeight,
            depth: frontThickness,
          }),
        );
      }

      return parts;
    },
    [],
  );

  const buildCabinetInteriorPreset3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      const preset =
        options.preset === "three-column" ? "three-column" : "two-column";
      const columnCount = preset === "three-column" ? 3 : 2;
      const dividerCount = columnCount - 1;

      const openingWidth = snap(
        (ctx.overallRect.width - ctx.thickness * dividerCount) / columnCount,
      );

      if (openingWidth < GRID_SIZE) {
        toast.error("Cabinet is too small for the selected interior preset.");
        return;
      }

      const sourceShelfLevels = [
        ...new Set(
          ctx.shelfParts
            .map((part) => snap(Number(part.y) || 0))
            .filter(
              (value) => value > ctx.inner.minY && value < ctx.inner.maxY,
            ),
        ),
      ].sort((a, b) => a - b);

      const shelfThickness = snap(
        Math.max(
          GRID_SIZE,
          ctx.shelfParts.length
            ? Math.min(
                ...ctx.shelfParts.map(
                  (part) => Number(part.height) || GRID_SIZE,
                ),
              )
            : ctx.thickness,
        ),
      );

      const newParts = [];
      const newBayRects = [];
      let cursorX = ctx.inner.minX;

      for (let bayIndex = 1; bayIndex <= columnCount; bayIndex += 1) {
        newBayRects.push({
          bayIndex,
          x: snap(cursorX),
          y: ctx.inner.minY,
          z: ctx.inner.minZ,
          width: openingWidth,
          height: ctx.overallRect.height,
          depth: ctx.overallRect.depth,
        });

        cursorX = snap(cursorX + openingWidth);

        if (bayIndex < columnCount) {
          newParts.push(
            ctx.buildPart({
              type: "wr_divider",
              label: `Center Divider ${bayIndex}`,
              partCode: `CB-DIV-${bayIndex}`,
              x: cursorX,
              y: ctx.inner.minY,
              z: ctx.inner.minZ,
              width: ctx.thickness,
              height: ctx.overallRect.height,
              depth: ctx.overallRect.depth,
            }),
          );

          cursorX = snap(cursorX + ctx.thickness);
        }
      }

      sourceShelfLevels.forEach((shelfY, shelfIndex) => {
        newBayRects.forEach((bay) => {
          newParts.push(
            ctx.buildPart({
              type: "wr_shelf",
              label: `Fixed Shelf ${shelfIndex + 1} Bay ${bay.bayIndex}`,
              partCode: `CB-SH-${bay.bayIndex}-${String(shelfIndex + 1).padStart(2, "0")}`,
              x: bay.x,
              y: shelfY,
              z: ctx.inner.minZ,
              width: bay.width,
              height: shelfThickness,
              depth: ctx.overallRect.depth,
            }),
          );
        });
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !ctx.removeInteriorAndFrontIds.has(item.id))
        .concat(newParts);

      setComponents(nextComponents);

      const newSelectionIds = [
        ...ctx.shellParts.map((item) => item.id),
        ...newParts.map((item) => item.id),
      ];

      setSelectedIds(newSelectionIds);
      setSelectedId(ctx.primaryId);
      setEdit3DId(ctx.primaryId);
      setTransformMode("translate");

      toast.success(
        preset === "three-column"
          ? "3 Column cabinet interior applied."
          : "2 Column cabinet interior applied.",
      );
    },
    [editorMode, getCabinetBuilderContext3D, components, pushHistory],
  );

  const buildCabinetFrontPreset3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      const preset = String(options.preset || "double-door");
      const targetBayIndex = Math.max(1, Number(options.targetBayIndex) || 1);
      const nextFrontParts = [];

      const bayFullRects = ctx.bayRects.map((bay) => ({
        ...bay,
        y: ctx.overallRect.y,
        height: ctx.overallRect.height,
      }));

      const orderedOpenings = [...ctx.openingRects].sort(
        (a, b) => a.rowIndex - b.rowIndex || a.bayIndex - b.bayIndex,
      );

      if (preset === "double-door") {
        nextFrontParts.push(
          ...createDoorPairFrontParts3D(
            ctx,
            ctx.overallRect,
            options,
            "CAB-FRONT",
            "Cabinet",
          ),
        );
      } else if (preset === "drawer-stack") {
        nextFrontParts.push(
          ...createDrawerStackFrontParts3D(
            ctx,
            ctx.overallRect,
            options,
            "CAB-DRW",
            "Cabinet Drawer",
          ),
        );
      } else if (preset === "split-double-doors") {
        orderedOpenings.forEach((opening) => {
          nextFrontParts.push(
            ...createDoorPairFrontParts3D(
              ctx,
              opening,
              options,
              `B${opening.bayIndex}-R${opening.rowIndex}`,
              `Bay ${opening.bayIndex} Row ${opening.rowIndex}`,
            ),
          );
        });
      } else if (preset === "left-doors-right-drawers") {
        bayFullRects.forEach((bay) => {
          if (bay.bayIndex === 1) {
            nextFrontParts.push(
              ...createDoorPairFrontParts3D(
                ctx,
                bay,
                options,
                `B${bay.bayIndex}-FRONT`,
                `Bay ${bay.bayIndex}`,
              ),
            );
          } else {
            nextFrontParts.push(
              ...createDrawerStackFrontParts3D(
                ctx,
                bay,
                options,
                `B${bay.bayIndex}-DRW`,
                `Bay ${bay.bayIndex} Drawer`,
              ),
            );
          }
        });
      } else if (preset === "top-drawers-bottom-doors") {
        const topRow = orderedOpenings.length
          ? Math.min(...orderedOpenings.map((opening) => opening.rowIndex))
          : 1;

        orderedOpenings.forEach((opening) => {
          if (opening.rowIndex === topRow) {
            nextFrontParts.push(
              ...createDrawerStackFrontParts3D(
                ctx,
                opening,
                options,
                `B${opening.bayIndex}-R${opening.rowIndex}-DRW`,
                `Bay ${opening.bayIndex} Row ${opening.rowIndex} Drawer`,
              ),
            );
          } else {
            nextFrontParts.push(
              ...createDoorPairFrontParts3D(
                ctx,
                opening,
                options,
                `B${opening.bayIndex}-R${opening.rowIndex}-DOOR`,
                `Bay ${opening.bayIndex} Row ${opening.rowIndex}`,
              ),
            );
          }
        });
      } else if (preset === "single-bay-drawer-stack") {
        bayFullRects.forEach((bay) => {
          if (bay.bayIndex === targetBayIndex) {
            nextFrontParts.push(
              ...createDrawerStackFrontParts3D(
                ctx,
                bay,
                options,
                `B${bay.bayIndex}-DRW`,
                `Bay ${bay.bayIndex} Drawer`,
              ),
            );
          } else {
            nextFrontParts.push(
              ...createDoorPairFrontParts3D(
                ctx,
                bay,
                options,
                `B${bay.bayIndex}-DOOR`,
                `Bay ${bay.bayIndex}`,
              ),
            );
          }
        });
      } else {
        nextFrontParts.push(
          ...createDoorPairFrontParts3D(
            ctx,
            ctx.overallRect,
            options,
            "CAB-FRONT",
            "Cabinet",
          ),
        );
      }

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !ctx.removeFrontIds.has(item.id))
        .concat(nextFrontParts);

      setComponents(nextComponents);
      setSelectedIds(nextFrontParts.map((item) => item.id));
      setSelectedId(nextFrontParts[0]?.id || ctx.primaryId);
      setEdit3DId(nextFrontParts[0]?.id || ctx.primaryId);
      setTransformMode("translate");

      toast.success("Cabinet front preset applied.");
    },
    [
      editorMode,
      getCabinetBuilderContext3D,
      createDoorPairFrontParts3D,
      createDrawerStackFrontParts3D,
      components,
      pushHistory,
    ],
  );

  const buildCabinetCustomBayFronts3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      const assignments = Array.isArray(options.assignments)
        ? options.assignments
        : [options.bay1Type, options.bay2Type, options.bay3Type].filter(
            Boolean,
          );

      const bayFullRects = ctx.bayRects.map((bay) => ({
        ...bay,
        y: ctx.overallRect.y,
        height: ctx.overallRect.height,
      }));

      const nextFrontParts = [];

      bayFullRects.forEach((bay, index) => {
        const type = assignments[index] || "door";

        if (type === "open") return;

        if (type === "drawer") {
          nextFrontParts.push(
            ...createDrawerStackFrontParts3D(
              ctx,
              bay,
              options,
              `B${bay.bayIndex}-DRW`,
              `Bay ${bay.bayIndex} Drawer`,
            ),
          );
        } else {
          nextFrontParts.push(
            ...createDoorPairFrontParts3D(
              ctx,
              bay,
              options,
              `B${bay.bayIndex}-DOOR`,
              `Bay ${bay.bayIndex}`,
            ),
          );
        }
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !ctx.removeFrontIds.has(item.id))
        .concat(nextFrontParts);

      setComponents(nextComponents);
      setSelectedIds(nextFrontParts.map((item) => item.id));
      setSelectedId(nextFrontParts[0]?.id || ctx.primaryId);
      setEdit3DId(nextFrontParts[0]?.id || ctx.primaryId);
      setTransformMode("translate");

      toast.success("Custom per-bay fronts applied.");
    },
    [
      editorMode,
      getCabinetBuilderContext3D,
      createDoorPairFrontParts3D,
      createDrawerStackFrontParts3D,
      components,
      pushHistory,
    ],
  );

  const buildCabinetCustomCellFronts3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      if (!ctx.openingRects.length) {
        toast.error(
          "No cabinet openings found. Build the interior layout first.",
        );
        return;
      }

      const assignments = Array.isArray(options.assignments)
        ? options.assignments
        : [
            options.cell1Type,
            options.cell2Type,
            options.cell3Type,
            options.cell4Type,
            options.cell5Type,
            options.cell6Type,
            options.cell7Type,
            options.cell8Type,
            options.cell9Type,
          ];

      const orderedOpenings = [...ctx.openingRects].sort(
        (a, b) => a.rowIndex - b.rowIndex || a.bayIndex - b.bayIndex,
      );

      const nextFrontParts = [];

      orderedOpenings.forEach((opening, index) => {
        const type = assignments[index] || "door";

        if (type === "open") return;

        if (type === "drawer") {
          nextFrontParts.push(
            ...createDrawerStackFrontParts3D(
              ctx,
              opening,
              options,
              `CELL-${index + 1}-DRW`,
              `Cell ${index + 1} Drawer`,
            ),
          );
        } else {
          nextFrontParts.push(
            ...createDoorPairFrontParts3D(
              ctx,
              opening,
              options,
              `CELL-${index + 1}-DOOR`,
              `Cell ${index + 1}`,
            ),
          );
        }
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !ctx.removeFrontIds.has(item.id))
        .concat(nextFrontParts);

      setComponents(nextComponents);
      setSelectedIds(nextFrontParts.map((item) => item.id));
      setSelectedId(nextFrontParts[0]?.id || ctx.primaryId);
      setEdit3DId(nextFrontParts[0]?.id || ctx.primaryId);
      setTransformMode("translate");

      toast.success("Custom per-opening fronts applied.");
    },
    [
      editorMode,
      getCabinetBuilderContext3D,
      createDoorPairFrontParts3D,
      createDrawerStackFrontParts3D,
      components,
      pushHistory,
    ],
  );

  const switchToReferenceMode = useCallback(() => {
    setEditorMode("reference");
    setView((prevView) => (prevView === "3d" ? "front" : prevView));
    toast.success("Reference Mode enabled. Blueprints are now read-only.");
  }, []);

  const switchToEditableMode = useCallback(() => {
    setEditorMode("editable");
    setView("front");

    setComponents((prev) =>
      Array.isArray(prev) ? prev.map(normalizeComponent) : [],
    );

    toast.success("Editable mode enabled.");
  }, []);

  const updateReferenceDimension = useCallback((key, value) => {
    const numeric = Number(value);

    setImportDimensions((prev) => ({
      ...prev,
      [key]: Number.isFinite(numeric) && numeric > 0 ? numeric : prev[key],
    }));
  }, []);

  const handleConvertReferenceToEditable = useCallback(() => {
    const activeReference =
      referenceFiles?.[activeReferenceView] ||
      referenceFiles?.front ||
      referenceFiles?.back ||
      referenceFiles?.left ||
      referenceFiles?.right ||
      referenceFiles?.top ||
      referenceFile;

    if (!activeReference?.url) {
      toast.error(
        `Walang reference file sa active ${activeReferenceView.toUpperCase()} view.`,
      );
      return;
    }

    if (!Array.isArray(allTraceObjects) || !allTraceObjects.length) {
      toast.error(convertRequirementFeedback);
      return;
    }

    if (!hasUsableFrontOrBackTrace) {
      toast.error(convertRequirementFeedback);
      return;
    }

    if (optionalLoadedViewsWithoutUsableTrace.length) {
      const shouldContinue = window.confirm(
        `May loaded reference views na walang usable trace: ${optionalLoadedViewsWithoutUsableTrace
          .map((item) => item.label)
          .join(
            ", ",
          )}.\n\nMagco-convert gamit ang FRONT/BACK trace. Susubukan muna ng system ang nearest TOP/SIDE section matching, at fallback depth lang ang gagamitin kung walang valid match. Itutuloy?`,
      );

      if (!shouldContinue) {
        return;
      }
    }

    if (
      hasRealComponents &&
      !window.confirm(
        "May existing converted components na. Papalitan ito ng bagong converted cabinet layout. Itutuloy?",
      )
    ) {
      return;
    }

    const targetOverall = {
      w: Math.max(200, snap(Number(importDimensions?.w || 2400))),
      h: Math.max(200, snap(Number(importDimensions?.h || 2400))),
      d: Math.max(100, snap(Number(importDimensions?.d || 600))),
    };

    const treatAsChair = isLikelyChairReference({
      importTemplateType,
      importDimensions: targetOverall,
      traceObjectsByView,
    });

    if (treatAsChair) {
      const generated = createImportedDiningChairComponents(
        {
          importDimensions: targetOverall,
        },
        activeReference,
        {
          ...(blueprint || {}),
          title: blueprint?.title || "Imported Chair",
        },
        {
          w: WORLD_W,
          h: WORLD_H,
          d: WORLD_D,
        },
      );

      if (!generated.length) {
        toast.error("Walang na-generate na chair parts.");
        return;
      }

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents(generated);
      setSelectedId(generated[0]?.id || null);
      setSelectedIds(generated.map((item) => item.id));
      setEdit3DId(generated[0]?.id || null);
      setEditorMode("editable");
      setView("front");
      setTransformMode("translate");
      setTraceTool("select");
      setActiveChairBuild(
        generated[0]?.groupId
          ? {
              id: generated[0].groupId,
              label: generated[0].groupLabel || "Imported Chair",
            }
          : null,
      );

      toast.success(
        `Converted reference into ${generated.length} editable chair parts.`,
      );
      return;
    }
    const cleaned = normalizeTraceObjects(allTraceObjects, "front")
      .filter((obj) => Number(obj?.width) > 5 && Number(obj?.height) > 5)
      .map((obj, index) => ({
        ...obj,
        traceIndex: index,
        projectionView: normalizeProjectionView(
          obj?.projectionView || obj?.traceView || obj?.view || "front",
        ),
      }));

    if (!cleaned.length) {
      toast.error("Walang valid traced rectangles.");
      return;
    }

    const traceBuckets = cleaned.reduce(
      (acc, obj) => {
        acc[obj.projectionView] = acc[obj.projectionView] || [];
        acc[obj.projectionView].push(obj);
        return acc;
      },
      { front: [], left: [], top: [] },
    );

    const sortLeftToRight = (a, b) =>
      Number(a.x) - Number(b.x) ||
      Number(a.y) - Number(b.y) ||
      Number(a.traceIndex) - Number(b.traceIndex);

    const sortTopToBottom = (a, b) =>
      Number(a.y) - Number(b.y) ||
      Number(a.x) - Number(b.x) ||
      Number(a.traceIndex) - Number(b.traceIndex);

    const frontSections = [...(traceBuckets.front || [])].sort(sortLeftToRight);
    const topSections = [...(traceBuckets.top || [])].sort(sortLeftToRight);
    const leftSections = [...(traceBuckets.left || [])].sort(sortTopToBottom);

    if (!frontSections.length) {
      toast.error(
        "Mag-trace ng cabinet sections sa Front o Back view bago mag-convert.",
      );
      return;
    }

    const getBounds = (items = []) => ({
      minX: Math.min(...items.map((o) => o.x)),
      minY: Math.min(...items.map((o) => o.y)),
      maxX: Math.max(...items.map((o) => o.x + o.width)),
      maxY: Math.max(...items.map((o) => o.y + o.height)),
    });

    const getRangeOverlap = (aStart, aEnd, bStart, bEnd) => {
      return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
    };

    const getAxisCenter = (obj, axis = "x") => {
      if (axis === "y") return Number(obj.y) + Number(obj.height) / 2;
      return Number(obj.x) + Number(obj.width) / 2;
    };

    const frontBounds = getBounds(frontSections);
    const frontWidthPx = Math.max(1, frontBounds.maxX - frontBounds.minX);
    const frontHeightPx = Math.max(1, frontBounds.maxY - frontBounds.minY);

    const topBounds = topSections.length ? getBounds(topSections) : null;
    const topDepthPx = topBounds
      ? Math.max(1, topBounds.maxY - topBounds.minY)
      : 1;

    const leftBounds = leftSections.length ? getBounds(leftSections) : null;
    const leftDepthPx = leftBounds
      ? Math.max(1, leftBounds.maxX - leftBounds.minX)
      : 1;

    const frontSectionMetrics = frontSections.map((obj, index) => ({
      obj,
      index,
      xStart: Number(obj.x),
      xEnd: Number(obj.x) + Number(obj.width),
      yStart: Number(obj.y),
      yEnd: Number(obj.y) + Number(obj.height),
      xCenter: getAxisCenter(obj, "x"),
      yCenter: getAxisCenter(obj, "y"),
      xStartRatio: clamp(
        (Number(obj.x) - frontBounds.minX) / frontWidthPx,
        0,
        1,
      ),
      xEndRatio: clamp(
        (Number(obj.x) + Number(obj.width) - frontBounds.minX) / frontWidthPx,
        0,
        1,
      ),
      yStartRatio: clamp(
        (Number(obj.y) - frontBounds.minY) / frontHeightPx,
        0,
        1,
      ),
      yEndRatio: clamp(
        (Number(obj.y) + Number(obj.height) - frontBounds.minY) / frontHeightPx,
        0,
        1,
      ),
    }));

    const findBestMatchingTrace = (
      traces = [],
      sectionMetric,
      { axis = "x", useOverlap = true } = {},
    ) => {
      if (!traces.length) return null;
      if (traces.length === 1) return traces[0];

      let bestTrace = null;
      let bestScore = -Infinity;

      traces.forEach((traceObj) => {
        const traceStart =
          axis === "y" ? Number(traceObj.y) : Number(traceObj.x);
        const traceSize =
          axis === "y" ? Number(traceObj.height) : Number(traceObj.width);
        const traceEnd = traceStart + traceSize;
        const traceCenter = getAxisCenter(traceObj, axis);

        const sectionStart =
          axis === "y" ? sectionMetric.yStart : sectionMetric.xStart;
        const sectionEnd =
          axis === "y" ? sectionMetric.yEnd : sectionMetric.xEnd;
        const sectionCenter =
          axis === "y" ? sectionMetric.yCenter : sectionMetric.xCenter;

        const overlapPx = useOverlap
          ? getRangeOverlap(sectionStart, sectionEnd, traceStart, traceEnd)
          : 0;

        const centerDistance = Math.abs(sectionCenter - traceCenter);

        const score = overlapPx * 1000 - centerDistance;

        if (score > bestScore) {
          bestScore = score;
          bestTrace = traceObj;
        }
      });

      return bestTrace;
    };

    const originX = snap((WORLD_W - targetOverall.w) / 2);
    const originZ = snap((WORLD_D - targetOverall.d) / 2);
    const floorY = WORLD_H - FLOOR_OFFSET;

    const baseMaterial = "Oak Wood";
    const finishId = getDefaultFinishId(baseMaterial);
    const finishData = applyWoodFinish(
      { material: baseMaterial, fill: "#d9c2a5" },
      finishId,
    );

    const conversionGroupId = makeGroupId();
    const conversionGroupLabel = `${
      blueprint?.title || "Reference Cabinet"
    } Converted`;

    const faceThickness = Math.max(
      18,
      snap(Math.min(40, targetOverall.d * 0.04)),
    );
    const insetGap = 20;
    const faceGap = 12;

    const inferSectionMeta = (obj, index, total) => {
      const sectionNo = index + 1;
      const widthRatio = obj.width / frontWidthPx;
      const centerRatio =
        (obj.x + obj.width / 2 - frontBounds.minX) / frontWidthPx;

      const explicitTraceType = obj?.traceType || obj?.type || "door";

      if (explicitTraceType === "drawer") {
        return {
          kind: "drawer",
          codePrefix: `S${sectionNo}-DRW`,
          label:
            centerRatio < 0.5
              ? `Left Drawer Section ${sectionNo}`
              : `Right Drawer Section ${sectionNo}`,
        };
      }

      if (explicitTraceType === "body") {
        if (total === 1) {
          return {
            kind: "body",
            codePrefix: `S${sectionNo}-BODY`,
            label: "Main Cabinet Body",
          };
        }

        if (index === 0) {
          return {
            kind: "body",
            codePrefix: `S${sectionNo}-BODY`,
            label: "Left Cabinet Body",
          };
        }

        if (index === total - 1) {
          return {
            kind: "body",
            codePrefix: `S${sectionNo}-BODY`,
            label: "Right Cabinet Body",
          };
        }

        return {
          kind: "body",
          codePrefix: `S${sectionNo}-BODY`,
          label: `Center Cabinet Body ${sectionNo}`,
        };
      }

      if (explicitTraceType === "door") {
        if (total === 1) {
          return {
            kind: "door",
            codePrefix: `S${sectionNo}-DOOR`,
            label: "Main Cabinet Door Section",
          };
        }

        if (index === 0) {
          return {
            kind: "door",
            codePrefix: `S${sectionNo}-DOOR`,
            label: "Left Cabinet Door Section",
          };
        }

        if (index === total - 1) {
          return {
            kind: "door",
            codePrefix: `S${sectionNo}-DOOR`,
            label: "Right Cabinet Door Section",
          };
        }

        return {
          kind: "door",
          codePrefix: `S${sectionNo}-DOOR`,
          label: `Center Cabinet Door Section ${sectionNo}`,
        };
      }

      if (total === 1) {
        return {
          kind: "main",
          codePrefix: `S${sectionNo}-MAIN`,
          label: "Main Cabinet Body",
        };
      }

      if (widthRatio <= 0.2) {
        return {
          kind: "drawer",
          codePrefix: `S${sectionNo}-DRW`,
          label:
            centerRatio < 0.5
              ? `Left Drawer Section ${sectionNo}`
              : `Right Drawer Section ${sectionNo}`,
        };
      }

      if (index === 0) {
        return {
          kind: "section",
          codePrefix: `S${sectionNo}-SEC`,
          label: "Left Cabinet Section",
        };
      }

      if (index === total - 1) {
        return {
          kind: "section",
          codePrefix: `S${sectionNo}-SEC`,
          label: "Right Cabinet Section",
        };
      }

      return {
        kind: "section",
        codePrefix: `S${sectionNo}-SEC`,
        label: `Center Cabinet Section ${sectionNo}`,
      };
    };

    const getDepthDataFromTopTrace = (topObj) => {
      const depthMm = Math.max(
        80,
        snap((Number(topObj.height) / topDepthPx) * targetOverall.d),
      );

      const zOffsetMm = snap(
        ((Number(topObj.y) - topBounds.minY) / topDepthPx) * targetOverall.d,
      );

      return { depthMm, zOffsetMm, source: "top" };
    };

    const getDepthDataFromSideTrace = (sideObj) => {
      const depthMm = Math.max(
        80,
        snap((Number(sideObj.width) / leftDepthPx) * targetOverall.d),
      );

      return { depthMm, zOffsetMm: 0, source: "side" };
    };

    const getDepthDataForSection = (index) => {
      const sectionMetric = frontSectionMetrics[index];

      const matchedTop = findBestMatchingTrace(topSections, sectionMetric, {
        axis: "x",
        useOverlap: true,
      });

      const matchedSide = findBestMatchingTrace(leftSections, sectionMetric, {
        axis: "y",
        useOverlap: true,
      });

      if (matchedTop && matchedSide) {
        const topData = getDepthDataFromTopTrace(matchedTop);
        const sideData = getDepthDataFromSideTrace(matchedSide);

        return {
          depthMm: Math.max(80, snap((topData.depthMm + sideData.depthMm) / 2)),
          zOffsetMm: topData.zOffsetMm,
          source: "top+side",
        };
      }

      if (matchedTop) {
        return { ...getDepthDataFromTopTrace(matchedTop), source: "top" };
      }

      if (matchedSide) {
        return { ...getDepthDataFromSideTrace(matchedSide), source: "side" };
      }

      return { depthMm: targetOverall.d, zOffsetMm: 0, source: "fallback" };
    };
    const buildConversionMeta = (
      obj,
      meta,
      sectionNo,
      depthSource,
      depthMm,
      zOffsetMm,
    ) => {
      const sourceTraceType = obj?.traceType || obj?.type || "door";
      const sourceTraceView = obj?.view || obj?.traceView || "front";
      const sourceProjectionView =
        obj?.projectionView || normalizeProjectionView(sourceTraceView);

      return {
        sourceTraceId: obj?.id || null,
        sourceTraceType,
        sourceTraceView,
        sourceProjectionView,
        sourceTraceLabel:
          obj?.label || TRACE_TYPE_LABELS[sourceTraceType] || "Trace Object",
        conversionSectionNo: sectionNo,
        conversionKind: meta.kind,
        conversionDepthSource: depthSource,
        conversionDepthMm: depthMm,
        conversionZOffsetMm: zOffsetMm,
      };
    };

    const buildPartHandoffMeta = (
      meta,
      partFamily,
      partRole,
      dimensions = {},
      options = {},
    ) => {
      const widthMm = Math.max(0, Number(dimensions?.widthMm) || 0);
      const heightMm = Math.max(0, Number(dimensions?.heightMm) || 0);
      const depthMm = Math.max(0, Number(dimensions?.depthMm) || 0);
      const thicknessMm = Math.max(0, Number(options?.thicknessMm) || 0);
      const qty = Math.max(1, Number(options?.qty) || 1);

      const areaSqM =
        widthMm > 0 && heightMm > 0
          ? Number(((widthMm * heightMm) / 1000000).toFixed(4))
          : 0;

      const volumeCuM =
        widthMm > 0 && heightMm > 0 && depthMm > 0
          ? Number(((widthMm * heightMm * depthMm) / 1000000000).toFixed(4))
          : 0;

      return {
        handoffSource: "reference_conversion",
        handoffSectionCode: meta.codePrefix,
        handoffSectionKind: meta.kind,
        handoffPartFamily: partFamily,
        handoffPartRole: partRole,
        handoffEstimatorGroup: "cabinet_reference_conversion",

        handoffWidthMm: widthMm,
        handoffHeightMm: heightMm,
        handoffDepthMm: depthMm,
        handoffThicknessMm: thicknessMm || null,
        handoffQty: qty,
        handoffAreaSqM: areaSqM,
        handoffVolumeCuM: volumeCuM,

        handoffEstimationUnit:
          options?.estimationUnit ||
          (partFamily === "cabinet_body" ? "piece" : "panel_area"),

        handoffCutListType:
          options?.cutListType ||
          (partFamily === "cabinet_body" ? "cabinet_body" : "front_panel"),

        handoffCostBasis:
          options?.costBasis ||
          (partFamily === "cabinet_body" ? "assembly_piece" : "sheet_area"),
      };
    };

    const generated = [];
    const depthMatchStats = {
      topAndSide: 0,
      topOnly: 0,
      sideOnly: 0,
      fallback: 0,
    };

    const traceTypeStats = {
      drawer: 0,
      door: 0,
      body: 0,
      inferred: 0,
    };

    frontSections.forEach((obj, index) => {
      const sectionNo = index + 1;
      const meta = inferSectionMeta(obj, index, frontSections.length);

      if (meta.kind === "drawer") {
        traceTypeStats.drawer += 1;
      } else if (meta.kind === "door") {
        traceTypeStats.door += 1;
      } else if (meta.kind === "body") {
        traceTypeStats.body += 1;
      } else {
        traceTypeStats.inferred += 1;
      }

      const widthMm = Math.max(
        100,
        snap((obj.width / frontWidthPx) * targetOverall.w),
      );

      const heightMm = Math.max(
        120,
        snap((obj.height / frontHeightPx) * targetOverall.h),
      );

      const leftOffsetMm = snap(
        ((obj.x - frontBounds.minX) / frontWidthPx) * targetOverall.w,
      );

      const bottomGapMm = snap(
        ((frontBounds.maxY - (obj.y + obj.height)) / frontHeightPx) *
          targetOverall.h,
      );

      const { depthMm, zOffsetMm, source } = getDepthDataForSection(index);

      const conversionMeta = buildConversionMeta(
        obj,
        meta,
        sectionNo,
        source,
        depthMm,
        zOffsetMm,
      );

      if (source === "top+side") {
        depthMatchStats.topAndSide += 1;
      } else if (source === "top") {
        depthMatchStats.topOnly += 1;
      } else if (source === "side") {
        depthMatchStats.sideOnly += 1;
      } else {
        depthMatchStats.fallback += 1;
      }

      const sectionX = originX + leftOffsetMm;
      const sectionY = floorY - heightMm - bottomGapMm;
      const sectionZ = originZ + zOffsetMm;

      const bodyDepthMm = Math.max(80, snap(depthMm - faceThickness));

      generated.push(
        normalizeComponent({
          id: makeId(),
          groupId: conversionGroupId,
          groupLabel: conversionGroupLabel,
          groupType: "assembly",
          partCode: `${meta.codePrefix}-CORE`,
          type: "cabinet_section_body",
          label: `${meta.label} Core`,
          category: "Reference Cabinet",
          blueprintStyle: "box",
          x: sectionX,
          y: sectionY,
          z: sectionZ,
          width: widthMm,
          height: heightMm,
          depth: bodyDepthMm,
          fill: finishData.fill || "#d9c2a5",
          material: finishData.material || baseMaterial,
          finish: finishData.finish || "",
          qty: 1,
          locked: false,
          ...conversionMeta,
          ...buildPartHandoffMeta(
            meta,
            "cabinet_body",
            "core_body",
            {
              widthMm,
              heightMm,
              depthMm: bodyDepthMm,
            },
            {
              qty: 1,
              thicknessMm: 0,
              estimationUnit: "piece",
              cutListType: "cabinet_body",
              costBasis: "assembly_piece",
            },
          ),
        }),
      );

      const usableWidth = Math.max(80, widthMm - insetGap * 2);
      const usableHeight = Math.max(120, heightMm - insetGap * 2);
      const faceX = sectionX + insetGap;
      const faceY = sectionY + insetGap;
      const faceZ = sectionZ + Math.max(0, depthMm - faceThickness);

      if (meta.kind === "drawer") {
        const drawerCount = Math.max(
          3,
          Math.min(4, Math.round(heightMm / 700)),
        );
        const innerGapTotal = faceGap * (drawerCount - 1);
        const eachDrawerHeight = Math.max(
          120,
          snap((usableHeight - innerGapTotal) / drawerCount),
        );

        for (let drawerIndex = 0; drawerIndex < drawerCount; drawerIndex += 1) {
          generated.push(
            normalizeComponent({
              id: makeId(),
              groupId: conversionGroupId,
              groupLabel: conversionGroupLabel,
              groupType: "assembly",
              partCode: `${meta.codePrefix}-${String(drawerIndex + 1).padStart(2, "0")}`,
              type: "drawer_front_panel",
              label: `${meta.label} Drawer Front ${drawerIndex + 1}`,
              category: "Reference Cabinet",
              blueprintStyle: "box",
              x: faceX,
              y: faceY + drawerIndex * (eachDrawerHeight + faceGap),
              z: faceZ,
              width: usableWidth,
              height: eachDrawerHeight,
              depth: faceThickness,
              fill: finishData.fill || "#d9c2a5",
              material: finishData.material || baseMaterial,
              finish: finishData.finish || "",
              qty: 1,
              locked: false,
              ...conversionMeta,
              ...buildPartHandoffMeta(
                meta,
                "drawer_front",
                "drawer_front",
                {
                  widthMm: usableWidth,
                  heightMm: eachDrawerHeight,
                  depthMm: faceThickness,
                },
                {
                  qty: 1,
                  thicknessMm: faceThickness,
                  estimationUnit: "panel_area",
                  cutListType: "front_panel",
                  costBasis: "sheet_area",
                },
              ),
            }),
          );
        }

        return;
      }

      if (meta.kind === "body") {
        generated.push(
          normalizeComponent({
            id: makeId(),
            groupId: conversionGroupId,
            groupLabel: conversionGroupLabel,
            groupType: "assembly",
            partCode: `${meta.codePrefix}-FRONT`,
            type: "body_front_panel",
            label: `${meta.label} Plain Front Panel`,
            category: "Reference Cabinet",
            blueprintStyle: "box",
            x: faceX,
            y: faceY,
            z: faceZ,
            width: usableWidth,
            height: usableHeight,
            depth: faceThickness,
            fill: finishData.fill || "#d9c2a5",
            material: finishData.material || baseMaterial,
            finish: finishData.finish || "",
            qty: 1,
            locked: false,
            ...conversionMeta,
            ...buildPartHandoffMeta(
              meta,
              "body_front",
              "plain_front",
              {
                widthMm: usableWidth,
                heightMm: usableHeight,
                depthMm: faceThickness,
              },
              {
                qty: 1,
                thicknessMm: faceThickness,
                estimationUnit: "panel_area",
                cutListType: "front_panel",
                costBasis: "sheet_area",
              },
            ),
          }),
        );

        return;
      }

      if (usableWidth >= 900) {
        const splitGap = 14;
        const doorWidth = Math.max(120, snap((usableWidth - splitGap) / 2));

        generated.push(
          normalizeComponent({
            id: makeId(),
            groupId: conversionGroupId,
            groupLabel: conversionGroupLabel,
            groupType: "assembly",
            partCode: `${meta.codePrefix}-L`,
            type: "door_front_panel",
            label: `${meta.label} Left Door`,
            category: "Reference Cabinet",
            blueprintStyle: "box",
            x: faceX,
            y: faceY,
            z: faceZ,
            width: doorWidth,
            height: usableHeight,
            depth: faceThickness,
            fill: finishData.fill || "#d9c2a5",
            material: finishData.material || baseMaterial,
            finish: finishData.finish || "",
            qty: 1,
            locked: false,
            ...conversionMeta,
            ...buildPartHandoffMeta(
              meta,
              "door_panel",
              "left_door",
              {
                widthMm: doorWidth,
                heightMm: usableHeight,
                depthMm: faceThickness,
              },
              {
                qty: 1,
                thicknessMm: faceThickness,
                estimationUnit: "panel_area",
                cutListType: "front_panel",
                costBasis: "sheet_area",
              },
            ),
          }),
        );

        generated.push(
          normalizeComponent({
            id: makeId(),
            groupId: conversionGroupId,
            groupLabel: conversionGroupLabel,
            groupType: "assembly",
            partCode: `${meta.codePrefix}-R`,
            type: "door_front_panel",
            label: `${meta.label} Right Door`,
            category: "Reference Cabinet",
            blueprintStyle: "box",
            x: faceX + doorWidth + splitGap,
            y: faceY,
            z: faceZ,
            width: doorWidth,
            height: usableHeight,
            depth: faceThickness,
            fill: finishData.fill || "#d9c2a5",
            material: finishData.material || baseMaterial,
            finish: finishData.finish || "",
            qty: 1,
            locked: false,
            ...conversionMeta,
            ...buildPartHandoffMeta(
              meta,
              "door_panel",
              "right_door",
              {
                widthMm: doorWidth,
                heightMm: usableHeight,
                depthMm: faceThickness,
              },
              {
                qty: 1,
                thicknessMm: faceThickness,
                estimationUnit: "panel_area",
                cutListType: "front_panel",
                costBasis: "sheet_area",
              },
            ),
          }),
        );

        return;
      }

      generated.push(
        normalizeComponent({
          id: makeId(),
          groupId: conversionGroupId,
          groupLabel: conversionGroupLabel,
          groupType: "assembly",
          partCode: `${meta.codePrefix}-FRONT`,
          type: "door_front_panel",
          label: `${meta.label} Front Door`,
          category: "Reference Cabinet",
          blueprintStyle: "box",
          x: faceX,
          y: faceY,
          z: faceZ,
          width: usableWidth,
          height: usableHeight,
          depth: faceThickness,
          fill: finishData.fill || "#d9c2a5",
          material: finishData.material || baseMaterial,
          finish: finishData.finish || "",
          qty: 1,
          locked: false,
          ...conversionMeta,
          ...buildPartHandoffMeta(
            meta,
            "door_panel",
            "front_door",
            {
              widthMm: usableWidth,
              heightMm: usableHeight,
              depthMm: faceThickness,
            },
            {
              qty: 1,
              thicknessMm: faceThickness,
              estimationUnit: "panel_area",
              cutListType: "front_panel",
              costBasis: "sheet_area",
            },
          ),
        }),
      );
    });

    if (!generated.length) {
      toast.error("Walang na-generate na cabinet parts.");
      return;
    }

    pushHistory(
      Array.isArray(components)
        ? components.map((c) => normalizeComponent(c))
        : [],
    );

    setComponents(generated);
    setSelectedId(generated[0]?.id || null);
    setSelectedIds(generated.map((item) => item.id));
    setEdit3DId(generated[0]?.id || null);
    setEditorMode("editable");
    setView("front");
    setTransformMode("translate");
    setTraceTool("select");
    setActiveChairBuild(null);

    toast.success(
      `Converted ${frontSections.length} traced section${
        frontSections.length > 1 ? "s" : ""
      } into ${generated.length} editable cabinet part${
        generated.length > 1 ? "s" : ""
      }. Section types: ${[
        traceTypeStats.drawer ? `${traceTypeStats.drawer} drawer` : null,
        traceTypeStats.door ? `${traceTypeStats.door} door` : null,
        traceTypeStats.body ? `${traceTypeStats.body} body` : null,
        traceTypeStats.inferred ? `${traceTypeStats.inferred} inferred` : null,
      ]
        .filter(Boolean)
        .join(", ")}. Depth sources: ${[
        depthMatchStats.topAndSide
          ? `${depthMatchStats.topAndSide} top+side`
          : null,
        depthMatchStats.topOnly ? `${depthMatchStats.topOnly} top` : null,
        depthMatchStats.sideOnly ? `${depthMatchStats.sideOnly} side` : null,
        depthMatchStats.fallback
          ? `${depthMatchStats.fallback} fallback`
          : null,
      ]
        .filter(Boolean)
        .join(", ")}.`,
    );
  }, [
    referenceFile,
    referenceFiles,
    activeReferenceView,
    allTraceObjects,
    importDimensions,
    importTemplateType,
    traceObjectsByView,
    hasRealComponents,
    components,
    pushHistory,
    blueprint,
    convertRequirementFeedback,
    hasUsableFrontOrBackTrace,
    optionalLoadedViewsWithoutUsableTrace,
    WORLD_W,
    WORLD_H,
    WORLD_D,
  ]);

  useEffect(() => {
    const activeView = view === "3d" ? "front" : view;

    const nextReference =
      referenceFiles?.[activeView] ||
      referenceFiles?.front ||
      referenceFiles?.back ||
      referenceFiles?.left ||
      referenceFiles?.right ||
      referenceFiles?.top ||
      null;

    setReferenceFile(nextReference);
  }, [view, referenceFiles]);

  const commitAddComponent = useCallback(
    (t, worldPlacement = null) => {
      const defaultFinishId = getDefaultFinishId(t.material);
      const finishData = defaultFinishId
        ? applyWoodFinish({}, defaultFinishId)
        : {};

      const floorY = WORLD_H - FLOOR_OFFSET;

      const getManualPlacement = (width, height, depth) => {
        if (!worldPlacement) return null;

        return {
          x: snap(worldPlacement.worldX - width / 2 + WORLD_W / 2),
          y: snap(floorY - height),
          z: snap(worldPlacement.worldZ - depth / 2 + WORLD_D / 2),
          width,
          height,
          depth,
          rotationY: 0,
        };
      };

      if (FURNITURE_TEMPLATE_SET.has(t.type)) {
        const templateOrigin = worldPlacement
          ? {
              x: snap(worldPlacement.worldX + WORLD_W / 2),
              z: snap(worldPlacement.worldZ + WORLD_D / 2),
            }
          : getNextAssemblyOrigin(components);

        const { x, z } = templateOrigin;

        const buildCount =
          [
            ...new Set(
              components
                .filter((c) => c.groupType === "assembly")
                .map((c) => c.groupId),
            ),
          ].length + 1;

        const groupId = makeGroupId();
        const groupLabel = `${t.label} ${buildCount}`;

        const rawParts = buildFurnitureTemplateParts({
          templateType: t.type,
          buildId: groupId,
          originX: x,
          originZ: z,
          canvasH: WORLD_H,
          groupLabel,
        });

        const parts = rawParts.map((part) =>
          normalizeComponent({
            ...part,
            templateType: t.type,
            groupUnitPrice: Number(t.unitPrice) || 0,
          }),
        );

        pushHistory(components);
        setComponents((prev) => [...prev, ...parts]);
        setSelectedId(parts[0]?.id || null);
        setEdit3DId(parts[0]?.id || null);
        setSelectedIds(parts.map((p) => p.id));
        setTransformMode("translate");
        toast.success(`${t.label} added.`);
        return;
      }

      if (t.type === "chair_template") {
        const chairOrigin = worldPlacement
          ? {
              x: snap(worldPlacement.worldX + WORLD_W / 2),
              z: snap(worldPlacement.worldZ + WORLD_D / 2),
            }
          : getNextChairOrigin(components);

        const { x, z } = chairOrigin;

        const chairCount =
          [
            ...new Set(
              components
                .filter((c) => c.groupType === "chair")
                .map((c) => c.groupId),
            ),
          ].length + 1;

        const groupId = makeGroupId();
        const groupLabel = `Dining Chair ${chairCount}`;

        const builtChair = buildDiningChairParts({
          buildId: groupId,
          originX: x,
          originZ: z,
          canvasH: WORLD_H,
          groupLabel,
        });

        const parts = builtChair.parts;

        pushHistory(components);
        setComponents((prev) => [...prev, ...parts]);
        setSelectedId(parts[0]?.id || null);
        setEdit3DId(parts[0]?.id || null);
        setSelectedIds(parts.map((p) => p.id));
        setTransformMode("translate");
        setActiveChairBuild({ id: groupId, label: groupLabel });
        toast.success("Dining chair template generated.");
        return;
      }

      if (isChairPartType(t.type)) {
        const selectedChairGroup =
          selectedComp?.groupType === "chair" && selectedComp.groupId
            ? {
                id: selectedComp.groupId,
                label: selectedComp.groupLabel || "Chair Build",
              }
            : null;

        const targetBuild =
          activeChairBuild ||
          selectedChairGroup ||
          (() => {
            const chairCount =
              [
                ...new Set(
                  components
                    .filter((c) => c.groupType === "chair")
                    .map((c) => c.groupId),
                ),
              ].length + 1;
            return { id: makeGroupId(), label: `Manual Chair ${chairCount}` };
          })();

        const groupComponents = components.filter(
          (c) => c.groupId === targetBuild.id,
        );
        const placement = getChairManualPlacement(
          t,
          groupComponents,
          components,
          WORLD_H,
        );

        const newComp = normalizeComponent({
          id: makeId(),
          groupId: targetBuild.id,
          groupLabel: targetBuild.label,
          groupType: "chair",
          type: t.type,
          label: placement.label,
          partCode: placement.partCode,
          category: t.category,
          blueprintStyle: "chair_part",
          x: placement.x,
          y: placement.y,
          z: placement.z,
          width: placement.width,
          height: placement.height,
          depth: placement.depth,
          rotationY: 0,
          fill: finishData.fill || t.fill,
          material: finishData.material || t.material,
          finish: finishData.finish || "",
          unitPrice: t.unitPrice,
          qty: 1,
          locked: false,
        });

        pushHistory(components);
        setComponents((prev) => [...prev, newComp]);
        setSelectedId(newComp.id);
        setEdit3DId(newComp.id);
        setSelectedIds([newComp.id]);
        setTransformMode("translate");
        setActiveChairBuild(targetBuild);
        toast.success(`${newComp.label} added.`);
        return;
      }

      if (t.type === "dining_chair") {
        const manualPlacement = getManualPlacement(t.w, t.h, t.d);
        const placement =
          manualPlacement || getPlacedGenericComponentData(t, components);

        const newComp = normalizeComponent({
          id: makeId(),
          type: t.type,
          label: t.label,
          category: t.category,
          blueprintStyle: t.blueprintStyle,
          x: placement.x,
          y: placement.y,
          z: placement.z,
          width: t.w,
          height: t.h,
          depth: t.d,
          rotationY: 0,
          fill: finishData.fill || t.fill,
          material: finishData.material || t.material,
          finish: finishData.finish || "",
          unitPrice: t.unitPrice,
          qty: 1,
          locked: false,
        });

        pushHistory(components);
        setComponents((prev) => [...prev, newComp]);
        setSelectedId(newComp.id);
        setEdit3DId(newComp.id);
        setSelectedIds([newComp.id]);
        setTransformMode("translate");
        toast.success("Dining chair added.");
        return;
      }

      const manualPlacement = getManualPlacement(t.w, t.h, t.d);
      const placement =
        manualPlacement || getPlacedGenericComponentData(t, components);

      const newComp = normalizeComponent({
        id: makeId(),
        type: t.type,
        label: t.label,
        category: t.category,
        blueprintStyle: t.blueprintStyle,
        x: placement.x,
        y: placement.y,
        z: placement.z,
        width: placement.width || t.w,
        height: placement.height || t.h,
        depth: placement.depth || t.d,
        rotationY: placement.rotationY || 0,
        fill: finishData.fill || t.fill,
        material: finishData.material || t.material,
        finish: finishData.finish || "",
        unitPrice: t.unitPrice,
        qty: 1,
        locked: false,
      });

      pushHistory(components);
      setComponents((prev) => [...prev, newComp]);
      setSelectedId(newComp.id);
      setEdit3DId(newComp.id);
      setSelectedIds([newComp.id]);
      setTransformMode("translate");
      toast.success("Component added in 3D.");
    },
    [
      components,
      selectedComp,
      activeChairBuild,
      WORLD_H,
      WORLD_W,
      WORLD_D,
      getPlacedGenericComponentData,
    ],
  );

  const addComponent = useCallback(
    (t, options = {}) => {
      if (!t) return;

      const { source = "click", silent = false } = options;

      if (editorMode !== "editable") {
        toast.error(
          'Reference mode ito. Click "Editable Mode" muna bago mag-add ng components.',
        );
        return;
      }

      if (view !== "3d") {
        toast.error("Sa 3D view lang puwede mag-add ng component.");
        return;
      }

      // Chair build parts stay as structured auto-build
      if (isChairPartType(t.type)) {
        commitAddComponent(t);
        return;
      }

      setPendingPlacement({
        ...t,
        placementSource: source,
      });
      setTransformMode("translate");

      if (!silent) {
        toast.success(
          source === "drag"
            ? `Dragging ${t.label}. Drop it on the 3D floor to place.`
            : `Placement mode: ${t.label}. Click the 3D floor to place.`,
        );
      }
    },
    [editorMode, view, commitAddComponent],
  );

  const placePendingComponent = useCallback(
    (worldPlacement) => {
      if (!pendingPlacement) return;
      commitAddComponent(pendingPlacement, worldPlacement);
      setPendingPlacement(null);
    },
    [pendingPlacement, commitAddComponent],
  );

  const inferFurnitureTypeFromComponents = (items = []) => {
    const text = items
      .map(
        (item) =>
          `${item?.type || ""} ${item?.label || ""} ${item?.partCode || ""} ${item?.groupType || ""}`,
      )
      .join(" ")
      .toLowerCase();

    if (
      /(tabletop|apron|rail|stretcher|dining_table|coffee_table|side_table|console_table|desk|table)/.test(
        text,
      )
    ) {
      return "table";
    }

    if (/(chair|seat|backrest|back_rest|chair_leg|stool)/.test(text)) {
      return "chair";
    }

    if (/(bed|headboard|footboard|mattress)/.test(text)) {
      return "bed";
    }

    if (
      /(cabinet|wardrobe|drawer|shelf|door|panel|carcass|divider|closet|box)/.test(
        text,
      )
    ) {
      return "cabinet";
    }

    return "";
  };

  const mapFurnitureTypeToTemplateType = (furnitureType = "") => {
    const map = {
      cabinet: "template_closet_wardrobe",
      table: "template_dining_table",
      bed: "template_bed_frame",
      chair: "template_dining_chair",
      coffee_table: "template_coffee_table",
    };

    return map[String(furnitureType || "").toLowerCase()] || "";
  };

  const buildBlueprintThumbnailDataUrl = (items = [], title = "Blueprint") => {
    if (!Array.isArray(items) || !items.length) return "";

    const normalized = items
      .map((item) => ({
        x: Number(item?.x) || 0,
        y: Number(item?.y) || 0,
        width: Math.max(1, Number(item?.width) || 0),
        height: Math.max(1, Number(item?.height) || 0),
        label: String(item?.label || item?.type || "").trim(),
      }))
      .filter((item) => item.width > 0 && item.height > 0);

    if (!normalized.length) return "";

    const minX = Math.min(...normalized.map((item) => item.x));
    const minY = Math.min(...normalized.map((item) => item.y));
    const maxX = Math.max(...normalized.map((item) => item.x + item.width));
    const maxY = Math.max(...normalized.map((item) => item.y + item.height));

    const sceneWidth = Math.max(1, maxX - minX);
    const sceneHeight = Math.max(1, maxY - minY);

    const svgWidth = 420;
    const svgHeight = 280;
    const pad = 18;
    const drawWidth = svgWidth - pad * 2;
    const drawHeight = svgHeight - pad * 2;

    const scale = Math.min(drawWidth / sceneWidth, drawHeight / sceneHeight);

    const rects = normalized
      .slice(0, 80)
      .map((item, index) => {
        const x = pad + (item.x - minX) * scale;
        const y = pad + (item.y - minY) * scale;
        const w = Math.max(2, item.width * scale);
        const h = Math.max(2, item.height * scale);

        const fill = index % 2 === 0 ? "#d9c2a5" : "#c9b08f";

        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" ry="2" fill="${fill}" stroke="#5b4636" stroke-width="1" />`;
      })
      .join("");

    const safeTitle = String(title || "Blueprint")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
        <rect width="100%" height="100%" fill="#efe7dc" />
        <rect x="10" y="10" width="${svgWidth - 20}" height="${svgHeight - 20}" rx="10" fill="#f7f2ea" stroke="#d7c7b2" />
        ${rects}
        <text x="${svgWidth / 2}" y="${svgHeight - 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#4b3b2c">${safeTitle}</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };

  const saveDesign = async () => {
    if (!id || id === "new") {
      toast.error(
        "Create the blueprint record first before saving the design.",
      );
      return;
    }

    setSaving(true);

    try {
      const actualFurnitureType =
        inferFurnitureTypeFromComponents(components) ||
        blueprint?.furniture_type ||
        blueprint?.category ||
        "";

      const actualTemplateType =
        mapFurnitureTypeToTemplateType(actualFurnitureType) ||
        importTemplateType ||
        "";

      const exactSceneBounds = getComponentsBounds3D(
        Array.isArray(components) ? components : [],
      );

      const actualImportDimensions = exactSceneBounds
        ? {
            w: snap(Math.max(20, Number(exactSceneBounds.width) || 0)),
            h: snap(Math.max(20, Number(exactSceneBounds.height) || 0)),
            d: snap(Math.max(20, Number(exactSceneBounds.depth) || 0)),
          }
        : sanitizeImportDimensions(importDimensions);

      const generatedThumbnailUrl = buildBlueprintThumbnailDataUrl(
        components,
        blueprint?.title || "Blueprint",
      );

      const payload = {
        ...(blueprint?.design_data ? JSON.parse(blueprint.design_data) : {}),
        unit,
        editorMode,
        components: Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
        reference_files: sanitizeReferenceFiles(referenceFiles),
        reference_file: sanitizeReferenceFile(
          referenceFiles?.front || referenceFile,
        ),

        furnitureType: actualFurnitureType,
        templateType: actualTemplateType,
        preview_template_type: actualTemplateType,
        importTemplateType: actualTemplateType,
        importDimensions: sanitizeImportDimensions(actualImportDimensions),
        importComments,

        blueprintSetup: {
          ...(blueprint?.design_data
            ? JSON.parse(blueprint.design_data)?.blueprintSetup || {}
            : {}),
          furnitureType: actualFurnitureType,
          overallWidth: actualImportDimensions.w,
          overallHeight: actualImportDimensions.h,
          overallDepth: actualImportDimensions.d,
          unit,
        },

        customerCustomization: {
          ...(blueprint?.design_data
            ? JSON.parse(blueprint.design_data)?.customerCustomization || {}
            : {}),
          default_dimensions: {
            w: actualImportDimensions.w,
            h: actualImportDimensions.h,
            d: actualImportDimensions.d,
          },
        },

        scene_bounds: exactSceneBounds
          ? {
              width_mm: Math.round(exactSceneBounds.width),
              height_mm: Math.round(exactSceneBounds.height),
              depth_mm: Math.round(exactSceneBounds.depth),
            }
          : null,

        worldSize: { w: WORLD_W, h: WORLD_H, d: WORLD_D },
        sheetSize: { w: SHEET_W, h: SHEET_H },
        exportViews: EXPORT_VIEWS,
        referenceCalibrationByView: normalizeReferenceCalibrationByView(
          referenceCalibrationByView,
        ),
        traceObjectsByView: normalizeTraceObjectsByView(traceObjectsByView),

        referenceCalibration: normalizeReferenceCalibration(
          referenceCalibrationByView?.front || activeReferenceCalibration,
        ),
        traceObjects: flattenTraceObjectsByView(traceObjectsByView),
        conversionSummary: conversionHandoffSummary,
        conversionCutListRows,
      };

      const view3dPayload = {
        furnitureType: actualFurnitureType,
        templateType: actualTemplateType,
        importTemplateType: actualTemplateType,
        bounds: exactSceneBounds
          ? {
              width_mm: Math.round(exactSceneBounds.width),
              height_mm: Math.round(exactSceneBounds.height),
              depth_mm: Math.round(exactSceneBounds.depth),
            }
          : null,
        components: Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      };

      await api.put(`/blueprints/${id}`, {
        design_data: JSON.stringify(payload),
        view_3d_data: JSON.stringify(view3dPayload),
        thumbnail_url:
          generatedThumbnailUrl || blueprint?.thumbnail_url || null,
        is_template: Number(blueprint?.is_template) ? 1 : 0,
        is_gallery: Number(blueprint?.is_gallery) ? 1 : 0,
      });

      toast.success("Blueprint saved.");
    } catch (error) {
      console.error("saveDesign error:", error);
      toast.error(
        error?.response?.data?.message ||
          "Save failed. Check server connection.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePublishProduct = async (e) => {
    e.preventDefault();
    if (!publishForm.name || !publishForm.online_price) {
      toast.error("Name and Price are required.");
      return;
    }
    await saveDesign();
    setPublishing(true);
    try {
      // We are forcing every single variable into the EXACT format your database demands
      const payload = {
        barcode: `BP-${Date.now()}`,
        name: String(publishForm.name).trim(),
        description: String(publishForm.description || "Custom 3D Product"),
        category_id: Number(publishForm.category_id),
        type: "blueprint",
        online_price: Number(publishForm.online_price),
        walkin_price: Number(publishForm.online_price),
        production_cost: 0,
        stock: 999,
        stock_status: "in_stock",
        reorder_point: 0,
        is_featured: 0,
        is_published: 1,
        blueprint_id: Number(id),
        variations: "[]",
        bill_of_materials: "[]",
        design_data: JSON.stringify({ components }),
      };

      console.log("🚀 Sending Payload to Server:", payload);

      const response = await api.post("/products", payload);

      console.log("✅ Server Success Response:", response.data);

      // 👇 HERE IS YOUR SUCCESS MESSAGE BOX 👇
      alert("🎉 Successfully published to Catalog!");
      toast.success("Successfully published to Catalog!");

      setPublishModal(false);
    } catch (err) {
      console.error("❌ FULL PUBLISH ERROR:", err);

      // Extract the EXACT error message from the backend
      const errorMsg =
        err?.response?.data?.message || err.message || "Unknown Server Error";

      // 👇 HERE IS YOUR FAILURE MESSAGE BOX 👇
      alert(
        `🚨 PUBLISH FAILED!\n\nReason: ${errorMsg}\n\nCheck your VS Code Backend Terminal for more details.`,
      );
      toast.error(`Failed: ${errorMsg}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublishProduct = async () => {
    if (
      !window.confirm(
        "Are you sure you want to unpublish the product linked to this blueprint?",
      )
    )
      return;
    try {
      await api.patch(`/products/blueprint/${id}/unpublish`);
      toast.success("Blueprint product unpublished successfully.");
    } catch (err) {
      console.error("Unpublish Error:", err);
      toast.error(
        err?.response?.data?.message ||
          "Failed to unpublish. Ensure you have published it first.",
      );
    }
  };

  const exportTargetComponents = useMemo(() => {
    return selectedComp ? selectedComponents : components;
  }, [selectedComp, selectedComponents, components]);

  const exportTargetBounds = useMemo(() => {
    return getComponentsBounds3D(exportTargetComponents);
  }, [exportTargetComponents]);

  const exportTargetLabel = useMemo(() => {
    if (selectedComp) return selectedLabel;
    return blueprint?.title || "Full Blueprint Layout";
  }, [selectedComp, selectedLabel, blueprint]);

  const exportTargetMaterials = useMemo(() => {
    if (!exportTargetComponents.length) return "—";
    return (
      [
        ...new Set(
          exportTargetComponents.map((c) => c.material).filter(Boolean),
        ),
      ].join(", ") || "—"
    );
  }, [exportTargetComponents]);

  const exportTargetDims = useMemo(() => {
    if (!exportTargetBounds) return "—";
    return formatDims(
      exportTargetBounds.width,
      exportTargetBounds.height,
      exportTargetBounds.depth,
      unit,
    );
  }, [exportTargetBounds, unit]);

  const openExportSheets = useCallback(
    (autoPrint = false) => {
      if (!exportTargetComponents.length) {
        toast.error("Walang component na mae-export.");
        return;
      }

      const pages = buildAllExportPages({
        exportComponents: exportTargetComponents,
        selectedComp: selectedComp || exportTargetComponents[0],
        selectedLabel: exportTargetLabel,
        selectedMaterialText: exportTargetMaterials,
        selectedBounds3D: exportTargetBounds,
        selectedDimsText: exportTargetDims,
        blueprintTitle: blueprint?.title || "Blueprint Design",
        unit,
      });

      const html = buildBlueprintDocumentHtml(pages);
      const opened = openBlueprintWindow(html, autoPrint);

      if (!opened) return;

      if (!autoPrint) {
        toast.success("Export sheets opened.");
      }
    },
    [
      exportTargetComponents,
      selectedComp,
      exportTargetLabel,
      exportTargetMaterials,
      exportTargetBounds,
      exportTargetDims,
      blueprint,
      unit,
    ],
  );

  const uniqueMaterials = useMemo(() => {
    return [...new Set(components.map((c) => c.material).filter(Boolean))];
  }, [components]);

  const convertedComponents = useMemo(() => {
    return components.filter(
      (c) =>
        c?.conversionSectionNo !== undefined ||
        c?.sourceTraceId ||
        c?.conversionDepthSource,
    );
  }, [components]);

  const conversionHandoffSummary = useMemo(() => {
    if (!convertedComponents.length) return null;

    const sectionMap = new Map();
    const materials = new Set();

    const partFamilies = {
      cabinet_body: 0,
      door_panel: 0,
      drawer_front: 0,
      body_front: 0,
      other: 0,
    };

    const estimationUnits = {
      piece: 0,
      panel_area: 0,
      other: 0,
    };

    const cutListTypes = {
      cabinet_body: 0,
      front_panel: 0,
      other: 0,
    };

    let doorPanels = 0;
    let drawerFronts = 0;
    let bodyFronts = 0;
    let coreBodies = 0;
    let totalQty = 0;
    let totalPanelAreaSqM = 0;
    let totalBodyVolumeCuM = 0;

    convertedComponents.forEach((comp) => {
      const sectionKey =
        comp?.conversionSectionNo !== undefined &&
        comp?.conversionSectionNo !== null
          ? `section-${comp.conversionSectionNo}`
          : comp?.sourceTraceId
            ? `trace-${comp.sourceTraceId}`
            : `part-${comp.id}`;

      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, {
          sectionNo: comp?.conversionSectionNo ?? null,
          traceType: comp?.sourceTraceType || "other",
          depthSource: comp?.conversionDepthSource || null,
        });
      }

      if (comp?.material) {
        materials.add(comp.material);
      }

      totalQty += Number(comp?.qty || 1);

      const partFamily =
        comp?.handoffPartFamily ||
        (comp?.type === "cabinet_section_body"
          ? "cabinet_body"
          : comp?.type === "door_front_panel"
            ? "door_panel"
            : comp?.type === "drawer_front_panel"
              ? "drawer_front"
              : comp?.type === "body_front_panel"
                ? "body_front"
                : "other");

      if (partFamilies[partFamily] !== undefined) {
        partFamilies[partFamily] += 1;
      } else {
        partFamilies.other += 1;
      }

      const estimationUnit =
        comp?.handoffEstimationUnit ||
        (partFamily === "cabinet_body" ? "piece" : "panel_area");

      if (estimationUnits[estimationUnit] !== undefined) {
        estimationUnits[estimationUnit] += 1;
      } else {
        estimationUnits.other += 1;
      }

      const cutListType =
        comp?.handoffCutListType ||
        (partFamily === "cabinet_body" ? "cabinet_body" : "front_panel");

      if (cutListTypes[cutListType] !== undefined) {
        cutListTypes[cutListType] += 1;
      } else {
        cutListTypes.other += 1;
      }

      if (estimationUnit === "panel_area") {
        totalPanelAreaSqM +=
          (Number(comp?.handoffAreaSqM) || 0) * (Number(comp?.qty) || 1);
      }

      if (partFamily === "cabinet_body") {
        totalBodyVolumeCuM +=
          (Number(comp?.handoffVolumeCuM) || 0) * (Number(comp?.qty) || 1);
      }

      if (comp?.type === "door_front_panel") {
        doorPanels += 1;
      } else if (comp?.type === "drawer_front_panel") {
        drawerFronts += 1;
      } else if (comp?.type === "body_front_panel") {
        bodyFronts += 1;
      } else if (comp?.type === "cabinet_section_body") {
        coreBodies += 1;
      }
    });

    const depthSources = {
      "top+side": 0,
      top: 0,
      side: 0,
      fallback: 0,
    };

    const traceTypes = {
      drawer: 0,
      door: 0,
      body: 0,
      other: 0,
    };

    sectionMap.forEach((section) => {
      const depthSource = section.depthSource;
      if (depthSource && depthSources[depthSource] !== undefined) {
        depthSources[depthSource] += 1;
      }

      const traceType = section.traceType;
      if (
        traceType === "drawer" ||
        traceType === "door" ||
        traceType === "body"
      ) {
        traceTypes[traceType] += 1;
      } else {
        traceTypes.other += 1;
      }
    });

    return {
      totalConvertedParts: convertedComponents.length,
      totalQty,
      convertedSections: sectionMap.size,
      doorPanels,
      drawerFronts,
      bodyFronts,
      coreBodies,
      totalPanelAreaSqM: Number(totalPanelAreaSqM.toFixed(4)),
      totalBodyVolumeCuM: Number(totalBodyVolumeCuM.toFixed(4)),
      materials: Array.from(materials),
      depthSources,
      traceTypes,
      partFamilies,
      estimationUnits,
      cutListTypes,
    };
  }, [convertedComponents]);

  const selectedConversionMeta = useMemo(() => {
    if (!selectedComp) return null;

    if (
      selectedComp?.conversionSectionNo === undefined &&
      !selectedComp?.sourceTraceId &&
      !selectedComp?.conversionDepthSource
    ) {
      return null;
    }

    return {
      sectionNo: selectedComp?.conversionSectionNo ?? "—",
      sectionCode: selectedComp?.handoffSectionCode || "—",
      traceType: selectedComp?.sourceTraceType || "—",
      traceView: selectedComp?.sourceTraceView || "—",
      depthSource: selectedComp?.conversionDepthSource || "—",
      depthMm: Number(selectedComp?.conversionDepthMm) || 0,
      traceLabel: selectedComp?.sourceTraceLabel || "—",
      partFamily: selectedComp?.handoffPartFamily || "—",
      partRole: selectedComp?.handoffPartRole || "—",
      handoffWidthMm: Number(selectedComp?.handoffWidthMm) || 0,
      handoffHeightMm: Number(selectedComp?.handoffHeightMm) || 0,
      handoffDepthMm: Number(selectedComp?.handoffDepthMm) || 0,
      handoffThicknessMm: Number(selectedComp?.handoffThicknessMm) || 0,
      handoffAreaSqM: Number(selectedComp?.handoffAreaSqM) || 0,
      handoffVolumeCuM: Number(selectedComp?.handoffVolumeCuM) || 0,
      estimationUnit: selectedComp?.handoffEstimationUnit || "—",
      cutListType: selectedComp?.handoffCutListType || "—",
      costBasis: selectedComp?.handoffCostBasis || "—",
    };
  }, [selectedComp]);

  const conversionCutListRows = useMemo(() => {
    if (!convertedComponents.length) return [];

    const rowMap = new Map();

    convertedComponents.forEach((comp) => {
      const partFamily = comp?.handoffPartFamily || "other";
      const partRole = comp?.handoffPartRole || "other";
      const material = comp?.material || "—";

      const widthMm = Math.max(
        0,
        Number(comp?.handoffWidthMm) || Number(comp?.width) || 0,
      );
      const heightMm = Math.max(
        0,
        Number(comp?.handoffHeightMm) || Number(comp?.height) || 0,
      );
      const depthMm = Math.max(
        0,
        Number(comp?.handoffDepthMm) || Number(comp?.depth) || 0,
      );
      const thicknessMm = Math.max(0, Number(comp?.handoffThicknessMm) || 0);

      const estimationUnit = comp?.handoffEstimationUnit || "other";
      const cutListType = comp?.handoffCutListType || "other";
      const costBasis = comp?.handoffCostBasis || "other";
      const qty = Math.max(
        1,
        Number(comp?.handoffQty) || Number(comp?.qty) || 1,
      );

      const areaSqM =
        Number(comp?.handoffAreaSqM) ||
        (widthMm > 0 && heightMm > 0
          ? Number(((widthMm * heightMm) / 1000000).toFixed(4))
          : 0);

      const volumeCuM =
        Number(comp?.handoffVolumeCuM) ||
        (widthMm > 0 && heightMm > 0 && depthMm > 0
          ? Number(((widthMm * heightMm * depthMm) / 1000000000).toFixed(4))
          : 0);

      const key = [
        partFamily,
        partRole,
        String(material).trim().toLowerCase(),
        widthMm,
        heightMm,
        depthMm,
        thicknessMm,
        estimationUnit,
        cutListType,
        costBasis,
      ].join("|");

      if (!rowMap.has(key)) {
        rowMap.set(key, {
          id: key,
          partFamily,
          partRole,
          material,
          widthMm,
          heightMm,
          depthMm,
          thicknessMm,
          estimationUnit,
          cutListType,
          costBasis,
          qty: 0,
          partCount: 0,
          totalAreaSqM: 0,
          totalVolumeCuM: 0,
          sampleLabel: comp?.label || "Converted Part",
        });
      }

      const row = rowMap.get(key);
      row.qty += qty;
      row.partCount += 1;
      row.totalAreaSqM = Number((row.totalAreaSqM + areaSqM * qty).toFixed(4));
      row.totalVolumeCuM = Number(
        (row.totalVolumeCuM + volumeCuM * qty).toFixed(4),
      );
    });

    return Array.from(rowMap.values()).sort((a, b) => {
      if ((a.partFamily || "") < (b.partFamily || "")) return -1;
      if ((a.partFamily || "") > (b.partFamily || "")) return 1;
      if ((a.partRole || "") < (b.partRole || "")) return -1;
      if ((a.partRole || "") > (b.partRole || "")) return 1;
      if ((a.material || "") < (b.material || "")) return -1;
      if ((a.material || "") > (b.material || "")) return 1;
      if (a.widthMm !== b.widthMm) return a.widthMm - b.widthMm;
      if (a.heightMm !== b.heightMm) return a.heightMm - b.heightMm;
      return a.depthMm - b.depthMm;
    });
  }, [convertedComponents]);

  const selectedGroupParts = useMemo(() => {
    if (!selectedComponents.length || selectedComponents.length === 1)
      return [];
    return [...selectedComponents].sort((a, b) => {
      if ((a.partCode || "") < (b.partCode || "")) return -1;
      if ((a.partCode || "") > (b.partCode || "")) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [selectedComponents]);

  return (
    <div style={{ ...S.fullScreenWrapper, fontFamily: "'Inter', sans-serif" }}>
      <div
        style={{
          background: "#ffffff",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          borderBottom: "1px solid #e4e4e7",
        }}
      >
        <button
          onClick={() => navigate("/admin/blueprints")}
          style={{
            ...S.toolBtn,
            background: "#f4f4f5",
            color: "#18181b",
            border: "1px solid #e4e4e7",
          }}
        >
          ← Back
        </button>

        <span
          style={{
            fontWeight: 800,
            fontSize: 16,
            color: "#0a0a0a",
            letterSpacing: "-0.01em",
          }}
        >
          {blueprint?.title || "Blueprint Design"}
        </span>

        {blueprint && (
          <span
            style={{
              fontSize: 10,
              background: "#f4f4f5",
              padding: "4px 10px",
              borderRadius: 20,
              color: "#18181b",
              border: "1px solid #e4e4e7",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Stage: {blueprint.stage}
          </span>
        )}

        {activeChairBuild?.label && (
          <span
            style={{
              ...S.smallPill,
              background: "#f4f4f5",
              color: "#18181b",
              border: "1px solid #e4e4e7",
            }}
          >
            Active Chair Build: {activeChairBuild.label}
          </span>
        )}

        <div
          style={{
            display: "flex",
            gap: 4,
            marginLeft: 16,
            background: "#f4f4f5",
            borderRadius: 8,
            padding: 4,
            border: "1px solid #e4e4e7",
          }}
        >
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              style={{
                ...S.toolBtn,
                background: view === v.key ? "#18181b" : "transparent",
                color: view === v.key ? "#ffffff" : "#71717a",
                fontWeight: view === v.key ? 700 : 600,
                padding: "6px 14px",
                border: "none",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#f4f4f5",
            borderRadius: 8,
            padding: 4,
            border: "1px solid #e4e4e7",
          }}
        >
          <span
            style={{
              ...S.toolBtn,
              background: "#18181b",
              color: "#ffffff",
              fontWeight: 700,
              padding: "6px 12px",
              cursor: "default",
              border: "none",
            }}
          >
            MM
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#f4f4f5",
            borderRadius: 8,
            padding: 4,
            border: "1px solid #e4e4e7",
          }}
        >
          {["reference", "editable"].map((mode) => (
            <button
              key={mode}
              onClick={() => {
                if (mode === "reference") switchToReferenceMode();
                else switchToEditableMode();
              }}
              style={{
                ...S.toolBtn,
                background: editorMode === mode ? "#18181b" : "transparent",
                color: editorMode === mode ? "#ffffff" : "#71717a",
                fontWeight: editorMode === mode ? 700 : 600,
                padding: "6px 12px",
                border: "none",
              }}
            >
              {mode === "reference" ? "Reference Mode" : "Editable Mode"}
            </button>
          ))}
        </div>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {view !== "3d" && (
            <button
              onClick={() => setShowGrid((g) => !g)}
              style={{
                ...S.toolBtn,
                background: "#f4f4f5",
                color: "#18181b",
                border: "1px solid #e4e4e7",
              }}
            >
              {showGrid ? "⊞ Hide Grid" : "⊞ Grid"}
            </button>
          )}

          <button
            onClick={handleUndo}
            title="Undo (Ctrl+Z)"
            disabled={!historyRef.current?.length}
            style={{
              ...S.toolBtn,
              background: "#f4f4f5",
              color: "#18181b",
              border: "1px solid #e4e4e7",
              opacity: !historyRef.current?.length ? 0.4 : 1,
            }}
          >
            ↩ Undo
          </button>

          <button
            onClick={handleRedo}
            title="Redo (Ctrl+Y)"
            disabled={!futureRef.current?.length}
            style={{
              ...S.toolBtn,
              background: "#f4f4f5",
              color: "#18181b",
              border: "1px solid #e4e4e7",
              opacity: !futureRef.current?.length ? 0.4 : 1,
            }}
          >
            ↪ Redo
          </button>

          <button
            onClick={() => navigate(`/admin/blueprints/${id}/import`)}
            style={{
              ...S.toolBtn,
              background: "#f4f4f5",
              color: "#18181b",
              border: "1px solid #e4e4e7",
            }}
          >
            📥 Import
          </button>

          <button
            onClick={() => openExportSheets(false)}
            style={{
              ...S.toolBtn,
              background: "#f4f4f5",
              color: "#18181b",
              border: "1px solid #e4e4e7",
            }}
          >
            📄 Export Sheets
          </button>

          <button
            onClick={() => openExportSheets(true)}
            style={{
              ...S.toolBtn,
              background: "#f4f4f5",
              color: "#18181b",
              border: "1px solid #e4e4e7",
            }}
          >
            🖨 Print Sheets
          </button>

          <button
            onClick={saveDesign}
            disabled={saving}
            style={{
              ...S.toolBtn,
              background: "#18181b",
              color: "#ffffff",
              border: "1px solid #18181b",
            }}
          >
            {saving ? "Saving…" : "💾 Save"}
          </button>

          <button
            onClick={() => {
              // 👉 AUTO-FILL PRICE BASED ON DESIGN TOTAL
              setPublishForm((prev) => ({
                ...prev,
                name: blueprint?.title || "",
                online_price: designTotal || 0,
              }));
              setPublishModal(true);
            }}
            style={{
              ...S.toolBtn,
              background: "#18181b",
              color: "#ffffff",
              border: "1px solid #18181b",
            }}
          >
            🛒 Publish Product
          </button>

          <button
            onClick={handleUnpublishProduct}
            style={{
              ...S.toolBtn,
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca",
            }}
          >
            🚫 Unpublish
          </button>

          <button
            onClick={() => navigate(`/admin/blueprints/${id}/estimation`)}
            style={{
              ...S.toolBtn,
              background: "#f4f4f5",
              color: "#18181b",
              border: "1px solid #e4e4e7",
            }}
          >
            💰 Estimate
          </button>
        </div>
      </div>
      {view === "3d" ? (
        <div style={{ flex: 1, minHeight: 0, width: "100%", height: "100%" }}>
          <ThreeDViewer
            components={components}
            selectedId={selectedId}
            edit3DId={edit3DId}
            setSelectedId={setSelectedId}
            setEdit3DId={setEdit3DId}
            onUpdateComp={updateComp}
            onBatchUpdateComps={updateManyComps}
            canUseSmartActions={canUseSmartActions3D}
            smartSelectionCount={activeSelectedComponents3D.length}
            hasLockedSmartSelection={hasLockedSmartSelection3D}
            onAlignSelection={alignSelection3D}
            onFlushSelection={flushSelection3D}
            onMirrorDuplicate={mirrorDuplicateSelection3D}
            onSelectAssembly={selectWholeAssembly}
            onDuplicateAssembly={duplicateWholeAssembly}
            onArrayDuplicate={arrayDuplicateSelection}
            onDistributeSelection={distributeSelection3D}
            onGapSelection={applySelectionGap3D}
            onBuildLineSelection={buildSelectionLine3D}
            onAutoShelfStack={autoShelfStack3D}
            onAutoLegLayout={autoLegLayout3D}
            onPanelPairSelection={panelPairSelection3D}
            onFrontPairSelection={frontPairSelection3D}
            onDoorSplitSelection={doorSplitSelection3D}
            onDrawerStackSelection={drawerStackSelection3D}
            onFaceFitSelection={faceFitSelection3D}
            onInsideFitSelection={insideFitSelection3D}
            onBuildCabinetBox={buildCabinetBox3D}
            onBuildCabinetInteriorPreset={buildCabinetInteriorPreset3D}
            onBuildCabinetFrontPreset={buildCabinetFrontPreset3D}
            onBuildCabinetCustomBayFronts={buildCabinetCustomBayFronts3D}
            onBuildCabinetCustomCellFronts={buildCabinetCustomCellFronts3D}
            canBuildCabinetBox={editorMode === "editable"}
            canBuildCabinetInteriorPreset={editorMode === "editable"}
            canBuildCabinetFrontPreset={editorMode === "editable"}
            canBuildCabinetCustomBayFronts={editorMode === "editable"}
            canBuildCabinetCustomCellFronts={editorMode === "editable"}
            lockedFields={lockedFields}
            canvasW={WORLD_W}
            canvasH={WORLD_H}
            canvasD={WORLD_D}
            transformMode={transformMode}
            setTransformMode={setTransformMode}
            addComponent={addComponent}
            activeBuildLabel={activeChairBuild?.label || ""}
            selectedComp={selectedComp}
            isLocked={isLocked}
            unit={unit}
            editorMode={editorMode}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            onPushHistory={pushHistory}
            pendingPlacement={pendingPlacement}
            onPlaceComponent={placePendingComponent}
            onCancelPlacement={cancelPendingPlacement}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div
            style={{
              flex: 1,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                background: "#111827",
                borderBottom: "1px solid #334155",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#93c5fd",
                  letterSpacing: 0.3,
                }}
              >
                {VIEWS.find((v) => v.key === view)?.label}
              </span>

              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background:
                    editorMode === "reference" ? "#78350f" : "#0f766e",
                  color: editorMode === "reference" ? "#fde68a" : "#ccfbf1",
                  border:
                    editorMode === "reference"
                      ? "1px solid #92400e"
                      : "1px solid #115e59",
                }}
              >
                {editorMode === "reference"
                  ? "REFERENCE MODE"
                  : "EDITABLE MODE"}
              </span>

              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: showGrid ? "#1e3a8a" : "#334155",
                  color: showGrid ? "#bfdbfe" : "#cbd5e1",
                  border: showGrid ? "1px solid #1d4ed8" : "1px solid #475569",
                }}
              >
                {showGrid ? "GRID ON" : "GRID OFF"}
              </span>

              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {selectedComp
                  ? `${selectedLabel} · ${selectedComponents.length} part${selectedComponents.length !== 1 ? "s" : ""}`
                  : "No selected part"}
              </span>

              <span style={{ fontSize: 11, color: "#64748b" }}>
                {hasAnyReferenceFile
                  ? `Reference ready · ${view === "3d" ? "front" : view} view`
                  : "No reference loaded"}
              </span>
            </div>

            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 28,
                overflow: "auto",
                background:
                  "radial-gradient(circle at top, rgba(30,41,59,0.9) 0%, #0f172a 48%, #020617 100%)",
              }}
            >
              <div
                style={{
                  padding: 18,
                  borderRadius: 20,
                  border: "1px solid #334155",
                  background:
                    "linear-gradient(180deg, #111827 0%, #0b1220 100%)",
                  boxShadow:
                    "0 18px 48px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.03)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 12,
                    fontSize: 10,
                    letterSpacing: 1,
                    fontWeight: 700,
                    color: "#64748b",
                    pointerEvents: "none",
                  }}
                >
                  EDITOR WORKSPACE
                </div>

                <div
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 10,
                    fontSize: 10,
                    color: "#94a3b8",
                    pointerEvents: "none",
                  }}
                >
                  {blueprint?.title || "Blueprint Design"}
                </div>

                <div
                  style={{
                    padding: 10,
                    borderRadius: 14,
                    border: "1px dashed #334155",
                    background: "rgba(15,23,42,0.55)",
                  }}
                >
                  <Canvas2D
                    selectedComp={selectedComp}
                    selectedComponents={selectedComponents}
                    allComponents={components}
                    selectedLabel={selectedLabel}
                    selectedMaterialText={selectedMaterialText}
                    selectedDimsText={selectedDimsText}
                    selectedBounds3D={selectedBounds3D}
                    view={view}
                    canvasW={SHEET_W}
                    canvasH={SHEET_H}
                    showGrid={showGrid}
                    blueprintTitle={blueprint?.title || "Blueprint Design"}
                    unit={unit}
                    referenceFile={referenceFile}
                    editorMode={editorMode}
                    referenceCalibration={activeReferenceCalibration}
                    setReferenceCalibration={setActiveReferenceCalibration}
                    traceObjects={activeTraceObjects}
                    setTraceObjects={setActiveTraceObjects}
                    traceTool={traceTool}
                    selectedTraceId={selectedTraceId}
                    setSelectedTraceId={setSelectedTraceId}
                    newTraceType={newTraceType}
                  />
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              width: 320,
              background: "#1e293b",
              borderLeft: "1px solid #334155",
              padding: 10,
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            <p style={S.panelLabel}>Selection Actions</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <button
                onClick={duplicateSelected}
                disabled={!selectedId || editorMode !== "editable"}
                title="Duplicate (Ctrl+D)"
                style={{
                  ...S.toolBtn,
                  background: "#0369a1",
                  opacity: !selectedId || editorMode !== "editable" ? 0.4 : 1,
                }}
              >
                ⧉ Duplicate
              </button>

              <button
                onClick={copySelectedObject}
                disabled={!selectedComp || editorMode !== "editable"}
                title="Copy (Ctrl+C)"
                style={{
                  ...S.toolBtn,
                  background: "#0369a1",
                  opacity: selectedComp && editorMode === "editable" ? 1 : 0.4,
                }}
              >
                📋 Copy
              </button>

              <button
                onClick={pasteCopiedObject}
                disabled={!clipboardObject || editorMode !== "editable"}
                title="Paste (Ctrl+V)"
                style={{
                  ...S.toolBtn,
                  background: "#4338ca",
                  opacity:
                    clipboardObject && editorMode === "editable" ? 1 : 0.4,
                }}
              >
                📑 Paste
              </button>

              <button
                onClick={removeSelected}
                disabled={!selectedId || editorMode !== "editable"}
                style={{
                  ...S.toolBtn,
                  background: "#7f1d1d",
                  opacity: !selectedId || editorMode !== "editable" ? 0.4 : 1,
                }}
              >
                🗑 Delete
              </button>
            </div>

            <div
              style={{
                paddingTop: 12,
                borderTop: "1px solid #334155",
              }}
            >
              <p style={S.panelLabel}>Properties</p>

              {!selectedComp ? (
                <div
                  style={{
                    background: "#0f172a",
                    border: "1px dashed #334155",
                    borderRadius: 8,
                    padding: 12,
                    color: "#64748b",
                    fontSize: 11,
                    lineHeight: 1.8,
                  }}
                >
                  Select a furniture part to edit its properties.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      padding: "8px 8px",
                      borderRadius: 6,
                      marginBottom: 10,
                      fontSize: 11,
                      background: "#0f172a",
                      color: "#cbd5e1",
                      border: "1px solid #334155",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          background: selectedComp.fill,
                          borderRadius: 2,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1 }}>
                        {selectedComp.partCode
                          ? `${selectedComp.partCode} — ${selectedComp.label}`
                          : selectedComp.label}
                      </span>
                      {isLocked(selectedComp) && <span>🔒</span>}
                    </div>

                    <div style={{ marginTop: 4, fontSize: 10, opacity: 0.92 }}>
                      Group: {selectedComp.groupLabel || "—"}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.85 }}>
                      Category: {selectedComp.category || "—"}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.85 }}>
                      Parts in selection: {selectedComponents.length}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.85 }}>
                      Overall: {selectedDimsText || "—"}
                    </div>
                  </div>

                  <div style={{ marginBottom: 7 }}>
                    <label style={S.propLabel}>Label</label>
                    <input
                      value={selectedComp.label || ""}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        updateComp(selectedComp.id, {
                          label: e.target.value,
                        })
                      }
                      style={S.propInput}
                    />
                  </div>
                </>
              )}
            </div>

            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid #334155",
              }}
            >
              <p style={S.panelLabel}>Dimensions</p>

              {!selectedComp ? (
                <div
                  style={{
                    background: "#0f172a",
                    border: "1px dashed #334155",
                    borderRadius: 8,
                    padding: 12,
                    color: "#64748b",
                    fontSize: 11,
                    lineHeight: 1.8,
                  }}
                >
                  No selected object.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 7 }}>
                    <label style={S.propLabel}>Width (mm)</label>
                    <input
                      type="number"
                      step="1"
                      value={mmToDisplay(selectedComp.width ?? 0, unit)}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        updateComp(selectedComp.id, {
                          width: displayToMm(e.target.value, unit),
                        })
                      }
                      style={S.propInput}
                    />
                  </div>

                  <div style={{ marginBottom: 7 }}>
                    <label style={S.propLabel}>Height (mm)</label>
                    <input
                      type="number"
                      step="1"
                      value={mmToDisplay(selectedComp.height ?? 0, unit)}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        updateComp(selectedComp.id, {
                          height: displayToMm(e.target.value, unit),
                        })
                      }
                      style={S.propInput}
                    />
                  </div>

                  <div style={{ marginBottom: 7 }}>
                    <label style={S.propLabel}>Depth (mm)</label>
                    <input
                      type="number"
                      step="1"
                      value={mmToDisplay(selectedComp.depth ?? 0, unit)}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        updateComp(selectedComp.id, {
                          depth: displayToMm(e.target.value, unit),
                        })
                      }
                      style={S.propInput}
                    />
                  </div>

                  <div style={{ marginBottom: 7 }}>
                    <label style={S.propLabel}>Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={selectedComp.qty || 1}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        updateComp(selectedComp.id, {
                          qty: Math.max(1, parseInt(e.target.value || "1", 10)),
                        })
                      }
                      style={S.propInput}
                    />
                  </div>

                  <div style={{ marginBottom: 7 }}>
                    <label style={S.propLabel}>
                      Corner Radius (mm) — {selectedComp.cornerRadius ?? 0}mm
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="500"
                      step="5"
                      value={selectedComp.cornerRadius ?? 0}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        updateComp(
                          selectedComp.id,
                          {
                            cornerRadius: Number(e.target.value),
                          },
                          {
                            applyToSelection: selectedIds.length > 1,
                          },
                        )
                      }
                      style={{
                        width: "100%",
                        accentColor: "#3b82f6",
                        marginBottom: 4,
                      }}
                    />
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="5"
                      value={selectedComp.cornerRadius ?? 0}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        updateComp(
                          selectedComp.id,
                          {
                            cornerRadius: Math.max(
                              0,
                              Math.min(500, Number(e.target.value) || 0),
                            ),
                          },
                          {
                            applyToSelection: selectedIds.length > 1,
                          },
                        )
                      }
                      style={S.propInput}
                    />
                  </div>
                </>
              )}
            </div>

            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid #334155",
              }}
            >
              <p style={S.panelLabel}>Materials / Finish</p>

              {!selectedComp ? (
                <div
                  style={{
                    background: "#0f172a",
                    border: "1px dashed #334155",
                    borderRadius: 8,
                    padding: 12,
                    color: "#64748b",
                    fontSize: 11,
                    lineHeight: 1.8,
                  }}
                >
                  No selected object.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 7 }}>
                    <label style={S.propLabel}>Material</label>
                    <input
                      value={selectedComp.material || ""}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        updateComp(selectedComp.id, {
                          material: e.target.value,
                        })
                      }
                      style={S.propInput}
                    />
                  </div>

                  <div style={{ marginBottom: 7 }}>
                    <label style={S.propLabel}>Fill Color</label>
                    <input
                      type="color"
                      value={selectedComp.fill || "#d9c2a5"}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        updateComp(selectedComp.id, {
                          fill: e.target.value,
                          finish: "",
                        })
                      }
                      style={{
                        ...S.propInput,
                        padding: 2,
                        height: 36,
                      }}
                    />
                  </div>

                  {(isWoodLikeMaterial(selectedComp.material) ||
                    selectedComp.finish !== undefined) && (
                    <div style={{ marginBottom: 7 }}>
                      <label style={S.propLabel}>Wood Finish</label>
                      <select
                        value={selectedComp.finish ?? ""}
                        disabled={
                          editorMode !== "editable" || isLocked(selectedComp)
                        }
                        onChange={(e) =>
                          updateComp(
                            selectedComp.id,
                            applyWoodFinish(selectedComp, e.target.value),
                          )
                        }
                        style={S.propInput}
                      >
                        <option value="">Custom Color</option>
                        {WOOD_FINISHES.map((finish) => (
                          <option key={finish.id} value={finish.id}>
                            {finish.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>

            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid #334155",
              }}
            >
              <p style={S.panelLabel}>Parts / Layers</p>
              <div
                style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: 10,
                  color: "#cbd5e1",
                  fontSize: 10,
                  lineHeight: 1.8,
                }}
              >
                {!selectedComp ? (
                  <div>No part selected.</div>
                ) : (
                  (selectedGroupParts.length
                    ? selectedGroupParts
                    : [selectedComp]
                  ).map((p) => (
                    <div key={p.id}>
                      • {p.partCode || "PART"} — {p.label}
                    </div>
                  ))
                )}
              </div>
            </div>
            {conversionHandoffSummary && (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid #334155",
                }}
              >
                <p style={S.panelLabel}>Conversion Handoff</p>

                <div
                  style={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    padding: 10,
                    color: "#cbd5e1",
                    fontSize: 10,
                    lineHeight: 1.8,
                  }}
                >
                  <div>
                    Sections:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.convertedSections}
                    </span>
                  </div>
                  <div>
                    Converted Parts:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.totalConvertedParts}
                    </span>
                  </div>
                  <div>
                    Total Qty:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.totalQty}
                    </span>
                  </div>
                  <div>
                    Core Bodies:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.coreBodies}
                    </span>
                  </div>
                  <div>
                    Door Panels:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.doorPanels}
                    </span>
                  </div>
                  <div>
                    Drawer Fronts:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.drawerFronts}
                    </span>
                  </div>
                  <div>
                    Body Fronts:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.bodyFronts}
                    </span>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    Materials:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.materials.length
                        ? conversionHandoffSummary.materials.join(", ")
                        : "—"}
                    </span>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    Trace Types:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {[
                        conversionHandoffSummary.traceTypes.drawer
                          ? `${conversionHandoffSummary.traceTypes.drawer} drawer`
                          : null,
                        conversionHandoffSummary.traceTypes.door
                          ? `${conversionHandoffSummary.traceTypes.door} door`
                          : null,
                        conversionHandoffSummary.traceTypes.body
                          ? `${conversionHandoffSummary.traceTypes.body} body`
                          : null,
                        conversionHandoffSummary.traceTypes.other
                          ? `${conversionHandoffSummary.traceTypes.other} other`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Part Families:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {[
                        conversionHandoffSummary.partFamilies.cabinet_body
                          ? `${conversionHandoffSummary.partFamilies.cabinet_body} cabinet body`
                          : null,
                        conversionHandoffSummary.partFamilies.door_panel
                          ? `${conversionHandoffSummary.partFamilies.door_panel} door panel`
                          : null,
                        conversionHandoffSummary.partFamilies.drawer_front
                          ? `${conversionHandoffSummary.partFamilies.drawer_front} drawer front`
                          : null,
                        conversionHandoffSummary.partFamilies.body_front
                          ? `${conversionHandoffSummary.partFamilies.body_front} body front`
                          : null,
                        conversionHandoffSummary.partFamilies.other
                          ? `${conversionHandoffSummary.partFamilies.other} other`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    Depth Sources:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {[
                        conversionHandoffSummary.depthSources["top+side"]
                          ? `${conversionHandoffSummary.depthSources["top+side"]} top+side`
                          : null,
                        conversionHandoffSummary.depthSources.top
                          ? `${conversionHandoffSummary.depthSources.top} top`
                          : null,
                        conversionHandoffSummary.depthSources.side
                          ? `${conversionHandoffSummary.depthSources.side} side`
                          : null,
                        conversionHandoffSummary.depthSources.fallback
                          ? `${conversionHandoffSummary.depthSources.fallback} fallback`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Estimation Units:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {[
                        conversionHandoffSummary.estimationUnits.piece
                          ? `${conversionHandoffSummary.estimationUnits.piece} piece`
                          : null,
                        conversionHandoffSummary.estimationUnits.panel_area
                          ? `${conversionHandoffSummary.estimationUnits.panel_area} panel_area`
                          : null,
                        conversionHandoffSummary.estimationUnits.other
                          ? `${conversionHandoffSummary.estimationUnits.other} other`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    Cut List Types:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {[
                        conversionHandoffSummary.cutListTypes.cabinet_body
                          ? `${conversionHandoffSummary.cutListTypes.cabinet_body} cabinet body`
                          : null,
                        conversionHandoffSummary.cutListTypes.front_panel
                          ? `${conversionHandoffSummary.cutListTypes.front_panel} front panel`
                          : null,
                        conversionHandoffSummary.cutListTypes.other
                          ? `${conversionHandoffSummary.cutListTypes.other} other`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    Total Panel Area:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.totalPanelAreaSqM
                        ? `${conversionHandoffSummary.totalPanelAreaSqM.toFixed(4)} sq.m`
                        : "—"}
                    </span>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    Total Body Volume:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionHandoffSummary.totalBodyVolumeCuM
                        ? `${conversionHandoffSummary.totalBodyVolumeCuM.toFixed(4)} cu.m`
                        : "—"}
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Grouped Cut Rows:{" "}
                    <span style={{ color: "#e2e8f0" }}>
                      {conversionCutListRows.length}
                    </span>
                  </div>

                  {conversionCutListRows.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "1px solid #334155",
                      }}
                    >
                      <div
                        style={{
                          color: "#93c5fd",
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        Cut List Preview
                      </div>

                      {conversionCutListRows.slice(0, 6).map((row) => (
                        <div key={row.id} style={{ marginBottom: 8 }}>
                          <div style={{ color: "#e2e8f0" }}>
                            {row.partFamily} / {row.partRole} · Qty {row.qty}
                          </div>
                          <div style={{ color: "#94a3b8" }}>
                            {row.widthMm} × {row.heightMm} × {row.depthMm} mm
                            {row.thicknessMm
                              ? ` · ${row.thicknessMm} mm thick`
                              : ""}
                          </div>
                          <div style={{ color: "#64748b" }}>
                            {row.material} · {row.cutListType} ·{" "}
                            {row.estimationUnit}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedConversionMeta && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "1px solid #334155",
                      }}
                    >
                      <div
                        style={{
                          color: "#93c5fd",
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        Selected Part Source
                      </div>
                      <div>
                        Section:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.sectionNo}
                        </span>
                      </div>
                      <div>
                        Section Code:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.sectionCode}
                        </span>
                      </div>
                      <div>
                        Trace Type:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.traceType}
                        </span>
                      </div>
                      <div>
                        Part Family:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.partFamily}
                        </span>
                      </div>
                      <div>
                        Part Role:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.partRole}
                        </span>
                      </div>
                      <div>
                        Trace View:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {String(
                            selectedConversionMeta.traceView,
                          ).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        Depth Source:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.depthSource}
                        </span>
                      </div>
                      <div>
                        Depth Used:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.depthMm
                            ? `${selectedConversionMeta.depthMm} mm`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        Source Label:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.traceLabel}
                        </span>
                      </div>
                      <div>
                        Handoff Size:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.handoffWidthMm &&
                          selectedConversionMeta.handoffHeightMm &&
                          selectedConversionMeta.handoffDepthMm
                            ? `${selectedConversionMeta.handoffWidthMm} × ${selectedConversionMeta.handoffHeightMm} × ${selectedConversionMeta.handoffDepthMm} mm`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        Handoff Thickness:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.handoffThicknessMm
                            ? `${selectedConversionMeta.handoffThicknessMm} mm`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        Area Basis:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.handoffAreaSqM
                            ? `${selectedConversionMeta.handoffAreaSqM.toFixed(4)} sq.m`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        Volume Basis:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.handoffVolumeCuM
                            ? `${selectedConversionMeta.handoffVolumeCuM.toFixed(4)} cu.m`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        Estimation Unit:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.estimationUnit}
                        </span>
                      </div>
                      <div>
                        Cut List Type:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.cutListType}
                        </span>
                      </div>
                      <div>
                        Cost Basis:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {selectedConversionMeta.costBasis}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {editorMode === "reference" && view !== "3d" && (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid #334155",
                }}
              >
                <p style={S.panelLabel}>Reference Tools</p>

                <div
                  style={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      background: "#111827",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#e2e8f0",
                        marginBottom: 8,
                      }}
                    >
                      Reference Status
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 6,
                        marginBottom: 10,
                      }}
                    >
                      {referenceViewSummaries.map((item) => (
                        <div
                          key={item.key}
                          style={{
                            border: "1px solid #334155",
                            borderRadius: 8,
                            padding: "8px 9px",
                            background:
                              item.hasFile && item.hasTrace
                                ? "#052e16"
                                : item.hasFile
                                  ? "#1e293b"
                                  : "#0f172a",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#e2e8f0",
                              marginBottom: 4,
                            }}
                          >
                            {item.label}
                            {item.key === activeReferenceView
                              ? " • ACTIVE"
                              : ""}
                          </div>

                          <div
                            style={{
                              fontSize: 10,
                              color: "#94a3b8",
                              lineHeight: 1.6,
                            }}
                          >
                            <div>
                              File:{" "}
                              <span
                                style={{
                                  color: item.hasFile ? "#86efac" : "#fca5a5",
                                }}
                              >
                                {item.hasFile ? "YES" : "NO"}
                              </span>
                            </div>
                            <div>
                              Trace:{" "}
                              <span
                                style={{
                                  color: item.hasTrace ? "#86efac" : "#fcd34d",
                                }}
                              >
                                {item.traceCount}
                              </span>
                            </div>
                            <div>
                              Scale:{" "}
                              <span
                                style={{
                                  color: item.isCalibrated
                                    ? "#86efac"
                                    : "#fcd34d",
                                }}
                              >
                                {item.isCalibrated ? "OK" : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        fontSize: 10,
                        color: "#94a3b8",
                        lineHeight: 1.8,
                      }}
                    >
                      <div>
                        Active View:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {activeReferenceView.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        Total Traces:{" "}
                        <span style={{ color: "#e2e8f0" }}>
                          {totalTraceCount}
                        </span>
                      </div>

                      {loadedButUntracedViews.length > 0 && (
                        <div>
                          Missing Traces:{" "}
                          <span style={{ color: "#fcd34d" }}>
                            {loadedButUntracedViews
                              .map((item) => item.label)
                              .join(", ")}
                          </span>
                        </div>
                      )}

                      {tracedWithoutFileViews.length > 0 && (
                        <div>
                          Trace Without File:{" "}
                          <span style={{ color: "#fca5a5" }}>
                            {tracedWithoutFileViews
                              .map((item) => item.label)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={S.propLabel}>Overall Width (mm)</label>
                    <input
                      type="number"
                      value={importDimensions.w}
                      onChange={(e) =>
                        updateReferenceDimension("w", e.target.value)
                      }
                      style={S.propInput}
                    />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={S.propLabel}>Overall Height (mm)</label>
                    <input
                      type="number"
                      value={importDimensions.h}
                      onChange={(e) =>
                        updateReferenceDimension("h", e.target.value)
                      }
                      style={S.propInput}
                    />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={S.propLabel}>Overall Depth (mm)</label>
                    <input
                      type="number"
                      value={importDimensions.d}
                      onChange={(e) =>
                        updateReferenceDimension("d", e.target.value)
                      }
                      style={S.propInput}
                    />
                  </div>

                  {hasAnyReferenceFile && (
                    <button
                      onClick={handleConvertReferenceToEditable}
                      disabled={!canConvertReference}
                      style={{
                        ...S.toolBtn,
                        width: "100%",
                        marginBottom: 10,
                        background: "#b45309",
                        opacity: canConvertReference ? 1 : 0.45,
                      }}
                    >
                      {hasRealComponents
                        ? "♻ Re-convert Reference"
                        : "🧩 Convert Reference"}
                    </button>
                  )}
                  <div
                    style={{
                      fontSize: 10,
                      lineHeight: 1.7,
                      color:
                        convertReadinessTone === "ready"
                          ? "#86efac"
                          : convertReadinessTone === "partial"
                            ? "#93c5fd"
                            : "#fcd34d",
                      marginTop: -2,
                      marginBottom: 10,
                    }}
                  >
                    {convertRequirementFeedback}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() =>
                        setActiveReferenceCalibration({
                          points: [],
                          realDistanceMm: 0,
                          pixelsPerMm: 0,
                          isCalibrated: false,
                        })
                      }
                      style={{ ...S.toolBtn, flex: 1, background: "#334155" }}
                    >
                      Clear Scale
                    </button>

                    <button
                      onClick={() => {
                        setActiveTraceObjects([]);
                        setSelectedTraceId(null);
                      }}
                      style={{ ...S.toolBtn, flex: 1, background: "#7f1d1d" }}
                    >
                      Clear Traces
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 3,
                    background: "#0f172a",
                    borderRadius: 8,
                    padding: 3,
                  }}
                >
                  {[
                    { key: "select", label: "Select" },
                    { key: "calibrate", label: "Set Scale" },
                    { key: "rect", label: "Trace Rect" },
                  ].map((tool) => (
                    <button
                      key={tool.key}
                      onClick={() => setTraceTool(tool.key)}
                      style={{
                        ...S.toolBtn,
                        background:
                          traceTool === tool.key ? "#f97316" : "transparent",
                        fontWeight: traceTool === tool.key ? 700 : 400,
                        padding: "4px 12px",
                      }}
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>

                {traceTool === "rect" && (
                  <div style={{ marginTop: 10 }}>
                    <label style={S.propLabel}>Trace Type</label>
                    <select
                      value={newTraceType}
                      onChange={(e) => setNewTraceType(e.target.value)}
                      style={S.propInput}
                    >
                      {TRACE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PUBLISH MODAL ── */}
      {publishModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              width: 400,
              padding: 32,
              borderRadius: 16,
              boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
              border: "1px solid #e4e4e7",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                color: "#0a0a0a",
                fontWeight: 800,
                fontSize: 20,
                letterSpacing: "-0.01em",
              }}
            >
              Publish Product
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "#52525b",
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              This will create a new buyable product in your store and attach
              this 3D model to it.
            </p>

            <form onSubmit={handlePublishProduct}>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 800,
                    marginBottom: 6,
                    color: "#18181b",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Product Name
                </label>
                <input
                  required
                  value={publishForm.name}
                  onChange={(e) =>
                    setPublishForm({ ...publishForm, name: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    boxSizing: "border-box",
                    outline: "none",
                    fontSize: 13,
                    color: "#18181b",
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 800,
                    marginBottom: 6,
                    color: "#18181b",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Price (₱)
                </label>
                <input
                  type="number"
                  required
                  value={publishForm.online_price}
                  onChange={(e) =>
                    setPublishForm({
                      ...publishForm,
                      online_price: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    boxSizing: "border-box",
                    outline: "none",
                    fontSize: 13,
                    color: "#18181b",
                  }}
                />
              </div>

              <div style={{ marginBottom: 32 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 800,
                    marginBottom: 6,
                    color: "#18181b",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Category
                </label>
                <select
                  value={publishForm.category_id}
                  onChange={(e) =>
                    setPublishForm({
                      ...publishForm,
                      category_id: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    boxSizing: "border-box",
                    outline: "none",
                    fontSize: 13,
                    color: "#18181b",
                    background: "#fff",
                  }}
                >
                  <option value="1">Standard Furniture</option>
                  <option value="2">Blueprints & Custom</option>
                </select>
              </div>

              <div
                style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  onClick={() => setPublishModal(false)}
                  style={{
                    padding: "10px 16px",
                    background: "#f4f4f5",
                    border: "1px solid #e4e4e7",
                    color: "#18181b",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={publishing}
                  style={{
                    padding: "10px 20px",
                    background: "#18181b",
                    color: "#ffffff",
                    border: "1px solid #18181b",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                    opacity: publishing ? 0.6 : 1,
                  }}
                >
                  {publishing ? "Publishing..." : "Publish Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
