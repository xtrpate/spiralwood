import { useMemo, useState } from "react";
import { extractCustomerBlueprintScene } from "./customerBlueprintAdapter";
import { normalizeComponent } from "../blueprints/data/componentUtils";
import Customer3DViewer from "./customer3dviewer";

const MAX_REFERENCE_PHOTOS = 4;
const MAX_REFERENCE_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_REFERENCE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const toPositiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const normalizeComponentList = (items = []) =>
  (Array.isArray(items) ? items : []).map((item) =>
    normalizeComponent({
      ...item,
      color: item?.color ?? item?.fill ?? "",
      finish_color: item?.finish_color ?? item?.fill ?? item?.color ?? "",
      finish: item?.finish ?? item?.finish_id ?? item?.woodFinish ?? "",
      finish_id: item?.finish_id ?? item?.finish ?? item?.woodFinish ?? "",
      woodFinish: item?.woodFinish ?? item?.finish ?? item?.finish_id ?? "",
      color_mode: item?.color_mode || "",
    }),
  );

const normalizeDimensions = (source = {}) => ({
  width_mm: toPositiveNumber(
    source?.width_mm ?? source?.width ?? source?.w,
  ),
  height_mm: toPositiveNumber(
    source?.height_mm ?? source?.height ?? source?.h,
  ),
  depth_mm: toPositiveNumber(
    source?.depth_mm ?? source?.depth ?? source?.d,
  ),
});

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });


const firstText = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const buildFinalDimensions = (draft = {}, fallback = {}) => {
  const normalized = normalizeDimensions(
    draft?.defaultDimensions || draft?.bounds || draft || {},
  );

  return {
    width_mm: normalized.width_mm || toPositiveNumber(fallback?.width_mm),
    height_mm: normalized.height_mm || toPositiveNumber(fallback?.height_mm),
    depth_mm: normalized.depth_mm || toPositiveNumber(fallback?.depth_mm),
  };
};

export default function CustomerTemplateWorkbench({
  blueprint,
  readOnly = false,
  onConfirm,
  confirmLabel = "Add to Custom Cart",
}) {
  const [referencePhotos, setReferencePhotos] = useState([]);
  const [uploadError, setUploadError] = useState("");

  const sceneData = useMemo(
    () => extractCustomerBlueprintScene(blueprint || {}),
    [blueprint],
  );

  const initialComponents = useMemo(
    () => normalizeComponentList(sceneData?.components || []),
    [sceneData],
  );

  const initialDimensions = useMemo(() => {
    const sceneDims = normalizeDimensions(
      sceneData?.defaultDimensions ||
        sceneData?.bounds ||
        blueprint?.default_dimensions ||
        blueprint?.dimensions ||
        blueprint?.scene_bounds ||
        {},
    );

    return sceneDims;
  }, [sceneData, blueprint]);

  const handleReferencePhotosChange = async (event) => {
    const incomingFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (!incomingFiles.length) return;

    if (referencePhotos.length + incomingFiles.length > MAX_REFERENCE_PHOTOS) {
      setUploadError(`You can upload up to ${MAX_REFERENCE_PHOTOS} reference photos only.`);
      return;
    }

    const invalidType = incomingFiles.find(
      (file) => !ALLOWED_REFERENCE_TYPES.has(String(file.type || "").toLowerCase()),
    );

    if (invalidType) {
      setUploadError("Only JPG, PNG, and WEBP reference photos are allowed.");
      return;
    }

    const invalidSize = incomingFiles.find(
      (file) => Number(file.size || 0) > MAX_REFERENCE_FILE_SIZE,
    );

    if (invalidSize) {
      setUploadError("Each reference photo must be 2MB or smaller.");
      return;
    }

    try {
      const prepared = await Promise.all(
        incomingFiles.map(async (file) => ({
          id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          data_url: await fileToDataUrl(file),
        })),
      );

      setReferencePhotos((prev) => [...prev, ...prepared]);
      setUploadError("");
    } catch (error) {
      console.error(error);
      setUploadError("Failed to read the selected reference photo.");
    }
  };

  const handleRemoveReferencePhoto = (photoId) => {
    setReferencePhotos((prev) => prev.filter((item) => item.id !== photoId));
  };

  const handleApply = (draft = {}) => {
    if (typeof onConfirm !== "function") return;

    const normalizedComponents = normalizeComponentList(
      Array.isArray(draft?.components) && draft.components.length
        ? draft.components
        : initialComponents,
    );

    const finalDimensions = buildFinalDimensions(draft, initialDimensions);
    const mergedMetadata = {
      ...(sceneData?.metadata || {}),
      ...(draft?.metadata || {}),
    };

    const initialMessage = firstText(
      draft?.initial_message,
      draft?.comments,
    );

    const woodType = firstText(
      draft?.wood_type,
      mergedMetadata?.wood_type,
      blueprint?.wood_type,
    );

    const finishColor = firstText(
      draft?.finish_color,
      mergedMetadata?.finish_color,
      mergedMetadata?.color,
      blueprint?.finish_color,
      blueprint?.color,
    );

    const color = firstText(
      draft?.color,
      mergedMetadata?.color,
      draft?.finish_color,
      mergedMetadata?.finish_color,
      blueprint?.color,
      blueprint?.finish_color,
    );

    const doorStyle = firstText(
      draft?.door_style,
      mergedMetadata?.door_style,
      blueprint?.door_style,
    );

    const hardware = firstText(
      draft?.hardware,
      mergedMetadata?.hardware,
      blueprint?.hardware,
    );

    const imageUrl = firstText(
      draft?.image_url,
      draft?.preview_image_url,
      mergedMetadata?.image_url,
      mergedMetadata?.preview_image_url,
      blueprint?.image_url,
      blueprint?.preview_image_url,
      blueprint?.thumbnail_url,
    );

    const worldSize =
      draft?.worldSize && typeof draft.worldSize === "object"
        ? draft.worldSize
        : sceneData?.worldSize || null;

    onConfirm({
      key: `custom_${blueprint?.id || "blueprint"}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,

      blueprint_id: Number(blueprint?.id || 0) || null,
      product_id: Number(blueprint?.product_id || 0) || null,

      product_name: firstText(
        blueprint?.title,
        blueprint?.name,
        mergedMetadata?.product_name,
        "Custom Furniture",
      ),
      base_blueprint_title: firstText(
        blueprint?.title,
        blueprint?.name,
        "Custom Furniture",
      ),

      template_profile: firstText(
        blueprint?.template_profile,
        mergedMetadata?.template_profile,
      ),
      template_category: firstText(
        blueprint?.template_category,
        mergedMetadata?.template_category,
      ),

      quantity: Math.max(1, Number(draft?.quantity || 1)),
      comments: initialMessage,
      initial_message: initialMessage,

      image_url: imageUrl,
      preview_image_url: imageUrl,

      width: finalDimensions.width_mm,
      height: finalDimensions.height_mm,
      depth: finalDimensions.depth_mm,
      unit: "mm",

      wood_type: woodType,
      finish_color: finishColor,
      color,
      door_style: doorStyle,
      hardware,

      bounds: {
        width: finalDimensions.width_mm,
        height: finalDimensions.height_mm,
        depth: finalDimensions.depth_mm,
      },

      defaultDimensions: finalDimensions,
      worldSize,

      components: normalizedComponents,

      customization_snapshot: {
        width: finalDimensions.width_mm,
        height: finalDimensions.height_mm,
        depth: finalDimensions.depth_mm,
        wood_type: woodType,
        finish_color: finishColor,
        color,
        door_style: doorStyle,
        hardware,
        unit: "mm",
      },

      editor_snapshot: {
        worldSize,
        components: normalizedComponents,
      },

      reference_photos: Array.isArray(referencePhotos) ? referencePhotos : [],

      metadata: {
        ...mergedMetadata,
        wood_type: woodType,
        finish_color: finishColor,
        color,
        door_style: doorStyle,
        hardware,
      },
    });
  };

  return (
    <Customer3DViewer
      key={`${blueprint?.id || "blueprint"}_${readOnly ? "view" : "edit"}`}
      initialComponents={initialComponents}
      initialDimensions={initialDimensions}
      customizationRules={blueprint?.customization_rules || {}}
      isCustomizable={!readOnly}
      readOnly={readOnly}
      applyLabel={confirmLabel}
      commentsLabel="Initial Message to Admin"
      commentsPlaceholder="Describe your preferred look, space, inspiration, or important requests..."
      referencePhotos={referencePhotos}
      uploadError={uploadError}
      onPickReferencePhotos={handleReferencePhotosChange}
      onRemoveReferencePhoto={handleRemoveReferencePhoto}
      onApply={handleApply}
    />
  );
}