import React, { useEffect } from "react";
import { buildCustomerPartSchedule, summarizeCustomerPartQuantities, formatCustomerPartThickness } from "./customerPartSchedule.mjs";

// C3-FIX1: Display-only projection of the saved custom Blueprint component snapshot.
// This dialog never edits stored geometry, quantities, material costs, or cart state.
const mm = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number} mm` : "—";
};
const cell = { padding: "9px 10px", borderBottom: "1px solid #e4e4e7", textAlign: "left", verticalAlign: "top", whiteSpace: "nowrap" };

export default function CartPartScheduleDialog({ item, onClose }) {
  useEffect(() => {
    if (!item) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [item, onClose]);

  if (!item) return null;
  const editor = item.editor_snapshot && typeof item.editor_snapshot === "object"
    ? item.editor_snapshot
    : (() => {
        try { return JSON.parse(item.editor_snapshot || "{}"); }
        catch { return {}; }
      })();
  const savedParts = Array.isArray(editor?.components) ? editor.components : [];
  const furnitureQty = Number(item.quantity || 1);
  const rows = buildCustomerPartSchedule(savedParts, furnitureQty);
  const summary = summarizeCustomerPartQuantities(rows);

  return (
    <div className="fm-modal-overlay" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Parts and Measurements"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(1100px, calc(100vw - 32px))", maxWidth: "calc(100vw - 32px)",
          maxHeight: "min(86vh, 820px)", overflow: "hidden", background: "#fff",
          border: "1px solid #dedede", display: "flex", flexDirection: "column",
          boxShadow: "0 22px 60px rgba(0,0,0,.24)" }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16,
          alignItems: "start", padding: "16px 18px", borderBottom: "1px solid #e4e4e7" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17 }}>Parts &amp; Measurements</h2>
            <p style={{ margin: "5px 0 0", fontSize: 12, color: "#52525b" }}>
              {item.base_blueprint_title || item.product_name || "Custom Design"} ·
              {` ${summary.entries} parts · ${furnitureQty} furniture unit${furnitureQty === 1 ? "" : "s"}`}
              {` · ${summary.totalPieces} total pieces`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close parts"
            style={{ background: "#fff", border: "1px solid #d4d4d8", padding: "6px 12px", cursor: "pointer" }}>
            Close
          </button>
        </header>
        <div style={{ padding: "14px 16px", overflow: "auto" }}>
          {rows.length ? (
            <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#f4f4f5" }}>
                <tr>{["Part / Code", "Qty / Unit", "Total Qty", "Width", "Height", "Depth", "Thickness / Section", "Material", "Requested Wood"].map((label) => (
                  <th key={label} style={cell} scope="col">{label}</th>
                ))}</tr>
              </thead>
              <tbody>{rows.map((part) => (
                <tr key={`${part.key}-${part.index}`}>
                  <td style={cell}>
                    <strong>{part.label}</strong>
                    {part.code ? <div style={{ color: "#71717a", marginTop: 2 }}>{part.code}</div> : null}
                  </td>
                  <td style={cell}>{part.quantityPerUnit}</td>
                  <td style={cell}>{part.totalQuantity}</td>
                  <td style={cell}>{mm(part.width)}</td>
                  <td style={cell}>{mm(part.height)}</td>
                  <td style={cell}>{mm(part.depth)}</td>
                  <td style={cell}>{formatCustomerPartThickness(part)}</td>
                  <td style={cell}>{part.material || "—"}</td>
                  <td style={cell}>{part.requestedWood || "Original (no wood request)"}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <p style={{ color: "#9a3412", fontSize: 13 }}>
              No saved furniture parts found. Review the custom design before checkout.
            </p>
          )}
        </div>
        <footer style={{ padding: "12px 18px", borderTop: "1px solid #e4e4e7", fontSize: 12, color: "#52525b" }}>
          Dimensions and quantities are from your saved design. Final materials and quotation require Admin verification.
        </footer>
      </section>
    </div>
  );
}
