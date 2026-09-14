import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

import "./StockReportPage.css";

const SOURCE_LABELS = {
  physical_inventory: "Physical inventory",
  blueprint_production: "Blueprint production",
  legacy_production: "Historical record",
  ready_made_stock: "Ready-made stock",
  product_production: "Ready-made stock",
  order_fulfillment: "Order fulfillment",
  manual: "Manual entry",
};

const MOVEMENT_LABELS = {
  in: "Stock in",
  out: "Stock out",
  adjustment: "Adjustment",
  return: "Return",
};

const DIRECTIONS = {
  warehouse_to_display: { from: "Warehouse", to: "Display Area" },
  display_to_warehouse: { from: "Display Area", to: "Warehouse" },
};

const INVENTORY_TYPES = [
  { value: "", label: "All Inventory" },
  { value: "raw_material", label: "Raw Materials" },
  { value: "ready_made", label: "Ready-made" },
];

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
  });
};

const formatQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-PH", { maximumFractionDigits: 4 });
};

const getMovementQuantityLabel = (row) => {
  const isPositive = row.type === "in" || row.type === "return";
  const unit = row.material_unit ? ` ${row.material_unit}` : "";
  if (row.type === "adjustment")
    return `Set to ${formatQuantity(row.quantity)}${unit}`;
  return `${isPositive ? "+" : "-"}${formatQuantity(row.quantity)}${unit}`;
};

const getRowDate = (row) => new Date(row.created_at || row.updated_at);

const isDateInRange = (dateObj, filterType, customStart, customEnd) => {
  if (filterType === "all") return true;
  if (!dateObj || Number.isNaN(dateObj.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(dateObj);
  target.setHours(0, 0, 0, 0);

  if (filterType === "today") return target.getTime() === today.getTime();
  if (filterType === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return target.getTime() === yesterday.getTime();
  }
  if (filterType === "this_week") {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return target >= start && target <= end;
  }
  if (filterType === "this_month") {
    return (
      target.getMonth() === today.getMonth() &&
      target.getFullYear() === today.getFullYear()
    );
  }
  if (filterType === "this_year") {
    return target.getFullYear() === today.getFullYear();
  }
  if (filterType === "custom") {
    if (customStart && target < new Date(`${customStart}T00:00:00`))
      return false;
    if (customEnd && target > new Date(`${customEnd}T00:00:00`)) return false;
    return true;
  }
  return true;
};

function SummaryCard({ label, value, note }) {
  return (
    <div className="stk-summary-card">
      <div className="stk-summary-label">{label}</div>
      <div className="stk-summary-value">{value}</div>
      {note ? <div className="stk-summary-note">{note}</div> : null}
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="stk-empty-cell">
        {text}
      </td>
    </tr>
  );
}

export default function StockReportPage() {
  const { user } = useAuthStore();

  // Core Selection
  const [reportType, setReportType] = useState("movements");

  // Filters
  const [search, setSearch] = useState("");
  const [movementType, setMovementType] = useState("");
  const [inventoryType, setInventoryType] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [page, setPage] = useState(1);

  // Data
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);

    try {
      const endpoint =
        reportType === "movements"
          ? "/inventory/movements"
          : "/inventory/transfers";
      const { data } = await api.get(endpoint, {
        params: { limit: 5000 },
      });

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      toast.error(`Failed to load stock ${reportType}.`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [reportType]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // 1. Date check
      const rowDate = getRowDate(row);
      if (!isDateInRange(rowDate, dateFilter, customStart, customEnd))
        return false;

      // 2. Specific Movement Type & Inventory Type check
      if (reportType === "movements") {
        if (movementType && row.type !== movementType) return false;

        if (inventoryType) {
          const rowInvType =
            row.inventory_type ||
            (row.material_name ? "raw_material" : "ready_made");
          if (rowInvType !== inventoryType) return false;
        }
      }

      // 3. Search check
      const query = search.trim().toLowerCase();
      if (query) {
        return Object.values(row).some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(query),
        );
      }

      return true;
    });
  }, [
    rows,
    search,
    reportType,
    movementType,
    inventoryType,
    dateFilter,
    customStart,
    customEnd,
  ]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [
    search,
    reportType,
    movementType,
    inventoryType,
    dateFilter,
    customStart,
    customEnd,
  ]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * 20;
    return filteredRows.slice(start, start + 20);
  }, [filteredRows, page]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 20));

  const summary = useMemo(() => {
    const total = filteredRows.length;
    let metric1 = 0;
    let metric2 = 0;

    if (reportType === "movements") {
      metric1 = filteredRows.filter((r) => r.type === "in").length;
      metric2 = filteredRows.filter((r) => r.type === "out").length;
    } else {
      metric1 = filteredRows.filter(
        (r) => !r.reversal_of_transfer_id && !r.reversed_by_transfer_id,
      ).length;
      metric2 = filteredRows.filter(
        (r) => r.reversal_of_transfer_id || r.reversed_by_transfer_id,
      ).length;
    }

    return { total, metric1, metric2 };
  }, [filteredRows, reportType]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const workbook = XLSX.utils.book_new();

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

      const header = (value) => ({ v: value, s: headerStyle });
      const cell = (value) => ({ v: value ?? "", s: cellStyle });

      let headers = [];
      let mappedData = [];

      if (reportType === "movements") {
        headers = [
          "Date & Time",
          "Movement Type",
          "Source",
          "Item Name",
          "Quantity",
          "Order / Ref",
          "Recorded By",
        ];
        mappedData = filteredRows.map((r) => [
          formatDateTime(r.created_at),
          MOVEMENT_LABELS[r.type] || "Movement",
          SOURCE_LABELS[r.movement_source] || "Manual entry",
          r.material_name || r.product_name || "—",
          getMovementQuantityLabel(r),
          r.order_number || r.reference || "—",
          r.created_by_name || "System",
        ]);
      } else {
        headers = [
          "Date & Time",
          "Reference",
          "From",
          "To",
          "Products",
          "Total Qty",
          "Status",
          "User",
        ];
        mappedData = filteredRows.map((r) => [
          formatDateTime(r.created_at),
          r.reference_code || "—",
          DIRECTIONS[r.direction]?.from || "—",
          DIRECTIONS[r.direction]?.to || "—",
          r.item_summary || `${r.item_count || 0} product(s)`,
          Number(r.total_quantity || 0),
          r.reversal_of_transfer_id
            ? "Undo"
            : r.reversed_by_transfer_id
              ? "Undone"
              : "Completed",
          r.transferred_by_name || "System",
        ]);
      }

      const titleStyle = {
        font: { bold: true, sz: 16, color: { rgb: "111827" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      const descStyle = {
        font: { italic: true, sz: 11, color: { rgb: "52525B" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      const reportLabel =
        reportType === "movements" ? "Stock Movements" : "Stock Transfers";

      const excelData = [
        [{ v: `Stock Report - ${reportLabel}`, s: titleStyle }],
        [], // Empty row to accommodate the vertical merge
        [
          {
            v: "Review comprehensive historical data for inventory adjustments, consumption, and internal warehouse transfers.",
            s: descStyle,
          },
        ],
        [], // Empty spacer row before data
        headers.map(header),
        ...mappedData.map((row) => row.map(cell)),
      ];

      const sheet = XLSX.utils.aoa_to_sheet(excelData);
      sheet["!cols"] = headers.map(() => ({ wch: 25 }));

      // Merge Title across rows 1-2 and all columns, Merge Description across row 3
      sheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: headers.length - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: headers.length - 1 } },
      ];

      XLSX.utils.book_append_sheet(workbook, sheet, reportLabel);

      const fileName = `stock_report_${reportType}_${new Date().getTime()}.xlsx`;

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

      toast.success(`${reportLabel} report exported.`);
    } catch (err) {
      if (err.name !== "AbortError") toast.error("Failed to export report.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stock-report">
      <div className="stk-page-header">
        <div>
          <h1>Stock Report</h1>
          <p>
            Review comprehensive historical data for inventory adjustments,
            consumption, and internal warehouse transfers.
          </p>
        </div>

        <div className="stk-header-actions stk-no-print">
          <button
            type="button"
            className="stk-button stk-button-secondary"
            onClick={loadReport}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="stk-button stk-button-primary"
            onClick={exportExcel}
            disabled={loading || filteredRows.length === 0 || exporting}
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      <div className="stk-report-meta">
        <span>
          <strong>Generated:</strong> {formatDateTime(generatedAt)}
        </span>
        <span>
          <strong>Generated By:</strong> {user?.name || "Administrator"}
        </span>
        <span>
          <strong>Scope:</strong>{" "}
          {reportType === "movements" ? "Stock Movements" : "Stock Transfers"}
        </span>
      </div>

      <div className="stk-toolbar stk-no-print">
        {/* SEARCH BAR PLACED FIRST TO EXPAND ON LEFT */}
        <label className="stk-filter-field stk-search-field">
          <span>Search Records</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search references, items, users..."
          />
        </label>

        <label className="stk-filter-field" style={{ minWidth: 160 }}>
          <span>Report Type</span>
          <select
            value={reportType}
            onChange={(e) => {
              setReportType(e.target.value);
              setMovementType("");
              setInventoryType("");
              setSearch("");
            }}
          >
            <option value="movements">Stock Movements</option>
            <option value="transfers">Stock Transfers</option>
          </select>
        </label>

        {reportType === "movements" && (
          <>
            <label className="stk-filter-field" style={{ minWidth: 140 }}>
              <span>Inventory Type</span>
              <select
                value={inventoryType}
                onChange={(e) => setInventoryType(e.target.value)}
              >
                {INVENTORY_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="stk-filter-field" style={{ minWidth: 150 }}>
              <span>Movement Type</span>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
              >
                <option value="">All Movements</option>
                <option value="in">Stock In</option>
                <option value="out">Stock Out</option>
                <option value="adjustment">Adjustment</option>
                <option value="return">Return</option>
              </select>
            </label>
          </>
        )}

        {/* DATE RANGE FILTER */}
        <label className="stk-filter-field" style={{ minWidth: 160 }}>
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

        {/* CUSTOM DATE INPUTS VISIBLE ONLY IF CUSTOM SELECTED */}
        {dateFilter === "custom" && (
          <>
            <label
              className="stk-filter-field"
              style={{ minWidth: 130, flex: "0 0 auto" }}
            >
              <span>Start Date</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label
              className="stk-filter-field"
              style={{ minWidth: 130, flex: "0 0 auto" }}
            >
              <span>End Date</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
          </>
        )}
      </div>

      {!loading ? (
        <>
          <div
            className="stk-summary-grid"
            style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            <SummaryCard
              label="Total Records"
              value={summary.total}
              note="Total matching records found"
            />
            <SummaryCard
              label={
                reportType === "movements"
                  ? "Stock In Entries"
                  : "Completed Transfers"
              }
              value={summary.metric1}
              note={
                reportType === "movements"
                  ? "Incoming adjustments and deliveries"
                  : "Successfully completed routes"
              }
            />
            <SummaryCard
              label={
                reportType === "movements"
                  ? "Stock Out Entries"
                  : "Reversed Transfers"
              }
              value={summary.metric2}
              note={
                reportType === "movements"
                  ? "Consumption and dispatch entries"
                  : "Cancelled or undone routes"
              }
            />
          </div>

          <section className="stk-card">
            <div className="stk-section-head">
              <div>
                <h2>
                  {reportType === "movements"
                    ? "Stock Movement Data"
                    : "Stock Transfer Data"}
                </h2>
                <p>
                  Detailed chronological history based on your current filters.
                </p>
              </div>
              <div className="stk-section-count">
                {filteredRows.length} record(s)
              </div>
            </div>

            <div className="stk-table-scroll">
              <table className="stk-table">
                <thead>
                  <tr>
                    {reportType === "movements" ? (
                      <>
                        <th>Date & Time</th>
                        <th>Movement</th>
                        <th>Source</th>
                        <th>Item</th>
                        <th>Quantity</th>
                        <th>Recorded By</th>
                      </>
                    ) : (
                      <>
                        <th>Date & Time</th>
                        <th>Reference</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Products</th>
                        <th>Quantity</th>
                        <th>Status</th>
                        <th>User</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <EmptyRow
                      colSpan={8}
                      text="No records match the current filters."
                    />
                  ) : (
                    paginatedRows.map((row) => (
                      <tr key={row.id}>
                        {reportType === "movements" ? (
                          <>
                            <td className="stk-primary-text">
                              {formatDateTime(row.created_at)}
                            </td>
                            <td>{MOVEMENT_LABELS[row.type] || "Movement"}</td>
                            <td>
                              {SOURCE_LABELS[row.movement_source] ||
                                "Manual entry"}
                            </td>
                            <td
                              style={{
                                maxWidth: 300,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {row.material_name || row.product_name || "—"}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {getMovementQuantityLabel(row)}
                            </td>
                            <td>{row.order_number || row.reference || "—"}</td>
                            <td>{row.created_by_name || "System"}</td>
                          </>
                        ) : (
                          <>
                            <td className="stk-primary-text">
                              {formatDateTime(row.created_at)}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {row.reference_code || "—"}
                            </td>
                            <td>{DIRECTIONS[row.direction]?.from || "—"}</td>
                            <td>{DIRECTIONS[row.direction]?.to || "—"}</td>
                            <td
                              style={{
                                maxWidth: 300,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {row.item_summary ||
                                `${row.item_count || 0} product(s)`}
                            </td>
                            <td>{Number(row.total_quantity || 0)}</td>
                            <td>
                              {row.reversal_of_transfer_id
                                ? "Undo"
                                : row.reversed_by_transfer_id
                                  ? "Undone"
                                  : "Completed"}
                            </td>
                            <td>{row.transferred_by_name || "System"}</td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 15px",
                  borderTop: "1px solid #e4e7ea",
                  background: "#fff",
                }}
              >
                <span style={{ fontSize: 11.5, color: "#71717a" }}>
                  Showing {(page - 1) * 20 + 1} to{" "}
                  {Math.min(page * 20, filteredRows.length)} of{" "}
                  {filteredRows.length} records
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    className="stk-button stk-button-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "#3f3f46",
                      fontWeight: 500,
                      margin: "0 4px",
                    }}
                  >
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="stk-button stk-button-secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="stk-loading">Loading stock data...</div>
      )}
    </div>
  );
}
