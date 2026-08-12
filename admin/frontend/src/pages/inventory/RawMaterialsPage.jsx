// src/pages/inventory/RawMaterialsPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";

const STOCK_COLORS = {
  in_stock: ["#f0fdf4", "#15803d", "#bbf7d0"],
  low_stock: ["#fffbeb", "#a16207", "#fde68a"],
  out_of_stock: ["#fef2f2", "#b91c1c", "#fecaca"],
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

const formatStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "consumed") return "Used";
  if (normalized === "pending_stock") return "Waiting for stock";
  const words = normalized.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// WISDOM Material Physical Specs V1.1
// WISDOM RAW MATERIALS UI POLISH V2
// WISDOM RAW MATERIALS FINISHING POLISH V3.0.1
// WISDOM RAW MATERIALS DESKTOP FIT V1
// WISDOM RAW MATERIALS ACTION DISCLOSURE V1
// WISDOM RAW RESERVED HEADER FIX V1
// WISDOM RAW MATERIALS TYPOGRAPHY CONSISTENCY V1.0.1
// WISDOM RAW MATERIALS SIZE BOOST V1
// WISDOM RAW MATERIALS READABILITY V1
const MATERIAL_FORM_OPTIONS = [
  ["other", "Other material"],
  ["sheet", "Sheet or Board"],
  ["linear", "Linear Material"],
  ["piece", "Solid Stock Piece"],
  ["hardware", "Hardware or Counted Item"],
];

const MATERIAL_FORM_LABELS = Object.fromEntries(MATERIAL_FORM_OPTIONS);

const formatDimension = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number.toLocaleString("en-PH", { maximumFractionDigits: 2 });
};

const formatMaterialPhysicalSpec = (item = {}) => {
  const form = String(item.material_form || "other").toLowerCase();
  const label = MATERIAL_FORM_LABELS[form] || "Other";
  const length = formatDimension(item.length_mm);
  const width = formatDimension(item.width_mm);
  const thickness = formatDimension(item.thickness_mm);

  if (form === "hardware" || form === "other") return label;

  if (length && width && thickness) {
    return `${label} · ${length} × ${width} × ${thickness} mm`;
  }

  const partial = [
    length ? `L ${length} mm` : null,
    width ? `W ${width} mm` : null,
    thickness ? `T ${thickness} mm` : null,
  ].filter(Boolean);

  if (partial.length) return `${label} · ${partial.join(" · ")}`;
  return form === "sheet" ? `${label} · Size not set` : label;
};

const RESERVATION_FILTERS = [
  ["all", "All"],
  ["pending_stock", "Waiting for Stock"],
  ["reserved", "Reserved"],
  ["consumed", "Used"],
  ["released", "Released"],
];

const RESERVATION_STATUS_STYLES = {
  pending_stock: { background: "#fef2f2", color: "#991b1b", border: "#fecaca" },
  reserved: { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  consumed: { background: "#f4f4f5", color: "#27272a", border: "#d4d4d8" },
  released: { background: "#ecfdf5", color: "#166534", border: "#bbf7d0" },
};

export default function RawMaterialsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
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
  const [actionMenuId, setActionMenuId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

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
        material_form: "other",
        length_mm: "",
        width_mm: "",
        thickness_mm: "",
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

  const handleArchive = (item) => {
    const reservedQuantity = Number(item.reserved_quantity || 0);
    const pendingNeedQuantity = Number(item.pending_need_quantity || 0);

    if (reservedQuantity > 0 || pendingNeedQuantity > 0) {
      toast.error(
        "This material has active blueprint reservations or stock needs. Resolve those orders before archiving it.",
      );
      return;
    }

    setConfirmAction({ type: "archive", item });
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

  const handleDelete = (item) => {
    setConfirmAction({ type: "delete", item });
  };

  const confirmMaterialAction = async () => {
    if (!confirmAction?.item) return;

    const { type, item } = confirmAction;
    try {
      if (type === "archive") {
        await api.patch(`/inventory/raw/${item.id}/archive`);
        toast.success("Raw material archived.");
      } else {
        await api.delete(`/inventory/raw/${item.id}`);
        toast.success("Raw material permanently deleted.");
      }
      setConfirmAction(null);
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

  useEffect(() => {
    if (actionMenuId == null) return undefined;

    const closeMenu = () => setActionMenuId(null);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionMenuId]);

  const filteredReservationRows = (reservationModal?.rows || []).filter(
    (row) => reservationFilter === "all" || row.status === reservationFilter,
  );

  const currentMaterialForm = String(
    modal?.data?.material_form || "other",
  ).toLowerCase();
  const showPhysicalDimensions = ["sheet", "linear", "piece"].includes(
    currentMaterialForm,
  );
  const requiresCompletePhysicalSize = currentMaterialForm === "sheet";

  return (
    <div>
      <div style={header}>
        <div>
          {/* WISDOM RAW MATERIAL ROLE COPY V1 */}
          <h1 style={title}>Raw Materials</h1>
          <div style={subtitle}>
            Manage materials used for custom furniture. Track physical stock,
            blueprint reservations, and quantities available for new work. Use
            Stock Movement whenever physical inventory changes.
          </div>
        </div>
        <button onClick={openAdd} style={btnPrimary}>
          Add material
        </button>
      </div>

      <div style={filterRow}>
        <div style={{ ...filterField, flex: "0 1 520px", width: "min(520px, 100%)" }}>
          <label style={filterLabel}>Search</label>
          <input
            placeholder="Search materials"
            value={filters.search}
            onChange={(e) =>
              setFilters((current) => ({
                ...current,
                search: e.target.value,
                page: 1,
              }))
            }
            style={{ ...inputSm, width: "100%", boxSizing: "border-box" }}
          />
        </div>
        <div style={filterField}>
          <label style={filterLabel}>Stock level</label>
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
            <option value="">All stock levels</option>
            <option value="in_stock">In stock</option>
            <option value="low_stock">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
        </div>
        <div style={filterField}>
          <label style={filterLabel}>Record status</label>
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
            <option value="active">Active materials</option>
            <option value="archived">Archived materials</option>
            <option value="all">All materials</option>
          </select>
        </div>
        <span style={resultCount}>
          {total.toLocaleString("en-PH")} material{total === 1 ? "" : "s"}
        </span>
      </div>

      <div style={tableCard}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          <colgroup>
            <col style={{ width: "20.5%" }} />
            <col style={{ width: "9.5%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "5.5%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7.5%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Material",
                "Supplier",
                "Unit",
                "On Hand",
                "Reserved",
                "Available",
                "Needed for Orders",
                "Reorder Point",
                "Unit Cost",
                "Inventory Value",
                "Stock Level",
                "Actions",
              ].map((heading) => (
                <th
                  key={heading}
                  style={{
                    ...th,
                    ...(heading === "Reserved" ? { whiteSpace: "nowrap" } : {}),
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={12} style={emptyCell}>
                  No raw materials found for the selected filters.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const availabilityStatus =
                  item.availability_status || item.stock_status;
                const [bg, color, border] = STOCK_COLORS[
                  availabilityStatus
                ] || ["#f4f4f5", "#18181b", "#e4e4e7"];
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
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid #f4f4f5" }}
                  >
                    <td style={td}>
                      <strong
                        style={{
                          color: isActive ? "#0a0a0a" : "#71717a",
                          fontWeight: 600,
                        }}
                      >
                        {item.name}
                      </strong>
                      <div
                        style={{
                          marginTop: 3,
                          color: "#71717a",
                          fontSize: 10.5,
                          fontWeight: 400,
                          fontFamily: "inherit",
                          lineHeight: 1.35,
                          whiteSpace: "normal",
                        }}
                      >
                        {formatMaterialPhysicalSpec(item)}
                        {!isActive ? " · Archived" : ""}
                      </div>
                    </td>
                    <td style={{ ...td, color: "#52525b" }}>
                      {item.supplier_name || "—"}
                    </td>
                    <td style={{ ...td, color: "#71717a" }}>{item.unit}</td>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {formatQuantity(item.on_hand_quantity ?? item.quantity)}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {reservedQuantity > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            openReservationHistory(item, "reserved")
                          }
                          style={quantityLink}
                          title="View reserved orders"
                        >
                          {formatQuantity(reservedQuantity)}
                        </button>
                      ) : (
                        formatQuantity(reservedQuantity)
                      )}
                    </td>
                    <td style={{ ...td, color: "#18181b", fontWeight: 600 }}>
                      {formatQuantity(item.available_quantity ?? item.quantity)}
                    </td>
                    <td style={{ ...td, color: "#991b1b", fontWeight: 600 }}>
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
                    <td style={{ ...td, color: "#52525b" }}>
                      {item.reorder_point}
                    </td>
                    <td style={td}>₱ {Number(item.unit_cost).toFixed(2)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>
                      ₱{" "}
                      {(Number(item.quantity) * Number(item.unit_cost)).toFixed(
                        2,
                      )}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          background: bg,
                          color,
                          border: `1px solid ${border}`,
                          padding: "2px 10px",
                          borderRadius: 2,
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatStatus(availabilityStatus)}
                      </span>
                    </td>
<td style={{ ...td, whiteSpace: "normal" }}>
                      <div style={rowActions}>
                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            style={btnEdit}
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRestore(item)}
                            style={btnEdit}
                          >
                            Restore
                          </button>
                        )}

                        <div
                          style={moreActionsWrap}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label={`More actions for ${item.name}`}
                            aria-haspopup="menu"
                            aria-expanded={actionMenuId === item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActionMenuId((current) =>
                                current === item.id ? null : item.id,
                              );
                            }}
                            style={btnMore}
                          >
                            ⋯
                          </button>

                          {actionMenuId === item.id && (
                            <div role="menu" style={moreActionsMenu}>
                              {reservationRecordCount > 0 && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setActionMenuId(null);
                                    openReservationHistory(item);
                                  }}
                                  style={moreActionsItem}
                                >
                                  View history
                                </button>
                              )}

                              {isActive && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={hasActiveReservations}
                                  title={
                                    hasActiveReservations
                                      ? "Resolve active reservations or waiting stock needs before archiving."
                                      : "Archive material"
                                  }
                                  onClick={() => {
                                    setActionMenuId(null);
                                    handleArchive(item);
                                  }}
                                  style={{
                                    ...moreActionsItem,
                                    ...(hasActiveReservations
                                      ? moreActionsItemDisabled
                                      : {}),
                                  }}
                                >
                                  Archive
                                </button>
                              )}

                              {!hasReferences && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setActionMenuId(null);
                                    handleDelete(item);
                                  }}
                                  style={{
                                    ...moreActionsItem,
                                    ...moreActionsDanger,
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td></tr>
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
            {modal.mode === "add" && (
              <div style={modalInfo}>
                Create the material record here. Add the physical quantity later
                through Stock Movement so every stock change is recorded.
              </div>
            )}
            <form onSubmit={handleSave}>
              {([
                ["Name *", "name", "text", true],
                ["Unit *", "unit", "text", true],
                ...(modal.mode === "edit"
                  ? [["Quantity", "quantity", "number"]]
                  : []),
                ["Reorder Point", "reorder_point", "number"],
                ["Unit Cost (₱)", "unit_cost", "number"],
              ]).map(([label, key, type, required]) => {
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
              <div
                style={{
                  marginBottom: 14,
                  padding: "12px 13px",
                  border: "1px solid #e4e4e7",
                  background: "#fafafa",
                }}
              >
                <label style={labelSm}>Material Type</label>
                <select
                  value={currentMaterialForm}
                  onChange={(e) => {
                    const nextForm = e.target.value;
                    setModal((current) => ({
                      ...current,
                      data: {
                        ...current.data,
                        material_form: nextForm,
                        ...(["hardware", "other"].includes(nextForm)
                          ? {
                              length_mm: "",
                              width_mm: "",
                              thickness_mm: "",
                            }
                          : {}),
                      },
                    }));
                  }}
                  style={inputFull}
                >
                  {MATERIAL_FORM_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <div style={{ ...fieldHelp, marginTop: 6 }}>
                  Choose how one inventory unit is measured. This does not
                  change the physical stock quantity.
                </div>

                {showPhysicalDimensions && (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 10,
                        marginTop: 12,
                      }}
                    >
                      {[
                        ["Length (mm)", "length_mm"],
                        ["Width (mm)", "width_mm"],
                        ["Thickness (mm)", "thickness_mm"],
                      ].map(([label, key]) => (
                        <div key={key}>
                          <label style={labelSm}>
                            {label}
                            {requiresCompletePhysicalSize ? " *" : ""}
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            required={requiresCompletePhysicalSize}
                            value={modal.data[key] ?? ""}
                            onChange={(e) => setField(key, e.target.value)}
                            onKeyDown={(e) => {
                              if (
                                e.key.toLowerCase() === "e" ||
                                e.key === "-" ||
                                e.key === "+"
                              ) {
                                e.preventDefault();
                              }
                            }}
                            style={inputFull}
                          />
                        </div>
                      ))}
                    </div>

                    <div style={{ ...fieldHelp, marginTop: 8 }}>
                      {currentMaterialForm === "sheet"
                        ? "Example: standard plywood may be 2440 × 1220 × 18 mm."
                        : "Optional stock size. Use millimeters when a standard physical size applies."}
                    </div>
                  </>
                )}
              </div>

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
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving ? "Saving..." : modal.mode === "add" ? "Add material" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {confirmAction && (
        <div
          style={overlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmAction(null);
          }}
        >
          <div style={confirmModalBox}>
            <div style={confirmEyebrow}>
              {confirmAction.type === "delete" ? "Permanent action" : "Inventory record"}
            </div>
            <h3 style={{ ...modalTitle, marginBottom: 8 }}>
              {confirmAction.type === "delete"
                ? "Delete raw material?"
                : "Archive raw material?"}
            </h3>
            <p style={confirmCopy}>
              {confirmAction.type === "delete"
                ? 'Delete "' + confirmAction.item.name + '" permanently? This is only available when the material has no linked or historical records.'
                : 'Archive "' + confirmAction.item.name + '"? It will be hidden from active inventory and new material selectors, while its history stays available.'}
            </p>
            <div style={modalActions}>
              <button type="button" onClick={() => setConfirmAction(null)} style={btnGhost}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMaterialAction}
                style={confirmAction.type === "delete" ? btnDanger : btnPrimary}
              >
                {confirmAction.type === "delete" ? "Delete permanently" : "Archive material"}
              </button>
            </div>
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
                  Material Reservation History
                </h3>
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: "#27272a" }}
                >
                  {reservationModal.material?.name || "Raw material"}
                </div>
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 3 }}>
                  Review how this material was reserved, used, or released for blueprint orders.
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
                      "Waiting for Stock",
                      reservationModal.summary?.pending_need_quantity,
                      `${reservationModal.summary?.pending_stock_count || 0} order(s)`,
                    ],
                  ].map(([label, value, detail]) => (
                    <div key={label} style={summaryCard}>
                      <div style={summaryLabel}>{label}</div>
                      <div style={summaryValue}>
                        {formatQuantity(value)}{" "}
                        {reservationModal.material?.unit || ""}
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
                        style={
                          active ? historyFilterActive : historyFilterButton
                        }
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
                          "Used",
                          "Released",
                          "Notes",
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
                                  {formatStatus(row.order_status)} ·{" "}
                                  {formatStatus(row.payment_status)}
                                </div>
                              </td>
                              <td style={historyTd}>
                                {row.customer_name || "—"}
                              </td>
                              <td style={{ ...historyTd, fontWeight: 600 }}>
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
                                {row.status === "pending_stock" &&
                                !row.reserved_at
                                  ? "Waiting for stock"
                                  : formatDateTime(row.reserved_at)}
                                {row.created_by_name && (
                                  <div style={orderMeta}>
                                    By {row.created_by_name}
                                  </div>
                                )}
                              </td>
                              <td style={historyTd}>
                                {formatDateTime(row.consumed_at)}
                                {row.consumed_by_name && (
                                  <div style={orderMeta}>
                                    By {row.consumed_by_name}
                                  </div>
                                )}
                              </td>
                              <td style={historyTd}>
                                {formatDateTime(row.released_at)}
                                {row.released_by_name && (
                                  <div style={orderMeta}>
                                    By {row.released_by_name}
                                  </div>
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
  fontWeight: 700,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};
const subtitle = { marginTop: 5, fontSize: 12, color: "#71717a" };
const filterRow = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
  marginBottom: 14,
  padding: "12px 14px",
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  flexWrap: "wrap",
};
const filterField = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: "0 0 auto",
};
const filterLabel = {
  fontSize: 11,
  fontWeight: 600,
  color: "#3f3f46",
};
const resultCount = {
  marginLeft: "auto",
  paddingBottom: 9,
  fontSize: 12,
  color: "#71717a",
  whiteSpace: "nowrap",
};
const tableCard = {
  background: "#fff",
  borderRadius: 2,
  border: "1px solid #e4e4e7",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  overflowX: "hidden",
};
const th = {
  textAlign: "left",
  padding: "11px 8px",
  fontSize: 10,
  fontWeight: 600,
  fontFamily: "inherit",
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  lineHeight: 1.3,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
};
const td = {
  padding: "12px 8px",
  color: "#3f3f46",
  verticalAlign: "middle",
  fontSize: 13,
  fontWeight: 400,
  fontFamily: "inherit",
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};
const emptyCell = { ...td, textAlign: "center", color: "#71717a", padding: 32 };
const inputSm = {
  padding: "8px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  fontSize: 13,
  minWidth: 160,
  outline: "none",
  color: "#18181b",
};
const inputFull = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
  color: "#18181b",
};
const labelSm = {
  fontSize: 12,
  fontWeight: 600,
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
  borderRadius: 2,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const btnEdit = {
  minHeight: 30,
  padding: "0 10px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 11.5,
  fontWeight: 600,
  lineHeight: 1,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const btnArchive = {
  background: "#fff",
  color: "#3f3f46",
  border: "1px solid #d4d4d8",
};
const btnDisabled = {
  opacity: 0.5,
  cursor: "not-allowed",
};
const btnHistory = {
  background: "#fff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
};
const quantityLink = {
  padding: 0,
  border: 0,
  background: "transparent",
  color: "#1d4ed8",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.35,
  textDecoration: "none",
  cursor: "pointer",
};
const btnDelete = {
  background: "#fff",
  color: "#b42318",
  border: "1px solid #fecaca",
};
const btnRestore = {
  ...btnEdit,
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
};
const activeBadge = {
  display: "inline-block",
  padding: "2px 9px",
  borderRadius: 2,
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #bbf7d0",
  fontSize: 11,
  fontWeight: 600,
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
  borderRadius: 2,
  width: 380,
  padding: 28,
  boxShadow: "0 20px 60px rgba(0,0,0,.25)",
};
const modalTitle = {
  margin: "0 0 20px",
  fontSize: 18,
  fontWeight: 700,
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
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};
const btnDanger = {
  ...btnGhost,
  color: "#ffffff",
  background: "#b42318",
  border: "1px solid #b42318",
  fontWeight: 600,
};
const modalInfo = {
  margin: "-8px 0 16px",
  padding: "10px 12px",
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  color: "#52525b",
  fontSize: 11.5,
  lineHeight: 1.5,
};
const confirmModalBox = {
  background: "#fff",
  width: "min(430px, calc(100vw - 32px))",
  padding: 24,
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  boxShadow: "0 20px 60px rgba(0,0,0,.25)",
};
const confirmEyebrow = {
  marginBottom: 7,
  color: "#71717a",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const confirmCopy = {
  margin: 0,
  color: "#52525b",
  fontSize: 12.5,
  lineHeight: 1.55,
};

const historyModalBox = {
  background: "#fff",
  borderRadius: 2,
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
  borderRadius: 2,
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
  borderRadius: 2,
  padding: "12px 14px",
  background: "#fafafa",
};
const summaryLabel = {
  fontSize: 10,
  fontWeight: 700,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 1,
};
const summaryValue = {
  marginTop: 5,
  fontSize: 18,
  fontWeight: 700,
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
  borderRadius: 2,
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#52525b",
  fontSize: 11,
  fontWeight: 600,
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
  borderRadius: 2,
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
  borderRadius: 2,
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: "nowrap",
};
const orderLink = {
  padding: 0,
  border: 0,
  background: "transparent",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
};
const orderMeta = {
  marginTop: 3,
  fontSize: 10,
  color: "#71717a",
};


const rowActions = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "nowrap",
};

const moreActionsWrap = {
  position: "relative",
  display: "inline-flex",
};

const btnMore = {
  width: 32,
  minWidth: 32,
  height: 30,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#ffffff",
  color: "#18181b",
  border: "1px solid #d7d9dd",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1,
  cursor: "pointer",
};

const moreActionsMenu = {
  position: "absolute",
  top: "calc(100% + 5px)",
  right: 0,
  zIndex: 30,
  minWidth: 142,
  padding: 4,
  background: "#ffffff",
  border: "1px solid #d7d9dd",
  borderRadius: 2,
  boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
};

const moreActionsItem = {
  width: "100%",
  minHeight: 32,
  padding: "0 9px",
  display: "flex",
  alignItems: "center",
  background: "#ffffff",
  color: "#27272a",
  border: 0,
  borderRadius: 2,
  fontSize: 11.5,
  fontWeight: 500,
  textAlign: "left",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const moreActionsItemDisabled = {
  color: "#a1a1aa",
  cursor: "not-allowed",
};

const moreActionsDanger = {
  color: "#b42318",
};
