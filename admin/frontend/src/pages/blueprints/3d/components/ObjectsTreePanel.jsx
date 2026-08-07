import React, { useMemo, useState } from "react";
import S from "../../styles/blueprintStyles";
import { VIEWER_UI } from "../viewerUi";

function formatAssemblyType(value) {
  const text = String(value || "").trim();
  if (!text) return "Assembly";

  return text
    .replace(/^template_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ObjectsTreePanel({
  components,
  selectedId,
  selectedIds = [],
  onSelect,
  canCreateAssembly = false,
  createAssemblyHint = "",
  createAssemblySelectionCount = 0,
  onCreateAssembly,
  isOpen,
  onToggle,
  isLocked3D,
}) {
  const [collapsedAssemblyIds, setCollapsedAssemblyIds] = useState(() => new Set());

  const grouped = useMemo(() => {
    const groups = new Map();
    const standalone = [];

    (components || []).forEach((component) => {
      const assemblyId = component.assemblyId || component.groupId || null;

      if (!assemblyId) {
        standalone.push(component);
        return;
      }

      if (!groups.has(assemblyId)) {
        groups.set(assemblyId, {
          id: assemblyId,
          label:
            component.assemblyName ||
            component.groupLabel ||
            "Furniture Assembly",
          type:
            component.assemblyType ||
            (component.groupType === "chair"
              ? "dining_chair"
              : component.groupType) ||
            "assembly",
          items: [],
        });
      }

      groups.get(assemblyId).items.push(component);
    });

    const assemblies = Array.from(groups.values()).map((group) => {
      const lockedCount = group.items.filter((item) => isLocked3D?.(item)).length;

      return {
        ...group,
        lockedCount,
      };
    });

    return { groups: assemblies, standalone };
  }, [components, isLocked3D]);

  const selectedSet = useMemo(
    () => new Set(Array.isArray(selectedIds) ? selectedIds : []),
    [selectedIds],
  );

  const handleSelect = (id, event) => {
    event.stopPropagation();

    if (event.shiftKey) {
      const base = Array.isArray(selectedIds) ? selectedIds : [];
      const nextSelected = base.includes(id)
        ? base.filter((itemId) => itemId !== id)
        : [...base, id];

      onSelect?.(
        nextSelected,
        nextSelected[nextSelected.length - 1] || null,
      );
      return;
    }

    onSelect?.([id], id);
  };

  const handleSelectAssembly = (group, event) => {
    event.stopPropagation();

    const ids = group.items.map((item) => item.id).filter(Boolean);
    if (!ids.length) return;

    onSelect?.(ids, ids[0]);
  };

  const toggleAssembly = (assemblyId, event) => {
    event.stopPropagation();

    setCollapsedAssemblyIds((previous) => {
      const next = new Set(previous);

      if (next.has(assemblyId)) {
        next.delete(assemblyId);
      } else {
        next.add(assemblyId);
      }

      return next;
    });
  };

  const renderPartButton = (item, { nested = false } = {}) => {
    const active = selectedSet.has(item.id) || selectedId === item.id;
    const locked = isLocked3D?.(item);

    return (
      <button
        key={item.id}
        type="button"
        onClick={(event) => handleSelect(item.id, event)}
        style={{
          ...S.floatingPaletteBtn,
          justifyContent: "space-between",
          textAlign: "left",
          marginLeft: nested ? 12 : 0,
          width: nested ? "calc(100% - 12px)" : "100%",
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
              ? `${item.partCode} \u2014 ${item.label}`
              : item.label}
          </span>
        </span>

        {locked ? (
          <span style={{ fontSize: 11, opacity: 0.85, marginLeft: 8 }}>
            {"\uD83D\uDD12"}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          onClick={onToggle}
          style={{ ...S.libraryToggleBtn, top: 60 }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>{"\u25A4"}</span>
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
            <div style={S.librarySubtleText}>
              Project &rarr; Assembly &rarr; Part
            </div>
          </div>

          <button type="button" onClick={onToggle} style={S.libraryCloseBtn}>
            {"\u00D7"}
          </button>
        </div>

        <div
          style={{
            marginTop: 10,
            padding: 8,
            border: "1px solid rgba(51,65,85,.58)",
            borderRadius: 8,
            background: "rgba(8,15,28,.42)",
          }}
        >
          <button
            type="button"
            onClick={onCreateAssembly}
            disabled={!canCreateAssembly}
            title={createAssemblyHint}
            style={{
              width: "100%",
              minHeight: 32,
              border: canCreateAssembly
                ? "1px solid rgba(96,165,250,.75)"
                : "1px solid rgba(71,85,105,.55)",
              borderRadius: 6,
              background: canCreateAssembly
                ? "rgba(37,99,235,.22)"
                : "rgba(15,23,42,.58)",
              color: canCreateAssembly ? "#dbeafe" : "#64748b",
              fontSize: 10,
              fontWeight: 800,
              cursor: canCreateAssembly ? "pointer" : "not-allowed",
            }}
          >
            + Create Assembly
          </button>

          <div
            style={{
              marginTop: 5,
              color: canCreateAssembly ? "#93c5fd" : "#7c8da5",
              fontSize: 9,
              lineHeight: 1.35,
            }}
          >
            {createAssemblyHint ||
              `${createAssemblySelectionCount} selected part${
                createAssemblySelectionCount !== 1 ? "s" : ""
              }`}
          </div>
        </div>

        <div
          style={{
            ...VIEWER_UI.sideDockBody,
            display: "grid",
            gap: 7,
            marginTop: 10,
          }}
        >
          {grouped.groups.map((group) => {
            const collapsed = collapsedAssemblyIds.has(group.id);
            const assemblyIds = group.items
              .map((item) => item.id)
              .filter(Boolean);
            const assemblySelected =
              assemblyIds.length > 0 &&
              assemblyIds.every((id) => selectedSet.has(id));

            return (
              <div
                key={group.id}
                style={{
                  marginBottom: 8,
                  border: assemblySelected
                    ? "1px solid rgba(96,165,250,.62)"
                    : "1px solid rgba(51,65,85,.58)",
                  borderRadius: 8,
                  background: assemblySelected
                    ? "rgba(30,64,175,.10)"
                    : "rgba(8,15,28,.32)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px minmax(0,1fr)",
                    alignItems: "stretch",
                  }}
                >
                  <button
                    type="button"
                    aria-label={
                      collapsed ? "Expand assembly" : "Collapse assembly"
                    }
                    title={collapsed ? "Expand assembly" : "Collapse assembly"}
                    onClick={(event) => toggleAssembly(group.id, event)}
                    style={{
                      border: 0,
                      borderRight: "1px solid rgba(51,65,85,.55)",
                      background: "rgba(15,23,42,.72)",
                      color: "#93c5fd",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {collapsed ? "\u25B6" : "\u25BC"}
                  </button>

                  <button
                    type="button"
                    onClick={(event) => handleSelectAssembly(group, event)}
                    title="Select whole assembly"
                    style={{
                      border: 0,
                      background: assemblySelected
                        ? "rgba(37,99,235,.18)"
                        : "rgba(15,23,42,.62)",
                      color: "#e5eefc",
                      cursor: "pointer",
                      padding: "8px 9px",
                      textAlign: "left",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
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
                          fontSize: 10,
                          fontWeight: 900,
                          letterSpacing: ".04em",
                          textTransform: "uppercase",
                          color: assemblySelected ? "#bfdbfe" : "#dbeafe",
                        }}
                      >
                        {group.label}
                      </span>

                      {group.lockedCount > 0 ? (
                        <span
                          title={`${group.lockedCount} locked part${
                            group.lockedCount !== 1 ? "s" : ""
                          }`}
                          style={{
                            flexShrink: 0,
                            fontSize: 10,
                            opacity: 0.9,
                          }}
                        >
                          {"\uD83D\uDD12"}
                        </span>
                      ) : null}
                    </span>

                    <span
                      style={{
                        display: "block",
                        marginTop: 3,
                        color: "#93a8c4",
                        fontSize: 9,
                        lineHeight: 1.35,
                      }}
                    >
                      {formatAssemblyType(group.type)} {"\u00B7"} {group.items.length}{" "}
                      part{group.items.length !== 1 ? "s" : ""}
                      {group.lockedCount > 0
                        ? ` \u00B7 ${group.lockedCount} locked`
                        : ""}
                    </span>
                  </button>
                </div>

                {!collapsed ? (
                  <div
                    style={{
                      padding: "6px 6px 7px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      borderTop: "1px solid rgba(51,65,85,.45)",
                    }}
                  >
                    {group.items.map((item) =>
                      renderPartButton(item, { nested: true }),
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}

          {grouped.standalone.length ? (
            <div
              style={{
                borderTop: grouped.groups.length
                  ? "1px solid rgba(51,65,85,.58)"
                  : "none",
                paddingTop: grouped.groups.length ? 8 : 0,
              }}
            >
              <div
                style={{
                  ...S.floatingSectionLabel,
                  color: "#93c5fd",
                  marginBottom: 5,
                }}
              >
                Standalone {"\u00B7"} {grouped.standalone.length}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {grouped.standalone.map((item) =>
                  renderPartButton(item),
                )}
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