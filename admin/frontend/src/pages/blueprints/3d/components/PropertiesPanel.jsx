import React from "react";
import { WOOD_FINISHES } from "../../data/furnitureTypes";
import { applyWoodFinish, isWoodLikeMaterial } from "../../data/componentUtils";
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
    marginBottom: 12,
    padding: 10,
    border: "1px solid rgba(71,85,105,.62)",
    borderRadius: 8,
    background: "rgba(11,20,36,.72)",
    boxSizing: "border-box",
  };

  const inspectorSectionTitleStyle = {
    marginBottom: 8,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#8fa4c0",
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
                        borderRadius: 6,
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
                  TECHNICAL ID · {selectedComp.partCode}
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
              <div style={inspectorSectionTitleStyle}>Dimensions</div>
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
              <div style={inspectorSectionTitleStyle}>Resize Side</div>
              <div
                style={{
                  marginBottom: 9,
                  color: "#7f93ad",
                  fontSize: 9,
                  lineHeight: 1.45,
                }}
              >
                Choose which side will move when the dimension changes.
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
                            borderRadius: 6,
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

            <div style={inspectorSectionTitleStyle}>Identity & Rotation</div>

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

            <div style={inspectorSectionTitleStyle}>Material & Finish</div>

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
              <label style={S.floatingLabel}>Material</label>
              <input
                value={selectedComp.material || ""}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) => applyStyleChange({ material: e.target.value })}
                style={inputStyle}
              />
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
