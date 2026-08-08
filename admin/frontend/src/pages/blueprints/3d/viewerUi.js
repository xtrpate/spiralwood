// Shared layout and library configuration for the 3D blueprint editor.
export const LIBRARY_TABS = [
  { key: "all", label: "All" },
  { key: "templates", label: "Furniture" },
  { key: "parts", label: "Parts" },
  { key: "custom", label: "Custom" },
];

export const getLibraryBucket = (groupLabel = "") => {
  const text = groupLabel.toLowerCase();

  // Custom Shape Parts must be checked before the generic "part" bucket.
  if (text.includes("custom shape")) return "custom";
  if (text.includes("part")) return "parts";
  if (text.includes("template")) return "templates";

  return "all";
};

export const VIEWER_UI = {
  sideDockPanel: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 300,
    maxWidth: "calc(100% - 28px)",
    maxHeight: "calc(100% - 28px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "rgba(7, 14, 26, 0.985)",
    border: "1px solid rgba(100, 124, 155, 0.46)",
    borderRadius: 2,
    padding: 10,
    backdropFilter: "blur(6px)",
    boxShadow: "0 10px 24px rgba(0,0,0,.24)",
    boxSizing: "border-box",
    zIndex: 9,
  },

  sideDockBody: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 2,
  },

  inspectorDockedPanel: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 364,
    maxWidth: "calc(100% - 28px)",
    maxHeight: "calc(100% - 28px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "rgba(7, 14, 26, 0.985)",
    border: "1px solid rgba(100, 124, 155, 0.46)",
    borderRadius: 2,
    padding: 10,
    backdropFilter: "blur(6px)",
    boxShadow: "0 10px 24px rgba(0,0,0,.24)",
    boxSizing: "border-box",
    zIndex: 9,
  },

  inspectorTabsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 0,
    marginBottom: 10,
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "rgba(7, 14, 26, 0.985)",
    paddingBottom: 2,
  },

  inspectorTabBtn: {
    height: 34,
    padding: "0 10px",
    borderRadius: 0,
    border: "1px solid rgba(71,85,105,.72)",
    background: "#0b1424",
    color: "#aebdd1",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 750,
    minWidth: 0,
    boxSizing: "border-box",
  },

  inspectorTabBtnActive: {
    border: "1px solid rgba(96,165,250,.72)",
    background: "#172844",
    color: "#f1f6ff",
    boxShadow: "none",
  },

  inspectorTabBody: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 2,
    paddingBottom: 8,
  },

  furnitureToolsPanelDocked: {
    position: "relative",
    inset: "auto",
    width: "100%",
    maxWidth: "100%",
    maxHeight: "none",
    overflowY: "visible",
    overflowX: "hidden",
    padding: 0,
    borderRadius: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    backdropFilter: "none",
    boxSizing: "border-box",
    zIndex: "auto",
  },

  fullWidthInput: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },

  fullWidthControl: {
    width: "100%",
    maxWidth: "100%",
    display: "block",
    boxSizing: "border-box",
  },

  compactInfoCard: {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  },
};

export const LIBRARY_PREVIEW = {
  templateHeight: 108,
  partHeight: 86,
};
