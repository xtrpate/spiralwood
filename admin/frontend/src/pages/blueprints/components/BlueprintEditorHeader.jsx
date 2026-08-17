import React from "react";
import { VIEWS } from "../data/furnitureTypes";
import S from "../styles/blueprintStyles";

export function BlueprintEditorHeader({
  navigate,
  blueprint,
  view,
  setView,
  activeChairBuild,
  editorMode,
  switchToReferenceMode,
  switchToEditableMode,
  showGrid,
  setShowGrid,
  handleUndo,
  canUndo = false,
  handleRedo,
  canRedo = false,
  openExportSheets,
  openProjectEstimate,
  saveDesign,
  saving,
  setPublishForm,
  setPublishModal,
  handleUnpublishProduct,
}) {
  const headerToolBtn = {
    ...S.toolBtn,
    minHeight: 32,
    padding: "0 11px",
    borderRadius: 2,
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1,
    boxShadow: "none",
  };

  return (
    <div
      style={{
        background: "#ffffff",
        borderBottom: "1px solid #dfe3e8",
        boxShadow: "0 2px 10px rgba(15, 23, 42, 0.05)",
        position: "relative",
        zIndex: 20,
      }}
    >
      <div
        style={{
          minHeight: 58,
          padding: "10px 18px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          borderBottom: "1px solid #edf0f3",
        }}
      >
        <button
          onClick={() => navigate("/admin/blueprints")}
          style={{
            ...headerToolBtn,
            background: "#ffffff",
            color: "#18181b",
            border: "1px solid #d7dce2",
            padding: "8px 12px",
          }}
        >
          ← Back
        </button>

        <div style={{ minWidth: 180 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "#0a0a0a",
              letterSpacing: "-0.01em",
              lineHeight: 1.25,
            }}
          >
            {blueprint?.title || "Blueprint Design"}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#71717a",
            }}
          >
            {blueprint ? `Stage: ${blueprint.stage}` : "Design workspace"}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 3,
            marginLeft: 8,
            padding: 3,
            border: "1px solid #dfe3e8",
            background: "#f7f8fa",
            borderRadius: 0,
            overflowX: "auto",
            maxWidth: "100%",
          }}
        >
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              style={{
                ...headerToolBtn,
                background: view === v.key ? "#111827" : "transparent",
                color: view === v.key ? "#ffffff" : "#52525b",
                fontWeight: view === v.key ? 700 : 500,
                padding: "7px 13px",
                border: "none",
                boxShadow:
                  view === v.key ? "0 2px 6px rgba(15,23,42,.18)" : "none",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              minHeight: 34,
              padding: "0 12px",
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid #dfe3e8",
              background: "#f7f8fa",
              color: "#18181b",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              borderRadius: 2,
            }}
          >
            MM
          </span>

          {activeChairBuild?.label && (
            <span
              style={{
                ...S.smallPill,
                background: "#eef6ff",
                color: "#1e3a5f",
                border: "1px solid #cfe2f7",
              }}
            >
              Active build: {activeChairBuild.label}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          minHeight: 62,
          padding: "10px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          background: "#fbfcfd",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingRight: 12,
              borderRight: "1px solid #e1e5ea",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "#8a9099",
              }}
            >
              MODE
            </span>

            <div
              style={{
                display: "flex",
                gap: 3,
                padding: 3,
                border: "1px solid #dfe3e8",
                background: "#ffffff",
                borderRadius: 0,
              }}
            >
              {["reference", "editable"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    if (mode === "reference") switchToReferenceMode();
                    else switchToEditableMode();
                  }}
                  style={{
                    ...headerToolBtn,
                    background:
                      editorMode === mode ? "#111827" : "transparent",
                    color: editorMode === mode ? "#ffffff" : "#52525b",
                    fontWeight: editorMode === mode ? 700 : 500,
                    padding: "7px 12px",
                    border: "none",
                  }}
                >
                  {mode === "reference" ? "Reference" : "Editable"}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingRight: 12,
              borderRight: "1px solid #e1e5ea",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "#8a9099",
              }}
            >
              EDIT
            </span>

            {view !== "3d" && (
              <button
                onClick={() => setShowGrid((g) => !g)}
                style={{
                  ...headerToolBtn,
                  background: "#ffffff",
                  color: "#18181b",
                  border: "1px solid #dfe3e8",
                }}
              >
                {showGrid ? "Hide Grid" : "Show Grid"}
              </button>
            )}

            <button
              onClick={handleUndo}
              title="Undo (Ctrl+Z)"
              disabled={!canUndo}
              style={{
                ...headerToolBtn,
                background: "#ffffff",
                color: "#18181b",
                border: "1px solid #dfe3e8",
                opacity: !canUndo ? 0.4 : 1,
              }}
            >
              ↩ Undo
            </button>

            <button
              onClick={handleRedo}
              title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
              disabled={!canRedo}
              style={{
                ...headerToolBtn,
                background: "#ffffff",
                color: "#18181b",
                border: "1px solid #dfe3e8",
                opacity: !canRedo ? 0.4 : 1,
              }}
            >
              ↪ Redo
            </button>
          </div>
        </div>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingRight: 12,
              borderRight: "1px solid #e1e5ea",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "#8a9099",
              }}
            >
              OUTPUT
            </span>

            <button
              onClick={() => openExportSheets(false)}
              style={{
                ...headerToolBtn,
                background: "#ffffff",
                color: "#18181b",
                border: "1px solid #dfe3e8",
              }}
            >
              Export Sheets
            </button>

            <button
              onClick={() => openExportSheets(true)}
              style={{
                ...headerToolBtn,
                background: "#ffffff",
                color: "#18181b",
                border: "1px solid #dfe3e8",
              }}
            >
              Print Sheets
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "#8a9099",
              }}
            >
              ACTIONS
            </span>

            <button
              type="button"
              onClick={openProjectEstimate}
              title="Open Project Estimate for this Blueprint"
              style={{
                ...headerToolBtn,
                minWidth: 112,
                background: "#ffffff",
                color: "#111827",
                border: "1px solid #111827",
                fontWeight: 600,
              }}
            >
              Project Estimate
            </button>

            <button
              onClick={saveDesign}
              disabled={saving}
              style={{
                ...headerToolBtn,
                minWidth: 72,
                background: "#111827",
                color: "#ffffff",
                border: "1px solid #111827",
                boxShadow: "0 2px 6px rgba(15,23,42,.14)",
                fontWeight: 700,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <button
              onClick={() => {
                setPublishForm((prev) => ({
                  ...prev,
                  name: blueprint?.title || "",
                  description:
                    blueprint?.description || "Custom blueprint product.",
                }));
                setPublishModal(true);
              }}
              style={{
                ...headerToolBtn,
                background: "#ffffff",
                color: "#18181b",
                border: "1px solid #bfc5cd",
              }}
            >
              Publish to Gallery
            </button>

            <button
              onClick={handleUnpublishProduct}
              style={{
                ...headerToolBtn,
                background: "#fffafa",
                color: "#991b1b",
                border: "1px solid #fecaca",
              }}
            >
              Unpublish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
