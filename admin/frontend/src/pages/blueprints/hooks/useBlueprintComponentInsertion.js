import { useCallback } from "react";
import toast from "react-hot-toast";
import { FURNITURE_TEMPLATE_SET } from "../data/furnitureTypes";
import {
  normalizeComponent,
  isChairPartType,
  applyWoodFinish,
  getDefaultFinishId,
  getNextChairOrigin,
  getNextAssemblyOrigin,
} from "../data/componentUtils";
import { snap, makeId, makeGroupId } from "../data/utils";
import {
  buildFurnitureTemplateParts,
  buildDiningChairParts,
} from "../data/templateComponents";
import { getPlacedGenericComponentData } from "../data/componentPlacementUtils";
import { getChairManualPlacement } from "../export/placementHelpers";
import { validateBlueprintGeneratedParts } from "../data/floorWorkspaceA3B.mjs";

export function useBlueprintComponentInsertion({
  components,
  setComponents,
  selectedComp,
  activeChairBuild,
  setActiveChairBuild,
  pendingPlacement,
  setPendingPlacement,
  editorMode,
  view,
  pushHistory,
  setSelectedId,
  setEdit3DId,
  setSelectedIds,
  setTransformMode,
  worldDimensions,
  floorOffset,
}) {
  const worldWidth = worldDimensions.w;
  const worldHeight = worldDimensions.h;
  const worldDepth = worldDimensions.d;

  const commitAddComponent = useCallback(
    (typeDef, worldPlacement = null) => {
      const defaultFinishId = getDefaultFinishId(typeDef.material);
      const finishData = defaultFinishId
        ? applyWoodFinish({}, defaultFinishId)
        : {};

      const floorY = worldHeight - floorOffset;
      // A3B1: Validate the fully generated part geometry BEFORE history,
      // selection changes, or adding anything to the scene.
      const canInsertParts = (parts) => {
        const result = validateBlueprintGeneratedParts({
          parts, worldWidth, worldDepth, floorComponentY: floorY,
        });
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        return true;
      };

      const getManualPlacement = (width, height, depth) => {
        if (!worldPlacement) return null;

        return {
          x: snap(worldPlacement.worldX - width / 2 + worldWidth / 2),
          y: snap(floorY - height),
          z: snap(worldPlacement.worldZ - depth / 2 + worldDepth / 2),
          width,
          height,
          depth,
          rotationY: 0,
        };
      };

      if (FURNITURE_TEMPLATE_SET.has(typeDef.type)) {
        const templateOrigin = worldPlacement
          ? {
              x: snap(worldPlacement.worldX + worldWidth / 2),
              z: snap(worldPlacement.worldZ + worldDepth / 2),
            }
          : getNextAssemblyOrigin(components);

        const { x, z } = templateOrigin;
        const buildCount =
          [
            ...new Set(
              components
                .filter((component) => component.groupType === "assembly")
                .map((component) => component.groupId),
            ),
          ].length + 1;
        const groupId = makeGroupId();
        const groupLabel = `${typeDef.label} ${buildCount}`;

        const rawParts = buildFurnitureTemplateParts({
          templateType: typeDef.type,
          buildId: groupId,
          originX: x,
          originZ: z,
          canvasH: worldHeight,
          groupLabel,
        });

        const parts = rawParts.map((part) =>
          normalizeComponent({
            ...part,
            templateType: typeDef.type,
            groupUnitPrice: Number(typeDef.unitPrice) || 0,
          }),
        );

        if (!canInsertParts(parts)) return false;
        pushHistory(components);
        setComponents((previous) => [...previous, ...parts]);
        setSelectedId(parts[0]?.id || null);
        setEdit3DId(parts[0]?.id || null);
        setSelectedIds(parts.map((part) => part.id));
        setTransformMode("translate");
        toast.success(`${typeDef.label} added.`);
        return true;
      }

      if (typeDef.type === "chair_template") {
        const chairOrigin = worldPlacement
          ? {
              x: snap(worldPlacement.worldX + worldWidth / 2),
              z: snap(worldPlacement.worldZ + worldDepth / 2),
            }
          : getNextChairOrigin(components);

        const { x, z } = chairOrigin;
        const chairCount =
          [
            ...new Set(
              components
                .filter((component) => component.groupType === "chair")
                .map((component) => component.groupId),
            ),
          ].length + 1;
        const groupId = makeGroupId();
        const groupLabel = `Dining Chair ${chairCount}`;

        const builtChair = buildDiningChairParts({
          buildId: groupId,
          originX: x,
          originZ: z,
          canvasH: worldHeight,
          groupLabel,
        });
        const parts = builtChair.parts;

        if (!canInsertParts(parts)) return false;
        pushHistory(components);
        setComponents((previous) => [...previous, ...parts]);
        setSelectedId(parts[0]?.id || null);
        setEdit3DId(parts[0]?.id || null);
        setSelectedIds(parts.map((part) => part.id));
        setTransformMode("translate");
        setActiveChairBuild({ id: groupId, label: groupLabel });
        toast.success("Dining chair template generated.");
        return true;
      }

      if (isChairPartType(typeDef.type)) {
        const selectedChairGroup =
          selectedComp?.groupType === "chair" && selectedComp.groupId
            ? {
                id: selectedComp.groupId,
                label: selectedComp.groupLabel || "Chair Build",
              }
            : null;

        const targetBuild =
          activeChairBuild ||
          selectedChairGroup ||
          (() => {
            const chairCount =
              [
                ...new Set(
                  components
                    .filter((component) => component.groupType === "chair")
                    .map((component) => component.groupId),
                ),
              ].length + 1;
            return {
              id: makeGroupId(),
              label: `Manual Chair ${chairCount}`,
            };
          })();

        const groupComponents = components.filter(
          (component) => component.groupId === targetBuild.id,
        );
        const chairPlacement = getChairManualPlacement(
          typeDef,
          groupComponents,
          components,
          worldHeight,
        );
        // Chair identity/size stays intact, but a dragged chair part must use
        // the actual floor drop coordinate instead of automatic chair layout.
        const manualPlacement = getManualPlacement(
          chairPlacement.width,
          chairPlacement.height,
          chairPlacement.depth,
        );
        const placement = manualPlacement
          ? { ...chairPlacement, ...manualPlacement }
          : chairPlacement;

        const newComponent = normalizeComponent({
          id: makeId(),
          groupId: targetBuild.id,
          groupLabel: targetBuild.label,
          groupType: "chair",
          type: typeDef.type,
          label: placement.label,
          partCode: placement.partCode,
          category: typeDef.category,
          blueprintStyle: "chair_part",
          x: placement.x,
          y: placement.y,
          z: placement.z,
          width: placement.width,
          height: placement.height,
          depth: placement.depth,
          rotationY: 0,
          fill: finishData.fill || typeDef.fill,
          material: finishData.material || typeDef.material,
          finish: finishData.finish || "",
          unitPrice: typeDef.unitPrice,
          qty: 1,
          locked: false,
        });

        if (!canInsertParts([newComponent])) return false;
        pushHistory(components);
        setComponents((previous) => [...previous, newComponent]);
        setSelectedId(newComponent.id);
        setEdit3DId(newComponent.id);
        setSelectedIds([newComponent.id]);
        setTransformMode("translate");
        setActiveChairBuild(targetBuild);
        toast.success(`${newComponent.label} added.`);
        return true;
      }

      if (typeDef.type === "dining_chair") {
        const manualPlacement = getManualPlacement(
          typeDef.w,
          typeDef.h,
          typeDef.d,
        );
        const placement =
          manualPlacement ||
          getPlacedGenericComponentData({
            typeDef,
            placed: components,
            worldWidth,
            worldHeight,
            worldDepth,
            floorOffset,
          });

        const newComponent = normalizeComponent({
          id: makeId(),
          type: typeDef.type,
          label: typeDef.label,
          category: typeDef.category,
          blueprintStyle: typeDef.blueprintStyle,
          x: placement.x,
          y: placement.y,
          z: placement.z,
          width: typeDef.w,
          height: typeDef.h,
          depth: typeDef.d,
          rotationY: 0,
          fill: finishData.fill || typeDef.fill,
          material: finishData.material || typeDef.material,
          finish: finishData.finish || "",
          unitPrice: typeDef.unitPrice,
          qty: 1,
          locked: false,
        });

        if (!canInsertParts([newComponent])) return false;
        pushHistory(components);
        setComponents((previous) => [...previous, newComponent]);
        setSelectedId(newComponent.id);
        setEdit3DId(newComponent.id);
        setSelectedIds([newComponent.id]);
        setTransformMode("translate");
        toast.success("Dining chair added.");
        return true;
      }

      const manualPlacement = getManualPlacement(
        typeDef.w,
        typeDef.h,
        typeDef.d,
      );
      const placement =
        manualPlacement ||
        getPlacedGenericComponentData({
          typeDef,
          placed: components,
          worldWidth,
          worldHeight,
          worldDepth,
          floorOffset,
        });

      const newComponent = normalizeComponent({
        id: makeId(),
        type: typeDef.type,
        label: typeDef.label,
        category: typeDef.category,
        blueprintStyle: typeDef.blueprintStyle,
        partRole: typeDef.partRole || "",
        partCode: typeDef.partCode || "",
        // A manual door/drawer face stays still until Admin configures movement.
        partFunction: typeDef.partFunction || "auto",
        x: placement.x,
        y: placement.y,
        z: placement.z,
        width: placement.width || typeDef.w,
        height: placement.height || typeDef.h,
        depth: placement.depth || typeDef.d,
        rotationY: placement.rotationY || 0,
        fill: finishData.fill || typeDef.fill,
        material: finishData.material || typeDef.material,
        finish: finishData.finish || "",
        unitPrice: typeDef.unitPrice,
        qty: 1,
        locked: false,
      });

      if (!canInsertParts([newComponent])) return false;
      pushHistory(components);
      setComponents((previous) => [...previous, newComponent]);
      setSelectedId(newComponent.id);
      setEdit3DId(newComponent.id);
      setSelectedIds([newComponent.id]);
      setTransformMode("translate");
      toast.success("Component added in 3D.");
      return true;
    },
    [
      activeChairBuild,
      components,
      floorOffset,
      pushHistory,
      selectedComp,
      setActiveChairBuild,
      setComponents,
      setEdit3DId,
      setSelectedId,
      setSelectedIds,
      setTransformMode,
      worldDepth,
      worldHeight,
      worldWidth,
    ],
  );

  const addComponent = useCallback(
    (typeDef, options = {}) => {
      if (!typeDef) return;

      const { source = "click", silent = false } = options;

      if (editorMode !== "editable") {
        toast.error(
          'Reference mode ito. Click "Editable Mode" muna bago mag-add ng components.',
        );
        return;
      }

      if (view !== "3d") {
        toast.error("Sa 3D view lang puwede mag-add ng component.");
        return;
      }

      // Chair parts use the same pending preview / drop flow as all other
      // manual parts. Do not insert an object on library pointer-down.
      setPendingPlacement({
        ...typeDef,
        placementSource: source,
      });
      setTransformMode("translate");

      if (!silent) {
        toast.success(
          source === "drag"
            ? `Dragging ${typeDef.label}. Drop it on the 3D floor to place.`
            : `Placement mode: ${typeDef.label}. Click the 3D floor to place.`,
        );
      }
    },
    [
      editorMode,
      setPendingPlacement,
      setTransformMode,
      view,
    ],
  );

  const placePendingComponent = useCallback(
    (worldPlacement) => {
      if (!pendingPlacement) return;
      const applied = commitAddComponent(pendingPlacement, worldPlacement);
      if (applied) setPendingPlacement(null);
    },
    [commitAddComponent, pendingPlacement, setPendingPlacement],
  );

  return {
    addComponent,
    placePendingComponent,
  };
}
