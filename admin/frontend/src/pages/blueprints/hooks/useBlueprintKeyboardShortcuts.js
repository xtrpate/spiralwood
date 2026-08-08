import { useCallback, useEffect } from "react";
import toast from "react-hot-toast";

export function useBlueprintKeyboardShortcuts({
  components,
  pendingPlacement,
  setPendingPlacement,
  setSelectedId,
  setSelectedIds,
  setEdit3DId,
  editorMode,
  handleUndo,
  handleRedo,
  duplicateSelected,
  copySelectedObject,
  pasteCopiedObject,
  removeSelected,
  toggleLockSelected,
}) {
  const cancelPendingPlacement = useCallback(() => {
    if (!pendingPlacement) return;
    setPendingPlacement(null);
    toast("Placement cancelled.");
  }, [pendingPlacement, setPendingPlacement]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const activeEl = document.activeElement;
      const tag = activeEl?.tagName?.toLowerCase();
      const isTyping =
        activeEl?.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select";

      const key = String(e.key || "").toLowerCase();
      const code = String(e.code || "").toLowerCase();
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      const canEditHistory = editorMode === "editable";

      if (key === "escape") {
        if (pendingPlacement) {
          e.preventDefault();
          e.stopPropagation();
          cancelPendingPlacement();
          return;
        }

        setSelectedId(null);
        setSelectedIds([]);
        setEdit3DId(null);
        return;
      }

      if (
        canEditHistory &&
        !isTyping &&
        ctrlOrMeta &&
        !e.shiftKey &&
        (key === "z" || code === "keyz")
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleUndo();
        return;
      }

      if (
        canEditHistory &&
        !isTyping &&
        ctrlOrMeta &&
        (key === "y" ||
          code === "keyy" ||
          ((key === "z" || code === "keyz") && e.shiftKey))
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleRedo();
        return;
      }

      if (isTyping) return;

      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        e.stopPropagation();
        removeSelected();
        return;
      }

      if (ctrlOrMeta && key === "a") {
        e.preventDefault();
        e.stopPropagation();
        if (components.length > 0) {
          const allIds = components.map((c) => c.id);
          setSelectedIds(allIds);
          setSelectedId(allIds[0] || null);
          setEdit3DId(allIds[0] || null);
          toast.success(`All ${components.length} object(s) selected.`);
        }
        return;
      }

      if (ctrlOrMeta && key === "d") {
        e.preventDefault();
        e.stopPropagation();
        duplicateSelected();
        return;
      }

      if (ctrlOrMeta && key === "c") {
        e.preventDefault();
        e.stopPropagation();
        copySelectedObject();
        return;
      }

      if (ctrlOrMeta && key === "v") {
        e.preventDefault();
        e.stopPropagation();
        pasteCopiedObject();
        return;
      }

      if (ctrlOrMeta && key === "l") {
        e.preventDefault();
        e.stopPropagation();
        toggleLockSelected();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    components,
    pendingPlacement,
    cancelPendingPlacement,
    editorMode,
    handleUndo,
    handleRedo,
    duplicateSelected,
    copySelectedObject,
    pasteCopiedObject,
    removeSelected,
    toggleLockSelected,
    setEdit3DId,
    setSelectedId,
    setSelectedIds,
  ]);

  return { cancelPendingPlacement };
}