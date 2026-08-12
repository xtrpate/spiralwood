import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";

const PAGE_SIZE = 30;

// WISDOM STOCK MOVEMENTS UI POLISH V1
const SOURCE_LABELS = {
  blueprint_production: "Blueprint production",
  build_production: "Build production",
  product_production: "Product production",
  order_fulfillment: "Order fulfillment",
  manual: "Manual entry",
};

const MOVEMENT_LABELS = {
  in: "Stock in",
  out: "Stock out",
  adjustment: "Adjustment",
  return: "Return",
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
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
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
  const [itemKind, setItemKind] = useState("material");
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
      .get("/inventory/raw", {
        params: { limit: 1000, archive_status: "active" },
      })
      .then((r) => setRawMats(r.data.rows || []));
    api
      .get("/products", { params: { limit: 1000 } })
      .then((r) => setProducts(r.data.products || []));
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const summaryCards = useMemo(
    () => [
      ["Records shown", summary.record_count],
      ["Blueprint production", summary.blueprint_production_count],
      ["Build production", summary.build_production_count],
      ["Order fulfillment", summary.order_fulfillment_count],
      ["Manual entries", summary.manual_count],
    ],
    [summary],
  );

  const resetForm = () => {
    setItemKind("material");
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

  const handleItemKindChange = (value) => {
    setItemKind(value);
    setForm((current) => ({
      ...current,
      material_id: "",
      product_id: "",
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
    isMaterialTarget && (form.type === "out" || form.type === "adjustment");

  const helperMessage =
    isProductTarget && form.type === "in"
      ? "Stock in adds the selected item to inventory. Existing production rules remain unchanged."
      : isProductTarget && form.type === "out"
        ? "Stock out removes the selected item from inventory."
        : isMaterialTarget && form.type === "in"
          ? "Use Stock in for supplier deliveries or restocking."
          : isMaterialTarget && form.type === "return"
            ? "Use Return when material is placed back into inventory."
            : protectsReservedStock
              ? `Available for this movement: ${formatQuantity(
                  selectedAvailable,
                )} ${selectedMaterial?.unit || "unit"}. Reserved blueprint stock cannot be withdrawn.`
              : itemKind === "material"
                ? "Choose a raw material to continue."
                : "Choose a product or build material to continue.";

  const handleSave = async (event) => {
    event.preventDefault();

    if (!form.material_id && !form.product_id) {
      toast.error("Select an inventory item.");
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
          <h1 style={title}>Stock Movements</h1>
          <p style={subtitle}>
            Review physical stock in and stock out records for materials and products.
          </p>
        </div>
        <button onClick={() => setModal(true)} style={btnPrimary}>
          Record movement
        </button>
      </div>

      <div style={summaryGrid}>
        {summaryCards.map(([label, value]) => (
          <div key={label} style={summaryCard}>
            <div style={summaryLabel}>{label}</div>
            <div style={summaryValue}>
              {Number(value || 0).toLocaleString("en-PH")}
            </div>
          </div>
        ))}
      </div>

      <div style={filterCard}>
        <div style={{ ...filterField, flex: "1 1 320px" }}>
          <label style={filterLabel}>Search</label>
          <input
            placeholder="Search material, product, order, reference, or customer"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            style={{ ...inputSm, width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div style={filterField}>
          <label style={filterLabel}>Movement</label>
          <select
            value={filters.type}
            onChange={(event) => updateFilter("type", event.target.value)}
            style={inputSm}
          >
            <option value="">All movements</option>
            <option value="in">Stock in</option>
            <option value="out">Stock out</option>
            <option value="adjustment">Adjustment</option>
            <option value="return">Return</option>
          </select>
        </div>

        <div style={filterField}>
          <label style={filterLabel}>Source</label>
          <select
            value={filters.source}
            onChange={(event) => updateFilter("source", event.target.value)}
            style={inputSm}
          >
            <option value="">All sources</option>
            <option value="blueprint_production">Blueprint production</option>
            <option value="build_production">Build production</option>
            <option value="product_production">Product production</option>
            <option value="order_fulfillment">Order fulfillment</option>
            <option value="manual">Manual entry</option>
          </select>
        </div>

        <div style={filterField}>
          <label style={filterLabel}>From</label>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter("from", event.target.value)}
            style={inputSm}
            aria-label="From date"
          />
        </div>

        <div style={filterField}>
          <label style={filterLabel}>To</label>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => updateFilter("to", event.target.value)}
            style={inputSm}
            aria-label="To date"
          />
        </div>

        <div style={{ ...filterField, justifyContent: "flex-end" }}>
          <span style={{ ...filterLabel, visibility: "hidden" }}>Action</span>
          <button onClick={clearFilters} style={btnGhost}>
            Reset filters
          </button>
        </div>
      </div>

      <div style={tableCard}>
        <div style={tableSectionHeader}>
          <div>
            <div style={tableSectionTitle}>Movement history</div>
            <div style={tableSectionSubtitle}>
              Physical stock changes recorded by the system and staff.
            </div>
          </div>
          <div style={tableCount}>
            {total.toLocaleString("en-PH")} records
          </div>
        </div>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Date and time",
                "Movement",
                "Source",
                "Item",
                "Quantity",
                "Order",
                "Reference",
                "Notes",
                "Recorded by",
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
                <td colSpan={9} style={emptyCell}>
                  Loading stock movements...
                </td>
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
                  <tr
                    key={row.id}
                    style={{ borderBottom: "1px solid #f4f4f5" }}
                  >
                    <td
                      style={{ ...td, color: "#71717a", whiteSpace: "nowrap" }}
                    >
                      {formatDateTime(row.created_at)}
                    </td>
                    <td style={td}>
                      <span style={typeBadge}>
                        {MOVEMENT_LABELS[row.type] || "Movement"}
                      </span>
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
                        {SOURCE_LABELS[source] || "Manual entry"}
                      </span>
                      {row.reservation_status && (
                        <div style={subMeta}>
                          Reservation:{" "}
                          {String(row.reservation_status).replaceAll("_", " ")}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 190 }}>
                      <div style={{ fontWeight: 600, color: "#0a0a0a" }}>
                        {itemName}
                      </div>
                      {row.product_name && row.material_name && (
                        <div style={subMeta}>For: {row.product_name}</div>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontWeight: 700,
                        color: isPositive ? "#166534" : "#b42318",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isPositive ? "+" : "-"}
                      {formatQuantity(row.quantity)}
                      {unit}
                    </td>
                    <td style={{ ...td, minWidth: 150 }}>
                      {row.order_id ? (
                        <button
                          onClick={() =>
                            navigate(`/admin/orders/${row.order_id}`)
                          }
                          style={orderLink}
                        >
                          {row.order_number || `Order #${row.order_id}`}
                        </button>
                      ) : (
                        "—"
                      )}
                      {row.customer_name && (
                        <div style={subMeta}>{row.customer_name}</div>
                      )}
                      {row.order_status && (
                        <div style={subMeta}>
                          {row.order_status} ·{" "}
                          {row.payment_status || "payment unknown"}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 170 }}>
                      {row.reservation_id && (
                        <div style={{ fontWeight: 600 }}>
                          Reservation #{row.reservation_id}
                        </div>
                      )}
                      <div style={referenceText}>{row.reference || "—"}</div>
                    </td>
                    <td style={{ ...td, minWidth: 240, color: "#52525b" }}>
                      {row.notes || "—"}
                    </td>
                    <td
                      style={{ ...td, color: "#71717a", whiteSpace: "nowrap" }}
                    >
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
          Page {filters.page} of {pageCount} · {total.toLocaleString("en-PH")}{" "}
          records
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
            <h3 style={modalTitle}>Record stock movement</h3>
            <p style={modalSubtitle}>
              Choose the movement, item, and quantity for this physical stock change.
            </p>
            <form onSubmit={handleSave}>
              <div style={fieldGroup}>
                <label style={label}>Movement *</label>
                <select
                  required
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                  style={inputFull}
                >
                  <option value="in">Stock in</option>
                  <option value="out">Stock out</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="return">Return</option>
                </select>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Item type *</label>
                <select
                  required
                  value={itemKind}
                  onChange={(event) => handleItemKindChange(event.target.value)}
                  style={inputFull}
                >
                  <option value="material">Raw material</option>
                  <option value="product">Product or build material</option>
                </select>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Item *</label>
                {itemKind === "material" ? (
                  <select
                    required
                    value={form.material_id}
                    onChange={(event) => handleMaterialChange(event.target.value)}
                    style={inputFull}
                  >
                    <option value="">Select raw material</option>
                    {rawMats.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    required
                    value={form.product_id}
                    onChange={(event) => handleProductChange(event.target.value)}
                    style={inputFull}
                  >
                    <option value="">Select product or build material</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedMaterial && (
                <div style={availabilityBox}>
                  <div>
                    <span style={availabilityLabel}>On hand</span>
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
                      {formatQuantity(selectedAvailable)}{" "}
                      {selectedMaterial.unit}
                    </strong>
                  </div>
                </div>
              )}

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
                    setForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  style={inputFull}
                />
              </div>

              <div style={fieldGroup}>
                <label style={label}>Reference <span style={optionalText}>Optional</span></label>
                <input
                  value={form.reference}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reference: event.target.value,
                    }))
                  }
                  placeholder="PO number, receipt number, or adjustment reference"
                  maxLength={100}
                  style={inputFull}
                />
              </div>

              <div style={{ ...fieldGroup, marginBottom: 20 }}>
                <label style={label}>Notes <span style={optionalText}>Optional</span></label>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
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
                  {saving ? "Saving..." : "Save movement"}
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
  fontWeight: 700,
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
  borderRadius: 2,
  padding: "13px 15px",
};
const summaryLabel = {
  fontSize: 10,
  fontWeight: 600,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 0.7,
};
const summaryValue = {
  marginTop: 5,
  fontSize: 21,
  fontWeight: 700,
  color: "#18181b",
};
const filterCard = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
  flexWrap: "wrap",
  padding: 12,
  marginBottom: 14,
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
};
const filterField = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 130,
};
const filterLabel = {
  fontSize: 10,
  fontWeight: 600,
  color: "#52525b",
  textTransform: "uppercase",
  letterSpacing: 0.55,
};
const tableCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  overflowX: "auto",
};
const tableSectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: "13px 14px",
  borderBottom: "1px solid #e4e4e7",
};
const tableSectionTitle = {
  fontSize: 14,
  fontWeight: 650,
  color: "#18181b",
};
const tableSectionSubtitle = {
  marginTop: 3,
  fontSize: 11,
  color: "#71717a",
};
const tableCount = {
  paddingTop: 2,
  fontSize: 11,
  color: "#71717a",
  whiteSpace: "nowrap",
};
const th = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 600,
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
  padding: "3px 8px",
  borderRadius: 2,
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "capitalize",
  whiteSpace: "nowrap",
};
const sourceBadge = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 2,
  fontSize: 11,
  fontWeight: 600,
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
  fontWeight: 600,
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
  minHeight: 36,
  padding: "8px 10px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  background: "#fff",
  color: "#18181b",
  fontSize: 12,
  outline: "none",
};
const inputFull = {
  width: "100%",
  minHeight: 38,
  padding: "9px 11px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  color: "#18181b",
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
};
const btnPrimary = {
  minHeight: 36,
  padding: "8px 14px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 2,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const btnGhost = {
  minHeight: 36,
  padding: "8px 12px",
  background: "#fff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
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
  width: 500,
  maxWidth: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: 24,
  background: "#fff",
  borderRadius: 2,
  boxShadow: "0 18px 50px rgba(0,0,0,.22)",
};
const modalTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "#0a0a0a",
};
const modalSubtitle = {
  margin: "5px 0 18px",
  fontSize: 12,
  lineHeight: 1.45,
  color: "#71717a",
};
const fieldGroup = { marginBottom: 12 };
const label = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "#3f3f46",
};
const optionalText = {
  marginLeft: 4,
  fontSize: 10,
  fontWeight: 400,
  color: "#a1a1aa",
};
const availabilityBox = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: -4,
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 2,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  color: "#18181b",
  fontSize: 12,
};
const availabilityLabel = {
  display: "block",
  marginBottom: 3,
  color: "#64748b",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
const helperBox = {
  marginBottom: 16,
  padding: "10px 12px",
  borderRadius: 2,
  background: "#fafafa",
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
