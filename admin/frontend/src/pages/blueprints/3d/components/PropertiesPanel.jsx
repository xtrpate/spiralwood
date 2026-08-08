import React, { useEffect, useState } from "react";
import { WOOD_FINISHES } from "../../data/furnitureTypes";
import { applyWoodFinish, isWoodLikeMaterial } from "../../data/componentUtils";
import {
  MATERIAL_SUGGESTIONS,
  GRAIN_DIRECTION_OPTIONS,
  EDGE_TREATMENT_OPTIONS,
  EDGE_KEYS,
} from "../../data/productionMetadata";
import {
  HARDWARE_TYPE_OPTIONS,
  createHardwareRequirement,
  getHardwareTypeLabel,
} from "../../data/hardwareMetadata";
import { displayToMm, formatDim, formatDims, mmToDisplay } from "../../data/utils";
import S from "../../styles/blueprintStyles";
import { VIEWER_UI } from "../viewerUi";

export function PropertiesPanel({
  selectedComp: committedSelectedComp,
  liveSelectedComp = null,
  selectedIds = [],
  selectionSummary = null,
  isLocked,
  onChange,
  onResizeDimension = null,
  resizeAnchors = {
    width: "center",
    height: "center",
    depth: "center",
  },
  onResizeAnchorChange = null,
  unit,
  editorMode,
  activeInspectorTab = "properties",
  onChangeInspectorTab,
  renderSmartBuild = null,
}) {
  const selectedComp = liveSelectedComp || committedSelectedComp;
  const hasSmartBuild = Boolean(renderSmartBuild);

  const [hardwareDraftType, setHardwareDraftType] =
    useState("concealed_hinge");
  const [hardwareDraftName, setHardwareDraftName] = useState("");
  const [hardwareDraftQuantity, setHardwareDraftQuantity] = useState(1);
  const [hardwareDraftNote, setHardwareDraftNote] = useState("");

  useEffect(() => {
    setHardwareDraftType("concealed_hinge");
    setHardwareDraftName("");
    setHardwareDraftQuantity(1);
    setHardwareDraftNote("");
  }, [selectedComp?.id]);

  if (!selectedComp && !hasSmartBuild && !selectionSummary) return null;

  const handleNumericChange = (key) => (e) => {
    if (!selectedComp) return;

    const nextValue = displayToMm(e.target.value, unit);

    if (
      ["width", "height", "depth"].includes(key) &&
      typeof onResizeDimension === "function"
    ) {
      onResizeDimension(selectedComp.id, key, nextValue);
      return;
    }

    onChange(selectedComp.id, {
      [key]: nextValue,
    });
  };

  const applyStyleChange = (attrs) => {
    if (!selectedComp) return;
    onChange(selectedComp.id, attrs, {
      applyToSelection: selectedIds.length > 1,
    });
  };

  const applySelectionChange = (attrs) => {
    if (!selectedComp) return;
    onChange(selectedComp.id, attrs, {
      applyToSelection: selectedIds.length > 1,
    });
  };

  const getHardwareRequirements = () =>
    Array.isArray(selectedComp?.hardwareRequirements)
      ? selectedComp.hardwareRequirements
      : [];

  const updateHardwareRequirement = (hardwareId, attrs) => {
    if (!selectedComp) return;

    const nextRequirements = getHardwareRequirements().map((item) =>
      item.id === hardwareId ? { ...item, ...attrs } : item,
    );

    onChange(selectedComp.id, {
      hardwareRequirements: nextRequirements,
    });
  };

  const removeHardwareRequirement = (hardwareId) => {
    if (!selectedComp) return;

    onChange(selectedComp.id, {
      hardwareRequirements: getHardwareRequirements().filter(
        (item) => item.id !== hardwareId,
      ),
    });
  };

  const addHardwareRequirement = () => {
    if (!selectedComp) return;

    const requirement = createHardwareRequirement({
      type: hardwareDraftType,
      name: hardwareDraftName,
      quantity: hardwareDraftQuantity,
      installationNote: hardwareDraftNote,
    });

    onChange(selectedComp.id, {
      hardwareRequirements: [
        ...getHardwareRequirements(),
        requirement,
      ],
    });

    setHardwareDraftName("");
    setHardwareDraftQuantity(1);
    setHardwareDraftNote("");
  };

  const unitLabel = unit === "inch" ? "in" : "mm";

  const isRoundedBox = selectedComp?.type === "rounded_box";
  const boxWallMax = selectedComp
    ? Math.max(
        20,
        Math.floor(Math.min(selectedComp.width, selectedComp.depth) / 2) - 10,
      )
    : 20;

  const boxBottomMax = selectedComp
    ? Math.max(20, Math.floor(selectedComp.height) - 20)
    : 20;

  const faceLabels = {
    top: "Top",
    bottom: "Bottom",
    front: "Front",
    back: "Back",
    left: "Left",
    right: "Right",
  };

  const selectedFace = isRoundedBox
    ? selectedComp.selectedFace || "top"
    : "top";

  const selectedFaceCap = `${selectedFace.charAt(0).toUpperCase()}${selectedFace.slice(1)}`;

  const selectedFaceField = `faceOpen${selectedFaceCap}`;
  const selectedFaceInsetField = `faceInset${selectedFaceCap}`;
  const selectedFaceExtrudeField = `faceExtrude${selectedFaceCap}`;

  const selectedFaceIsOpen = !!selectedComp?.[selectedFaceField];
  const selectedFaceInset = Number(selectedComp?.[selectedFaceInsetField]) || 0;
  const selectedFaceExtrude =
    Number(selectedComp?.[selectedFaceExtrudeField]) || 0;

  const selectedFaceInsetMax = !selectedComp
    ? 0
    : selectedFace === "top" || selectedFace === "bottom"
      ? Math.max(
          0,
          Math.floor(Math.min(selectedComp.width, selectedComp.depth) / 2) - 20,
        )
      : selectedFace === "front" || selectedFace === "back"
        ? Math.max(
            0,
            Math.floor(Math.min(selectedComp.width, selectedComp.height) / 2) -
              20,
          )
        : Math.max(
            0,
            Math.floor(Math.min(selectedComp.depth, selectedComp.height) / 2) -
              20,
          );

  const selectedFaceExtrudeMax = !selectedComp
    ? 0
    : selectedFace === "top" || selectedFace === "bottom"
      ? Math.max(0, Math.floor(selectedComp.height) - 20)
      : selectedFace === "front" || selectedFace === "back"
        ? Math.max(0, Math.floor(selectedComp.depth) - 20)
        : Math.max(0, Math.floor(selectedComp.width) - 20);

  const roundedBoxHasAnyOpenFace = selectedComp
    ? [
        selectedComp.faceOpenTop,
        selectedComp.faceOpenBottom,
        selectedComp.faceOpenFront,
        selectedComp.faceOpenBack,
        selectedComp.faceOpenLeft,
        selectedComp.faceOpenRight,
      ].some(Boolean)
    : false;

  const roundedBoxHasAnyFaceEdit = selectedComp
    ? [
        selectedComp.faceInsetTop,
        selectedComp.faceInsetBottom,
        selectedComp.faceInsetFront,
        selectedComp.faceInsetBack,
        selectedComp.faceInsetLeft,
        selectedComp.faceInsetRight,
        selectedComp.faceExtrudeTop,
        selectedComp.faceExtrudeBottom,
        selectedComp.faceExtrudeFront,
        selectedComp.faceExtrudeBack,
        selectedComp.faceExtrudeLeft,
        selectedComp.faceExtrudeRight,
      ].some((value) => Number(value) > 0)
    : false;

  const applyRoundedBoxSingleChange = (attrs) => {
    if (!selectedComp) return;
    onChange(selectedComp.id, attrs);
  };

  const clearAllRoundedBoxFaces = {
    faceOpenTop: false,
    faceOpenBottom: false,
    faceOpenFront: false,
    faceOpenBack: false,
    faceOpenLeft: false,
    faceOpenRight: false,
  };

  const clearAllRoundedBoxFaceEdits = {
    faceInsetTop: 0,
    faceInsetBottom: 0,
    faceInsetFront: 0,
    faceInsetBack: 0,
    faceInsetLeft: 0,
    faceInsetRight: 0,
    faceExtrudeTop: 0,
    faceExtrudeBottom: 0,
    faceExtrudeFront: 0,
    faceExtrudeBack: 0,
    faceExtrudeLeft: 0,
    faceExtrudeRight: 0,
  };

  const showPropertiesTab =
    activeInspectorTab === "properties" || !hasSmartBuild;

  const showSmartBuildTab =
    activeInspectorTab === "smartbuild" && hasSmartBuild;

  const inputStyle = {
    ...S.floatingInput,
    ...VIEWER_UI.fullWidthInput,
  };

  const infoCardStyle = {
    ...S.infoCard,
    ...VIEWER_UI.compactInfoCard,
  };

  const colorInputStyle = {
    ...inputStyle,
    padding: 2,
    height: 36,
  };

  const inspectorSectionStyle = {
    marginBottom: 10,
    padding: 10,
    border: "1px solid rgba(71,85,105,.58)",
    borderLeft: "2px solid rgba(96,165,250,.28)",
    borderRadius: 2,
    background: "#091321",
    boxSizing: "border-box",
  };

  const inspectorSectionTitleStyle = {
    marginBottom: 8,
    fontSize: 10,
    fontWeight: 850,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#b9c8db",
  };

  const inspectorFieldGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  };

  const inspectorUnitInputWrapStyle = {
    position: "relative",
    minWidth: 0,
  };

  const inspectorUnitSuffixStyle = {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    color: "#64748b",
    fontSize: 9,
    fontWeight: 700,
    pointerEvents: "none",
  };

  return (
    <div style={VIEWER_UI.inspectorDockedPanel}>
      <div style={VIEWER_UI.inspectorTabsRow}>
        <button
          type="button"
          onClick={() => onChangeInspectorTab?.("properties")}
          style={{
            ...VIEWER_UI.inspectorTabBtn,
            ...(showPropertiesTab ? VIEWER_UI.inspectorTabBtnActive : {}),
          }}
        >
          Properties
        </button>

        <button
          type="button"
          onClick={() => onChangeInspectorTab?.("smartbuild")}
          style={{
            ...VIEWER_UI.inspectorTabBtn,
            ...(showSmartBuildTab ? VIEWER_UI.inspectorTabBtnActive : {}),
          }}
        >
          Tools
        </button>
      </div>

      <div style={VIEWER_UI.inspectorTabBody}>
        {showSmartBuildTab ? (
          renderSmartBuild
        ) : selectionSummary?.partCount > 1 ? (
          <>
            <div
              style={{
                ...inspectorSectionStyle,
                padding: 12,
                background:
                  "linear-gradient(180deg, rgba(17,31,53,.92) 0%, rgba(11,20,36,.92) 100%)",
                borderColor: "rgba(89,112,143,.72)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "#f3f7ff",
                      fontSize: 13,
                      fontWeight: 800,
                      lineHeight: 1.35,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={selectionSummary.name}
                  >
                    {selectionSummary.name || "Selected Objects"}
                  </div>
                  <div style={{ marginTop: 3, color: "#91a4bf", fontSize: 10 }}>
                    {String(selectionSummary.type || "selection")
                      .replace(/^template_/, "")
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (char) => char.toUpperCase())}
                    {" - "}
                    {selectionSummary.partCount} parts
                  </div>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    minHeight: 22,
                    padding: "0 8px",
                    display: "inline-flex",
                    alignItems: "center",
                    border: "1px solid rgba(96,165,250,.34)",
                    borderRadius: 999,
                    background: "rgba(37,99,235,.14)",
                    color: "#bfdbfe",
                    fontSize: 9,
                    fontWeight: 800,
                  }}
                >
                  {selectionSummary.kind === "assembly" ? "ASSEMBLY" : "MULTI"}
                </span>
              </div>
              <div
                style={{
                  marginTop: 9,
                  paddingTop: 8,
                  borderTop: "1px solid rgba(71,85,105,.52)",
                  color: "#93a8c4",
                  fontSize: 9,
                  lineHeight: 1.45,
                }}
              >
                Overall measurements are read-only. Use Tools &gt; Resize for
                supported controlled assembly resizing.
              </div>
            </div>

            <div style={inspectorSectionStyle}>
              <div style={inspectorSectionTitleStyle}>Overall Measurements</div>
              <div style={inspectorFieldGridStyle}>
                {[
                  ["Width", selectionSummary.bounds?.width],
                  ["Height", selectionSummary.bounds?.height],
                  ["Depth", selectionSummary.bounds?.depth],
                ].map(([label, value]) => (
                  <div key={label} style={{ minWidth: 0 }}>
                    <label style={S.floatingLabel}>{label}</label>
                    <div
                      style={{
                        minHeight: 34,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 9px",
                        border: "1px solid rgba(71,85,105,.62)",
                        borderRadius: 0,
                        background: "rgba(15,23,42,.62)",
                        color: "#dbeafe",
                        fontSize: 10,
                        fontWeight: 800,
                        boxSizing: "border-box",
                      }}
                    >
                      {formatDim(Number(value) || 0, unit)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={inspectorSectionStyle}>
              <div style={inspectorSectionTitleStyle}>Selection</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                <div style={infoCardStyle}>
                  <div style={S.floatingLabel}>Parts</div>
                  <div style={{ marginTop: 4, color: "#e5eefc", fontSize: 12, fontWeight: 800 }}>
                    {selectionSummary.partCount}
                  </div>
                </div>
                <div style={infoCardStyle}>
                  <div style={S.floatingLabel}>Locked</div>
                  <div
                    style={{
                      marginTop: 4,
                      color: selectionSummary.lockedCount > 0 ? "#fca5a5" : "#e5eefc",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {selectionSummary.lockedCount || 0}
                  </div>
                </div>
              </div>
              <div style={{ ...infoCardStyle, marginTop: 8 }}>
                <div style={S.floatingLabel}>Material</div>
                <div
                  style={{
                    marginTop: 4,
                    color: "#c8d5e8",
                    fontSize: 10,
                    lineHeight: 1.45,
                    wordBreak: "break-word",
                  }}
                >
                  {selectionSummary.materialText || "No material assigned"}
                </div>
              </div>
            </div>
          </>
        ) : selectedComp ? (
          <>
            <div
              style={{
                ...inspectorSectionStyle,
                padding: 12,
                background:
                  "linear-gradient(180deg, rgba(17,31,53,.92) 0%, rgba(11,20,36,.92) 100%)",
                borderColor: "rgba(89,112,143,.72)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "#f3f7ff",
                      fontSize: 13,
                      fontWeight: 800,
                      lineHeight: 1.35,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={selectedComp.label}
                  >
                    {selectedComp.label || "Selected Object"}
                  </div>

                  <div
                    style={{
                      marginTop: 3,
                      color: "#91a4bf",
                      fontSize: 10,
                      lineHeight: 1.45,
                    }}
                  >
                    {selectedComp.material || "No material assigned"}
                  </div>
                </div>

                <span
                  style={{
                    flexShrink: 0,
                    minHeight: 22,
                    padding: "0 8px",
                    display: "inline-flex",
                    alignItems: "center",
                    border: "1px solid rgba(96,165,250,.34)",
                    borderRadius: 999,
                    background: "rgba(37,99,235,.14)",
                    color: "#bfdbfe",
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: ".04em",
                  }}
                >
                  {editorMode !== "editable" || isLocked(selectedComp)
                    ? "LOCKED"
                    : "EDITABLE"}
                </span>
              </div>

              {selectedComp.partCode ? (
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid rgba(71,85,105,.52)",
                    color: "#93a8c4",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: ".08em",
                  }}
                >
                  PART CODE | {selectedComp.partCode}
                </div>
              ) : null}

              {selectedComp.partRole ? (
                <div
                  style={{
                    marginTop: selectedComp.partCode ? 5 : 8,
                    paddingTop: selectedComp.partCode ? 0 : 8,
                    borderTop: selectedComp.partCode
                      ? "none"
                      : "1px solid rgba(71,85,105,.52)",
                    color: "#93a8c4",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: ".08em",
                  }}
                >
                  ROLE |{" "}
                  {String(selectedComp.partRole)
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (char) => char.toUpperCase())}
                </div>
              ) : null}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 4,
                  marginTop: 9,
                  color: "#c8d5e8",
                  fontSize: 10,
                  lineHeight: 1.5,
                }}
              >
                <div>
                  Size ·{" "}
                  {formatDims(
                    selectedComp.width,
                    selectedComp.height,
                    selectedComp.depth,
                    unit,
                  )}
                </div>
                <div>
                  Position · X {formatDim(selectedComp.x, unit)} · Y{" "}
                  {formatDim(selectedComp.y, unit)} · Z{" "}
                  {formatDim(selectedComp.z, unit)}
                </div>
                <div>Rotation · {selectedComp.rotationY || 0}°</div>
              </div>
            </div>

            <div style={inspectorSectionStyle}>
              <div style={inspectorSectionTitleStyle}>Size</div>
              <div style={inspectorFieldGridStyle}>
                {[
                  ["Width", "width"],
                  ["Height", "height"],
                  ["Depth", "depth"],
                ].map(([label, key]) => (
                  <div key={key} style={{ minWidth: 0 }}>
                    <label style={S.floatingLabel}>{label}</label>
                    <div style={inspectorUnitInputWrapStyle}>
                      <input
                        type="number"
                        step={unit === "inch" ? "0.01" : "1"}
                        value={mmToDisplay(selectedComp[key] ?? 0, unit)}
                        disabled={
                          editorMode !== "editable" || isLocked(selectedComp)
                        }
                        onChange={handleNumericChange(key)}
                        style={{ ...inputStyle, paddingRight: 30 }}
                      />
                      <span style={inspectorUnitSuffixStyle}>{unitLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={inspectorSectionStyle}>
              <div style={inspectorSectionTitleStyle}>Resize From</div>
              <div
                style={{
                  marginBottom: 9,
                  color: "#7f93ad",
                  fontSize: 9,
                  lineHeight: 1.45,
                }}
              >
                Choose the side that moves when you change the size.
              </div>

              {[
                {
                  key: "width",
                  label: "Width",
                  options: [
                    ["right", "Left"],
                    ["center", "Center"],
                    ["left", "Right"],
                  ],
                },
                {
                  key: "height",
                  label: "Height",
                  options: [
                    ["top", "Bottom"],
                    ["center", "Center"],
                    ["bottom", "Top"],
                  ],
                },
                {
                  key: "depth",
                  label: "Depth",
                  options: [
                    ["front", "Front"],
                    ["center", "Center"],
                    ["back", "Back"],
                  ],
                },
              ].map((group) => (
                <div
                  key={group.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "52px minmax(0, 1fr)",
                    alignItems: "center",
                    gap: 8,
                    marginTop: group.key === "width" ? 0 : 8,
                  }}
                >
                  <div
                    style={{
                      color: "#9fb1c9",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  >
                    {group.label}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 5,
                    }}
                  >
                    {group.options.map(([value, label]) => {
                      const isActive = resizeAnchors?.[group.key] === value;
                      const disabled =
                        editorMode !== "editable" || isLocked(selectedComp);

                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            onResizeAnchorChange?.(group.key, value)
                          }
                          style={{
                            minHeight: 28,
                            padding: "4px 5px",
                            border: isActive
                              ? "1px solid rgba(96,165,250,.9)"
                              : "1px solid rgba(71,85,105,.72)",
                            borderRadius: 0,
                            background: isActive
                              ? "rgba(37,99,235,.24)"
                              : "rgba(15,23,42,.55)",
                            color: isActive ? "#dbeafe" : "#94a3b8",
                            fontSize: 8,
                            fontWeight: 800,
                            cursor: disabled ? "not-allowed" : "pointer",
                            opacity: disabled ? 0.45 : 1,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={inspectorSectionStyle}>
              <div style={inspectorSectionTitleStyle}>Position</div>
              <div style={inspectorFieldGridStyle}>
                {[
                  ["X", "x"],
                  ["Y", "y"],
                  ["Z", "z"],
                ].map(([label, key]) => (
                  <div key={key} style={{ minWidth: 0 }}>
                    <label style={S.floatingLabel}>{label}</label>
                    <div style={inspectorUnitInputWrapStyle}>
                      <input
                        type="number"
                        step={unit === "inch" ? "0.01" : "1"}
                        value={mmToDisplay(selectedComp[key] ?? 0, unit)}
                        disabled={
                          editorMode !== "editable" || isLocked(selectedComp)
                        }
                        onChange={handleNumericChange(key)}
                        style={{ ...inputStyle, paddingRight: 30 }}
                      />
                      <span style={inspectorUnitSuffixStyle}>{unitLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={inspectorSectionTitleStyle}>Geometry</div>

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>
                Corner Radius (mm) — current: {selectedComp.cornerRadius ?? 0}mm
              </label>
              <input
                type="range"
                min="0"
                max="500"
                step="5"
                value={selectedComp.cornerRadius ?? 0}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  applySelectionChange({
                    cornerRadius: Number(e.target.value),
                  })
                }
                style={{ width: "100%", accentColor: "#3b82f6" }}
              />
              <input
                type="number"
                min="0"
                max="500"
                step="5"
                value={selectedComp.cornerRadius ?? 0}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  applySelectionChange({
                    cornerRadius: Math.max(
                      0,
                      Math.min(500, Number(e.target.value) || 0),
                    ),
                  })
                }
                style={inputStyle}
              />
            </div>

            {isRoundedBox && (
              <>
                <div style={infoCardStyle}>
                  <div>
                    <b>Box Face Edit</b>
                  </div>
                  <div>
                    Click a visible face in 3D, or use the face buttons below.
                  </div>
                  <div>Shortcuts: G Move · R Rotate · T Scale</div>
                  <div>
                    1-6 Select Face · O Open/Close Face · H Toggle Shell
                  </div>
                  <div>J/K Inset · N/M Extrude · [ / ] Wall</div>
                  <div>Shift + [ / ] Bottom · Alt + [ / ] Radius</div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label
                    style={{
                      ...S.floatingLabel,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor:
                        editorMode === "editable" && !isLocked(selectedComp)
                          ? "pointer"
                          : "not-allowed",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        !!selectedComp.isHollow ||
                        roundedBoxHasAnyOpenFace ||
                        roundedBoxHasAnyFaceEdit
                      }
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          applyRoundedBoxSingleChange({
                            isHollow: true,
                          });
                        } else {
                          applyRoundedBoxSingleChange({
                            isHollow: false,
                            ...clearAllRoundedBoxFaces,
                            ...clearAllRoundedBoxFaceEdits,
                          });
                        }
                      }}
                    />
                    Hollow / Shell
                  </label>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={S.floatingLabel}>Selected Face</label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 6,
                      marginBottom: 8,
                    }}
                  >
                    {["top", "front", "right", "back", "left", "bottom"].map(
                      (faceKey) => {
                        const isActive = selectedFace === faceKey;

                        return (
                          <button
                            key={faceKey}
                            type="button"
                            disabled={
                              editorMode !== "editable" ||
                              isLocked(selectedComp)
                            }
                            onClick={() =>
                              applyRoundedBoxSingleChange({
                                selectedFace: faceKey,
                              })
                            }
                            style={{
                              ...S.libraryTabBtn,
                              ...(isActive ? S.libraryTabBtnActive : {}),
                              opacity:
                                editorMode !== "editable" ||
                                isLocked(selectedComp)
                                  ? 0.55
                                  : 1,
                            }}
                          >
                            {faceLabels[faceKey]}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div style={infoCardStyle}>
                    <div>
                      <b>{faceLabels[selectedFace]}</b>
                    </div>
                    <div>Status: {selectedFaceIsOpen ? "Open" : "Closed"}</div>
                    <div>Inset: {selectedFaceInset}mm</div>
                    <div>Extrude: {selectedFaceExtrude}mm</div>
                  </div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label
                    style={{
                      ...S.floatingLabel,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor:
                        editorMode === "editable" && !isLocked(selectedComp)
                          ? "pointer"
                          : "not-allowed",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFaceIsOpen}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        applyRoundedBoxSingleChange({
                          isHollow: true,
                          [selectedFaceField]: e.target.checked,
                        })
                      }
                    />
                    Open Selected Face
                  </label>
                </div>

                <div style={{ marginBottom: 6 }}>
                  <label style={S.floatingLabel}>
                    Inset Selected Face (mm) — current: {selectedFaceInset}mm
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={selectedFaceInsetMax}
                    step="5"
                    value={selectedFaceInset}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        isHollow: true,
                        [selectedFaceInsetField]: Math.max(
                          0,
                          Math.min(
                            selectedFaceInsetMax,
                            Number(e.target.value) || 0,
                          ),
                        ),
                      })
                    }
                    style={{ width: "100%", accentColor: "#a78bfa" }}
                  />
                  <input
                    type="number"
                    min="0"
                    max={selectedFaceInsetMax}
                    step="5"
                    value={selectedFaceInset}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        isHollow: true,
                        [selectedFaceInsetField]: Math.max(
                          0,
                          Math.min(
                            selectedFaceInsetMax,
                            Number(e.target.value) || 0,
                          ),
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 6 }}>
                  <label style={S.floatingLabel}>
                    Extrude Selected Face Inward (mm) — current:{" "}
                    {selectedFaceExtrude}mm
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={selectedFaceExtrudeMax}
                    step="5"
                    value={selectedFaceExtrude}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        isHollow: true,
                        [selectedFaceExtrudeField]: Math.max(
                          0,
                          Math.min(
                            selectedFaceExtrudeMax,
                            Number(e.target.value) || 0,
                          ),
                        ),
                      })
                    }
                    style={{ width: "100%", accentColor: "#f59e0b" }}
                  />
                  <input
                    type="number"
                    min="0"
                    max={selectedFaceExtrudeMax}
                    step="5"
                    value={selectedFaceExtrude}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        isHollow: true,
                        [selectedFaceExtrudeField]: Math.max(
                          0,
                          Math.min(
                            selectedFaceExtrudeMax,
                            Number(e.target.value) || 0,
                          ),
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onClick={() =>
                      applyRoundedBoxSingleChange({
                        [selectedFaceInsetField]: 0,
                        [selectedFaceExtrudeField]: 0,
                        [selectedFaceField]: false,
                      })
                    }
                    style={{
                      ...S.libraryTabBtn,
                      width: "100%",
                      opacity:
                        editorMode !== "editable" || isLocked(selectedComp)
                          ? 0.55
                          : 1,
                    }}
                  >
                    Reset Selected Face
                  </button>
                </div>

                <div style={{ marginBottom: 6 }}>
                  <label style={S.floatingLabel}>
                    Wall Thickness (mm) — current:{" "}
                    {selectedComp.wallThickness ?? 20}mm
                  </label>
                  <input
                    type="range"
                    min="10"
                    max={boxWallMax}
                    step="5"
                    value={selectedComp.wallThickness ?? 20}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        wallThickness: Math.max(
                          10,
                          Math.min(boxWallMax, Number(e.target.value) || 20),
                        ),
                      })
                    }
                    style={{ width: "100%", accentColor: "#38bdf8" }}
                  />
                  <input
                    type="number"
                    min="10"
                    max={boxWallMax}
                    step="5"
                    value={selectedComp.wallThickness ?? 20}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        wallThickness: Math.max(
                          10,
                          Math.min(boxWallMax, Number(e.target.value) || 20),
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 6 }}>
                  <label style={S.floatingLabel}>
                    Bottom Thickness (mm) — current:{" "}
                    {selectedComp.bottomThickness ?? 20}mm
                  </label>
                  <input
                    type="range"
                    min="10"
                    max={boxBottomMax}
                    step="5"
                    value={selectedComp.bottomThickness ?? 20}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        bottomThickness: Math.max(
                          10,
                          Math.min(boxBottomMax, Number(e.target.value) || 20),
                        ),
                      })
                    }
                    style={{ width: "100%", accentColor: "#22c55e" }}
                  />
                  <input
                    type="number"
                    min="10"
                    max={boxBottomMax}
                    step="5"
                    value={selectedComp.bottomThickness ?? 20}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        bottomThickness: Math.max(
                          10,
                          Math.min(boxBottomMax, Number(e.target.value) || 20),
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            {selectedComp.type === "shape_trapezoid" && (
              <div style={{ marginBottom: 6 }}>
                <label style={S.floatingLabel}>
                  Top Width Ratio —{" "}
                  {Math.round((selectedComp.topRatio ?? 0.5) * 100)}%
                </label>
                <input
                  type="range"
                  min="5"
                  max="98"
                  step="1"
                  value={Math.round((selectedComp.topRatio ?? 0.5) * 100)}
                  disabled={editorMode !== "editable" || isLocked(selectedComp)}
                  onChange={(e) =>
                    onChange(selectedComp.id, {
                      topRatio: Number(e.target.value) / 100,
                    })
                  }
                  style={{
                    width: "100%",
                    accentColor: "#f59e0b",
                    marginBottom: 4,
                  }}
                />
              </div>
            )}

            <div style={inspectorSectionTitleStyle}>Part Details</div>

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Rotation Y (°)</label>
              <input
                type="number"
                value={selectedComp.rotationY ?? 0}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  onChange(selectedComp.id, {
                    rotationY: parseFloat(e.target.value) || 0,
                  })
                }
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Label</label>
              <input
                value={selectedComp.label || ""}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  onChange(selectedComp.id, { label: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div style={inspectorSectionTitleStyle}>
              Material & Finish
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Fill Color</label>
              <input
                type="color"
                value={selectedComp.fill || "#d9c2a5"}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  applyStyleChange({
                    fill: e.target.value,
                    finish: "",
                  })
                }
                style={colorInputStyle}
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Board Material</label>
              <input
                list="blueprint-production-materials"
                value={selectedComp.material || ""}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) => applyStyleChange({ material: e.target.value })}
                style={inputStyle}
              />
              <datalist id="blueprint-production-materials">
                {MATERIAL_SUGGESTIONS.map((material) => (
                  <option key={material} value={material} />
                ))}
              </datalist>
            </div>

            {(isWoodLikeMaterial(selectedComp.material) ||
              selectedComp.finish !== undefined) && (
              <div style={{ marginBottom: 6 }}>
                <label style={S.floatingLabel}>Wood Finish</label>
                <select
                  value={selectedComp.finish ?? ""}
                  disabled={editorMode !== "editable" || isLocked(selectedComp)}
                  onChange={(e) =>
                    applyStyleChange(
                      applyWoodFinish(selectedComp, e.target.value),
                    )
                  }
                  style={inputStyle}
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

            <div style={{ marginBottom: 8 }}>
              <label style={S.floatingLabel}>Grain Direction</label>
              <select
                value={selectedComp.grainDirection || "none"}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  applySelectionChange({
                    grainDirection: e.target.value,
                  })
                }
                style={inputStyle}
              >
                {GRAIN_DIRECTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div
                style={{
                  marginTop: 4,
                  color: "#71849e",
                  fontSize: 8,
                  lineHeight: 1.4,
                }}
              >
                Direction follows the selected part's own Width / Height / Depth
                axes. New wood parts default to their longest dimension.
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ ...S.floatingLabel, marginBottom: 6 }}>
                Edge Treatment
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 6,
                }}
              >
                {EDGE_KEYS.map((edge) => (
                  <label key={edge.key} style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        marginBottom: 3,
                        color: "#91a4bf",
                        fontSize: 8,
                        fontWeight: 700,
                      }}
                    >
                      {edge.label}
                    </span>
                    <select
                      value={
                        selectedComp.edgeTreatments?.[edge.key] || "none"
                      }
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        applySelectionChange({
                          edgeTreatments: {
                            ...(selectedComp.edgeTreatments || {}),
                            [edge.key]: e.target.value,
                          },
                        })
                      }
                      style={{
                        ...inputStyle,
                        minHeight: 32,
                        fontSize: 9,
                      }}
                    >
                      {EDGE_TREATMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <div
              style={{
                ...infoCardStyle,
                marginBottom: 8,
                color: "#93a8c4",
                fontSize: 9,
                lineHeight: 1.45,
              }}
            >
              Blueprint production details only. Inventory is handled later in
              Create Estimation.
            </div>

            <div style={inspectorSectionTitleStyle}>Hardware</div>

            <div
              style={{
                ...infoCardStyle,
                marginBottom: 8,
                color: "#93a8c4",
                fontSize: 9,
                lineHeight: 1.45,
              }}
            >
              Hardware saved on this part:
              {" "}
              <b>{selectedComp.partCode || selectedComp.label || "Selected Part"}</b>.
            </div>

            {getHardwareRequirements().length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                {getHardwareRequirements().map((item, index) => (
                  <div
                    key={item.id || `${item.type}-${index}`}
                    style={{
                      padding: 8,
                      border: "1px solid rgba(71,85,105,.62)",
                      borderRadius: 7,
                      background: "rgba(15,23,42,.52)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 7,
                      }}
                    >
                      <div
                        style={{
                          minWidth: 0,
                          color: "#dbeafe",
                          fontSize: 9,
                          fontWeight: 800,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name || getHardwareTypeLabel(item.type)}
                      </div>

                      <button
                        type="button"
                        disabled={
                          editorMode !== "editable" || isLocked(selectedComp)
                        }
                        onClick={() => removeHardwareRequirement(item.id)}
                        style={{
                          minHeight: 24,
                          padding: "3px 7px",
                          border: "1px solid rgba(248,113,113,.45)",
                          borderRadius: 5,
                          background: "rgba(127,29,29,.18)",
                          color: "#fecaca",
                          fontSize: 8,
                          fontWeight: 800,
                          cursor:
                            editorMode !== "editable" ||
                            isLocked(selectedComp)
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            editorMode !== "editable" ||
                            isLocked(selectedComp)
                              ? 0.45
                              : 1,
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) 72px",
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <label style={{ minWidth: 0 }}>
                        <span style={S.floatingLabel}>Hardware Type</span>
                        <select
                          value={item.type || "other"}
                          disabled={
                            editorMode !== "editable" ||
                            isLocked(selectedComp)
                          }
                          onChange={(e) =>
                            updateHardwareRequirement(item.id, {
                              type: e.target.value,
                            })
                          }
                          style={inputStyle}
                        >
                          {HARDWARE_TYPE_OPTIONS.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={{ minWidth: 0 }}>
                        <span style={S.floatingLabel}>Qty</span>
                        <input
                          type="number"
                          min="1"
                          max="9999"
                          step="1"
                          value={item.quantity || 1}
                          disabled={
                            editorMode !== "editable" ||
                            isLocked(selectedComp)
                          }
                          onChange={(e) =>
                            updateHardwareRequirement(item.id, {
                              quantity: Math.max(
                                1,
                                Math.min(
                                  9999,
                                  Math.round(Number(e.target.value) || 1),
                                ),
                              ),
                            })
                          }
                          style={inputStyle}
                        />
                      </label>
                    </div>

                    <div style={{ marginBottom: 6 }}>
                      <label style={S.floatingLabel}>Name / Description</label>
                      <input
                        value={item.name || ""}
                        maxLength={150}
                        disabled={
                          editorMode !== "editable" ||
                          isLocked(selectedComp)
                        }
                        onChange={(e) =>
                          updateHardwareRequirement(item.id, {
                            name: e.target.value,
                          })
                        }
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={S.floatingLabel}>Installation Note</label>
                      <textarea
                        value={item.installationNote || ""}
                        maxLength={500}
                        rows={2}
                        disabled={
                          editorMode !== "editable" ||
                          isLocked(selectedComp)
                        }
                        onChange={(e) =>
                          updateHardwareRequirement(item.id, {
                            installationNote: e.target.value,
                          })
                        }
                        style={{
                          ...inputStyle,
                          minHeight: 54,
                          resize: "vertical",
                          lineHeight: 1.35,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  ...infoCardStyle,
                  marginBottom: 8,
                  color: "#71849e",
                  fontSize: 9,
                }}
              >
                No hardware assigned to this part yet.
              </div>
            )}

            <div
              style={{
                padding: 8,
                marginBottom: 8,
                border: "1px dashed rgba(96,165,250,.38)",
                borderRadius: 7,
                background: "rgba(30,64,175,.08)",
              }}
            >
              <div
                style={{
                  marginBottom: 7,
                  color: "#bfdbfe",
                  fontSize: 9,
                  fontWeight: 800,
                }}
              >
                Add Hardware
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 72px",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <label style={{ minWidth: 0 }}>
                  <span style={S.floatingLabel}>Hardware Type</span>
                  <select
                    value={hardwareDraftType}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) => {
                      setHardwareDraftType(e.target.value);
                      if (!hardwareDraftName.trim()) {
                        setHardwareDraftName(
                          getHardwareTypeLabel(e.target.value),
                        );
                      }
                    }}
                    style={inputStyle}
                  >
                    {HARDWARE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ minWidth: 0 }}>
                  <span style={S.floatingLabel}>Qty</span>
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    step="1"
                    value={hardwareDraftQuantity}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      setHardwareDraftQuantity(
                        Math.max(
                          1,
                          Math.min(
                            9999,
                            Math.round(Number(e.target.value) || 1),
                          ),
                        ),
                      )
                    }
                    style={inputStyle}
                  />
                </label>
              </div>

              <div style={{ marginBottom: 6 }}>
                <label style={S.floatingLabel}>Name / Description</label>
                <input
                  value={hardwareDraftName}
                  maxLength={150}
                  placeholder={getHardwareTypeLabel(hardwareDraftType)}
                  disabled={
                    editorMode !== "editable" || isLocked(selectedComp)
                  }
                  onChange={(e) => setHardwareDraftName(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 7 }}>
                <label style={S.floatingLabel}>Installation Note</label>
                <textarea
                  value={hardwareDraftNote}
                  maxLength={500}
                  rows={2}
                  placeholder="Example: 100 mm from top and bottom"
                  disabled={
                    editorMode !== "editable" || isLocked(selectedComp)
                  }
                  onChange={(e) => setHardwareDraftNote(e.target.value)}
                  style={{
                    ...inputStyle,
                    minHeight: 54,
                    resize: "vertical",
                    lineHeight: 1.35,
                  }}
                />
              </div>

              <button
                type="button"
                disabled={
                  editorMode !== "editable" || isLocked(selectedComp)
                }
                onClick={addHardwareRequirement}
                style={{
                  width: "100%",
                  minHeight: 32,
                  border: "1px solid rgba(96,165,250,.55)",
                  borderRadius: 0,
                  background: "rgba(37,99,235,.22)",
                  color: "#dbeafe",
                  fontSize: 9,
                  fontWeight: 800,
                  cursor:
                    editorMode !== "editable" ||
                    isLocked(selectedComp)
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    editorMode !== "editable" ||
                    isLocked(selectedComp)
                      ? 0.45
                      : 1,
                }}
              >
                Add Hardware Requirement
              </button>
            </div>

            <div
              style={{
                ...infoCardStyle,
                marginBottom: 8,
                color: "#93a8c4",
                fontSize: 9,
                lineHeight: 1.45,
              }}
            >
              Hardware requirements only. No inventory deduction or pricing is
              performed here.
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Qty</label>
              <input
                type="number"
                min="1"
                value={selectedComp.qty || 1}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  onChange(selectedComp.id, {
                    qty: Math.max(1, parseInt(e.target.value || "1", 10)),
                  })
                }
                style={inputStyle}
              />
            </div>
          </>
        ) : (
          <div style={S.libraryEmptyState}>Select an object to inspect.</div>
        )}
      </div>
    </div>
  );
}
