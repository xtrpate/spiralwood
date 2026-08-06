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
                <>
                  <Line
                    points={[
                      screenBox.x + screenBox.w,
                      screenBox.y + screenBox.h / 2,
                      screenBox.x + screenBox.w + 30,
                      screenBox.y + screenBox.h / 2,
                    ]}
                    stroke="#475569"
                    strokeWidth={1}
                    listening={false}
                  />
                  <Text
                    x={screenBox.x + screenBox.w + 34}
                    y={screenBox.y + screenBox.h / 2 - 8}
                    text={`${comp.partCode || `P${idx + 1}`} — ${comp.label}`}
                    fontSize={10}
                    fill="#0f172a"
                    listening={false}
                  />
                </>
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

        {selectedComp && view === "exploded" && (
          <>
            <Text
              x={drawingArea.x + 8}
              y={drawingArea.y + drawingArea.h - 40}
              text={`EXPLODED PARTS: ${selectedComponents.length}`}
              fontSize={10}
              fill="#475569"
              listening={false}
            />
            <Text
              x={drawingArea.x + 8}
              y={drawingArea.y + drawingArea.h - 24}
              text="Blueprint exploded layout for fabrication and material reference."
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
