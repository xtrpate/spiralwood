import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import { Search, X, CheckCircle2, Smartphone, Undo2, Redo2, List, Ruler, Box, RotateCcw, Maximize2, Camera } from "lucide-react";
import { useCustomCart } from "./customcartcontext";
import { useCart } from "./cartcontext";
import useAuthStore from "../../store/authStore";
import CustomerBlueprintViewer from "./CustomerBlueprintViewer";
import { WOOD_FINISHES } from "../blueprints/data/furnitureTypes";
import "./customizepage.css";
import CustomerTemplateWorkbench from "./CustomerTemplateWorkbench";
import { saveCustomReferencePhotos } from "../../utils/customReferencePhotoStore";

const FALLBACK_WOOD_TYPES = [
  "Oak",
  "Pine",
  "Walnut",
  "Mahogany",
  "Maple",
  "Plywood",
  "MDF",
];

const FALLBACK_FINISHES = [
  "Natural",
  "White",
  "Black",
  "Brown",
  "Dark Walnut",
  "Light Oak",
  "Custom (see comments)",
];

const FALLBACK_DOOR_STYLES = [
  "Flat Panel",
  "Raised Panel",
  "Shaker",
  "Louvered",
  "Glass Panel",
  "Open (No Door)",
];

const FALLBACK_HARDWARE = [
  "Silver Handles",
  "Gold Handles",
  "Black Handles",
  "Knobs",
  "Concealed Hinges",
  "Exposed Hinges",
  "No Hardware",
];

const TEMPLATE_PROFILES = {
  chair: {
    id: "chair",
    title: "Chair Template",
    category: "Chair Template",
    keywords: [
      "chair",
      "dining chair",
      "seat",
      "backrest",
      "stool",
      "armchair",
      "bench chair",
    ],
    defaultDimensions: { width: 480, height: 900, depth: 520 },
    dimensionRanges: {
      width: { min: 380, max: 700, default: 480 },
      height: { min: 750, max: 1300, default: 900 },
      depth: { min: 380, max: 700, default: 520 },
    },
    labels: {
      width: "Overall Width",
      height: "Overall Height",
      depth: "Seat Depth",
      hardware: "Leg Style / Hardware",
    },
    materials: ["Oak", "Pine", "Walnut", "Mahogany", "Maple"],
    finishes: ["Natural", "Walnut", "Dark Walnut", "Black", "White", "Brown"],
    hardware: [
      "Wood Legs",
      "Metal Legs",
      "Floor Protectors",
      "Plastic Glides",
      "No Extra Hardware",
    ],
    doorStyles: [],
    showDoorStyle: false,
    showHardware: true,
    shortNote:
      "Structure is locked. You may only adjust allowed size, wood, finish, and optional build details.",
  },

  table: {
    id: "table",
    title: "Table Template",
    category: "Table Template",
    keywords: [
      "table",
      "desk",
      "console",
      "counter",
      "tabletop",
      "work table",
      "coffee table",
      "side table",
    ],
    defaultDimensions: { width: 1200, height: 750, depth: 700 },
    dimensionRanges: {
      width: { min: 600, max: 2400, default: 1200 },
      height: { min: 650, max: 1100, default: 750 },
      depth: { min: 400, max: 1200, default: 700 },
    },
    labels: {
      width: "Table Width",
      height: "Table Height",
      depth: "Table Depth",
      hardware: "Base / Hardware",
    },
    materials: ["Oak", "Pine", "Walnut", "Mahogany", "Maple", "MDF"],
    finishes: ["Natural", "Walnut", "Dark Walnut", "Black", "White", "Brown"],
    hardware: [
      "Wood Legs",
      "Metal Legs",
      "Adjustable Feet",
      "Cable Hole",
      "No Extra Hardware",
    ],
    doorStyles: [],
    showDoorStyle: false,
    showHardware: true,
    shortNote:
      "Main structure stays fixed. You can adjust the allowed size, wood finish, and base details only.",
  },

  cabinet: {
    id: "cabinet",
    title: "Cabinet Template",
    category: "Cabinet Template",
    keywords: [
      "cabinet",
      "closet",
      "wardrobe",
      "drawer",
      "kitchen",
      "storage",
      "shelf cabinet",
      "door panel",
      "divider",
    ],
    defaultDimensions: { width: 1200, height: 2100, depth: 600 },
    dimensionRanges: {
      width: { min: 600, max: 3200, default: 1200 },
      height: { min: 1600, max: 3120, default: 2100 },
      depth: { min: 420, max: 780, default: 600 },
    },
    labels: {
      width: "Cabinet Width",
      height: "Cabinet Height",
      depth: "Cabinet Depth",
      hardware: "Hardware",
    },
    materials: ["Oak", "Plywood", "MDF", "Walnut", "Mahogany", "Maple"],
    finishes: [
      "Natural",
      "White",
      "Black",
      "Brown",
      "Dark Walnut",
      "Light Oak",
    ],
    hardware: FALLBACK_HARDWARE,
    doorStyles: FALLBACK_DOOR_STYLES,
    showDoorStyle: true,
    showHardware: true,
    shortNote:
      "The main cabinet structure stays fixed. You can adjust the available size, material, finish, and accessory options.",
  },

  shelf: {
    id: "shelf",
    title: "Shelf Template",
    category: "Shelf Template",
    keywords: ["shelf", "rack", "bookcase", "display shelf"],
    defaultDimensions: { width: 900, height: 1800, depth: 350 },
    dimensionRanges: {
      width: { min: 500, max: 1800, default: 900 },
      height: { min: 900, max: 2600, default: 1800 },
      depth: { min: 220, max: 600, default: 350 },
    },
    labels: {
      width: "Shelf Width",
      height: "Shelf Height",
      depth: "Shelf Depth",
      hardware: "Shelf Hardware",
    },
    materials: ["Oak", "Plywood", "MDF", "Walnut", "Maple"],
    finishes: ["Natural", "White", "Black", "Brown", "Light Oak"],
    hardware: ["Wall Brackets", "Adjustable Feet", "No Extra Hardware"],
    doorStyles: [],
    showDoorStyle: false,
    showHardware: true,
    shortNote:
      "Shelf body is fixed. You can adjust allowed size, material, finish, and simple hardware only.",
  },

  generic: {
    id: "generic",
    title: "Furniture Template",
    category: "Furniture Template",
    keywords: [],
    defaultDimensions: { width: 1000, height: 900, depth: 500 },
    dimensionRanges: {
      width: { min: 400, max: 2400, default: 1000 },
      height: { min: 600, max: 2400, default: 900 },
      depth: { min: 300, max: 1200, default: 500 },
    },
    labels: {
      width: "Width",
      height: "Height",
      depth: "Depth",
      hardware: "Hardware",
    },
    materials: FALLBACK_WOOD_TYPES,
    finishes: FALLBACK_FINISHES,
    hardware: FALLBACK_HARDWARE,
    doorStyles: FALLBACK_DOOR_STYLES,
    showDoorStyle: true,
    showHardware: true,
    shortNote:
      "The main furniture structure stays fixed. You can adjust the available customization options.",
  },
};

const resolveImageSrc = (src) => {
  const raw = String(src || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("/template-previews/") ||
    raw.startsWith("/images/") ||
    raw.startsWith("/assets/")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const toPositiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const formatMm = (value) => {
  const n = toPositiveNumber(value);
  return n > 0 ? `${Math.round(n)} mm` : "—";
};

const uniqueStrings = (items = []) => [
  ...new Set(items.map((item) => String(item || "").trim()).filter(Boolean)),
];

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  if (Number.isFinite(min) && value < min) return min;
  if (Number.isFinite(max) && value > max) return max;
  return value;
};

const resolveBaseDimensionValue = (...candidates) => {
  for (const value of candidates) {
    const n = toPositiveNumber(value);
    if (n > 0) return n;
  }
  return 0;
};

const extractSceneItems = (source) => {
  if (!source || typeof source !== "object") return [];
  const safeScene = source.scene || {};
  const safeSceneData = source.sceneData || {};

  const candidates = [
    source.components,
    source.objects,
    source.items,
    source.parts,
    source.meshes,
    safeScene.components,
    safeScene.objects,
    safeSceneData.components,
    safeSceneData.objects,
  ];

  const found = candidates.find(Array.isArray);
  return found || [];
};

const computeSceneBounds = (blueprint = {}) => {
  const items = [
    ...extractSceneItems(blueprint?.view_3d_data),
    ...extractSceneItems(blueprint?.design_data),
    ...(Array.isArray(blueprint?.components) ? blueprint.components : []),
  ];

  if (!items.length) return null;

  const normalized = items
    .map((item) => ({
      x: Number(item?.x ?? item?.position_x ?? 0) || 0,
      y: Number(item?.y ?? item?.position_y ?? 0) || 0,
      z: Number(item?.z ?? item?.position_z ?? 0) || 0,
      width: Math.max(
        1,
        Number(item?.width ?? item?.w ?? item?.width_mm ?? 0) || 0,
      ),
      height: Math.max(
        1,
        Number(item?.height ?? item?.h ?? item?.height_mm ?? 0) || 0,
      ),
      depth: Math.max(
        1,
        Number(item?.depth ?? item?.d ?? item?.depth_mm ?? 0) || 0,
      ),
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
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    depth: Math.round(maxZ - minZ),
  };
};

const detectProfileFromSceneItems = (blueprint = {}) => {
  const items = [
    ...extractSceneItems(blueprint?.view_3d_data),
    ...extractSceneItems(blueprint?.design_data),
    ...(Array.isArray(blueprint?.components) ? blueprint.components : []),
  ];

  const haystack = items
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

  if (!haystack) return null;

  if (
    haystack.includes("chair") ||
    haystack.includes("seat panel") ||
    haystack.includes("back slat") ||
    haystack.includes("chair_front_leg") ||
    haystack.includes("chair_back_leg")
  ) {
    return TEMPLATE_PROFILES.chair;
  }

  if (haystack.includes("coffee table") || haystack.includes("coffee_table")) {
    return TEMPLATE_PROFILES.table;
  }

  if (
    haystack.includes("table") ||
    haystack.includes("desk") ||
    haystack.includes("dt_top_panel")
  ) {
    return TEMPLATE_PROFILES.table;
  }

  if (
    haystack.includes("bed") ||
    haystack.includes("bed_frame") ||
    haystack.includes("headboard")
  ) {
    return TEMPLATE_PROFILES.bed || TEMPLATE_PROFILES.generic;
  }

  if (
    haystack.includes("cabinet") ||
    haystack.includes("closet") ||
    haystack.includes("wardrobe") ||
    haystack.includes("wr_side_panel") ||
    haystack.includes("wr_divider") ||
    haystack.includes("wr_shelf")
  ) {
    return TEMPLATE_PROFILES.cabinet;
  }

  return null;
};

const mapTemplateTypeToProfile = (value = "") => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) return null;

  if (raw.includes("chair")) return TEMPLATE_PROFILES.chair;

  if (
    raw.includes("table") ||
    raw.includes("coffee_table") ||
    raw.includes("coffee table")
  ) {
    return TEMPLATE_PROFILES.table;
  }

  if (
    raw.includes("cabinet") ||
    raw.includes("closet") ||
    raw.includes("wardrobe")
  ) {
    return TEMPLATE_PROFILES.cabinet;
  }

  if (
    raw.includes("shelf") ||
    raw.includes("rack") ||
    raw.includes("bookcase")
  ) {
    return TEMPLATE_PROFILES.shelf;
  }

  return null;
};

const buildTemplateHaystack = (blueprint = {}) =>
  [
    blueprint?.title,
    blueprint?.description,
    blueprint?.category,
    blueprint?.template_type,
    blueprint?.template_category,
    blueprint?.product_type,
    blueprint?.primary_material,
    blueprint?.wood_type,
    blueprint?.preview_template_type,
    blueprint?.import_template_type,
    blueprint?.furnitureType,
    blueprint?.design_data?.templateType,
    blueprint?.design_data?.importTemplateType,
    blueprint?.design_data?.import_type,
    blueprint?.design_data?.furnitureType,
    blueprint?.design_data?.blueprintSetup?.furnitureType,
    blueprint?.view_3d_data?.templateType,
    blueprint?.view_3d_data?.importTemplateType,
    blueprint?.view_3d_data?.furnitureType,
  ]
    .map((item) => String(item || "").toLowerCase())
    .join(" ");

const detectTemplateProfile = (blueprint = {}) => {
  const sceneProfile = detectProfileFromSceneItems(blueprint);
  if (sceneProfile) return sceneProfile;

  const explicitProfile =
    mapTemplateTypeToProfile(blueprint?.preview_template_type) ||
    mapTemplateTypeToProfile(blueprint?.import_template_type) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.templateType) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.importTemplateType) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.import_type) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.furnitureType) ||
    mapTemplateTypeToProfile(
      blueprint?.design_data?.blueprintSetup?.furnitureType,
    ) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.templateType) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.importTemplateType) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.furnitureType);

  if (explicitProfile) return explicitProfile;

  const haystack = buildTemplateHaystack(blueprint);

  const orderedProfiles = [
    TEMPLATE_PROFILES.chair,
    TEMPLATE_PROFILES.table,
    TEMPLATE_PROFILES.cabinet,
    TEMPLATE_PROFILES.shelf,
  ];

  for (const profile of orderedProfiles) {
    if (profile.keywords.some((keyword) => haystack.includes(keyword))) {
      return profile;
    }
  }

  return TEMPLATE_PROFILES.generic;
};

const resolveSavedTemplateProfile = (blueprint = {}) => {
  const explicit =
    mapTemplateTypeToProfile(blueprint?.template_profile) ||
    mapTemplateTypeToProfile(blueprint?.preview_template_type) ||
    mapTemplateTypeToProfile(blueprint?.import_template_type) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.templateType) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.importTemplateType) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.import_type) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.furnitureType) ||
    mapTemplateTypeToProfile(
      blueprint?.design_data?.blueprintSetup?.furnitureType,
    ) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.templateType) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.importTemplateType) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.furnitureType);

  return explicit || detectTemplateProfile(blueprint);
};

const normalizeDimensionRule = (sourceRule, fallbackRule) => {
  const sourceMin = toPositiveNumber(sourceRule?.min);
  const sourceMax = toPositiveNumber(sourceRule?.max);
  const sourceDefault = toPositiveNumber(sourceRule?.default);

  const looksAbsurd =
    !sourceMin ||
    !sourceMax ||
    sourceMin >= sourceMax ||
    sourceMin > fallbackRule.max * 1.35 ||
    sourceMax > fallbackRule.max * 1.8 ||
    sourceMax < fallbackRule.min;

  if (looksAbsurd) {
    return { ...fallbackRule };
  }

  return {
    min: sourceMin,
    max: sourceMax,
    default: clamp(sourceDefault || fallbackRule.default, sourceMin, sourceMax),
  };
};

const resolveDimensionConfig = (blueprint = {}, dimRules = {}, profile) => {
  const sceneBounds =
    blueprint?.scene_bounds || computeSceneBounds(blueprint) || null;

  const bounds =
    blueprint?.bounds ||
    blueprint?.design_data?.bounds ||
    blueprint?.view_3d_data?.bounds ||
    {};
  const defaultDims = blueprint?.default_dimensions || {};

  const widthRuleBase = normalizeDimensionRule(
    dimRules?.width,
    profile.dimensionRanges.width,
  );
  const heightRuleBase = normalizeDimensionRule(
    dimRules?.height,
    profile.dimensionRanges.height,
  );
  const depthRuleBase = normalizeDimensionRule(
    dimRules?.depth,
    profile.dimensionRanges.depth,
  );

  const baseWidth = resolveBaseDimensionValue(
    sceneBounds?.width,
    bounds?.width,
    defaultDims?.width_mm,
    defaultDims?.width,
    profile.defaultDimensions.width,
  );

  const baseHeight = resolveBaseDimensionValue(
    sceneBounds?.height,
    bounds?.height,
    defaultDims?.height_mm,
    defaultDims?.height,
    profile.defaultDimensions.height,
  );

  const baseDepth = resolveBaseDimensionValue(
    sceneBounds?.depth,
    bounds?.depth,
    defaultDims?.depth_mm,
    defaultDims?.depth,
    profile.defaultDimensions.depth,
  );

  const widthRule = {
    ...widthRuleBase,
    min: Math.min(widthRuleBase.min, baseWidth || widthRuleBase.min),
    max: Math.max(widthRuleBase.max, baseWidth || widthRuleBase.max),
  };

  const heightRule = {
    ...heightRuleBase,
    min: Math.min(heightRuleBase.min, baseHeight || heightRuleBase.min),
    max: Math.max(heightRuleBase.max, baseHeight || heightRuleBase.max),
  };

  const depthRule = {
    ...depthRuleBase,
    min: Math.min(depthRuleBase.min, baseDepth || depthRuleBase.min),
    max: Math.max(depthRuleBase.max, baseDepth || depthRuleBase.max),
  };

  return {
    rules: {
      width: {
        ...widthRule,
        default: clamp(
          baseWidth || widthRule.default,
          widthRule.min,
          widthRule.max,
        ),
      },
      height: {
        ...heightRule,
        default: clamp(
          baseHeight || heightRule.default,
          heightRule.min,
          heightRule.max,
        ),
      },
      depth: {
        ...depthRule,
        default: clamp(
          baseDepth || depthRule.default,
          depthRule.min,
          depthRule.max,
        ),
      },
    },
    defaultDimensions: {
      width_mm: baseWidth || widthRule.default,
      height_mm: baseHeight || heightRule.default,
      depth_mm: baseDepth || depthRule.default,
    },
  };
};

const resolveOptionSet = (allowed, fallback) => {
  const cleanAllowed = uniqueStrings(Array.isArray(allowed) ? allowed : []);
  return cleanAllowed.length ? cleanAllowed : fallback;
};

const stableText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const slimComponentForKey = (component = {}) => ({
  id: stableText(component?.id),
  type: stableText(component?.type),
  label: stableText(component?.label),
  x: Math.round(Number(component?.x || 0) || 0),
  y: Math.round(Number(component?.y || 0) || 0),
  z: Math.round(Number(component?.z || 0) || 0),
  width: Math.round(Number(component?.width || 0) || 0),
  height: Math.round(Number(component?.height || 0) || 0),
  depth: Math.round(Number(component?.depth || 0) || 0),
  rotationX: Math.round(Number(component?.rotationX || 0) || 0),
  rotationY: Math.round(Number(component?.rotationY || 0) || 0),
  rotationZ: Math.round(Number(component?.rotationZ || 0) || 0),
  fill: stableText(component?.fill),
  color: stableText(component?.color),
  finish_color: stableText(component?.finish_color),
  finish: stableText(component?.finish),
  material: stableText(component?.material),
  qty: Math.max(1, Number(component?.qty || 1)),
});

const buildStableCustomCartKey = ({
  productId,
  templateProfile,
  width,
  height,
  depth,
  woodType,
  finishColor,
  color,
  doorStyle,
  hardware,
  initialMessage,
  components,
  referencePhotos,
}) => {
  const signature = JSON.stringify({
    productId: Number(productId || 0) || 0,
    templateProfile: stableText(templateProfile),
    width: Math.round(Number(width || 0) || 0),
    height: Math.round(Number(height || 0) || 0),
    depth: Math.round(Number(depth || 0) || 0),
    woodType: stableText(woodType),
    finishColor: stableText(finishColor),
    color: stableText(color),
    doorStyle: stableText(doorStyle),
    hardware: stableText(hardware),
    initialMessage: stableText(initialMessage),
    components: (Array.isArray(components) ? components : [])
      .map(slimComponentForKey)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    referencePhotos: (Array.isArray(referencePhotos) ? referencePhotos : [])
      .map((photo) => ({
        name: stableText(photo?.name),
        type: stableText(photo?.type),
        data_url: String(photo?.data_url || "").trim(),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });

  let hash = 5381;
  for (let i = 0; i < signature.length; i += 1) {
    hash = ((hash << 5) + hash + signature.charCodeAt(i)) >>> 0;
  }

  return `custom_${Number(productId || 0) || "blueprint"}_${hash.toString(36)}`;
};

function ProductImage({ src, alt }) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="cust-img-placeholder">
        <span>🪵</span>
        <small>{alt}</small>
      </div>
    );
  }

  return (
    <img
      src={resolveImageSrc(src)}
      alt={alt}
      className="cust-product-img"
      onError={() => setHasError(true)}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="product-skeleton">
      <div className="skeleton-img" />
      <div className="skeleton-body">
        <div className="skeleton-line short" />
        <div className="skeleton-line medium" />
        <div className="skeleton-line" />
      </div>
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children, wide = false, variant = "" }) {
  return (
    <div
      className={
        "cust-modal-backdrop" +
        (variant === "customize"
          ? " cust-modal-backdrop-customize"
          : "")
      }
      onClick={onClose}
    >
      <div
        className={`cust-modal ${wide ? "cust-modal-wide" : ""} ${variant === "customize" ? "cust-modal-customize" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cust-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>

          <button type="button" className="cust-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="cust-modal-content">
          <div className="rotate-device-overlay">
            <div className="rotate-device-icon">
              <Smartphone size={48} strokeWidth={1.5} />
            </div>
            <h3>Rotate your device</h3>
            <p>
              Please rotate your phone to landscape mode for the best 3D
              customization experience.
            </p>
          </div>

          <div className="cust-modal-inner-content">{children}</div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="cust-info-card">
      <div className="cust-info-label">{label}</div>
      <div className="cust-info-value">{value || "—"}</div>
    </div>
  );
}

function RuleHint({ min, max }) {
  if (!min && !max) return null;

  return (
    <div className="cust-rule-hint">
      Allowed: {min ? `${Math.round(min)} mm` : "—"} to{" "}
      {max ? `${Math.round(max)} mm` : "—"}
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        fontWeight: 700,
      }}
    >
      {icon}
      <span>{title}</span>
    </div>
  );
}

function useBlueprintDetail(id, open) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    if (!id || !open) {
      setDetail(null);
      setLoading(false);
      setError("");
      return;
    }

    (async () => {
      setLoading(true);
      setError("");

      try {
        const response = await api.get(`/customer/blueprints/${id}`);
        if (active) setDetail(response.data);
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              err.response?.data?.error ||
              "Failed to load blueprint details.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id, open]);

  return { detail, loading, error };
}

function CustomizeModal({ product, onClose, onAdd }) {
  const { detail, loading, error } = useBlueprintDetail(product?.id, !!product);

  if (!product) return null;

  const blueprint = detail || product;

  return (
    <ModalShell
      title={blueprint.title || "Customize Design"}
      subtitle="Adjust the available options to match your space and preferences."
      onClose={onClose}
      wide
      variant="customize"
    >
      {loading ? (
        <div className="cust-modal-state">Loading customization options…</div>
      ) : error ? (
        <div className="cust-modal-error">{error}</div>
      ) : (
        <CustomerTemplateWorkbench
          blueprint={blueprint}
          readOnly={false}
          confirmLabel="Add to Cart"
          onConfirm={(draft) => onAdd(blueprint, draft)}
        />
      )}
    </ModalShell>
  );
}

// WISDOM MINI CONFIGURATOR GALLERY V21.0.0
// Read-only miniature of the real WISDOM configurator for gallery preview.
// The furniture remains the existing cached compact Three.js render.
const miniHex = (value, fallback = "#1e293b") => {
  const raw = String(value || "").trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : fallback;
};

const miniParseObject = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const miniSceneComponents = (product = {}) => {
  const view3d = miniParseObject(product?.view_3d_data);
  const design = miniParseObject(product?.design_data);
  const candidates = [
    ...extractSceneItems(view3d),
    ...extractSceneItems(design),
    ...(Array.isArray(product?.components) ? product.components : []),
  ];

  const seen = new Map();
  candidates.forEach((component, index) => {
    if (!component || typeof component !== "object") return;
    const key = String(
      component?.id ||
        component?.partCode ||
        component?.part_code ||
        [
          component?.type,
          component?.label,
          component?.x,
          component?.y,
          component?.z,
          index,
        ].join("|"),
    );
    if (!seen.has(key)) seen.set(key, component);
  });

  return Array.from(seen.values());
};

const miniPartGroup = (component = {}) => {
  const text = [
    component?.type,
    component?.label,
    component?.partRole,
    component?.part_role,
    component?.category,
    component?.groupType,
    component?.groupLabel,
    component?.partCode,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  if (/\btabletop\b|\bcountertop\b|\btop panel\b|\btop\b/.test(text)) return "TOP";
  if (/\bapron\b/.test(text)) return "APRON";
  if (/\bleg\b|front_leg|back_leg/.test(text)) return "LEGS";
  if (/\bdoor\b/.test(text)) return "DOORS";
  if (/\bdrawer\b/.test(text)) return "DRAWERS";
  if (/\bshelf\b/.test(text)) return "SHELVES";
  if (/\bseat\b/.test(text)) return "SEAT";
  if (/\bbackrest\b|\bback slat\b|\bback panel\b/.test(text)) return "BACK";
  if (/\bbase\b|\bplinth\b|\brail\b/.test(text)) return "BASE";
  return "BODY";
};

const miniFinishInfo = (component = {}) => {
  const rawFinish = String(
    component?.finish ||
      component?.finish_id ||
      component?.woodFinish ||
      component?.wood_finish ||
      "",
  )
    .trim()
    .toLowerCase();

  const match = WOOD_FINISHES.find(
    (finish) =>
      String(finish?.id || "").toLowerCase() === rawFinish ||
      String(finish?.label || "").toLowerCase() === rawFinish,
  );

  const color = miniHex(
    match?.front ||
      component?.fill ||
      component?.color ||
      component?.finish_color,
    "#d8b68a",
  );

  return {
    id: match?.id || rawFinish || color,
    label:
      match?.label ||
      component?.finish_label ||
      component?.material ||
      component?.wood_type ||
      "Current finish",
    color,
  };
};

const miniFinishChoices = (selected = null) => {
  const library = WOOD_FINISHES.map((finish) => ({
    id: finish.id,
    label: finish.label,
    color: miniHex(finish.front, "#d8b68a"),
  }));

  const selectedId = String(selected?.id || "").toLowerCase();
  const selectedFromLibrary = library.find(
    (item) => String(item.id || "").toLowerCase() === selectedId,
  );
  const selectedItem = selectedFromLibrary || selected || library[0] || null;
  const remaining = library.filter(
    (item) => String(item.id || "").toLowerCase() !== String(selectedItem?.id || "").toLowerCase(),
  );

  return {
    selected: selectedItem,
    visible: [selectedItem, ...remaining].filter(Boolean).slice(0, 3),
    more: Math.max(0, library.length - 3),
  };
};

const miniPartSections = (product = {}) => {
  const groups = new Map();

  miniSceneComponents(product).forEach((component) => {
    const group = miniPartGroup(component);
    const finish = miniFinishInfo(component);
    if (!groups.has(group)) groups.set(group, []);
    const list = groups.get(group);
    if (!list.some((item) => String(item.id) === String(finish.id))) list.push(finish);
  });

  const orderByProfile = {
    table: ["TOP", "APRON", "LEGS", "SHELVES", "BODY", "BASE"],
    cabinet: ["BODY", "DOORS", "DRAWERS", "SHELVES", "TOP", "BASE"],
    shelf: ["BODY", "SHELVES", "TOP", "BASE"],
    chair: ["SEAT", "BACK", "LEGS", "BODY"],
    generic: ["BODY", "TOP", "DOORS", "DRAWERS", "SHELVES", "LEGS", "BASE"],
  };

  const profile = detectTemplateProfile(product || {});
  const order = orderByProfile[profile?.id] || orderByProfile.generic;

  return order
    .filter((key) => groups.has(key))
    .map((key) => ({
      label: key,
      selected: groups.get(key)[0],
    }))
    .slice(0, 3);
};

function MiniFinishRow({ selected }) {
  const choices = miniFinishChoices(selected);

  return (
    <div className="cust-mini-finish-row-v21">
      <span className="cust-mini-finish-original-v21" title="Original" />
      {choices.visible.map((finish, index) => {
        const isSelected =
          String(finish?.id || "").toLowerCase() ===
          String(choices.selected?.id || "").toLowerCase();

        return (
          <span
            key={`${finish?.id || finish?.label || "finish"}-${index}`}
            className={
              "cust-mini-finish-dot-v21" +
              (isSelected ? " cust-mini-finish-dot-v21--selected" : "")
            }
            style={{ backgroundColor: miniHex(finish?.color, "#d8b68a") }}
            title={finish?.label || "Finish"}
          >
            {isSelected ? <CheckCircle2 size={7} strokeWidth={2.2} /> : null}
          </span>
        );
      })}
      {choices.more > 0 ? (
        <span className="cust-mini-finish-more-v21">+{choices.more}</span>
      ) : null}
    </div>
  );
}

function ProductCard({ product, onCustomize }) {
  const profile = detectTemplateProfile(product || {});
  const dimensionConfig = resolveDimensionConfig(
    product,
    product?.customization_rules?.dimensions || {},
    profile,
  );
  const dimensions = dimensionConfig.defaultDimensions;
  const components = useMemo(() => miniSceneComponents(product), [product]);
  const parts = useMemo(() => miniPartSections(product), [product]);
  const wholeSelected = useMemo(
    () => (components.length ? miniFinishInfo(components[0]) : null),
    [components],
  );

  const categoryLabel = String(
    profile.category || "Furniture Template",
  ).replace(" Template", " Design");

  const customColor = useMemo(() => {
    const candidate = components.find((component) =>
      [component?.fill, component?.color, component?.finish_color].some((value) =>
        /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim()),
      ),
    );
    return miniHex(
      candidate?.fill || candidate?.color || candidate?.finish_color,
      "#1e293b",
    );
  }, [components]);

  return (
    <article className="cust-product-card cust-product-card--roomle cust-mini-card-v21">
      <div className="cust-mini-configurator-v21">
        <div className="cust-mini-tools-v21" aria-hidden="true">
          <span className="cust-mini-close-v21"><X size={10} strokeWidth={1.6} /></span>
          <span className="cust-mini-tool-gap-v21" />
          <span><Undo2 size={9} strokeWidth={1.5} /></span>
          <span><Redo2 size={9} strokeWidth={1.5} /></span>
          <span><List size={9} strokeWidth={1.5} /></span>
          <span><Ruler size={9} strokeWidth={1.5} /></span>
          <span className="cust-mini-mm-v21">mm</span>
          <span><Box size={9} strokeWidth={1.5} /></span>
          <span><RotateCcw size={9} strokeWidth={1.5} /></span>
          <span><Maximize2 size={9} strokeWidth={1.5} /></span>
          <span><Camera size={9} strokeWidth={1.5} /></span>
        </div>

        <div className="cust-mini-preview-v21">
          <div className="cust-roomle-category-label cust-roomle-category-label--inside-v12 cust-mini-category-v21">
            {categoryLabel}
          </div>

          {product.has_saved_3d ? (
            <div className="cust-mini-preview-stage-v21">
              <CustomerBlueprintViewer
                blueprint={product}
                targetDimensionsMm={{
                  widthMm: dimensions.width_mm,
                  heightMm: dimensions.height_mm,
                  depthMm: dimensions.depth_mm,
                }}
                readOnly
                showHumanControls={false}
                compact
                defaultPreset="iso"
                defaultShowHuman={false}
                compactHeight={232}
              />
            </div>
          ) : (
            <ProductImage
              src={product.preview_image_url || product.thumbnail_url}
              alt={product.title}
            />
          )}
        </div>

        <aside className="cust-mini-panel-v21" aria-hidden="true">
          <section className="cust-mini-panel-section-v21">
            <strong>WHOLE FURNITURE</strong>
            <small>Apply one wood finish to the complete design</small>
            <MiniFinishRow selected={wholeSelected} />
          </section>

          {parts.map((part) => (
            <section key={part.label} className="cust-mini-panel-section-v21 cust-mini-panel-section-v21--part">
              <strong>{part.label}</strong>
              <small>{part.label === "LEGS" ? "4 parts" : "1 part"}</small>
              <MiniFinishRow selected={part.selected} />
            </section>
          ))}

          <section className="cust-mini-panel-section-v21 cust-mini-custom-color-v21">
            <strong>CUSTOM COLOR</strong>
            <small>Applies to the whole furniture</small>
            <div className="cust-mini-color-field-v21">
              <span style={{ backgroundColor: customColor }} />
              <em>{customColor}</em>
            </div>
          </section>

          <section className="cust-mini-size-v21">
            <div className="cust-mini-size-title-v21">
              <strong>Furniture Size (mm)</strong>
              <small>Keeps proportions</small>
            </div>
            <div className="cust-mini-size-labels-v21">
              <span>Width</span><span>Height</span><span>Depth</span>
            </div>
            <div className="cust-mini-size-fields-v21">
              <span>{Math.round(Number(dimensions.width_mm) || 0)}</span>
              <span>{Math.round(Number(dimensions.height_mm) || 0)}</span>
              <span>{Math.round(Number(dimensions.depth_mm) || 0)}</span>
            </div>
          </section>

          <div className="cust-mini-human-v21">
            <strong>Human Size Reference</strong>
            <span>☑ Show</span>
          </div>

          <div className="cust-mini-request-v21">
            <span>Request details</span><strong>+</strong>
          </div>

          <div className="cust-mini-add-v21">Add to Cart</div>
        </aside>

        <div className="cust-mini-footer-v21">
          <div>
            <strong>{product.title || categoryLabel}</strong>
            <small>{categoryLabel}</small>
          </div>
          <span>
            {Math.round(Number(dimensions.width_mm) || 0)} × {Math.round(Number(dimensions.height_mm) || 0)} × {Math.round(Number(dimensions.depth_mm) || 0)} mm
          </span>
        </div>
      </div>

      <div className="cust-roomle-card-action">
        <button
          type="button"
          className="cust-customize-btn cust-customize-btn--roomle"
          onClick={() => onCustomize(product)}
          aria-label={"Customize " + (product.title || "furniture")}
        >
          Customize
        </button>
      </div>
    </article>
  );
}

export default function CustomizePage() {
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const location = useLocation();
  const { user } = useAuthStore();
  const { addToCustomCart } = useCustomCart();
  const { cartCount } = useCart();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  // WISDOM CUSTOMIZE REFINE BY CATEGORY V6
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [customizingProduct, setCustomizingProduct] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [isHiding, setIsHiding] = useState(false);

  const requireCustomerLogin = useCallback(
    (product = null) => {
      if (user?.role === "customer") return true;

      const params = new URLSearchParams(location.search);
      if (product?.id) {
        params.set("template", String(product.id));
      }

      const searchString = params.toString();
      const redirectTo = `${location.pathname}${
        searchString ? `?${searchString}` : ""
      }`;

      navigate("/login", {
        replace: false,
        state: {
          from: {
            pathname: location.pathname,
            search: searchString ? `?${searchString}` : "",
          },
          redirectTo,
        },
      });

      return false;
    },
    [user, navigate, location.pathname, location.search],
  );

  const closeCustomizeModal = useCallback(() => {
    setCustomizingProduct(null);

    const params = new URLSearchParams(location.search);
    if (params.has("template")) {
      params.delete("template");
      const nextSearch = params.toString();
      navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
        replace: true,
      });
    }
  }, [location.pathname, location.search, navigate]);

  const fetchProducts = useCallback(
    async (query = search) => {
      setLoading(true);

      try {
        const response = await api.get("/customer/blueprints", {
          params: {
            q: query || undefined,
            limit: 50,
          },
        });

        setProducts(response.data?.blueprints || []);
        setTotal(response.data?.total || 0);
      } catch (err) {
        console.error(err);
        setProducts([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q") || "";
    setSearch(q);
  }, [location.search]);

  useEffect(() => {
    fetchProducts(search);
  }, [fetchProducts, search]);

  useEffect(() => {
    if (!toastMessage) return;

    const hideTimer = setTimeout(() => setIsHiding(true), 2700);
    const removeTimer = setTimeout(() => {
      setToastMessage("");
      setIsHiding(false);
    }, 3000);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [toastMessage]);

  useEffect(() => {
    if (user?.role !== "customer" || !products.length) return;

    const params = new URLSearchParams(location.search);
    const templateId = Number(params.get("template") || 0);
    if (!templateId) return;

    const matched = products.find((item) => Number(item.id) === templateId);
    if (matched) {
      setCustomizingProduct((prev) =>
        Number(prev?.id) === templateId ? prev : matched,
      );
    }
  }, [user, products, location.search]);

  const handleSearch = (event) => {
    event.preventDefault();
    const q = search.trim();

    navigate(`/customize${q ? `?q=${encodeURIComponent(q)}` : ""}`, {
      replace: false,
    });
  };

  const handleAdd = async (product, draft = {}) => {
    if (!requireCustomerLogin(product)) return;

    const profile = resolveSavedTemplateProfile(product || {});
    const bounds = draft?.bounds || {};
    const defaultDimensions = draft?.defaultDimensions || {};
    const metadata = draft?.metadata || {};

    const width =
      Math.round(
        Number(bounds?.width) || Number(defaultDimensions?.width_mm) || 0,
      ) || 0;

    const height =
      Math.round(
        Number(bounds?.height) || Number(defaultDimensions?.height_mm) || 0,
      ) || 0;

    const depth =
      Math.round(
        Number(bounds?.depth) || Number(defaultDimensions?.depth_mm) || 0,
      ) || 0;

    const woodType =
      metadata?.wood_type ||
      product?.primary_material ||
      product?.wood_type ||
      "";

    const finishColor = metadata?.finish_color || product?.finish_color || "";

    const doorStyle = metadata?.door_style || product?.door_style || "";

    const hardware = metadata?.hardware || product?.hardware || "";

    const initialMessage = String(
      draft?.initial_message || draft?.comments || "",
    ).trim();

    const referencePhotos = Array.isArray(draft?.reference_photos)
      ? draft.reference_photos
      : [];

    const normalizedComponents = Array.isArray(draft?.components)
      ? draft.components
      : [];

    const stableCustomKey = buildStableCustomCartKey({
      productId: product?.id,
      templateProfile: profile?.id,
      width,
      height,
      depth,
      woodType,
      finishColor,
      color: finishColor,
      doorStyle,
      hardware,
      initialMessage,
      components: normalizedComponents,
      referencePhotos,
    });

    let lightweightReferencePhotos = [];

    try {
      lightweightReferencePhotos = await saveCustomReferencePhotos(
        stableCustomKey,
        referencePhotos,
      );
    } catch (error) {
      console.error("Failed to preserve custom reference photos:", error);
      setToastMessage(
        "Reference photos could not be saved. Please try adding the item again.",
      );
      setIsHiding(false);
      return;
    }

    const requestedQuantity = Number(draft?.quantity);
    const customQuantity =
      Number.isSafeInteger(requestedQuantity) && requestedQuantity > 0
        ? requestedQuantity
        : 1;

    addToCustomCart({
      key: stableCustomKey,
      blueprint_id: product.id,
      product_id: product.id,
      product_name: product.title,
      image_url: product.preview_image_url || product.thumbnail_url || "",
      preview_image_url:
        product.preview_image_url || product.thumbnail_url || "",
      item_type: "custom",
      quantity: customQuantity,

      // Custom blueprint pricing is finalized through estimation.
      unit_price: 0,

      wood_type: woodType,
      finish_color: finishColor,
      color: finishColor,
      door_style: doorStyle,
      hardware,

      width,
      height,
      depth,
      unit: "mm",
      comments: initialMessage,
      initial_message: initialMessage,
      reference_photos: lightweightReferencePhotos,

      base_blueprint_title: product.title,
      template_profile: profile.id,
      template_category: profile.category,

      customization_snapshot: {
        width_mm: width,
        height_mm: height,
        depth_mm: depth,
        wood_type: woodType,
        finish_color: finishColor,
        door_style: doorStyle,
        hardware,
        comments: initialMessage,
        initial_message: initialMessage,
        reference_photo_count: lightweightReferencePhotos.length,
        template_profile: profile.id,
      },

      editor_snapshot: {
        worldSize: draft?.worldSize || null,
        components: normalizedComponents,
      },
    });

    setToastMessage(`"${product.title}" added to your custom cart.`);
    setIsHiding(false);
  };


  const categoryOptions = useMemo(() => {
    const byId = new Map();

    products.forEach((product) => {
      const profile = detectTemplateProfile(product || {});
      const id = String(profile?.id || "generic");
      const label = String(profile?.category || "Furniture Template").replace(
        " Template",
        " Design",
      );

      if (!byId.has(id)) {
        byId.set(id, { id, label, count: 0 });
      }

      byId.get(id).count += 1;
    });

    if (categoryFilter !== "all" && !byId.has(categoryFilter)) {
      const fallbackProfile =
        TEMPLATE_PROFILES[categoryFilter] || TEMPLATE_PROFILES.generic;

      byId.set(categoryFilter, {
        id: categoryFilter,
        label: String(
          fallbackProfile?.category || "Furniture Template",
        ).replace(" Template", " Design"),
        count: 0,
      });
    }

    const preferredOrder = [
      "table",
      "cabinet",
      "chair",
      "shelf",
      "generic",
    ];

    const available = Array.from(byId.values()).sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a.id);
      const bIndex = preferredOrder.indexOf(b.id);

      const safeA = aIndex === -1 ? preferredOrder.length : aIndex;
      const safeB = bIndex === -1 ? preferredOrder.length : bIndex;

      if (safeA !== safeB) return safeA - safeB;
      return a.label.localeCompare(b.label);
    });

    return [
      {
        id: "all",
        label: "All Designs",
        count: Number(total || products.length || 0),
      },
      ...available,
    ];
  }, [products, categoryFilter, total]);

  const filteredProducts = useMemo(() => {
    if (categoryFilter === "all") return products;

    return products.filter((product) => {
      const profile = detectTemplateProfile(product || {});
      return String(profile?.id || "generic") === categoryFilter;
    });
  }, [products, categoryFilter]);

  const visibleDesignCount =
    categoryFilter === "all" ? total : filteredProducts.length;

  const renderedCards = useMemo(() => {
    if (loading) {
      return Array.from({ length: 6 }).map((_, index) => (
        <SkeletonCard key={index} />
      ));
    }

    if (!filteredProducts.length) {
      return (
        <div className="cust-empty-state">
          {categoryFilter === "all"
            ? "No custom blueprint templates found."
            : "No designs found in this category."}
        </div>
      );
    }

    return filteredProducts.map((product) => (
      <ProductCard
        key={product.id}
        product={product}
        onCustomize={(selectedProduct) => {
          if (!requireCustomerLogin(selectedProduct)) return;
          setCustomizingProduct(selectedProduct);
        }}
      />
    ));
  }, [loading, filteredProducts, categoryFilter, requireCustomerLogin]);

  return (
    <div className="cust-page">
      <div className="premium-toast-container">
        {toastMessage && (
          <div className={`premium-toast ${isHiding ? "hiding" : ""}`}>
            <CheckCircle2 size={20} color="#111111" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      <div className="cust-page-head">
        <div className="cust-page-copy">
          <h1>Customize Your Furniture</h1>
          <p>
            Choose a furniture design and customize it to match your space and
            preferences.
          </p>
        </div>

        <div className="cust-page-meta">
          {!loading && (
            <div className="cust-results-info">
              {visibleDesignCount} design{visibleDesignCount !== 1 ? "s" : ""} available
            </div>
          )}
        </div>
      </div>

      {/* WISDOM READY-MADE STYLE DESIGN BROWSER V8.4 */}
      <div className="cust-design-browser">
        <aside
          className="cust-category-refine"
          aria-label="Refine furniture designs by category"
        >
          <div className="cust-category-refine-label">
            Refine by Category
          </div>

          <div className="cust-category-refine-options">
            {categoryOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`cust-category-refine-option${
                  categoryFilter === option.id ? " active" : ""
                }`}
                aria-pressed={categoryFilter === option.id}
                onClick={() => setCategoryFilter(option.id)}
              >
                <span>{option.label}</span>
                <span className="cust-category-refine-count">
                  {Number(option.count || 0)}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="cust-design-results" aria-label="Furniture designs">
          <form
            className="cust-search-shell cust-design-search"
            onSubmit={handleSearch}
          >
            <div className="cust-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search designs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </form>

          <div className="cust-products-grid">{renderedCards}</div>
        </section>
      </div>

      {customizingProduct ? (
        <CustomizeModal
          product={customizingProduct}
          onClose={closeCustomizeModal}
          onAdd={handleAdd}
        />
      ) : null}
    </div>
  );
}
