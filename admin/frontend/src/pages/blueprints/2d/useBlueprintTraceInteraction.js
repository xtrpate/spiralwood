// 2d/useBlueprintTraceInteraction.js — calibration and rectangle tracing events
import { useRef, useState } from "react";
import { snap, clamp } from "../data/utils";

const TRACE_VIEWS = ["front", "back", "left", "right", "top"];

function normalizeCalibration(referenceCalibration) {
  if (referenceCalibration && typeof referenceCalibration === "object") {
    return referenceCalibration;
  }

  return {
    points: [],
    realDistanceMm: 0,
    pixelsPerMm: 0,
    isCalibrated: false,
  };
}

export function useBlueprintTraceInteraction({
  drawingArea,
  editorMode,
  view,
  traceTool,
  newTraceType,
  activeProjectionView,
  referenceCalibration,
  setReferenceCalibration,
  setTraceObjects,
  setSelectedTraceId,
}) {
  const stageRef = useRef(null);
  const [draftTrace, setDraftTrace] = useState(null);
  const activeCalibration = normalizeCalibration(referenceCalibration);

  const getPointerPos = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    const point = stage.getPointerPosition();
    if (!point) return null;

    return {
      x: snap(
        clamp(point.x, drawingArea.x, drawingArea.x + drawingArea.w),
      ),
      y: snap(
        clamp(point.y, drawingArea.y, drawingArea.y + drawingArea.h),
      ),
    };
  };

  const handleStageMouseDown = () => {
    if (editorMode !== "reference") return;
    if (!TRACE_VIEWS.includes(view)) return;

    const pos = getPointerPos();
    if (!pos) return;

    if (traceTool === "select") {
      setSelectedTraceId?.(null);
      return;
    }

    if (traceTool === "calibrate") {
      const currentPoints = Array.isArray(activeCalibration?.points)
        ? activeCalibration.points
        : [];
      const nextPoints = [...currentPoints, pos].slice(-2);

      if (nextPoints.length < 2) {
        setReferenceCalibration({
          points: nextPoints,
          realDistanceMm: Number(activeCalibration?.realDistanceMm || 0),
          pixelsPerMm: Number(activeCalibration?.pixelsPerMm || 0),
          isCalibrated: false,
        });
        return;
      }

      const dx = Number(nextPoints[1].x) - Number(nextPoints[0].x);
      const dy = Number(nextPoints[1].y) - Number(nextPoints[0].y);
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);

      const input = window.prompt(
        "Enter real distance in mm for the selected line:",
        String(Math.round(activeCalibration?.realDistanceMm || 2400)),
      );
      const realDistanceMm = Number(input);

      if (!realDistanceMm || realDistanceMm <= 0 || !pixelDistance) {
        window.alert("Invalid measurement.");
        setReferenceCalibration({
          points: [],
          realDistanceMm: 0,
          pixelsPerMm: 0,
          isCalibrated: false,
        });
        return;
      }

      const pixelsPerMm = pixelDistance / realDistanceMm;
      setReferenceCalibration({
        points: nextPoints,
        realDistanceMm,
        pixelsPerMm,
        isCalibrated: pixelsPerMm > 0,
      });
      return;
    }

    if (traceTool === "rect") {
      setSelectedTraceId?.(null);
      const traceType = newTraceType || "door";

      setDraftTrace({
        id: `trace_${Date.now()}`,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        type: traceType,
        traceType,
        traceView: view,
        view,
        projectionView: activeProjectionView,
      });
    }
  };

  const handleStageMouseMove = () => {
    if (!draftTrace) return;
    const pos = getPointerPos();
    if (!pos) return;

    setDraftTrace((previous) =>
      previous
        ? {
            ...previous,
            width: pos.x - previous.x,
            height: pos.y - previous.y,
          }
        : previous,
    );
  };

  const handleStageMouseUp = () => {
    if (!draftTrace) return;

    const normalized = {
      ...draftTrace,
      x: Math.min(draftTrace.x, draftTrace.x + draftTrace.width),
      y: Math.min(draftTrace.y, draftTrace.y + draftTrace.height),
      width: Math.abs(draftTrace.width),
      height: Math.abs(draftTrace.height),
      traceView: draftTrace.traceView || view,
      projectionView: draftTrace.projectionView || activeProjectionView,
    };

    if (normalized.width >= 20 && normalized.height >= 20) {
      setTraceObjects((previous) => [
        ...(Array.isArray(previous) ? previous : []),
        normalized,
      ]);
    }

    setDraftTrace(null);
  };

  return {
    stageRef,
    draftTrace,
    activeCalibration,
    handleStageMouseDown,
    handleStageMouseMove,
    handleStageMouseUp,
  };
}
