import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";

const PAGE_SIZE = 30;

const SOURCE_LABELS = {
  blueprint_production: "Blueprint Production",
  build_production: "BOM Material Use",
  product_production: "Finished Product Production",
  order_fulfillment: "Order Fulfillment",
  manual: "Manual Movement",
};

const SOURCE_BADGES = {
  blueprint_production: ["#eff6ff", "#1d4ed8", "#bfdbfe"],
  build_production: ["#f5f3ff", "#6d28d9", "#ddd6fe"],
  product_production: ["#ecfdf5", "#166534", "#bbf7d0"],
  order_fulfillment: ["#fff7ed", "#9a3412", "#fed7aa"],
  manual: ["#f4f4f5", "#3f3f46", "#d4d4d8"],
};

const EMPTY_SUMMARY = {
  record_count: 0,
  in_count: 0,
  out_count: 0,
  adjustment_count: 0,
  return_count: 0,
  blueprint_production_count: 0,
  build_production_count: 0,
  order_fulfillment_count: 0,
  manual_count: 0,
};

const formatQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-PH", { maximumFractionDigits: 4 });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function StockMovementPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    type: "",
    source: "",
    from: "",
    to: "",
    page: 1,
  });
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    material_id: "",
    product_id: "",
    type: "in",
    quantity: "",
    reference: "",
    notes: "",
  });
  const [rawMats, setRawMats] = useState([]);
  const [products, setProducts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/movements", {
        params: { ...filters, limit: PAGE_SIZE },
      });
      setRows(data.rows || []);
      setTotal(Number(data.total || 0));
      setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get("/inventory/raw", { params: { limit: 1000, archive_status: "active" } })
      .then((r) => setRawMats(r.data.rows || []));
    api
      .get("/products", { params: { limit: 1000 } })
      .then((r) => setProducts(r.data.products || []));
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const summaryCards = useMemo(
    () => [
      ["Filtered Records", summary.record_count],
      ["Blueprint Production", summary.blueprint_production_count],
      ["Build Production", summary.build_production_count],
      ["Order-linked", summary.order_fulfillment_count],
      ["Manual", summary.manual_count],
    ],
    [summary],
  );

  const resetForm = () => {
    setForm({
      material_id: "",
      product_id: "",
      type: "in",
      quantity: "",
      reference: "",
      notes: "",
    });
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      type: "",
      source: "",
      from: "",
      to: "",
      page: 1,
    });
  };

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  };

  const handleMaterialChange = (value) => {
    setForm((current) => ({
      ...current,
      material_id: value,
      product_id: value ? "" : current.product_id,
    }));
  };

  const handleProductChange = (value) => {
    setForm((current) => ({
      ...current,
      product_id: value,
      material_id: value ? "" : current.material_id,
    }));
  };

  const isMaterialTarget = Boolean(form.material_id);
  const isProductTarget = Boolean(form.product_id);
  const selectedMaterial = useMemo(
    () =>
      rawMats.find(
        (material) => Number(material.id) === Number(form.material_id),
      ) || null,
    [rawMats, form.material_id],
  );
  const selectedOnHand = Number(
    selectedMaterial?.on_hand_quantity ?? selectedMaterial?.quantity ?? 0,
  );
  const selectedReserved = Number(selectedMaterial?.reserved_quantity || 0);
  const selectedAvailable = Number(
    selectedMaterial?.available_quantity ??
      Math.max(0, selectedOnHand - selectedReserved),
  );
  const protectsReservedStock =
    isMaterialTarget &&
    (form.type === "out" || form.type === "adjustment");

  const helperMessage =
    isProductTarget && form.type === "in"
      ? "Finished product production: product stock will increase, but only unreserved BOM raw materials may be deducted."
      : isProductTarget && form.type === "out"
        ? "Finished product stock-out: the selected product stock will decrease."
        : isMaterialTarget && form.type === "in"
          ? "Raw material stock-in: use this for supplier deliveries or restocking. Pending blueprint needs may be recovered automatically."
          : isMaterialTarget && form.type === "return"
            ? "Returned raw material increases physical stock and may recover pending blueprint needs."
            : protectsReservedStock
              ? `This movement may use only ${formatQuantity(
                  selectedAvailable,
                )} ${selectedMaterial?.unit || "unit"} of unreserved stock.`
              : "Select one target only: a raw material or a finished product.";

  const handleSave = async (event) => {
    event.preventDefault();

    if (!form.material_id && !form.product_id) {
      toast.error("Select a raw material or finished product.");
      return;
    }

    const requestedQuantity = Number(form.quantity);
    if (
      protectsReservedStock &&
      Number.isFinite(requestedQuantity) &&
      requestedQuantity > selectedAvailable + 0.0000001
    ) {
      toast.error(
        `Only ${formatQuantity(selectedAvailable)} ${
          selectedMaterial?.unit || "unit"
        } is available. Reserved blueprint stock cannot be withdrawn.`,
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        material_id: form.material_id || null,
        product_id: form.product_id || null,
        type: form.type,
        quantity: Number(form.quantity),
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
      };

      const { data } = await api.post("/inventory/movements", payload);
      toast.success(data?.message || "Stock movement recorded.");
      setModal(false);
      resetForm();
      await load();
    } catch (error) {
      // The global API interceptor displays the server error message.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={header}>
        <div>
          <h1 style={title}>Stock Movement Tracking</h1>
          <p style={subtitle}>
            This report records physical stock changes. Blueprint reservation,
            pending need, and release events do not create stock movements;
            blueprint materials appear here only when production consumes them.
          </p>
        </div>
        <button onClick={() => setModal(true)} style={btnPrimary}>
          + Record Movement
        </button>
      </div>

      <div style={summaryGrid}>
        {summaryCards.map(([label, value]) => (
          <div key={label} style={summaryCard}>
            <div style={summaryLabel}>{label}</div>
            <div style={summaryValue}>{Number(value || 0).toLocaleString("en-PH")}</div>
          </div>
        ))}
      </div>

      <div style={filterCard}>
        <input
          placeholder="Search material, product, order, reference, customer..."
          value={filters.search}
          onChange={(event) => updateFilter("search", event.target.value)}
          style={{ ...inputSm, minWidth: 300, flex: "1 1 300px" }}
        />
        <select
          value={filters.type}
          onChange={(event) => updateFilter("type", event.target.value)}
          style={inputSm}
        >
          <option value="">All Types</option>
          <option value="in">In</option>
          <option value="out">Out</option>
          <option value="adjustment">Adjustment</option>
          <option value="return">Return</option>
        </select>
        <select
          value={filters.source}
          onChange={(event) => updateFilter("source", event.target.value)}
          style={inputSm}
        >
          <option value="">All Sources</option>
          <option value="blueprint_production">Blueprint Production</option>
          <option value="build_production">BOM Material Use</option>
          <option value="product_production">Finished Product Production</option>
          <option value="order_fulfillment">Order Fulfillment</option>
          <option value="manual">Manual Movement</option>
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(event) => updateFilter("from", event.target.value)}
          style={inputSm}
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(event) => updateFilter("to", event.target.value)}
          style={inputSm}
          aria-label="To date"
        />
        <button onClick={clearFilters} style={btnGhost}>
          Clear
        </button>
      </div>

      <div style={tableCard}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Date",
                "Type",
                "Source",
                "Material / Product",
                "Qty",
                "Order",
                "Reference",
                "Notes",
                "By",
              ].map((heading) => (
                <th key={heading} style={th}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={emptyCell}>Loading stock movements...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={emptyCell}>
                  No stock movements found for the selected filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const source = row.movement_source || "manual";
                const [sourceBg, sourceColor, sourceBorder] =
                  SOURCE_BADGES[source] || SOURCE_BADGES.manual;
                const isPositive = row.type === "in" || row.type === "return";
                const itemName = row.material_name || row.product_name || "—";
                const unit = row.material_unit ? ` ${row.material_unit}` : "";

                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={{ ...td, color: "#71717a", whiteSpace: "nowrap" }}>
                      {formatDateTime(row.created_at)}
                    </td>
                    <td style={td}>
                      <span style={typeBadge}>{String(row.type || "").replaceAll("_", " ")}</span>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          ...sourceBadge,
                          background: sourceBg,
                          color: sourceColor,
                          border: `1px solid ${sourceBorder}`,
                        }}
                      >
                        {SOURCE_LABELS[source] || "Manual Movement"}
                      </span>
                      {row.reservation_status && (
                        <div style={subMeta}>
                          Reservation: {String(row.reservation_status).replaceAll("_", " ")}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 190 }}>
                      <div style={{ fontWeight: 700, color: "#0a0a0a" }}>{itemName}</div>
                      {row.product_name && row.material_name && (
                        <div style={subMeta}>For: {row.product_name}</div>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontWeight: 800,
                        color: isPositive ? "#166534" : "#991b1b",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isPositive ? "+" : "-"}
                      {formatQuantity(row.quantity)}{unit}
                    </td>
                    <td style={{ ...td, minWidth: 150 }}>
                      {row.order_id ? (
                        <button
                          onClick={() => navigate(`/admin/orders/${row.order_id}`)}
                          style={orderLink}
                        >
                          {row.order_number || `Order #${row.order_id}`}
                        </button>
                      ) : (
                        "—"
                      )}
                      {row.customer_name && <div style={subMeta}>{row.customer_name}</div>}
                      {row.order_status && (
                        <div style={subMeta}>
                          {row.order_status} · {row.payment_status || "payment unknown"}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 170 }}>
                      {row.reservation_id && (
                        <div style={{ fontWeight: 700 }}>
                          Reservation #{row.reservation_id}
                        </div>
                      )}
                      <div style={referenceText}>{row.reference || "—"}</div>
                    </td>
                    <td style={{ ...td, minWidth: 240, color: "#52525b" }}>
                      {row.notes || "—"}
                    </td>
                    <td style={{ ...td, color: "#71717a", whiteSpace: "nowrap" }}>
                      {row.created_by_name || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={paginationRow}>
        <span style={{ fontSize: 12, color: "#71717a" }}>
          Page {filters.page} of {pageCount} · {total.toLocaleString("en-PH")} records
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            disabled={filters.page <= 1}
            onClick={() =>
              setFilters((current) => ({ ...current, page: current.page - 1 }))
            }
            style={filters.page <= 1 ? btnDisabled : btnGhost}
          >
            Previous
          </button>
          <button
            disabled={filters.page >= pageCount}
            onClick={() =>
              setFilters((current) => ({ ...current, page: current.page + 1 }))
            }
            style={filters.page >= pageCount ? btnDisabled : btnGhost}
          >
            Next
          </button>
        </div>
      </div>

      {modal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3 style={modalTitle}>Record Stock Movement</h3>
            <form onSubmit={handleSave}>
              <div style={fieldGroup}>
                <label style={label}>Movement Type *</label>
                <select
                  required
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type: event.target.value }))
                  }
                  style={inputFull}
                >
                  <option value="in">In – Delivery / Production</option>
                  <option value="out">Out – Sales / Usage</option>
                  <option value="adjustment">Adjustment – Downward stock correction</option>
                  <option value="return">Return – Stock returned</option>
                </select>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Raw Material</label>
                <select
                  value={form.material_id}
                  onChange={(event) => handleMaterialChange(event.target.value)}
                  style={inputFull}
                >
                  <option value="">None</option>
                  {rawMats.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedMaterial && (
                <div style={availabilityBox}>
                  <div>
                    <span style={availabilityLabel}>On Hand</span>
                    <strong>
                      {formatQuantity(selectedOnHand)} {selectedMaterial.unit}
                    </strong>
                  </div>
                  <div>
                    <span style={availabilityLabel}>Reserved</span>
                    <strong>
                      {formatQuantity(selectedReserved)} {selectedMaterial.unit}
                    </strong>
                  </div>
                  <div>
                    <span style={availabilityLabel}>Available</span>
                    <strong>
                      {formatQuantity(selectedAvailable)} {selectedMaterial.unit}
                    </strong>
                  </div>
                </div>
              )}

              <div style={fieldGroup}>
                <label style={label}>Product / Build Material</label>
                <select
                  value={form.product_id}
                  onChange={(event) => handleProductChange(event.target.value)}
                  style={inputFull}
                >
                  <option value="">None</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={helperBox}>{helperMessage}</div>

              <div style={fieldGroup}>
                <label style={label}>Quantity *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  max={
                    protectsReservedStock
                      ? Math.max(0, selectedAvailable)
                      : undefined
                  }
                  value={form.quantity}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, quantity: event.target.value }))
                  }
                  style={inputFull}
                />
              </div>

              <div style={fieldGroup}>
                <label style={label}>Reference</label>
                <input
                  value={form.reference}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reference: event.target.value }))
                  }
                  placeholder="PO number, delivery receipt, adjustment reference..."
                  maxLength={100}
                  style={inputFull}
                />
              </div>

              <div style={{ ...fieldGroup, marginBottom: 20 }}>
                <label style={label}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  rows={3}
                  style={{ ...inputFull, resize: "vertical" }}
                />
              </div>

              <div style={modalActions}>
                <button
                  type="button"
                  onClick={() => {
                    setModal(false);
                    resetForm();
                  }}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const header = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 18,
};
const title = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};
const subtitle = {
  margin: "6px 0 0",
  maxWidth: 850,
  fontSize: 12,
  lineHeight: 1.5,
  color: "#71717a",
};
const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(135px, 1fr))",
  gap: 10,
  marginBottom: 14,
};
const summaryCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: "13px 15px",
};
const summaryLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 0.7,
};
const summaryValue = {
  marginTop: 5,
  fontSize: 21,
  fontWeight: 800,
  color: "#18181b",
};
const filterCard = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  flexWrap: "wrap",
  padding: 12,
  marginBottom: 14,
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
};
const tableCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  overflowX: "auto",
};
const th = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  whiteSpace: "nowrap",
};
const td = {
  padding: "13px 14px",
  color: "#18181b",
  verticalAlign: "top",
};
const emptyCell = {
  ...td,
  padding: 34,
  textAlign: "center",
  color: "#71717a",
};
const typeBadge = {
  display: "inline-block",
  padding: "3px 9px",
  borderRadius: 12,
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "capitalize",
  whiteSpace: "nowrap",
};
const sourceBadge = {
  display: "inline-block",
  padding: "3px 9px",
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};
const subMeta = {
  marginTop: 4,
  fontSize: 10,
  color: "#71717a",
  textTransform: "capitalize",
};
const referenceText = {
  marginTop: 3,
  fontSize: 11,
  color: "#52525b",
  wordBreak: "break-word",
};
const orderLink = {
  padding: 0,
  background: "none",
  border: "none",
  color: "#18181b",
  fontSize: 12,
  fontWeight: 800,
  textDecoration: "underline",
  cursor: "pointer",
  textAlign: "left",
};
const paginationRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 14,
};
const inputSm = {
  padding: "8px 11px",
  border: "1px solid #e4e4e7",
  borderRadius: 7,
  background: "#fff",
  color: "#18181b",
  fontSize: 12,
  outline: "none",
};
const inputFull = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  color: "#18181b",
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
};
const btnPrimary = {
  padding: "9px 16px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const btnGhost = {
  padding: "8px 13px",
  background: "#fff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const btnDisabled = {
  ...btnGhost,
  color: "#a1a1aa",
  background: "#f4f4f5",
  cursor: "not-allowed",
};
const overlay = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,.55)",
  padding: 20,
};
const modalBox = {
  width: 440,
  maxWidth: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: 26,
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 20px 60px rgba(0,0,0,.25)",
};
const modalTitle = {
  margin: "0 0 20px",
  fontSize: 18,
  fontWeight: 800,
  color: "#0a0a0a",
};
const fieldGroup = { marginBottom: 12 };
const label = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#52525b",
};
const availabilityBox = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: -4,
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1e3a8a",
  fontSize: 12,
};
const availabilityLabel = {
  display: "block",
  marginBottom: 3,
  color: "#64748b",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
const helperBox = {
  marginBottom: 16,
  padding: "11px 13px",
  borderRadius: 8,
  background: "#f4f4f5",
  border: "1px solid #e4e4e7",
  color: "#52525b",
  fontSize: 12,
  lineHeight: 1.5,
};
const modalActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};
