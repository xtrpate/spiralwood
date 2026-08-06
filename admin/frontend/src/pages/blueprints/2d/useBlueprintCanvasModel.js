// 2d/useBlueprintCanvasModel.js — projection, scaling, and reference preview data
import { useMemo } from "react";
import {
  get2DBounds,
  getProjectedBox,
  getMirroredBox,
} from "../data/componentUtils";
import {
  formatDim,
  isImageReferenceFile,
  resolveAssetUrl,
} from "../data/utils";
import { useReferenceImage } from "../data/initHelpers";
import { VIEWS } from "../data/furnitureTypes";
import { getExplodedBox } from "../export/placementHelpers";
import {
  PAPER_MARGIN,
  TITLE_BLOCK_H,
  DRAWING_PADDING,
} from "./blueprintPaperComponents";

function normalizeProjectionView(rawView = "front") {
  if (rawView === "back") return "front";
  if (rawView === "right") return "left";
  if (rawView === "top") return "top";
  return "front";
}

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
  referenceFile,
  unit,
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
        DRAWING_PADDING * 1.45,
    }),
    [canvasW, canvasH],
  );

  const activeProjectionView = normalizeProjectionView(view);

  const referenceUrl = useMemo(
    () => resolveAssetUrl(referenceFile?.url || ""),
    [referenceFile],
  );

  const referenceImage = useReferenceImage(
    isImageReferenceFile(referenceFile) ? referenceUrl : "",
  );

  const previewComponents = useMemo(() => {
    if (selectedComponents.length) return selectedComponents;
    if (allComponents.length) return allComponents;
    return [];
  }, [selectedComponents, allComponents]);

  const referenceType = String(
    referenceFile?.type || referenceFile?.file_type || "",
  ).toLowerCase();
  const isPdfReference = referenceType === "pdf";

  const referenceImageBox = useMemo(() => {
    if (!referenceImage) return null;

    const imgW = Number(referenceImage.width) || 1;
    const imgH = Number(referenceImage.height) || 1;
    const scale = Math.min(drawingArea.w / imgW, drawingArea.h / imgH);

    const width = imgW * scale;
    const height = imgH * scale;

    return {
      x: drawingArea.x + (drawingArea.w - width) / 2,
      y: drawingArea.y + (drawingArea.h - height) / 2,
      w: width,
      h: height,
    };
  }, [referenceImage, drawingArea]);

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

    const scale = Math.min(
      drawingArea.w / Math.max(bounds2D.width, 1),
      drawingArea.h / Math.max(bounds2D.height, 1),
      view === "exploded" ? 0.96 : 1.1,
    );

    const offsetX =
      drawingArea.x + (drawingArea.w - bounds2D.width * scale) / 2;
    const offsetY =
      drawingArea.y + (drawingArea.h - bounds2D.height * scale) / 2;

    return rawItems.map((item) => ({
      ...item,
      screenBox: {
        x: offsetX + (item.box.x - bounds2D.minX) * scale,
        y: offsetY + (item.box.y - bounds2D.minY) * scale,
        w: Math.max(8, item.box.w * scale),
        h: Math.max(8, item.box.h * scale),
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
  };
}
