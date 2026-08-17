import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// WISDOM ADMIN 3D TOOLS GUIDE READABILITY V1.0.3

const guideSections = [
  {
    key: "build",
    title: "Build",
    summary: "Create furniture or add parts to a furniture design.",
    items: [
      ["Simple Table", "Build a basic table with a top, four legs, and four aprons."],
      ["Base Cabinet", "Build a cabinet that sits on the floor, with shelves and dividers."],
      ["Wall Cabinet", "Build a cabinet for wall placement, with shelves and dividers."],
      ["Tall Cabinet", "Build a full-height cabinet for storage or pantry use."],
      ["Wardrobe", "Build a wardrobe with open space and shelf sections."],
      ["Quick Cabinet", "Build a simple cabinet box with shelves and an optional divider."],
      ["Shelf Layout", "Add, replace, or remove evenly spaced shelves."],
      ["Interior Layout", "Change the dividers and shelves inside a cabinet."],
      ["Door Builder", "Add doors to a cabinet, bay, or shelf opening."],
      ["Drawer Builder", "Add complete drawers inside a cabinet."],
      ["Front Presets", "Apply a ready-made door and drawer-front layout."],
      ["Custom Fronts", "Choose door or drawer fronts for each cabinet area."],
      ["Leg Layout", "Add or reposition four furniture legs."],
      ["Apron / Rail Layout", "Add four support aprons around a four-leg layout."],
      ["Builder Helpers", "Quick tools for shelves, panels, doors, drawers, and fitting parts."],
    ],
  },
  {
    key: "arrange",
    title: "Arrange",
    summary: "Line up selected parts and set their spacing.",
    items: [
      ["Align", "Line up selected parts on the X, Y, or Z direction."],
      ["Flush Snap", "Move selected parts to the outside edge of the selection."],
      ["Anchor Mode", "Choose what stays in place while parts are arranged."],
      ["Distribute", "Space three or more selected parts evenly."],
      ["Equal Gap", "Use the same space between selected parts."],
      ["Rows / Stacks", "Arrange parts in a clean row or stack."],
    ],
  },
  {
    key: "resize",
    title: "Resize",
    summary: "Change furniture size while keeping connected parts together.",
    items: [
      ["Width / Height / Depth", "Choose which furniture size you want to change."],
      ["Resize Side", "Choose which side moves, or keep the center fixed."],
      ["Preview", "Check the new size before saving the change."],
      ["Apply", "Use the new size on the selected furniture."],
    ],
  },
  {
    key: "copy",
    title: "Copy",
    summary: "Make copies of selected parts or complete furniture.",
    items: [
      ["Mirror Duplicate", "Create a flipped copy along the X or Z direction."],
      ["Assembly", "Select or copy the complete furniture assembly."],
      ["Repeat / Array", "Create several copies using count and spacing."],
    ],
  },
  {
    key: "check",
    title: "Check",
    summary: "Review the design before it is used for production.",
    items: [
      ["Production Readiness", "Check the design for common problems before production."],
      ["Validation Summary", "See the number of parts, errors, and warnings found."],
      ["Review Notices", "Read the items that need attention."],
      ["Final Production Review", "Add the reviewer, date, and final production notes."],
    ],
  },
];

function ToolItem({ name, description }) {
  return (
    <div
      style={{
        minHeight: 76,
        padding: "12px 13px",
        border: "1px solid rgba(71,85,105,.6)",
        borderRadius: 2,
        background: "#0b1424",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          color: "#f1f5f9",
          fontSize: 12.5,
          fontWeight: 650,
          lineHeight: 1.35,
        }}
      >
        {name}
      </div>

      <div
        style={{
          marginTop: 6,
          color: "#aab8ca",
          fontSize: 11,
          fontWeight: 400,
          lineHeight: 1.55,
        }}
      >
        {description}
      </div>
    </div>
  );
}

function ToolsGuideModal({ activeKey, setActiveKey, onClose }) {
  const activeSection =
    guideSections.find((section) => section.key === activeKey) ||
    guideSections[0];

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        background: "rgba(2,6,23,.58)",
        backdropFilter: "blur(1px)",
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tools Guide"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(880px, calc(100vw - 52px))",
          maxHeight: "calc(100vh - 60px)",
          display: "flex",
          flexDirection: "column",
          border: "1px solid rgba(100,116,139,.8)",
          borderRadius: 3,
          background: "#07101d",
          boxShadow: "0 24px 70px rgba(0,0,0,.45)",
          color: "#e5edf8",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 20px 16px",
            borderBottom: "1px solid rgba(71,85,105,.65)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#f8fafc",
                lineHeight: 1.2,
              }}
            >
              Tools Guide
            </div>

            <div
              style={{
                marginTop: 7,
                maxWidth: 660,
                color: "#aab8ca",
                fontSize: 11.5,
                fontWeight: 400,
                lineHeight: 1.6,
              }}
            >
              Choose a tool group below to learn what each feature does.
              Build can create furniture. Most other tools need a selected
              editable part.
            </div>
          </div>

          <button
            type="button"
            aria-label="Close tools guide"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              padding: 0,
              border: "1px solid rgba(100,116,139,.72)",
              borderRadius: 2,
              background: "#0b1424",
              color: "#cbd5e1",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 17,
              fontWeight: 500,
              cursor: "pointer",
              flex: "0 0 auto",
            }}
          >
            x
          </button>
        </div>

        <div
          style={{
            padding: "13px 20px",
            borderBottom: "1px solid rgba(71,85,105,.55)",
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 8,
            background: "#091423",
          }}
        >
          {guideSections.map((section) => {
            const active = section.key === activeSection.key;

            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveKey(section.key)}
                style={{
                  minHeight: 40,
                  padding: "7px 10px",
                  border: active
                    ? "1px solid rgba(96,165,250,.9)"
                    : "1px solid rgba(71,85,105,.65)",
                  borderRadius: 2,
                  background: active ? "#172844" : "#0b1424",
                  color: active ? "#f8fafc" : "#b1bfd0",
                  fontSize: 11.5,
                  fontWeight: active ? 650 : 500,
                  cursor: "pointer",
                }}
              >
                {section.title}
              </button>
            );
          })}
        </div>

        <div
          style={{
            padding: 20,
            overflowY: "auto",
            flex: "1 1 auto",
          }}
        >
          <div
            style={{
              marginBottom: 14,
              padding: "12px 13px",
              border: "1px solid rgba(96,165,250,.36)",
              borderRadius: 2,
              background: "rgba(23,40,68,.48)",
            }}
          >
            <div
              style={{
                color: "#dbeafe",
                fontSize: 14.5,
                fontWeight: 700,
                lineHeight: 1.25,
              }}
            >
              {activeSection.title}
            </div>

            <div
              style={{
                marginTop: 5,
                color: "#a7b5c7",
                fontSize: 11,
                fontWeight: 400,
                lineHeight: 1.55,
              }}
            >
              {activeSection.summary}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {activeSection.items.map(([name, description]) => (
              <ToolItem
                key={`${activeSection.key}-${name}`}
                name={name}
                description={description}
              />
            ))}
          </div>

          <div
            style={{
              marginTop: 15,
              paddingTop: 12,
              borderTop: "1px solid rgba(71,85,105,.55)",
              color: "#97a7ba",
              fontSize: 10.5,
              fontWeight: 400,
              lineHeight: 1.55,
            }}
          >
            Quick steps: choose a tool, select a part when needed, enter the
            measurements, then build, preview, or apply.
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ToolsGuide() {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState("build");

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setOpen(true)}
        style={{
          minHeight: 27,
          padding: "0 8px",
          border: open
            ? "1px solid rgba(96,165,250,.78)"
            : "1px solid rgba(71,85,105,.72)",
          borderRadius: 2,
          background: open ? "#172844" : "#0b1424",
          color: "#dbe7f7",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          fontSize: 9,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span>Guide</span>
        <span
          aria-hidden="true"
          style={{
            width: 15,
            height: 15,
            border: "1px solid rgba(148,163,184,.72)",
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#bfdbfe",
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          ?
        </span>
      </button>

      {open && typeof document !== "undefined" ? (
        <ToolsGuideModal
          activeKey={activeKey}
          setActiveKey={setActiveKey}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}