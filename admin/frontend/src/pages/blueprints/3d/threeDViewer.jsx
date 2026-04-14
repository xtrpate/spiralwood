// 3d/ThreeDViewer.jsx — Three.js scene, inspector panels, and toolbar
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import {
  getTemplateLibraryPartGroups,
  buildFurnitureTemplateParts,
  buildDiningChairParts,
} from "../data/templateComponents";
import { createFurnitureObject } from "./createFurnitureObjects";
import {
  WOOD_FINISHES,
  VIEWS,
  CASEWORK_SET,
  CHAIR_PART_SET,
  COMPONENT_LIBRARY_GROUPS,
  FURNITURE_TEMPLATE_SET,
} from "../data/furnitureTypes";
import {
  applyWoodFinish,
  isWoodLikeMaterial,
  normalizeComponent,
} from "../data/componentUtils";
import {
  snap,
  clamp,
  makeId,
  mmToDisplay,
  displayToMm,
  formatDim,
  formatDims,
} from "../data/utils";
import S from "../styles/blueprintStyles";

const GRID_SIZE = 20;
const FLOOR_OFFSET = 40;
const MM_PER_INCH = 25.4;

const LIBRARY_TABS = [
  { key: "all", label: "All" },
  { key: "templates", label: "Templates" },
  { key: "parts", label: "Parts" },
];

const getLibraryBucket = (groupLabel = "") => {
  const text = groupLabel.toLowerCase();

  if (text.includes("part")) return "parts";
  if (text.includes("template")) return "templates";

  return "all";
};

const VIEWER_UI = {
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
    background: "rgba(9,14,25,.9)",
    border: "1px solid rgba(148,163,184,.14)",
    borderRadius: 14,
    padding: 12,
    backdropFilter: "blur(8px)",
    boxShadow: "0 10px 30px rgba(0,0,0,.25)",
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
    width: 320,
    maxWidth: "calc(100% - 28px)",
    maxHeight: "calc(100% - 28px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "rgba(9,14,25,.9)",
    border: "1px solid rgba(148,163,184,.14)",
    borderRadius: 14,
    padding: 12,
    backdropFilter: "blur(8px)",
    boxShadow: "0 10px 30px rgba(0,0,0,.25)",
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
    background: "rgba(9,14,25,.9)",
    paddingBottom: 2,
  },

  inspectorTabBtn: {
    height: 36,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid rgba(71,85,105,.72)",
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

  smartActionsPanelDocked: {
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

// --- NEW: Objects Tree Panel ---

const LIBRARY_PREVIEW = {
  templateHeight: 108,
  partHeight: 86,
};

function FloatingObjectsTree({
  components,
  selectedId,
  selectedIds = [],
  onSelect,
  isOpen,
  onToggle,
  isLocked3D,
}) {
  const grouped = useMemo(() => {
    const groups = {};
    const standalone = [];

    (components || []).forEach((c) => {
      if (c.groupId) {
        if (!groups[c.groupId]) {
          groups[c.groupId] = {
            id: c.groupId,
            label: c.groupLabel || "Group",
            items: [],
          };
        }
        groups[c.groupId].items.push(c);
      } else {
        standalone.push(c);
      }
    });

    return { groups: Object.values(groups), standalone };
  }, [components]);

  const handleSelect = (id, e) => {
    e.stopPropagation();

    if (e.shiftKey) {
      const base = Array.isArray(selectedIds) ? selectedIds : [];
      const newSelected = base.includes(id)
        ? base.filter((i) => i !== id)
        : [...base, id];

      onSelect?.(newSelected, newSelected[newSelected.length - 1] || null);
    } else {
      onSelect?.([id], id);
    }
  };

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          onClick={onToggle}
          style={{ ...S.libraryToggleBtn, top: 60 }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>▤</span>
          <span>Objects</span>
        </button>
      ) : null}

      <div
        style={{
          ...VIEWER_UI.sideDockPanel,
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "translateX(0)" : "translateX(-18px)",
          pointerEvents: isOpen ? "auto" : "none",
          zIndex: isOpen ? 50 : 1,
        }}
      >
        <div style={S.libraryHeaderRow}>
          <div style={{ minWidth: 0 }}>
            <div style={S.floatingTitle}>Objects Tree</div>
            <div style={S.librarySubtleText}>Blueprint components</div>
          </div>

          <button type="button" onClick={onToggle} style={S.libraryCloseBtn}>
            ×
          </button>
        </div>

        <div
          style={{
            ...VIEWER_UI.sideDockBody,
            display: "grid",
            gap: 6,
            marginTop: 10,
          }}
        >
          {grouped.groups.map((g) => (
            <div key={g.id} style={{ marginBottom: 8 }}>
              <div style={{ ...S.floatingSectionLabel, color: "#93c5fd" }}>
                ▼ {g.label}
              </div>

              <div
                style={{
                  paddingLeft: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                {g.items.map((item) => {
                  const active =
                    (Array.isArray(selectedIds) &&
                      selectedIds.includes(item.id)) ||
                    selectedId === item.id;
                  const locked = isLocked3D?.(item);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => handleSelect(item.id, e)}
                      style={{
                        ...S.floatingPaletteBtn,
                        justifyContent: "space-between",
                        textAlign: "left",
                        border: active
                          ? "1px solid rgba(96,165,250,.75)"
                          : "1px solid rgba(71,85,105,.55)",
                        background: active
                          ? "linear-gradient(180deg, rgba(37,99,235,.28) 0%, rgba(29,78,216,.18) 100%)"
                          : "rgba(15,23,42,.72)",
                        color: "#e5eefc",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: item.fill || "#94a3b8",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.partCode
                            ? `${item.partCode} — ${item.label}`
                            : item.label}
                        </span>
                      </span>

                      {locked ? (
                        <span
                          style={{ fontSize: 11, opacity: 0.85, marginLeft: 8 }}
                        >
                          🔒
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {grouped.standalone.length ? (
            <div>
              <div style={{ ...S.floatingSectionLabel, color: "#93c5fd" }}>
                Standalone
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                {grouped.standalone.map((item) => {
                  const active =
                    (Array.isArray(selectedIds) &&
                      selectedIds.includes(item.id)) ||
                    selectedId === item.id;
                  const locked = isLocked3D?.(item);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => handleSelect(item.id, e)}
                      style={{
                        ...S.floatingPaletteBtn,
                        justifyContent: "space-between",
                        textAlign: "left",
                        border: active
                          ? "1px solid rgba(96,165,250,.75)"
                          : "1px solid rgba(71,85,105,.55)",
                        background: active
                          ? "linear-gradient(180deg, rgba(37,99,235,.28) 0%, rgba(29,78,216,.18) 100%)"
                          : "rgba(15,23,42,.72)",
                        color: "#e5eefc",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: item.fill || "#94a3b8",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.partCode
                            ? `${item.partCode} — ${item.label}`
                            : item.label}
                        </span>
                      </span>

                      {locked ? (
                        <span
                          style={{ fontSize: 11, opacity: 0.85, marginLeft: 8 }}
                        >
                          🔒
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!grouped.groups.length && !grouped.standalone.length ? (
            <div style={S.libraryEmptyState}>No objects in scene.</div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function getLibraryThumbnailSrc(item = {}) {
  return (
    item?.thumbnailPng ||
    item?.thumbnailUrl ||
    item?.thumbnail ||
    item?.iconPng ||
    item?.iconUrl ||
    item?.icon ||
    ""
  );
}

function formatLibraryDims(item = {}) {
  const rawW =
    item?.w ??
    item?.width ??
    item?.size?.w ??
    item?.size?.width ??
    item?.dimensions?.w ??
    item?.dimensions?.width;

  const rawH =
    item?.h ??
    item?.height ??
    item?.size?.h ??
    item?.size?.height ??
    item?.dimensions?.h ??
    item?.dimensions?.height;

  const rawD =
    item?.d ??
    item?.depth ??
    item?.size?.d ??
    item?.size?.depth ??
    item?.dimensions?.d ??
    item?.dimensions?.depth;

  const w = Number(rawW) || 0;
  const h = Number(rawH) || 0;
  const d = Number(rawD) || 0;

  if (w <= 0 || h <= 0 || d <= 0) {
    const isPart =
      Boolean(item?.isTemplatePart) ||
      String(item?.category || "")
        .toLowerCase()
        .includes("part");

    return isPart ? "Size unavailable" : "Template size unavailable";
  }

  return `${Math.round(w)} × ${Math.round(h)} × ${Math.round(d)} mm`;
}

function getLibraryPlaceholderLabel(item = {}, isTemplate = false) {
  if (isTemplate) return "TEMPLATE";

  const text =
    `${item?.label || ""} ${item?.type || ""} ${item?.category || ""}`.toLowerCase();

  if (text.includes("drawer")) return "DRAWER";
  if (text.includes("door")) return "DOOR";
  if (text.includes("shelf")) return "SHELF";
  if (text.includes("leg")) return "LEG";
  if (text.includes("rail") || text.includes("apron")) return "RAIL";
  if (text.includes("panel")) return "PANEL";

  return "PART";
}

function VisualLibraryCard({
  item,
  onPointerDown,
  isTemplate = false,
  tooltip,
}) {
  const [hovered, setHovered] = useState(false);

  const thumbnailSrc = getLibraryThumbnailSrc(item);
  const placeholderLabel = getLibraryPlaceholderLabel(item, isTemplate);

  if (isTemplate) {
    return (
      <button
        type="button"
        onPointerDown={onPointerDown}
        onDragStart={(e) => e.preventDefault()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        style={{
          position: "relative",
          width: "100%",
          minHeight: 104,
          padding: 8,
          borderRadius: 16,
          border: "1px solid rgba(71, 110, 180, 0.42)",
          background:
            "linear-gradient(180deg, rgba(8,16,30,.98) 0%, rgba(6,12,24,.98) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
          cursor: "grab",
          overflow: "hidden",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "none",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "122px minmax(0, 1fr)",
            alignItems: "stretch",
            gap: 10,
            width: "100%",
            minHeight: 86,
          }}
        >
          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(70, 103, 162, 0.24)",
              background:
                "radial-gradient(circle at 35% 20%, rgba(70,130,220,.18) 0%, rgba(26,39,66,.18) 35%, rgba(9,15,26,.84) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.02)",
              overflow: "hidden",
              position: "relative",
              minHeight: 86,
            }}
          >
            {thumbnailSrc ? (
              <img
                src={thumbnailSrc}
                alt={tooltip.title}
                draggable={false}
                style={{
                  width: "84%",
                  height: "84%",
                  objectFit: "contain",
                  display: "block",
                  pointerEvents: "none",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  filter: "drop-shadow(0 8px 18px rgba(0,0,0,.28))",
                }}
              />
            ) : (
              <div
                style={{
                  width: "84%",
                  height: "78%",
                  borderRadius: 12,
                  border: "1px dashed rgba(96,165,250,.28)",
                  background:
                    "linear-gradient(180deg, rgba(10,18,34,.78) 0%, rgba(8,14,26,.92) 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 8,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: ".12em",
                    color: "rgba(191,219,254,.88)",
                    textAlign: "center",
                    lineHeight: 1.35,
                  }}
                >
                  {placeholderLabel}
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingRight: 8,
            }}
          >
            <div
              style={{
                width: "100%",
                color: "#e8f0ff",
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1.45,
                letterSpacing: ".01em",
                textAlign: "left",
                overflow: "hidden",
                wordBreak: "break-word",
              }}
            >
              {tooltip.title}
            </div>
          </div>
        </div>

        {hovered ? (
          <div
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              maxWidth: 150,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(96,165,250,.28)",
              background: "rgba(6,10,18,.92)",
              backdropFilter: "blur(6px)",
              color: "#e5eefc",
              textAlign: "left",
              boxShadow: "0 12px 24px rgba(0,0,0,.32)",
              pointerEvents: "none",
              zIndex: 20,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#cbd5e1",
                lineHeight: 1.45,
                fontWeight: 600,
              }}
            >
              {tooltip.material}
            </div>

            <div
              style={{
                fontSize: 10,
                color: "#93c5fd",
                lineHeight: 1.45,
                marginTop: 2,
              }}
            >
              {tooltip.dims}
            </div>
          </div>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onDragStart={(e) => e.preventDefault()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        position: "relative",
        width: "100%",
        height: LIBRARY_PREVIEW.partHeight,
        padding: 8,
        borderRadius: 14,
        border: "1px solid rgba(71, 110, 180, 0.42)",
        background:
          "linear-gradient(180deg, rgba(8,16,30,.98) 0%, rgba(6,12,24,.98) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
        cursor: "grab",
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 12,
          border: "1px solid rgba(70, 103, 162, 0.24)",
          background:
            "radial-gradient(circle at 35% 20%, rgba(70,130,220,.18) 0%, rgba(26,39,66,.18) 35%, rgba(9,15,26,.84) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.02)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={tooltip.title}
            draggable={false}
            style={{
              width: "84%",
              height: "84%",
              objectFit: "contain",
              display: "block",
              pointerEvents: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              filter: "drop-shadow(0 8px 18px rgba(0,0,0,.28))",
            }}
          />
        ) : (
          <div
            style={{
              width: "84%",
              height: "78%",
              borderRadius: 12,
              border: "1px dashed rgba(96,165,250,.28)",
              background:
                "linear-gradient(180deg, rgba(10,18,34,.78) 0%, rgba(8,14,26,.92) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: ".12em",
                color: "rgba(191,219,254,.88)",
                textAlign: "center",
                lineHeight: 1.35,
              }}
            >
              {placeholderLabel}
            </div>
          </div>
        )}
      </div>

      {hovered ? (
        <div
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            bottom: 8,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(96,165,250,.28)",
            background: "rgba(6,10,18,.88)",
            backdropFilter: "blur(6px)",
            color: "#e5eefc",
            textAlign: "left",
            boxShadow: "0 12px 24px rgba(0,0,0,.32)",
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1.35,
              marginBottom: 4,
            }}
          >
            {tooltip.title}
          </div>

          <div
            style={{
              fontSize: 10,
              color: "#9fb3cf",
              lineHeight: 1.45,
            }}
          >
            {tooltip.material}
          </div>

          <div
            style={{
              fontSize: 10,
              color: "#93c5fd",
              lineHeight: 1.45,
              marginTop: 2,
            }}
          >
            {tooltip.dims}
          </div>
        </div>
      ) : null}
    </button>
  );
}
function Floating3DPalette({
  onAdd,
  onStartDrag,
  onOpenCabinetBuilder,
  activeBuildLabel,
  isOpen,
  onToggle,
  isDragPlacementActive,
  pendingPlacement,
}) {
  const [activeTab, setActiveTab] = useState("templates");
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState({
    __builder__: true,
  });
  const [showActiveBuildNotice, setShowActiveBuildNotice] = useState(false);
  const [activeBuildCountdown, setActiveBuildCountdown] = useState(0);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();

    const mergedGroups = [
      ...COMPONENT_LIBRARY_GROUPS.filter(
        (group) => group.label !== "Chair Parts",
      ),
      ...getTemplateLibraryPartGroups(),
    ];

    return mergedGroups
      .map((group) => {
        const bucket = getLibraryBucket(group.label);
        const tabMatches = activeTab === "all" || bucket === activeTab;

        const items = (group.items || []).filter((item) => {
          const haystack =
            `${item.label || ""} ${item.type || ""} ${item.category || ""} ${item.material || ""}`.toLowerCase();

          const searchMatches = !query || haystack.includes(query);
          return tabMatches && searchMatches;
        });

        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);
  }, [activeTab, search]);

  const handlePointerDown = useCallback(
    (item, event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      onStartDrag?.(item, event);
    },
    [onStartDrag],
  );

  const builderVisible = false;

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      let changed = false;

      if (next.__builder__ === undefined) {
        next.__builder__ = true;
        changed = true;
      }

      filteredGroups.forEach((group, index) => {
        if (next[group.label] === undefined) {
          next[group.label] = index < 2;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [filteredGroups]);

  const totalVisibleItems = useMemo(
    () => filteredGroups.reduce((sum, group) => sum + group.items.length, 0),
    [filteredGroups],
  );

  const totalVisibleSections = filteredGroups.length;

  const activeTabLabel =
    LIBRARY_TABS.find((tab) => tab.key === activeTab)?.label || "Library";

  const toggleSection = useCallback((key) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  }, []);

  const getItemTooltip = useCallback((item) => {
    return {
      title: String(item?.label || "Unnamed Item").trim(),
      material: String(item?.material || "No material").trim(),
      dims: formatLibraryDims(item),
    };
  }, []);

  const handleBuilderShortcutClick = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      onOpenCabinetBuilder?.();
    },
    [onOpenCabinetBuilder],
  );

  useEffect(() => {
    if (!activeBuildLabel) {
      setShowActiveBuildNotice(false);
      setActiveBuildCountdown(0);
      return;
    }

    setShowActiveBuildNotice(true);
    setActiveBuildCountdown(4);

    const intervalId = setInterval(() => {
      setActiveBuildCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalId);
          setShowActiveBuildNotice(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeBuildLabel]);

  return (
    <>
      {!isOpen ? (
        <button type="button" onClick={onToggle} style={S.libraryToggleBtn}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>☰</span>
          <span>Library</span>
        </button>
      ) : null}

      <div
        style={{
          ...VIEWER_UI.sideDockPanel,
          width: 262,
          padding: 8,
          borderRadius: 14,
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "translateX(0)" : "translateX(-18px)",
          pointerEvents: isOpen ? "auto" : "none",
          zIndex: isOpen ? 50 : 1,
        }}
      >
        <div style={S.libraryStickyTop}>
          <div style={S.libraryHeaderRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={S.floatingTitle}>Furniture Library</div>
              <div style={S.librarySubtleText}>
                Click-hold to spawn, then drag to place
              </div>
            </div>

            <button type="button" onClick={onToggle} style={S.libraryCloseBtn}>
              ×
            </button>
          </div>

          {pendingPlacement ? (
            <div
              style={{
                marginTop: 8,
                padding: "7px 10px",
                borderRadius: 10,
                border: "1px solid rgba(96,165,250,.34)",
                background: "rgba(17,24,39,.92)",
                color: "#dbeafe",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1.45,
              }}
            >
              Placing: {pendingPlacement.label}
            </div>
          ) : activeBuildLabel && showActiveBuildNotice ? (
            <div
              style={{
                ...S.activeBuildPill,
                marginTop: 8,
                marginBottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Active build: {activeBuildLabel}
              </span>

              <span
                style={{
                  flexShrink: 0,
                  fontSize: 9,
                  fontWeight: 800,
                  opacity: 0.9,
                }}
              >
                {activeBuildCountdown}s
              </span>
            </div>
          ) : null}

          <div style={{ marginTop: 10 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search template or part..."
              style={S.floatingSearchInput}
            />
          </div>

          <div
            style={{
              ...S.libraryTabsRow,
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              marginTop: 10,
              marginBottom: 0,
            }}
          >
            {LIBRARY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  ...S.libraryTabBtn,
                  ...(activeTab === tab.key ? S.libraryTabBtnActive : {}),
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={S.librarySummaryRow}>
            <span style={S.librarySummaryPill}>{activeTabLabel}</span>
            <span style={S.librarySummaryPill}>{totalVisibleItems} items</span>
            <span style={S.librarySummaryPill}>
              {totalVisibleSections} sections
            </span>
          </div>
        </div>

        <div
          style={{
            ...VIEWER_UI.sideDockBody,
            ...S.libraryGroupsWrap,
            minHeight: 0,
            overflowX: "hidden",
            paddingTop: 2,
          }}
        >
          {builderVisible ? (
            <div style={S.librarySectionCard}>
              <button
                type="button"
                onClick={() => toggleSection("__builder__")}
                style={S.librarySectionToggle}
              >
                <span style={S.librarySectionToggleTitle}>
                  Builder Shortcuts
                </span>

                <span style={S.librarySectionToggleMeta}>
                  <span style={S.librarySectionCount}>1</span>
                  <span style={S.libraryChevron}>
                    {openSections.__builder__ !== false ? "−" : "+"}
                  </span>
                </span>
              </button>

              {openSections.__builder__ !== false ? (
                <div style={S.librarySectionItems}>
                  <button
                    type="button"
                    onClick={handleBuilderShortcutClick}
                    style={{
                      ...S.floatingPrimaryBtn,
                      width: "100%",
                      minHeight: 50,
                      padding: "8px 10px",
                      alignItems: "flex-start",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 3,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800 }}>
                      Cabinet Builder
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        lineHeight: 1.45,
                        color: "rgba(255,255,255,.84)",
                        fontWeight: 500,
                        textAlign: "left",
                      }}
                    >
                      Open Tools → Builders to set cabinet size, shelves,
                      divider, and front layout.
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {filteredGroups.length ? (
            filteredGroups.map((group) => {
              const isOpenSection = openSections[group.label] !== false;
              const isTemplateGroup =
                getLibraryBucket(group.label) === "templates";

              return (
                <div key={group.label} style={S.librarySectionCard}>
                  <button
                    type="button"
                    onClick={() => toggleSection(group.label)}
                    style={S.librarySectionToggle}
                  >
                    <span style={S.librarySectionToggleTitle}>
                      {group.label}
                    </span>

                    <span style={S.librarySectionToggleMeta}>
                      <span style={S.librarySectionCount}>
                        {group.items.length}
                      </span>
                      <span style={S.libraryChevron}>
                        {isOpenSection ? "−" : "+"}
                      </span>
                    </span>
                  </button>
                  {isOpenSection ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isTemplateGroup
                          ? "repeat(1, minmax(0, 1fr))"
                          : "repeat(2, minmax(0, 1fr))",
                        gap: 8,
                      }}
                    >
                      {group.items.map((t) => {
                        const tooltip = getItemTooltip(t);

                        return (
                          <VisualLibraryCard
                            key={`${group.label}-${t.type}-${t.label}`}
                            item={t}
                            isTemplate={isTemplateGroup}
                            tooltip={tooltip}
                            onPointerDown={(event) =>
                              handlePointerDown(t, event)
                            }
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div style={S.libraryEmptyState}>No matching components found.</div>
          )}
        </div>
      </div>
    </>
  );
}

function Floating3DInspector({
  selectedComp: committedSelectedComp,
  liveSelectedComp = null,
  selectedIds = [],
  isLocked,
  onChange,
  unit,
  editorMode,
  activeInspectorTab = "properties",
  onChangeInspectorTab,
  renderSmartBuild = null,
}) {
  const selectedComp = liveSelectedComp || committedSelectedComp;
  const hasSmartBuild = Boolean(renderSmartBuild);

  if (!selectedComp && !hasSmartBuild) return null;

  const handleNumericChange = (key) => (e) => {
    if (!selectedComp) return;
    onChange(selectedComp.id, {
      [key]: displayToMm(e.target.value, unit),
    });
  };

  const applyStyleChange = (attrs) => {
    if (!selectedComp) return;
    onChange(selectedComp.id, attrs, {
      applyToSelection: selectedIds.length > 1,
    });
  };

  const applySelectionChange = (attrs) => {
    if (!selectedComp) return;
    onChange(selectedComp.id, attrs, {
      applyToSelection: selectedIds.length > 1,
    });
  };

  const unitLabel = unit === "inch" ? "in" : "mm";

  const isRoundedBox = selectedComp?.type === "rounded_box";
  const boxWallMax = selectedComp
    ? Math.max(
        20,
        Math.floor(Math.min(selectedComp.width, selectedComp.depth) / 2) - 10,
      )
    : 20;

  const boxBottomMax = selectedComp
    ? Math.max(20, Math.floor(selectedComp.height) - 20)
    : 20;

  const faceLabels = {
    top: "Top",
    bottom: "Bottom",
    front: "Front",
    back: "Back",
    left: "Left",
    right: "Right",
  };

  const selectedFace = isRoundedBox
    ? selectedComp.selectedFace || "top"
    : "top";

  const selectedFaceCap = `${selectedFace.charAt(0).toUpperCase()}${selectedFace.slice(1)}`;

  const selectedFaceField = `faceOpen${selectedFaceCap}`;
  const selectedFaceInsetField = `faceInset${selectedFaceCap}`;
  const selectedFaceExtrudeField = `faceExtrude${selectedFaceCap}`;

  const selectedFaceIsOpen = !!selectedComp?.[selectedFaceField];
  const selectedFaceInset = Number(selectedComp?.[selectedFaceInsetField]) || 0;
  const selectedFaceExtrude =
    Number(selectedComp?.[selectedFaceExtrudeField]) || 0;

  const selectedFaceInsetMax = !selectedComp
    ? 0
    : selectedFace === "top" || selectedFace === "bottom"
      ? Math.max(
          0,
          Math.floor(Math.min(selectedComp.width, selectedComp.depth) / 2) - 20,
        )
      : selectedFace === "front" || selectedFace === "back"
        ? Math.max(
            0,
            Math.floor(Math.min(selectedComp.width, selectedComp.height) / 2) -
              20,
          )
        : Math.max(
            0,
            Math.floor(Math.min(selectedComp.depth, selectedComp.height) / 2) -
              20,
          );

  const selectedFaceExtrudeMax = !selectedComp
    ? 0
    : selectedFace === "top" || selectedFace === "bottom"
      ? Math.max(0, Math.floor(selectedComp.height) - 20)
      : selectedFace === "front" || selectedFace === "back"
        ? Math.max(0, Math.floor(selectedComp.depth) - 20)
        : Math.max(0, Math.floor(selectedComp.width) - 20);

  const roundedBoxHasAnyOpenFace = selectedComp
    ? [
        selectedComp.faceOpenTop,
        selectedComp.faceOpenBottom,
        selectedComp.faceOpenFront,
        selectedComp.faceOpenBack,
        selectedComp.faceOpenLeft,
        selectedComp.faceOpenRight,
      ].some(Boolean)
    : false;

  const roundedBoxHasAnyFaceEdit = selectedComp
    ? [
        selectedComp.faceInsetTop,
        selectedComp.faceInsetBottom,
        selectedComp.faceInsetFront,
        selectedComp.faceInsetBack,
        selectedComp.faceInsetLeft,
        selectedComp.faceInsetRight,
        selectedComp.faceExtrudeTop,
        selectedComp.faceExtrudeBottom,
        selectedComp.faceExtrudeFront,
        selectedComp.faceExtrudeBack,
        selectedComp.faceExtrudeLeft,
        selectedComp.faceExtrudeRight,
      ].some((value) => Number(value) > 0)
    : false;

  const applyRoundedBoxSingleChange = (attrs) => {
    if (!selectedComp) return;
    onChange(selectedComp.id, attrs);
  };

  const clearAllRoundedBoxFaces = {
    faceOpenTop: false,
    faceOpenBottom: false,
    faceOpenFront: false,
    faceOpenBack: false,
    faceOpenLeft: false,
    faceOpenRight: false,
  };

  const clearAllRoundedBoxFaceEdits = {
    faceInsetTop: 0,
    faceInsetBottom: 0,
    faceInsetFront: 0,
    faceInsetBack: 0,
    faceInsetLeft: 0,
    faceInsetRight: 0,
    faceExtrudeTop: 0,
    faceExtrudeBottom: 0,
    faceExtrudeFront: 0,
    faceExtrudeBack: 0,
    faceExtrudeLeft: 0,
    faceExtrudeRight: 0,
  };

  const showPropertiesTab =
    activeInspectorTab === "properties" || !hasSmartBuild;

  const showSmartBuildTab =
    activeInspectorTab === "smartbuild" && hasSmartBuild;

  const inputStyle = {
    ...S.floatingInput,
    ...VIEWER_UI.fullWidthInput,
  };

  const infoCardStyle = {
    ...S.infoCard,
    ...VIEWER_UI.compactInfoCard,
  };

  const colorInputStyle = {
    ...inputStyle,
    padding: 2,
    height: 36,
  };

  return (
    <div style={VIEWER_UI.inspectorDockedPanel}>
      <div style={VIEWER_UI.inspectorTabsRow}>
        <button
          type="button"
          onClick={() => onChangeInspectorTab?.("properties")}
          style={{
            ...VIEWER_UI.inspectorTabBtn,
            ...(showPropertiesTab ? VIEWER_UI.inspectorTabBtnActive : {}),
          }}
        >
          Properties
        </button>

        <button
          type="button"
          onClick={() => onChangeInspectorTab?.("smartbuild")}
          style={{
            ...VIEWER_UI.inspectorTabBtn,
            ...(showSmartBuildTab ? VIEWER_UI.inspectorTabBtnActive : {}),
          }}
        >
          Tools
        </button>
      </div>

      <div style={VIEWER_UI.inspectorTabBody}>
        {showSmartBuildTab ? (
          renderSmartBuild
        ) : selectedComp ? (
          <>
            <div style={S.floatingTitle}>Selected Object</div>

            <div style={infoCardStyle}>
              <div>
                <b>
                  {selectedComp.partCode
                    ? `${selectedComp.partCode} — ${selectedComp.label}`
                    : selectedComp.label}
                </b>
              </div>
              <div>
                {formatDims(
                  selectedComp.width,
                  selectedComp.height,
                  selectedComp.depth,
                  unit,
                )}
              </div>
              <div>
                X {formatDim(selectedComp.x, unit)} · Y{" "}
                {formatDim(selectedComp.y, unit)} · Z{" "}
                {formatDim(selectedComp.z, unit)}
              </div>
              <div>Rot Y: {selectedComp.rotationY || 0}°</div>
              <div>{selectedComp.material || "—"}</div>
            </div>

            {[
              ["Width", "width"],
              ["Height", "height"],
              ["Depth", "depth"],
              ["X", "x"],
              ["Y", "y"],
              ["Z", "z"],
            ].map(([label, key]) => (
              <div key={key} style={{ marginBottom: 6 }}>
                <label style={S.floatingLabel}>
                  {label} ({unitLabel})
                </label>
                <input
                  type="number"
                  step={unit === "inch" ? "0.01" : "1"}
                  value={mmToDisplay(selectedComp[key] ?? 0, unit)}
                  disabled={editorMode !== "editable" || isLocked(selectedComp)}
                  onChange={handleNumericChange(key)}
                  style={inputStyle}
                />
              </div>
            ))}

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>
                Corner Radius (mm) — current: {selectedComp.cornerRadius ?? 0}mm
              </label>
              <input
                type="range"
                min="0"
                max="500"
                step="5"
                value={selectedComp.cornerRadius ?? 0}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  applySelectionChange({
                    cornerRadius: Number(e.target.value),
                  })
                }
                style={{ width: "100%", accentColor: "#3b82f6" }}
              />
              <input
                type="number"
                min="0"
                max="500"
                step="5"
                value={selectedComp.cornerRadius ?? 0}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  applySelectionChange({
                    cornerRadius: Math.max(
                      0,
                      Math.min(500, Number(e.target.value) || 0),
                    ),
                  })
                }
                style={inputStyle}
              />
            </div>

            {isRoundedBox && (
              <>
                <div style={infoCardStyle}>
                  <div>
                    <b>Box Face Edit</b>
                  </div>
                  <div>
                    Click a visible face in 3D, or use the face buttons below.
                  </div>
                  <div>Shortcuts: G Move · R Rotate · T Scale</div>
                  <div>
                    1-6 Select Face · O Open/Close Face · H Toggle Shell
                  </div>
                  <div>J/K Inset · N/M Extrude · [ / ] Wall</div>
                  <div>Shift + [ / ] Bottom · Alt + [ / ] Radius</div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label
                    style={{
                      ...S.floatingLabel,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor:
                        editorMode === "editable" && !isLocked(selectedComp)
                          ? "pointer"
                          : "not-allowed",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        !!selectedComp.isHollow ||
                        roundedBoxHasAnyOpenFace ||
                        roundedBoxHasAnyFaceEdit
                      }
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          applyRoundedBoxSingleChange({
                            isHollow: true,
                          });
                        } else {
                          applyRoundedBoxSingleChange({
                            isHollow: false,
                            ...clearAllRoundedBoxFaces,
                            ...clearAllRoundedBoxFaceEdits,
                          });
                        }
                      }}
                    />
                    Hollow / Shell
                  </label>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={S.floatingLabel}>Selected Face</label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 6,
                      marginBottom: 8,
                    }}
                  >
                    {["top", "front", "right", "back", "left", "bottom"].map(
                      (faceKey) => {
                        const isActive = selectedFace === faceKey;

                        return (
                          <button
                            key={faceKey}
                            type="button"
                            disabled={
                              editorMode !== "editable" ||
                              isLocked(selectedComp)
                            }
                            onClick={() =>
                              applyRoundedBoxSingleChange({
                                selectedFace: faceKey,
                              })
                            }
                            style={{
                              ...S.libraryTabBtn,
                              ...(isActive ? S.libraryTabBtnActive : {}),
                              opacity:
                                editorMode !== "editable" ||
                                isLocked(selectedComp)
                                  ? 0.55
                                  : 1,
                            }}
                          >
                            {faceLabels[faceKey]}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div style={infoCardStyle}>
                    <div>
                      <b>{faceLabels[selectedFace]}</b>
                    </div>
                    <div>Status: {selectedFaceIsOpen ? "Open" : "Closed"}</div>
                    <div>Inset: {selectedFaceInset}mm</div>
                    <div>Extrude: {selectedFaceExtrude}mm</div>
                  </div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label
                    style={{
                      ...S.floatingLabel,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor:
                        editorMode === "editable" && !isLocked(selectedComp)
                          ? "pointer"
                          : "not-allowed",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFaceIsOpen}
                      disabled={
                        editorMode !== "editable" || isLocked(selectedComp)
                      }
                      onChange={(e) =>
                        applyRoundedBoxSingleChange({
                          isHollow: true,
                          [selectedFaceField]: e.target.checked,
                        })
                      }
                    />
                    Open Selected Face
                  </label>
                </div>

                <div style={{ marginBottom: 6 }}>
                  <label style={S.floatingLabel}>
                    Inset Selected Face (mm) — current: {selectedFaceInset}mm
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={selectedFaceInsetMax}
                    step="5"
                    value={selectedFaceInset}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        isHollow: true,
                        [selectedFaceInsetField]: Math.max(
                          0,
                          Math.min(
                            selectedFaceInsetMax,
                            Number(e.target.value) || 0,
                          ),
                        ),
                      })
                    }
                    style={{ width: "100%", accentColor: "#a78bfa" }}
                  />
                  <input
                    type="number"
                    min="0"
                    max={selectedFaceInsetMax}
                    step="5"
                    value={selectedFaceInset}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        isHollow: true,
                        [selectedFaceInsetField]: Math.max(
                          0,
                          Math.min(
                            selectedFaceInsetMax,
                            Number(e.target.value) || 0,
                          ),
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 6 }}>
                  <label style={S.floatingLabel}>
                    Extrude Selected Face Inward (mm) — current:{" "}
                    {selectedFaceExtrude}mm
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={selectedFaceExtrudeMax}
                    step="5"
                    value={selectedFaceExtrude}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        isHollow: true,
                        [selectedFaceExtrudeField]: Math.max(
                          0,
                          Math.min(
                            selectedFaceExtrudeMax,
                            Number(e.target.value) || 0,
                          ),
                        ),
                      })
                    }
                    style={{ width: "100%", accentColor: "#f59e0b" }}
                  />
                  <input
                    type="number"
                    min="0"
                    max={selectedFaceExtrudeMax}
                    step="5"
                    value={selectedFaceExtrude}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        isHollow: true,
                        [selectedFaceExtrudeField]: Math.max(
                          0,
                          Math.min(
                            selectedFaceExtrudeMax,
                            Number(e.target.value) || 0,
                          ),
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onClick={() =>
                      applyRoundedBoxSingleChange({
                        [selectedFaceInsetField]: 0,
                        [selectedFaceExtrudeField]: 0,
                        [selectedFaceField]: false,
                      })
                    }
                    style={{
                      ...S.libraryTabBtn,
                      width: "100%",
                      opacity:
                        editorMode !== "editable" || isLocked(selectedComp)
                          ? 0.55
                          : 1,
                    }}
                  >
                    Reset Selected Face
                  </button>
                </div>

                <div style={{ marginBottom: 6 }}>
                  <label style={S.floatingLabel}>
                    Wall Thickness (mm) — current:{" "}
                    {selectedComp.wallThickness ?? 20}mm
                  </label>
                  <input
                    type="range"
                    min="10"
                    max={boxWallMax}
                    step="5"
                    value={selectedComp.wallThickness ?? 20}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        wallThickness: Math.max(
                          10,
                          Math.min(boxWallMax, Number(e.target.value) || 20),
                        ),
                      })
                    }
                    style={{ width: "100%", accentColor: "#38bdf8" }}
                  />
                  <input
                    type="number"
                    min="10"
                    max={boxWallMax}
                    step="5"
                    value={selectedComp.wallThickness ?? 20}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        wallThickness: Math.max(
                          10,
                          Math.min(boxWallMax, Number(e.target.value) || 20),
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 6 }}>
                  <label style={S.floatingLabel}>
                    Bottom Thickness (mm) — current:{" "}
                    {selectedComp.bottomThickness ?? 20}mm
                  </label>
                  <input
                    type="range"
                    min="10"
                    max={boxBottomMax}
                    step="5"
                    value={selectedComp.bottomThickness ?? 20}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        bottomThickness: Math.max(
                          10,
                          Math.min(boxBottomMax, Number(e.target.value) || 20),
                        ),
                      })
                    }
                    style={{ width: "100%", accentColor: "#22c55e" }}
                  />
                  <input
                    type="number"
                    min="10"
                    max={boxBottomMax}
                    step="5"
                    value={selectedComp.bottomThickness ?? 20}
                    disabled={
                      editorMode !== "editable" || isLocked(selectedComp)
                    }
                    onChange={(e) =>
                      applyRoundedBoxSingleChange({
                        bottomThickness: Math.max(
                          10,
                          Math.min(boxBottomMax, Number(e.target.value) || 20),
                        ),
                      })
                    }
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            {selectedComp.type === "shape_trapezoid" && (
              <div style={{ marginBottom: 6 }}>
                <label style={S.floatingLabel}>
                  Top Width Ratio —{" "}
                  {Math.round((selectedComp.topRatio ?? 0.5) * 100)}%
                </label>
                <input
                  type="range"
                  min="5"
                  max="98"
                  step="1"
                  value={Math.round((selectedComp.topRatio ?? 0.5) * 100)}
                  disabled={editorMode !== "editable" || isLocked(selectedComp)}
                  onChange={(e) =>
                    onChange(selectedComp.id, {
                      topRatio: Number(e.target.value) / 100,
                    })
                  }
                  style={{
                    width: "100%",
                    accentColor: "#f59e0b",
                    marginBottom: 4,
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Rotation Y (°)</label>
              <input
                type="number"
                value={selectedComp.rotationY ?? 0}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  onChange(selectedComp.id, {
                    rotationY: parseFloat(e.target.value) || 0,
                  })
                }
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Label</label>
              <input
                value={selectedComp.label || ""}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  onChange(selectedComp.id, { label: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Fill Color</label>
              <input
                type="color"
                value={selectedComp.fill || "#d9c2a5"}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  applyStyleChange({
                    fill: e.target.value,
                    finish: "",
                  })
                }
                style={colorInputStyle}
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Material</label>
              <input
                value={selectedComp.material || ""}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) => applyStyleChange({ material: e.target.value })}
                style={inputStyle}
              />
            </div>

            {(isWoodLikeMaterial(selectedComp.material) ||
              selectedComp.finish !== undefined) && (
              <div style={{ marginBottom: 6 }}>
                <label style={S.floatingLabel}>Wood Finish</label>
                <select
                  value={selectedComp.finish ?? ""}
                  disabled={editorMode !== "editable" || isLocked(selectedComp)}
                  onChange={(e) =>
                    applyStyleChange(
                      applyWoodFinish(selectedComp, e.target.value),
                    )
                  }
                  style={inputStyle}
                >
                  <option value="">Custom Color</option>
                  {WOOD_FINISHES.map((finish) => (
                    <option key={finish.id} value={finish.id}>
                      {finish.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 6 }}>
              <label style={S.floatingLabel}>Qty</label>
              <input
                type="number"
                min="1"
                value={selectedComp.qty || 1}
                disabled={editorMode !== "editable" || isLocked(selectedComp)}
                onChange={(e) =>
                  onChange(selectedComp.id, {
                    qty: Math.max(1, parseInt(e.target.value || "1", 10)),
                  })
                }
                style={inputStyle}
              />
            </div>
          </>
        ) : (
          <div style={S.libraryEmptyState}>Select an object to inspect.</div>
        )}
      </div>
    </div>
  );
}

function SmartActionsPanel({
  canUseSmartActions,
  smartSelectionCount = 0,
  hasLockedSmartSelection = false,
  onAlignSelection,
  onFlushSelection,
  onMirrorDuplicate,
  onSelectAssembly,
  onDuplicateAssembly,
  onArrayDuplicate,
  onDistributeSelection,
  onGapSelection,
  onBuildLineSelection,
  onAutoShelfStack,
  onAutoLegLayout,
  onPanelPairSelection,
  onFrontPairSelection,
  onDoorSplitSelection,
  onDrawerStackSelection,
  onFaceFitSelection,
  onInsideFitSelection,
  onBuildCabinetBox,
  onBuildCabinetInteriorPreset,
  onBuildCabinetFrontPreset,
  onBuildCabinetCustomBayFronts,
  onBuildCabinetCustomCellFronts,
  canBuildCabinetBox = false,
  canBuildCabinetInteriorPreset = false,
  canBuildCabinetFrontPreset = false,
  canBuildCabinetCustomBayFronts = false,
  canBuildCabinetCustomCellFronts = false,

  isDocked = false,
  activeToolTab: activeToolTabProp = undefined,
  onChangeToolTab = null,
}) {
  const [internalActiveToolTab, setInternalActiveToolTab] =
    useState("builders");
  const activeToolTab = activeToolTabProp ?? internalActiveToolTab;

  const setActiveToolTab = useCallback(
    (nextTab) => {
      if (typeof onChangeToolTab === "function") {
        onChangeToolTab(nextTab);
        return;
      }
      setInternalActiveToolTab(nextTab);
    },
    [onChangeToolTab],
  );
  const [arrayCount, setArrayCount] = useState(2);
  const [arraySpacing, setArraySpacing] = useState(0);
  const [gapValue, setGapValue] = useState(100);
  const [anchorMode, setAnchorMode] = useState("preserve-first");
  const [builderInset, setBuilderInset] = useState(40);
  const [builderDrawerCount, setBuilderDrawerCount] = useState(3);
  const [cabinetWidth, setCabinetWidth] = useState(1200);
  const [cabinetHeight, setCabinetHeight] = useState(2000);
  const [cabinetDepth, setCabinetDepth] = useState(600);
  const [cabinetThickness, setCabinetThickness] = useState(20);
  const [cabinetShelfCount, setCabinetShelfCount] = useState(2);
  const [cabinetHasDivider, setCabinetHasDivider] = useState(false);
  const [interiorPreset, setInteriorPreset] = useState("two-column");
  const [frontPreset, setFrontPreset] = useState("double-door");
  const [frontReveal, setFrontReveal] = useState(10);
  const [frontGap, setFrontGap] = useState(10);
  const [frontThickness, setFrontThickness] = useState(20);
  const [frontTargetBayIndex, setFrontTargetBayIndex] = useState(1);
  const [bay1FrontType, setBay1FrontType] = useState("door");
  const [bay2FrontType, setBay2FrontType] = useState("drawer");
  const [bay3FrontType, setBay3FrontType] = useState("door");
  const [cellFrontAssignments, setCellFrontAssignments] = useState([
    "door",
    "door",
    "door",
    "door",
    "door",
    "door",
    "door",
    "door",
    "door",
  ]);

  const canPairActions = canUseSmartActions && smartSelectionCount > 1;
  const canMirror = canUseSmartActions && smartSelectionCount > 0;
  const canAssemblyActions = canUseSmartActions && smartSelectionCount > 0;
  const canDistribute = canUseSmartActions && smartSelectionCount > 2;
  const canGapActions = canUseSmartActions && smartSelectionCount > 1;
  const canBuilderHelpers = canUseSmartActions && smartSelectionCount > 0;
  const canStrictMultiBuilderHelpers =
    canUseSmartActions && smartSelectionCount > 1;
  const canQuickCabinetBuilder =
    canBuildCabinetBox && typeof onBuildCabinetBox === "function";
  const canInteriorPresetBuilder =
    canBuildCabinetInteriorPreset &&
    typeof onBuildCabinetInteriorPreset === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;
  const canFrontPresetBuilder =
    canBuildCabinetFrontPreset &&
    typeof onBuildCabinetFrontPreset === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;
  const canCustomBayFrontBuilder =
    canBuildCabinetCustomBayFronts &&
    typeof onBuildCabinetCustomBayFronts === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;
  const canCustomCellFrontBuilder =
    canBuildCabinetCustomCellFronts &&
    typeof onBuildCabinetCustomCellFronts === "function" &&
    smartSelectionCount > 0 &&
    !hasLockedSmartSelection;

  const handlePanelPointerDown = (e) => {
    e.stopPropagation();
  };

  const makeHandler =
    (enabled, fn, ...args) =>
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (enabled) fn?.(...args);
    };

  const getBtnStyle = (enabled, warn = false) => ({
    ...(warn ? S.smartActionBtnWarn : S.smartActionBtn),
    opacity: enabled ? 1 : 0.45,
    cursor: enabled ? "pointer" : "not-allowed",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  });

  const getAnchorBtnStyle = (mode) => ({
    ...getBtnStyle(canGapActions),
    ...(anchorMode === mode
      ? {
          border: "1px solid rgba(96,165,250,.75)",
          background:
            "linear-gradient(180deg, rgba(37,99,235,.30) 0%, rgba(29,78,216,.22) 100%)",
          color: "#eef4ff",
          boxShadow: "inset 0 0 0 1px rgba(147,197,253,.12)",
        }
      : {}),
  });

  const fieldStyle = {
    ...S.smartActionsField,
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
  };

  const actionInputStyle = {
    ...S.smartActionsInput,
    width: "100%",
    boxSizing: "border-box",
  };

  const toolTabs = [
    {
      key: "arrange",
      label: "Arrange",
      hint: "Align, flush, spacing, and lineup tools for current selection.",
    },
    {
      key: "builders",
      label: "Builders",
      hint: "Cabinet generator and smart builder helpers.",
    },
    {
      key: "duplicate",
      label: "Duplicate",
      hint: "Mirror, assembly actions, and repeat / array tools.",
    },
  ];

  const sectionCardStyle = {
    border: "1px solid rgba(71,85,105,.45)",
    background:
      "linear-gradient(180deg, rgba(8,17,32,.86) 0%, rgba(7,14,26,.92) 100%)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    boxSizing: "border-box",
  };

  const sectionHintStyle = {
    fontSize: 10,
    color: "#8ea0b8",
    lineHeight: 1.45,
    marginBottom: 8,
  };

  const toolTabsRowStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 6,
    marginBottom: 10,
  };

  const getToolTabBtnStyle = (key) => ({
    ...S.libraryTabBtn,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    ...(activeToolTab === key ? S.libraryTabBtnActive : {}),
  });

  const statusText = hasLockedSmartSelection
    ? "Locked items selected. Unlock them first."
    : smartSelectionCount > 1
      ? `${smartSelectionCount} objects selected`
      : smartSelectionCount === 1
        ? "1 object selected"
        : "No active selection. Builders can still create a new cabinet.";

  const activeTabHint =
    toolTabs.find((tab) => tab.key === activeToolTab)?.hint || "";

  return (
    <div
      style={isDocked ? VIEWER_UI.smartActionsPanelDocked : S.smartActionsPanel}
      onMouseDown={handlePanelPointerDown}
      onPointerDown={handlePanelPointerDown}
    >
      <div style={S.smartActionsTitle}>Build Tools</div>
      <div style={S.smartActionsSubtle}>{statusText}</div>

      <div style={toolTabsRowStyle}>
        {toolTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={makeHandler(true, setActiveToolTab, tab.key)}
            style={getToolTabBtnStyle(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        style={{
          ...S.infoCard,
          marginBottom: 10,
          padding: "8px 10px",
          lineHeight: 1.55,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#93c5fd",
            fontWeight: 700,
            marginBottom: 2,
          }}
        >
          {toolTabs.find((tab) => tab.key === activeToolTab)?.label || "Tools"}
        </div>
        <div style={{ fontSize: 10, color: "#cbd5e1" }}>{activeTabHint}</div>
      </div>

      {activeToolTab === "arrange" ? (
        <>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Align</div>
            <div style={sectionHintStyle}>
              Use these to line up the current selection on X, Y, or Z.
            </div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "x",
                  "min",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Left
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "x",
                  "center",
                )}
                style={getBtnStyle(canPairActions)}
              >
                X Center
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "x",
                  "max",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Right
              </button>

              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "z",
                  "min",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Front
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "z",
                  "center",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Z Center
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "z",
                  "max",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Back
              </button>

              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "y",
                  "min",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Bottom
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "y",
                  "center",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Y Center
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onAlignSelection,
                  "y",
                  "max",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Top
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Flush Snap</div>
            <div style={sectionHintStyle}>
              Snap selected parts flush to the outer edges of the current
              selection bounds.
            </div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "x",
                  "negative",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush L
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "x",
                  "positive",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush R
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "y",
                  "negative",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush Bot
              </button>

              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "z",
                  "negative",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush F
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "z",
                  "positive",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush B
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canPairActions,
                  onFlushSelection,
                  "y",
                  "positive",
                )}
                style={getBtnStyle(canPairActions)}
              >
                Flush Top
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Spacing & Layout</div>
            <div style={sectionHintStyle}>
              Control the gap, anchor rule, distribute spacing, and build clean
              rows or stacks.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label
                style={{
                  ...fieldStyle,
                  gridColumn: "1 / span 2",
                }}
              >
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Gap (mm)</span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={gapValue}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setGapValue(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsSectionLabel}>Anchor Mode</div>
            <div style={{ ...S.smartActionsGrid, marginBottom: 8 }}>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  setAnchorMode,
                  "preserve-first",
                )}
                style={getAnchorBtnStyle("preserve-first")}
              >
                First
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  setAnchorMode,
                  "preserve-last",
                )}
                style={getAnchorBtnStyle("preserve-last")}
              >
                Last
              </button>
              <button
                type="button"
                onClick={makeHandler(canGapActions, setAnchorMode, "center")}
                style={getAnchorBtnStyle("center")}
              >
                Center
              </button>
            </div>

            <div style={S.smartActionsSectionLabel}>Distribute</div>
            <div style={{ ...S.smartActionsGrid, marginBottom: 8 }}>
              <button
                type="button"
                onClick={makeHandler(
                  canDistribute,
                  onDistributeSelection,
                  "x",
                  anchorMode,
                )}
                style={getBtnStyle(canDistribute)}
              >
                Dist X
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canDistribute,
                  onDistributeSelection,
                  "y",
                  anchorMode,
                )}
                style={getBtnStyle(canDistribute)}
              >
                Dist Y
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canDistribute,
                  onDistributeSelection,
                  "z",
                  anchorMode,
                )}
                style={getBtnStyle(canDistribute)}
              >
                Dist Z
              </button>
            </div>

            <div style={S.smartActionsSectionLabel}>Equal Gap</div>
            <div style={{ ...S.smartActionsGrid, marginBottom: 8 }}>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onGapSelection,
                  "x",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Gap X
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onGapSelection,
                  "y",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Gap Y
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onGapSelection,
                  "z",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Gap Z
              </button>
            </div>

            <div style={S.smartActionsSectionLabel}>Row / Stack</div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onBuildLineSelection,
                  "x",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Row X
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onBuildLineSelection,
                  "y",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Stack Y
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canGapActions,
                  onBuildLineSelection,
                  "z",
                  gapValue,
                  anchorMode,
                )}
                style={getBtnStyle(canGapActions)}
              >
                Row Z
              </button>
            </div>
          </div>
        </>
      ) : null}

      {activeToolTab === "builders" ? (
        <>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Quick Cabinet Builder</div>
            <div style={sectionHintStyle}>
              Generate a cabinet box with sides, top, bottom, back, optional
              divider, and fixed shelves.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Width (mm)
                </span>
                <input
                  type="number"
                  min="200"
                  step="20"
                  value={cabinetWidth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetWidth(
                      Math.max(200, Number(e.target.value) || 1200),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Height (mm)
                </span>
                <input
                  type="number"
                  min="200"
                  step="20"
                  value={cabinetHeight}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetHeight(
                      Math.max(200, Number(e.target.value) || 2000),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Depth (mm)
                </span>
                <input
                  type="number"
                  min="200"
                  step="20"
                  value={cabinetDepth}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetDepth(
                      Math.max(200, Number(e.target.value) || 600),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Thickness (mm)
                </span>
                <input
                  type="number"
                  min="20"
                  step="20"
                  value={cabinetThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetThickness(
                      Math.max(20, Number(e.target.value) || 20),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Fixed Shelves
                </span>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="1"
                  value={cabinetShelfCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setCabinetShelfCount(
                      Math.max(0, Math.min(8, Number(e.target.value) || 0)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Center Divider
                </span>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 36,
                    padding: "0 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(71,85,105,.72)",
                    background: "rgba(11,20,36,.92)",
                    color: "#e5eefc",
                    fontSize: 12,
                    boxSizing: "border-box",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cabinetHasDivider}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => setCabinetHasDivider(e.target.checked)}
                  />
                  Include Divider
                </label>
              </label>
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canQuickCabinetBuilder,
                  onBuildCabinetBox,
                  {
                    width: cabinetWidth,
                    height: cabinetHeight,
                    depth: cabinetDepth,
                    thickness: cabinetThickness,
                    shelfCount: cabinetShelfCount,
                    withDivider: cabinetHasDivider,
                  },
                )}
                style={getBtnStyle(canQuickCabinetBuilder)}
              >
                Build Cabinet Box
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>
              Interior Layout Presets
            </div>
            <div style={sectionHintStyle}>
              Rebuild the cabinet interior into real opening bays. This replaces
              generated dividers/shelves and clears generated fronts so new
              openings stay accurate.
            </div>

            <div style={{ ...S.smartActionsWideGrid, marginBottom: 8 }}>
              {[
                ["two-column", "2 Column Layout"],
                ["three-column", "3 Column Layout"],
              ].map(([presetKey, presetLabel]) => (
                <button
                  key={presetKey}
                  type="button"
                  onClick={makeHandler(true, setInteriorPreset, presetKey)}
                  style={{
                    ...getBtnStyle(true),
                    ...(interiorPreset === presetKey
                      ? {
                          border: "1px solid rgba(96,165,250,.75)",
                          background:
                            "linear-gradient(180deg, rgba(37,99,235,.30) 0%, rgba(29,78,216,.22) 100%)",
                          color: "#eef4ff",
                          boxShadow: "inset 0 0 0 1px rgba(147,197,253,.12)",
                        }
                      : {}),
                  }}
                >
                  {presetLabel}
                </button>
              ))}
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              {interiorPreset === "three-column"
                ? "Adds 2 vertical dividers and rebuilds fixed shelves per bay into 3 real cabinet columns."
                : "Adds 1 vertical divider and rebuilds fixed shelves per bay into 2 real cabinet columns."}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canInteriorPresetBuilder,
                  onBuildCabinetInteriorPreset,
                  {
                    preset: interiorPreset,
                  },
                )}
                style={getBtnStyle(canInteriorPresetBuilder)}
              >
                Apply Interior Layout
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Front Builder Presets</div>
            <div style={sectionHintStyle}>
              Select a cabinet box or any part inside that assembly, then
              generate ready-made front layouts for the whole opening or per
              cabinet bay.
            </div>

            <div style={{ ...S.smartActionsWideGrid, marginBottom: 8 }}>
              {[
                ["double-door", "Double Door"],
                ["drawer-stack", "Drawer Stack"],
                ["split-double-doors", "Split double doors"],
                ["left-doors-right-drawers", "Left doors / Right drawers"],
                ["top-drawers-bottom-doors", "Top drawers / Bottom doors"],
                ["single-bay-drawer-stack", "Single bay drawer stack"],
              ].map(([presetKey, presetLabel]) => (
                <button
                  key={presetKey}
                  type="button"
                  onClick={makeHandler(true, setFrontPreset, presetKey)}
                  style={{
                    ...getBtnStyle(true),
                    ...(frontPreset === presetKey
                      ? {
                          border: "1px solid rgba(96,165,250,.75)",
                          background:
                            "linear-gradient(180deg, rgba(37,99,235,.30) 0%, rgba(29,78,216,.22) 100%)",
                          color: "#eef4ff",
                          boxShadow: "inset 0 0 0 1px rgba(147,197,253,.12)",
                        }
                      : {}),
                  }}
                >
                  {presetLabel}
                </button>
              ))}
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              {frontPreset === "drawer-stack"
                ? "Stacked drawers across the full cabinet opening."
                : frontPreset === "split-double-doors"
                  ? "Opening-aware doors: each cabinet section gets its own left/right door pair."
                  : frontPreset === "left-doors-right-drawers"
                    ? "Column-aware mix: left-most cabinet bay gets doors, remaining bay/columns get drawer stacks."
                    : frontPreset === "top-drawers-bottom-doors"
                      ? "Row-aware mix: top row openings get drawer stacks, lower rows get door pairs."
                      : frontPreset === "single-bay-drawer-stack"
                        ? "Bay-aware mix: chosen opening index gets drawer stack, the rest get split doors."
                        : "Single full-height left/right door pair for the whole cabinet opening."}
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Reveal (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={frontReveal}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setFrontReveal(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Front Thickness (mm)
                </span>
                <input
                  type="number"
                  min="20"
                  step="20"
                  value={frontThickness}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setFrontThickness(
                      Math.max(20, Number(e.target.value) || 20),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  {[
                    "drawer-stack",
                    "left-doors-right-drawers",
                    "top-drawers-bottom-doors",
                    "single-bay-drawer-stack",
                  ].includes(frontPreset)
                    ? "Drawer Gap (mm)"
                    : "Center Gap (mm)"}
                </span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={frontGap}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setFrontGap(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Count
                </span>
                <input
                  type="number"
                  min="2"
                  max="8"
                  step="1"
                  value={builderDrawerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderDrawerCount(
                      Math.max(2, Math.min(8, Number(e.target.value) || 3)),
                    )
                  }
                  disabled={
                    ![
                      "drawer-stack",
                      "left-doors-right-drawers",
                      "top-drawers-bottom-doors",
                      "single-bay-drawer-stack",
                    ].includes(frontPreset)
                  }
                  style={{
                    ...actionInputStyle,
                    opacity: [
                      "drawer-stack",
                      "left-doors-right-drawers",
                      "top-drawers-bottom-doors",
                      "single-bay-drawer-stack",
                    ].includes(frontPreset)
                      ? 1
                      : 0.55,
                  }}
                />
              </label>
            </div>

            {frontPreset === "single-bay-drawer-stack" ? (
              <div style={S.smartActionsFieldsRow}>
                <label
                  style={{
                    ...fieldStyle,
                    gridColumn: "1 / span 2",
                  }}
                >
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>
                    Target Bay Index
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={frontTargetBayIndex}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setFrontTargetBayIndex(
                        Math.max(1, Number(e.target.value) || 1),
                      )
                    }
                    style={actionInputStyle}
                  />
                </label>
              </div>
            ) : null}

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canFrontPresetBuilder,
                  onBuildCabinetFrontPreset,
                  {
                    preset: frontPreset,
                    reveal: frontReveal,
                    frontGap,
                    frontThickness,
                    drawerCount: builderDrawerCount,
                    targetBayIndex: frontTargetBayIndex,
                  },
                )}
                style={getBtnStyle(canFrontPresetBuilder)}
              >
                Apply Front Preset
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Custom Per-Bay Fronts</div>
            <div style={sectionHintStyle}>
              Column-based front assignment for real cabinet bays. Bay count is
              auto-detected from the cabinet layout; extra bay settings are
              ignored when not needed.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Bay 1</span>
                <select
                  value={bay1FrontType}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setBay1FrontType(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="door">Door Pair</option>
                  <option value="drawer">Drawer Stack</option>
                  <option value="open">Open</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Bay 2</span>
                <select
                  value={bay2FrontType}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setBay2FrontType(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="door">Door Pair</option>
                  <option value="drawer">Drawer Stack</option>
                  <option value="open">Open</option>
                </select>
              </label>
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Bay 3</span>
                <select
                  value={bay3FrontType}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setBay3FrontType(e.target.value)}
                  style={actionInputStyle}
                >
                  <option value="door">Door Pair</option>
                  <option value="drawer">Drawer Stack</option>
                  <option value="open">Open</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Count
                </span>
                <input
                  type="number"
                  min="2"
                  max="8"
                  step="1"
                  value={builderDrawerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderDrawerCount(
                      Math.max(2, Math.min(8, Number(e.target.value) || 3)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              Bay 1:{" "}
              {bay1FrontType === "open"
                ? "Open"
                : bay1FrontType === "drawer"
                  ? "Drawer Stack"
                  : "Door Pair"}{" "}
              · Bay 2:{" "}
              {bay2FrontType === "open"
                ? "Open"
                : bay2FrontType === "drawer"
                  ? "Drawer Stack"
                  : "Door Pair"}{" "}
              · Bay 3:{" "}
              {bay3FrontType === "open"
                ? "Open"
                : bay3FrontType === "drawer"
                  ? "Drawer Stack"
                  : "Door Pair"}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canCustomBayFrontBuilder,
                  onBuildCabinetCustomBayFronts,
                  {
                    reveal: frontReveal,
                    frontGap,
                    frontThickness,
                    drawerCount: builderDrawerCount,
                    bay1Type: bay1FrontType,
                    bay2Type: bay2FrontType,
                    bay3Type: bay3FrontType,
                    assignments: [bay1FrontType, bay2FrontType, bay3FrontType],
                  },
                )}
                style={getBtnStyle(canCustomBayFrontBuilder)}
              >
                Apply Custom Fronts
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>
              Custom Per-Opening Fronts
            </div>
            <div style={sectionHintStyle}>
              Per-cell front assignment for real cabinet openings. Order is
              auto-read as top-left to bottom-right. Unused extra cells are
              ignored.
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              Cell order: 1 2 3 on the top row, then 4 5 6, then 7 8 9.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 6,
                marginBottom: 8,
              }}
            >
              {cellFrontAssignments.map((cellType, index) => (
                <label key={`cell-front-${index + 1}`} style={fieldStyle}>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>
                    Cell {index + 1}
                  </span>
                  <select
                    value={cellType}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setCellFrontAssignments((prev) => {
                        const next = [...prev];
                        next[index] = e.target.value;
                        return next;
                      })
                    }
                    style={actionInputStyle}
                  >
                    <option value="door">Door Pair</option>
                    <option value="drawer">Drawer Stack</option>
                    <option value="open">Open</option>
                  </select>
                </label>
              ))}
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Count
                </span>
                <input
                  type="number"
                  min="2"
                  max="8"
                  step="1"
                  value={builderDrawerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderDrawerCount(
                      Math.max(2, Math.min(8, Number(e.target.value) || 3)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <div style={fieldStyle} />
            </div>

            <div
              style={{
                ...S.infoCard,
                margin: "0 0 8px",
                padding: "8px 10px",
                fontSize: 10,
                color: "#93c5fd",
              }}
            >
              {cellFrontAssignments
                .map(
                  (cellType, index) =>
                    `Cell ${index + 1}: ${cellType === "open" ? "Open" : cellType === "drawer" ? "Drawer Stack" : "Door Pair"}`,
                )
                .join(" · ")}
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canCustomCellFrontBuilder,
                  onBuildCabinetCustomCellFronts,
                  {
                    reveal: frontReveal,
                    frontGap,
                    frontThickness,
                    drawerCount: builderDrawerCount,
                    assignments: cellFrontAssignments,
                    cell1Type: cellFrontAssignments[0],
                    cell2Type: cellFrontAssignments[1],
                    cell3Type: cellFrontAssignments[2],
                    cell4Type: cellFrontAssignments[3],
                    cell5Type: cellFrontAssignments[4],
                    cell6Type: cellFrontAssignments[5],
                    cell7Type: cellFrontAssignments[6],
                    cell8Type: cellFrontAssignments[7],
                    cell9Type: cellFrontAssignments[8],
                  },
                )}
                style={getBtnStyle(canCustomCellFrontBuilder)}
              >
                Apply Opening Fronts
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Builder Helpers</div>
            <div style={sectionHintStyle}>
              Selection-based helpers for shelves, legs, fronts, panels, doors,
              drawers, and interior fitting.
            </div>

            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Inset (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={builderInset}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderInset(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Drawer Count
                </span>
                <input
                  type="number"
                  min="2"
                  max="8"
                  step="1"
                  value={builderDrawerCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setBuilderDrawerCount(
                      Math.max(2, Math.min(8, Number(e.target.value) || 3)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>

            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onAutoShelfStack,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Auto Shelf Stack
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canStrictMultiBuilderHelpers,
                  onInsideFitSelection,
                  builderInset,
                )}
                style={getBtnStyle(canStrictMultiBuilderHelpers)}
              >
                Inside Fit
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onPanelPairSelection,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Panel Pair
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onFrontPairSelection,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Front Pair
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onDoorSplitSelection,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Door Split
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onDrawerStackSelection,
                  builderInset,
                  builderDrawerCount,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Drawer Stack
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canBuilderHelpers,
                  onFaceFitSelection,
                  builderInset,
                )}
                style={getBtnStyle(canBuilderHelpers)}
              >
                Face Fit
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canStrictMultiBuilderHelpers,
                  onAutoLegLayout,
                  builderInset,
                )}
                style={getBtnStyle(canStrictMultiBuilderHelpers)}
              >
                Leg Layout
              </button>
            </div>
          </div>
        </>
      ) : null}

      {activeToolTab === "duplicate" ? (
        <>
          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Mirror Duplicate</div>
            <div style={sectionHintStyle}>
              Create mirrored copies of the current selection along X or Z.
            </div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(canMirror, onMirrorDuplicate, "x")}
                style={getBtnStyle(canMirror, true)}
              >
                Mirror X
              </button>
              <button
                type="button"
                onClick={makeHandler(canMirror, onMirrorDuplicate, "z")}
                style={getBtnStyle(canMirror, true)}
              >
                Mirror Z
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Assembly</div>
            <div style={sectionHintStyle}>
              Select a full grouped assembly or duplicate the entire assembly in
              one click.
            </div>
            <div style={S.smartActionsWideGrid}>
              <button
                type="button"
                onClick={makeHandler(canAssemblyActions, onSelectAssembly)}
                style={getBtnStyle(canAssemblyActions)}
              >
                Whole Select
              </button>
              <button
                type="button"
                onClick={makeHandler(canAssemblyActions, onDuplicateAssembly)}
                style={getBtnStyle(canAssemblyActions, true)}
              >
                Whole Duplicate
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={S.smartActionsSectionLabel}>Repeat / Array</div>
            <div style={sectionHintStyle}>
              Create repeated copies of the current object or assembly using
              count and spacing.
            </div>
            <div style={S.smartActionsFieldsRow}>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Copies</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={arrayCount}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setArrayCount(
                      Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                    )
                  }
                  style={actionInputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  Spacing (mm)
                </span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={arraySpacing}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setArraySpacing(Math.max(0, Number(e.target.value) || 0))
                  }
                  style={actionInputStyle}
                />
              </label>
            </div>
            <div style={S.smartActionsGrid}>
              <button
                type="button"
                onClick={makeHandler(
                  canAssemblyActions,
                  onArrayDuplicate,
                  "x",
                  arrayCount,
                  arraySpacing,
                )}
                style={getBtnStyle(canAssemblyActions)}
              >
                Array X
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canAssemblyActions,
                  onArrayDuplicate,
                  "y",
                  arrayCount,
                  arraySpacing,
                )}
                style={getBtnStyle(canAssemblyActions)}
              >
                Array Y
              </button>
              <button
                type="button"
                onClick={makeHandler(
                  canAssemblyActions,
                  onArrayDuplicate,
                  "z",
                  arrayCount,
                  arraySpacing,
                )}
                style={getBtnStyle(canAssemblyActions)}
              >
                Array Z
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ToolSidebar({
  transformMode,
  setTransformMode,
  hasSelection,
  canTransform,
  isSelectionLocked,
  onToggleLock,
}) {
  const handleToolClick = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (canTransform) setTransformMode(mode);
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
        title="Resize / Scale"
        onMouseDown={handleMouseDown}
        onPointerDown={handleMouseDown}
        onClick={handleToolClick("scale")}
        disabled={!canTransform}
        style={{
          ...S.unityToolBtn,
          ...(transformMode === "scale" ? S.unityToolBtnActive : {}),
          opacity: canTransform ? 1 : 0.45,
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
          marginTop: 8,
        }}
      >
        {isSelectionLocked ? "🔒" : "🔓"}
      </button>
    </div>
  );
}

function ThreeDViewer({
  onPushHistory,
  components,
  selectedId,
  selectedIds,
  edit3DId,
  setSelectedId,
  setSelectedIds,
  setEdit3DId,
  onUpdateComp,
  onBatchUpdateComps,
  lockedFields,
  canvasW,
  canvasH,
  canvasD,
  transformMode,
  setTransformMode,
  addComponent,
  activeBuildLabel,
  selectedComp,
  isLocked,
  unit,
  editorMode,
  pendingPlacement,
  onPlaceComponent,
  onCancelPlacement,
  canUseSmartActions,
  smartSelectionCount = 0,
  hasLockedSmartSelection = false,
  onAlignSelection,
  onFlushSelection,
  onMirrorDuplicate,
  onSelectAssembly,
  onDuplicateAssembly,
  onArrayDuplicate,
  onDistributeSelection,
  onGapSelection,
  onBuildLineSelection,
  onAutoShelfStack,
  onAutoLegLayout,
  onPanelPairSelection,
  onFrontPairSelection,
  onDoorSplitSelection,
  onDrawerStackSelection,
  onFaceFitSelection,
  onInsideFitSelection,
  onBuildCabinetBox,
  onBuildCabinetInteriorPreset,
  onBuildCabinetFrontPreset,
  onBuildCabinetCustomBayFronts,
  onBuildCabinetCustomCellFronts,
  canBuildCabinetBox = false,
  canBuildCabinetInteriorPreset = false,
  canBuildCabinetFrontPreset = false,
  canBuildCabinetCustomBayFronts = false,
  canBuildCabinetCustomCellFronts = false,
  showLibraryPanel = true,
}) {
  const [activeLeftPanel, setActiveLeftPanel] = useState(
    showLibraryPanel ? "library" : null,
  );
  const [activeInspectorTab, setActiveInspectorTab] = useState("properties");
  const [activeToolTab, setActiveToolTab] = useState("builders");
  const [isLibraryDragPlacing, setIsLibraryDragPlacing] = useState(false);

  useEffect(() => {
    if (!showLibraryPanel && activeLeftPanel === "library") {
      setActiveLeftPanel(null);
    }
  }, [showLibraryPanel, activeLeftPanel]);

  const openCabinetBuilderShortcut = useCallback(() => {
    setActiveInspectorTab("smartbuild");
    setActiveToolTab("builders");
  }, []);

  const onPushHistoryRef = useRef(onPushHistory);
  const onBeforeDragRef = useRef(null);

  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const pendingPlacementRef = useRef(pendingPlacement);
  const previewObjectRef = useRef(null);
  const previewPlacementRef = useRef(null);
  const libraryPlacementDragRef = useRef({
    active: false,
    startedInsideCanvas: false,
    item: null,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    moved: false,
  });

  const cameraRef = useRef(null);
  const orbitRef = useRef(null);
  const transformRef = useRef(null);
  const rootGroupRef = useRef(null);
  const previewGroupRef = useRef(null);
  const selectionPivotRef = useRef(null);
  const multiTransformStateRef = useRef(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const entryMapRef = useRef(new Map());
  const selectableMeshesRef = useRef([]);

  const selectedIdRef = useRef(selectedId);
  const edit3DIdRef = useRef(edit3DId);
  const transformModeRef = useRef(transformMode);
  const editorModeRef = useRef(editorMode);
  const setTransformModeRef = useRef(setTransformMode);
  const onCancelPlacementRef = useRef(onCancelPlacement);

  const selectedIdsRef = useRef(selectedIds || []);

  const onUpdateCompRef = useRef(onUpdateComp);
  const onBatchUpdateCompsRef = useRef(onBatchUpdateComps);
  const onPlaceComponentRef = useRef(onPlaceComponent);
  const setSelectedIdRef = useRef(setSelectedId);
  const setEdit3DIdRef = useRef(setEdit3DId);
  const setSelectedIdsRef = useRef(setSelectedIds);
  const componentsRef = useRef(components);

  const didInitialFitRef = useRef(false);
  const initialSceneObjectCountRef = useRef(null);
  const selectionOutlineGroupRef = useRef(null);

  const cameraViewRef = useRef(null);
  const restoreRafRef = useRef(0);
  const keysRef = useRef({});
  const moveEnabledRef = useRef(false);
  const lastFrameRef = useRef(performance.now());

  // --- NEW: 3D Selection Box State (Fixed with Ref) ---
  const [selectionRect, setSelectionRect] = useState(null);
  const selectionRectRef = useRef(null);
  const isSelectingRef = useRef(false);
  const startPointRef = useRef({ x: 0, y: 0 });

  const [liveSelectedComp, setLiveSelectedComp] = useState(null);

  const isTypingElement = useCallback((el) => {
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el.isContentEditable
    );
  }, []);

  const updateKeyboardCamera = useCallback(
    (delta) => {
      const camera = cameraRef.current;
      const orbit = orbitRef.current;

      if (!camera || !orbit || !moveEnabledRef.current) return;

      const keys = keysRef.current;
      const moveDir = new THREE.Vector3();
      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);

      camera.getWorldDirection(forward);
      forward.y = 0;

      if (forward.lengthSq() > 0) {
        forward.normalize();
      }

      right.crossVectors(forward, up).normalize();

      if (keys["KeyW"]) moveDir.add(forward);
      if (keys["KeyS"]) moveDir.sub(forward);
      if (keys["KeyD"]) moveDir.add(right);
      if (keys["KeyA"]) moveDir.sub(right);
      if (keys["KeyE"]) moveDir.y += 1;
      if (keys["KeyQ"]) moveDir.y -= 1;

      if (moveDir.lengthSq() === 0) return;

      const speed =
        (keys["ShiftLeft"] || keys["ShiftRight"] ? 2200 : 1100) * delta;

      moveDir.normalize().multiplyScalar(speed);

      camera.position.add(moveDir);
      orbit.target.add(moveDir);
    },
    [cameraRef, orbitRef],
  );

  const clearKeys = useCallback(() => {
    keysRef.current = {};
  }, []);

  const getPlacementDims = useCallback(
    (typeDef = {}) => ({
      width: Math.max(
        GRID_SIZE,
        snap(Number(typeDef?.w ?? typeDef?.width ?? 800) || 800),
      ),
      height: Math.max(
        GRID_SIZE,
        snap(Number(typeDef?.h ?? typeDef?.height ?? 900) || 900),
      ),
      depth: Math.max(
        GRID_SIZE,
        snap(Number(typeDef?.d ?? typeDef?.depth ?? 600) || 600),
      ),
    }),
    [],
  );

  const isTemplatePlacementType = useCallback(
    (typeDef = {}) =>
      FURNITURE_TEMPLATE_SET.has(typeDef?.type) ||
      typeDef?.type === "chair_template",
    [],
  );

  const disposePlacementPreview = useCallback(() => {
    const preview = previewObjectRef.current;
    if (!preview) return;

    if (preview.parent) {
      preview.parent.remove(preview);
    }

    preview.traverse?.((obj) => {
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((mat) => mat?.dispose?.());
      } else {
        obj.material?.dispose?.();
      }
    });

    previewObjectRef.current = null;
  }, []);

  const ensurePlacementPreview = useCallback(
    (typeDef) => {
      if (!typeDef || !previewGroupRef.current) return null;

      const currentPreview = previewObjectRef.current;
      if (currentPreview?.userData?.previewType === typeDef.type) {
        return currentPreview;
      }

      disposePlacementPreview();

      const { width, height, depth } = getPlacementDims(typeDef);
      const templateLike = isTemplatePlacementType(typeDef);

      let preview = null;

      if (templateLike) {
        const previewRoot = new THREE.Group();
        previewRoot.name = "placement-preview";
        previewRoot.userData.isPlacementPreview = true;
        previewRoot.userData.previewType = typeDef.type;

        const previewOriginX = 0;
        const previewOriginZ = 0;

        let previewParts = [];

        if (FURNITURE_TEMPLATE_SET.has(typeDef.type)) {
          previewParts = buildFurnitureTemplateParts({
            templateType: typeDef.type,
            buildId: "preview-build",
            originX: previewOriginX,
            originZ: previewOriginZ,
            canvasH,
            groupLabel: typeDef.label || "Preview",
          });
        } else if (typeDef.type === "chair_template") {
          const builtChair = buildDiningChairParts({
            buildId: "preview-chair",
            originX: previewOriginX,
            originZ: previewOriginZ,
            canvasH,
            groupLabel: typeDef.label || "Preview Chair",
          });

          previewParts = Array.isArray(builtChair?.parts)
            ? builtChair.parts
            : [];
        }

        previewParts.forEach((rawPart) => {
          const part = normalizeComponent({
            ...rawPart,
            locked: true,
          });

          const partObj = createFurnitureObject(part, false, false, []);
          partObj.userData.isPlacementPreviewPart = true;

          const localX = snap(part.x + part.width / 2 - previewOriginX);
          const localY = snap(canvasH / 2 - (part.y + part.height / 2));
          const localZ = snap(part.z + part.depth / 2 - previewOriginZ);

          partObj.position.set(localX, localY, localZ);
          partObj.rotation.x = THREE.MathUtils.degToRad(part.rotationX || 0);
          partObj.rotation.y = THREE.MathUtils.degToRad(part.rotationY || 0);
          partObj.rotation.z = THREE.MathUtils.degToRad(part.rotationZ || 0);
          partObj.scale.set(1, 1, 1);

          previewRoot.add(partObj);
        });

        preview = previewRoot;
      } else {
        const previewComp = normalizeComponent({
          id: `preview-${typeDef.type || "component"}`,
          type: typeDef.type,
          label: typeDef.label || "Preview",
          category: typeDef.category,
          blueprintStyle: typeDef.blueprintStyle,
          x: snap(canvasW / 2 - width / 2),
          y: snap(canvasH - FLOOR_OFFSET - height),
          z: snap(canvasD / 2 - depth / 2),
          width,
          height,
          depth,
          rotationY: Number(typeDef.rotationY) || 0,
          fill: typeDef.fill || "#60a5fa",
          material: typeDef.material || "Preview",
          finish: typeDef.finish || "",
          qty: 1,
          locked: true,
        });

        preview = createFurnitureObject(previewComp, false, false, []);
        preview.name = "placement-preview";
        preview.userData.isPlacementPreview = true;
        preview.userData.previewType = typeDef.type;
      }

      preview.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }

        const mats = Array.isArray(obj.material)
          ? obj.material
          : obj.material
            ? [obj.material]
            : [];

        mats.forEach((mat) => {
          mat.transparent = true;
          mat.opacity = templateLike ? 0.62 : 0.5;
          mat.depthWrite = false;
          mat.toneMapped = false;
          if (mat.emissive) {
            mat.emissive = new THREE.Color(0x60a5fa);
            mat.emissiveIntensity = templateLike ? 0.18 : 0.45;
          }
        });
      });

      previewGroupRef.current.add(preview);
      previewObjectRef.current = preview;
      return preview;
    },
    [
      canvasW,
      canvasH,
      canvasD,
      disposePlacementPreview,
      getPlacementDims,
      isTemplatePlacementType,
    ],
  );

  const updatePlacementPreview = useCallback(
    (placement, typeDef = pendingPlacementRef.current) => {
      if (!typeDef) {
        disposePlacementPreview();
        return;
      }

      const preview = ensurePlacementPreview(typeDef);
      if (!preview) return;

      if (!placement) {
        preview.visible = false;
        return;
      }

      const { width, height, depth } = getPlacementDims(typeDef);
      const templateLike = isTemplatePlacementType(typeDef);

      preview.visible = true;
      preview.position.set(
        snap(placement.worldX + (templateLike ? width / 2 : 0)),
        templateLike ? 0 : -canvasH / 2 + height / 2,
        snap(placement.worldZ + (templateLike ? depth / 2 : 0)),
      );
      preview.rotation.set(
        0,
        THREE.MathUtils.degToRad(Number(typeDef.rotationY) || 0),
        0,
      );
      preview.updateMatrixWorld(true);
    },
    [
      canvasH,
      disposePlacementPreview,
      ensurePlacementPreview,
      getPlacementDims,
      isTemplatePlacementType,
    ],
  );

  const resetLibraryPlacementDrag = useCallback(
    ({ disposePreview = true } = {}) => {
      libraryPlacementDragRef.current = {
        active: false,
        startedInsideCanvas: false,
        item: null,
        pointerId: null,
        startClientX: 0,
        startClientY: 0,
        moved: false,
      };

      setIsLibraryDragPlacing(false);
      previewPlacementRef.current = null;

      if (disposePreview) {
        disposePlacementPreview();
      }

      if (orbitRef.current && !transformRef.current?.dragging) {
        orbitRef.current.enabled = true;
      }
    },
    [disposePlacementPreview],
  );

  const getVisibleSpawnPlacement = useCallback(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;

    const fallback = {
      worldX: snap((orbitRef.current?.target?.x || 0) - canvasW * 0.12),
      worldZ: snap((orbitRef.current?.target?.z || 0) - canvasD * 0.08),
    };

    if (!renderer || !camera) {
      return fallback;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), canvasH / 2);
    const hitPoint = new THREE.Vector3();
    const candidateRatios = [
      [0.32, 0.42],
      [0.38, 0.46],
      [0.46, 0.5],
      [0.55, 0.52],
    ];

    for (const [rx, ry] of candidateRatios) {
      mouseRef.current.x = rx * 2 - 1;
      mouseRef.current.y = -(ry * 2) + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      if (raycasterRef.current.ray.intersectPlane(floorPlane, hitPoint)) {
        return {
          worldX: snap(hitPoint.x),
          worldZ: snap(hitPoint.z),
        };
      }
    }

    return fallback;
  }, [canvasH, canvasW, canvasD]);

  const startLibraryPlacementDrag = useCallback(
    (item, event) => {
      if (!item) return;

      event?.preventDefault?.();
      event?.stopPropagation?.();

      const pointerId =
        event?.pointerId ?? event?.nativeEvent?.pointerId ?? null;

      const spawnPlacement = getVisibleSpawnPlacement() || {
        worldX: 0,
        worldZ: 0,
      };

      previewPlacementRef.current = spawnPlacement;

      libraryPlacementDragRef.current = {
        active: true,
        startedInsideCanvas: false,
        item,
        pointerId,
        startClientX: event?.clientX ?? 0,
        startClientY: event?.clientY ?? 0,
        moved: false,
      };

      setIsLibraryDragPlacing(true);

      addComponent?.(item, {
        source: "drag",
        silent: true,
      });

      updatePlacementPreview(spawnPlacement, item);

      if (orbitRef.current && !transformRef.current?.dragging) {
        orbitRef.current.enabled = false;
      }
    },
    [addComponent, getVisibleSpawnPlacement, updatePlacementPreview],
  );
  useEffect(() => {
    pendingPlacementRef.current = pendingPlacement;

    if (!pendingPlacement) {
      previewPlacementRef.current = null;
      disposePlacementPreview();
      return;
    }

    const preview = ensurePlacementPreview(pendingPlacement);
    if (!preview) return;

    const currentPlacement =
      previewPlacementRef.current || getVisibleSpawnPlacement();

    previewPlacementRef.current = currentPlacement;
    updatePlacementPreview(currentPlacement, pendingPlacement);
  }, [
    pendingPlacement,
    ensurePlacementPreview,
    updatePlacementPreview,
    disposePlacementPreview,
    getVisibleSpawnPlacement,
  ]);

  const handleKeyDown = useCallback(
    (e) => {
      if (isTypingElement(document.activeElement)) return;

      const currentPendingPlacement = pendingPlacementRef.current;
      const currentEditorMode = editorModeRef.current;

      const currentId = selectedIdRef.current;
      const allCurrentComponents = componentsRef.current || [];
      const currentComp = currentId
        ? allCurrentComponents.find((item) => item.id === currentId)
        : null;

      const activeSelectionIds = Array.from(
        new Set(
          [selectedIdRef.current, ...(selectedIdsRef.current || [])].filter(
            Boolean,
          ),
        ),
      );

      const selectionHasLockedItem = activeSelectionIds.some((id) => {
        const comp = allCurrentComponents.find((item) => item.id === id);
        return comp ? isLocked3DRef.current(comp) : false;
      });

      const hasEditableSelection =
        currentEditorMode === "editable" &&
        !!currentId &&
        !!currentComp &&
        !selectionHasLockedItem &&
        !isLocked3DRef.current(currentComp);

      if (currentPendingPlacement && e.key === "Escape") {
        e.preventDefault();
        onCancelPlacementRef.current?.();
        return;
      }

      if (hasEditableSelection && !e.ctrlKey && !e.metaKey) {
        const key = String(e.key || "").toLowerCase();

        if (key === "g") {
          e.preventDefault();
          setTransformModeRef.current?.("translate");
          return;
        }

        if (key === "r") {
          e.preventDefault();
          setTransformModeRef.current?.("rotate");
          return;
        }

        if (key === "t") {
          e.preventDefault();
          setTransformModeRef.current?.("scale");
          return;
        }

        if (currentComp.type === "rounded_box") {
          const applyBoxUpdate = (attrs) => {
            if (!attrs) return;
            onUpdateCompRef.current?.(currentId, attrs);
          };

          const selectedFace = currentComp.selectedFace || "top";
          const selectedFaceCap = `${selectedFace.charAt(0).toUpperCase()}${selectedFace.slice(1)}`;

          const selectedFaceField = `faceOpen${selectedFaceCap}`;
          const selectedFaceInsetField = `faceInset${selectedFaceCap}`;
          const selectedFaceExtrudeField = `faceExtrude${selectedFaceCap}`;

          const hasAnyOpenFace = [
            currentComp.faceOpenTop,
            currentComp.faceOpenBottom,
            currentComp.faceOpenFront,
            currentComp.faceOpenBack,
            currentComp.faceOpenLeft,
            currentComp.faceOpenRight,
          ].some(Boolean);

          const hasAnyFaceEdit = [
            currentComp.faceInsetTop,
            currentComp.faceInsetBottom,
            currentComp.faceInsetFront,
            currentComp.faceInsetBack,
            currentComp.faceInsetLeft,
            currentComp.faceInsetRight,
            currentComp.faceExtrudeTop,
            currentComp.faceExtrudeBottom,
            currentComp.faceExtrudeFront,
            currentComp.faceExtrudeBack,
            currentComp.faceExtrudeLeft,
            currentComp.faceExtrudeRight,
          ].some((value) => Number(value) > 0);

          const clearAllRoundedBoxFaces = {
            faceOpenTop: false,
            faceOpenBottom: false,
            faceOpenFront: false,
            faceOpenBack: false,
            faceOpenLeft: false,
            faceOpenRight: false,
          };

          const clearAllRoundedBoxFaceEdits = {
            faceInsetTop: 0,
            faceInsetBottom: 0,
            faceInsetFront: 0,
            faceInsetBack: 0,
            faceInsetLeft: 0,
            faceInsetRight: 0,
            faceExtrudeTop: 0,
            faceExtrudeBottom: 0,
            faceExtrudeFront: 0,
            faceExtrudeBack: 0,
            faceExtrudeLeft: 0,
            faceExtrudeRight: 0,
          };

          const faceNumberMap = {
            1: "top",
            2: "front",
            3: "right",
            4: "back",
            5: "left",
            6: "bottom",
          };

          if (faceNumberMap[e.key]) {
            e.preventDefault();
            applyBoxUpdate({
              selectedFace: faceNumberMap[e.key],
            });
            return;
          }

          if (key === "h") {
            e.preventDefault();

            if (currentComp.isHollow || hasAnyOpenFace || hasAnyFaceEdit) {
              applyBoxUpdate({
                isHollow: false,
                ...clearAllRoundedBoxFaces,
                ...clearAllRoundedBoxFaceEdits,
              });
            } else {
              applyBoxUpdate({
                isHollow: true,
              });
            }
            return;
          }

          if (key === "o") {
            e.preventDefault();
            applyBoxUpdate({
              isHollow: true,
              [selectedFaceField]: !currentComp[selectedFaceField],
            });
            return;
          }

          if (key === "j" || key === "k") {
            e.preventDefault();

            const direction = key === "k" ? 1 : -1;
            const currentInset =
              Number(currentComp[selectedFaceInsetField]) || 0;

            const maxInset =
              selectedFace === "top" || selectedFace === "bottom"
                ? Math.max(
                    0,
                    Math.floor(
                      Math.min(currentComp.width, currentComp.depth) / 2,
                    ) - 20,
                  )
                : selectedFace === "front" || selectedFace === "back"
                  ? Math.max(
                      0,
                      Math.floor(
                        Math.min(currentComp.width, currentComp.height) / 2,
                      ) - 20,
                    )
                  : Math.max(
                      0,
                      Math.floor(
                        Math.min(currentComp.depth, currentComp.height) / 2,
                      ) - 20,
                    );

            applyBoxUpdate({
              isHollow: true,
              [selectedFaceInsetField]: Math.max(
                0,
                Math.min(maxInset, currentInset + direction * 5),
              ),
            });
            return;
          }

          if (key === "n" || key === "m") {
            e.preventDefault();

            const direction = key === "m" ? 1 : -1;
            const currentExtrude =
              Number(currentComp[selectedFaceExtrudeField]) || 0;

            const maxExtrude =
              selectedFace === "top" || selectedFace === "bottom"
                ? Math.max(0, Math.floor(currentComp.height) - 20)
                : selectedFace === "front" || selectedFace === "back"
                  ? Math.max(0, Math.floor(currentComp.depth) - 20)
                  : Math.max(0, Math.floor(currentComp.width) - 20);

            applyBoxUpdate({
              isHollow: true,
              [selectedFaceExtrudeField]: Math.max(
                0,
                Math.min(maxExtrude, currentExtrude + direction * 5),
              ),
            });
            return;
          }

          if (e.key === "[" || e.key === "]") {
            e.preventDefault();

            const direction = e.key === "]" ? 1 : -1;
            const currentRadius = Number(currentComp.cornerRadius) || 0;
            const currentWall = Number(currentComp.wallThickness) || 20;
            const currentBottom = Number(currentComp.bottomThickness) || 20;

            const maxWall = Math.max(
              20,
              Math.floor(Math.min(currentComp.width, currentComp.depth) / 2) -
                10,
            );

            const maxBottom = Math.max(20, Math.floor(currentComp.height) - 20);

            if (e.altKey) {
              applyBoxUpdate({
                cornerRadius: Math.max(
                  0,
                  Math.min(500, currentRadius + direction * 5),
                ),
              });
              return;
            }

            if (e.shiftKey) {
              applyBoxUpdate({
                bottomThickness: Math.max(
                  10,
                  Math.min(maxBottom, currentBottom + direction * 5),
                ),
              });
              return;
            }

            applyBoxUpdate({
              wallThickness: Math.max(
                10,
                Math.min(maxWall, currentWall + direction * 5),
              ),
            });
            return;
          }
        }
      }

      if (!moveEnabledRef.current) return;

      keysRef.current[e.code] = true;

      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "KeyQ",
          "KeyE",
          "ShiftLeft",
          "ShiftRight",
        ].includes(e.code)
      ) {
        e.preventDefault();
      }
    },
    [isTypingElement],
  );

  const handleKeyUp = useCallback((e) => {
    delete keysRef.current[e.code];
  }, []);

  useEffect(() => {
    onPushHistoryRef.current = onPushHistory;
  }, [onPushHistory]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds || [];
  }, [selectedIds]);

  useEffect(() => {
    edit3DIdRef.current = edit3DId;
  }, [edit3DId]);

  useEffect(() => {
    setSelectedIdsRef.current = setSelectedIds;
  }, [setSelectedIds]);

  useEffect(() => {
    componentsRef.current = components;
  }, [components]);

  useEffect(() => {
    transformModeRef.current = transformMode;
  }, [transformMode]);

  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  useEffect(() => {
    setTransformModeRef.current = setTransformMode;
  }, [setTransformMode]);

  useEffect(() => {
    onCancelPlacementRef.current = onCancelPlacement;
  }, [onCancelPlacement]);

  useEffect(() => {
    onUpdateCompRef.current = onUpdateComp;
  }, [onUpdateComp]);

  useEffect(() => {
    onBatchUpdateCompsRef.current = onBatchUpdateComps;
  }, [onBatchUpdateComps]);

  useEffect(() => {
    onPlaceComponentRef.current = onPlaceComponent;
  }, [onPlaceComponent]);

  useEffect(() => {
    setSelectedIdRef.current = setSelectedId;
  }, [setSelectedId]);

  useEffect(() => {
    setEdit3DIdRef.current = setEdit3DId;
  }, [setEdit3DId]);

  useEffect(() => {
    pendingPlacementRef.current = pendingPlacement;
  }, [pendingPlacement]);

  const isLocked3D = useCallback(
    (comp) =>
      comp.locked ||
      lockedFields.includes(comp.type) ||
      lockedFields.includes("all"),
    [lockedFields],
  );

  const isLocked3DRef = useRef(isLocked3D);
  useEffect(() => {
    isLocked3DRef.current = isLocked3D;
  }, [isLocked3D]);

  const worldFromComp = useCallback(
    (comp) => ({
      x: comp.x + comp.width / 2 - canvasW / 2,
      y: canvasH / 2 - (comp.y + comp.height / 2),
      z: comp.z + comp.depth / 2 - canvasD / 2,
    }),
    [canvasW, canvasH, canvasD],
  );

  const compFromWorld = useCallback(
    (obj, comp) => ({
      x: snap(obj.position.x - comp.width / 2 + canvasW / 2),
      y: snap(canvasH / 2 - obj.position.y - comp.height / 2),
      z: snap(obj.position.z - comp.depth / 2 + canvasD / 2),
      rotationX: Math.round(THREE.MathUtils.radToDeg(obj.rotation.x) / 15) * 15,
      rotationY: Math.round(THREE.MathUtils.radToDeg(obj.rotation.y) / 15) * 15,
      rotationZ: Math.round(THREE.MathUtils.radToDeg(obj.rotation.z) / 15) * 15,
      width: snap(Math.max(GRID_SIZE, comp.width * obj.scale.x)),
      height: snap(Math.max(GRID_SIZE, comp.height * obj.scale.y)),
      depth: snap(Math.max(GRID_SIZE, comp.depth * obj.scale.z)),
    }),
    [canvasW, canvasH, canvasD],
  );

  const clearLiveSelectedComp = useCallback(() => {
    setLiveSelectedComp(null);
  }, []);

  const syncLiveSelectedCompFromObject = useCallback(
    (targetId, objOverride = null, compOverride = null) => {
      const id = targetId || selectedIdRef.current;
      if (!id) {
        setLiveSelectedComp(null);
        return;
      }

      const entry = entryMapRef.current.get(id);
      const obj = objOverride || entry?.obj;
      const comp = compOverride || entry?.comp;

      if (!obj || !comp) {
        setLiveSelectedComp(null);
        return;
      }

      setLiveSelectedComp(
        normalizeComponent({
          ...comp,
          ...compFromWorld(obj, comp),
        }),
      );
    },
    [compFromWorld],
  );

  const getActiveSelectionIds = useCallback(() => {
    const ids = Array.from(
      new Set((selectedIdsRef.current || []).filter(Boolean)),
    );
    if (ids.length) return ids;
    return selectedIdRef.current ? [selectedIdRef.current] : [];
  }, []);

  const activeSelectionIds3D = useMemo(() => {
    const ids = Array.from(new Set((selectedIds || []).filter(Boolean)));
    if (ids.length) return ids;
    return selectedId ? [selectedId] : [];
  }, [selectedId, selectedIds]);

  const getAssemblyIdsFromComponentId = useCallback((rootId) => {
    if (!rootId) return [];

    const sourceComponents = componentsRef.current || [];
    const comp = sourceComponents.find((item) => item.id === rootId);
    if (!comp) return [];
    if (!comp.groupId) return [rootId];

    return sourceComponents
      .filter((item) => item.groupId === comp.groupId)
      .map((item) => item.id);
  }, []);

  const hasActiveSelection3D = activeSelectionIds3D.length > 0;

  const hasLockedSelection3D = useMemo(() => {
    if (!activeSelectionIds3D.length) return false;

    const activeSet = new Set(activeSelectionIds3D);
    const selectedComponents3D = components.filter((c) => activeSet.has(c.id));

    return (
      selectedComponents3D.length > 0 &&
      selectedComponents3D.some((c) => isLocked3D(c))
    );
  }, [activeSelectionIds3D, components, isLocked3D]);

  const isSelectionLocked3D = useMemo(() => {
    if (!activeSelectionIds3D.length) return false;

    const activeSet = new Set(activeSelectionIds3D);
    const selectedComponents3D = components.filter((c) => activeSet.has(c.id));

    return (
      selectedComponents3D.length > 0 &&
      selectedComponents3D.every((c) => isLocked3D(c))
    );
  }, [activeSelectionIds3D, components, isLocked3D]);

  const canTransformSelection3D =
    editorMode === "editable" && hasActiveSelection3D && !hasLockedSelection3D;

  const toggleLockSelection3D = useCallback(() => {
    if (editorModeRef.current !== "editable") return;

    const ids = getActiveSelectionIds();
    if (!ids.length) return;

    const activeSet = new Set(ids);
    const selectedComponents3D = (componentsRef.current || []).filter((c) =>
      activeSet.has(c.id),
    );

    if (!selectedComponents3D.length) return;

    const shouldLock = selectedComponents3D.some((c) => !c.locked);
    const updatesById = {};

    selectedComponents3D.forEach((c) => {
      updatesById[c.id] = {
        locked: shouldLock,
      };
    });

    onPushHistoryRef.current?.(
      (componentsRef.current || []).map((c) => normalizeComponent(c)),
    );

    onBatchUpdateCompsRef.current?.(updatesById, { skipHistory: true });
  }, [getActiveSelectionIds]);
  const getSelectionEntries = useCallback(
    (ids = getActiveSelectionIds()) =>
      ids
        .map((id) => {
          const entry = entryMapRef.current.get(id);
          return entry ? { id, ...entry } : null;
        })
        .filter(Boolean),
    [getActiveSelectionIds],
  );

  const applySelectionState = useCallback((ids = [], primaryId = null) => {
    const nextIds = Array.from(new Set((ids || []).filter(Boolean)));
    const nextPrimary =
      primaryId && nextIds.includes(primaryId)
        ? primaryId
        : nextIds[nextIds.length - 1] || null;

    selectedIdsRef.current = nextIds;
    selectedIdRef.current = nextPrimary;
    edit3DIdRef.current = nextPrimary;

    setSelectedIdsRef.current?.(nextIds);
    setSelectedIdRef.current?.(nextPrimary);
    setEdit3DIdRef.current?.(nextPrimary);
  }, []);

  const ensureSelectionPivot = useCallback(() => {
    const rootGroup = rootGroupRef.current;
    if (!rootGroup?.parent) return null;

    if (!selectionPivotRef.current) {
      const pivot = new THREE.Group();
      pivot.name = "multi-selection-pivot";
      pivot.visible = false;
      selectionPivotRef.current = pivot;
    }

    const pivot = selectionPivotRef.current;

    if (pivot.parent !== rootGroup.parent) {
      rootGroup.parent.add(pivot);
    }

    return pivot;
  }, []);

  const positionSelectionPivot = useCallback(
    (ids = getActiveSelectionIds()) => {
      const pivot = ensureSelectionPivot();
      const entries = getSelectionEntries(ids);

      if (!pivot || !entries.length) return null;

      const box = new THREE.Box3();
      entries.forEach(({ obj }) => box.expandByObject(obj));

      const center = new THREE.Vector3();
      box.getCenter(center);

      pivot.position.copy(center);
      pivot.rotation.set(0, 0, 0);
      pivot.scale.set(1, 1, 1);
      pivot.updateMatrixWorld(true);

      return pivot;
    },
    [ensureSelectionPivot, getActiveSelectionIds, getSelectionEntries],
  );

  const resetMultiTransformState = useCallback(() => {
    multiTransformStateRef.current = null;

    const pivot = selectionPivotRef.current;
    if (pivot) {
      pivot.rotation.set(0, 0, 0);
      pivot.scale.set(1, 1, 1);
      pivot.updateMatrixWorld(true);
    }
  }, []);

  const beginMultiTransform = useCallback(
    (ids = getActiveSelectionIds()) => {
      if (ids.length < 2) {
        multiTransformStateRef.current = null;
        return;
      }

      const pivot = positionSelectionPivot(ids);
      const entries = getSelectionEntries(ids);

      if (!pivot || entries.length < 2) return;

      pivot.updateMatrixWorld(true);

      multiTransformStateRef.current = {
        ids,
        startPivotMatrix: pivot.matrixWorld.clone(),
        startPivotInverse: pivot.matrixWorld.clone().invert(),
        items: entries.map(({ id, obj, comp }) => ({
          id,
          obj,
          comp,
          position: obj.position.clone(),
          quaternion: obj.quaternion.clone(),
          scale: obj.scale.clone(),
        })),
      };
    },
    [getActiveSelectionIds, getSelectionEntries, positionSelectionPivot],
  );

  const previewMultiTransform = useCallback(() => {
    const state = multiTransformStateRef.current;
    const pivot = selectionPivotRef.current;

    if (!state || !pivot) return;

    pivot.updateMatrixWorld(true);

    const deltaMatrix = pivot.matrixWorld
      .clone()
      .multiply(state.startPivotInverse);

    const nextMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    state.items.forEach((item) => {
      const baseMatrix = new THREE.Matrix4().compose(
        item.position.clone(),
        item.quaternion.clone(),
        item.scale.clone(),
      );

      nextMatrix.copy(deltaMatrix).multiply(baseMatrix);
      nextMatrix.decompose(position, quaternion, scale);

      item.obj.position.copy(position);
      item.obj.quaternion.copy(quaternion);
      item.obj.scale.copy(scale);
      item.obj.updateMatrixWorld(true);
    });
  }, []);

  const commitMultiTransform = useCallback(() => {
    const state = multiTransformStateRef.current;
    if (!state?.items?.length) return;

    const updatesById = {};

    state.items.forEach((item) => {
      updatesById[item.id] = compFromWorld(item.obj, item.comp);
      item.obj.scale.set(1, 1, 1);
    });

    if (onBeforeDragRef.current) {
      onPushHistoryRef.current?.(onBeforeDragRef.current);
      onBeforeDragRef.current = null;
    }

    onBatchUpdateCompsRef.current?.(updatesById, { skipHistory: true });
    resetMultiTransformState();
  }, [compFromWorld, resetMultiTransformState]);

  const captureCameraView = useCallback(() => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!camera || !orbit) return null;

    return {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      target: orbit.target.clone(),
      zoom: camera.zoom,
    };
  }, []);

  const storeCameraView = useCallback(() => {
    const snapshot = captureCameraView();
    if (snapshot) cameraViewRef.current = snapshot;
    return snapshot;
  }, [captureCameraView]);

  const restoreCameraView = useCallback((snapshot) => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!camera || !orbit || !snapshot) return;

    camera.position.copy(snapshot.position);
    camera.quaternion.copy(snapshot.quaternion);
    camera.zoom = snapshot.zoom ?? camera.zoom;
    camera.updateProjectionMatrix();
    orbit.target.copy(snapshot.target);
    orbit.update();
  }, []);

  const preserveCameraView = useCallback(
    (fn) => {
      const before = captureCameraView() || cameraViewRef.current;
      fn?.();

      if (!before) return;

      restoreCameraView(before);
      cameraViewRef.current = before;

      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
      restoreRafRef.current = requestAnimationFrame(() => {
        restoreCameraView(before);
        cameraViewRef.current = before;
      });
    },
    [captureCameraView, restoreCameraView],
  );

  const centerOnObject = useCallback(
    (obj, instant = false) => {
      const camera = cameraRef.current;
      const orbit = orbitRef.current;
      if (!obj || !camera || !orbit) return;

      const box = new THREE.Box3().setFromObject(obj);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);

      orbit.target.copy(center);

      if (instant) {
        const maxSize = Math.max(size.x, size.y, size.z, 120);
        const fitHeightDistance =
          maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
        const fitWidthDistance = fitHeightDistance / camera.aspect;
        const dist = Math.max(fitHeightDistance, fitWidthDistance) * 1.9;

        camera.position.set(
          center.x + dist,
          center.y + dist * 0.65,
          center.z + dist,
        );
        camera.near = 0.5;
        camera.far = Math.max(12000, dist * 6);
        camera.updateProjectionMatrix();
      }

      orbit.update();
      storeCameraView();
    },
    [storeCameraView],
  );

  const fitCameraToRoot = useCallback(
    (padding = 1.45) => {
      const camera = cameraRef.current;
      const orbit = orbitRef.current;
      const rootGroup = rootGroupRef.current;

      if (!camera || !orbit || !rootGroup || !rootGroup.children.length) return;

      const bounds = new THREE.Box3().setFromObject(rootGroup);
      if (bounds.isEmpty()) return;

      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      bounds.getCenter(center);
      bounds.getSize(size);

      const maxSize = Math.max(size.x, size.y, size.z, 1);
      const fitHeightDistance =
        maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
      const fitWidthDistance = fitHeightDistance / camera.aspect;
      const distance = Math.max(fitHeightDistance, fitWidthDistance) * padding;

      camera.position.set(
        center.x + distance,
        center.y + distance * 0.65,
        center.z + distance,
      );
      camera.near = 0.5;
      camera.far = Math.max(12000, distance * 6);
      camera.updateProjectionMatrix();

      orbit.target.copy(center);
      orbit.minDistance = 140;
      orbit.maxDistance = Math.max(9000, distance * 5);
      orbit.update();

      storeCameraView();
    },
    [storeCameraView],
  );

  const applyGizmoLook = useCallback(() => {
    const transform = transformRef.current;
    if (!transform) return;

    const forceAxisMaterial = (obj, hex) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.color) m.color.setHex(hex);
        m.depthTest = false;
        m.transparent = true;
        m.opacity = 1;
        m.toneMapped = false;
        m.fog = false;
      });
    };

    transform.traverse((child) => {
      const name = child.name || "";
      const geoType = child.geometry?.type || "";

      const isXAxis = name === "X";
      const isYAxis = name === "Y";
      const isZAxis = name === "Z";

      if (
        name.includes("XY") ||
        name.includes("YZ") ||
        name.includes("XZ") ||
        name === "E" ||
        name === "XYZ" ||
        name === "XYZE" ||
        name.includes("START") ||
        name.includes("END") ||
        name.includes("DELTA") ||
        name.includes("AXIS") ||
        name.includes("helper") ||
        geoType === "PlaneGeometry" ||
        geoType === "BoxGeometry"
      ) {
        child.visible = false;
        return;
      }

      if (!isXAxis && !isYAxis && !isZAxis) {
        if (child.type === "Line" || child.type === "Mesh")
          child.visible = false;
        return;
      }

      child.visible = true;

      if (isXAxis) forceAxisMaterial(child, 0xff3b30);
      if (isYAxis) forceAxisMaterial(child, 0x34c759);
      if (isZAxis) forceAxisMaterial(child, 0x0a84ff);
    });
  }, []);

  const applyTransformModeRaw = useCallback(() => {
    const transform = transformRef.current;
    if (!transform) return;

    const mode = transformModeRef.current;

    if (mode === "rotate") transform.setMode("rotate");
    else if (mode === "scale") transform.setMode("scale");
    else transform.setMode("translate");

    transform.showX = true;
    transform.showY = true;
    transform.showZ = true;

    applyGizmoLook();
  }, [applyGizmoLook]);

  const applyTransformMode = useCallback(() => {
    preserveCameraView(() => {
      applyTransformModeRaw();
    });
  }, [preserveCameraView, applyTransformModeRaw]);

  const attachSelectedRaw = useCallback(() => {
    const transform = transformRef.current;
    if (!transform) return;

    const activeIds = getActiveSelectionIds();

    if (editorMode !== "editable" || !activeIds.length) {
      resetMultiTransformState();
      transform.detach();
      return;
    }

    const entries = getSelectionEntries(activeIds);

    if (!entries.length) {
      resetMultiTransformState();
      transform.detach();
      return;
    }

    const hasLockedEntry = entries.some(({ comp }) =>
      isLocked3DRef.current(comp),
    );

    if (hasLockedEntry) {
      resetMultiTransformState();
      transform.detach();
      return;
    }

    if (entries.length > 1) {
      const pivot = positionSelectionPivot(entries.map((entry) => entry.id));
      if (pivot) {
        resetMultiTransformState();
        transform.attach(pivot);
        applyTransformModeRaw();
        return;
      }
    }

    const primaryEntry =
      entries.find((entry) => entry.id === selectedIdRef.current) || entries[0];
    const currentEdit3DId = edit3DIdRef.current;

    if (primaryEntry && currentEdit3DId === primaryEntry.id) {
      resetMultiTransformState();
      transform.attach(primaryEntry.obj);
      applyTransformModeRaw();
    } else {
      resetMultiTransformState();
      transform.detach();
    }
  }, [
    editorMode,
    getActiveSelectionIds,
    getSelectionEntries,
    positionSelectionPivot,
    resetMultiTransformState,
    applyTransformModeRaw,
  ]);

  const attachSelected = useCallback(() => {
    preserveCameraView(() => {
      attachSelectedRaw();
    });
  }, [preserveCameraView, attachSelectedRaw]);

  const clearSelectionOutlines = useCallback(() => {
    const outlineGroup = selectionOutlineGroupRef.current;
    if (!outlineGroup) return;

    while (outlineGroup.children.length) {
      const child = outlineGroup.children[0];
      outlineGroup.remove(child);

      child.traverse?.((obj) => {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => mat?.dispose?.());
        } else {
          obj.material?.dispose?.();
        }
      });
    }
  }, []);

  const syncSelectionOutlines = useCallback(() => {
    const outlineGroup = selectionOutlineGroupRef.current;
    const rootGroup = rootGroupRef.current;
    if (!outlineGroup || !rootGroup) return;

    clearSelectionOutlines();

    const activeIds = new Set(getActiveSelectionIds());
    if (!activeIds.size) return;

    activeIds.forEach((id) => {
      const entry = entryMapRef.current.get(id);
      if (!entry?.obj) return;

      const helper = new THREE.BoxHelper(entry.obj, 0x38bdf8);
      helper.material.depthTest = false;
      helper.material.transparent = true;
      helper.material.opacity = 0.55;
      helper.material.toneMapped = false;
      helper.renderOrder = 999;

      outlineGroup.add(helper);
      helper.updateMatrixWorld(true);
    });
  }, [clearSelectionOutlines, getActiveSelectionIds]);

  const rebuildObjects = useCallback(() => {
    console.log("3D rebuild components:", components);

    const rootGroup = rootGroupRef.current;
    if (!rootGroup) return;

    const savedView = captureCameraView() || cameraViewRef.current;

    while (rootGroup.children.length) {
      const child = rootGroup.children[0];
      rootGroup.remove(child);
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
    }

    entryMapRef.current = new Map();
    selectableMeshesRef.current = [];

    const activeSelectedIds = new Set(selectedIdsRef.current || []);
    const currentSelectedId = selectedIdRef.current;
    const currentEdit3DId = edit3DIdRef.current;

    components.forEach((raw) => {
      const comp = normalizeComponent(raw);
      const selected =
        currentSelectedId === comp.id || activeSelectedIds.has(comp.id);
      const editing = currentEdit3DId === comp.id;

      const obj = createFurnitureObject(
        comp,
        selected,
        editing,
        selectableMeshesRef.current,
      );

      const pos = worldFromComp(comp);

      obj.position.set(pos.x, pos.y, pos.z);
      obj.rotation.x = THREE.MathUtils.degToRad(comp.rotationX || 0);
      obj.rotation.y = THREE.MathUtils.degToRad(comp.rotationY || 0);
      obj.rotation.z = THREE.MathUtils.degToRad(comp.rotationZ || 0);
      obj.scale.set(1, 1, 1);
      obj.userData.id = comp.id;

      rootGroup.add(obj);
      entryMapRef.current.set(comp.id, { obj, comp });
    });

    attachSelectedRaw();
    syncSelectionOutlines();

    if (initialSceneObjectCountRef.current === null) {
      initialSceneObjectCountRef.current = components.length;
    }

    if (savedView) {
      restoreCameraView(savedView);
      cameraViewRef.current = savedView;
    } else {
      storeCameraView();
    }

    if (!didInitialFitRef.current) {
      didInitialFitRef.current = true;
    }
  }, [
    components,
    worldFromComp,
    attachSelectedRaw,
    captureCameraView,
    restoreCameraView,
    storeCameraView,
    syncSelectionOutlines,
  ]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || 1000;
    const h = mount.clientHeight || 700;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    renderer.setClearColor(0x16263d);
    mount.innerHTML = "";

    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.outline = "none";

    const canvas = renderer.domElement;
    canvas.tabIndex = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16263d);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.5, 12000);
    camera.position.set(1100, 760, 1100);

    scene.add(new THREE.AmbientLight(0xffffff, 1.15));

    const hemi = new THREE.HemisphereLight(0xf4f8ff, 0x223248, 1.45);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(1400, 2200, 1200);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(4096, 4096);
    keyLight.shadow.camera.left = -3200;
    keyLight.shadow.camera.right = 3200;
    keyLight.shadow.camera.top = 3200;
    keyLight.shadow.camera.bottom = -3200;
    keyLight.shadow.camera.near = 200;
    keyLight.shadow.camera.far = 7000;
    keyLight.shadow.bias = 0.00035;
    keyLight.shadow.normalBias = 0.85;
    keyLight.shadow.radius = 2;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.15);
    fillLight.position.set(-1500, 1000, 1300);
    scene.add(fillLight);

    const frontLight = new THREE.DirectionalLight(0xffffff, 0.95);
    frontLight.position.set(0, 900, 1800);
    scene.add(frontLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.6);
    rimLight.position.set(-1100, 700, -900);
    scene.add(rimLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.65);
    topLight.position.set(0, 2600, 0);
    scene.add(topLight);

    const FLOOR_Y = -canvasH / 2;

    // Blueprint base plane
    const floorBase = new THREE.Mesh(
      new THREE.PlaneGeometry(6800, 6800),
      new THREE.MeshStandardMaterial({
        color: 0x17345a,
        roughness: 0.97,
        metalness: 0.0,
        emissive: 0x0a1422,
        emissiveIntensity: 0.28,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
    floorBase.rotation.x = -Math.PI / 2;
    floorBase.position.y = FLOOR_Y - 1.5;
    floorBase.receiveShadow = true;
    floorBase.renderOrder = 0;
    scene.add(floorBase);

    // Minor blueprint grid
    const minorGrid = new THREE.GridHelper(6000, 120, 0x5ea3e6, 0x274d78);
    minorGrid.position.y = FLOOR_Y + 0.35;
    minorGrid.material.transparent = true;
    minorGrid.material.opacity = 0.34;
    minorGrid.material.depthWrite = false;
    minorGrid.renderOrder = 1;
    scene.add(minorGrid);

    // Major blueprint grid
    const majorGrid = new THREE.GridHelper(6000, 24, 0xb9e3ff, 0x6ea8dc);
    majorGrid.position.y = FLOOR_Y + 0.75;
    majorGrid.material.transparent = true;
    majorGrid.material.opacity = 0.72;
    majorGrid.material.depthWrite = false;
    majorGrid.renderOrder = 2;
    scene.add(majorGrid);

    // Axis lines — slightly lifted above the grids
    const axisMatX = new THREE.LineBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
    });

    const axisMatY = new THREE.LineBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      toneMapped: false,
    });

    const axisMatZ = new THREE.LineBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
    });

    const makeAxis = (a, b, mat, renderOrder = 3) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...a),
          new THREE.Vector3(...b),
        ]),
        mat,
      );
      line.renderOrder = renderOrder;
      return line;
    };

    scene.add(
      makeAxis([-3000, FLOOR_Y + 1.05, 0], [3000, FLOOR_Y + 1.05, 0], axisMatX),
    );

    scene.add(makeAxis([0, FLOOR_Y, 0], [0, 2800, 0], axisMatY));

    scene.add(
      makeAxis([0, FLOOR_Y + 1.05, -3000], [0, FLOOR_Y + 1.05, 3000], axisMatZ),
    );

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.rotateSpeed = 0.9;
    orbit.panSpeed = 1;
    orbit.zoomSpeed = 1.05;
    orbit.minDistance = 140;
    orbit.maxDistance = 9500;
    orbit.maxPolarAngle = Math.PI / 2.02;
    orbit.target.set(0, 160, 0);
    orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    orbit.update();

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSpace("world");
    transform.setSize(0.86);
    transform.translationSnap = GRID_SIZE;
    transform.rotationSnap = THREE.MathUtils.degToRad(15);
    scene.add(transform);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const selectionOutlineGroup = new THREE.Group();
    selectionOutlineGroup.name = "selection-outline-group";
    scene.add(selectionOutlineGroup);

    const previewGroup = new THREE.Group();
    previewGroup.name = "placement-preview-group";
    scene.add(previewGroup);

    cameraRef.current = camera;
    orbitRef.current = orbit;
    transformRef.current = transform;
    rootGroupRef.current = rootGroup;
    selectionOutlineGroupRef.current = selectionOutlineGroup;
    previewGroupRef.current = previewGroup;

    storeCameraView();
    applyTransformModeRaw();

    const handleCanvasEnter = () => {
      moveEnabledRef.current = true;
    };

    const handleCanvasLeave = () => {
      moveEnabledRef.current = false;
      clearKeys();
    };

    const handleCanvasClick = () => {
      moveEnabledRef.current = true;
      canvas.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearKeys);

    canvas.addEventListener("mouseenter", handleCanvasEnter);
    canvas.addEventListener("mouseleave", handleCanvasLeave);
    canvas.addEventListener("click", handleCanvasClick);

    const setMouseFromEvent = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const getFloorPlacementFromClientPoint = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const isInsideCanvas =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;

      if (!isInsideCanvas) return null;

      mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const floorPlane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        canvasH / 2,
      );
      const hitPoint = new THREE.Vector3();
      const hasFloorHit = raycasterRef.current.ray.intersectPlane(
        floorPlane,
        hitPoint,
      );

      if (!hasFloorHit) return null;

      return {
        worldX: snap(hitPoint.x),
        worldZ: snap(hitPoint.z),
      };
    };

    const syncPreviewFromPointerEvent = (event, forcedItem = null) => {
      const placement = getFloorPlacementFromClientPoint(
        event.clientX,
        event.clientY,
      );

      if (!placement) return null;

      previewPlacementRef.current = placement;
      updatePlacementPreview(
        placement,
        forcedItem || pendingPlacementRef.current,
      );
      return placement;
    };

    const getPlacementFromPreviewObject = (forcedItem = null) => {
      const preview = previewObjectRef.current;
      const typeDef = forcedItem || pendingPlacementRef.current;

      if (!preview || !typeDef) return previewPlacementRef.current || null;

      preview.updateMatrixWorld?.(true);

      const worldBox = new THREE.Box3().setFromObject(preview);
      if (worldBox.isEmpty()) {
        return previewPlacementRef.current || null;
      }

      if (isTemplatePlacementType(typeDef)) {
        return {
          worldX: snap(worldBox.min.x),
          worldZ: snap(worldBox.min.z),
        };
      }

      const center = new THREE.Vector3();
      worldBox.getCenter(center);

      return {
        worldX: snap(center.x),
        worldZ: snap(center.z),
      };
    };

    const pickMesh = (event) => {
      setMouseFromEvent(event);
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const hits = raycasterRef.current.intersectObjects(
        selectableMeshesRef.current,
        false,
      );
      return hits[0] || null;
    };

    const onDraggingChanged = (event) => {
      orbit.enabled = !event.value;

      const activeIds = getActiveSelectionIds();
      const isMultiTransform =
        activeIds.length > 1 && transform.object === selectionPivotRef.current;

      if (event.value) {
        onBeforeDragRef.current = componentsRef.current
          ? [...componentsRef.current]
          : null;

        if (isMultiTransform) {
          beginMultiTransform(activeIds);
        } else {
          const currentId = selectedIdRef.current;
          const entry = currentId ? entryMapRef.current.get(currentId) : null;

          if (entry?.obj && entry?.comp) {
            syncLiveSelectedCompFromObject(currentId, entry.obj, entry.comp);
          }
        }
      }

      if (!event.value) {
        if (isMultiTransform) {
          commitMultiTransform();
          attachSelectedRaw();
          clearLiveSelectedComp();
          syncSelectionOutlines();
          storeCameraView();
          return;
        }

        const currentId = selectedIdRef.current;
        if (!currentId) {
          clearLiveSelectedComp();
          return;
        }

        const entry = entryMapRef.current.get(currentId);
        if (!entry) {
          clearLiveSelectedComp();
          return;
        }

        const updates = compFromWorld(entry.obj, entry.comp);

        if (onBeforeDragRef.current) {
          onPushHistoryRef.current?.(onBeforeDragRef.current);
          onBeforeDragRef.current = null;
        }

        onUpdateCompRef.current(currentId, updates);
        entry.obj.scale.set(1, 1, 1);
        clearLiveSelectedComp();
        syncSelectionOutlines();
        storeCameraView();
      }
    };

    const onTransformObjectChange = () => {
      if (!transform.dragging) return;

      if (transform.object === selectionPivotRef.current) {
        previewMultiTransform();
        syncSelectionOutlines();

        const currentId = selectedIdRef.current;
        if (currentId) {
          const entry = entryMapRef.current.get(currentId);
          if (entry?.obj && entry?.comp) {
            syncLiveSelectedCompFromObject(currentId, entry.obj, entry.comp);
          }
        }
        return;
      }

      const currentId = selectedIdRef.current;
      if (!currentId) return;

      const entry = entryMapRef.current.get(currentId);
      if (!entry?.obj || !entry?.comp) return;

      syncLiveSelectedCompFromObject(currentId, entry.obj, entry.comp);
      syncSelectionOutlines();
    };

    // --- NEW: Box Selection Event Handlers (Fixed with Ref to prevent infinite loops) ---
    const onPointerMove = (e) => {
      const dragState = libraryPlacementDragRef.current;

      if (dragState.active) {
        const dx = Math.abs(e.clientX - dragState.startClientX);
        const dy = Math.abs(e.clientY - dragState.startClientY);
        if (dx > 6 || dy > 6) {
          dragState.moved = true;
        }

        const placement = syncPreviewFromPointerEvent(e, dragState.item);
        dragState.startedInsideCanvas =
          dragState.startedInsideCanvas || Boolean(placement);

        if (orbitRef.current && !transformRef.current?.dragging) {
          orbitRef.current.enabled = false;
        }
        return;
      }

      if (pendingPlacementRef.current && !isSelectingRef.current) {
        syncPreviewFromPointerEvent(e);
      }

      if (!isSelectingRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const currentX = clamp(e.clientX - rect.left, 0, rect.width);
      const currentY = clamp(e.clientY - rect.top, 0, rect.height);

      const minX = Math.min(startPointRef.current.x, currentX);
      const maxX = Math.max(startPointRef.current.x, currentX);
      const minY = Math.min(startPointRef.current.y, currentY);
      const maxY = Math.max(startPointRef.current.y, currentY);

      const newRect = {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
      };

      selectionRectRef.current = newRect;
      setSelectionRect(newRect);
    };

    const onPointerUp = (e) => {
      const dragState = libraryPlacementDragRef.current;

      if (dragState.active) {
        const pointerPlacement = syncPreviewFromPointerEvent(e, dragState.item);
        const previewPlacement = getPlacementFromPreviewObject(dragState.item);
        const placement =
          previewPlacement || pointerPlacement || previewPlacementRef.current;

        const canPlace = Boolean(
          dragState.moved &&
          (dragState.startedInsideCanvas ||
            pointerPlacement ||
            previewPlacement ||
            previewPlacementRef.current) &&
          placement &&
          pendingPlacementRef.current,
        );

        if (canPlace) {
          onPlaceComponentRef.current?.(placement);
          storeCameraView();
        } else {
          onCancelPlacementRef.current?.();
        }

        resetLibraryPlacementDrag({ disposePreview: true });
        return;
      }

      if (isSelectingRef.current) {
        isSelectingRef.current = false;
        orbit.enabled = true; // Re-enable orbit controls

        const rectBoxData = selectionRectRef.current;

        if (rectBoxData && rectBoxData.w > 5 && rectBoxData.h > 5) {
          // Find objects inside the selection box
          const rectBox = new THREE.Box2(
            new THREE.Vector2(rectBoxData.x, rectBoxData.y),
            new THREE.Vector2(
              rectBoxData.x + rectBoxData.w,
              rectBoxData.y + rectBoxData.h,
            ),
          );

          const selectedNow = [];
          const canvasWidth = renderer.domElement.clientWidth;
          const canvasHeight = renderer.domElement.clientHeight;
          const halfW = canvasWidth / 2;
          const halfH = canvasHeight / 2;

          selectableMeshesRef.current.forEach((mesh) => {
            const pos = new THREE.Vector3();
            mesh.getWorldPosition(pos);
            pos.project(camera);

            const screenX = pos.x * halfW + halfW;
            const screenY = -(pos.y * halfH) + halfH;
            const screenPoint = new THREE.Vector2(screenX, screenY);

            if (rectBox.containsPoint(screenPoint)) {
              if (mesh.userData.rootId) {
                selectedNow.push(mesh.userData.rootId);
              }
            }
          });

          if (selectedNow.length > 0) {
            preserveCameraView(() => {
              const activeSet = new Set(getActiveSelectionIds());
              selectedNow.forEach((id) => activeSet.add(id));
              const newArr = Array.from(activeSet);
              const newPrimary = newArr[newArr.length - 1] || null;

              applySelectionState(newArr, newPrimary);
              attachSelectedRaw();
              applyTransformModeRaw();
            });
            storeCameraView();
          }
        }

        // Clear the box visually and reset ref
        selectionRectRef.current = null;
        setSelectionRect(null);
      }
    };

    const onPointerCancel = () => {
      const dragState = libraryPlacementDragRef.current;
      if (!dragState.active) return;

      onCancelPlacementRef.current?.();
      resetLibraryPlacementDrag({ disposePreview: true });
    };

    const onPointerDown = (e) => {
      if (transform.axis) return;

      const activePendingPlacement = pendingPlacementRef.current;

      if (activePendingPlacement) {
        if (e.button === 2) {
          e.preventDefault();
          onCancelPlacementRef.current?.();
          resetLibraryPlacementDrag({ disposePreview: true });
          return;
        }

        if (e.button !== 0) return;

        const placement =
          syncPreviewFromPointerEvent(e, activePendingPlacement) ||
          previewPlacementRef.current ||
          (() => {
            setMouseFromEvent(e);
            raycasterRef.current.setFromCamera(mouseRef.current, camera);

            const floorPlane = new THREE.Plane(
              new THREE.Vector3(0, 1, 0),
              -FLOOR_Y,
            );

            const hitPoint = new THREE.Vector3();
            const hasFloorHit = raycasterRef.current.ray.intersectPlane(
              floorPlane,
              hitPoint,
            );

            if (!hasFloorHit) return null;
            return {
              worldX: snap(hitPoint.x),
              worldZ: snap(hitPoint.z),
            };
          })();

        if (placement) {
          onPlaceComponentRef.current?.(placement);
          storeCameraView();
        } else {
          onCancelPlacementRef.current?.();
        }

        resetLibraryPlacementDrag({ disposePreview: true });
        return;
      }

      // --- NEW: Start Selection Box ---
      const hit = pickMesh(e);

      // --- Start marquee select only when Shift + empty space ---
      if (e.shiftKey && e.button === 0 && !hit?.object?.userData?.rootId) {
        isSelectingRef.current = true;
        orbit.enabled = false;

        const rect = renderer.domElement.getBoundingClientRect();
        startPointRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };

        const initialRect = {
          x: startPointRef.current.x,
          y: startPointRef.current.y,
          w: 0,
          h: 0,
        };

        selectionRectRef.current = initialRect;
        setSelectionRect(initialRect);
        return;
      }

      if (!hit?.object?.userData?.rootId) {
        applySelectionState([], null);
        resetMultiTransformState();
        clearLiveSelectedComp();
        transform.detach();
        syncSelectionOutlines();
        storeCameraView();
        return;
      }

      const hitId = hit.object.userData.rootId;
      const hitFaceKey = hit.object.userData.faceKey || null;
      const entry = entryMapRef.current.get(hitId);

      // CHANGED: Allow selection of locked objects so the user can unlock them.
      // attachSelectedRaw() will prevent transform controls from attaching if locked.
      if (!entry) return;

      preserveCameraView(() => {
        if (e.shiftKey) {
          const activeSet = new Set(getActiveSelectionIds());

          if (activeSet.has(hitId)) {
            activeSet.delete(hitId);
          } else {
            activeSet.add(hitId);
          }

          const newArr = Array.from(activeSet);
          const newPrimary = newArr[newArr.length - 1] || null;

          applySelectionState(newArr, newPrimary);
        } else {
          applySelectionState([hitId], hitId);
        }

        if (hitFaceKey && entry.comp?.type === "rounded_box") {
          onUpdateCompRef.current?.(hitId, {
            selectedFace: hitFaceKey,
          });
        }

        attachSelectedRaw();
        applyTransformModeRaw();
      });

      storeCameraView();
      syncSelectionOutlines();
    };

    const onDoubleClick = (e) => {
      const hit = pickMesh(e);

      if (!hit?.object?.userData?.rootId) {
        applySelectionState([], null);
        resetMultiTransformState();
        clearLiveSelectedComp();
        transform.detach();
        syncSelectionOutlines();
        storeCameraView();
        return;
      }
      const hitId = hit.object.userData.rootId;
      const entry = entryMapRef.current.get(hitId);

      // CHANGED: Allow double clicking locked objects to focus camera on them.
      if (!entry) return;

      preserveCameraView(() => {
        const assemblyIds = getAssemblyIdsFromComponentId(hitId);
        const nextIds = assemblyIds.length ? assemblyIds : [hitId];
        applySelectionState(nextIds, hitId);
        attachSelectedRaw();
        applyTransformModeRaw();
      });

      centerOnObject(entry.obj, true);
      syncSelectionOutlines();
    };

    const onResize = () => {
      const newW = mount.clientWidth || 1000;
      const newH = mount.clientHeight || 700;
      renderer.setSize(newW, newH);
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      restoreCameraView(cameraViewRef.current);
    };

    const preventContextMenu = (e) => e.preventDefault();

    const onOrbitChange = () => {
      if (!transform.dragging) storeCameraView();
    };

    transform.addEventListener("dragging-changed", onDraggingChanged);
    transform.addEventListener("objectChange", onTransformObjectChange);
    orbit.addEventListener("change", onOrbitChange);

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove); // NEW
    window.addEventListener("pointerup", onPointerUp); // NEW
    window.addEventListener("mouseup", onPointerUp); // NEW
    window.addEventListener("pointercancel", onPointerCancel); // NEW

    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    renderer.domElement.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("resize", onResize);

    let animId;
    lastFrameRef.current = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const now = performance.now();
      const delta = Math.min((now - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = now;

      updateKeyboardCamera(delta);

      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);

      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);

      transform.removeEventListener("dragging-changed", onDraggingChanged);
      transform.removeEventListener("objectChange", onTransformObjectChange);
      orbit.removeEventListener("change", onOrbitChange);

      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove); // NEW
      window.removeEventListener("pointerup", onPointerUp); // NEW
      window.removeEventListener("mouseup", onPointerUp); // NEW
      window.removeEventListener("pointercancel", onPointerCancel); // NEW

      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      renderer.domElement.removeEventListener(
        "contextmenu",
        preventContextMenu,
      );

      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearKeys);

      canvas.removeEventListener("mouseenter", handleCanvasEnter);
      canvas.removeEventListener("mouseleave", handleCanvasLeave);
      canvas.removeEventListener("click", handleCanvasClick);

      transform.detach();
      transform.dispose();
      orbit.dispose();
      disposePlacementPreview();
      rendererRef.current = null;
      sceneRef.current = null;

      rootGroup.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });

      disposePlacementPreview();
      clearSelectionOutlines();
      if (previewGroupRef.current?.parent) {
        previewGroupRef.current.parent.remove(previewGroupRef.current);
      }
      previewGroupRef.current = null;

      if (selectionOutlineGroupRef.current?.parent) {
        selectionOutlineGroupRef.current.parent.remove(
          selectionOutlineGroupRef.current,
        );
      }
      selectionOutlineGroupRef.current = null;

      const pivot = selectionPivotRef.current;
      if (pivot?.parent) {
        pivot.parent.remove(pivot);
      }

      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, [
    canvasH,
    compFromWorld,
    centerOnObject,
    preserveCameraView,
    restoreCameraView,
    storeCameraView,
    applyTransformModeRaw,
    updateKeyboardCamera,
    handleKeyDown,
    handleKeyUp,
    clearKeys,
    clearSelectionOutlines,
    syncSelectionOutlines,
    clearLiveSelectedComp,
    syncLiveSelectedCompFromObject,
  ]);

  useEffect(() => {
    applyTransformMode();
    attachSelected();
  }, [transformMode, applyTransformMode, attachSelected]);

  useEffect(() => {
    rebuildObjects();
  }, [rebuildObjects]);

  useEffect(() => {
    clearLiveSelectedComp();
    attachSelected();
    syncSelectionOutlines();
  }, [
    selectedId,
    selectedIds,
    edit3DId,
    clearLiveSelectedComp,
    attachSelected,
    syncSelectionOutlines,
  ]);

  // --- NEW: Toggle Lock Logic for selected items ---

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* --- NEW: Visual Box for Selection --- */}
      {selectionRect && (
        <div
          style={{
            position: "absolute",
            border: "1px solid rgba(56, 189, 248, 0.8)",
            backgroundColor: "rgba(56, 189, 248, 0.2)",
            pointerEvents: "none",
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.w,
            height: selectionRect.h,
            zIndex: 1000,
          }}
        />
      )}

      {showLibraryPanel ? (
        <Floating3DPalette
          onAdd={addComponent}
          onStartDrag={startLibraryPlacementDrag}
          onOpenCabinetBuilder={openCabinetBuilderShortcut}
          activeBuildLabel={activeBuildLabel}
          isDragPlacementActive={isLibraryDragPlacing}
          pendingPlacement={pendingPlacement}
          isOpen={activeLeftPanel === "library"}
          onToggle={() =>
            setActiveLeftPanel(activeLeftPanel === "library" ? null : "library")
          }
        />
      ) : null}

      <FloatingObjectsTree
        components={components}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={applySelectionState}
        isOpen={activeLeftPanel === "objects"}
        onToggle={() =>
          setActiveLeftPanel((prev) => (prev === "objects" ? null : "objects"))
        }
        isLocked3D={isLocked3D}
      />

      <Floating3DInspector
        selectedComp={selectedComp}
        liveSelectedComp={liveSelectedComp}
        selectedIds={selectedIds}
        isLocked={isLocked}
        onChange={onUpdateComp}
        unit={unit}
        editorMode={editorMode}
        activeInspectorTab={activeInspectorTab}
        onChangeInspectorTab={setActiveInspectorTab}
        renderSmartBuild={
          <SmartActionsPanel
            canUseSmartActions={canUseSmartActions}
            smartSelectionCount={smartSelectionCount}
            hasLockedSmartSelection={hasLockedSmartSelection}
            onAlignSelection={onAlignSelection}
            onFlushSelection={onFlushSelection}
            onMirrorDuplicate={onMirrorDuplicate}
            onSelectAssembly={onSelectAssembly}
            onDuplicateAssembly={onDuplicateAssembly}
            onArrayDuplicate={onArrayDuplicate}
            onDistributeSelection={onDistributeSelection}
            onGapSelection={onGapSelection}
            onBuildLineSelection={onBuildLineSelection}
            onAutoShelfStack={onAutoShelfStack}
            onAutoLegLayout={onAutoLegLayout}
            onPanelPairSelection={onPanelPairSelection}
            onFrontPairSelection={onFrontPairSelection}
            onDoorSplitSelection={onDoorSplitSelection}
            onDrawerStackSelection={onDrawerStackSelection}
            onFaceFitSelection={onFaceFitSelection}
            onInsideFitSelection={onInsideFitSelection}
            onBuildCabinetBox={onBuildCabinetBox}
            onBuildCabinetInteriorPreset={onBuildCabinetInteriorPreset}
            onBuildCabinetFrontPreset={onBuildCabinetFrontPreset}
            onBuildCabinetCustomBayFronts={onBuildCabinetCustomBayFronts}
            onBuildCabinetCustomCellFronts={onBuildCabinetCustomCellFronts}
            canBuildCabinetBox={canBuildCabinetBox}
            canBuildCabinetInteriorPreset={canBuildCabinetInteriorPreset}
            canBuildCabinetFrontPreset={canBuildCabinetFrontPreset}
            canBuildCabinetCustomBayFronts={canBuildCabinetCustomBayFronts}
            canBuildCabinetCustomCellFronts={canBuildCabinetCustomCellFronts}
            isDocked={true}
            activeToolTab={activeToolTab}
            onChangeToolTab={setActiveToolTab}
          />
        }
      />

      <ToolSidebar
        transformMode={transformMode}
        setTransformMode={setTransformMode}
        hasSelection={hasActiveSelection3D}
        canTransform={canTransformSelection3D}
        isSelectionLocked={isSelectionLocked3D}
        onToggleLock={toggleLockSelection3D}
      />
    </div>
  );
}

export { ThreeDViewer };
