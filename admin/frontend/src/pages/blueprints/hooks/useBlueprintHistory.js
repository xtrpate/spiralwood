import { useCallback, useRef } from "react";
import toast from "react-hot-toast";

const MAX_HISTORY_ENTRIES = 50;

export function useBlueprintHistory({
  components,
  setComponents,
  setSelectedId,
  setSelectedIds,
  setEdit3DId,
}) {
  const historyRef = useRef([]);
  const futureRef = useRef([]);
  const skipHistoryRef = useRef(false);

  const pushHistory = useCallback((snapshot) => {
    if (skipHistoryRef.current) return;

    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY_ENTRIES - 1)),
      snapshot,
    ];
    futureRef.current = [];
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedIds([]);
    setEdit3DId(null);
  }, [setEdit3DId, setSelectedId, setSelectedIds]);

  const handleUndo = useCallback(() => {
    if (!historyRef.current.length) {
      toast("Nothing to undo.");
      return;
    }

    const previousSnapshot =
      historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [
      components,
      ...futureRef.current.slice(0, MAX_HISTORY_ENTRIES - 1),
    ];

    skipHistoryRef.current = true;
    setComponents(previousSnapshot);
    clearSelection();
    skipHistoryRef.current = false;

    toast.success("Undo");
  }, [clearSelection, components, setComponents]);

  const handleRedo = useCallback(() => {
    if (!futureRef.current.length) {
      toast("Nothing to redo.");
      return;
    }

    const nextSnapshot = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    historyRef.current = [...historyRef.current, components];

    skipHistoryRef.current = true;
    setComponents(nextSnapshot);
    clearSelection();
    skipHistoryRef.current = false;

    toast.success("Redo");
  }, [clearSelection, components, setComponents]);

  return {
    historyRef,
    futureRef,
    pushHistory,
    handleUndo,
    handleRedo,
  };
}
