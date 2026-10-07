// 2d/useBlueprintCanvasModel.js — projection, scaling, and reference preview data
import { useMemo } from "react";
import {
  get2DBounds,
  getProjectedBox,
  getMirroredBox,
} from "../data/componentUtils";
import { formatDim } from "../data/utils";
import { VIEWS } from "../data/furnitureTypes";
import { BLUEPRINT_METADATA_BAND_H } from "../data/technicalOutputUtils";
import { getExplodedBox } from "../export/placementHelpers";
import { resolveExplodedPreviewComponents } from "./explodedViewUtils";
import {
  PAPER_MARGIN,
  TITLE_BLOCK_H,
  DRAWING_PADDING,
} from "./blueprintPaperComponents";

function getAxisLabels(view) {
  if (view === "left" || view === "right") {
    return ["Z (Depth)", "Y (Height)"];
  }
  if (view === "top") return ["X (Width)", "Z (Depth)"];
  if (view === "exploded") return ["Exploded", "Parts"];
  return ["X (Width)", "Y (Height)"];
}

export function useBlueprintCanvasModel({
  selectedComponents,
  allComponents,
  selectedBounds3D,
  view,
  canvasW,
  canvasH,
  unit,
  showMetadataBand = false,
}) {
  const drawingArea = useMemo(
    () => ({
      x: PAPER_MARGIN + DRAWING_PADDING,
      y: PAPER_MARGIN + DRAWING_PADDING,
      w: canvasW - PAPER_MARGIN * 2 - DRAWING_PADDING * 2,
      h:
        canvasH -
        PAPER_MARGIN * 2 -
        TITLE_BLOCK_H -
        DRAWING_PADDING * 1.45 -
        (showMetadataBand ? BLUEPRINT_METADATA_BAND_H : 0),
    }),
    [canvasW, canvasH, showMetadataBand],
  );

  const metadataBand = useMemo(
    () =>
      showMetadataBand
        ? {
            x: drawingArea.x,
            y: drawingArea.y + drawingArea.h + 8,
            w: drawingArea.w,
            h: Math.max(1, BLUEPRINT_METADATA_BAND_H - 8),
          }
        : null,
    [drawingArea, showMetadataBand],
  );

  const previewComponents = useMemo(() => {
    if (view === "exploded") {
      return resolveExplodedPreviewComponents(
        selectedComponents,
        allComponents,
      );
    }

    if (selectedComponents.length) return selectedComponents;
    if (allComponents.length) return allComponents;
    return [];
  }, [selectedComponents, allComponents, view]);

  const rawItems = useMemo(() => {
    if (!previewComponents.length) return [];

    if (view === "exploded") {
      return previewComponents.map((comp, index) => ({
        comp,
        box: getExplodedBox(comp, previewComponents, index),
      }));
    }

    const projected = previewComponents
      .map((comp) => {
        const box = getProjectedBox(comp, view);
        if (!box) return null;
        return { comp, box };
      })
      .filter(Boolean);

    const bounds = get2DBounds(projected);

    return projected.map((item) => ({
      ...item,
      box: getMirroredBox(item.box, bounds, view),
    }));
  }, [previewComponents, view]);

  const bounds2D = useMemo(() => get2DBounds(rawItems), [rawItems]);

  const scaledItems = useMemo(() => {
    if (!bounds2D) return [];

    const inlineLabelClearance = view === "exploded" ? 0 : 18;
    const usableDrawingH = Math.max(1, drawingArea.h - inlineLabelClearance);
    const scale = Math.min(
      drawingArea.w / Math.max(bounds2D.width, 1),
      usableDrawingH / Math.max(bounds2D.height, 1),
      view === "exploded" ? 0.96 : 1.1,
    );

    const offsetX =
      drawingArea.x + (drawingArea.w - bounds2D.width * scale) / 2;
    const offsetY =
      drawingArea.y + (usableDrawingH - bounds2D.height * scale) / 2;

    return rawItems.map((item) => ({
      ...item,
      screenBox: {
        x: offsetX + (item.box.x - bounds2D.minX) * scale,
        y: offsetY + (item.box.y - bounds2D.minY) * scale,
        w: Math.max(8, item.box.w * scale),
        h: Math.max(8, item.box.h * scale),
        labelSide: item.box.labelSide || null,
        labelLane: Number.isFinite(item.box.labelLane)
          ? item.box.labelLane
          : null,
      },
      scale,
    }));
  }, [rawItems, bounds2D, drawingArea, view]);

  const viewMeta = VIEWS.find((item) => item.key === view) || VIEWS[0];
  const viewLabel = viewMeta.label;
  const axisLabels = getAxisLabels(view);

  const overallScreenBounds = useMemo(() => {
    if (!scaledItems.length) return null;
    return {
      minX: Math.min(...scaledItems.map((item) => item.screenBox.x)),
      minY: Math.min(...scaledItems.map((item) => item.screenBox.y)),
      maxX: Math.max(
        ...scaledItems.map((item) => item.screenBox.x + item.screenBox.w),
      ),
      maxY: Math.max(
        ...scaledItems.map((item) => item.screenBox.y + item.screenBox.h),
      ),
    };
  }, [scaledItems]);

  const verticalDimText =
    view === "top"
      ? formatDim(selectedBounds3D?.depth || 0, unit)
      : formatDim(selectedBounds3D?.height || 0, unit);

  return {
    drawingArea,
    metadataBand,
    scaledItems,
    viewMeta,
    viewLabel,
    axisLabels,
    overallScreenBounds,
    verticalDimText,
  };
}
