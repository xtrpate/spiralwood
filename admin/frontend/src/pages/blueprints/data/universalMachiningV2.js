// data/universalMachiningV2.js
// WISDOM Universal Part Machining V2.0.2
// Keeps machining metadata separate from Custom Shape profile metadata.
// Existing Custom Shape V5B remains the authoritative profile system.

import {
  getWoodworkingProfileDescriptor,
  getWoodworkingProfileLocalPoints,
  isWoodworkingProfileComponent,
  createProfileCutout,
  updateProfileCutout,
  deleteProfileCutout,
  getProfileCutoutLocalPoints,
  getProfileCutoutStatus,
} from "./woodworkingProfile";
import {
  normalizeWoodworkingOperations,
  getWoodworkingOperationStatus,
} from "./woodworkingOperations";

const VALID_MACHINING_PLANES = new Set(["auto", "xy", "xz", "yz"]);

const UNSUPPORTED_COMPONENT_TYPES = new Set([
  // Non-board / hardware geometry.
  "reference_proxy",
  "hardware",
  "wr_rod",
  "wr_drawer_handle",

  // Composite furniture rendered from several physical meshes. A machining
  // cut must target an individual physical part, not guess a child mesh.
  "upper_cabinet",
  "base_cabinet",
  "drawer",
  "kitchen_cabinet",
  "coffee_table",
  "tv_stand",
  "sideboard",
  "bookshelf",
  "sofa",
  "bed_frame",
  "dresser",
  "nightstand",
  "wardrobe",
  "dining_table",
  "dining_chair",
  "dining_bench",
  "office_desk",
  "bookcase",
  "office_chair",
  "garden_bench",
  "lounger",
  "patio_dining_set",
  "chair_template",

  // These normal Custom Shape renderers are not rectangular board surfaces.
  // Their dedicated woodworking-profile equivalents remain supported.
  "rounded_box",
  "shape_circle",
  "shape_triangle",
  "shape_trapezoid",
]);

const UNSUPPORTED_BLUEPRINT_STYLES = new Set([
  "assembly_template",
  "casework",
  "table",
  "bench",
  "bench_back",
  "drawer_stack",
  "open_shelf",
  "sofa",
  "bed",
  "chair_template",
  "office_chair",
  "lounger",
  "patio_set",
]);

function normalizeMachiningPlane(value = "auto") {
  const normalized = String(value || "auto").trim().toLowerCase();
  return VALID_MACHINING_PLANES.has(normalized) ? normalized : "auto";
}

function inferMachiningPlane(component = {}) {
  const width = Math.max(1, Number(component?.width) || 1);
  const height = Math.max(1, Number(component?.height) || 1);
  const depth = Math.max(1, Number(component?.depth) || 1);

  if (depth <= height && depth <= width) return "xy";
  if (height <= width && height <= depth) return "xz";
  return "yz";
}

function resolveMachiningPlane(component = {}) {
  const requested = normalizeMachiningPlane(
    component?.machiningPlane ??
      component?.machining_plane ??
      "auto",
  );
  return requested === "auto" ? inferMachiningPlane(component) : requested;
}

function isUniversalMachiningComponent(component = {}) {
  return Boolean(
    component &&
      typeof component === "object" &&
      !Array.isArray(component) &&
      component.type !== "reference_proxy",
  );
}

function getUniversalMachiningCapability(component = {}) {
  if (!isUniversalMachiningComponent(component)) {
    return {
      supported: false,
      code: "reference",
      message: "Machining is not available for reference objects.",
    };
  }

  if (isWoodworkingProfileComponent(component)) {
    return {
      supported: true,
      code: "custom_profile",
      message: "Custom Shape machining uses the existing V5B geometry engine.",
    };
  }

  const type = String(component?.type || "").trim().toLowerCase();
  const blueprintStyle = String(component?.blueprintStyle || "")
    .trim()
    .toLowerCase();

  if (
    UNSUPPORTED_COMPONENT_TYPES.has(type) ||
    type.startsWith("template_") ||
    UNSUPPORTED_BLUEPRINT_STYLES.has(blueprintStyle)
  ) {
    return {
      supported: false,
      code: "physical_part_required",
      message:
        "Select an individual physical part first. Machining is not applied to a whole multi-part furniture object.",
    };
  }

  return {
    supported: true,
    code: "surface_target",
    message: "Machining will target this individual rendered part.",
  };
}

function getMachiningProxyComponent(component = {}) {
  if (!isUniversalMachiningComponent(component)) return null;

  if (isWoodworkingProfileComponent(component)) {
    return component;
  }

  return {
    ...component,
    profileKind: "rectangle",
    profilePlane: resolveMachiningPlane(component),
    profileRadius: 0,
    profileFilletRadius: 0,
    profileCutouts:
      component?.machiningCutouts ??
      component?.machining_cutouts ??
      [],
  };
}

function getUniversalMachiningDescriptor(component = {}) {
  const proxy = getMachiningProxyComponent(component);
  if (!proxy) return null;
  return getWoodworkingProfileDescriptor(proxy);
}

function getUniversalMachiningOuterPoints(component = {}, options = {}) {
  const proxy = getMachiningProxyComponent(component);
  if (!proxy) return [];
  return getWoodworkingProfileLocalPoints(proxy, options) || [];
}

function getUniversalMachiningCutouts(component = {}) {
  if (isWoodworkingProfileComponent(component)) {
    const descriptor = getWoodworkingProfileDescriptor(component);
    return Array.isArray(descriptor?.profileCutouts)
      ? descriptor.profileCutouts
      : [];
  }

  const descriptor = getUniversalMachiningDescriptor(component);
  return Array.isArray(descriptor?.profileCutouts)
    ? descriptor.profileCutouts
    : [];
}

function createUniversalMachiningCutout(component = {}, type = "round") {
  const proxy = getMachiningProxyComponent(component);
  if (!proxy) return null;
  return createProfileCutout(proxy, type);
}

function updateUniversalMachiningCutout(
  component = {},
  cutoutId = "",
  attrs = {},
) {
  const proxy = getMachiningProxyComponent(component);
  if (!proxy) return null;
  return updateProfileCutout(proxy, cutoutId, attrs);
}

function deleteUniversalMachiningCutout(component = {}, cutoutId = "") {
  const proxy = getMachiningProxyComponent(component);
  if (!proxy) return null;
  return deleteProfileCutout(proxy, cutoutId);
}

function getUniversalMachiningCutoutStatus(component = {}, cutout = {}) {
  const capability = getUniversalMachiningCapability(component);
  if (!capability.supported) {
    return {
      valid: false,
      code: capability.code,
      message: capability.message,
    };
  }

  const proxy = getMachiningProxyComponent(component);
  if (!proxy) {
    return {
      valid: false,
      code: "unsupported",
      message: "Machining is unavailable for this part.",
    };
  }

  return getProfileCutoutStatus(proxy, cutout);
}

function getUniversalMachiningCutoutPoints(cutout = {}, segments = 36) {
  return getProfileCutoutLocalPoints(cutout, segments);
}

function getUniversalMachiningValidationContext(component = {}) {
  const outerPoints = getUniversalMachiningOuterPoints(component, {
    curveSegments: 56,
    cornerSegments: 10,
    filletSegments: 10,
  });

  const cutoutPolygons = getUniversalMachiningCutouts(component)
    .filter(
      (cutout) =>
        getUniversalMachiningCutoutStatus(component, cutout).valid,
    )
    .map((cutout) =>
      getProfileCutoutLocalPoints(
        cutout,
        cutout.type === "round" ? 48 : 4,
      ),
    );

  return { outerPoints, cutoutPolygons };
}

function getUniversalMachiningOperationStatus(
  component = {},
  operation = {},
  context = null,
) {
  const capability = getUniversalMachiningCapability(component);
  if (!capability.supported) {
    return {
      valid: false,
      code: capability.code,
      message: capability.message,
    };
  }

  const proxy = getMachiningProxyComponent(component);
  if (!proxy) {
    return {
      valid: false,
      code: "unsupported",
      message: "Machining is unavailable for this part.",
    };
  }

  return getWoodworkingOperationStatus(
    proxy,
    operation,
    context || getUniversalMachiningValidationContext(component),
  );
}

function hasUniversalMachiningMetadata(component = {}) {
  if (!isUniversalMachiningComponent(component)) return false;

  if (isWoodworkingProfileComponent(component)) {
    const descriptor = getWoodworkingProfileDescriptor(component);
    const operations = normalizeWoodworkingOperations(
      component?.woodworkingOperations ??
        component?.woodworking_operations ??
        [],
    );
    return Boolean(descriptor?.profileCutouts?.length || operations.length);
  }

  const cutouts = getUniversalMachiningCutouts(component);
  const operations = normalizeWoodworkingOperations(
    component?.woodworkingOperations ??
      component?.woodworking_operations ??
      [],
  );

  return cutouts.length > 0 || operations.length > 0;
}

function normalizeUniversalMachiningMetadata(component = {}) {
  if (
    !isUniversalMachiningComponent(component) ||
    isWoodworkingProfileComponent(component)
  ) {
    return null;
  }

  const rawCutouts =
    component?.machiningCutouts ??
    component?.machining_cutouts ??
    [];
  const rawOperations =
    component?.woodworkingOperations ??
    component?.woodworking_operations ??
    [];
  const requestedPlane = String(
    component?.machiningPlane ??
      component?.machining_plane ??
      "",
  ).trim();

  const hasRawCutouts = Array.isArray(rawCutouts)
    ? rawCutouts.length > 0
    : Boolean(String(rawCutouts || "").trim());
  const hasRawOperations = normalizeWoodworkingOperations(
    rawOperations,
  ).length > 0;

  if (!requestedPlane && !hasRawCutouts && !hasRawOperations) {
    return null;
  }

  const proxy = getMachiningProxyComponent({
    ...component,
    machiningPlane: requestedPlane || "auto",
    machiningCutouts: rawCutouts,
  });
  const descriptor = proxy
    ? getWoodworkingProfileDescriptor(proxy)
    : null;

  return {
    machiningVersion: 2,
    machiningPlane: normalizeMachiningPlane(requestedPlane || "auto"),
    machiningCutouts: Array.isArray(descriptor?.profileCutouts)
      ? descriptor.profileCutouts.map((item) => ({ ...item }))
      : [],
  };
}

function getViewMachiningPlane(view = "front") {
  const normalized = view === "exploded" ? "front" : view;
  if (normalized === "top") return "xz";
  if (normalized === "left" || normalized === "right") return "yz";
  return "xy";
}

function getMachiningPlaneLabel(plane = "xy") {
  if (plane === "xz") return "Top / Bottom";
  if (plane === "yz") return "Left / Right";
  return "Front / Back";
}

function getMachiningSurfaceLabels(plane = "xy") {
  if (plane === "xz") {
    return { face_a: "Top", face_b: "Bottom" };
  }
  if (plane === "yz") {
    return { face_a: "Right", face_b: "Left" };
  }
  return { face_a: "Front", face_b: "Back" };
}

export {
  normalizeMachiningPlane,
  inferMachiningPlane,
  resolveMachiningPlane,
  isUniversalMachiningComponent,
  getUniversalMachiningCapability,
  getMachiningProxyComponent,
  getUniversalMachiningDescriptor,
  getUniversalMachiningOuterPoints,
  getUniversalMachiningCutouts,
  createUniversalMachiningCutout,
  updateUniversalMachiningCutout,
  deleteUniversalMachiningCutout,
  getUniversalMachiningCutoutStatus,
  getUniversalMachiningCutoutPoints,
  getUniversalMachiningValidationContext,
  getUniversalMachiningOperationStatus,
  hasUniversalMachiningMetadata,
  normalizeUniversalMachiningMetadata,
  getViewMachiningPlane,
  getMachiningPlaneLabel,
  getMachiningSurfaceLabels,
};
