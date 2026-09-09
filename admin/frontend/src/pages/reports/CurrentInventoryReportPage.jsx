import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";
import "./CurrentInventoryReportPage.css";

const INVENTORY_TYPES = [
  { value: "", label: "All Inventory" },
  { value: "raw", label: "Raw Materials" },
  { value: "ready_made", label: "Ready-made" },
];

const STOCK_STATUSES = [
  { value: "", label: "All Stock Health" },
  { value: "healthy_stock", label: "Healthy" },
  { value: "low_stock", label: "Low Stock" },
  { value: "critical_stock", label: "Critical Stock" },
  { value: "out_of_stock", label: "Out of Stock" },
  { value: "history_unavailable", label: "History Unavailable" },
];

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeHealthStatus = (value) => {
  const status = normalize(value);

  if (status === "in_stock" || status === "healthy") {
    return "healthy_stock";
  }

  if (
    [
      "healthy_stock",
      "low_stock",
      "critical_stock",
      "out_of_stock",
      "history_unavailable",
    ].includes(status)
  ) {
    return status;
  }

  return status || "out_of_stock";
};

const statusLabel = (value) => {
  const status = normalizeHealthStatus(value);

  if (status === "healthy_stock") return "Healthy";
  if (status === "low_stock") return "Low Stock";
  if (status === "critical_stock") return "Critical Stock";
  if (status === "out_of_stock") return "Out of Stock";
  if (status === "history_unavailable") return "History Unavailable";

  return String(value || "Unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const humanize = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatQuantity = (value, maximumFractionDigits = 2) => {
  if (value === null || value === undefined || value === "") return "—";

  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  return number.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
};

const numericOrBlank = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatReportDate = (value) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
};

const getManilaDateInput = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const materialSpec = (row) => {
  const form = humanize(row?.material_form || "other");
  const dimensions = [
    row?.length_mm,
    row?.width_mm,
    row?.thickness_mm,
  ].filter((value) => value !== null && value !== undefined && value !== "");

  if (dimensions.length === 0) return form;

  return `${form} • ${dimensions
    .map((value) => formatQuantity(value))
    .join(" × ")} mm`;
};

const readyLocationNote = (row) => {
  const total =
    row?.total_stock === null || row?.total_stock === undefined
      ? null
      : Number(row.total_stock);
  const warehouse =
    row?.warehouse_stock === null || row?.warehouse_stock === undefined
      ? null
      : Number(row.warehouse_stock);
  const display =
    row?.display_stock === null || row?.display_stock === undefined
      ? null
      : Number(row.display_stock);

  if (total === null || warehouse === null || display === null) {
    return "Historical stock unavailable";
  }
  if (display > total) return "Allocation needs review";
  if (total <= 0) return "No stock";
  if (warehouse <= 0 && display > 0) return "Warehouse empty";
  if (display <= 0 && warehouse > 0) return "Display empty";
  if (warehouse > 0 && display > 0) return "Stock in both areas";

  return "Review stock";
};

const buildSearchText = (...values) =>
  values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

function StatusBadge({ value }) {
  const normalized = normalizeHealthStatus(value);

  return (
    <span className={`cir-status cir-status-${normalized}`}>
      {statusLabel(normalized)}
    </span>
  );
}

function SummaryCard({ label, value, note }) {
  return (
    <div className="cir-summary-card">
      <div className="cir-summary-label">{label}</div>
      <div className="cir-summary-value">{value}</div>
      {note ? <div className="cir-summary-note">{note}</div> : null}
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="cir-empty-cell">
        {text}
      </td>
    </tr>
  );
}

export default function CurrentInventoryReportPage() {
  const { user } = useAuthStore();
  const todayManila = useMemo(() => getManilaDateInput(), []);

  const [rawMaterials, setRawMaterials] = useState([]);
  const [readyMade, setReadyMade] = useState([]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [reportMeta, setReportMeta] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const [reportDate, setReportDate] = useState(todayManila);
  const [appliedReportDate, setAppliedReportDate] = useState(todayManila);
  const [search, setSearch] = useState("");
  const [inventoryType, setInventoryType] = useState("");
  const [stockStatus, setStockStatus] = useState("");

  const loadReport = useCallback(async (dateValue) => {
    const targetDate = String(dateValue || "").trim();
    if (!targetDate) return;

    setLoading(true);
    setError("");

    try {
      const response = await api.get("/inventory/report", {
        params: { date: targetDate },
      });

      const rawRows = Array.isArray(response.data?.raw_materials)
        ? response.data.raw_materials
        : [];
      const readyRows = Array.isArray(response.data?.ready_made)
        ? response.data.ready_made
        : [];

      setRawMaterials(rawRows);
      setReadyMade(readyRows);
      setGeneratedAt(response.data?.generated_at || new Date().toISOString());
      setWarnings(
        Array.isArray(response.data?.warnings) ? response.data.warnings : [],
      );
      setReportMeta({
        report_date: response.data?.report_date || targetDate,
        as_of_at: response.data?.as_of_at || "",
        is_current_date: Boolean(response.data?.is_current_date),
        history_complete: response.data?.history_complete !== false,
        scope:
          response.data?.scope ||
          "Currently active inventory records that existed by the selected report date.",
      });
      setAppliedReportDate(response.data?.report_date || targetDate);
    } catch (err) {
      setRawMaterials([]);
      setReadyMade([]);
      setGeneratedAt("");
      setWarnings([]);
      setReportMeta(null);
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to load the Inventory report.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    loadReport(todayManila);
  }, [loadReport, todayManila]);

  const normalizedSearch = normalize(search);

  const filteredRaw = useMemo(() => {
    if (inventoryType === "ready_made") return [];

    return rawMaterials.filter((row) => {
      const health = normalizeHealthStatus(
        row.availability_status || row.stock_status,
      );

      if (stockStatus && health !== stockStatus) return false;

      if (!normalizedSearch) return true;

      return buildSearchText(
        row.name,
        row.category_name,
        row.supplier_name,
        row.unit,
        row.material_form,
      ).includes(normalizedSearch);
    });
  }, [inventoryType, normalizedSearch, rawMaterials, stockStatus]);

  const filteredReadyMade = useMemo(() => {
    if (inventoryType === "raw") return [];

    return readyMade.filter((row) => {
      const health = normalizeHealthStatus(row.stock_status);

      if (stockStatus && health !== stockStatus) return false;

      if (!normalizedSearch) return true;

      return buildSearchText(row.name, row.barcode).includes(normalizedSearch);
    });
  }, [inventoryType, normalizedSearch, readyMade, stockStatus]);

  const summary = useMemo(() => {
    const combinedStatuses = [
      ...filteredRaw.map((row) =>
        normalizeHealthStatus(row.availability_status || row.stock_status),
      ),
      ...filteredReadyMade.map((row) =>
        normalizeHealthStatus(row.stock_status),
      ),
    ];

    const alertCount = combinedStatuses.filter(
      (status) =>
        status !== "healthy_stock" && status !== "history_unavailable",
    ).length;

    const unavailableCount = combinedStatuses.filter(
      (status) => status === "history_unavailable",
    ).length;

    const pendingNeedCount = filteredRaw.filter(
      (row) => Number(row.pending_need_quantity || 0) > 0,
    ).length;

    const readyUnits = filteredReadyMade.reduce((sum, row) => {
      const value = Number(row.total_stock);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    return {
      inventoryItems: filteredRaw.length + filteredReadyMade.length,
      rawCount: filteredRaw.length,
      readyCount: filteredReadyMade.length,
      readyUnits,
      alertCount,
      unavailableCount,
      pendingNeedCount,
    };
  }, [filteredRaw, filteredReadyMade]);

  const generatedBy =
    String(user?.name || user?.full_name || "").trim() || "Administrator";

  const clearFilters = () => {
    setSearch("");
    setInventoryType("");
    setStockStatus("");
  };

  const applyReportDate = () => {
    if (!reportDate) {
      toast.error("Select a report date.");
      return;
    }
    if (reportDate > todayManila) {
      toast.error("Report date cannot be in the future.");
      return;
    }
    loadReport(reportDate);
  };

  const showToday = () => {
    setReportDate(todayManila);
    loadReport(todayManila);
  };

  const exportExcel = async () => {
    if (!generatedAt || loading || !appliedReportDate) return;

    setExporting(true);

    try {
      const workbook = XLSX.utils.book_new();

      const titleStyle = {
        font: { bold: true, color: { rgb: "111827" } },
      };

      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "18181B" } },
        border: {
          top: { style: "thin", color: { rgb: "D1D5DB" } },
          bottom: { style: "thin", color: { rgb: "D1D5DB" } },
          left: { style: "thin", color: { rgb: "D1D5DB" } },
          right: { style: "thin", color: { rgb: "D1D5DB" } },
        },
      };

      const cellStyle = {
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };

      const title = (value) => ({ v: value, s: titleStyle });
      const header = (value) => ({ v: value, s: headerStyle });
      const cell = (value) => ({ v: value ?? "", s: cellStyle });

      const typeLabel =
        INVENTORY_TYPES.find((item) => item.value === inventoryType)?.label ||
        "All Inventory";
      const healthLabel =
        STOCK_STATUSES.find((item) => item.value === stockStatus)?.label ||
        "All Stock Health";

      const summaryData = [
        [title("SPIRAL WOOD SERVICES - INVENTORY REPORT")],
        [title("As of Date:"), formatReportDate(appliedReportDate)],
        [title("Generated:"), formatDateTime(generatedAt)],
        [title("Generated By:"), generatedBy],
        [title("Scope:"), reportMeta?.scope || "Active inventory"],
        [title("Inventory Type:"), typeLabel],
        [title("Stock Health:"), healthLabel],
        [title("Search:"), search.trim() || "None"],
        [title("History Status:"), warnings.length ? "Review warnings" : "Complete"],
        [],
        [title("REPORT SUMMARY")],
        [
          "Inventory Items",
          "Raw Materials",
          "Ready-made SKUs",
          "Ready-made Units",
          "Stock Alerts",
          "History Unavailable",
        ].map(header),
        [
          summary.inventoryItems,
          summary.rawCount,
          summary.readyCount,
          summary.readyUnits,
          summary.alertCount,
          summary.unavailableCount,
        ].map(cell),
      ];

      if (warnings.length > 0) {
        summaryData.push([], [title("HISTORY WARNINGS")]);
        warnings.forEach((warning) => summaryData.push([cell(warning)]));
      }

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet["!cols"] = [
        { wch: 28 },
        { wch: 28 },
        { wch: 24 },
        { wch: 24 },
        { wch: 22 },
        { wch: 24 },
      ];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      const rawData = [
        [
          "Material",
          "Category",
          "Supplier",
          "Form / Size",
          "Unit",
          "On Hand",
          "Reserved",
          "Available",
          "Pending Need",
          "Reorder Point",
          "Safety Stock",
          "Stock Health",
        ].map(header),
        ...filteredRaw.map((row) =>
          [
            row.name || "—",
            row.category_name || "Uncategorized",
            row.supplier_name || "—",
            materialSpec(row),
            row.unit || "—",
            numericOrBlank(row.on_hand_quantity),
            numericOrBlank(row.reserved_quantity),
            numericOrBlank(row.available_quantity),
            numericOrBlank(row.pending_need_quantity),
            numericOrBlank(row.reorder_point),
            numericOrBlank(row.safety_stock),
            statusLabel(row.availability_status || row.stock_status),
          ].map(cell),
        ),
      ];

      const rawSheet = XLSX.utils.aoa_to_sheet(rawData);
      rawSheet["!cols"] = [
        { wch: 34 },
        { wch: 22 },
        { wch: 26 },
        { wch: 30 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(workbook, rawSheet, "Raw Materials");

      const readyData = [
        [
          "Product",
          "Barcode",
          "Total Stock",
          "Warehouse",
          "Display Area",
          "Reorder Point",
          "Stock Health",
          "Location Note",
        ].map(header),
        ...filteredReadyMade.map((row) =>
          [
            row.name || "—",
            row.barcode || "—",
            numericOrBlank(row.total_stock),
            numericOrBlank(row.warehouse_stock),
            numericOrBlank(row.display_stock),
            numericOrBlank(row.reorder_point),
            statusLabel(row.stock_status),
            readyLocationNote(row),
          ].map(cell),
        ),
      ];

      const readySheet = XLSX.utils.aoa_to_sheet(readyData);
      readySheet["!cols"] = [
        { wch: 36 },
        { wch: 20 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 20 },
        { wch: 28 },
      ];
      XLSX.utils.book_append_sheet(workbook, readySheet, "Ready-Made");

      const stamp = new Date(generatedAt)
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);

      XLSX.writeFile(
        workbook,
        `wisdom_inventory_report_${appliedReportDate}_${stamp}.xlsx`,
      );

      toast.success("Inventory report exported.");
    } catch (err) {
      toast.error("Failed to export the Inventory report.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="current-inventory-report">
      <div className="cir-page-header">
        <div>
          <h1>Inventory Report</h1>
          <p>
            Stock position of Raw Materials and Ready-made inventory as of the
            selected report date, including reservations and Warehouse / Display
            allocation.
          </p>
        </div>

        <div className="cir-header-actions cir-no-print">
          <button
            type="button"
            className="cir-button cir-button-secondary"
            onClick={() => loadReport(appliedReportDate)}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="cir-button cir-button-primary"
            onClick={exportExcel}
            disabled={loading || !generatedAt || exporting}
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      <div className="cir-as-of-card">
        <div className="cir-as-of-main">
          <span className="cir-as-of-label">As of Date</span>
          <strong className="cir-as-of-date">
            {formatReportDate(appliedReportDate)}
          </strong>
        </div>
        <span className="cir-as-of-note">
          {reportMeta?.is_current_date
            ? "Current inventory snapshot at the time this report was loaded."
            : "Closing inventory reconstructed for the selected Philippine calendar date."}
        </span>
      </div>

      <div className="cir-report-meta">
        <span>
          <strong>Generated:</strong> {formatDateTime(generatedAt)}
        </span>
        <span>
          <strong>Generated By:</strong> {generatedBy}
        </span>
        <span>
          <strong>Scope:</strong>{" "}
          {reportMeta?.scope || "Active inventory records"}
        </span>
      </div>

      {warnings.length > 0 ? (
        <div className="cir-warning">
          <strong>Historical data warning:</strong>{" "}
          {warnings.length} item/history issue(s) could not be reconstructed
          safely. Unavailable quantities are shown as “—” instead of being
          guessed.
        </div>
      ) : null}

      <div className="cir-toolbar cir-no-print">
        <label className="cir-filter-field cir-date-field">
          <span>Report Date</span>
          <input
            type="date"
            value={reportDate}
            max={todayManila}
            onChange={(event) => setReportDate(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="cir-button cir-button-primary cir-apply-date-button"
          onClick={applyReportDate}
          disabled={loading || !reportDate || reportDate === appliedReportDate}
        >
          Apply Date
        </button>

        <button
          type="button"
          className="cir-button cir-button-secondary cir-today-button"
          onClick={showToday}
          disabled={loading || appliedReportDate === todayManila}
        >
          Today
        </button>

        <label className="cir-filter-field cir-search-field">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Material, product, barcode, category..."
            maxLength={120}
          />
        </label>

        <label className="cir-filter-field">
          <span>Inventory Type</span>
          <select
            value={inventoryType}
            onChange={(event) => setInventoryType(event.target.value)}
          >
            {INVENTORY_TYPES.map((item) => (
              <option key={item.value || "all"} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="cir-filter-field">
          <span>Stock Health</span>
          <select
            value={stockStatus}
            onChange={(event) => setStockStatus(event.target.value)}
          >
            {STOCK_STATUSES.map((item) => (
              <option key={item.value || "all"} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="cir-button cir-button-secondary cir-clear-button"
          onClick={clearFilters}
          disabled={!search && !inventoryType && !stockStatus}
        >
          Clear Filters
        </button>
      </div>

      {error ? <div className="cir-error">{error}</div> : null}
      {loading ? (
        <div className="cir-loading">Loading inventory report...</div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="cir-summary-grid">
            <SummaryCard
              label="Inventory Items"
              value={formatQuantity(summary.inventoryItems, 0)}
              note="SKUs/material records in the current filtered view"
            />
            <SummaryCard
              label="Raw Materials"
              value={formatQuantity(summary.rawCount, 0)}
              note="Active raw material records shown"
            />
            <SummaryCard
              label="Ready-made SKUs"
              value={formatQuantity(summary.readyCount, 0)}
              note="Active finished-product records shown"
            />
            <SummaryCard
              label="Ready-made Units"
              value={formatQuantity(summary.readyUnits, 0)}
              note="Historical company-wide finished-product units shown"
            />
            <SummaryCard
              label="Stock Alerts"
              value={formatQuantity(summary.alertCount, 0)}
              note={
                summary.unavailableCount > 0
                  ? `${summary.unavailableCount} item(s) have unavailable history`
                  : `${formatQuantity(
                      summary.pendingNeedCount,
                      0,
                    )} raw material item(s) have pending order need`
              }
            />
          </div>

          {inventoryType !== "ready_made" ? (
            <section className="cir-card">
              <div className="cir-section-head">
                <div>
                  <h2>Raw Materials</h2>
                  <p>
                    On Hand is reconstructed physical system stock. Reserved and
                    Pending Need use recorded Blueprint reservation lifecycle
                    timestamps. Available is On Hand minus Reserved.
                  </p>
                </div>
                <div className="cir-section-count">
                  {formatQuantity(filteredRaw.length, 0)} item(s)
                </div>
              </div>

              <div className="cir-table-scroll">
                <table className="cir-table cir-raw-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Unit</th>
                      <th className="cir-align-right">On Hand</th>
                      <th className="cir-align-right">Reserved</th>
                      <th className="cir-align-right">Available</th>
                      <th className="cir-align-right">Pending Need</th>
                      <th className="cir-align-right">Reorder Point</th>
                      <th className="cir-align-right">Safety Stock</th>
                      <th>Stock Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRaw.length === 0 ? (
                      <EmptyRow
                        colSpan={9}
                        text="No Raw Materials match the current filters."
                      />
                    ) : (
                      filteredRaw.map((row) => (
                        <tr key={`raw-${row.id}`}>
                          <td>
                            <div className="cir-primary-text">
                              {row.name || "Unnamed material"}
                            </div>
                            <div className="cir-secondary-text">
                              {row.category_name || "Uncategorized"} •{" "}
                              {materialSpec(row)}
                              {row.supplier_name
                                ? ` • ${row.supplier_name}`
                                : ""}
                            </div>
                          </td>
                          <td>{row.unit || "—"}</td>
                          <td className="cir-align-right cir-key-number">
                            {formatQuantity(row.on_hand_quantity)}
                          </td>
                          <td className="cir-align-right">
                            {formatQuantity(row.reserved_quantity)}
                          </td>
                          <td className="cir-align-right cir-key-number">
                            {formatQuantity(row.available_quantity)}
                          </td>
                          <td className="cir-align-right">
                            {formatQuantity(row.pending_need_quantity)}
                          </td>
                          <td className="cir-align-right">
                            {formatQuantity(row.reorder_point)}
                          </td>
                          <td className="cir-align-right">
                            {formatQuantity(row.safety_stock)}
                          </td>
                          <td>
                            <StatusBadge
                              value={
                                row.availability_status || row.stock_status
                              }
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {inventoryType !== "raw" ? (
            <section className="cir-card">
              <div className="cir-section-head">
                <div>
                  <h2>Ready-made Products</h2>
                  <p>
                    Total Stock is reconstructed company-wide inventory.
                    Warehouse and Display use recorded internal Stock Transfer
                    before/after snapshots.
                  </p>
                </div>
                <div className="cir-section-count">
                  {formatQuantity(filteredReadyMade.length, 0)} SKU(s)
                </div>
              </div>

              <div className="cir-table-scroll">
                <table className="cir-table cir-ready-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Barcode</th>
                      <th className="cir-align-right">Total</th>
                      <th className="cir-align-right">Warehouse</th>
                      <th className="cir-align-right">Display</th>
                      <th className="cir-align-right">Reorder Point</th>
                      <th>Stock Health</th>
                      <th>Location Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReadyMade.length === 0 ? (
                      <EmptyRow
                        colSpan={8}
                        text="No Ready-made products match the current filters."
                      />
                    ) : (
                      filteredReadyMade.map((row) => (
                        <tr key={`ready-${row.id}`}>
                          <td>
                            <div className="cir-primary-text">
                              {row.name || "Unnamed product"}
                            </div>
                          </td>
                          <td>{row.barcode || "—"}</td>
                          <td className="cir-align-right cir-key-number">
                            {formatQuantity(row.total_stock, 0)}
                          </td>
                          <td className="cir-align-right">
                            {formatQuantity(row.warehouse_stock, 0)}
                          </td>
                          <td className="cir-align-right">
                            {formatQuantity(row.display_stock, 0)}
                          </td>
                          <td className="cir-align-right">
                            {formatQuantity(row.reorder_point, 0)}
                          </td>
                          <td>
                            <StatusBadge value={row.stock_status} />
                          </td>
                          <td>{readyLocationNote(row)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
