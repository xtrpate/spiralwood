// 3d/ThreeDViewer.jsx — Three.js scene, inspector panels, and toolbar
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import {
  buildFurnitureTemplateParts,
  buildDiningChairParts,
} from "../data/templateComponents";
import { createFurnitureObject } from "./createFurnitureObjects";
import { FURNITURE_TEMPLATE_SET } from "../data/furnitureTypes";
import { normalizeComponent } from "../data/componentUtils";
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

const GRID_SIZE = 20;
const ROTATION_SNAP_DEGREES = 15;
const MIN_COMPONENT_DIMENSION_MM = 1;
const FLOOR_OFFSET = 40;
const MM_PER_INCH = 25.4;

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
  onArrayDuplicate,
  onDistributeSelection,
  onGapSelection,
  onBuildLineSelection,
  onAutoShelfStack,
  onAutoLegLayout,
  onPanelPairSelection,
  onFrontPairSelection,
  onDoorSplitSelection,
  onDrawerStackSelection,
  onFaceFitSelection,
  onInsideFitSelection,
  onBuildCabinetBox,
  onBuildCabinetInteriorPreset,
  onBuildCabinetFrontPreset,
  onBuildCabinetCustomBayFronts,
  onBuildCabinetCustomCellFronts,
  canBuildCabinetBox = false,
  canBuildCabinetInteriorPreset = false,
  canBuildCabinetFrontPreset = false,
  canBuildCabinetCustomBayFronts = false,
  canBuildCabinetCustomCellFronts = false,
  showLibraryPanel = true,
}) {
  const [activeLeftPanel, setActiveLeftPanel] = useState(
    showLibraryPanel ? "library" : null,
  );
  const [activeInspectorTab, setActiveInspectorTab] = useState("properties");
  const [activeToolTab, setActiveToolTab] = useState("builders");
  const [isLibraryDragPlacing, setIsLibraryDragPlacing] = useState(false);

  useEffect(() => {
    if (!showLibraryPanel && activeLeftPanel === "library") {
      setActiveLeftPanel(null);
    }
  }, [showLibraryPanel, activeLeftPanel]);

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

  const isTypingElement = useCallback((el) => {
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el.isContentEditable
    );
  }, []);

  const updateKeyboardCamera = useCallback(
    (delta) => {
      const camera = cameraRef.current;
      const orbit = orbitRef.current;

      if (!camera || !orbit || !moveEnabledRef.current) return;

      const keys = keysRef.current;
      const moveDir = new THREE.Vector3();
      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);

      camera.getWorldDirection(forward);
      forward.y = 0;

      if (forward.lengthSq() > 0) {
        forward.normalize();
      }

      right.crossVectors(forward, up).normalize();

      if (keys["KeyW"]) moveDir.add(forward);
      if (keys["KeyS"]) moveDir.sub(forward);
      if (keys["KeyD"]) moveDir.add(right);
      if (keys["KeyA"]) moveDir.sub(right);
      if (keys["KeyE"]) moveDir.y += 1;
      if (keys["KeyQ"]) moveDir.y -= 1;

      if (moveDir.lengthSq() === 0) return;

      const speed =
        (keys["ShiftLeft"] || keys["ShiftRight"] ? 2200 : 1100) * delta;

      moveDir.normalize().multiplyScalar(speed);

      camera.position.add(moveDir);
      orbit.target.add(moveDir);
    },
    [cameraRef, orbitRef],
  );

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
    editorModeRef.current = editorMode;
  }, [editorMode]);

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

  const normalizeSingleScalePreview = useCallback(
    (obj, comp) => {
      if (!obj || !comp) return null;

      const updates = compFromWorld(obj, comp, "scale");
      const previewComp = {
        ...comp,
        ...updates,
      };
      const previewWorld = worldFromComp(previewComp);

      // Keep the live mesh on the exact same snapped values that will be
      // saved on pointer release. This removes the last-moment size jump.
      obj.position.set(previewWorld.x, previewWorld.y, previewWorld.z);
      obj.scale.set(
        updates.width / Math.max(GRID_SIZE, Math.abs(comp.width) || GRID_SIZE),
        updates.height /
          Math.max(GRID_SIZE, Math.abs(comp.height) || GRID_SIZE),
        updates.depth / Math.max(GRID_SIZE, Math.abs(comp.depth) || GRID_SIZE),
      );
      obj.updateMatrixWorld(true);

      return updates;
    },
    [compFromWorld, worldFromComp],
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

      setLiveSelectedComp(
        normalizeComponent({
          ...comp,
          ...compFromWorld(obj, comp),
        }),
      );
    },
    [compFromWorld],
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
    editorMode === "editable" && hasActiveSelection3D && !hasLockedSelection3D;
  const canScaleSelection3D =
    canTransformSelection3D && activeSelectionIds3D.length === 1;

  const toggleLockSelection3D = useCallback(() => {
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
      updatesById[item.id] = compFromWorld(
        item.obj,
        item.comp,
        state.mode,
      );
    });

    if (onBeforeDragRef.current) {
      onPushHistoryRef.current?.(onBeforeDragRef.current);
      onBeforeDragRef.current = null;
    }

    onBatchUpdateCompsRef.current?.(updatesById, { skipHistory: true });
    resetMultiTransformState();
  }, [compFromWorld, resetMultiTransformState]);

  const captureCameraView = useCallback(() => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!camera || !orbit) return null;

    return {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      target: orbit.target.clone(),
      zoom: camera.zoom,
    };
  }, []);

  const storeCameraView = useCallback(() => {
    const snapshot = captureCameraView();
    if (snapshot) cameraViewRef.current = snapshot;
    return snapshot;
  }, [captureCameraView]);

  const restoreCameraView = useCallback((snapshot) => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!camera || !orbit || !snapshot) return;

    camera.position.copy(snapshot.position);
    camera.quaternion.copy(snapshot.quaternion);
    camera.zoom = snapshot.zoom ?? camera.zoom;
    camera.updateProjectionMatrix();
    orbit.target.copy(snapshot.target);
    orbit.update();
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
      const camera = cameraRef.current;
      const orbit = orbitRef.current;
      if (!obj || !camera || !orbit) return;

      const box = new THREE.Box3().setFromObject(obj);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);

      orbit.target.copy(center);

      if (instant) {
        const maxSize = Math.max(size.x, size.y, size.z, 120);
        const fitHeightDistance =
          maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
        const fitWidthDistance = fitHeightDistance / camera.aspect;
        const dist = Math.max(fitHeightDistance, fitWidthDistance) * 1.9;

        camera.position.set(
          center.x + dist,
          center.y + dist * 0.65,
          center.z + dist,
        );
        camera.near = 0.5;
        camera.far = Math.max(12000, dist * 6);
        camera.updateProjectionMatrix();
      }

      orbit.update();
      storeCameraView();
    },
    [storeCameraView],
  );

  const fitCameraToRoot = useCallback(
    (padding = 1.45) => {
      const camera = cameraRef.current;
      const orbit = orbitRef.current;
      const rootGroup = rootGroupRef.current;

      if (!camera || !orbit || !rootGroup || !rootGroup.children.length) return;

      const bounds = new THREE.Box3().setFromObject(rootGroup);
      if (bounds.isEmpty()) return;

      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      bounds.getCenter(center);
      bounds.getSize(size);

      const maxSize = Math.max(size.x, size.y, size.z, 1);
      const fitHeightDistance =
        maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
      const fitWidthDistance = fitHeightDistance / camera.aspect;
      const distance = Math.max(fitHeightDistance, fitWidthDistance) * padding;

      camera.position.set(
        center.x + distance,
        center.y + distance * 0.65,
        center.z + distance,
      );
      camera.near = 0.5;
      camera.far = Math.max(12000, distance * 6);
      camera.updateProjectionMatrix();

      orbit.target.copy(center);
      orbit.minDistance = 140;
      orbit.maxDistance = Math.max(9000, distance * 5);
      orbit.update();

      storeCameraView();
    },
    [storeCameraView],
  );

  const applyGizmoLook = useCallback(() => {
    const transform = transformRef.current;
    if (!transform) return;

    const forceAxisMaterial = (obj, hex) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.color) m.color.setHex(hex);
        m.depthTest = false;
        m.transparent = true;
        m.opacity = 1;
        m.toneMapped = false;
        m.fog = false;
      });
    };

    transform.traverse((child) => {
      const name = child.name || "";
      const geoType = child.geometry?.type || "";

      const isXAxis = name === "X";
      const isYAxis = name === "Y";
      const isZAxis = name === "Z";

      if (
        name.includes("XY") ||
        name.includes("YZ") ||
        name.includes("XZ") ||
        name === "E" ||
        name === "XYZ" ||
        name === "XYZE" ||
        name.includes("START") ||
        name.includes("END") ||
        name.includes("DELTA") ||
        name.includes("AXIS") ||
        name.includes("helper") ||
        geoType === "PlaneGeometry" ||
        geoType === "BoxGeometry"
      ) {
        child.visible = false;
        return;
      }

      if (!isXAxis && !isYAxis && !isZAxis) {
        if (child.type === "Line" || child.type === "Mesh")
          child.visible = false;
        return;
      }

      child.visible = true;

      if (isXAxis) forceAxisMaterial(child, 0xff3b30);
      if (isYAxis) forceAxisMaterial(child, 0x34c759);
      if (isZAxis) forceAxisMaterial(child, 0x0a84ff);
    });
  }, []);

  const applyTransformModeRaw = useCallback(() => {
    const transform = transformRef.current;
    if (!transform) return;

    const mode = transformModeRef.current;

    if (mode === "rotate") transform.setMode("rotate");
    else if (mode === "scale") transform.setMode("scale");
    else transform.setMode("translate");

    transform.translationSnap = mode === "translate" ? GRID_SIZE : null;
    transform.rotationSnap =
      mode === "rotate"
        ? THREE.MathUtils.degToRad(ROTATION_SNAP_DEGREES)
        : null;

    transform.showX = true;
    transform.showY = true;
    transform.showZ = true;

    applyGizmoLook();
  }, [applyGizmoLook]);

  const applyTransformMode = useCallback(() => {
    preserveCameraView(() => {
      applyTransformModeRaw();
    });
  }, [preserveCameraView, applyTransformModeRaw]);

  const attachSelectedRaw = useCallback(() => {
    const transform = transformRef.current;
    if (!transform) return;

    const activeIds = getActiveSelectionIds();

    if (editorMode !== "editable" || !activeIds.length) {
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
    const outlineGroup = selectionOutlineGroupRef.current;
    if (!outlineGroup) return;

    while (outlineGroup.children.length) {
      const child = outlineGroup.children[0];
      outlineGroup.remove(child);

      child.traverse?.((obj) => {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => mat?.dispose?.());
        } else {
          obj.material?.dispose?.();
        }
      });
    }
  }, []);

  const syncSelectionOutlines = useCallback(() => {
    const outlineGroup = selectionOutlineGroupRef.current;
    const rootGroup = rootGroupRef.current;
    if (!outlineGroup || !rootGroup) return;

    clearSelectionOutlines();

    const activeIds = new Set(getActiveSelectionIds());
    if (!activeIds.size) return;

    activeIds.forEach((id) => {
      const entry = entryMapRef.current.get(id);
      if (!entry?.obj) return;

      const helper = new THREE.BoxHelper(entry.obj, 0x38bdf8);
      helper.material.depthTest = false;
      helper.material.transparent = true;
      helper.material.opacity = 0.55;
      helper.material.toneMapped = false;
      helper.renderOrder = 999;

      outlineGroup.add(helper);
      helper.updateMatrixWorld(true);
    });
  }, [clearSelectionOutlines, getActiveSelectionIds]);

  const rebuildObjects = useCallback(() => {
    console.log("3D rebuild components:", components);

    const rootGroup = rootGroupRef.current;
    if (!rootGroup) return;

    const savedView = captureCameraView() || cameraViewRef.current;

    while (rootGroup.children.length) {
      const child = rootGroup.children[0];
      rootGroup.remove(child);
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
    }

    entryMapRef.current = new Map();
    selectableMeshesRef.current = [];

    const activeSelectedIds = new Set(selectedIdsRef.current || []);
    const currentSelectedId = selectedIdRef.current;
    const currentEdit3DId = edit3DIdRef.current;

    components.forEach((raw) => {
      const comp = normalizeComponent(raw);
      const selected =
        currentSelectedId === comp.id || activeSelectedIds.has(comp.id);
      const editing = currentEdit3DId === comp.id;

      const obj = createFurnitureObject(
        comp,
        selected,
        editing,
        selectableMeshesRef.current,
      );

      const pos = worldFromComp(comp);

      obj.position.set(pos.x, pos.y, pos.z);
      obj.rotation.x = THREE.MathUtils.degToRad(comp.rotationX || 0);
      obj.rotation.y = THREE.MathUtils.degToRad(comp.rotationY || 0);
      obj.rotation.z = THREE.MathUtils.degToRad(comp.rotationZ || 0);
      obj.scale.set(1, 1, 1);
      obj.userData.id = comp.id;

      rootGroup.add(obj);
      entryMapRef.current.set(comp.id, { obj, comp });
    });

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
    worldFromComp,
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

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    renderer.setClearColor(0x16263d);
    mount.innerHTML = "";

    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.outline = "none";

    const canvas = renderer.domElement;
    canvas.tabIndex = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16263d);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.5, 12000);
    camera.position.set(1100, 760, 1100);

    scene.add(new THREE.AmbientLight(0xffffff, 1.15));

    const hemi = new THREE.HemisphereLight(0xf4f8ff, 0x223248, 1.45);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(1400, 2200, 1200);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(4096, 4096);
    keyLight.shadow.camera.left = -3200;
    keyLight.shadow.camera.right = 3200;
    keyLight.shadow.camera.top = 3200;
    keyLight.shadow.camera.bottom = -3200;
    keyLight.shadow.camera.near = 200;
    keyLight.shadow.camera.far = 7000;
    keyLight.shadow.bias = 0.00035;
    keyLight.shadow.normalBias = 0.85;
    keyLight.shadow.radius = 2;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.15);
    fillLight.position.set(-1500, 1000, 1300);
    scene.add(fillLight);

    const frontLight = new THREE.DirectionalLight(0xffffff, 0.95);
    frontLight.position.set(0, 900, 1800);
    scene.add(frontLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.6);
    rimLight.position.set(-1100, 700, -900);
    scene.add(rimLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.65);
    topLight.position.set(0, 2600, 0);
    scene.add(topLight);

    const FLOOR_Y = -canvasH / 2;

    // Blueprint base plane
    const floorBase = new THREE.Mesh(
      new THREE.PlaneGeometry(6800, 6800),
      new THREE.MeshStandardMaterial({
        color: 0x17345a,
        roughness: 0.97,
        metalness: 0.0,
        emissive: 0x0a1422,
        emissiveIntensity: 0.28,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
    floorBase.rotation.x = -Math.PI / 2;
    floorBase.position.y = FLOOR_Y - 1.5;
    floorBase.receiveShadow = true;
    floorBase.renderOrder = 0;
    scene.add(floorBase);

    // Minor blueprint grid
    const minorGrid = new THREE.GridHelper(6000, 120, 0x5ea3e6, 0x274d78);
    minorGrid.position.y = FLOOR_Y + 0.35;
    minorGrid.material.transparent = true;
    minorGrid.material.opacity = 0.34;
    minorGrid.material.depthWrite = false;
    minorGrid.renderOrder = 1;
    scene.add(minorGrid);

    // Major blueprint grid
    const majorGrid = new THREE.GridHelper(6000, 24, 0xb9e3ff, 0x6ea8dc);
    majorGrid.position.y = FLOOR_Y + 0.75;
    majorGrid.material.transparent = true;
    majorGrid.material.opacity = 0.72;
    majorGrid.material.depthWrite = false;
    majorGrid.renderOrder = 2;
    scene.add(majorGrid);

    // Axis lines — slightly lifted above the grids
    const axisMatX = new THREE.LineBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
    });

    const axisMatY = new THREE.LineBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      toneMapped: false,
    });

    const axisMatZ = new THREE.LineBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
    });

    const makeAxis = (a, b, mat, renderOrder = 3) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...a),
          new THREE.Vector3(...b),
        ]),
        mat,
      );
      line.renderOrder = renderOrder;
      return line;
    };

    scene.add(
      makeAxis([-3000, FLOOR_Y + 1.05, 0], [3000, FLOOR_Y + 1.05, 0], axisMatX),
    );

    scene.add(makeAxis([0, FLOOR_Y, 0], [0, 2800, 0], axisMatY));

    scene.add(
      makeAxis([0, FLOOR_Y + 1.05, -3000], [0, FLOOR_Y + 1.05, 3000], axisMatZ),
    );

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.rotateSpeed = 0.9;
    orbit.panSpeed = 1;
    orbit.zoomSpeed = 1.05;
    orbit.minDistance = 140;
    orbit.maxDistance = 9500;
    orbit.maxPolarAngle = Math.PI / 2.02;
    orbit.target.set(0, 160, 0);
    orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    orbit.update();

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSpace("world");
    transform.setSize(0.86);
    transform.translationSnap = GRID_SIZE;
    transform.rotationSnap = THREE.MathUtils.degToRad(
      ROTATION_SNAP_DEGREES,
    );
    scene.add(transform);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const selectionOutlineGroup = new THREE.Group();
    selectionOutlineGroup.name = "selection-outline-group";
    scene.add(selectionOutlineGroup);

    const previewGroup = new THREE.Group();
    previewGroup.name = "placement-preview-group";
    scene.add(previewGroup);

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

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearKeys);

    canvas.addEventListener("mouseenter", handleCanvasEnter);
    canvas.addEventListener("mouseleave", handleCanvasLeave);
    canvas.addEventListener("click", handleCanvasClick);

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
          beginMultiTransform(activeIds);
        } else {
          const currentId = selectedIdRef.current;
          const entry = currentId ? entryMapRef.current.get(currentId) : null;

          if (entry?.obj && entry?.comp) {
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
          clearLiveSelectedComp();
          return;
        }

        const entry = entryMapRef.current.get(currentId);
        if (!entry) {
          clearLiveSelectedComp();
          return;
        }

        const updates = compFromWorld(
          entry.obj,
          entry.comp,
          transformModeRef.current,
        );

        if (onBeforeDragRef.current) {
          onPushHistoryRef.current?.(onBeforeDragRef.current);
          onBeforeDragRef.current = null;
        }

        onUpdateCompRef.current?.(currentId, updates);

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

      centerOnObject(entry.obj, true);
      syncSelectionOutlines();
    };

    const onResize = () => {
      const newW = mount.clientWidth || 1000;
      const newH = mount.clientHeight || 700;
      renderer.setSize(newW, newH);
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      restoreCameraView(cameraViewRef.current);
    };

    const preventContextMenu = (e) => e.preventDefault();

    const onOrbitChange = () => {
      if (!transform.dragging) storeCameraView();
    };

    transform.addEventListener("dragging-changed", onDraggingChanged);
    transform.addEventListener("objectChange", onTransformObjectChange);
    orbit.addEventListener("change", onOrbitChange);

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove); // NEW
    window.addEventListener("pointerup", onPointerUp); // NEW
    window.addEventListener("mouseup", onPointerUp); // NEW
    window.addEventListener("pointercancel", onPointerCancel); // NEW

    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    renderer.domElement.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("resize", onResize);

    let animId;
    lastFrameRef.current = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const now = performance.now();
      const delta = Math.min((now - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = now;

      updateKeyboardCamera(delta);

      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);

      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);

      transform.removeEventListener("dragging-changed", onDraggingChanged);
      transform.removeEventListener("objectChange", onTransformObjectChange);
      orbit.removeEventListener("change", onOrbitChange);

      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove); // NEW
      window.removeEventListener("pointerup", onPointerUp); // NEW
      window.removeEventListener("mouseup", onPointerUp); // NEW
      window.removeEventListener("pointercancel", onPointerCancel); // NEW

      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      renderer.domElement.removeEventListener(
        "contextmenu",
        preventContextMenu,
      );

      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearKeys);

      canvas.removeEventListener("mouseenter", handleCanvasEnter);
      canvas.removeEventListener("mouseleave", handleCanvasLeave);
      canvas.removeEventListener("click", handleCanvasClick);

      transform.detach();
      transform.dispose();
      orbit.dispose();
      disposePlacementPreview();
      rendererRef.current = null;
      sceneRef.current = null;

      rootGroup.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });

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

      {showLibraryPanel ? (
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
        isLocked={isLocked}
        onChange={onUpdateComp}
        unit={unit}
        editorMode={editorMode}
        activeInspectorTab={activeInspectorTab}
        onChangeInspectorTab={setActiveInspectorTab}
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
            onPanelPairSelection={onPanelPairSelection}
            onFrontPairSelection={onFrontPairSelection}
            onDoorSplitSelection={onDoorSplitSelection}
            onDrawerStackSelection={onDrawerStackSelection}
            onFaceFitSelection={onFaceFitSelection}
            onInsideFitSelection={onInsideFitSelection}
            onBuildCabinetBox={onBuildCabinetBox}
            onBuildCabinetInteriorPreset={onBuildCabinetInteriorPreset}
            onBuildCabinetFrontPreset={onBuildCabinetFrontPreset}
            onBuildCabinetCustomBayFronts={onBuildCabinetCustomBayFronts}
            onBuildCabinetCustomCellFronts={onBuildCabinetCustomCellFronts}
            canBuildCabinetBox={canBuildCabinetBox}
            canBuildCabinetInteriorPreset={canBuildCabinetInteriorPreset}
            canBuildCabinetFrontPreset={canBuildCabinetFrontPreset}
            canBuildCabinetCustomBayFronts={canBuildCabinetCustomBayFronts}
            canBuildCabinetCustomCellFronts={canBuildCabinetCustomCellFronts}
            isDocked={true}
            activeToolTab={activeToolTab}
            onChangeToolTab={setActiveToolTab}
          />
        }
      />

      <TransformToolbar
        transformMode={transformMode}
        setTransformMode={setTransformMode}
        hasSelection={hasActiveSelection3D}
        canTransform={canTransformSelection3D}
        canScale={canScaleSelection3D}
        isSelectionLocked={isSelectionLocked3D}
        onToggleLock={toggleLockSelection3D}
      />
    </div>
  );
}

export { ThreeDViewer };
