import React, { useEffect, useRef, useState } from "react";
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
import {
  MAX_WOODWORKING_OPERATIONS,
  WOODWORKING_OPERATION_TYPES,
  getOperationLabel,
  getOperationProfileDimensions,
  normalizeWoodworkingOperations,
  createWoodworkingOperation,
  updateWoodworkingOperation,
  deleteWoodworkingOperation,
  getWoodworkingOperationFootprint,
} from "../../data/woodworkingOperations";
import {
  isWoodworkingProfileComponent,
  supportsProfileFillet,
  getWoodworkingProfileDescriptor,
  updateContourPointMm,
  insertContourPointAfter,
  deleteContourPointAt,
  resetContourPointRatios,
  getContourCurvePathPointsMm,
  getContourEdgeCurveInfo,
  updateContourEdgeBulgeMm,
  updateContourEdgeRadiusMm,
  insertContourCurveAfter,
  deleteContourCurveAt,
  resetContourCurvesAroundPoint,
  resetContourCurveRatios,
  MAX_PROFILE_CUTOUTS,
  getProfileCutoutLocalPoints,
  MAX_PROFILE_EDGE_NOTCHES,
  createProfileEdgeNotch,
  updateProfileEdgeNotch,
  deleteProfileEdgeNotch,
  getProfileEdgeNotchStatus,
} from "../../data/woodworkingProfile";
import {
  getMachiningProxyComponent,
  getUniversalMachiningCapability,
  getUniversalMachiningDescriptor,
  getUniversalMachiningOuterPoints,
  getUniversalMachiningCutouts,
  createUniversalMachiningCutout,
  updateUniversalMachiningCutout,
  deleteUniversalMachiningCutout,
  getUniversalMachiningCutoutStatus,
  getUniversalMachiningOperationStatus,
  getMachiningPlaneLabel,
  getMachiningSurfaceLabels,
} from "../../data/universalMachiningV2";

function ContourEditorCard({
  selectedComp,
  woodworkingProfile,
  editorMode,
  isLocked,
  onChange,
  inputStyle,
}) {
  const svgRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeEdgeIndex, setActiveEdgeIndex] = useState(0);
  const [activeNotchId, setActiveNotchId] = useState("");

  useEffect(() => {
    setActiveIndex(0);
    setActiveEdgeIndex(0);
    setActiveNotchId("");
  }, [selectedComp?.id]);

  const points = Array.isArray(woodworkingProfile?.contourPointsMm)
    ? woodworkingProfile.contourPointsMm
    : [];

  const safeIndex = Math.max(
    0,
    Math.min(points.length - 1, activeIndex),
  );
  const safeEdgeIndex = Math.max(
    0,
    Math.min(points.length - 1, activeEdgeIndex),
  );

  const activePoint = points[safeIndex] || [0, 0];
  const activeEdgeInfo = getContourEdgeCurveInfo(
    selectedComp,
    safeEdgeIndex,
    18,
  );
  const allEdgeNotches = Array.isArray(
    woodworkingProfile?.profileEdgeNotches,
  )
    ? woodworkingProfile.profileEdgeNotches
    : [];
  const activeEdgeNotches = allEdgeNotches.filter(
    (item) => Number(item.edgeIndex) === safeEdgeIndex,
  );
  const activeNotch =
    activeEdgeNotches.find(
      (item) => item.id === activeNotchId,
    ) ||
    activeEdgeNotches[0] ||
    null;
  const activeNotchStatus = activeNotch
    ? getProfileEdgeNotchStatus(selectedComp, activeNotch)
    : null;

  const disabled =
    editorMode !== "editable" || isLocked(selectedComp);

  const viewWidth = 240;
  const viewHeight = 160;
  const padding = 18;
  const usableWidth = viewWidth - padding * 2;
  const usableHeight = viewHeight - padding * 2;

  const toScreen = ([u, v]) => [
    padding +
      (u / Math.max(1, woodworkingProfile.u) + 0.5) *
        usableWidth,
    padding +
      (0.5 - v / Math.max(1, woodworkingProfile.v)) *
        usableHeight,
  ];

  const pointerToLocal = (event) => {
    const svg = svgRef.current;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const x =
      ((event.clientX - rect.left) / rect.width) * viewWidth;
    const y =
      ((event.clientY - rect.top) / rect.height) * viewHeight;

    const normalizedU = Math.max(
      0,
      Math.min(1, (x - padding) / usableWidth),
    );
    const normalizedV = Math.max(
      0,
      Math.min(1, (y - padding) / usableHeight),
    );

    return [
      (normalizedU - 0.5) * woodworkingProfile.u,
      (0.5 - normalizedV) * woodworkingProfile.v,
    ];
  };

  const screenPoints = points.map(toScreen);
  const curvePathPoints = getContourCurvePathPointsMm(
    selectedComp,
    18,
  );
  const curveScreenPoints = curvePathPoints.map(toScreen);

  const edgeInfos = points.map((_, index) =>
    getContourEdgeCurveInfo(selectedComp, index, 18),
  );

  const commitContour = ({
    nextPoints = null,
    nextCurves = null,
    nextNotches = null,
    resetFilletForCurves = false,
    resetFilletForNotches = false,
  }) => {
    const attrs = {};

    if (Array.isArray(nextPoints)) {
      attrs.profileContourPoints = nextPoints;
    }

    if (Array.isArray(nextCurves)) {
      attrs.profileContourBulges = nextCurves;

      if (
        resetFilletForCurves &&
        nextCurves.some(
          (value) => Math.abs(Number(value) || 0) > 1e-6,
        )
      ) {
        // V3 keeps circular edges mathematically clean. Corner fillet remains
        // available whenever all custom contour edges are straight.
        attrs.profileFilletRadius = 0;
      }
    }

    if (Array.isArray(nextNotches)) {
      attrs.profileEdgeNotches = nextNotches;

      if (
        resetFilletForNotches &&
        nextNotches.length > 0
      ) {
        // V4B boundary notches define their own hard inside corners.
        attrs.profileFilletRadius = 0;
      }
    }

    onChange(selectedComp.id, attrs);
  };

  const commitPointMm = (index, nextU, nextV) => {
    const nextPoints = updateContourPointMm(
      selectedComp,
      index,
      nextU,
      nextV,
    );
    const nextCurves = resetContourCurvesAroundPoint(
      selectedComp,
      index,
    );

    commitContour({
      nextPoints,
      nextCurves,
    });
  };

  const handlePointPointerMove = (event, index) => {
    if (disabled) return;
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      return;
    }

    const local = pointerToLocal(event);
    if (!local) return;

    commitPointMm(index, local[0], local[1]);
  };

  const commitEdgeBulge = (nextBulgeMm) => {
    const nextCurves = updateContourEdgeBulgeMm(
      selectedComp,
      safeEdgeIndex,
      nextBulgeMm,
    );
    const willCurve =
      Math.abs(Number(nextBulgeMm) || 0) > 0.01;
    const nextNotches = willCurve
      ? allEdgeNotches.filter(
          (item) => Number(item.edgeIndex) !== safeEdgeIndex,
        )
      : null;

    commitContour({
      nextCurves,
      nextNotches,
      resetFilletForCurves: true,
    });

    if (willCurve) {
      setActiveNotchId("");
    }
  };

  const commitEdgeRadius = (nextRadiusMm) => {
    const nextCurves = updateContourEdgeRadiusMm(
      selectedComp,
      safeEdgeIndex,
      nextRadiusMm,
      activeEdgeInfo?.side || 1,
    );

    commitContour({
      nextCurves,
      resetFilletForCurves: true,
    });
  };

  const addEdgeNotch = () => {
    if (
      disabled ||
      activeEdgeInfo?.isCurved ||
      allEdgeNotches.length >= MAX_PROFILE_EDGE_NOTCHES
    ) {
      return;
    }

    const created = createProfileEdgeNotch(
      selectedComp,
      safeEdgeIndex,
    );
    if (!created) return;

    const nextNotches = [...allEdgeNotches, created];
    commitContour({
      nextNotches,
      resetFilletForNotches: true,
    });
    setActiveNotchId(created.id);
  };

  const updateActiveNotch = (attrs) => {
    if (!activeNotch) return;

    const nextNotches = updateProfileEdgeNotch(
      selectedComp,
      activeNotch.id,
      attrs,
    );

    commitContour({
      nextNotches,
      resetFilletForNotches: true,
    });
  };

  const deleteActiveNotch = () => {
    if (!activeNotch) return;

    const nextNotches = deleteProfileEdgeNotch(
      selectedComp,
      activeNotch.id,
    );

    commitContour({ nextNotches });
    setActiveNotchId("");
  };

  const handleCurvePointerMove = (event) => {
    if (disabled || !activeEdgeInfo) return;
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      return;
    }

    const local = pointerToLocal(event);
    if (!local) return;

    const [startU, startV] = activeEdgeInfo.start;
    const [endU, endV] = activeEdgeInfo.end;
    const dx = endU - startU;
    const dy = endV - startV;
    const chord = Math.max(0.001, Math.hypot(dx, dy));
    const midpoint = [
      (startU + endU) / 2,
      (startV + endV) / 2,
    ];
    const normal = [-dy / chord, dx / chord];

    const signedDistance =
      (local[0] - midpoint[0]) * normal[0] +
      (local[1] - midpoint[1]) * normal[1];

    commitEdgeBulge(signedDistance);
  };

  const insertAfterActive = () => {
    const nextPoints = insertContourPointAfter(
      selectedComp,
      safeIndex,
    );
    const nextCurves = insertContourCurveAfter(
      selectedComp,
      safeIndex,
    );

    if (!Array.isArray(nextPoints)) return;

    commitContour({
      nextPoints,
      nextCurves,
      nextNotches: [],
    });
    setActiveNotchId("");

    const nextIndex = Math.min(
      safeIndex + 1,
      nextPoints.length - 1,
    );
    setActiveIndex(nextIndex);
    setActiveEdgeIndex(nextIndex);
  };

  const deleteActive = () => {
    const nextPoints = deleteContourPointAt(
      selectedComp,
      safeIndex,
    );
    const nextCurves = deleteContourCurveAt(
      selectedComp,
      safeIndex,
    );

    if (!Array.isArray(nextPoints)) return;

    commitContour({
      nextPoints,
      nextCurves,
      nextNotches: [],
    });
    setActiveNotchId("");

    const nextIndex = Math.max(
      0,
      Math.min(safeIndex, nextPoints.length - 1),
    );
    setActiveIndex(nextIndex);
    setActiveEdgeIndex(
      Math.max(0, Math.min(safeEdgeIndex, nextPoints.length - 1)),
    );
  };

  const resetContour = () => {
    const nextPoints = resetContourPointRatios();

    commitContour({
      nextPoints,
      nextCurves: resetContourCurveRatios(nextPoints.length),
      nextNotches: [],
    });

    setActiveNotchId("");
    setActiveIndex(0);
    setActiveEdgeIndex(0);
  };

  const activeCurveHandle = activeEdgeInfo
    ? toScreen(activeEdgeInfo.sagittaPoint)
    : null;

  const edgeLabel = activeEdgeInfo
    ? `P${activeEdgeInfo.index + 1} → P${
        activeEdgeInfo.nextIndex + 1
      }`
    : "—";

  const radiusValue =
    activeEdgeInfo?.radiusMm == null
      ? 0
      : Math.round(activeEdgeInfo.radiusMm);

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          marginBottom: 6,
          color: "#e5eefc",
          fontSize: 10,
          fontWeight: 850,
        }}
      >
        Contour Editor
      </div>

      <div
        style={{
          marginBottom: 7,
          color: "#8fa3bd",
          fontSize: 8,
          lineHeight: 1.45,
        }}
      >
        Drag blue points for straight contour geometry. Click an edge, then
        drag the purple arc handle to curve that edge. Exact point, bulge,
        and radius values remain available below.
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="none"
        style={{
          width: "100%",
          height: 160,
          display: "block",
          marginBottom: 8,
          border: "1px solid #334155",
          borderRadius: 0,
          background: "#08111f",
          touchAction: "none",
        }}
      >
        <line
          x1={viewWidth / 2}
          y1={padding}
          x2={viewWidth / 2}
          y2={viewHeight - padding}
          stroke="#1e293b"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <line
          x1={padding}
          y1={viewHeight / 2}
          x2={viewWidth - padding}
          y2={viewHeight / 2}
          stroke="#1e293b"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {curveScreenPoints.length >= 3 ? (
          <polygon
            points={curveScreenPoints
              .map(([x, y]) => `${x},${y}`)
              .join(" ")}
            fill="rgba(96, 165, 250, 0.13)"
            stroke="#93c5fd"
            strokeWidth="1.6"
          />
        ) : null}

        {edgeInfos.map((info, index) => {
          if (!info) return null;

          const active = index === safeEdgeIndex;
          const arcScreen = info.arcPoints.map(toScreen);
          const polylinePoints = arcScreen
            .map(([x, y]) => `${x},${y}`)
            .join(" ");

          return (
            <g key={`contour-edge-${index}`}>
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="rgba(255,255,255,0.001)"
                strokeWidth="12"
                style={{
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
                onPointerDown={() => {
                  if (disabled) return;
                  setActiveEdgeIndex(index);
                }}
              />
              {active ? (
                <polyline
                  points={polylinePoints}
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="2.6"
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        })}

        {screenPoints.map(([x, y], index) => {
          const active = index === safeIndex;

          return (
            <circle
              key={`contour-point-${index}`}
              cx={x}
              cy={y}
              r={active ? 5.2 : 4.2}
              fill={active ? "#ffffff" : "#3b82f6"}
              stroke={active ? "#3b82f6" : "#bfdbfe"}
              strokeWidth="1.5"
              style={{
                cursor: disabled ? "not-allowed" : "grab",
              }}
              onPointerDown={(event) => {
                if (disabled) return;

                setActiveIndex(index);
                setActiveEdgeIndex(index);
                event.currentTarget.setPointerCapture?.(
                  event.pointerId,
                );
              }}
              onPointerMove={(event) =>
                handlePointPointerMove(event, index)
              }
              onPointerUp={(event) =>
                event.currentTarget.releasePointerCapture?.(
                  event.pointerId,
                )
              }
              onPointerCancel={(event) =>
                event.currentTarget.releasePointerCapture?.(
                  event.pointerId,
                )
              }
            />
          );
        })}

        {activeCurveHandle ? (
          <circle
            cx={activeCurveHandle[0]}
            cy={activeCurveHandle[1]}
            r="5.4"
            fill="#c4b5fd"
            stroke="#7c3aed"
            strokeWidth="1.8"
            style={{
              cursor: disabled ? "not-allowed" : "ns-resize",
            }}
            onPointerDown={(event) => {
              if (disabled) return;
              event.currentTarget.setPointerCapture?.(
                event.pointerId,
              );
            }}
            onPointerMove={handleCurvePointerMove}
            onPointerUp={(event) =>
              event.currentTarget.releasePointerCapture?.(
                event.pointerId,
              )
            }
            onPointerCancel={(event) =>
              event.currentTarget.releasePointerCapture?.(
                event.pointerId,
              )
            }
          />
        ) : null}
      </svg>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginBottom: 7,
        }}
      >
        {points.map((_, index) => (
          <button
            key={`point-select-${index}`}
            type="button"
            disabled={disabled}
            onClick={() => {
              setActiveIndex(index);
              setActiveEdgeIndex(index);
            }}
            style={{
              minWidth: 34,
              height: 26,
              padding: "0 7px",
              border: `1px solid ${
                index === safeIndex ? "#60a5fa" : "#334155"
              }`,
              borderRadius: 0,
              background:
                index === safeIndex ? "#172554" : "#0f172a",
              color:
                index === safeIndex ? "#dbeafe" : "#94a3b8",
              fontSize: 8,
              fontWeight: 800,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            P{index + 1}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          marginBottom: 9,
        }}
      >
        <div>
          <label style={{ fontSize: 8, color: "#94a3b8" }}>
            U Position (mm)
          </label>
          <input
            type="number"
            step="1"
            value={Math.round(activePoint[0])}
            min={Math.round(-woodworkingProfile.u / 2)}
            max={Math.round(woodworkingProfile.u / 2)}
            disabled={disabled}
            onChange={(event) =>
              commitPointMm(
                safeIndex,
                Number(event.target.value) || 0,
                activePoint[1],
              )
            }
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 8, color: "#94a3b8" }}>
            V Position (mm)
          </label>
          <input
            type="number"
            step="1"
            value={Math.round(activePoint[1])}
            min={Math.round(-woodworkingProfile.v / 2)}
            max={Math.round(woodworkingProfile.v / 2)}
            disabled={disabled}
            onChange={(event) =>
              commitPointMm(
                safeIndex,
                activePoint[0],
                Number(event.target.value) || 0,
              )
            }
            style={inputStyle}
          />
        </div>
      </div>

      <div
        style={{
          paddingTop: 8,
          marginTop: 3,
          marginBottom: 9,
          borderTop: "1px solid #243247",
        }}
      >
        <div
          style={{
            marginBottom: 5,
            color: "#ddd6fe",
            fontSize: 9,
            fontWeight: 850,
          }}
        >
          Arc Edge · {edgeLabel}
        </div>

        <div
          style={{
            marginBottom: 6,
            color: "#7f8ea3",
            fontSize: 8,
            lineHeight: 1.4,
          }}
        >
          Positive / negative bulge chooses which side of the selected
          edge curves outward. Purple handle = draggable arc control.
        </div>

        <label style={{ fontSize: 8, color: "#94a3b8" }}>
          Curve Bulge (mm) — current:{" "}
          {Math.round(activeEdgeInfo?.bulgeMm || 0)}mm
        </label>
        <input
          type="range"
          min={Math.round(-(activeEdgeInfo?.maxBulgeMm || 1))}
          max={Math.round(activeEdgeInfo?.maxBulgeMm || 1)}
          step="1"
          value={Math.round(activeEdgeInfo?.bulgeMm || 0)}
          disabled={disabled || !activeEdgeInfo}
          onChange={(event) =>
            commitEdgeBulge(Number(event.target.value) || 0)
          }
          style={{
            width: "100%",
            accentColor: "#8b5cf6",
          }}
        />
        <input
          type="number"
          step="1"
          min={Math.round(-(activeEdgeInfo?.maxBulgeMm || 1))}
          max={Math.round(activeEdgeInfo?.maxBulgeMm || 1)}
          value={Math.round(activeEdgeInfo?.bulgeMm || 0)}
          disabled={disabled || !activeEdgeInfo}
          onChange={(event) =>
            commitEdgeBulge(Number(event.target.value) || 0)
          }
          style={inputStyle}
        />

        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 8, color: "#94a3b8" }}>
            Arc Radius (mm)
          </label>
          <input
            type="number"
            step="1"
            min={Math.ceil(activeEdgeInfo?.minRadiusMm || 1)}
            value={radiusValue}
            disabled={disabled || !activeEdgeInfo}
            onChange={(event) =>
              commitEdgeRadius(Number(event.target.value) || 0)
            }
            style={inputStyle}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 6,
            marginTop: 6,
          }}
        >
          <button
            type="button"
            disabled={disabled || !activeEdgeInfo}
            onClick={() =>
              commitEdgeBulge(
                Math.max(
                  10,
                  Math.min(
                    60,
                    activeEdgeInfo?.maxBulgeMm || 10,
                  ),
                ),
              )
            }
            style={{
              height: 28,
              border: "1px solid #4c3d75",
              borderRadius: 0,
              background: "#16112a",
              color: "#ddd6fe",
              fontSize: 8,
              fontWeight: 800,
            }}
          >
            Curve +
          </button>

          <button
            type="button"
            disabled={disabled || !activeEdgeInfo}
            onClick={() => commitEdgeBulge(0)}
            style={{
              height: 28,
              border: "1px solid #334155",
              borderRadius: 0,
              background: "#111827",
              color: "#cbd5e1",
              fontSize: 8,
              fontWeight: 800,
            }}
          >
            Straight
          </button>

          <button
            type="button"
            disabled={disabled || !activeEdgeInfo}
            onClick={() =>
              commitEdgeBulge(
                -Math.max(
                  10,
                  Math.min(
                    60,
                    activeEdgeInfo?.maxBulgeMm || 10,
                  ),
                ),
              )
            }
            style={{
              height: 28,
              border: "1px solid #4c3d75",
              borderRadius: 0,
              background: "#16112a",
              color: "#ddd6fe",
              fontSize: 8,
              fontWeight: 800,
            }}
          >
            Curve -
          </button>
        </div>

        <div
          style={{
            marginTop: 6,
            color: "#64748b",
            fontSize: 8,
            lineHeight: 1.4,
          }}
        >
          Chord {Math.round(activeEdgeInfo?.chordMm || 0)}mm ·{" "}
          {activeEdgeInfo?.isCurved
            ? `radius ${Math.round(activeEdgeInfo.radiusMm)}mm`
            : "straight edge"}.
          Adding an arc resets Custom Contour corner fillet to 0 and removes
          any notch on that same edge.
        </div>
      </div>

      <div
        style={{
          paddingTop: 8,
          marginTop: 3,
          marginBottom: 9,
          borderTop: "1px solid #243247",
        }}
      >
        <div
          style={{
            marginBottom: 5,
            color: "#fde68a",
            fontSize: 9,
            fontWeight: 850,
          }}
        >
          Edge Notch · {edgeLabel}
        </div>

        <div
          style={{
            marginBottom: 7,
            color: "#7f8ea3",
            fontSize: 8,
            lineHeight: 1.4,
          }}
        >
          Rectangular boundary cut from the selected straight contour edge.
          Offset is measured from P{safeEdgeIndex + 1} toward P{
            activeEdgeInfo?.nextIndex + 1 || 1
          }.
        </div>

        {activeEdgeInfo?.isCurved ? (
          <div
            style={{
              padding: 7,
              border: "1px solid #78350f",
              borderRadius: 0,
              background: "rgba(120, 53, 15, 0.15)",
              color: "#fde68a",
              fontSize: 8,
              lineHeight: 1.4,
            }}
          >
            Straighten this edge before adding an edge notch.
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={
                disabled ||
                allEdgeNotches.length >= MAX_PROFILE_EDGE_NOTCHES
              }
              onClick={addEdgeNotch}
              style={{
                width: "100%",
                height: 30,
                border: "1px solid #854d0e",
                borderRadius: 0,
                background: "#211b0b",
                color: "#fef3c7",
                fontSize: 8,
                fontWeight: 800,
                cursor:
                  disabled ||
                  allEdgeNotches.length >= MAX_PROFILE_EDGE_NOTCHES
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              + Edge Notch
            </button>

            {activeEdgeNotches.length ? (
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    marginTop: 7,
                    marginBottom: 7,
                  }}
                >
                  {activeEdgeNotches.map((notch, index) => (
                    <button
                      key={notch.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setActiveNotchId(notch.id)}
                      style={{
                        minWidth: 40,
                        height: 25,
                        padding: "0 6px",
                        border: `1px solid ${
                          activeNotch?.id === notch.id
                            ? "#f59e0b"
                            : "#334155"
                        }`,
                        borderRadius: 0,
                        background:
                          activeNotch?.id === notch.id
                            ? "#451a03"
                            : "#0f172a",
                        color:
                          activeNotch?.id === notch.id
                            ? "#fef3c7"
                            : "#94a3b8",
                        fontSize: 8,
                        fontWeight: 800,
                      }}
                    >
                      N{index + 1}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    marginBottom: 7,
                    padding: 7,
                    border: `1px solid ${
                      activeNotchStatus?.valid
                        ? "#365314"
                        : "#7f1d1d"
                    }`,
                    borderRadius: 0,
                    background: activeNotchStatus?.valid
                      ? "rgba(54, 83, 20, 0.12)"
                      : "rgba(127, 29, 29, 0.12)",
                    color: activeNotchStatus?.valid
                      ? "#d9f99d"
                      : "#fecaca",
                    fontSize: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {activeNotchStatus?.valid ? "VALID" : "CHECK"} ·{" "}
                  {activeNotchStatus?.message}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                    marginBottom: 7,
                  }}
                >
                  <div>
                    <label style={{ fontSize: 8, color: "#94a3b8" }}>
                      Offset From Start (mm)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={Math.round(activeNotch?.offset || 0)}
                      disabled={disabled}
                      onChange={(event) =>
                        updateActiveNotch({
                          offset: Math.max(
                            0,
                            Number(event.target.value) || 0,
                          ),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 8, color: "#94a3b8" }}>
                      Width (mm)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={Math.round(activeNotch?.width || 1)}
                      disabled={disabled}
                      onChange={(event) =>
                        updateActiveNotch({
                          width: Math.max(
                            1,
                            Number(event.target.value) || 1,
                          ),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 7 }}>
                  <label style={{ fontSize: 8, color: "#94a3b8" }}>
                    Depth Into Board (mm)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={Math.round(activeNotch?.depth || 1)}
                    disabled={disabled}
                    onChange={(event) =>
                      updateActiveNotch({
                        depth: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <button
                  type="button"
                  disabled={disabled || !activeNotch}
                  onClick={deleteActiveNotch}
                  style={{
                    width: "100%",
                    height: 28,
                    border: "1px solid #7f1d1d",
                    borderRadius: 0,
                    background: "#1f1115",
                    color: "#fca5a5",
                    fontSize: 8,
                    fontWeight: 800,
                  }}
                >
                  Delete Selected Edge Notch
                </button>
              </>
            ) : (
              <div
                style={{
                  marginTop: 7,
                  padding: 7,
                  border: "1px solid #243247",
                  borderRadius: 0,
                  color: "#64748b",
                  fontSize: 8,
                  lineHeight: 1.4,
                }}
              >
                No notch on this selected edge.
              </div>
            )}
          </>
        )}

        <div
          style={{
            marginTop: 6,
            color: "#64748b",
            fontSize: 8,
            lineHeight: 1.4,
          }}
        >
          {allEdgeNotches.length}/{MAX_PROFILE_EDGE_NOTCHES} boundary notches.
          Point insert/delete/reset clears indexed notches to avoid attaching
          a saved notch to the wrong contour edge.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6,
        }}
      >
        <button
          type="button"
          disabled={disabled || points.length >= 24}
          onClick={insertAfterActive}
          style={{
            height: 30,
            border: "1px solid #334155",
            borderRadius: 0,
            background: "#111827",
            color: "#dbeafe",
            fontSize: 8,
            fontWeight: 800,
            cursor:
              disabled || points.length >= 24
                ? "not-allowed"
                : "pointer",
          }}
        >
          + Point
        </button>

        <button
          type="button"
          disabled={disabled || points.length <= 3}
          onClick={deleteActive}
          style={{
            height: 30,
            border: "1px solid #334155",
            borderRadius: 0,
            background: "#111827",
            color: "#fca5a5",
            fontSize: 8,
            fontWeight: 800,
            cursor:
              disabled || points.length <= 3
                ? "not-allowed"
                : "pointer",
          }}
        >
          Delete
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={resetContour}
          style={{
            height: 30,
            border: "1px solid #334155",
            borderRadius: 0,
            background: "#111827",
            color: "#cbd5e1",
            fontSize: 8,
            fontWeight: 800,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Reset
        </button>
      </div>

      <div
        style={{
          marginTop: 6,
          color: "#64748b",
          fontSize: 8,
          lineHeight: 1.4,
        }}
      >
        {points.length} contour points · minimum 3 · maximum 24.
        Moving a point straightens its two adjacent curved edges.
        Invalid self-crossing arc edits are ignored.
      </div>
    </div>
  );
}

function CutoutEditorCard({
  selectedComp,
  woodworkingProfile,
  editorMode,
  isLocked,
  onChange,
  inputStyle,
}) {
  const svgRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const cutouts = Array.isArray(woodworkingProfile?.profileCutouts)
    ? woodworkingProfile.profileCutouts
    : [];

  useEffect(() => {
    setActiveIndex(0);
  }, [selectedComp?.id]);

  const safeIndex = Math.max(
    0,
    Math.min(cutouts.length - 1, activeIndex),
  );
  const activeCutout = cutouts[safeIndex] || null;
  const activeStatus = activeCutout
    ? getUniversalMachiningCutoutStatus(selectedComp, activeCutout)
    : null;

  const disabled =
    editorMode !== "editable" || isLocked(selectedComp);

  const viewWidth = 240;
  const viewHeight = 160;
  const padding = 18;
  const usableWidth = viewWidth - padding * 2;
  const usableHeight = viewHeight - padding * 2;

  const toScreen = ([u, v]) => [
    padding +
      (u / Math.max(1, woodworkingProfile.u) + 0.5) *
        usableWidth,
    padding +
      (0.5 - v / Math.max(1, woodworkingProfile.v)) *
        usableHeight,
  ];

  const pointerToLocal = (event) => {
    const svg = svgRef.current;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const x =
      ((event.clientX - rect.left) / rect.width) * viewWidth;
    const y =
      ((event.clientY - rect.top) / rect.height) * viewHeight;

    const normalizedU = Math.max(
      0,
      Math.min(1, (x - padding) / usableWidth),
    );
    const normalizedV = Math.max(
      0,
      Math.min(1, (y - padding) / usableHeight),
    );

    return [
      (normalizedU - 0.5) * woodworkingProfile.u,
      (0.5 - normalizedV) * woodworkingProfile.v,
    ];
  };

  const outerPoints = (
    getUniversalMachiningOuterPoints(selectedComp, {
      curveSegments: 48,
      cornerSegments: 10,
      filletSegments: 10,
    }) || []
  ).map(toScreen);

  const commitCutouts = (nextCutouts) => {
    if (!Array.isArray(nextCutouts)) return;
    const storageField = isWoodworkingProfileComponent(selectedComp)
      ? "profileCutouts"
      : "machiningCutouts";
    onChange(selectedComp.id, {
      [storageField]: nextCutouts,
    });
  };

  const updateActive = (attrs) => {
    if (!activeCutout) return;

    commitCutouts(
      updateUniversalMachiningCutout(
        selectedComp,
        activeCutout.id,
        attrs,
      ),
    );
  };

  const addCutout = (type) => {
    if (cutouts.length >= MAX_PROFILE_CUTOUTS) return;

    const created = createUniversalMachiningCutout(selectedComp, type);
    if (!created) return;

    const nextCutouts = [...cutouts, created];
    commitCutouts(nextCutouts);
    setActiveIndex(nextCutouts.length - 1);
  };

  const removeActive = () => {
    if (!activeCutout) return;

    const nextCutouts = deleteUniversalMachiningCutout(
      selectedComp,
      activeCutout.id,
    );

    commitCutouts(nextCutouts);
    setActiveIndex(
      Math.max(0, Math.min(safeIndex, nextCutouts.length - 1)),
    );
  };

  const handleCutoutPointerMove = (event, index) => {
    if (disabled) return;
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      return;
    }

    const local = pointerToLocal(event);
    if (!local) return;

    const target = cutouts[index];
    if (!target) return;

    const nextCutouts = updateUniversalMachiningCutout(
      selectedComp,
      target.id,
      {
        u: Math.round(local[0]),
        v: Math.round(local[1]),
      },
    );

    commitCutouts(nextCutouts);
  };

  const maxRoundDiameter = Math.max(
    10,
    Math.floor(Math.min(woodworkingProfile.u, woodworkingProfile.v) * 0.9),
  );
  const maxRectWidth = Math.max(
    10,
    Math.floor(woodworkingProfile.u * 0.9),
  );
  const maxRectHeight = Math.max(
    10,
    Math.floor(woodworkingProfile.v * 0.9),
  );

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: "1px solid #243247",
      }}
    >
      <div
        style={{
          marginBottom: 5,
          color: "#e5eefc",
          fontSize: 10,
          fontWeight: 850,
        }}
      >
        Cutouts
      </div>

      <div
        style={{
          marginBottom: 7,
          color: "#8fa3bd",
          fontSize: 8,
          lineHeight: 1.45,
        }}
      >
        Add a round hole or rectangle cutout, then adjust its position and size.
        Only valid cutouts are applied to the actual 3D part.
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="none"
        style={{
          width: "100%",
          height: 160,
          display: "block",
          marginBottom: 8,
          border: "1px solid #334155",
          borderRadius: 0,
          background: "#08111f",
          touchAction: "none",
        }}
      >
        {outerPoints.length >= 3 ? (
          <polygon
            points={outerPoints
              .map(([x, y]) => `${x},${y}`)
              .join(" ")}
            fill="rgba(148, 163, 184, 0.12)"
            stroke="#94a3b8"
            strokeWidth="1.5"
          />
        ) : null}

        {cutouts.map((cutout, index) => {
          const status = getUniversalMachiningCutoutStatus(
            selectedComp,
            cutout,
          );
          const points = getProfileCutoutLocalPoints(
            cutout,
            cutout.type === "round" ? 36 : 4,
          ).map(toScreen);
          const active = index === safeIndex;

          return (
            <polygon
              key={cutout.id}
              points={points
                .map(([x, y]) => `${x},${y}`)
                .join(" ")}
              fill={
                status.valid
                  ? active
                    ? "rgba(56, 189, 248, 0.38)"
                    : "rgba(56, 189, 248, 0.18)"
                  : "rgba(248, 113, 113, 0.28)"
              }
              stroke={
                status.valid
                  ? active
                    ? "#38bdf8"
                    : "#7dd3fc"
                  : "#f87171"
              }
              strokeWidth={active ? 2.4 : 1.5}
              style={{
                cursor: disabled ? "not-allowed" : "move",
              }}
              onPointerDown={(event) => {
                if (disabled) return;
                setActiveIndex(index);
                event.currentTarget.setPointerCapture?.(
                  event.pointerId,
                );
              }}
              onPointerMove={(event) =>
                handleCutoutPointerMove(event, index)
              }
              onPointerUp={(event) =>
                event.currentTarget.releasePointerCapture?.(
                  event.pointerId,
                )
              }
              onPointerCancel={(event) =>
                event.currentTarget.releasePointerCapture?.(
                  event.pointerId,
                )
              }
            />
          );
        })}
      </svg>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          disabled={disabled || cutouts.length >= MAX_PROFILE_CUTOUTS}
          onClick={() => addCutout("round")}
          style={{
            height: 30,
            border: "1px solid #334155",
            borderRadius: 0,
            background: "#111827",
            color: "#dbeafe",
            fontSize: 8,
            fontWeight: 800,
            cursor:
              disabled || cutouts.length >= MAX_PROFILE_CUTOUTS
                ? "not-allowed"
                : "pointer",
          }}
        >
          + Round Hole
        </button>

        <button
          type="button"
          disabled={disabled || cutouts.length >= MAX_PROFILE_CUTOUTS}
          onClick={() => addCutout("rect")}
          style={{
            height: 30,
            border: "1px solid #334155",
            borderRadius: 0,
            background: "#111827",
            color: "#dbeafe",
            fontSize: 8,
            fontWeight: 800,
            cursor:
              disabled || cutouts.length >= MAX_PROFILE_CUTOUTS
                ? "not-allowed"
                : "pointer",
          }}
        >
          + Rectangle
        </button>
      </div>

      {cutouts.length ? (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: 8,
            }}
          >
            {cutouts.map((cutout, index) => (
              <button
                key={`cutout-select-${cutout.id}`}
                type="button"
                disabled={disabled}
                onClick={() => setActiveIndex(index)}
                style={{
                  minWidth: 42,
                  height: 26,
                  padding: "0 7px",
                  border: `1px solid ${
                    index === safeIndex ? "#38bdf8" : "#334155"
                  }`,
                  borderRadius: 0,
                  background:
                    index === safeIndex ? "#0c4a6e" : "#0f172a",
                  color:
                    index === safeIndex ? "#e0f2fe" : "#94a3b8",
                  fontSize: 8,
                  fontWeight: 800,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                {cutout.type === "round" ? "Hole" : "Rect"} {index + 1}
              </button>
            ))}
          </div>

          <div
            style={{
              marginBottom: 7,
              padding: 7,
              border: `1px solid ${
                activeStatus?.valid ? "#164e63" : "#7f1d1d"
              }`,
              borderRadius: 0,
              background: activeStatus?.valid
                ? "rgba(8, 145, 178, 0.08)"
                : "rgba(127, 29, 29, 0.12)",
              color: activeStatus?.valid ? "#a5f3fc" : "#fecaca",
              fontSize: 8,
              lineHeight: 1.4,
            }}
          >
            {activeStatus?.valid ? "READY" : "CHECK"} ·{" "}
            {activeStatus?.message || "Select a cutout."}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <div>
              <label style={{ fontSize: 8, color: "#94a3b8" }}>
                Horizontal Position (mm)
              </label>
              <input
                type="number"
                step="1"
                value={Math.round(activeCutout?.u || 0)}
                disabled={disabled}
                onChange={(event) =>
                  updateActive({
                    u: Number(event.target.value) || 0,
                  })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: 8, color: "#94a3b8" }}>
                Vertical Position (mm)
              </label>
              <input
                type="number"
                step="1"
                value={Math.round(activeCutout?.v || 0)}
                disabled={disabled}
                onChange={(event) =>
                  updateActive({
                    v: Number(event.target.value) || 0,
                  })
                }
                style={inputStyle}
              />
            </div>
          </div>

          {activeCutout?.type === "round" ? (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 8, color: "#94a3b8" }}>
                Diameter (mm) — current:{" "}
                {Math.round(activeCutout.diameter)}mm
              </label>
              <input
                type="range"
                min="1"
                max={maxRoundDiameter}
                step="1"
                value={Math.min(
                  maxRoundDiameter,
                  Math.round(activeCutout.diameter),
                )}
                disabled={disabled}
                onChange={(event) =>
                  updateActive({
                    diameter: Number(event.target.value) || 1,
                  })
                }
                style={{
                  width: "100%",
                  accentColor: "#0ea5e9",
                }}
              />
              <input
                type="number"
                min="1"
                step="1"
                value={Math.round(activeCutout.diameter)}
                disabled={disabled}
                onChange={(event) =>
                  updateActive({
                    diameter: Math.max(
                      1,
                      Number(event.target.value) || 1,
                    ),
                  })
                }
                style={inputStyle}
              />
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                marginBottom: 8,
              }}
            >
              <div>
                <label style={{ fontSize: 8, color: "#94a3b8" }}>
                  Width (mm)
                </label>
                <input
                  type="range"
                  min="1"
                  max={maxRectWidth}
                  step="1"
                  value={Math.min(
                    maxRectWidth,
                    Math.round(activeCutout?.width || 1),
                  )}
                  disabled={disabled}
                  onChange={(event) =>
                    updateActive({
                      width: Number(event.target.value) || 1,
                    })
                  }
                  style={{
                    width: "100%",
                    accentColor: "#0ea5e9",
                  }}
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={Math.round(activeCutout?.width || 1)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateActive({
                      width: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    })
                  }
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: 8, color: "#94a3b8" }}>
                  Height (mm)
                </label>
                <input
                  type="range"
                  min="1"
                  max={maxRectHeight}
                  step="1"
                  value={Math.min(
                    maxRectHeight,
                    Math.round(activeCutout?.height || 1),
                  )}
                  disabled={disabled}
                  onChange={(event) =>
                    updateActive({
                      height: Number(event.target.value) || 1,
                    })
                  }
                  style={{
                    width: "100%",
                    accentColor: "#0ea5e9",
                  }}
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={Math.round(activeCutout?.height || 1)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateActive({
                      height: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    })
                  }
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={disabled || !activeCutout}
            onClick={removeActive}
            style={{
              width: "100%",
              height: 30,
              border: "1px solid #7f1d1d",
              borderRadius: 0,
              background: "#1f1115",
              color: "#fca5a5",
              fontSize: 8,
              fontWeight: 800,
              cursor:
                disabled || !activeCutout
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            Delete This Cutout
          </button>
        </>
      ) : (
        <div
          style={{
            padding: 8,
            border: "1px solid #243247",
            borderRadius: 0,
            color: "#64748b",
            fontSize: 8,
            lineHeight: 1.4,
          }}
        >
          No internal holes yet. Add a round or rectangular through-cutout.
        </div>
      )}

      <div
        style={{
          marginTop: 6,
          color: "#64748b",
          fontSize: 8,
          lineHeight: 1.4,
        }}
      >
        {cutouts.length}/{MAX_PROFILE_CUTOUTS} cutouts · exact millimeter sizes are saved with this part.
      </div>
    </div>
  );
}

function WoodworkingOperationsCard({
  selectedComp,
  editorMode,
  isLocked,
  onChange,
  inputStyle,
}) {
  const [draftType, setDraftType] = useState("dado");
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    setActiveId("");
    setDraftType("dado");
  }, [selectedComp?.id]);

  const machiningComp =
    getMachiningProxyComponent(selectedComp) || selectedComp;
  const machiningDescriptor =
    getUniversalMachiningDescriptor(selectedComp);
  const surfaceLabels = getMachiningSurfaceLabels(
    machiningDescriptor?.plane || "xy",
  );
  const operations = normalizeWoodworkingOperations(
    selectedComp?.woodworkingOperations,
  );
  const active =
    operations.find((item) => item.id === activeId) ||
    operations[0] ||
    null;
  const dims = getOperationProfileDimensions(machiningComp);
  const operationOuterPoints =
    getUniversalMachiningOuterPoints(selectedComp, {
      curveSegments: 56,
      cornerSegments: 10,
      filletSegments: 10,
    }) || [];
  const operationCutoutPolygons = getUniversalMachiningCutouts(
    selectedComp,
  )
    .filter(
      (cutout) =>
        getUniversalMachiningCutoutStatus(selectedComp, cutout).valid,
    )
    .map((cutout) =>
      getProfileCutoutLocalPoints(
        cutout,
        cutout.type === "round" ? 48 : 4,
      ),
    );
  const status = active
    ? getUniversalMachiningOperationStatus(
        selectedComp,
        active,
        {
          outerPoints: operationOuterPoints,
          cutoutPolygons: operationCutoutPolygons,
        },
      )
    : null;
  const disabled =
    editorMode !== "editable" || isLocked(selectedComp);

  const commit = (nextOperations) => {
    onChange(selectedComp.id, {
      woodworkingOperations: normalizeWoodworkingOperations(
        nextOperations,
      ),
    });
  };

  const addOperation = () => {
    if (
      disabled ||
      operations.length >= MAX_WOODWORKING_OPERATIONS
    ) {
      return;
    }

    const created = createWoodworkingOperation(
      machiningComp,
      draftType,
    );
    const next = [...operations, created];
    commit(next);
    setActiveId(created.id);
  };

  const updateActive = (attrs) => {
    if (!active) return;
    commit(
      updateWoodworkingOperation(
        operations,
        active.id,
        attrs,
      ),
    );
  };

  const removeActive = () => {
    if (!active) return;
    const next = deleteWoodworkingOperation(
      operations,
      active.id,
    );
    commit(next);
    setActiveId(next[0]?.id || "");
  };

  const toScreen = (u, v) => {
    const width = 240;
    const height = 150;
    const padding = 16;
    const usableW = width - padding * 2;
    const usableH = height - padding * 2;

    return [
      padding + (u / Math.max(1, dims.u) + 0.5) * usableW,
      padding + (0.5 - v / Math.max(1, dims.v)) * usableH,
    ];
  };

  const preview = (() => {
    if (!active) return null;

    const footprint = getWoodworkingOperationFootprint(
      machiningComp,
      active,
    );

    if (footprint.shape === "circle") {
      const [cx, cy] = toScreen(
        footprint.centerU,
        footprint.centerV,
      );
      const [rx] = toScreen(
        footprint.centerU + footprint.radius,
        footprint.centerV,
      );
      const [, ry] = toScreen(
        footprint.centerU,
        footprint.centerV + footprint.radius,
      );

      return (
        <ellipse
          cx={cx}
          cy={cy}
          rx={Math.max(2, Math.abs(rx - cx))}
          ry={Math.max(2, Math.abs(ry - cy))}
          fill="rgba(245, 158, 11, 0.30)"
          stroke="#f59e0b"
          strokeWidth="2"
        />
      );
    }

    const [left, top] = toScreen(
      footprint.minU,
      footprint.maxV,
    );
    const [right, bottom] = toScreen(
      footprint.maxU,
      footprint.minV,
    );

    return (
      <rect
        x={Math.min(left, right)}
        y={Math.min(top, bottom)}
        width={Math.max(2, Math.abs(right - left))}
        height={Math.max(2, Math.abs(bottom - top))}
        fill="rgba(245, 158, 11, 0.30)"
        stroke="#f59e0b"
        strokeWidth="2"
      />
    );
  })();

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: "1px solid #243247",
      }}
    >
      <div
        style={{
          color: "#f8fafc",
          fontSize: 10,
          fontWeight: 850,
          marginBottom: 4,
        }}
      >
        Machining Operations
      </div>

      <div
        style={{
          color: "#8fa3bd",
          fontSize: 8,
          lineHeight: 1.45,
          marginBottom: 8,
        }}
      >
        Add a dado, rabbet, groove, pocket, or drill operation. Invalid
        operations stay saved for correction but are not applied in 3D.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <select
          value={draftType}
          disabled={disabled}
          onChange={(event) =>
            setDraftType(event.target.value)
          }
          style={inputStyle}
        >
          {WOODWORKING_OPERATION_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={
            disabled ||
            operations.length >= MAX_WOODWORKING_OPERATIONS
          }
          onClick={addOperation}
          style={{
            minWidth: 70,
            border: "1px solid #854d0e",
            borderRadius: 0,
            background: "#211b0b",
            color: "#fef3c7",
            fontSize: 8,
            fontWeight: 800,
          }}
        >
          + Add
        </button>
      </div>

      {operations.length ? (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: 8,
            }}
          >
            {operations.map((item, index) => (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => setActiveId(item.id)}
                style={{
                  minWidth: 44,
                  height: 26,
                  padding: "0 6px",
                  border: `1px solid ${
                    active?.id === item.id
                      ? "#f59e0b"
                      : "#334155"
                  }`,
                  borderRadius: 0,
                  background:
                    active?.id === item.id
                      ? "#451a03"
                      : "#0f172a",
                  color:
                    active?.id === item.id
                      ? "#fef3c7"
                      : "#94a3b8",
                  fontSize: 8,
                  fontWeight: 800,
                }}
              >
                O{index + 1}
              </button>
            ))}
          </div>

          <svg
            viewBox="0 0 240 150"
            preserveAspectRatio="none"
            style={{
              width: "100%",
              height: 150,
              display: "block",
              border: "1px solid #334155",
              borderRadius: 0,
              background: "#08111f",
              marginBottom: 8,
            }}
          >
            <rect
              x="16"
              y="16"
              width="208"
              height="118"
              fill="rgba(148, 163, 184, 0.10)"
              stroke="#64748b"
              strokeWidth="1.5"
            />
            {preview}
          </svg>

          <div
            style={{
              padding: 7,
              marginBottom: 8,
              border: `1px solid ${
                status?.valid ? "#365314" : "#7f1d1d"
              }`,
              borderRadius: 0,
              background: status?.valid
                ? "rgba(54,83,20,0.12)"
                : "rgba(127,29,29,0.12)",
              color: status?.valid
                ? "#d9f99d"
                : "#fecaca",
              fontSize: 8,
              lineHeight: 1.4,
            }}
          >
            {status?.valid ? "VALID" : "CHECK"} ·{" "}
            {status?.message}
          </div>

          <div
            style={{
              marginBottom: 7,
              color: "#fde68a",
              fontSize: 9,
              fontWeight: 850,
            }}
          >
            {getOperationLabel(active?.type)} ·{" "}
            {active?.surface === "face_b"
              ? "Face B"
              : "Face A"}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              marginBottom: 7,
            }}
          >
            <div>
              <label style={{ fontSize: 8, color: "#94a3b8" }}>
                Surface
              </label>
              <select
                value={active?.surface || "face_a"}
                disabled={disabled}
                onChange={(event) =>
                  updateActive({
                    surface: event.target.value,
                  })
                }
                style={inputStyle}
              >
                <option value="face_a">{surfaceLabels.face_a}</option>
                <option value="face_b">{surfaceLabels.face_b}</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 8, color: "#94a3b8" }}>
                Depth (mm)
              </label>
              <input
                type="number"
                min="0.1"
                step="0.5"
                value={active?.depth ?? 1}
                disabled={disabled}
                onChange={(event) =>
                  updateActive({
                    depth: Math.max(
                      0.1,
                      Number(event.target.value) || 0.1,
                    ),
                  })
                }
                style={inputStyle}
              />
            </div>
          </div>

          {active?.type === "rabbet" ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginBottom: 7,
                }}
              >
                <div>
                  <label style={{ fontSize: 8, color: "#94a3b8" }}>
                    Edge
                  </label>
                  <select
                    value={active.edge}
                    disabled={disabled}
                    onChange={(event) =>
                      updateActive({
                        edge: event.target.value,
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="top">Top</option>
                    <option value="right">Right</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 8, color: "#94a3b8" }}>
                    Width Into Board (mm)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={active.width}
                    disabled={disabled}
                    onChange={(event) =>
                      updateActive({
                        width: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginBottom: 7,
                }}
              >
                <div>
                  <label style={{ fontSize: 8, color: "#94a3b8" }}>
                    {active.edge === "left" ||
                    active.edge === "right"
                      ? "Offset From Bottom (mm)"
                      : "Offset From Left (mm)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={active.offset || 0}
                    disabled={disabled}
                    onChange={(event) =>
                      updateActive({
                        offset: Math.max(
                          0,
                          Number(event.target.value) || 0,
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 8, color: "#94a3b8" }}>
                    Length Along Edge (mm)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={active.length}
                    disabled={disabled}
                    onChange={(event) =>
                      updateActive({
                        length: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>
              </div>

              <div
                style={{
                  marginBottom: 7,
                  color: "#64748b",
                  fontSize: 8,
                  lineHeight: 1.4,
                }}
              >
                Top/Bottom offset starts from the left side. Left/Right offset
                starts from the bottom side. Length now controls the exact
                segment along the selected edge.
              </div>
            </>
          ) : active?.type === "bore" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                marginBottom: 7,
              }}
            >
              <div>
                <label style={{ fontSize: 8, color: "#94a3b8" }}>
                  Horizontal Position (mm)
                </label>
                <input
                  type="number"
                  step="1"
                  value={active.u}
                  disabled={disabled}
                  onChange={(event) =>
                    updateActive({
                      u: Number(event.target.value) || 0,
                    })
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 8, color: "#94a3b8" }}>
                  Vertical Position (mm)
                </label>
                <input
                  type="number"
                  step="1"
                  value={active.v}
                  disabled={disabled}
                  onChange={(event) =>
                    updateActive({
                      v: Number(event.target.value) || 0,
                    })
                  }
                  style={inputStyle}
                />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={{ fontSize: 8, color: "#94a3b8" }}>
                  Diameter (mm)
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={active.diameter}
                  disabled={disabled}
                  onChange={(event) =>
                    updateActive({
                      diameter: Math.max(
                        0.1,
                        Number(event.target.value) || 0.1,
                      ),
                    })
                  }
                  style={inputStyle}
                />
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginBottom: 7,
                }}
              >
                <div>
                  <label style={{ fontSize: 8, color: "#94a3b8" }}>
                    Horizontal Position (mm)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={active.u}
                    disabled={disabled}
                    onChange={(event) =>
                      updateActive({
                        u: Number(event.target.value) || 0,
                      })
                    }
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 8, color: "#94a3b8" }}>
                    Vertical Position (mm)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={active.v}
                    disabled={disabled}
                    onChange={(event) =>
                      updateActive({
                        v: Number(event.target.value) || 0,
                      })
                    }
                    style={inputStyle}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginBottom: 7,
                }}
              >
                <div>
                  <label style={{ fontSize: 8, color: "#94a3b8" }}>
                    Direction
                  </label>
                  <select
                    value={active.direction}
                    disabled={disabled}
                    onChange={(event) =>
                      updateActive({
                        direction: event.target.value,
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="u">
                      Along {dims.uAxis}
                    </option>
                    <option value="v">
                      Along {dims.vAxis}
                    </option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 8, color: "#94a3b8" }}>
                    Width (mm)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={active.width}
                    disabled={disabled}
                    onChange={(event) =>
                      updateActive({
                        width: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 7 }}>
                <label style={{ fontSize: 8, color: "#94a3b8" }}>
                  Length (mm)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={active.length}
                  disabled={disabled}
                  onChange={(event) =>
                    updateActive({
                      length: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    })
                  }
                  style={inputStyle}
                />
              </div>
            </>
          )}

          <div style={{ marginBottom: 7 }}>
            <label style={{ fontSize: 8, color: "#94a3b8" }}>
              Production Note
            </label>
            <input
              type="text"
              maxLength="240"
              value={active?.note || ""}
              disabled={disabled}
              onChange={(event) =>
                updateActive({
                  note: event.target.value,
                })
              }
              style={inputStyle}
            />
          </div>

          <button
            type="button"
            disabled={disabled || !active}
            onClick={removeActive}
            style={{
              width: "100%",
              height: 28,
              border: "1px solid #7f1d1d",
              borderRadius: 0,
              background: "#1f1115",
              color: "#fca5a5",
              fontSize: 8,
              fontWeight: 800,
            }}
          >
            Delete Selected Operation
          </button>
        </>
      ) : (
        <div
          style={{
            padding: 8,
            border: "1px solid #243247",
            borderRadius: 0,
            color: "#64748b",
            fontSize: 8,
            lineHeight: 1.4,
          }}
        >
          No woodworking operations yet.
        </div>
      )}

      <div
        style={{
          marginTop: 6,
          color: "#64748b",
          fontSize: 8,
          lineHeight: 1.4,
        }}
      >
        {operations.length}/{MAX_WOODWORKING_OPERATIONS} operations · {getMachiningPlaneLabel(dims.plane)} · thickness {Math.round(dims.thickness)} mm.
      </div>
    </div>
  );
}
function getWoodFinishSwatchColor(finish = null, fallback = "#d9c2a5") {
  return (
    finish?.front ||
    finish?.carcass ||
    finish?.inside ||
    finish?.edge ||
    fallback
  );
}

function WoodFinishPicker({
  value = "",
  customColor = "#d9c2a5",
  disabled = false,
  onChange,
}) {
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);

  const activeFinish =
    WOOD_FINISHES.find((finish) => finish.id === value) || null;

  const activeLabel = activeFinish?.label || "Custom Color";
  const activeColor = getWoodFinishSwatchColor(
    activeFinish,
    customColor || "#d9c2a5",
  );

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const handleOutsideClick = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const chooseFinish = (nextValue) => {
    if (disabled) return;
    setOpen(false);
    onChange?.(nextValue);
  };

  const optionButtonStyle = {
    width: "100%",
    minHeight: 34,
    padding: "6px 8px",
    border: "none",
    borderBottom: "1px solid rgba(71,85,105,.5)",
    borderRadius: 0,
    background: "rgba(15,23,42,.98)",
    color: "#dbeafe",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 9,
    fontWeight: 650,
    textAlign: "left",
    cursor: "pointer",
    boxSizing: "border-box",
  };

  const swatchStyle = {
    width: 18,
    height: 18,
    minWidth: 18,
    flex: "0 0 18px",
    border: "1px solid rgba(148,163,184,.72)",
    boxSizing: "border-box",
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: "relative",
        width: "100%",
        minWidth: 0,
        zIndex: open ? 80 : "auto",
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: "100%",
          minHeight: 34,
          padding: "5px 8px",
          border: "1px solid rgba(71,85,105,.78)",
          borderRadius: 0,
          background: "#0f172a",
          color: "#dbeafe",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 9,
          fontWeight: 650,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              ...swatchStyle,
              background: activeColor,
            }}
          />
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeLabel}
          </span>
        </span>

        <span
          aria-hidden="true"
          style={{
            flex: "0 0 auto",
            color: "#93a8c4",
            fontSize: 9,
            lineHeight: 1,
          }}
        >
          {open ? "^" : "v"}
        </span>
      </button>

      {open && !disabled ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            zIndex: 90,
            maxHeight: 250,
            overflowY: "auto",
            border: "1px solid rgba(71,85,105,.9)",
            borderRadius: 0,
            background: "#0f172a",
            boxShadow: "0 10px 24px rgba(0,0,0,.36)",
          }}
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => chooseFinish("")}
            style={{
              ...optionButtonStyle,
              background: !value
                ? "rgba(30,41,59,.98)"
                : optionButtonStyle.background,
              fontWeight: !value ? 800 : optionButtonStyle.fontWeight,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                ...swatchStyle,
                background: customColor || "#d9c2a5",
              }}
            />
            <span>Custom Color</span>
          </button>

          {WOOD_FINISHES.map((finish) => {
            const isActive = finish.id === value;

            return (
              <button
                key={finish.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => chooseFinish(finish.id)}
                style={{
                  ...optionButtonStyle,
                  background: isActive
                    ? "rgba(30,41,59,.98)"
                    : optionButtonStyle.background,
                  fontWeight: isActive
                    ? 800
                    : optionButtonStyle.fontWeight,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    ...swatchStyle,
                    background: getWoodFinishSwatchColor(
                      finish,
                      "#d9c2a5",
                    ),
                  }}
                />
                <span>{finish.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// WISDOM MANUAL PART FUNCTION V1.0.0
const PART_FUNCTION_OPTIONS = [
  ["auto", "Automatic"],
  ["normal", "Normal Part"],
  ["door", "Door"],
  ["drawer", "Drawer"],
];

const DOOR_HINGE_OPTIONS = [
  ["auto", "Auto"],
  ["left", "Left"],
  ["right", "Right"],
];

const getPartFunctionChoice = (component = {}) => {
  const value = String(
    component?.partFunction ??
      component?.part_function ??
      component?.interactionType ??
      component?.interaction_type ??
      "auto",
  )
    .trim()
    .toLowerCase();

  return ["auto", "normal", "door", "drawer"].includes(value)
    ? value
    : "auto";
};

const getDoorHingeChoice = (component = {}) => {
  const value = String(
    component?.doorHinge ??
      component?.door_hinge ??
      component?.hingeSide ??
      component?.hinge_side ??
      "auto",
  )
    .trim()
    .toLowerCase();

  if (value.startsWith("l")) return "left";
  if (value.startsWith("r")) return "right";
  return "auto";
};

// WISDOM MANUAL MOVING GROUPS V1.1.0
const createManualMotionGroupId = (partFunction = "part") => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 9);
  return `manual-${partFunction}-${timestamp}-${random}`;
};

export function PropertiesPanel({
  selectedComp: committedSelectedComp,
  liveSelectedComp = null,
  selectedIds = [],
  selectedComponents = [],
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
  const partFunction = getPartFunctionChoice(selectedComp);
  const doorHinge = getDoorHingeChoice(selectedComp);

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

  const createSelectionMotionGroup = (nextFunction) => {
    if (
      !selectedComp ||
      selectedIds.length < 2 ||
      !["door", "drawer"].includes(nextFunction)
    ) {
      return;
    }

    const motionGroupId = createManualMotionGroupId(nextFunction);

    onChange(
      selectedComp.id,
      {
        partFunction: nextFunction,
        motionGroupId,
        // The current primary selected part becomes the movement reference.
        // Every member stores the same reference id so Save/Reload is stable.
        motionReferencePartId: selectedComp.id,
        doorHinge: "auto",
      },
      {
        applyToSelection: true,
      },
    );
  };

  const clearSelectionMotionGroup = () => {
    if (!selectedComp || selectedIds.length < 2) return;

    onChange(
      selectedComp.id,
      {
        partFunction: "auto",
        motionGroupId: "",
        motionReferencePartId: "",
        doorHinge: "auto",
      },
      {
        applyToSelection: true,
      },
    );
  };

  // WISDOM MANUAL DOOR DRAWER FINAL UI V2.0.0
  const motionSelection = Array.isArray(selectedComponents)
    ? selectedComponents.filter((item) => item?.id)
    : [];

  const getMotionGroupIdForUi = (component = {}) =>
    String(
      component?.motionGroupId ??
        component?.motion_group_id ??
        "",
    ).trim();

  const getMotionFunctionForUi = (component = {}) =>
    String(
      component?.partFunction ??
        component?.part_function ??
        "auto",
    )
      .trim()
      .toLowerCase();

  const getMotionReferenceIdForUi = (component = {}) =>
    String(
      component?.motionReferencePartId ??
        component?.motion_reference_part_id ??
        "",
    ).trim();

  const firstMotionMember = motionSelection[0] || null;
  const firstMotionGroupId = getMotionGroupIdForUi(firstMotionMember);
  const firstMotionFunction = getMotionFunctionForUi(firstMotionMember);

  const allSelectedShareMotionGroup =
    motionSelection.length > 1 &&
    !!firstMotionGroupId &&
    ["door", "drawer"].includes(firstMotionFunction) &&
    motionSelection.every(
      (item) =>
        getMotionGroupIdForUi(item) === firstMotionGroupId &&
        getMotionFunctionForUi(item) === firstMotionFunction,
    );

  const activeMovingGroupType = allSelectedShareMotionGroup
    ? firstMotionFunction
    : "";

  const selectionHasAnyMovingGroup = motionSelection.some(
    (item) => !!getMotionGroupIdForUi(item),
  );

  const selectionHasMixedMovingGroups =
    motionSelection.length > 1 &&
    !allSelectedShareMotionGroup &&
    selectionHasAnyMovingGroup;

  const savedMotionReferenceId =
    motionSelection
      .map(getMotionReferenceIdForUi)
      .find(Boolean) || "";

  const motionReferencePart =
    motionSelection.find(
      (item) => item.id === savedMotionReferenceId,
    ) ||
    selectedComp ||
    firstMotionMember ||
    null;

  const movingGroupStateText =
    activeMovingGroupType === "door"
      ? "Door"
      : activeMovingGroupType === "drawer"
        ? "Drawer"
        : selectionHasMixedMovingGroups
          ? "Mixed"
          : "Not Grouped";

  const movingGroupStatusStyle = {
    minHeight: 22,
    padding: "0 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    border: activeMovingGroupType
      ? "1px solid rgba(96,165,250,.64)"
      : selectionHasMixedMovingGroups
        ? "1px solid rgba(245,158,11,.52)"
        : "1px solid rgba(71,85,105,.68)",
    borderRadius: 999,
    background: activeMovingGroupType
      ? "rgba(37,99,235,.18)"
      : selectionHasMixedMovingGroups
        ? "rgba(180,83,9,.14)"
        : "rgba(15,23,42,.62)",
    color: activeMovingGroupType
      ? "#bfdbfe"
      : selectionHasMixedMovingGroups
        ? "#fde68a"
        : "#94a3b8",
    fontSize: 8,
    fontWeight: 850,
    letterSpacing: ".05em",
    textTransform: "uppercase",
  };

  const movingGroupButtonStyle = (active, disabled) => ({
    minHeight: 34,
    padding: "6px 8px",
    border: active
      ? "1px solid rgba(96,165,250,.98)"
      : "1px solid rgba(71,85,105,.76)",
    borderRadius: 0,
    background: active
      ? "rgba(37,99,235,.36)"
      : "rgba(15,23,42,.58)",
    boxShadow: active
      ? "inset 0 0 0 1px rgba(191,219,254,.10)"
      : "none",
    color: active ? "#f8fafc" : "#cbd5e1",
    fontSize: 9,
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  });

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
  const isWoodworkingProfile = isWoodworkingProfileComponent(selectedComp);
  const woodworkingProfile = isWoodworkingProfile
    ? getWoodworkingProfileDescriptor(selectedComp)
    : null;
  const machiningProfile = getUniversalMachiningDescriptor(selectedComp);
  const machiningCapability = getUniversalMachiningCapability(selectedComp);
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

            {/* WISDOM MANUAL MOVING GROUPS V1.1.0 */}
            {/* WISDOM MANUAL DOOR DRAWER FINAL UI V2.0.0 */}
            <div style={inspectorSectionStyle}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    ...inspectorSectionTitleStyle,
                    marginBottom: 0,
                  }}
                >
                  Moving Parts
                </div>

                <span style={movingGroupStatusStyle}>
                  {movingGroupStateText}
                </span>
              </div>

              <div
                style={{
                  marginBottom: 10,
                  color: "#7f93ad",
                  fontSize: 9,
                  lineHeight: 1.45,
                }}
              >
                Set the selected pieces to move together as one door or drawer.
              </div>

              <div
                style={{
                  marginBottom: 10,
                  padding: "9px 10px",
                  border: "1px solid rgba(71,85,105,.56)",
                  borderRadius: 0,
                  background: "rgba(15,23,42,.46)",
                }}
              >
                <div
                  style={{
                    marginBottom: 4,
                    color: "#8497b1",
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                  }}
                >
                  Reference Part
                </div>

                <div
                  style={{
                    color: "#e5eefc",
                    fontSize: 10,
                    fontWeight: 800,
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                  }}
                >
                  {motionReferencePart?.label ||
                    motionReferencePart?.partCode ||
                    "Primary selected part"}
                </div>

                <div
                  style={{
                    marginTop: 5,
                    color: "#64748b",
                    fontSize: 8,
                    lineHeight: 1.4,
                  }}
                >
                  Select the front panel last before choosing Door or Drawer.
                </div>
              </div>

              <div
                style={{
                  marginBottom: 7,
                  color: "#9fb1c9",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                }}
              >
                Movement Type
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 6,
                }}
              >
                <button
                  type="button"
                  aria-pressed={activeMovingGroupType === "door"}
                  disabled={
                    editorMode !== "editable" ||
                    Number(selectionSummary?.lockedCount || 0) > 0
                  }
                  onClick={() => {
                    if (activeMovingGroupType !== "door") {
                      createSelectionMotionGroup("door");
                    }
                  }}
                  style={movingGroupButtonStyle(
                    activeMovingGroupType === "door",
                    editorMode !== "editable" ||
                      Number(selectionSummary?.lockedCount || 0) > 0,
                  )}
                >
                  Door
                </button>

                <button
                  type="button"
                  aria-pressed={activeMovingGroupType === "drawer"}
                  disabled={
                    editorMode !== "editable" ||
                    Number(selectionSummary?.lockedCount || 0) > 0
                  }
                  onClick={() => {
                    if (activeMovingGroupType !== "drawer") {
                      createSelectionMotionGroup("drawer");
                    }
                  }}
                  style={movingGroupButtonStyle(
                    activeMovingGroupType === "drawer",
                    editorMode !== "editable" ||
                      Number(selectionSummary?.lockedCount || 0) > 0,
                  )}
                >
                  Drawer
                </button>
              </div>

              {selectionHasAnyMovingGroup ? (
                <button
                  type="button"
                  disabled={
                    editorMode !== "editable" ||
                    Number(selectionSummary?.lockedCount || 0) > 0
                  }
                  onClick={clearSelectionMotionGroup}
                  style={{
                    width: "100%",
                    minHeight: 30,
                    marginTop: 7,
                    padding: "5px 8px",
                    border: "1px solid rgba(71,85,105,.76)",
                    borderRadius: 0,
                    background: "rgba(15,23,42,.55)",
                    color: "#cbd5e1",
                    fontSize: 8.5,
                    fontWeight: 800,
                    cursor:
                      editorMode !== "editable" ||
                      Number(selectionSummary?.lockedCount || 0) > 0
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      editorMode !== "editable" ||
                      Number(selectionSummary?.lockedCount || 0) > 0
                        ? 0.45
                        : 1,
                  }}
                >
                  Remove Group
                </button>
              ) : null}

              {selectionHasMixedMovingGroups ? (
                <div
                  style={{
                    marginTop: 7,
                    color: "#fde68a",
                    fontSize: 8,
                    lineHeight: 1.4,
                  }}
                >
                  The selection contains different moving groups. Choose Door
                  or Drawer to create one new group from the selected parts.
                </div>
              ) : null}

              {Number(selectionSummary?.lockedCount || 0) > 0 ? (
                <div
                  style={{
                    marginTop: 7,
                    color: "#fca5a5",
                    fontSize: 8,
                    lineHeight: 1.4,
                  }}
                >
                  Unlock all selected parts before changing the movement type.
                </div>
              ) : null}
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

            {/* WISDOM MANUAL PART FUNCTION V1.0.0 */}
            <div style={inspectorSectionStyle}>
              <div style={inspectorSectionTitleStyle}>Part Function</div>

              <div
                style={{
                  marginBottom: 9,
                  color: "#7f93ad",
                  fontSize: 9,
                  lineHeight: 1.45,
                }}
              >
                Choose how this part behaves in the 3D movement preview.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 6,
                }}
              >
                {PART_FUNCTION_OPTIONS.map(([value, label]) => {
                  const active = partFunction === value;
                  const disabled =
                    editorMode !== "editable" || isLocked(selectedComp);

                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (active) return;

                        // Reclassifying one part explicitly removes it from any
                        // prior manual moving group. This prevents stale group
                        // ids from silently reconnecting the part later.
                        onChange(selectedComp.id, {
                          partFunction: value,
                          motionGroupId: "",
                          motionReferencePartId: "",
                          doorHinge:
                            value === "door" ? doorHinge : "auto",
                        });
                      }}
                      style={{
                        minHeight: 30,
                        padding: "5px 7px",
                        border: active
                          ? "1px solid rgba(96,165,250,.92)"
                          : "1px solid rgba(71,85,105,.72)",
                        borderRadius: 0,
                        background: active
                          ? "rgba(37,99,235,.24)"
                          : "rgba(15,23,42,.55)",
                        color: active ? "#dbeafe" : "#94a3b8",
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

              <div
                style={{
                  marginTop: 8,
                  padding: "7px 8px",
                  border: "1px solid rgba(71,85,105,.52)",
                  borderRadius: 0,
                  background: "rgba(15,23,42,.42)",
                  color: "#93a8c4",
                  fontSize: 8,
                  lineHeight: 1.45,
                }}
              >
                {partFunction === "door"
                  ? "Opens as a door."
                  : partFunction === "drawer"
                    ? "Slides as a drawer."
                    : partFunction === "normal"
                      ? "Stays fixed."
                      : "Uses the existing part type automatically."}
              </div>

              {partFunction === "door" ? (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      marginBottom: 6,
                      color: "#9fb1c9",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  >
                    Door Hinge
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 5,
                    }}
                  >
                    {DOOR_HINGE_OPTIONS.map(([value, label]) => {
                      const active = doorHinge === value;
                      const disabled =
                        editorMode !== "editable" || isLocked(selectedComp);

                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            onChange(selectedComp.id, {
                              doorHinge: value,
                            })
                          }
                          style={{
                            minHeight: 28,
                            padding: "4px 5px",
                            border: active
                              ? "1px solid rgba(96,165,250,.9)"
                              : "1px solid rgba(71,85,105,.72)",
                            borderRadius: 0,
                            background: active
                              ? "rgba(37,99,235,.24)"
                              : "rgba(15,23,42,.55)",
                            color: active ? "#dbeafe" : "#94a3b8",
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

                  <div
                    style={{
                      marginTop: 6,
                      color: "#64748b",
                      fontSize: 8,
                      lineHeight: 1.4,
                    }}
                  >
                    Auto uses the existing part data. Choose Left or Right
                    when the hinge side needs to be fixed.
                  </div>
                </div>
              ) : null}
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

            {isWoodworkingProfile && woodworkingProfile ? (
              <div
                style={{
                  ...infoCardStyle,
                  marginBottom: 10,
                  padding: 10,
                  color: "#c8d5e8",
                  fontSize: 9,
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    marginBottom: 8,
                    color: "#e5eefc",
                    fontSize: 10,
                    fontWeight: 850,
                  }}
                >
                  {woodworkingProfile.label}
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={S.floatingLabel}>Profile Face</label>
                  <select
                    value={selectedComp.profilePlane || "auto"}
                    disabled={editorMode !== "editable" || isLocked(selectedComp)}
                    onChange={(e) =>
                      onChange(selectedComp.id, {
                        profilePlane: e.target.value,
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="auto">Auto - thinnest dimension is thickness</option>
                    <option value="xy">Front / Back profile (Width × Height)</option>
                    <option value="xz">Top / Bottom profile (Width × Depth)</option>
                    <option value="yz">Left / Right profile (Depth × Height)</option>
                  </select>
                </div>

                <div
                  style={{
                    marginBottom: 8,
                    color: "#8fa3bd",
                    fontSize: 9,
                    lineHeight: 1.45,
                  }}
                >
                  Active profile: {woodworkingProfile.plane.toUpperCase()} ·
                  thickness {Math.round(woodworkingProfile.thickness)} mm.
                  2D and 3D use this same saved profile.
                </div>

                {supportsProfileFillet(woodworkingProfile.kind) ? (
                  <div style={{ marginBottom: 10 }}>
                    <label style={S.floatingLabel}>
                      Corner Fillet Radius (mm) — current:{" "}
                      {Math.round(
                        woodworkingProfile.profileFilletRadius || 0,
                      )}
                      mm
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(
                        0,
                        Math.floor(
                          woodworkingProfile.limits.filletRadiusMax,
                        ),
                      )}
                      step="1"
                      value={Math.round(
                        woodworkingProfile.profileFilletRadius || 0,
                      )}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) => {
                        const maxRadius = Math.max(
                          0,
                          Math.floor(
                            woodworkingProfile.limits.filletRadiusMax,
                          ),
                        );

                        onChange(selectedComp.id, {
                          profileFilletRadius: Math.max(
                            0,
                            Math.min(
                              maxRadius,
                              Number(e.target.value) || 0,
                            ),
                          ),
                        });
                      }}
                      style={{
                        width: "100%",
                        accentColor: "#3b82f6",
                      }}
                    />
                    <input
                      type="number"
                      min="0"
                      max={Math.max(
                        0,
                        Math.floor(
                          woodworkingProfile.limits.filletRadiusMax,
                        ),
                      )}
                      step="1"
                      value={Math.round(
                        woodworkingProfile.profileFilletRadius || 0,
                      )}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) => {
                        const maxRadius = Math.max(
                          0,
                          Math.floor(
                            woodworkingProfile.limits.filletRadiusMax,
                          ),
                        );

                        onChange(selectedComp.id, {
                          profileFilletRadius: Math.max(
                            0,
                            Math.min(
                              maxRadius,
                              Number(e.target.value) || 0,
                            ),
                          ),
                        });
                      }}
                      style={inputStyle}
                    />
                  </div>
                ) : null}

                {woodworkingProfile.kind === "rounded" ? (
                  <div style={{ marginBottom: 10 }}>
                    <label style={S.floatingLabel}>
                      Profile Corner Radius (mm) — current:{" "}
                      {Math.round(woodworkingProfile.radius)}mm
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(
                        0,
                        Math.floor(woodworkingProfile.limits.radiusMax),
                      )}
                      step="1"
                      value={Math.round(woodworkingProfile.radius)}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        onChange(selectedComp.id, {
                          profileRadius: Math.max(
                            0,
                            Math.min(
                              Math.floor(
                                woodworkingProfile.limits.radiusMax,
                              ),
                              Number(e.target.value) || 0,
                            ),
                          ),
                        })
                      }
                      style={{
                        width: "100%",
                        accentColor: "#3b82f6",
                      }}
                    />
                    <input
                      type="number"
                      min="0"
                      max={Math.max(
                        0,
                        Math.floor(woodworkingProfile.limits.radiusMax),
                      )}
                      step="1"
                      value={Math.round(woodworkingProfile.radius)}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        onChange(selectedComp.id, {
                          profileRadius: Math.max(
                            0,
                            Math.min(
                              Math.floor(
                                woodworkingProfile.limits.radiusMax,
                              ),
                              Number(e.target.value) || 0,
                            ),
                          ),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                ) : null}

                {woodworkingProfile.kind === "chamfer" ? (
                  <div style={{ marginBottom: 10 }}>
                    <label style={S.floatingLabel}>
                      Chamfer Size (mm) — current:{" "}
                      {Math.round(woodworkingProfile.chamferSize)}mm
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(
                        0,
                        Math.floor(
                          woodworkingProfile.limits.chamferMax,
                        ),
                      )}
                      step="1"
                      value={Math.round(woodworkingProfile.chamferSize)}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        onChange(selectedComp.id, {
                          chamferSize: Math.max(
                            0,
                            Math.min(
                              Math.floor(
                                woodworkingProfile.limits.chamferMax,
                              ),
                              Number(e.target.value) || 0,
                            ),
                          ),
                        })
                      }
                      style={{
                        width: "100%",
                        accentColor: "#3b82f6",
                      }}
                    />
                    <input
                      type="number"
                      min="0"
                      max={Math.max(
                        0,
                        Math.floor(
                          woodworkingProfile.limits.chamferMax,
                        ),
                      )}
                      step="1"
                      value={Math.round(woodworkingProfile.chamferSize)}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        onChange(selectedComp.id, {
                          chamferSize: Math.max(
                            0,
                            Math.min(
                              Math.floor(
                                woodworkingProfile.limits.chamferMax,
                              ),
                              Number(e.target.value) || 0,
                            ),
                          ),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                ) : null}

                {woodworkingProfile.kind === "notch" ? (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <label style={S.floatingLabel}>Notch Edge</label>
                      <select
                        value={woodworkingProfile.notchEdge}
                        disabled={
                          editorMode !== "editable" || isLocked(selectedComp)
                        }
                        onChange={(e) =>
                          onChange(selectedComp.id, {
                            notchEdge: e.target.value,
                          })
                        }
                        style={inputStyle}
                      >
                        <option value="top">Top</option>
                        <option value="right">Right</option>
                        <option value="bottom">Bottom</option>
                        <option value="left">Left</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={S.floatingLabel}>
                        Notch Width (mm) — current:{" "}
                        {Math.round(woodworkingProfile.notchWidth)}mm
                      </label>
                      <input
                        type="range"
                        min="1"
                        max={Math.max(
                          1,
                          Math.floor(
                            woodworkingProfile.limits.notchSpanMax,
                          ),
                        )}
                        step="1"
                        value={Math.round(woodworkingProfile.notchWidth)}
                        disabled={
                          editorMode !== "editable" || isLocked(selectedComp)
                        }
                        onChange={(e) =>
                          onChange(selectedComp.id, {
                            notchWidth: Math.max(
                              1,
                              Math.min(
                                Math.floor(
                                  woodworkingProfile.limits.notchSpanMax,
                                ),
                                Number(e.target.value) || 1,
                              ),
                            ),
                          })
                        }
                        style={{
                          width: "100%",
                          accentColor: "#3b82f6",
                        }}
                      />
                      <input
                        type="number"
                        min="1"
                        max={Math.max(
                          1,
                          Math.floor(
                            woodworkingProfile.limits.notchSpanMax,
                          ),
                        )}
                        step="1"
                        value={Math.round(woodworkingProfile.notchWidth)}
                        disabled={
                          editorMode !== "editable" || isLocked(selectedComp)
                        }
                        onChange={(e) =>
                          onChange(selectedComp.id, {
                            notchWidth: Math.max(
                              1,
                              Math.min(
                                Math.floor(
                                  woodworkingProfile.limits.notchSpanMax,
                                ),
                                Number(e.target.value) || 1,
                              ),
                            ),
                          })
                        }
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={S.floatingLabel}>
                        Notch Depth (mm) — current:{" "}
                        {Math.round(woodworkingProfile.notchDepth)}mm
                      </label>
                      <input
                        type="range"
                        min="1"
                        max={Math.max(
                          1,
                          Math.floor(
                            woodworkingProfile.limits.notchDepthMax,
                          ),
                        )}
                        step="1"
                        value={Math.round(woodworkingProfile.notchDepth)}
                        disabled={
                          editorMode !== "editable" || isLocked(selectedComp)
                        }
                        onChange={(e) =>
                          onChange(selectedComp.id, {
                            notchDepth: Math.max(
                              1,
                              Math.min(
                                Math.floor(
                                  woodworkingProfile.limits.notchDepthMax,
                                ),
                                Number(e.target.value) || 1,
                              ),
                            ),
                          })
                        }
                        style={{
                          width: "100%",
                          accentColor: "#3b82f6",
                        }}
                      />
                      <input
                        type="number"
                        min="1"
                        max={Math.max(
                          1,
                          Math.floor(
                            woodworkingProfile.limits.notchDepthMax,
                          ),
                        )}
                        step="1"
                        value={Math.round(woodworkingProfile.notchDepth)}
                        disabled={
                          editorMode !== "editable" || isLocked(selectedComp)
                        }
                        onChange={(e) =>
                          onChange(selectedComp.id, {
                            notchDepth: Math.max(
                              1,
                              Math.min(
                                Math.floor(
                                  woodworkingProfile.limits.notchDepthMax,
                                ),
                                Number(e.target.value) || 1,
                              ),
                            ),
                          })
                        }
                        style={inputStyle}
                      />
                    </div>
                  </>
                ) : null}

                {woodworkingProfile.kind === "oval" ? (
                  <div style={{ marginBottom: 10 }}>
                    <label style={S.floatingLabel}>
                      Oval Roundness (%) — current:{" "}
                      {Math.round(
                        woodworkingProfile.profileOvalRoundness ?? 100,
                      )}
                      %
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(
                        woodworkingProfile.profileOvalRoundness ?? 100,
                      )}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        onChange(selectedComp.id, {
                          profileOvalRoundness: Math.max(
                            0,
                            Math.min(
                              100,
                              Number(e.target.value) || 0,
                            ),
                          ),
                        })
                      }
                      style={{
                        width: "100%",
                        accentColor: "#3b82f6",
                      }}
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(
                        woodworkingProfile.profileOvalRoundness ?? 100,
                      )}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        onChange(selectedComp.id, {
                          profileOvalRoundness: Math.max(
                            0,
                            Math.min(
                              100,
                              Number(e.target.value) || 0,
                            ),
                          ),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                ) : null}

                {woodworkingProfile.kind === "contour" ? (
                  <ContourEditorCard
                    selectedComp={selectedComp}
                    woodworkingProfile={woodworkingProfile}
                    editorMode={editorMode}
                    isLocked={isLocked}
                    onChange={onChange}
                    inputStyle={inputStyle}
                  />
                ) : null}

                {woodworkingProfile.kind === "trapezoid" ? (
                  <div style={{ marginBottom: 10 }}>
                    <label style={S.floatingLabel}>
                      Top Width (%) — current:{" "}
                      {Math.round(
                        woodworkingProfile.profileTopRatio * 100,
                      )}
                      %
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      step="1"
                      value={Math.round(
                        woodworkingProfile.profileTopRatio * 100,
                      )}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        onChange(selectedComp.id, {
                          profileTopRatio: Math.max(
                            0.05,
                            Math.min(
                              1,
                              (Number(e.target.value) || 5) / 100,
                            ),
                          ),
                        })
                      }
                      style={{
                        width: "100%",
                        accentColor: "#3b82f6",
                      }}
                    />
                    <input
                      type="number"
                      min="5"
                      max="100"
                      step="1"
                      value={Math.round(
                        woodworkingProfile.profileTopRatio * 100,
                      )}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        onChange(selectedComp.id, {
                          profileTopRatio: Math.max(
                            0.05,
                            Math.min(
                              1,
                              (Number(e.target.value) || 5) / 100,
                            ),
                          ),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                ) : null}

                <CutoutEditorCard
                  selectedComp={selectedComp}
                  woodworkingProfile={woodworkingProfile}
                  editorMode={editorMode}
                  isLocked={isLocked}
                  onChange={onChange}
                  inputStyle={inputStyle}
                />

                <WoodworkingOperationsCard
                  selectedComp={selectedComp}
                  editorMode={editorMode}
                  isLocked={isLocked}
                  onChange={onChange}
                  inputStyle={inputStyle}
                />
              </div>
            ) : null}

            {/* WISDOM UNIVERSAL PART MACHINING V2.0.1 */}
            {!isWoodworkingProfile && selectedComp?.type !== "reference_proxy" ? (
              <div style={inspectorSectionStyle}>
                <div style={inspectorSectionTitleStyle}>Machining</div>

                {!machiningCapability.supported ? (
                  <div
                    style={{
                      padding: 9,
                      border: "1px solid rgba(120,53,15,.72)",
                      background: "rgba(120,53,15,.10)",
                      color: "#fde68a",
                      fontSize: 9,
                      lineHeight: 1.45,
                    }}
                  >
                    {machiningCapability.message}
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <label style={S.floatingLabel}>Machining Direction</label>
                      <select
                        value={selectedComp.machiningPlane || "auto"}
                        disabled={editorMode !== "editable" || isLocked(selectedComp)}
                        onChange={(event) =>
                          onChange(selectedComp.id, {
                            machiningPlane: event.target.value,
                          })
                        }
                        style={inputStyle}
                      >
                        <option value="auto">Auto - use the thinnest dimension</option>
                        <option value="xy">Front / Back</option>
                        <option value="xz">Top / Bottom</option>
                        <option value="yz">Left / Right</option>
                      </select>
                    </div>

                    <div
                      style={{
                        marginBottom: 9,
                        color: "#7f93ad",
                        fontSize: 8.5,
                        lineHeight: 1.45,
                      }}
                    >
                      Active direction: {getMachiningPlaneLabel(machiningProfile?.plane || "xy")}. The actual rendered board surface is used for the 3D cut.
                    </div>

                    <CutoutEditorCard
                      selectedComp={selectedComp}
                      woodworkingProfile={machiningProfile}
                      editorMode={editorMode}
                      isLocked={isLocked}
                      onChange={onChange}
                      inputStyle={inputStyle}
                    />

                    <WoodworkingOperationsCard
                      selectedComp={selectedComp}
                      editorMode={editorMode}
                      isLocked={isLocked}
                      onChange={onChange}
                      inputStyle={inputStyle}
                    />
                  </>
                )}
              </div>
            ) : null}

            {!isWoodworkingProfile && (
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
            )}
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
                <WoodFinishPicker
                  value={selectedComp.finish ?? ""}
                  customColor={selectedComp.fill || "#d9c2a5"}
                  disabled={editorMode !== "editable" || isLocked(selectedComp)}
                  onChange={(finishId) =>
                    applyStyleChange(
                      applyWoodFinish(selectedComp, finishId),
                    )
                  }
                />
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
