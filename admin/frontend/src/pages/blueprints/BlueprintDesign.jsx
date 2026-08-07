// BlueprintDesign.jsx — Main component (orchestrates all modules)
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

// ── Data & Types ──────────────────────────────────────────────────────────────
import { VIEWS, EXPORT_VIEWS, WOOD_FINISHES } from "./data/furnitureTypes";
import {
  normalizeComponent,
  applyWoodFinish,
  isWoodLikeMaterial,
  getDefaultFinishId,
} from "./data/componentUtils";
import {
  snap,
  makeId,
  makeGroupId,
  clamp,
  mmToDisplay,
  displayToMm,
  createEmptyReferenceFiles,
} from "./data/utils";
import {
  DEFAULT_IMPORT_DIMENSIONS,
  DEFAULT_IMPORT_TEMPLATE_TYPE,
  TRACE_TYPE_LABELS,
  TRACE_TYPE_OPTIONS,
  createEmptyReferenceCalibrationByView,
  createEmptyTraceObjectsByView,
  isLikelyChairReference,
  normalizeProjectionView,
  normalizeTraceObjects,
} from "./data/referenceTraceUtils";
import { createImportedDiningChairComponents } from "./data/templateComponents";

// ── 2D Blueprint Rendering ────────────────────────────────────────────────────
import { Canvas2D } from "./2d/blueprintComponents";

// ── Editor UI / Hooks ─────────────────────────────────────────────────────────
import { BlueprintEditorHeader } from "./components/BlueprintEditorHeader";
import { BlueprintPublishModal } from "./components/BlueprintPublishModal";
import { useBlueprintHistory } from "./hooks/useBlueprintHistory";
import { useBlueprintPersistence } from "./hooks/useBlueprintPersistence";
import { useBlueprintExport } from "./hooks/useBlueprintExport";
import { useBlueprintLoader } from "./hooks/useBlueprintLoader";
import { useBlueprintReferenceWorkspace } from "./hooks/useBlueprintReferenceWorkspace";
import { useBlueprintSelectionActions } from "./hooks/useBlueprintSelectionActions";
import { useBlueprintDuplicateActions } from "./hooks/useBlueprintDuplicateActions";
import { useBlueprintKeyboardShortcuts } from "./hooks/useBlueprintKeyboardShortcuts";
import { useBlueprintComponentInsertion } from "./hooks/useBlueprintComponentInsertion";
import { useBlueprintArrangementActions } from "./hooks/useBlueprintArrangementActions";
import { useBlueprintBuilderActions } from "./hooks/useBlueprintBuilderActions";
import { useBlueprintAssemblyActions } from "./hooks/useBlueprintAssemblyActions";
import { buildConversionCutListRows } from "./data/conversionCutListUtils";

// ── 3D Viewer ─────────────────────────────────────────────────────────────────
import { ThreeDViewer } from "./3d/threeDViewer";

// ── Styles ────────────────────────────────────────────────────────────────────
import S from "./styles/blueprintStyles";

// ── Constants ─────────────────────────────────────────────────────────────────
const GRID_SIZE = 20;
const FLOOR_OFFSET = 40;

const CREATE_TEMPLATE_TYPE_MAP = {
  cabinet: "template_closet_wardrobe",
  table: "template_dining_table",
  bed: "template_bed_frame",
  chair: "template_dining_chair",
  coffee_table: "template_coffee_table",
};

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
  const [estimatedPrice, setEstimatedPrice] = useState(null);
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
    description: "Custom blueprint product.",
  });

  const {
    pushHistory,
    resetHistory,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
  } = useBlueprintHistory({
    components,
    setComponents,
    setSelectedId,
    setSelectedIds,
    setEdit3DId,
  });

  useEffect(() => {
    // A different blueprint must never inherit Undo / Redo entries from the
    // previously opened design.
    resetHistory();
  }, [id, resetHistory]);

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
  const isLocked = useCallback(
    (comp) =>
      comp?.locked ||
      lockedFields.includes(comp?.type) ||
      lockedFields.includes("all"),
    [lockedFields],
  );

  const {
    selectedComp,
    selectedComponents,
    selectedBounds3D,
    selectedLabel,
    selectedMaterialText,
    selectedDimsText,
    activeSelectionIds3D,
    activeSelectedComponents3D,
    hasLockedSmartSelection3D,
    canUseSmartActions3D,
    removeSelected,
    copySelectedObject,
    pasteCopiedObject,
    toggleLockSelected,
  } = useBlueprintSelectionActions({
    components,
    setComponents,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    clipboardObject,
    setClipboardObject,
    edit3DId,
    setEdit3DId,
    editorMode,
    isLocked,
    pushHistory,
    unit,
  });

  const selectionInspectorSummary3D = useMemo(() => {
    if (!selectedBounds3D || selectedComponents.length <= 1) return null;

    const assemblyIds = selectedComponents.map(
      (component) => component.assemblyId || component.groupId || null,
    );
    const firstAssemblyId = assemblyIds[0] || null;
    const isWholeSingleAssembly =
      !!firstAssemblyId &&
      assemblyIds.every((assemblyId) => assemblyId === firstAssemblyId);
    const firstComponent = selectedComponents[0] || null;
    const lockedCount = selectedComponents.filter((component) =>
      isLocked(component),
    ).length;

    return {
      kind: isWholeSingleAssembly ? "assembly" : "selection",
      name: isWholeSingleAssembly
        ? firstComponent?.assemblyName ||
          firstComponent?.groupLabel ||
          "Furniture Assembly"
        : `${selectedComponents.length} Selected Objects`,
      type: isWholeSingleAssembly
        ? firstComponent?.assemblyType ||
          (firstComponent?.groupType === "chair"
            ? "dining_chair"
            : firstComponent?.groupType) ||
          "assembly"
        : "multi_selection",
      partCount: selectedComponents.length,
      lockedCount,
      materialText: selectedMaterialText,
      bounds: {
        width: selectedBounds3D.width,
        height: selectedBounds3D.height,
        depth: selectedBounds3D.depth,
      },
    };
  }, [
    selectedBounds3D,
    selectedComponents,
    selectedMaterialText,
    isLocked,
  ]);

  useBlueprintLoader({
    id,
    worldDimensions: { w: WORLD_W, h: WORLD_H, d: WORLD_D },
    createTemplateTypeMap: CREATE_TEMPLATE_TYPE_MAP,
    setBlueprint,
    setComponents,
    setSelectedId,
    setSelectedIds,
    setEdit3DId,
    setEstimatedPrice,
    setLockedFields,
    setUnit,
    setReferenceFiles,
    setReferenceFile,
    setEditorMode,
    setImportTemplateType,
    setImportDimensions,
    setImportComments,
    setReferenceCalibrationByView,
    setTraceObjectsByView,
    setSelectedTraceId,
    setView,
  });

  const hasRealComponents = useMemo(() => {
    return Array.isArray(components)
      ? components.some((c) => c.type !== "reference_proxy")
      : false;
  }, [components]);

  const {
    activeReferenceView,
    activeReferenceCalibration,
    activeTraceObjects,
    allTraceObjects,
    setActiveReferenceCalibration,
    setActiveTraceObjects,
    hasAnyReferenceFile,
    totalTraceCount,
    referenceViewSummaries,
    loadedButUntracedViews,
    tracedWithoutFileViews,
    hasUsableFrontOrBackTrace,
    optionalLoadedViewsWithoutUsableTrace,
    canConvertReference,
    convertReadinessTone,
    convertRequirementFeedback,
  } = useBlueprintReferenceWorkspace({
    view,
    referenceFiles,
    referenceCalibrationByView,
    setReferenceCalibrationByView,
    traceObjectsByView,
    setTraceObjectsByView,
    setSelectedTraceId,
  });

  const {
    getAssemblyItemsFromComponent,
    getGroupAwareSelectionIds,
    cloneSelectionWithOffsets,
    selectWholeAssembly,
    duplicateWholeAssembly,
    arrayDuplicateSelection,
    duplicateSelected,
  } = useBlueprintDuplicateActions({
    components,
    setComponents,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    setEdit3DId,
    setTransformMode,
    editorMode,
    isLocked,
    pushHistory,
    gridSize: GRID_SIZE,
  });

  const { cancelPendingPlacement } = useBlueprintKeyboardShortcuts({
    components,
    pendingPlacement,
    setPendingPlacement,
    setSelectedId,
    setSelectedIds,
    setEdit3DId,
    editorMode,
    handleUndo,
    handleRedo,
    duplicateSelected,
    copySelectedObject,
    pasteCopiedObject,
    removeSelected,
    toggleLockSelected,
  });

  const { addComponent, placePendingComponent } =
    useBlueprintComponentInsertion({
      components,
      setComponents,
      selectedComp,
      activeChairBuild,
      setActiveChairBuild,
      pendingPlacement,
      setPendingPlacement,
      editorMode,
      view,
      pushHistory,
      setSelectedId,
      setEdit3DId,
      setSelectedIds,
      setTransformMode,
      worldDimensions: { w: WORLD_W, h: WORLD_H, d: WORLD_D },
      floorOffset: FLOOR_OFFSET,
    });

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

      const targetSet = new Set(targetIds);
      const hasMeaningfulChange = components.some((component) => {
        if (!targetSet.has(component.id)) return false;

        return Object.entries(attrs || {}).some(([key, nextValue]) => {
          const currentValue = component?.[key];
          if (Object.is(currentValue, nextValue)) return false;

          if (
            currentValue &&
            nextValue &&
            typeof currentValue === "object" &&
            typeof nextValue === "object"
          ) {
            try {
              return JSON.stringify(currentValue) !== JSON.stringify(nextValue);
            } catch {
              return true;
            }
          }

          return true;
        });
      });

      if (!hasMeaningfulChange) return;

      if (!options.skipHistory) {
        pushHistory(components);
      }

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

      const currentById = new Map(components.map((component) => [component.id, component]));
      const entries = Object.entries(changesById).filter(([id, attrs]) => {
        if (!attrs || !Object.keys(attrs).length) return false;

        const current = currentById.get(id);
        if (!current) return false;

        return Object.entries(attrs).some(([key, nextValue]) => {
          const currentValue = current?.[key];
          if (Object.is(currentValue, nextValue)) return false;

          if (
            currentValue &&
            nextValue &&
            typeof currentValue === "object" &&
            typeof nextValue === "object"
          ) {
            try {
              return JSON.stringify(currentValue) !== JSON.stringify(nextValue);
            } catch {
              return true;
            }
          }

          return true;
        });
      });

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

  const {
    canCreateAssembly,
    createAssemblyHint,
    createAssemblySelectionCount,
    createAssemblyFromSelection,
  } = useBlueprintAssemblyActions({
    components,
    selectedId,
    selectedIds,
    editorMode,
    isLocked,
    updateManyComps,
  });

  const {
    smartWidthResizeContext3D,
    previewSmartWidthResize3D,
    applySmartWidthResize3D,
    applySelectionGap3D,
    distributeSelection3D,
    autoLegLayout3D,
    buildSelectionLine3D,
    autoShelfStack3D,
    panelPairSelection3D,
    frontPairSelection3D,
    doorSplitSelection3D,
    drawerStackSelection3D,
    faceFitSelection3D,
    insideFitSelection3D,
    alignSelection3D,
    flushSelection3D,
    mirrorDuplicateSelection3D,
    getCabinetBuilderContext3D,
  } = useBlueprintArrangementActions({
    components,
    setComponents,
    selectedId,
    selectedIds,
    setSelectedId,
    setSelectedIds,
    setEdit3DId,
    setTransformMode,
    editorMode,
    isLocked,
    pushHistory,
    updateManyComps,
    getAssemblyItemsFromComponent,
    activeSelectionIds3D,
    activeSelectedComponents3D,
    hasLockedSmartSelection3D,
    gridSize: GRID_SIZE,
  });

  const {
    buildCabinetBox3D,
    buildCabinetShelfLayout3D,
    buildCabinetInteriorPreset3D,
    buildCabinetFrontPreset3D,
    buildCabinetCustomBayFronts3D,
    buildCabinetCustomCellFronts3D,
  } = useBlueprintBuilderActions({
    components,
    setComponents,
    editorMode,
    pushHistory,
    isLocked,
    setSelectedId,
    setSelectedIds,
    setEdit3DId,
    setTransformMode,
    view,
    getCabinetBuilderContext3D,
    worldHeight: WORLD_H,
    floorOffset: FLOOR_OFFSET,
    gridSize: GRID_SIZE,
  });

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

  const conversionCutListRows = useMemo(
    () => buildConversionCutListRows(convertedComponents),
    [convertedComponents],
  );

  const { saveDesign, handlePublishProduct, handleUnpublishProduct } =
    useBlueprintPersistence({
      id,
      blueprint,
      setBlueprint,
      components,
      unit,
      editorMode,
      referenceFiles,
      referenceFile,
      importTemplateType,
      importDimensions,
      importComments,
      referenceCalibrationByView,
      traceObjectsByView,
      activeReferenceCalibration,
      conversionHandoffSummary,
      conversionCutListRows,
      estimatedPrice,
      designTotal,
      publishForm,
      setPublishModal,
      setSaving,
      setPublishing,
      worldSize: { w: WORLD_W, h: WORLD_H, d: WORLD_D },
      sheetSize: { w: SHEET_W, h: SHEET_H },
      exportViews: EXPORT_VIEWS,
    });

  const { openExportSheets } = useBlueprintExport({
    components,
    selectedComp,
    selectedComponents,
    selectedLabel,
    blueprintTitle: blueprint?.title,
    unit,
  });

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
      <BlueprintEditorHeader
        navigate={navigate}
        blueprint={blueprint}
        view={view}
        setView={setView}
        activeChairBuild={activeChairBuild}
        editorMode={editorMode}
        switchToReferenceMode={switchToReferenceMode}
        switchToEditableMode={switchToEditableMode}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        handleUndo={handleUndo}
        canUndo={editorMode === "editable" && canUndo}
        handleRedo={handleRedo}
        canRedo={editorMode === "editable" && canRedo}
        openExportSheets={openExportSheets}
        saveDesign={saveDesign}
        saving={saving}
        setPublishForm={setPublishForm}
        setPublishModal={setPublishModal}
        handleUnpublishProduct={handleUnpublishProduct}
      />
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
            smartWidthResizeContext={smartWidthResizeContext3D}
            onPreviewSmartWidthResize={previewSmartWidthResize3D}
            onApplySmartWidthResize={applySmartWidthResize3D}
            onAlignSelection={alignSelection3D}
            onFlushSelection={flushSelection3D}
            onMirrorDuplicate={mirrorDuplicateSelection3D}
            onSelectAssembly={selectWholeAssembly}
            onDuplicateAssembly={duplicateWholeAssembly}
            canCreateAssembly={canCreateAssembly}
            createAssemblyHint={createAssemblyHint}
            createAssemblySelectionCount={createAssemblySelectionCount}
            onCreateAssembly={createAssemblyFromSelection}
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
            onBuildCabinetShelfLayout={buildCabinetShelfLayout3D}
            onBuildCabinetInteriorPreset={buildCabinetInteriorPreset3D}
            onBuildCabinetFrontPreset={buildCabinetFrontPreset3D}
            onBuildCabinetCustomBayFronts={buildCabinetCustomBayFronts3D}
            onBuildCabinetCustomCellFronts={buildCabinetCustomCellFronts3D}
            canBuildCabinetBox={editorMode === "editable"}
            canBuildCabinetShelfLayout={editorMode === "editable"}
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
            selectionSummary={selectionInspectorSummary3D}
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
        <BlueprintPublishModal
          publishing={publishing}
          setPublishModal={setPublishModal}
          handlePublishProduct={handlePublishProduct}
          publishForm={publishForm}
          setPublishForm={setPublishForm}
        />
      )}
    </div>
  );
}
