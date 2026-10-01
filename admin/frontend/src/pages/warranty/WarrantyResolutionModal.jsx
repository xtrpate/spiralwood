import React, { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import "./WarrantyResolutionModal.css";

const LABELS = {
  repair: "Repair",
  part_replacement: "Part Replacement",
  full_product_replacement: "Full Product Replacement",
};

const MAX_WARRANTY_FULFILLMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_WARRANTY_RESOLUTION_NOTES_LENGTH = 4000;
const WARRANTY_FULFILLMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,.jfif,application/pdf";
const WARRANTY_FULFILLMENT_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "jfif",
  "png",
  "webp",
  "pdf",
]);

export default function WarrantyResolutionModal({ row, onClose, onSubmit }) {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolutionType, setResolutionType] = useState("repair");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("warehouse");
  const [disposition, setDisposition] = useState("not_returned");
  const [file, setFile] = useState(null);
  const [search, setSearch] = useState("");
  const [usage, setUsage] = useState({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.get(`/warranty/${row.id}/resolution-options`)
      .then(({ data }) => { if (active) setOptions(data); })
      .catch((err) => { if (active) setError(err?.response?.data?.message || "Failed to load resolution inventory."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [row.id]);

  const materials = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = Array.isArray(options?.materials) ? options.materials : [];
    if (!term) return rows;

    return rows.filter((m) => {
      const matchesSearch = `${m.name} ${m.unit}`
        .toLowerCase()
        .includes(term);
      const hasSelectedQuantity =
        String(usage[m.id] ?? "").trim() !== "";
      return matchesSearch || hasSelectedQuantity;
    });
  }, [options, search, usage]);

  const readyMade = options?.claim?.inventory_kind === "ready_made";
  const materialsRequired = resolutionType === "part_replacement" || (resolutionType === "full_product_replacement" && !readyMade);
  const showMaterials = resolutionType !== "full_product_replacement" || !readyMade;
  const selectedMaterials = Object.entries(usage)
    .map(([materialId, quantity]) => ({ material_id: Number(materialId), quantity: Number(quantity) }))
    .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);

  const handleResolutionChange = (event) => {
    const nextResolution = event.target.value;
    setResolutionType(nextResolution);
    setError("");
    if (readyMade && nextResolution === "full_product_replacement") {
      setUsage({});
    }
  };

  const handleProofChange = (event) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) {
      setFile(null);
      return;
    }

    const extension = String(selected.name || "")
      .split(".")
      .pop()
      .toLowerCase();

    if (!WARRANTY_FULFILLMENT_EXTENSIONS.has(extension)) {
      event.target.value = "";
      setFile(null);
      setError(
        "Fulfillment proof must be JPG, JPEG, JFIF, PNG, WEBP, or PDF.",
      );
      return;
    }

    if (selected.size > MAX_WARRANTY_FULFILLMENT_FILE_SIZE_BYTES) {
      event.target.value = "";
      setFile(null);
      setError("Fulfillment proof must be 10 MB or smaller.");
      return;
    }

    setError("");
    setFile(selected);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!file) return setError("Fulfillment proof is required.");
    if (materialsRequired && selectedMaterials.length === 0) return setError("Add at least one material or part actually used.");
    if (readyMade && resolutionType === "full_product_replacement") {
      const stock = options?.ready_made_stock || {};
      const available = source === "warehouse" ? Number(stock.warehouse_stock || 0) : Number(stock.display_stock || 0);
      if (Number(options?.claim?.claim_quantity || 1) > available) return setError(`Insufficient ${source === "warehouse" ? "Warehouse" : "Sales / Display"} stock.`);
    }
    setBusy(true);
    try {
      await onSubmit({
        id: row.id,
        file,
        resolution_type: resolutionType,
        resolution_notes: notes,
        replacement_source: readyMade && resolutionType === "full_product_replacement" ? source : "",
        return_disposition: resolutionType === "full_product_replacement" ? disposition : "not_returned",
        materials:
          readyMade && resolutionType === "full_product_replacement"
            ? []
            : selectedMaterials,
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to resolve warranty claim.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrm-overlay" role="presentation">
      <form className="wrm-modal" onSubmit={submit}>
        <div className="wrm-head">
          <div>
            <div className="wrm-eyebrow">Warranty Resolution</div>
            <h3>Resolve & Fulfill Claim</h3>
            <p>{row.product_name} · Qty {Number(row.claim_quantity || 1)} · {row.order_number || `Order #${row.order_id}`}</p>
          </div>
          <button type="button" className="wrm-close" onClick={onClose} disabled={busy}>×</button>
        </div>

        {loading ? <div className="wrm-state">Loading inventory…</div> : error && !options ? <div className="wrm-error">{error}</div> : (
          <div className="wrm-body">
            <label className="wrm-field">
              <span>Resolution *</span>
              <select value={resolutionType} onChange={handleResolutionChange}>
                {Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            {readyMade && resolutionType === "full_product_replacement" && (
              <div className="wrm-grid2">
                <label className="wrm-field">
                  <span>Replacement source *</span>
                  <select value={source} onChange={(e) => setSource(e.target.value)}>
                    <option value="warehouse">Warehouse — {options?.ready_made_stock?.warehouse_stock ?? 0} available</option>
                    <option value="display">Sales / Display — {options?.ready_made_stock?.display_stock ?? 0} available</option>
                  </select>
                </label>
                <label className="wrm-field">
                  <span>Returned item disposition *</span>
                  <select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                    <option value="not_returned">Not returned</option>
                    <option value="for_inspection">For inspection — no stock increase</option>
                    <option value="damaged_unusable">Damaged / unusable — no stock increase</option>
                    <option value="usable_returned">Inspected usable — return to Warehouse</option>
                  </select>
                </label>
              </div>
            )}

            {!readyMade && resolutionType === "full_product_replacement" && (
              <div className="wrm-info">Custom furniture replacement uses raw materials only. No ready-made finished-product stock will be deducted.</div>
            )}

            {showMaterials && (
              <div className="wrm-materials">
                <div className="wrm-material-head">
                  <div><strong>Materials / parts used{materialsRequired ? " *" : ""}</strong><small>Available already excludes stock reserved for custom orders.</small></div>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search materials…" />
                </div>
                <div className="wrm-material-list">
                  {materials.map((m) => (
                    <div className="wrm-material-row" key={m.id}>
                      <div><strong>{m.name}</strong><small>On hand {m.on_hand_quantity} · Reserved {m.reserved_quantity} · Available {m.available_quantity} {m.unit || "unit"}</small></div>
                      <input
                        type="number"
                        min={["meter", "kg", "liter", "gallon"].includes(String(m.unit || "").toLowerCase()) ? "0.01" : "1"}
                        max={m.available_quantity}
                        step={["meter", "kg", "liter", "gallon"].includes(String(m.unit || "").toLowerCase()) ? "0.01" : "1"}
                        value={usage[m.id] ?? ""}
                        onChange={(e) => setUsage((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        placeholder="Qty"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="wrm-field">
              <span>Resolution notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={MAX_WARRANTY_RESOLUTION_NOTES_LENGTH}
                placeholder="What was repaired/replaced? Optional notes for traceability."
              />
            </label>

            <label className="wrm-field">
              <span>Fulfillment proof *</span>
              <input
                type="file"
                accept={WARRANTY_FULFILLMENT_ACCEPT}
                onChange={handleProofChange}
              />
              <small>JPG, JPEG, JFIF, PNG, WEBP, or PDF - max 10 MB</small>
            </label>

            {error && <div className="wrm-error">{error}</div>}
          </div>
        )}

        <div className="wrm-actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="wrm-primary" disabled={busy || loading || !options}>{busy ? "Resolving…" : "Resolve & Fulfill"}</button>
        </div>
      </form>
    </div>
  );
}
