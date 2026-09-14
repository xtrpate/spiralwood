import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";
import "./DailyStockInReportPage.css";

const MAX_REPORT_ROWS = 25000;

const INVENTORY_TYPES = [
  { value: "", label: "All Inventory" },
  { value: "raw_material", label: "Raw Materials" },
  { value: "ready_made", label: "Ready-made" },
];

const PERIODS = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "custom", label: "Custom Range" },
];

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

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

const shiftDateInput = (value, dayDelta) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]) + Number(dayDelta || 0),
    ),
  );

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

const formatQuantity = (value, maximumFractionDigits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  return number.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
};

const numericOrBlank = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
};

const inventoryTypeLabel = (value) =>
  value === "raw_material"
    ? "Raw Material"
    : value === "ready_made"
      ? "Ready-made"
      : "Unknown";

const buildSearchText = (...values) =>
  values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const resolvePeriodRange = (period, today, customFrom = "", customTo = "") => {
  if (period === "all") {
    return { from: "", to: "" };
  }

  if (period === "today") {
    return { from: today, to: today };
  }

  if (period === "last7") {
    return { from: shiftDateInput(today, -6), to: today };
  }

  if (period === "last30") {
    return { from: shiftDateInput(today, -29), to: today };
  }

  return {
    from: String(customFrom || "").trim(),
    to: String(customTo || "").trim(),
  };
};

const periodLabel = (period, from, to) => {
  if (period === "all") return "All Stock In Records";
  if (period === "today") return `Today — ${formatReportDate(to)}`;

  if (from && to) {
    return `${formatReportDate(from)} – ${formatReportDate(to)}`;
  }

  return "Custom Range";
};

function SummaryCard({ label, value, note }) {
  return (
    <div className="dsir-summary-card">
      <div className="dsir-summary-label">{label}</div>
      <div className="dsir-summary-value">{value}</div>
      {note ? <div className="dsir-summary-note">{note}</div> : null}
    </div>
  );
}

export default function DailyStockInReportPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const todayManila = useMemo(() => getManilaDateInput(), []);

  const [period, setPeriod] = useState("all");
  const [appliedPeriod, setAppliedPeriod] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");

  const [generatedAt, setGeneratedAt] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [inventoryType, setInventoryType] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const generatedBy =
    String(user?.name || user?.full_name || "").trim() || "Administrator";

  const loadReport = useCallback(
    async (periodValue, options = {}) => {
      const selectedPeriod = periodValue || "all";
      const range = resolvePeriodRange(
        selectedPeriod,
        todayManila,
        options.from,
        options.to,
      );

      setLoading(true);
      setError("");

      try {
        let page = 1;
        const limit = 500;
        let allRows = [];
        let total = 0;
        let firstResponse = null;

        while (true) {
          const params = { page, limit };
          if (range.from && range.to) {
            params.from = range.from;
            params.to = range.to;
          }

          const response = await api.get("/inventory/reports/daily-stock-in", {
            params,
          });

          const pageRows = Array.isArray(response.data?.rows)
            ? response.data.rows
            : [];

          if (!firstResponse) firstResponse = response.data || {};
          total = Number(response.data?.total || 0);

          if (total > MAX_REPORT_ROWS) {
            throw new Error(
              `This Stock In Report contains more than ${MAX_REPORT_ROWS.toLocaleString(
                "en-PH",
              )} rows and cannot be loaded safely in one browser view.`,
            );
          }

          allRows = [...allRows, ...pageRows];

          if (
            pageRows.length === 0 ||
            allRows.length >= total ||
            pageRows.length < limit
          ) {
            break;
          }

          page += 1;

          if (page > Math.ceil(MAX_REPORT_ROWS / limit) + 1) {
            throw new Error("Stock In Report exceeded the safe page limit.");
          }
        }

        setRows(allRows);
        setGeneratedAt(firstResponse?.generated_at || new Date().toISOString());
        setAppliedPeriod(selectedPeriod);
        setAppliedFrom(firstResponse?.from_date || "");
        setAppliedTo(firstResponse?.to_date || "");
      } catch (err) {
        setRows([]);
        setGeneratedAt("");
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to load the Stock In Report.",
        );
      } finally {
        setLoading(false);
      }
    },
    [todayManila],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    loadReport("all");
  }, [loadReport]);

  const normalizedSearch = normalize(search);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (inventoryType && row.inventory_type !== inventoryType) {
          return false;
        }

        if (!normalizedSearch) return true;

        return buildSearchText(
          row.item_name,
          row.product_barcode,
          row.supplier_name,
          row.reference,
          row.notes,
          row.created_by_name,
          row.order_number,
          row.unit,
        ).includes(normalizedSearch);
      }),
    [inventoryType, normalizedSearch, rows],
  );

  const summary = useMemo(() => {
    const rawRows = filteredRows.filter(
      (row) => row.inventory_type === "raw_material",
    );
    const readyRows = filteredRows.filter(
      (row) => row.inventory_type === "ready_made",
    );
    const distinct = new Set(
      filteredRows.map((row) =>
        row.inventory_type === "raw_material"
          ? `raw:${row.material_id}`
          : `ready:${row.product_id}`,
      ),
    );

    return {
      entries: filteredRows.length,
      rawEntries: rawRows.length,
      readyEntries: readyRows.length,
      readyUnits: readyRows.reduce(
        (sum, row) => sum + Number(row.quantity || 0),
        0,
      ),
      distinctItems: distinct.size,
    };
  }, [filteredRows]);

  const handlePeriodChange = (event) => {
    const nextPeriod = event.target.value;
    setPeriod(nextPeriod);

    if (nextPeriod !== "custom") {
      setCustomFrom("");
      setCustomTo("");
      loadReport(nextPeriod);
    }
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) {
      toast.error("Select both From Date and To Date.");
      return;
    }

    if (customFrom > customTo) {
      toast.error("From Date cannot be later than To Date.");
      return;
    }

    if (customFrom > todayManila || customTo > todayManila) {
      toast.error("Report dates cannot be in the future.");
      return;
    }

    loadReport("custom", {
      from: customFrom,
      to: customTo,
    });
  };

  const clearFilters = () => {
    setSearch("");
    setInventoryType("");
    setPeriod("all");
    setCustomFrom("");
    setCustomTo("");

    if (appliedPeriod !== "all" || appliedFrom || appliedTo) {
      loadReport("all");
    }
  };

  const exportExcel = async () => {
    if (loading || !generatedAt) return;

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

      const currentPeriodLabel = periodLabel(
        appliedPeriod,
        appliedFrom,
        appliedTo,
      );

      const summaryData = [
        [title("SPIRAL WOOD SERVICES - STOCK IN REPORT")],
        [title("Period:"), currentPeriodLabel],
        [
          title("From Date:"),
          appliedFrom ? formatReportDate(appliedFrom) : "All dates",
        ],
        [
          title("To Date:"),
          appliedTo ? formatReportDate(appliedTo) : "All dates",
        ],
        [title("Generated:"), formatDateTime(generatedAt)],
        [title("Generated By:"), generatedBy],
        [title("Included Movement:"), "Stock In only"],
        [title("Inventory Type:"), typeLabel],
        [title("Search:"), search.trim() || "None"],
        [],
        [title("REPORT SUMMARY")],
        [
          "Stock-In Entries",
          "Raw Material Entries",
          "Ready-made Entries",
          "Ready-made Units Added",
          "Distinct Items",
        ].map(header),
        [
          summary.entries,
          summary.rawEntries,
          summary.readyEntries,
          summary.readyUnits,
          summary.distinctItems,
        ].map(cell),
      ];

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet["!cols"] = [
        { wch: 28 },
        { wch: 34 },
        { wch: 25 },
        { wch: 25 },
        { wch: 22 },
      ];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      const data = [
        [
          "Date & Time",
          "Inventory Type",
          "Item",
          "Barcode",
          "Qty In",
          "Unit",
          "Supplier",
          "Reference",
          "Order",
          "Recorded By",
          "Notes",
        ].map(header),
        ...filteredRows.map((row) =>
          [
            formatDateTime(row.created_at),
            inventoryTypeLabel(row.inventory_type),
            row.item_name || "—",
            row.product_barcode || "—",
            numericOrBlank(row.quantity),
            row.unit || "—",
            row.supplier_name || "—",
            row.reference || "—",
            row.order_number || "—",
            row.created_by_name || "System",
            row.notes || "",
          ].map(cell),
        ),
      ];

      const sheet = XLSX.utils.aoa_to_sheet(data);
      sheet["!cols"] = [
        { wch: 24 },
        { wch: 18 },
        { wch: 34 },
        { wch: 18 },
        { wch: 12 },
        { wch: 14 },
        { wch: 26 },
        { wch: 26 },
        { wch: 18 },
        { wch: 24 },
        { wch: 42 },
      ];
      XLSX.utils.book_append_sheet(workbook, sheet, "Stock In");

      const scope =
        appliedFrom && appliedTo
          ? `${appliedFrom}_to_${appliedTo}`
          : "all_dates";
      const stamp = new Date(generatedAt)
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);

      const fileName = `wisdom_stock_in_report_${scope}_${stamp}.xlsx`;

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

      toast.success("Stock In Report exported.");
    } catch (err) {
      if (err.name !== "AbortError")
        toast.error("Failed to export the Stock In Report.");
    } finally {
      setExporting(false);
    }
  };

  const activePeriodLabel = periodLabel(appliedPeriod, appliedFrom, appliedTo);

  const refreshReport = () => {
    loadReport(appliedPeriod, {
      from: appliedFrom,
      to: appliedTo,
    });
  };

  return (
    <div
      className={`daily-stock-in-report${selectedTransaction ? " dsir-record-open" : ""}`}
    >
      <div className="dsir-page-header">
        <div>
          <h1>Stock In Report</h1>
          <p>
            Review Stock In transaction history for all dates or a selected
            Philippine calendar period. Returns, Adjustments, and Stock Out
            movements are excluded.
          </p>
        </div>

        <div className="dsir-header-actions">
          <button
            type="button"
            className="dsir-button dsir-button-secondary"
            onClick={refreshReport}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="dsir-button dsir-button-primary"
            onClick={exportExcel}
            disabled={loading || !generatedAt || exporting}
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      <div className="dsir-report-date-card">
        <div>
          <span className="dsir-report-date-label">Period</span>
          <strong>{activePeriodLabel}</strong>
        </div>
        <span>Philippine calendar time (Asia/Manila)</span>
      </div>

      <div className="dsir-meta dsir-print-only">
        <span>
          <strong>Generated:</strong> {formatDateTime(generatedAt)}
        </span>
        <span>
          <strong>Generated By:</strong> {generatedBy}
        </span>
        <span>
          <strong>Scope:</strong> Stock In transactions only
        </span>
      </div>

      <div className="dsir-toolbar">
        <label className="dsir-field dsir-period-field">
          <span>Period</span>
          <select value={period} onChange={handlePeriodChange}>
            {PERIODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {period === "custom" ? (
          <>
            <label className="dsir-field dsir-date-field">
              <span>From Date</span>
              <input
                type="date"
                value={customFrom}
                max={todayManila}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>

            <label className="dsir-field dsir-date-field">
              <span>To Date</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                max={todayManila}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="dsir-button dsir-button-primary"
              onClick={applyCustomRange}
              disabled={loading || !customFrom || !customTo}
            >
              Apply Range
            </button>
          </>
        ) : null}

        <label className="dsir-field dsir-search-field">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Item, supplier, reference, user..."
            maxLength={120}
          />
        </label>

        <label className="dsir-field">
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

        <button
          type="button"
          className="dsir-button dsir-button-secondary"
          onClick={clearFilters}
          disabled={
            period === "all" &&
            !search &&
            !inventoryType &&
            !customFrom &&
            !customTo
          }
        >
          Clear Filters
        </button>
      </div>

      {error ? <div className="dsir-error">{error}</div> : null}
      {loading ? (
        <div className="dsir-loading">Loading Stock In Report...</div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="dsir-summary-grid">
            <SummaryCard
              label="Stock-In Transactions"
              value={formatQuantity(summary.entries, 0)}
              note={`${formatQuantity(summary.rawEntries, 0)} raw • ${formatQuantity(
                summary.readyEntries,
                0,
              )} ready-made`}
            />
            <SummaryCard
              label="Distinct Items Received"
              value={formatQuantity(summary.distinctItems, 0)}
              note="Unique materials/products received in the current view"
            />
            <SummaryCard
              label="Ready-made Units Added"
              value={formatQuantity(summary.readyUnits, 0)}
              note="Finished-product units received in the current view"
            />
          </div>

          <section className="dsir-card">
            <div className="dsir-section-head">
              <div>
                <h2>Stock In Transactions</h2>
                <p>
                  Raw-material quantities retain their recorded unit. Ready-made
                  quantities are complete finished-product units.
                </p>
              </div>
              <div className="dsir-section-count">
                {formatQuantity(filteredRows.length, 0)} record(s)
              </div>
            </div>

            <div className="dsir-table-scroll">
              <table className="dsir-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Item</th>
                    <th>Type</th>
                    <th className="dsir-align-right">Qty In</th>
                    <th>Supplier</th>
                    <th>Reference</th>
                    <th aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="dsir-empty-cell">
                        No Stock In transactions match the selected period and filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.id} className="dsir-clickable-row" onDoubleClick={() => setSelectedTransaction(row)}>
                        <td>{formatDateTime(row.created_at)}</td>
                        <td><div className="dsir-primary-text">{row.item_name || "Unknown item"}</div></td>
                        <td>
                          <span className={`dsir-type dsir-type-${row.inventory_type}`}>
                            {inventoryTypeLabel(row.inventory_type)}
                          </span>
                        </td>
                        <td className="dsir-align-right dsir-key-number">
                          {formatQuantity(row.quantity)} {row.unit || ""}
                        </td>
                        <td>{row.supplier_name || "—"}</td>
                        <td>
                          <div>{row.reference || "—"}</div>
                          {row.order_number ? <div className="dsir-secondary-text">Order: {row.order_number}</div> : null}
                        </td>
                        <td className="dsir-action-cell">
                          <button type="button" className="dsir-row-action" onClick={() => setSelectedTransaction(row)}>
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
        </>
      ) : null}
      {selectedTransaction ? (
        <div
          className="dsir-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dsir-detail-title"
          onClick={() => setSelectedTransaction(null)}
        >
          <div className="dsir-detail-card" onClick={(event) => event.stopPropagation()}>
            <div className="dsir-detail-head">
              <div>
                <span>Stock-In Transaction</span>
                <h2 id="dsir-detail-title">{selectedTransaction.item_name || "Inventory Item"}</h2>
              </div>
              <span className={`dsir-type dsir-type-${selectedTransaction.inventory_type}`}>
                {inventoryTypeLabel(selectedTransaction.inventory_type)}
              </span>
            </div>
            <div className="dsir-detail-grid">
              <div><span>Transaction ID</span><strong>#{selectedTransaction.id}</strong></div>
              <div><span>Date &amp; Time</span><strong>{formatDateTime(selectedTransaction.created_at)}</strong></div>
              <div><span>Quantity</span><strong>{formatQuantity(selectedTransaction.quantity)} {selectedTransaction.unit || ""}</strong></div>
              {selectedTransaction.product_barcode ? (
                <div><span>Barcode</span><strong>{selectedTransaction.product_barcode}</strong></div>
              ) : null}
              {selectedTransaction.supplier_name ? (
                <div><span>Supplier</span><strong>{selectedTransaction.supplier_name}</strong></div>
              ) : null}
              {selectedTransaction.reference ? (
                <div><span>Reference</span><strong>{selectedTransaction.reference}</strong></div>
              ) : null}
              {selectedTransaction.order_number || selectedTransaction.order_id ? (
                <div>
                  <span>Related Order</span>
                  <strong>
                    {selectedTransaction.order_number ||
                      `Order #${selectedTransaction.order_id}`}
                  </strong>
                </div>
              ) : null}
              <div><span>Recorded By</span><strong>{selectedTransaction.created_by_name || "System"}</strong></div>
            </div>
            {String(selectedTransaction.notes || "").trim() ? (
              <div className="dsir-detail-notes">
                <span>Notes</span>
                <p>{selectedTransaction.notes}</p>
              </div>
            ) : null}
            <div className="dsir-detail-foot">
              <span>Period: {activePeriodLabel}</span>
              <div className="dsir-detail-actions">
                <button type="button" className="dsir-button dsir-button-secondary" onClick={() => window.print()}>
                  Print Record
                </button>
                {selectedTransaction.order_id ? (
                  <button
                    type="button"
                    className="dsir-button dsir-button-secondary"
                    onClick={() => navigate(`/admin/orders/${selectedTransaction.order_id}`)}
                  >
                    Open Order
                  </button>
                ) : null}
                <button type="button" className="dsir-button dsir-button-primary" onClick={() => setSelectedTransaction(null)}>
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
