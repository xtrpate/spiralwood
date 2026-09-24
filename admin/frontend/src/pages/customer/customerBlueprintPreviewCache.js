// Shared compact Blueprint preview cache.
//
// Keep this module lightweight: Blueprint list pages can read an existing
// static 3D snapshot without importing Three.js or CustomerBlueprintViewer.
const COMPACT_PREVIEW_CACHE_PREFIX =
  "wisdom:generated-blueprint-preview:v3:";

// Included in the hashed key so older lower-resolution snapshots naturally
// miss the cache after a preview-render version change.
const COMPACT_PREVIEW_RENDER_VERSION = "hd-2x-webp96-v1";

const compactPreviewHash = (value = "") => {
  const text = String(value || "");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};

export const buildCompactPreviewCacheKey = (
  blueprint = {},
  preset = "iso",
  compactHeight = 240,
) => {
  let geometrySource = "";

  try {
    geometrySource = JSON.stringify({
      id: blueprint?.id || "",
      updated_at: blueprint?.updated_at || blueprint?.updatedAt || "",
      components: blueprint?.components || null,
      design_data: blueprint?.design_data || null,
      view_3d_data: blueprint?.view_3d_data || null,
    });
  } catch {
    geometrySource = String(blueprint?.id || "");
  }

  return (
    COMPACT_PREVIEW_CACHE_PREFIX +
    compactPreviewHash(
      [
        preset,
        compactHeight,
        COMPACT_PREVIEW_RENDER_VERSION,
        geometrySource,
      ].join("|"),
    )
  );
};

export const readGeneratedCompactPreview = (cacheKey) => {
  if (!cacheKey || typeof window === "undefined") return "";

  try {
    return window.localStorage.getItem(cacheKey) || "";
  } catch {
    return "";
  }
};

export const writeGeneratedCompactPreview = (cacheKey, dataUrl) => {
  if (
    !cacheKey ||
    !dataUrl ||
    typeof window === "undefined" ||
    !String(dataUrl).startsWith("data:image/")
  ) {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, dataUrl);
    return;
  } catch {
    // Keep this cache isolated from the rest of the application. If browser
    // storage is full, prune only generated WISDOM preview entries.
  }

  try {
    const previewKeys = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(COMPACT_PREVIEW_CACHE_PREFIX)) {
        previewKeys.push(key);
      }
    }

    previewKeys
      .slice(0, Math.max(8, previewKeys.length - 36))
      .forEach((key) => {
        window.localStorage.removeItem(key);
      });

    window.localStorage.setItem(cacheKey, dataUrl);
  } catch {
    // Preview caching is an optimization only; rendering still works without it.
  }
};
