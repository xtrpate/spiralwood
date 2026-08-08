import { useCallback, useMemo } from "react";
import toast from "react-hot-toast";

import { makeGroupId } from "../data/utils";

function hasExistingAssemblyMembership(component) {
  if (!component) return false;

  if (component.assemblyId || component.groupId) {
    return true;
  }

  const groupType = String(component.groupType || "").trim().toLowerCase();
  const groupLabel = String(component.groupLabel || "").trim();

  return (
    !!groupLabel &&
    (groupType === "assembly" || groupType === "chair")
  );
}

function getNextCustomAssemblyName(components = []) {
  const existingNames = new Set(
    (components || [])
      .map((component) =>
        String(component.assemblyName || component.groupLabel || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );

  let index = 1;
  while (existingNames.has(`custom assembly ${index}`)) {
    index += 1;
  }

  return `Custom Assembly ${index}`;
}

export function useBlueprintAssemblyActions({
  components,
  selectedId,
  selectedIds,
  editorMode,
  isLocked,
  updateManyComps,
}) {
  const selectedPartIds = useMemo(() => {
    const explicit = Array.isArray(selectedIds)
      ? selectedIds.filter(Boolean)
      : [];

    if (explicit.length) {
      return Array.from(new Set(explicit));
    }

    return selectedId ? [selectedId] : [];
  }, [selectedId, selectedIds]);

  const selectedParts = useMemo(() => {
    const selectedSet = new Set(selectedPartIds);
    return (components || []).filter((component) =>
      selectedSet.has(component.id),
    );
  }, [components, selectedPartIds]);

  const assemblyCreateState = useMemo(() => {
    if (editorMode !== "editable") {
      return {
        canCreate: false,
        reason: "Switch to Editable Mode to create an assembly.",
      };
    }

    if (selectedPartIds.length < 2) {
      return {
        canCreate: false,
        reason: "Select at least 2 standalone parts.",
      };
    }

    if (selectedParts.length !== selectedPartIds.length) {
      return {
        canCreate: false,
        reason: "One or more selected parts could not be found.",
      };
    }

    if (selectedParts.some(hasExistingAssemblyMembership)) {
      return {
        canCreate: false,
        reason: "Selected parts must be standalone. Existing assembly parts cannot be reassigned yet.",
      };
    }

    if (selectedParts.some((component) => isLocked?.(component))) {
      return {
        canCreate: false,
        reason: "Unlock all selected parts before creating an assembly.",
      };
    }

    return {
      canCreate: true,
      reason: `${selectedParts.length} standalone parts ready.`,
    };
  }, [
    editorMode,
    selectedPartIds.length,
    selectedParts,
    isLocked,
  ]);

  const suggestedAssemblyName = useMemo(
    () => getNextCustomAssemblyName(components),
    [components],
  );

  const createAssemblyFromSelection = useCallback(() => {
    if (!assemblyCreateState.canCreate) {
      toast.error(assemblyCreateState.reason);
      return;
    }

    const enteredName = window.prompt(
      "Assembly name:",
      suggestedAssemblyName,
    );

    if (enteredName === null) return;

    const assemblyName = String(enteredName || "").trim();
    if (!assemblyName) {
      toast.error("Assembly name is required.");
      return;
    }

    const duplicateName = (components || []).some((component) => {
      const currentName = String(
        component.assemblyName || component.groupLabel || "",
      )
        .trim()
        .toLowerCase();

      return currentName && currentName === assemblyName.toLowerCase();
    });

    if (duplicateName) {
      toast.error("Assembly name already exists. Use a different name.");
      return;
    }

    const assemblyId = makeGroupId();
    const changesById = {};

    selectedParts.forEach((component) => {
      changesById[component.id] = {
        assemblyId,
        assemblyName,
        assemblyType: "custom",
        groupId: assemblyId,
        groupLabel: assemblyName,
        groupType: "assembly",
      };
    });

    updateManyComps(changesById);

    toast.success(
      `Created ${assemblyName} (${selectedParts.length} parts).`,
    );
  }, [
    assemblyCreateState,
    suggestedAssemblyName,
    components,
    selectedParts,
    updateManyComps,
  ]);

  return {
    canCreateAssembly: assemblyCreateState.canCreate,
    createAssemblyHint: assemblyCreateState.reason,
    createAssemblySelectionCount: selectedParts.length,
    createAssemblyFromSelection,
  };
}