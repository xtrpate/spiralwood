import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {
  Undo2,
  Redo2,
  List,
  Ruler,
  Box,
  RotateCcw,
  Maximize2,
  Camera,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import api from "../../services/api";
import OversizedDeliveryWarning from "../../components/OversizedDeliveryWarning";
import { assessOversizedDelivery } from "../../utils/oversizedDelivery";
import {
  getCustomerWardrobeWidthSupport,
  planCustomerWardrobeWidth,
} from "../../utils/customerWardrobeWidth";
import {
  getCustomerWardrobeHeightDepthSupport,
  planCustomerWardrobeHeight,
  planCustomerWardrobeDepth,
} from "../../utils/customerWardrobeHeightDepth";

import { createFurnitureObject } from "../blueprints/3d/createFurnitureObjects";
import { WOOD_FINISHES } from "../blueprints/data/furnitureTypes";
import { applyWoodFinish } from "../blueprints/data/componentUtils";
import "./customer3dviewer-roomle-complete.css";

const WORLD_W = 6400;
const WORLD_H = 3200;
const WORLD_D = 5200;
const FLOOR_OFFSET = 40;
const MAX_HISTORY = 60;
const SELECTION_COLOR = 0x38bdf8;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/* WISDOM HUMAN REFERENCE RANGE V17
   450 mm supports baby/newborn-size comparison. */
const HUMAN_REFERENCE_MIN_HEIGHT_MM = 450;

/* WISDOM HUMAN REFERENCE TALLEST EVER V18
   2720 mm = 2.72 m = 8 ft 11.1 in, the tallest verified human ever. */
const HUMAN_REFERENCE_MAX_HEIGHT_MM = 2720;

/* WISDOM CUSTOMIZE GUIDED EXPERIENCE V1.0.14.11 */

const CUSTOMIZE_GUIDE_STEPS = [
  {
    label: "Choose Design",
    title: "Choose a design",
    instruction:
      "Pick the furniture design you want to customize. Check the 3D preview before you continue.",
  },
  {
    label: "Set Size",
    title: "Set the size",
    instruction:
      "Enter the width, height, and depth that fit your room or available space.",
  },
  {
    label: "Edit Parts",
    title: "Edit parts",
    instruction:
      "Click Edit Design, then click a part of the furniture if you want to change only that part.",
  },
  {
    label: "Choose Finish",
    title: "Choose a finish",
    instruction:
      "Choose one of the available wood finishes. You can apply it to the full design or only the selected part.",
  },
  {
    label: "Review Design",
    title: "Review your design",
    instruction:
      "Review the size and finish of your design. Change the quantity if you want more than one piece. Notes and reference photos are optional. Use them only to show extra details or design ideas.",
  },
  {
    label: "Submit Request",
    title: "Submit your request",
    instruction:
      "Add the design to your cart. You can review it again before you place your custom request.",
  },
];

const isHexColor = (value) => HEX_COLOR_RE.test(String(value || "").trim());

const getSolidColorHex = (component = {}) => {
  const candidates = [
    component?.fill,
    component?.color,
    component?.finish_color,
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (isHexColor(text)) return text;
  }
  return "";
};

const applySolidColorOverride = (object3d, hex) => {
  if (!object3d || !isHexColor(hex)) return;

  object3d.traverse((child) => {
    if (!child?.isMesh || !child.material) return;
    const patchMaterial = (material) => {
      if (!material) return material;
      const cloned = material.clone();
      cloned.map = null;
      cloned.normalMap = null;
      cloned.roughnessMap = null;
      cloned.metalnessMap = null;
      if (cloned.color) cloned.color = new THREE.Color(hex);
      cloned.needsUpdate = true;
      return cloned;
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map(patchMaterial);
    } else {
      child.material = patchMaterial(child.material);
    }
  });
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clampNumber = (value, min, max) => {
  let next = toNum(value, min || 0);
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  return next;
};

const cloneDeep = (value) => JSON.parse(JSON.stringify(value ?? null));

const buildBoundsFromComponents = (items = []) => {
  if (!Array.isArray(items) || !items.length) {
    return { width_mm: 0, height_mm: 0, depth_mm: 0 };
  }
  const normalized = items
    .map((item) => ({
      x: toNum(item?.x, 0),
      y: toNum(item?.y, 0),
      z: toNum(item?.z, 0),
      width: Math.max(1, toNum(item?.width, 0)),
      height: Math.max(1, toNum(item?.height, 0)),
      depth: Math.max(1, toNum(item?.depth, 0)),
    }))
    .filter((item) => item.width > 0 && item.height > 0 && item.depth > 0);

  if (!normalized.length) return { width_mm: 0, height_mm: 0, depth_mm: 0 };

  const minX = Math.min(...normalized.map((c) => c.x));
  const minY = Math.min(...normalized.map((c) => c.y));
  const minZ = Math.min(...normalized.map((c) => c.z));
  const maxX = Math.max(...normalized.map((c) => c.x + c.width));
  const maxY = Math.max(...normalized.map((c) => c.y + c.height));
  const maxZ = Math.max(...normalized.map((c) => c.z + c.depth));

  return {
    width_mm: Math.max(1, Math.round(maxX - minX)),
    height_mm: Math.max(1, Math.round(maxY - minY)),
    depth_mm: Math.max(1, Math.round(maxZ - minZ)),
  };
};

const getComponentExtents = (items = []) => {
  if (!Array.isArray(items) || !items.length) return null;
  const normalized = items
    .map((item) => ({
      x: toNum(item?.x, 0),
      y: toNum(item?.y, 0),
      z: toNum(item?.z, 0),
      width: Math.max(1, toNum(item?.width, 0)),
      height: Math.max(1, toNum(item?.height, 0)),
      depth: Math.max(1, toNum(item?.depth, 0)),
    }))
    .filter((item) => item.width > 0 && item.height > 0 && item.depth > 0);

  if (!normalized.length) return null;
  const minX = Math.min(...normalized.map((c) => c.x));
  const minY = Math.min(...normalized.map((c) => c.y));
  const minZ = Math.min(...normalized.map((c) => c.z));
  const maxX = Math.max(...normalized.map((c) => c.x + c.width));
  const maxY = Math.max(...normalized.map((c) => c.y + c.height));
  const maxZ = Math.max(...normalized.map((c) => c.z + c.depth));

  return { minX, minY, minZ, maxX, maxY, maxZ };
};

const normalizeDimensions = (source = {}) => ({
  width_mm: toNum(source?.width_mm ?? source?.width ?? source?.w, 0),
  height_mm: toNum(source?.height_mm ?? source?.height ?? source?.h, 0),
  depth_mm: toNum(source?.depth_mm ?? source?.depth ?? source?.d, 0),
});

const summarizeMetadata = (items = []) => {
  const first = Array.isArray(items) ? items.find(Boolean) : null;
  return {
    wood_type: String(first?.material || "").trim(),
    finish_color: String(
      first?.finish_id ||
        first?.woodFinish ||
        first?.finish ||
        first?.fill ||
        "",
    ).trim(),
    hardware: "",
    door_style: "",
  };
};

const getFinishPreviewColor = (finishId, fallback = "") => {
  const match = Array.isArray(WOOD_FINISHES)
    ? WOOD_FINISHES.find((item) => item.id === finishId)
    : null;
  return (
    match?.color ||
    match?.hex ||
    match?.previewColor ||
    match?.baseColor ||
    fallback ||
    ""
  );
};

const getPartAxisLabels = (comp) => {
  const text = `${comp?.label || ""} ${comp?.type || ""}`.toLowerCase();
  const flatKeywords = [
    "panel",
    "seat",
    "shelf",
    "top",
    "slat",
    "rail",
    "board",
    "surface",
  ];
  const looksFlat = flatKeywords.some((keyword) => text.includes(keyword));
  return {
    width: "Width",
    height: looksFlat ? "Thickness" : "Height",
    depth: "Depth",
  };
};

const CUSTOMER_PART_GROUP_ORDER = [
  "Whole Furniture",
  "Table Top",
  "Top",
  "Body / Carcass",
  "Body / Panels",
  "Doors",
  "Drawers",
  "Shelves",
  "Dividers",
  "Back Panel",
  "Side Panels",
  "Front Panel",
  "Apron",
  "Rails",
  "Legs",
  "Base",
  "Seat",
  "Backrest",
  "Armrests",
  "Headboard",
  "Footboard",
  "Handles & Hardware",
  "Other Parts",
];

const toCustomerPartTitle = (value = "") =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());

const getCustomerPartGroupLabel = (component = {}) => {
  const type = String(component?.type || "")
    .trim()
    .toLowerCase();
  const role = String(component?.partRole ?? component?.part_role ?? "")
    .trim()
    .toLowerCase();

  const text = [
    component?.type,
    component?.label,
    component?.name,
    component?.partRole,
    component?.part_role,
    component?.partCode,
    component?.technicalId,
    component?.category,
    component?.groupType,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();

  if (!text && !type && !role) return "Other Parts";

  const isHardware =
    role.includes("handle") ||
    role.includes("hardware") ||
    role.includes("knob") ||
    role.includes("pull") ||
    type.includes("handle") ||
    type.includes("hardware") ||
    type.includes("knob") ||
    type.includes("pull");

  if (
    isHardware ||
    text.includes("handle") ||
    text.includes("knob") ||
    text.includes("hardware") ||
    text.includes("pull")
  ) {
    return "Handles & Hardware";
  }

  // Strong structural metadata wins over descriptive names.
  const isShelf =
    role === "shelf" ||
    role.endsWith("_shelf") ||
    type === "wr_shelf" ||
    type === "wr_top_shelf" ||
    type.endsWith("_shelf");

  if (isShelf) return "Shelves";

  const isDrawer =
    role.startsWith("drawer_") ||
    type === "drawer_front_panel" ||
    type.startsWith("wr_drawer_") ||
    type.startsWith("drawer_");

  if (isDrawer) return "Drawers";

  const isDoor =
    role === "door" ||
    role.startsWith("door_") ||
    type === "wr_door" ||
    type.startsWith("door_");

  if (isDoor) return "Doors";

  // Legacy fallback for older generic parts without reliable role/type data.
  if (/(^|[\s_-])drawer([\s_-]|$)/.test(text) || text.includes("drw")) {
    return "Drawers";
  }

  if (/(^|[\s_-])door([\s_-]|$)/.test(text)) {
    return "Doors";
  }

  if (text.includes("table top") || text.includes("tabletop")) {
    return "Table Top";
  }

  if (
    text.includes("top panel") ||
    text.includes("counter top") ||
    text.includes("countertop") ||
    text.includes("worktop") ||
    text.includes("work top") ||
    text.includes("surface")
  ) {
    return "Top";
  }

  if (text.includes("shelf")) return "Shelves";
  if (text.includes("divider")) return "Dividers";

  if (text.includes("headboard") || text.includes("head board")) {
    return "Headboard";
  }

  if (text.includes("footboard") || text.includes("foot board")) {
    return "Footboard";
  }

  if (
    text.includes("backrest") ||
    text.includes("back rest") ||
    text.includes("back slat")
  ) {
    return "Backrest";
  }

  if (text.includes("armrest") || text.includes("arm rest")) {
    return "Armrests";
  }

  if (
    text.includes("seat panel") ||
    text.includes("chair seat") ||
    /(^|[\s_-])seat([\s_-]|$)/.test(text)
  ) {
    return "Seat";
  }

  if (text.includes("apron")) return "Apron";

  if (text.includes("rail") && !text.includes("drawer")) {
    return "Rails";
  }

  if (text.includes("leg") || text.includes("foot") || text.includes("feet")) {
    return "Legs";
  }

  if (
    text.includes("plinth") ||
    text.includes("pedestal") ||
    /(^|[\s_-])base([\s_-]|$)/.test(text)
  ) {
    return "Base";
  }

  if (
    text.includes("back panel") ||
    text.includes("backboard") ||
    text.includes("back board")
  ) {
    return "Back Panel";
  }

  if (
    text.includes("side panel") ||
    text.includes("left panel") ||
    text.includes("right panel")
  ) {
    return "Side Panels";
  }

  if (text.includes("front panel")) return "Front Panel";

  if (
    text.includes("carcass") ||
    text.includes("cabinet body") ||
    text.includes("wardrobe body")
  ) {
    return "Body / Carcass";
  }

  if (text.includes("body") || text.includes("panel")) {
    return "Body / Panels";
  }

  const fallback = toCustomerPartTitle(
    component?.label || component?.name || component?.type || "",
  );

  return fallback || "Other Parts";
};

const normalizeViewerComponent = (comp = {}) => {
  const fill = String(comp?.fill ?? comp?.color ?? "").trim();
  const color = String(comp?.color ?? comp?.fill ?? "").trim();
  const finish = String(
    comp?.finish ?? comp?.finish_id ?? comp?.woodFinish ?? "",
  ).trim();
  const finishColor = String(comp?.finish_color ?? color ?? fill ?? "").trim();

  const colorMode =
    String(comp?.color_mode || "").trim() ||
    (isHexColor(fill || color || finishColor) && !finish
      ? "solid"
      : finish
        ? "wood"
        : "");

  return {
    ...comp,
    id: comp?.id ?? `comp_${Math.random().toString(36).slice(2, 10)}`,
    x: toNum(comp?.x, 0),
    y: toNum(comp?.y, 0),
    z: toNum(comp?.z, 0),
    width: Math.max(1, toNum(comp?.width ?? comp?.width_mm, 1)),
    height: Math.max(1, toNum(comp?.height ?? comp?.height_mm, 1)),
    depth: Math.max(1, toNum(comp?.depth ?? comp?.depth_mm, 1)),
    rotationX: toNum(comp?.rotationX, 0),
    rotationY: toNum(comp?.rotationY, 0),
    rotationZ: toNum(comp?.rotationZ, 0),
    fill: fill || (isHexColor(finishColor) ? finishColor : "#d9c2a5"),
    color: color || fill || (isHexColor(finishColor) ? finishColor : ""),
    finish,
    finish_id: String(comp?.finish_id ?? finish).trim(),
    woodFinish: String(comp?.woodFinish ?? finish).trim(),
    finish_color: finishColor,
    color_mode: colorMode,
    material:
      String(comp?.material || comp?.wood_type || "Marine Plywood").trim() ||
      "Marine Plywood",
    label: comp?.label || comp?.name || comp?.type || "Part", // Fallback label
  };
};

const normalizeViewerComponents = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => normalizeViewerComponent(item))
    .filter(
      (item) =>
        Number.isFinite(item.x) &&
        Number.isFinite(item.y) &&
        Number.isFinite(item.z) &&
        Number.isFinite(item.width) &&
        Number.isFinite(item.height) &&
        Number.isFinite(item.depth) &&
        item.width > 0 &&
        item.height > 0 &&
        item.depth > 0,
    );

// WISDOM CUSTOMER DOOR / DRAWER PREVIEW V1.0.0
// Customer-facing movement is visual-only. Saved component coordinates never change.
const CUSTOMER_DOOR_PREVIEW_OPEN_DEGREES = 82;
const CUSTOMER_MOTION_PREVIEW_DURATION_MS = 320;
const CUSTOMER_DRAWER_PREVIEW_EXTENSION_RATIO = 0.72;
const CUSTOMER_DRAWER_PREVIEW_MIN_EXTENSION_MM = 120;
const CUSTOMER_DRAWER_PREVIEW_MAX_EXTENSION_MM = 520;

const customerMotionEaseOutCubic = (value) => {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return 1 - Math.pow(1 - t, 3);
};

const getCustomerPartFunction = (component = {}) => {
  const value = String(
    component?.partFunction ??
      component?.part_function ??
      component?.interactionType ??
      component?.interaction_type ??
      "auto",
  )
    .trim()
    .toLowerCase();

  return ["auto", "normal", "door", "drawer"].includes(value) ? value : "auto";
};

const getCustomerMotionGroupId = (component = {}) =>
  String(component?.motionGroupId ?? component?.motion_group_id ?? "").trim();

const getCustomerMotionReferencePartId = (component = {}) =>
  String(
    component?.motionReferencePartId ??
      component?.motion_reference_part_id ??
      "",
  ).trim();

const isCustomerDoorPreviewComponent = (component = {}) => {
  if (!component?.id) return false;

  const partFunction = getCustomerPartFunction(component);
  if (partFunction !== "auto") {
    return partFunction === "door";
  }

  const text = [
    component?.type,
    component?.partRole,
    component?.part_role,
    component?.label,
    component?.partCode,
    component?.category,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();

  // Frames, handles, hinges, and rails must not open as separate doors.
  if (/(^|[\s_-])(handle|hinge|knob|pull|frame|jamb|trim|rail)([\s_-]|$)/.test(text)) {
    return false;
  }
  return component?.type === "wr_door" || /(^|[\s_-])door([\s_-]|$)/.test(text);
};

const resolveCustomerDoorHingeSide = (component = {}, allComponents = []) => {
  const explicit = String(
    component?.hingeSide ??
      component?.hinge_side ??
      component?.doorHinge ??
      component?.door_hinge ??
      "",
  )
    .trim()
    .toLowerCase();

  if (explicit.startsWith("r")) return "right";
  if (explicit.startsWith("l")) return "left";

  const labelText = `${component?.label || ""} ${component?.partCode || ""}`
    .trim()
    .toLowerCase();

  if (/\bright\b/.test(labelText)) return "right";
  if (/\bleft\b/.test(labelText)) return "left";

  const siblings = (allComponents || []).filter((item) => {
    if (
      !item ||
      item.id === component.id ||
      !isCustomerDoorPreviewComponent(item)
    ) {
      return false;
    }

    if (component?.groupId && item?.groupId !== component.groupId) {
      return false;
    }

    const yTolerance = Math.max(80, Number(component?.height || 0) * 0.15);
    const zTolerance = Math.max(120, Number(component?.depth || 0) * 4);

    return (
      Math.abs(Number(item?.y || 0) - Number(component?.y || 0)) <=
        yTolerance &&
      Math.abs(Number(item?.z || 0) - Number(component?.z || 0)) <= zTolerance
    );
  });

  const ordered = [component, ...siblings].sort(
    (a, b) => Number(a?.x || 0) - Number(b?.x || 0),
  );

  if (ordered.length > 1) {
    const index = ordered.findIndex((item) => item.id === component.id);
    return index >= Math.ceil(ordered.length / 2) ? "right" : "left";
  }

  return "left";
};

const getCustomerDrawerPreviewText = (component = {}) =>
  [
    component?.type,
    component?.partRole,
    component?.label,
    component?.partCode,
    component?.technicalId,
    component?.category,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();

// WISDOM CUSTOMER DRAWER FIXED-SHELF FILTER V1.0.2
// Labels such as "Drawer Chest Top" describe fixed cabinet shelves, not
// movable drawer-box pieces. Explicit manual Drawer tagging still wins.
const isCustomerDrawerPreviewComponent = (component = {}) => {
  if (!component?.id) return false;

  const partFunction = getCustomerPartFunction(component);
  if (partFunction !== "auto") {
    return partFunction === "drawer";
  }

  if (
    component?.drawerAssemblyId ||
    component?.drawer_assembly_id ||
    component?.drawerId ||
    component?.drawer_id ||
    component?.drawerGroupId ||
    component?.drawer_group_id
  ) {
    return true;
  }

  const type = String(component?.type || "")
    .trim()
    .toLowerCase();
  const role = String(component?.partRole || "")
    .trim()
    .toLowerCase();
  const text = getCustomerDrawerPreviewText(component);
  const code = String(
    component?.partCode || component?.technicalId || "",
  ).trim();

  const hasStrongDrawerIdentity =
    type === "drawer_front_panel" ||
    type.startsWith("wr_drawer_") ||
    type.startsWith("drawer_") ||
    role.startsWith("drawer_") ||
    /(^|-)drw(?:-|$)/i.test(code) ||
    /(^|-)d\d+(?:-|$)/i.test(code);

  if (hasStrongDrawerIdentity) {
    return true;
  }

  const isFixedShelfLike =
    role === "shelf" ||
    role.endsWith("_shelf") ||
    type === "wr_shelf" ||
    type === "wr_top_shelf" ||
    type.endsWith("_shelf");

  if (isFixedShelfLike) {
    return false;
  }

  // Legacy fallback for older generic parts that only identify themselves
  // as a drawer through label/category text.
  return /(^|[\s_-])drawer([\s_-]|$)/.test(text);
};

const isCustomerDrawerPreviewFixedHardware = (component = {}) => {
  const type = String(component?.type || "")
    .trim()
    .toLowerCase();
  const role = String(component?.partRole || "")
    .trim()
    .toLowerCase();
  const text = getCustomerDrawerPreviewText(component);

  return (
    type.includes("drawer_slide") ||
    type.includes("drawer_runner") ||
    role.includes("drawer_slide") ||
    role.includes("drawer_runner") ||
    /(^|[\s_-])(slide|runner)([\s_-]|$)/.test(text)
  );
};

const resolveCustomerDrawerPreviewKey = (component = {}) => {
  if (!component?.id) return "";

  const motionGroupId = getCustomerMotionGroupId(component);
  if (getCustomerPartFunction(component) === "drawer" && motionGroupId) {
    return `motion:${motionGroupId}`;
  }

  const explicit =
    component?.drawerAssemblyId ??
    component?.drawer_assembly_id ??
    component?.drawerId ??
    component?.drawer_id ??
    component?.drawerGroupId ??
    component?.drawer_group_id ??
    "";

  if (String(explicit).trim()) {
    return `drawer-id:${String(explicit).trim()}`;
  }

  const rawCode = String(component?.partCode || component?.technicalId || "")
    .trim()
    .toUpperCase();

  if (rawCode) {
    const baseCode = rawCode.replace(
      /-(?:F|FRONT|SL|SR|SIDE-L|SIDE-R|SIDE-LEFT|SIDE-RIGHT|BK|BACK|BOT|BOTTOM|HDL|HANDLE|SLIDE(?:-[LR])?|RUNNER(?:-[LR])?)$/i,
      "",
    );

    if (
      baseCode !== rawCode &&
      (/(?:^|-)DRW(?:-|$)/i.test(baseCode) ||
        /(?:^|-)DRAWER(?:-|$)/i.test(baseCode) ||
        /(?:^|-)D\d+(?:-|$)/i.test(baseCode))
    ) {
      return `code:${baseCode}`;
    }
  }

  const labelText = String(component?.label || component?.name || "")
    .trim()
    .toLowerCase();

  if (labelText) {
    const bayMatch = labelText.match(/\bbay\s*(\d+)\b/i);
    const drawerMatch =
      labelText.match(
        /\bdrawer\s*(?:front|left\s+side|right\s+side|side|back|bottom|handle|slide|runner)?\s*(\d+)\b/i,
      ) || labelText.match(/\bdrawer\s*(\d+)\b/i);

    if (drawerMatch) {
      const bayKey = bayMatch ? `bay${bayMatch[1]}:` : "";
      return `label:${bayKey}drawer${drawerMatch[1]}`;
    }
  }

  return `single:${component.id}`;
};

const isCustomerDrawerPreviewFrontComponent = (component = {}) => {
  const type = String(component?.type || "")
    .trim()
    .toLowerCase();
  const role = String(component?.partRole || "")
    .trim()
    .toLowerCase();
  const code = String(component?.partCode || component?.technicalId || "")
    .trim()
    .toUpperCase();
  const text = getCustomerDrawerPreviewText(component);

  return (
    type === "drawer_front_panel" ||
    type === "wr_drawer_front" ||
    role === "drawer_front" ||
    role === "drawer_front_panel" ||
    /-F$/i.test(code) ||
    /drawer[\s_-]*front/.test(text)
  );
};

const buildCustomerDoorPreviewSets = (items = []) => {
  const source = (Array.isArray(items) ? items : []).filter(
    isCustomerDoorPreviewComponent,
  );
  const grouped = new Map();

  source.forEach((component) => {
    const motionGroupId =
      getCustomerPartFunction(component) === "door"
        ? getCustomerMotionGroupId(component)
        : "";

    const key = motionGroupId
      ? `motion:${motionGroupId}`
      : `single:${component.id}`;

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(component);
  });

  return [...grouped.entries()].map(([key, members]) => {
    const referenceId =
      members.map(getCustomerMotionReferencePartId).find(Boolean) ||
      members[0]?.id ||
      "";

    return {
      key,
      members,
      reference:
        members.find((item) => item.id === referenceId) || members[0] || null,
    };
  });
};

const buildCustomerDrawerPreviewSets = (items = []) => {
  const source = (Array.isArray(items) ? items : []).filter(
    isCustomerDrawerPreviewComponent,
  );
  const grouped = new Map();

  source.forEach((component) => {
    const key = resolveCustomerDrawerPreviewKey(component);
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(component);
  });

  return [...grouped.entries()]
    .map(([key, allMembers]) => {
      const movableMembers = allMembers.filter(
        (item) => !isCustomerDrawerPreviewFixedHardware(item),
      );

      const referenceId =
        movableMembers.map(getCustomerMotionReferencePartId).find(Boolean) ||
        "";

      const reference =
        movableMembers.find((item) => item.id === referenceId) ||
        movableMembers.find(isCustomerDrawerPreviewFrontComponent) ||
        movableMembers[0] ||
        null;

      return {
        key,
        allMembers,
        movableMembers,
        reference,
      };
    })
    .filter((set) => set.movableMembers.length > 0 && set.reference);
};

const isCustomerEditHardwareComponent = (component = {}) => {
  const text = [
    component?.type,
    component?.label,
    component?.name,
    component?.partRole,
    component?.part_role,
    component?.partCode,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();

  return /(^|[\s_-])(handle|knob|hardware|pull|slide|runner)([\s_-]|$)/.test(
    text,
  );
};


const isCustomerDoorPanelComponent = (component = {}) => {
  if (!component?.id || isCustomerEditHardwareComponent(component)) return false;
  const text = [
    component?.type, component?.partRole, component?.part_role,
    component?.label, component?.name, component?.partCode,
  ].filter(Boolean).join(" ").toLowerCase();
  // Frames, hinges, and rails are not independent door panels.
  if (/(^|[\s_-])(frame|hinge|jamb|trim|rail)([\s_-]|$)/.test(text)) {
    return false;
  }
  return isCustomerDoorPreviewComponent(component) ||
    /(^|[\s_-])door([\s_-]|$)/.test(text);
};

// A selected door gets its own finish. Clicking the DOORS heading selects
// the entire door group, so its finish choices still work on both doors.
const getCustomerFinishGroupTargetIds = (
  group = {},
  selectedIds = [],
  allParts = [],
) => {
  const groupIds = Array.isArray(group?.ids) ? group.ids : [];
  if (group?.label !== "Doors" || selectedIds.length !== 1) {
    return groupIds;
  }
  const selectedId = selectedIds[0];
  if (!groupIds.includes(selectedId)) return groupIds;
  const selectedDoor = allParts.find((part) => part?.id === selectedId);
  return selectedDoor && isCustomerDoorPanelComponent(selectedDoor)
    ? [selectedId]
    : groupIds;
};


const isCustomerCabinetStructuralPart = (part = {}) => {
  // Only protect known wardrobe frame parts. Table legs and other furniture
  // groups must keep their existing edit behavior.
  const type = String(part?.type || "").trim().toLowerCase();
  const code = String(
    part?.partCode || part?.part_code || part?.technicalId || "",
  ).trim().toUpperCase();
  const wardrobeTypes = new Set([
    "wr_side_panel",
    "wr_back_panel",
    "wr_top_panel",
    "wr_bottom_panel",
    "wr_divider",
  ]);
  if (wardrobeTypes.has(type)) return true;
  return /^(?:WRC-(?:SIDE-[LR]|BACK|DIV-\d+)|WR-(?:SL|SR|BK|TOP|BOT))$/.test(code);
};

// Do not scale a wardrobe until a size change can keep every part safe.
const needsSafeWardrobeResize = (items = []) =>
  Array.isArray(items) &&
  items.some((part) => {
    if (!part) return false;
    if (isCustomerCabinetStructuralPart(part)) return true;
    const label = [
      part?.templateType,
      part?.template_type,
      part?.assemblyName,
      part?.groupLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return /(^|[\s_-])(wardrobe|closet)([\s_-]|$)/.test(label);
  });

const getCustomerDrawerEditLabel = (reference = {}) => {
  const rawLabel = String(reference?.label || reference?.name || "").trim();

  const cleaned = rawLabel
    .replace(
      /\s+(front|left\s+side|right\s+side|side|back|bottom|handle)$/i,
      "",
    )
    .trim();

  return cleaned || "Drawer";
};

const buildCustomerEditGroups = (items = []) => {
  const source = Array.isArray(items) ? items.filter(Boolean) : [];
  const drawerGroupByMemberId = new Map();

  buildCustomerDrawerPreviewSets(source).forEach((set) => {
    const drawerMembers = (set?.movableMembers || []).filter(
      (item) => !isCustomerEditHardwareComponent(item),
    );

    if (drawerMembers.length < 2) return;

    const group = {
      key: `drawer:${set.key}`,
      drawerKey: set.key,
      label: getCustomerDrawerEditLabel(set.reference),
      ids: drawerMembers.map((item) => item.id),
      allIds: (set?.allMembers || []).map((item) => item.id),
      referenceId: set?.reference?.id || "",
      kind: "drawer",
    };

    drawerMembers.forEach((item) => {
      drawerGroupByMemberId.set(item.id, group);
    });
  });

  const emittedDrawerGroups = new Set();
  const groups = [];

  source.forEach((component) => {
    if (!component?.id) return;

    const drawerGroup = drawerGroupByMemberId.get(component.id);

    if (drawerGroup) {
      if (!emittedDrawerGroups.has(drawerGroup.key)) {
        emittedDrawerGroups.add(drawerGroup.key);
        groups.push(drawerGroup);
      }
      return;
    }

    groups.push({
      key: `part:${component.id}`,
      label:
        String(component?.label || component?.name || "").trim() ||
        getCustomerPartGroupLabel(component),
      ids: [component.id],
      kind: "part",
    });
  });

  return groups;
};

const CUSTOMER_DRAWER_MIN_CLEAR_SPAN_MM = 20;
const CUSTOMER_DRAWER_GEOMETRY_EPSILON_MM = 2;

const getCustomerPartBounds = (component = {}) => {
  const x = Number(component?.x || 0);
  const y = Number(component?.y || 0);
  const z = Number(component?.z || 0);
  const width = Number(component?.width || 0);
  const height = Number(component?.height || 0);
  const depth = Number(component?.depth || 0);

  return {
    minX: x,
    maxX: x + width,
    minY: y,
    maxY: y + height,
    minZ: z,
    maxZ: z + depth,
  };
};

const getCustomerAssemblyBounds = (items = []) => {
  const extents = getComponentExtents(items);
  if (!extents) return null;

  return {
    ...extents,
    width: Math.max(1, extents.maxX - extents.minX),
    height: Math.max(1, extents.maxY - extents.minY),
    depth: Math.max(1, extents.maxZ - extents.minZ),
  };
};

const getCustomerBayKey = (component = {}) => {
  const code = String(component?.partCode || component?.technicalId || "")
    .trim()
    .toUpperCase();
  const codeMatch = code.match(/(?:^|-)(B\d+)(?:-|$)/i);
  if (codeMatch?.[1]) return codeMatch[1].toUpperCase();

  const label = String(component?.label || component?.name || "");
  const labelMatch = label.match(/\bbay\s*(\d+)\b/i);
  return labelMatch?.[1] ? `B${labelMatch[1]}` : "";
};

const isCustomerShelfStructure = (component = {}) => {
  // Templates may store the same semantic role in different metadata fields.
  // Never treat an explicitly identified shelf as an unrestricted raw part.
  const roles = [
    component?.partRole,
    component?.part_role,
    component?.assemblyRole,
    component?.assembly_role,
    component?.shelfType,
    component?.shelf_type,
    component?.type,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  return roles.some(
    (role) =>
      role === "shelf" ||
      role === "adjustable" ||
      role === "fixed_shelf" ||
      role.startsWith("shelf_") ||
      role.endsWith("_shelf") ||
      role === "wr_shelf" ||
      role === "wr_top_shelf",
  );
};

// These two independent upper shelves in the supported wardrobe template
// are configurable only after cabinet-wall and collision checks pass.
// Top/base shelves, drawer supports and unnamed shelves stay protected.
const CUSTOMER_WARDROBE_ADJUSTABLE_SHELF_CODES = new Set([
  "WRC-B2-S1",
  "WRC-B2-S2",
]);

// Shelf editing is opt-in. Generic "shelf" roles do not prove adjustability:
// wardrobe drawer tops and load-bearing dividers often share that role.
const getCustomerShelfClassification = (component = {}) => {
  if (!isCustomerShelfStructure(component)) return "not-shelf";
  const attributes = [
    component?.shelfClassification,
    component?.shelf_classification,
    component?.shelfType,
    component?.shelf_type,
    component?.assemblyRole,
    component?.assembly_role,
    component?.partRole,
    component?.part_role,
  ].map((value) => String(value ?? "").trim().toLowerCase());
  const partCode = String(component?.partCode || component?.part_code || component?.technicalId || "").trim().toUpperCase();
  // Saved customer blueprints can normalize type/role differently.
  // Exact allowlisted part codes are enough after the shelf-type guard above.
  const templateAdjustable =
    CUSTOMER_WARDROBE_ADJUSTABLE_SHELF_CODES.has(partCode);
  const explicitAdjustable =
    component?.isAdjustableShelf === true ||
    component?.is_adjustable_shelf === true ||
    templateAdjustable ||
    attributes.some((value) => ["adjustable_shelf", "shelf_adjustable", "adjustable"].includes(value));
  const roleText = attributes.join(" ");
  const explicitlyFixed =
    component?.locked === true ||
    component?.isAdjustableShelf === false ||
    component?.is_adjustable_shelf === false ||
    /(?:^|-)(?:DTOP|BTM|BOTTOM|BASE|TOP)(?:-|$)/.test(partCode) ||
    /(?:^|[_\s-])(fixed|structural|support|drawer[_\s-]?top)(?:[_\s-]|$)/.test(roleText) ||
    attributes.some((value) =>
      ["fixed_shelf", "shelf_fixed", "structural_shelf", "drawer_support_shelf", "drawer_top_shelf"].includes(value),
    );
  // Explicitly structural/locked parts take precedence over adjustable tags.
  if (explicitlyFixed) return "fixed";
  return explicitAdjustable ? "adjustable" : "unverified";
};

const isCustomerDrawerRole = (component = {}, roleName = "") => {
  // Saved wardrobe blueprints identify these parts by assemblyRole/type.
  // partRole alone is not reliable for imported template components.
  const roles = [
    component?.assemblyRole,
    component?.assembly_role,
    component?.partRole,
    component?.part_role,
    component?.type,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  if (roleName) {
    return roles.some(
      (role) => role === `drawer_${roleName}` || role === `wr_drawer_${roleName}`,
    );
  }

  return roles.some(
    (role) => role.startsWith("drawer_") || role.startsWith("wr_drawer_"),
  );
};


const SHELF_TOLERANCE_MM = 3;
// The wardrobe template contains a nominal 800-mm shelf in a 799-mm bay.
const SHELF_FIT_EPSILON_MM = 1;
const shelfHasRotation = (p = {}) =>
  ["rotationX", "rotationY", "rotationZ"].some((key) => Math.abs(Number(p[key] || 0)) > 0.0001);

// This is intentionally conservative: only explicitly adjustable shelves
// with two visible, unrotated vertical side supports can be modified.
const getVerifiedShelfLimits = (parts = [], shelf = null) => {
  if (!shelf?.id || shelf.locked ||
      getCustomerShelfClassification(shelf) !== "adjustable" ||
      shelfHasRotation(shelf) ||
      ![shelf.x,shelf.y,shelf.z,shelf.width,shelf.height,shelf.depth]
        .every((n) => Number.isFinite(Number(n))) ||
      shelf.height > 60 || shelf.height < 1) return null;
  const box = getCustomerPartBounds(shelf);
  const bay = getCustomerBayKey(shelf);
  const walls = parts.filter((p) => {
    if (!p?.id || p.id === shelf.id || shelfHasRotation(p) ||
        isCustomerDrawerRole(p) ||
        /door|drawer|handle|hinge|rail|slide/i.test(String(p.label || p.name || ""))) return false;
    const wallLabel = [
      p.label, p.name, p.type, p.partRole, p.part_role,
      p.assemblyRole, p.assembly_role, p.groupType,
    ].filter(Boolean).join(" ").toLowerCase();
    // Never mistake a tall decoration or unrelated object for a cabinet wall.
    if (!/(side|panel|divider|partition|wall|carcass)/.test(wallLabel)) return false;
    const b = getCustomerPartBounds(p);
    const depthOverlap = Math.min(b.maxZ,box.maxZ)-Math.max(b.minZ,box.minZ);
    return p.height >= Math.max(100, shelf.height * 3) &&
      b.minY <= box.minY + SHELF_TOLERANCE_MM &&
      b.maxY >= box.maxY - SHELF_TOLERANCE_MM &&
      depthOverlap >= Math.max(20, Math.min(100,shelf.depth/2)) &&
      (!bay || !getCustomerBayKey(p) || getCustomerBayKey(p) === bay);
  });
  const left = walls.filter((p)=> Math.abs(getCustomerPartBounds(p).maxX-box.minX) <= SHELF_TOLERANCE_MM)
    .sort((a,b)=> b.height-a.height)[0];
  const right = walls.filter((p)=> getCustomerPartBounds(p).minX >= box.maxX-SHELF_TOLERANCE_MM)
    .sort((a,b)=>getCustomerPartBounds(a).minX-getCustomerPartBounds(b).minX)[0];
  if (!left || !right || left.id === right.id) return null;
  const lb=getCustomerPartBounds(left), rb=getCustomerPartBounds(right);
  const minY = Math.ceil(Math.max(lb.minY,rb.minY) + SHELF_TOLERANCE_MM);
  const maxY = Math.floor(Math.min(lb.maxY,rb.maxY)-shelf.height-SHELF_TOLERANCE_MM);
  const maxWidth=Math.floor(rb.minX-shelf.x+SHELF_FIT_EPSILON_MM);
  // A shelf must still touch both side supports after customization.
  // Without additional brackets, arbitrary width reduction is unsafe.
  const minSupportedWidth=Math.max(20,maxWidth-SHELF_TOLERANCE_MM);
  const maxDepth=Math.floor(Math.min(lb.maxZ,rb.maxZ)-shelf.z);
  if (minY>maxY || maxWidth<20 || maxDepth<100 ||
      shelf.y<minY-SHELF_TOLERANCE_MM || shelf.y>maxY+SHELF_TOLERANCE_MM ||
      shelf.width<minSupportedWidth-SHELF_TOLERANCE_MM ||
      shelf.width>maxWidth+SHELF_TOLERANCE_MM ||
      shelf.depth>maxDepth+SHELF_TOLERANCE_MM) return null;
  return {min:{width:minSupportedWidth,depth:100,y:minY},max:{width:maxWidth,depth:maxDepth,y:maxY}};
};

const validateShelfCandidate = (parts = [], shelf = null, proposed = null) => {
  const limits=getVerifiedShelfLimits(parts,shelf);
  if (!limits || !proposed) return "Shelf supports could not be verified.";
  const validNumbers=["x","y","z","width","height","depth"]
    .every((key)=>Number.isFinite(Number(proposed[key])));
  if (!validNumbers || shelfHasRotation(proposed) ||
      proposed.x!==shelf.x || proposed.z!==shelf.z ||
      proposed.height!==shelf.height) return "Shelf thickness and anchors are locked.";
  if (proposed.width<limits.min.width || proposed.width>limits.max.width ||
      proposed.depth<limits.min.depth || proposed.depth>limits.max.depth ||
      proposed.y<limits.min.y || proposed.y>limits.max.y)
    return "Shelf exceeds its cabinet limits.";
  const box=getCustomerPartBounds(proposed);
  if (parts.some((p)=>{
    if (!p || p.id===shelf.id) return false;
    if (shelfHasRotation(p)) return true; // Unverifiable collision: reject.
    const b=getCustomerPartBounds(p);
    return Math.min(box.maxX,b.maxX)-Math.max(box.minX,b.minX)>1 &&
      Math.min(box.maxY,b.maxY)-Math.max(box.minY,b.minY)>1 &&
      Math.min(box.maxZ,b.maxZ)-Math.max(box.minZ,b.minZ)>1;
  })) return "Shelf collides with another furniture part.";
  return "";
};

const resolveCustomerDrawerMetrics = (allComponents = [], editGroup = null) => {
  if (!editGroup || editGroup.kind !== "drawer") return null;

  const selectedIds = new Set(editGroup.ids || []);
  const selected = allComponents.filter((item) => selectedIds.has(item.id));
  const bounds = getCustomerAssemblyBounds(selected);

  if (!bounds || selected.length < 2) return null;

  const front =
    allComponents.find((item) => item.id === editGroup.referenceId) ||
    selected.find(isCustomerDrawerPreviewFrontComponent) ||
    selected[0] ||
    null;

  if (!front) return null;

  const bayKey = getCustomerBayKey(front);
  const centerX = (bounds.minX + bounds.maxX) / 2;

  const bayShelves = allComponents
    .filter((item) => {
      if (!item?.id || selectedIds.has(item.id)) return false;
      if (!isCustomerShelfStructure(item)) return false;
      if (bayKey && getCustomerBayKey(item) !== bayKey) return false;

      const itemBounds = getCustomerPartBounds(item);
      return (
        itemBounds.minX - CUSTOMER_DRAWER_GEOMETRY_EPSILON_MM <= centerX &&
        itemBounds.maxX + CUSTOMER_DRAWER_GEOMETRY_EPSILON_MM >= centerX
      );
    })
    .map((item) => ({ item, bounds: getCustomerPartBounds(item) }));

  const shelfAbove = bayShelves
    .filter(
      ({ bounds: itemBounds }) =>
        itemBounds.maxY <=
        bounds.minY + CUSTOMER_DRAWER_GEOMETRY_EPSILON_MM,
    )
    .sort((a, b) => b.bounds.maxY - a.bounds.maxY)[0];

  if (!shelfAbove?.bounds) {
    // If we cannot identify the opening safely, keep the drawer locked.
    return null;
  }

  const shelfBelow = bayShelves
    .filter(
      ({ bounds: itemBounds }) =>
        itemBounds.minY >=
        bounds.maxY - CUSTOMER_DRAWER_GEOMETRY_EPSILON_MM,
    )
    .sort((a, b) => a.bounds.minY - b.bounds.minY)[0];

  const siblingDrawers = buildCustomerDrawerPreviewSets(allComponents)
    .filter((set) => set.key !== editGroup.drawerKey)
    .map((set) => {
      const members = (set.movableMembers || []).filter(
        (item) => !isCustomerEditHardwareComponent(item),
      );

      return {
        bayKey: getCustomerBayKey(set.reference),
        bounds: getCustomerAssemblyBounds(members),
      };
    })
    .filter(
      (entry) =>
        entry.bounds &&
        (!bayKey || entry.bayKey === bayKey),
    );

  const nextDrawer = siblingDrawers
    .filter(
      ({ bounds: siblingBounds }) =>
        siblingBounds.minY >=
        bounds.maxY - CUSTOMER_DRAWER_GEOMETRY_EPSILON_MM,
    )
    .sort((a, b) => a.bounds.minY - b.bounds.minY)[0];

  const lowerStops = [
    shelfBelow?.bounds?.minY,
    nextDrawer?.bounds?.minY,
  ].filter(Number.isFinite);

  const frontBounds = getCustomerPartBounds(front);

  // The shelf immediately above the drawer defines the horizontal/depth
  // opening. This keeps the small Bay 3 drawer inside its smaller compartment.
  const openingMinX = shelfAbove.bounds.minX;
  const openingMaxX = shelfAbove.bounds.maxX;
  const openingMinZ = shelfAbove.bounds.minZ;
  const openingMaxY = lowerStops.length
    ? Math.min(...lowerStops)
    : bounds.maxY;

  const sides = selected
    .filter((item) => isCustomerDrawerRole(item, "side"))
    .sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
  const leftSide = sides[0] || null;
  const rightSide = sides[sides.length - 1] || null;
  const back = selected.find((item) => isCustomerDrawerRole(item, "back"));
  const bottom = selected.find((item) => isCustomerDrawerRole(item, "bottom"));

  const leftInset = leftSide
    ? Math.max(0, Number(leftSide.x || 0) - bounds.minX)
    : 0;
  const rightInset = rightSide
    ? Math.max(
        0,
        bounds.maxX -
          (Number(rightSide.x || 0) + Number(rightSide.width || 0)),
      )
    : 0;

  const minWidth = Math.ceil(
    leftInset +
      Number(leftSide?.width || 0) +
      Number(rightSide?.width || 0) +
      rightInset +
      CUSTOMER_DRAWER_MIN_CLEAR_SPAN_MM,
  );

  const frontTop = Number(front.y || bounds.minY);
  const frontBottom = frontTop + Number(front.height || bounds.height);
  let minHeight = CUSTOMER_DRAWER_MIN_CLEAR_SPAN_MM;

  [leftSide, rightSide, back].filter(Boolean).forEach((item) => {
    const topInset = Math.max(0, Number(item.y || 0) - frontTop);
    const bottomGap = Math.max(
      0,
      frontBottom -
        (Number(item.y || 0) + Number(item.height || 0)),
    );

    minHeight = Math.max(
      minHeight,
      Math.ceil(topInset + bottomGap + CUSTOMER_DRAWER_MIN_CLEAR_SPAN_MM),
    );
  });

  if (bottom) {
    const bottomGap = Math.max(
      0,
      frontBottom -
        (Number(bottom.y || 0) + Number(bottom.height || 0)),
    );

    minHeight = Math.max(
      minHeight,
      Math.ceil(
        bottomGap +
          Number(bottom.height || 0) +
          CUSTOMER_DRAWER_MIN_CLEAR_SPAN_MM,
      ),
    );
  }

  const depthBody = leftSide || rightSide || bottom || null;
  const frontGap = depthBody
    ? Math.max(
        0,
        Number(front.z || 0) -
          (Number(depthBody.z || 0) + Number(depthBody.depth || 0)),
      )
    : 0;

  const minDepth = Math.ceil(
    Number(front.depth || 0) +
      Number(back?.depth || 0) +
      frontGap +
      CUSTOMER_DRAWER_MIN_CLEAR_SPAN_MM,
  );

  const maxWidth = Math.floor(openingMaxX - openingMinX);
  const maxHeight = Math.floor(openingMaxY - frontTop);
  const maxDepth = Math.floor(frontBounds.maxZ - openingMinZ);

  if (
    maxWidth < Math.ceil(bounds.width) ||
    maxHeight < Math.ceil(bounds.height) ||
    maxDepth < Math.ceil(bounds.depth)
  ) {
    return null;
  }

  return {
    bounds,
    front,
    leftSide,
    rightSide,
    back,
    bottom,
    min: {
      width: Math.max(1, minWidth),
      height: Math.max(1, minHeight),
      depth: Math.max(1, minDepth),
    },
    max: {
      width: maxWidth,
      height: maxHeight,
      depth: maxDepth,
    },
  };
};

const resizeCustomerDrawerAssembly = (
  allComponents = [],
  editGroup = null,
  metrics = null,
  axis = "",
  nextValueMm = 0,
) => {
  if (!editGroup || !metrics) return allComponents;

  const followerIds = new Set(editGroup.allIds || editGroup.ids || []);
  const {
    bounds,
    front,
    leftSide,
    rightSide,
    back,
    bottom,
  } = metrics;

  if (axis === "width") {
    const oldWidth = Math.max(1, bounds.width);
    const oldCenterX = (bounds.minX + bounds.maxX) / 2;
    const nextMinX = oldCenterX - nextValueMm / 2;
    const nextMaxX = oldCenterX + nextValueMm / 2;

    const leftInset = leftSide
      ? Number(leftSide.x || 0) - bounds.minX
      : 0;
    const rightInset = rightSide
      ? bounds.maxX -
        (Number(rightSide.x || 0) + Number(rightSide.width || 0))
      : 0;

    const nextLeftX = leftSide ? nextMinX + leftInset : null;
    const nextRightX = rightSide
      ? nextMaxX - rightInset - Number(rightSide.width || 0)
      : null;

    const innerMinX =
      leftSide && Number.isFinite(nextLeftX)
        ? nextLeftX + Number(leftSide.width || 0)
        : nextMinX;
    const innerMaxX =
      rightSide && Number.isFinite(nextRightX)
        ? nextRightX
        : nextMaxX;

    return allComponents.map((item) => {
      if (!followerIds.has(item.id)) return item;
      if (isCustomerDrawerPreviewFixedHardware(item)) return item;

      if (item.id === front.id) {
        return { ...item, x: nextMinX, width: nextValueMm };
      }

      if (leftSide && item.id === leftSide.id) {
        return { ...item, x: nextLeftX };
      }

      if (rightSide && item.id === rightSide.id) {
        return { ...item, x: nextRightX };
      }

      if (
        (back && item.id === back.id) ||
        (bottom && item.id === bottom.id)
      ) {
        return {
          ...item,
          x: innerMinX,
          width: Math.max(1, innerMaxX - innerMinX),
        };
      }

      const itemCenterX =
        Number(item.x || 0) + Number(item.width || 0) / 2;
      const ratio = (itemCenterX - bounds.minX) / oldWidth;
      const nextCenterX = nextMinX + ratio * nextValueMm;

      return {
        ...item,
        x: nextCenterX - Number(item.width || 0) / 2,
      };
    });
  }

  if (axis === "height") {
    const frontTop = Number(front.y || bounds.minY);
    const oldFrontHeight = Math.max(1, Number(front.height || bounds.height));
    const oldFrontBottom = frontTop + oldFrontHeight;

    return allComponents.map((item) => {
      if (!followerIds.has(item.id)) return item;
      if (isCustomerDrawerPreviewFixedHardware(item)) return item;

      if (item.id === front.id) {
        return { ...item, y: frontTop, height: nextValueMm };
      }

      if (
        (leftSide && item.id === leftSide.id) ||
        (rightSide && item.id === rightSide.id) ||
        (back && item.id === back.id)
      ) {
        const topInset = Math.max(0, Number(item.y || 0) - frontTop);
        const bottomGap = Math.max(
          0,
          oldFrontBottom -
            (Number(item.y || 0) + Number(item.height || 0)),
        );

        return {
          ...item,
          y: frontTop + topInset,
          height: Math.max(1, nextValueMm - topInset - bottomGap),
        };
      }

      if (bottom && item.id === bottom.id) {
        const bottomGap = Math.max(
          0,
          oldFrontBottom -
            (Number(bottom.y || 0) + Number(bottom.height || 0)),
        );

        return {
          ...item,
          y:
            frontTop +
            nextValueMm -
            bottomGap -
            Number(bottom.height || 0),
        };
      }

      const itemCenterY =
        Number(item.y || 0) + Number(item.height || 0) / 2;
      const ratio = (itemCenterY - frontTop) / oldFrontHeight;
      const nextCenterY = frontTop + ratio * nextValueMm;

      return {
        ...item,
        y: nextCenterY - Number(item.height || 0) / 2,
      };
    });
  }

  if (axis === "depth") {
    const frontBounds = getCustomerPartBounds(front);
    const nextBackZ = frontBounds.maxZ - nextValueMm;
    const backDepth = Number(back?.depth || 0);
    const bodyStartZ = nextBackZ + backDepth;

    return allComponents.map((item) => {
      if (!followerIds.has(item.id)) return item;
      if (isCustomerDrawerPreviewFixedHardware(item)) return item;

      if (item.id === front.id) return item;

      if (back && item.id === back.id) {
        return { ...item, z: nextBackZ };
      }

      if (
        (leftSide && item.id === leftSide.id) ||
        (rightSide && item.id === rightSide.id) ||
        (bottom && item.id === bottom.id)
      ) {
        const frontGap = Math.max(
          0,
          Number(front.z || 0) -
            (Number(item.z || 0) + Number(item.depth || 0)),
        );

        return {
          ...item,
          z: bodyStartZ,
          depth: Math.max(
            1,
            Number(front.z || 0) - frontGap - bodyStartZ,
          ),
        };
      }

      return item;
    });
  }

  return allComponents;
};

const MAX_CUSTOM_QUANTITY = 100;

export default function Customer3DViewer({
  initialComponents = [],
  initialDimensions = null,
  customizationRules = {},
  isCustomizable = true,
  readOnly = false,
  onViewCustomize,
  applyLabel = "Add to Custom Cart",
  commentsLabel = "Additional Comments",
  commentsPlaceholder = "Optional notes for this custom draft...",
  initialQuantity = 1,
  initialComments = "",
  referencePhotos = [],
  uploadError = "",
  onPickReferencePhotos,
  onRemoveReferencePhoto,
  onApply,
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const orbitRef = useRef(null);
  const rootGroupRef = useRef(null);
  const personGroupRef = useRef(null);
  const boundsBoxRef = useRef(new THREE.Box3());
  const selectionHelpersRef = useRef([]);
  const renderedObjectMapRef = useRef(new Map());
  const doorMotionPreviewRef = useRef([]);
  const drawerMotionPreviewRef = useRef([]);
  const doorMotionAnimationRef = useRef(0);
  const drawerMotionAnimationRef = useRef(0);
  // WISDOM CUSTOMER INDIVIDUAL DOOR / DRAWER CLICK PREVIEW V1.1.0
  // WISDOM CUSTOMER MULTI-OPEN MOTION PREVIEW V1.2.0
  // Individual movable units now keep independent open/closed preview state.

  const canvasSizeRef = useRef({ width: 1, height: 1 });
  const labelWRef = useRef(null);
  const labelHRef = useRef(null);
  const labelDRef = useRef(null);

  // WISDOM CUSTOMER DIMENSION LABEL STABILITY V1
  // Keep a tiny amount of screen-space history for each floating dimension
  // label. OrbitControls damping can otherwise produce microscopic sub-pixel
  // changes every frame that make text look like it is vibrating.
  const dimensionLabelScreenRef = useRef({
    width: { x: null, y: null },
    height: { x: null, y: null },
    depth: { x: null, y: null },
  });
  const historyRef = useRef({ past: [], future: [] });
  const customizeFeedbackTimerRef = useRef(null);
  const finishMenuRef = useRef(null);
  const referenceDropDepthRef = useRef(0);
  const initialViewFramedRef = useRef(false);
  const viewerRootRef = useRef(null);
  const dimensionLinesRef = useRef(null);

  const [components, setComponents] = useState(() =>
    normalizeViewerComponents(initialComponents),
  );
  const [selectedCompIds, setSelectedCompIds] = useState([]);
  const [doorsPreviewOpen, setDoorsPreviewOpen] = useState(false);
  const [drawersPreviewOpen, setDrawersPreviewOpen] = useState(false);

  const hasCustomerPreviewDoors = useMemo(
    () => buildCustomerDoorPreviewSets(components).length > 0,
    [components],
  );
  const hasCustomerPreviewDrawers = useMemo(
    () => buildCustomerDrawerPreviewSets(components).length > 0,
    [components],
  );

  const [unit, setUnit] = useState("mm");
  const [showPerson, setShowPerson] = useState(true);
  const [personHeightMm, setPersonHeightMm] = useState(1700);
  const [selectionMode, setSelectionMode] = useState(false);
  const [activeView, setActiveView] = useState("3D");
  const [finishMenuOpen, setFinishMenuOpen] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [partListVisible, setPartListVisible] = useState(false);
  const [expandedPartLabel, setExpandedPartLabel] = useState("");
  const [expandedFinishGroupLabel, setExpandedFinishGroupLabel] = useState("");
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [requestDetailsOpen, setRequestDetailsOpen] = useState(false);
  const [isReferenceDropActive, setIsReferenceDropActive] = useState(false);
  const [isViewerFullscreen, setIsViewerFullscreen] = useState(false);

  const [customizeProgressStep, setCustomizeProgressStep] = useState(
    readOnly ? 1 : 2,
  );
  const [customizeGuideStep, setCustomizeGuideStep] = useState(() =>
    readOnly ? 0 : 1,
  );
  const [customizeFeedback, setCustomizeFeedback] = useState("");
  // WISDOM MOBILE CUSTOMIZER PC R2
  const [showCustomizeGuide, setShowCustomizeGuide] = useState(() => {
    if (readOnly) return false;
    if (typeof window !== "undefined" && window.innerWidth <= 900) {
      return false;
    }
    return true;
  });

  const [quantity, setQuantity] = useState(() => {
    const parsed = Number(initialQuantity);

    return Number.isSafeInteger(parsed) && parsed >= 1
      ? Math.min(parsed, MAX_CUSTOM_QUANTITY)
      : 1;
  });
  const [comments, setComments] = useState(() => String(initialComments || ""));
  const [standardTruckLimits, setStandardTruckLimits] = useState(null);

  const [overallDrafts, setOverallDrafts] = useState({
    width: "",
    height: "",
    depth: "",
  });
  const [partDrafts, setPartDrafts] = useState({
    width: "",
    height: "",
    depth: "",
  });
  const [shelfYDraft, setShelfYDraft] = useState("");
  const [shelfYError, setShelfYError] = useState("");

  const [overallDimensionErrors, setOverallDimensionErrors] = useState({
    width: "",
    height: "",
    depth: "",
  });

  const [partDimensionErrors, setPartDimensionErrors] = useState({
    width: "",
    height: "",
    depth: "",
  });

  const [personHeightDraft, setPersonHeightDraft] = useState("1700");
  const [personHeightError, setPersonHeightError] = useState("");

  const rememberCustomizeGuide = useCallback(() => {
    // Skip only this current customize session. Opening Customize again
    // starts with the guide visible so first-time users are never stranded.
    setShowCustomizeGuide(false);
  }, []);

  const openCustomizeGuide = useCallback(() => {
    setCustomizeGuideStep(
      Math.max(
        0,
        Math.min(CUSTOMIZE_GUIDE_STEPS.length - 1, customizeProgressStep - 1),
      ),
    );
    setShowCustomizeGuide(true);
  }, [customizeProgressStep]);

  const goToNextCustomizeGuideStep = useCallback(() => {
    setCustomizeGuideStep((current) => {
      if (current >= CUSTOMIZE_GUIDE_STEPS.length - 1) {
        rememberCustomizeGuide();
        return current;
      }

      return current + 1;
    });
  }, [rememberCustomizeGuide]);

  // Keep the open tutorial aligned with real completed customization steps.
  // Manual Back/Next still lets the customer review the instructions freely.
  useEffect(() => {
    if (readOnly || !showCustomizeGuide) return;

    const progressGuideIndex = Math.max(
      0,
      Math.min(CUSTOMIZE_GUIDE_STEPS.length - 1, customizeProgressStep - 1),
    );

    setCustomizeGuideStep((current) => Math.max(current, progressGuideIndex));
  }, [customizeProgressStep, readOnly, showCustomizeGuide]);

  const showCustomizeFeedback = useCallback((message) => {
    if (customizeFeedbackTimerRef.current) {
      clearTimeout(customizeFeedbackTimerRef.current);
    }

    setCustomizeFeedback(String(message || ""));

    customizeFeedbackTimerRef.current = setTimeout(() => {
      setCustomizeFeedback("");
      customizeFeedbackTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(
    () => () => {
      if (customizeFeedbackTimerRef.current) {
        clearTimeout(customizeFeedbackTimerRef.current);
      }
    },
    [],
  );

  // Customer-facing groups are derived from the actual blueprint component
  // metadata so a table, cabinet, chair, shelf, etc. only shows relevant parts.
  const partGroups = useMemo(() => {
    const grouped = new Map();

    components.forEach((component) => {
      const label = getCustomerPartGroupLabel(component);

      if (!grouped.has(label)) {
        grouped.set(label, {
          label,
          width: component.width,
          height: component.height,
          depth: component.depth,
          material: component.material,
          ids: [],
        });
      }

      grouped.get(label).ids.push(component.id);
    });

    return [...grouped.values()].sort((a, b) => {
      const aIndex = CUSTOMER_PART_GROUP_ORDER.indexOf(a.label);
      const bIndex = CUSTOMER_PART_GROUP_ORDER.indexOf(b.label);

      const safeA = aIndex < 0 ? CUSTOMER_PART_GROUP_ORDER.length : aIndex;
      const safeB = bIndex < 0 ? CUSTOMER_PART_GROUP_ORDER.length : bIndex;

      if (safeA !== safeB) return safeA - safeB;
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
  }, [components]);

  const editGroups = useMemo(
    () => buildCustomerEditGroups(components),
    [components],
  );

  const pushHistorySnapshot = useCallback((snapshot) => {
    historyRef.current.past.push(cloneDeep(snapshot));
    if (historyRef.current.past.length > MAX_HISTORY) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
  }, []);

  const handleUndo = useCallback(() => {
    if (!historyRef.current.past.length || readOnly) return;
    const currentSnapshot = cloneDeep(components);
    const previousSnapshot = historyRef.current.past.pop();
    historyRef.current.future.unshift(currentSnapshot);
    setComponents(normalizeViewerComponents(previousSnapshot));
  }, [components, readOnly]);

  const handleRedo = useCallback(() => {
    if (!historyRef.current.future.length || readOnly) return;
    const currentSnapshot = cloneDeep(components);
    const nextSnapshot = historyRef.current.future.shift();
    historyRef.current.past.push(currentSnapshot);
    setComponents(normalizeViewerComponents(nextSnapshot));
  }, [components, readOnly]);

  const commitComponents = useCallback(
    (updater) => {
      setComponents((prev) => {
        const prevNormalized = normalizeViewerComponents(prev);
        const nextRaw =
          typeof updater === "function" ? updater(prevNormalized) : updater;
        const nextNormalized = normalizeViewerComponents(nextRaw);
        pushHistorySnapshot(prevNormalized);
        return nextNormalized;
      });
    },
    [pushHistorySnapshot],
  );

  const convertMmToUnit = useCallback((mmVal, targetUnit) => {
    if (!mmVal) return "";
    if (targetUnit === "cm") return (mmVal / 10).toFixed(1);
    if (targetUnit === "m") return (mmVal / 1000).toFixed(2);
    if (targetUnit === "inches") return (mmVal / 25.4).toFixed(1);
    if (targetUnit === "ft") return (mmVal / 304.8).toFixed(2);
    if (targetUnit === "yd") return (mmVal / 914.4).toFixed(2);
    return Math.round(mmVal).toString();
  }, []);

  const convertUnitToMm = useCallback((unitVal, currentUnit) => {
    const num = parseFloat(unitVal);
    if (isNaN(num)) return 0;
    if (currentUnit === "cm") return num * 10;
    if (currentUnit === "m") return num * 1000;
    if (currentUnit === "inches") return num * 25.4;
    if (currentUnit === "ft") return num * 304.8;
    if (currentUnit === "yd") return num * 914.4;
    return num;
  }, []);

  const formatUnitLabel = useCallback(
    (mmVal) => {
      return `${convertMmToUnit(mmVal, unit)} ${unit === "inches" ? "in" : unit}`;
    },
    [unit, convertMmToUnit],
  );

  const editable = useMemo(
    () => ({
      width: customizationRules?.editable?.width !== false,
      height: customizationRules?.editable?.height !== false,
      depth: customizationRules?.editable?.depth !== false,
      finish_color: customizationRules?.editable?.finish_color !== false,
      comments: customizationRules?.editable?.comments !== false,
      quantity: customizationRules?.editable?.quantity !== false,
    }),
    [customizationRules],
  );

  const overallBounds = useMemo(() => {
    const current = buildBoundsFromComponents(components);
    if (current.width_mm > 0 || current.height_mm > 0 || current.depth_mm > 0)
      return current;
    return normalizeDimensions(initialDimensions || {});
  }, [components, initialDimensions]);

  const overallWardrobeSizeProtected = useMemo(
    () => needsSafeWardrobeResize(components),
    [components],
  );
  const wardrobeWidthSupport = useMemo(
    () => getCustomerWardrobeWidthSupport(components),
    [components],
  );
  const canSmartResizeWardrobeWidth =
    overallWardrobeSizeProtected && wardrobeWidthSupport.ok;

  const wardrobeWidthPreview = useMemo(() => {
    if (!canSmartResizeWardrobeWidth || !String(overallDrafts.width).trim()) {
      return null;
    }
    const parsed = convertUnitToMm(overallDrafts.width, unit);
    if (!Number.isFinite(parsed) || parsed < 1) return null;
    const wanted = Math.round(parsed);
    if (wanted === Number(overallBounds.width_mm)) return null;
    return planCustomerWardrobeWidth(components, wanted);
  }, [
    canSmartResizeWardrobeWidth,
    components,
    convertUnitToMm,
    overallBounds.width_mm,
    overallDrafts.width,
    unit,
  ]);

  const wardrobeHeightDepthSupport = useMemo(
    () => getCustomerWardrobeHeightDepthSupport(components),
    [components],
  );
  const canSmartResizeWardrobeHeight =
    overallWardrobeSizeProtected &&
    wardrobeHeightDepthSupport.ok &&
    editable.height;
  const canSmartResizeWardrobeDepth =
    overallWardrobeSizeProtected &&
    wardrobeHeightDepthSupport.ok &&
    editable.depth;

  const wardrobeHeightPreview = useMemo(() => {
    if (!canSmartResizeWardrobeHeight ||
        !String(overallDrafts.height).trim()) return null;
    const candidate = convertUnitToMm(overallDrafts.height, unit);
    if (!Number.isFinite(candidate) || candidate < 1) return null;
    const wanted = Math.round(candidate);
    if (wanted === Number(overallBounds.height_mm)) return null;
    return planCustomerWardrobeHeight(components, wanted);
  }, [
    canSmartResizeWardrobeHeight, components, convertUnitToMm,
    overallBounds.height_mm, overallDrafts.height, unit,
  ]);

  const wardrobeDepthPreview = useMemo(() => {
    if (!canSmartResizeWardrobeDepth ||
        !String(overallDrafts.depth).trim()) return null;
    const candidate = convertUnitToMm(overallDrafts.depth, unit);
    if (!Number.isFinite(candidate) || candidate < 1) return null;
    const wanted = Math.round(candidate);
    if (wanted === Number(overallBounds.depth_mm)) return null;
    return planCustomerWardrobeDepth(components, wanted);
  }, [
    canSmartResizeWardrobeDepth, components, convertUnitToMm,
    overallBounds.depth_mm, overallDrafts.depth, unit,
  ]);

  const viewMetadata = useMemo(() => {
    const firstComponent = Array.isArray(components)
      ? components.find(Boolean) || {}
      : {};

    const material =
      String(
        firstComponent?.material || firstComponent?.wood_type || "",
      ).trim() || "Standard material";

    const finishId = String(
      firstComponent?.finish_id ||
        firstComponent?.woodFinish ||
        firstComponent?.finish ||
        "",
    ).trim();

    const finishMatch = Array.isArray(WOOD_FINISHES)
      ? WOOD_FINISHES.find((item) => item?.id === finishId)
      : null;

    const finish =
      finishMatch?.label ||
      finishId ||
      (firstComponent?.color_mode === "solid"
        ? "Custom color"
        : "Original finish");

    return { material, finish };
  }, [components]);

  useEffect(() => {
    let active = true;

    api
      .get("/customer/blueprints/delivery-config")
      .then((response) => {
        if (!active) return;

        setStandardTruckLimits(
          response.data?.configured
            ? response.data.standard_truck_limits_mm
            : null,
        );
      })
      .catch((error) => {
        console.error("Failed to load standard-truck delivery limits:", error);

        if (active) {
          setStandardTruckLimits(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const deliveryAssessment = useMemo(
    () => assessOversizedDelivery(overallBounds, standardTruckLimits),
    [overallBounds, standardTruckLimits],
  );

  const selectedGroup = useMemo(() => {
    if (!selectedCompIds.length) return [];
    return components.filter((c) => selectedCompIds.includes(c.id));
  }, [components, selectedCompIds]);

  const sampleSelectedPart = selectedGroup[0] || null;
  const selectedEditGroup = useMemo(
    () =>
      editGroups.find((group) =>
        group.ids.some((id) => selectedCompIds.includes(id)),
      ) || null,
    [editGroups, selectedCompIds],
  );
  const selectedDrawerMetrics = useMemo(
    () =>
      selectedEditGroup?.kind === "drawer"
        ? resolveCustomerDrawerMetrics(components, selectedEditGroup)
        : null,
    [components, selectedEditGroup],
  );
  const selectedShelfLimits = useMemo(
    () => selectedGroup.length === 1 && sampleSelectedPart &&
      isCustomerShelfStructure(sampleSelectedPart)
      ? getVerifiedShelfLimits(components, sampleSelectedPart)
      : null,
    [components, selectedGroup, sampleSelectedPart],
  );
  const selectedAssemblyBounds =
    selectedDrawerMetrics?.bounds ||
    (selectedGroup.length > 1 ? getCustomerAssemblyBounds(selectedGroup) : null);
  const canResizeSelectedPart =
    selectedEditGroup?.kind === "drawer"
      ? Boolean(selectedDrawerMetrics)
      : selectedGroup.length === 1 &&
        Boolean(sampleSelectedPart) &&
        !Boolean(sampleSelectedPart?.locked) &&
        !isCustomerEditHardwareComponent(sampleSelectedPart) &&
        !isCustomerCabinetStructuralPart(sampleSelectedPart) &&
        !selectedGroup.some((part) => isCustomerDoorPreviewComponent(part) || isCustomerDoorPanelComponent(part)) &&
        (!isCustomerShelfStructure(sampleSelectedPart) || Boolean(selectedShelfLimits));

  const selectedPartGroup = useMemo(
    () =>
      partGroups.find((group) =>
        group.ids.some((id) => selectedCompIds.includes(id)),
      ) || null,
    [partGroups, selectedCompIds],
  );

  useEffect(() => {
    if (!partListVisible || !selectedPartGroup?.label) return;
    setExpandedPartLabel(selectedPartGroup.label);
  }, [partListVisible, selectedPartGroup]);
  const activeFinishId = String(
    (sampleSelectedPart || components[0])?.finish_id ||
      (sampleSelectedPart || components[0])?.woodFinish ||
      (sampleSelectedPart || components[0])?.finish ||
      "",
  ).trim();

  const activeWoodFinish = Array.isArray(WOOD_FINISHES)
    ? WOOD_FINISHES.find((finish) => finish.id === activeFinishId) || null
    : null;

  const uniformFinishId = useMemo(() => {
    const ids = (Array.isArray(components) ? components : []).map((component) =>
      String(
        component?.finish_id ||
          component?.woodFinish ||
          component?.finish ||
          "",
      ).trim(),
    );

    if (!ids.length) return "";
    const unique = [...new Set(ids)];
    return unique.length === 1 ? unique[0] : "__mixed__";
  }, [components]);

  useEffect(() => {
    setOverallDrafts({
      width: convertMmToUnit(overallBounds.width_mm, unit),
      height: convertMmToUnit(overallBounds.height_mm, unit),
      depth: convertMmToUnit(overallBounds.depth_mm, unit),
    });

    setOverallDimensionErrors({
      width: "",
      height: "",
      depth: "",
    });

    if (sampleSelectedPart) {
      const draftSource =
        selectedEditGroup?.kind === "drawer" && selectedAssemblyBounds
          ? selectedAssemblyBounds
          : sampleSelectedPart;

      setPartDrafts({
        width: convertMmToUnit(draftSource.width, unit),
        height: convertMmToUnit(draftSource.height, unit),
        depth: convertMmToUnit(draftSource.depth, unit),
      });

      setPartDimensionErrors({
        width: "",
        height: "",
        depth: "",
      });
      setShelfYDraft(convertMmToUnit(sampleSelectedPart.y, unit));
      setShelfYError("");
    }
  }, [overallBounds, sampleSelectedPart, unit, convertMmToUnit]);

  useEffect(() => {
    setPersonHeightDraft(convertMmToUnit(personHeightMm, unit));
    setPersonHeightError("");
  }, [personHeightMm, unit, convertMmToUnit]);

  useEffect(() => {
    if (!finishMenuOpen || typeof document === "undefined") return undefined;

    const handleOutsideFinishMenu = (event) => {
      if (
        finishMenuRef.current &&
        !finishMenuRef.current.contains(event.target)
      ) {
        setFinishMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideFinishMenu);

    return () => {
      document.removeEventListener("mousedown", handleOutsideFinishMenu);
    };
  }, [finishMenuOpen]);
  // THREE.JS INIT
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    canvasSizeRef.current = { width: w, height: h };

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7f5f1");
    sceneRef.current = scene;

    /* WISDOM SHARED ROOMLE CAMERA SAFE AREA BATCH 1 FINAL STABLE V1.4.5
       Main Customize and Edit Saved Design both use an overlay Options panel.
       Give both the same permanent 400px projection safe area. This projection
       does not depend on sidebarCollapsed, so toggling Options cannot move or
       recenter the furniture. */
    const applyCustomizeSafeAreaProjection = (
      targetCamera,
      viewportWidth,
      viewportHeight,
    ) => {
      if (!targetCamera) return;

      const safeWidth = Math.max(1, Number(viewportWidth || 1));
      const safeHeight = Math.max(1, Number(viewportHeight || 1));

      targetCamera.clearViewOffset();

      const usesOverlayOptions = Boolean(
        mountRef.current?.closest(".cust-modal-customize") ||
        mountRef.current?.closest(".custom-review-edit-body"),
      );

      if (!readOnly && usesOverlayOptions && safeWidth > 900) {
        const sidebarSafeArea = Math.min(400, Math.max(0, safeWidth - 1));

        targetCamera.setViewOffset(
          safeWidth + sidebarSafeArea,
          safeHeight,
          sidebarSafeArea,
          0,
          safeWidth,
          safeHeight,
        );
        return;
      }

      targetCamera.aspect = safeWidth / safeHeight;
      targetCamera.updateProjectionMatrix();
    };

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.5, 12000);
    camera.position.set(1500, 700, 1500);
    applyCustomizeSafeAreaProjection(camera, w, h);
    cameraRef.current = camera;

    // WISDOM CUSTOMER 3D FURNITURE REALISM V1.0.3
    // Reduce flat ambient wash while preserving the existing material system.
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const hemisphereLight = new THREE.HemisphereLight(0xfffdf8, 0xd8c5aa, 0.45);
    scene.add(hemisphereLight);

    const keyLight = new THREE.DirectionalLight(0xfffbf5, 2.85);
    keyLight.position.set(1300, 2250, 1400);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -3400;
    keyLight.shadow.camera.right = 3400;
    keyLight.shadow.camera.top = 3400;
    keyLight.shadow.camera.bottom = -3400;
    keyLight.shadow.camera.near = 100;
    keyLight.shadow.camera.far = 8000;
    keyLight.shadow.bias = -0.00012;
    keyLight.shadow.normalBias = 0.7;
    keyLight.shadow.radius = 3;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffeee2, 0.64);
    fillLight.position.set(-1450, 850, 1100);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.26);
    rimLight.position.set(-1000, 1400, -1650);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.ShadowMaterial({ opacity: 0.18 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -(WORLD_H / 2) + FLOOR_OFFSET - 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const personGroup = new THREE.Group();
    scene.add(personGroup);
    personGroupRef.current = personGroup;

    const orbit = new OrbitControls(camera, renderer.domElement);

    orbit.enableDamping = true;
    orbit.dampingFactor = 0.06;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.minDistance = 500;
    orbit.maxDistance = 5000;
    orbit.target.set(0, 0, 0);

    // WISDOM ROOMLE-INSPIRED CAMERA INTERACTION
    // Left drag = orbit, wheel/middle = zoom, right drag = pan.
    orbit.enablePan = true;
    orbit.panSpeed = 0.7;
    orbit.rotateSpeed = 0.68;
    orbit.zoomSpeed = 0.82;
    orbit.screenSpacePanning = true;
    orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    orbit.touches.ONE = THREE.TOUCH.ROTATE;
    orbit.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    if ("zoomToCursor" in orbit) orbit.zoomToCursor = true;

    // Keep the 3D viewer interactive.
    // The page itself can still scroll from the options/sidebar area.
    orbit.enabled = true;

    orbitRef.current = orbit;

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);
    rootGroupRef.current = rootGroup;

    const handleResize = () => {
      if (!mountRef.current) return;
      const newW = Math.max(1, mountRef.current.clientWidth);
      const newH = Math.max(1, mountRef.current.clientHeight);
      canvasSizeRef.current = { width: newW, height: newH };
      renderer.setSize(newW, newH);
      applyCustomizeSafeAreaProjection(camera, newW, newH);
    };

    window.addEventListener("resize", handleResize);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      orbit.update();

      renderer.render(scene, camera);

      if (boundsBoxRef.current && !boundsBoxRef.current.isEmpty()) {
        const box = boundsBoxRef.current;
        const cWidth = canvasSizeRef.current.width;
        const cHeight = canvasSizeRef.current.height;
        const offset = 100;

        const pW = new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.min.y,
          box.max.z + offset,
        );
        const pH = new THREE.Vector3(
          box.max.x + offset,
          (box.min.y + box.max.y) / 2,
          box.min.z - offset,
        );
        const pD = new THREE.Vector3(
          box.max.x + offset,
          box.min.y,
          (box.min.z + box.max.z) / 2,
        );

        const updateDiv = (divRef, vec, labelKey) => {
          const element = divRef.current;
          if (!element) return;

          const projected = vec.clone().project(camera);
          const screenState = dimensionLabelScreenRef.current[labelKey];

          if (
            projected.z > 1 ||
            projected.z < -1 ||
            !Number.isFinite(projected.x) ||
            !Number.isFinite(projected.y)
          ) {
            element.style.display = "none";

            if (screenState) {
              screenState.x = null;
              screenState.y = null;
            }
            return;
          }

          const rawTargetX = (projected.x * 0.5 + 0.5) * cWidth;
          const rawTargetY = (-projected.y * 0.5 + 0.5) * cHeight;
          const isMobileMeasurementViewport =
            typeof window !== "undefined" && window.innerWidth <= 900;
          const targetX = isMobileMeasurementViewport
            ? clampNumber(rawTargetX, 44, Math.max(44, cWidth - 44))
            : rawTargetX;
          const targetY = isMobileMeasurementViewport
            ? clampNumber(rawTargetY, 22, Math.max(22, cHeight - 68))
            : rawTargetY;

          if (!screenState) return;

          if (
            !Number.isFinite(screenState.x) ||
            !Number.isFinite(screenState.y)
          ) {
            screenState.x = targetX;
            screenState.y = targetY;
          } else {
            const dx = targetX - screenState.x;
            const dy = targetY - screenState.y;
            const travel = Math.hypot(dx, dy);

            // Ignore tiny OrbitControls damping noise. For genuine camera
            // movement, smoothly follow the projected point without adding
            // a long, visible lag during faster rotations.
            if (travel > 0.22) {
              const follow = travel >= 32 ? 0.82 : travel >= 12 ? 0.64 : 0.42;

              screenState.x += dx * follow;
              screenState.y += dy * follow;
            }
          }

          // Quarter-pixel stabilization prevents text rasterization shimmer
          // while still looking continuous during normal mouse orbiting.
          const x = Math.round(screenState.x * 4) / 4;
          const y = Math.round(screenState.y * 4) / 4;

          element.style.display = "block";
          element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        };

        updateDiv(labelWRef, pW, "width");
        updateDiv(labelHRef, pH, "height");
        updateDiv(labelDRef, pD, "depth");
      }
    };
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      orbit.dispose();

      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 👉 SEPARATE EFFECT FOR SELECTION CLICKS
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current || !rootGroupRef.current)
      return;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const rootGroup = rootGroupRef.current;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let startX = 0;
    let startY = 0;

    const onPointerDown = (e) => {
      startX = e.clientX;
      startY = e.clientY;
    };
    const onPointerUp = (event) => {
      if (readOnly || !selectionMode) return;

      const dragDist = Math.hypot(
        event.clientX - startX,
        event.clientY - startY,
      );
      if (dragDist > 5) return; // User was spinning the camera

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(rootGroup.children, true);

      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData?.id && obj.parent) {
          obj = obj.parent;
        }

        if (obj?.userData?.id) {
          const clickedId = obj.userData.id;
          const target = components.find((c) => c.id === clickedId);
          if (target) {
            const editGroup = editGroups.find((group) =>
              group.ids.includes(clickedId),
            );
            setSelectedCompIds(
              editGroup?.ids?.length ? editGroup.ids : [clickedId],
            );
          }
        }
      } else {
        setSelectedCompIds([]); // Clicked empty space
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    return () => {
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
    };
  }, [
    selectionMode,
    readOnly,
    components,
    editGroups,
    doorsPreviewOpen,
    drawersPreviewOpen,
  ]);

  const fitReadOnlyCameraToFurniture = (viewMode = "3D") => {
    if (
      !readOnly ||
      !boundsBoxRef.current ||
      boundsBoxRef.current.isEmpty() ||
      !cameraRef.current ||
      !orbitRef.current
    ) {
      return false;
    }

    const box = boundsBoxRef.current;
    const camera = cameraRef.current;
    const orbit = orbitRef.current;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const safeWidth = Math.max(1, size.x);
    const safeHeight = Math.max(1, size.y);
    const safeDepth = Math.max(1, size.z);
    const maxDim = Math.max(safeWidth, safeHeight, safeDepth);

    const verticalFov = THREE.MathUtils.degToRad(camera.fov || 40);
    const canvasAspect =
      Number(canvasSizeRef.current.width || 1) /
      Math.max(1, Number(canvasSizeRef.current.height || 1));
    const safeAspect = Math.max(
      0.5,
      Number(camera.aspect || canvasAspect || 1),
    );
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);

    const fitPlaneDistance = (planeWidth, planeHeight) => {
      const distanceForHeight = planeHeight / (2 * Math.tan(verticalFov / 2));
      const distanceForWidth = planeWidth / (2 * Math.tan(horizontalFov / 2));

      return Math.max(distanceForHeight, distanceForWidth) * 1.18;
    };

    let distance = 0;

    if (viewMode === "Front" || viewMode === "Back") {
      distance = fitPlaneDistance(safeWidth, safeHeight);
    } else if (viewMode === "Side") {
      distance = fitPlaneDistance(safeDepth, safeHeight);
    } else if (viewMode === "Top" || viewMode === "Bottom") {
      distance = fitPlaneDistance(safeWidth, safeDepth);
    } else {
      const radius =
        Math.sqrt(
          safeWidth * safeWidth +
            safeHeight * safeHeight +
            safeDepth * safeDepth,
        ) / 2;

      const limitingFov = Math.max(
        THREE.MathUtils.degToRad(18),
        Math.min(verticalFov, horizontalFov),
      );

      distance = (radius / Math.sin(limitingFov / 2)) * 1.18;
    }

    distance = Math.max(700, distance);

    // Avoid the old fixed 5000 max-distance clamp that could crop large items.
    orbit.minDistance = Math.max(120, Math.min(500, distance * 0.1));
    orbit.maxDistance = Math.max(5000, distance * 2.5, maxDim * 4);

    camera.near = Math.max(0.5, Math.min(20, distance * 0.002));
    camera.far = Math.max(12000, distance + maxDim * 8);
    camera.updateProjectionMatrix();

    orbit.enableRotate = viewMode === "3D";
    orbit.maxPolarAngle = viewMode === "3D" ? Math.PI / 2 - 0.05 : Math.PI;

    switch (viewMode) {
      case "Front":
        camera.position.set(center.x, center.y, center.z + distance);
        break;
      case "Back":
        camera.position.set(center.x, center.y, center.z - distance);
        break;
      case "Side":
        camera.position.set(center.x - distance, center.y, center.z);
        break;
      case "Top":
        camera.position.set(center.x, center.y + distance, center.z + 0.1);
        break;
      case "Bottom":
        camera.position.set(center.x, center.y - distance, center.z + 0.1);
        break;
      case "3D":
      default: {
        const direction = new THREE.Vector3(1, 0.72, 1).normalize();
        camera.position.copy(
          center.clone().add(direction.multiplyScalar(distance)),
        );
        break;
      }
    }

    orbit.target.copy(center);
    orbit.update();
    setActiveView(viewMode);
    return true;
  };

  const clearCustomerDoorPreviews = useCallback(
    ({ updateState = true } = {}) => {
      if (doorMotionAnimationRef.current) {
        cancelAnimationFrame(doorMotionAnimationRef.current);
        doorMotionAnimationRef.current = 0;
      }

      (doorMotionPreviewRef.current || []).forEach((preview) => {
        if (preview?.animationFrame) {
          cancelAnimationFrame(preview.animationFrame);
          preview.animationFrame = 0;
        }

        (preview?.originals || []).forEach(({ object, visible }) => {
          if (object) object.visible = visible;
        });

        if (preview?.pivot?.parent) {
          preview.pivot.parent.remove(preview.pivot);
        }
      });

      doorMotionPreviewRef.current = [];
      if (updateState) setDoorsPreviewOpen(false);
    },
    [],
  );

  const clearCustomerDrawerPreviews = useCallback(
    ({ updateState = true } = {}) => {
      if (drawerMotionAnimationRef.current) {
        cancelAnimationFrame(drawerMotionAnimationRef.current);
        drawerMotionAnimationRef.current = 0;
      }

      (drawerMotionPreviewRef.current || []).forEach((preview) => {
        if (preview?.animationFrame) {
          cancelAnimationFrame(preview.animationFrame);
          preview.animationFrame = 0;
        }

        (preview?.originals || []).forEach(({ object, visible }) => {
          if (object) object.visible = visible;
        });

        if (preview?.group?.parent) {
          preview.group.parent.remove(preview.group);
        }
      });

      drawerMotionPreviewRef.current = [];
      if (updateState) setDrawersPreviewOpen(false);
    },
    [],
  );

  const animateCustomerDoorPreviewsTo = useCallback(
    (targetAngle, onDone = null) => {
      const previews = doorMotionPreviewRef.current || [];
      if (!previews.length) {
        onDone?.();
        return;
      }

      if (doorMotionAnimationRef.current) {
        cancelAnimationFrame(doorMotionAnimationRef.current);
      }

      previews.forEach((preview) => {
        if (preview?.animationFrame) {
          cancelAnimationFrame(preview.animationFrame);
          preview.animationFrame = 0;
        }
      });

      const starts = previews.map((preview) =>
        Number(preview?.currentAngle || 0),
      );
      const destination = Number(targetAngle || 0);
      const startedAt = performance.now();

      const step = (now) => {
        const currentPreviews = doorMotionPreviewRef.current || [];
        if (!currentPreviews.length) {
          doorMotionAnimationRef.current = 0;
          return;
        }

        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / CUSTOMER_MOTION_PREVIEW_DURATION_MS),
        );
        const eased = customerMotionEaseOutCubic(progress);

        currentPreviews.forEach((preview, index) => {
          if (!preview?.pivot) return;

          const startAngle = starts[index] ?? Number(preview.currentAngle || 0);
          preview.currentAngle =
            startAngle + (destination - startAngle) * eased;

          const localTurn = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            preview.direction * preview.currentAngle,
          );

          preview.pivot.quaternion
            .copy(preview.basePivotQuaternion)
            .multiply(localTurn);
          preview.pivot.updateMatrixWorld(true);
        });

        if (progress < 1) {
          doorMotionAnimationRef.current = requestAnimationFrame(step);
          return;
        }

        currentPreviews.forEach((preview) => {
          preview.currentAngle = destination;
        });
        doorMotionAnimationRef.current = 0;
        onDone?.();
      };

      doorMotionAnimationRef.current = requestAnimationFrame(step);
    },
    [],
  );

  const animateCustomerDrawerPreviewsTo = useCallback(
    (targetRatio, onDone = null) => {
      const previews = drawerMotionPreviewRef.current || [];
      if (!previews.length) {
        onDone?.();
        return;
      }

      if (drawerMotionAnimationRef.current) {
        cancelAnimationFrame(drawerMotionAnimationRef.current);
      }

      previews.forEach((preview) => {
        if (preview?.animationFrame) {
          cancelAnimationFrame(preview.animationFrame);
          preview.animationFrame = 0;
        }
      });

      const starts = previews.map((preview) =>
        Number(preview?.currentDistance || 0),
      );
      const startedAt = performance.now();
      const ratio = Math.max(0, Math.min(1, Number(targetRatio) || 0));

      const step = (now) => {
        const currentPreviews = drawerMotionPreviewRef.current || [];
        if (!currentPreviews.length) {
          drawerMotionAnimationRef.current = 0;
          return;
        }

        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / CUSTOMER_MOTION_PREVIEW_DURATION_MS),
        );
        const eased = customerMotionEaseOutCubic(progress);

        currentPreviews.forEach((preview, index) => {
          if (!preview?.group) return;

          const destination = preview.extensionDistance * ratio;
          const startDistance =
            starts[index] ?? Number(preview.currentDistance || 0);

          preview.currentDistance =
            startDistance + (destination - startDistance) * eased;

          preview.group.position
            .copy(preview.basePosition)
            .addScaledVector(preview.direction, preview.currentDistance);
          preview.group.updateMatrixWorld(true);
        });

        if (progress < 1) {
          drawerMotionAnimationRef.current = requestAnimationFrame(step);
          return;
        }

        currentPreviews.forEach((preview) => {
          preview.currentDistance = preview.extensionDistance * ratio;
        });
        drawerMotionAnimationRef.current = 0;
        onDone?.();
      };

      drawerMotionAnimationRef.current = requestAnimationFrame(step);
    },
    [],
  );

  const animateCustomerDoorPreviewTo = useCallback(
    (preview, targetAngle, onDone = null) => {
      if (!preview?.pivot) {
        onDone?.();
        return;
      }

      if (preview.animationFrame) {
        cancelAnimationFrame(preview.animationFrame);
        preview.animationFrame = 0;
      }

      const startAngle = Number(preview.currentAngle || 0);
      const destination = Number(targetAngle || 0);
      const startedAt = performance.now();

      const step = (now) => {
        if (!preview?.pivot?.parent) {
          preview.animationFrame = 0;
          return;
        }

        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / CUSTOMER_MOTION_PREVIEW_DURATION_MS),
        );
        const eased = customerMotionEaseOutCubic(progress);

        preview.currentAngle = startAngle + (destination - startAngle) * eased;

        const localTurn = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          preview.direction * preview.currentAngle,
        );

        preview.pivot.quaternion
          .copy(preview.basePivotQuaternion)
          .multiply(localTurn);
        preview.pivot.updateMatrixWorld(true);

        if (progress < 1) {
          preview.animationFrame = requestAnimationFrame(step);
          return;
        }

        preview.currentAngle = destination;
        preview.animationFrame = 0;
        onDone?.();
      };

      preview.animationFrame = requestAnimationFrame(step);
    },
    [],
  );

  const animateCustomerDrawerPreviewTo = useCallback(
    (preview, targetRatio, onDone = null) => {
      if (!preview?.group) {
        onDone?.();
        return;
      }

      if (preview.animationFrame) {
        cancelAnimationFrame(preview.animationFrame);
        preview.animationFrame = 0;
      }

      const startDistance = Number(preview.currentDistance || 0);
      const ratio = Math.max(0, Math.min(1, Number(targetRatio) || 0));
      const destination = preview.extensionDistance * ratio;
      const startedAt = performance.now();

      const step = (now) => {
        if (!preview?.group?.parent) {
          preview.animationFrame = 0;
          return;
        }

        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / CUSTOMER_MOTION_PREVIEW_DURATION_MS),
        );
        const eased = customerMotionEaseOutCubic(progress);

        preview.currentDistance =
          startDistance + (destination - startDistance) * eased;

        preview.group.position
          .copy(preview.basePosition)
          .addScaledVector(preview.direction, preview.currentDistance);
        preview.group.updateMatrixWorld(true);

        if (progress < 1) {
          preview.animationFrame = requestAnimationFrame(step);
          return;
        }

        preview.currentDistance = destination;
        preview.animationFrame = 0;
        onDone?.();
      };

      preview.animationFrame = requestAnimationFrame(step);
    },
    [],
  );

  const openAllCustomerDoors = useCallback(
    (
      targetKey = "",
      {
        preserveExisting = false,
        preserveSelection = false,
        instant = false,
        targetAngle = null,
      } = {},
    ) => {
      const allSets = buildCustomerDoorPreviewSets(components);
      const requestedKey =
        typeof targetKey === "string" ? targetKey.trim() : "";
      const sets = requestedKey
        ? allSets.filter((set) => set.key === requestedKey)
        : allSets;

      if (!sets.length) return;

      const keepCurrent = Boolean(requestedKey && preserveExisting);

      if (!keepCurrent) {
        clearCustomerDoorPreviews();
      }

      if (!preserveSelection) {
        setSelectedCompIds([]);
      }

      const existingKeys = new Set(
        (doorMotionPreviewRef.current || []).map((preview) => preview.key),
      );
      const setsToCreate = keepCurrent
        ? sets.filter((set) => !existingKeys.has(set.key))
        : sets;
      const created = [];

      setsToCreate.forEach((set) => {
        const memberEntries = set.members.map((member) => ({
          member,
          object: renderedObjectMapRef.current.get(member.id) || null,
        }));

        if (
          !memberEntries.length ||
          memberEntries.some(({ object }) => !object?.parent)
        ) {
          return;
        }

        const parent = memberEntries[0].object.parent;
        if (
          !parent ||
          memberEntries.some(({ object }) => object.parent !== parent)
        ) {
          return;
        }

        const referenceComponent = set.reference || set.members[0];
        const referenceOriginal =
          renderedObjectMapRef.current.get(referenceComponent?.id) ||
          memberEntries[0].object;

        if (!referenceComponent || !referenceOriginal) return;

        const explicitHingeComponent = [
          referenceComponent,
          ...set.members,
        ].find((item) => {
          const value = String(
            item?.doorHinge ??
              item?.door_hinge ??
              item?.hingeSide ??
              item?.hinge_side ??
              "",
          )
            .trim()
            .toLowerCase();

          return value.startsWith("l") || value.startsWith("r");
        });

        const hingeSide = explicitHingeComponent
          ? String(
              explicitHingeComponent?.doorHinge ??
                explicitHingeComponent?.door_hinge ??
                explicitHingeComponent?.hingeSide ??
                explicitHingeComponent?.hinge_side ??
                "",
            )
              .trim()
              .toLowerCase()
              .startsWith("r")
            ? "right"
            : "left"
          : resolveCustomerDoorHingeSide(referenceComponent, components);

        const width = Math.max(1, Number(referenceComponent?.width || 1));
        const localHingeOffset = new THREE.Vector3(
          hingeSide === "right" ? width / 2 : -width / 2,
          0,
          0,
        );

        const hingePosition = referenceOriginal.position
          .clone()
          .add(
            localHingeOffset
              .clone()
              .applyQuaternion(referenceOriginal.quaternion),
          );

        const pivot = new THREE.Group();
        pivot.name = `customer-door-preview-${set.key}`;
        pivot.position.copy(hingePosition);
        pivot.quaternion.copy(referenceOriginal.quaternion);
        parent.add(pivot);
        parent.updateMatrixWorld(true);
        pivot.updateMatrixWorld(true);

        const originals = [];

        memberEntries.forEach(({ member, object: original }) => {
          const clone = original.clone(true);
          clone.name = `customer-door-preview-clone-${member.id}`;
          clone.traverse((child) => {
            child.userData = {
              ...(child.userData || {}),
              isCustomerMotionPreviewClone: true,
            };
          });

          clone.position.copy(original.position);
          clone.quaternion.copy(original.quaternion);
          clone.scale.copy(original.scale);

          parent.add(clone);
          parent.updateMatrixWorld(true);
          pivot.updateMatrixWorld(true);
          clone.updateMatrixWorld(true);
          pivot.attach(clone);
          pivot.updateMatrixWorld(true);

          originals.push({
            object: original,
            visible: original.visible,
          });
          original.visible = false;
        });

        created.push({
          key: set.key,
          pivot,
          originals,
          basePivotQuaternion: referenceOriginal.quaternion.clone(),
          direction: hingeSide === "right" ? 1 : -1,
          currentAngle: 0,
          animationFrame: 0,
        });
      });

      if (!created.length) {
        if (!keepCurrent) {
          clearCustomerDoorPreviews();
        }
        return;
      }

      const defaultOpenAngle = THREE.MathUtils.degToRad(
        CUSTOMER_DOOR_PREVIEW_OPEN_DEGREES,
      );
      const requestedAngle = Number(targetAngle);
      const openAngle =
        Number.isFinite(requestedAngle) && requestedAngle > 0
          ? requestedAngle
          : defaultOpenAngle;

      const applyDoorPreviewAngle = (preview, angle) => {
        if (!preview?.pivot) return;

        if (preview.animationFrame) {
          cancelAnimationFrame(preview.animationFrame);
          preview.animationFrame = 0;
        }

        preview.currentAngle = angle;

        const localTurn = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          preview.direction * preview.currentAngle,
        );

        preview.pivot.quaternion
          .copy(preview.basePivotQuaternion)
          .multiply(localTurn);
        preview.pivot.updateMatrixWorld(true);
      };

      if (keepCurrent) {
        doorMotionPreviewRef.current = [
          ...doorMotionPreviewRef.current,
          ...created,
        ];
        setDoorsPreviewOpen(false);
        created.forEach((preview) => {
          if (instant) {
            applyDoorPreviewAngle(preview, openAngle);
          } else {
            animateCustomerDoorPreviewTo(preview, openAngle);
          }
        });
        return;
      }

      doorMotionPreviewRef.current = created;
      setDoorsPreviewOpen(!requestedKey);

      if (instant) {
        created.forEach((preview) => {
          applyDoorPreviewAngle(preview, openAngle);
        });
      } else {
        animateCustomerDoorPreviewsTo(openAngle);
      }
    },
    [
      components,
      clearCustomerDoorPreviews,
      animateCustomerDoorPreviewsTo,
      animateCustomerDoorPreviewTo,
    ],
  );

  const closeAllCustomerDoors = useCallback(() => {
    if (!doorMotionPreviewRef.current.length) {
      setDoorsPreviewOpen(false);
      return;
    }

    animateCustomerDoorPreviewsTo(0, () => {
      clearCustomerDoorPreviews();
    });
  }, [animateCustomerDoorPreviewsTo, clearCustomerDoorPreviews]);

  const closeCustomerDoorPreviewByKey = useCallback(
    (targetKey) => {
      const key = String(targetKey || "").trim();
      if (!key) return;

      const preview = (doorMotionPreviewRef.current || []).find(
        (item) => item?.key === key,
      );
      if (!preview) return;

      // Once one unit closes, the furniture is no longer in an "all open" state.
      setDoorsPreviewOpen(false);

      animateCustomerDoorPreviewTo(preview, 0, () => {
        (preview?.originals || []).forEach(({ object, visible }) => {
          if (object) object.visible = visible;
        });

        if (preview?.pivot?.parent) {
          preview.pivot.parent.remove(preview.pivot);
        }

        doorMotionPreviewRef.current = (
          doorMotionPreviewRef.current || []
        ).filter((item) => item !== preview);
      });
    },
    [animateCustomerDoorPreviewTo],
  );

  const openAllCustomerDrawers = useCallback(
    (
      targetKey = "",
      {
        preserveExisting = false,
        preserveSelection = false,
        instant = false,
        targetDistance = null,
      } = {},
    ) => {
      const allSets = buildCustomerDrawerPreviewSets(components);
      const requestedKey =
        typeof targetKey === "string" ? targetKey.trim() : "";
      const sets = requestedKey
        ? allSets.filter((set) => set.key === requestedKey)
        : allSets;

      if (!sets.length) return;

      const keepCurrent = Boolean(requestedKey && preserveExisting);

      if (!keepCurrent) {
        clearCustomerDrawerPreviews();
      }

      if (!preserveSelection) {
        setSelectedCompIds([]);
      }

      const existingKeys = new Set(
        (drawerMotionPreviewRef.current || []).map((preview) => preview.key),
      );
      const setsToCreate = keepCurrent
        ? sets.filter((set) => !existingKeys.has(set.key))
        : sets;
      const created = [];

      setsToCreate.forEach((set) => {
        const memberEntries = set.movableMembers.map((member) => ({
          member,
          object: renderedObjectMapRef.current.get(member.id) || null,
        }));

        if (
          !memberEntries.length ||
          memberEntries.some(({ object }) => !object?.parent)
        ) {
          return;
        }

        const parent = memberEntries[0].object.parent;
        if (
          !parent ||
          memberEntries.some(({ object }) => object.parent !== parent)
        ) {
          return;
        }

        const referenceComponent = set.reference || set.movableMembers[0];
        const referenceOriginal =
          renderedObjectMapRef.current.get(referenceComponent?.id) ||
          memberEntries[0].object;

        if (!referenceComponent || !referenceOriginal) return;

        const direction = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(referenceOriginal.quaternion)
          .normalize();

        if (direction.lengthSq() < 0.5) return;

        const depthCandidates = set.movableMembers
          .filter(
            (item) =>
              !isCustomerDrawerPreviewFrontComponent(item) &&
              !String(item?.partRole || "")
                .toLowerCase()
                .includes("handle"),
          )
          .map((item) => Number(item?.depth || 0))
          .filter((value) => Number.isFinite(value) && value > 0);

        const drawerDepth = Math.max(
          1,
          ...(depthCandidates.length
            ? depthCandidates
            : [Number(referenceComponent.depth) || 1]),
        );

        const extensionDistance = Math.min(
          CUSTOMER_DRAWER_PREVIEW_MAX_EXTENSION_MM,
          Math.max(
            CUSTOMER_DRAWER_PREVIEW_MIN_EXTENSION_MM,
            drawerDepth * CUSTOMER_DRAWER_PREVIEW_EXTENSION_RATIO,
          ),
        );

        const group = new THREE.Group();
        group.name = `customer-drawer-preview-${set.key}`;
        parent.add(group);
        parent.updateMatrixWorld(true);
        group.updateMatrixWorld(true);

        const originals = [];

        memberEntries.forEach(({ member, object: original }) => {
          const clone = original.clone(true);
          clone.name = `customer-drawer-preview-clone-${member.id}`;
          clone.traverse((child) => {
            child.userData = {
              ...(child.userData || {}),
              isCustomerMotionPreviewClone: true,
            };
          });

          clone.position.copy(original.position);
          clone.quaternion.copy(original.quaternion);
          clone.scale.copy(original.scale);

          parent.add(clone);
          parent.updateMatrixWorld(true);
          group.updateMatrixWorld(true);
          clone.updateMatrixWorld(true);
          group.attach(clone);
          group.updateMatrixWorld(true);

          originals.push({
            object: original,
            visible: original.visible,
          });
          original.visible = false;
        });

        created.push({
          key: set.key,
          group,
          originals,
          basePosition: group.position.clone(),
          direction,
          currentDistance: 0,
          extensionDistance,
          animationFrame: 0,
        });
      });

      if (!created.length) {
        if (!keepCurrent) {
          clearCustomerDrawerPreviews();
        }
        return;
      }

      const applyDrawerPreviewDistance = (preview, distance) => {
        if (!preview?.group) return;

        if (preview.animationFrame) {
          cancelAnimationFrame(preview.animationFrame);
          preview.animationFrame = 0;
        }

        const requestedDistance = Number(distance);
        const safeDistance = Number.isFinite(requestedDistance)
          ? Math.max(0, Math.min(preview.extensionDistance, requestedDistance))
          : preview.extensionDistance;

        preview.currentDistance = safeDistance;
        preview.group.position
          .copy(preview.basePosition)
          .addScaledVector(preview.direction, preview.currentDistance);
        preview.group.updateMatrixWorld(true);
      };

      if (keepCurrent) {
        drawerMotionPreviewRef.current = [
          ...drawerMotionPreviewRef.current,
          ...created,
        ];
        setDrawersPreviewOpen(false);
        created.forEach((preview) => {
          if (instant) {
            applyDrawerPreviewDistance(preview, targetDistance);
          } else {
            animateCustomerDrawerPreviewTo(preview, 1);
          }
        });
        return;
      }

      drawerMotionPreviewRef.current = created;
      setDrawersPreviewOpen(!requestedKey);

      if (instant) {
        created.forEach((preview) => {
          applyDrawerPreviewDistance(preview, targetDistance);
        });
      } else {
        animateCustomerDrawerPreviewsTo(1);
      }
    },
    [
      components,
      clearCustomerDrawerPreviews,
      animateCustomerDrawerPreviewsTo,
      animateCustomerDrawerPreviewTo,
    ],
  );

  const closeAllCustomerDrawers = useCallback(() => {
    if (!drawerMotionPreviewRef.current.length) {
      setDrawersPreviewOpen(false);
      return;
    }

    animateCustomerDrawerPreviewsTo(0, () => {
      clearCustomerDrawerPreviews();
    });
  }, [animateCustomerDrawerPreviewsTo, clearCustomerDrawerPreviews]);

  const closeCustomerDrawerPreviewByKey = useCallback(
    (targetKey) => {
      const key = String(targetKey || "").trim();
      if (!key) return;

      const preview = (drawerMotionPreviewRef.current || []).find(
        (item) => item?.key === key,
      );
      if (!preview) return;

      setDrawersPreviewOpen(false);

      animateCustomerDrawerPreviewTo(preview, 0, () => {
        (preview?.originals || []).forEach(({ object, visible }) => {
          if (object) object.visible = visible;
        });

        if (preview?.group?.parent) {
          preview.group.parent.remove(preview.group);
        }

        drawerMotionPreviewRef.current = (
          drawerMotionPreviewRef.current || []
        ).filter((item) => item !== preview);
      });
    },
    [animateCustomerDrawerPreviewTo],
  );

  const toggleCustomerDoorFromComponentId = useCallback(
    (componentId) => {
      const targetId = String(componentId || "").trim();
      if (!targetId) return false;

      const targetSet = buildCustomerDoorPreviewSets(components).find((set) =>
        set.members.some((member) => String(member?.id || "") === targetId),
      );

      if (!targetSet) return false;

      const existingPreview = (doorMotionPreviewRef.current || []).find(
        (preview) => preview?.key === targetSet.key,
      );

      if (existingPreview) {
        closeCustomerDoorPreviewByKey(targetSet.key);
      } else {
        openAllCustomerDoors(targetSet.key, { preserveExisting: true });
      }

      return true;
    },
    [components, openAllCustomerDoors, closeCustomerDoorPreviewByKey],
  );

  const toggleCustomerDrawerFromComponentId = useCallback(
    (componentId) => {
      const targetId = String(componentId || "").trim();
      if (!targetId) return false;

      const targetSet = buildCustomerDrawerPreviewSets(components).find((set) =>
        set.movableMembers.some(
          (member) => String(member?.id || "") === targetId,
        ),
      );

      if (!targetSet) return false;

      const existingPreview = (drawerMotionPreviewRef.current || []).find(
        (preview) => preview?.key === targetSet.key,
      );

      if (existingPreview) {
        closeCustomerDrawerPreviewByKey(targetSet.key);
      } else {
        openAllCustomerDrawers(targetSet.key, { preserveExisting: true });
      }

      return true;
    },
    [components, openAllCustomerDrawers, closeCustomerDrawerPreviewByKey],
  );

  const toggleCustomerMotionFromComponentId = useCallback(
    (componentId) => {
      if (toggleCustomerDoorFromComponentId(componentId)) return true;
      if (toggleCustomerDrawerFromComponentId(componentId)) return true;
      return false;
    },
    [toggleCustomerDoorFromComponentId, toggleCustomerDrawerFromComponentId],
  );

  // Normal customer preview mode: click a movable door/drawer directly.
  // Edit Design mode keeps the original part-selection behavior.
  useEffect(() => {
    if (readOnly || selectionMode) return undefined;
    if (!rendererRef.current || !cameraRef.current || !rootGroupRef.current) {
      return undefined;
    }

    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const rootGroup = rootGroupRef.current;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let startX = 0;
    let startY = 0;

    const onMotionPointerDown = (event) => {
      startX = event.clientX;
      startY = event.clientY;
    };

    const onMotionPointerUp = (event) => {
      const dragDistance = Math.hypot(
        event.clientX - startX,
        event.clientY - startY,
      );
      if (dragDistance > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(rootGroup.children, true);

      for (const hit of intersects) {
        let object = hit.object;

        while (object && !object.userData?.id && object.parent) {
          object = object.parent;
        }

        const componentId = object?.userData?.id;
        if (!componentId) continue;

        // WISDOM CUSTOMER MOTION POINTER RELEASE FIX V1.1.1
        // Never swallow pointerup here. OrbitControls must receive the release
        // event or its internal drag state can remain active after a simple click.
        // Toggle the visual preview only after native pointerup propagation ends.
        const isMovableTarget =
          buildCustomerDoorPreviewSets(components).some((set) =>
            set.members.some(
              (member) => String(member?.id || "") === String(componentId),
            ),
          ) ||
          buildCustomerDrawerPreviewSets(components).some((set) =>
            set.movableMembers.some(
              (member) => String(member?.id || "") === String(componentId),
            ),
          );

        if (isMovableTarget) {
          queueMicrotask(() => {
            toggleCustomerMotionFromComponentId(componentId);
            setSelectedCompIds([]);
          });
          return;
        }
      }
    };

    renderer.domElement.addEventListener(
      "pointerdown",
      onMotionPointerDown,
      true,
    );
    renderer.domElement.addEventListener("pointerup", onMotionPointerUp, true);

    return () => {
      renderer.domElement.removeEventListener(
        "pointerdown",
        onMotionPointerDown,
        true,
      );
      renderer.domElement.removeEventListener(
        "pointerup",
        onMotionPointerUp,
        true,
      );
    };
  }, [
    readOnly,
    selectionMode,
    components,
    toggleCustomerMotionFromComponentId,
  ]);

  // Open doors and drawers stay in their current visible pose while the
  // customer edits parts. Their real furniture data is still unchanged.
  useEffect(() => {
    if (!selectionMode) return;
  }, [selectionMode]);

  useEffect(
    () => () => {
      clearCustomerDoorPreviews({ updateState: false });
      clearCustomerDrawerPreviews({ updateState: false });
    },
    [clearCustomerDoorPreviews, clearCustomerDrawerPreviews],
  );

  // BUILD 3D OBJECTS (Runs ONLY when components change, stops disappearing bug)
  useEffect(() => {
    const rootGroup = rootGroupRef.current;
    if (!rootGroup) return;

    // Save the visible door pose before rebuilding furniture objects.
    // The saved pose is restored synchronously below so the customer never
    // sees the door close and then open again.
    const savedDoorPreviews = (doorMotionPreviewRef.current || [])
      .map((preview) => ({
        key: String(preview?.key || "").trim(),
        angle: Number(preview?.currentAngle || 0),
      }))
      .filter((preview) => preview.key);

    const savedDrawerPreviews = (drawerMotionPreviewRef.current || [])
      .map((preview) => ({
        key: String(preview?.key || "").trim(),
        distance: Number(preview?.currentDistance || 0),
      }))
      .filter((preview) => preview.key);

    const allDoorKeys = buildCustomerDoorPreviewSets(components)
      .map((set) => String(set?.key || "").trim())
      .filter(Boolean);

    const allDrawerKeys = buildCustomerDrawerPreviewSets(components)
      .map((set) => String(set?.key || "").trim())
      .filter(Boolean);

    const restoreAllDoors =
      savedDoorPreviews.length > 0 &&
      allDoorKeys.length > 0 &&
      allDoorKeys.every((key) =>
        savedDoorPreviews.some((preview) => preview.key === key),
      );

    const restoreAllDrawers =
      savedDrawerPreviews.length > 0 &&
      allDrawerKeys.length > 0 &&
      allDrawerKeys.every((key) =>
        savedDrawerPreviews.some((preview) => preview.key === key),
      );

    clearCustomerDoorPreviews({ updateState: false });
    clearCustomerDrawerPreviews({ updateState: false });
    renderedObjectMapRef.current.clear();

    while (rootGroup.children.length) {
      const child = rootGroup.children[0];
      rootGroup.remove(child);
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
    }

    const dummySelectable = [];
    const boundsBox = new THREE.Box3();
    const safeComponents = normalizeViewerComponents(components);

    safeComponents.forEach((comp) => {
      try {
        const obj = createFurnitureObject(comp, false, false, dummySelectable);
        if (!obj) return;

        obj.userData.id = comp.id;
        obj.traverse((child) => {
          if (child.isMesh) child.userData.id = comp.id;
        });

        const solidHex = getSolidColorHex(comp);
        if (
          solidHex &&
          (comp?.color_mode === "solid" ||
            (!comp?.finish && !comp?.finish_id && !comp?.woodFinish))
        ) {
          applySolidColorOverride(obj, solidHex);
        }

        const localX = comp.x + comp.width / 2 - WORLD_W / 2;
        const localY = WORLD_H / 2 - (comp.y + comp.height / 2);
        const localZ = comp.z + comp.depth / 2 - WORLD_D / 2;

        obj.position.set(localX, localY, localZ);
        obj.rotation.set(
          THREE.MathUtils.degToRad(comp.rotationX || 0),
          THREE.MathUtils.degToRad(comp.rotationY || 0),
          THREE.MathUtils.degToRad(comp.rotationZ || 0),
        );

        rootGroup.add(obj);
        renderedObjectMapRef.current.set(comp.id, obj);
        boundsBox.expandByObject(obj);
      } catch (error) {
        console.error("Customer3DViewer render failed:", comp, error);
      }
    });

    boundsBoxRef.current.copy(boundsBox);

    if (readOnly && !boundsBox.isEmpty()) {
      requestAnimationFrame(() => {
        fitReadOnlyCameraToFurniture("3D");
      });
    } else if (
      !readOnly &&
      !boundsBox.isEmpty() &&
      !initialViewFramedRef.current
    ) {
      requestAnimationFrame(() => {
        const center = new THREE.Vector3();
        boundsBox.getCenter(center);
        const size = new THREE.Vector3();
        boundsBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 1.8 + 500;

        if (cameraRef.current && orbitRef.current) {
          cameraRef.current.position.set(
            center.x + distance * 0.8,
            center.y + distance * 0.3,
            center.z + distance * 0.8,
          );
          orbitRef.current.target.copy(center);
          orbitRef.current.update();
        }
        initialViewFramedRef.current = true;
      });
    }

    if (!boundsBox.isEmpty()) {
      const offset = 100;
      const tick = 25;
      const linePoints = [];

      // 1. WIDTH LINE (Front Bottom)
      linePoints.push(
        boundsBox.min.x,
        boundsBox.min.y,
        boundsBox.max.z + offset,
        boundsBox.max.x,
        boundsBox.min.y,
        boundsBox.max.z + offset,
        // Width Ticks
        boundsBox.min.x,
        boundsBox.min.y,
        boundsBox.max.z + offset - tick,
        boundsBox.min.x,
        boundsBox.min.y,
        boundsBox.max.z + offset + tick,
        boundsBox.max.x,
        boundsBox.min.y,
        boundsBox.max.z + offset - tick,
        boundsBox.max.x,
        boundsBox.min.y,
        boundsBox.max.z + offset + tick,
      );

      // 2. HEIGHT LINE (Back Right Corner)
      const backZ = boundsBox.min.z - offset;
      linePoints.push(
        boundsBox.max.x + offset,
        boundsBox.min.y,
        backZ,
        boundsBox.max.x + offset,
        boundsBox.max.y,
        backZ,
        // Height Ticks
        boundsBox.max.x + offset - tick,
        boundsBox.min.y,
        backZ,
        boundsBox.max.x + offset + tick,
        boundsBox.min.y,
        backZ,
        boundsBox.max.x + offset - tick,
        boundsBox.max.y,
        backZ,
        boundsBox.max.x + offset + tick,
        boundsBox.max.y,
        backZ,
      );

      // 3. DEPTH LINE (Right Side Bottom)
      linePoints.push(
        boundsBox.max.x + offset,
        boundsBox.min.y,
        boundsBox.min.z,
        boundsBox.max.x + offset,
        boundsBox.min.y,
        boundsBox.max.z,
        // Depth Ticks
        boundsBox.max.x + offset - tick,
        boundsBox.min.y,
        boundsBox.min.z,
        boundsBox.max.x + offset + tick,
        boundsBox.min.y,
        boundsBox.min.z,
        boundsBox.max.x + offset - tick,
        boundsBox.min.y,
        boundsBox.max.z,
        boundsBox.max.x + offset + tick,
        boundsBox.min.y,
        boundsBox.max.z,
      );

      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(linePoints, 3),
      );
      const lineMat = new THREE.LineBasicMaterial({ color: 0x334155 });
      const dimensionLines = new THREE.LineSegments(lineGeo, lineMat);
      dimensionLines.visible = showMeasurements;
      dimensionLinesRef.current = dimensionLines;
      rootGroup.add(dimensionLines);
    }

    if (!readOnly && savedDoorPreviews.length > 0) {
      savedDoorPreviews.forEach((savedPreview, index) => {
        openAllCustomerDoors(savedPreview.key, {
          preserveExisting: index > 0,
          preserveSelection: true,
          instant: true,
          targetAngle: savedPreview.angle,
        });
      });

      if (restoreAllDoors) {
        setDoorsPreviewOpen(true);
      }
    }

    if (!readOnly && savedDrawerPreviews.length > 0) {
      savedDrawerPreviews.forEach((savedPreview, index) => {
        openAllCustomerDrawers(savedPreview.key, {
          preserveExisting: index > 0,
          preserveSelection: true,
          instant: true,
          targetDistance: savedPreview.distance,
        });
      });

      if (restoreAllDrawers) {
        setDrawersPreviewOpen(true);
      }
    }
  }, [
    components,
    clearCustomerDoorPreviews,
    clearCustomerDrawerPreviews,
    openAllCustomerDoors,
    openAllCustomerDrawers,
  ]);

  useEffect(() => {
    if (dimensionLinesRef.current) {
      dimensionLinesRef.current.visible = showMeasurements;
    }
  }, [showMeasurements, components]);

  useEffect(() => {
    if (!sceneRef.current || !rootGroupRef.current) return;

    selectionHelpersRef.current.forEach((h) => {
      sceneRef.current.remove(h);
      if (h.geometry) h.geometry.dispose();
      if (h.material) h.material.dispose();
    });
    selectionHelpersRef.current = [];

    if (!selectedCompIds.length) return;

    selectedCompIds.forEach((id) => {
      let target = null;
      rootGroupRef.current.traverse((child) => {
        if (child.userData?.id === id && child.visible !== false && !target) {
          target = child;
        }
      });

      if (target) {
        const helper = new THREE.BoxHelper(target, SELECTION_COLOR);
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.material.opacity = 0.95;
        helper.renderOrder = 999;
        sceneRef.current.add(helper);
        selectionHelpersRef.current.push(helper);
      }
    });
  }, [selectedCompIds, components]);

  // BUILD THE PERSON
  useEffect(() => {
    if (!personGroupRef.current || !rootGroupRef.current) return;
    const group = personGroupRef.current;
    group.clear();

    if (!showPerson || components.length === 0) return;

    const personHeight = clampNumber(
      personHeightMm,
      HUMAN_REFERENCE_MIN_HEIGHT_MM,
      HUMAN_REFERENCE_MAX_HEIGHT_MM,
    );
    const floorY = -(WORLD_H / 2) + FLOOR_OFFSET;

    // New proportions for a solid, unified blocky look
    const headRadius = Math.max(20, Math.round(personHeight * 0.075));
    const torsoHeight = Math.max(110, Math.round(personHeight * 0.38));
    const referenceScale = personHeight / 1700;
    const footHeight = Math.max(7, Math.round(24 * referenceScale));
    const legHeight = Math.max(
      110,
      Math.round(
        personHeight - (headRadius * 2 + torsoHeight + footHeight - 15),
      ),
    );

    const shoulderWidth = Math.max(65, Math.round(personHeight * 0.2));
    const torsoDepth = Math.max(35, Math.round(personHeight * 0.08));

    const legWidth = Math.max(22, Math.round(shoulderWidth * 0.35));
    const legDepth = Math.max(28, Math.round(torsoDepth * 0.8));
    const legGap = Math.max(8, Math.round(shoulderWidth * 0.15));

    const footDepth = legDepth + Math.max(9, Math.round(30 * referenceScale));

    // Single, uniform smooth material for the whole body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.85,
      metalness: 0.05,
    });

    const leftFoot = new THREE.Mesh(
      new THREE.BoxGeometry(legWidth, footHeight, footDepth),
      bodyMat,
    );
    leftFoot.position.set(
      -(legGap / 2 + legWidth / 2),
      floorY + footHeight / 2,
      (footDepth - legDepth) / 2,
    );

    const rightFoot = new THREE.Mesh(
      new THREE.BoxGeometry(legWidth, footHeight, footDepth),
      bodyMat,
    );
    rightFoot.position.set(
      legGap / 2 + legWidth / 2,
      floorY + footHeight / 2,
      (footDepth - legDepth) / 2,
    );

    const leftLeg = new THREE.Mesh(
      new THREE.BoxGeometry(legWidth, legHeight, legDepth),
      bodyMat,
    );
    leftLeg.position.set(
      -(legGap / 2 + legWidth / 2),
      floorY + footHeight + legHeight / 2,
      0,
    );

    const rightLeg = new THREE.Mesh(
      new THREE.BoxGeometry(legWidth, legHeight, legDepth),
      bodyMat,
    );
    rightLeg.position.set(
      legGap / 2 + legWidth / 2,
      floorY + footHeight + legHeight / 2,
      0,
    );

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(shoulderWidth, torsoHeight, torsoDepth),
      bodyMat,
    );
    torso.position.set(0, floorY + footHeight + legHeight + torsoHeight / 2, 0);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(headRadius, 32, 32),
      bodyMat,
    );
    // Sink the head slightly into the torso so it rests naturally without a neck gap
    head.position.set(
      0,
      floorY + footHeight + legHeight + torsoHeight + headRadius - 15,
      0,
    );

    [leftFoot, rightFoot, leftLeg, rightLeg, torso, head].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    const box = boundsBoxRef.current;
    if (!box.isEmpty()) {
      const furnitureWidth = Math.max(1, box.max.x - box.min.x);
      const gap = Math.max(
        220,
        Math.min(420, Math.round(furnitureWidth * 0.18)),
      );
      group.position.set(
        box.min.x - gap - shoulderWidth / 2,
        0,
        (box.min.z + box.max.z) / 2,
      );
    }
  }, [showPerson, personHeightMm, components]);

  // 👉 RULE 4: CAMERA CONTROLLER (Locks 2D Views & Unlocks the Floor)
  const changeCameraView = (viewMode) => {
    if (
      !boundsBoxRef.current ||
      boundsBoxRef.current.isEmpty() ||
      !cameraRef.current ||
      !orbitRef.current
    )
      return;

    if (readOnly && fitReadOnlyCameraToFurniture(viewMode)) {
      return;
    }

    const box = boundsBoxRef.current;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.8 + 500;

    // Lock camera rotation if it's a flat orthographic view
    orbitRef.current.enableRotate = viewMode === "3D";

    if (viewMode === "3D") {
      orbitRef.current.maxPolarAngle = Math.PI / 2 - 0.05; // Puts the floor back
    } else {
      orbitRef.current.maxPolarAngle = Math.PI; // Allows camera to go 100% underneath
    }

    switch (viewMode) {
      case "Front":
        cameraRef.current.position.set(center.x, center.y, center.z + distance);
        break;
      case "Back":
        cameraRef.current.position.set(center.x, center.y, center.z - distance);
        break;
      case "Side":
        cameraRef.current.position.set(center.x - distance, center.y, center.z);
        break;
      case "Top":
        // 👉 FIX: Added + 0.1 to Z to prevent Gimbal Lock
        cameraRef.current.position.set(
          center.x,
          center.y + distance,
          center.z + 0.1,
        );
        break;
      case "Bottom":
        // 👉 FIX: Added + 0.1 to Z to prevent Gimbal Lock
        cameraRef.current.position.set(
          center.x,
          center.y - distance,
          center.z + 0.1,
        );
        break;
      case "3D":
      default:
        cameraRef.current.position.set(
          center.x + distance * 0.8,
          center.y + distance * 0.3,
          center.z + distance * 0.8,
        );
        break;
    }

    orbitRef.current.target.copy(center);
    orbitRef.current.update();
    setActiveView(viewMode);
  };

  const resetCameraView = useCallback(() => {
    changeCameraView("3D");
    showCustomizeFeedback("Camera reset.");
  }, [showCustomizeFeedback]);

  const toggleViewerFullscreen = useCallback(async () => {
    if (typeof document === "undefined" || !viewerRootRef.current) return;

    try {
      if (document.fullscreenElement === viewerRootRef.current) {
        await document.exitFullscreen?.();
      } else {
        await viewerRootRef.current.requestFullscreen?.();
      }
    } catch (error) {
      console.error(
        "Unable to toggle customer configurator fullscreen:",
        error,
      );
      showCustomizeFeedback("Fullscreen is unavailable in this browser.");
    }
  }, [showCustomizeFeedback]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleFullscreenChange = () => {
      setIsViewerFullscreen(
        document.fullscreenElement === viewerRootRef.current,
      );

      requestAnimationFrame(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("resize"));
        }
      });
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleCreateSnapshot = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    if (!renderer || !scene || !camera || typeof document === "undefined") {
      showCustomizeFeedback("Snapshot is unavailable.");
      return;
    }

    const dimensionLines = dimensionLinesRef.current;
    const dimensionWasVisible = dimensionLines?.visible;
    const personGroup = personGroupRef.current;
    const personWasVisible = personGroup?.visible;

    const selectionVisibility = selectionHelpersRef.current.map((helper) => ({
      helper,
      visible: helper?.visible,
    }));

    try {
      if (dimensionLines) dimensionLines.visible = false;
      if (personGroup) personGroup.visible = false;

      selectionVisibility.forEach(({ helper }) => {
        if (helper) helper.visible = false;
      });

      renderer.render(scene, camera);

      const dataUrl = renderer.domElement.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "wisdom-furniture-" + Date.now() + ".png";
      document.body.appendChild(link);
      link.click();
      link.remove();

      showCustomizeFeedback("Snapshot created.");
    } catch (error) {
      console.error("Unable to create customer furniture snapshot:", error);
      showCustomizeFeedback("Could not create snapshot.");
    } finally {
      if (dimensionLines) {
        dimensionLines.visible = Boolean(dimensionWasVisible);
      }

      if (personGroup) {
        personGroup.visible = Boolean(personWasVisible);
      }

      selectionVisibility.forEach(({ helper, visible }) => {
        if (helper) helper.visible = Boolean(visible);
      });

      renderer.render(scene, camera);
    }
  }, [showCustomizeFeedback]);

  const finishCatalog = Array.isArray(WOOD_FINISHES) ? WOOD_FINISHES : [];

  const getFinishPreviewChoices = (activeFinishId = "", limit = 3) => {
    const safeLimit = Math.max(1, Number(limit) || 3);
    const firstChoices = finishCatalog.slice(0, safeLimit);

    if (
      activeFinishId &&
      activeFinishId !== "__mixed__" &&
      !firstChoices.some((finish) => finish.id === activeFinishId)
    ) {
      const activeFinish = finishCatalog.find(
        (finish) => finish.id === activeFinishId,
      );

      if (activeFinish) {
        return [
          ...firstChoices.slice(0, Math.max(0, safeLimit - 1)),
          activeFinish,
        ];
      }
    }

    return firstChoices;
  };

  const getDimensionFieldError = useCallback(
    (rawValue, { minMm = 1, maxMm = Infinity, label = "Size" } = {}) => {
      const text = String(rawValue ?? "").trim();

      if (!text) {
        return `${label} is required.`;
      }

      const parsedMm = convertUnitToMm(text, unit);

      if (!Number.isFinite(parsedMm)) {
        return `${label} must be a valid number.`;
      }

      if (parsedMm < minMm) {
        return minMm === 1
          ? "Minimum size is 1 mm."
          : `${label} must be at least ${minMm} mm.`;
      }

      if (Number.isFinite(maxMm) && parsedMm > maxMm) {
        return `${label} must be ${maxMm} mm or less.`;
      }

      return "";
    },
    [convertUnitToMm, unit],
  );

  const handleOverallDraftChange = (axis, value) => {
    setOverallDrafts((prev) => ({ ...prev, [axis]: value }));

    setOverallDimensionErrors((prev) => ({
      ...prev,
      [axis]: getDimensionFieldError(value),
    }));
  };

  const commitOverallDimension = (axis) => {
    if (!isCustomizable || readOnly) return;
    if (!Array.isArray(components) || !components.length) return;
    // Verified wardrobe dimensions require an explicit Apply button.
    // Enter/blur validates and reports errors without changing the 3D model.
    if (needsSafeWardrobeResize(components)) {
      const planning = axis === "width" && canSmartResizeWardrobeWidth
        ? planCustomerWardrobeWidth
        : axis === "height" && canSmartResizeWardrobeHeight
          ? planCustomerWardrobeHeight
          : axis === "depth" && canSmartResizeWardrobeDepth
            ? planCustomerWardrobeDepth
            : null;

      if (!planning) {
        showCustomizeFeedback(
          "This furniture size is protected until safe resizing is ready.",
        );
        return;
      }
      const rawValue = overallDrafts?.[axis];
      const fieldError = getDimensionFieldError(rawValue, {
        label: axis.charAt(0).toUpperCase() + axis.slice(1),
      });
      const planned = fieldError
        ? { ok: false, error: fieldError }
        : planning(components, Math.round(convertUnitToMm(rawValue, unit)));
      setOverallDimensionErrors((previous) => ({
        ...previous,
        [axis]: planned.ok ? "" : planned.error,
      }));
      if (!planned.ok) {
        showCustomizeFeedback(planned.error || "Size cannot be changed safely.");
      }
      return;
    }

    const rawUnitValue = overallDrafts?.[axis];
    const parsedMmValue = convertUnitToMm(rawUnitValue, unit);

    const currentValueMm =
      axis === "width"
        ? Number(overallBounds.width_mm || 0)
        : axis === "height"
          ? Number(overallBounds.height_mm || 0)
          : Number(overallBounds.depth_mm || 0);

    /* WISDOM INPUT VALIDATION BATCH 2 V1.0.0
       Never rebuild/deform the model from invalid overall dimensions. */
    const validationMessage = getDimensionFieldError(rawUnitValue);

    if (
      validationMessage ||
      !Number.isFinite(parsedMmValue) ||
      currentValueMm <= 0
    ) {
      setOverallDimensionErrors((prev) => ({
        ...prev,
        [axis]:
          validationMessage || "The current furniture size is unavailable.",
      }));
      return;
    }

    setOverallDimensionErrors((prev) => ({
      ...prev,
      [axis]: "",
    }));

    const nextValueMm = Math.max(1, Math.round(parsedMmValue));
    if (nextValueMm === currentValueMm) return;

    const scale = nextValueMm / currentValueMm;
    const extents = getComponentExtents(components);

    if (!extents || !Number.isFinite(scale) || scale <= 0) return;

    const centerX = (extents.minX + extents.maxX) / 2;
    const centerZ = (extents.minZ + extents.maxZ) / 2;
    const bottomY = extents.maxY;

    commitComponents((prev) =>
      prev.map((c) => {
        if (axis === "width")
          return {
            ...c,
            x: Math.round(centerX + (Number(c.x || 0) - centerX) * scale),
            width: Math.max(1, Math.round(Number(c.width || 0) * scale)),
          };
        if (axis === "height")
          return {
            ...c,
            y: Math.round(bottomY - (bottomY - Number(c.y || 0)) * scale),
            height: Math.max(1, Math.round(Number(c.height || 0) * scale)),
          };
        return {
          ...c,
          z: Math.round(centerZ + (Number(c.z || 0) - centerZ) * scale),
          depth: Math.max(1, Math.round(Number(c.depth || 0) * scale)),
        };
      }),
    );

    setCustomizeProgressStep((current) => Math.max(current, 3));
    showCustomizeFeedback("Size updated.");
  };

  const applySmartWardrobeWidth = () => {
    if (!isCustomizable || readOnly || !canSmartResizeWardrobeWidth) return;
    const rawWidth = overallDrafts.width;
    const genericError = getDimensionFieldError(rawWidth, { label: "Width" });
    const wanted = Math.round(convertUnitToMm(rawWidth, unit));
    const plan = genericError
      ? { ok: false, error: genericError }
      : planCustomerWardrobeWidth(components, wanted);

    if (!plan.ok) {
      setOverallDimensionErrors((old) => ({
        ...old,
        width: plan.error || "Width could not be changed safely.",
      }));
      return;
    }
    if (plan.width === Number(overallBounds.width_mm)) return;
    setOverallDimensionErrors((old) => ({ ...old, width: "" }));
    commitComponents(plan.parts);
    setCustomizeProgressStep((current) => Math.max(current, 3));
    showCustomizeFeedback("Wardrobe width updated. Check the new design.");
  };

  const applySmartWardrobeHeightDepth = (axis) => {
    const planning = axis === "height" && canSmartResizeWardrobeHeight
      ? planCustomerWardrobeHeight
      : axis === "depth" && canSmartResizeWardrobeDepth
        ? planCustomerWardrobeDepth
        : null;
    if (!isCustomizable || readOnly || !planning) return;
    const raw = overallDrafts?.[axis];
    const label = axis === "height" ? "Height" : "Depth";
    const fieldError = getDimensionFieldError(raw, { label });
    const candidate = fieldError
      ? { ok: false, error: fieldError }
      : planning(components, Math.round(convertUnitToMm(raw, unit)));

    if (!candidate.ok) {
      setOverallDimensionErrors((current) => ({
        ...current,
        [axis]: candidate.error || "Cannot resize this wardrobe safely.",
      }));
      return;
    }
    const currentSize = Number(
      axis === "height" ? overallBounds.height_mm : overallBounds.depth_mm,
    );
    if (candidate[axis] === currentSize) return;
    setOverallDimensionErrors((current) => ({ ...current, [axis]: "" }));
    commitComponents(candidate.parts);
    setCustomizeProgressStep((current) => Math.max(current, 3));
    showCustomizeFeedback(
      `Wardrobe ${axis} updated. Review the furniture parts.`,
    );
  };

  const commitPartDimension = (axis, rawUnitValue) => {
    if (
      !isCustomizable ||
      readOnly ||
      !selectedGroup.length ||
      !canResizeSelectedPart ||
      (selectedEditGroup?.kind !== "drawer" && selectedGroup.some(isCustomerCabinetStructuralPart)) ||
      selectedGroup.some((part) => isCustomerDoorPreviewComponent(part) || isCustomerDoorPanelComponent(part)) ||
      (selectedEditGroup?.kind !== "drawer" &&
        selectedGroup.some(isCustomerShelfStructure) && !selectedShelfLimits)
    ) {
      return;
    }

    const parsedMmValue = convertUnitToMm(rawUnitValue, unit);
    const isDrawerSelection = selectedEditGroup?.kind === "drawer";
    const currentValueMm = isDrawerSelection
      ? Number(selectedAssemblyBounds?.[axis] || 0)
      : Number(sampleSelectedPart?.[axis] || 0);

    const isShelfSelection = Boolean(selectedShelfLimits) && !isDrawerSelection;
    const minMm = isDrawerSelection
      ? Number(selectedDrawerMetrics?.min?.[axis] || 1)
      : isShelfSelection ? (axis === "height" ? sampleSelectedPart.height : selectedShelfLimits.min[axis]) : 1;
    const maxMm = isDrawerSelection
      ? Number(selectedDrawerMetrics?.max?.[axis] || Infinity)
      : isShelfSelection ? (axis === "height" ? sampleSelectedPart.height : selectedShelfLimits.max[axis]) : Infinity;

    const validationMessage = getDimensionFieldError(rawUnitValue, {
      minMm,
      maxMm,
      label:
        axis === "width" ? "Width" : axis === "height" ? "Height" : "Depth",
    });

    if (
      validationMessage ||
      !Number.isFinite(parsedMmValue) ||
      currentValueMm <= 0
    ) {
      setPartDimensionErrors((prev) => ({
        ...prev,
        [axis]: validationMessage || "The selected part size is unavailable.",
      }));
      return;
    }

    setPartDimensionErrors((prev) => ({
      ...prev,
      [axis]: "",
    }));

    const nextValueMm = Math.max(1, Math.round(parsedMmValue));
    if (nextValueMm === Math.round(currentValueMm)) return;

    if (isDrawerSelection) {
      commitComponents((prev) =>
        resizeCustomerDrawerAssembly(
          prev,
          selectedEditGroup,
          selectedDrawerMetrics,
          axis,
          nextValueMm,
        ),
      );

      setCustomizeProgressStep((current) => Math.max(current, 4));
      showCustomizeFeedback("Drawer size updated within its cabinet opening.");
      return;
    }

    if (isShelfSelection) {
      const candidate = {...sampleSelectedPart, [axis]:nextValueMm};
      const error = validateShelfCandidate(components, sampleSelectedPart, candidate);
      if (error) {
        setPartDimensionErrors((prev)=>({...prev,[axis]:error}));
        return;
      }
      commitComponents((prev)=>prev.map((c)=> c.id === sampleSelectedPart.id ? candidate : c));
      setCustomizeProgressStep((current)=>Math.max(current,4));
      showCustomizeFeedback("Shelf updated within verified cabinet limits.");
      return;
    }

    commitComponents((prev) =>
      prev.map((c) => {
        if (!selectedCompIds.includes(c.id)) return c;

        if (axis === "width") {
          return {
            ...c,
            x: c.x - (nextValueMm - c.width) / 2,
            width: nextValueMm,
          };
        }

        if (axis === "height") {
          return {
            ...c,
            y: c.y - (nextValueMm - c.height) / 2,
            height: nextValueMm,
          };
        }

        return {
          ...c,
          z: c.z - (nextValueMm - c.depth) / 2,
          depth: nextValueMm,
        };
      }),
    );

    setCustomizeProgressStep((current) => Math.max(current, 4));
    showCustomizeFeedback("Part size updated. Choose a finish when ready.");
  };

  const commitShelfVerticalPosition = (rawValue) => {
    if (!isCustomizable || readOnly || !selectedShelfLimits || !sampleSelectedPart) return;
    const parsed = convertUnitToMm(rawValue, unit);
    const value = Math.round(parsed);
    if (!Number.isFinite(parsed) || parsed < selectedShelfLimits.min.y ||
        parsed > selectedShelfLimits.max.y) {
      setShelfYError("Vertical position is outside the verified cabinet limits.");
      return;
    }
    if (value === Math.round(Number(sampleSelectedPart.y))) {
      setShelfYError("");
      return;
    }
    const candidate = {...sampleSelectedPart, y: value};
    const error = validateShelfCandidate(components, sampleSelectedPart, candidate);
    if (error) {
      setShelfYError(error);
      return;
    }
    setShelfYError("");
    commitComponents((prev)=>prev.map((c)=> c.id === sampleSelectedPart.id ? candidate : c));
    setCustomizeProgressStep((current)=>Math.max(current,4));
    showCustomizeFeedback("Shelf moved within verified cabinet limits.");
  };

  const handleFinishChange = (finishId, targetIdsOverride = null) => {
    if (!isCustomizable || readOnly || !editable.finish_color) return;
    setCustomizeProgressStep((current) => Math.max(current, 5));
    showCustomizeFeedback(
      finishId
        ? "Finish applied. Review your design."
        : "Finish reset. Review your design.",
    );
    const targetIds =
      Array.isArray(targetIdsOverride) && targetIdsOverride.length
        ? targetIdsOverride
        : selectedCompIds.length
          ? selectedCompIds
          : components.map((c) => c.id);

    commitComponents((prev) =>
      prev.map((c) => {
        if (!targetIds.includes(c.id)) return c;

        const next = applyWoodFinish(c, finishId);
        const previewHex = getFinishPreviewColor(
          finishId,
          next?.fill || c.fill || c.color || "",
        );
        return {
          ...c,
          ...next,
          fill: previewHex || next?.fill || c.fill || c.color || "",
          color: previewHex || c.color || c.fill || "",
          finish: finishId || "",
          finish_id: finishId || "",
          woodFinish: finishId || "",
          finish_color: previewHex || c.finish_color || "",
          color_mode: finishId ? "wood" : "",
        };
      }),
    );
  };

  const handleApply = () => {
    if (typeof onApply !== "function") return;

    const parsedQuantity = Number(quantity);

    const safeQuantity =
      Number.isSafeInteger(parsedQuantity) && parsedQuantity >= 1
        ? Math.min(parsedQuantity, MAX_CUSTOM_QUANTITY)
        : 1;

    const safeComments = String(comments || "")
      .trim()
      .slice(0, 500);

    setCustomizeProgressStep(6);

    /* WISDOM HOMEPAGE ACTUAL 3D TEMPLATE V1.2.2
     Parent Customize page already displays the detailed bottom-right
     custom-cart confirmation. Remove only this duplicate top black effect. */
    onApply({
      quantity: safeQuantity,
      comments: safeComments,
      bounds: {
        width: overallBounds.width_mm,
        height: overallBounds.height_mm,
        depth: overallBounds.depth_mm,
      },
      defaultDimensions: {
        width_mm: overallBounds.width_mm,
        height_mm: overallBounds.height_mm,
        depth_mm: overallBounds.depth_mm,
      },
      worldSize: { width_mm: WORLD_W, height_mm: WORLD_H, depth_mm: WORLD_D },
      components: cloneDeep(components),
      metadata: summarizeMetadata(components),
      delivery_requirement: deliveryAssessment,
    });
  };

  const undoDisabled = !historyRef.current.past.length;
  const redoDisabled = !historyRef.current.future.length;

  return (
    <div
      ref={viewerRootRef}
      className={
        "wisdom-roomle-root" +
        (!readOnly ? " is-customize" : "") +
        (!showMeasurements ? " measurements-hidden" : "")
      }
      style={styles.root}
    >
      {!readOnly && customizeFeedback ? (
        <div
          className="wisdom-config-feedback-toast"
          role="status"
          aria-live="polite"
        >
          {customizeFeedback}
        </div>
      ) : null}

      <div className="wisdom-roomle-topbar" style={styles.topBar}>
        <div style={styles.topBarMeta}>
          <div style={styles.topBarEyebrow}>
            {readOnly ? "Design Preview" : "Customize Design"}
          </div>
          <div style={styles.topBarTitle}>
            {formatUnitLabel(overallBounds.width_mm)} ×{" "}
            {formatUnitLabel(overallBounds.height_mm)} ×{" "}
            {formatUnitLabel(overallBounds.depth_mm)}
          </div>
        </div>

        <div style={styles.topBarActions}>
          {!readOnly ? (
            <div style={styles.compactGroup}>
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoDisabled}
                style={{
                  ...styles.toolBtn,
                  ...(undoDisabled ? styles.toolBtnDisabled : {}),
                }}
              >
                Undo
              </button>

              <button
                type="button"
                onClick={handleRedo}
                disabled={redoDisabled}
                style={{
                  ...styles.toolBtn,
                  ...(redoDisabled ? styles.toolBtnDisabled : {}),
                }}
              >
                Redo
              </button>
            </div>
          ) : null}

          <div style={styles.unitToggleGroup}>
            {["cm", "m", "inches", "ft", "yd", "mm"].map((u, index, arr) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                style={{
                  ...styles.unitBtn,
                  ...(index !== arr.length - 1 ? styles.unitBtnDivider : {}),
                  ...(unit === u ? styles.unitBtnActive : {}),
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={
          "customer-3d-viewer-shell " +
          (!readOnly
            ? "customer-3d-viewer-shell-customize wisdom-roomle-configurator "
            : "") +
          (!readOnly && sidebarCollapsed ? "wisdom-sidebar-collapsed" : "")
        }
        style={{
          ...styles.viewerShell,
          ...(!readOnly ? styles.customizeViewerShell : {}),
        }}
      >
        <div
          className="customer-3d-viewer-canvas-wrap"
          style={{
            ...styles.canvasWrap,
            ...(!readOnly ? styles.customizeCanvasWrap : {}),
          }}
        >
          {!readOnly ? (
            <>
              <div
                style={styles.customizeViewerControls}
                className="cust-mobile-controls"
              >
                <div
                  style={{
                    ...styles.customizeViewerControlRow,
                    gridTemplateColumns:
                      hasCustomerPreviewDoors || hasCustomerPreviewDrawers
                        ? "max-content max-content minmax(0, 1fr)"
                        : "max-content minmax(0, 1fr)",
                  }}
                  className="cust-mobile-control-row"
                >
                  <div
                    style={{
                      ...styles.cameraToolbar,
                      ...styles.cameraToolbarInline,
                    }}
                  >
                    {["3D", "Front", "Back", "Side", "Top", "Bottom"].map(
                      (view) => (
                        <button
                          key={view}
                          type="button"
                          onClick={() => changeCameraView(view)}
                          style={{
                            ...styles.cameraBtn,
                            ...(view === "Bottom" ? styles.cameraBtnLast : {}),
                            ...(activeView === view
                              ? styles.cameraBtnActive
                              : {}),
                          }}
                        >
                          {view}
                        </button>
                      ),
                    )}
                  </div>

                  {hasCustomerPreviewDoors || hasCustomerPreviewDrawers ? (
                    <div
                      style={{
                        ...styles.compactGroup,
                        alignSelf: "center",
                      }}
                      aria-label="Furniture movement preview"
                    >
                      {hasCustomerPreviewDoors ? (
                        <button
                          type="button"
                          aria-pressed={doorsPreviewOpen}
                          onClick={
                            doorsPreviewOpen
                              ? closeAllCustomerDoors
                              : () => openAllCustomerDoors()
                          }
                          style={{
                            ...styles.toolBtn,
                            ...(doorsPreviewOpen ? styles.unitBtnActive : {}),
                          }}
                        >
                          {doorsPreviewOpen
                            ? "Close All Doors"
                            : "Open All Doors"}
                        </button>
                      ) : null}

                      {hasCustomerPreviewDrawers ? (
                        <button
                          type="button"
                          aria-pressed={drawersPreviewOpen}
                          onClick={
                            drawersPreviewOpen
                              ? closeAllCustomerDrawers
                              : () => openAllCustomerDrawers()
                          }
                          style={{
                            ...styles.toolBtn,
                            ...(drawersPreviewOpen ? styles.unitBtnActive : {}),
                          }}
                        >
                          {drawersPreviewOpen
                            ? "Close All Drawers"
                            : "Open All Drawers"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div
                    style={styles.customizeProgressArea}
                    className="cust-mobile-hide"
                  >
                    <div style={styles.customizeProgressHeader}>
                      <div>
                        <div style={styles.customizeProgressEyebrow}>
                          Customization Progress
                        </div>
                        <div style={styles.customizeProgressSummary}>
                          Step {customizeProgressStep} of{" "}
                          {CUSTOMIZE_GUIDE_STEPS.length}
                        </div>
                      </div>
                    </div>

                    <div style={styles.customizeStepsScroll}>
                      <div style={styles.customizeSteps}>
                        {CUSTOMIZE_GUIDE_STEPS.map((step, index) => {
                          const stepNumber = index + 1;
                          const isComplete = stepNumber < customizeProgressStep;
                          const isActive = stepNumber === customizeProgressStep;

                          return (
                            <div key={step.label} style={styles.customizeStep}>
                              <div style={styles.customizeStepRail}>
                                <span
                                  style={{
                                    ...styles.customizeStepBadge,
                                    ...(isComplete
                                      ? styles.customizeStepBadgeComplete
                                      : {}),
                                    ...(isActive
                                      ? styles.customizeStepBadgeActive
                                      : {}),
                                  }}
                                >
                                  {isComplete ? "✓" : stepNumber}
                                </span>

                                {index < CUSTOMIZE_GUIDE_STEPS.length - 1 ? (
                                  <span
                                    style={{
                                      ...styles.customizeStepLine,
                                      ...(isComplete
                                        ? styles.customizeStepLineComplete
                                        : {}),
                                    }}
                                  />
                                ) : null}
                              </div>

                              <span
                                style={{
                                  ...styles.customizeStepLabel,
                                  ...(isActive || isComplete
                                    ? styles.customizeStepLabelReached
                                    : {}),
                                }}
                              >
                                {step.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={styles.customizeGuideDock}
                  className="cust-mobile-guide-dock"
                >
                  <button
                    type="button"
                    onClick={openCustomizeGuide}
                    style={styles.customizeGuideHelpBtn}
                  >
                    How to Customize?
                  </button>

                  {showCustomizeGuide ? (
                    <div
                      style={styles.customizeGuideCard}
                      className="cust-mobile-guide-card"
                    >
                      <div style={styles.customizeGuideCardTop}>
                        <div>
                          <div style={styles.customizeGuideStepMeta}>
                            GUIDE {customizeGuideStep + 1} OF{" "}
                            {CUSTOMIZE_GUIDE_STEPS.length}
                          </div>
                          <div style={styles.customizeGuideTitle}>
                            {CUSTOMIZE_GUIDE_STEPS[customizeGuideStep].title}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={rememberCustomizeGuide}
                          style={styles.customizeGuideSkipBtn}
                        >
                          Close
                        </button>
                      </div>

                      <div style={styles.customizeGuideInstruction}>
                        {CUSTOMIZE_GUIDE_STEPS[customizeGuideStep].instruction}
                      </div>

                      <div style={styles.customizeGuideActions}>
                        {customizeGuideStep > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomizeGuideStep((current) =>
                                Math.max(0, current - 1),
                              )
                            }
                            style={styles.customizeGuideSecondaryBtn}
                          >
                            Back
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={goToNextCustomizeGuideStep}
                          style={styles.customizeGuidePrimaryBtn}
                        >
                          {customizeGuideStep ===
                          CUSTOMIZE_GUIDE_STEPS.length - 1
                            ? "Got it"
                            : "Next"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className="wisdom-roomle-stage"
                style={styles.customizeCanvasStage}
              >
                <div
                  className="wisdom-roomle-toolbar"
                  aria-label="3D viewer tools"
                >
                  <div className="wisdom-roomle-toolbar-slot">
                    <button
                      type="button"
                      className="wisdom-roomle-tool"
                      data-tooltip="Undo"
                      onClick={handleUndo}
                      disabled={undoDisabled}
                      aria-label="Undo"
                    >
                      <Undo2 size={18} strokeWidth={1.65} />
                    </button>
                  </div>

                  <div className="wisdom-roomle-toolbar-slot">
                    <button
                      type="button"
                      className="wisdom-roomle-tool"
                      data-tooltip="Redo"
                      onClick={handleRedo}
                      disabled={redoDisabled}
                      aria-label="Redo"
                    >
                      <Redo2 size={18} strokeWidth={1.65} />
                    </button>
                  </div>

                  <div className="wisdom-roomle-toolbar-slot">
                    <button
                      type="button"
                      className={
                        "wisdom-roomle-tool" +
                        (partListVisible ? " is-active" : "")
                      }
                      data-tooltip={
                        partListVisible ? "Hide part list" : "Show part list"
                      }
                      onClick={() => {
                        setPartListVisible((visible) => {
                          const nextVisible = !visible;
                          if (!nextVisible) {
                            setExpandedPartLabel("");
                          }
                          return nextVisible;
                        });
                        if (sidebarCollapsed) setSidebarCollapsed(false);
                      }}
                      aria-label={
                        partListVisible ? "Hide part list" : "Show part list"
                      }
                      aria-pressed={partListVisible}
                    >
                      <List size={18} strokeWidth={1.65} />
                    </button>
                  </div>

                  <div className="wisdom-roomle-toolbar-slot">
                    <button
                      type="button"
                      className={
                        "wisdom-roomle-tool" +
                        (showMeasurements ? " is-active" : "")
                      }
                      data-tooltip={
                        showMeasurements ? "Hide size" : "Show size"
                      }
                      onClick={() => setShowMeasurements((visible) => !visible)}
                      aria-label={showMeasurements ? "Hide size" : "Show size"}
                      aria-pressed={showMeasurements}
                    >
                      <Ruler size={18} strokeWidth={1.65} />
                    </button>
                  </div>

                  <div className="wisdom-roomle-toolbar-slot">
                    <button
                      type="button"
                      className={
                        "wisdom-roomle-tool wisdom-roomle-unit-tool" +
                        (unitMenuOpen ? " is-active" : "")
                      }
                      data-tooltip="Unit"
                      onClick={() => {
                        setUnitMenuOpen((open) => !open);
                        setViewMenuOpen(false);
                      }}
                      aria-label="Unit"
                      aria-expanded={unitMenuOpen}
                    >
                      {unit === "inches" ? "in" : unit}
                    </button>

                    {unitMenuOpen ? (
                      <div
                        className="wisdom-roomle-popover wisdom-roomle-unit-menu"
                        role="menu"
                        aria-label="Unit"
                      >
                        {["mm", "cm", "m", "inches", "ft", "yd"].map(
                          (unitOption) => (
                            <button
                              key={unitOption}
                              type="button"
                              className={
                                "wisdom-roomle-popover-option" +
                                (unit === unitOption ? " is-active" : "")
                              }
                              onClick={() => {
                                setUnit(unitOption);
                                setUnitMenuOpen(false);
                              }}
                            >
                              {unitOption === "inches" ? "in" : unitOption}
                            </button>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="wisdom-roomle-toolbar-slot">
                    <button
                      type="button"
                      className={
                        "wisdom-roomle-tool" +
                        (viewMenuOpen ? " is-active" : "")
                      }
                      data-tooltip="View"
                      onClick={() => {
                        setViewMenuOpen((open) => !open);
                        setUnitMenuOpen(false);
                      }}
                      aria-label="View"
                      aria-expanded={viewMenuOpen}
                    >
                      <Box size={18} strokeWidth={1.65} />
                    </button>

                    {viewMenuOpen ? (
                      <div
                        className="wisdom-roomle-popover wisdom-roomle-view-menu"
                        role="menu"
                        aria-label="View"
                      >
                        {["3D", "Front", "Back", "Side", "Top", "Bottom"].map(
                          (view) => (
                            <button
                              key={view}
                              type="button"
                              className={
                                "wisdom-roomle-view-option" +
                                (activeView === view ? " is-active" : "")
                              }
                              onClick={() => {
                                changeCameraView(view);
                                setViewMenuOpen(false);
                              }}
                            >
                              {view}
                            </button>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="wisdom-roomle-toolbar-slot">
                    <button
                      type="button"
                      className="wisdom-roomle-tool"
                      data-tooltip="Reset view"
                      onClick={resetCameraView}
                      aria-label="Reset view"
                    >
                      <RotateCcw size={18} strokeWidth={1.65} />
                    </button>
                  </div>

                  <div className="wisdom-roomle-toolbar-slot">
                    <button
                      type="button"
                      className={
                        "wisdom-roomle-tool" +
                        (isViewerFullscreen ? " is-active" : "")
                      }
                      data-tooltip={
                        isViewerFullscreen ? "Exit fullscreen" : "Fullscreen"
                      }
                      onClick={toggleViewerFullscreen}
                      aria-label={
                        isViewerFullscreen ? "Exit fullscreen" : "Fullscreen"
                      }
                    >
                      <Maximize2 size={18} strokeWidth={1.65} />
                    </button>
                  </div>

                  <div className="wisdom-roomle-toolbar-slot">
                    <button
                      type="button"
                      className="wisdom-roomle-tool"
                      data-tooltip="Create snapshot"
                      onClick={handleCreateSnapshot}
                      aria-label="Create snapshot"
                    >
                      <Camera size={18} strokeWidth={1.65} />
                    </button>
                  </div>

                </div>

                <button
                  type="button"
                  className="wisdom-roomle-sidebar-toggle wisdom-roomle-sidebar-toggle-visible"
                  data-tooltip={
                    sidebarCollapsed ? "Show options" : "Hide options"
                  }
                  onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
                  aria-label={
                    sidebarCollapsed ? "Show options" : "Hide options"
                  }
                >
                  {sidebarCollapsed ? (
                    <ChevronLeft size={18} strokeWidth={1.8} />
                  ) : (
                    <ChevronRight size={18} strokeWidth={1.8} />
                  )}
                </button>

                <div ref={mountRef} style={styles.canvasContainer} />

                <div
                  ref={labelWRef}
                  className="customer-3d-floating-label"
                  style={styles.floatingLabel}
                >
                  {formatUnitLabel(overallBounds.width_mm)}
                </div>

                <div
                  ref={labelHRef}
                  className="customer-3d-floating-label"
                  style={styles.floatingLabel}
                >
                  {formatUnitLabel(overallBounds.height_mm)}
                </div>

                <div
                  ref={labelDRef}
                  className="customer-3d-floating-label"
                  style={styles.floatingLabel}
                >
                  {formatUnitLabel(overallBounds.depth_mm)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={styles.cameraToolbar}>
                {["3D", "Front", "Back", "Side", "Top", "Bottom"].map(
                  (view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => changeCameraView(view)}
                      style={{
                        ...styles.cameraBtn,
                        ...(view === "Bottom" ? styles.cameraBtnLast : {}),
                        ...(activeView === view ? styles.cameraBtnActive : {}),
                      }}
                    >
                      {view}
                    </button>
                  ),
                )}
              </div>

              <div ref={mountRef} style={styles.canvasContainer} />

              <div
                ref={labelWRef}
                className="customer-3d-floating-label"
                style={styles.floatingLabel}
              >
                {formatUnitLabel(overallBounds.width_mm)}
              </div>

              <div
                ref={labelHRef}
                className="customer-3d-floating-label"
                style={styles.floatingLabel}
              >
                {formatUnitLabel(overallBounds.height_mm)}
              </div>

              <div
                ref={labelDRef}
                className="customer-3d-floating-label"
                style={styles.floatingLabel}
              >
                {formatUnitLabel(overallBounds.depth_mm)}
              </div>
            </>
          )}
        </div>

        {readOnly ? (
          <aside
            style={{
              ...styles.sidebar,
              gridTemplateRows: "minmax(0, 1fr)",
            }}
          >
            <div style={styles.viewSidebarScroll}>
              <section style={styles.viewDetailsCard}>
                <div style={styles.viewDetailsTitle}>Design Details</div>
                <p style={styles.viewDetailsNote}>
                  Review the key details of this furniture design.
                </p>

                <div style={styles.viewDetailsDivider} />

                <div style={styles.viewDetailsGroup}>
                  <div style={styles.viewDetailsGroupTitle}>Dimensions</div>

                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Width</span>
                    <strong style={styles.viewDetailValue}>
                      {formatUnitLabel(overallBounds.width_mm)}
                    </strong>
                  </div>

                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Height</span>
                    <strong style={styles.viewDetailValue}>
                      {formatUnitLabel(overallBounds.height_mm)}
                    </strong>
                  </div>

                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Depth</span>
                    <strong style={styles.viewDetailValue}>
                      {formatUnitLabel(overallBounds.depth_mm)}
                    </strong>
                  </div>
                </div>

                <div style={styles.viewDetailsDivider} />

                <div style={styles.viewDetailsGroup}>
                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Material</span>
                    <strong style={styles.viewDetailValue}>
                      {viewMetadata.material}
                    </strong>
                  </div>

                  <div style={styles.viewDetailRow}>
                    <span style={styles.viewDetailLabel}>Finish</span>
                    <strong style={styles.viewDetailValue}>
                      {viewMetadata.finish}
                    </strong>
                  </div>

                  <div style={styles.viewDetailRowLast}>
                    <span style={styles.viewDetailLabel}>Order Type</span>
                    <strong style={styles.viewDetailValue}>
                      Made to Order
                    </strong>
                  </div>
                </div>
              </section>

              {typeof onViewCustomize === "function" ? (
                <button
                  type="button"
                  onClick={onViewCustomize}
                  style={styles.viewCustomizeBtn}
                >
                  Customize
                </button>
              ) : null}
            </div>
          </aside>
        ) : (
          <aside
            className="wisdom-roomle-sidebar"
            style={{
              ...styles.sidebar,
              ...styles.customizeSidebarScrollable,
            }}
          >
            <div
              className="wisdom-roomle-sidebar-scroll"
              style={styles.sidebarScroll}
            >
              {isCustomizable && !readOnly && components.some(isCustomerDoorPanelComponent) ? (
                <section style={styles.sidebarSection}>
                  <label htmlFor="customer-door-selector" style={styles.label}>
                    Select Individual Door
                  </label>
                  <select
                    id="customer-door-selector"
                    aria-label="Select individual door"
                    style={styles.partGroupSelect}
                    value={
                      selectedGroup.length === 1 &&
                      sampleSelectedPart &&
                      isCustomerDoorPanelComponent(sampleSelectedPart)
                        ? String(sampleSelectedPart.id)
                        : ""
                    }
                    onChange={(event) => {
                      const door = components.find(
                        (item) =>
                          isCustomerDoorPanelComponent(item) &&
                          String(item.id) === event.target.value,
                      );
                      setSelectedCompIds(door ? [door.id] : []);
                      if (door) {
                        setSelectionMode(true);
                        showCustomizeFeedback((door.label || door.name || "Door") + " selected.");
                      }
                    }}
                  >
                    <option value="">Choose a door</option>
                    {components.filter(isCustomerDoorPanelComponent).map((door) => (
                      <option key={String(door.id)} value={String(door.id)}>
                        {door.label || door.name || "Door"} — Size protected
                      </option>
                    ))}
                  </select>
                  <div style={styles.helperTextMuted}>
                    Choose one door to change its finish or preview its movement.
                    Door size stays locked until safe cabinet limits are available.
                  </div>
                  <button
                    type="button"
                    disabled={
                      selectedGroup.length !== 1 ||
                      !sampleSelectedPart ||
                      !isCustomerDoorPreviewComponent(sampleSelectedPart)
                    }
                    onClick={() => {
                      if (
                        selectedGroup.length !== 1 ||
                        !sampleSelectedPart ||
                        !isCustomerDoorPreviewComponent(sampleSelectedPart)
                      ) return;
                      const selectedSet = buildCustomerDoorPreviewSets(components).find(
                        (set) => set.members.some((part) => part.id === sampleSelectedPart.id),
                      );
                      if (!selectedSet) return;
                      const alreadyOpen = (doorMotionPreviewRef.current || []).some(
                        (preview) => preview.key === selectedSet.key,
                      );
                      if (toggleCustomerDoorFromComponentId(sampleSelectedPart.id)) {
                        showCustomizeFeedback(
                          alreadyOpen
                            ? "Door closed for preview."
                            : "Door opened for preview.",
                        );
                      }
                    }}
                    style={{
                      ...styles.toolBtn,
                      ...(
                        selectedGroup.length !== 1 ||
                        !sampleSelectedPart ||
                        !isCustomerDoorPreviewComponent(sampleSelectedPart)
                          ? styles.toolBtnDisabled
                          : {}
                      ),
                    }}
                  >
                    Open / Close Selected Door
                  </button>
                  {hasCustomerPreviewDoors ? (
                    <button
                      type="button"
                      aria-pressed={doorsPreviewOpen}
                      onClick={
                        doorsPreviewOpen
                          ? closeAllCustomerDoors
                          : () => openAllCustomerDoors()
                      }
                      style={{
                        ...styles.toolBtn,
                        ...(doorsPreviewOpen ? styles.unitBtnActive : {}),
                      }}
                    >
                      {doorsPreviewOpen ? "Close All Doors" : "Open All Doors"}
                    </button>
                  ) : null}
                </section>
              ) : null}

              {isCustomizable && !readOnly && editGroups.some((group) => group.kind === "drawer") ? (
                <section style={styles.sidebarSection}>
                  <label htmlFor="customer-drawer-selector" style={styles.label}>
                    Select Individual Drawer
                  </label>
                  <select
                    id="customer-drawer-selector"
                    aria-label="Select individual drawer"
                    style={styles.partGroupSelect}
                    value={selectedEditGroup?.kind === "drawer" ? selectedEditGroup.key : ""}
                    onChange={(event) => {
                      const group = editGroups.find(
                        (entry) => entry.kind === "drawer" && entry.key === event.target.value,
                      );
                      setSelectedCompIds(group?.ids || []);
                      if (group?.ids?.length) {
                        setSelectionMode(true);
                        showCustomizeFeedback(`${group.label} selected.`);
                      }
                    }}
                  >
                    <option value="">Choose a drawer</option>
                    {editGroups.filter((group) => group.kind === "drawer").map((group) => (
                      <option key={group.key} value={group.key}>
                        {group.label} ({group.ids.length} parts)
                      </option>
                    ))}
                  </select>
                  <div style={styles.helperTextMuted}>
                    Select Drawer 1, Drawer 2, or the small drawer separately.
                  </div>
                </section>
              ) : null}

              {isCustomizable && !readOnly && components.some(isCustomerShelfStructure) ? (
                <section style={styles.sidebarSection}>
                  <label htmlFor="customer-shelf-selector" style={styles.label}>
                    Select Individual Shelf
                  </label>
                  <select
                    id="customer-shelf-selector"
                    aria-label="Select individual shelf"
                    style={styles.partGroupSelect}
                    value={
                      selectedGroup.length === 1 &&
                      sampleSelectedPart &&
                      isCustomerShelfStructure(sampleSelectedPart)
                        ? String(sampleSelectedPart.id)
                        : ""
                    }
                    onChange={(event) => {
                      const shelf = components.find(
                        (item) =>
                          isCustomerShelfStructure(item) &&
                          String(item.id) === event.target.value,
                      );
                      setSelectedCompIds(shelf ? [shelf.id] : []);
                      if (shelf) {
                        setSelectionMode(true);
                        setCustomizeProgressStep((current) => Math.max(current, 3));
                        showCustomizeFeedback(`${shelf.label || shelf.name || "Shelf"} selected.`);
                      }
                    }}
                  >
                    <option value="">Choose one shelf</option>
                    {components.filter(isCustomerShelfStructure).map((shelf) => {
                      const classification = getCustomerShelfClassification(shelf);
                      const status =
                        classification === "fixed"
                          ? "Fixed / protected"
                          : classification === "adjustable"
                            ? getVerifiedShelfLimits(components, shelf)
                              ? "Adjustable"
                              : "Adjustable / supports unverified"
                            : "Unverified / protected";
                      return (
                        <option key={String(shelf.id)} value={String(shelf.id)}>
                          {shelf.label || shelf.name || "Shelf"}
                          {shelf.partCode ? ` (${shelf.partCode})` : ""}
                          {" — "}{status}
                        </option>
                      );
                    })}
                  </select>
                  <div style={styles.helperTextMuted}>
                    Choose one shelf, not the whole Shelves finish group.
                    Fixed and unverified shelves cannot be resized.
                  </div>
                </section>
              ) : null}

              {partListVisible ? (
                <>
                  <section className="wisdom-config-section wisdom-config-whole">
                    <div className="wisdom-config-section-head wisdom-config-section-head-static">
                      <button
                        type="button"
                        className="wisdom-config-part-title-btn"
                        onClick={() => setSelectedCompIds([])}
                      >
                        <span className="wisdom-config-section-title">
                          WHOLE FURNITURE
                        </span>
                        <span className="wisdom-config-section-note">
                          Apply one wood finish to the complete design
                        </span>
                      </button>
                    </div>

                    {(() => {
                      const groupKey = "__whole__";
                      const showAll = expandedFinishGroupLabel === groupKey;
                      const previewFinishes = getFinishPreviewChoices(
                        uniformFinishId,
                        3,
                      );
                      const finishesToRender = showAll
                        ? finishCatalog
                        : previewFinishes;
                      const hiddenCount = Math.max(
                        0,
                        finishCatalog.length - previewFinishes.length,
                      );

                      return (
                        <div
                          className={
                            "wisdom-finish-preview-grid" +
                            (showAll ? " show-all" : "")
                          }
                        >
                          <button
                            type="button"
                            className={
                              "wisdom-finish-choice" +
                              (!uniformFinishId ? " is-active" : "")
                            }
                            onClick={() => {
                              setSelectedCompIds([]);
                              handleFinishChange(
                                "",
                                components.map((component) => component.id),
                              );
                            }}
                          >
                            <span className="wisdom-finish-circle wisdom-finish-original">
                              {!uniformFinishId ? (
                                <span className="wisdom-finish-check">✓</span>
                              ) : null}
                            </span>
                            <span className="wisdom-finish-label">
                              Original
                            </span>
                          </button>

                          {finishesToRender.map((finish) => (
                            <button
                              key={"whole_" + finish.id}
                              type="button"
                              className={
                                "wisdom-finish-choice" +
                                (uniformFinishId === finish.id
                                  ? " is-active"
                                  : "")
                              }
                              onClick={() => {
                                setSelectedCompIds([]);
                                handleFinishChange(
                                  finish.id,
                                  components.map((component) => component.id),
                                );
                              }}
                            >
                              <span
                                className="wisdom-finish-circle"
                                style={{
                                  background:
                                    finish.front ||
                                    finish.carcass ||
                                    finish.inside ||
                                    finish.color ||
                                    finish.hex ||
                                    "#dddddd",
                                }}
                              >
                                {uniformFinishId === finish.id ? (
                                  <span className="wisdom-finish-check">✓</span>
                                ) : null}
                              </span>
                              <span className="wisdom-finish-label">
                                {finish.label}
                              </span>
                            </button>
                          ))}

                          {finishCatalog.length > previewFinishes.length ? (
                            <button
                              type="button"
                              className="wisdom-finish-more-choice"
                              onClick={() =>
                                setExpandedFinishGroupLabel((current) =>
                                  current === groupKey ? "" : groupKey,
                                )
                              }
                            >
                              <span className="wisdom-finish-more-circle">
                                {showAll ? "−" : "+" + hiddenCount}
                              </span>
                              <span className="wisdom-finish-label">
                                {showAll ? "Show less" : "Show all"}
                              </span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })()}
                  </section>

                  {partGroups.map((group) => {
                    const representative =
                      components.find((component) =>
                        group.ids.includes(component.id),
                      ) || null;

                    const finishTargetIds = getCustomerFinishGroupTargetIds(
                      group,
                      selectedCompIds,
                      components,
                    );
                    const activeFinishParts = components.filter((component) =>
                      finishTargetIds.includes(component.id),
                    );
                    const finishIds = activeFinishParts.map((component) =>
                      String(
                        component?.finish_id ||
                          component?.woodFinish ||
                          component?.finish ||
                          "",
                      ).trim(),
                    );
                    const groupFinishId =
                      group.label === "Doors"
                        ? finishIds.length && new Set(finishIds).size === 1
                          ? finishIds[0]
                          : "__mixed__"
                        : String(
                            representative?.finish_id ||
                              representative?.woodFinish ||
                              representative?.finish ||
                              "",
                          ).trim();

                    const groupSelected = group.ids.some((id) =>
                      selectedCompIds.includes(id),
                    );

                    const showAll = expandedFinishGroupLabel === group.label;
                    const previewFinishes = getFinishPreviewChoices(
                      groupFinishId,
                      3,
                    );
                    const finishesToRender = showAll
                      ? finishCatalog
                      : previewFinishes;
                    const hiddenCount = Math.max(
                      0,
                      finishCatalog.length - previewFinishes.length,
                    );

                    return (
                      <section
                        key={group.label}
                        className={
                          "wisdom-config-section wisdom-config-part-section" +
                          (groupSelected ? " is-selected" : "")
                        }
                      >
                        <div className="wisdom-config-section-head wisdom-config-section-head-static">
                          <button
                            type="button"
                            className="wisdom-config-part-title-btn"
                            onClick={() => {
                              setSelectedCompIds(group.ids || []);
                              showCustomizeFeedback(
                                String(group.label || "Furniture part") +
                                  " selected.",
                              );
                            }}
                          >
                            <span className="wisdom-config-section-title">
                              {group.label}
                            </span>
                            <span className="wisdom-config-part-count">
                              {group.ids.length}{" "}
                              {group.ids.length === 1 ? "part" : "parts"}
                            </span>
                          </button>

                          {groupSelected ? (
                            <span className="wisdom-config-selected-pill">
                              Selected
                            </span>
                          ) : null}
                        </div>

                        <div
                          className={
                            "wisdom-finish-preview-grid" +
                            (showAll ? " show-all" : "")
                          }
                        >
                          <button
                            type="button"
                            className={
                              "wisdom-finish-choice" +
                              (!groupFinishId ? " is-active" : "")
                            }
                            onClick={() => {
                              setSelectedCompIds(finishTargetIds);
                              handleFinishChange("", finishTargetIds);
                            }}
                          >
                            <span className="wisdom-finish-circle wisdom-finish-original">
                              {!groupFinishId ? (
                                <span className="wisdom-finish-check">✓</span>
                              ) : null}
                            </span>
                            <span className="wisdom-finish-label">
                              Original
                            </span>
                          </button>

                          {finishesToRender.map((finish) => (
                            <button
                              key={group.label + "_" + finish.id}
                              type="button"
                              className={
                                "wisdom-finish-choice" +
                                (groupFinishId === finish.id
                                  ? " is-active"
                                  : "")
                              }
                              onClick={() => {
                                setSelectedCompIds(finishTargetIds);
                                handleFinishChange(finish.id, finishTargetIds);
                              }}
                            >
                              <span
                                className="wisdom-finish-circle"
                                style={{
                                  background:
                                    finish.front ||
                                    finish.carcass ||
                                    finish.inside ||
                                    finish.color ||
                                    finish.hex ||
                                    "#dddddd",
                                }}
                              >
                                {groupFinishId === finish.id ? (
                                  <span className="wisdom-finish-check">✓</span>
                                ) : null}
                              </span>
                              <span className="wisdom-finish-label">
                                {finish.label}
                              </span>
                            </button>
                          ))}

                          {finishCatalog.length > previewFinishes.length ? (
                            <button
                              type="button"
                              className="wisdom-finish-more-choice"
                              onClick={() =>
                                setExpandedFinishGroupLabel((current) =>
                                  current === group.label ? "" : group.label,
                                )
                              }
                            >
                              <span className="wisdom-finish-more-circle">
                                {showAll ? "−" : "+" + hiddenCount}
                              </span>
                              <span className="wisdom-finish-label">
                                {showAll ? "Show less" : "Show all"}
                              </span>
                            </button>
                          ) : null}
                        </div>
                        {group.label === "Doors" ? (
                          <div style={styles.helperTextMuted}>
                            {finishTargetIds.length === 1
                              ? "Finish changes only the selected door. Click DOORS to select both."
                              : "Finish changes both doors. Choose one above for a single door."}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </>
              ) : null}

              <div
                className="wisdom-legacy-customize-heading"
                style={styles.customizeOptionalToolsHeading}
              >
                <span style={styles.customizeOptionalToolsTitle}>
                  Optional Tools
                </span>
                <span style={styles.customizeOptionalToolsNote}>
                  Use only when needed
                </span>
              </div>

              <section
                className="wisdom-legacy-part-editor"
                style={{
                  ...styles.sidebarSection,
                  ...styles.customizeOptionalSection,
                  ...(showCustomizeGuide && customizeGuideStep + 1 === 3
                    ? styles.customizeActiveSection
                    : {}),
                }}
              >
                <div style={styles.sectionRow}>
                  <label style={styles.label}>Edit Individual Parts</label>

                  <button
                    type="button"
                    aria-pressed={selectionMode}
                    onClick={() => {
                      const nextEnabled = !selectionMode;
                      setSelectionMode(nextEnabled);

                      if (nextEnabled) {
                        setCustomizeProgressStep((current) =>
                          Math.max(current, 3),
                        );
                        showCustomizeFeedback(
                          "Edit mode is on. Select a furniture part.",
                        );
                      } else {
                        setSelectedCompIds([]);
                        showCustomizeFeedback("Edit mode is off.");
                      }
                    }}
                    style={{
                      ...styles.editDesignBtn,
                      ...(selectionMode ? styles.editDesignBtnActive : {}),
                    }}
                  >
                    {selectionMode ? "EDITING ON" : "EDIT DESIGN"}
                  </button>
                </div>

                {selectionMode ? (
                  <>
                    <div style={styles.helperText}>
                      Editing mode is on. Select a part in the 3D preview, or
                      choose one from the list below.
                    </div>

                    <select
                      value={
                        selectedCompIds.length
                          ? String(
                              editGroups.findIndex((group) =>
                                group.ids.some((id) =>
                                  selectedCompIds.includes(id),
                                ),
                              ),
                            )
                          : ""
                      }
                      onChange={(e) => {
                        const index = Number(e.target.value);
                        if (!Number.isInteger(index) || index < 0) {
                          setSelectedCompIds([]);
                          return;
                        }

                        const group = editGroups[index];
                        setSelectedCompIds(group?.ids || []);
                        if (group?.ids?.length) {
                          showCustomizeFeedback("Furniture part selected.");
                        }
                      }}
                      style={styles.partGroupSelect}
                    >
                      <option value="">Choose a furniture part</option>
                      {editGroups.map((group, index) => (
                        <option key={`${group.label}_${index}`} value={index}>
                          {group.label} ({group.ids.length})
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div style={styles.helperTextMuted}>
                    Need to change a leg, shelf, or panel? Choose Edit Design,
                    then select the part you want to adjust.
                  </div>
                )}
              </section>

              {selectedGroup.length > 0 && sampleSelectedPart ? (
                <section
                  style={{
                    ...styles.sidebarSection,
                    ...(showCustomizeGuide && customizeGuideStep + 1 === 3
                      ? styles.customizeActiveSection
                      : {}),
                  }}
                >
                  <div style={styles.sectionRow}>
                    <label style={styles.label}>
                      {selectedEditGroup?.label ||
                        sampleSelectedPart?.label ||
                        "Selected Part"}
                      {selectedGroup.length > 1
                        ? ` (${selectedGroup.length} parts)`
                        : ""}
                    </label>

                    <button
                      type="button"
                      onClick={() => setSelectedCompIds([])}
                      style={styles.clearBtn}
                    >
                      Clear
                    </button>
                  </div>

                  {selectedEditGroup?.kind === "drawer" &&
                  selectedDrawerMetrics ? (
                    <div style={styles.helperTextMuted}>
                      Allowed size:{" "}
                      {convertMmToUnit(selectedDrawerMetrics.min.width, unit)}–
                      {convertMmToUnit(selectedDrawerMetrics.max.width, unit)} ×{" "}
                      {convertMmToUnit(selectedDrawerMetrics.min.height, unit)}–
                      {convertMmToUnit(selectedDrawerMetrics.max.height, unit)} ×{" "}
                      {convertMmToUnit(selectedDrawerMetrics.min.depth, unit)}–
                      {convertMmToUnit(selectedDrawerMetrics.max.depth, unit)}{" "}
                      {unit === "inches" ? "in" : unit}
                    </div>
                  ) : null}

                  {selectedShelfLimits ? (
                    <div style={styles.helperTextMuted}>
                      Adjustable shelf: Depth and Vertical Position are editable.
                      Width stays fitted to both side supports; Thickness is fixed.
                      Collisions and unsupported changes are blocked.
                    </div>
                  ) : null}
                  {selectedShelfLimits ? (
                    <div style={styles.inputGroup}>
                      <label style={styles.dimLabel}>Vertical Position ({unit})</label>
                      <input
                        type="number"
                        value={shelfYDraft}
                        min={convertMmToUnit(selectedShelfLimits.min.y, unit)}
                        max={convertMmToUnit(selectedShelfLimits.max.y, unit)}
                        onChange={(e) => {
                          setShelfYDraft(e.target.value);
                          setShelfYError("");
                        }}
                        onBlur={(e) => commitShelfVerticalPosition(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitShelfVerticalPosition(e.target.value);
                        }}
                        aria-invalid={Boolean(shelfYError)}
                        style={{...styles.input, ...(shelfYError ? styles.inputError : {})}}
                      />
                      {shelfYError ? (
                        <span role="alert" style={styles.fieldError}>{shelfYError}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {!canResizeSelectedPart ? (
                    <div style={styles.helperTextMuted}>
                      {selectedEditGroup?.kind === "drawer"
                        ? "Drawer selected, but its cabinet opening could not be detected safely."
                        : sampleSelectedPart?.locked
                          ? "This part is locked and cannot be resized."
                          : selectedGroup.some((part) => isCustomerDoorPreviewComponent(part) || isCustomerDoorPanelComponent(part))
                            ? "Door size is locked until safe cabinet limits are ready. You can still change the finish."
                          : selectedGroup.some(isCustomerCabinetStructuralPart)
                            ? "Cabinet frame part: size is protected. You can still change its finish."
                          : selectedGroup.some(isCustomerShelfStructure)
                            ? getCustomerShelfClassification(sampleSelectedPart) === "fixed"
                              ? "Fixed or structural shelf: size and position are protected. Finish customization remains available."
                              : getCustomerShelfClassification(sampleSelectedPart) === "adjustable"
                                ? "Adjustable shelf identified. Size and vertical position stay locked until cabinet boundaries and supports are verified."
                                : "Shelf adjustability is unverified. Size and position remain locked for safety."
                            : "This selection cannot be resized as one raw group."}
                    </div>
                  ) : null}

                  <div
                    className="wisdom-size-grid"
                    style={styles.dimensionGrid}
                  >
                    <div style={styles.inputGroup}>
                      <span style={styles.dimLabel}>
                        {getPartAxisLabels(sampleSelectedPart).width}
                      </span>
                      <input
                        type="number"
                        disabled={!canResizeSelectedPart}
                        min={
                          selectedEditGroup?.kind === "drawer"
                            ? convertMmToUnit(
                                selectedDrawerMetrics?.min?.width || 1,
                                unit,
                              )
                            : undefined
                        }
                        max={
                          selectedEditGroup?.kind === "drawer" &&
                          Number.isFinite(
                            Number(selectedDrawerMetrics?.max?.width),
                          )
                            ? convertMmToUnit(
                                selectedDrawerMetrics.max.width,
                                unit,
                              )
                            : undefined
                        }
                        value={partDrafts.width}
                        onChange={(e) => {
                          const value = e.target.value;

                          setPartDrafts((prev) => ({
                            ...prev,
                            width: value,
                          }));

                          setPartDimensionErrors((prev) => ({
                            ...prev,
                            width: getDimensionFieldError(value),
                          }));
                        }}
                        onBlur={(e) =>
                          commitPartDimension("width", e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            commitPartDimension("width", e.target.value);
                          }
                        }}
                        aria-invalid={Boolean(partDimensionErrors.width)}
                        aria-describedby={
                          partDimensionErrors.width
                            ? "customer-part-width-error"
                            : undefined
                        }
                        style={{
                          ...styles.input,
                          ...(partDimensionErrors.width
                            ? styles.inputError
                            : {}),
                        }}
                      />

                      {partDimensionErrors.width ? (
                        <span
                          id="customer-part-width-error"
                          role="alert"
                          style={styles.fieldError}
                        >
                          {partDimensionErrors.width}
                        </span>
                      ) : null}
                    </div>

                    <div style={styles.inputGroup}>
                      <span style={styles.dimLabel}>
                        {getPartAxisLabels(sampleSelectedPart).height}
                      </span>
                      <input
                        type="number"
                        disabled={!canResizeSelectedPart || Boolean(selectedShelfLimits)}
                        min={
                          selectedEditGroup?.kind === "drawer"
                            ? convertMmToUnit(
                                selectedDrawerMetrics?.min?.height || 1,
                                unit,
                              )
                            : undefined
                        }
                        max={
                          selectedEditGroup?.kind === "drawer" &&
                          Number.isFinite(
                            Number(selectedDrawerMetrics?.max?.height),
                          )
                            ? convertMmToUnit(
                                selectedDrawerMetrics.max.height,
                                unit,
                              )
                            : undefined
                        }
                        value={partDrafts.height}
                        onChange={(e) => {
                          const value = e.target.value;

                          setPartDrafts((prev) => ({
                            ...prev,
                            height: value,
                          }));

                          setPartDimensionErrors((prev) => ({
                            ...prev,
                            height: getDimensionFieldError(value),
                          }));
                        }}
                        onBlur={(e) =>
                          commitPartDimension("height", e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            commitPartDimension("height", e.target.value);
                          }
                        }}
                        aria-invalid={Boolean(partDimensionErrors.height)}
                        aria-describedby={
                          partDimensionErrors.height
                            ? "customer-part-height-error"
                            : undefined
                        }
                        style={{
                          ...styles.input,
                          ...(partDimensionErrors.height
                            ? styles.inputError
                            : {}),
                        }}
                      />

                      {partDimensionErrors.height ? (
                        <span
                          id="customer-part-height-error"
                          role="alert"
                          style={styles.fieldError}
                        >
                          {partDimensionErrors.height}
                        </span>
                      ) : null}
                    </div>

                    <div style={styles.inputGroup}>
                      <span style={styles.dimLabel}>
                        {getPartAxisLabels(sampleSelectedPart).depth}
                      </span>
                      <input
                        type="number"
                        disabled={!canResizeSelectedPart}
                        min={
                          selectedEditGroup?.kind === "drawer"
                            ? convertMmToUnit(
                                selectedDrawerMetrics?.min?.depth || 1,
                                unit,
                              )
                            : undefined
                        }
                        max={
                          selectedEditGroup?.kind === "drawer" &&
                          Number.isFinite(
                            Number(selectedDrawerMetrics?.max?.depth),
                          )
                            ? convertMmToUnit(
                                selectedDrawerMetrics.max.depth,
                                unit,
                              )
                            : undefined
                        }
                        value={partDrafts.depth}
                        onChange={(e) => {
                          const value = e.target.value;

                          setPartDrafts((prev) => ({
                            ...prev,
                            depth: value,
                          }));

                          setPartDimensionErrors((prev) => ({
                            ...prev,
                            depth: getDimensionFieldError(value),
                          }));
                        }}
                        onBlur={(e) =>
                          commitPartDimension("depth", e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            commitPartDimension("depth", e.target.value);
                          }
                        }}
                        aria-invalid={Boolean(partDimensionErrors.depth)}
                        aria-describedby={
                          partDimensionErrors.depth
                            ? "customer-part-depth-error"
                            : undefined
                        }
                        style={{
                          ...styles.input,
                          ...(partDimensionErrors.depth
                            ? styles.inputError
                            : {}),
                        }}
                      />

                      {partDimensionErrors.depth ? (
                        <span
                          id="customer-part-depth-error"
                          role="alert"
                          style={styles.fieldError}
                        >
                          {partDimensionErrors.depth}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : (
                <section
                  className="wisdom-furniture-size-section"
                  style={{
                    ...styles.sidebarSection,
                    ...styles.customizeSizeSection,
                    ...(showCustomizeGuide && customizeGuideStep + 1 === 2
                      ? styles.customizeActiveSection
                      : {}),
                  }}
                >
                  <div style={styles.sectionRow}>
                    <label style={styles.label}>
                      Furniture Size ({unit === "inches" ? "in" : unit})
                    </label>
                    <span style={styles.pill}>
                      {overallWardrobeSizeProtected
                        ? canSmartResizeWardrobeHeight && canSmartResizeWardrobeDepth
                          ? "Smart sizing"
                          : canSmartResizeWardrobeWidth
                            ? "Smart width"
                            : "Size protected"
                        : "Keeps proportions"}
                    </span>
                  </div>

                  {overallWardrobeSizeProtected ? (
                    <div style={styles.helperTextMuted} role="status">
                      {canSmartResizeWardrobeWidth
                        ? canSmartResizeWardrobeHeight && canSmartResizeWardrobeDepth
                          ? `Width: ${wardrobeWidthSupport.minWidth}-${wardrobeWidthSupport.maxWidth} mm. Height: ${wardrobeHeightDepthSupport.minHeight}-${wardrobeHeightDepthSupport.maxHeight} mm. Depth: ${wardrobeHeightDepthSupport.minDepth}-${wardrobeHeightDepthSupport.maxDepth} mm. Enter one size, review the preview, then press Apply. Board thickness, edited drawer sizes, and finishes stay unchanged. These limits are provisional; the shop must review final sizes.`
                          : `Width can change from ${wardrobeWidthSupport.minWidth} to ${wardrobeWidthSupport.maxWidth} mm. Preview the bay sizes and press Apply Width. Board thickness, drawer dimensions, and custom finishes stay unchanged. Height and Depth stay locked for this layout. Final sizes need shop review.`
                        : "Overall wardrobe size is protected because this layout is not verified for safe resizing. Supported drawers, shelves, and finishes can still be edited."}
                    </div>
                  ) : null}

                  <div
                    className="wisdom-size-grid"
                    style={styles.dimensionGrid}
                  >
                    <div style={styles.inputGroup}>
                      <span style={styles.dimLabel}>Width</span>
                      <input
                        type="number"
                        value={overallDrafts.width}
                        disabled={
                          !isCustomizable ||
                          readOnly ||
                          (overallWardrobeSizeProtected && !canSmartResizeWardrobeWidth)
                        }
                        onChange={(e) =>
                          handleOverallDraftChange("width", e.target.value)
                        }
                        onBlur={() => commitOverallDimension("width")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (overallWardrobeSizeProtected) e.preventDefault();
                            commitOverallDimension("width");
                          }
                        }}
                        aria-invalid={Boolean(
                          overallDimensionErrors.width ||
                            (canSmartResizeWardrobeWidth &&
                              wardrobeWidthPreview &&
                              !wardrobeWidthPreview.ok),
                        )}
                        aria-describedby={
                          overallDimensionErrors.width ||
                          (canSmartResizeWardrobeWidth &&
                            wardrobeWidthPreview &&
                            !wardrobeWidthPreview.ok)
                            ? "customer-overall-width-error"
                            : undefined
                        }
                        style={{
                          ...styles.input,
                          ...(overallDimensionErrors.width
                            ? styles.inputError
                            : {}),
                        }}
                      />

                    </div>

                    <div style={styles.inputGroup}>
                      <span style={styles.dimLabel}>Height</span>
                      <input
                        type="number"
                        value={overallDrafts.height}
                        disabled={
                          !isCustomizable || readOnly ||
                          (overallWardrobeSizeProtected && !canSmartResizeWardrobeHeight)
                        }
                        onChange={(e) =>
                          handleOverallDraftChange("height", e.target.value)
                        }
                        onBlur={() => commitOverallDimension("height")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (overallWardrobeSizeProtected) e.preventDefault();
                            commitOverallDimension("height");
                          }
                        }}
                        aria-invalid={Boolean(
                          overallDimensionErrors.height ||
                          (canSmartResizeWardrobeHeight &&
                            wardrobeHeightPreview && !wardrobeHeightPreview.ok),
                        )}
                        aria-describedby={
                          overallDimensionErrors.height ||
                          (canSmartResizeWardrobeHeight &&
                            wardrobeHeightPreview && !wardrobeHeightPreview.ok)
                            ? "customer-overall-height-error"
                            : undefined
                        }
                        style={{
                          ...styles.input,
                          ...(overallDimensionErrors.height
                            ? styles.inputError
                            : {}),
                        }}
                      />

                    </div>

                    <div style={styles.inputGroup}>
                      <span style={styles.dimLabel}>Depth</span>
                      <input
                        type="number"
                        value={overallDrafts.depth}
                        disabled={
                          !isCustomizable || readOnly ||
                          (overallWardrobeSizeProtected && !canSmartResizeWardrobeDepth)
                        }
                        onChange={(e) =>
                          handleOverallDraftChange("depth", e.target.value)
                        }
                        onBlur={() => commitOverallDimension("depth")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (overallWardrobeSizeProtected) e.preventDefault();
                            commitOverallDimension("depth");
                          }
                        }}
                        aria-invalid={Boolean(
                          overallDimensionErrors.depth ||
                          (canSmartResizeWardrobeDepth &&
                            wardrobeDepthPreview && !wardrobeDepthPreview.ok),
                        )}
                        aria-describedby={
                          overallDimensionErrors.depth ||
                          (canSmartResizeWardrobeDepth &&
                            wardrobeDepthPreview && !wardrobeDepthPreview.ok)
                            ? "customer-overall-depth-error"
                            : undefined
                        }
                        style={{
                          ...styles.input,
                          ...(overallDimensionErrors.depth
                            ? styles.inputError
                            : {}),
                        }}
                      />

                    </div>
                  </div>

                  {(overallDimensionErrors.width ||
                    (canSmartResizeWardrobeWidth &&
                      wardrobeWidthPreview &&
                      !wardrobeWidthPreview.ok)) ? (
                    <div
                      id="customer-overall-width-error"
                      role="alert"
                      style={{
                        boxSizing: "border-box",
                        width: "100%",
                        marginTop: 6,
                        padding: "8px 10px",
                        border: "1px solid #fecaca",
                        background: "#fff5f5",
                        color: "#b91c1c",
                        fontSize: 11,
                        lineHeight: 1.4,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {overallDimensionErrors.width ||
                        wardrobeWidthPreview?.error}
                    </div>
                  ) : null}

                  {(["height", "depth"]).map((axis) => {
                    const preview = axis === "height"
                      ? wardrobeHeightPreview : wardrobeDepthPreview;
                    const enabled = axis === "height"
                      ? canSmartResizeWardrobeHeight : canSmartResizeWardrobeDepth;
                    const message = overallDimensionErrors[axis] ||
                      (enabled && preview && !preview.ok ? preview.error : "");
                    return message ? (
                      <div
                        key={axis}
                        id={`customer-overall-${axis}-error`}
                        role="alert"
                        style={{
                          boxSizing: "border-box",
                          width: "100%",
                          marginTop: 6,
                          padding: "8px 10px",
                          border: "1px solid #fecaca",
                          background: "#fff5f5",
                          color: "#b91c1c",
                          fontSize: 11,
                          lineHeight: 1.4,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {message}
                      </div>
                    ) : null;
                  })}

                  {canSmartResizeWardrobeWidth && wardrobeWidthPreview ? (
                    <div style={{ marginTop: 8, display: "grid", gap: 7 }}>
                      {wardrobeWidthPreview.ok ? (
                        <>
                          <div style={styles.helperTextMuted} role="status">
                            Width preview: {overallBounds.width_mm} mm to{" "}
                            {wardrobeWidthPreview.width} mm. Bay 1:{" "}
                            {wardrobeWidthSupport.openings.bay1} to{" "}
                            {wardrobeWidthPreview.openings.bay1} mm. Bay 4:{" "}
                            {wardrobeWidthSupport.openings.bay4} to{" "}
                            {wardrobeWidthPreview.openings.bay4} mm.
                            Bay 2 and Bay 3, including drawers, keep their sizes.
                            The 3D furniture updates only when you press Apply Width.
                          </div>
                          <button
                            type="button"
                            onClick={applySmartWardrobeWidth}
                            disabled={!isCustomizable || readOnly}
                            style={{
                              background: "#111111",
                              color: "#ffffff",
                              border: "1px solid #111111",
                              borderRadius: 0,
                              padding: "10px 12px",
                              fontFamily: "inherit",
                              fontWeight: 700,
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            Apply Width
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {canSmartResizeWardrobeHeight && wardrobeHeightPreview?.ok ? (
                    <div style={{ marginTop: 8, display: "grid", gap: 7 }}>
                      <div style={styles.helperTextMuted} role="status">
                        Height preview: {overallBounds.height_mm} mm to{" "}
                        {wardrobeHeightPreview.height} mm. The base shelves and
                        frame will move together. Drawers, upper shelves, and
                        their wood finishes stay unchanged.
                      </div>
                      <button
                        type="button"
                        onClick={() => applySmartWardrobeHeightDepth("height")}
                        disabled={!isCustomizable || readOnly}
                        style={{
                          background: "#111111", color: "#ffffff",
                          border: "1px solid #111111", borderRadius: 0,
                          padding: "10px 12px", fontFamily: "inherit",
                          fontWeight: 700, fontSize: 11, cursor: "pointer",
                        }}
                      >
                        Apply Height
                      </button>
                    </div>
                  ) : null}

                  {canSmartResizeWardrobeDepth && wardrobeDepthPreview?.ok ? (
                    <div style={{ marginTop: 8, display: "grid", gap: 7 }}>
                      <div style={styles.helperTextMuted} role="status">
                        Depth preview: {overallBounds.depth_mm} mm to{" "}
                        {wardrobeDepthPreview.depth} mm. The cabinet panels
                        and standard shelves adjust. Drawers move as complete
                        assemblies, keeping their customized depths and finishes.
                      </div>
                      <button
                        type="button"
                        onClick={() => applySmartWardrobeHeightDepth("depth")}
                        disabled={!isCustomizable || readOnly}
                        style={{
                          background: "#111111", color: "#ffffff",
                          border: "1px solid #111111", borderRadius: 0,
                          padding: "10px 12px", fontFamily: "inherit",
                          fontWeight: 700, fontSize: 11, cursor: "pointer",
                        }}
                      >
                        Apply Depth
                      </button>
                    </div>
                  ) : null}
                </section>
              )}

              <section
                className="wisdom-legacy-finish-editor"
                style={{
                  ...styles.sidebarSection,
                  ...styles.customizeFinishSection,
                  ...(readOnly || !editable.finish_color
                    ? styles.sidebarSectionDisabled
                    : {}),
                  ...(showCustomizeGuide && customizeGuideStep + 1 === 4
                    ? styles.customizeActiveSection
                    : {}),
                }}
              >
                <div style={styles.sectionRow}>
                  <label style={styles.label}>Wood Finish</label>
                  {selectedGroup.length > 0 ? (
                    <span style={styles.pill}>Applies to selection</span>
                  ) : null}
                </div>

                <div style={styles.inputGroup}>
                  <span style={styles.dimLabel}>Wood Finish</span>
                  <div ref={finishMenuRef} style={styles.finishDropdown}>
                    <button
                      type="button"
                      disabled={readOnly || !editable.finish_color}
                      aria-haspopup="listbox"
                      aria-expanded={finishMenuOpen}
                      onClick={() => setFinishMenuOpen((open) => !open)}
                      style={{
                        ...styles.finishSelectButton,
                        ...(readOnly || !editable.finish_color
                          ? styles.finishSelectButtonDisabled
                          : {}),
                      }}
                    >
                      <span style={styles.finishOptionContent}>
                        <span
                          aria-hidden="true"
                          style={{
                            ...styles.finishSwatch,
                            background:
                              activeWoodFinish?.front ||
                              activeWoodFinish?.carcass ||
                              "#ffffff",
                          }}
                        />
                        <span style={styles.finishOptionLabel}>
                          {activeWoodFinish?.label || "Original"}
                        </span>
                      </span>

                      <span style={styles.finishSelectChevron}>v</span>
                    </button>

                    {finishMenuOpen ? (
                      <div style={styles.finishMenu} role="listbox">
                        <button
                          type="button"
                          role="option"
                          aria-selected={!activeFinishId}
                          onClick={() => {
                            handleFinishChange("");
                            setFinishMenuOpen(false);
                          }}
                          style={{
                            ...styles.finishMenuItem,
                            ...(!activeFinishId
                              ? styles.finishMenuItemActive
                              : {}),
                          }}
                        >
                          <span style={styles.finishOptionContent}>
                            <span
                              aria-hidden="true"
                              style={{
                                ...styles.finishSwatch,
                                ...styles.finishSwatchOriginal,
                              }}
                            />
                            <span style={styles.finishOptionLabel}>
                              Original
                            </span>
                          </span>
                        </button>

                        {WOOD_FINISHES?.map((finish) => (
                          <button
                            key={finish.id}
                            type="button"
                            role="option"
                            aria-selected={activeFinishId === finish.id}
                            onClick={() => {
                              handleFinishChange(finish.id);
                              setFinishMenuOpen(false);
                            }}
                            style={{
                              ...styles.finishMenuItem,
                              ...(activeFinishId === finish.id
                                ? styles.finishMenuItemActive
                                : {}),
                            }}
                          >
                            <span style={styles.finishOptionContent}>
                              <span
                                aria-hidden="true"
                                style={{
                                  ...styles.finishSwatch,
                                  background:
                                    finish.front ||
                                    finish.carcass ||
                                    finish.inside ||
                                    "#dddddd",
                                }}
                              />
                              <span style={styles.finishOptionLabel}>
                                {finish.label}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section
                className="wisdom-human-size-section"
                style={{
                  ...styles.sidebarSection,
                  ...styles.customizeHumanSection,
                }}
              >
                <div style={styles.sectionRow}>
                  <label style={styles.label}>Human Size Reference</label>

                  <label style={styles.inlineCheck}>
                    <input
                      type="checkbox"
                      checked={showPerson}
                      onChange={(e) => setShowPerson(e.target.checked)}
                    />
                    <span>Show</span>
                  </label>
                </div>

                {showPerson ? (
                  <div style={styles.inputGroup}>
                    <span style={styles.dimLabel}>
                      Height ({unit === "inches" ? "in" : unit})
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min={convertMmToUnit(HUMAN_REFERENCE_MIN_HEIGHT_MM, unit)}
                      max={convertMmToUnit(HUMAN_REFERENCE_MAX_HEIGHT_MM, unit)}
                      value={personHeightDraft}
                      aria-invalid={Boolean(personHeightError)}
                      aria-describedby={
                        personHeightError
                          ? "customer-person-height-error"
                          : undefined
                      }
                      onChange={(e) => {
                        const value = e.target.value;

                        setPersonHeightDraft(value);

                        const errorMessage = getDimensionFieldError(value, {
                          minMm: HUMAN_REFERENCE_MIN_HEIGHT_MM,
                          maxMm: HUMAN_REFERENCE_MAX_HEIGHT_MM,
                          label: "Height",
                        });

                        setPersonHeightError(errorMessage);

                        if (!errorMessage) {
                          setPersonHeightMm(convertUnitToMm(value, unit));
                        }
                      }}
                      onBlur={() => {
                        const errorMessage = getDimensionFieldError(
                          personHeightDraft,
                          {
                            minMm: HUMAN_REFERENCE_MIN_HEIGHT_MM,
                            maxMm: HUMAN_REFERENCE_MAX_HEIGHT_MM,
                            label: "Height",
                          },
                        );

                        if (errorMessage) {
                          setPersonHeightError(errorMessage);
                          return;
                        }

                        const normalized = clampNumber(
                          convertUnitToMm(personHeightDraft, unit),
                          HUMAN_REFERENCE_MIN_HEIGHT_MM,
                          HUMAN_REFERENCE_MAX_HEIGHT_MM,
                        );

                        setPersonHeightMm(normalized);
                        setPersonHeightDraft(convertMmToUnit(normalized, unit));
                        setPersonHeightError("");
                      }}
                      style={{
                        ...styles.input,
                        ...(personHeightError ? styles.inputError : {}),
                      }}
                    />

                    {personHeightError ? (
                      <span
                        id="customer-person-height-error"
                        role="alert"
                        style={styles.fieldError}
                      >
                        {personHeightError}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>

            {!readOnly ? (
              <div
                className={
                  "wisdom-order-footer" + (requestDetailsOpen ? " is-open" : "")
                }
                style={{
                  ...styles.sidebarFooter,
                  ...(showCustomizeGuide &&
                  (customizeGuideStep + 1 === 5 || customizeGuideStep + 1 === 6)
                    ? styles.customizeActiveFooter
                    : {}),
                }}
              >
                <OversizedDeliveryWarning
                  assessment={deliveryAssessment}
                  compact
                />

                <button
                  type="button"
                  className="wisdom-request-details-toggle"
                  onClick={() => setRequestDetailsOpen((open) => !open)}
                  aria-expanded={requestDetailsOpen}
                >
                  <span style={styles.requestDetailsToggleTitle}>
                    Order Details
                  </span>

                  <span
                    aria-hidden="true"
                    style={styles.requestDetailsToggleIcon}
                  >
                    {requestDetailsOpen ? "−" : "+"}
                  </span>
                </button>

                <div
                  className="wisdom-order-details-content"
                  style={{
                    ...styles.footerHeader,
                    marginTop: 0,
                    marginBottom: -4,
                  }}
                >
                  <div>
                    <div style={styles.footerTitle}>Quantity</div>
                  </div>

                  <div style={styles.qtyBox}>
                    <button
                      type="button"
                      disabled={!editable.quantity}
                      onClick={() => {
                        setCustomizeProgressStep((current) =>
                          Math.max(current, 5),
                        );
                        setQuantity((prev) => Math.max(1, prev - 1));
                        showCustomizeFeedback("Quantity updated.");
                      }}
                      style={styles.qtyBtn}
                    >
                      −
                    </button>

                    <strong style={styles.qtyValue}>{quantity}</strong>

                    <button
                      type="button"
                      disabled={
                        !editable.quantity || quantity >= MAX_CUSTOM_QUANTITY
                      }
                      onClick={() => {
                        if (quantity >= MAX_CUSTOM_QUANTITY) return;

                        setCustomizeProgressStep((current) =>
                          Math.max(current, 5),
                        );

                        setQuantity((prev) =>
                          Math.min(MAX_CUSTOM_QUANTITY, Math.max(1, prev + 1)),
                        );

                        showCustomizeFeedback("Quantity updated.");
                      }}
                      style={styles.qtyBtn}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div
                  className="wisdom-order-details-content"
                  style={styles.footerField}
                >
                  <div style={styles.uploadHeader}>
                    <label style={styles.footerLabel}>Reference photos</label>
                    <span style={styles.fieldPurposeText}>
                      Optional. Add photos that show the style, color, or
                      details you want.
                    </span>
                  </div>

                  <label
                    style={{
                      ...styles.uploadDropZone,
                      ...(isReferenceDropActive
                        ? styles.uploadDropZoneActive
                        : {}),
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      referenceDropDepthRef.current += 1;
                      setIsReferenceDropActive(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (event.dataTransfer) {
                        event.dataTransfer.dropEffect = "copy";
                      }
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      referenceDropDepthRef.current = Math.max(
                        0,
                        referenceDropDepthRef.current - 1,
                      );
                      if (referenceDropDepthRef.current === 0) {
                        setIsReferenceDropActive(false);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();

                      referenceDropDepthRef.current = 0;
                      setIsReferenceDropActive(false);

                      const droppedFiles = event.dataTransfer?.files;

                      if (!droppedFiles?.length) return;

                      setCustomizeProgressStep((current) =>
                        Math.max(current, 5),
                      );

                      onPickReferencePhotos?.({
                        target: {
                          files: droppedFiles,
                          value: "",
                        },
                      });

                      showCustomizeFeedback(
                        droppedFiles.length === 1
                          ? "Photo selected."
                          : "Photos selected.",
                      );
                    }}
                  >
                    <Upload size={19} strokeWidth={1.7} aria-hidden="true" />

                    <span style={styles.uploadDropTitle}>Drag photos here</span>

                    <span style={styles.uploadDropOr}>or</span>

                    <span style={styles.uploadBrowseText}>Browse files</span>

                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      multiple
                      hidden
                      onChange={(event) => {
                        setCustomizeProgressStep((current) =>
                          Math.max(current, 5),
                        );
                        onPickReferencePhotos?.(event);
                        if (event.target.files?.length) {
                          showCustomizeFeedback(
                            event.target.files.length === 1
                              ? "Photo selected."
                              : "Photos selected.",
                          );
                        }
                      }}
                    />
                  </label>

                  <span style={styles.uploadHint}>
                    JPG, JPEG, PNG, WEBP • Up to 5 photos • 5MB each
                  </span>

                  {uploadError ? (
                    <div style={styles.uploadError}>{uploadError}</div>
                  ) : null}

                  {referencePhotos?.length ? (
                    <div style={styles.photoGrid}>
                      {referencePhotos.map((photo) => (
                        <div key={photo.id} style={styles.photoCard}>
                          <div style={styles.photoThumb}>
                            <img
                              src={photo.data_url}
                              alt={photo.name}
                              style={styles.photoThumbImg}
                            />
                          </div>

                          <div style={styles.photoMeta}>
                            <div style={styles.photoName}>{photo.name}</div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemoveReferencePhoto?.(photo.id)}
                            style={styles.photoRemove}
                            aria-label={`Remove ${photo.name}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div
                  className="wisdom-order-details-content"
                  style={{
                    ...styles.footerField,
                    ...styles.notesFooterField,
                  }}
                >
                  <label style={styles.footerLabel}>{commentsLabel}</label>
                  <span style={styles.fieldPurposeText}>
                    Optional. Add special requests or room details.
                  </span>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={comments}
                    disabled={!editable.comments}
                    onChange={(e) => {
                      setComments(e.target.value);
                      if (String(e.target.value || "").trim()) {
                        setCustomizeProgressStep((current) =>
                          Math.max(current, 5),
                        );
                      }
                    }}
                    placeholder={commentsPlaceholder}
                    style={styles.textarea}
                  />
                </div>

                <button
                  type="button"
                  className="wisdom-add-to-cart-btn"
                  onClick={handleApply}
                  style={styles.applyBtn}
                >
                  {applyLabel}
                </button>
              </div>
            ) : null}
          </aside>
        )}
      </div>

      <style>{`
        @media (max-width: 960px) {
          .cust-mobile-hide {
            display: none !important;
          }
          .cust-mobile-controls {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 10px 12px !important;
          }
          .cust-mobile-control-row {
            grid-template-columns: 1fr !important;
            gap: 0 !important;
            display: block !important;
          }
          .cust-mobile-guide-dock {
            padding-top: 0 !important;
            margin: 0 !important;
            justify-items: end !important;
          }
          /* Anchors the popup card safely to the right edge so it doesn't spill off screen */
          .cust-mobile-guide-card {
            left: auto !important;
            right: 0 !important;
            width: min(340px, calc(100vw - 24px)) !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    display: "grid",
    gap: 8,
    minHeight: 0,
    fontFamily: "Montserrat, sans-serif",
  },

  topBar: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 12px",
    border: "1px solid #d9dee4",
    background: "#ffffff",
  },

  topBarMeta: {
    display: "grid",
    gap: 2,
  },

  topBarEyebrow: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#6b7280",
  },

  topBarTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#111111",
  },

  topBarActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  customizeProgressArea: {
    minWidth: 0,
    display: "grid",
    gap: 3,
    padding: 0,
    border: "none",
    alignSelf: "center",
  },

  customizeProgressHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },

  customizeProgressEyebrow: {
    fontSize: 9,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: "0.055em",
    textTransform: "uppercase",
    color: "#6b7280",
  },

  customizeProgressSummary: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 1.25,
    fontWeight: 700,
    color: "#111111",
  },

  customizeGuideHelpBtn: {
    minHeight: 30,
    padding: "0 12px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#111111",
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },

  customizeStepsScroll: {
    minWidth: 0,
    overflowX: "auto",
    overflowY: "hidden",
    paddingBottom: 1,
  },

  customizeSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(86px, 1fr))",
    minWidth: 580,
    gap: 0,
  },

  customizeStep: {
    minWidth: 0,
    display: "grid",
    gap: 5,
    alignContent: "start",
  },

  customizeStepRail: {
    display: "flex",
    alignItems: "center",
    minWidth: 0,
  },

  customizeStepBadge: {
    width: 28,
    height: 28,
    flex: "0 0 28px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #cfd3d8",
    borderRadius: 0,
    background: "#ffffff",
    color: "#8a9098",
    fontSize: 11,
    lineHeight: 1,
    fontWeight: 700,
    boxSizing: "border-box",
  },

  customizeStepBadgeComplete: {
    borderColor: "#111111",
    background: "#111111",
    color: "#ffffff",
  },

  customizeStepBadgeActive: {
    border: "1px solid #111111",
    background: "#111111",
    color: "#ffffff",
  },

  customizeStepLine: {
    height: 1,
    flex: 1,
    minWidth: 18,
    background: "#d9dde2",
  },

  customizeStepLineComplete: {
    background: "#111111",
  },

  customizeStepLabel: {
    paddingRight: 8,
    fontSize: 10,
    lineHeight: 1.25,
    fontWeight: 500,
    color: "#969ca4",
    whiteSpace: "nowrap",
  },

  customizeStepLabelReached: {
    color: "#111111",
    fontWeight: 700,
  },

  compactGroup: {
    display: "flex",
    gap: 6,
  },

  toolBtn: {
    height: 32,
    padding: "0 12px",
    borderRadius: 0,
    border: "1px solid #111111",
    background: "#ffffff",
    color: "#111111",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },

  toolBtnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },

  unitToggleGroup: {
    display: "flex",
    border: "1px solid #111111",
    background: "#ffffff",
  },

  unitBtn: {
    minWidth: 40,
    height: 32,
    padding: "0 10px",
    border: "none",
    background: "#ffffff",
    color: "#111111",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },

  unitBtnDivider: {
    borderRight: "1px solid #d9d9d9",
  },

  unitBtnActive: {
    background: "#111111",
    color: "#ffffff",
    fontWeight: 700,
  },

  viewerShell: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 340px",
    height: "clamp(500px, 66vh, 600px)",
    minHeight: 500,
    border: "1px solid #d9dee4",
    background: "#ffffff",
    overflow: "hidden",
  },

  customizeViewerShell: {
    gridTemplateColumns: "minmax(0, 1fr) 350px",
    height: "min(735px, calc(100vh - 178px))",
    minHeight: 0,
  },

  rightShiftFillSpaceV10: {
    minHeight: 0,
    boxSizing: "border-box",
  },

  rightShiftMoreV10_1: {
    minHeight: 0,
    boxSizing: "border-box",
  },

  noScrollDesktopFit: {
    boxSizing: "border-box",
  },

  canvasWrap: {
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    background: "#f7f7f7",
  },

  customizeCanvasWrap: {
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    overflow: "visible",
  },

  customizeViewerControls: {
    minWidth: 0,
    position: "relative",
    zIndex: 20,
    display: "grid",
    gap: 8,
    padding: "8px 12px 9px",
    borderBottom: "none",
    background: "#f7f7f7",
    boxSizing: "border-box",
  },

  customizeViewerControlRow: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    alignItems: "start",
    gap: 14,
  },

  customizeGuideDock: {
    minWidth: 0,
    position: "relative",
    display: "grid",
    justifyItems: "start",
    gap: 8,
    paddingTop: 1,
  },

  customizeCanvasStage: {
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
    background: "#f7f7f7",
  },

  canvasContainer: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    backgroundColor: "#f7f7f7",
  },

  cameraToolbar: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 10,
    display: "grid",
    gridTemplateColumns: "repeat(6, auto)",
    gap: 0,
    width: "max-content",
    border: "none",
    background: "transparent",
    boxSizing: "border-box",
  },

  cameraToolbarInline: {
    position: "static",
    top: "auto",
    left: "auto",
    zIndex: 1,
    alignSelf: "center",
  },

  cameraBtn: {
    minWidth: 48,
    height: 34,
    padding: "0 12px",
    border: "1px solid #cfcfcf",
    borderRight: "none",
    background: "#ffffff",
    color: "#111111",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    boxSizing: "border-box",
  },

  cameraBtnActive: {
    background: "#111111",
    color: "#ffffff",
    fontWeight: 700,
  },

  cameraBtnLast: {
    borderRight: "1px solid #cfcfcf",
  },

  floatingLabel: {
    position: "absolute",
    left: 0,
    top: 0,
    background: "#ffffff",
    color: "#111111",
    padding: "4px 8px",
    borderRadius: 0,
    fontSize: "11px",
    fontWeight: "700",
    border: "1px solid #111111",
    pointerEvents: "none",
    transform: "translate3d(0, 0, 0) translate(-50%, -50%)",
    transformOrigin: "50% 50%",
    willChange: "transform",
    backfaceVisibility: "hidden",
    display: "none",
    whiteSpace: "nowrap",
    zIndex: 10,
  },

  viewSidebarScroll: {
    minHeight: 0,
    overflowY: "auto",
    padding: "18px 16px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  viewDetailsCard: {
    border: "none",
    background: "transparent",
    padding: 0,
  },

  viewDetailsTitle: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.3,
    fontWeight: 700,
    color: "#111111",
  },

  viewDetailsNote: {
    margin: "6px 0 0",
    fontSize: 13,
    lineHeight: 1.55,
    fontWeight: 400,
    color: "#6b7280",
  },

  viewDetailsDivider: {
    height: 1,
    background: "#e5e7eb",
    margin: "15px 0",
  },

  viewDetailsGroup: {
    display: "grid",
    gap: 0,
  },

  viewDetailsGroupTitle: {
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 600,
    color: "#333333",
  },

  viewDetailRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    minHeight: 40,
    borderBottom: "1px solid #eeeeee",
  },

  viewDetailRowLast: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    minHeight: 40,
  },

  viewDetailLabel: {
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 400,
    color: "#6b7280",
  },

  viewDetailValue: {
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 600,
    color: "#111111",
    textAlign: "right",
  },

  viewCustomizeBtn: {
    width: "100%",
    minHeight: 44,
    padding: "0 16px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#111111",
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 1,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  sidebar: {
    minWidth: 0,
    minHeight: 0,
    borderLeft: "1px solid #d9dee4",
    backgroundColor: "#ffffff",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    overflow: "hidden",
  },

  customizeSidebarScrollable: {
    display: "block",
    minHeight: 0,
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehaviorY: "contain",
    scrollbarGutter: "stable",
  },

  fullHeightNoScrollLayout: {
    minHeight: 0,
    height: "100%",
  },

  sidebarScroll: {
    minHeight: 0,
    overflow: "visible",
    padding: "7px 8px 6px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridAutoRows: "max-content",
    alignContent: "start",
    gap: 6,
  },

  uniformControlWidth: {
    width: "100%",
    boxSizing: "border-box",
  },

  customizeSidebarSectionWide: {
    gridColumn: "1 / -1",
  },

  customizeIntroSection: {
    gridColumn: "1 / -1",
    order: 1,
    border: "none",
    background: "transparent",
    padding: "0 1px 2px",
  },

  customizeCurrentStepCard: {
    display: "grid",
    gap: 4,
    marginTop: 3,
    padding: "7px 8px",
    border: "none",
    background: "#f5f5f5",
    boxShadow: "inset 3px 0 0 #111111",
  },

  customizeCurrentStepMeta: {
    fontSize: 8.75,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: "0.055em",
    color: "#6b7280",
  },

  customizeCurrentStepTitle: {
    fontSize: 12,
    lineHeight: 1.25,
    fontWeight: 700,
    color: "#111111",
  },

  customizeCurrentStepInstruction: {
    fontSize: 10.25,
    lineHeight: 1.45,
    fontWeight: 400,
    color: "#4b5563",
  },

  customizeFeedback: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
    fontSize: 9.75,
    lineHeight: 1.3,
    fontWeight: 600,
    color: "#111111",
  },

  customizeFeedbackIcon: {
    width: 15,
    height: 15,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 15px",
    background: "#111111",
    color: "#ffffff",
    fontSize: 8,
    fontWeight: 700,
  },

  customizeGuideCard: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    zIndex: 40,
    width: "min(430px, calc(100vw - 80px))",
    display: "grid",
    gap: 8,
    marginTop: 0,
    padding: "10px 12px",
    border: "1px solid #111111",
    background: "#ffffff",
    boxSizing: "border-box",
  },

  customizeGuideCardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  customizeGuideStepMeta: {
    fontSize: 9,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "#6b7280",
  },

  customizeGuideTitle: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 1.3,
    fontWeight: 700,
    color: "#111111",
  },

  customizeGuideInstruction: {
    fontSize: 12,
    lineHeight: 1.55,
    fontWeight: 400,
    color: "#374151",
  },

  customizeGuideSkipBtn: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "#6b7280",
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },

  customizeGuideActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },

  customizeGuideSecondaryBtn: {
    minHeight: 29,
    padding: "0 10px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  customizeGuidePrimaryBtn: {
    minHeight: 29,
    padding: "0 12px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#111111",
    color: "#ffffff",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  customizeSizeSection: {
    gridColumn: "1 / -1",
    order: 2,
  },

  customizeFinishSection: {
    gridColumn: "1 / -1",
    order: 3,
  },

  customizeOptionalToolsHeading: {
    gridColumn: "1 / -1",
    order: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "1px 1px 0",
    minHeight: 18,
  },

  customizeOptionalToolsTitle: {
    fontSize: 12,
    lineHeight: 1.3,
    fontWeight: 700,
    color: "#111111",
  },

  customizeOptionalToolsNote: {
    fontSize: 10,
    lineHeight: 1.3,
    fontWeight: 400,
    color: "#7a7f87",
  },

  customizeOptionalSection: {
    order: 5,
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    minHeight: 72,
    height: "100%",
  },

  customizeHumanSection: {
    order: 6,
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    minHeight: 72,
    height: "100%",
  },

  sidebarSection: {
    display: "grid",
    gap: 4,
    padding: "7px",
    border: "1px solid #e2e5e9",
    background: "#ffffff",
    alignContent: "start",
    boxSizing: "border-box",
  },

  sidebarSectionActive: {
    border: "1px solid #111111",
  },

  customizeActiveSection: {
    border: "2px solid #111111",
    background: "#ffffff",
    boxShadow: "none",
  },

  sidebarSectionDisabled: {
    opacity: 0.55,
    pointerEvents: "none",
  },

  sidebarSectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  sidebarSectionTitle: {
    fontSize: 13,
    lineHeight: 1.25,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "none",
    color: "#111111",
  },

  sidebarSectionNote: {
    margin: 0,
    fontSize: 10.25,
    lineHeight: 1.3,
    fontWeight: 400,
    color: "#6b7280",
  },

  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  },

  metricCard: {
    padding: "8px 8px 10px",
    border: "1px solid #e5e7eb",
    background: "#fafafa",
    display: "grid",
    gap: 4,
  },

  metricLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#6b7280",
  },

  metricValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "#111111",
  },

  sectionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  label: {
    fontSize: 11.5,
    lineHeight: 1.25,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "none",
    color: "#111111",
  },

  inlineCheck: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#444444",
    cursor: "pointer",
  },

  inlineCheckActive: {
    color: "#111111",
    fontWeight: 700,
  },

  editDesignBtn: {
    minHeight: 28,
    padding: "0 9px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 9.5,
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: "0.02em",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },

  editDesignBtnActive: {
    background: "#111111",
    color: "#ffffff",
  },

  helperText: {
    fontSize: 10.5,
    lineHeight: 1.35,
    color: "#111111",
    border: "1px dashed #cbd5e1",
    background: "#fafafa",
    padding: "6px 7px",
  },

  helperTextMuted: {
    fontSize: 9.75,
    lineHeight: 1.28,
    fontWeight: 400,
    color: "#6b7280",
    background: "transparent",
    border: "none",
    padding: 0,
  },

  partGroupSelect: {
    width: "100%",
    height: 34,
    minHeight: 34,
    padding: "0 9px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 11,
    fontWeight: 600,
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
  },

  miniBtn: {
    padding: "6px 8px",
    fontSize: 11,
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #d9d9d9",
    borderRadius: 0,
    cursor: "pointer",
    fontWeight: 700,
  },

  miniBtnActive: {
    background: "#111111",
    color: "#ffffff",
    borderColor: "#111111",
  },

  clearBtn: {
    height: 28,
    padding: "0 10px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },

  pill: {
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: "0.01em",
    textTransform: "none",
    color: "#4b5563",
    background: "#f3f4f6",
    padding: "4px 6px",
    whiteSpace: "nowrap",
  },

  dimensionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 5,
    alignItems: "start",
  },

  inputGroup: {
    display: "grid",
    gap: 3,
    position: "relative",
    paddingBottom: 26, // Increased to safely fit up to two lines of wrapped text
  },

  dimLabel: {
    fontSize: 10.5,
    color: "#6b7280",
    display: "block",
    fontWeight: 600,
    letterSpacing: "0.01em",
    textTransform: "none",
  },

  input: {
    width: "100%",
    height: 34,
    minHeight: 34,
    padding: "0 9px",
    borderRadius: 0,
    border: "1px solid #111111",
    fontSize: 11.5,
    outline: "none",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#111111",
  },

  inputError: {
    border: "1px solid #dc2626",
    boxShadow: "0 0 0 1px #dc2626",
  },

  fieldError: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: "100%", // Keep it contained within its column
    margin: 0,
    fontSize: 10, // Slightly smaller to help it fit
    lineHeight: 1.15,
    fontWeight: 500,
    color: "#b91c1c",
    whiteSpace: "normal", // Allows the text to wrap
    wordWrap: "break-word",
  },

  finishDropdown: {
    position: "relative",
    width: "100%",
    minWidth: 0,
    zIndex: 25,
  },

  finishSelectButton: {
    width: "100%",
    height: 34,
    minHeight: 34,
    padding: "0 8px",
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 11.5,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    boxSizing: "border-box",
  },

  finishSelectButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },

  finishOptionContent: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  finishSwatch: {
    width: 18,
    height: 18,
    minWidth: 18,
    flex: "0 0 18px",
    border: "1px solid #9ca3af",
    boxSizing: "border-box",
    background: "#ffffff",
  },

  finishSwatchOriginal: {
    background:
      "linear-gradient(135deg, #ffffff 0%, #ffffff 48%, #d1d5db 49%, #d1d5db 51%, #ffffff 52%, #ffffff 100%)",
  },

  finishOptionLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "left",
  },

  finishSelectChevron: {
    flex: "0 0 auto",
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
  },

  finishMenu: {
    position: "absolute",
    top: "calc(100% + 2px)",
    left: 0,
    right: 0,
    zIndex: 80,
    maxHeight: 260,
    overflowY: "auto",
    border: "1px solid #111111",
    background: "#ffffff",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
    padding: 0,
  },

  finishMenuItem: {
    width: "100%",
    minHeight: 34,
    padding: "6px 8px",
    border: "none",
    borderBottom: "1px solid #eeeeee",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    display: "flex",
    alignItems: "center",
    fontSize: 11.5,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    textAlign: "left",
    boxSizing: "border-box",
  },

  finishMenuItemActive: {
    background: "#f3f4f6",
    fontWeight: 700,
  },
  colorPickerRow: {
    display: "grid",
    gridTemplateColumns: "36px minmax(0, 1fr)",
    gap: 6,
    alignItems: "center",
  },

  colorPicker: {
    width: 36,
    minWidth: 36,
    height: 34,
    padding: 0,
    border: "1px solid #111111",
    borderRadius: 0,
    cursor: "pointer",
    overflow: "hidden",
    background: "none",
  },

  sidebarFooter: {
    minHeight: 0,
    height: "auto",
    overflow: "visible",
    borderTop: "1px solid #d9dee4",
    borderRight: "1px solid transparent",
    borderBottom: "1px solid transparent",
    borderLeft: "1px solid transparent",
    background: "#ffffff",
    padding: "8px 9px 12px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "auto auto auto auto",
    rowGap: 8,
    alignItems: "start",
  },

  customizeActiveFooter: {
    borderTop: "2px solid #111111",
    borderRight: "2px solid #111111",
    borderBottom: "2px solid #111111",
    borderLeft: "2px solid #111111",
    background: "#ffffff",
    boxShadow: "none",
  },

  orderDetailsStackedUniform: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    boxSizing: "border-box",
  },

  orderDetailsStackedUniform: {
    width: "100%",
    boxSizing: "border-box",
  },

  footerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    minHeight: 32,
  },

  requestDetailsToggleTitle: {
    width: "100%",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 10.5,
    lineHeight: 1.15,
    fontWeight: 700,
    color: "#111111",
  },

  requestDetailsToggleIcon: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    lineHeight: 1,
    fontWeight: 700,
    color: "#111111",
  },

  footerTitle: {
    fontSize: 12.5,
    lineHeight: 1.25,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "none",
    color: "#111111",
  },

  footerNote: {
    fontSize: 10.25,
    lineHeight: 1.3,
    fontWeight: 400,
    color: "#6b7280",
    marginTop: 1,
  },

  qtyBox: {
    width: 92,
    height: 30,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    alignItems: "stretch",
    gap: 0,
    border: "1px solid #bfbfbf",
    borderRadius: 10,
    background: "#ffffff",
    overflow: "hidden",
    flex: "0 0 auto",
    boxSizing: "border-box",
  },

  qtyBtn: {
    width: "100%",
    minWidth: 0,
    height: "100%",
    padding: 0,
    margin: 0,
    border: 0,
    borderRadius: 0,
    background: "transparent",
    color: "#111111",
    fontSize: 11,
    lineHeight: 1,
    fontWeight: 400,
    fontFamily: "inherit",
    appearance: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },

  qtyValue: {
    width: "100%",
    minWidth: 0,
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 11,
    lineHeight: 1,
    fontWeight: 500,
    color: "#111111",
  },

  footerField: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 3,
    width: "100%",
    minHeight: 0,
    minWidth: 0,
    alignContent: "start",
  },

  notesFooterField: {
    height: "auto",
    gridTemplateRows: "auto auto auto",
    alignContent: "start",
  },

  footerLabel: {
    fontSize: 11.5,
    lineHeight: 1.25,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "none",
    color: "#111111",
  },

  uploadHeader: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 3,
    width: "100%",
  },

  fieldPurposeText: {
    fontSize: 9.5,
    lineHeight: 1.3,
    fontWeight: 400,
    color: "#6b7280",
  },

  uploadHint: {
    marginTop: 1,
    fontSize: 9.5,
    lineHeight: 1.25,
    color: "#6b7280",
    fontWeight: 500,
  },

  uploadDropZone: {
    width: "100%",
    minHeight: 82,
    padding: "10px 12px",
    border: "1px dashed #aeb4bc",
    borderRadius: 0,
    background: "#fafafa",
    color: "#4b5563",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    textAlign: "center",
    boxSizing: "border-box",
    transition:
      "border-color 120ms ease, background-color 120ms ease, color 120ms ease",
  },

  uploadDropZoneActive: {
    borderColor: "#111111",
    background: "#f3f4f6",
    color: "#111111",
  },

  uploadDropTitle: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 1.2,
    fontWeight: 600,
    color: "inherit",
  },

  uploadDropOr: {
    fontSize: 9.5,
    lineHeight: 1.1,
    fontWeight: 400,
    color: "#8a9098",
  },

  uploadBrowseText: {
    fontSize: 11,
    lineHeight: 1.2,
    fontWeight: 700,
    color: "#111111",
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },

  uploadError: {
    fontSize: 11,
    color: "#b91c1c",
    border: "1px solid #fecaca",
    background: "#fef2f2",
    padding: "8px 10px",
  },

  photoGrid: {
    display: "grid",
    gap: 8,
  },

  photoCard: {
    display: "grid",
    gridTemplateColumns: "48px minmax(0, 1fr) 28px",
    alignItems: "center",
    gap: 8,
    border: "1px solid #e5e7eb",
    background: "#fafafa",
    padding: 6,
  },

  photoThumb: {
    width: 48,
    height: 48,
    overflow: "hidden",
    background: "#ffffff",
    border: "1px solid #d9d9d9",
  },

  photoThumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  photoMeta: {
    minWidth: 0,
  },

  photoName: {
    fontSize: 11,
    fontWeight: 700,
    color: "#111111",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  photoRemove: {
    width: 28,
    height: 28,
    border: "1px solid #111111",
    borderRadius: 0,
    background: "#ffffff",
    color: "#111111",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
  },

  textarea: {
    width: "100%",
    minHeight: 92,
    height: 92,
    resize: "vertical",
    borderRadius: 0,
    border: "1px solid #111111",
    padding: "8px 9px",
    font: "inherit",
    fontSize: 11.5,
    lineHeight: 1.35,
    boxSizing: "border-box",
    outline: "none",
    background: "#ffffff",
    color: "#111111",
    alignSelf: "start",
  },

  applyBtn: {
    width: "100%",
    height: 36,
    minHeight: 36,
    margin: 0,
    borderRadius: 0,
    border: "1px solid #111111",
    background: "#111111",
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 1,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    boxSizing: "border-box",
  },

  balancedActionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
};
