// 2d/blueprintComponents.jsx — 2D blueprint canvas composition
import React from "react";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Line,
  Group,
  Circle,
  Image as KonvaImage,
} from "react-konva";
import { formatDim } from "../data/utils";
import { renderBlueprintShape } from "./render2D";
import {
  DimensionLine,
  BlueprintTitleBlock,
  BlueprintPaper,
  PAPER_MARGIN,
} from "./blueprintPaperComponents";
import { useBlueprintCanvasModel } from "./useBlueprintCanvasModel";
import { useBlueprintTraceInteraction } from "./useBlueprintTraceInteraction";

function compactExplodedLabel(comp = {}, idx = 0) {
  const code = String(comp?.partCode || `P${idx + 1}`).trim();
  const label = String(comp?.label || "Part").replace(/\s+/g, " ").trim();
  const combined = `${code} — ${label}`;
  return combined.length <= 28 ? combined : `${combined.slice(0, 27).trimEnd()}…`;
}

function buildExplodedCalloutLayout(scaledItems = [], drawingArea) {
  if (!drawingArea || !Array.isArray(scaledItems)) return new Map();

  const layout = new Map();
  const buckets = {
    left: [],
    right: [],
    top: [],
    bottom: [],
  };

  scaledItems.forEach((item, idx) => {
    const box = item?.screenBox;
    if (!box || !item?.comp?.id) return;

    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;
    const requested = box.labelSide;
    const side = ["left", "right", "top", "bottom"].includes(requested)
      ? requested
      : centerX >= drawingArea.x + drawingArea.w / 2
        ? "right"
        : "left";

    buckets[side].push({
      id: item.comp.id,
      idx,
      centerX,
      centerY,
    });
  });

  const safeTop = drawingArea.y + 58;
  const safeBottom = drawingArea.y + drawingArea.h - 28;

  ["left", "right"].forEach((side) => {
    const items = buckets[side].sort(
      (a, b) => a.centerY - b.centerY || a.idx - b.idx,
    );
    const count = items.length;

    items.forEach((item, position) => {
      const ratio = count <= 1 ? 0.5 : position / (count - 1);
      layout.set(item.id, {
        side,
        labelY: safeTop + (safeBottom - safeTop) * ratio,
      });
    });
  });

  ["top", "bottom"].forEach((side) => {
    const items = buckets[side].sort(
      (a, b) => a.centerX - b.centerX || a.idx - b.idx,
    );
    const count = items.length;

    items.forEach((item, position) => {
      layout.set(item.id, {
        side,
        slot: position,
        slotCount: Math.max(1, count),
      });
    });
  });

  return layout;
}

function ExplodedCallout({
  comp,
  screenBox,
  idx,
  drawingArea,
  placement,
}) {
  const centerX = screenBox.x + screenBox.w / 2;
  const centerY = screenBox.y + screenBox.h / 2;
  const side =
    placement?.side ||
    screenBox.labelSide ||
    (centerX >= drawingArea.x + drawingArea.w / 2 ? "right" : "left");
  const label = compactExplodedLabel(comp, idx);
  const balloonText = String(idx + 1);
  const balloonR = 8;

  if (side === "top" || side === "bottom") {
    const slot = Number(placement?.slot) || 0;
    const slotCount = Math.max(1, Number(placement?.slotCount) || 1);
    const usableW = Math.max(220, drawingArea.w - 260);
    const slotX =
      drawingArea.x +
      (drawingArea.w - usableW) / 2 +
      usableW * ((slot + 0.5) / slotCount);
    const labelW = 150;
    const labelX = slotX - labelW / 2;
    const labelY =
      side === "top"
        ? drawingArea.y + 12
        : drawingArea.y + drawingArea.h - 24;
    const anchorY =
      side === "top" ? screenBox.y : screenBox.y + screenBox.h;
    const elbowY =
      side === "top"
        ? Math.max(labelY + 18, anchorY - 14)
        : Math.min(labelY - 8, anchorY + 14);
    const balloonY = side === "top" ? labelY + 5 : labelY + 5;

    return (
      <>
        <Line
          points={[
            centerX,
            anchorY,
            centerX,
            elbowY,
            slotX,
            elbowY,
            slotX,
            balloonY,
          ]}
          stroke="#64748b"
          strokeWidth={0.9}
          listening={false}
        />
        <Circle
          x={slotX}
          y={balloonY}
          radius={balloonR}
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth={1}
          listening={false}
        />
        <Text
          x={slotX - balloonR}
          y={balloonY - 4.5}
          width={balloonR * 2}
          align="center"
          text={balloonText}
          fontSize={7.5}
          fill="#0f172a"
          fontStyle="bold"
          listening={false}
        />
        <Text
          x={labelX}
          y={side === "top" ? labelY + 16 : labelY - 12}
          width={labelW}
          align="center"
          text={label}
          fontSize={8}
          fill="#334155"
          listening={false}
        />
      </>
    );
  }

  const labelY =
    Number.isFinite(placement?.labelY)
      ? placement.labelY
      : centerY;
  const labelW = 142;
  const leftX = drawingArea.x + 8;
  const rightX = drawingArea.x + drawingArea.w - labelW - 8;
  const labelX = side === "right" ? rightX : leftX;
  const balloonX =
    side === "right"
      ? labelX - balloonR - 6
      : labelX + labelW + balloonR + 6;
  const lineEndX =
    side === "right"
      ? balloonX - balloonR
      : balloonX + balloonR;
  const anchorX =
    side === "right"
      ? screenBox.x + screenBox.w
      : screenBox.x;
  const elbowX =
    side === "right"
      ? Math.max(anchorX + 10, lineEndX - 18)
      : Math.min(anchorX - 10, lineEndX + 18);

  return (
    <>
      <Line
        points={[
          anchorX,
          centerY,
          elbowX,
          centerY,
          elbowX,
          labelY,
          lineEndX,
          labelY,
        ]}
        stroke="#64748b"
        strokeWidth={0.9}
        listening={false}
      />
      <Circle
        x={balloonX}
        y={labelY}
        radius={balloonR}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={1}
        listening={false}
      />
      <Text
        x={balloonX - balloonR}
        y={labelY - 4.5}
        width={balloonR * 2}
        align="center"
        text={balloonText}
        fontSize={7.5}
        fill="#0f172a"
        fontStyle="bold"
        listening={false}
      />
      <Text
        x={labelX}
        y={labelY - 5}
        width={labelW}
        align={side === "right" ? "right" : "left"}
        text={label}
        fontSize={8}
        fill="#334155"
        fontStyle="bold"
        listening={false}
      />
    </>
  );
}

function Canvas2D({
  selectedComp,
  selectedComponents,
  allComponents,
  selectedLabel,
  selectedMaterialText,
  selectedDimsText,
  selectedBounds3D,
  view,
  canvasW,
  canvasH,
  showGrid,
  blueprintTitle,
  unit,
  referenceFile,
  editorMode,
  referenceCalibration,
  setReferenceCalibration,
  traceObjects,
  setTraceObjects,
  traceTool,
  selectedTraceId,
  setSelectedTraceId,
  newTraceType,
}) {
  const {
    drawingArea,
    activeProjectionView,
    referenceImage,
    referenceImageBox,
    isPdfReference,
    scaledItems,
    viewMeta,
    viewLabel,
    axisLabels,
    overallScreenBounds,
    verticalDimText,
  } = useBlueprintCanvasModel({
    selectedComponents,
    allComponents,
    selectedBounds3D,
    view,
    canvasW,
    canvasH,
    referenceFile,
    unit,
  });

  const visibleTraceObjects = Array.isArray(traceObjects) ? traceObjects : [];

  const {
    stageRef,
    draftTrace,
    activeCalibration,
    handleStageMouseDown,
    handleStageMouseMove,
    handleStageMouseUp,
  } = useBlueprintTraceInteraction({
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
  });

  const explodedCalloutLayout =
    view === "exploded"
      ? buildExplodedCalloutLayout(scaledItems, drawingArea)
      : new Map();

  const gridLines = () => {
    if (!showGrid) return [];
    const lines = [];

    for (let x = drawingArea.x; x <= drawingArea.x + drawingArea.w; x += 20) {
      lines.push(
        <Line
          key={`gx${x}`}
          points={[x, drawingArea.y, x, drawingArea.y + drawingArea.h]}
          stroke="#e5e7eb"
          strokeWidth={0.5}
          listening={false}
        />,
      );
    }

    for (let y = drawingArea.y; y <= drawingArea.y + drawingArea.h; y += 20) {
      lines.push(
        <Line
          key={`gy${y}`}
          points={[drawingArea.x, y, drawingArea.x + drawingArea.w, y]}
          stroke="#e5e7eb"
          strokeWidth={0.5}
          listening={false}
        />,
      );
    }

    return lines;
  };

  return (
    <Stage
      ref={stageRef}
      width={canvasW}
      height={canvasH}
      onMouseDown={handleStageMouseDown}
      onMouseMove={handleStageMouseMove}
      onMouseUp={handleStageMouseUp}
    >
      <Layer>
        <BlueprintPaper canvasW={canvasW} canvasH={canvasH} />
        {referenceImage && referenceImageBox && (
          <Group listening={false}>
            <KonvaImage
              image={referenceImage}
              x={referenceImageBox.x}
              y={referenceImageBox.y}
              width={referenceImageBox.w}
              height={referenceImageBox.h}
              opacity={0.18}
            />
            <Rect
              x={referenceImageBox.x}
              y={referenceImageBox.y}
              width={referenceImageBox.w}
              height={referenceImageBox.h}
              stroke="#cbd5e1"
              strokeWidth={1}
              dash={[4, 4]}
            />
            <Text
              x={referenceImageBox.x + 8}
              y={referenceImageBox.y + 8}
              text="REFERENCE IMAGE"
              fontSize={9}
              fill="#64748b"
            />
          </Group>
        )}

        {gridLines()}

        <Text
          x={PAPER_MARGIN + 12}
          y={PAPER_MARGIN + 10}
          text={`TECHNICAL BLUEPRINT — ${viewLabel.toUpperCase()}`}
          fontSize={12}
          fill="#0f172a"
          fontStyle="bold"
          listening={false}
        />

        <Text
          x={PAPER_MARGIN + 12}
          y={PAPER_MARGIN + 28}
          text={
            selectedLabel ? selectedLabel.toUpperCase() : "NO SELECTED OBJECT"
          }
          fontSize={10}
          fill="#475569"
          listening={false}
        />

        {view === "exploded" && scaledItems.length > 0 && (
          <>
            <Text
              x={canvasW - PAPER_MARGIN - 260}
              y={PAPER_MARGIN + 10}
              width={248}
              align="right"
              text={`EXPLODED VIEW · ${scaledItems.length} PARTS`}
              fontSize={8}
              fill="#334155"
              fontStyle="bold"
              listening={false}
            />
            <Text
              x={canvasW - PAPER_MARGIN - 300}
              y={PAPER_MARGIN + 26}
              width={288}
              align="right"
              text="VISUALIZATION ONLY · MODEL POSITIONS UNCHANGED"
              fontSize={7}
              fill="#64748b"
              listening={false}
            />
          </>
        )}

        <Rect
          x={drawingArea.x}
          y={drawingArea.y}
          width={drawingArea.w}
          height={drawingArea.h}
          stroke="#cbd5e1"
          strokeWidth={1}
          dash={[5, 5]}
          listening={false}
        />

        {!scaledItems.length && !referenceImage && !isPdfReference && (
          <Group listening={false}>
            <Text
              x={drawingArea.x}
              y={drawingArea.y + drawingArea.h / 2 - 12}
              width={drawingArea.w}
              align="center"
              text="SELECT AN OBJECT FROM 3D VIEW"
              fontSize={16}
              fill="#94a3b8"
              fontStyle="bold"
            />
            <Text
              x={drawingArea.x}
              y={drawingArea.y + drawingArea.h / 2 + 12}
              width={drawingArea.w}
              align="center"
              text="Blueprint preview will appear here."
              fontSize={11}
              fill="#94a3b8"
            />
          </Group>
        )}
        {!scaledItems.length && !referenceImage && isPdfReference && (
          <Group listening={false}>
            <Rect
              x={drawingArea.x + 40}
              y={drawingArea.y + 40}
              width={drawingArea.w - 80}
              height={drawingArea.h - 80}
              stroke="#cbd5e1"
              strokeWidth={1}
              dash={[6, 4]}
              cornerRadius={8}
            />
            <Text
              x={drawingArea.x}
              y={drawingArea.y + drawingArea.h / 2 - 18}
              width={drawingArea.w}
              align="center"
              text="REFERENCE PDF LOADED"
              fontSize={16}
              fill="#64748b"
              fontStyle="bold"
            />
            <Text
              x={drawingArea.x}
              y={drawingArea.y + drawingArea.h / 2 + 8}
              width={drawingArea.w}
              align="center"
              text="PDF preview is not rendered on the canvas. Click 'Open Reference' to view the file."
              fontSize={11}
              fill="#94a3b8"
            />
          </Group>
        )}

        {scaledItems.map(({ comp, screenBox }, idx) => {
          const isSelected = comp.id === selectedComp?.id;
          const renderView = view === "exploded" ? "front" : view;

          return (
            <Group key={comp.id}>
              <Group x={screenBox.x} y={screenBox.y}>
                {renderBlueprintShape(comp, renderView, screenBox)}
                {isSelected && (
                  <Rect
                    x={-4}
                    y={-4}
                    width={screenBox.w + 8}
                    height={screenBox.h + 8}
                    stroke="#2563eb"
                    strokeWidth={1.5}
                    dash={[6, 4]}
                    listening={false}
                  />
                )}
              </Group>

              {view === "exploded" ? (
                <ExplodedCallout
                  comp={comp}
                  screenBox={screenBox}
                  idx={idx}
                  drawingArea={drawingArea}
                  placement={explodedCalloutLayout.get(comp.id)}
                />
              ) : (
                <Text
                  x={screenBox.x}
                  y={screenBox.y + screenBox.h + 6}
                  width={screenBox.w}
                  align="center"
                  text={comp.partCode || comp.label}
                  fontSize={9}
                  fill="#475569"
                  listening={false}
                />
              )}
            </Group>
          );
        })}

        {selectedComp &&
          view !== "exploded" &&
          overallScreenBounds &&
          selectedBounds3D && (
            <>
              <DimensionLine
                x1={overallScreenBounds.minX}
                y1={overallScreenBounds.minY}
                x2={overallScreenBounds.maxX}
                y2={overallScreenBounds.minY}
                offset={24}
                text={
                  view === "left" || view === "right"
                    ? formatDim(selectedBounds3D.depth, unit)
                    : formatDim(selectedBounds3D.width, unit)
                }
                orientation="horizontal"
              />

              <DimensionLine
                x1={overallScreenBounds.maxX}
                y1={overallScreenBounds.minY}
                x2={overallScreenBounds.maxX}
                y2={overallScreenBounds.maxY}
                offset={28}
                text={verticalDimText}
                orientation="vertical"
              />

              <Line
                points={[
                  drawingArea.x,
                  (overallScreenBounds.minY + overallScreenBounds.maxY) / 2,
                  drawingArea.x + drawingArea.w,
                  (overallScreenBounds.minY + overallScreenBounds.maxY) / 2,
                ]}
                stroke="#cbd5e1"
                strokeWidth={0.8}
                dash={[4, 4]}
                listening={false}
              />

              <Line
                points={[
                  (overallScreenBounds.minX + overallScreenBounds.maxX) / 2,
                  drawingArea.y,
                  (overallScreenBounds.minX + overallScreenBounds.maxX) / 2,
                  drawingArea.y + drawingArea.h,
                ]}
                stroke="#cbd5e1"
                strokeWidth={0.8}
                dash={[4, 4]}
                listening={false}
              />

              <Text
                x={drawingArea.x + 8}
                y={drawingArea.y + drawingArea.h - 40}
                text={`PARTS: ${selectedComponents.length}`}
                fontSize={10}
                fill="#475569"
                listening={false}
              />

              <Text
                x={drawingArea.x + 8}
                y={drawingArea.y + drawingArea.h - 24}
                text={`SELECTED: ${selectedComp.partCode || selectedComp.label}`}
                fontSize={10}
                fill="#475569"
                listening={false}
              />

              <Text
                x={drawingArea.x + drawingArea.w - 185}
                y={drawingArea.y + drawingArea.h - 40}
                text={`AXIS H: ${axisLabels[0]}`}
                fontSize={10}
                fill="#475569"
                listening={false}
              />

              <Text
                x={drawingArea.x + drawingArea.w - 185}
                y={drawingArea.y + drawingArea.h - 24}
                text={`AXIS V: ${axisLabels[1]}`}
                fontSize={10}
                fill="#475569"
                listening={false}
              />
            </>
          )}


        {visibleTraceObjects.map((obj) => {
          const isSelected = obj.id === selectedTraceId;

          return (
            <Rect
              key={obj.id}
              x={obj.x}
              y={obj.y}
              width={obj.width}
              height={obj.height}
              stroke={isSelected ? "#f97316" : "#ef4444"}
              strokeWidth={2}
              dash={[6, 4]}
              fill={isSelected ? "rgba(249,115,22,0.10)" : "rgba(239,68,68,0.06)"}
              onClick={(e) => {
                e.cancelBubble = true;
                setSelectedTraceId?.(obj.id);
              }}
            />
          );
        })}

        {draftTrace && (
          <Rect
            x={Math.min(draftTrace.x, draftTrace.x + draftTrace.width)}
            y={Math.min(draftTrace.y, draftTrace.y + draftTrace.height)}
            width={Math.abs(draftTrace.width)}
            height={Math.abs(draftTrace.height)}
            stroke="#f59e0b"
            strokeWidth={2}
            dash={[6, 4]}
            fill="rgba(245,158,11,0.06)"
          />
        )}
        {activeCalibration?.points?.map((p, i) => (
          <Circle
            key={`cal-${i}`}
            x={p.x}
            y={p.y}
            radius={5}
            fill="#2563eb"
          />
        ))}

        {activeCalibration?.points?.length === 2 && (
          <Line
            points={[
              activeCalibration.points[0].x,
              activeCalibration.points[0].y,
              activeCalibration.points[1].x,
              activeCalibration.points[1].y,
            ]}
            stroke="#2563eb"
            strokeWidth={2}
            dash={[4, 4]}
          />
        )}
        
        <BlueprintTitleBlock
          canvasW={canvasW}
          canvasH={canvasH}
          blueprintTitle={blueprintTitle}
          objectLabel={selectedLabel}
          viewLabel={viewLabel}
          materialText={selectedMaterialText}
          dimsText={selectedDimsText}
          unit={unit}
          scaleText="NTS"
          sheetCode={viewMeta.sheet}
        />
      </Layer>
    </Stage>
  );
}

export {
  DimensionLine,
  BlueprintTitleBlock,
  BlueprintPaper,
  Canvas2D,
};
