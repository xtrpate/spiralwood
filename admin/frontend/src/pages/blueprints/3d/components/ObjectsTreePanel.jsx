import React, { useMemo } from "react";
import S from "../../styles/blueprintStyles";
import { VIEWER_UI } from "../viewerUi";

export function ObjectsTreePanel({
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
