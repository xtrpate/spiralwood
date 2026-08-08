import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getTemplateLibraryPartGroups } from "../../data/templateComponents";
import { COMPONENT_LIBRARY_GROUPS } from "../../data/furnitureTypes";
import S from "../../styles/blueprintStyles";
import {
  LIBRARY_PREVIEW,
  LIBRARY_TABS,
  VIEWER_UI,
  getLibraryBucket,
} from "../viewerUi";

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
        title={`${tooltip.title} · ${tooltip.material} · ${tooltip.dims}`}
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
          borderRadius: 2,
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
            gridTemplateColumns: "104px minmax(0, 1fr)",
            alignItems: "stretch",
            gap: 10,
            width: "100%",
            minHeight: 86,
          }}
        >
          <div
            style={{
              borderRadius: 2,
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
                  borderRadius: 2,
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
              paddingRight: 4,
            }}
          >
            <div style={{ width: "100%", minWidth: 0 }}>
              <div
                style={{
                  color: "#eef4ff",
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1.35,
                  textAlign: "left",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {tooltip.title}
              </div>

              <div
                style={{
                  marginTop: 6,
                  color: "#9eb0c7",
                  fontSize: 9,
                  lineHeight: 1.35,
                  textAlign: "left",
                }}
              >
                {tooltip.dims}
              </div>

              <div
                style={{
                  marginTop: 2,
                  color: "#7f93ad",
                  fontSize: 9,
                  lineHeight: 1.35,
                  textAlign: "left",
                }}
              >
                {tooltip.material}
              </div>

              <div
                style={{
                  marginTop: 7,
                  color: "#93c5fd",
                  fontSize: 9,
                  fontWeight: 800,
                  textAlign: "left",
                }}
              >
                Drag to place
              </div>
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
              borderRadius: 2,
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
      title={`${tooltip.title} · ${tooltip.material} · ${tooltip.dims}`}
      onPointerDown={onPointerDown}
      onDragStart={(e) => e.preventDefault()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        position: "relative",
        width: "100%",
        minHeight: 108,
        padding: 8,
        borderRadius: 2,
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
          height: 70,
          borderRadius: 2,
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
              borderRadius: 2,
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
          marginTop: 6,
          color: "#dbe7f7",
          fontSize: 9,
          fontWeight: 750,
          lineHeight: 1.3,
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {tooltip.title}
      </div>

      {hovered ? (
        <div
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            bottom: 8,
            padding: "8px 10px",
            borderRadius: 2,
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
export function FurnitureLibraryPanel({
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
          width: 310,
          padding: 10,
          borderRadius: 2,
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "translateX(0)" : "translateX(-18px)",
          pointerEvents: isOpen ? "auto" : "none",
          zIndex: isOpen ? 50 : 1,
        }}
      >
        <div style={S.libraryStickyTop}>
          <div style={S.libraryHeaderRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={S.floatingTitle}>Add Furniture</div>
              <div style={S.librarySubtleText}>
                Drag a furniture template or part into the workspace.
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
                borderRadius: 2,
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

          <div
            style={{
              marginTop: 8,
              color: "#8799b1",
              fontSize: 9,
              lineHeight: 1.35,
            }}
          >
            {activeTabLabel} | {totalVisibleItems} items | {totalVisibleSections} groups
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
