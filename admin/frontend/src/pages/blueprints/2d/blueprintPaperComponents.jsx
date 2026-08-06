// 2d/blueprintPaperComponents.jsx — reusable technical-sheet primitives
import React from "react";
import { Rect, Text, Line, Arrow, Group } from "react-konva";
import { getNowStamp } from "../data/utils";

export const PAPER_MARGIN = 28;
export const TITLE_BLOCK_H = 96;
export const DRAWING_PADDING = 56;

function DimensionLine({
  x1,
  y1,
  x2,
  y2,
  offset = 24,
  text,
  orientation = "horizontal",
}) {
  const dimColor = "#0f172a";
  const extColor = "#475569";

  if (orientation === "horizontal") {
    const y = y1 - offset;
    return (
      <Group listening={false}>
        <Line points={[x1, y1, x1, y]} stroke={extColor} strokeWidth={1} />
        <Line points={[x2, y2, x2, y]} stroke={extColor} strokeWidth={1} />
        <Arrow
          points={[x1, y, x2, y]}
          stroke={dimColor}
          fill={dimColor}
          strokeWidth={1}
          pointerLength={6}
          pointerWidth={5}
          pointerAtBeginning
          pointerAtEnding
        />
        <Text
          x={(x1 + x2) / 2 - 60}
          y={y - 15}
          width={120}
          align="center"
          text={text}
          fontSize={10}
          fill={dimColor}
        />
      </Group>
    );
  }

  const x = x1 + offset;
  return (
    <Group listening={false}>
      <Line points={[x1, y1, x, y1]} stroke={extColor} strokeWidth={1} />
      <Line points={[x2, y2, x, y2]} stroke={extColor} strokeWidth={1} />
      <Arrow
        points={[x, y1, x, y2]}
        stroke={dimColor}
        fill={dimColor}
        strokeWidth={1}
        pointerLength={6}
        pointerWidth={5}
        pointerAtBeginning
        pointerAtEnding
      />
      <Text
        x={x + 6}
        y={(y1 + y2) / 2 - 6}
        text={text}
        fontSize={10}
        fill={dimColor}
      />
    </Group>
  );
}

function BlueprintTitleBlock({
  canvasW,
  canvasH,
  blueprintTitle,
  objectLabel,
  viewLabel,
  materialText,
  dimsText,
  unit,
  scaleText = "NTS",
  sheetCode = "A-101",
}) {
  const x = PAPER_MARGIN;
  const y = canvasH - PAPER_MARGIN - TITLE_BLOCK_H;
  const w = canvasW - PAPER_MARGIN * 2;
  const h = TITLE_BLOCK_H;

  return (
    <Group listening={false}>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        stroke="#0f172a"
        strokeWidth={1.4}
        fill="#ffffff"
      />
      <Line
        points={[x + w - 390, y, x + w - 390, y + h]}
        stroke="#0f172a"
        strokeWidth={1}
      />
      <Line
        points={[x + w - 230, y, x + w - 230, y + h]}
        stroke="#0f172a"
        strokeWidth={1}
      />
      <Line
        points={[x + w - 120, y, x + w - 120, y + h]}
        stroke="#0f172a"
        strokeWidth={1}
      />
      <Line
        points={[x, y + 32, x + w, y + 32]}
        stroke="#0f172a"
        strokeWidth={1}
      />
      <Line
        points={[x + w - 390, y + 54, x + w, y + 54]}
        stroke="#0f172a"
        strokeWidth={1}
      />
      <Line
        points={[x + w - 390, y + 76, x + w, y + 76]}
        stroke="#0f172a"
        strokeWidth={1}
      />

      <Text
        x={x + 10}
        y={y + 8}
        text="PROJECT / BLUEPRINT TITLE"
        fontSize={9}
        fill="#64748b"
      />
      <Text
        x={x + 10}
        y={y + 36}
        text={blueprintTitle || "Blueprint Design"}
        fontSize={15}
        fontStyle="bold"
        fill="#0f172a"
      />
      <Text
        x={x + w - 380}
        y={y + 8}
        text="OBJECT"
        fontSize={9}
        fill="#64748b"
      />
      <Text
        x={x + w - 380}
        y={y + 36}
        text={objectLabel || "No Selection"}
        fontSize={12}
        fontStyle="bold"
        fill="#0f172a"
      />
      <Text x={x + w - 220} y={y + 8} text="VIEW" fontSize={9} fill="#64748b" />
      <Text
        x={x + w - 220}
        y={y + 36}
        text={viewLabel}
        fontSize={12}
        fontStyle="bold"
        fill="#0f172a"
      />
      <Text x={x + w - 110} y={y + 8} text="UNIT" fontSize={9} fill="#64748b" />
      <Text
        x={x + w - 110}
        y={y + 36}
        text={unit.toUpperCase()}
        fontSize={12}
        fontStyle="bold"
        fill="#0f172a"
      />
      <Text
        x={x + w - 380}
        y={y + 58}
        text="MATERIAL"
        fontSize={9}
        fill="#64748b"
      />
      <Text
        x={x + w - 380}
        y={y + 80}
        text={materialText || "—"}
        fontSize={10}
        fill="#0f172a"
      />
      <Text
        x={x + w - 220}
        y={y + 58}
        text="DIMENSIONS"
        fontSize={9}
        fill="#64748b"
      />
      <Text
        x={x + w - 220}
        y={y + 80}
        text={dimsText || "—"}
        fontSize={10}
        fill="#0f172a"
      />
      <Text
        x={x + w - 110}
        y={y + 58}
        text="SCALE"
        fontSize={9}
        fill="#64748b"
      />
      <Text
        x={x + w - 110}
        y={y + 80}
        text={scaleText}
        fontSize={10}
        fill="#0f172a"
      />
      <Text x={x + 10} y={y + 58} text="DATE" fontSize={9} fill="#64748b" />
      <Text
        x={x + 10}
        y={y + 80}
        text={getNowStamp()}
        fontSize={10}
        fill="#0f172a"
      />
      <Text x={x + 120} y={y + 58} text="SHEET" fontSize={9} fill="#64748b" />
      <Text
        x={x + 120}
        y={y + 80}
        text={sheetCode}
        fontSize={10}
        fill="#0f172a"
      />
    </Group>
  );
}

function BlueprintPaper({ canvasW, canvasH }) {
  const refStep = 80;
  const refs = [];

  for (
    let x = PAPER_MARGIN + refStep;
    x < canvasW - PAPER_MARGIN;
    x += refStep
  ) {
    refs.push(
      <Text
        key={`top-${x}`}
        x={x - 4}
        y={PAPER_MARGIN - 16}
        text={`${Math.round((x - PAPER_MARGIN) / refStep)}`}
        fontSize={9}
        fill="#64748b"
        listening={false}
      />,
    );
  }

  for (
    let y = PAPER_MARGIN + refStep;
    y < canvasH - PAPER_MARGIN - TITLE_BLOCK_H;
    y += refStep
  ) {
    refs.push(
      <Text
        key={`left-${y}`}
        x={PAPER_MARGIN - 18}
        y={y - 4}
        text={String.fromCharCode(
          64 + Math.round((y - PAPER_MARGIN) / refStep),
        )}
        fontSize={9}
        fill="#64748b"
        listening={false}
      />,
    );
  }

  return (
    <Group listening={false}>
      <Rect x={0} y={0} width={canvasW} height={canvasH} fill="#ffffff" />
      <Rect
        x={PAPER_MARGIN}
        y={PAPER_MARGIN}
        width={canvasW - PAPER_MARGIN * 2}
        height={canvasH - PAPER_MARGIN * 2}
        stroke="#0f172a"
        strokeWidth={1.6}
      />
      <Rect
        x={PAPER_MARGIN + 8}
        y={PAPER_MARGIN + 8}
        width={canvasW - PAPER_MARGIN * 2 - 16}
        height={canvasH - PAPER_MARGIN * 2 - 16}
        stroke="#94a3b8"
        strokeWidth={0.8}
      />
      {refs}
    </Group>
  );
}

export { DimensionLine, BlueprintTitleBlock, BlueprintPaper };
