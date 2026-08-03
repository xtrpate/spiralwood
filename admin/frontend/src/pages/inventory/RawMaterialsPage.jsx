// src/pages/inventory/RawMaterialsPage.jsx
import React, { useEffect, useState, useCallback } from "react";
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

export default function RawMaterialsPage() {
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

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.mode === "add") {
        await api.post("/inventory/raw", modal.data);
        toast.success("Raw material added.");
      } else {
        await api.put(`/inventory/raw/${modal.data.id}`, modal.data);
        toast.success("Raw material updated.");
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
                      {formatQuantity(item.reserved_quantity)}
                    </td>
                    <td style={{ ...td, fontWeight: 800 }}>
                      {formatQuantity(item.available_quantity ?? item.quantity)}
                    </td>
                    <td style={{ ...td, color: "#991b1b", fontWeight: 700 }}>
                      {formatQuantity(item.pending_need_quantity)}
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
                      {isActive ? (
                        <>
                          <button onClick={() => openEdit(item)} style={btnEdit}>
                            Edit
                          </button>
                          <button
                            onClick={() => handleArchive(item)}
                            style={{ ...btnEdit, ...btnArchive, marginLeft: 6 }}
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
              ].map(([label, key, type, required]) => (
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
                    onKeyDown={(e) => {
                      if (
                        (key === "quantity" || key === "reorder_point") &&
                        (e.key === "." || e.key.toLowerCase() === "e" || e.key === "-")
                      ) {
                        e.preventDefault();
                      }
                    }}
                    value={modal.data[key] ?? ""}
                    onChange={(e) => setField(key, e.target.value)}
                    style={inputFull}
                  />
                </div>
              ))}
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
