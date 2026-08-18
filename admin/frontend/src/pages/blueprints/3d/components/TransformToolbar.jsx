import React from "react";
import S from "../../styles/blueprintStyles";

export function TransformToolbar({
  transformMode,
  setTransformMode,
  hasSelection,
  canTransform,
  canScale,
  isSelectionLocked,
  onToggleLock,
}) {
  const handleToolClick = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canTransform) return;
    if (mode === "scale" && !canScale) return;

    setTransformMode(mode);
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      style={{ ...S.unityToolbar, top: 110 }}
      onMouseDown={handleMouseDown}
      onPointerDown={handleMouseDown}
    >
      <button
        title="Move"
        onMouseDown={handleMouseDown}
        onPointerDown={handleMouseDown}
        onClick={handleToolClick("translate")}
        disabled={!canTransform}
        style={{
          ...S.unityToolBtn,
          ...(transformMode === "translate" ? S.unityToolBtnActive : {}),
          opacity: canTransform ? 1 : 0.45,
        }}
      >
        ↕
      </button>

      <button
        title="Rotate"
        onMouseDown={handleMouseDown}
        onPointerDown={handleMouseDown}
        onClick={handleToolClick("rotate")}
        disabled={!canTransform}
        style={{
          ...S.unityToolBtn,
          ...(transformMode === "rotate" ? S.unityToolBtnActive : {}),
          opacity: canTransform ? 1 : 0.45,
        }}
      >
        ↻
      </button>

      <button
        title={
          canScale
            ? "Resize selected part"
            : "Resize one part at a time. Assembly Width / Height / Depth is handled in Design Tools > Resize."
        }
        onMouseDown={handleMouseDown}
        onPointerDown={handleMouseDown}
        onClick={handleToolClick("scale")}
        disabled={!canTransform || !canScale}
        style={{
          ...S.unityToolBtn,
          ...(transformMode === "scale" && canScale
            ? S.unityToolBtnActive
            : {}),
          opacity: canTransform && canScale ? 1 : 0.45,
        }}
      >
        ⤢
      </button>

      {/* --- NEW: Lock Button --- */}
      <button
        title={isSelectionLocked ? "Unlock Selected" : "Lock Selected"}
        onMouseDown={handleMouseDown}
        onPointerDown={handleMouseDown}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (hasSelection) onToggleLock();
        }}
        disabled={!hasSelection}
        style={{
          ...S.unityToolBtn,
          opacity: hasSelection ? 1 : 0.45,
          color: isSelectionLocked ? "#ef4444" : "inherit",
          marginTop: 4,
        }}
      >
        {isSelectionLocked ? "🔒" : "🔓"}
      </button>
    </div>
  );
}
