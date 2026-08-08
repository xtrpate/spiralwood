import React, { useCallback, useEffect, useState } from "react";
import S from "../../styles/blueprintStyles";
import { VIEWER_UI } from "../viewerUi";

export function FurnitureToolsPanel({
  canUseSmartActions,
  smartSelectionCount = 0,
  hasLockedSmartSelection = false,
  smartWidthResizeContext = null,
  onPreviewSmartWidthResize,
  onApplySmartWidthResize,
  onAlignSelection,
  onFlushSelection,
  onMirrorDuplicate,
  onSelectAssembly,
  onDuplicateAssembly,
  onArrayDuplicate,
  onDistributeSelection,
  onGapSelection,
  onBuildLineSelection,
  onAutoShelfStack,
  onAutoLegLayout,
  onAutoApronRailLayout,
  onPanelPairSelection,
  onFrontPairSelection,
  onDoorSplitSelection,
  onDrawerStackSelection,
  onFaceFitSelection,
  onInsideFitSelection,
  onBuildSimpleTable,
  onBuildCabinetBox,
  onBuildCabinetShelfLayout,
  onBuildCabinetInteriorPreset,
  onBuildCabinetDoorLayout,
  onBuildCabinetDrawerLayout,
  onBuildCabinetFrontPreset,
  onBuildCabinetCustomBayFronts,
  onBuildCabinetCustomCellFronts,
  canBuildSimpleTable = false,
  canBuildCabinetBox = false,
  canBuildCabinetShelfLayout = false,
  canBuildCabinetInteriorPreset = false,
  canBuildCabinetDoorLayout = false,
  canBuildCabinetDrawerLayout = false,
  canBuildCabinetFrontPreset = false,
  canBuildCabinetCustomBayFronts = false,
  canBuildCabinetCustomCellFronts = false,
  designValidationReport = null,

  isDocked = false,
  activeToolTab: activeToolTabProp = undefined,
  onChangeToolTab = null,
}) {
  const [internalActiveToolTab, setInternalActiveToolTab] =
    useState("builders");
  const activeToolTab = activeToolTabProp ?? internalActiveToolTab;

  const setActiveToolTab = useCallback(
    (nextTab) => {
      if (typeof onChangeToolTab === "function") {
        onChangeToolTab(nextTab);
        return;
      }
      setInternalActiveToolTab(nextTab);
    },
    [onChangeToolTab],
  );
  const [arrayCount, setArrayCount] = useState(2);
  const [arraySpacing, setArraySpacing] = useState(0);
  const [gapValue, setGapValue] = useState(100);
  const [anchorMode, setAnchorMode] = useState("preserve-first");
  const [smartResizeDimension, setSmartResizeDimension] = useState("width");
  const [smartResizeValue, setSmartResizeValue] = useState("");
  const [smartResizeAnchors, setSmartResizeAnchors] = useState({
    width: "center",
    height: "center",
    depth: "center",
  });
  const [smartResizePreview, setSmartResizePreview] = useState(null);
  const [builderInset, setBuilderInset] = useState(40);
  const [builderLegSize, setBuilderLegSize] = useState(50);
  const [builderApronInset, setBuilderApronInset] = useState(0);
  const [builderApronHeight, setBuilderApronHeight] = useState(70);
  const [builderApronThickness, setBuilderApronThickness] = useState(22);
  const [builderDrawerCount, setBuilderDrawerCount] = useState(3);
  const [simpleTableWidth, setSimpleTableWidth] = useState(1400);
  const [simpleTableDepth, setSimpleTableDepth] = useState(800);
  const [simpleTableHeight, setSimpleTableHeight] = useState(760);
  const [simpleTableTopThickness, setSimpleTableTopThickness] = useState(36);
  const [simpleTableLegSize, setSimpleTableLegSize] = useState(70);
  const [simpleTableApronHeight, setSimpleTableApronHeight] = useState(90);
  const [simpleTableApronThickness, setSimpleTableApronThickness] = useState(25);
  const [baseCabinetWidth, setBaseCabinetWidth] = useState(900);
  const [baseCabinetHeight, setBaseCabinetHeight] = useState(876);
  const [baseCabinetDepth, setBaseCabinetDepth] = useState(610);
  const [baseCabinetThickness, setBaseCabinetThickness] = useState(18);
  const [baseCabinetBackThickness, setBaseCabinetBackThickness] = useState(6);
  const [baseCabinetToeKickHeight, setBaseCabinetToeKickHeight] = useState(100);
  const [baseCabinetToeKickSetback, setBaseCabinetToeKickSetback] = useState(50);
  const [baseCabinetShelfCount, setBaseCabinetShelfCount] = useState(1);
  const [baseCabinetDividerCount, setBaseCabinetDividerCount] = useState(0);
  const [wallCabinetWidth, setWallCabinetWidth] = useState(900);
  const [wallCabinetHeight, setWallCabinetHeight] = useState(760);
  const [wallCabinetDepth, setWallCabinetDepth] = useState(305);
  const [wallCabinetThickness, setWallCabinetThickness] = useState(18);
  const [wallCabinetBackThickness, setWallCabinetBackThickness] = useState(6);
  const [wallCabinetBottomHeight, setWallCabinetBottomHeight] = useState(0);
  const [wallCabinetShelfCount, setWallCabinetShelfCount] = useState(2);
  const [wallCabinetDividerCount, setWallCabinetDividerCount] = useState(0);
  const [tallCabinetWidth, setTallCabinetWidth] = useState(600);
  const [tallCabinetHeight, setTallCabinetHeight] = useState(2135);
  const [tallCabinetDepth, setTallCabinetDepth] = useState(610);
  const [tallCabinetThickness, setTallCabinetThickness] = useState(18);
  const [tallCabinetBackThickness, setTallCabinetBackThickness] = useState(6);
  const [tallCabinetToeKickHeight, setTallCabinetToeKickHeight] = useState(100);
  const [tallCabinetToeKickSetback, setTallCabinetToeKickSetback] = useState(50);
  const [tallCabinetShelfCount, setTallCabinetShelfCount] = useState(4);
  const [tallCabinetDividerCount, setTallCabinetDividerCount] = useState(0);  const [wardrobeWidth, setWardrobeWidth] = useState(1200);
  const [wardrobeHeight, setWardrobeHeight] = useState(2100);
  const [wardrobeDepth, setWardrobeDepth] = useState(600);
  const [wardrobeThickness, setWardrobeThickness] = useState(18);
  const [wardrobeBackThickness, setWardrobeBackThickness] = useState(6);
  const [wardrobePlinthHeight, setWardrobePlinthHeight] = useState(80);
  const [wardrobePlinthSetback, setWardrobePlinthSetback] = useState(30);
  const [wardrobeShelfCount, setWardrobeShelfCount] = useState(4);
  const [wardrobeDividerCount, setWardrobeDividerCount] = useState(1);
  const [wardrobeShelfPlacement, setWardrobeShelfPlacement] = useState("right");  const [cabinetWidth, setCabinetWidth] = useState(900);
  const [cabinetHeight, setCabinetHeight] = useState(1800);
  const [cabinetDepth, setCabinetDepth] = useState(450);
  const [cabinetThickness, setCabinetThickness] = useState(20);
  const [cabinetShelfCount, setCabinetShelfCount] = useState(2);
  const [shelfLayoutCount, setShelfLayoutCount] = useState(2);
  const [cabinetHasDivider, setCabinetHasDivider] = useState(false);
  const [interiorPreset, setInteriorPreset] = useState("two-column");
  const [frontPreset, setFrontPreset] = useState("double-door");
  const [frontReveal, setFrontReveal] = useState(10);
  const [frontGap, setFrontGap] = useState(10);
  const [frontThickness, setFrontThickness] = useState(20);
  const [doorLayoutMode, setDoorLayoutMode] = useState("pair");
  const [doorLayoutScope, setDoorLayoutScope] = useState("whole");
  const [doorReveal, setDoorReveal] = useState(10);
  const [doorGap, setDoorGap] = useState(10);
  const [doorThickness, setDoorThickness] = useState(20);
  const [drawerLayoutScope, setDrawerLayoutScope] = useState("whole");
  const [drawerLayoutCount, setDrawerLayoutCount] = useState(3);
  const [drawerLayoutDepth, setDrawerLayoutDepth] = useState(450);
  const [drawerLeftClearance, setDrawerLeftClearance] = useState(12.5);
  const [drawerRightClearance, setDrawerRightClearance] = useState(12.5);
  const [drawerBottomClearance, setDrawerBottomClearance] = useState(12);
  const [drawerFrontOverlay, setDrawerFrontOverlay] = useState(10);
  const [drawerLayoutGap, setDrawerLayoutGap] = useState(10);
  const [drawerFrontThickness, setDrawerFrontThickness] = useState(20);
  const [frontTargetBayIndex, setFrontTargetBayIndex] = useState(1);
  const [bay1FrontType, setBay1FrontType] = useState("door");
  const [bay2FrontType, setBay2FrontType] = useState("drawer");
  const [bay3FrontType, setBay3FrontType] = useState("door");
  const [cellFrontAssignments, setCellFrontAssignments] = useState([
    "door",
    "door",
    "door",
    "door",
    "door",
    "door",
    "door",
    "door",
    "door",
  ]);
  const [validationReviewer, setValidationReviewer] = useState("");
  const [validationReviewDate, setValidationReviewDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [validationProductionNotes, setValidationProductionNotes] = useState("");
  const [validationRunAt, setValidationRunAt] = useState("");

  useEffect(() => {
    if (!smartWidthResizeContext?.supported) {
      setSmartResizeValue("");
      setSmartResizePreview(null);
      return;
    }

    const supportedDimensions =
      smartWidthResizeContext?.supportedDimensions?.length
        ? smartWidthResizeContext.supportedDimensions
        : ["width"];

    setSmartResizeDimension((current) =>
      supportedDimensions.includes(current)
        ? current
        : supportedDimensions[0] || "width",
    );
    setSmartResizePreview(null);
  }, [
    smartWidthResizeContext?.assemblyId,
    smartWidthResizeContext?.supported,
    smartWidthResizeContext?.supportedDimensions,
  ]);

  useEffect(() => {
    if (!smartWidthResizeContext?.supported) return;

    const currentValue =
      smartWidthResizeContext?.currentDimensions?.[smartResizeDimension] ??
      (smartResizeDimension === "width"
        ? smartWidthResizeContext?.currentWidth
        : "");

    setSmartResizeValue(
      currentValue === "" || currentValue === null || currentValue === undefined
        ? ""
        : String(currentValue),
    );
    setSmartResizePreview(null);
  }, [
    smartWidthResizeContext?.assemblyId,
    smartWidthResizeContext?.currentDimensions?.width,
    smartWidthResizeContext?.currentDimensions?.height,
    smartWidthResizeContext?.currentDimensions?.depth,
    smartWidthResizeContext?.currentWidth,
    smartWidthResizeContext?.supported,
    smartResizeDimension,
  ]);

  const canPairActions = canUseSmartActions && smartSelectionCount > 1;
  const canMirror = canUseSmartActions && smartSelectionCount > 0;
  const canAssemblyActions = canUseSmartActions && smartSelectionCount > 0;
  const canDistribute = canUseSmartActions && smartSelectionCount > 2;
  const canGapActions = canUseSmartActions && smartSelectionCount > 1;
  const canBuilderHelpers = canUseSmartActions && smartSelectionCount > 0;
  const canFurnitureLegLayout =
    canBuilderHelpers &&
    typeof onAutoLegLayout === "function" &&
    !hasLockedSmartSelection;
  const canFurnitureApronLayout =
    canBuilderHelpers &&
    typeof onAutoApronRailLayout === "function" &&
    !hasLockedSmartSelection;
  const canStrictMultiBuilderHelpers =
    canUseSmartActions && smartSelectionCount > 1;
  const canSmartAssemblyResize =
    canUseSmartActions &&
    Boolean(smartWidthResizeContext?.supported) &&
    !smartWidthResizeContext?.hasLockedAssemblyPart &&
    typeof onPreviewSmartWidthResize === "function" &&
    typeof onApplySmartWidthResize === "function";
  const canSimpleTableBuilder =
    canBuildSimpleTable && typeof onBuildSimpleTable === "function";
  const canQuickCabinetBuilder =
    canBuildCabinetBox && typeof onBuildCabinetBox === "function";
  const canShelfLayoutBuilder =
    canBuildCabinetShelfLayout &&
    typeof onBuildCabinetShelfLayout === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;
  const canInteriorPresetBuilder =
    canBuildCabinetInteriorPreset &&
    typeof onBuildCabinetInteriorPreset === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;
  const canDoorBuilder =
    canBuildCabinetDoorLayout &&
    typeof onBuildCabinetDoorLayout === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;
  const canDrawerBuilder =
    canBuildCabinetDrawerLayout &&
    typeof onBuildCabinetDrawerLayout === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;
  const canFrontPresetBuilder =
    canBuildCabinetFrontPreset &&
    typeof onBuildCabinetFrontPreset === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;
  const canCustomBayFrontBuilder =
    canBuildCabinetCustomBayFronts &&
    typeof onBuildCabinetCustomBayFronts === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;
  const canCustomCellFrontBuilder =
    canBuildCabinetCustomCellFronts &&
    typeof onBuildCabinetCustomCellFronts === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;

  const handlePanelPointerDown = (e) => {
    e.stopPropagation();
  };

  const handleRunDesignValidation = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setValidationRunAt(new Date().toLocaleString());
  };

  const makeHandler =
    (enabled, fn, ...args) =>
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (enabled) fn?.(...args);
    };

  const smartResizeDimensionOptions = [
    {
      key: "width",
      label: "Width",
      anchors: [
        ["left", "Left"],
        ["center", "Center"],
        ["right", "Right"],
      ],
    },
    {
      key: "height",
      label: "Height",
      anchors: [
        ["bottom", "Bottom"],
        ["center", "Center"],
        ["top", "Top"],
      ],
    },
    {
      key: "depth",
      label: "Depth",
      // Assembly Z anchors are internal references. The visible button name
      // must mean the side that actually moves in the 3D workspace.
      anchors: [
        ["back", "Front"],
        ["center", "Center"],
        ["front", "Back"],
      ],
    },
  ];

  const activeSmartResizeMeta =
    smartResizeDimensionOptions.find(
      (item) => item.key === smartResizeDimension,
    ) || smartResizeDimensionOptions[0];

  const activeSmartResizeAnchor =
    smartResizeAnchors?.[smartResizeDimension] || "center";

  const getSmartResizeSideHint = () => {
    if (activeSmartResizeAnchor === "center") {
      return "Center stays fixed; both sides resize evenly.";
    }

    if (smartResizeDimension === "width") {
      return activeSmartResizeAnchor === "left"
        ? "Left side moves; right edge stays fixed."
        : "Right side moves; left edge stays fixed.";
    }

    if (smartResizeDimension === "height") {
      return activeSmartResizeAnchor === "bottom"
        ? "Bottom side moves; top edge stays fixed."
        : "Top side moves; bottom edge stays fixed.";
    }

    return activeSmartResizeAnchor === "back"
      ? "Front side moves; back edge stays fixed."
      : "Back side moves; front edge stays fixed.";
  };

  const handleSmartResizePreview = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const result = onPreviewSmartWidthResize?.(
      smartResizeDimension,
      smartResizeValue,
      activeSmartResizeAnchor,
    );
    setSmartResizePreview(result || null);
  };

  const handleSmartResizeApply = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const result = onApplySmartWidthResize?.(
      smartResizeDimension,
      smartResizeValue,
      activeSmartResizeAnchor,
    );
    setSmartResizePreview(result || null);
  };

  const getBtnStyle = (enabled, warn = false) => ({
    ...(warn ? S.smartActionBtnWarn : S.smartActionBtn),
    opacity: enabled ? 1 : 0.45,
    cursor: enabled ? "pointer" : "not-allowed",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  });

  const getAnchorBtnStyle = (mode) => ({
    ...getBtnStyle(canGapActions),
    ...(anchorMode === mode
      ? {
          border: "1px solid rgba(96,165,250,.75)",
          background:
            "linear-gradient(180deg, rgba(37,99,235,.30) 0%, rgba(29,78,216,.22) 100%)",
          color: "#eef4ff",
          boxShadow: "inset 0 0 0 1px rgba(147,197,253,.12)",
        }
      : {}),
  });

  const fieldStyle = {
    ...S.smartActionsField,
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
  };

  const actionInputStyle = {
    ...S.smartActionsInput,
    width: "100%",
    boxSizing: "border-box",
  };

  const toolTabs = [
    {
      key: "arrange",
      label: "Arrange",
      hint: "Align, flush, spacing, and lineup tools for current selection.",
    },
    {
      key: "builders",
      label: "Builders",
      hint: "Cabinet generator and furniture builder helpers.",
    },
    {
      key: "resize",
      label: "Resize",
      hint:
        "Controlled Width, Height, and Depth resize for supported furniture assemblies.",
    },
    {
      key: "duplicate",
      label: "Duplicate",
      hint: "Mirror, assembly actions, and repeat / array tools.",
    },
    {
      key: "validate",
      label: "Validate",
      hint:
        "Run production-readiness checks for dimensions, materials, cabinet structure, drawers, duplicate geometry, and unsaved changes.",
    },
  ];

  const sectionCardStyle = {
    border: "1px solid rgba(71,85,105,.45)",
    background:
      "linear-gradient(180deg, rgba(8,17,32,.86) 0%, rgba(7,14,26,.92) 100%)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    boxSizing: "border-box",
  };

  const sectionHintStyle = {
    fontSize: 10,
    color: "#8ea0b8",
    lineHeight: 1.45,
    marginBottom: 8,
  };

  const toolTabsRowStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 6,
    marginBottom: 10,
  };

  const getToolTabBtnStyle = (key) => ({
    ...S.libraryTabBtn,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    ...(activeToolTab === key ? S.libraryTabBtnActive : {}),
  });

  const statusText = hasLockedSmartSelection
    ? "Locked items selected. Unlock them first."
    : smartSelectionCount > 1
      ? `${smartSelectionCount} objects selected`
      : smartSelectionCount === 1
        ? "1 object selected"
        : "No active selection. Builders can still create a new cabinet.";

  const activeTabHint =
    toolTabs.find((tab) => tab.key === activeToolTab)?.hint || "";

  return (
    <div
      style={isDocked ? VIEWER_UI.furnitureToolsPanelDocked : S.smartActionsPanel}
      onMouseDown={handlePanelPointerDown}
      onPointerDown={handlePanelPointerDown}
    >
      <div style={S.smartActionsTitle}>Design Tools</div>
      <div style={S.smartActionsSubtle}>{statusText}</div>

      <div style={toolTabsRowStyle}>
        {toolTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={makeHandler(true, setActiveToolTab, tab.key)}
            style={getToolTabBtnStyle(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        style={{
          ...S.infoCard,
          marginBottom: 10,
          padding: "8px 10px",
          lineHeight: 1.55,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#93c5fd",
            fontWeight: 700,
            marginBottom: 2,
          }}
        >
          {toolTabs.find((tab) => tab.key === activeToolTab)?.label || "Tools"}
        </div>
        <div style={{ fontSize: 10, color: "#cbd5e1" }}>{activeTabHint}</div>
      </div>

      {activeToolTab === "validate" ? (
        <>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Production Readiness Check</div>
            <div style={sectionHintStyle}>
              Check the current design for common production issues. Automated checks help
              with review, but final approval must still be done by an experienced carpenter.
            </div>

            <button
              type="button"
              onClick={handleRunDesignValidation}
              style={getBtnStyle(Boolean(designValidationReport))}
            >
              Run Validation
            </button>

            {validationRunAt ? (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 9,
                  color: "#94a3b8",
                }}
              >
                Last checked: {validationRunAt}
              </div>
            ) : null}
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Validation Summary</div>

            <div
              style={{
                ...S.infoCard,
                marginBottom: 10,
                padding: "9px 10px",
                borderColor: designValidationReport?.passed
                  ? designValidationReport?.warnings?.length
                    ? "rgba(251,191,36,.55)"
                    : "rgba(74,222,128,.55)"
                  : "rgba(248,113,113,.62)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: designValidationReport?.passed
                    ? designValidationReport?.warnings?.length
                      ? "#fde68a"
                      : "#86efac"
                    : "#fca5a5",
                }}
              >
                {designValidationReport?.passed
                  ? "Validation Passed"
                  : "Validation Blocked"}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 9,
                  color: "#cbd5e1",
                  lineHeight: 1.45,
                }}
              >
                {designValidationReport?.summary?.totalParts || 0}{" "}{(designValidationReport?.summary?.totalParts || 0) === 1 ? "Part" : "Parts"} |{" "}
                {designValidationReport?.summary?.assemblyCount || 0}{" "}{(designValidationReport?.summary?.assemblyCount || 0) === 1 ? "Assembly" : "Assemblies"}
                | {designValidationReport?.summary?.errorCount || 0}{" "}{(designValidationReport?.summary?.errorCount || 0) === 1 ? "Error" : "Errors"} |{" "}
                {designValidationReport?.summary?.warningCount || 0}{" "}{(designValidationReport?.summary?.warningCount || 0) === 1 ? "Warning" : "Warnings"}
              </div>
            </div>

            {(designValidationReport?.errors || []).length ? (
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#fca5a5",
                    marginBottom: 5,
                  }}
                >
                  Critical Errors
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    maxHeight: 190,
                    overflowY: "auto",
                  }}
                >
                  {designValidationReport.errors.map((issue, index) => (
                    <div
                      key={`${issue.code}-${issue.componentId || issue.assemblyId || index}`}
                      style={{
                        ...S.infoCard,
                        padding: "7px 8px",
                        borderColor: "rgba(248,113,113,.42)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          color: "#fecaca",
                        }}
                      >
                        {issue.title}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 9,
                          color: "#cbd5e1",
                          lineHeight: 1.4,
                        }}
                      >
                        {issue.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {(designValidationReport?.warnings || []).length ? (
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#fde68a",
                    marginBottom: 5,
                  }}
                >
                  Warnings
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    maxHeight: 170,
                    overflowY: "auto",
                  }}
                >
                  {designValidationReport.warnings.map((issue, index) => (
                    <div
                      key={`${issue.code}-${issue.componentId || issue.assemblyId || index}`}
                      style={{
                        ...S.infoCard,
                        padding: "7px 8px",
                        borderColor: "rgba(251,191,36,.35)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          color: "#fde68a",
                        }}
                      >
                        {issue.title}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 9,
                          color: "#cbd5e1",
                          lineHeight: 1.4,
                        }}
                      >
                        {issue.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!designValidationReport?.errors?.length &&
            !designValidationReport?.warnings?.length ? (
              <div
                style={{
                  ...S.infoCard,
                  color: "#86efac",
                  fontSize: 10,
                  lineHeight: 1.5,
                }}
              >
                No critical errors or warnings were found by the current
                automated checks.
              </div>
            ) : null}
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Final Production Review</div>
            <div style={sectionHintStyle}>
              Record the reviewer and notes for this validation. Final carpenter
              approval is required before production.
            </div>

            <label style={{ ...fieldStyle, display: "block", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>Reviewer</span>
              <input
                type="text"
                value={validationReviewer}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => setValidationReviewer(e.target.value)}
                placeholder="Enter reviewer name"
                style={actionInputStyle}
              />
            </label>

            <label style={{ ...fieldStyle, display: "block", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>Review Date</span>
              <input
                type="date"
                value={validationReviewDate}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => setValidationReviewDate(e.target.value)}
                style={actionInputStyle}
              />
            </label>

            <label style={{ ...fieldStyle, display: "block" }}>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>
                Review Notes
              </span>
              <textarea
                value={validationProductionNotes}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => setValidationProductionNotes(e.target.value)}
                rows={4}
                placeholder="Add notes for final production review"
                style={{
                  ...actionInputStyle,
                  resize: "vertical",
                  minHeight: 76,
                  paddingTop: 8,
                }}
              />
            </label>
          </div>

          {(designValidationReport?.notices || []).length ? (
            <div style={sectionCardStyle}>
              <div style={S.smartActionsSectionLabel}>Review Notices</div>
              <div style={{ display: "grid", gap: 6 }}>
                {designValidationReport.notices.map((notice) => (
                  <div
                    key={notice.code}
                    style={{
                      ...S.infoCard,
                      padding: "7px 8px",
                      fontSize: 9,
                      lineHeight: 1.45,
                      color: "#cbd5e1",
                    }}
                  >
                    <strong style={{ color: "#93c5fd" }}>
                      {notice.title}
                    </strong>
                    <div style={{ marginTop: 2 }}>{notice.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {activeToolTab === "arrange" ? (
        <>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Align</div>
            <div style={sectionHintStyle}>
              Use these to line up the current selection on X, Y, or Z.
            </div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "x",
                  "min",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Left
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "x",
                  "center",
                )}
                style={getBtnStyle(canPairActions)}
              >
                X Center
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "x",
                  "max",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Right
              </button>

              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "z",
                  "min",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Front
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "z",
                  "center",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Z Center
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "z",
                  "max",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Back
              </button>

              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "y",
                  "min",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Bottom
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "y",
                  "center",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Y Center
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "y",
                  "max",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Top
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Flush Snap</div>
            <div style={sectionHintStyle}>
              Snap selected parts flush to the outer edges of the current
              selection bounds.
            </div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "x",
                  "negative",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush L
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "x",
                  "positive",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush R
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "y",
                  "negative",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush Bot
              </button>

              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "z",
                  "negative",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush F
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "z",
                  "positive",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush B
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "y",
                  "positive",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush Top
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Spacing & Layout</div>
            <div style={sectionHintStyle}>
              Control the gap, anchor rule, distribute spacing, and build clean
              rows or stacks.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label
                style={{
                  ...fieldStyle,
                  gridColumn: "1 / span 2",
                }}
              >
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Gap (mm)</span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={gapValue}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setGapValue(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsSectionLabel}>Anchor Mode</div>
            <div style={{ ...S.smartActionsGrid, marginBottom: 8 }}>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  setAnchorMode,
                  "preserve-first",
                )}
                style={getAnchorBtnStyle("preserve-first")}
              >
                First
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  setAnchorMode,
                  "preserve-last",
                )}
                style={getAnchorBtnStyle("preserve-last")}
              >
                Last
              </button>
              <button
                type="button"
                onClick={makeHandler(canGapActions, setAnchorMode, "center")}
                style={getAnchorBtnStyle("center")}
              >
                Center
              </button>
            </div>

            <div style={S.smartActionsSectionLabel}>Distribute</div>
            <div style={{ ...S.smartActionsGrid, marginBottom: 8 }}>
              <button
                type="button"
                onClick={makeHandler(
                  canDistribute,
                  onDistributeSelection,
                  "x",
                  anchorMode,
                )}
                style={getBtnStyle(canDistribute)}
              >
                Dist X
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canDistribute,
                  onDistributeSelection,
                  "y",
                  anchorMode,
                )}
                style={getBtnStyle(canDistribute)}
              >
                Dist Y
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canDistribute,
                  onDistributeSelection,
                  "z",
                  anchorMode,
                )}
                style={getBtnStyle(canDistribute)}
              >
                Dist Z
              </button>
            </div>

            <div style={S.smartActionsSectionLabel}>Equal Gap</div>
            <div style={{ ...S.smartActionsGrid, marginBottom: 8 }}>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onGapSelection,
                  "x",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Gap X
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onGapSelection,
                  "y",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Gap Y
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onGapSelection,
                  "z",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Gap Z
              </button>
            </div>

            <div style={S.smartActionsSectionLabel}>Row / Stack</div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onBuildLineSelection,
                  "x",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Row X
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onBuildLineSelection,
                  "y",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Stack Y
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onBuildLineSelection,
                  "z",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Row Z
              </button>
            </div>
          </div>
        </>
      ) : null}

      {activeToolTab === "resize" ? (
        <>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>
              Controlled Assembly Resize
            </div>
            <div style={sectionHintStyle}>
              Resize supported furniture without using unrestricted whole-assembly
              scale. Structural thickness is preserved where possible and
              connected parts follow the selected assembly dimension.
            </div>

            {smartWidthResizeContext?.supported ? (
              <>
                <div
                  style={{
                    ...S.infoCard,
                    marginBottom: 10,
                    padding: "8px 10px",
                    lineHeight: 1.55,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#e5eefc",
                    }}
                  >
                    {smartWidthResizeContext.assemblyLabel ||
                      "Furniture Assembly"}
                  </div>
                  <div style={{ fontSize: 10, color: "#9fb0c7" }}>
                    {smartWidthResizeContext.partCount || 0} parts
                    {" | "}
                    W {Math.round(
                      smartWidthResizeContext?.currentDimensions?.width ||
                        smartWidthResizeContext?.currentWidth ||
                        0,
                    )} mm
                    {" | "}
                    H {Math.round(
                      smartWidthResizeContext?.currentDimensions?.height || 0,
                    )} mm
                    {" | "}
                    D {Math.round(
                      smartWidthResizeContext?.currentDimensions?.depth || 0,
                    )} mm
                  </div>
                  <div style={{ fontSize: 10, color: "#9fb0c7" }}>
                    Minimum safe {activeSmartResizeMeta.label.toLowerCase()}:{" "}
                    {Math.round(
                      smartWidthResizeContext?.minimumDimensions?.[
                        smartResizeDimension
                      ] ||
                        (smartResizeDimension === "width"
                          ? smartWidthResizeContext?.minimumWidth
                          : 1) ||
                        1,
                    )}{" "}
                    mm
                  </div>
                  {smartWidthResizeContext.warning ? (
                    <div
                      style={{
                        fontSize: 10,
                        color: "#93c5fd",
                        marginTop: 4,
                      }}
                    >
                      {smartWidthResizeContext.warning}
                    </div>
                  ) : null}
                </div>

                <div
                  style={{ ...S.smartActionsSectionLabel, marginBottom: 6 }}
                >
                  Dimension
                </div>
                <div style={{ ...S.smartActionsGrid, marginBottom: 10 }}>
                  {smartResizeDimensionOptions.map((item) => {
                    const dimensionSupported = (
                      smartWidthResizeContext?.supportedDimensions || ["width"]
                    ).includes(item.key);
                    const enabled =
                      canSmartAssemblyResize && dimensionSupported;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={!enabled}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!enabled) return;
                          setSmartResizeDimension(item.key);
                          setSmartResizePreview(null);
                        }}
                        style={{
                          ...getBtnStyle(enabled),
                          ...(smartResizeDimension === item.key
                            ? {
                                border:
                                  "1px solid rgba(96,165,250,.75)",
                                background:
                                  "linear-gradient(180deg, rgba(37,99,235,.30) 0%, rgba(29,78,216,.22) 100%)",
                                color: "#eef4ff",
                              }
                            : {}),
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <label
                  style={{
                    ...fieldStyle,
                    display: "block",
                    marginBottom: 10,
                  }}
                >
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>
                    New {activeSmartResizeMeta.label} (mm)
                  </span>
                  <input
                    type="number"
                    min={
                      smartWidthResizeContext?.minimumDimensions?.[
                        smartResizeDimension
                      ] ||
                      (smartResizeDimension === "width"
                        ? smartWidthResizeContext?.minimumWidth
                        : 1) ||
                      1
                    }
                    step="1"
                    value={smartResizeValue}
                    disabled={!canSmartAssemblyResize}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      setSmartResizeValue(e.target.value);
                      setSmartResizePreview(null);
                    }}
                    style={actionInputStyle}
                  />
                </label>

                <div
                  style={{ ...S.smartActionsSectionLabel, marginBottom: 6 }}
                >
                  Resize Side
                </div>
                <div style={S.smartActionsGrid}>
                  {activeSmartResizeMeta.anchors.map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={!canSmartAssemblyResize}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!canSmartAssemblyResize) return;
                        setSmartResizeAnchors((current) => ({
                          ...current,
                          [smartResizeDimension]: mode,
                        }));
                        setSmartResizePreview(null);
                      }}
                      style={{
                        ...getBtnStyle(canSmartAssemblyResize),
                        ...(activeSmartResizeAnchor === mode
                          ? {
                              border:
                                "1px solid rgba(96,165,250,.75)",
                              background:
                                "linear-gradient(180deg, rgba(37,99,235,.30) 0%, rgba(29,78,216,.22) 100%)",
                              color: "#eef4ff",
                            }
                          : {}),
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    fontSize: 10,
                    color: "#9fb0c7",
                    lineHeight: 1.5,
                    marginTop: 8,
                    marginBottom: 10,
                  }}
                >
                  {getSmartResizeSideHint()}
                </div>

                <div style={S.smartActionsGrid}>
                  <button
                    type="button"
                    disabled={!canSmartAssemblyResize}
                    onClick={handleSmartResizePreview}
                    style={getBtnStyle(canSmartAssemblyResize)}
                  >
                    Preview Changes
                  </button>
                  <button
                    type="button"
                    disabled={!canSmartAssemblyResize}
                    onClick={handleSmartResizeApply}
                    style={getBtnStyle(canSmartAssemblyResize)}
                  >
                    Apply Resize
                  </button>
                </div>

                {smartResizePreview ? (
                  <div
                    style={{
                      ...S.infoCard,
                      marginTop: 10,
                      padding: "8px 10px",
                      lineHeight: 1.55,
                      borderColor: smartResizePreview.supported
                        ? "rgba(74,222,128,.45)"
                        : "rgba(248,113,113,.55)",
                    }}
                  >
                    {smartResizePreview.supported ? (
                      <>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#86efac",
                            fontWeight: 800,
                          }}
                        >
                          {smartResizePreview.dimensionLabel}:{" "}
                          {Math.round(
                            smartResizePreview.previousValue || 0,
                          )}{" "}
                          mm â†’{" "}
                          {Math.round(
                            smartResizePreview.requestedValue || 0,
                          )}{" "}
                          mm
                        </div>
                        <div style={{ fontSize: 10, color: "#cbd5e1" }}>
                          {getSmartResizeSideHint()}
                        </div>
                        <div style={{ fontSize: 10, color: "#9fb0c7" }}>
                          {smartResizePreview.resizedPartCount || 0} resized
                          {" | "}
                          {smartResizePreview.movedPartCount || 0} repositioned
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 10, color: "#fca5a5" }}>
                        {smartResizePreview.reason ||
                          "Resize preview is unavailable."}
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <div
                style={{
                  ...S.infoCard,
                  color: "#fcd34d",
                  fontSize: 10,
                  lineHeight: 1.55,
                }}
              >
                {smartWidthResizeContext?.reason ||
                  "Select a Dining Table, Coffee Table, Wardrobe, or Cabinet Box assembly to use controlled resize."}
              </div>
            )}

            {smartWidthResizeContext?.hasLockedAssemblyPart ? (
              <div
                style={{
                  fontSize: 10,
                  color: "#fca5a5",
                  marginTop: 8,
                }}
              >
                Unlock all parts in the assembly before resizing.
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {activeToolTab === "builders" ? (
        <>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Simple Table Builder</div>
            <div style={sectionHintStyle}>
              Generate a complete 9-part table assembly from production
              dimensions: 1 tabletop, 4 legs, and 4 structural aprons.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Width (mm)
                </span>
                <input
                  type="number"
                  min="400"
                  step="1"
                  value={simpleTableWidth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSimpleTableWidth(Math.max(400, Number(e.target.value) || 400))
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Depth (mm)
                </span>
                <input
                  type="number"
                  min="400"
                  step="1"
                  value={simpleTableDepth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSimpleTableDepth(Math.max(400, Number(e.target.value) || 400))
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Height (mm)
                </span>
                <input
                  type="number"
                  min="300"
                  step="1"
                  value={simpleTableHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSimpleTableHeight(Math.max(300, Number(e.target.value) || 300))
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Tabletop Thickness (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={simpleTableTopThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSimpleTableTopThickness(
                      Math.max(1, Number(e.target.value) || 1),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Leg Size (mm)
                </span>
                <input
                  type="number"
                  min="20"
                  step="1"
                  value={simpleTableLegSize}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSimpleTableLegSize(Math.max(20, Number(e.target.value) || 20))
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Apron Height (mm)
                </span>
                <input
                  type="number"
                  min="20"
                  step="1"
                  value={simpleTableApronHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSimpleTableApronHeight(
                      Math.max(20, Number(e.target.value) || 20),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Apron Thickness (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={simpleTableApronThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSimpleTableApronThickness(
                      Math.max(1, Number(e.target.value) || 1),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <div style={fieldStyle} />
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canSimpleTableBuilder ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canSimpleTableBuilder
                ? "Builds exactly 9 parts with a 40 mm automatic maximum corner inset. All generated part prices remain 0."
                : "Simple Table Builder is available in Editable mode."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canSimpleTableBuilder,
                  onBuildSimpleTable,
                  {
                    width: simpleTableWidth,
                    depth: simpleTableDepth,
                    height: simpleTableHeight,
                    tabletopThickness: simpleTableTopThickness,
                    legSize: simpleTableLegSize,
                    apronHeight: simpleTableApronHeight,
                    apronThickness: simpleTableApronThickness,
                  },
                )}
                style={getBtnStyle(canSimpleTableBuilder)}
              >
                Build Simple Table
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Base Cabinet Builder</div>
            <div style={sectionHintStyle}>
              Build a production-style base cabinet carcass with exact panel
              thickness, a separate back panel, raised bottom, toe kick,
              dividers, and per-bay shelves. Doors and drawers can be added
              afterward using the existing cabinet builders.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Width (mm)
                </span>
                <input
                  type="number"
                  min="300"
                  step="1"
                  value={baseCabinetWidth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBaseCabinetWidth(
                      Math.max(300, Number(e.target.value) || 900),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Height (mm)
                </span>
                <input
                  type="number"
                  min="400"
                  step="1"
                  value={baseCabinetHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBaseCabinetHeight(
                      Math.max(400, Number(e.target.value) || 900),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Depth (mm)
                </span>
                <input
                  type="number"
                  min="250"
                  step="1"
                  value={baseCabinetDepth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBaseCabinetDepth(
                      Math.max(250, Number(e.target.value) || 600),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Panel Thickness (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={baseCabinetThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBaseCabinetThickness(
                      Math.max(1, Number(e.target.value) || 18),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Back Thickness (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={baseCabinetBackThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBaseCabinetBackThickness(
                      Math.max(1, Number(e.target.value) || 6),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Toe Kick Height (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={baseCabinetToeKickHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBaseCabinetToeKickHeight(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Toe Kick Setback (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={baseCabinetToeKickSetback}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBaseCabinetToeKickSetback(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Fixed Shelf Levels
                </span>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="1"
                  value={baseCabinetShelfCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBaseCabinetShelfCount(
                      Math.max(
                        0,
                        Math.min(8, Math.round(Number(e.target.value) || 0)),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <label
              style={{
                ...fieldStyle,
                display: "block",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 10, color: "#94a3b8" }}>
                Divider Count
              </span>
              <input
                type="number"
                min="0"
                max="4"
                step="1"
                value={baseCabinetDividerCount}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setBaseCabinetDividerCount(
                    Math.max(
                      0,
                      Math.min(4, Math.round(Number(e.target.value) || 0)),
                    ),
                  )
                }
                style={actionInputStyle}
              />
            </label>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canQuickCabinetBuilder ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canQuickCabinetBuilder
                ? "Creates an editable Base Cabinet assembly. Existing Shelf, Door, Drawer, Resize, and assembly tools remain available after generation."
                : "Base Cabinet Builder is available in Editable mode."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canQuickCabinetBuilder,
                  onBuildCabinetBox,
                  {
                    builderType: "base",
                    width: baseCabinetWidth,
                    height: baseCabinetHeight,
                    depth: baseCabinetDepth,
                    thickness: baseCabinetThickness,
                    backThickness: baseCabinetBackThickness,
                    toeKickHeight: baseCabinetToeKickHeight,
                    toeKickSetback: baseCabinetToeKickSetback,
                    shelfCount: baseCabinetShelfCount,
                    dividerCount: baseCabinetDividerCount,
                  },
                )}
                style={getBtnStyle(canQuickCabinetBuilder)}
              >
                Build Base Cabinet
              </button>
            </div>
          </div>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Wall Cabinet Builder</div>
            <div style={sectionHintStyle}>
              Build an elevated wall cabinet carcass with exact panel and back
              thickness, fixed shelves, and optional vertical dividers. Wall
              cabinets have no toe kick and stay editable after generation.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Width (mm)
                </span>
                <input
                  type="number"
                  min="300"
                  step="1"
                  value={wallCabinetWidth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWallCabinetWidth(
                      Math.max(300, Number(e.target.value) || 900),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Height (mm)
                </span>
                <input
                  type="number"
                  min="300"
                  step="1"
                  value={wallCabinetHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWallCabinetHeight(
                      Math.max(300, Number(e.target.value) || 720),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Depth (mm)
                </span>
                <input
                  type="number"
                  min="200"
                  step="1"
                  value={wallCabinetDepth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWallCabinetDepth(
                      Math.max(200, Number(e.target.value) || 350),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Panel Thickness (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={wallCabinetThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWallCabinetThickness(
                      Math.max(1, Number(e.target.value) || 18),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Back Thickness (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={wallCabinetBackThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWallCabinetBackThickness(
                      Math.max(1, Number(e.target.value) || 6),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Mount Height from Floor (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={wallCabinetBottomHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWallCabinetBottomHeight(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Fixed Shelf Levels
                </span>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="1"
                  value={wallCabinetShelfCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWallCabinetShelfCount(
                      Math.max(
                        0,
                        Math.min(8, Math.round(Number(e.target.value) || 0)),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Divider Count
                </span>
                <input
                  type="number"
                  min="0"
                  max="4"
                  step="1"
                  value={wallCabinetDividerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWallCabinetDividerCount(
                      Math.max(
                        0,
                        Math.min(4, Math.round(Number(e.target.value) || 0)),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canQuickCabinetBuilder ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canQuickCabinetBuilder
                ? "Standalone Preview: floor. Mount Height 0 mm keeps a wall cabinet on the floor while designing it alone. Set a higher Mount Height only when placing it on an actual wall. Existing Shelf, Door, Resize, Validate, and assembly tools remain available."
                : "Wall Cabinet Builder is available in Editable mode."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canQuickCabinetBuilder,
                  onBuildCabinetBox,
                  {
                    builderType: "wall",
                    width: wallCabinetWidth,
                    height: wallCabinetHeight,
                    depth: wallCabinetDepth,
                    thickness: wallCabinetThickness,
                    backThickness: wallCabinetBackThickness,
                    bottomHeightFromFloor: wallCabinetBottomHeight,
                    shelfCount: wallCabinetShelfCount,
                    dividerCount: wallCabinetDividerCount,
                  },
                )}
                style={getBtnStyle(canQuickCabinetBuilder)}
              >
                Build Wall Cabinet
              </button>
            </div>
          </div>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Tall Cabinet Builder</div>
            <div style={sectionHintStyle}>
              Build a full-height floor cabinet for pantry, storage, or tall
              kitchen use. It uses exact panel and back thickness, a raised
              bottom with toe kick, optional dividers, and per-bay shelves.
              Doors and drawers can be added afterward with existing builders.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Width (mm)
                </span>
                <input
                  type="number"
                  min="300"
                  step="1"
                  value={tallCabinetWidth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setTallCabinetWidth(
                      Math.max(300, Number(e.target.value) || 900),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Height (mm)
                </span>
                <input
                  type="number"
                  min="1200"
                  step="1"
                  value={tallCabinetHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setTallCabinetHeight(
                      Math.max(1200, Number(e.target.value) || 2100),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Depth (mm)
                </span>
                <input
                  type="number"
                  min="250"
                  step="1"
                  value={tallCabinetDepth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setTallCabinetDepth(
                      Math.max(250, Number(e.target.value) || 600),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Panel Thickness (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={tallCabinetThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setTallCabinetThickness(
                      Math.max(1, Number(e.target.value) || 18),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Back Thickness (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={tallCabinetBackThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setTallCabinetBackThickness(
                      Math.max(1, Number(e.target.value) || 6),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Toe Kick Height (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={tallCabinetToeKickHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setTallCabinetToeKickHeight(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Toe Kick Setback (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={tallCabinetToeKickSetback}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setTallCabinetToeKickSetback(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Fixed Shelf Levels
                </span>
                <input
                  type="number"
                  min="0"
                  max="12"
                  step="1"
                  value={tallCabinetShelfCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setTallCabinetShelfCount(
                      Math.max(
                        0,
                        Math.min(12, Math.round(Number(e.target.value) || 0)),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <label
              style={{
                ...fieldStyle,
                display: "block",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 10, color: "#94a3b8" }}>
                Divider Count
              </span>
              <input
                type="number"
                min="0"
                max="4"
                step="1"
                value={tallCabinetDividerCount}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setTallCabinetDividerCount(
                    Math.max(
                      0,
                      Math.min(4, Math.round(Number(e.target.value) || 0)),
                    ),
                  )
                }
                style={actionInputStyle}
              />
            </label>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canQuickCabinetBuilder ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canQuickCabinetBuilder
                ? "Creates an editable Tall Cabinet assembly. Existing Shelf, Door, Drawer, Resize, Validate, and assembly tools remain available."
                : "Tall Cabinet Builder is available in Editable mode."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canQuickCabinetBuilder,
                  onBuildCabinetBox,
                  {
                    builderType: "tall",
                    width: tallCabinetWidth,
                    height: tallCabinetHeight,
                    depth: tallCabinetDepth,
                    thickness: tallCabinetThickness,
                    backThickness: tallCabinetBackThickness,
                    toeKickHeight: tallCabinetToeKickHeight,
                    toeKickSetback: tallCabinetToeKickSetback,
                    shelfCount: tallCabinetShelfCount,
                    dividerCount: tallCabinetDividerCount,
                  },
                )}
                style={getBtnStyle(canQuickCabinetBuilder)}
              >
                Build Tall Cabinet
              </button>
            </div>
          </div>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Wardrobe Builder</div>
            <div style={sectionHintStyle}>
              Build a production-style wardrobe carcass using real board parts.
              The default layout creates one open hanging bay and one shelf bay.
              Doors and drawers can be added afterward with existing builders.
              Hanging rails and wardrobe hardware will be handled in the later
              hardware phase.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Width (mm)
                </span>
                <input
                  type="number"
                  min="600"
                  max="2400"
                  step="1"
                  value={wardrobeWidth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWardrobeWidth(
                      Math.max(
                        600,
                        Math.min(2400, Number(e.target.value) || 1200),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Height (mm)
                </span>
                <input
                  type="number"
                  min="1800"
                  max="2400"
                  step="1"
                  value={wardrobeHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWardrobeHeight(
                      Math.max(
                        1800,
                        Math.min(2400, Number(e.target.value) || 2100),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Depth (mm)
                </span>
                <input
                  type="number"
                  min="500"
                  max="650"
                  step="1"
                  value={wardrobeDepth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWardrobeDepth(
                      Math.max(
                        500,
                        Math.min(650, Number(e.target.value) || 600),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Panel Thickness (mm)
                </span>
                <input
                  type="number"
                  min="12"
                  max="25"
                  step="1"
                  value={wardrobeThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWardrobeThickness(
                      Math.max(
                        12,
                        Math.min(25, Number(e.target.value) || 18),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Back Thickness (mm)
                </span>
                <input
                  type="number"
                  min="3"
                  max="12"
                  step="1"
                  value={wardrobeBackThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWardrobeBackThickness(
                      Math.max(
                        3,
                        Math.min(12, Number(e.target.value) || 6),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Plinth Height (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  max="150"
                  step="1"
                  value={wardrobePlinthHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWardrobePlinthHeight(
                      Math.max(
                        0,
                        Math.min(150, Number(e.target.value) || 0),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Plinth Setback (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  max="120"
                  step="1"
                  value={wardrobePlinthSetback}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWardrobePlinthSetback(
                      Math.max(
                        0,
                        Math.min(120, Number(e.target.value) || 0),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Divider Count
                </span>
                <input
                  type="number"
                  min="0"
                  max="3"
                  step="1"
                  value={wardrobeDividerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWardrobeDividerCount(
                      Math.max(
                        0,
                        Math.min(3, Math.round(Number(e.target.value) || 0)),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Fixed Shelf Levels
                </span>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="1"
                  value={wardrobeShelfCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setWardrobeShelfCount(
                      Math.max(
                        0,
                        Math.min(8, Math.round(Number(e.target.value) || 0)),
                      ),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Shelf Section
                </span>
                <select
                  value={wardrobeShelfPlacement}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setWardrobeShelfPlacement(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="right">Right Bay</option>
                  <option value="left">Left Bay</option>
                  <option value="all">All Bays</option>
                </select>
              </label>
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canQuickCabinetBuilder ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canQuickCabinetBuilder
                ? "Default: 1200 W x 2100 H x 600 D mm, 1 divider, left open bay + right shelf bay. Generated boards remain individually editable."
                : "Wardrobe Builder is available in Editable mode."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canQuickCabinetBuilder,
                  onBuildCabinetBox,
                  {
                    builderType: "wardrobe",
                    width: wardrobeWidth,
                    height: wardrobeHeight,
                    depth: wardrobeDepth,
                    thickness: wardrobeThickness,
                    backThickness: wardrobeBackThickness,
                    plinthHeight: wardrobePlinthHeight,
                    plinthSetback: wardrobePlinthSetback,
                    shelfCount: wardrobeShelfCount,
                    dividerCount: wardrobeDividerCount,
                    shelfPlacement: wardrobeShelfPlacement,
                  },
                )}
                style={getBtnStyle(canQuickCabinetBuilder)}
              >
                Build Wardrobe
              </button>
            </div>
          </div>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Quick Cabinet Builder</div>
            <div style={sectionHintStyle}>
              Generate a cabinet box with sides, top, bottom, back, optional
              divider, and fixed shelves.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Width (mm)
                </span>
                <input
                  type="number"
                  min="200"
                  step="20"
                  value={cabinetWidth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetWidth(
                      Math.max(200, Number(e.target.value) || 1200),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Height (mm)
                </span>
                <input
                  type="number"
                  min="200"
                  step="20"
                  value={cabinetHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetHeight(
                      Math.max(200, Number(e.target.value) || 2000),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Depth (mm)
                </span>
                <input
                  type="number"
                  min="200"
                  step="20"
                  value={cabinetDepth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetDepth(
                      Math.max(200, Number(e.target.value) || 600),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Thickness (mm)
                </span>
                <input
                  type="number"
                  min="20"
                  step="20"
                  value={cabinetThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetThickness(
                      Math.max(20, Number(e.target.value) || 20),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Fixed Shelves
                </span>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="1"
                  value={cabinetShelfCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetShelfCount(
                      Math.max(0, Math.min(8, Number(e.target.value) || 0)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Center Divider
                </span>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 36,
                    padding: "0 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(71,85,105,.72)",
                    background: "rgba(11,20,36,.92)",
                    color: "#e5eefc",
                    fontSize: 12,
                    boxSizing: "border-box",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cabinetHasDivider}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => setCabinetHasDivider(e.target.checked)}
                  />
                  Include Divider
                </label>
              </label>
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canQuickCabinetBuilder,
                  onBuildCabinetBox,
                  {
                    width: cabinetWidth,
                    height: cabinetHeight,
                    depth: cabinetDepth,
                    thickness: cabinetThickness,
                    shelfCount: cabinetShelfCount,
                    withDivider: cabinetHasDivider,
                  },
                )}
                style={getBtnStyle(canQuickCabinetBuilder)}
              >
                Build Cabinet Box
              </button>
            </div>
          </div>


          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Shelf Layout</div>
            <div style={sectionHintStyle}>
              Rebuild fixed shelf levels inside the selected cabinet. Shelves
              are evenly spaced across the current bay/column layout. Existing
              generated fronts are cleared so opening geometry stays accurate.
            </div>

            <label
              style={{
                ...fieldStyle,
                display: "block",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 10, color: "#94a3b8" }}>
                Fixed Shelf Levels
              </span>
              <input
                type="number"
                min="0"
                max="8"
                step="1"
                value={shelfLayoutCount}
                disabled={!canShelfLayoutBuilder}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setShelfLayoutCount(
                    Math.max(0, Math.min(8, Number(e.target.value) || 0)),
                  )
                }
                style={actionInputStyle}
              />
            </label>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canShelfLayoutBuilder ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canShelfLayoutBuilder
                ? shelfLayoutCount > 0
                  ? `${shelfLayoutCount} shelf level${shelfLayoutCount !== 1 ? "s" : ""} will be distributed evenly in every current cabinet bay.`
                  : "Apply 0 levels to remove existing fixed shelves."
                : "Select an unlocked cabinet assembly or one of its parts first."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canShelfLayoutBuilder,
                  onBuildCabinetShelfLayout,
                  {
                    shelfCount: shelfLayoutCount,
                  },
                )}
                style={getBtnStyle(canShelfLayoutBuilder)}
              >
                Apply Shelf Layout
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>
              Interior Layout Presets
            </div>
            <div style={sectionHintStyle}>
              Rebuild the cabinet interior into real opening bays. This replaces
              generated dividers/shelves and clears generated fronts so new
              openings stay accurate.
            </div>

            <div style={{ ...S.smartActionsWideGrid, marginBottom: 8 }}>
              {[
                ["two-column", "2 Column Layout"],
                ["three-column", "3 Column Layout"],
              ].map(([presetKey, presetLabel]) => (
                <button
                  key={presetKey}
                  type="button"
                  onClick={makeHandler(true, setInteriorPreset, presetKey)}
                  style={{
                    ...getBtnStyle(true),
                    ...(interiorPreset === presetKey
                      ? {
                          border: "1px solid rgba(96,165,250,.75)",
                          background:
                            "linear-gradient(180deg, rgba(37,99,235,.30) 0%, rgba(29,78,216,.22) 100%)",
                          color: "#eef4ff",
                          boxShadow: "inset 0 0 0 1px rgba(147,197,253,.12)",
                        }
                      : {}),
                  }}
                >
                  {presetLabel}
                </button>
              ))}
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              {interiorPreset === "three-column"
                ? "Adds 2 vertical dividers and rebuilds fixed shelves per bay into 3 real cabinet columns."
                : "Adds 1 vertical divider and rebuilds fixed shelves per bay into 2 real cabinet columns."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canInteriorPresetBuilder,
                  onBuildCabinetInteriorPreset,
                  {
                    preset: interiorPreset,
                  },
                )}
                style={getBtnStyle(canInteriorPresetBuilder)}
              >
                Apply Interior Layout
              </button>
            </div>
          </div>


          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Door Builder</div>
            <div style={sectionHintStyle}>
              Add production-style cabinet doors to the whole opening, each
              cabinet bay, or each shelf opening. This builder manages doors
              only; drawer fronts are handled separately.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Door Layout
                </span>
                <select
                  value={doorLayoutMode}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setDoorLayoutMode(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="pair">Double Door Pair</option>
                  <option value="single">Single Door</option>
                </select>
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Apply To
                </span>
                <select
                  value={doorLayoutScope}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setDoorLayoutScope(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="whole">Whole Cabinet Opening</option>
                  <option value="bay">Each Cabinet Bay</option>
                  <option value="opening">Each Shelf Opening</option>
                </select>
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Reveal (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={doorReveal}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDoorReveal(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Center Gap (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={doorGap}
                  disabled={doorLayoutMode === "single"}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDoorGap(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={{
                    ...actionInputStyle,
                    opacity: doorLayoutMode === "single" ? 0.55 : 1,
                  }}
                />
              </label>
            </div>

            <label
              style={{
                ...fieldStyle,
                display: "block",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 10, color: "#94a3b8" }}>
                Door Thickness (mm)
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={doorThickness}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setDoorThickness(Math.max(1, Number(e.target.value) || 1))
                }
                style={actionInputStyle}
              />
            </label>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canDoorBuilder ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canDoorBuilder
                ? "Generated doors stay inside the selected cabinet assembly and receive PART ROLE: Door. Reapplying the same settings creates no extra history step."
                : "Select an unlocked cabinet/wardrobe assembly or one of its parts first."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canDoorBuilder,
                  onBuildCabinetDoorLayout,
                  {
                    doorMode: doorLayoutMode,
                    scope: doorLayoutScope,
                    reveal: doorReveal,
                    frontGap: doorGap,
                    frontThickness: doorThickness,
                  },
                )}
                style={getBtnStyle(canDoorBuilder)}
              >
                Apply Door Layout
              </button>
            </div>
          </div>


          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Drawer Builder</div>
            <div style={sectionHintStyle}>
              Build full production-style drawer assemblies inside the selected
              cabinet opening. Each drawer receives a front, left/right sides,
              back, bottom, handle, and left/right slide records.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Apply To
                </span>
                <select
                  value={drawerLayoutScope}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setDrawerLayoutScope(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="whole">Whole Cabinet Opening</option>
                  <option value="bay">Each Cabinet Bay</option>
                  <option value="opening">Each Shelf Opening</option>
                </select>
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Count
                </span>
                <input
                  type="number"
                  min="1"
                  max="8"
                  step="1"
                  value={drawerLayoutCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDrawerLayoutCount(
                      Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Depth (mm)
                </span>
                <input
                  type="number"
                  min="80"
                  step="1"
                  value={drawerLayoutDepth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDrawerLayoutDepth(Math.max(80, Number(e.target.value) || 80))
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Gap (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={drawerLayoutGap}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDrawerLayoutGap(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Left Slide Clearance (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={drawerLeftClearance}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDrawerLeftClearance(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Right Slide Clearance (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={drawerRightClearance}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDrawerRightClearance(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Bottom Clearance (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={drawerBottomClearance}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDrawerBottomClearance(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Front Overlay (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={drawerFrontOverlay}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDrawerFrontOverlay(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <label
              style={{
                ...fieldStyle,
                display: "block",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 10, color: "#94a3b8" }}>
                Drawer Front Thickness (mm)
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={drawerFrontThickness}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setDrawerFrontThickness(
                    Math.max(1, Number(e.target.value) || 1),
                  )
                }
                style={actionInputStyle}
              />
            </label>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canDrawerBuilder ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canDrawerBuilder
                ? "Full drawer boxes stay inside the selected cabinet. Reapplying identical settings creates no extra history step."
                : "Select an unlocked cabinet/wardrobe assembly or one of its parts first."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canDrawerBuilder,
                  onBuildCabinetDrawerLayout,
                  {
                    scope: drawerLayoutScope,
                    drawerCount: drawerLayoutCount,
                    drawerDepth: drawerLayoutDepth,
                    leftClearance: drawerLeftClearance,
                    rightClearance: drawerRightClearance,
                    bottomClearance: drawerBottomClearance,
                    frontOverlay: drawerFrontOverlay,
                    drawerGap: drawerLayoutGap,
                    frontThickness: drawerFrontThickness,
                  },
                )}
                style={getBtnStyle(canDrawerBuilder)}
              >
                Apply Drawer Layout
              </button>
            </div>
          </div>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Front Builder Presets</div>
            <div style={sectionHintStyle}>
              Select a cabinet box or any part inside that assembly, then
              generate ready-made front layouts for the whole opening or per
              cabinet bay.
            </div>

            <div style={{ ...S.smartActionsWideGrid, marginBottom: 8 }}>
              {[
                ["double-door", "Double Door"],
                ["drawer-stack", "Drawer Stack"],
                ["split-double-doors", "Split double doors"],
                ["left-doors-right-drawers", "Left doors / Right drawers"],
                ["top-drawers-bottom-doors", "Top drawers / Bottom doors"],
                ["single-bay-drawer-stack", "Single bay drawer stack"],
              ].map(([presetKey, presetLabel]) => (
                <button
                  key={presetKey}
                  type="button"
                  onClick={makeHandler(true, setFrontPreset, presetKey)}
                  style={{
                    ...getBtnStyle(true),
                    ...(frontPreset === presetKey
                      ? {
                          border: "1px solid rgba(96,165,250,.75)",
                          background:
                            "linear-gradient(180deg, rgba(37,99,235,.30) 0%, rgba(29,78,216,.22) 100%)",
                          color: "#eef4ff",
                          boxShadow: "inset 0 0 0 1px rgba(147,197,253,.12)",
                        }
                      : {}),
                  }}
                >
                  {presetLabel}
                </button>
              ))}
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              {frontPreset === "drawer-stack"
                ? "Stacked drawers across the full cabinet opening."
                : frontPreset === "split-double-doors"
                  ? "Opening-aware doors: each cabinet section gets its own left/right door pair."
                  : frontPreset === "left-doors-right-drawers"
                    ? "Column-aware mix: left-most cabinet bay gets doors, remaining bay/columns get drawer stacks."
                    : frontPreset === "top-drawers-bottom-doors"
                      ? "Row-aware mix: top row openings get drawer stacks, lower rows get door pairs."
                      : frontPreset === "single-bay-drawer-stack"
                        ? "Bay-aware mix: chosen opening index gets drawer stack, the rest get split doors."
                        : "Single full-height left/right door pair for the whole cabinet opening."}
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Reveal (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={frontReveal}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setFrontReveal(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Front Thickness (mm)
                </span>
                <input
                  type="number"
                  min="20"
                  step="20"
                  value={frontThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setFrontThickness(
                      Math.max(20, Number(e.target.value) || 20),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  {[
                    "drawer-stack",
                    "left-doors-right-drawers",
                    "top-drawers-bottom-doors",
                    "single-bay-drawer-stack",
                  ].includes(frontPreset)
                    ? "Drawer Gap (mm)"
                    : "Center Gap (mm)"}
                </span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={frontGap}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setFrontGap(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Count
                </span>
                <input
                  type="number"
                  min="2"
                  max="8"
                  step="1"
                  value={builderDrawerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderDrawerCount(
                      Math.max(2, Math.min(8, Number(e.target.value) || 3)),
                    )
                  }
                  disabled={
                    ![
                      "drawer-stack",
                      "left-doors-right-drawers",
                      "top-drawers-bottom-doors",
                      "single-bay-drawer-stack",
                    ].includes(frontPreset)
                  }
                  style={{
                    ...actionInputStyle,
                    opacity: [
                      "drawer-stack",
                      "left-doors-right-drawers",
                      "top-drawers-bottom-doors",
                      "single-bay-drawer-stack",
                    ].includes(frontPreset)
                      ? 1
                      : 0.55,
                  }}
                />
              </label>
            </div>

            {frontPreset === "single-bay-drawer-stack" ? (
              <div style={S.smartActionsFieldsRow}>
                <label
                  style={{
                    ...fieldStyle,
                    gridColumn: "1 / span 2",
                  }}
                >
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>
                    Target Bay Index
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={frontTargetBayIndex}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setFrontTargetBayIndex(
                        Math.max(1, Number(e.target.value) || 1),
                      )
                    }
                    style={actionInputStyle}
                  />
                </label>
              </div>
            ) : null}

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canFrontPresetBuilder,
                  onBuildCabinetFrontPreset,
                  {
                    preset: frontPreset,
                    reveal: frontReveal,
                    frontGap,
                    frontThickness,
                    drawerCount: builderDrawerCount,
                    targetBayIndex: frontTargetBayIndex,
                  },
                )}
                style={getBtnStyle(canFrontPresetBuilder)}
              >
                Apply Front Preset
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Custom Per-Bay Fronts</div>
            <div style={sectionHintStyle}>
              Column-based front assignment for real cabinet bays. Bay count is
              auto-detected from the cabinet layout; extra bay settings are
              ignored when not needed.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Bay 1</span>
                <select
                  value={bay1FrontType}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setBay1FrontType(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="door">Door Pair</option>
                  <option value="drawer">Drawer Stack</option>
                  <option value="open">Open</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Bay 2</span>
                <select
                  value={bay2FrontType}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setBay2FrontType(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="door">Door Pair</option>
                  <option value="drawer">Drawer Stack</option>
                  <option value="open">Open</option>
                </select>
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Bay 3</span>
                <select
                  value={bay3FrontType}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setBay3FrontType(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="door">Door Pair</option>
                  <option value="drawer">Drawer Stack</option>
                  <option value="open">Open</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Count
                </span>
                <input
                  type="number"
                  min="2"
                  max="8"
                  step="1"
                  value={builderDrawerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderDrawerCount(
                      Math.max(2, Math.min(8, Number(e.target.value) || 3)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              Bay 1:{" "}
              {bay1FrontType === "open"
                ? "Open"
                : bay1FrontType === "drawer"
                  ? "Drawer Stack"
                  : "Door Pair"}{" "}
              | Bay 2:{" "}
              {bay2FrontType === "open"
                ? "Open"
                : bay2FrontType === "drawer"
                  ? "Drawer Stack"
                  : "Door Pair"}{" "}
              | Bay 3:{" "}
              {bay3FrontType === "open"
                ? "Open"
                : bay3FrontType === "drawer"
                  ? "Drawer Stack"
                  : "Door Pair"}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canCustomBayFrontBuilder,
                  onBuildCabinetCustomBayFronts,
                  {
                    reveal: frontReveal,
                    frontGap,
                    frontThickness,
                    drawerCount: builderDrawerCount,
                    bay1Type: bay1FrontType,
                    bay2Type: bay2FrontType,
                    bay3Type: bay3FrontType,
                    assignments: [bay1FrontType, bay2FrontType, bay3FrontType],
                  },
                )}
                style={getBtnStyle(canCustomBayFrontBuilder)}
              >
                Apply Custom Fronts
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>
              Custom Per-Opening Fronts
            </div>
            <div style={sectionHintStyle}>
              Per-cell front assignment for real cabinet openings. Order is
              auto-read as top-left to bottom-right. Unused extra cells are
              ignored.
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              Cell order: 1 2 3 on the top row, then 4 5 6, then 7 8 9.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 6,
                marginBottom: 8,
              }}
            >
              {cellFrontAssignments.map((cellType, index) => (
                <label key={`cell-front-${index + 1}`} style={fieldStyle}>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>
                    Cell {index + 1}
                  </span>
                  <select
                    value={cellType}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setCellFrontAssignments((prev) => {
                        const next = [...prev];
                        next[index] = e.target.value;
                        return next;
                      })
                    }
                    style={actionInputStyle}
                  >
                    <option value="door">Door Pair</option>
                    <option value="drawer">Drawer Stack</option>
                    <option value="open">Open</option>
                  </select>
                </label>
              ))}
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Count
                </span>
                <input
                  type="number"
                  min="2"
                  max="8"
                  step="1"
                  value={builderDrawerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderDrawerCount(
                      Math.max(2, Math.min(8, Number(e.target.value) || 3)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <div style={fieldStyle} />
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              {cellFrontAssignments
                .map(
                  (cellType, index) =>
                    `Cell ${index + 1}: ${cellType === "open" ? "Open" : cellType === "drawer" ? "Drawer Stack" : "Door Pair"}`,
                )
                .join(" | ")}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canCustomCellFrontBuilder,
                  onBuildCabinetCustomCellFronts,
                  {
                    reveal: frontReveal,
                    frontGap,
                    frontThickness,
                    drawerCount: builderDrawerCount,
                    assignments: cellFrontAssignments,
                    cell1Type: cellFrontAssignments[0],
                    cell2Type: cellFrontAssignments[1],
                    cell3Type: cellFrontAssignments[2],
                    cell4Type: cellFrontAssignments[3],
                    cell5Type: cellFrontAssignments[4],
                    cell6Type: cellFrontAssignments[5],
                    cell7Type: cellFrontAssignments[6],
                    cell8Type: cellFrontAssignments[7],
                    cell9Type: cellFrontAssignments[8],
                  },
                )}
                style={getBtnStyle(canCustomCellFrontBuilder)}
              >
                Apply Opening Fronts
              </button>
            </div>
          </div>


          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>
              Furniture Leg Layout
            </div>
            <div style={sectionHintStyle}>
              Select a table/furniture assembly or one of its parts. This creates
              four corner legs when none exist, or repositions the assembly's
              existing four leg parts without duplicating them.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Inset from Edge (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={builderInset}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderInset(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Leg Size (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={builderLegSize}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderLegSize(Math.max(1, Number(e.target.value) || 50))
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canFurnitureLegLayout ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canFurnitureLegLayout
                ? "Uses the selected assembly tabletop/body footprint. Existing four legs are rebuilt in place; zero-leg assemblies receive four new legs."
                : "Select an unlocked table/furniture assembly or one of its parts first."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canFurnitureLegLayout,
                  onAutoLegLayout,
                  builderInset,
                  builderLegSize,
                )}
                style={getBtnStyle(canFurnitureLegLayout)}
              >
                Apply 4-Leg Layout
              </button>
            </div>
          </div>


          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>
              Apron / Rail Layout
            </div>
            <div style={sectionHintStyle}>
              Build four structural table aprons from the current four-leg
              layout. Existing apron/rail parts are reused; missing directions
              are created without duplicating the assembly.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Apron Inset (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={builderApronInset}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderApronInset(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Apron Height (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={builderApronHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderApronHeight(
                      Math.max(1, Number(e.target.value) || 70),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Apron Thickness (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={builderApronThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderApronThickness(
                      Math.max(1, Number(e.target.value) || 22),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <div style={fieldStyle} />
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: canFurnitureApronLayout ? "#93c5fd" : "#fcd34d",
                lineHeight: 1.5,
              }}
            >
              {canFurnitureApronLayout
                ? "Requires exactly 4 legs. Front/rear aprons span between left/right legs; side aprons span between front/back legs. Inset recesses the rails inside the leg faces."
                : "Select an unlocked table/furniture assembly or one of its parts first."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canFurnitureApronLayout,
                  onAutoApronRailLayout,
                  builderApronInset,
                  builderApronHeight,
                  builderApronThickness,
                )}
                style={getBtnStyle(canFurnitureApronLayout)}
              >
                Apply 4-Apron Layout
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Builder Helpers</div>
            <div style={sectionHintStyle}>
              Selection-based helpers for shelves, legs, fronts, panels, doors,
              drawers, and interior fitting.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Inset (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={builderInset}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderInset(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Count
                </span>
                <input
                  type="number"
                  min="2"
                  max="8"
                  step="1"
                  value={builderDrawerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderDrawerCount(
                      Math.max(2, Math.min(8, Number(e.target.value) || 3)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onAutoShelfStack,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Auto Shelf Stack
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canStrictMultiBuilderHelpers,
                  onInsideFitSelection,
                  builderInset,
                )}
                style={getBtnStyle(canStrictMultiBuilderHelpers)}
              >
                Inside Fit
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onPanelPairSelection,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Panel Pair
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onFrontPairSelection,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Front Pair
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onDoorSplitSelection,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Door Split
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onDrawerStackSelection,
                  builderInset,
                  builderDrawerCount,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Drawer Stack
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onFaceFitSelection,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Face Fit
              </button>

            </div>
          </div>
        </>
      ) : null}

      {activeToolTab === "duplicate" ? (
        <>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Mirror Duplicate</div>
            <div style={sectionHintStyle}>
              Create mirrored copies of the current selection along X or Z.
            </div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(canMirror, onMirrorDuplicate, "x")}
                style={getBtnStyle(canMirror, true)}
              >
                Mirror X
              </button>
              <button
                type="button"
                onClick={makeHandler(canMirror, onMirrorDuplicate, "z")}
                style={getBtnStyle(canMirror, true)}
              >
                Mirror Z
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Assembly</div>
            <div style={sectionHintStyle}>
              Select a full grouped assembly or duplicate the entire assembly in
              one click.
            </div>
            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(canAssemblyActions, onSelectAssembly)}
                style={getBtnStyle(canAssemblyActions)}
              >
                Whole Select
              </button>
              <button
                type="button"
                onClick={makeHandler(canAssemblyActions, onDuplicateAssembly)}
                style={getBtnStyle(canAssemblyActions, true)}
              >
                Whole Duplicate
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Repeat / Array</div>
            <div style={sectionHintStyle}>
              Create repeated copies of the current object or assembly using
              count and spacing.
            </div>
            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Copies</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={arrayCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setArrayCount(
                      Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Spacing (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={arraySpacing}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setArraySpacing(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canAssemblyActions,
                  onArrayDuplicate,
                  "x",
                  arrayCount,
                  arraySpacing,
                )}
                style={getBtnStyle(canAssemblyActions)}
              >
                Array X
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canAssemblyActions,
                  onArrayDuplicate,
                  "y",
                  arrayCount,
                  arraySpacing,
                )}
                style={getBtnStyle(canAssemblyActions)}
              >
                Array Y
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canAssemblyActions,
                  onArrayDuplicate,
                  "z",
                  arrayCount,
                  arraySpacing,
                )}
                style={getBtnStyle(canAssemblyActions)}
              >
                Array Z
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
