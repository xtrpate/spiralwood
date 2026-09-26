import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

  return status || "unknown";
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

const validateReportDate = (value, todayValue, label = "Report date") => {
  const targetDate = String(value || "").trim();

  if (!targetDate) {
    return `${label} is required.`;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return `${label} must use a valid date.`;
  }

  const [year, month, day] = targetDate.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return `${label} must be a valid calendar date.`;
  }

  if (targetDate > todayValue) {
    return `${label} cannot be in the future.`;
  }

  return "";
};

const validateCustomDateRange = (startValue, endValue, todayValue) => {
  const startError = validateReportDate(startValue, todayValue, "Start date");

  if (startError) {
    return startError;
  }

  const endError = validateReportDate(endValue, todayValue, "End date");

  if (endError) {
    return endError;
  }

  if (startValue > endValue) {
    return "Start date cannot be later than end date.";
  }

  return "";
};

const materialSpec = (row) => {
  const form = humanize(row?.material_form || "other");
  const dimensions = [row?.length_mm, row?.width_mm, row?.thickness_mm].filter(
    (value) => value !== null && value !== undefined && value !== "",
  );

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
  const todayManila = getManilaDateInput();

  const [rawMaterials, setRawMaterials] = useState([]);
  const [readyMade, setReadyMade] = useState([]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [reportMeta, setReportMeta] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [silentLoading, setSilentLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);

  const reportRequestIdRef = useRef(0);
  const hasLoadedReportRef = useRef(false);

  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [search, setSearch] = useState("");
  const [inventoryType, setInventoryType] = useState("");
  const [stockStatus, setStockStatus] = useState("");

  const loadReport = useCallback(async () => {
    const requestId = ++reportRequestIdRef.current;
    const isSilentReload = hasLoadedReportRef.current;

    setError("");

    if (dateFilter === "custom") {
      const validationError = validateCustomDateRange(
        customStart,
        customEnd,
        todayManila,
      );

      if (validationError) {
        setError(validationError);

        if (!hasLoadedReportRef.current) {
          setRawMaterials([]);
          setReadyMade([]);
          setGeneratedAt("");
          setWarnings([]);
          setReportMeta(null);
        }

        setLoading(false);
        setSilentLoading(false);
        return;
      }
    }

    if (isSilentReload) {
      setSilentLoading(true);
    } else {
      setLoading(true);
    }

    try {
      const params = { date_filter: dateFilter };

      if (dateFilter === "custom") {
        params.from = customStart;
        params.to = customEnd;
      }

      const response = await api.get("/inventory/report", { params });

      if (requestId !== reportRequestIdRef.current) {
        return;
      }

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
        as_of_at: response.data?.as_of_at || "",
        is_current_date: Boolean(response.data?.is_current_date),
        history_complete: response.data?.history_complete !== false,
        scope: response.data?.scope || "Currently active inventory records.",
      });

      // Only mark the report as loaded after a successful request.
      hasLoadedReportRef.current = true;
    } catch (err) {
      if (requestId !== reportRequestIdRef.current) {
        return;
      }

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load the Inventory report.",
      );

      // Preserve the previously loaded report during silent refresh failures.
      if (!hasLoadedReportRef.current) {
        setRawMaterials([]);
        setReadyMade([]);
        setGeneratedAt("");
        setWarnings([]);
        setReportMeta(null);
      }
    } finally {
      if (requestId !== reportRequestIdRef.current) {
        return;
      }

      setLoading(false);
      setSilentLoading(false);
    }
  }, [dateFilter, customStart, customEnd, todayManila]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (dateFilter === "custom" && (!customStart || !customEnd)) {
      return;
    }
    loadReport();
  }, [dateFilter, customStart, customEnd, loadReport]);

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
    setDateFilter("all");
    setCustomStart("");
    setCustomEnd("");
  };

  const exportExcel = async () => {
    if (!generatedAt || loading) return;

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
        [title("Generated:"), formatDateTime(generatedAt)],
        [title("Generated By:"), generatedBy],
        [title("Scope:"), reportMeta?.scope || "Active inventory records"],
        [title("Inventory Type:"), typeLabel],
        [title("Stock Health:"), healthLabel],
        [title("Search:"), search.trim() || "None"],
        [
          title("History Status:"),
          warnings.length ? "Review warnings" : "Complete",
        ],
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

      const fileName = `wisdom_inventory_report_${stamp}.xlsx`;

      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "Excel Document",
              accept: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                  [".xlsx"],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        const buffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
        });
        await writable.write(buffer);
        await writable.close();
      } else {
        XLSX.writeFile(workbook, fileName);
      }

      toast.success("Inventory report exported.");
    } catch (err) {
      if (err.name !== "AbortError")
        toast.error("Failed to export the Inventory report.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className={`current-inventory-report${selectedInventoryItem ? " cir-record-open" : ""}`}
    >
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
            onClick={() => loadReport()}
            disabled={loading || silentLoading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="cir-button cir-button-primary"
            onClick={exportExcel}
            disabled={loading || silentLoading || !generatedAt || exporting}
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
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
          <strong>Historical data warning:</strong> {warnings.length}{" "}
          item/history issue(s) could not be reconstructed safely. Unavailable
          quantities are shown as “—” instead of being guessed.
        </div>
      ) : null}

      <div
        className="cir-report-tabs cir-no-print"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          margin: "12px 0 0",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setInventoryType("");
            setSearch("");
            setStockStatus("");
          }}
          style={{
            padding: "10px 18px",
            border: "none",
            borderBottom:
              inventoryType === ""
                ? "2px solid #18181b"
                : "2px solid transparent",
            background: inventoryType === "" ? "#18181b" : "#f1f1f3",
            color: inventoryType === "" ? "#ffffff" : "#3f3f46",
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: "4px 4px 0 0",
            boxShadow:
              inventoryType === ""
                ? "0 2px 0 #18181b"
                : "0 2px 4px rgba(24, 24, 27, 0.14)",
          }}
        >
          All Products
        </button>

        <button
          type="button"
          onClick={() => {
            setInventoryType("raw");
            setSearch("");
            setStockStatus("");
          }}
          style={{
            padding: "10px 18px",
            border: "none",
            borderBottom:
              inventoryType === "raw"
                ? "2px solid #18181b"
                : "2px solid transparent",
            background: inventoryType === "raw" ? "#18181b" : "#f1f1f3",
            color: inventoryType === "raw" ? "#ffffff" : "#3f3f46",
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: "4px 4px 0 0",
            boxShadow:
              inventoryType === "raw"
                ? "0 2px 0 #18181b"
                : "0 2px 4px rgba(24, 24, 27, 0.14)",
          }}
        >
          Raw Materials
        </button>

        <button
          type="button"
          onClick={() => {
            setInventoryType("ready_made");
            setSearch("");
            setStockStatus("");
          }}
          style={{
            padding: "10px 18px",
            border: "none",
            borderBottom:
              inventoryType === "ready_made"
                ? "2px solid #18181b"
                : "2px solid transparent",
            background: inventoryType === "ready_made" ? "#18181b" : "#f1f1f3",
            color: inventoryType === "ready_made" ? "#ffffff" : "#3f3f46",
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: "4px 4px 0 0",
            boxShadow:
              inventoryType === "ready_made"
                ? "0 2px 0 #18181b"
                : "0 2px 4px rgba(24, 24, 27, 0.14)",
          }}
        >
          Ready-made Products
        </button>
      </div>

      <div className="cir-toolbar cir-no-print">
        <label className="cir-filter-field cir-search-field">
          <span>Search Records</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              const nextValue = String(event.target.value || "");
              if (nextValue.length > 120) {
                toast.error("Search must be 120 characters or less.");
                setSearch(nextValue.slice(0, 120));
                return;
              }
              setSearch(nextValue);
            }}
            placeholder="Material, product, barcode, category..."
            maxLength={120}
            aria-label="Search inventory records"
          />
        </label>

        <label className="cir-filter-field" style={{ minWidth: 150 }}>
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

        <label className="cir-filter-field" style={{ minWidth: 160 }}>
          <span>Date Filter</span>
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setCustomStart("");
              setCustomEnd("");
            }}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </label>

        {dateFilter === "custom" && (
          <>
            <label
              className="cir-filter-field"
              style={{ minWidth: 130, flex: "0 0 auto" }}
            >
              <span>Start Date</span>
              <input
                type="date"
                value={customStart}
                max={todayManila}
                onChange={(e) => {
                  const nextStart = e.target.value;

                  setCustomStart(nextStart);

                  if (customEnd && nextStart && nextStart > customEnd) {
                    setCustomEnd("");
                  }
                }}
              />
            </label>
            <label
              className="cir-filter-field"
              style={{ minWidth: 130, flex: "0 0 auto" }}
            >
              <span>End Date</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                max={todayManila}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
          </>
        )}
      </div>

      {error ? <div className="cir-error">{error}</div> : null}
      {loading ? (
        <div className="cir-loading">Loading inventory report...</div>
      ) : null}

      {!loading && (!error || hasLoadedReportRef.current) ? (
        <>
          <div className="cir-summary-grid">
            <SummaryCard
              label="Total Items"
              value={formatQuantity(summary.inventoryItems, 0)}
              note={`${formatQuantity(summary.rawCount, 0)} raw • ${formatQuantity(
                summary.readyCount,
                0,
              )} ready-made`}
            />
            <SummaryCard
              label="Ready-made Units"
              value={formatQuantity(summary.readyUnits, 0)}
              note="Finished-product units in the current filtered view"
            />
            <SummaryCard
              label="Stock Alerts"
              value={formatQuantity(summary.alertCount, 0)}
              note={
                summary.unavailableCount > 0
                  ? `${summary.unavailableCount} item(s) have unavailable history`
                  : "Low, critical, or out-of-stock items"
              }
            />
            <SummaryCard
              label="Pending Material Demand"
              value={formatQuantity(summary.pendingNeedCount, 0)}
              note="Raw materials still needed by pending Blueprint reservations"
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
                      <th className="cir-align-right">On Hand</th>
                      <th className="cir-align-right">Reserved</th>
                      <th className="cir-align-right">Available</th>
                      <th className="cir-align-right">Reorder</th>
                      <th>Stock Health</th>
                      <th aria-label="Action" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRaw.length === 0 ? (
                      <EmptyRow
                        colSpan={7}
                        text="No Raw Materials match the current filters."
                      />
                    ) : (
                      filteredRaw.map((row) => (
                        <tr
                          key={`raw-${row.id}`}
                          className="cir-clickable-row"
                          onDoubleClick={() =>
                            setSelectedInventoryItem({ type: "raw", row })
                          }
                        >
                          <td>
                            <div className="cir-primary-text">
                              {row.name || "Unnamed material"}
                            </div>
                            <div className="cir-secondary-text">
                              {row.category_name || "Uncategorized"} •{" "}
                              {materialSpec(row)}
                            </div>
                          </td>
                          <td className="cir-align-right cir-key-number">
                            {formatQuantity(row.on_hand_quantity)}{" "}
                            {row.unit || ""}
                          </td>
                          <td className="cir-align-right">
                            {formatQuantity(row.reserved_quantity)}{" "}
                            {row.unit || ""}
                          </td>
                          <td className="cir-align-right cir-key-number">
                            {formatQuantity(row.available_quantity)}{" "}
                            {row.unit || ""}
                          </td>
                          <td className="cir-align-right">
                            {formatQuantity(row.reorder_point)} {row.unit || ""}
                          </td>
                          <td>
                            <StatusBadge
                              value={
                                row.availability_status || row.stock_status
                              }
                            />
                          </td>
                          <td className="cir-action-cell">
                            <button
                              type="button"
                              className="cir-row-action"
                              onClick={() =>
                                setSelectedInventoryItem({ type: "raw", row })
                              }
                            >
                              View Details
                            </button>
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
                      <th className="cir-align-right">Total</th>
                      <th className="cir-align-right">Warehouse</th>
                      <th className="cir-align-right">Display</th>
                      <th className="cir-align-right">Reorder</th>
                      <th>Stock Health</th>
                      <th aria-label="Action" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReadyMade.length === 0 ? (
                      <EmptyRow
                        colSpan={7}
                        text="No Ready-made products match the current filters."
                      />
                    ) : (
                      filteredReadyMade.map((row) => (
                        <tr
                          key={`ready-${row.id}`}
                          className="cir-clickable-row"
                          onDoubleClick={() =>
                            setSelectedInventoryItem({
                              type: "ready_made",
                              row,
                            })
                          }
                        >
                          <td>
                            <div className="cir-primary-text">
                              {row.name || "Unnamed product"}
                            </div>
                          </td>
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
                          <td className="cir-action-cell">
                            <button
                              type="button"
                              className="cir-row-action"
                              onClick={() =>
                                setSelectedInventoryItem({
                                  type: "ready_made",
                                  row,
                                })
                              }
                            >
                              View Details
                            </button>
                          </td>
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
      {selectedInventoryItem ? (
        <div
          className="cir-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cir-detail-title"
          onClick={() => setSelectedInventoryItem(null)}
        >
          <div
            className="cir-detail-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cir-detail-head">
              <div>
                <span className="cir-detail-eyebrow">
                  {selectedInventoryItem.type === "raw"
                    ? "Raw Material"
                    : "Ready-made Product"}
                </span>
                <h2 id="cir-detail-title">
                  {selectedInventoryItem.row?.name || "Inventory Item"}
                </h2>
              </div>
              <StatusBadge
                value={
                  selectedInventoryItem.type === "raw"
                    ? selectedInventoryItem.row?.availability_status ||
                      selectedInventoryItem.row?.stock_status
                    : selectedInventoryItem.row?.stock_status
                }
              />
            </div>

            {selectedInventoryItem.type === "raw" ? (
              <div className="cir-detail-grid">
                <div>
                  <span>Category</span>
                  <strong>
                    {selectedInventoryItem.row?.category_name ||
                      "Uncategorized"}
                  </strong>
                </div>
                <div>
                  <span>Supplier</span>
                  <strong>
                    {selectedInventoryItem.row?.supplier_name || "—"}
                  </strong>
                </div>
                <div>
                  <span>Form / Size</span>
                  <strong>{materialSpec(selectedInventoryItem.row)}</strong>
                </div>
                <div>
                  <span>Unit</span>
                  <strong>{selectedInventoryItem.row?.unit || "—"}</strong>
                </div>
                <div>
                  <span>On Hand</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.on_hand_quantity,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Reserved</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.reserved_quantity,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Available</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.available_quantity,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Pending Need</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.pending_need_quantity,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Reorder Point</span>
                  <strong>
                    {formatQuantity(selectedInventoryItem.row?.reorder_point)}
                  </strong>
                </div>
                <div>
                  <span>Safety Stock</span>
                  <strong>
                    {formatQuantity(selectedInventoryItem.row?.safety_stock)}
                  </strong>
                </div>
                <div>
                  <span>Lead Time</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.lead_time_days,
                      0,
                    )}{" "}
                    day(s)
                  </strong>
                </div>
                <div>
                  <span>Used — Last 30 Days</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.used_last_30_days,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Average Daily Usage</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.avg_daily_usage_30d,
                    )}
                  </strong>
                </div>
                <div>
                  <span>History</span>
                  <strong>
                    {selectedInventoryItem.row?.history_complete === false
                      ? "Incomplete"
                      : "Available"}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="cir-detail-grid">
                <div>
                  <span>Barcode</span>
                  <strong>{selectedInventoryItem.row?.barcode || "—"}</strong>
                </div>
                <div>
                  <span>Total Stock</span>
                  <strong>
                    {formatQuantity(selectedInventoryItem.row?.total_stock, 0)}
                  </strong>
                </div>
                <div>
                  <span>Warehouse</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.warehouse_stock,
                      0,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Display Area</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.display_stock,
                      0,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Reorder Point</span>
                  <strong>
                    {formatQuantity(
                      selectedInventoryItem.row?.reorder_point,
                      0,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Location</span>
                  <strong>
                    {readyLocationNote(selectedInventoryItem.row)}
                  </strong>
                </div>
                <div>
                  <span>History</span>
                  <strong>
                    {selectedInventoryItem.row?.history_complete === false
                      ? "Incomplete"
                      : "Available"}
                  </strong>
                </div>
              </div>
            )}

            <div className="cir-detail-foot">
              <span>Inventory Record</span>
              <div className="cir-detail-actions">
                <button
                  type="button"
                  className="cir-button cir-button-secondary"
                  onClick={() => window.print()}
                >
                  Print Record
                </button>
                <button
                  type="button"
                  className="cir-button cir-button-primary"
                  onClick={() => setSelectedInventoryItem(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
