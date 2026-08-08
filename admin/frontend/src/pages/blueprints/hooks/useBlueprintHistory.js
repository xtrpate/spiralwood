import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { deepClone } from "../data/editorUtils";

const MAX_HISTORY_ENTRIES = 50;

function cloneSnapshot(snapshot) {
  return deepClone(Array.isArray(snapshot) ? snapshot : []);
}

function snapshotsEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function useBlueprintHistory({
  components,
  setComponents,
  setSelectedId,
  setSelectedIds,
  setEdit3DId,
}) {
  const historyRef = useRef([]);
  const futureRef = useRef([]);
  const currentComponentsRef = useRef(components);
  const skipHistoryRef = useRef(false);
  const [, setHistoryRevision] = useState(0);

  const notifyHistoryChanged = useCallback(() => {
    setHistoryRevision((value) => (value + 1) % 1000000);
  }, []);

  useEffect(() => {
    currentComponentsRef.current = components;
  }, [components]);

  const pushHistory = useCallback(
    (snapshot) => {
      if (skipHistoryRef.current) return false;

      const nextSnapshot = cloneSnapshot(snapshot);
      const previousEntry = historyRef.current[historyRef.current.length - 1];

      // Prevent duplicate/no-op history entries. This is especially important
      // for drag commits where the viewer owns the pre-drag snapshot.
      if (previousEntry && snapshotsEqual(previousEntry, nextSnapshot)) {
        return false;
      }

      historyRef.current = [
        ...historyRef.current.slice(-(MAX_HISTORY_ENTRIES - 1)),
        nextSnapshot,
      ];

      // Any real new edit invalidates redo, matching normal editor behavior.
      futureRef.current = [];
      notifyHistoryChanged();
      return true;
    },
    [notifyHistoryChanged],
  );

  const resetHistory = useCallback(() => {
    historyRef.current = [];
    futureRef.current = [];
    notifyHistoryChanged();
  }, [notifyHistoryChanged]);

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

    const previousSnapshot = cloneSnapshot(
      historyRef.current[historyRef.current.length - 1],
    );
    historyRef.current = historyRef.current.slice(0, -1);

    const currentSnapshot = cloneSnapshot(currentComponentsRef.current);
    futureRef.current = [
      currentSnapshot,
      ...futureRef.current.slice(0, MAX_HISTORY_ENTRIES - 1),
    ];

    skipHistoryRef.current = true;
    currentComponentsRef.current = previousSnapshot;
    setComponents(previousSnapshot);
    clearSelection();
    skipHistoryRef.current = false;

    notifyHistoryChanged();
    toast.success("Undo");
  }, [clearSelection, notifyHistoryChanged, setComponents]);

  const handleRedo = useCallback(() => {
    if (!futureRef.current.length) {
      toast("Nothing to redo.");
      return;
    }

    const nextSnapshot = cloneSnapshot(futureRef.current[0]);
    futureRef.current = futureRef.current.slice(1);

    const currentSnapshot = cloneSnapshot(currentComponentsRef.current);
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY_ENTRIES - 1)),
      currentSnapshot,
    ];

    skipHistoryRef.current = true;
    currentComponentsRef.current = nextSnapshot;
    setComponents(nextSnapshot);
    clearSelection();
    skipHistoryRef.current = false;

    notifyHistoryChanged();
    toast.success("Redo");
  }, [clearSelection, notifyHistoryChanged, setComponents]);

  return {
    historyRef,
    futureRef,
    canUndo: historyRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    pushHistory,
    resetHistory,
    handleUndo,
    handleRedo,
  };
}