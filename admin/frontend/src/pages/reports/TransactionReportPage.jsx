import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

import "./TransactionReportPage.css";

const REPORT_TYPES = [
  { value: "orders", label: "Orders History" },
  { value: "cancellations", label: "Cancellation Records" },
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

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const humanize = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getRowDate = (row, reportType) => {
  if (reportType === "cancellations") {
    return new Date(row.requested_at || row.created_at || row.updated_at);
  }
  return new Date(row.created_at || row.updated_at);
};

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
    <div className="trx-summary-card">
      <div className="trx-summary-label">{label}</div>
      <div className="trx-summary-value">{value}</div>
      {note ? <div className="trx-summary-note">{note}</div> : null}
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="trx-empty-cell">
        {text}
      </td>
    </tr>
  );
}

export default function TransactionReportPage() {
  const { user } = useAuthStore();

  // Core Selection
  const [reportType, setReportType] = useState("orders");

  // Filters
  const [search, setSearch] = useState("");
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
      if (reportType === "orders") {
        const { data } = await api.get("/orders", { params: { limit: 5000 } });
        setRows(Array.isArray(data?.orders) ? data.orders : []);
      } else {
        const { data } = await api.get("/orders/cancellations", {
          params: { limit: 5000 },
        });
        setRows(Array.isArray(data) ? data : []);
      }
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      toast.error(`Failed to load ${reportType}.`);
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
      const rowDate = getRowDate(row, reportType);
      if (!isDateInRange(rowDate, dateFilter, customStart, customEnd))
        return false;

      // 2. Search check
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
  }, [rows, search, reportType, dateFilter, customStart, customEnd]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, reportType, dateFilter, customStart, customEnd]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * 20;
    return filteredRows.slice(start, start + 20);
  }, [filteredRows, page]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 20));

  const summary = useMemo(() => {
    const total = filteredRows.length;
    let metric1 = 0;
    let metric2 = 0;

    if (reportType === "orders") {
      metric1 = filteredRows.filter((r) =>
        ["completed", "delivered"].includes(String(r.status).toLowerCase()),
      ).length;
      metric2 = filteredRows.filter((r) =>
        ["pending", "confirmed", "production", "shipping"].includes(
          String(r.status).toLowerCase(),
        ),
      ).length;
    } else {
      metric1 = filteredRows.filter((r) =>
        ["pending"].includes(String(r.status).toLowerCase()),
      ).length;
      metric2 = filteredRows.filter((r) =>
        ["approved", "cancelled"].includes(String(r.status).toLowerCase()),
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

      if (reportType === "orders") {
        headers = [
          "Date & Time",
          "Order ID",
          "Customer",
          "Channel",
          "Amount",
          "Payment Status",
          "Order Status",
        ];
        mappedData = filteredRows.map((r) => [
          formatDateTime(r.created_at),
          r.order_number || `#${r.id}`,
          r.customer_name || r.walkin_customer_name || "—",
          humanize(r.channel || r.type),
          formatMoney(r.total_amount),
          humanize(r.payment_status_display || r.payment_status),
          humanize(r.status),
        ]);
      } else {
        headers = [
          "Date Requested",
          "Order ID",
          "Customer",
          "Record Type",
          "Reason",
          "Admin Note",
          "Status",
        ];
        mappedData = filteredRows.map((r) => [
          formatDateTime(r.requested_at || r.created_at),
          r.order_number || `#${r.order_id}`,
          r.customer_name || "—",
          humanize(r.record_type),
          r.reason || "—",
          r.review_note || "—",
          humanize(r.status),
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

      const reportLabel = reportType === "orders" ? "Orders" : "Cancellations";

      const excelData = [
        [{ v: `Transaction Report - ${reportLabel}`, s: titleStyle }],
        [], // Empty row for merge
        [
          {
            v: "Review chronological history of order transactions and cancellation requests.",
            s: descStyle,
          },
        ],
        [], // Spacer
        headers.map(header),
        ...mappedData.map((row) => row.map(cell)),
      ];

      const sheet = XLSX.utils.aoa_to_sheet(excelData);
      sheet["!cols"] = headers.map(() => ({ wch: 22 }));

      // Merge Title across rows 1-2 and all columns, Merge Description across row 3
      sheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: headers.length - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: headers.length - 1 } },
      ];

      XLSX.utils.book_append_sheet(workbook, sheet, reportLabel);

      const fileName = `transaction_report_${reportType}_${new Date().getTime()}.xlsx`;

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
    <div className="transaction-report">
      <div className="trx-page-header">
        <div>
          <h1>Transaction Report</h1>
          <p>
            Review chronological history of order transactions and cancellation
            requests across all channels.
          </p>
        </div>

        <div className="trx-header-actions trx-no-print">
          <button
            type="button"
            className="trx-button trx-button-secondary"
            onClick={loadReport}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="trx-button trx-button-primary"
            onClick={exportExcel}
            disabled={loading || filteredRows.length === 0 || exporting}
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      <div className="trx-report-meta">
        <span>
          <strong>Generated:</strong> {formatDateTime(generatedAt)}
        </span>
        <span>
          <strong>Generated By:</strong> {user?.name || "Administrator"}
        </span>
        <span>
          <strong>Scope:</strong>{" "}
          {reportType === "orders" ? "Orders History" : "Cancellations"}
        </span>
      </div>

      <div className="trx-toolbar trx-no-print">
        {/* SEARCH BAR PLACED FIRST TO EXPAND ON LEFT */}
        <label className="trx-filter-field trx-search-field">
          <span>Search Records</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search references, customers, or amounts..."
          />
        </label>

        <label className="trx-filter-field" style={{ minWidth: 160 }}>
          <span>Report Type</span>
          <select
            value={reportType}
            onChange={(e) => {
              setReportType(e.target.value);
              setSearch("");
            }}
          >
            {REPORT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {/* DATE RANGE FILTER */}
        <label className="trx-filter-field" style={{ minWidth: 160 }}>
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
              className="trx-filter-field"
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
              className="trx-filter-field"
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
            className="trx-summary-grid"
            style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            <SummaryCard
              label="Total Records"
              value={summary.total}
              note="Total matching records found"
            />
            <SummaryCard
              label={
                reportType === "orders"
                  ? "Completed / Delivered"
                  : "Pending Review"
              }
              value={summary.metric1}
              note={
                reportType === "orders"
                  ? "Successfully fulfilled transactions"
                  : "Awaiting administrator decision"
              }
            />
            <SummaryCard
              label={
                reportType === "orders" ? "In Progress" : "Approved / Cancelled"
              }
              value={summary.metric2}
              note={
                reportType === "orders"
                  ? "Active orders being processed"
                  : "Cancellations finalized"
              }
            />
          </div>

          <section className="trx-card">
            <div className="trx-section-head">
              <div>
                <h2>
                  {reportType === "orders"
                    ? "Orders Data"
                    : "Cancellations Data"}
                </h2>
                <p>
                  Detailed chronological history based on your current filters.
                </p>
              </div>
              <div className="trx-section-count">
                {filteredRows.length} record(s)
              </div>
            </div>

            <div className="trx-table-scroll">
              <table className="trx-table">
                <thead>
                  <tr>
                    {reportType === "orders" ? (
                      <>
                        <th>Date & Time</th>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Channel</th>
                        <th>Amount</th>
                        <th>Payment Status</th>
                        <th>Order Status</th>
                      </>
                    ) : (
                      <>
                        <th>Date Requested</th>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Record Type</th>
                        <th>Reason</th>
                        <th>Admin Note</th>
                        <th>Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <EmptyRow
                      colSpan={7}
                      text="No records match the current filters."
                    />
                  ) : (
                    paginatedRows.map((row) => (
                      <tr key={row.id}>
                        {reportType === "orders" ? (
                          <>
                            <td className="trx-primary-text">
                              {formatDateTime(row.created_at)}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {row.order_number || `#${row.id}`}
                            </td>
                            <td>
                              {row.customer_name ||
                                row.walkin_customer_name ||
                                "—"}
                            </td>
                            <td>{humanize(row.channel || row.type)}</td>
                            <td style={{ fontWeight: 600 }}>
                              {formatMoney(row.total_amount)}
                            </td>
                            <td>
                              {humanize(
                                row.payment_status_display ||
                                  row.payment_status,
                              )}
                            </td>
                            <td>{humanize(row.status)}</td>
                          </>
                        ) : (
                          <>
                            <td className="trx-primary-text">
                              {formatDateTime(
                                row.requested_at || row.created_at,
                              )}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {row.order_number || `#${row.order_id}`}
                            </td>
                            <td>{row.customer_name || "—"}</td>
                            <td>{humanize(row.record_type)}</td>
                            <td
                              style={{
                                maxWidth: 250,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {row.reason || "—"}
                            </td>
                            <td
                              style={{
                                maxWidth: 200,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {row.review_note || "—"}
                            </td>
                            <td>{humanize(row.status)}</td>
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
                    className="trx-button trx-button-secondary"
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
                    className="trx-button trx-button-secondary"
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
        <div className="trx-loading">Loading transaction data...</div>
      )}
    </div>
  );
}
