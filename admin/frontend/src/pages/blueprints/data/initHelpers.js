// data/initHelpers.js — Blueprint initialization helpers
// Separated to avoid circular dependency between utils.js and templateComponents.js
import { useState, useEffect } from "react";
import { normalizeComponent } from "./componentUtils";
import { createImportedDiningChairComponents } from "./templateComponents";

function resolveInitialComponents(
  savedData = {},
  referenceFile = null,
  blueprintData = {},
  worldSize = { w: 6400, h: 3200, d: 5200 },
) {
  const savedComponents = Array.isArray(savedData?.components)
    ? savedData.components.map(normalizeComponent)
    : [];

  const hasOnlyReferenceProxy =
    savedComponents.length > 0 &&
    savedComponents.every((c) => c.type === "reference_proxy");

  if (savedComponents.length > 0 && !hasOnlyReferenceProxy) {
    return savedComponents;
  }

  if (referenceFile?.url) {
    return createImportedDiningChairComponents(
      savedData,
      referenceFile,
      blueprintData,
      worldSize,
    );
  }

  // fallback
  if (savedComponents.length > 0) {
    return savedComponents;
  }

  return [];
}

function useReferenceImage(src) {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = "anonymous";

    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return image;
}

export { resolveInitialComponents, useReferenceImage };
