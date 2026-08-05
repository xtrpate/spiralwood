// src/pages/inventory/RawMaterialsPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";

const STOCK_COLORS = {
  in_stock: ["#f4f4f5", "#18181b", "#e4e4e7"],
  low_stock: ["#ffffff", "#52525b", "#d4d4d8"],
  out_of_stock: ["#fef2f2", "#991b1b", "#fecaca"],
};

const formatQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-PH", {
    maximumFractionDigits: 4,
  });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatStatus = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const RESERVATION_FILTERS = [
  ["all", "All"],
  ["pending_stock", "Pending Stock"],
  ["reserved", "Reserved"],
  ["consumed", "Consumed"],
  ["released", "Released"],
];

const RESERVATION_STATUS_STYLES = {
  pending_stock: { background: "#fef2f2", color: "#991b1b", border: "#fecaca" },
  reserved: { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  consumed: { background: "#f4f4f5", color: "#27272a", border: "#d4d4d8" },
  released: { background: "#ecfdf5", color: "#166534", border: "#bbf7d0" },
};

export default function RawMaterialsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    archive_status: "active",
    page: 1,
  });
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [reservationModal, setReservationModal] = useState(null);
  const [reservationFilter, setReservationFilter] = useState("all");

  const load = useCallback(async () => {
    const { data } = await api.get("/inventory/raw", {
      params: { ...filters, limit: 20 },
    });
    setItems(data.rows || []);
    setTotal(Number(data.total || 0));
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get("/suppliers").then((r) => setSuppliers(r.data || []));
  }, []);

  const openAdd = () =>
    setModal({
      mode: "add",
      data: {
        name: "",
        unit: "",
        quantity: 0,
        reorder_point: 0,
        unit_cost: 0,
        supplier_id: "",
      },
    });

  const openEdit = (item) => setModal({ mode: "edit", data: { ...item } });

  const openReservationHistory = async (item, initialFilter = "all") => {
    setReservationFilter(initialFilter);
    setReservationModal({
      loading: true,
      error: "",
      material: item,
      summary: null,
      rows: [],
    });

    try {
      const { data } = await api.get("/inventory/raw", {
        params: { reservation_material_id: item.id },
      });
      setReservationModal({
        loading: false,
        error: "",
        material: data.material || item,
        summary: data.summary || {},
        rows: Array.isArray(data.rows) ? data.rows : [],
      });
    } catch (error) {
      setReservationModal((current) => ({
        ...current,
        loading: false,
        error: "Unable to load reservation history.",
      }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.mode === "add") {
        const { data } = await api.post("/inventory/raw", modal.data);
        toast.success(data?.message || "Raw material added.");
      } else {
        const { data } = await api.put(
          `/inventory/raw/${modal.data.id}`,
          modal.data,
        );
        toast.success(data?.message || "Raw material updated.");
      }
      setModal(null);
      load();
    } catch (error) {
      // The global API interceptor shows the server message.
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (item) => {
    const reservedQuantity = Number(item.reserved_quantity || 0);
    const pendingNeedQuantity = Number(item.pending_need_quantity || 0);

    if (reservedQuantity > 0 || pendingNeedQuantity > 0) {
      toast.error(
        "This material has active blueprint reservations or pending stock needs. Resolve or cancel those orders before archiving it.",
      );
      return;
    }

    if (
      !window.confirm(
        `Archive "${item.name}"? It will be hidden from active inventory and new material selectors, but its history will remain.`,
      )
    ) {
      return;
    }

    try {
      await api.patch(`/inventory/raw/${item.id}/archive`);
      toast.success("Raw material archived.");
      load();
    } catch (error) {
      // The global API interceptor shows the server message.
    }
  };

  const handleRestore = async (item) => {
    if (!window.confirm(`Restore "${item.name}" to active inventory?`)) return;

    try {
      await api.patch(`/inventory/raw/${item.id}/restore`);
      toast.success("Raw material restored.");
      load();
    } catch (error) {
      // The global API interceptor shows the server message.
    }
  };

  const handleDelete = async (item) => {
    if (
      !window.confirm(
        `Permanently delete "${item.name}"? This is only allowed when it has no linked or historical records.`,
      )
    ) {
      return;
    }

    try {
      await api.delete(`/inventory/raw/${item.id}`);
      toast.success("Raw material permanently deleted.");
      load();
    } catch (error) {
      // The global API interceptor shows the server message.
    }
  };

  const setField = (key, value) =>
    setModal((current) => ({
      ...current,
      data: { ...current.data, [key]: value },
    }));

  const filteredReservationRows = (reservationModal?.rows || []).filter(
    (row) => reservationFilter === "all" || row.status === reservationFilter,
  );

  return (
    <div>
      <div style={header}>
        <div>
          <h1 style={title}>Raw Materials Inventory</h1>
          <div style={subtitle}>
            On hand is physical stock. Reserved stock is allocated to paid blueprint orders,
            while available stock can still be assigned to new work.
          </div>
        </div>
        <button onClick={openAdd} style={btnPrimary}>
          + Add Material
        </button>
      </div>

      <div style={filterRow}>
        <input
          placeholder="Search..."
          value={filters.search}
          onChange={(e) =>
            setFilters((current) => ({
              ...current,
              search: e.target.value,
              page: 1,
            }))
          }
          style={inputSm}
        />
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((current) => ({
              ...current,
              status: e.target.value,
              page: 1,
            }))
          }
          style={inputSm}
        >
          <option value="">All Stock Status</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
        <select
          value={filters.archive_status}
          onChange={(e) =>
            setFilters((current) => ({
              ...current,
              archive_status: e.target.value,
              page: 1,
            }))
          }
          style={inputSm}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All Records</option>
        </select>
        <span style={resultCount}>{total} record{total === 1 ? "" : "s"}</span>
      </div>

      <div style={tableCard}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Name",
                "Supplier",
                "Unit",
                "On Hand",
                "Reserved",
                "Available",
                "Pending Need",
                "Reorder Pt",
                "Unit Cost",
                "Total Value",
                "Stock Status",
                "Record",
                "Actions",
              ].map((heading) => (
                <th key={heading} style={th}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={13} style={emptyCell}>
                  No raw materials found for the selected filters.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const availabilityStatus =
                  item.availability_status || item.stock_status;
                const [bg, color, border] = STOCK_COLORS[availabilityStatus] || [
                  "#f4f4f5",
                  "#18181b",
                  "#e4e4e7",
                ];
                const isActive = Number(item.is_active) === 1;
                const hasReferences = Number(item.has_references) === 1;
                const reservationRecordCount = Number(
                  item.reservation_record_count || 0,
                );
                const reservedQuantity = Number(item.reserved_quantity || 0);
                const pendingNeedQuantity = Number(
                  item.pending_need_quantity || 0,
                );
                const hasActiveReservations =
                  reservedQuantity > 0 || pendingNeedQuantity > 0;

                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={td}>
                      <strong style={{ color: isActive ? "#0a0a0a" : "#71717a" }}>
                        {item.name}
                      </strong>
                    </td>
                    <td style={{ ...td, color: "#52525b" }}>
                      {item.supplier_name || "—"}
                    </td>
                    <td style={{ ...td, color: "#71717a" }}>{item.unit}</td>
                    <td style={{ ...td, fontWeight: 700 }}>
                      {formatQuantity(item.on_hand_quantity ?? item.quantity)}
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>
                      {reservedQuantity > 0 ? (
                        <button
                          type="button"
                          onClick={() => openReservationHistory(item, "reserved")}
                          style={quantityLink}
                          title="View reserved orders"
                        >
                          {formatQuantity(reservedQuantity)}
                        </button>
                      ) : (
                        formatQuantity(reservedQuantity)
                      )}
                    </td>
                    <td style={{ ...td, fontWeight: 800 }}>
                      {formatQuantity(item.available_quantity ?? item.quantity)}
                    </td>
                    <td style={{ ...td, color: "#991b1b", fontWeight: 700 }}>
                      {pendingNeedQuantity > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            openReservationHistory(item, "pending_stock")
                          }
                          style={{ ...quantityLink, color: "#991b1b" }}
                          title="View orders waiting for stock"
                        >
                          {formatQuantity(pendingNeedQuantity)}
                        </button>
                      ) : (
                        formatQuantity(pendingNeedQuantity)
                      )}
                    </td>
                    <td style={{ ...td, color: "#52525b" }}>{item.reorder_point}</td>
                    <td style={td}>₱ {Number(item.unit_cost).toFixed(2)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>
                      ₱ {(Number(item.quantity) * Number(item.unit_cost)).toFixed(2)}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          background: bg,
                          color,
                          border: `1px solid ${border}`,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {availabilityStatus?.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={isActive ? activeBadge : archivedBadge}>
                        {isActive ? "active" : "archived"}
                      </span>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {reservationRecordCount > 0 && (
                        <button
                          type="button"
                          onClick={() => openReservationHistory(item)}
                          style={{ ...btnEdit, ...btnHistory, marginRight: 6 }}
                        >
                          History
                        </button>
                      )}
                      {isActive ? (
                        <>
                          <button onClick={() => openEdit(item)} style={btnEdit}>
                            Edit
                          </button>
                          <button
                            onClick={() => handleArchive(item)}
                            disabled={hasActiveReservations}
                            title={
                              hasActiveReservations
                                ? "Resolve active reservations or pending stock needs before archiving."
                                : "Archive raw material"
                            }
                            style={{
                              ...btnEdit,
                              ...btnArchive,
                              ...(hasActiveReservations ? btnDisabled : {}),
                              marginLeft: 6,
                            }}
                          >
                            Archive
                          </button>
                          {!hasReferences && (
                            <button
                              onClick={() => handleDelete(item)}
                              style={{ ...btnEdit, ...btnDelete, marginLeft: 6 }}
                            >
                              Delete
                            </button>
                          )}
                        </>
                      ) : (
                        <button onClick={() => handleRestore(item)} style={btnRestore}>
                          Restore
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3 style={modalTitle}>
              {modal.mode === "add" ? "Add Raw Material" : "Edit Raw Material"}
            </h3>
            <form onSubmit={handleSave}>
              {[
                ["Name *", "name", "text", true],
                ["Unit *", "unit", "text", true],
                ["Quantity", "quantity", "number"],
                ["Reorder Point", "reorder_point", "number"],
                ["Unit Cost (₱)", "unit_cost", "number"],
              ].map(([label, key, type, required]) => {
                const quantityLocked =
                  modal.mode === "edit" && key === "quantity";

                return (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <label style={labelSm}>{label}</label>
                    <input
                      type={type || "text"}
                      required={required}
                      min={type === "number" ? "0" : undefined}
                      step={
                        type === "number"
                          ? key === "unit_cost"
                            ? "0.01"
                            : "1"
                          : undefined
                      }
                      readOnly={quantityLocked}
                      aria-readonly={quantityLocked}
                      onKeyDown={(e) => {
                        if (
                          quantityLocked ||
                          ((key === "quantity" || key === "reorder_point") &&
                            (e.key === "." ||
                              e.key.toLowerCase() === "e" ||
                              e.key === "-"))
                        ) {
                          e.preventDefault();
                        }
                      }}
                      value={modal.data[key] ?? ""}
                      onChange={(e) => {
                        if (!quantityLocked) setField(key, e.target.value);
                      }}
                      style={{
                        ...inputFull,
                        ...(quantityLocked ? lockedInput : {}),
                      }}
                    />
                    {quantityLocked && (
                      <div style={fieldHelp}>
                        Use Stock Movement to change on-hand quantity so the
                        physical stock change is recorded.
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Supplier</label>
                <select
                  value={modal.data.supplier_id || ""}
                  onChange={(e) => setField("supplier_id", e.target.value)}
                  style={inputFull}
                >
                  <option value="">None</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={modalActions}>
                <button type="button" onClick={() => setModal(null)} style={btnGhost}>
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

      {reservationModal && (
        <div
          style={overlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReservationModal(null);
          }}
        >
          <div style={historyModalBox}>
            <div style={historyHeader}>
              <div>
                <h3 style={{ ...modalTitle, marginBottom: 5 }}>
                  Reservation History
                </h3>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#27272a" }}>
                  {reservationModal.material?.name || "Raw material"}
                </div>
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 3 }}>
                  Read-only allocation and usage trail for blueprint orders.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReservationModal(null)}
                style={closeButton}
                aria-label="Close reservation history"
              >
                ×
              </button>
            </div>

            {reservationModal.loading ? (
              <div style={historyEmpty}>Loading reservation history...</div>
            ) : reservationModal.error ? (
              <div style={{ ...historyEmpty, color: "#991b1b" }}>
                {reservationModal.error}
              </div>
            ) : (
              <>
                <div style={summaryGrid}>
                  {[
                    [
                      "On Hand",
                      reservationModal.material?.on_hand_quantity,
                      "Physical stock",
                    ],
                    [
                      "Reserved",
                      reservationModal.summary?.reserved_quantity,
                      `${reservationModal.summary?.reserved_count || 0} order(s)`,
                    ],
                    [
                      "Available",
                      reservationModal.material?.available_quantity,
                      "Can be assigned",
                    ],
                    [
                      "Pending Need",
                      reservationModal.summary?.pending_need_quantity,
                      `${reservationModal.summary?.pending_stock_count || 0} order(s)`,
                    ],
                  ].map(([label, value, detail]) => (
                    <div key={label} style={summaryCard}>
                      <div style={summaryLabel}>{label}</div>
                      <div style={summaryValue}>
                        {formatQuantity(value)} {reservationModal.material?.unit || ""}
                      </div>
                      <div style={summaryDetail}>{detail}</div>
                    </div>
                  ))}
                </div>

                <div style={historyFilters}>
                  {RESERVATION_FILTERS.map(([value, label]) => {
                    const count =
                      value === "all"
                        ? reservationModal.summary?.total_records || 0
                        : reservationModal.summary?.[`${value}_count`] || 0;
                    const active = reservationFilter === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setReservationFilter(value)}
                        style={active ? historyFilterActive : historyFilterButton}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>

                <div style={historyTableWrap}>
                  <table style={historyTable}>
                    <thead>
                      <tr style={{ background: "#fafafa" }}>
                        {[
                          "Order",
                          "Customer",
                          "Required",
                          "Status",
                          "Reserved",
                          "Consumed",
                          "Released",
                          "Issue / Reason",
                        ].map((heading) => (
                          <th key={heading} style={historyTh}>
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReservationRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={historyEmpty}>
                            No reservation records for this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredReservationRows.map((row) => {
                          const badge =
                            RESERVATION_STATUS_STYLES[row.status] ||
                            RESERVATION_STATUS_STYLES.consumed;
                          return (
                            <tr
                              key={row.reservation_id}
                              style={{ borderBottom: "1px solid #f4f4f5" }}
                            >
                              <td style={historyTd}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReservationModal(null);
                                    navigate(`/admin/orders/${row.order_id}`);
                                  }}
                                  style={orderLink}
                                >
                                  {row.order_number || `Order #${row.order_id}`}
                                </button>
                                <div style={orderMeta}>
                                  {formatStatus(row.order_status)} · {formatStatus(row.payment_status)}
                                </div>
                              </td>
                              <td style={historyTd}>{row.customer_name || "—"}</td>
                              <td style={{ ...historyTd, fontWeight: 800 }}>
                                {formatQuantity(row.quantity)} {row.unit || ""}
                              </td>
                              <td style={historyTd}>
                                <span
                                  style={{
                                    ...reservationBadge,
                                    background: badge.background,
                                    color: badge.color,
                                    border: `1px solid ${badge.border}`,
                                  }}
                                >
                                  {formatStatus(row.status)}
                                </span>
                              </td>
                              <td style={historyTd}>
                                {row.status === "pending_stock" && !row.reserved_at
                                  ? "Waiting for stock"
                                  : formatDateTime(row.reserved_at)}
                                {row.created_by_name && (
                                  <div style={orderMeta}>By {row.created_by_name}</div>
                                )}
                              </td>
                              <td style={historyTd}>
                                {formatDateTime(row.consumed_at)}
                                {row.consumed_by_name && (
                                  <div style={orderMeta}>By {row.consumed_by_name}</div>
                                )}
                              </td>
                              <td style={historyTd}>
                                {formatDateTime(row.released_at)}
                                {row.released_by_name && (
                                  <div style={orderMeta}>By {row.released_by_name}</div>
                                )}
                              </td>
                              <td style={{ ...historyTd, minWidth: 220 }}>
                                <div style={{ fontWeight: 600 }}>
                                  {row.issue_note || row.release_reason || "—"}
                                </div>
                                {row.issue_code && (
                                  <div style={orderMeta}>{row.issue_code}</div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};
const title = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};
const subtitle = { marginTop: 5, fontSize: 12, color: "#71717a" };
const filterRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 16,
  flexWrap: "wrap",
};
const resultCount = { marginLeft: "auto", fontSize: 12, color: "#71717a" };
const tableCard = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e4e4e7",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  overflowX: "auto",
};
const th = {
  textAlign: "left",
  padding: "13px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 1,
  whiteSpace: "nowrap",
};
const td = {
  padding: "14px 16px",
  color: "#18181b",
  verticalAlign: "middle",
};
const emptyCell = { ...td, textAlign: "center", color: "#71717a", padding: 32 };
const inputSm = {
  padding: "8px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  fontSize: 13,
  minWidth: 160,
  outline: "none",
  color: "#18181b",
};
const inputFull = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
  color: "#18181b",
};
const labelSm = {
  fontSize: 12,
  fontWeight: 700,
  color: "#52525b",
  display: "block",
  marginBottom: 6,
};
const lockedInput = {
  background: "#f4f4f5",
  color: "#52525b",
  cursor: "not-allowed",
};
const fieldHelp = {
  marginTop: 6,
  fontSize: 11,
  lineHeight: 1.45,
  color: "#71717a",
};
const btnPrimary = {
  padding: "9px 18px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 7,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const btnEdit = {
  padding: "6px 12px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
};
const btnArchive = {
  background: "#fff7ed",
  color: "#9a3412",
  border: "1px solid #fed7aa",
};
const btnDisabled = {
  opacity: 0.5,
  cursor: "not-allowed",
};
const btnHistory = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
};
const quantityLink = {
  padding: 0,
  background: "transparent",
  border: 0,
  color: "#1d4ed8",
  font: "inherit",
  fontWeight: 800,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  cursor: "pointer",
};
const btnDelete = {
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
};
const btnRestore = {
  ...btnEdit,
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #bbf7d0",
};
const activeBadge = {
  display: "inline-block",
  padding: "2px 9px",
  borderRadius: 12,
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #bbf7d0",
  fontSize: 11,
  fontWeight: 700,
};
const archivedBadge = {
  ...activeBadge,
  background: "#f4f4f5",
  color: "#52525b",
  border: "1px solid #d4d4d8",
};
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalBox = {
  background: "#fff",
  borderRadius: 14,
  width: 380,
  padding: 28,
  boxShadow: "0 20px 60px rgba(0,0,0,.25)",
};
const modalTitle = {
  margin: "0 0 20px",
  fontSize: 18,
  fontWeight: 800,
  color: "#0a0a0a",
};
const modalActions = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 24,
};
const btnGhost = {
  padding: "9px 16px",
  background: "#fff",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 7,
  fontSize: 13,
  cursor: "pointer",
};

const historyModalBox = {
  background: "#fff",
  borderRadius: 14,
  width: "min(1180px, calc(100vw - 36px))",
  maxHeight: "calc(100vh - 48px)",
  padding: 24,
  boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  overflow: "auto",
};
const historyHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 20,
  marginBottom: 18,
};
const closeButton = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#3f3f46",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
};
const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  marginBottom: 16,
};
const summaryCard = {
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: "12px 14px",
  background: "#fafafa",
};
const summaryLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 1,
};
const summaryValue = {
  marginTop: 5,
  fontSize: 18,
  fontWeight: 800,
  color: "#18181b",
};
const summaryDetail = { marginTop: 3, fontSize: 11, color: "#71717a" };
const historyFilters = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 14,
};
const historyFilterButton = {
  padding: "7px 11px",
  borderRadius: 7,
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#52525b",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};
const historyFilterActive = {
  ...historyFilterButton,
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
};
const historyTableWrap = {
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  overflowX: "auto",
};
const historyTable = {
  width: "100%",
  minWidth: 1050,
  borderCollapse: "collapse",
  fontSize: 12,
};
const historyTh = {
  ...th,
  padding: "11px 12px",
};
const historyTd = {
  padding: "12px",
  verticalAlign: "top",
  color: "#27272a",
};
const historyEmpty = {
  padding: 28,
  textAlign: "center",
  color: "#71717a",
  fontSize: 13,
};
const reservationBadge = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 12,
  fontSize: 10,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const orderLink = {
  padding: 0,
  border: 0,
  background: "transparent",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 800,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  cursor: "pointer",
};
const orderMeta = {
  marginTop: 3,
  fontSize: 10,
  color: "#71717a",
};
