import React, { useEffect, useRef, useState } from "react";

// WISDOM ADMIN 3D CONTROLS COMPACT UI V1.0.4
// WISDOM ADMIN 3D CONTROLS KEYCAP POSITION FIX V1.0.5
// WISDOM ADMIN 3D CONTROLS CENTERED UI V1.0.6
// WISDOM ADMIN 3D CONTROLS ALIGNMENT ICON SIDE FIX V1.0.8

const keyBase = {
  minWidth: 22,
  height: 22,
  padding: "0 5px",
  border: "1px solid #cbd5e1",
  borderRadius: 3,
  background: "#ffffff",
  boxShadow: "0 1px 0 rgba(100,116,139,.45)",
  color: "#111827",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  fontSize: 9,
  fontWeight: 650,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

function getKeyMinWidth(value) {
  const text = String(value || "");

  if (text.length >= 5) return 39;
  if (text.length === 4) return 33;
  if (text.length === 3) return 28;
  return 22;
}

function Keycap({ children }) {
  return (
    <span
      aria-hidden="true"
      style={{
        ...keyBase,
        minWidth: getKeyMinWidth(children),
      }}
    >
      {children}
    </span>
  );
}

function KeyRow({ children }) {
  return (
    <div
      style={{
        minHeight: 24,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        flexWrap: "wrap",
      }}
    >
      {children}
    </div>
  );
}

function ShortcutKeys({ parts }) {
  return (
    <KeyRow>
      {parts.map((part, index) => (
        <React.Fragment key={`${part}-${index}`}>
          {index > 0 ? (
            <span
              aria-hidden="true"
              style={{
                color: "#94a3b8",
                fontSize: 8,
                fontWeight: 600,
              }}
            >
              +
            </span>
          ) : null}
          <Keycap>{part}</Keycap>
        </React.Fragment>
      ))}
    </KeyRow>
  );
}

function WasdKeys() {
  return (
    <div
      aria-hidden="true"
      style={{
        alignSelf: "center",
        display: "grid",
        gridTemplateColumns: "repeat(3, 22px)",
        gridTemplateRows: "22px 22px",
        gap: 2,
      }}
    >
      <span />
      <Keycap>W</Keycap>
      <span />
      <Keycap>A</Keycap>
      <Keycap>S</Keycap>
      <Keycap>D</Keycap>
    </div>
  );
}

function MouseControlIcon({ active = "left" }) {
  const leftActive = active === "left";
  const rightActive = active === "right";
  const wheelActive = active === "wheel";

  return (
    <div
      aria-hidden="true"
      style={{
        width: 24,
        height: 31,
        border: "1.4px solid #111827",
        borderRadius: "12px 12px 10px 10px",
        background: "#ffffff",
        position: "relative",
        boxSizing: "border-box",
        overflow: "hidden",
        flex: "0 0 auto",
        alignSelf: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "50%",
          height: 12,
          borderRight: "1px solid #cbd5e1",
          borderBottom: "1px solid #cbd5e1",
          background: leftActive ? "#111827" : "#ffffff",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "50%",
          height: 12,
          borderBottom: "1px solid #cbd5e1",
          background: rightActive ? "#111827" : "#ffffff",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 4,
          left: "50%",
          width: 3,
          height: 7,
          transform: "translateX(-50%)",
          border: `1px solid ${wheelActive ? "#111827" : "#64748b"}`,
          borderRadius: 3,
          background: wheelActive ? "#111827" : "#ffffff",
          zIndex: 2,
        }}
      />
    </div>
  );
}

function MouseWithKey({ keyName, active = "left" }) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: 31,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
      }}
    >
      <Keycap>{keyName}</Keycap>
      <span
        aria-hidden="true"
        style={{
          color: "#94a3b8",
          fontSize: 8,
          fontWeight: 600,
        }}
      >
        +
      </span>
      <MouseControlIcon active={active} />
    </div>
  );
}

function ControlItem({ keys, label }) {
  return (
    <div
      style={{
        minHeight: 64,
        padding: "7px 8px",
        border: "1px solid #e2e8f0",
        borderRadius: 3,
        background: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          minHeight: 31,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {keys}
      </div>

      <div
        style={{
          color: "#475569",
          fontSize: 8.5,
          fontWeight: 500,
          lineHeight: 1.2,
          textAlign: "center",
          width: "100%",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ControlSection({ title, children }) {
  return (
    <section>
      <div
        style={{
          marginBottom: 6,
          color: "#334155",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: ".06em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 6,
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function QuickControlsBar() {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const handleOutside = (event) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const stopWorkspaceInteraction = (event) => {
    event.stopPropagation();
  };

  return (
    <div
      ref={rootRef}
      onMouseDown={stopWorkspaceInteraction}
      onPointerDown={stopWorkspaceInteraction}
      style={{
        position: "absolute",
        top: 14,
        right: 390,
        zIndex: 1250,
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="wisdom-3d-controls-panel"
        onClick={() => setOpen((current) => !current)}
        style={{
          height: 30,
          padding: "0 10px",
          border: open
            ? "1px solid rgba(96,165,250,.88)"
            : "1px solid rgba(100,116,139,.72)",
          borderRadius: 2,
          background: open
            ? "rgba(23,40,68,.98)"
            : "rgba(7,14,26,.94)",
          color: "#e5edf8",
          boxShadow: "0 4px 12px rgba(0,0,0,.18)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 9,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          Controls
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 17,
            height: 17,
            border: "1px solid rgba(148,163,184,.72)",
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#bfdbfe",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
            flex: "0 0 auto",
          }}
        >
          ?
        </span>
      </button>

      {open ? (
        <div
          id="wisdom-3d-controls-panel"
          role="dialog"
          aria-label="3D Controls"
          style={{
            position: "absolute",
            top: 38,
            right: 0,
            width: 430,
            maxWidth: "calc(100vw - 40px)",
            maxHeight: "calc(100vh - 190px)",
            overflowY: "auto",
            padding: 13,
            border: "1px solid #cbd5e1",
            borderRadius: 3,
            background: "#ffffff",
            boxShadow: "0 18px 42px rgba(2,6,23,.28)",
            boxSizing: "border-box",
            color: "#111827",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              paddingBottom: 10,
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                3D Controls
              </div>

              <div
                style={{
                  marginTop: 3,
                  maxWidth: 318,
                  color: "#64748b",
                  fontSize: 9,
                  fontWeight: 400,
                  lineHeight: 1.35,
                }}
              >
                Click the 3D workspace first, then use these controls while editing.
              </div>
            </div>

            <button
              type="button"
              aria-label="Close controls"
              onClick={() => setOpen(false)}
              style={{
                width: 27,
                height: 27,
                padding: 0,
                border: "1px solid #cbd5e1",
                borderRadius: 2,
                background: "#f8fafc",
                color: "#475569",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              x
            </button>
          </div>

          <div
            style={{
              paddingTop: 11,
              display: "grid",
              gap: 13,
            }}
          >
            <ControlSection title="Camera">
              <ControlItem
                keys={<WasdKeys />}
                label="Move Camera"
              />
              <ControlItem
                keys={<ShortcutKeys parts={["Q", "E"]} />}
                label="Move Down / Up"
              />
              <ControlItem
                keys={<MouseControlIcon active="left" />}
                label="Left Drag - Rotate View"
              />
              <ControlItem
                keys={<MouseControlIcon active="wheel" />}
                label="Mouse Wheel - Zoom"
              />
              <ControlItem
                keys={<MouseControlIcon active="right" />}
                label="Right Drag - Pan View"
              />
            </ControlSection>

            <ControlSection title="Selection & Editing">
              <ControlItem
                keys={<MouseControlIcon active="left" />}
                label="Left Click - Select Part"
              />
              <ControlItem
                keys={<MouseWithKey keyName="Shift" active="left" />}
                label="Shift + Left Click - Multi-select"
              />
              <ControlItem
                keys={<Keycap>G</Keycap>}
                label="Move Part"
              />
              <ControlItem
                keys={<Keycap>R</Keycap>}
                label="Rotate Part"
              />
              <ControlItem
                keys={<Keycap>T</Keycap>}
                label="Resize Part"
              />
            </ControlSection>

            <ControlSection title="Actions">
              <ControlItem
                keys={<ShortcutKeys parts={["Ctrl", "Z"]} />}
                label="Undo"
              />
              <ControlItem
                keys={<Keycap>Del</Keycap>}
                label="Delete"
              />
              <ControlItem
                keys={<ShortcutKeys parts={["Ctrl", "D"]} />}
                label="Duplicate"
              />
              <ControlItem
                keys={<ShortcutKeys parts={["Ctrl", "L"]} />}
                label="Lock / Unlock"
              />
            </ControlSection>
          </div>
        </div>
      ) : null}
    </div>
  );
}