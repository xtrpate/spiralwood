import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileDown, Search, Eye, X } from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";
import { exportOrderCompletionReportPdf } from "../orders/OrderCompletionReport";

import "./SalesProfitabilityReportPage.css";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatStatus = (value) => {
  const status = normalize(value);
  if (!status) return "Unknown";
  if (status === "in_transit") return "In Transit";
  if (status === "contract_released") return "Contract Released";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const getMarginColorClass = (margin) => {
  const num = Number(margin);
  if (num >= 35) return "sales-margin-high"; // Excellent margin
  if (num >= 15) return "sales-margin-med"; // Acceptable margin
  return "sales-margin-low"; // Low or negative margin
};

function SummaryCard({ label, value, note, valueClass = "" }) {
  return (
    <div className="sales-summary-card">
      <div className="sales-summary-label">{label}</div>
      <div className={`sales-summary-value ${valueClass}`}>{value}</div>
      {note ? <div className="sales-summary-note">{note}</div> : null}
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="sales-empty-cell">
        {text}
      </td>
    </tr>
  );
}

export default function SalesProfitabilityReportPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState({
    open: false,
    data: null,
    loading: false,
    fullOrder: null,
    error: "",
  });

  const closeDetail = () => {
    setDetail({
      open: false,
      data: null,
      loading: false,
      fullOrder: null,
      error: "",
    });
  };

  const openDetail = async (row) => {
    console.log("[SalesProfitability] openDetail called with row:", row);

    if (!row || row.order_id === undefined || row.order_id === null) {
      console.error(
        "[SalesProfitability] row.order_id is missing — check that the " +
          "/reports/sales-profitability response includes order_id on " +
          "every record.",
        row,
      );
      toast.error("This record is missing its order reference.");
      return;
    }

    setDetail({
      open: true,
      data: row,
      loading: true,
      fullOrder: null,
      error: "",
    });
    try {
      // row.order_id correctly maps to the orders.id primary key.
      const { data } = await api.get(`/orders/${row.order_id}`);
      setDetail({
        open: true,
        data: row,
        loading: false,
        fullOrder: data,
        error: "",
      });
    } catch (err) {
      console.error(
        `[SalesProfitability] API Error fetching /orders/${row.order_id}:`,
        err,
      );
      toast.error("Failed to load full order details.");
      setDetail({
        open: true,
        data: row,
        loading: false,
        fullOrder: null,
        error:
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load complete order details.",
      });
    }
  };

  const canExportRecord = Boolean(
    detail.fullOrder && normalize(detail.fullOrder.status) === "completed",
  );

  const handleExportRecord = () => {
    if (!detail.fullOrder) {
      toast.error("Order details are still loading.");
      return;
    }
    if (!canExportRecord) {
      toast.error(
        "Export is only available once this order is marked Completed.",
      );
      return;
    }
    try {
      exportOrderCompletionReportPdf(detail.fullOrder);
    } catch (exportError) {
      toast.error(
        exportError?.message || "Failed to export the selected order record.",
      );
    }
  };

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    total_revenue: 0,
    total_cogs: 0,
    total_gross_profit: 0,
    overall_margin_percentage: 0,
  });

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reports/sales-profitability", {
        params: { limit: 5000 },
      });
      setRows(Array.isArray(data?.records) ? data.records : []);
      setSummary(data?.summary || summary);
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      toast.error("Failed to load Sales & Profitability report.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    loadReport();
  }, [loadReport]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Order Type Filter
      if (orderType !== "all" && row.order_type !== orderType) return false;

      // Search Filter
      const query = search.trim().toLowerCase();
      if (query) {
        const matchStr =
          `${row.order_number} ${row.customer_name}`.toLowerCase();
        if (!matchStr.includes(query)) return false;
      }

      // Local Date Filter (Fallback if backend doesn't filter perfectly)
      if (dateFilter !== "all" && customStart && customEnd) {
        const rowDate = new Date(row.date_sold);
        if (
          rowDate < new Date(`${customStart}T00:00:00`) ||
          rowDate > new Date(`${customEnd}T23:59:59`)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [rows, search, orderType, dateFilter, customStart, customEnd]);

  useEffect(() => {
    setPage(1);
  }, [search, orderType, dateFilter, customStart, customEnd]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * 20;
    return filteredRows.slice(start, start + 20);
  }, [filteredRows, page]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 20));

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

      const titleStyle = {
        font: { bold: true, sz: 16, color: { rgb: "111827" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      const header = (value) => ({ v: value, s: headerStyle });
      const cell = (value) => ({ v: value ?? "", s: cellStyle });

      const headers = [
        "Date Sold",
        "Order Number",
        "Customer",
        "Order Type",
        "Revenue (PHP)",
        "COGS (PHP)",
        "Gross Profit (PHP)",
        "Margin (%)",
      ];

      const mappedData = filteredRows.map((r) => [
        formatDateTime(r.date_sold),
        r.order_number,
        r.customer_name,
        r.order_type === "blueprint" ? "Blueprint" : "Standard",
        Number(r.revenue),
        Number(r.cogs),
        Number(r.gross_profit),
        Number(r.margin_percentage),
      ]);

      const excelData = [
        [{ v: "Sales & Profitability Report", s: titleStyle }],
        [],
        [
          {
            v: "Overview of revenue, cost of goods sold (COGS), and gross profit margins.",
            s: { font: { italic: true, color: { rgb: "52525B" } } },
          },
        ],
        [],
        headers.map(header),
        ...mappedData.map((row) => row.map(cell)),
      ];

      const sheet = XLSX.utils.aoa_to_sheet(excelData);
      sheet["!cols"] = [
        { wch: 22 },
        { wch: 20 },
        { wch: 25 },
        { wch: 15 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
      ];
      sheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: headers.length - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: headers.length - 1 } },
      ];

      XLSX.utils.book_append_sheet(workbook, sheet, "Profitability");

      const fileName = `sales_profitability_report_${new Date().getTime()}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success("Sales Profitability report exported.");
    } catch (err) {
      toast.error("Failed to export report.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="sales-report">
      <div className="sales-page-header">
        <div>
          <h1>Sales &amp; Profitability</h1>
          <p>
            Track revenue against inventory costs to measure gross profit
            margins and business performance.
          </p>
        </div>

        <div className="sales-header-actions sales-no-print">
          <button
            type="button"
            className="sales-button sales-button-secondary"
            onClick={loadReport}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="sales-button sales-button-primary"
            onClick={exportExcel}
            disabled={loading || filteredRows.length === 0 || exporting}
          >
            <FileDown size={14} style={{ marginRight: 6 }} />
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      <div className="sales-report-meta">
        <span>
          <strong>Generated:</strong> {formatDateTime(generatedAt)}
        </span>
        <span>
          <strong>Generated By:</strong> {user?.name || "Administrator"}
        </span>
        <span>
          <strong>Scope:</strong> Completed and Delivered Orders
        </span>
      </div>

      <div className="sales-toolbar sales-no-print">
        <label className="sales-filter-field sales-search-field">
          <span>Search Records</span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#fff",
              border: "1px solid #d9dce1",
              borderRadius: "4px",
              padding: "0 8px",
            }}
          >
            <Search size={14} color="#71717a" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order number or customer..."
              style={{
                border: "none",
                outline: "none",
                padding: "8px",
                width: "100%",
              }}
            />
          </div>
        </label>

        <label className="sales-filter-field" style={{ minWidth: 160 }}>
          <span>Order Type</span>
          <select
            value={orderType}
            onChange={(e) => {
              setOrderType(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Orders</option>
            <option value="blueprint">Custom Blueprints</option>
            <option value="standard">Ready-Made (Standard)</option>
          </select>
        </label>

        <label className="sales-filter-field" style={{ minWidth: 160 }}>
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
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </label>

        {dateFilter === "custom" && (
          <>
            <label className="sales-filter-field" style={{ minWidth: 130 }}>
              <span>Start Date</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label className="sales-filter-field" style={{ minWidth: 130 }}>
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
            className="sales-summary-grid"
            style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
          >
            <SummaryCard
              label="Total Revenue"
              value={formatMoney(summary.total_revenue)}
              note="Total confirmed sales"
            />
            <SummaryCard
              label="Cost of Goods Sold (COGS)"
              value={formatMoney(summary.total_cogs)}
              note="Total inventory & labor costs"
            />
            <SummaryCard
              label="Gross Profit"
              value={formatMoney(summary.total_gross_profit)}
              note="Revenue minus COGS"
            />
            <SummaryCard
              label="Overall Margin"
              value={`${Number(summary.overall_margin_percentage).toFixed(2)}%`}
              note="Average profit margin"
              valueClass={getMarginColorClass(
                summary.overall_margin_percentage,
              )}
            />
          </div>

          <section className="sales-card">
            <div className="sales-section-head">
              <div>
                <h2>Sales Ledger</h2>
                <p>Detailed financial breakdown of every fulfilled order.</p>
              </div>
              <div className="sales-section-count">
                {filteredRows.length} record(s)
              </div>
            </div>

            <div className="sales-table-scroll">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Date Sold</th>
                    <th>Order Number</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th className="sales-align-right">Revenue</th>
                    <th className="sales-align-right">COGS</th>
                    <th className="sales-align-right">Gross Profit</th>
                    <th className="sales-align-right">Margin</th>
                    <th aria-label="Action" style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <EmptyRow
                      colSpan={9}
                      text="No records match the current filters."
                    />
                  ) : (
                    paginatedRows.map((row) => (
                      <tr
                        key={row.order_id}
                        className="sales-clickable-row"
                        onDoubleClick={() => openDetail(row)}
                      >
                        <td className="sales-primary-text">
                          {formatDateTime(row.date_sold)}
                        </td>
                        <td style={{ fontWeight: 600 }}>{row.order_number}</td>
                        <td>{row.customer_name}</td>
                        <td>
                          <span
                            className={`sales-badge sales-badge-${row.order_type}`}
                          >
                            {row.order_type === "blueprint"
                              ? "Blueprint"
                              : "Standard"}
                          </span>
                        </td>
                        <td
                          className="sales-align-right"
                          style={{ fontWeight: 600 }}
                        >
                          {formatMoney(row.revenue)}
                        </td>
                        <td
                          className="sales-align-right"
                          style={{ color: "#71717a" }}
                        >
                          {formatMoney(row.cogs)}
                        </td>
                        <td
                          className="sales-align-right"
                          style={{ fontWeight: 700 }}
                        >
                          {formatMoney(row.gross_profit)}
                        </td>
                        <td className="sales-align-right">
                          <span
                            className={`sales-margin-pill ${getMarginColorClass(row.margin_percentage)}`}
                          >
                            {row.margin_percentage}%
                          </span>
                        </td>
                        <td className="sales-action-cell">
                          <button
                            type="button"
                            className="sales-button-text"
                            onClick={() => openDetail(row)}
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
              <div className="sales-pagination-footer">
                <span className="sales-page-info">
                  Showing {(page - 1) * 20 + 1} to{" "}
                  {Math.min(page * 20, filteredRows.length)} of{" "}
                  {filteredRows.length} records
                </span>
                <div className="sales-page-controls">
                  <button
                    type="button"
                    className="sales-button sales-button-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="sales-page-status">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="sales-button sales-button-secondary"
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
        <div className="sales-loading">Loading profitability data...</div>
      )}
      {detail.open && detail.data && (
        <div className="sales-detail-overlay" onClick={closeDetail}>
          <aside
            className="sales-profit-detail-panel"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sales-detail-head">
              <div>
                <span>ORDER DETAILS</span>
                <h2>
                  {detail.fullOrder?.order_number || detail.data.order_number}
                </h2>
                <p>
                  {detail.fullOrder?.customer_name || detail.data.customer_name}
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={closeDetail}>
                <X size={19} />
              </button>
            </div>

            {detail.loading ? (
              <div className="sales-detail-loading">
                Loading order details...
              </div>
            ) : detail.error ? (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "4px",
                  color: "#991b1b",
                  fontSize: "12px",
                  fontWeight: "600",
                  marginTop: "24px",
                }}
              >
                {detail.error}
              </div>
            ) : detail.fullOrder ? (
              <>
                <div className="sales-detail-status-row">
                  <span
                    className={`sales-detail-status sales-detail-status-${normalize(detail.fullOrder.status)}`}
                  >
                    {formatStatus(detail.fullOrder.status)}
                  </span>
                  <span>
                    Date Placed: {formatDateTime(detail.fullOrder.created_at)}
                  </span>
                </div>

                <section className="sales-detail-section">
                  <h3>Order Information</h3>
                  <div className="sales-detail-grid">
                    <div>
                      <span>Order Number</span>
                      <strong>{detail.fullOrder.order_number || "—"}</strong>
                    </div>
                    <div>
                      <span>Order Type</span>
                      <strong>
                        {formatStatus(detail.fullOrder.order_type)}
                      </strong>
                    </div>
                    <div>
                      <span>Channel</span>
                      <strong>
                        {formatStatus(
                          detail.fullOrder.channel || detail.fullOrder.type,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Fulfillment Method</span>
                      <strong>
                        {formatStatus(
                          detail.fullOrder.fulfillment_method || "pickup",
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{formatStatus(detail.fullOrder.status)}</strong>
                    </div>
                    <div>
                      <span>Date Placed</span>
                      <strong>
                        {formatDateTime(detail.fullOrder.created_at)}
                      </strong>
                    </div>
                  </div>
                </section>

                <section className="sales-detail-section">
                  <h3>Customer</h3>
                  <div className="sales-detail-grid">
                    <div>
                      <span>Name</span>
                      <strong>
                        {detail.fullOrder.customer_name || "Walk-in Customer"}
                      </strong>
                    </div>
                    <div>
                      <span>Email</span>
                      <strong>{detail.fullOrder.customer_email || "—"}</strong>
                    </div>
                    <div>
                      <span>Phone</span>
                      <strong>{detail.fullOrder.customer_phone || "—"}</strong>
                    </div>
                    {(detail.fullOrder.delivery_address ||
                      detail.fullOrder.customer_address) && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <span>Delivery Address</span>
                        <strong>
                          {detail.fullOrder.delivery_address ||
                            detail.fullOrder.customer_address}
                        </strong>
                      </div>
                    )}
                  </div>
                </section>

                <section className="sales-detail-section">
                  <h3>Order Items</h3>
                  {detail.fullOrder.items?.length ? (
                    <div className="sales-items-scroll">
                      <table className="sales-items-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            {detail.fullOrder.order_type !== "blueprint" && (
                              <th>Unit Price</th>
                            )}
                            {detail.fullOrder.order_type !== "blueprint" && (
                              <th>Subtotal</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.fullOrder.items.map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600 }}>
                                {item.product_name ||
                                  item.display_name ||
                                  "Item"}
                              </td>
                              <td>{Number(item.quantity || 0)}</td>
                              {detail.fullOrder.order_type !== "blueprint" && (
                                <td>{formatMoney(item.unit_price)}</td>
                              )}
                              {detail.fullOrder.order_type !== "blueprint" && (
                                <td style={{ fontWeight: 600 }}>
                                  {formatMoney(item.subtotal)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No items found for this order.</p>
                  )}
                </section>

                {detail.fullOrder.order_type === "blueprint" &&
                  detail.fullOrder.custom_request_items?.map(
                    (customItem, idx) => (
                      <section
                        className="sales-detail-section"
                        key={`custom-${idx}`}
                      >
                        <h3>Custom Furniture Details</h3>
                        <div className="sales-detail-grid">
                          <div style={{ gridColumn: "1 / -1" }}>
                            <span>Item</span>
                            <strong>
                              {customItem.display_name ||
                                customItem.product_name ||
                                "Custom Furniture"}
                            </strong>
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <span>Dimensions</span>
                            <strong>
                              W {customItem.requested_width} × H{" "}
                              {customItem.requested_height} × D{" "}
                              {customItem.requested_depth}{" "}
                              {customItem.requested_unit || "mm"}
                            </strong>
                          </div>
                          <div>
                            <span>Wood Type</span>
                            <strong>
                              {customItem.requested_wood_type || "—"}
                            </strong>
                          </div>
                          <div>
                            <span>Finish</span>
                            <strong>
                              {customItem.requested_finish_color || "—"}
                            </strong>
                          </div>
                          <div>
                            <span>Assembly</span>
                            <strong>
                              {customItem.requested_assembly_choice ===
                              "included"
                                ? "Included (Free)"
                                : customItem.requested_assembly_choice ===
                                    "none"
                                  ? "Not Requested"
                                  : "—"}
                            </strong>
                          </div>
                        </div>
                      </section>
                    ),
                  )}

                <section className="sales-detail-section">
                  <h3>Payment Summary</h3>
                  <div className="sales-detail-grid">
                    <div>
                      <span>Order Total</span>
                      <strong>
                        {formatMoney(detail.fullOrder.total_amount)}
                      </strong>
                    </div>
                    <div>
                      <span>Verified Payments</span>
                      <strong>
                        {formatMoney(detail.fullOrder.payment_verified_total)}
                      </strong>
                    </div>
                    <div>
                      <span>Remaining Balance</span>
                      <strong>
                        {formatMoney(detail.fullOrder.payment_balance)}
                      </strong>
                    </div>
                    <div>
                      <span>Payment Status</span>
                      <strong>
                        {formatStatus(
                          detail.fullOrder.payment_status_display ||
                            detail.fullOrder.payment_status,
                        )}
                      </strong>
                    </div>
                  </div>
                </section>

                <section className="sales-detail-section">
                  <h3>Fulfillment</h3>
                  <div className="sales-detail-grid">
                    <div>
                      <span>Method</span>
                      <strong>
                        {formatStatus(
                          detail.fullOrder.fulfillment_method || "pickup",
                        )}
                      </strong>
                    </div>
                    {detail.fullOrder.fulfillment_method === "delivery" &&
                    detail.fullOrder.delivery ? (
                      <>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <span>Address</span>
                          <strong>
                            {detail.fullOrder.delivery.address ||
                              detail.fullOrder.delivery_address ||
                              "—"}
                          </strong>
                        </div>
                        <div>
                          <span>Scheduled</span>
                          <strong>
                            {formatDateTime(
                              detail.fullOrder.delivery.scheduled_date,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Delivered</span>
                          <strong>
                            {formatDateTime(
                              detail.fullOrder.delivery.delivered_date,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Delivery Status</span>
                          <strong>
                            {formatStatus(detail.fullOrder.delivery.status)}
                          </strong>
                        </div>
                        <div>
                          <span>Proof of Delivery</span>
                          <strong>
                            {detail.fullOrder.delivery.signed_receipt
                              ? "Recorded"
                              : "Unavailable"}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <div style={{ gridColumn: "span 2" }}>
                        <span>Delivery Record</span>
                        <strong>Not applicable</strong>
                      </div>
                    )}
                  </div>
                </section>

                {detail.fullOrder.order_type === "blueprint" && (
                  <section className="sales-detail-section">
                    <h3>Production</h3>
                    <div className="sales-detail-grid">
                      <div>
                        <span>Task Progress</span>
                        <strong>
                          {detail.fullOrder.blueprint_tasks?.filter(
                            (t) => t.status === "completed",
                          ).length || 0}{" "}
                          of {detail.fullOrder.blueprint_tasks?.length || 0}{" "}
                          production tasks
                        </strong>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <span>Production Status</span>
                        <strong>
                          {detail.fullOrder.blueprint_tasks?.length > 0 &&
                          detail.fullOrder.blueprint_tasks.every(
                            (t) => t.status === "completed",
                          )
                            ? "All production tasks completed"
                            : "In Progress / Unknown"}
                        </strong>
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <span>Production Completed</span>
                        <strong>
                          {detail.fullOrder.blueprint_tasks?.length > 0 &&
                          detail.fullOrder.blueprint_tasks.every(
                            (t) => t.status === "completed",
                          )
                            ? formatDateTime(
                                [...detail.fullOrder.blueprint_tasks].sort(
                                  (a, b) =>
                                    new Date(b.completed_at).getTime() -
                                    new Date(a.completed_at).getTime(),
                                )[0]?.completed_at,
                              )
                            : "—"}
                        </strong>
                      </div>
                    </div>
                  </section>
                )}
              </>
            ) : null}

            <div className="sales-detail-footer">
              <button
                type="button"
                className="sales-button sales-button-secondary"
                onClick={handleExportRecord}
                disabled={!canExportRecord}
                title={
                  !detail.fullOrder
                    ? "Order details are still loading."
                    : !canExportRecord
                      ? "Export is only available once this order is marked Completed."
                      : "Export the Order Completion Report PDF"
                }
              >
                <FileDown size={14} /> Export Record
              </button>
              <button
                type="button"
                className="sales-button sales-button-primary"
                onClick={() =>
                  navigate(`/admin/orders/${detail.data.order_id}`)
                }
              >
                Open Order
              </button>
              <button
                type="button"
                className="sales-button sales-button-secondary"
                onClick={closeDetail}
              >
                Close
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
