// 2d/render2D.js — Blueprint rendering functions (SVG strings + React-Konva)
import React from "react";
import { Rect, Line, Circle, Arrow, Group, Text } from "react-konva";
import {
  CASEWORK_SET,
  TABLE_SET,
  BENCH_SET,
  CHAIR_PART_SET,
  OPEN_SHELF_SET,
} from "../data/furnitureTypes";
import {
  getProjectedBox,
  shouldMirrorView,
  getMirroredBox,
  getComponentsBounds3D,
  isChairPartType,
} from "../data/componentUtils";
import { escapeHtml, clamp } from "../data/utils";

const GRID_SIZE = 20;
const BOARD = 18;

// ── SVG string helpers (used by buildBlueprintSvgMarkup) ─────────────────────
function svgLine(x1, y1, x2, y2, extra = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra} />`;
}

function svgRect(x, y, w, h, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${extra} />`;
}

function svgText(x, y, text, extra = "") {
  return `<text x="${x}" y="${y}" ${extra}>${escapeHtml(text)}</text>`;
}

function buildSvgDimensionLine(
  x1,
  y1,
  x2,
  y2,
  text,
  orientation = "horizontal",
  offset = 24,
) {
  const dimColor = "#0f172a";
  const extColor = "#475569";

  if (orientation === "horizontal") {
    const y = y1 - offset;
    return `
      ${svgLine(x1, y1, x1, y, `stroke="${extColor}" stroke-width="1"`)}
      ${svgLine(x2, y2, x2, y, `stroke="${extColor}" stroke-width="1"`)}
      ${svgLine(x1, y, x2, y, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgLine(x1, y, x1 + 8, y - 4, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgLine(x1, y, x1 + 8, y + 4, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgLine(x2, y, x2 - 8, y - 4, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgLine(x2, y, x2 - 8, y + 4, `stroke="${dimColor}" stroke-width="1"`)}
      ${svgText((x1 + x2) / 2, y - 8, text, `fill="${dimColor}" font-size="10" text-anchor="middle"`)}
    `;
  }

  const x = x1 + offset;
  return `
    ${svgLine(x1, y1, x, y1, `stroke="${extColor}" stroke-width="1"`)}
    ${svgLine(x2, y2, x, y2, `stroke="${extColor}" stroke-width="1"`)}
    ${svgLine(x, y1, x, y2, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgLine(x, y1, x - 4, y1 + 8, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgLine(x, y1, x + 4, y1 + 8, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgLine(x, y2, x - 4, y2 - 8, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgLine(x, y2, x + 4, y2 - 8, `stroke="${dimColor}" stroke-width="1"`)}
    ${svgText(x + 8, (y1 + y2) / 2, text, `fill="${dimColor}" font-size="10"`)}
  `;
}

// ── Blueprint stroke + SVG markup ────────────────────────────────────────────
function getBlueprintStroke(comp) {
  if (comp.type === "hardware") return "#334155";
  if (comp.type === "countertop") return "#111827";
  if (comp.type === "office_chair") return "#334155";
  if (CASEWORK_SET.has(comp.type)) return "#1d4ed8";
  if (TABLE_SET.has(comp.type) || BENCH_SET.has(comp.type)) return "#92400e";
  if (
    comp.type === "sofa" ||
    comp.type === "bed_frame" ||
    comp.type === "lounger"
  )
    return "#475569";
  if (comp.type === "patio_dining_set") return "#0f766e";
  if (isChairPartType(comp.type)) return "#1f2937";
  if (comp.type === "reference_proxy") return "#64748b";
  return "#1e3a8a";
}

function buildBlueprintSvgMarkup(comp, box, view) {
  const effectiveView = view === "exploded" ? "front" : view;
  const stroke = getBlueprintStroke(comp);
  const shell = Math.max(6, Math.min(BOARD, Math.min(box.w, box.h) * 0.12));
  const midX = box.w / 2;
  const midY = box.h / 2;
  const toeKick = Math.min(14, Math.max(6, box.h * 0.12));

  const rect = (x, y, w, h, extra = "") =>
    svgRect(
      x,
      y,
      w,
      h,
      `fill="#f8fafc" stroke="${stroke}" stroke-width="1.5" ${extra}`,
    );

  const clearRect = (x, y, w, h, extra = "") =>
    svgRect(
      x,
      y,
      w,
      h,
      `fill="none" stroke="${stroke}" stroke-width="0.9" ${extra}`,
    );

  const line = (x1, y1, x2, y2, extra = "") =>
    svgLine(x1, y1, x2, y2, `stroke="${stroke}" stroke-width="1" ${extra}`);

  if (comp.type === "chair_front_leg" || comp.type === "chair_back_leg") {
    return `
      <polygon
        points="${box.w * 0.18},0 ${box.w * 0.82},0 ${box.w},${box.h} 0,${box.h}"
        fill="#ffffff"
        stroke="${stroke}"
        stroke-width="1.4"
      />
    `;
  }

  if (comp.type === "reference_proxy") {
    return `
      ${rect(0, 0, box.w, box.h, `rx="6" ry="6"`)}
      ${clearRect(
        shell,
        shell,
        Math.max(20, box.w - shell * 2),
        Math.max(20, box.h - shell * 2),
        `stroke-dasharray="5 4" rx="4" ry="4"`,
      )}
      ${line(shell, shell, box.w - shell, box.h - shell, `stroke-dasharray="4 4"`)}
      ${line(box.w - shell, shell, shell, box.h - shell, `stroke-dasharray="4 4"`)}
    `;
  }
  if (comp.type === "chair_seat_panel") {
    return `
      ${rect(0, 0, box.w, box.h, `rx="6" ry="6"`)}
      ${clearRect(shell, shell, Math.max(10, box.w - shell * 2), Math.max(8, box.h - shell * 2), `rx="4" ry="4"`)}
    `;
  }

  if (
    comp.type === "chair_front_rail" ||
    comp.type === "chair_rear_rail" ||
    comp.type === "chair_side_rail" ||
    comp.type === "chair_back_slat"
  ) {
    return `
      ${rect(0, 0, box.w, box.h)}
      ${line(0, midY, box.w, midY)}
    `;
  }

  if (TABLE_SET.has(comp.type)) {
    const legW = Math.max(8, box.w * 0.08);
    const legInset = Math.max(8, box.w * 0.12);
    const topH = Math.max(12, box.h * 0.15);

    return `
      ${rect(0, 0, box.w, topH)}
      ${rect(legInset, topH, legW, box.h - topH)}
      ${rect(box.w - legInset - legW, topH, legW, box.h - topH)}
      ${line(legInset + legW, topH + 10, box.w - legInset - legW, topH + 10, `stroke-dasharray="5 4"`)}
    `;
  }

  if (comp.type === "sofa") {
    const seatH = Math.max(18, box.h * 0.34);
    const armW = Math.max(16, box.w * 0.12);
    const backH = Math.max(18, box.h * 0.32);

    return `
      ${rect(0, box.h - seatH, box.w, seatH)}
      ${rect(0, box.h - seatH - backH, box.w, backH)}
      ${rect(0, box.h - seatH - backH + 14, armW, seatH + backH - 14)}
      ${rect(box.w - armW, box.h - seatH - backH + 14, armW, seatH + backH - 14)}
      ${line(box.w * 0.33, box.h - seatH, box.w * 0.33, box.h, `stroke-dasharray="5 4"`)}
      ${line(box.w * 0.66, box.h - seatH, box.w * 0.66, box.h, `stroke-dasharray="5 4"`)}
    `;
  }

  if (comp.type === "bed_frame") {
    const headH = Math.max(18, box.h * 0.25);
    const platformY = box.h * 0.35;

    return `
      ${rect(0, 0, box.w, headH)}
      ${rect(0, platformY, box.w, box.h - platformY)}
      ${clearRect(box.w * 0.07, platformY + 8, box.w * 0.86, box.h - platformY - 16)}
    `;
  }

  if (comp.type === "lounger") {
    return `
      ${line(0, box.h * 0.72, box.w * 0.55, box.h * 0.72, `stroke-width="2"`)}
      ${line(box.w * 0.55, box.h * 0.72, box.w, box.h * 0.2, `stroke-width="2"`)}
      ${line(0, box.h * 0.72, box.w * 0.16, box.h, `stroke-width="1.4"`)}
      ${line(box.w * 0.16, box.h, box.w * 0.6, box.h, `stroke-width="1.4"`)}
      ${line(box.w * 0.6, box.h, box.w * 0.88, box.h * 0.32, `stroke-width="1.4"`)}
    `;
  }

  if (comp.type === "office_chair") {
    const seatY = box.h * 0.46;
    const backH = box.h * 0.32;
    const baseY = box.h * 0.82;
    const cx = box.w / 2;

    return `
      ${rect(box.w * 0.25, seatY, box.w * 0.5, box.h * 0.12)}
      ${rect(box.w * 0.28, seatY - backH, box.w * 0.44, backH)}
      ${line(cx, seatY + box.h * 0.12, cx, baseY, `stroke-width="1.3"`)}
      ${line(cx, baseY, cx - box.w * 0.22, box.h, `stroke-width="1.2"`)}
      ${line(cx, baseY, cx + box.w * 0.22, box.h, `stroke-width="1.2"`)}
      ${line(cx, baseY, cx, box.h, `stroke-width="1.2"`)}
    `;
  }

  if (comp.type === "patio_dining_set") {
    return `
      ${rect(box.w * 0.32, box.h * 0.28, box.w * 0.36, box.h * 0.2)}
      ${rect(box.w * 0.12, box.h * 0.1, box.w * 0.16, box.h * 0.24)}
      ${rect(box.w * 0.72, box.h * 0.1, box.w * 0.16, box.h * 0.24)}
      ${rect(box.w * 0.12, box.h * 0.58, box.w * 0.16, box.h * 0.24)}
      ${rect(box.w * 0.72, box.h * 0.58, box.w * 0.16, box.h * 0.24)}
      ${line(box.w * 0.5, box.h * 0.48, box.w * 0.5, box.h * 0.9, `stroke-width="1.2"`)}
    `;
  }

  if (OPEN_SHELF_SET.has(comp.type)) {
    return `
      ${rect(0, 0, box.w, box.h)}
      ${clearRect(shell, shell, Math.max(20, box.w - shell * 2), Math.max(20, box.h - shell * 2))}
      ${[0.25, 0.5, 0.75].map((ratio) => line(shell, box.h * ratio, box.w - shell, box.h * ratio)).join("")}
    `;
  }

  if (
    comp.type === "dresser" ||
    comp.type === "nightstand" ||
    comp.type === "drawer"
  ) {
    const rows = Math.max(2, Math.min(4, Math.round(box.h / 42)));
    const rowH = box.h / rows;

    return `
      ${rect(0, 0, box.w, box.h)}
      ${clearRect(shell, shell, Math.max(20, box.w - shell * 2), Math.max(20, box.h - shell * 2))}
      ${Array.from({ length: rows })
        .map((_, i) => {
          const y = rowH * (i + 1);
          return `
            ${i < rows - 1 ? line(shell, y, box.w - shell, y) : ""}
            ${line(midX - 7, rowH * i + rowH / 2, midX + 7, rowH * i + rowH / 2)}
          `;
        })
        .join("")}
    `;
  }

  if (CASEWORK_SET.has(comp.type)) {
    return `
      ${rect(0, 0, box.w, box.h)}
      ${clearRect(shell, shell, Math.max(20, box.w - shell * 2), Math.max(20, box.h - shell * 2))}
      ${line(midX, shell, midX, box.h - shell)}
      ${line(midX - 8, midY - 4, midX - 8, midY + 4)}
      ${line(midX + 8, midY - 4, midX + 8, midY + 4)}
    `;
  }

  switch (comp.type) {
    case "upper_cabinet":
      return `
        ${rect(0, 0, box.w, box.h)}
        ${clearRect(shell, shell, box.w - shell * 2, box.h - shell * 2, `stroke-dasharray="5 4"`)}
        ${
          effectiveView !== "top"
            ? `
          ${line(midX, shell, midX, box.h - shell)}
          ${line(midX - 10, midY - 4, midX - 10, midY + 4)}
          ${line(midX + 10, midY - 4, midX + 10, midY + 4)}
        `
            : `
          ${line(shell, box.h - shell, box.w - shell, box.h - shell, `stroke-dasharray="6 4"`)}
          ${line(shell, shell, box.w - shell, shell)}
        `
        }
      `;

    case "base_cabinet":
    case "kitchen_cabinet":
      return `
        ${rect(0, 0, box.w, box.h)}
        ${clearRect(shell, shell, box.w - shell * 2, box.h - shell * 2 - toeKick)}
        ${
          effectiveView !== "top"
            ? `
          ${line(0, box.h - toeKick, box.w, box.h - toeKick)}
          ${line(midX, shell, midX, box.h - toeKick)}
          ${line(midX - 10, midY - 4, midX - 10, midY + 4)}
          ${line(midX + 10, midY - 4, midX + 10, midY + 4)}
        `
            : `
          ${line(shell, shell, box.w - shell, shell)}
          ${line(shell, box.h - shell, box.w - shell, box.h - shell, `stroke-dasharray="6 4"`)}
        `
        }
      `;

    case "door_single":
      return `
        ${rect(0, 0, box.w, box.h)}
        ${clearRect(shell, shell, box.w - shell * 2, box.h - shell * 2)}
        ${line(box.w - shell - 8, midY - 4, box.w - shell - 8, midY + 4)}
      `;

    case "door_double":
      return `
        ${rect(0, 0, box.w, box.h)}
        ${line(midX, shell, midX, box.h - shell)}
        ${clearRect(shell, shell, midX - shell, box.h - shell * 2)}
        ${clearRect(midX, shell, midX - shell, box.h - shell * 2)}
        ${line(midX - 8, midY - 4, midX - 8, midY + 4)}
        ${line(midX + 8, midY - 4, midX + 8, midY + 4)}
      `;

    case "shelf":
      return `
        ${rect(0, 0, box.w, box.h)}
        ${line(0, midY, box.w, midY)}
      `;

    case "countertop":
      return `
        ${rect(0, 0, box.w, box.h)}
        ${line(0, shell, box.w, shell)}
        ${line(0, box.h - shell, box.w, box.h - shell)}
      `;

    case "hardware":
      return `
        ${svgRect(0, 0, box.w, box.h, `fill="#f8fafc" stroke="${stroke}" stroke-width="1.5" rx="8" ry="8"`)}
        <circle cx="${midX}" cy="${midY}" r="${Math.min(box.w, box.h) * 0.18}" fill="none" stroke="${stroke}" stroke-width="1" />
        ${line(midX - 8, midY, midX + 8, midY)}
        ${line(midX, midY - 8, midX, midY + 8)}
      `;

    default:
      return rect(0, 0, box.w, box.h);
  }
}

// ── React-Konva 2D render functions ──────────────────────────────────────────
function renderChairLegShape(box, stroke) {
  return (
    <Line
      points={[box.w * 0.18, 0, box.w * 0.82, 0, box.w, box.h, 0, box.h]}
      closed
      fill="#ffffff"
      stroke={stroke}
      strokeWidth={1.4}
      listening={false}
    />
  );
}

function renderTableBlueprint(box, stroke) {
  const legW = Math.max(8, box.w * 0.08);
  const legInset = Math.max(8, box.w * 0.12);
  const topH = Math.max(12, box.h * 0.15);

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={box.w}
        height={topH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.6}
      />
      <Rect
        x={legInset}
        y={topH}
        width={legW}
        height={box.h - topH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.2}
      />
      <Rect
        x={box.w - legInset - legW}
        y={topH}
        width={legW}
        height={box.h - topH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.2}
      />
      <Line
        points={[
          legInset + legW,
          topH + 10,
          box.w - legInset - legW,
          topH + 10,
        ]}
        stroke={stroke}
        strokeWidth={1}
        dash={[5, 4]}
        listening={false}
      />
    </>
  );
}

function renderCaseworkBlueprint(box, stroke, mode = "doors") {
  const shell = Math.max(8, Math.min(18, Math.min(box.w, box.h) * 0.1));
  const midX = box.w / 2;
  const midY = box.h / 2;

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={box.w}
        height={box.h}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.6}
      />
      <Rect
        x={shell}
        y={shell}
        width={Math.max(20, box.w - shell * 2)}
        height={Math.max(20, box.h - shell * 2)}
        fill="rgba(255,255,255,0)"
        stroke={stroke}
        strokeWidth={0.8}
        listening={false}
      />
      {mode === "doors" && (
        <>
          <Line
            points={[midX, shell, midX, box.h - shell]}
            stroke={stroke}
            strokeWidth={1}
            listening={false}
          />
          <Line
            points={[midX - 8, midY - 4, midX - 8, midY + 4]}
            stroke={stroke}
            strokeWidth={1}
            listening={false}
          />
          <Line
            points={[midX + 8, midY - 4, midX + 8, midY + 4]}
            stroke={stroke}
            strokeWidth={1}
            listening={false}
          />
        </>
      )}
      {mode === "drawers" &&
        Array.from({
          length: Math.max(2, Math.min(4, Math.round(box.h / 42))),
        }).map((_, i, arr) => {
          const rows = arr.length;
          const rowH = box.h / rows;
          const y = rowH * (i + 1);
          return (
            <Group key={i}>
              {i < rows - 1 && (
                <Line
                  points={[shell, y, box.w - shell, y]}
                  stroke={stroke}
                  strokeWidth={1}
                  listening={false}
                />
              )}
              <Line
                points={[
                  midX - 7,
                  rowH * i + rowH / 2,
                  midX + 7,
                  rowH * i + rowH / 2,
                ]}
                stroke={stroke}
                strokeWidth={1}
                listening={false}
              />
            </Group>
          );
        })}
      {mode === "open" &&
        [0.25, 0.5, 0.75].map((ratio) => (
          <Line
            key={ratio}
            points={[shell, box.h * ratio, box.w - shell, box.h * ratio]}
            stroke={stroke}
            strokeWidth={1}
            listening={false}
          />
        ))}
    </>
  );
}

function renderSofaBlueprint(box, stroke) {
  const seatH = Math.max(18, box.h * 0.34);
  const armW = Math.max(16, box.w * 0.12);
  const backH = Math.max(18, box.h * 0.32);

  return (
    <>
      <Rect
        x={0}
        y={box.h - seatH}
        width={box.w}
        height={seatH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.5}
      />
      <Rect
        x={0}
        y={box.h - seatH - backH}
        width={box.w}
        height={backH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.2}
      />
      <Rect
        x={0}
        y={box.h - seatH - backH + 14}
        width={armW}
        height={seatH + backH - 14}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.2}
      />
      <Rect
        x={box.w - armW}
        y={box.h - seatH - backH + 14}
        width={armW}
        height={seatH + backH - 14}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.2}
      />
      <Line
        points={[box.w * 0.33, box.h - seatH, box.w * 0.33, box.h]}
        stroke={stroke}
        strokeWidth={1}
        dash={[5, 4]}
        listening={false}
      />
      <Line
        points={[box.w * 0.66, box.h - seatH, box.w * 0.66, box.h]}
        stroke={stroke}
        strokeWidth={1}
        dash={[5, 4]}
        listening={false}
      />
    </>
  );
}

function renderBedBlueprint(box, stroke) {
  const headH = Math.max(18, box.h * 0.25);
  const platformY = box.h * 0.35;

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={box.w}
        height={headH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.5}
      />
      <Rect
        x={0}
        y={platformY}
        width={box.w}
        height={box.h - platformY}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.5}
      />
      <Rect
        x={box.w * 0.07}
        y={platformY + 8}
        width={box.w * 0.86}
        height={box.h - platformY - 16}
        fill="rgba(255,255,255,0)"
        stroke={stroke}
        strokeWidth={0.9}
        listening={false}
      />
    </>
  );
}

function renderBenchBlueprint(box, stroke, withBack = false) {
  const seatH = Math.max(14, box.h * 0.18);
  const legW = Math.max(8, box.w * 0.08);
  const legInset = Math.max(8, box.w * 0.12);
  const backH = withBack ? Math.max(20, box.h * 0.3) : 0;

  return (
    <>
      <Rect
        x={0}
        y={backH}
        width={box.w}
        height={seatH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.4}
      />
      <Rect
        x={legInset}
        y={backH + seatH}
        width={legW}
        height={box.h - backH - seatH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.2}
      />
      <Rect
        x={box.w - legInset - legW}
        y={backH + seatH}
        width={legW}
        height={box.h - backH - seatH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.2}
      />
      {withBack && (
        <>
          <Rect
            x={0}
            y={0}
            width={box.w}
            height={backH}
            fill="#ffffff"
            stroke={stroke}
            strokeWidth={1.2}
          />
          <Line
            points={[0, backH * 0.5, box.w, backH * 0.5]}
            stroke={stroke}
            strokeWidth={1}
            listening={false}
          />
        </>
      )}
    </>
  );
}

function renderLoungerBlueprint(box, stroke) {
  return (
    <>
      <Line
        points={[
          0,
          box.h * 0.72,
          box.w * 0.55,
          box.h * 0.72,
          box.w,
          box.h * 0.2,
        ]}
        stroke={stroke}
        strokeWidth={2}
        listening={false}
      />
      <Line
        points={[
          0,
          box.h * 0.72,
          box.w * 0.16,
          box.h,
          box.w * 0.6,
          box.h,
          box.w * 0.88,
          box.h * 0.32,
        ]}
        stroke={stroke}
        strokeWidth={1.4}
        listening={false}
      />
      <Line
        points={[box.w * 0.16, box.h, box.w * 0.1, box.h * 0.76]}
        stroke={stroke}
        strokeWidth={1.2}
        listening={false}
      />
      <Line
        points={[box.w * 0.6, box.h, box.w * 0.55, box.h * 0.76]}
        stroke={stroke}
        strokeWidth={1.2}
        listening={false}
      />
    </>
  );
}

function renderOfficeChairBlueprint(box, stroke) {
  const seatY = box.h * 0.46;
  const backH = box.h * 0.32;
  const baseY = box.h * 0.82;
  const cx = box.w / 2;

  return (
    <>
      <Rect
        x={box.w * 0.25}
        y={seatY}
        width={box.w * 0.5}
        height={box.h * 0.12}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.4}
      />
      <Rect
        x={box.w * 0.28}
        y={seatY - backH}
        width={box.w * 0.44}
        height={backH}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.2}
      />
      <Line
        points={[cx, seatY + box.h * 0.12, cx, baseY]}
        stroke={stroke}
        strokeWidth={1.3}
        listening={false}
      />
      <Line
        points={[cx, baseY, cx - box.w * 0.22, box.h]}
        stroke={stroke}
        strokeWidth={1.2}
        listening={false}
      />
      <Line
        points={[cx, baseY, cx + box.w * 0.22, box.h]}
        stroke={stroke}
        strokeWidth={1.2}
        listening={false}
      />
      <Line
        points={[cx, baseY, cx, box.h]}
        stroke={stroke}
        strokeWidth={1.2}
        listening={false}
      />
      <Line
        points={[
          box.w * 0.25,
          seatY + box.h * 0.06,
          box.w * 0.12,
          seatY + box.h * 0.02,
        ]}
        stroke={stroke}
        strokeWidth={1}
        listening={false}
      />
      <Line
        points={[
          box.w * 0.75,
          seatY + box.h * 0.06,
          box.w * 0.88,
          seatY + box.h * 0.02,
        ]}
        stroke={stroke}
        strokeWidth={1}
        listening={false}
      />
    </>
  );
}

function renderPatioSetBlueprint(box, stroke) {
  return (
    <>
      <Rect
        x={box.w * 0.32}
        y={box.h * 0.28}
        width={box.w * 0.36}
        height={box.h * 0.2}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.4}
      />
      <Rect
        x={box.w * 0.12}
        y={box.h * 0.1}
        width={box.w * 0.16}
        height={box.h * 0.24}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.1}
      />
      <Rect
        x={box.w * 0.72}
        y={box.h * 0.1}
        width={box.w * 0.16}
        height={box.h * 0.24}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.1}
      />
      <Rect
        x={box.w * 0.12}
        y={box.h * 0.58}
        width={box.w * 0.16}
        height={box.h * 0.24}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.1}
      />
      <Rect
        x={box.w * 0.72}
        y={box.h * 0.58}
        width={box.w * 0.16}
        height={box.h * 0.24}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.1}
      />
      <Line
        points={[box.w * 0.5, box.h * 0.48, box.w * 0.5, box.h * 0.9]}
        stroke={stroke}
        strokeWidth={1.2}
        listening={false}
      />
    </>
  );
}

function renderBlueprintShape(comp, view, box) {
  const effectiveView = view === "exploded" ? "front" : view;
  const stroke = getBlueprintStroke(comp);
  const shell = Math.max(6, Math.min(BOARD, Math.min(box.w, box.h) * 0.12));
  const midX = box.w / 2;
  const midY = box.h / 2;
  const toeKick = Math.min(14, Math.max(6, box.h * 0.12));

  const outlineProps = {
    fill: "#f8fafc",
    stroke,
    strokeWidth: 1.6,
    cornerRadius: comp.type === "hardware" ? 8 : 2,
  };

  const hiddenProps = {
    stroke,
    strokeWidth: 1,
    listening: false,
    opacity: 0.6,
    dash: [6, 4],
  };

  const commonLine = {
    stroke,
    strokeWidth: 1,
    listening: false,
    opacity: 0.95,
  };

  if (comp.type === "reference_proxy") {
    return (
      <>
        <Rect
          x={0}
          y={0}
          width={box.w}
          height={box.h}
          {...outlineProps}
          cornerRadius={6}
        />
        <Rect
          x={shell}
          y={shell}
          width={Math.max(20, box.w - shell * 2)}
          height={Math.max(20, box.h - shell * 2)}
          fill="rgba(255,255,255,0)"
          stroke={stroke}
          strokeWidth={1}
          dash={[5, 4]}
          listening={false}
          cornerRadius={4}
        />
        <Line
          points={[shell, shell, box.w - shell, box.h - shell]}
          {...hiddenProps}
        />
        <Line
          points={[box.w - shell, shell, shell, box.h - shell]}
          {...hiddenProps}
        />
      </>
    );
  }
  if (comp.type === "chair_seat_panel") {
    return (
      <>
        <Rect
          x={0}
          y={0}
          width={box.w}
          height={box.h}
          {...outlineProps}
          cornerRadius={6}
        />
        <Rect
          x={shell}
          y={shell}
          width={Math.max(10, box.w - shell * 2)}
          height={Math.max(8, box.h - shell * 2)}
          fill="rgba(255,255,255,0)"
          stroke={stroke}
          strokeWidth={0.8}
          listening={false}
        />
      </>
    );
  }

  if (comp.type === "chair_front_leg" || comp.type === "chair_back_leg") {
    return renderChairLegShape(box, stroke);
  }

  if (
    comp.type === "chair_front_rail" ||
    comp.type === "chair_rear_rail" ||
    comp.type === "chair_side_rail" ||
    comp.type === "chair_back_slat"
  ) {
    return (
      <>
        <Rect x={0} y={0} width={box.w} height={box.h} {...outlineProps} />
        <Line points={[0, midY, box.w, midY]} {...commonLine} />
      </>
    );
  }

  if (TABLE_SET.has(comp.type)) return renderTableBlueprint(box, stroke);
  if (comp.type === "sofa") return renderSofaBlueprint(box, stroke);
  if (comp.type === "bed_frame") return renderBedBlueprint(box, stroke);
  if (comp.type === "dining_bench")
    return renderBenchBlueprint(box, stroke, false);
  if (comp.type === "garden_bench")
    return renderBenchBlueprint(box, stroke, true);
  if (comp.type === "lounger") return renderLoungerBlueprint(box, stroke);
  if (comp.type === "office_chair")
    return renderOfficeChairBlueprint(box, stroke);
  if (comp.type === "patio_dining_set")
    return renderPatioSetBlueprint(box, stroke);
  if (OPEN_SHELF_SET.has(comp.type))
    return renderCaseworkBlueprint(box, stroke, "open");
  if (
    comp.type === "dresser" ||
    comp.type === "nightstand" ||
    comp.type === "drawer"
  ) {
    return renderCaseworkBlueprint(box, stroke, "drawers");
  }
  if (CASEWORK_SET.has(comp.type))
    return renderCaseworkBlueprint(box, stroke, "doors");

  switch (comp.type) {
    case "upper_cabinet":
      return (
        <>
          <Rect x={0} y={0} width={box.w} height={box.h} {...outlineProps} />
          <Rect
            x={shell}
            y={shell}
            width={box.w - shell * 2}
            height={box.h - shell * 2}
            fill="rgba(255,255,255,0)"
            stroke={stroke}
            strokeWidth={0.8}
            dash={[5, 4]}
            listening={false}
          />
          {effectiveView !== "top" && (
            <>
              <Line
                points={[midX, shell, midX, box.h - shell]}
                {...commonLine}
              />
              <Line
                points={[midX - 10, midY - 4, midX - 10, midY + 4]}
                {...commonLine}
              />
              <Line
                points={[midX + 10, midY - 4, midX + 10, midY + 4]}
                {...commonLine}
              />
            </>
          )}
          {effectiveView === "top" && (
            <>
              <Line
                points={[shell, box.h - shell, box.w - shell, box.h - shell]}
                {...hiddenProps}
              />
              <Line
                points={[shell, shell, box.w - shell, shell]}
                {...commonLine}
              />
            </>
          )}
        </>
      );

    case "base_cabinet":
    case "kitchen_cabinet":
      return (
        <>
          <Rect x={0} y={0} width={box.w} height={box.h} {...outlineProps} />
          <Rect
            x={shell}
            y={shell}
            width={box.w - shell * 2}
            height={box.h - shell * 2 - toeKick}
            fill="rgba(255,255,255,0)"
            stroke={stroke}
            strokeWidth={0.8}
            listening={false}
          />
          {effectiveView !== "top" && (
            <>
              <Line
                points={[0, box.h - toeKick, box.w, box.h - toeKick]}
                {...commonLine}
              />
              <Line
                points={[midX, shell, midX, box.h - toeKick]}
                {...commonLine}
              />
              <Line
                points={[midX - 10, midY - 4, midX - 10, midY + 4]}
                {...commonLine}
              />
              <Line
                points={[midX + 10, midY - 4, midX + 10, midY + 4]}
                {...commonLine}
              />
            </>
          )}
          {effectiveView === "top" && (
            <>
              <Line
                points={[shell, shell, box.w - shell, shell]}
                {...commonLine}
              />
              <Line
                points={[shell, box.h - shell, box.w - shell, box.h - shell]}
                {...hiddenProps}
              />
            </>
          )}
        </>
      );

    case "door_single":
      return (
        <>
          <Rect x={0} y={0} width={box.w} height={box.h} {...outlineProps} />
          <Rect
            x={shell}
            y={shell}
            width={box.w - shell * 2}
            height={box.h - shell * 2}
            fill="rgba(255,255,255,0)"
            stroke={stroke}
            strokeWidth={0.8}
            listening={false}
          />
          <Line
            points={[box.w - shell - 8, midY - 4, box.w - shell - 8, midY + 4]}
            {...commonLine}
          />
        </>
      );

    case "door_double":
      return (
        <>
          <Rect x={0} y={0} width={box.w} height={box.h} {...outlineProps} />
          <Line points={[midX, shell, midX, box.h - shell]} {...commonLine} />
          <Rect
            x={shell}
            y={shell}
            width={midX - shell}
            height={box.h - shell * 2}
            fill="rgba(255,255,255,0)"
            stroke={stroke}
            strokeWidth={0.8}
            listening={false}
          />
          <Rect
            x={midX}
            y={shell}
            width={midX - shell}
            height={box.h - shell * 2}
            fill="rgba(255,255,255,0)"
            stroke={stroke}
            strokeWidth={0.8}
            listening={false}
          />
          <Line
            points={[midX - 8, midY - 4, midX - 8, midY + 4]}
            {...commonLine}
          />
          <Line
            points={[midX + 8, midY - 4, midX + 8, midY + 4]}
            {...commonLine}
          />
        </>
      );

    case "shelf":
      return (
        <>
          <Rect x={0} y={0} width={box.w} height={box.h} {...outlineProps} />
          <Line points={[0, midY, box.w, midY]} {...commonLine} />
        </>
      );

    case "countertop":
      return (
        <>
          <Rect x={0} y={0} width={box.w} height={box.h} {...outlineProps} />
          <Line points={[0, shell, box.w, shell]} {...commonLine} />
          <Line
            points={[0, box.h - shell, box.w, box.h - shell]}
            {...commonLine}
          />
        </>
      );

    case "hardware":
      return (
        <>
          <Rect x={0} y={0} width={box.w} height={box.h} {...outlineProps} />
          <Circle
            x={midX}
            y={midY}
            radius={Math.min(box.w, box.h) * 0.18}
            stroke={stroke}
            strokeWidth={1}
          />
          <Line points={[midX - 8, midY, midX + 8, midY]} {...commonLine} />
          <Line points={[midX, midY - 8, midX, midY + 8]} {...commonLine} />
        </>
      );

    default:
      return (
        <Rect x={0} y={0} width={box.w} height={box.h} {...outlineProps} />
      );
  }
}

export {
  getBlueprintStroke,
  buildBlueprintSvgMarkup,
  renderChairLegShape,
  renderTableBlueprint,
  renderCaseworkBlueprint,
  renderSofaBlueprint,
  renderBedBlueprint,
  renderBenchBlueprint,
  renderLoungerBlueprint,
  renderOfficeChairBlueprint,
  renderPatioSetBlueprint,
  renderBlueprintShape,
};
