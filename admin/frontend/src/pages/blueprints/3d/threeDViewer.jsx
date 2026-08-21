// 3d/ThreeDViewer.jsx — Three.js scene, inspector panels, and toolbar
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import * as THREE from "three";
import {
  buildFurnitureTemplateParts,
  buildDiningChairParts,
} from "../data/templateComponents";
import { createFurnitureObject } from "./createFurnitureObjects";
import { FURNITURE_TEMPLATE_SET } from "../data/furnitureTypes";
import { normalizeComponent } from "../data/componentUtils";
import { isWoodworkingProfileComponent } from "../data/woodworkingProfile";
import {
  snap,
  roundToPrecision,
  normalizeDimensionMm,
  clamp,
} from "../data/utils";
import { ObjectsTreePanel } from "./components/ObjectsTreePanel";
import { FurnitureLibraryPanel } from "./components/FurnitureLibraryPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { FurnitureToolsPanel } from "./components/FurnitureToolsPanel";
import { TransformToolbar } from "./components/TransformToolbar";
import { QuickControlsBar } from "./components/QuickControlsBar";
import {
  createBlueprintSceneFoundation,
  disposeObject3DResources,
} from "./sceneSetup";
import {
  captureCameraView as captureCameraSnapshot,
  centerCameraOnObject,
  isTypingElement,
  moveCameraFromKeyboard,
  restoreCameraView as restoreCameraSnapshot,
} from "./cameraControls";
import { configureTransformMode } from "./transformGizmo";
import {
  DEFAULT_RESIZE_ANCHORS,
  buildAnchoredResizeUpdates,
} from "./resizeAnchors";
import { buildExplodedAssemblyOffsets } from "./explodedAssembly3D";
import {
  clearViewerSelectionOutlines,
  rebuildViewerObjects,
  syncViewerSelectionOutlines,
} from "./viewerObjectSync";
import {
  bindBlueprintViewerEvents,
  resizeViewerToMount,
  startBlueprintViewerRenderLoop,
} from "./viewerLifecycle";

const GRID_SIZE = 20;
const ROTATION_SNAP_DEGREES = 15;
const MIN_COMPONENT_DIMENSION_MM = 1;
const FLOOR_OFFSET = 40;
const MM_PER_INCH = 25.4;

// WISDOM ADMIN DOOR PREVIEW NO REBUILD ON CLICK V2.0.5
// Normal-mode selection changes must not create a fresh offset-map identity.
const EMPTY_EXPLODED_DISPLAY_OFFSETS = new Map();

const DOOR_PREVIEW_OPEN_DEGREES = 82;
const DOOR_PREVIEW_DURATION_MS = 320;

const DRAWER_PREVIEW_DURATION_MS = 320;
const DRAWER_PREVIEW_EXTENSION_RATIO = 0.72;
const DRAWER_PREVIEW_MIN_EXTENSION_MM = 120;
const DRAWER_PREVIEW_MAX_EXTENSION_MM = 520;

// WISDOM ADMIN DOOR PREVIEW MANUAL CLOSE V2.0.2
// Door state is independent from normal camera and canvas selection interaction.

// WISDOM MANUAL PART FUNCTION PREVIEW OVERRIDE V1.0.0
// Explicit manual tagging wins over legacy type/label/part-code detection.
// Components on Automatic stay on the existing detector.
const getPartFunction = (component = {}) => {
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

// WISDOM MANUAL MOVING GROUPS V1.1.0
const getMotionGroupId = (component = {}) =>
  String(
    component?.motionGroupId ??
      component?.motion_group_id ??
      "",
  ).trim();

const getMotionReferencePartId = (component = {}) =>
  String(
    component?.motionReferencePartId ??
      component?.motion_reference_part_id ??
      "",
  ).trim();

const resolveManualMotionSet = (
  component = {},
  allComponents = [],
  expectedFunction = "",
) => {
  const functionType = getPartFunction(component);
  const groupId = getMotionGroupId(component);

  if (
    !component?.id ||
    !groupId ||
    functionType !== expectedFunction
  ) {
    return {
      groupId: "",
      members: component?.id ? [component] : [],
      reference: component?.id ? component : null,
    };
  }

  const members = (allComponents || []).filter(
    (item) =>
      item?.id &&
      getPartFunction(item) === expectedFunction &&
      getMotionGroupId(item) === groupId,
  );

  if (!members.length) {
    return {
      groupId,
      members: [component],
      reference: component,
    };
  }

  const referenceId =
    getMotionReferencePartId(component) ||
    members
      .map(getMotionReferencePartId)
      .find(Boolean) ||
    component.id;

  const reference =
    members.find((item) => item.id === referenceId) ||
    component ||
    members[0];

  return {
    groupId,
    members,
    reference,
  };
};

const isDoorPreviewComponent = (component = {}) => {
  const partFunction = getPartFunction(component);
  if (partFunction !== "auto") {
    return partFunction === "door";
  }

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

  return component?.type === "wr_door" || /(^|[\s_-])door([\s_-]|$)/.test(text);
};

const resolveDoorPreviewHingeSide = (component = {}, allComponents = []) => {
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
    if (!item || item.id === component.id || !isDoorPreviewComponent(item)) {
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

const easeOutCubic = (value) => {
  const t = Math.max(0, Math.min(1, Number(value) || 0));

  return 1 - Math.pow(1 - t, 3);
};

// WISDOM ADMIN DOOR PREVIEW CLICK PERSISTENCE V2.0.3
// Use real door data, not the components array reference, to decide whether
// an open preview became stale.
const getDoorPreviewComponentSignature = (component = null) => {
  if (!component?.id) return "";

  return [
    component.id,
    component.type || "",
    getPartFunction(component),
    component.doorHinge || component.door_hinge || "",
    getMotionGroupId(component),
    getMotionReferencePartId(component),
    Number(component.x || 0),
    Number(component.y || 0),
    Number(component.z || 0),
    Number(component.width || 0),
    Number(component.height || 0),
    Number(component.depth || 0),
    Number(component.rotationX || 0),
    Number(component.rotationY || 0),
    Number(component.rotationZ || 0),
    component.label || "",
    component.partCode || "",
  ].join("|");
};

const getDoorPreviewComponentsSignature = (components = []) =>
  (components || [])
    .filter((component) => component?.id)
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(getDoorPreviewComponentSignature)
    .join("||");

// WISDOM ADMIN DRAWER OPEN/CLOSE PREVIEW V1.0.1
// Drawer preview is visual-only. It never mutates saved component coordinates.
const getDrawerPreviewText = (component = {}) =>
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

const isDrawerPreviewComponent = (component = {}) => {
  if (!component?.id) return false;

  const partFunction = getPartFunction(component);
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
  const text = getDrawerPreviewText(component);

  return (
    type === "drawer_front_panel" ||
    type.startsWith("wr_drawer_") ||
    type.startsWith("drawer_") ||
    role.startsWith("drawer_") ||
    /(^|[\s_-])drawer([\s_-]|$)/.test(text) ||
    /(^|-)drw(?:-|$)/i.test(
      String(component?.partCode || component?.technicalId || ""),
    ) ||
    /(^|-)d\d+(?:-|$)/i.test(
      String(component?.partCode || component?.technicalId || ""),
    )
  );
};

const isDrawerPreviewFixedHardware = (component = {}) => {
  const type = String(component?.type || "")
    .trim()
    .toLowerCase();
  const role = String(component?.partRole || "")
    .trim()
    .toLowerCase();
  const text = getDrawerPreviewText(component);

  return (
    type.includes("drawer_slide") ||
    type.includes("drawer_runner") ||
    role.includes("drawer_slide") ||
    role.includes("drawer_runner") ||
    /(^|[\s_-])(slide|runner)([\s_-]|$)/.test(text)
  );
};

const resolveDrawerPreviewKey = (component = {}) => {
  if (!component?.id) return "";

  const motionGroupId = getMotionGroupId(component);
  if (
    getPartFunction(component) === "drawer" &&
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

const resolveDrawerPreviewSet = (component = {}, allComponents = []) => {
  if (!isDrawerPreviewComponent(component)) {
    return {
      key: "",
      allMembers: [],
      movableMembers: [],
    };
  }

  const key = resolveDrawerPreviewKey(component);

  const allMembers = (allComponents || []).filter(
    (item) =>
      isDrawerPreviewComponent(item) && resolveDrawerPreviewKey(item) === key,
  );

  const movableMembers = allMembers.filter(
    (item) => !isDrawerPreviewFixedHardware(item),
  );

  if (movableMembers.length > 0) {
    return {
      key,
      allMembers,
      movableMembers,
    };
  }

  if (!isDrawerPreviewFixedHardware(component)) {
    return {
      key,
      allMembers: [component],
      movableMembers: [component],
    };
  }

  return {
    key,
    allMembers,
    movableMembers: [],
  };
};

const isDrawerPreviewFrontComponent = (component = {}) => {
  const type = String(component?.type || "")
    .trim()
    .toLowerCase();
  const role = String(component?.partRole || "")
    .trim()
    .toLowerCase();
  const code = String(component?.partCode || component?.technicalId || "")
    .trim()
    .toUpperCase();
  const text = getDrawerPreviewText(component);

  return (
    type === "drawer_front_panel" ||
    type === "wr_drawer_front" ||
    role === "drawer_front" ||
    role === "drawer_front_panel" ||
    /-F$/i.test(code) ||
    /drawer[\s_-]*front/.test(text)
  );
};

const getDrawerPreviewComponentsSignature = (components = []) =>
  (components || [])
    .filter((component) => component?.id)
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((component) =>
      [
        component.id,
        component.type || "",
        getPartFunction(component),
        getMotionGroupId(component),
        getMotionReferencePartId(component),
        component.partRole || "",
        component.partCode || "",
        component.drawerAssemblyId ||
          component.drawer_assembly_id ||
          component.drawerId ||
          component.drawer_id ||
          "",
        Number(component.x || 0),
        Number(component.y || 0),
        Number(component.z || 0),
        Number(component.width || 0),
        Number(component.height || 0),
        Number(component.depth || 0),
        Number(component.rotationX || 0),
        Number(component.rotationY || 0),
        Number(component.rotationZ || 0),
      ].join("|"),
    )
    .join("||");

function ThreeDViewer({
  onPushHistory,
  components,
  selectedId,
  selectedIds,
  edit3DId,
  setSelectedId,
  setSelectedIds,
  setEdit3DId,
  onUpdateComp,
  onBatchUpdateComps,
  lockedFields,
  canvasW,
  canvasH,
  canvasD,
  transformMode,
  setTransformMode,
  addComponent,
  activeBuildLabel,
  selectedComp,
  selectionSummary = null,
  isLocked,
  unit,
  editorMode,
  pendingPlacement,
  onPlaceComponent,
  onCancelPlacement,
  canUseSmartActions,
  smartSelectionCount = 0,
  hasLockedSmartSelection = false,
  smartWidthResizeContext = null,
  onPreviewSmartWidthResize,
  onApplySmartWidthResize,
  onAlignSelection,
  onFlushSelection,
  onMirrorDuplicate,
  onSelectAssembly,
  onDuplicateAssembly,
  canCreateAssembly = false,
  createAssemblyHint = "",
  createAssemblySelectionCount = 0,
  onCreateAssembly,
  onArrayDuplicate,
  onDistributeSelection,
  onGapSelection,
  onBuildLineSelection,
  onAutoShelfStack,
  onAutoLegLayout,
  onAutoApronRailLayout,
  onPanelPairSelection,
  onFrontPairSelection,
  onDoorSplitSelection,
  onDrawerStackSelection,
  onFaceFitSelection,
  onInsideFitSelection,
  onBuildSimpleTable,
  onBuildCabinetBox,
  onBuildCabinetShelfLayout,
  onBuildCabinetInteriorPreset,
  onBuildCabinetDoorLayout,
  onBuildCabinetDrawerLayout,
  onBuildCabinetFrontPreset,
  onBuildCabinetCustomBayFronts,
  onBuildCabinetCustomCellFronts,
  canBuildSimpleTable = false,
  canBuildCabinetBox = false,
  canBuildCabinetShelfLayout = false,
  canBuildCabinetInteriorPreset = false,
  canBuildCabinetDoorLayout = false,
  canBuildCabinetDrawerLayout = false,
  canBuildCabinetFrontPreset = false,
  canBuildCabinetCustomBayFronts = false,
  canBuildCabinetCustomCellFronts = false,
  designValidationReport = null,
  showLibraryPanel = true,
}) {
  const [activeLeftPanel, setActiveLeftPanel] = useState(
    showLibraryPanel ? "library" : null,
  );
  const [activeInspectorTab, setActiveInspectorTab] = useState("properties");
  const [activeToolTab, setActiveToolTab] = useState("builders");
  const [isLibraryDragPlacing, setIsLibraryDragPlacing] = useState(false);
  const [isExploded3D, setIsExploded3D] = useState(false);
  const [explodeStrength, setExplodeStrength] = useState(55);
  const [doorPreviewOpenId, setDoorPreviewOpenId] = useState(null);
  const doorPreviewRef = useRef(null);
  const doorPreviewAnimationRef = useRef(0);

  const [drawerPreviewOpenId, setDrawerPreviewOpenId] = useState(null);
  const drawerPreviewRef = useRef(null);
  const drawerPreviewAnimationRef = useRef(0);
  const clearDrawerPreviewRef = useRef(null);

  useEffect(() => {
    if (!showLibraryPanel && activeLeftPanel === "library") {
      setActiveLeftPanel(null);
    }
  }, [showLibraryPanel, activeLeftPanel]);

  const selectedCustomProfileId = isWoodworkingProfileComponent(selectedComp)
    ? selectedComp?.id || null
    : null;

  useEffect(() => {
    if (!selectedCustomProfileId) return;

    // From-scratch custom-part workflow: after placing/selecting a profile
    // board, expose Geometry / Cutouts / Woodworking Operations immediately.
    // Depend only on the selected id so normal property edits do not keep
    // forcing the user away from another inspector tab.
    setActiveInspectorTab("properties");
  }, [selectedCustomProfileId]);

  const openCabinetBuilderShortcut = useCallback(() => {
    setActiveInspectorTab("smartbuild");
    setActiveToolTab("builders");
  }, []);

  const onPushHistoryRef = useRef(onPushHistory);
  const onBeforeDragRef = useRef(null);

  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const pendingPlacementRef = useRef(pendingPlacement);
  const previewObjectRef = useRef(null);
  const previewPlacementRef = useRef(null);
  const libraryPlacementDragRef = useRef({
    active: false,
    startedInsideCanvas: false,
    item: null,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    moved: false,
  });

  const cameraRef = useRef(null);
  const orbitRef = useRef(null);
  const transformRef = useRef(null);
  const rootGroupRef = useRef(null);
  const previewGroupRef = useRef(null);
  const selectionPivotRef = useRef(null);
  const multiTransformStateRef = useRef(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const entryMapRef = useRef(new Map());
  const selectableMeshesRef = useRef([]);

  const selectedIdRef = useRef(selectedId);
  const edit3DIdRef = useRef(edit3DId);
  const transformModeRef = useRef(transformMode);
  const editorModeRef = useRef(editorMode);
  const setTransformModeRef = useRef(setTransformMode);
  const onCancelPlacementRef = useRef(onCancelPlacement);
  const isExploded3DRef = useRef(false);

  const selectedIdsRef = useRef(selectedIds || []);

  const onUpdateCompRef = useRef(onUpdateComp);
  const onBatchUpdateCompsRef = useRef(onBatchUpdateComps);
  const onPlaceComponentRef = useRef(onPlaceComponent);
  const setSelectedIdRef = useRef(setSelectedId);
  const setEdit3DIdRef = useRef(setEdit3DId);
  const setSelectedIdsRef = useRef(setSelectedIds);
  const componentsRef = useRef(components);

  const didInitialFitRef = useRef(false);
  const initialSceneObjectCountRef = useRef(null);
  const selectionOutlineGroupRef = useRef(null);

  const cameraViewRef = useRef(null);
  const restoreRafRef = useRef(0);
  const keysRef = useRef({});
  const moveEnabledRef = useRef(false);
  const lastFrameRef = useRef(performance.now());
  const isNormalizingScalePreviewRef = useRef(false);

  // --- NEW: 3D Selection Box State (Fixed with Ref) ---
  const [selectionRect, setSelectionRect] = useState(null);
  const selectionRectRef = useRef(null);
  const isSelectingRef = useRef(false);
  const startPointRef = useRef({ x: 0, y: 0 });

  const [liveSelectedComp, setLiveSelectedComp] = useState(null);
  const [resizeAnchors, setResizeAnchors] = useState({
    ...DEFAULT_RESIZE_ANCHORS,
  });
  const resizeAnchorsRef = useRef({ ...DEFAULT_RESIZE_ANCHORS });
  const singleScaleStateRef = useRef(null);

  const handleResizeAnchorChange = useCallback((axis, value) => {
    if (!["width", "height", "depth"].includes(axis)) return;

    setResizeAnchors((current) => ({
      ...current,
      [axis]: value,
    }));
  }, []);

  const updateKeyboardCamera = useCallback((delta) => {
    if (!moveEnabledRef.current) return;

    moveCameraFromKeyboard({
      camera: cameraRef.current,
      orbit: orbitRef.current,
      keys: keysRef.current,
      delta,
    });
  }, []);

  const clearKeys = useCallback(() => {
    keysRef.current = {};
  }, []);

  const getPlacementDims = useCallback(
    (typeDef = {}) => ({
      width: Math.max(
        GRID_SIZE,
        snap(Number(typeDef?.w ?? typeDef?.width ?? 800) || 800),
      ),
      height: Math.max(
        GRID_SIZE,
        snap(Number(typeDef?.h ?? typeDef?.height ?? 900) || 900),
      ),
      depth: Math.max(
        GRID_SIZE,
        snap(Number(typeDef?.d ?? typeDef?.depth ?? 600) || 600),
      ),
    }),
    [],
  );

  const isTemplatePlacementType = useCallback(
    (typeDef = {}) =>
      FURNITURE_TEMPLATE_SET.has(typeDef?.type) ||
      typeDef?.type === "chair_template",
    [],
  );

  const disposePlacementPreview = useCallback(() => {
    const preview = previewObjectRef.current;
    if (!preview) return;

    if (preview.parent) {
      preview.parent.remove(preview);
    }

    preview.traverse?.((obj) => {
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((mat) => mat?.dispose?.());
      } else {
        obj.material?.dispose?.();
      }
    });

    previewObjectRef.current = null;
  }, []);

  const ensurePlacementPreview = useCallback(
    (typeDef) => {
      if (!typeDef || !previewGroupRef.current) return null;

      const currentPreview = previewObjectRef.current;
      if (currentPreview?.userData?.previewType === typeDef.type) {
        return currentPreview;
      }

      disposePlacementPreview();

      const { width, height, depth } = getPlacementDims(typeDef);
      const templateLike = isTemplatePlacementType(typeDef);

      let preview = null;

      if (templateLike) {
        const previewRoot = new THREE.Group();
        previewRoot.name = "placement-preview";
        previewRoot.userData.isPlacementPreview = true;
        previewRoot.userData.previewType = typeDef.type;

        const previewOriginX = 0;
        const previewOriginZ = 0;

        let previewParts = [];

        if (FURNITURE_TEMPLATE_SET.has(typeDef.type)) {
          previewParts = buildFurnitureTemplateParts({
            templateType: typeDef.type,
            buildId: "preview-build",
            originX: previewOriginX,
            originZ: previewOriginZ,
            canvasH,
            groupLabel: typeDef.label || "Preview",
          });
        } else if (typeDef.type === "chair_template") {
          const builtChair = buildDiningChairParts({
            buildId: "preview-chair",
            originX: previewOriginX,
            originZ: previewOriginZ,
            canvasH,
            groupLabel: typeDef.label || "Preview Chair",
          });

          previewParts = Array.isArray(builtChair?.parts)
            ? builtChair.parts
            : [];
        }

        previewParts.forEach((rawPart) => {
          const part = normalizeComponent({
            ...rawPart,
            locked: true,
          });

          const partObj = createFurnitureObject(part, false, false, []);
          partObj.userData.isPlacementPreviewPart = true;

          const localX = snap(part.x + part.width / 2 - previewOriginX);
          const localY = snap(canvasH / 2 - (part.y + part.height / 2));
          const localZ = snap(part.z + part.depth / 2 - previewOriginZ);

          partObj.position.set(localX, localY, localZ);
          partObj.rotation.x = THREE.MathUtils.degToRad(part.rotationX || 0);
          partObj.rotation.y = THREE.MathUtils.degToRad(part.rotationY || 0);
          partObj.rotation.z = THREE.MathUtils.degToRad(part.rotationZ || 0);
          partObj.scale.set(1, 1, 1);

          previewRoot.add(partObj);
        });

        preview = previewRoot;
      } else {
        const previewComp = normalizeComponent({
          id: `preview-${typeDef.type || "component"}`,
          type: typeDef.type,
          label: typeDef.label || "Preview",
          category: typeDef.category,
          blueprintStyle: typeDef.blueprintStyle,
          x: snap(canvasW / 2 - width / 2),
          y: snap(canvasH - FLOOR_OFFSET - height),
          z: snap(canvasD / 2 - depth / 2),
          width,
          height,
          depth,
          rotationY: Number(typeDef.rotationY) || 0,
          fill: typeDef.fill || "#60a5fa",
          material: typeDef.material || "Preview",
          finish: typeDef.finish || "",
          qty: 1,
          locked: true,
        });

        preview = createFurnitureObject(previewComp, false, false, []);
        preview.name = "placement-preview";
        preview.userData.isPlacementPreview = true;
        preview.userData.previewType = typeDef.type;
      }

      preview.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }

        const mats = Array.isArray(obj.material)
          ? obj.material
          : obj.material
            ? [obj.material]
            : [];

        mats.forEach((mat) => {
          mat.transparent = true;
          mat.opacity = templateLike ? 0.62 : 0.5;
          mat.depthWrite = false;
          mat.toneMapped = false;
          if (mat.emissive) {
            mat.emissive = new THREE.Color(0x60a5fa);
            mat.emissiveIntensity = templateLike ? 0.18 : 0.45;
          }
        });
      });

      previewGroupRef.current.add(preview);
      previewObjectRef.current = preview;
      return preview;
    },
    [
      canvasW,
      canvasH,
      canvasD,
      disposePlacementPreview,
      getPlacementDims,
      isTemplatePlacementType,
    ],
  );

  const updatePlacementPreview = useCallback(
    (placement, typeDef = pendingPlacementRef.current) => {
      if (!typeDef) {
        disposePlacementPreview();
        return;
      }

      const preview = ensurePlacementPreview(typeDef);
      if (!preview) return;

      if (!placement) {
        preview.visible = false;
        return;
      }

      const { width, height, depth } = getPlacementDims(typeDef);
      const templateLike = isTemplatePlacementType(typeDef);

      preview.visible = true;
      preview.position.set(
        snap(placement.worldX + (templateLike ? width / 2 : 0)),
        templateLike ? 0 : -canvasH / 2 + height / 2,
        snap(placement.worldZ + (templateLike ? depth / 2 : 0)),
      );
      preview.rotation.set(
        0,
        THREE.MathUtils.degToRad(Number(typeDef.rotationY) || 0),
        0,
      );
      preview.updateMatrixWorld(true);
    },
    [
      canvasH,
      disposePlacementPreview,
      ensurePlacementPreview,
      getPlacementDims,
      isTemplatePlacementType,
    ],
  );

  const resetLibraryPlacementDrag = useCallback(
    ({ disposePreview = true } = {}) => {
      libraryPlacementDragRef.current = {
        active: false,
        startedInsideCanvas: false,
        item: null,
        pointerId: null,
        startClientX: 0,
        startClientY: 0,
        moved: false,
      };

      setIsLibraryDragPlacing(false);
      previewPlacementRef.current = null;

      if (disposePreview) {
        disposePlacementPreview();
      }

      if (orbitRef.current && !transformRef.current?.dragging) {
        orbitRef.current.enabled = true;
      }
    },
    [disposePlacementPreview],
  );

  const getVisibleSpawnPlacement = useCallback(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;

    const fallback = {
      worldX: snap((orbitRef.current?.target?.x || 0) - canvasW * 0.12),
      worldZ: snap((orbitRef.current?.target?.z || 0) - canvasD * 0.08),
    };

    if (!renderer || !camera) {
      return fallback;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), canvasH / 2);
    const hitPoint = new THREE.Vector3();
    const candidateRatios = [
      [0.32, 0.42],
      [0.38, 0.46],
      [0.46, 0.5],
      [0.55, 0.52],
    ];

    for (const [rx, ry] of candidateRatios) {
      mouseRef.current.x = rx * 2 - 1;
      mouseRef.current.y = -(ry * 2) + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      if (raycasterRef.current.ray.intersectPlane(floorPlane, hitPoint)) {
        return {
          worldX: snap(hitPoint.x),
          worldZ: snap(hitPoint.z),
        };
      }
    }

    return fallback;
  }, [canvasH, canvasW, canvasD]);

  const startLibraryPlacementDrag = useCallback(
    (item, event) => {
      if (!item) return;

      event?.preventDefault?.();
      event?.stopPropagation?.();

      const pointerId =
        event?.pointerId ?? event?.nativeEvent?.pointerId ?? null;

      const spawnPlacement = getVisibleSpawnPlacement() || {
        worldX: 0,
        worldZ: 0,
      };

      previewPlacementRef.current = spawnPlacement;

      libraryPlacementDragRef.current = {
        active: true,
        startedInsideCanvas: false,
        item,
        pointerId,
        startClientX: event?.clientX ?? 0,
        startClientY: event?.clientY ?? 0,
        moved: false,
      };

      setIsLibraryDragPlacing(true);

      addComponent?.(item, {
        source: "drag",
        silent: true,
      });

      updatePlacementPreview(spawnPlacement, item);

      if (orbitRef.current && !transformRef.current?.dragging) {
        orbitRef.current.enabled = false;
      }
    },
    [addComponent, getVisibleSpawnPlacement, updatePlacementPreview],
  );
  useEffect(() => {
    pendingPlacementRef.current = pendingPlacement;

    if (!pendingPlacement) {
      previewPlacementRef.current = null;
      disposePlacementPreview();
      return;
    }

    const preview = ensurePlacementPreview(pendingPlacement);
    if (!preview) return;

    const currentPlacement =
      previewPlacementRef.current || getVisibleSpawnPlacement();

    previewPlacementRef.current = currentPlacement;
    updatePlacementPreview(currentPlacement, pendingPlacement);
  }, [
    pendingPlacement,
    ensurePlacementPreview,
    updatePlacementPreview,
    disposePlacementPreview,
    getVisibleSpawnPlacement,
  ]);

  const handleKeyDown = useCallback(
    (e) => {
      if (isTypingElement(document.activeElement)) return;

      const currentPendingPlacement = pendingPlacementRef.current;
      const currentEditorMode = editorModeRef.current;

      const currentId = selectedIdRef.current;
      const allCurrentComponents = componentsRef.current || [];
      const currentComp = currentId
        ? allCurrentComponents.find((item) => item.id === currentId)
        : null;

      const activeSelectionIds = Array.from(
        new Set(
          [selectedIdRef.current, ...(selectedIdsRef.current || [])].filter(
            Boolean,
          ),
        ),
      );

      const selectionHasLockedItem = activeSelectionIds.some((id) => {
        const comp = allCurrentComponents.find((item) => item.id === id);
        return comp ? isLocked3DRef.current(comp) : false;
      });

      const hasEditableSelection =
        !isExploded3DRef.current &&
        currentEditorMode === "editable" &&
        !!currentId &&
        !!currentComp &&
        !selectionHasLockedItem &&
        !isLocked3DRef.current(currentComp);

      if (currentPendingPlacement && e.key === "Escape") {
        e.preventDefault();
        onCancelPlacementRef.current?.();
        return;
      }

      if (hasEditableSelection && !e.ctrlKey && !e.metaKey) {
        const key = String(e.key || "").toLowerCase();

        if (key === "g") {
          e.preventDefault();
          setTransformModeRef.current?.("translate");
          return;
        }

        if (key === "r") {
          e.preventDefault();
          setTransformModeRef.current?.("rotate");
          return;
        }

        if (key === "t") {
          e.preventDefault();
          setTransformModeRef.current?.("scale");
          return;
        }

        if (currentComp.type === "rounded_box") {
          const applyBoxUpdate = (attrs) => {
            if (!attrs) return;
            onUpdateCompRef.current?.(currentId, attrs);
          };

          const selectedFace = currentComp.selectedFace || "top";
          const selectedFaceCap = `${selectedFace.charAt(0).toUpperCase()}${selectedFace.slice(1)}`;

          const selectedFaceField = `faceOpen${selectedFaceCap}`;
          const selectedFaceInsetField = `faceInset${selectedFaceCap}`;
          const selectedFaceExtrudeField = `faceExtrude${selectedFaceCap}`;

          const hasAnyOpenFace = [
            currentComp.faceOpenTop,
            currentComp.faceOpenBottom,
            currentComp.faceOpenFront,
            currentComp.faceOpenBack,
            currentComp.faceOpenLeft,
            currentComp.faceOpenRight,
          ].some(Boolean);

          const hasAnyFaceEdit = [
            currentComp.faceInsetTop,
            currentComp.faceInsetBottom,
            currentComp.faceInsetFront,
            currentComp.faceInsetBack,
            currentComp.faceInsetLeft,
            currentComp.faceInsetRight,
            currentComp.faceExtrudeTop,
            currentComp.faceExtrudeBottom,
            currentComp.faceExtrudeFront,
            currentComp.faceExtrudeBack,
            currentComp.faceExtrudeLeft,
            currentComp.faceExtrudeRight,
          ].some((value) => Number(value) > 0);

          const clearAllRoundedBoxFaces = {
            faceOpenTop: false,
            faceOpenBottom: false,
            faceOpenFront: false,
            faceOpenBack: false,
            faceOpenLeft: false,
            faceOpenRight: false,
          };

          const clearAllRoundedBoxFaceEdits = {
            faceInsetTop: 0,
            faceInsetBottom: 0,
            faceInsetFront: 0,
            faceInsetBack: 0,
            faceInsetLeft: 0,
            faceInsetRight: 0,
            faceExtrudeTop: 0,
            faceExtrudeBottom: 0,
            faceExtrudeFront: 0,
            faceExtrudeBack: 0,
            faceExtrudeLeft: 0,
            faceExtrudeRight: 0,
          };

          const faceNumberMap = {
            1: "top",
            2: "front",
            3: "right",
            4: "back",
            5: "left",
            6: "bottom",
          };

          if (faceNumberMap[e.key]) {
            e.preventDefault();
            applyBoxUpdate({
              selectedFace: faceNumberMap[e.key],
            });
            return;
          }

          if (key === "h") {
            e.preventDefault();

            if (currentComp.isHollow || hasAnyOpenFace || hasAnyFaceEdit) {
              applyBoxUpdate({
                isHollow: false,
                ...clearAllRoundedBoxFaces,
                ...clearAllRoundedBoxFaceEdits,
              });
            } else {
              applyBoxUpdate({
                isHollow: true,
              });
            }
            return;
          }

          if (key === "o") {
            e.preventDefault();
            applyBoxUpdate({
              isHollow: true,
              [selectedFaceField]: !currentComp[selectedFaceField],
            });
            return;
          }

          if (key === "j" || key === "k") {
            e.preventDefault();

            const direction = key === "k" ? 1 : -1;
            const currentInset =
              Number(currentComp[selectedFaceInsetField]) || 0;

            const maxInset =
              selectedFace === "top" || selectedFace === "bottom"
                ? Math.max(
                    0,
                    Math.floor(
                      Math.min(currentComp.width, currentComp.depth) / 2,
                    ) - 20,
                  )
                : selectedFace === "front" || selectedFace === "back"
                  ? Math.max(
                      0,
                      Math.floor(
                        Math.min(currentComp.width, currentComp.height) / 2,
                      ) - 20,
                    )
                  : Math.max(
                      0,
                      Math.floor(
                        Math.min(currentComp.depth, currentComp.height) / 2,
                      ) - 20,
                    );

            applyBoxUpdate({
              isHollow: true,
              [selectedFaceInsetField]: Math.max(
                0,
                Math.min(maxInset, currentInset + direction * 5),
              ),
            });
            return;
          }

          if (key === "n" || key === "m") {
            e.preventDefault();

            const direction = key === "m" ? 1 : -1;
            const currentExtrude =
              Number(currentComp[selectedFaceExtrudeField]) || 0;

            const maxExtrude =
              selectedFace === "top" || selectedFace === "bottom"
                ? Math.max(0, Math.floor(currentComp.height) - 20)
                : selectedFace === "front" || selectedFace === "back"
                  ? Math.max(0, Math.floor(currentComp.depth) - 20)
                  : Math.max(0, Math.floor(currentComp.width) - 20);

            applyBoxUpdate({
              isHollow: true,
              [selectedFaceExtrudeField]: Math.max(
                0,
                Math.min(maxExtrude, currentExtrude + direction * 5),
              ),
            });
            return;
          }

          if (e.key === "[" || e.key === "]") {
            e.preventDefault();

            const direction = e.key === "]" ? 1 : -1;
            const currentRadius = Number(currentComp.cornerRadius) || 0;
            const currentWall = Number(currentComp.wallThickness) || 20;
            const currentBottom = Number(currentComp.bottomThickness) || 20;

            const maxWall = Math.max(
              20,
              Math.floor(Math.min(currentComp.width, currentComp.depth) / 2) -
                10,
            );

            const maxBottom = Math.max(20, Math.floor(currentComp.height) - 20);

            if (e.altKey) {
              applyBoxUpdate({
                cornerRadius: Math.max(
                  0,
                  Math.min(500, currentRadius + direction * 5),
                ),
              });
              return;
            }

            if (e.shiftKey) {
              applyBoxUpdate({
                bottomThickness: Math.max(
                  10,
                  Math.min(maxBottom, currentBottom + direction * 5),
                ),
              });
              return;
            }

            applyBoxUpdate({
              wallThickness: Math.max(
                10,
                Math.min(maxWall, currentWall + direction * 5),
              ),
            });
            return;
          }
        }
      }

      if (!moveEnabledRef.current) return;

      keysRef.current[e.code] = true;

      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "KeyQ",
          "KeyE",
          "ShiftLeft",
          "ShiftRight",
        ].includes(e.code)
      ) {
        e.preventDefault();
      }
    },
    [isTypingElement],
  );

  const handleKeyUp = useCallback((e) => {
    delete keysRef.current[e.code];
  }, []);

  useEffect(() => {
    onPushHistoryRef.current = onPushHistory;
  }, [onPushHistory]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds || [];
  }, [selectedIds]);

  useEffect(() => {
    edit3DIdRef.current = edit3DId;
  }, [edit3DId]);

  useEffect(() => {
    setSelectedIdsRef.current = setSelectedIds;
  }, [setSelectedIds]);

  useEffect(() => {
    componentsRef.current = components;
  }, [components]);

  useEffect(() => {
    transformModeRef.current = transformMode;
  }, [transformMode]);

  useEffect(() => {
    resizeAnchorsRef.current = { ...resizeAnchors };
  }, [resizeAnchors]);

  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  useEffect(() => {
    isExploded3DRef.current = isExploded3D;
  }, [isExploded3D]);

  useEffect(() => {
    setTransformModeRef.current = setTransformMode;
  }, [setTransformMode]);

  useEffect(() => {
    onCancelPlacementRef.current = onCancelPlacement;
  }, [onCancelPlacement]);

  useEffect(() => {
    onUpdateCompRef.current = onUpdateComp;
  }, [onUpdateComp]);

  useEffect(() => {
    onBatchUpdateCompsRef.current = onBatchUpdateComps;
  }, [onBatchUpdateComps]);

  useEffect(() => {
    onPlaceComponentRef.current = onPlaceComponent;
  }, [onPlaceComponent]);

  useEffect(() => {
    setSelectedIdRef.current = setSelectedId;
  }, [setSelectedId]);

  useEffect(() => {
    setEdit3DIdRef.current = setEdit3DId;
  }, [setEdit3DId]);

  useEffect(() => {
    pendingPlacementRef.current = pendingPlacement;
  }, [pendingPlacement]);

  const isLocked3D = useCallback(
    (comp) =>
      comp.locked ||
      lockedFields.includes(comp.type) ||
      lockedFields.includes("all"),
    [lockedFields],
  );

  const isLocked3DRef = useRef(isLocked3D);
  useEffect(() => {
    isLocked3DRef.current = isLocked3D;
  }, [isLocked3D]);

  const worldFromComp = useCallback(
    (comp) => ({
      x: comp.x + comp.width / 2 - canvasW / 2,
      y: canvasH / 2 - (comp.y + comp.height / 2),
      z: comp.z + comp.depth / 2 - canvasD / 2,
    }),
    [canvasW, canvasH, canvasD],
  );

  const compFromWorld = useCallback(
    (obj, comp, modeOverride = null) => {
      const mode = modeOverride || transformModeRef.current || "translate";
      const isScaleMode = mode === "scale";
      const isRotateMode = mode === "rotate";

      const width = isScaleMode
        ? normalizeDimensionMm(
            Math.abs(comp.width * obj.scale.x),
            MIN_COMPONENT_DIMENSION_MM,
          )
        : normalizeDimensionMm(comp.width, MIN_COMPONENT_DIMENSION_MM);
      const height = isScaleMode
        ? normalizeDimensionMm(
            Math.abs(comp.height * obj.scale.y),
            MIN_COMPONENT_DIMENSION_MM,
          )
        : normalizeDimensionMm(comp.height, MIN_COMPONENT_DIMENSION_MM);
      const depth = isScaleMode
        ? normalizeDimensionMm(
            Math.abs(comp.depth * obj.scale.z),
            MIN_COMPONENT_DIMENSION_MM,
          )
        : normalizeDimensionMm(comp.depth, MIN_COMPONENT_DIMENSION_MM);

      const rawX = obj.position.x - width / 2 + canvasW / 2;
      const rawY = canvasH / 2 - obj.position.y - height / 2;
      const rawZ = obj.position.z - depth / 2 + canvasD / 2;

      return {
        // TransformControls already applies the 20 mm translation snap while
        // dragging. Persist the resulting top-left coordinates at 1 mm
        // precision so resize and multi-part rotation do not independently
        // shift every component when React rebuilds the scene.
        x: roundToPrecision(rawX),
        y: roundToPrecision(rawY),
        z: roundToPrecision(rawZ),
        rotationX: isRotateMode
          ? roundToPrecision(THREE.MathUtils.radToDeg(obj.rotation.x), 0.1)
          : roundToPrecision(comp.rotationX || 0, 0.1),
        rotationY: isRotateMode
          ? roundToPrecision(THREE.MathUtils.radToDeg(obj.rotation.y), 0.1)
          : roundToPrecision(comp.rotationY || 0, 0.1),
        rotationZ: isRotateMode
          ? roundToPrecision(THREE.MathUtils.radToDeg(obj.rotation.z), 0.1)
          : roundToPrecision(comp.rotationZ || 0, 0.1),
        width,
        height,
        depth,
      };
    },
    [canvasW, canvasH, canvasD],
  );

  const getAnchoredScaleUpdates = useCallback(
    (obj, comp, stateOverride = null) => {
      if (!obj || !comp) return null;

      const state = stateOverride || singleScaleStateRef.current;
      const baseComp = state?.id === comp.id && state?.comp ? state.comp : comp;
      const startScale = state?.startScale || new THREE.Vector3(1, 1, 1);

      const safeStartScaleX = Math.abs(startScale.x) > 1e-6 ? startScale.x : 1;
      const safeStartScaleY = Math.abs(startScale.y) > 1e-6 ? startScale.y : 1;
      const safeStartScaleZ = Math.abs(startScale.z) > 1e-6 ? startScale.z : 1;

      const width = normalizeDimensionMm(
        Math.abs(baseComp.width * (obj.scale.x / safeStartScaleX)),
        MIN_COMPONENT_DIMENSION_MM,
      );
      const height = normalizeDimensionMm(
        Math.abs(baseComp.height * (obj.scale.y / safeStartScaleY)),
        MIN_COMPONENT_DIMENSION_MM,
      );
      const depth = normalizeDimensionMm(
        Math.abs(baseComp.depth * (obj.scale.z / safeStartScaleZ)),
        MIN_COMPONENT_DIMENSION_MM,
      );

      return buildAnchoredResizeUpdates({
        comp: baseComp,
        nextWidth: width,
        nextHeight: height,
        nextDepth: depth,
        anchors: state?.anchors || resizeAnchorsRef.current,
        canvasW,
        canvasH,
        canvasD,
        quaternion: state?.quaternion || obj.quaternion,
      });
    },
    [canvasW, canvasH, canvasD],
  );

  const normalizeSingleScalePreview = useCallback(
    (obj, comp) => {
      if (!obj || !comp) return null;

      const updates =
        getAnchoredScaleUpdates(obj, comp) || compFromWorld(obj, comp, "scale");

      if (!updates) return null;

      const scaleState = singleScaleStateRef.current;
      const baseComp =
        scaleState?.id === comp.id && scaleState?.comp ? scaleState.comp : comp;

      const previewComp = normalizeComponent({
        ...baseComp,
        ...updates,
      });
      const previewWorld = worldFromComp(previewComp);

      // TransformControls scales around the object's center. Reposition that
      // center during the drag so the selected resize face stays fixed in
      // world space instead of correcting only after pointer release.
      obj.position.set(previewWorld.x, previewWorld.y, previewWorld.z);
      obj.updateMatrixWorld(true);

      return updates;
    },
    [compFromWorld, getAnchoredScaleUpdates, worldFromComp],
  );

  const handleResizeDimensionChange = useCallback(
    (id, key, nextValue) => {
      if (!id || !["width", "height", "depth"].includes(key)) return;
      if (isExploded3DRef.current) return;
      if (editorModeRef.current !== "editable") return;

      const comp = (componentsRef.current || []).find((item) => item.id === id);
      if (!comp || isLocked3DRef.current(comp)) return;

      const normalizedValue = normalizeDimensionMm(
        nextValue,
        MIN_COMPONENT_DIMENSION_MM,
      );

      const updates = buildAnchoredResizeUpdates({
        comp,
        nextWidth: key === "width" ? normalizedValue : comp.width,
        nextHeight: key === "height" ? normalizedValue : comp.height,
        nextDepth: key === "depth" ? normalizedValue : comp.depth,
        anchors: resizeAnchorsRef.current,
        canvasW,
        canvasH,
        canvasD,
      });

      if (updates) {
        onUpdateCompRef.current?.(id, updates);
      }
    },
    [canvasW, canvasH, canvasD],
  );

  const clearLiveSelectedComp = useCallback(() => {
    setLiveSelectedComp(null);
  }, []);

  const syncLiveSelectedCompFromObject = useCallback(
    (targetId, objOverride = null, compOverride = null) => {
      const id = targetId || selectedIdRef.current;
      if (!id) {
        setLiveSelectedComp(null);
        return;
      }

      const entry = entryMapRef.current.get(id);
      const obj = objOverride || entry?.obj;
      const comp = compOverride || entry?.comp;

      if (!obj || !comp) {
        setLiveSelectedComp(null);
        return;
      }

      const updates =
        transformModeRef.current === "scale"
          ? normalizeSingleScalePreview(obj, comp)
          : compFromWorld(obj, comp);

      setLiveSelectedComp(
        normalizeComponent({
          ...comp,
          ...(updates || {}),
        }),
      );
    },
    [compFromWorld, normalizeSingleScalePreview],
  );

  const getActiveSelectionIds = useCallback(() => {
    const ids = Array.from(
      new Set((selectedIdsRef.current || []).filter(Boolean)),
    );
    if (ids.length) return ids;
    return selectedIdRef.current ? [selectedIdRef.current] : [];
  }, []);

  const activeSelectionIds3D = useMemo(() => {
    const ids = Array.from(new Set((selectedIds || []).filter(Boolean)));
    if (ids.length) return ids;
    return selectedId ? [selectedId] : [];
  }, [selectedId, selectedIds]);
  const selectedDoorPreviewComp = useMemo(() => {
    if (activeSelectionIds3D.length !== 1) return null;

    const activeId = activeSelectionIds3D[0];
    const component =
      (components || []).find((item) => item.id === activeId) || null;

    return isDoorPreviewComponent(component) ? component : null;
  }, [activeSelectionIds3D, components]);

  const doorPreviewControlComp = useMemo(() => {
    if (doorPreviewOpenId) {
      const openComponent =
        (components || []).find((item) => item.id === doorPreviewOpenId) ||
        null;

      if (openComponent) return openComponent;
    }

    return selectedDoorPreviewComp;
  }, [doorPreviewOpenId, components, selectedDoorPreviewComp]);

  const clearDoorPreview = useCallback(({ updateState = true } = {}) => {
    if (doorPreviewAnimationRef.current) {
      cancelAnimationFrame(doorPreviewAnimationRef.current);
      doorPreviewAnimationRef.current = 0;
    }

    const preview = doorPreviewRef.current;

    const originals =
      preview?.originals ||
      (preview?.original
        ? [{ object: preview.original, visible: true }]
        : []);

    originals.forEach(({ object, visible }) => {
      if (object) {
        object.visible = visible;
      }
    });

    if (preview?.pivot?.parent) {
      preview.pivot.parent.remove(preview.pivot);
    }

    if (preview?.transform && typeof preview.transformVisible === "boolean") {
      preview.transform.visible = preview.transformVisible;
    }

    if (preview?.outlineGroup && typeof preview.outlineVisible === "boolean") {
      preview.outlineGroup.visible = preview.outlineVisible;
    }

    doorPreviewRef.current = null;

    if (updateState) {
      setDoorPreviewOpenId(null);
    }
  }, []);

  const animateDoorPreviewTo = useCallback((targetAngle, onDone = null) => {
    const preview = doorPreviewRef.current;
    if (!preview?.pivot) return;

    if (doorPreviewAnimationRef.current) {
      cancelAnimationFrame(doorPreviewAnimationRef.current);
    }

    const startAngle = Number(preview.currentAngle || 0);

    const destination = Number(targetAngle || 0);

    const startedAt = performance.now();

    const step = (now) => {
      const current = doorPreviewRef.current;

      if (!current || current !== preview || !current.pivot) {
        doorPreviewAnimationRef.current = 0;
        return;
      }

      const progress = Math.min(
        1,
        Math.max(0, (now - startedAt) / DOOR_PREVIEW_DURATION_MS),
      );

      const eased = easeOutCubic(progress);

      current.currentAngle = startAngle + (destination - startAngle) * eased;

      const localTurn = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        current.direction * current.currentAngle,
      );

      current.pivot.quaternion
        .copy(current.basePivotQuaternion)
        .multiply(localTurn);

      current.pivot.updateMatrixWorld(true);

      if (progress < 1) {
        doorPreviewAnimationRef.current = requestAnimationFrame(step);
        return;
      }

      current.currentAngle = destination;
      doorPreviewAnimationRef.current = 0;
      onDone?.();
    };

    doorPreviewAnimationRef.current = requestAnimationFrame(step);
  }, []);

  const createDoorPreview = useCallback(
    (component) => {
      if (!component?.id) return false;

      clearDrawerPreviewRef.current?.();
      clearDoorPreview();

      const sourceComponents = componentsRef.current || [];
      const manualSet = resolveManualMotionSet(
        component,
        sourceComponents,
        "door",
      );

      const members =
        manualSet.members.length > 0
          ? manualSet.members
          : [component];

      const referenceComponent =
        manualSet.reference || component;

      const memberEntries = members.map((member) => ({
        member,
        entry: entryMapRef.current.get(member.id),
      }));

      if (
        memberEntries.some(
          ({ entry }) => !entry?.obj?.parent,
        )
      ) {
        return false;
      }

      const parent =
        memberEntries[0]?.entry?.obj?.parent || null;

      if (
        !parent ||
        memberEntries.some(
          ({ entry }) => entry.obj.parent !== parent,
        )
      ) {
        return false;
      }

      const referenceEntry =
        entryMapRef.current.get(referenceComponent.id) ||
        memberEntries[0]?.entry;

      const referenceOriginal = referenceEntry?.obj;
      if (!referenceOriginal) return false;

      const explicitHingeComponent = [
        referenceComponent,
        component,
        ...members,
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

        return (
          value.startsWith("l") ||
          value.startsWith("r")
        );
      });

      const hingeSide = explicitHingeComponent
        ? String(
            explicitHingeComponent.doorHinge ??
              explicitHingeComponent.door_hinge ??
              explicitHingeComponent.hingeSide ??
              explicitHingeComponent.hinge_side ??
              "",
          )
            .trim()
            .toLowerCase()
            .startsWith("r")
          ? "right"
          : "left"
        : resolveDoorPreviewHingeSide(
            referenceComponent,
            sourceComponents,
          );

      const width = Math.max(
        1,
        Number(referenceComponent?.width || 1),
      );

      const localHingeOffset = new THREE.Vector3(
        hingeSide === "right"
          ? width / 2
          : -width / 2,
        0,
        0,
      );

      const hingePosition = referenceOriginal.position
        .clone()
        .add(
          localHingeOffset
            .clone()
            .applyQuaternion(
              referenceOriginal.quaternion,
            ),
        );

      const pivot = new THREE.Group();
      pivot.name =
        `door-preview-pivot-${manualSet.groupId || component.id}`;
      pivot.position.copy(hingePosition);
      pivot.quaternion.copy(
        referenceOriginal.quaternion,
      );

      parent.add(pivot);
      parent.updateMatrixWorld(true);
      pivot.updateMatrixWorld(true);

      const originals = [];
      const clones = [];

      memberEntries.forEach(({ member, entry }) => {
        const original = entry.obj;
        const clone = original.clone(true);

        clone.name =
          `door-preview-clone-${member.id}`;

        clone.traverse((child) => {
          child.userData = {
            ...(child.userData || {}),
            isDoorPreviewClone: true,
          };
        });

        clone.position.copy(original.position);
        clone.quaternion.copy(original.quaternion);
        clone.scale.copy(original.scale);

        parent.add(clone);

        parent.updateMatrixWorld(true);
        pivot.updateMatrixWorld(true);
        clone.updateMatrixWorld(true);

        // Attach every visual clone to one hinge pivot while preserving
        // its exact world transform. Saved Blueprint coordinates never move.
        pivot.attach(clone);
        pivot.updateMatrixWorld(true);

        originals.push({
          id: member.id,
          object: original,
          visible: original.visible,
        });

        clones.push({
          id: member.id,
          object: clone,
        });

        original.visible = false;
      });

      const transform = transformRef.current;
      const outlineGroup =
        selectionOutlineGroupRef.current;

      const transformVisible =
        typeof transform?.visible === "boolean"
          ? transform.visible
          : true;

      const outlineVisible =
        typeof outlineGroup?.visible === "boolean"
          ? outlineGroup.visible
          : true;

      if (transform) transform.visible = false;
      if (outlineGroup) {
        outlineGroup.visible = false;
      }

      doorPreviewRef.current = {
        id: component.id,
        groupId: manualSet.groupId || "",
        referenceId: referenceComponent.id,
        memberIds: members.map((item) => item.id),
        originals,
        clones,
        pivot,
        basePivotQuaternion:
          referenceOriginal.quaternion.clone(),
        direction:
          hingeSide === "right" ? 1 : -1,
        currentAngle: 0,
        componentSignature:
          getDoorPreviewComponentsSignature(members),
        transform,
        transformVisible,
        outlineGroup,
        outlineVisible,
      };

      setDoorPreviewOpenId(component.id);

      animateDoorPreviewTo(
        THREE.MathUtils.degToRad(
          DOOR_PREVIEW_OPEN_DEGREES,
        ),
      );

      return true;
    },
    [animateDoorPreviewTo, clearDoorPreview],
  );

  const toggleSelectedDoorPreview = useCallback(() => {
    // Manual close must work even after normal canvas clicks or a
    // selection change. Camera interaction never decides door state.
    const activePreview = doorPreviewRef.current;

    if (activePreview?.id && doorPreviewOpenId === activePreview.id) {
      animateDoorPreviewTo(0, () => {
        clearDoorPreview();
      });
      return;
    }

    const component = selectedDoorPreviewComp;

    if (!component?.id || isExploded3D) {
      return;
    }

    createDoorPreview(component);
  }, [
    selectedDoorPreviewComp,
    isExploded3D,
    doorPreviewOpenId,
    animateDoorPreviewTo,
    clearDoorPreview,
    createDoorPreview,
  ]);

  useEffect(() => {
    if (!doorPreviewRef.current) return;

    // Normal mouse/camera/selection interaction keeps the door open.
    // Exploded mode is a different visualization, so it closes preview.
    if (isExploded3D) {
      clearDoorPreview();
    }
  }, [isExploded3D, clearDoorPreview]);

  useEffect(() => {
    const preview = doorPreviewRef.current;
    if (!preview) return;

    const previewMemberIds =
      preview.memberIds?.length
        ? preview.memberIds
        : [preview.id];

    const previewDoorIsSelected =
      activeSelectionIds3D.some((id) =>
        previewMemberIds.includes(id),
      );

    // When another object is selected while the door stays open,
    // restore normal editor visuals for that new selection.
    if (preview.transform) {
      preview.transform.visible = previewDoorIsSelected
        ? false
        : preview.transformVisible;
    }

    if (preview.outlineGroup) {
      preview.outlineGroup.visible = previewDoorIsSelected
        ? false
        : preview.outlineVisible;
    }
  }, [activeSelectionIds3D, doorPreviewOpenId]);

  const openDoorPreviewComponentSignature = useMemo(() => {
    if (!doorPreviewOpenId) return "";

    const previewMemberIds =
      doorPreviewRef.current?.memberIds?.length
        ? doorPreviewRef.current.memberIds
        : [doorPreviewOpenId];

    const openMembers = (components || []).filter(
      (item) => previewMemberIds.includes(item.id),
    );

    return getDoorPreviewComponentsSignature(openMembers);
  }, [doorPreviewOpenId, components]);

  useEffect(() => {
    const preview = doorPreviewRef.current;
    if (!preview?.id) return;

    // React may provide a new components array after a normal mouse click or
    // selection change. That must not close the door. Close only if the actual
    // open-door component was removed or its real transform/geometry changed.
    if (
      !openDoorPreviewComponentSignature ||
      openDoorPreviewComponentSignature !== preview.componentSignature
    ) {
      clearDoorPreview();
    }
  }, [openDoorPreviewComponentSignature, clearDoorPreview]);

  useEffect(
    () => () => {
      clearDoorPreview({
        updateState: false,
      });
    },
    [clearDoorPreview],
  );

  const selectedDrawerPreviewComp = useMemo(() => {
    if (activeSelectionIds3D.length !== 1) return null;

    const activeId = activeSelectionIds3D[0];
    const component =
      (components || []).find((item) => item.id === activeId) || null;

    return isDrawerPreviewComponent(component) ? component : null;
  }, [activeSelectionIds3D, components]);

  const drawerPreviewControlComp = useMemo(() => {
    if (drawerPreviewOpenId) {
      const openComponent =
        (components || []).find((item) => item.id === drawerPreviewOpenId) ||
        null;

      if (openComponent) return openComponent;

      const fallbackId = drawerPreviewRef.current?.memberIds?.[0] || "";

      if (fallbackId) {
        const fallbackComponent =
          (components || []).find((item) => item.id === fallbackId) || null;

        if (fallbackComponent) {
          return fallbackComponent;
        }
      }
    }

    return selectedDrawerPreviewComp;
  }, [drawerPreviewOpenId, components, selectedDrawerPreviewComp]);

  const clearDrawerPreview = useCallback(({ updateState = true } = {}) => {
    if (drawerPreviewAnimationRef.current) {
      cancelAnimationFrame(drawerPreviewAnimationRef.current);
      drawerPreviewAnimationRef.current = 0;
    }

    const preview = drawerPreviewRef.current;

    (preview?.originals || []).forEach(({ object, visible }) => {
      if (object) {
        object.visible = visible;
      }
    });

    if (preview?.group?.parent) {
      preview.group.parent.remove(preview.group);
    }

    if (preview?.transform && typeof preview.transformVisible === "boolean") {
      preview.transform.visible = preview.transformVisible;
    }

    if (preview?.outlineGroup && typeof preview.outlineVisible === "boolean") {
      preview.outlineGroup.visible = preview.outlineVisible;
    }

    drawerPreviewRef.current = null;

    if (updateState) {
      setDrawerPreviewOpenId(null);
    }
  }, []);

  useEffect(() => {
    clearDrawerPreviewRef.current = clearDrawerPreview;

    return () => {
      if (clearDrawerPreviewRef.current === clearDrawerPreview) {
        clearDrawerPreviewRef.current = null;
      }
    };
  }, [clearDrawerPreview]);

  const animateDrawerPreviewTo = useCallback(
    (targetDistance, onDone = null) => {
      const preview = drawerPreviewRef.current;
      if (!preview?.group) return;

      if (drawerPreviewAnimationRef.current) {
        cancelAnimationFrame(drawerPreviewAnimationRef.current);
      }

      const startDistance = Number(preview.currentDistance || 0);

      const destination = Number(targetDistance || 0);

      const startedAt = performance.now();

      const step = (now) => {
        const current = drawerPreviewRef.current;

        if (!current || current !== preview || !current.group) {
          drawerPreviewAnimationRef.current = 0;
          return;
        }

        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / DRAWER_PREVIEW_DURATION_MS),
        );

        const eased = easeOutCubic(progress);

        current.currentDistance =
          startDistance + (destination - startDistance) * eased;

        current.group.position
          .copy(current.basePosition)
          .addScaledVector(current.direction, current.currentDistance);

        current.group.updateMatrixWorld(true);

        if (progress < 1) {
          drawerPreviewAnimationRef.current = requestAnimationFrame(step);
          return;
        }

        current.currentDistance = destination;
        drawerPreviewAnimationRef.current = 0;
        onDone?.();
      };

      drawerPreviewAnimationRef.current = requestAnimationFrame(step);
    },
    [],
  );

  const createDrawerPreview = useCallback(
    (component) => {
      if (!component?.id) return false;

      // Only one moving-furniture preview may own the editor visuals.
      clearDoorPreview();
      clearDrawerPreview();

      const drawerSet = resolveDrawerPreviewSet(
        component,
        componentsRef.current || [],
      );

      if (!drawerSet.key || drawerSet.movableMembers.length === 0) {
        return false;
      }

      const memberEntries = drawerSet.movableMembers.map((member) => ({
        member,
        entry: entryMapRef.current.get(member.id),
      }));

      if (memberEntries.some(({ entry }) => !entry?.obj?.parent)) {
        return false;
      }

      const parent = memberEntries[0]?.entry?.obj?.parent || null;

      if (
        !parent ||
        memberEntries.some(({ entry }) => entry.obj.parent !== parent)
      ) {
        // Current editor components normally share rootGroup.
        // Refuse a mixed-parent drawer rather than moving it incorrectly.
        return false;
      }

      const manualReferenceId =
        getMotionReferencePartId(component) ||
        drawerSet.movableMembers
          .map(getMotionReferencePartId)
          .find(Boolean) ||
        "";

      const frontMember =
        drawerSet.movableMembers.find(
          (item) => item.id === manualReferenceId,
        ) ||
        drawerSet.movableMembers.find(
          isDrawerPreviewFrontComponent,
        ) ||
        component;

      const frontEntry =
        entryMapRef.current.get(frontMember.id) || memberEntries[0]?.entry;

      const direction = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(frontEntry.obj.quaternion)
        .normalize();

      if (direction.lengthSq() < 0.5) {
        return false;
      }

      const drawerDepth = Math.max(
        1,
        ...drawerSet.movableMembers
          .filter(
            (item) =>
              !isDrawerPreviewFrontComponent(item) &&
              !String(item?.partRole || "")
                .toLowerCase()
                .includes("handle"),
          )
          .map((item) => Number(item?.depth || 0)),
      );

      const extensionDistance = Math.min(
        DRAWER_PREVIEW_MAX_EXTENSION_MM,
        Math.max(
          DRAWER_PREVIEW_MIN_EXTENSION_MM,
          drawerDepth * DRAWER_PREVIEW_EXTENSION_RATIO,
        ),
      );

      const group = new THREE.Group();
      group.name = `drawer-preview-group-${drawerSet.key}`;

      parent.add(group);
      parent.updateMatrixWorld(true);
      group.updateMatrixWorld(true);

      const originals = [];
      const clones = [];

      memberEntries.forEach(({ member, entry }) => {
        const original = entry.obj;
        const clone = original.clone(true);

        clone.name = `drawer-preview-clone-${member.id}`;

        clone.traverse((child) => {
          child.userData = {
            ...(child.userData || {}),
            isDrawerPreviewClone: true,
          };
        });

        clone.position.copy(original.position);
        clone.quaternion.copy(original.quaternion);
        clone.scale.copy(original.scale);

        parent.add(clone);

        parent.updateMatrixWorld(true);
        group.updateMatrixWorld(true);
        clone.updateMatrixWorld(true);

        // Preserve each part's exact world transform while collecting all
        // drawer-box pieces under one temporary moving preview group.
        group.attach(clone);
        group.updateMatrixWorld(true);

        originals.push({
          id: member.id,
          object: original,
          visible: original.visible,
        });

        clones.push({
          id: member.id,
          object: clone,
        });

        original.visible = false;
      });

      const transform = transformRef.current;
      const outlineGroup = selectionOutlineGroupRef.current;

      const transformVisible =
        typeof transform?.visible === "boolean" ? transform.visible : true;

      const outlineVisible =
        typeof outlineGroup?.visible === "boolean"
          ? outlineGroup.visible
          : true;

      if (transform) transform.visible = false;
      if (outlineGroup) {
        outlineGroup.visible = false;
      }

      drawerPreviewRef.current = {
        id: component.id,
        key: drawerSet.key,
        memberIds: drawerSet.movableMembers.map((item) => item.id),
        selectionIds: drawerSet.allMembers.map((item) => item.id),
        originals,
        clones,
        group,
        basePosition: group.position.clone(),
        direction,
        currentDistance: 0,
        extensionDistance,
        componentSignature: getDrawerPreviewComponentsSignature(
          drawerSet.movableMembers,
        ),
        transform,
        transformVisible,
        outlineGroup,
        outlineVisible,
      };

      setDrawerPreviewOpenId(component.id);

      animateDrawerPreviewTo(extensionDistance);

      return true;
    },
    [animateDrawerPreviewTo, clearDoorPreview, clearDrawerPreview],
  );

  const toggleSelectedDrawerPreview = useCallback(() => {
    const activePreview = drawerPreviewRef.current;

    if (activePreview?.id && drawerPreviewOpenId === activePreview.id) {
      animateDrawerPreviewTo(0, () => {
        clearDrawerPreview();
      });
      return;
    }

    const component = selectedDrawerPreviewComp;

    if (!component?.id || isExploded3D) {
      return;
    }

    createDrawerPreview(component);
  }, [
    selectedDrawerPreviewComp,
    isExploded3D,
    drawerPreviewOpenId,
    animateDrawerPreviewTo,
    clearDrawerPreview,
    createDrawerPreview,
  ]);

  useEffect(() => {
    if (!drawerPreviewRef.current) return;

    if (isExploded3D) {
      clearDrawerPreview();
    }
  }, [isExploded3D, clearDrawerPreview]);

  useEffect(() => {
    const preview = drawerPreviewRef.current;
    if (!preview) return;

    const previewDrawerIsSelected = activeSelectionIds3D.some((id) =>
      (preview.selectionIds || []).includes(id),
    );

    if (preview.transform) {
      preview.transform.visible = previewDrawerIsSelected
        ? false
        : preview.transformVisible;
    }

    if (preview.outlineGroup) {
      preview.outlineGroup.visible = previewDrawerIsSelected
        ? false
        : preview.outlineVisible;
    }
  }, [activeSelectionIds3D, drawerPreviewOpenId]);

  const openDrawerPreviewComponentSignature = useMemo(() => {
    const preview = drawerPreviewRef.current;

    if (!drawerPreviewOpenId || !preview?.memberIds?.length) {
      return "";
    }

    const openMembers = (components || []).filter((item) =>
      preview.memberIds.includes(item.id),
    );

    if (openMembers.length !== preview.memberIds.length) {
      return "";
    }

    return getDrawerPreviewComponentsSignature(openMembers);
  }, [drawerPreviewOpenId, components]);

  useEffect(() => {
    const preview = drawerPreviewRef.current;
    if (!preview?.id) return;

    if (
      !openDrawerPreviewComponentSignature ||
      openDrawerPreviewComponentSignature !== preview.componentSignature
    ) {
      clearDrawerPreview();
    }
  }, [openDrawerPreviewComponentSignature, clearDrawerPreview]);

  useEffect(
    () => () => {
      clearDrawerPreview({
        updateState: false,
      });
    },
    [clearDrawerPreview],
  );

  const explodedDisplayOffsets = useMemo(() => {
    if (!isExploded3D) {
      return EMPTY_EXPLODED_DISPLAY_OFFSETS;
    }

    return buildExplodedAssemblyOffsets({
      components,
      selectedIds: activeSelectionIds3D,
      strength: explodeStrength,
      worldFromComponent: worldFromComp,
    });
  }, [
    components,
    activeSelectionIds3D,
    isExploded3D,
    explodeStrength,
    worldFromComp,
  ]);

  const viewerWorldFromComp = useCallback(
    (comp) => {
      const world = worldFromComp(comp);
      if (!isExploded3D) return world;

      const offset = explodedDisplayOffsets.get(comp.id);
      if (!offset) return world;

      return {
        x: world.x + offset.x,
        y: world.y + offset.y,
        z: world.z + offset.z,
      };
    },
    [explodedDisplayOffsets, isExploded3D, worldFromComp],
  );

  const explodedAssemblyLabel = useMemo(() => {
    if (!selectedComp) return "All grouped assemblies";

    return (
      selectedComp.groupLabel ||
      selectedComp.label ||
      selectedComp.partCode ||
      "Selected assembly"
    );
  }, [selectedComp]);

  const getAssemblyIdsFromComponentId = useCallback((rootId) => {
    if (!rootId) return [];

    const sourceComponents = componentsRef.current || [];
    const comp = sourceComponents.find((item) => item.id === rootId);
    if (!comp) return [];
    if (!comp.groupId) return [rootId];

    return sourceComponents
      .filter((item) => item.groupId === comp.groupId)
      .map((item) => item.id);
  }, []);

  const hasActiveSelection3D = activeSelectionIds3D.length > 0;

  const hasLockedSelection3D = useMemo(() => {
    if (!activeSelectionIds3D.length) return false;

    const activeSet = new Set(activeSelectionIds3D);
    const selectedComponents3D = components.filter((c) => activeSet.has(c.id));

    return (
      selectedComponents3D.length > 0 &&
      selectedComponents3D.some((c) => isLocked3D(c))
    );
  }, [activeSelectionIds3D, components, isLocked3D]);

  const isSelectionLocked3D = useMemo(() => {
    if (!activeSelectionIds3D.length) return false;

    const activeSet = new Set(activeSelectionIds3D);
    const selectedComponents3D = components.filter((c) => activeSet.has(c.id));

    return (
      selectedComponents3D.length > 0 &&
      selectedComponents3D.every((c) => isLocked3D(c))
    );
  }, [activeSelectionIds3D, components, isLocked3D]);

  const canTransformSelection3D =
    !isExploded3D &&
    editorMode === "editable" &&
    hasActiveSelection3D &&
    !hasLockedSelection3D;
  const canScaleSelection3D =
    canTransformSelection3D && activeSelectionIds3D.length === 1;

  const toggleLockSelection3D = useCallback(() => {
    if (isExploded3DRef.current) return;
    if (editorModeRef.current !== "editable") return;

    const ids = getActiveSelectionIds();
    if (!ids.length) return;

    const activeSet = new Set(ids);
    const selectedComponents3D = (componentsRef.current || []).filter((c) =>
      activeSet.has(c.id),
    );

    if (!selectedComponents3D.length) return;

    const shouldLock = selectedComponents3D.some((c) => !c.locked);
    const updatesById = {};

    selectedComponents3D.forEach((c) => {
      updatesById[c.id] = {
        locked: shouldLock,
      };
    });

    onPushHistoryRef.current?.(
      (componentsRef.current || []).map((c) => normalizeComponent(c)),
    );

    onBatchUpdateCompsRef.current?.(updatesById, { skipHistory: true });
  }, [getActiveSelectionIds]);
  const getSelectionEntries = useCallback(
    (ids = getActiveSelectionIds()) =>
      ids
        .map((id) => {
          const entry = entryMapRef.current.get(id);
          return entry ? { id, ...entry } : null;
        })
        .filter(Boolean),
    [getActiveSelectionIds],
  );

  const applySelectionState = useCallback((ids = [], primaryId = null) => {
    const nextIds = Array.from(new Set((ids || []).filter(Boolean)));
    const nextPrimary =
      primaryId && nextIds.includes(primaryId)
        ? primaryId
        : nextIds[nextIds.length - 1] || null;

    selectedIdsRef.current = nextIds;
    selectedIdRef.current = nextPrimary;
    edit3DIdRef.current = nextPrimary;

    setSelectedIdsRef.current?.(nextIds);
    setSelectedIdRef.current?.(nextPrimary);
    setEdit3DIdRef.current?.(nextPrimary);
  }, []);

  const ensureSelectionPivot = useCallback(() => {
    const rootGroup = rootGroupRef.current;
    if (!rootGroup?.parent) return null;

    if (!selectionPivotRef.current) {
      const pivot = new THREE.Group();
      pivot.name = "multi-selection-pivot";
      pivot.visible = false;
      selectionPivotRef.current = pivot;
    }

    const pivot = selectionPivotRef.current;

    if (pivot.parent !== rootGroup.parent) {
      rootGroup.parent.add(pivot);
    }

    return pivot;
  }, []);

  const positionSelectionPivot = useCallback(
    (ids = getActiveSelectionIds()) => {
      const pivot = ensureSelectionPivot();
      const entries = getSelectionEntries(ids);

      if (!pivot || !entries.length) return null;

      const box = new THREE.Box3();
      entries.forEach(({ obj }) => box.expandByObject(obj));

      const center = new THREE.Vector3();
      box.getCenter(center);

      pivot.position.copy(center);
      pivot.rotation.set(0, 0, 0);
      pivot.scale.set(1, 1, 1);
      pivot.updateMatrixWorld(true);

      return pivot;
    },
    [ensureSelectionPivot, getActiveSelectionIds, getSelectionEntries],
  );

  const resetMultiTransformState = useCallback(() => {
    multiTransformStateRef.current = null;

    const pivot = selectionPivotRef.current;
    if (pivot) {
      pivot.rotation.set(0, 0, 0);
      pivot.scale.set(1, 1, 1);
      pivot.updateMatrixWorld(true);
    }
  }, []);

  const beginMultiTransform = useCallback(
    (ids = getActiveSelectionIds()) => {
      if (ids.length < 2) {
        multiTransformStateRef.current = null;
        return;
      }

      const pivot = positionSelectionPivot(ids);
      const entries = getSelectionEntries(ids);

      if (!pivot || entries.length < 2) return;

      pivot.updateMatrixWorld(true);

      multiTransformStateRef.current = {
        ids,
        mode: transformModeRef.current || "translate",
        startPivotMatrix: pivot.matrixWorld.clone(),
        startPivotInverse: pivot.matrixWorld.clone().invert(),
        items: entries.map(({ id, obj, comp }) => ({
          id,
          obj,
          comp,
          position: obj.position.clone(),
          quaternion: obj.quaternion.clone(),
          scale: obj.scale.clone(),
        })),
      };
    },
    [getActiveSelectionIds, getSelectionEntries, positionSelectionPivot],
  );

  const previewMultiTransform = useCallback(() => {
    const state = multiTransformStateRef.current;
    const pivot = selectionPivotRef.current;

    if (!state || !pivot) return;

    // Generic multi-object scaling changes leg and panel thickness and cannot
    // preserve furniture connections. It stays disabled until the dedicated
    // anchored assembly-resize engine is used.
    if (state.mode === "scale") return;

    pivot.updateMatrixWorld(true);

    const deltaMatrix = pivot.matrixWorld
      .clone()
      .multiply(state.startPivotInverse);

    const nextMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    state.items.forEach((item) => {
      const baseMatrix = new THREE.Matrix4().compose(
        item.position.clone(),
        item.quaternion.clone(),
        item.scale.clone(),
      );

      nextMatrix.copy(deltaMatrix).multiply(baseMatrix);
      nextMatrix.decompose(position, quaternion, scale);

      item.obj.position.copy(position);
      item.obj.quaternion.copy(quaternion);
      item.obj.scale.copy(scale);
      item.obj.updateMatrixWorld(true);
    });
  }, []);

  const commitMultiTransform = useCallback(() => {
    const state = multiTransformStateRef.current;
    if (!state?.items?.length) return;

    if (state.mode === "scale") {
      resetMultiTransformState();
      onBeforeDragRef.current = null;
      return;
    }

    const updatesById = {};

    state.items.forEach((item) => {
      updatesById[item.id] = compFromWorld(item.obj, item.comp, state.mode);
    });

    if (onBeforeDragRef.current) {
      onPushHistoryRef.current?.(onBeforeDragRef.current);
      onBeforeDragRef.current = null;
    }

    onBatchUpdateCompsRef.current?.(updatesById, { skipHistory: true });
    resetMultiTransformState();
  }, [compFromWorld, resetMultiTransformState]);

  const captureCameraView = useCallback(
    () => captureCameraSnapshot(cameraRef.current, orbitRef.current),
    [],
  );

  const storeCameraView = useCallback(() => {
    const snapshot = captureCameraView();
    if (snapshot) cameraViewRef.current = snapshot;
    return snapshot;
  }, [captureCameraView]);

  const restoreCameraView = useCallback((snapshot) => {
    restoreCameraSnapshot(cameraRef.current, orbitRef.current, snapshot);
  }, []);

  const preserveCameraView = useCallback(
    (fn) => {
      const before = captureCameraView() || cameraViewRef.current;
      fn?.();

      if (!before) return;

      restoreCameraView(before);
      cameraViewRef.current = before;

      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
      restoreRafRef.current = requestAnimationFrame(() => {
        restoreCameraView(before);
        cameraViewRef.current = before;
      });
    },
    [captureCameraView, restoreCameraView],
  );

  const centerOnObject = useCallback(
    (obj, instant = false) => {
      const centered = centerCameraOnObject({
        camera: cameraRef.current,
        orbit: orbitRef.current,
        object: obj,
        instant,
      });

      if (centered) storeCameraView();
    },
    [storeCameraView],
  );

  const applyTransformModeRaw = useCallback(() => {
    configureTransformMode({
      transform: transformRef.current,
      mode: transformModeRef.current,
      translationSnap: GRID_SIZE,
      rotationSnapDegrees: ROTATION_SNAP_DEGREES,
    });
  }, []);

  const applyTransformMode = useCallback(() => {
    preserveCameraView(() => {
      applyTransformModeRaw();
    });
  }, [preserveCameraView, applyTransformModeRaw]);

  const attachSelectedRaw = useCallback(() => {
    const transform = transformRef.current;
    if (!transform) return;

    const activeIds = getActiveSelectionIds();

    if (isExploded3D || editorMode !== "editable" || !activeIds.length) {
      resetMultiTransformState();
      transform.detach();
      return;
    }

    const entries = getSelectionEntries(activeIds);

    if (!entries.length) {
      resetMultiTransformState();
      transform.detach();
      return;
    }

    const hasLockedEntry = entries.some(({ comp }) =>
      isLocked3DRef.current(comp),
    );

    if (hasLockedEntry) {
      resetMultiTransformState();
      transform.detach();
      return;
    }

    if (entries.length > 1) {
      if (transformModeRef.current === "scale") {
        resetMultiTransformState();
        transform.detach();
        return;
      }

      const pivot = positionSelectionPivot(entries.map((entry) => entry.id));
      if (pivot) {
        resetMultiTransformState();
        transform.attach(pivot);
        applyTransformModeRaw();
        return;
      }
    }

    const primaryEntry =
      entries.find((entry) => entry.id === selectedIdRef.current) || entries[0];
    const currentEdit3DId = edit3DIdRef.current;

    if (primaryEntry && currentEdit3DId === primaryEntry.id) {
      resetMultiTransformState();
      transform.attach(primaryEntry.obj);
      applyTransformModeRaw();
    } else {
      resetMultiTransformState();
      transform.detach();
    }
  }, [
    isExploded3D,
    editorMode,
    getActiveSelectionIds,
    getSelectionEntries,
    positionSelectionPivot,
    resetMultiTransformState,
    applyTransformModeRaw,
  ]);

  const attachSelected = useCallback(() => {
    preserveCameraView(() => {
      attachSelectedRaw();
    });
  }, [preserveCameraView, attachSelectedRaw]);

  const clearSelectionOutlines = useCallback(() => {
    clearViewerSelectionOutlines(selectionOutlineGroupRef.current);
  }, []);

  const syncSelectionOutlines = useCallback(() => {
    syncViewerSelectionOutlines({
      outlineGroup: selectionOutlineGroupRef.current,
      entryMap: entryMapRef.current,
      activeIds: getActiveSelectionIds(),
    });
  }, [getActiveSelectionIds]);

  const rebuildObjects = useCallback(() => {
    console.log("3D rebuild components:", components);

    const rootGroup = rootGroupRef.current;
    if (!rootGroup) return;

    const savedView = captureCameraView() || cameraViewRef.current;
    const { entryMap, selectableMeshes } = rebuildViewerObjects({
      rootGroup,
      components,
      normalizeComponent,
      createFurnitureObject,
      worldFromComponent: viewerWorldFromComp,
      selectedIds: selectedIdsRef.current || [],
      selectedId: selectedIdRef.current,
      edit3DId: edit3DIdRef.current,
    });

    entryMapRef.current = entryMap;
    selectableMeshesRef.current = selectableMeshes;

    attachSelectedRaw();
    syncSelectionOutlines();

    if (initialSceneObjectCountRef.current === null) {
      initialSceneObjectCountRef.current = components.length;
    }

    if (savedView) {
      restoreCameraView(savedView);
      cameraViewRef.current = savedView;
    } else {
      storeCameraView();
    }

    if (!didInitialFitRef.current) {
      didInitialFitRef.current = true;
    }
  }, [
    components,
    viewerWorldFromComp,
    attachSelectedRaw,
    captureCameraView,
    restoreCameraView,
    storeCameraView,
    syncSelectionOutlines,
  ]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || 1000;
    const h = mount.clientHeight || 700;

    const {
      renderer,
      canvas,
      scene,
      camera,
      orbit,
      transform,
      rootGroup,
      selectionOutlineGroup,
      previewGroup,
      floorY: FLOOR_Y,
    } = createBlueprintSceneFoundation({
      mount,
      width: w,
      height: h,
      canvasHeight: canvasH,
      gridSize: GRID_SIZE,
      rotationSnapDegrees: ROTATION_SNAP_DEGREES,
    });

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    orbitRef.current = orbit;
    transformRef.current = transform;
    rootGroupRef.current = rootGroup;
    selectionOutlineGroupRef.current = selectionOutlineGroup;
    previewGroupRef.current = previewGroup;

    storeCameraView();
    applyTransformModeRaw();

    const handleCanvasEnter = () => {
      moveEnabledRef.current = true;
    };

    const handleCanvasLeave = () => {
      moveEnabledRef.current = false;
      clearKeys();
    };

    const handleCanvasClick = () => {
      moveEnabledRef.current = true;
      canvas.focus();
    };

    const setMouseFromEvent = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const getFloorPlacementFromClientPoint = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const isInsideCanvas =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;

      if (!isInsideCanvas) return null;

      mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const floorPlane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        canvasH / 2,
      );
      const hitPoint = new THREE.Vector3();
      const hasFloorHit = raycasterRef.current.ray.intersectPlane(
        floorPlane,
        hitPoint,
      );

      if (!hasFloorHit) return null;

      return {
        worldX: snap(hitPoint.x),
        worldZ: snap(hitPoint.z),
      };
    };

    const syncPreviewFromPointerEvent = (event, forcedItem = null) => {
      const placement = getFloorPlacementFromClientPoint(
        event.clientX,
        event.clientY,
      );

      if (!placement) return null;

      previewPlacementRef.current = placement;
      updatePlacementPreview(
        placement,
        forcedItem || pendingPlacementRef.current,
      );
      return placement;
    };

    const getPlacementFromPreviewObject = (forcedItem = null) => {
      const preview = previewObjectRef.current;
      const typeDef = forcedItem || pendingPlacementRef.current;

      if (!preview || !typeDef) return previewPlacementRef.current || null;

      preview.updateMatrixWorld?.(true);

      const worldBox = new THREE.Box3().setFromObject(preview);
      if (worldBox.isEmpty()) {
        return previewPlacementRef.current || null;
      }

      if (isTemplatePlacementType(typeDef)) {
        return {
          worldX: snap(worldBox.min.x),
          worldZ: snap(worldBox.min.z),
        };
      }

      const center = new THREE.Vector3();
      worldBox.getCenter(center);

      return {
        worldX: snap(center.x),
        worldZ: snap(center.z),
      };
    };

    const pickMesh = (event) => {
      setMouseFromEvent(event);
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const hits = raycasterRef.current.intersectObjects(
        selectableMeshesRef.current,
        false,
      );
      return hits[0] || null;
    };

    const onDraggingChanged = (event) => {
      orbit.enabled = !event.value;

      const activeIds = getActiveSelectionIds();
      const isMultiTransform =
        activeIds.length > 1 && transform.object === selectionPivotRef.current;

      if (event.value) {
        onBeforeDragRef.current = componentsRef.current
          ? [...componentsRef.current]
          : null;

        if (isMultiTransform) {
          singleScaleStateRef.current = null;
          beginMultiTransform(activeIds);
        } else {
          const currentId = selectedIdRef.current;
          const entry = currentId ? entryMapRef.current.get(currentId) : null;

          if (entry?.obj && entry?.comp) {
            if (transformModeRef.current === "scale") {
              singleScaleStateRef.current = {
                id: currentId,
                comp: normalizeComponent({ ...entry.comp }),
                startScale: entry.obj.scale.clone(),
                quaternion: entry.obj.quaternion.clone(),
                anchors: { ...resizeAnchorsRef.current },
              };
            } else {
              singleScaleStateRef.current = null;
            }

            syncLiveSelectedCompFromObject(currentId, entry.obj, entry.comp);
          }
        }
      }

      if (!event.value) {
        if (isMultiTransform) {
          commitMultiTransform();
          attachSelectedRaw();
          clearLiveSelectedComp();
          syncSelectionOutlines();
          storeCameraView();
          return;
        }

        const currentId = selectedIdRef.current;
        if (!currentId) {
          singleScaleStateRef.current = null;
          clearLiveSelectedComp();
          return;
        }

        const entry = entryMapRef.current.get(currentId);
        if (!entry) {
          singleScaleStateRef.current = null;
          clearLiveSelectedComp();
          return;
        }

        const scaleState = singleScaleStateRef.current;
        const isScaleCommit =
          transformModeRef.current === "scale" && scaleState?.id === currentId;

        const updates = isScaleCommit
          ? getAnchoredScaleUpdates(entry.obj, entry.comp, scaleState)
          : compFromWorld(entry.obj, entry.comp, transformModeRef.current);

        if (onBeforeDragRef.current) {
          onPushHistoryRef.current?.(onBeforeDragRef.current);
          onBeforeDragRef.current = null;
        }

        // The pre-drag snapshot was already pushed above. Commit the final
        // transform without creating a second identical history entry.
        onUpdateCompRef.current?.(currentId, updates, { skipHistory: true });
        singleScaleStateRef.current = null;

        // Keep the final preview intact until React rebuilds the object from
        // the committed component data. Resetting the scale here caused a
        // visible release-time jump and could leave assemblies out of sync.
        clearLiveSelectedComp();
        syncSelectionOutlines();
        storeCameraView();
      }
    };

    const onTransformObjectChange = () => {
      if (!transform.dragging || !transform.enabled) return;

      if (transform.object === selectionPivotRef.current) {
        previewMultiTransform();
        syncSelectionOutlines();

        const currentId = selectedIdRef.current;
        if (currentId) {
          const entry = entryMapRef.current.get(currentId);
          if (entry?.obj && entry?.comp) {
            syncLiveSelectedCompFromObject(currentId, entry.obj, entry.comp);
          }
        }
        return;
      }

      const currentId = selectedIdRef.current;
      if (!currentId) return;

      const entry = entryMapRef.current.get(currentId);
      if (!entry?.obj || !entry?.comp) return;

      // Do not rewrite the object's position or scale while TransformControls
      // is actively dragging. Mutating the controlled object during the same
      // drag makes TransformControls recalculate from a moving baseline, which
      // causes the part to drift sideways and compounds the scale. The live
      // inspector and the release commit both read from the same untouched
      // transform values instead.
      syncLiveSelectedCompFromObject(currentId, entry.obj, entry.comp);
      syncSelectionOutlines();
    };

    const restorePointerInteractionControls = () => {
      transform.enabled = true;

      if (
        !transform.dragging &&
        !isSelectingRef.current &&
        !libraryPlacementDragRef.current.active
      ) {
        orbit.enabled = true;
      }
    };

    // --- NEW: Box Selection Event Handlers (Fixed with Ref to prevent infinite loops) ---
    const onPointerMove = (e) => {
      const dragState = libraryPlacementDragRef.current;

      if (dragState.active) {
        const dx = Math.abs(e.clientX - dragState.startClientX);
        const dy = Math.abs(e.clientY - dragState.startClientY);
        if (dx > 6 || dy > 6) {
          dragState.moved = true;
        }

        const placement = syncPreviewFromPointerEvent(e, dragState.item);
        dragState.startedInsideCanvas =
          dragState.startedInsideCanvas || Boolean(placement);

        if (orbitRef.current && !transformRef.current?.dragging) {
          orbitRef.current.enabled = false;
        }
        return;
      }

      if (pendingPlacementRef.current && !isSelectingRef.current) {
        syncPreviewFromPointerEvent(e);
      }

      if (!isSelectingRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const currentX = clamp(e.clientX - rect.left, 0, rect.width);
      const currentY = clamp(e.clientY - rect.top, 0, rect.height);

      const minX = Math.min(startPointRef.current.x, currentX);
      const maxX = Math.max(startPointRef.current.x, currentX);
      const minY = Math.min(startPointRef.current.y, currentY);
      const maxY = Math.max(startPointRef.current.y, currentY);

      const newRect = {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
      };

      selectionRectRef.current = newRect;
      setSelectionRect(newRect);
    };

    const onPointerUp = (e) => {
      restorePointerInteractionControls();

      const dragState = libraryPlacementDragRef.current;

      if (dragState.active) {
        const pointerPlacement = syncPreviewFromPointerEvent(e, dragState.item);
        const previewPlacement = getPlacementFromPreviewObject(dragState.item);
        const placement =
          previewPlacement || pointerPlacement || previewPlacementRef.current;

        const canPlace = Boolean(
          dragState.moved &&
          (dragState.startedInsideCanvas ||
            pointerPlacement ||
            previewPlacement ||
            previewPlacementRef.current) &&
          placement &&
          pendingPlacementRef.current,
        );

        if (canPlace) {
          onPlaceComponentRef.current?.(placement);
          storeCameraView();
        } else {
          onCancelPlacementRef.current?.();
        }

        resetLibraryPlacementDrag({ disposePreview: true });
        return;
      }

      if (isSelectingRef.current) {
        isSelectingRef.current = false;
        orbit.enabled = true; // Re-enable orbit controls

        const rectBoxData = selectionRectRef.current;

        if (rectBoxData && rectBoxData.w > 5 && rectBoxData.h > 5) {
          // Find objects inside the selection box
          const rectBox = new THREE.Box2(
            new THREE.Vector2(rectBoxData.x, rectBoxData.y),
            new THREE.Vector2(
              rectBoxData.x + rectBoxData.w,
              rectBoxData.y + rectBoxData.h,
            ),
          );

          const selectedNow = [];
          const canvasWidth = renderer.domElement.clientWidth;
          const canvasHeight = renderer.domElement.clientHeight;
          const halfW = canvasWidth / 2;
          const halfH = canvasHeight / 2;

          selectableMeshesRef.current.forEach((mesh) => {
            const pos = new THREE.Vector3();
            mesh.getWorldPosition(pos);
            pos.project(camera);

            const screenX = pos.x * halfW + halfW;
            const screenY = -(pos.y * halfH) + halfH;
            const screenPoint = new THREE.Vector2(screenX, screenY);

            if (rectBox.containsPoint(screenPoint)) {
              if (mesh.userData.rootId) {
                selectedNow.push(mesh.userData.rootId);
              }
            }
          });

          if (selectedNow.length > 0) {
            preserveCameraView(() => {
              const activeSet = new Set(getActiveSelectionIds());
              selectedNow.forEach((id) => activeSet.add(id));
              const newArr = Array.from(activeSet);
              const newPrimary = newArr[newArr.length - 1] || null;

              applySelectionState(newArr, newPrimary);
              attachSelectedRaw();
              applyTransformModeRaw();
            });
            storeCameraView();
          }
        }

        // Clear the box visually and reset ref
        selectionRectRef.current = null;
        setSelectionRect(null);
      }
    };

    const onPointerCancel = () => {
      restorePointerInteractionControls();

      const dragState = libraryPlacementDragRef.current;
      if (!dragState.active) return;

      onCancelPlacementRef.current?.();
      resetLibraryPlacementDrag({ disposePreview: true });
    };

    const onPointerDown = (e) => {
      if (transform.axis) {
        // A drag that begins directly on a gizmo handle is an object
        // transform. Prevent OrbitControls from interpreting the same left
        // mouse drag as a camera orbit.
        orbit.enabled = false;
        return;
      }

      // A drag that begins anywhere else belongs to camera navigation or
      // selection. Temporarily disable TransformControls so orbiting the
      // camera cannot accidentally move, rotate, or scale the selected
      // furniture assembly.
      transform.enabled = false;

      const activePendingPlacement = pendingPlacementRef.current;

      if (activePendingPlacement) {
        if (e.button === 2) {
          e.preventDefault();
          onCancelPlacementRef.current?.();
          resetLibraryPlacementDrag({ disposePreview: true });
          return;
        }

        if (e.button !== 0) return;

        const placement =
          syncPreviewFromPointerEvent(e, activePendingPlacement) ||
          previewPlacementRef.current ||
          (() => {
            setMouseFromEvent(e);
            raycasterRef.current.setFromCamera(mouseRef.current, camera);

            const floorPlane = new THREE.Plane(
              new THREE.Vector3(0, 1, 0),
              -FLOOR_Y,
            );

            const hitPoint = new THREE.Vector3();
            const hasFloorHit = raycasterRef.current.ray.intersectPlane(
              floorPlane,
              hitPoint,
            );

            if (!hasFloorHit) return null;
            return {
              worldX: snap(hitPoint.x),
              worldZ: snap(hitPoint.z),
            };
          })();

        if (placement) {
          onPlaceComponentRef.current?.(placement);
          storeCameraView();
        } else {
          onCancelPlacementRef.current?.();
        }

        resetLibraryPlacementDrag({ disposePreview: true });
        return;
      }

      // --- NEW: Start Selection Box ---
      const hit = pickMesh(e);

      // --- Start marquee select only when Shift + empty space ---
      if (e.shiftKey && e.button === 0 && !hit?.object?.userData?.rootId) {
        isSelectingRef.current = true;
        orbit.enabled = false;

        const rect = renderer.domElement.getBoundingClientRect();
        startPointRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };

        const initialRect = {
          x: startPointRef.current.x,
          y: startPointRef.current.y,
          w: 0,
          h: 0,
        };

        selectionRectRef.current = initialRect;
        setSelectionRect(initialRect);
        return;
      }

      if (!hit?.object?.userData?.rootId) {
        applySelectionState([], null);
        resetMultiTransformState();
        clearLiveSelectedComp();
        transform.detach();
        syncSelectionOutlines();
        storeCameraView();
        return;
      }

      const hitId = hit.object.userData.rootId;
      const hitFaceKey = hit.object.userData.faceKey || null;
      const entry = entryMapRef.current.get(hitId);

      // CHANGED: Allow selection of locked objects so the user can unlock them.
      // attachSelectedRaw() will prevent transform controls from attaching if locked.
      if (!entry) return;

      preserveCameraView(() => {
        if (e.shiftKey) {
          const activeSet = new Set(getActiveSelectionIds());

          if (activeSet.has(hitId)) {
            activeSet.delete(hitId);
          } else {
            activeSet.add(hitId);
          }

          const newArr = Array.from(activeSet);
          const newPrimary = newArr[newArr.length - 1] || null;

          applySelectionState(newArr, newPrimary);
        } else {
          applySelectionState([hitId], hitId);
        }

        if (hitFaceKey && entry.comp?.type === "rounded_box") {
          onUpdateCompRef.current?.(hitId, {
            selectedFace: hitFaceKey,
          });
        }

        attachSelectedRaw();
        applyTransformModeRaw();
      });

      storeCameraView();
      syncSelectionOutlines();
    };

    const onDoubleClick = (e) => {
      const hit = pickMesh(e);

      if (!hit?.object?.userData?.rootId) {
        applySelectionState([], null);
        resetMultiTransformState();
        clearLiveSelectedComp();
        transform.detach();
        syncSelectionOutlines();
        storeCameraView();
        return;
      }
      const hitId = hit.object.userData.rootId;
      const entry = entryMapRef.current.get(hitId);

      // CHANGED: Allow double clicking locked objects to focus camera on them.
      if (!entry) return;

      preserveCameraView(() => {
        const assemblyIds = getAssemblyIdsFromComponentId(hitId);
        const nextIds = assemblyIds.length ? assemblyIds : [hitId];
        applySelectionState(nextIds, hitId);
        attachSelectedRaw();
        applyTransformModeRaw();
      });

      // WISDOM DOUBLE-CLICK SELECT ONLY V1
      // Double-click keeps whole-furniture/assembly selection, but it no longer
      // changes the camera position or OrbitControls target. Camera navigation
      // stays fully manual through left-drag, wheel zoom, right-pan and keys.
      syncSelectionOutlines();
    };

    const onResize = () => {
      resizeViewerToMount({
        mount,
        renderer,
        camera,
        restoreCameraView,
        cameraView: cameraViewRef.current,
      });
    };

    const preventContextMenu = (e) => e.preventDefault();

    const onOrbitChange = () => {
      if (!transform.dragging) storeCameraView();
    };

    const removeViewerEvents = bindBlueprintViewerEvents({
      windowTarget: window,
      canvas,
      rendererElement: renderer.domElement,
      transform,
      orbit,
      handlers: {
        onDraggingChanged,
        onTransformObjectChange,
        onOrbitChange,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onDoubleClick,
        onContextMenu: preventContextMenu,
        onResize,
        onKeyDown: handleKeyDown,
        onKeyUp: handleKeyUp,
        onWindowBlur: clearKeys,
        onCanvasEnter: handleCanvasEnter,
        onCanvasLeave: handleCanvasLeave,
        onCanvasClick: handleCanvasClick,
      },
    });

    const stopRenderLoop = startBlueprintViewerRenderLoop({
      renderer,
      scene,
      camera,
      orbit,
      onFrame: updateKeyboardCamera,
      lastFrameRef,
    });

    return () => {
      stopRenderLoop();

      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);

      removeViewerEvents();

      transform.detach();
      transform.dispose();
      orbit.dispose();
      disposePlacementPreview();
      rendererRef.current = null;
      sceneRef.current = null;

      disposeObject3DResources(rootGroup);

      disposePlacementPreview();
      clearSelectionOutlines();
      if (previewGroupRef.current?.parent) {
        previewGroupRef.current.parent.remove(previewGroupRef.current);
      }
      previewGroupRef.current = null;

      if (selectionOutlineGroupRef.current?.parent) {
        selectionOutlineGroupRef.current.parent.remove(
          selectionOutlineGroupRef.current,
        );
      }
      selectionOutlineGroupRef.current = null;

      const pivot = selectionPivotRef.current;
      if (pivot?.parent) {
        pivot.parent.remove(pivot);
      }

      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, [
    canvasH,
    compFromWorld,
    centerOnObject,
    preserveCameraView,
    restoreCameraView,
    storeCameraView,
    applyTransformModeRaw,
    updateKeyboardCamera,
    handleKeyDown,
    handleKeyUp,
    clearKeys,
    clearSelectionOutlines,
    syncSelectionOutlines,
    clearLiveSelectedComp,
    syncLiveSelectedCompFromObject,
    normalizeSingleScalePreview,
    getAnchoredScaleUpdates,
  ]);

  useEffect(() => {
    if (activeSelectionIds3D.length > 1 && transformMode === "scale") {
      setTransformMode("translate");
    }
  }, [activeSelectionIds3D.length, transformMode, setTransformMode]);

  useEffect(() => {
    applyTransformMode();
    attachSelected();
  }, [transformMode, applyTransformMode, attachSelected]);

  useEffect(() => {
    rebuildObjects();
  }, [rebuildObjects]);

  useEffect(() => {
    clearLiveSelectedComp();
    attachSelected();
    syncSelectionOutlines();
  }, [
    selectedId,
    selectedIds,
    edit3DId,
    clearLiveSelectedComp,
    attachSelected,
    syncSelectionOutlines,
  ]);

  // --- NEW: Toggle Lock Logic for selected items ---

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      <QuickControlsBar />

      {/* --- NEW: Visual Box for Selection --- */}
      {selectionRect && (
        <div
          style={{
            position: "absolute",
            border: "1px solid rgba(56, 189, 248, 0.8)",
            backgroundColor: "rgba(56, 189, 248, 0.2)",
            pointerEvents: "none",
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.w,
            height: selectionRect.h,
            zIndex: 1000,
          }}
        />
      )}

      <div
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1200,
          minWidth: isExploded3D ? 340 : 210,
          padding: "8px 10px",
          border: "1px solid rgba(100,116,139,.56)",
          borderRadius: 2,
          background: "rgba(7,14,26,.96)",
          boxShadow: "0 8px 20px rgba(0,0,0,.22)",
          color: "#dbeafe",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#93a8c4",
            }}
          >
            View Mode
          </div>

          <div style={{ display: "flex", gap: 5 }}>
            <button
              type="button"
              onClick={() => setIsExploded3D(false)}
              style={{
                minHeight: 28,
                padding: "4px 10px",
                border: !isExploded3D
                  ? "1px solid rgba(96,165,250,.9)"
                  : "1px solid rgba(71,85,105,.72)",
                borderRadius: 0,
                background: !isExploded3D
                  ? "rgba(37,99,235,.26)"
                  : "rgba(15,23,42,.74)",
                color: !isExploded3D ? "#dbeafe" : "#94a3b8",
                fontSize: 9,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Normal
            </button>

            <button
              type="button"
              onClick={() => {
                onCancelPlacementRef.current?.();
                resetLibraryPlacementDrag({ disposePreview: true });
                transformRef.current?.detach();
                setActiveInspectorTab("properties");
                if (activeLeftPanel === "library") {
                  setActiveLeftPanel(null);
                }
                setIsExploded3D(true);
              }}
              style={{
                minHeight: 28,
                padding: "4px 10px",
                border: isExploded3D
                  ? "1px solid rgba(45,212,191,.9)"
                  : "1px solid rgba(71,85,105,.72)",
                borderRadius: 0,
                background: isExploded3D
                  ? "rgba(13,148,136,.22)"
                  : "rgba(15,23,42,.74)",
                color: isExploded3D ? "#ccfbf1" : "#94a3b8",
                fontSize: 9,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Exploded
            </button>
          </div>
        </div>

        {isExploded3D ? (
          <>
            <div
              style={{
                marginTop: 7,
                fontSize: 9,
                color: "#94a3b8",
                lineHeight: 1.4,
              }}
            >
              {explodedAssemblyLabel} · visualization only · editing locked
            </div>

            <div
              style={{
                marginTop: 7,
                display: "grid",
                gridTemplateColumns: "72px minmax(0, 1fr) 36px",
                alignItems: "center",
                gap: 7,
              }}
            >
              <span
                style={{
                  color: "#9fb1c9",
                  fontSize: 9,
                  fontWeight: 500,
                }}
              >
                Explosion
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={explodeStrength}
                onChange={(e) => setExplodeStrength(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#2dd4bf" }}
              />
              <span
                style={{
                  color: "#ccfbf1",
                  fontSize: 9,
                  fontWeight: 800,
                  textAlign: "right",
                }}
              >
                {explodeStrength}%
              </span>
            </div>
          </>
        ) : null}
      </div>

      {showLibraryPanel && !isExploded3D ? (
        <FurnitureLibraryPanel
          onAdd={addComponent}
          onStartDrag={startLibraryPlacementDrag}
          onOpenCabinetBuilder={openCabinetBuilderShortcut}
          activeBuildLabel={activeBuildLabel}
          isDragPlacementActive={isLibraryDragPlacing}
          pendingPlacement={pendingPlacement}
          isOpen={activeLeftPanel === "library"}
          onToggle={() =>
            setActiveLeftPanel(activeLeftPanel === "library" ? null : "library")
          }
        />
      ) : null}

      <ObjectsTreePanel
        components={components}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={applySelectionState}
        canCreateAssembly={canCreateAssembly}
        createAssemblyHint={createAssemblyHint}
        createAssemblySelectionCount={createAssemblySelectionCount}
        onCreateAssembly={onCreateAssembly}
        isOpen={activeLeftPanel === "objects"}
        onToggle={() =>
          setActiveLeftPanel((prev) => (prev === "objects" ? null : "objects"))
        }
        isLocked3D={isLocked3D}
      />

      <PropertiesPanel
        selectedComp={selectedComp}
        liveSelectedComp={liveSelectedComp}
        selectedIds={selectedIds}
        selectedComponents={(components || []).filter((item) =>
          activeSelectionIds3D.includes(item.id),
        )}
        selectionSummary={selectionSummary}
        isLocked={isLocked}
        onChange={onUpdateComp}
        onResizeDimension={handleResizeDimensionChange}
        resizeAnchors={resizeAnchors}
        onResizeAnchorChange={handleResizeAnchorChange}
        unit={unit}
        editorMode={isExploded3D ? "reference" : editorMode}
        activeInspectorTab={activeInspectorTab}
        onChangeInspectorTab={
          isExploded3D
            ? () => setActiveInspectorTab("properties")
            : setActiveInspectorTab
        }
        renderSmartBuild={
          <FurnitureToolsPanel
            canUseSmartActions={canUseSmartActions}
            smartSelectionCount={smartSelectionCount}
            hasLockedSmartSelection={hasLockedSmartSelection}
            smartWidthResizeContext={smartWidthResizeContext}
            onPreviewSmartWidthResize={onPreviewSmartWidthResize}
            onApplySmartWidthResize={onApplySmartWidthResize}
            onAlignSelection={onAlignSelection}
            onFlushSelection={onFlushSelection}
            onMirrorDuplicate={onMirrorDuplicate}
            onSelectAssembly={onSelectAssembly}
            onDuplicateAssembly={onDuplicateAssembly}
            onArrayDuplicate={onArrayDuplicate}
            onDistributeSelection={onDistributeSelection}
            onGapSelection={onGapSelection}
            onBuildLineSelection={onBuildLineSelection}
            onAutoShelfStack={onAutoShelfStack}
            onAutoLegLayout={onAutoLegLayout}
            onAutoApronRailLayout={onAutoApronRailLayout}
            onPanelPairSelection={onPanelPairSelection}
            onFrontPairSelection={onFrontPairSelection}
            onDoorSplitSelection={onDoorSplitSelection}
            onDrawerStackSelection={onDrawerStackSelection}
            onFaceFitSelection={onFaceFitSelection}
            onInsideFitSelection={onInsideFitSelection}
            onBuildSimpleTable={onBuildSimpleTable}
            onBuildCabinetBox={onBuildCabinetBox}
            onBuildCabinetShelfLayout={onBuildCabinetShelfLayout}
            onBuildCabinetInteriorPreset={onBuildCabinetInteriorPreset}
            onBuildCabinetDoorLayout={onBuildCabinetDoorLayout}
            onBuildCabinetDrawerLayout={onBuildCabinetDrawerLayout}
            onBuildCabinetFrontPreset={onBuildCabinetFrontPreset}
            onBuildCabinetCustomBayFronts={onBuildCabinetCustomBayFronts}
            onBuildCabinetCustomCellFronts={onBuildCabinetCustomCellFronts}
            canBuildSimpleTable={canBuildSimpleTable}
            canBuildCabinetBox={canBuildCabinetBox}
            canBuildCabinetShelfLayout={canBuildCabinetShelfLayout}
            canBuildCabinetInteriorPreset={canBuildCabinetInteriorPreset}
            canBuildCabinetDoorLayout={canBuildCabinetDoorLayout}
            canBuildCabinetDrawerLayout={canBuildCabinetDrawerLayout}
            canBuildCabinetFrontPreset={canBuildCabinetFrontPreset}
            canBuildCabinetCustomBayFronts={canBuildCabinetCustomBayFronts}
            canBuildCabinetCustomCellFronts={canBuildCabinetCustomCellFronts}
            designValidationReport={designValidationReport}
            isDocked={true}
            activeToolTab={activeToolTab}
            onChangeToolTab={setActiveToolTab}
          />
        }
      />

      {doorPreviewControlComp && !drawerPreviewControlComp && !isExploded3D ? (
        <div
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 18,
            transform: "translateX(-50%)",
            zIndex: 1300,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 8px",
            border: "1px solid rgba(100,116,139,.65)",
            borderRadius: 2,
            background: "rgba(7,14,26,.96)",
            boxShadow: "0 8px 20px rgba(0,0,0,.24)",
            color: "#dbeafe",
          }}
        >
          <span
            style={{
              maxWidth: 170,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: ".04em",
              color: "#93a8c4",
            }}
          >
            Door Preview -{" "}
            {doorPreviewControlComp.label ||
              doorPreviewControlComp.partCode ||
              "Selected Door"}
          </span>

          <button
            type="button"
            onClick={toggleSelectedDoorPreview}
            style={{
              minHeight: 30,
              padding: "5px 12px",
              border:
                doorPreviewOpenId === doorPreviewControlComp.id
                  ? "1px solid rgba(148,163,184,.8)"
                  : "1px solid rgba(96,165,250,.92)",
              borderRadius: 0,
              background:
                doorPreviewOpenId === doorPreviewControlComp.id
                  ? "rgba(30,41,59,.9)"
                  : "rgba(37,99,235,.3)",
              color: "#f8fafc",
              fontSize: 9,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {doorPreviewOpenId === doorPreviewControlComp.id
              ? "Close Door"
              : "Open Door"}
          </button>

          <span
            style={{
              fontSize: 8,
              color: "#64748b",
              whiteSpace: "nowrap",
            }}
          >
            Visual only
          </span>
        </div>
      ) : null}

      {drawerPreviewControlComp && !isExploded3D ? (
        <div
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 18,
            transform: "translateX(-50%)",
            zIndex: 1300,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 8px",
            border: "1px solid rgba(100,116,139,.65)",
            borderRadius: 2,
            background: "rgba(7,14,26,.96)",
            boxShadow: "0 8px 20px rgba(0,0,0,.24)",
            color: "#dbeafe",
          }}
        >
          <span
            style={{
              maxWidth: 190,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: ".04em",
              color: "#93a8c4",
            }}
          >
            Drawer Preview -{" "}
            {drawerPreviewControlComp.label ||
              drawerPreviewControlComp.partCode ||
              "Selected Drawer"}
          </span>

          <button
            type="button"
            onClick={toggleSelectedDrawerPreview}
            style={{
              minHeight: 30,
              padding: "5px 12px",
              border:
                drawerPreviewOpenId === drawerPreviewControlComp.id
                  ? "1px solid rgba(148,163,184,.8)"
                  : "1px solid rgba(96,165,250,.92)",
              borderRadius: 0,
              background:
                drawerPreviewOpenId === drawerPreviewControlComp.id
                  ? "rgba(30,41,59,.9)"
                  : "rgba(37,99,235,.3)",
              color: "#f8fafc",
              fontSize: 9,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {drawerPreviewOpenId === drawerPreviewControlComp.id
              ? "Close Drawer"
              : "Open Drawer"}
          </button>

          <span
            style={{
              fontSize: 8,
              color: "#64748b",
              whiteSpace: "nowrap",
            }}
          >
            Visual only
          </span>
        </div>
      ) : null}

      <TransformToolbar
        transformMode={transformMode}
        setTransformMode={setTransformMode}
        hasSelection={hasActiveSelection3D && !isExploded3D}
        canTransform={canTransformSelection3D}
        canScale={canScaleSelection3D}
        isSelectionLocked={isSelectionLocked3D}
        onToggleLock={toggleLockSelection3D}
      />
    </div>
  );
}

export { ThreeDViewer };
