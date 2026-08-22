import { useCallback, useEffect, useMemo } from "react";
import toast from "react-hot-toast";

import {
  normalizeComponent,
  getComponentsBounds3D,
  getSelectionGroup,
} from "../data/componentUtils";
import { snap, makeGroupId, formatDims } from "../data/utils";
import { createObjectId, deepClone } from "../data/editorUtils";

// WISDOM BLUEPRINT COPY/PASTE RELATIONSHIP SAFETY V1.1.0
// Pasted parts must never reuse machining-operation identities from the source.
const makePasteMetadataId = (prefix) =>
  `${prefix}_${createObjectId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

const remapPasteMachiningMetadata = (item = {}) => ({
  machiningCutouts: Array.isArray(item.machiningCutouts)
    ? item.machiningCutouts.map((cutout) => ({
        ...deepClone(cutout),
        id: makePasteMetadataId("cutout"),
      }))
    : item.machiningCutouts,
  woodworkingOperations: Array.isArray(item.woodworkingOperations)
    ? item.woodworkingOperations.map((operation) => ({
        ...deepClone(operation),
        id: makePasteMetadataId("woodop"),
      }))
    : item.woodworkingOperations,
});

export function useBlueprintSelectionActions({
  components,
  setComponents,
  selectedId,
  setSelectedId,
  selectedIds,
  setSelectedIds,
  clipboardObject,
  setClipboardObject,
  edit3DId,
  setEdit3DId,
  editorMode,
  isLocked,
  pushHistory,
  unit,
}) {
  useEffect(() => {
    const validIdSet = new Set(components.map((c) => c.id));
    const filteredSelectedIds = (selectedIds || []).filter((id) =>
      validIdSet.has(id),
    );

    if (filteredSelectedIds.length !== (selectedIds || []).length) {
      setSelectedIds(filteredSelectedIds);
    }

    if (!components.length) {
      if (selectedId) setSelectedId(null);
      if (selectedIds.length) setSelectedIds([]);
      if (edit3DId) setEdit3DId(null);
      return;
    }

    const nextPrimary =
      selectedId && validIdSet.has(selectedId)
        ? selectedId
        : filteredSelectedIds[filteredSelectedIds.length - 1] || null;

    if (selectedId !== nextPrimary) {
      setSelectedId(nextPrimary);
    }

    if (!nextPrimary && edit3DId) {
      setEdit3DId(null);
    } else if (nextPrimary && (!edit3DId || !validIdSet.has(edit3DId))) {
      setEdit3DId(nextPrimary);
    }
  }, [
    components,
    selectedId,
    selectedIds,
    edit3DId,
    setEdit3DId,
    setSelectedId,
    setSelectedIds,
  ]);

  const selectedComp = useMemo(
    () => components.find((c) => c.id === selectedId) || null,
    [components, selectedId],
  );

  const selectedComponents = useMemo(() => {
    const activeIds = Array.from(new Set((selectedIds || []).filter(Boolean)));

    if (activeIds.length) {
      const activeSet = new Set(activeIds);
      return components.filter((c) => activeSet.has(c.id));
    }

    return getSelectionGroup(components, selectedComp);
  }, [components, selectedComp, selectedIds]);

  const selectedBounds3D = useMemo(
    () => getComponentsBounds3D(selectedComponents),
    [selectedComponents],
  );

  const selectedLabel = useMemo(() => {
    if (!selectedComp) return "";
    if (selectedIds.length > 1) return `${selectedIds.length} Selected Objects`;
    return selectedComp.groupLabel || selectedComp.label;
  }, [selectedComp, selectedIds]);

  const selectedMaterialText = useMemo(() => {
    if (!selectedComponents.length) return "—";
    return (
      [
        ...new Set(selectedComponents.map((c) => c.material).filter(Boolean)),
      ].join(", ") || "—"
    );
  }, [selectedComponents]);

  const selectedDimsText = useMemo(() => {
    if (!selectedBounds3D) return "—";
    return formatDims(
      selectedBounds3D.width,
      selectedBounds3D.height,
      selectedBounds3D.depth,
      unit,
    );
  }, [selectedBounds3D, unit]);

  const activeSelectionIds3D = useMemo(() => {
    const ids = Array.from(new Set((selectedIds || []).filter(Boolean)));
    if (ids.length) return ids;
    return selectedId ? [selectedId] : [];
  }, [selectedId, selectedIds]);

  const activeSelectedComponents3D = useMemo(() => {
    if (!activeSelectionIds3D.length) return [];
    const activeSet = new Set(activeSelectionIds3D);
    return components.filter((c) => activeSet.has(c.id));
  }, [components, activeSelectionIds3D]);

  const hasLockedSmartSelection3D = useMemo(
    () => activeSelectedComponents3D.some((c) => isLocked(c)),
    [activeSelectedComponents3D, isLocked],
  );

  const canUseSmartActions3D =
    editorMode === "editable" &&
    activeSelectedComponents3D.length > 0 &&
    !hasLockedSmartSelection3D;

  const removeSelected = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error(
        "Reference mode ito. Walang editable components na puwedeng burahin.",
      );
      return;
    }

    const idsToRemove = new Set(
      selectedIds.length > 0 ? selectedIds : [selectedId].filter(Boolean),
    );

    if (!idsToRemove.size) return;

    const hasLocked = components.some(
      (c) => idsToRemove.has(c.id) && isLocked(c),
    );

    if (hasLocked) {
      toast.error("Cannot delete. One or more selected components are locked.");
      return;
    }

    const hasLockedDependent = components.some((component) => {
      if (!component?.id || idsToRemove.has(component.id) || !isLocked(component)) {
        return false;
      }

      const parentPartId = String(
        component.parentPartId ?? component.parent_part_id ?? "",
      ).trim();
      const motionReferencePartId = String(
        component.motionReferencePartId ??
          component.motion_reference_part_id ??
          "",
      ).trim();

      return (
        (parentPartId && idsToRemove.has(parentPartId)) ||
        (motionReferencePartId && idsToRemove.has(motionReferencePartId))
      );
    });

    if (hasLockedDependent) {
      toast.error(
        "Cannot delete. A locked component still depends on the selected part.",
      );
      return;
    }

    pushHistory(components);
    setComponents((prev) => {
      const remaining = prev.filter((c) => !idsToRemove.has(c.id));
      const remainingIdSet = new Set(
        remaining.map((component) => String(component.id || "")).filter(Boolean),
      );
      const motionMembersByGroup = new Map();

      remaining.forEach((component) => {
        const motionGroupId = String(
          component.motionGroupId ?? component.motion_group_id ?? "",
        ).trim();

        if (!motionGroupId) return;
        if (!motionMembersByGroup.has(motionGroupId)) {
          motionMembersByGroup.set(motionGroupId, []);
        }
        motionMembersByGroup.get(motionGroupId).push(component);
      });

      const replacementMotionReferenceByGroup = new Map();
      motionMembersByGroup.forEach((members, motionGroupId) => {
        const validSavedReference = members
          .map((component) =>
            String(
              component.motionReferencePartId ??
                component.motion_reference_part_id ??
                "",
            ).trim(),
          )
          .find((referenceId) => referenceId && remainingIdSet.has(referenceId));

        replacementMotionReferenceByGroup.set(
          motionGroupId,
          validSavedReference || String(members[0]?.id || ""),
        );
      });

      return remaining.map((component) => {
        const parentPartId = String(
          component.parentPartId ?? component.parent_part_id ?? "",
        ).trim();
        const motionReferencePartId = String(
          component.motionReferencePartId ??
            component.motion_reference_part_id ??
            "",
        ).trim();
        const parentWasRemoved =
          parentPartId && idsToRemove.has(parentPartId);
        const motionReferenceWasRemoved =
          motionReferencePartId && idsToRemove.has(motionReferencePartId);

        if (!parentWasRemoved && !motionReferenceWasRemoved) {
          return component;
        }

        const motionGroupId = String(
          component.motionGroupId ?? component.motion_group_id ?? "",
        ).trim();
        const nextMotionReferencePartId = motionReferenceWasRemoved
          ? replacementMotionReferenceByGroup.get(motionGroupId) || ""
          : component.motionReferencePartId;

        return normalizeComponent({
          ...component,
          parentPartId: parentWasRemoved ? null : component.parentPartId,
          motionReferencePartId: nextMotionReferencePartId,
        });
      });
    });
    setSelectedId(null);
    setSelectedIds([]);
    setEdit3DId(null);

    toast.success(`Deleted ${idsToRemove.size} object(s).`);
  }, [
    editorMode,
    selectedId,
    selectedIds,
    components,
    isLocked,
    pushHistory,
    setComponents,
    setEdit3DId,
    setSelectedId,
    setSelectedIds,
  ]);

  const copySelectedObject = useCallback(() => {
    if (!selectedComponents.length) {
      toast.error("Pumili muna ng object sa 3D view.");
      return;
    }

    if (selectedComponents.some((item) => isLocked(item))) {
      toast.error("Cannot copy. One or more selected components are locked.");
      return;
    }

    setClipboardObject(deepClone(selectedComponents));

    toast.success(
      selectedComponents.length > 1
        ? `${selectedComponents.length} object(s) copied.`
        : `${selectedComponents[0]?.label || "Object"} copied.`,
    );
  }, [selectedComponents, setClipboardObject, isLocked]);

  const pasteCopiedObject = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error("Reference mode ito. Lumipat muna sa editable mode.");
      return;
    }

    const sourceItems = Array.isArray(clipboardObject)
      ? clipboardObject
      : clipboardObject
        ? [clipboardObject]
        : [];

    if (!sourceItems.length) {
      toast.error("Wala pang copied object.");
      return;
    }

    // Match Duplicate protection: locked parts must not become editable clones
    // through Copy/Paste.
    const hasCurrentlyLockedSource = sourceItems.some((item) => {
      const sourceId = String(item?.id || "").trim();
      if (!sourceId) return false;

      const currentSource = components.find(
        (component) => String(component?.id || "") === sourceId,
      );

      return currentSource ? isLocked(currentSource) : false;
    });

    if (
      sourceItems.some((item) => isLocked(item)) ||
      hasCurrentlyLockedSource
    ) {
      toast.error(
        "Cannot paste. One or more source components are currently locked.",
      );
      return;
    }
    const OFFSET = 160;
    const groupIdMap = new Map();
    const objectIdMap = new Map(
      sourceItems
        .filter((item) => item?.id)
        .map((item) => [String(item.id), createObjectId()]),
    );
    const motionGroupIdMap = new Map();
    const motionReferenceIdMap = new Map();

    sourceItems.forEach((item) => {
      const sourceMotionGroupId = String(
        item.motionGroupId ?? item.motion_group_id ?? "",
      ).trim();

      if (sourceMotionGroupId && !motionGroupIdMap.has(sourceMotionGroupId)) {
        motionGroupIdMap.set(
          sourceMotionGroupId,
          `manual-motion-${makeGroupId()}`,
        );
      }
    });

    for (const sourceMotionGroupId of motionGroupIdMap.keys()) {
      const groupItems = sourceItems.filter(
        (item) =>
          String(
            item.motionGroupId ?? item.motion_group_id ?? "",
          ).trim() === sourceMotionGroupId,
      );

      const savedReferenceId =
        groupItems
          .map((item) =>
            String(
              item.motionReferencePartId ??
                item.motion_reference_part_id ??
                "",
            ).trim(),
          )
          .find((referenceId) => objectIdMap.has(referenceId)) ||
        String(groupItems[0]?.id || "");

      motionReferenceIdMap.set(
        sourceMotionGroupId,
        objectIdMap.get(savedReferenceId) ||
          objectIdMap.get(String(groupItems[0]?.id || "")) ||
          "",
      );
    }

    const pasted = sourceItems.map((item) => {
      const sourceId = String(item?.id || "");
      const nextId = objectIdMap.get(sourceId) || createObjectId();
      const sourceGroupId = String(
        item.groupId || item.assemblyId || "",
      ).trim();
      let nextGroupId = null;

      if (sourceGroupId) {
        if (!groupIdMap.has(sourceGroupId)) {
          groupIdMap.set(sourceGroupId, makeGroupId());
        }
        nextGroupId = groupIdMap.get(sourceGroupId);
      }

      const sourceParentPartId = String(
        item.parentPartId ?? item.parent_part_id ?? "",
      ).trim();
      const nextParentPartId = sourceParentPartId
        ? objectIdMap.get(sourceParentPartId) || null
        : null;

      const sourceMotionGroupId = String(
        item.motionGroupId ?? item.motion_group_id ?? "",
      ).trim();
      const nextMotionGroupId = sourceMotionGroupId
        ? motionGroupIdMap.get(sourceMotionGroupId) || ""
        : "";
      const nextMotionReferencePartId = sourceMotionGroupId
        ? motionReferenceIdMap.get(sourceMotionGroupId) || nextId
        : "";
      const pastedMachiningMetadata = remapPasteMachiningMetadata(item);

      return normalizeComponent({
        ...deepClone(item),
        ...pastedMachiningMetadata,
        id: nextId,
        groupId: nextGroupId,
        assemblyId: nextGroupId,
        parentPartId: nextParentPartId,
        motionGroupId: nextMotionGroupId,
        motionReferencePartId: nextMotionReferencePartId,
        x: snap((Number(item.x) || 0) + OFFSET),
        y: snap(Number(item.y) || 0),
        z: snap((Number(item.z) || 0) + OFFSET),
        locked: false,
      });
    });

    pushHistory(components);
    setComponents((prev) => [...prev, ...pasted]);
    setSelectedIds(pasted.map((item) => item.id));
    setSelectedId(pasted[0]?.id || null);
    setEdit3DId(pasted[0]?.id || null);

    toast.success(
      pasted.length > 1
        ? `${pasted.length} object(s) pasted.`
        : `${pasted[0]?.label || "Object"} pasted.`,
    );
  }, [
    editorMode,
    clipboardObject,
    components,
    isLocked,
    pushHistory,
    setComponents,
    setEdit3DId,
    setSelectedId,
    setSelectedIds,
  ]);

  const toggleLockSelected = useCallback(() => {
    if (editorMode !== "editable") {
      toast.error("Reference mode ito. Lumipat muna sa editable mode.");
      return;
    }

    const targetIds =
      selectedIds.length > 0 ? selectedIds : [selectedId].filter(Boolean);

    if (!targetIds.length) {
      toast.error("Pumili muna ng object.");
      return;
    }

    const targetSet = new Set(targetIds);
    const targetComponents = components.filter((c) => targetSet.has(c.id));

    if (!targetComponents.length) return;

    const shouldLock = targetComponents.some((c) => !c.locked);

    pushHistory(components);
    setComponents((prev) =>
      prev.map((c) =>
        targetSet.has(c.id)
          ? normalizeComponent({
              ...c,
              locked: shouldLock,
            })
          : c,
      ),
    );

    toast.success(
      shouldLock
        ? `Locked ${targetIds.length} object(s).`
        : `Unlocked ${targetIds.length} object(s).`,
    );
  }, [
    editorMode,
    selectedId,
    selectedIds,
    components,
    pushHistory,
    setComponents,
  ]);

  return {
    selectedComp,
    selectedComponents,
    selectedBounds3D,
    selectedLabel,
    selectedMaterialText,
    selectedDimsText,
    activeSelectionIds3D,
    activeSelectedComponents3D,
    hasLockedSmartSelection3D,
    canUseSmartActions3D,
    removeSelected,
    copySelectedObject,
    pasteCopiedObject,
    toggleLockSelected,
  };
}
