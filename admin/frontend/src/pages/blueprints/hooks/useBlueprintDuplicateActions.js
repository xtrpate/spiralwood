import { useCallback } from "react";
import toast from "react-hot-toast";

import { getSelectionGroup, normalizeComponent } from "../data/componentUtils";
import { makeGroupId, snap } from "../data/utils";
import { createObjectId, deepClone } from "../data/editorUtils";
import { getSelectionBoundsXYZ } from "../data/selectionUtils";

export function useBlueprintDuplicateActions({
  components,
  setComponents,
  selectedId,
  setSelectedId,
  selectedIds,
  setSelectedIds,
  setEdit3DId,
  setTransformMode,
  editorMode,
  isLocked,
  pushHistory,
  gridSize = 20,
}) {
  const getAssemblyItemsFromComponent = useCallback(
    (compOrId) => {
      const comp =
        typeof compOrId === "string"
          ? components.find((item) => item.id === compOrId)
          : compOrId;

      if (!comp) return [];

      const resultMap = new Map();
      const addItems = (items = []) => {
        (items || []).forEach((item) => {
          if (item?.id) resultMap.set(item.id, item);
        });
      };

      addItems(getSelectionGroup(components, comp));

      if (comp.groupId) {
        addItems(components.filter((item) => item.groupId === comp.groupId));
      }

      if (comp.groupId && comp.groupLabel) {
        addItems(
          components.filter((item) => {
            if (!item?.id || item.id === comp.id) return false;
            const sameGroupType = comp.groupType
              ? item.groupType === comp.groupType
              : true;

            return (
              sameGroupType &&
              item.groupLabel === comp.groupLabel &&
              (!item.groupId || item.groupId === comp.groupId)
            );
          }),
        );
      }

      if (
        resultMap.size <= 1 &&
        !comp.groupId &&
        comp.groupLabel &&
        comp.groupType
      ) {
        const looseAssemblyItems = components.filter((item) => {
          if (!item?.id) return false;
          return (
            item.groupLabel === comp.groupLabel &&
            item.groupType === comp.groupType
          );
        });

        if (looseAssemblyItems.length > 1 && looseAssemblyItems.length <= 12) {
          addItems(looseAssemblyItems);
        }
      }

      return resultMap.size ? Array.from(resultMap.values()) : [comp];
    },
    [components],
  );

  const getGroupAwareSelectionIds = useCallback(
    ({ preferWholeAssembly = false } = {}) => {
      const explicitIds = Array.from(
        new Set((selectedIds || []).filter(Boolean)),
      );
      const baseIds = explicitIds.length
        ? explicitIds
        : [selectedId].filter(Boolean);

      if (!baseIds.length) return [];
      if (!preferWholeAssembly) return baseIds;

      const expanded = new Map();

      baseIds.forEach((id) => {
        getAssemblyItemsFromComponent(id).forEach((item) => {
          if (item?.id) expanded.set(item.id, item);
        });
      });

      return expanded.size ? Array.from(expanded.keys()) : baseIds;
    },
    [selectedId, selectedIds, getAssemblyItemsFromComponent],
  );

  const cloneSelectionWithOffsets = useCallback(
    (
      sourceItems,
      { copies = 1, offsetX = 0, offsetY = 0, offsetZ = 0 } = {},
    ) => {
      const clones = [];

      const getCloneAssemblyKey = (item) => {
        const hasSharedLabelAssembly =
          item.groupLabel &&
          sourceItems.filter(
            (other) =>
              other.groupLabel === item.groupLabel &&
              other.groupType === item.groupType,
          ).length > 1;

        if (hasSharedLabelAssembly) {
          return `label:${item.groupType || "group"}:${item.groupLabel}`;
        }

        if (item.groupId) {
          return `group:${item.groupId}`;
        }

        return null;
      };

      for (let copyIndex = 1; copyIndex <= copies; copyIndex += 1) {
        const groupIdMap = new Map();

        sourceItems.forEach((item) => {
          const cloneGroupKey = getCloneAssemblyKey(item);
          let nextGroupId = item.groupId || null;

          if (cloneGroupKey) {
            if (!groupIdMap.has(cloneGroupKey)) {
              groupIdMap.set(cloneGroupKey, makeGroupId());
            }
            nextGroupId = groupIdMap.get(cloneGroupKey);
          }

          clones.push(
            normalizeComponent({
              ...deepClone(item),
              id: createObjectId(),
              groupId: nextGroupId,
              x: snap((Number(item.x) || 0) + offsetX * copyIndex),
              y: snap((Number(item.y) || 0) + offsetY * copyIndex),
              z: snap((Number(item.z) || 0) + offsetZ * copyIndex),
              locked: false,
            }),
          );
        });
      }

      return clones;
    },
    [],
  );

  const selectWholeAssembly = useCallback(() => {
    const primaryId = selectedId || selectedIds[0] || null;

    if (!primaryId) {
      toast.error("Select one part first.");
      return;
    }

    const assemblyItems = getAssemblyItemsFromComponent(primaryId);
    const assemblyIds = assemblyItems.map((item) => item.id);

    if (assemblyIds.length <= 1) {
      toast("Selected object is not part of an assembly.");
      return;
    }

    setSelectedIds(assemblyIds);
    setSelectedId(primaryId);
    setEdit3DId(primaryId);

    toast.success(
      `Selected whole assembly (${assemblyIds.length} part${assemblyIds.length !== 1 ? "s" : ""}).`,
    );
  }, [
    selectedId,
    selectedIds,
    getAssemblyItemsFromComponent,
    setEdit3DId,
    setSelectedId,
    setSelectedIds,
  ]);

  const duplicateWholeAssembly = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error("Reference mode ito. Lumipat muna sa editable mode.");
      return;
    }

    const sourceIds = getGroupAwareSelectionIds({ preferWholeAssembly: true });
    if (!sourceIds.length) {
      toast.error("Select one assembly first.");
      return;
    }

    const sourceItems = components.filter((item) =>
      sourceIds.includes(item.id),
    );
    if (!sourceItems.length) return;

    if (sourceItems.length <= 1) {
      toast("Selected object is not part of an assembly.");
      return;
    }

    if (sourceItems.some((item) => isLocked(item))) {
      toast.error(
        "Cannot duplicate. One or more selected components are locked.",
      );
      return;
    }

    const duplicated = cloneSelectionWithOffsets(sourceItems, {
      copies: 1,
      offsetX: 120,
      offsetZ: 120,
    });

    pushHistory(components);
    setComponents((prev) => [...prev, ...duplicated]);
    setSelectedIds(duplicated.map((item) => item.id));
    setSelectedId(duplicated[0]?.id || null);
    setEdit3DId(duplicated[0]?.id || null);

    toast.success(`Whole assembly duplicated (${duplicated.length} parts).`);
  }, [
    editorMode,
    components,
    isLocked,
    pushHistory,
    getGroupAwareSelectionIds,
    cloneSelectionWithOffsets,
    setComponents,
    setEdit3DId,
    setSelectedId,
    setSelectedIds,
  ]);

  const arrayDuplicateSelection = useCallback(
    (axis, copies = 1, spacing = 0) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const sourceIds = getGroupAwareSelectionIds({
        preferWholeAssembly: true,
      });
      if (!sourceIds.length) {
        toast.error("Select an object or assembly first.");
        return;
      }

      const sourceItems = components.filter((item) =>
        sourceIds.includes(item.id),
      );
      if (!sourceItems.length) return;

      if (sourceItems.some((item) => isLocked(item))) {
        toast.error(
          "Cannot create array. One or more selected components are locked.",
        );
        return;
      }

      const safeCopies = Math.max(1, Math.min(20, Number(copies) || 0));
      const safeSpacing = snap(Math.max(0, Number(spacing) || 0));
      const bounds = getSelectionBoundsXYZ(sourceItems);
      if (!bounds) return;

      const span =
        axis === "x"
          ? Math.max(gridSize, bounds.width)
          : axis === "y"
            ? Math.max(gridSize, bounds.height)
            : Math.max(gridSize, bounds.depth);

      const step = snap(span + safeSpacing);
      const duplicated = cloneSelectionWithOffsets(sourceItems, {
        copies: safeCopies,
        offsetX: axis === "x" ? step : 0,
        offsetY: axis === "y" ? step : 0,
        offsetZ: axis === "z" ? step : 0,
      });

      pushHistory(components);
      setComponents((prev) => [...prev, ...duplicated]);
      setSelectedIds(duplicated.map((item) => item.id));
      setSelectedId(duplicated[0]?.id || null);
      setEdit3DId(duplicated[0]?.id || null);
      setTransformMode("translate");

      toast.success(
        `Array ${axis.toUpperCase()} created: ${safeCopies} copy${safeCopies !== 1 ? "ies" : "y"} (${duplicated.length} objects).`,
      );
    },
    [
      editorMode,
      components,
      isLocked,
      pushHistory,
      getGroupAwareSelectionIds,
      cloneSelectionWithOffsets,
      gridSize,
      setComponents,
      setEdit3DId,
      setSelectedId,
      setSelectedIds,
      setTransformMode,
    ],
  );

  const duplicateSelected = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error("Reference mode ito. Lumipat muna sa editable mode.");
      return;
    }

    const baseSelectionIds = getGroupAwareSelectionIds({
      preferWholeAssembly: false,
    });

    if (!baseSelectionIds.length) {
      toast("No component selected.");
      return;
    }

    const selectedSet = new Set(baseSelectionIds);
    const toDuplicate = components.filter((c) => selectedSet.has(c.id));

    if (!toDuplicate.length) return;

    if (toDuplicate.some((c) => isLocked(c))) {
      toast.error(
        "Cannot duplicate. One or more selected components are locked.",
      );
      return;
    }

    const duplicated = cloneSelectionWithOffsets(toDuplicate, {
      copies: 1,
      offsetX: 120,
      offsetZ: 120,
    });

    pushHistory(components);
    setComponents((prev) => [...prev, ...duplicated]);
    setSelectedIds(duplicated.map((item) => item.id));
    setSelectedId(duplicated[0]?.id || null);
    setEdit3DId(duplicated[0]?.id || null);

    toast.success(
      duplicated.length > 1
        ? `Duplicated ${duplicated.length} object(s).`
        : `Duplicated ${duplicated[0]?.label || "object"}.`,
    );
  }, [
    editorMode,
    components,
    isLocked,
    pushHistory,
    getGroupAwareSelectionIds,
    cloneSelectionWithOffsets,
    setComponents,
    setEdit3DId,
    setSelectedId,
    setSelectedIds,
  ]);

  return {
    getAssemblyItemsFromComponent,
    getGroupAwareSelectionIds,
    cloneSelectionWithOffsets,
    selectWholeAssembly,
    duplicateWholeAssembly,
    arrayDuplicateSelection,
    duplicateSelected,
  };
}
