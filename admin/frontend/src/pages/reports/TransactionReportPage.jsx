import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, X, FileDown } from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

import "./TransactionReportPage.css";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const pdfFormatDateTime = (value) => {
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

const pdfFormatMoney = (value) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "PHP 0.00";
  }

  return `PHP ${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const pdfHumanize = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const pdfSanitizeFilename = (value) =>
  String(value || "record")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 100);

const createTransactionRecordPdf = (record = {}, reportType = "orders") => {
  const doc = new jsPDF();

  const isCancellation = reportType === "cancellations";

  const title = isCancellation
    ? "Cancellation Transaction Record"
    : "Order Transaction Record";

  let y = 18;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const leftMargin = 15;
  const rightMargin = 15;
  const valueX = 63;
  const maxValueWidth = pageWidth - valueX - rightMargin;

  const addHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(24, 24, 27);
    doc.text("WISDOM", leftMargin, y);

    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(82, 82, 91);
    doc.text("Transaction Report", leftMargin, y);

    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(63, 63, 70);
    doc.text(title, leftMargin, y);

    y += 6;

    doc.setDrawColor(212, 212, 216);
    doc.line(leftMargin, y, pageWidth - rightMargin, y);

    y += 10;
  };

  const addFooter = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);

    doc.text("WISDOM Transaction Report", leftMargin, pageHeight - 10);

    doc.text(
      `Generated ${pdfFormatDateTime(new Date())}`,
      pageWidth - rightMargin,
      pageHeight - 10,
      { align: "right" },
    );
  };

  const ensureSpace = (requiredHeight = 10) => {
    if (y + requiredHeight <= pageHeight - 20) {
      return;
    }

    addFooter();
    doc.addPage();
    y = 18;
    addHeader();
  };

  const addField = (label, value) => {
    const safeValue =
      value === null || value === undefined || value === ""
        ? "—"
        : String(value);

    const wrappedValue = doc.splitTextToSize(safeValue, maxValueWidth);

    const rowHeight = Math.max(8, wrappedValue.length * 5 + 4);

    ensureSpace(rowHeight);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(39, 39, 42);
    doc.text(`${label}:`, leftMargin, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(63, 63, 70);
    doc.text(wrappedValue, valueX, y);

    y += rowHeight;
  };

  const addSection = (sectionTitle) => {
    ensureSpace(14);

    y += 3;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(24, 24, 27);
    doc.text(sectionTitle, leftMargin, y);

    y += 7;
  };

  addHeader();

  /*
   * ============================================================
   * RECORD HEADER DETAILS
   * Matches the View Details header/status area.
   * ============================================================
   */
  addField("Record ID", record.id);

  addField(
    "Order Number",
    record.order_number || `#${record.order_id || record.id || "—"}`,
  );

  if (record.customer_name || record.walkin_customer_name) {
    addField(
      "Customer",
      record.customer_name || record.walkin_customer_name || "—",
    );
  }

  addField("Status", pdfHumanize(record.status || "completed"));

  /*
   * ============================================================
   * MAIN DETAILS
   * Matches the exact fields shown in the current modal.
   * ============================================================
   */
  addSection(isCancellation ? "Cancellation Details" : "Order Details");

  if (!isCancellation) {
    addField("Channel", pdfHumanize(record.channel || record.type));

    addField("Amount", pdfFormatMoney(record.total_amount));

    addField(
      "Payment Status",
      pdfHumanize(record.payment_status_display || record.payment_status),
    );

    addField("Date & Time", pdfFormatDateTime(record.created_at));
  } else {
    addField("Record Type", pdfHumanize(record.record_type));

    addField("Reason", record.reason || "—");

    addField("Admin Note", record.review_note || "—");

    addField(
      "Date Requested",
      pdfFormatDateTime(record.requested_at || record.created_at),
    );
  }

  /*
   * ============================================================
   * ADDITIONAL DETAILS
   * Uses the same filtering logic as the View Details modal.
   * ============================================================
   */
  const blueprintKeys = new Set([
    "blueprint_data",
    "blueprint_design",
    "blueprint_design_data",
    "blueprint_2d_data",
    "blueprint_3d_data",
    "blueprint_3d_view",
    "blueprint_3d",
    "blueprint",
    "design_data",
    "design_json",
    "blueprint_json",
    "three_d_data",
    "three_d_view",
    "three_d_model",
    "3d_view",
    "3d_data",
  ]);

  const skipKeys = isCancellation
    ? [
        "id",
        "order_id",
        "status",
        "record_type",
        "reason",
        "review_note",
        "requested_at",
        "created_at",
        "updated_at",
        "customer_name",
        "walkin_customer_name",
        "order_number",
      ]
    : [
        "id",
        "order_id",
        "status",
        "channel",
        "type",
        "total_amount",
        "payment_status_display",
        "payment_status",
        "created_at",
        "updated_at",
        "customer_name",
        "walkin_customer_name",
        "order_number",
      ];

  const extraKeys = Object.entries(record).filter(([key, value]) => {
    const normalizedKey = String(key).toLowerCase();

    const isBlueprintField =
      blueprintKeys.has(normalizedKey) ||
      normalizedKey.includes("blueprint") ||
      normalizedKey.includes("3d") ||
      normalizedKey.includes("three_d") ||
      normalizedKey.includes("design_data");

    return (
      value !== null &&
      value !== "" &&
      typeof value !== "object" &&
      !normalizedKey.includes("url") &&
      !normalizedKey.includes("json") &&
      !skipKeys.includes(key) &&
      !isBlueprintField
    );
  });

  if (extraKeys.length > 0) {
    addSection("Additional Details");

    extraKeys.forEach(([key, value]) => {
      const isDate = key.includes("date") || key.includes("_at");

      addField(pdfHumanize(key), isDate ? pdfFormatDateTime(value) : value);
    });
  }

  addFooter();

  return doc;
};

const exportTransactionRecordPdf = (record = {}, reportType = "orders") => {
  if (!record || typeof record !== "object") {
    throw new Error("No transaction record is available for export.");
  }

  const doc = createTransactionRecordPdf(record, reportType);

  const identifier =
    record.order_number || record.order_id || record.id || "record";

  const fileName = `transaction_${reportType}_${pdfSanitizeFilename(
    identifier,
  )}.pdf`;

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

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
  const [detail, setDetail] = useState({ open: false, data: null });

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
                    <th style={{ width: 110 }}>Action</th>
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
                        <td className="trx-action-cell">
                          <button
                            type="button"
                            className="trx-button-text"
                            onClick={() => setDetail({ open: true, data: row })}
                          >
                            <Eye size={14} /> View
                          </button>
                        </td>
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

      {detail.open && detail.data && (
        <div
          className="trx-detail-overlay"
          onClick={() => setDetail({ open: false, data: null })}
        >
          <aside
            className="trx-detail-panel"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="trx-detail-head">
              <div>
                <span>
                  {reportType === "orders" ? "ORDER" : "CANCELLATION"} DETAILS
                </span>
                <h2>
                  {detail.data.order_number ||
                    `Order #${detail.data.id || detail.data.order_id}`}
                </h2>
                {detail.data.customer_name && (
                  <p>{detail.data.customer_name}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDetail({ open: false, data: null })}
              >
                <X size={19} />
              </button>
            </div>

            <div className="trx-detail-status-row">
              <span
                className={`trx-detail-status trx-detail-status-${normalize(detail.data.status || "completed")}`}
              >
                {humanize(detail.data.status || "Completed")}
              </span>
              <span>Record ID: {detail.data.id}</span>
            </div>

            <section className="trx-detail-grid">
              {reportType === "orders" ? (
                <>
                  <div>
                    <span>Channel</span>
                    <strong>
                      {humanize(detail.data.channel || detail.data.type)}
                    </strong>
                  </div>
                  <div>
                    <span>Amount</span>
                    <strong>{formatMoney(detail.data.total_amount)}</strong>
                  </div>
                  <div>
                    <span>Payment Status</span>
                    <strong>
                      {humanize(
                        detail.data.payment_status_display ||
                          detail.data.payment_status,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Date & Time</span>
                    <strong>{formatDateTime(detail.data.created_at)}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>Record Type</span>
                    <strong>{humanize(detail.data.record_type)}</strong>
                  </div>
                  <div>
                    <span>Reason</span>
                    <strong>{detail.data.reason || "—"}</strong>
                  </div>
                  <div>
                    <span>Admin Note</span>
                    <strong>{detail.data.review_note || "—"}</strong>
                  </div>
                  <div>
                    <span>Date Requested</span>
                    <strong>
                      {formatDateTime(
                        detail.data.requested_at || detail.data.created_at,
                      )}
                    </strong>
                  </div>
                </>
              )}
            </section>

            {(() => {
              const skipKeys = [
                "id",
                "order_id",
                "status",
                "channel",
                "type",
                "total_amount",
                "payment_status_display",
                "payment_status",
                "created_at",
                "updated_at",
                "record_type",
                "reason",
                "review_note",
                "requested_at",
                "customer_name",
                "order_number",

                // Remove only the customer profile photo
                "customer_profile_photo",

                // Keep Blueprint Design / Blueprint 3D View excluded
                "blueprint_data",
                "blueprint_design",
                "blueprint_design_data",
                "blueprint_2d_data",
                "blueprint_3d_data",
                "blueprint_3d_view",
                "blueprint_3d",
                "blueprint",
                "design_data",
                "design_json",
                "blueprint_json",
                "three_d_data",
                "three_d_view",
                "three_d_model",
                "3d_view",
                "3d_data",
              ];
              const extraKeys = Object.entries(detail.data).filter(([k, v]) => {
                const normalizedKey = String(k).toLowerCase();

                const isBlueprintField =
                  normalizedKey.includes("blueprint") ||
                  normalizedKey.includes("3d") ||
                  normalizedKey.includes("three_d") ||
                  normalizedKey.includes("design_data");

                return (
                  v !== null &&
                  v !== "" &&
                  typeof v !== "object" &&
                  !normalizedKey.includes("url") &&
                  !normalizedKey.includes("json") &&
                  !skipKeys.includes(k) &&
                  !isBlueprintField
                );
              });

              if (extraKeys.length > 0) {
                return (
                  <section className="trx-detail-section">
                    <h3>Additional Details</h3>
                    <div className="trx-detail-subgrid">
                      {extraKeys.map(([k, v]) => {
                        const isDate = k.includes("date") || k.includes("_at");
                        const formattedDate = isDate ? formatDateTime(v) : "";
                        const finalValue =
                          isDate && formattedDate !== "—"
                            ? formattedDate
                            : String(v);
                        return (
                          <div key={k}>
                            <span>{humanize(k)}</span>
                            <strong>{finalValue}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              }
              return null;
            })()}

            <div className="trx-detail-footer">
              <button
                type="button"
                className="trx-button trx-button-secondary"
                onClick={() => setDetail({ open: false, data: null })}
              >
                Close
              </button>
              <button
                type="button"
                className="trx-button trx-button-primary"
                onClick={() => {
                  if (!detail.data) return;

                  try {
                    exportTransactionRecordPdf(detail.data, reportType);

                    toast.success(
                      `${
                        reportType === "orders"
                          ? "Order transaction"
                          : "Cancellation"
                      } record downloaded.`,
                    );
                  } catch (exportError) {
                    console.error("Transaction PDF Export Error:", exportError);

                    toast.error(
                      exportError?.message ||
                        "Failed to export the selected transaction record.",
                    );
                  }
                }}
              >
                <FileDown size={14} /> Export Record
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
