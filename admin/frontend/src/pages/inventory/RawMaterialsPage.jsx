// src/pages/inventory/RawMaterialsPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import { FileDown } from "lucide-react";

const STOCK_COLORS = {
  healthy_stock: ["#f0fdf4", "#15803d", "#bbf7d0"],
  low_stock: ["#fffbeb", "#a16207", "#fde68a"],
  critical_stock: ["#fef2f2", "#b91c1c", "#fecaca"],
  out_of_stock: ["#f4f4f5", "#52525b", "#d4d4d8"],
};

const formatQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const DECIMAL_QUANTITY_UNITS = new Set(["meter", "kg", "liter", "gallon"]);

const normalizeQuantityUnit = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const unitAllowsDecimalQuantity = (unit) =>
  DECIMAL_QUANTITY_UNITS.has(normalizeQuantityUnit(unit));

const sanitizeQuantityInput = (value, allowDecimal) => {
  let nextValue = String(value || "");
  if (!allowDecimal) return nextValue.replace(/[^0-9]/g, "");

  nextValue = nextValue.replace(/[^0-9.]/g, "");
  const firstDot = nextValue.indexOf(".");
  if (firstDot === -1) return nextValue;

  const whole = nextValue.slice(0, firstDot);
  const fraction = nextValue
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole}.${fraction}`;
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
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  if (normalized === "consumed") return "Used";
  if (normalized === "pending_stock") return "Waiting for stock";
  const words = normalized.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const formatStockReason = (item = {}) => {
  const reason = String(item.stock_status_reason || "").toLowerCase();
  if (reason === "on_hand_zero") return "Physical stock is zero";
  if (reason === "pending_order_need") return "A blueprint order is waiting for stock";
  if (reason === "all_stock_reserved") return "All on-hand stock is reserved";
  if (reason === "safety_stock") return "At or below safety stock";
  if (reason === "lead_time") {
    const days = Number(item.lead_time_days || 0);
    return days > 0
      ? "May run low during the " + days + "-day restock lead time"
      : "May run low before restock arrives";
  }
  if (reason === "reorder_point") return "At or below reorder point";
  if (reason === "healthy") return "Above current stock limits";
  return "";
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
  ["other", "Other"],
  ["sheet", "Sheet"],
  ["linear", "Linear"],
  ["piece", "Solid"],
  ["hardware", "Hardware"],
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
    category_id: "",
    status: "",
    archive_status: "active",
    date_preset: "all_time",
    from: "",
    to: "",
    page: 1,
  });
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reservationModal, setReservationModal] = useState(null);
  const [reservationFilter, setReservationFilter] = useState("all");
  const [actionMenuId, setActionMenuId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState("filtered");

  const handleDatePreset = (preset) => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    let fromStr = "";
    let toStr = "";

    if (preset === "today") {
      fromStr = today.toISOString().split("T")[0];
      toStr = fromStr;
    } else if (preset === "yesterday") {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      fromStr = y.toISOString().split("T")[0];
      toStr = fromStr;
    } else if (preset === "last_7_days") {
      const y = new Date(today);
      y.setDate(y.getDate() - 7);
      fromStr = y.toISOString().split("T")[0];
      toStr = today.toISOString().split("T")[0];
    } else if (preset === "last_30_days") {
      const y = new Date(today);
      y.setDate(y.getDate() - 30);
      fromStr = y.toISOString().split("T")[0];
      toStr = today.toISOString().split("T")[0];
    }

    setFilters((current) => ({
      ...current,
      date_preset: preset,
      from: fromStr,
      to: toStr,
      page: 1,
    }));
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const params =
        exportScope === "filtered"
          ? {
              limit: 5000,
              search: filters.search || undefined,
              category_id: filters.category_id || undefined,
              status: filters.status || undefined,
              archive_status: filters.archive_status || undefined,
              from: filters.from || undefined,
              to: filters.to || undefined,
            }
          : { limit: 5000, archive_status: "all" };

      const { data } = await api.get("/inventory/raw", { params });
      const rows = data.rows || [];
      if (!rows.length) {
        toast.error("No materials found to export.");
        return;
      }

      const wb = XLSX.utils.book_new();
      const exportData = [
        [{ v: "RAW MATERIALS INVENTORY REPORT", s: { font: { bold: true } } }],
        [],
        [
          "Material Name",
          "Category",
          "Supplier",
          "Unit",
          "On Hand",
          "Reserved",
          "Available",
          "Order Need",
          "Safety Stock",
          "Reorder",
          "Lead Time",
          "30-Day Avg Use / Day",
          "Lead-Time Need",
          "Supplier Price",
          "Stock Level",
          "Status Reason",
        ].map((t) => ({
          v: t,
          s: {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "000000" } },
          },
        })),
      ];

      rows.forEach((row) => {
        const onHand = Number(row.on_hand_quantity ?? row.quantity ?? 0);
        const reserved = Number(row.reserved_quantity || 0);
        const available = Number(
          row.available_quantity ?? Math.max(0, onHand - reserved),
        );
        const needed = Number(row.pending_need_quantity || 0);
        const cost = Number(row.unit_cost || 0);

        exportData.push([
          row.name,
          row.category_name || "Uncategorized",
          row.supplier_name || "—",
          row.unit,
          onHand,
          reserved,
          available,
          needed,
          Number(row.safety_stock || 0),
          Number(row.reorder_point || 0),
          Number(row.lead_time_days || 0),
          Number(row.avg_daily_usage_30d || 0),
          Number(row.lead_time_need_quantity || 0),
          cost,
          String(row.availability_status || row.stock_status || "")
            .replace(/_/g, " ")
            .toUpperCase(),
          formatStockReason(row) || "—",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 35 },
        { wch: 20 },
        { wch: 25 },
        { wch: 16 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 18 },
        { wch: 14 },
        { wch: 15 },
        { wch: 16 },
        { wch: 20 },
        { wch: 16 },
        { wch: 18 },
        { wch: 16 },
        { wch: 34 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Raw Materials");
      XLSX.writeFile(
        wb,
        `Raw-Materials-Report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success("Excel report exported successfully.");
    } catch (err) {
      toast.error("Failed to export report.");
    } finally {
      setExporting(false);
    }
  };

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

  const pageCount = Math.max(1, Math.ceil(total / 20));

  const loadCategories = useCallback(async () => {
    const { data } = await api.get("/inventory/raw/categories");
    setCategories(Array.isArray(data?.categories) ? data.categories : []);
  }, []);

  useEffect(() => {
    api.get("/suppliers").then((r) => setSuppliers(r.data || []));
    loadCategories().catch(() => {});
  }, [loadCategories]);

  const openAdd = () =>
    setModal({
      mode: "add",
      data: {
        name: "",
        category_id: "",
        unit: "",
        material_form: "other",
        length_mm: "",
        width_mm: "",
        thickness_mm: "",
        quantity: 0,
        reorder_point: 0,
        safety_stock: 0,
        lead_time_days: 0,
        unit_cost: 0,
        supplier_id: "",
      },
    });

  const openEdit = (item) =>
    setModal({
      mode: "edit",
      data: { ...item, category_id: item.category_id || "" },
    });

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

    if (modal?.mode === "add" && !modal?.data?.category_id) {
      toast.error("Select a raw material category.");
      return;
    }

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

  const handleCreateCategory = async () => {
    const value = window.prompt("Enter a new raw material category name:");
    if (value === null) return;

    const name = value.trim();
    if (!name) {
      toast.error("Category name is required.");
      return;
    }

    try {
      const { data } = await api.post("/inventory/raw/categories", { name });
      const category = data?.category;
      await loadCategories();
      if (category?.id) {
        setModal((current) =>
          current
            ? {
                ...current,
                data: { ...current.data, category_id: String(category.id) },
              }
            : current,
        );
      }
      toast.success(data?.message || "Category added.");
    } catch (error) {
      // Global API interceptor shows the server message.
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
  const modalAllowsDecimalQuantity = unitAllowsDecimalQuantity(
    modal?.data?.unit,
  );

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
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => setExportOpen(true)}
            style={{
              padding: "9px 18px",
              background: "#ffffff",
              color: "#18181b",
              border: "1px solid #d4d4d8",
              borderRadius: "2px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <FileDown size={14} />
            {exporting ? "Exporting..." : "Export Report"}
          </button>
          <button onClick={openAdd} style={btnPrimary}>
            Add material
          </button>
        </div>
      </div>

      <div style={filterRow}>
        <div
          style={{
            ...filterField,
            flex: "0 1 520px",
            width: "min(520px, 100%)",
          }}
        >
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
          <label style={filterLabel}>Category</label>
          <select
            value={filters.category_id}
            onChange={(e) =>
              setFilters((current) => ({
                ...current,
                category_id: e.target.value,
                page: 1,
              }))
            }
            style={inputSm}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
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
            <option value="out_of_stock">Out of stock</option>
            <option value="critical_stock">Critical stock</option>
            <option value="low_stock">Low stock</option>
            <option value="healthy_stock">Healthy stock</option>
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

        <div style={filterField}>
          <label style={filterLabel}>Date Added</label>
          <select
            value={filters.date_preset}
            onChange={(e) => handleDatePreset(e.target.value)}
            style={inputSm}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="all_time">All Time</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {filters.date_preset === "custom" && (
          <>
            <div style={filterField}>
              <label style={filterLabel}>From</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    from: e.target.value,
                    page: 1,
                  }))
                }
                style={inputSm}
              />
            </div>
            <div style={filterField}>
              <label style={filterLabel}>To</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    to: e.target.value,
                    page: 1,
                  }))
                }
                style={inputSm}
              />
            </div>
          </>
        )}

        <span style={resultCount}>
          {total.toLocaleString("en-PH")} material{total === 1 ? "" : "s"}
        </span>
      </div>

      <div style={tableCard}>
        <table
          style={{
            width: "100%",
            minWidth: "1260px", // Keep the added category column readable
            borderCollapse: "collapse",
            tableLayout: "fixed",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Material",
                "Category",
                "Supplier",
                "Unit",
                "On Hand",
                "Reserved",
                "Available",
                "Order Need",
                "Reorder",
                "Supplier Price",
                "Stock Level",
                "Actions",
              ].map((heading) => (
                <th
                  key={heading}
                  style={{
                    ...th,
                    ...(heading === "Actions" ? { paddingRight: "16px" } : {}),
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
                      {item.category_name || "Uncategorized"}
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
                      {formatQuantity(item.reorder_point)}
                    </td>
                    <td style={td}>₱ {Number(item.unit_cost).toFixed(2)}</td>
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
                      {formatStockReason(item) && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 10,
                            lineHeight: 1.3,
                            color: "#71717a",
                          }}
                        >
                          {formatStockReason(item)}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        whiteSpace: "normal",
                        paddingRight: "16px",
                      }}
                    >
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
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div style={paginationRow}>
          <span style={{ fontSize: 12, color: "#71717a" }}>
            Page {filters.page} of {pageCount} · {total.toLocaleString("en-PH")}{" "}
            material{total === 1 ? "" : "s"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={filters.page <= 1}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
              style={filters.page <= 1 ? btnDisabled : btnGhost}
            >
              Previous
            </button>
            <button
              disabled={filters.page >= pageCount}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
              style={filters.page >= pageCount ? btnDisabled : btnGhost}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {modal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3 style={modalTitle}>
              {modal.mode === "add" ? "Add Raw Material" : "Edit Raw Material"}
            </h3>
            {modal.mode === "add" && (
              <div style={modalInfo}>
                Enter the material name only. Add dimensions separately when needed.
                Add stock through Stock Movements so every change is recorded.
              </div>
            )}
            <form onSubmit={handleSave}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "14px 18px",
                  marginBottom: "18px",
                }}
              >
                {/* 1. Name (Full Width) */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelSm}>Material Name *</label>
                  <input
                    type="text"
                    required
                    value={modal.data.name ?? ""}
                    onChange={(e) => setField("name", e.target.value)}
                    style={inputFull}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <label style={labelSm}>
                      Category {modal.mode === "add" ? "*" : ""}
                    </label>
                    <button
                      type="button"
                      onClick={handleCreateCategory}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        color: "#18181b",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      + Add category
                    </button>
                  </div>
                  <select
                    required={modal.mode === "add"}
                    value={modal.data.category_id ?? ""}
                    onChange={(e) => setField("category_id", e.target.value)}
                    style={inputFull}
                  >
                    <option value="">
                      {modal.mode === "add" ? "Select category" : "Uncategorized"}
                    </option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {categories.length === 0 && (
                    <div style={{ marginTop: 5, fontSize: 11, color: "#71717a" }}>
                      No raw material categories yet. Use “+ Add category” first.
                    </div>
                  )}
                </div>

                {/* 2. Unit & Material Type (Side by Side) */}
                <div>
                  <label style={labelSm}>Unit *</label>
                  <select
                    required
                    value={modal.data.unit ?? ""}
                    onChange={(e) => setField("unit", e.target.value)}
                    style={inputFull}
                  >
                    <option value="">Select unit of measure</option>
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="sheet">Sheet</option>
                    <option value="meter">Meter</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="liter">Liter (L)</option>
                    <option value="set">Set</option>
                    <option value="box">Box</option>
                    <option value="roll">Roll</option>
                    <option value="gallon">Gallon</option>
                    <option value="container">Container</option>
                  </select>
                </div>

                <div>
                  <label style={labelSm}>Form</label>
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
                            ? { length_mm: "", width_mm: "", thickness_mm: "" }
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
                </div>

                {/* 3. Optional Physical Dimensions (Full Width, Nested Grid) */}
                {showPhysicalDimensions && (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "10px",
                      padding: "12px",
                      background: "#fafafa",
                      border: "1px solid #e4e4e7",
                      borderRadius: "2px",
                    }}
                  >
                    {[
                      ["Length (mm)", "length_mm"],
                      ["Width (mm)", "width_mm"],
                      ["Thickness (mm)", "thickness_mm"],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <label style={labelSm}>
                          {label} {requiresCompletePhysicalSize ? " *" : ""}
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
                            )
                              e.preventDefault();
                          }}
                          style={inputFull}
                        />
                      </div>
                    ))}
                    <div
                      style={{
                        ...fieldHelp,
                        gridColumn: "1 / -1",
                        marginTop: 4,
                      }}
                    >
                      {currentMaterialForm === "sheet"
                        ? "Example: 2440 × 1220 × 18 mm."
                        : "Optional dimensions in millimeters."}
                    </div>
                  </div>
                )}

                {/* 4. Pricing & Limits (Side by side) */}
                <div>
                  <label style={labelSm}>Supplier Price (₱)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={modal.data.unit_cost ?? ""}
                    onChange={(e) => setField("unit_cost", e.target.value)}
                    style={inputFull}
                  />
                </div>

                <div>
                  <label style={labelSm}>Lead Time</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={modal.data.lead_time_days ?? ""}
                    onChange={(e) =>
                      setField(
                        "lead_time_days",
                        String(e.target.value || "").replace(/[^0-9]/g, ""),
                      )
                    }
                    style={inputFull}
                  />
                </div>

                <div>
                  <label style={labelSm}>Reorder</label>
                  <input
                    type="text"
                    inputMode={modalAllowsDecimalQuantity ? "decimal" : "numeric"}
                    value={modal.data.reorder_point ?? ""}
                    onChange={(e) =>
                      setField(
                        "reorder_point",
                        sanitizeQuantityInput(
                          e.target.value,
                          modalAllowsDecimalQuantity,
                        ),
                      )
                    }
                    style={inputFull}
                  />
                </div>

                <div>
                  <label style={labelSm}>Safety Stock</label>
                  <input
                    type="text"
                    inputMode={modalAllowsDecimalQuantity ? "decimal" : "numeric"}
                    value={modal.data.safety_stock ?? ""}
                    onChange={(e) =>
                      setField(
                        "safety_stock",
                        sanitizeQuantityInput(
                          e.target.value,
                          modalAllowsDecimalQuantity,
                        ),
                      )
                    }
                    style={inputFull}
                  />
                </div>

                {/* 5. Quantity (Only shown on Edit) */}
                {modal.mode === "edit" && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelSm}>Quantity</label>
                    <input
                      type="number"
                      readOnly
                      value={modal.data.quantity ?? ""}
                      style={{ ...inputFull, ...lockedInput }}
                    />
                    <div style={fieldHelp}>
                      Use Stock Movement to change on-hand quantity so the
                      physical stock change is recorded.
                    </div>
                  </div>
                )}

                {/* 6. Supplier (Full Width) */}
                <div style={{ gridColumn: "1 / -1" }}>
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
                  {saving
                    ? "Saving..."
                    : modal.mode === "add"
                      ? "Add material"
                      : "Save changes"}
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
              {confirmAction.type === "delete"
                ? "Permanent action"
                : "Inventory record"}
            </div>
            <h3 style={{ ...modalTitle, marginBottom: 8 }}>
              {confirmAction.type === "delete"
                ? "Delete raw material?"
                : "Archive raw material?"}
            </h3>
            <p style={confirmCopy}>
              {confirmAction.type === "delete"
                ? 'Delete "' +
                  confirmAction.item.name +
                  '" permanently? This is only available when the material has no linked or historical records.'
                : 'Archive "' +
                  confirmAction.item.name +
                  '"? It will be hidden from active inventory and new material selectors, while its history stays available.'}
            </p>
            <div style={modalActions}>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                style={btnGhost}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMaterialAction}
                style={confirmAction.type === "delete" ? btnDanger : btnPrimary}
              >
                {confirmAction.type === "delete"
                  ? "Delete permanently"
                  : "Archive material"}
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
                  Review how this material was reserved, used, or released for
                  blueprint orders.
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
      {exportOpen && (
        <div style={modalBackdrop}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-materials-title"
            style={{ ...dialog, width: "min(520px, 100%)" }}
          >
            <div style={dialogEyebrow}>Report Generation</div>

            <h2 id="export-materials-title" style={dialogTitle}>
              Export raw materials report
            </h2>

            <p style={{ ...dialogText, marginBottom: 16 }}>
              Create an Excel report using the selected raw-material scope.
            </p>

            <div style={exportScopeList}>
              <button
                type="button"
                onClick={() => setExportScope("filtered")}
                style={{
                  ...exportScopeOption,
                  ...(exportScope === "filtered"
                    ? exportScopeOptionSelected
                    : {}),
                }}
                disabled={exporting}
              >
                <span style={exportScopeTitle}>Current filters</span>

                <span style={exportScopeMeta}>
                  {total.toLocaleString("en-PH")} matching material
                  {total === 1 ? "" : "s"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExportScope("all")}
                style={{
                  ...exportScopeOption,
                  ...(exportScope === "all" ? exportScopeOptionSelected : {}),
                }}
                disabled={exporting}
              >
                <span style={exportScopeTitle}>All materials</span>

                <span style={exportScopeMeta}>
                  Export entire active catalog
                </span>
              </button>
            </div>

            <div style={exportContents}>
              <div style={exportContentsLabel}>Included in Excel</div>

              <div style={exportContentsText}>
                Catalog summary, availability, order need, reorder point, and
                total physical value.
              </div>
            </div>

            <div style={dialogActions}>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                style={btnSecondaryExport}
                disabled={exporting}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExportReport}
                style={{
                  ...btnPrimaryExport,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  opacity: exporting ? 0.65 : 1,
                  cursor: exporting ? "wait" : "pointer",
                }}
                disabled={exporting}
              >
                <FileDown size={14} strokeWidth={1.8} aria-hidden="true" />

                {exporting ? "Preparing..." : "Export Excel"}
              </button>
            </div>
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
  overflowX: "auto",
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
  whiteSpace: "nowrap",
};
const td = {
  padding: "12px 8px",
  color: "#3f3f46",
  verticalAlign: "middle",
  fontSize: 13,
  fontWeight: 400,
  fontFamily: "inherit",
  lineHeight: 1.35,
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
  width: 680,
  maxWidth: "95vw",
  maxHeight: "90vh",
  overflowY: "auto",
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

const paginationRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 14,
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

const exportScopeList = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 12,
};
const exportScopeOption = {
  minHeight: 76,
  padding: "12px 13px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  gap: 5,
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  textAlign: "left",
  cursor: "pointer",
};
const exportScopeOptionSelected = {
  background: "#fafafa",
  borderColor: "#18181b",
  boxShadow: "inset 0 0 0 1px #18181b",
};
const exportScopeTitle = {
  color: "#18181b",
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1.25,
};
const exportScopeMeta = {
  color: "#71717a",
  fontSize: 10.5,
  fontWeight: 400,
  lineHeight: 1.35,
};
const exportContents = {
  marginBottom: 18,
  padding: "11px 12px",
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
};
const exportContentsLabel = {
  marginBottom: 4,
  color: "#3f3f46",
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const exportContentsText = {
  color: "#71717a",
  fontSize: 11.5,
  fontWeight: 400,
  lineHeight: 1.45,
};
const dialog = {
  width: "min(430px, 100%)",
  padding: 20,
  background: "#ffffff",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  boxShadow: "0 18px 48px rgba(0,0,0,0.18)",
};
const dialogEyebrow = {
  marginBottom: 6,
  color: "#71717a",
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};
const dialogTitle = {
  margin: 0,
  color: "#18181b",
  fontSize: 18,
  fontWeight: 700,
};
const dialogText = {
  margin: "8px 0 20px",
  color: "#52525b",
  fontSize: 13,
  fontWeight: 400,
  lineHeight: 1.5,
};
const dialogActions = { display: "flex", justifyContent: "flex-end", gap: 8 };
const btnSecondaryExport = {
  minHeight: 36,
  padding: "0 14px",
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};
const btnPrimaryExport = {
  minHeight: 36,
  padding: "0 14px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const modalBackdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0,0,0,0.42)",
};
