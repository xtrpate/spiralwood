// controllers/customer/customer.blueprints.js
const db = require("../../config/db");

const IMAGE_FILE_TYPES = new Set(["png", "jpg", "jpeg", "webp", "svg"]);

const parseJsonSafe = (value, fallback = {}) => {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
};

const normalizeTemplateType = (
  templateType = "",
  furnitureType = "",
  title = "",
) => {
  const rawTemplate = String(templateType || "")
    .trim()
    .toLowerCase();
  const rawFurniture = String(furnitureType || "")
    .trim()
    .toLowerCase();
  const rawTitle = String(title || "")
    .trim()
    .toLowerCase();

  if (
    rawTemplate.includes("chair") ||
    rawFurniture === "chair" ||
    rawFurniture === "dining_chair" ||
    rawTitle.includes("chair")
  ) {
    return "template_dining_chair";
  }

  if (
    rawTemplate.includes("coffee") ||
    rawFurniture === "coffee_table" ||
    rawTitle.includes("coffee table")
  ) {
    return "template_coffee_table";
  }

  if (
    rawTemplate.includes("table") ||
    rawFurniture === "table" ||
    rawFurniture === "dining_table" ||
    rawTitle.includes("table")
  ) {
    return "template_dining_table";
  }

  if (
    rawTemplate.includes("bed") ||
    rawFurniture === "bed" ||
    rawTitle.includes("bed")
  ) {
    return "template_bed_frame";
  }

  if (
    rawTemplate.includes("cabinet") ||
    rawTemplate.includes("closet") ||
    rawTemplate.includes("wardrobe") ||
    rawFurniture === "cabinet" ||
    rawFurniture === "closet" ||
    rawFurniture === "wardrobe" ||
    rawTitle.includes("cabinet") ||
    rawTitle.includes("closet") ||
    rawTitle.includes("wardrobe")
  ) {
    return "template_closet_wardrobe";
  }

  return "";
};

const resolveReferencePreviewUrl = (designData = {}) => {
  const referenceFiles =
    designData?.reference_files || designData?.referenceFiles || {};
  const frontReference =
    referenceFiles?.front ||
    designData?.reference_file ||
    designData?.referenceFile ||
    null;

  return String(frontReference?.url || frontReference?.file_url || "").trim();
};

const resolvePreviewImageUrl = (row = {}, designData = {}) => {
  const thumbnailUrl = String(row.thumbnail_url || "").trim();
  if (thumbnailUrl) return thumbnailUrl;

  const referencePreviewUrl = resolveReferencePreviewUrl(designData);
  if (referencePreviewUrl) return referencePreviewUrl;

  const fileType = String(row.file_type || "")
    .trim()
    .toLowerCase();
  const fileUrl = String(row.file_url || "").trim();

  if (fileUrl && IMAGE_FILE_TYPES.has(fileType)) {
    return fileUrl;
  }

  return "";
};

const computeBoundsFromComponents = (items = []) => {
  if (!Array.isArray(items) || !items.length) return null;

  const normalized = items
    .map((item) => ({
      x: toNumber(item.x ?? item.position_x, 0),
      y: toNumber(item.y ?? item.position_y, 0),
      z: toNumber(item.z ?? item.position_z, 0),
      width: Math.max(1, toNumber(item.width ?? item.w ?? item.width_mm, 0)),
      height: Math.max(1, toNumber(item.height ?? item.h ?? item.height_mm, 0)),
      depth: Math.max(1, toNumber(item.depth ?? item.d ?? item.depth_mm, 0)),
    }))
    .filter((item) => item.width > 0 && item.height > 0 && item.depth > 0);

  if (!normalized.length) return null;

  const minX = Math.min(...normalized.map((c) => c.x));
  const minY = Math.min(...normalized.map((c) => c.y));
  const minZ = Math.min(...normalized.map((c) => c.z));

  const maxX = Math.max(...normalized.map((c) => c.x + c.width));
  const maxY = Math.max(...normalized.map((c) => c.y + c.height));
  const maxZ = Math.max(...normalized.map((c) => c.z + c.depth));

  return {
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
    depth: Math.max(1, Math.round(maxZ - minZ)),
  };
};

const resolveBaseDimensions = (row = {}, designData = {}, view3dData = {}) => {
  const exactSceneBounds =
    computeBoundsFromComponents(extractSceneItems(view3dData)) ||
    computeBoundsFromComponents(extractSceneItems(designData)) ||
    computeBoundsFromComponents(row?.components);

  if (exactSceneBounds) {
    return {
      width_mm: exactSceneBounds.width,
      height_mm: exactSceneBounds.height,
      depth_mm: exactSceneBounds.depth,
    };
  }

  const explicit =
    designData?.customerCustomization?.default_dimensions ||
    designData?.customizationRules?.default_dimensions ||
    designData?.importDimensions ||
    designData?.referenceDimensions ||
    row?.default_dimensions ||
    row?.import_dimensions ||
    row?.reference_dimensions ||
    null;

  if (explicit) {
    const width = toNumber(
      explicit.w ?? explicit.width ?? explicit.width_mm,
      0,
    );
    const height = toNumber(
      explicit.h ?? explicit.height ?? explicit.height_mm,
      0,
    );
    const depth = toNumber(
      explicit.d ?? explicit.depth ?? explicit.depth_mm,
      0,
    );

    if (width > 0 && height > 0 && depth > 0) {
      return {
        width_mm: Math.round(width),
        height_mm: Math.round(height),
        depth_mm: Math.round(depth),
      };
    }
  }

  return {
    width_mm: null,
    height_mm: null,
    depth_mm: null,
  };
};

const resolveCustomizationRules = (
  row = {},
  designData = {},
  view3dData = {},
) => {
  const baseDimensions = resolveBaseDimensions(row, designData, view3dData);

  const rawRules =
    designData?.customerCustomization ||
    designData?.customizationRules ||
    designData?.allowedOptions ||
    {};

  const ratioMin = Math.max(0.3, toNumber(rawRules.dimension_ratio_min, 0.7));
  const ratioMax = Math.max(1, toNumber(rawRules.dimension_ratio_max, 1.3));

  const buildDimensionRule = (key, seed) => {
    const explicit =
      rawRules?.dimensions?.[key] || rawRules?.dimension_limits?.[key] || {};

    const defaultValue =
      toNumber(
        explicit.default ?? explicit.default_mm ?? explicit.value ?? seed,
        0,
      ) || null;

    if (!defaultValue) {
      return {
        default: null,
        min: null,
        max: null,
      };
    }

    const min =
      toNumber(explicit.min ?? explicit.min_mm, 0) ||
      Math.max(100, Math.round(defaultValue * ratioMin));

    const max =
      toNumber(explicit.max ?? explicit.max_mm, 0) ||
      Math.max(min, Math.round(defaultValue * ratioMax));

    return {
      default: defaultValue,
      min,
      max,
    };
  };

  return {
    editable: {
      width: rawRules?.editable?.width !== false,
      height: rawRules?.editable?.height !== false,
      depth: rawRules?.editable?.depth !== false,
      wood_type: rawRules?.editable?.wood_type !== false,
      finish_color: rawRules?.editable?.finish_color !== false,
      door_style: rawRules?.editable?.door_style !== false,
      hardware: rawRules?.editable?.hardware !== false,
      comments: true,
      quantity: true,
    },
    dimensions: {
      width: buildDimensionRule("width", baseDimensions.width_mm),
      height: buildDimensionRule("height", baseDimensions.height_mm),
      depth: buildDimensionRule("depth", baseDimensions.depth_mm),
    },
    allowed_materials: normalizeStringArray(
      rawRules?.allowed_materials ||
        rawRules?.allowed_wood_types ||
        designData?.allowedWoodTypes ||
        [],
    ),
    allowed_finishes: normalizeStringArray(
      rawRules?.allowed_finishes ||
        rawRules?.allowed_finish_colors ||
        designData?.allowedFinishColors ||
        [],
    ),
    allowed_hardware: normalizeStringArray(
      rawRules?.allowed_hardware || designData?.allowedHardware || [],
    ),
    allowed_door_styles: normalizeStringArray(
      rawRules?.allowed_door_styles || designData?.allowedDoorStyles || [],
    ),
  };
};

const resolveCategoryLabel = (templateType = "", fallback = "") => {
  if (templateType.includes("chair")) return "Chair";
  if (templateType.includes("table") || templateType.includes("coffee_table")) {
    return "Table";
  }
  if (templateType.includes("bed")) return "Bed";
  if (templateType.includes("cabinet")) return "Cabinet / Wardrobe";

  return String(fallback || "").trim() || "Furniture Template";
};

const inferTemplateTypeFromSceneItems = (items = [], fallback = "") => {
  const haystack = (Array.isArray(items) ? items : [])
    .flatMap((item) => [
      item?.type,
      item?.label,
      item?.category,
      item?.groupType,
      item?.blueprintStyle,
      item?.templateType,
      item?.partCode,
    ])
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .join(" ");

  if (!haystack) {
    return normalizeTemplateType(fallback);
  }

  if (
    haystack.includes("chair") ||
    haystack.includes("seat panel") ||
    haystack.includes("back slat") ||
    haystack.includes("chair_front_leg") ||
    haystack.includes("chair_back_leg") ||
    haystack.includes("dining_chair")
  ) {
    return "template_dining_chair";
  }

  if (haystack.includes("coffee table") || haystack.includes("coffee_table")) {
    return "template_coffee_table";
  }

  if (
    haystack.includes("table") ||
    haystack.includes("desk") ||
    haystack.includes("dt_top_panel") ||
    haystack.includes("dining_table")
  ) {
    return "template_dining_table";
  }

  if (
    haystack.includes("bed") ||
    haystack.includes("bed_frame") ||
    haystack.includes("headboard") ||
    haystack.includes("footboard")
  ) {
    return "template_bed_frame";
  }

  if (
    haystack.includes("cabinet") ||
    haystack.includes("closet") ||
    haystack.includes("wardrobe") ||
    haystack.includes("wr_side_panel") ||
    haystack.includes("wr_divider") ||
    haystack.includes("wr_shelf") ||
    haystack.includes("door_front_panel") ||
    haystack.includes("drawer_front_panel")
  ) {
    return "template_closet_wardrobe";
  }

  return normalizeTemplateType(fallback);
};

const extractSceneItems = (source = {}) => {
  if (!source || typeof source !== "object") return [];

  const candidates = [
    source.components,
    source.objects,
    source.items,
    source.parts,
    source.meshes,
    source.scene?.components,
    source.scene?.objects,
    source.sceneData?.components,
    source.sceneData?.objects,
  ];

  const found = candidates.find(Array.isArray);
  return found || [];
};

const hasExactAdmin3DSource = (row = {}, designData = {}, view3dData = {}) => {
  const viewItems = extractSceneItems(view3dData);
  if (viewItems.length > 0) return true;

  const design3DSources = [
    designData?.scene,
    designData?.sceneData,
    designData?.view3d,
    designData?.saved3d,
    designData?.saved3D,
  ].filter(Boolean);

  return design3DSources.some((source) => extractSceneItems(source).length > 0);
};

const enrichBlueprintForCustomer = (row = {}) => {
  const designData = parseJsonSafe(row.design_data, {});
  const view3dData = parseJsonSafe(row.view_3d_data, {});

  const sceneItems = [
    ...extractSceneItems(view3dData),
    ...extractSceneItems(designData),
    ...(Array.isArray(row?.components) ? row.components : []),
  ];

  const sceneBounds = computeBoundsFromComponents(sceneItems) || null;

  const explicitTemplateType =
    row.preview_template_type ||
    row.import_template_type ||
    designData?.importTemplateType ||
    designData?.import_type ||
    designData?.templateType ||
    view3dData?.importTemplateType ||
    "";

  const furnitureType =
    view3dData?.furnitureType ||
    designData?.furnitureType ||
    designData?.blueprintSetup?.furnitureType ||
    row?.furniture_type ||
    row?.category ||
    "";

  const previewTemplateType =
    inferTemplateTypeFromSceneItems(sceneItems, explicitTemplateType) ||
    normalizeTemplateType(explicitTemplateType, furnitureType, row.title);

  const defaultDimensions = resolveBaseDimensions(row, designData, view3dData);
  const customizationRules = resolveCustomizationRules(
    row,
    designData,
    view3dData,
  );
  const previewImageUrl = resolvePreviewImageUrl(row, designData);

  const exactAdmin3D = hasExactAdmin3DSource(row, designData, view3dData);

  return {
    ...row,

    // IMPORTANT: parsed objects na mismo ang ibalik sa frontend
    design_data: designData,
    view_3d_data: view3dData,

    // normalized preview/meta
    title: row.title || "",
    description: row.description || "",
    category: resolveCategoryLabel(previewTemplateType, row.category),
    category_label: resolveCategoryLabel(previewTemplateType, row.category),

    furniture_type: furnitureType,
    furnitureType,
    template_type: previewTemplateType,
    templateType: previewTemplateType,
    preview_template_type: previewTemplateType,

    // IMPORTANT: force fallback image para kahit anong field ang basahin ng frontend
    thumbnail_url: previewImageUrl || row.thumbnail_url || "",
    preview_image_url: previewImageUrl || row.thumbnail_url || "",

    scene_bounds: sceneBounds,

    // exact admin bounds
    width_mm: defaultDimensions.width_mm,
    height_mm: defaultDimensions.height_mm,
    depth_mm: defaultDimensions.depth_mm,

    // aliases para sa iba't ibang frontend usage
    default_dimensions: defaultDimensions,
    dimensions: {
      width_mm: defaultDimensions.width_mm,
      height_mm: defaultDimensions.height_mm,
      depth_mm: defaultDimensions.depth_mm,
      w: defaultDimensions.width_mm,
      h: defaultDimensions.height_mm,
      d: defaultDimensions.depth_mm,
      width: defaultDimensions.width_mm,
      height: defaultDimensions.height_mm,
      depth: defaultDimensions.depth_mm,
    },
    import_dimensions: {
      width_mm: defaultDimensions.width_mm,
      height_mm: defaultDimensions.height_mm,
      depth_mm: defaultDimensions.depth_mm,
      w: defaultDimensions.width_mm,
      h: defaultDimensions.height_mm,
      d: defaultDimensions.depth_mm,
      width: defaultDimensions.width_mm,
      height: defaultDimensions.height_mm,
      depth: defaultDimensions.depth_mm,
    },

    customization_rules: customizationRules,
    primary_material:
      designData?.woodType || designData?.material || row?.wood_type || "",
    finish_color:
      designData?.finishColor ||
      designData?.finish_color ||
      row?.finish_color ||
      "",
    hardware: designData?.hardware || row?.hardware || "",
    door_style: designData?.doorStyle || row?.door_style || "",

    has_saved_3d: exactAdmin3D,
  };
};

/* ── GET /customer/blueprints ─────────────────────────────────────────────── */
exports.getAllBlueprints = async (req, res) => {
  const { q, wood_type, sort = "newest", page = 1, limit = 24 } = req.query;

  try {
    let where = `WHERE b.is_deleted = 0 
       AND b.is_template = 1 
       AND b.is_gallery = 1
       AND EXISTS (
         SELECT 1 FROM products p 
         WHERE p.blueprint_id = b.id 
         AND p.is_published = 1
       )`;
    const params = [];

    if (q) {
      where += " AND (b.title LIKE ? OR COALESCE(b.description, '') LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }

    if (wood_type) {
      where += " AND b.wood_type = ?";
      params.push(wood_type);
    }

    const sortMap = {
      newest: "COALESCE(b.updated_at, b.created_at) DESC",
      oldest: "COALESCE(b.updated_at, b.created_at) ASC",
      price_asc: "b.base_price ASC",
      price_desc: "b.base_price DESC",
      title_asc: "b.title ASC",
    };

    const orderBy = sortMap[sort] || sortMap.newest;
    const pageNum = Number.parseInt(page, 10) || 1;
    const limitNum = Number.parseInt(limit, 10) || 24;
    const offset = (pageNum - 1) * limitNum;

    // ── FIXED: Main Query (Must be .query for LIMIT compatibility) ──
    const [rows] = await db.query(
      `SELECT
        b.id,
        b.title,
        b.description,
        b.base_price,
        b.wood_type,
        b.thumbnail_url,
        b.file_url,
        b.file_type,
        b.design_data,
        b.view_3d_data,
        b.is_template,
        b.is_gallery,
        b.stage,
        b.source,
        b.created_at,
        b.updated_at,
        u.name AS creator_name
      FROM blueprints b
      LEFT JOIN users u ON u.id = b.creator_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
      [...params, parseInt(limitNum), parseInt(offset)],
    );

    const blueprints = rows.map((row) => {
      const mapped = enrichBlueprintForCustomer(row);

      return {
        id: mapped.id,
        title: mapped.title,
        description: mapped.description,
        base_price: mapped.base_price,
        wood_type: mapped.wood_type,
        thumbnail_url: mapped.thumbnail_url || mapped.preview_image_url || "",
        preview_image_url:
          mapped.preview_image_url || mapped.thumbnail_url || "",
        furniture_type: mapped.furniture_type || mapped.furnitureType || "",
        furnitureType: mapped.furnitureType || mapped.furniture_type || "",
        template_type: mapped.template_type || mapped.templateType || "",
        templateType: mapped.templateType || mapped.template_type || "",
        preview_template_type: mapped.preview_template_type,
        category: mapped.category,
        category_label: mapped.category_label || mapped.category,
        is_template: mapped.is_template,
        is_gallery: mapped.is_gallery,
        stage: mapped.stage,
        source: mapped.source,
        created_at: mapped.created_at,
        updated_at: mapped.updated_at,
        creator_name: mapped.creator_name,
        scene_bounds: mapped.scene_bounds,
        default_dimensions: mapped.default_dimensions,
        dimensions: mapped.dimensions,
        import_dimensions: mapped.import_dimensions,
        width_mm: mapped.width_mm,
        height_mm: mapped.height_mm,
        depth_mm: mapped.depth_mm,
        customization_rules: mapped.customization_rules,
        primary_material: mapped.primary_material,
        finish_color: mapped.finish_color,
        hardware: mapped.hardware,
        door_style: mapped.door_style,
        has_saved_3d: mapped.has_saved_3d,
        design_data: mapped.design_data,
        view_3d_data: mapped.view_3d_data,
      };
    });

    // ── FIXED: Using .query here too for total count ──
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM blueprints b
       ${where}`,
      params,
    );

    // ── FIXED: Using .query for wood types dropdown ──
    const [woodTypes] = await db.query(
      `SELECT DISTINCT wood_type
       FROM blueprints
       WHERE is_deleted = 0
         AND (is_gallery = 1 OR is_template = 1)
         AND wood_type IS NOT NULL
         AND wood_type != ''`,
      [], // Pass empty array for query safety
    );

    res.json({
      blueprints,
      total: countRows[0]?.total || 0,
      page: pageNum,
      limit: limitNum,
      wood_types: woodTypes.map((row) => row.wood_type),
    });
  } catch (err) {
    console.error("[customer.blueprints GET]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── GET /customer/blueprints/:id ─────────────────────────────────────────── */
exports.getBlueprintById = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [rows] = await db.query(
      `SELECT
          b.*,
          u.name AS creator_name
       FROM blueprints b
       LEFT JOIN users u ON u.id = b.creator_id
       WHERE b.id = ?
         AND b.is_deleted = 0
         AND (b.is_gallery = 1 OR b.is_template = 1)
         AND EXISTS (
           SELECT 1 FROM products p 
           WHERE p.blueprint_id = b.id 
           AND p.is_published = 1
         )
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    // ── FIXED: Switched to .query and parsed ID ──
    const [components] = await db.query(
      `SELECT * FROM blueprint_components WHERE blueprint_id = ?`,
      [parseInt(req.params.id)],
    );

    const blueprint = enrichBlueprintForCustomer({
      ...rows[0],
      components,
    });

    res.json({
      ...blueprint,
      thumbnail_url:
        blueprint.thumbnail_url || blueprint.preview_image_url || "",
      preview_image_url:
        blueprint.preview_image_url || blueprint.thumbnail_url || "",
      furniture_type: blueprint.furniture_type || blueprint.furnitureType || "",
      furnitureType: blueprint.furnitureType || blueprint.furniture_type || "",
      template_type: blueprint.template_type || blueprint.templateType || "",
      templateType: blueprint.templateType || blueprint.template_type || "",
      category_label: blueprint.category_label || blueprint.category,
      dimensions: blueprint.dimensions || {
        width_mm: blueprint.width_mm,
        height_mm: blueprint.height_mm,
        depth_mm: blueprint.depth_mm,
        w: blueprint.width_mm,
        h: blueprint.height_mm,
        d: blueprint.depth_mm,
        width: blueprint.width_mm,
        height: blueprint.height_mm,
        depth: blueprint.depth_mm,
      },
      components,
    });
  } catch (err) {
    console.error("[customer.blueprints/:id]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};
