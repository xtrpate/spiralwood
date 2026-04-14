

const DEFAULT_WORLD_SIZE = { w: 6400, h: 3200, d: 5200 };
const DEFAULT_IMPORT_DIMENSIONS = { w: 1200, h: 900, d: 600 };

const TEMPLATE_MAP = {
  chair: "template_dining_chair",
  dining_chair: "template_dining_chair",
  table: "template_dining_table",
  dining_table: "template_dining_table",
  cabinet: "template_closet_wardrobe",
  closet: "template_closet_wardrobe",
  wardrobe: "template_closet_wardrobe",
  bed: "template_bed_frame",
  coffee_table: "template_coffee_table",
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const safeJsonParse = (value, fallback = {}) => {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const isHexColor = (value) => HEX_COLOR_RE.test(String(value || "").trim());

const normalizeColor = (value) => {
  const raw = String(value || "").trim();
  return raw || "#d6c3ab";
};

const normalizeComponent = (raw = {}, index = 0) => {
  const width = Math.max(1, toNumber(raw.width ?? raw.w ?? raw.width_mm, 1));
  const height = Math.max(1, toNumber(raw.height ?? raw.h ?? raw.height_mm, 1));
  const depth = Math.max(1, toNumber(raw.depth ?? raw.d ?? raw.depth_mm, 1));

  const fillCandidate = String(raw.fill ?? raw.color ?? "").trim();
  const colorCandidate = String(raw.color ?? raw.fill ?? "").trim();
  const finishCandidate = String(
    raw.finish ?? raw.finish_id ?? raw.woodFinish ?? ""
  ).trim();
  const finishColorCandidate = String(
    raw.finish_color ?? colorCandidate ?? fillCandidate ?? ""
  ).trim();

  const resolvedFill =
    fillCandidate ||
    colorCandidate ||
    (isHexColor(finishColorCandidate) ? finishColorCandidate : "") ||
    "#d6c3ab";

  const resolvedColor = colorCandidate || resolvedFill;

  const colorMode =
    String(raw.color_mode || "").trim() ||
    ((isHexColor(resolvedFill || finishColorCandidate) && !finishCandidate)
      ? "solid"
      : finishCandidate
        ? "wood"
        : "");

  return {
    id: raw.id || `comp_${index}`,
    type: raw.type || raw.component_type || "panel",
    label:
      raw.label ||
      raw.partCode ||
      raw.component_type ||
      raw.name ||
      `Part ${index + 1}`,
    x: toNumber(raw.x ?? raw.position_x, 0),
    y: toNumber(raw.y ?? raw.position_y, 0),
    z: toNumber(raw.z ?? raw.position_z, 0),
    width,
    height,
    depth,
    rotationX: toNumber(raw.rotationX ?? raw.rotation_x, 0),
    rotationY: toNumber(raw.rotationY ?? raw.rotation_y, 0),
    rotationZ: toNumber(raw.rotationZ ?? raw.rotation_z, 0),
    fill: normalizeColor(resolvedFill),
    color: resolvedColor,
    finish: finishCandidate,
    finish_id: String(raw.finish_id ?? finishCandidate).trim(),
    woodFinish: String(raw.woodFinish ?? finishCandidate).trim(),
    material: raw.material || raw.wood_type || "",
    wood_type: raw.wood_type || raw.material || "",
    finish_color: finishColorCandidate || resolvedFill,
    color_mode: colorMode,
    hardware: raw.hardware || "",
    partCode: raw.partCode || "",
    visible: raw.visible !== false && Number(raw.is_deleted || 0) !== 1,
    is_main: Boolean(raw.is_main),
  };
};

const getBounds = (components = []) => {
  if (!components.length) return null;

  const minX = Math.min(...components.map((c) => c.x));
  const minY = Math.min(...components.map((c) => c.y));
  const minZ = Math.min(...components.map((c) => c.z));

  const maxX = Math.max(...components.map((c) => c.x + c.width));
  const maxY = Math.max(...components.map((c) => c.y + c.height));
  const maxZ = Math.max(...components.map((c) => c.z + c.depth));

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    depth: Math.max(1, maxZ - minZ),
  };
};

const resolveWorldSize = (designData = {}, view3dData = {}, bounds = null) => ({
  w: toNumber(
    designData?.worldSize?.w ??
      view3dData?.worldSize?.w ??
      (bounds ? bounds.width + 1600 : DEFAULT_WORLD_SIZE.w),
    DEFAULT_WORLD_SIZE.w,
  ),
  h: toNumber(
    designData?.worldSize?.h ??
      view3dData?.worldSize?.h ??
      (bounds ? Math.max(bounds.height + 1200, DEFAULT_WORLD_SIZE.h) : DEFAULT_WORLD_SIZE.h),
    DEFAULT_WORLD_SIZE.h,
  ),
  d: toNumber(
    designData?.worldSize?.d ??
      view3dData?.worldSize?.d ??
      (bounds ? bounds.depth + 1600 : DEFAULT_WORLD_SIZE.d),
    DEFAULT_WORLD_SIZE.d,
  ),
});

const sanitizeImportDimensions = (source = {}, fallback = DEFAULT_IMPORT_DIMENSIONS) => ({
  w: Math.max(20, toNumber(source?.w ?? source?.width, fallback.w)),
  h: Math.max(20, toNumber(source?.h ?? source?.height, fallback.h)),
  d: Math.max(20, toNumber(source?.d ?? source?.depth, fallback.d)),
});

const detectTemplateType = (blueprint = {}, designData = {}) => {
  const explicitPreviewType = String(blueprint?.preview_template_type || "").trim();
  if (explicitPreviewType) return explicitPreviewType;

  const rawType = String(
    blueprint?.furniture_type ||
      blueprint?.category ||
      blueprint?.type ||
      blueprint?.template_type ||
      blueprint?.import_template_type ||
      designData?.furnitureType ||
      designData?.blueprintSetup?.furnitureType ||
      designData?.importTemplateType ||
      designData?.templateType ||
      "",
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (TEMPLATE_MAP[rawType]) return TEMPLATE_MAP[rawType];

  const title = String(blueprint?.title || "").toLowerCase();
  if (title.includes("chair")) return "template_dining_chair";
  if (title.includes("coffee table")) return "template_coffee_table";
  if (title.includes("table")) return "template_dining_table";
  if (title.includes("cabinet")) return "template_closet_wardrobe";
  if (title.includes("closet")) return "template_closet_wardrobe";
  if (title.includes("wardrobe")) return "template_closet_wardrobe";
  if (title.includes("bed")) return "template_bed_frame";

  return "";
};

const isRenderableComponentSet = (items = []) => {
  if (!Array.isArray(items) || !items.length) return false;

  const normalized = items
    .map((item, index) => normalizeComponent(item, index))
    .filter((item) => item.visible);

  if (!normalized.length) return false;

  const bounds = getBounds(normalized);
  if (!bounds) return false;

  if (bounds.width < 50 || bounds.height < 50 || bounds.depth < 50) {
    return false;
  }

  return normalized.some((component) => Number(component.depth) >= 20);
};

const extractRealComponents = (blueprint = {}, designData = {}, view3dData = {}) => {
  const savedDesignComponents = Array.isArray(designData?.components)
    ? designData.components
    : [];

  const savedView3dComponents = Array.isArray(view3dData?.components)
    ? view3dData.components
    : [];

  const savedDbComponents = Array.isArray(blueprint?.components)
    ? blueprint.components
    : [];

  if (isRenderableComponentSet(savedDesignComponents)) {
    return savedDesignComponents
      .map((item, index) => normalizeComponent(item, index))
      .filter((item) => item.visible);
  }

  if (isRenderableComponentSet(savedView3dComponents)) {
    return savedView3dComponents
      .map((item, index) => normalizeComponent(item, index))
      .filter((item) => item.visible);
  }

  if (isRenderableComponentSet(savedDbComponents)) {
    return savedDbComponents
      .map((item, index) => normalizeComponent(item, index))
      .filter((item) => item.visible);
  }

  return [];
};



const pickMainComponent = (components = []) => {
  if (!components.length) return null;

  const explicitMain = components.find((component) => component.is_main);
  if (explicitMain) return explicitMain;

  return [...components].sort((a, b) => {
    const volumeA = a.width * a.height * a.depth;
    const volumeB = b.width * b.height * b.depth;
    return volumeB - volumeA;
  })[0];
};

export function extractCustomerBlueprintScene(blueprint) {
  const designData = safeJsonParse(blueprint?.design_data, {});
  const view3dData = safeJsonParse(blueprint?.view_3d_data, {});
  const detectedTemplateType = detectTemplateType(blueprint, designData);

  const components = extractRealComponents(blueprint, designData, view3dData);
  const bounds = getBounds(components);
  const worldSize = resolveWorldSize(designData, view3dData, bounds);
  const mainComponent = pickMainComponent(components);
  const defaultDimensions = blueprint?.default_dimensions || {};

  const width_mm =
    toNumber(
      defaultDimensions.width_mm ??
        defaultDimensions.width ??
        designData?.customerCustomization?.default_dimensions?.width_mm ??
        designData?.customerCustomization?.default_dimensions?.width ??
        bounds?.width,
      0,
    ) || 0;

  const height_mm =
    toNumber(
      defaultDimensions.height_mm ??
        defaultDimensions.height ??
        designData?.customerCustomization?.default_dimensions?.height_mm ??
        designData?.customerCustomization?.default_dimensions?.height ??
        bounds?.height,
      0,
    ) || 0;

  const depth_mm =
    toNumber(
      defaultDimensions.depth_mm ??
        defaultDimensions.depth ??
        designData?.customerCustomization?.default_dimensions?.depth_mm ??
        designData?.customerCustomization?.default_dimensions?.depth ??
        bounds?.depth,
      0,
    ) || 0;

  return {
    id: blueprint?.id || null,
    title: blueprint?.title || "Blueprint Preview",
    thumbnail_url: blueprint?.thumbnail_url || blueprint?.preview_image_url || "",
    worldSize,
    components,
    bounds,
    mainComponent,
    detectedTemplateType,
    hasExactAdmin3D: components.length > 0,
    defaultDimensions: {
      width_mm,
      height_mm,
      depth_mm,
    },
    metadata: {
      width_mm,
      height_mm,
      depth_mm,
      wood_type:
        blueprint?.primary_material ||
        blueprint?.wood_type ||
        mainComponent?.wood_type ||
        designData?.woodType ||
        "",
      finish_color:
        blueprint?.finish_color ||
        mainComponent?.finish_color ||
        designData?.finishColor ||
        "",
      hardware:
        blueprint?.hardware ||
        mainComponent?.hardware ||
        designData?.hardware ||
        "",
      door_style:
        blueprint?.door_style ||
        designData?.doorStyle ||
        "",
    },
  };
}