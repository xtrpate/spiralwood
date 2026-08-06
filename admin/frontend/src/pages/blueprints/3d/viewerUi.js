// Shared layout and library configuration for the 3D blueprint editor.
export const LIBRARY_TABS = [
  { key: "all", label: "All" },
  { key: "templates", label: "Templates" },
  { key: "parts", label: "Parts" },
];

export const getLibraryBucket = (groupLabel = "") => {
  const text = groupLabel.toLowerCase();

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
    background: "rgba(7, 14, 26, 0.96)",
    border: "1px solid rgba(112, 140, 176, 0.24)",
    borderRadius: 10,
    padding: 12,
    backdropFilter: "blur(8px)",
    boxShadow: "0 18px 42px rgba(0,0,0,.30)",
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
    width: 352,
    maxWidth: "calc(100% - 28px)",
    maxHeight: "calc(100% - 28px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "rgba(7, 14, 26, 0.96)",
    border: "1px solid rgba(112, 140, 176, 0.24)",
    borderRadius: 10,
    padding: 12,
    backdropFilter: "blur(8px)",
    boxShadow: "0 18px 42px rgba(0,0,0,.30)",
    boxSizing: "border-box",
    zIndex: 9,
  },

  inspectorTabsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    marginBottom: 10,
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "rgba(7, 14, 26, 0.96)",
    paddingBottom: 2,
  },

  inspectorTabBtn: {
    height: 36,
    padding: "0 10px",
    borderRadius: 7,
    border: "1px solid rgba(89, 112, 143, 0.72)",
    background: "rgba(11,20,36,.92)",
    color: "#b7c5da",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    minWidth: 0,
    boxSizing: "border-box",
  },

  inspectorTabBtnActive: {
    border: "1px solid rgba(96,165,250,.65)",
    background:
      "linear-gradient(180deg, rgba(37,99,235,.28) 0%, rgba(29,78,216,.2) 100%)",
    color: "#eef4ff",
    boxShadow: "inset 0 0 0 1px rgba(147,197,253,.08)",
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
