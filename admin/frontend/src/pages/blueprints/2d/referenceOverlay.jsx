// src/pages/blueprints/2d/ReferenceOverlay.jsx
import React from "react";
import { Image } from "react-konva";
import { useReferenceImage } from "../data/initHelpers";

export default function ReferenceOverlay({
  referenceFiles,
  view,
  canvasW,
  canvasH,
}) {
  // 1. Grab the correct base64 image string based on the current active view tab
  // (e.g., if view === "top", it grabs referenceFiles.top.url)
  const fileData = referenceFiles?.[view];
  const src = fileData?.url;

  // 2. Convert the Base64 string into a real HTML Image element using your existing hook
  const imageObj = useReferenceImage(src);

  // If there is no image for this specific view, render nothing
  if (!imageObj) return null;

  // 3. Calculate the math to perfectly scale the image to fit your blueprint paper
  const padding = 120; // Keep it away from the title block and edges
  const maxW = canvasW - padding * 2;
  const maxH = canvasH - padding * 2;

  const imgRatio = imageObj.width / imageObj.height;
  const canvasRatio = maxW / maxH;

  let finalW = maxW;
  let finalH = maxH;

  // Preserve the aspect ratio so the blueprint sketch doesn't stretch/squish
  if (imgRatio > canvasRatio) {
    finalH = maxW / imgRatio;
  } else {
    finalW = maxH * imgRatio;
  }

  // Center the image perfectly on the paper
  const x = (canvasW - finalW) / 2;
  const y = (canvasH - finalH) / 2;

  return (
    <Image
      image={imageObj}
      x={x}
      y={y}
      width={finalW}
      height={finalH}
      opacity={0.25} // Semi-transparent so it looks like tracing paper
      listening={false} // Ignores mouse clicks so it doesn't block your tools
    />
  );
}
