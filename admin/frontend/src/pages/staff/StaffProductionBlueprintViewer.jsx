import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { createFurnitureObject } from "../blueprints/3d/createFurnitureObjects";
import { normalizeComponent } from "../blueprints/data/componentUtils";
import { extractCustomerBlueprintScene } from "../customer/customerBlueprintAdapter";

const VIEW_OPTIONS = [
  { key: "3D", label: "3D" },
  { key: "Front", label: "Front" },
  { key: "Back", label: "Back" },
  { key: "Side", label: "Side" },
  { key: "Top", label: "Top" },
  { key: "Bottom", label: "Bottom" },
];

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const isHexColor = (value) => HEX_COLOR_RE.test(String(value || "").trim());

const normalizeOrderedComponentList = (items = []) =>
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

// WISDOM STAFF EXACT CUSTOMER SURFACE FIDELITY V1
// CustomerTemplateWorkbench applies normalizeComponent() before the customer
// sees and submits a furniture design. Older stored order snapshots intentionally
// kept the final geometry/material/finish but dropped fields such as
// grainDirection. Re-running the SAME normalization here reconstructs the same
// deterministic grain direction from the final ordered dimensions instead of
// mixing stale Blueprint appearance metadata into the customer's final order.
const extractStaffProductionScene = (blueprint) => {
  const scene = extractCustomerBlueprintScene(blueprint);
  const components = normalizeOrderedComponentList(scene?.components || []);

  return {
    ...scene,
    components,
  };
};

// WISDOM STAFF PRODUCTION DOOR / DRAWER PREVIEW V1
// Mirrors the customer's visual-only interaction model. Saved order data
// never changes when a Furniture Specialist opens a door or drawer.
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

  return ["auto", "normal", "door", "drawer"].includes(value)
    ? value
    : "auto";
};

const getCustomerMotionGroupId = (component = {}) =>
  String(
    component?.motionGroupId ??
      component?.motion_group_id ??
      "",
  ).trim();

const getCustomerMotionReferencePartId = (component = {}) =>
  String(
    component?.motionReferencePartId ??
      component?.motion_reference_part_id ??
      "",
  ).trim();

const isCustomerDoorPreviewComponent = (component = {}) => {
  if (!component?.id) return false;

  const partFunction = getCustomerPartFunction(component);
  if (partFunction !== "auto") return partFunction === "door";

  const text = [
    component?.type,
    component?.label,
    component?.partCode,
    component?.category,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();

  return (
    String(component?.type || "").toLowerCase() === "wr_door" ||
    /(^|[\s_-])door([\s_-]|$)/.test(text)
  );
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
      Math.abs(Number(item?.z || 0) - Number(component?.z || 0)) <=
        zTolerance
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

const isCustomerDrawerPreviewComponent = (component = {}) => {
  if (!component?.id) return false;

  const partFunction = getCustomerPartFunction(component);
  if (partFunction !== "auto") return partFunction === "drawer";

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

  const type = String(component?.type || "").trim().toLowerCase();
  const role = String(component?.partRole || "").trim().toLowerCase();
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

  if (hasStrongDrawerIdentity) return true;

  const isFixedShelfLike =
    role === "shelf" ||
    role.endsWith("_shelf") ||
    type === "wr_shelf" ||
    type === "wr_top_shelf" ||
    type.endsWith("_shelf");

  if (isFixedShelfLike) return false;

  return /(^|[\s_-])drawer([\s_-]|$)/.test(text);
};

const isCustomerDrawerPreviewFixedHardware = (component = {}) => {
  const type = String(component?.type || "").trim().toLowerCase();
  const role = String(component?.partRole || "").trim().toLowerCase();
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
  if (
    getCustomerPartFunction(component) === "drawer" &&
    motionGroupId
  ) {
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

  const rawCode = String(
    component?.partCode || component?.technicalId || "",
  )
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
  const type = String(component?.type || "").trim().toLowerCase();
  const role = String(component?.partRole || "").trim().toLowerCase();
  const code = String(
    component?.partCode || component?.technicalId || "",
  )
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
        members.find((item) => String(item.id) === String(referenceId)) ||
        members[0] ||
        null,
    };
  });
};

const getCustomerDrawerSpatialCenter = (component = {}) => ({
  x: Number(component?.x || 0) + Number(component?.width || 0) / 2,
  y: Number(component?.y || 0) + Number(component?.height || 0) / 2,
  z: Number(component?.z || 0) + Number(component?.depth || 0) / 2,
});

const scoreCustomerDrawerPartToFront = (component = {}, front = {}) => {
  const partCenter = getCustomerDrawerSpatialCenter(component);
  const frontCenter = getCustomerDrawerSpatialCenter(front);

  const frontWidth = Math.max(1, Number(front?.width || 0));
  const frontHeight = Math.max(1, Number(front?.height || 0));
  const partWidth = Math.max(1, Number(component?.width || 0));
  const partHeight = Math.max(1, Number(component?.height || 0));

  const dx = Math.abs(partCenter.x - frontCenter.x);
  const dy = Math.abs(partCenter.y - frontCenter.y);
  const dz = Math.abs(partCenter.z - frontCenter.z);

  // A physical drawer part must live in the same horizontal/vertical drawer bay.
  // X separates neighboring drawers; Y separates stacked drawers. Z is deliberately
  // weak because the box extends far behind its front.
  const xLimit = Math.max(90, frontWidth * 0.72, partWidth * 0.8);
  const yLimit = Math.max(80, frontHeight * 0.78, partHeight * 0.55);

  if (dx > xLimit || dy > yLimit) return Number.POSITIVE_INFINITY;

  return (
    (dx / xLimit) * 4 +
    (dy / yLimit) * 6 +
    Math.min(2, dz / Math.max(180, Number(component?.depth || 0))) * 0.2
  );
};

const buildCustomerDrawerPreviewSets = (items = []) => {
  const allItems = Array.isArray(items) ? items : [];
  const source = allItems.filter(isCustomerDrawerPreviewComponent);
  const movableSource = source.filter(
    (item) => !isCustomerDrawerPreviewFixedHardware(item),
  );
  const fronts = movableSource.filter(isCustomerDrawerPreviewFrontComponent);

  // WISDOM STAFF PHYSICAL DRAWER ASSEMBLY V1
  // Older customer order snapshots can lack drawer group ids/part codes. Instead of
  // guessing those missing metadata values, reconstruct the physical drawer exactly
  // from the final ordered geometry: every drawer front owns the nearest drawer parts
  // in the same X/Y bay. This keeps the front, both sides, back, bottom and handle in
  // one motion set even when clicking any one of those pieces.
  if (fronts.length > 0) {
    const grouped = new Map(
      fronts.map((front) => [
        `spatial:${String(front.id)}`,
        { front, members: [front] },
      ]),
    );
    const assignedIds = new Set(fronts.map((front) => String(front.id)));

    movableSource.forEach((component) => {
      const componentId = String(component?.id || "");
      if (!componentId || assignedIds.has(componentId)) return;

      let bestFront = null;
      let bestScore = Number.POSITIVE_INFINITY;

      fronts.forEach((front) => {
        const score = scoreCustomerDrawerPartToFront(component, front);
        if (score < bestScore) {
          bestScore = score;
          bestFront = front;
        }
      });

      if (!bestFront || !Number.isFinite(bestScore)) return;

      const key = `spatial:${String(bestFront.id)}`;
      grouped.get(key)?.members.push(component);
      assignedIds.add(componentId);
    });

    // Fixed drawer slides/runners are not moved, but attach them to the nearest set's
    // allMembers for completeness. They remain filtered out of movableMembers below.
    source
      .filter(isCustomerDrawerPreviewFixedHardware)
      .forEach((component) => {
        let bestFront = null;
        let bestScore = Number.POSITIVE_INFINITY;

        fronts.forEach((front) => {
          const score = scoreCustomerDrawerPartToFront(component, front);
          if (score < bestScore) {
            bestScore = score;
            bestFront = front;
          }
        });

        if (!bestFront || !Number.isFinite(bestScore)) return;
        grouped
          .get(`spatial:${String(bestFront.id)}`)
          ?.members.push(component);
      });

    const spatialSets = [...grouped.entries()]
      .map(([key, entry]) => {
        const allMembers = entry.members;
        const movableMembers = allMembers.filter(
          (item) => !isCustomerDrawerPreviewFixedHardware(item),
        );

        return {
          key,
          allMembers,
          movableMembers,
          reference: entry.front,
        };
      })
      .filter((set) => set.movableMembers.length > 0 && set.reference);

    // Any unusual drawer-tagged component that could not be spatially attached is
    // preserved through the previous customer metadata fallback instead of discarded.
    const spatialMemberIds = new Set(
      spatialSets.flatMap((set) =>
        set.allMembers.map((member) => String(member?.id || "")),
      ),
    );
    const leftovers = source.filter(
      (component) => !spatialMemberIds.has(String(component?.id || "")),
    );

    if (!leftovers.length) return spatialSets;

    const fallbackGrouped = new Map();
    leftovers.forEach((component) => {
      const key = resolveCustomerDrawerPreviewKey(component);
      if (!key) return;
      if (!fallbackGrouped.has(key)) fallbackGrouped.set(key, []);
      fallbackGrouped.get(key).push(component);
    });

    const fallbackSets = [...fallbackGrouped.entries()]
      .map(([key, allMembers]) => {
        const movableMembers = allMembers.filter(
          (item) => !isCustomerDrawerPreviewFixedHardware(item),
        );
        const reference =
          movableMembers.find(isCustomerDrawerPreviewFrontComponent) ||
          movableMembers[0] ||
          null;

        return {
          key: `fallback:${key}`,
          allMembers,
          movableMembers,
          reference,
        };
      })
      .filter((set) => set.movableMembers.length > 0 && set.reference);

    return [...spatialSets, ...fallbackSets];
  }

  // No recognizable front: keep the proven customer metadata grouping unchanged.
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
        movableMembers.find(
          (item) => String(item.id) === String(referenceId),
        ) ||
        movableMembers.find(isCustomerDrawerPreviewFrontComponent) ||
        movableMembers[0] ||
        null;

      return { key, allMembers, movableMembers, reference };
    })
    .filter((set) => set.movableMembers.length > 0 && set.reference);
};

const safeColor = (value) => {
  try {
    return new THREE.Color(value || "#d6c3ab");
  } catch {
    return new THREE.Color("#d6c3ab");
  }
};

const getSolidColorHex = (component = {}) => {
  const values = [component.fill, component.color, component.finish_color];

  for (const value of values) {
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

const disposeMaterial = (material) => {
  if (!material) return;

  Object.values(material).forEach((value) => {
    if (value?.isTexture) value.dispose?.();
  });

  material.dispose?.();
};

const disposeObjectTree = (root) => {
  if (!root) return;

  while (root.children.length) {
    const child = root.children[0];
    root.remove(child);

    child.traverse?.((object) => {
      object.geometry?.dispose?.();

      if (Array.isArray(object.material)) {
        object.material.forEach((material) => disposeMaterial(material));
      } else {
        disposeMaterial(object.material);
      }
    });
  }
};

const buildRenderableObject = (component) => {
  try {
    const object3D = createFurnitureObject(component, false, false, []);
    const solidHex = getSolidColorHex(component);

    if (
      solidHex &&
      (component?.color_mode === "solid" ||
        (!component?.finish &&
          !component?.finish_id &&
          !component?.woodFinish))
    ) {
      applySolidColorOverride(object3D, solidHex);
    }

    object3D.traverse?.((object) => {
      if (!object?.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });

    return object3D;
  } catch {
    const fallback = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        Number(component?.width) || 1,
        Number(component?.height) || 1,
        Number(component?.depth) || 1,
      ),
      new THREE.MeshStandardMaterial({
        color: safeColor(component?.fill),
        roughness: 0.82,
        metalness: 0.03,
      }),
    );

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    fallback.add(mesh);
    return fallback;
  }
};

export default function StaffProductionBlueprintViewer({
  blueprint,
  compact = false,
  compactHeight = 122,
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneRef = useRef(null);
  const productGroupRef = useRef(null);
  const floorRef = useRef(null);
  const frameRef = useRef(0);
  const viewRef = useRef("3D");
  const renderedObjectMapRef = useRef(new Map());
  const doorMotionPreviewRef = useRef([]);
  const drawerMotionPreviewRef = useRef([]);
  const doorMotionAnimationRef = useRef(0);
  const drawerMotionAnimationRef = useRef(0);

  const [view, setView] = useState("3D");
  const [contextLost, setContextLost] = useState(false);
  const [doorsPreviewOpen, setDoorsPreviewOpen] = useState(false);
  const [drawersPreviewOpen, setDrawersPreviewOpen] = useState(false);

  const sceneData = useMemo(
    () => extractStaffProductionScene(blueprint),
    [blueprint],
  );

  const has3D =
    Array.isArray(sceneData?.components) &&
    sceneData.components.length > 0 &&
    Number(sceneData?.bounds?.width || 0) > 20 &&
    Number(sceneData?.bounds?.height || 0) > 20 &&
    Number(sceneData?.bounds?.depth || 0) >= 1;

  const renderCurrentFrame = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!renderer || !scene || !camera) return;
    controls?.update();
    renderer.render(scene, camera);
  }, []);


  const doorPreviewSets = useMemo(
    () => buildCustomerDoorPreviewSets(sceneData?.components || []),
    [sceneData?.components],
  );
  const drawerPreviewSets = useMemo(
    () => buildCustomerDrawerPreviewSets(sceneData?.components || []),
    [sceneData?.components],
  );
  const hasPreviewDoors = doorPreviewSets.length > 0;
  const hasPreviewDrawers = drawerPreviewSets.length > 0;

  const clearDoorPreviews = useCallback(
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
      renderCurrentFrame();
    },
    [renderCurrentFrame],
  );

  const clearDrawerPreviews = useCallback(
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
      renderCurrentFrame();
    },
    [renderCurrentFrame],
  );

  const animateDoorPreviewTo = useCallback(
    (preview, targetAngle, onDone = null) => {
      if (!preview?.pivot) {
        onDone?.();
        return;
      }

      if (preview.animationFrame) {
        cancelAnimationFrame(preview.animationFrame);
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
          Math.max(
            0,
            (now - startedAt) / CUSTOMER_MOTION_PREVIEW_DURATION_MS,
          ),
        );
        const eased = customerMotionEaseOutCubic(progress);

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
        renderCurrentFrame();

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
    [renderCurrentFrame],
  );

  const animateDrawerPreviewTo = useCallback(
    (preview, targetRatio, onDone = null) => {
      if (!preview?.group) {
        onDone?.();
        return;
      }

      if (preview.animationFrame) {
        cancelAnimationFrame(preview.animationFrame);
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
          Math.max(
            0,
            (now - startedAt) / CUSTOMER_MOTION_PREVIEW_DURATION_MS,
          ),
        );
        const eased = customerMotionEaseOutCubic(progress);

        preview.currentDistance =
          startDistance + (destination - startDistance) * eased;

        preview.group.position
          .copy(preview.basePosition)
          .addScaledVector(preview.direction, preview.currentDistance);
        preview.group.updateMatrixWorld(true);
        renderCurrentFrame();

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
    [renderCurrentFrame],
  );

  const openDoorSet = useCallback(
    (targetKey = "", { preserveExisting = false } = {}) => {
      const sets = targetKey
        ? doorPreviewSets.filter((set) => set.key === targetKey)
        : doorPreviewSets;

      if (!sets.length) return;

      const keepCurrent = Boolean(targetKey && preserveExisting);
      if (!keepCurrent) clearDoorPreviews();

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
          object:
            renderedObjectMapRef.current.get(String(member.id)) || null,
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
          renderedObjectMapRef.current.get(
            String(referenceComponent?.id),
          ) || memberEntries[0].object;

        if (!referenceComponent || !referenceOriginal) return;

        const hingeSide = resolveCustomerDoorHingeSide(
          referenceComponent,
          sceneData.components,
        );
        const width = Math.max(1, Number(referenceComponent.width || 1));
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
        pivot.position.copy(hingePosition);
        pivot.quaternion.copy(referenceOriginal.quaternion);
        parent.add(pivot);
        parent.updateMatrixWorld(true);
        pivot.updateMatrixWorld(true);

        const originals = [];

        memberEntries.forEach(({ member, object: original }) => {
          const clone = original.clone(true);
          clone.traverse((child) => {
            child.userData = {
              ...(child.userData || {}),
              id: String(member.id),
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

      if (!created.length) return;

      const openAngle = THREE.MathUtils.degToRad(
        CUSTOMER_DOOR_PREVIEW_OPEN_DEGREES,
      );

      doorMotionPreviewRef.current = keepCurrent
        ? [...doorMotionPreviewRef.current, ...created]
        : created;

      if (!targetKey) setDoorsPreviewOpen(true);

      created.forEach((preview) => {
        animateDoorPreviewTo(preview, openAngle);
      });
    },
    [
      animateDoorPreviewTo,
      clearDoorPreviews,
      doorPreviewSets,
      sceneData.components,
    ],
  );

  const closeDoorByKey = useCallback(
    (targetKey) => {
      const preview = (doorMotionPreviewRef.current || []).find(
        (item) => item?.key === targetKey,
      );
      if (!preview) return;

      setDoorsPreviewOpen(false);

      animateDoorPreviewTo(preview, 0, () => {
        (preview.originals || []).forEach(({ object, visible }) => {
          if (object) object.visible = visible;
        });

        if (preview.pivot?.parent) {
          preview.pivot.parent.remove(preview.pivot);
        }

        doorMotionPreviewRef.current = (
          doorMotionPreviewRef.current || []
        ).filter((item) => item !== preview);
        renderCurrentFrame();
      });
    },
    [animateDoorPreviewTo, renderCurrentFrame],
  );

  const closeAllDoors = useCallback(() => {
    const previews = [...(doorMotionPreviewRef.current || [])];
    if (!previews.length) {
      setDoorsPreviewOpen(false);
      return;
    }

    let remaining = previews.length;
    previews.forEach((preview) => {
      animateDoorPreviewTo(preview, 0, () => {
        (preview.originals || []).forEach(({ object, visible }) => {
          if (object) object.visible = visible;
        });
        if (preview.pivot?.parent) {
          preview.pivot.parent.remove(preview.pivot);
        }
        remaining -= 1;
        if (remaining <= 0) {
          doorMotionPreviewRef.current = [];
          setDoorsPreviewOpen(false);
          renderCurrentFrame();
        }
      });
    });
  }, [animateDoorPreviewTo, renderCurrentFrame]);

  const openDrawerSet = useCallback(
    (targetKey = "", { preserveExisting = false } = {}) => {
      const sets = targetKey
        ? drawerPreviewSets.filter((set) => set.key === targetKey)
        : drawerPreviewSets;

      if (!sets.length) return;

      const keepCurrent = Boolean(targetKey && preserveExisting);
      if (!keepCurrent) clearDrawerPreviews();

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
          object:
            renderedObjectMapRef.current.get(String(member.id)) || null,
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
          renderedObjectMapRef.current.get(
            String(referenceComponent?.id),
          ) || memberEntries[0].object;

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
        parent.add(group);
        parent.updateMatrixWorld(true);
        group.updateMatrixWorld(true);

        const originals = [];

        memberEntries.forEach(({ member, object: original }) => {
          const clone = original.clone(true);
          clone.traverse((child) => {
            child.userData = {
              ...(child.userData || {}),
              id: String(member.id),
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

      if (!created.length) return;

      drawerMotionPreviewRef.current = keepCurrent
        ? [...drawerMotionPreviewRef.current, ...created]
        : created;

      if (!targetKey) setDrawersPreviewOpen(true);

      created.forEach((preview) => {
        animateDrawerPreviewTo(preview, 1);
      });
    },
    [
      animateDrawerPreviewTo,
      clearDrawerPreviews,
      drawerPreviewSets,
    ],
  );

  const closeDrawerByKey = useCallback(
    (targetKey) => {
      const preview = (drawerMotionPreviewRef.current || []).find(
        (item) => item?.key === targetKey,
      );
      if (!preview) return;

      setDrawersPreviewOpen(false);

      animateDrawerPreviewTo(preview, 0, () => {
        (preview.originals || []).forEach(({ object, visible }) => {
          if (object) object.visible = visible;
        });

        if (preview.group?.parent) {
          preview.group.parent.remove(preview.group);
        }

        drawerMotionPreviewRef.current = (
          drawerMotionPreviewRef.current || []
        ).filter((item) => item !== preview);
        renderCurrentFrame();
      });
    },
    [animateDrawerPreviewTo, renderCurrentFrame],
  );

  const closeAllDrawers = useCallback(() => {
    const previews = [...(drawerMotionPreviewRef.current || [])];
    if (!previews.length) {
      setDrawersPreviewOpen(false);
      return;
    }

    let remaining = previews.length;
    previews.forEach((preview) => {
      animateDrawerPreviewTo(preview, 0, () => {
        (preview.originals || []).forEach(({ object, visible }) => {
          if (object) object.visible = visible;
        });
        if (preview.group?.parent) {
          preview.group.parent.remove(preview.group);
        }
        remaining -= 1;
        if (remaining <= 0) {
          drawerMotionPreviewRef.current = [];
          setDrawersPreviewOpen(false);
          renderCurrentFrame();
        }
      });
    });
  }, [animateDrawerPreviewTo, renderCurrentFrame]);

  const toggleMotionFromComponentId = useCallback(
    (componentId) => {
      const targetId = String(componentId || "").trim();
      if (!targetId) return false;

      const doorSet = doorPreviewSets.find((set) =>
        set.members.some(
          (member) => String(member?.id || "") === targetId,
        ),
      );

      if (doorSet) {
        const existing = (doorMotionPreviewRef.current || []).find(
          (preview) => preview?.key === doorSet.key,
        );

        if (existing) {
          closeDoorByKey(doorSet.key);
        } else {
          openDoorSet(doorSet.key, { preserveExisting: true });
        }

        return true;
      }

      const drawerSet = drawerPreviewSets.find((set) =>
        set.movableMembers.some(
          (member) => String(member?.id || "") === targetId,
        ),
      );

      if (drawerSet) {
        const existing = (drawerMotionPreviewRef.current || []).find(
          (preview) => preview?.key === drawerSet.key,
        );

        if (existing) {
          closeDrawerByKey(drawerSet.key);
        } else {
          openDrawerSet(drawerSet.key, { preserveExisting: true });
        }

        return true;
      }

      return false;
    },
    [
      closeDoorByKey,
      closeDrawerByKey,
      doorPreviewSets,
      drawerPreviewSets,
      openDoorSet,
      openDrawerSet,
    ],
  );

  const fitCameraToFurniture = useCallback(
    (viewMode = "3D") => {
      const productGroup = productGroupRef.current;
      const camera = cameraRef.current;
      const controls = controlsRef.current;

      if (!productGroup || !camera || !controls || !productGroup.children.length) {
        return;
      }

      const box = new THREE.Box3().setFromObject(productGroup);
      if (box.isEmpty()) return;

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const safeWidth = Math.max(1, size.x);
      const safeHeight = Math.max(1, size.y);
      const safeDepth = Math.max(1, size.z);
      const maxDim = Math.max(safeWidth, safeHeight, safeDepth);

      const verticalFov = THREE.MathUtils.degToRad(camera.fov || 40);
      const safeAspect = Math.max(0.5, Number(camera.aspect || 1));
      const horizontalFov =
        2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);

      const fitPlaneDistance = (planeWidth, planeHeight) => {
        const distanceForHeight =
          planeHeight / (2 * Math.tan(verticalFov / 2));
        const distanceForWidth =
          planeWidth / (2 * Math.tan(horizontalFov / 2));
        return Math.max(distanceForHeight, distanceForWidth) *
          (compact ? 1.32 : 1.18);
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
        distance =
          (radius / Math.sin(limitingFov / 2)) * (compact ? 1.28 : 1.18);
      }

      distance = Math.max(compact ? 520 : 700, distance);

      controls.minDistance = Math.max(120, Math.min(500, distance * 0.1));
      controls.maxDistance = Math.max(5000, distance * 2.5, maxDim * 4);
      controls.enableRotate = !compact && viewMode === "3D";
      controls.enableZoom = !compact;
      controls.maxPolarAngle = viewMode === "3D" ? Math.PI / 2 - 0.05 : Math.PI;

      camera.near = Math.max(0.5, Math.min(20, distance * 0.002));
      camera.far = Math.max(12000, distance + maxDim * 8);
      camera.up.set(0, 1, 0);

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
          camera.up.set(0, 0, -1);
          camera.position.set(center.x, center.y + distance, center.z + 0.1);
          break;
        case "Bottom":
          camera.up.set(0, 0, 1);
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

      controls.target.copy(center);
      camera.updateProjectionMatrix();
      controls.update();
      renderCurrentFrame();
    },
    [compact, renderCurrentFrame],
  );

  useEffect(() => {
    viewRef.current = view;
    fitCameraToFurniture(view);
  }, [view, fitCameraToFurniture]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || contextLost || !has3D) return undefined;

    const width = mount.clientWidth || 760;
    const height = compact ? compactHeight : mount.clientHeight || 520;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(
      compact ? 2 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7f5f1");

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 12000);
    camera.position.set(1500, 700, 1500);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const hemisphereLight = new THREE.HemisphereLight(
      0xfffdf8,
      0xd8c5aa,
      0.45,
    );
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
    floor.position.y = -2;
    floor.receiveShadow = true;
    scene.add(floor);

    const productGroup = new THREE.Group();
    scene.add(productGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !compact;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableRotate = !compact;
    controls.enableZoom = !compact;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 500;
    controls.maxDistance = 5000;
    controls.target.set(0, 0, 0);

    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = controls;
    sceneRef.current = scene;
    productGroupRef.current = productGroup;
    floorRef.current = floor;

    const handleContextLost = (event) => {
      event.preventDefault();
      setContextLost(true);
    };

    renderer.domElement.addEventListener(
      "webglcontextlost",
      handleContextLost,
      false,
    );

    const handleResize = () => {
      if (compact) return;
      const nextWidth = mount.clientWidth || 760;
      const nextHeight = mount.clientHeight || 520;
      renderer.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      fitCameraToFurniture(viewRef.current);
    };

    if (!compact) window.addEventListener("resize", handleResize);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    if (!compact) animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      if (!compact) window.removeEventListener("resize", handleResize);

      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
        false,
      );

      clearDoorPreviews({ updateState: false });
      clearDrawerPreviews({ updateState: false });
      renderedObjectMapRef.current.clear();
      disposeObjectTree(productGroup);
      floor.geometry?.dispose?.();
      disposeMaterial(floor.material);
      controls.dispose();
      renderer.dispose();

      if (rendererRef.current === renderer) rendererRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
      if (controlsRef.current === controls) controlsRef.current = null;
      if (sceneRef.current === scene) sceneRef.current = null;
      if (productGroupRef.current === productGroup) productGroupRef.current = null;
      if (floorRef.current === floor) floorRef.current = null;

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [
    compact,
    compactHeight,
    contextLost,
    fitCameraToFurniture,
    has3D,
    clearDoorPreviews,
    clearDrawerPreviews,
  ]);

  useEffect(() => {
    const productGroup = productGroupRef.current;
    if (!productGroup || !has3D) return;

    clearDoorPreviews({ updateState: false });
    clearDrawerPreviews({ updateState: false });
    renderedObjectMapRef.current.clear();
    disposeObjectTree(productGroup);

    const worldW = sceneData.worldSize?.w || 6400;
    const worldH = sceneData.worldSize?.h || 3200;
    const worldD = sceneData.worldSize?.d || 5200;

    sceneData.components.forEach((component) => {
      const object3D = buildRenderableObject(component);
      const componentId = String(component?.id ?? "");
      object3D.userData = {
        ...(object3D.userData || {}),
        id: componentId,
      };
      object3D.traverse?.((child) => {
        child.userData = {
          ...(child.userData || {}),
          id: componentId,
        };
      });
      renderedObjectMapRef.current.set(componentId, object3D);

      const x = component.x + component.width / 2 - worldW / 2;
      const y = worldH / 2 - (component.y + component.height / 2);
      const z = component.z + component.depth / 2 - worldD / 2;

      object3D.position.set(x, y, z);
      object3D.rotation.set(
        THREE.MathUtils.degToRad(component.rotationX || 0),
        THREE.MathUtils.degToRad(component.rotationY || 0),
        THREE.MathUtils.degToRad(component.rotationZ || 0),
      );
      productGroup.add(object3D);
    });

    productGroup.updateMatrixWorld(true);
    let bounds = new THREE.Box3().setFromObject(productGroup);
    const center = bounds.getCenter(new THREE.Vector3());

    productGroup.position.set(-center.x, -bounds.min.y, -center.z);
    productGroup.updateMatrixWorld(true);

    fitCameraToFurniture(viewRef.current);
    renderCurrentFrame();
  }, [
    sceneData,
    has3D,
    fitCameraToFurniture,
    renderCurrentFrame,
    clearDoorPreviews,
    clearDrawerPreviews,
  ]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const productGroup = productGroupRef.current;

    if (compact || !renderer || !camera || !productGroup) {
      return undefined;
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let startX = 0;
    let startY = 0;

    const onPointerDown = (event) => {
      startX = event.clientX;
      startY = event.clientY;
    };

    const onPointerUp = (event) => {
      const dragDistance = Math.hypot(
        event.clientX - startX,
        event.clientY - startY,
      );
      if (dragDistance > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(
        productGroup.children,
        true,
      );

      for (const hit of intersects) {
        let object = hit.object;

        while (object && !object.userData?.id && object.parent) {
          object = object.parent;
        }

        const componentId = String(object?.userData?.id || "").trim();
        if (!componentId) continue;

        const isMovable =
          doorPreviewSets.some((set) =>
            set.members.some(
              (member) => String(member?.id || "") === componentId,
            ),
          ) ||
          drawerPreviewSets.some((set) =>
            set.movableMembers.some(
              (member) => String(member?.id || "") === componentId,
            ),
          );

        if (isMovable) {
          queueMicrotask(() => toggleMotionFromComponentId(componentId));
          return;
        }
      }
    };

    renderer.domElement.addEventListener(
      "pointerdown",
      onPointerDown,
      true,
    );
    renderer.domElement.addEventListener(
      "pointerup",
      onPointerUp,
      true,
    );

    return () => {
      renderer.domElement.removeEventListener(
        "pointerdown",
        onPointerDown,
        true,
      );
      renderer.domElement.removeEventListener(
        "pointerup",
        onPointerUp,
        true,
      );
    };
  }, [
    compact,
    doorPreviewSets,
    drawerPreviewSets,
    toggleMotionFromComponentId,
  ]);

  useEffect(
    () => () => {
      clearDoorPreviews({ updateState: false });
      clearDrawerPreviews({ updateState: false });
    },
    [clearDoorPreviews, clearDrawerPreviews],
  );

  if (!has3D) {
    return (
      <div className="staff-prod-viewer staff-prod-viewer-empty">
        <strong>No 3D production view available</strong>
        <span>This Blueprint does not contain a usable saved 3D design.</span>
      </div>
    );
  }

  if (contextLost) {
    return (
      <div className="staff-prod-viewer staff-prod-viewer-empty">
        <strong>3D view needs to reload</strong>
        <button type="button" onClick={() => setContextLost(false)}>
          Reload 3D View
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="staff-prod-viewer staff-prod-viewer-compact">
        <div
          ref={mountRef}
          className="staff-prod-viewer-canvas"
          style={{ height: compactHeight }}
        />
      </div>
    );
  }

  return (
    <div className="staff-prod-viewer">
      <div className="staff-prod-viewer-toolbar">
        <div
          className="staff-prod-viewer-actions"
          role="group"
          aria-label="Furniture view"
        >
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={view === option.key ? "active" : ""}
              onClick={() => setView(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {(hasPreviewDoors || hasPreviewDrawers) && (
          <div
            className="staff-prod-motion-actions"
            role="group"
            aria-label="Door and drawer preview"
          >
            {hasPreviewDoors && (
              <button
                type="button"
                className={doorsPreviewOpen ? "active" : ""}
                onClick={() =>
                  doorsPreviewOpen ? closeAllDoors() : openDoorSet()
                }
              >
                {doorsPreviewOpen ? "Close All Doors" : "Open All Doors"}
              </button>
            )}

            {hasPreviewDrawers && (
              <button
                type="button"
                className={drawersPreviewOpen ? "active" : ""}
                onClick={() =>
                  drawersPreviewOpen ? closeAllDrawers() : openDrawerSet()
                }
              >
                {drawersPreviewOpen
                  ? "Close All Drawers"
                  : "Open All Drawers"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="staff-prod-viewer-stage">
        <div ref={mountRef} className="staff-prod-viewer-canvas" />
      </div>

      <div className="staff-prod-viewer-help">
        Drag to rotate • Scroll to zoom • Click a door or drawer to preview movement
      </div>
    </div>
  );
}
