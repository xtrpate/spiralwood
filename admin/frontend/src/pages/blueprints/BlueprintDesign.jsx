// BlueprintDesign.jsx — Main component (orchestrates all modules)
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

// ── Data & Types ──────────────────────────────────────────────────────────────
import { VIEWS, EXPORT_VIEWS, WOOD_FINISHES } from "./data/furnitureTypes";
import {
  normalizeComponent,
  applyWoodFinish,
  isWoodLikeMaterial,
} from "./data/componentUtils";
import {
  mmToDisplay,
  displayToMm,
} from "./data/utils";
import {
  DEFAULT_IMPORT_DIMENSIONS,
  DEFAULT_IMPORT_TEMPLATE_TYPE,
} from "./data/blueprintCompatibilityUtils";

// ── 2D Blueprint Rendering ────────────────────────────────────────────────────
import { Canvas2D } from "./2d/blueprintComponents";

// ── Editor UI / Hooks ─────────────────────────────────────────────────────────
import { BlueprintEditorHeader } from "./components/BlueprintEditorHeader";
import { BlueprintPublishModal } from "./components/BlueprintPublishModal";
import { useBlueprintHistory } from "./hooks/useBlueprintHistory";
import { useBlueprintPersistence } from "./hooks/useBlueprintPersistence";
import { useBlueprintExport } from "./hooks/useBlueprintExport";
import { useBlueprintLoader } from "./hooks/useBlueprintLoader";
import { useBlueprintSelectionActions } from "./hooks/useBlueprintSelectionActions";
import { useBlueprintDuplicateActions } from "./hooks/useBlueprintDuplicateActions";
import { useBlueprintKeyboardShortcuts } from "./hooks/useBlueprintKeyboardShortcuts";
import { useBlueprintComponentInsertion } from "./hooks/useBlueprintComponentInsertion";
import { useBlueprintArrangementActions } from "./hooks/useBlueprintArrangementActions";
import { useBlueprintBuilderActions } from "./hooks/useBlueprintBuilderActions";
import { useBlueprintAssemblyActions } from "./hooks/useBlueprintAssemblyActions";
import {
  buildDesignValidationReport,
  getDesignComponentSignature,
} from "./data/designValidation";

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
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
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
  const editorMode = "editable";
  const [importTemplateType, setImportTemplateType] = useState(
    DEFAULT_IMPORT_TEMPLATE_TYPE,
  );
  const [importDimensions, setImportDimensions] = useState(
    DEFAULT_IMPORT_DIMENSIONS,
  );
  const [pendingPlacement, setPendingPlacement] = useState(null);

  // --- Publish to Catalog State ---
  const [publishModal, setPublishModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishFeedbackStatus, setPublishFeedbackStatus] = useState("loading");
  const [publishForm, setPublishForm] = useState({
    name: blueprint?.title || "",
    description: "Custom blueprint product.",
    category_id: "",
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

  const designTotal = useMemo(() => {
    return components.reduce(
      (sum, c) => sum + Number(c.qty || 1) * Number(c.unitPrice || 0),
      0,
    );
  }, [components]);

  const currentDesignComponentSignature = useMemo(
    () => getDesignComponentSignature(components),
    [components],
  );

  // Unsaved-change tracking covers the editor state that Save Design persists,
  // not only component geometry. View/selection/grid state is intentionally
  // excluded because it is workspace UI state rather than saved Blueprint data.
  const currentEditorStateSignature = useMemo(
    () =>
      JSON.stringify({
        components: currentDesignComponentSignature,
        unit,
        importTemplateType,
        importDimensions,
      }),
    [
      currentDesignComponentSignature,
      unit,
      importTemplateType,
      importDimensions,
    ],
  );
  const currentEditorStateSignatureRef = useRef(currentEditorStateSignature);
  currentEditorStateSignatureRef.current = currentEditorStateSignature;
  const [savedEditorStateSignature, setSavedEditorStateSignature] =
    useState(null);

  useEffect(() => {
    // A route change starts a fresh baseline. The loader will establish the
    // saved signature once the matching Blueprint record arrives.
    setSavedEditorStateSignature(null);
  }, [id]);

  useEffect(() => {
    if (!blueprint || String(blueprint.id) !== String(id)) return;

    setSavedEditorStateSignature((previous) =>
      previous === null ? currentEditorStateSignatureRef.current : previous,
    );
  }, [id, blueprint?.id, blueprint?.design_data]);

  const markEditorStateSaved = useCallback((savedSignature) => {
    if (typeof savedSignature === "string") {
      setSavedEditorStateSignature(savedSignature);
    }
  }, []);

  const hasUnsavedDesignChanges = useMemo(
    () =>
      savedEditorStateSignature !== null &&
      currentEditorStateSignature !== savedEditorStateSignature,
    [currentEditorStateSignature, savedEditorStateSignature],
  );

  const confirmLeaveWithUnsavedChanges = useCallback(() => {
    if (!hasUnsavedDesignChanges) return true;
    return window.confirm(
      "You have unsaved Blueprint changes. Leave without saving?",
    );
  }, [hasUnsavedDesignChanges]);

  const guardedNavigate = useCallback(
    (to, options) => {
      if (!confirmLeaveWithUnsavedChanges()) return;
      navigate(to, options);
    },
    [confirmLeaveWithUnsavedChanges, navigate],
  );

  useEffect(() => {
    if (!hasUnsavedDesignChanges) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedDesignChanges]);

  useEffect(() => {
    if (!hasUnsavedDesignChanges) return undefined;

    const handleInternalLinkClick = (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const element =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;

      if (!element || element.target === "_blank" || element.hasAttribute("download")) {
        return;
      }

      const destination = new URL(element.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.href === window.location.href) return;

      if (!confirmLeaveWithUnsavedChanges()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", handleInternalLinkClick, true);
    return () =>
      document.removeEventListener("click", handleInternalLinkClick, true);
  }, [confirmLeaveWithUnsavedChanges, hasUnsavedDesignChanges]);

  const openProjectEstimate = useCallback(() => {
    if (!id || id === "new") {
      toast.error(
        "Create and save the Blueprint record before opening Project Estimate.",
      );
      return;
    }

    if (saving) {
      toast.error("Wait for the current Blueprint save to finish.");
      return;
    }

    if (hasUnsavedDesignChanges) {
      toast.error(
        "Save the Blueprint first so Project Estimate uses the latest parts.",
      );
      return;
    }

    navigate(`/admin/blueprints/${id}/estimation`);
  }, [hasUnsavedDesignChanges, id, navigate, saving]);

  const designValidationReport = useMemo(
    () =>
      buildDesignValidationReport({
        components,
        worldDimensions: { w: WORLD_W, h: WORLD_H, d: WORLD_D },
        hasUnsavedChanges: hasUnsavedDesignChanges,
      }),
    [components, hasUnsavedDesignChanges, WORLD_W, WORLD_H, WORLD_D],
  );

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
  }, [selectedBounds3D, selectedComponents, selectedMaterialText, isLocked]);

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
    setImportTemplateType,
    setImportDimensions,
    setView,
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
      const currentById = new Map(
        components.map((component) => [component.id, component]),
      );
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
    mergeSelectedIntoAssembly,
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
    autoApronRailLayout3D,
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
    worldHeight: WORLD_H,
    floorOffset: FLOOR_OFFSET,
    gridSize: GRID_SIZE,
  });

  const {
    buildSimpleTable3D,
    buildCabinetBox3D,
    buildCabinetShelfLayout3D,
    buildCabinetInteriorPreset3D,
    buildCabinetDoorLayout3D,
    buildCabinetDrawerLayout3D,
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

  const uniqueMaterials = useMemo(() => {
    return [...new Set(components.map((c) => c.material).filter(Boolean))];
  }, [components]);

  const { saveDesign, handlePublishProduct, handleUnpublishProduct } =
    useBlueprintPersistence({
      id,
      blueprint,
      setBlueprint,
      components,
      unit,
      importTemplateType,
      importDimensions,
      editorStateSignature: currentEditorStateSignature,
      onDesignSaved: markEditorStateSaved,
      publishForm,
      setPublishModal,
      setSaving,
      setPublishing,
      setPublishFeedbackStatus,
      worldSize: { w: WORLD_W, h: WORLD_H, d: WORLD_D },
      sheetSize: { w: SHEET_W, h: SHEET_H },
      exportViews: EXPORT_VIEWS,
    });

  const {
    previewExportSheets,
    printExportSheets,
    downloadExportPdf,
    downloadingPdf,
  } = useBlueprintExport({
    components,
    blueprintTitle: blueprint?.title,
    unit,
    hasUnsavedDesignChanges,
    designValidationReport,
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
    <div
      className="wisdom-blueprint-editor"
      style={{ ...S.fullScreenWrapper, fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`
        .wisdom-blueprint-editor button {
          border-radius: 0 !important;
          box-shadow: none !important;
          transition:
            background-color .12s ease,
            border-color .12s ease,
            color .12s ease,
            opacity .12s ease,
            filter .12s ease;
        }

        .wisdom-blueprint-editor button:not(:disabled):hover {
          filter: brightness(1.08);
        }

        .wisdom-blueprint-editor button:focus-visible,
        .wisdom-blueprint-editor input:focus-visible,
        .wisdom-blueprint-editor select:focus-visible,
        .wisdom-blueprint-editor textarea:focus-visible {
          outline: 2px solid rgba(96,165,250,.75);
          outline-offset: 1px;
        }

        .wisdom-blueprint-editor input:not([type="range"]):not([type="checkbox"]):not([type="color"]),
        .wisdom-blueprint-editor select,
        .wisdom-blueprint-editor textarea {
          border-radius: 2px !important;
        }
      `}</style>

      <BlueprintEditorHeader
        navigate={guardedNavigate}
        blueprint={blueprint}
        view={view}
        setView={setView}
        activeChairBuild={activeChairBuild}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        handleUndo={handleUndo}
        canUndo={canUndo}
        handleRedo={handleRedo}
        canRedo={canRedo}
        previewExportSheets={previewExportSheets}
        downloadExportPdf={downloadExportPdf}
        printExportSheets={printExportSheets}
        downloadingPdf={downloadingPdf}
        openProjectEstimate={openProjectEstimate}
        saveDesign={saveDesign}
        saving={saving}
        publishing={publishing}
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
            onMergeSelectionIntoAssembly={mergeSelectedIntoAssembly}
            canMergeAssemblies={editorMode === "editable"}
            onArrayDuplicate={arrayDuplicateSelection}
            onDistributeSelection={distributeSelection3D}
            onGapSelection={applySelectionGap3D}
            onBuildLineSelection={buildSelectionLine3D}
            onAutoShelfStack={autoShelfStack3D}
            onAutoLegLayout={autoLegLayout3D}
            onAutoApronRailLayout={autoApronRailLayout3D}
            onPanelPairSelection={panelPairSelection3D}
            onFrontPairSelection={frontPairSelection3D}
            onDoorSplitSelection={doorSplitSelection3D}
            onDrawerStackSelection={drawerStackSelection3D}
            onFaceFitSelection={faceFitSelection3D}
            onInsideFitSelection={insideFitSelection3D}
            onBuildSimpleTable={buildSimpleTable3D}
            onBuildCabinetBox={buildCabinetBox3D}
            onBuildCabinetShelfLayout={buildCabinetShelfLayout3D}
            onBuildCabinetInteriorPreset={buildCabinetInteriorPreset3D}
            onBuildCabinetDoorLayout={buildCabinetDoorLayout3D}
            onBuildCabinetDrawerLayout={buildCabinetDrawerLayout3D}
            onBuildCabinetFrontPreset={buildCabinetFrontPreset3D}
            onBuildCabinetCustomBayFronts={buildCabinetCustomBayFronts3D}
            onBuildCabinetCustomCellFronts={buildCabinetCustomCellFronts3D}
            canBuildSimpleTable={editorMode === "editable"}
            canBuildCabinetBox={editorMode === "editable"}
            canBuildCabinetShelfLayout={editorMode === "editable"}
            canBuildCabinetInteriorPreset={editorMode === "editable"}
            canBuildCabinetDoorLayout={editorMode === "editable"}
            canBuildCabinetDrawerLayout={editorMode === "editable"}
            canBuildCabinetFrontPreset={editorMode === "editable"}
            canBuildCabinetCustomBayFronts={editorMode === "editable"}
            canBuildCabinetCustomCellFronts={editorMode === "editable"}
            designValidationReport={designValidationReport}
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
                          raw_material_id: null,
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
          </div>
        </div>
      )}

      {/* ── PUBLISH MODAL ── */}
      {publishModal && (
        <BlueprintPublishModal
          publishing={publishing}
          publishFeedbackStatus={publishFeedbackStatus}
          setPublishModal={setPublishModal}
          handlePublishProduct={handlePublishProduct}
          publishForm={publishForm}
          setPublishForm={setPublishForm}
        />
      )}
    </div>
  );
}
