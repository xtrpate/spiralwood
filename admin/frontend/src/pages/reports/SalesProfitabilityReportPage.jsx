import React, { useCallback, useEffect, useRef, useState } from "react";
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

const PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 250;
const SALES_PROFITABILITY_EXPORT_ENDPOINT =
  "/reports/sales-profitability/export";

const EMPTY_SUMMARY = {
  total_revenue: 0,
  total_cogs: 0,
  total_gross_profit: 0,
  overall_margin_percentage: 0,
};

const buildReportParams = ({
  page,
  limit,
  search,
  orderType,
  dateFilter,
  customStart,
  customEnd,
  includeSummary = true,
}) => {
  const params = {
    page,
    limit,
    date_filter: dateFilter,
  };

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch) params.search = normalizedSearch;
  if (orderType !== "all") params.order_type = orderType;

  if (dateFilter === "custom" && customStart && customEnd) {
    params.from = customStart;
    params.to = customEnd;
  }

  if (!includeSummary) {
    params.include_summary = 0;
  }

  return params;
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
  });
};

const getExportFilenamePart = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "all";

const getExportDateFilenamePart = (dateFilter, customStart, customEnd) => {
  if (dateFilter === "custom") {
    return `${customStart || "start"}_to_${customEnd || "end"}`;
  }

  const labels = {
    all: "all_time",
    today: "today",
    yesterday: "yesterday",
    this_week: "this_week",
    this_month: "this_month",
    this_year: "this_year",
  };

  return labels[dateFilter] || getExportFilenamePart(dateFilter);
};

const getExportDateRangeLabel = (dateFilter, customStart, customEnd) => {
  const formatDate = (date) =>
    new Intl.DateTimeFormat("en-PH", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);

  const formatDateString = (value) => {
    if (!value) return "—";

    const parsed = new Date(`${value}T00:00:00Z`);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return formatDate(parsed);
  };

  if (dateFilter === "custom") {
    return `${formatDateString(customStart)} – ${formatDateString(customEnd)}`;
  }

  if (dateFilter === "all") {
    return "All Time";
  }

  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === "year")?.value);

  const month = Number(parts.find((part) => part.type === "month")?.value);

  const day = Number(parts.find((part) => part.type === "day")?.value);

  const currentDate = new Date(Date.UTC(year, month - 1, day));

  if (dateFilter === "today") {
    return formatDate(currentDate);
  }

  if (dateFilter === "yesterday") {
    const yesterday = new Date(currentDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    return formatDate(yesterday);
  }

  if (dateFilter === "this_week") {
    const dayOfWeek = currentDate.getUTCDay();

    // Monday = start of week
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const startDate = new Date(currentDate);
    startDate.setUTCDate(currentDate.getUTCDate() + mondayOffset);

    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 6);

    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }

  if (dateFilter === "this_month") {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0));

    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }

  if (dateFilter === "this_year") {
    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year, 11, 31));

    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }

  return getExportFilenamePart(dateFilter);
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
  const { user, hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const canExport = hasPermission("sales_report.export");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  const reportRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const closeDetail = () => {
    // Invalidate the current detail request so its response
    // cannot reopen or modify the modal after it is closed.
    detailRequestIdRef.current += 1;

    setDetail({
      open: false,
      data: null,
      loading: false,
      fullOrder: null,
      error: "",
    });
  };

  const openDetail = async (row) => {
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

    // Generate a unique request ID for this detail request.
    // Any older request becomes stale automatically.
    const requestId = ++detailRequestIdRef.current;

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

      // Ignore the response if:
      // 1. another order-detail request has started, or
      // 2. the modal was closed while this request was running.
      if (requestId !== detailRequestIdRef.current) {
        return;
      }

      setDetail({
        open: true,
        data: row,
        loading: false,
        fullOrder: data,
        error: "",
      });
    } catch (err) {
      // Do not display an error from an obsolete request.
      if (requestId !== detailRequestIdRef.current) {
        return;
      }

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
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");

  const hasLoadedReportRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const loadReport = useCallback(async () => {
    // Every invocation invalidates the previous report request.
    // This prevents older responses from overwriting newer filter/page results.
    const requestId = ++reportRequestIdRef.current;

    // Only the first successful report load uses the full-page loading state.
    // Later requests use the silent refreshing state instead.
    const isInitialLoad = !hasLoadedReportRef.current;

    // Do not request the report until both dates are provided.
    // This prevents an incomplete custom range from becoming an unbounded report.
    if (dateFilter === "custom" && (!customStart || !customEnd)) {
      if (requestId === reportRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    if (isInitialLoad) {
      setLoading(true);
    }

    setRefreshing(true);

    try {
      const { data } = await api.get("/reports/sales-profitability", {
        params: buildReportParams({
          page,
          limit: PAGE_SIZE,
          search: debouncedSearch,
          orderType,
          dateFilter,
          customStart,
          customEnd,
        }),
      });

      // Ignore a response if a newer report request has already started.
      if (requestId !== reportRequestIdRef.current) {
        return;
      }

      setRows(Array.isArray(data?.records) ? data.records : []);
      setTotal(Number(data?.total || 0));
      setSummary({ ...EMPTY_SUMMARY, ...(data?.summary || {}) });
      setGeneratedAt(new Date().toISOString());

      // From this point onward, report updates should be silent.
      hasLoadedReportRef.current = true;
    } catch (err) {
      // Ignore errors belonging to older requests.
      if (requestId !== reportRequestIdRef.current) {
        return;
      }

      toast.error(
        err?.response?.data?.message ||
          "Failed to load Sales & Profitability report.",
      );
    } finally {
      // Only the latest request is allowed to control loading states.
      if (requestId === reportRequestIdRef.current) {
        setRefreshing(false);

        if (isInitialLoad) {
          setLoading(false);
        }
      }
    }
  }, [page, debouncedSearch, orderType, dateFilter, customStart, customEnd]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportExcel = async () => {
    const orderTypeFilenamePart =
      orderType === "all" ? "all_orders" : getExportFilenamePart(orderType);

    const dateFilenamePart = getExportDateFilenamePart(
      dateFilter,
      customStart,
      customEnd,
    );

    const exportTimestamp = new Date().getTime();

    const fileName = `sales_profitability_report_${orderTypeFilenamePart}_${dateFilenamePart}_${exportTimestamp}.xlsx`;

    let saveHandle = null;

    try {
      /*
       * IMPORTANT:
       * Open Save As immediately while the browser still has
       * the original user click gesture.
       */
      if (window.showSaveFilePicker) {
        try {
          saveHandle = await window.showSaveFilePicker({
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
        } catch (err) {
          if (err?.name === "AbortError") {
            return;
          }

          throw err;
        }
      }

      setExporting(true);

      /*
       * First request:
       * Gets the complete filtered dataset count and summary.
       */
      const firstResponse = await api.get(SALES_PROFITABILITY_EXPORT_ENDPOINT, {
        params: buildReportParams({
          page: 1,
          limit: EXPORT_PAGE_SIZE,
          search: debouncedSearch,
          orderType,
          dateFilter,
          customStart,
          customEnd,
        }),
      });

      const exportRows = Array.isArray(firstResponse.data?.records)
        ? [...firstResponse.data.records]
        : [];

      const exportTotal = Number(firstResponse.data?.total || 0);

      const exportSummary = {
        ...EMPTY_SUMMARY,
        ...(firstResponse.data?.summary || {}),
      };

      if (exportRows.length === 0 || exportTotal === 0) {
        toast.error("No records match the current filters.");
        return;
      }

      /*
       * Retrieve every filtered record, not just the current page.
       */
      const exportPages = Math.max(
        1,
        Math.ceil(exportTotal / EXPORT_PAGE_SIZE),
      );

      for (let exportPage = 2; exportPage <= exportPages; exportPage += 1) {
        const { data } = await api.get(SALES_PROFITABILITY_EXPORT_ENDPOINT, {
          params: buildReportParams({
            page: exportPage,
            limit: EXPORT_PAGE_SIZE,
            search: debouncedSearch,
            orderType,
            dateFilter,
            customStart,
            customEnd,
            includeSummary: false,
          }),
        });

        const batch = Array.isArray(data?.records) ? data.records : [];

        exportRows.push(...batch);
      }

      /*
       * Verify that the export still represents the complete
       * filtered dataset.
       */
      const uniqueExportOrderIds = new Set(
        exportRows
          .map((row) => row?.order_id)
          .filter((orderId) => orderId !== undefined && orderId !== null),
      );

      if (
        exportRows.length !== exportTotal ||
        uniqueExportOrderIds.size !== exportTotal
      ) {
        throw new Error(
          "The report data changed while the export was being generated. Please export again.",
        );
      }

      const workbook = XLSX.utils.book_new();

      /* ============================================================
       * STYLES
       * ========================================================== */

      const headerStyle = {
        font: {
          bold: true,
          color: { rgb: "FFFFFF" },
        },
        fill: {
          fgColor: { rgb: "18181B" },
        },
        border: {
          top: {
            style: "thin",
            color: { rgb: "D1D5DB" },
          },
          bottom: {
            style: "thin",
            color: { rgb: "D1D5DB" },
          },
          left: {
            style: "thin",
            color: { rgb: "D1D5DB" },
          },
          right: {
            style: "thin",
            color: { rgb: "D1D5DB" },
          },
        },
      };

      const cellStyle = {
        border: {
          top: {
            style: "thin",
            color: { rgb: "E5E7EB" },
          },
          bottom: {
            style: "thin",
            color: { rgb: "E5E7EB" },
          },
          left: {
            style: "thin",
            color: { rgb: "E5E7EB" },
          },
          right: {
            style: "thin",
            color: { rgb: "E5E7EB" },
          },
        },
      };

      const titleStyle = {
        font: {
          bold: true,
          sz: 16,
          color: { rgb: "111827" },
        },
        alignment: {
          horizontal: "center",
          vertical: "center",
        },
      };

      const descStyle = {
        font: {
          italic: true,
          sz: 11,
          color: { rgb: "52525B" },
        },
        alignment: {
          horizontal: "center",
          vertical: "center",
          wrapText: true,
        },
      };

      const filterStyle = {
        font: {
          bold: true,
          sz: 10,
          color: { rgb: "374151" },
        },
        alignment: {
          horizontal: "left",
          vertical: "center",
          wrapText: true,
        },
      };

      const sectionTitleStyle = {
        font: {
          bold: true,
          sz: 12,
          color: { rgb: "111827" },
        },
      };

      const subHeaderStyle = {
        font: {
          bold: true,
          color: { rgb: "FFFFFF" },
        },
        fill: {
          fgColor: { rgb: "18181B" },
        },
        border: {
          top: {
            style: "thin",
            color: { rgb: "D1D5DB" },
          },
          bottom: {
            style: "thin",
            color: { rgb: "D1D5DB" },
          },
          left: {
            style: "thin",
            color: { rgb: "D1D5DB" },
          },
          right: {
            style: "thin",
            color: { rgb: "D1D5DB" },
          },
        },
      };

      const totalStyle = {
        font: {
          bold: true,
          color: { rgb: "111827" },
        },
        fill: {
          fgColor: { rgb: "F4F4F5" },
        },
        border: {
          top: {
            style: "thin",
            color: { rgb: "A1A1AA" },
          },
          bottom: {
            style: "thin",
            color: { rgb: "A1A1AA" },
          },
          left: {
            style: "thin",
            color: { rgb: "D4D4D8" },
          },
          right: {
            style: "thin",
            color: { rgb: "D4D4D8" },
          },
        },
      };

      const moneyNumberFormat = '"₱"#,##0.00';
      const percentNumberFormat = '0.00"%"';

      const roundToTwo = (value) =>
        Math.round((Number(value) + Number.EPSILON) * 100) / 100;

      const formatExcelMoney = (value) =>
        `₱${roundToTwo(value).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

      const formatExcelPercent = (value) =>
        `${roundToTwo(value).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}%`;

      const header = (value) => ({
        v: value,
        s: headerStyle,
      });

      const subHeader = (value) => ({
        v: value,
        s: subHeaderStyle,
      });

      const cell = (value, numFmt = null) => {
        let formattedValue = value ?? "";

        if (
          numFmt === moneyNumberFormat &&
          typeof value === "number" &&
          Number.isFinite(value)
        ) {
          formattedValue = formatExcelMoney(value);
        } else if (
          numFmt === percentNumberFormat &&
          typeof value === "number" &&
          Number.isFinite(value)
        ) {
          formattedValue = formatExcelPercent(value);
        } else if (typeof value === "number" && Number.isFinite(value)) {
          formattedValue = roundToTwo(value);
        }

        return {
          v: formattedValue,
          s: {
            ...cellStyle,
          },
        };
      };

      const totalCell = (value, numFmt = null) => {
        let formattedValue = value ?? "";

        if (
          numFmt === moneyNumberFormat &&
          typeof value === "number" &&
          Number.isFinite(value)
        ) {
          formattedValue = formatExcelMoney(value);
        } else if (
          numFmt === percentNumberFormat &&
          typeof value === "number" &&
          Number.isFinite(value)
        ) {
          formattedValue = formatExcelPercent(value);
        } else if (typeof value === "number" && Number.isFinite(value)) {
          formattedValue = roundToTwo(value);
        }

        return {
          v: formattedValue,
          s: {
            ...totalStyle,
          },
        };
      };

      const sectionTitle = (value) => ({
        v: value,
        s: sectionTitleStyle,
      });

      /* ============================================================
       * FILTER INFORMATION
       * ========================================================== */

      const searchLabel = String(debouncedSearch || "").trim() || "None";

      const orderTypeLabel =
        orderType === "blueprint"
          ? "Custom Blueprints"
          : orderType === "standard"
            ? "Ready-Made (Standard)"
            : "All Orders";

      const dateFilterLabel = getExportDateRangeLabel(
        dateFilter,
        customStart,
        customEnd,
      );

      const filterText = [
        `Searched: ${searchLabel}`,
        `Order Type: ${orderTypeLabel}`,
        `Date Filter: ${dateFilterLabel}`,
      ].join("    |    ");

      /* ============================================================
       * SUMMARY CALCULATIONS
       * ========================================================== */

      const totalOrders = exportTotal;

      const totalRevenue = Number(exportSummary.total_revenue || 0);

      const totalCogs = Number(exportSummary.total_cogs || 0);

      const totalGrossProfit = Number(
        exportSummary.total_gross_profit ?? totalRevenue - totalCogs,
      );

      const overallMargin = Number(
        exportSummary.overall_margin_percentage ??
          (totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0),
      );

      const averageOrderValue =
        totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const cogsPercentage =
        totalRevenue > 0 ? (totalCogs / totalRevenue) * 100 : 0;

      const averageGrossProfit =
        totalOrders > 0 ? totalGrossProfit / totalOrders : 0;

      /*
       * Build profitability by order type from the COMPLETE
       * filtered export dataset.
       */
      const orderTypeStats = {
        standard: {
          orders: 0,
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
        },
        blueprint: {
          orders: 0,
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
        },
      };

      exportRows.forEach((row) => {
        const type =
          normalize(row?.order_type) === "blueprint" ? "blueprint" : "standard";

        const revenue = Number(row?.revenue || 0);
        const cogs = Number(row?.cogs || 0);
        const grossProfit = Number(row?.gross_profit ?? revenue - cogs);

        orderTypeStats[type].orders += 1;
        orderTypeStats[type].revenue += revenue;
        orderTypeStats[type].cogs += cogs;
        orderTypeStats[type].grossProfit += grossProfit;
      });

      const getRevenueShare = (revenue) =>
        totalRevenue > 0 ? (Number(revenue || 0) / totalRevenue) * 100 : 0;

      const getProfitShare = (profit) =>
        totalGrossProfit !== 0
          ? (Number(profit || 0) / totalGrossProfit) * 100
          : 0;

      const getMargin = (revenue, profit) =>
        Number(revenue || 0) > 0
          ? (Number(profit || 0) / Number(revenue)) * 100
          : 0;

      /* ============================================================
       * SHEET 1 — SUMMARY
       * ========================================================== */

      const summaryData = [
        [
          {
            v: "SPIRAL WOOD SERVICES - SALES & PROFITABILITY REPORT",
            s: titleStyle,
          },
        ],
        [
          {
            v: "Completed-order revenue and gross profitability analysis based on the selected filters.",
            s: descStyle,
          },
        ],
        [
          {
            v: filterText,
            s: filterStyle,
          },
        ],
        [],

        [sectionTitle("1. SALES OVERVIEW")],
        [
          subHeader("Completed Orders"),
          subHeader("Total Revenue"),
          subHeader("Average Order Value"),
        ],
        [
          cell(totalOrders),
          cell(totalRevenue, moneyNumberFormat),
          cell(averageOrderValue, moneyNumberFormat),
        ],
        [],

        [sectionTitle("2. PROFITABILITY OVERVIEW")],
        [
          subHeader("Total COGS"),
          subHeader("COGS % of Revenue"),
          subHeader("Gross Profit"),
          subHeader("Gross Margin"),
          subHeader("Average Gross Profit per Order"),
        ],
        [
          cell(totalCogs, moneyNumberFormat),
          cell(cogsPercentage, percentNumberFormat),
          cell(totalGrossProfit, moneyNumberFormat),
          cell(overallMargin, percentNumberFormat),
          cell(averageGrossProfit, moneyNumberFormat),
        ],
        [],

        [sectionTitle("3. PROFITABILITY BY ORDER TYPE")],
        [
          subHeader("Order Type"),
          subHeader("Orders"),
          subHeader("Revenue"),
          subHeader("Revenue Share %"),
          subHeader("COGS"),
          subHeader("Gross Profit"),
          subHeader("Profit Share %"),
          subHeader("Margin %"),
        ],
      ];

      const standard = orderTypeStats.standard;
      const blueprint = orderTypeStats.blueprint;

      summaryData.push(
        [
          cell("Standard"),
          cell(standard.orders),
          cell(standard.revenue, moneyNumberFormat),
          cell(getRevenueShare(standard.revenue), percentNumberFormat),
          cell(standard.cogs, moneyNumberFormat),
          cell(standard.grossProfit, moneyNumberFormat),
          cell(getProfitShare(standard.grossProfit), percentNumberFormat),
          cell(
            getMargin(standard.revenue, standard.grossProfit),
            percentNumberFormat,
          ),
        ],
        [
          cell("Blueprint"),
          cell(blueprint.orders),
          cell(blueprint.revenue, moneyNumberFormat),
          cell(getRevenueShare(blueprint.revenue), percentNumberFormat),
          cell(blueprint.cogs, moneyNumberFormat),
          cell(blueprint.grossProfit, moneyNumberFormat),
          cell(getProfitShare(blueprint.grossProfit), percentNumberFormat),
          cell(
            getMargin(blueprint.revenue, blueprint.grossProfit),
            percentNumberFormat,
          ),
        ],
        [
          totalCell("TOTAL"),
          totalCell(totalOrders),
          totalCell(totalRevenue, moneyNumberFormat),
          totalCell(100, percentNumberFormat),
          totalCell(totalCogs, moneyNumberFormat),
          totalCell(totalGrossProfit, moneyNumberFormat),
          totalCell(totalGrossProfit !== 0 ? 100 : 0, percentNumberFormat),
          totalCell(overallMargin, percentNumberFormat),
        ],
        [],
        [sectionTitle("4. HOW TO READ THIS REPORT")],

        [subHeader("Metric"), subHeader("Definition")],

        [
          cell("Revenue"),
          cell("The completed-order selling value before deducting COGS."),
        ],

        [
          cell("COGS"),
          cell(
            "The direct or estimated production cost assigned to completed orders.",
          ),
        ],

        [
          cell("COGS % of Revenue"),
          cell("The percentage of completed-order revenue consumed by COGS."),
        ],

        [cell("Gross Profit"), cell("Revenue minus COGS.")],

        [
          cell("Gross Margin"),
          cell("Gross Profit divided by Revenue, expressed as a percentage."),
        ],

        [
          cell("Average Order Value"),
          cell("Total Revenue divided by the number of completed orders."),
        ],

        [
          cell("Average Gross Profit per Order"),
          cell("Gross Profit divided by the number of completed orders."),
        ],

        [
          cell("Revenue Share"),
          cell(
            "The percentage of total revenue contributed by each order type.",
          ),
        ],

        [
          cell("Profit Share"),
          cell(
            "The percentage of total gross profit contributed by each order type.",
          ),
        ],
      );

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

      summarySheet["!cols"] = [
        { wch: 30 },
        { wch: 32 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 },
        { wch: 18 },
        { wch: 30 },
      ];

      summarySheet["!rows"] = [{ hpt: 26 }, { hpt: 32 }, { hpt: 28 }];

      summarySheet["!merges"] = [
        {
          s: { r: 0, c: 0 },
          e: { r: 0, c: 7 },
        },
        {
          s: { r: 1, c: 0 },
          e: { r: 1, c: 7 },
        },
        {
          s: { r: 2, c: 0 },
          e: { r: 2, c: 7 },
        },
      ];

      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      /* ============================================================
       * SHEET 2 — PROFITABILITY DETAILS
       * ========================================================== */

      const headers = [
        "Order Date",
        "Order Number",
        "Customer",
        "Order Type",
        "Revenue (PHP)",
        "COGS (PHP)",
        "Gross Profit (PHP)",
        "Margin (%)",
      ];

      const mappedData = exportRows.map((row) => [
        formatDateTime(row?.order_date),
        row?.order_number || "—",
        row?.customer_name || "—",
        normalize(row?.order_type) === "blueprint" ? "Blueprint" : "Standard",
        Number(row?.revenue || 0),
        Number(row?.cogs || 0),
        Number(
          row?.gross_profit ??
            Number(row?.revenue || 0) - Number(row?.cogs || 0),
        ),
        Number(row?.margin_percentage || 0),
      ]);

      const detailData = [
        [
          {
            v: "Profitability Details",
            s: titleStyle,
          },
        ],
        [
          {
            v: "Detailed completed-order revenue, COGS, gross profit, and margin records.",
            s: descStyle,
          },
        ],
        [
          {
            v: filterText,
            s: filterStyle,
          },
        ],
        [],
        headers.map(header),
        ...mappedData.map((row) => [
          cell(row[0]),
          cell(row[1]),
          cell(row[2]),
          cell(row[3]),
          cell(row[4], moneyNumberFormat),
          cell(row[5], moneyNumberFormat),
          cell(row[6], moneyNumberFormat),
          cell(row[7], percentNumberFormat),
        ]),
      ];

      const detailSheet = XLSX.utils.aoa_to_sheet(detailData);

      detailSheet["!cols"] = [
        { wch: 22 },
        { wch: 20 },
        { wch: 25 },
        { wch: 15 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 },
        { wch: 12 },
      ];

      detailSheet["!merges"] = [
        {
          s: { r: 0, c: 0 },
          e: { r: 0, c: headers.length - 1 },
        },
        {
          s: { r: 1, c: 0 },
          e: { r: 1, c: headers.length - 1 },
        },
        {
          s: { r: 2, c: 0 },
          e: { r: 2, c: headers.length - 1 },
        },
      ];

      XLSX.utils.book_append_sheet(
        workbook,
        detailSheet,
        "Profitability Details",
      );

      /* ============================================================
       * WRITE FILE
       * ========================================================== */

      const buffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

      if (saveHandle) {
        const writable = await saveHandle.createWritable();

        try {
          await writable.write(buffer);
        } finally {
          await writable.close();
        }
      } else {
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;
        link.download = fileName;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      }

      toast.success("Sales & Profitability report exported successfully.");
    } catch (err) {
      if (err?.name !== "AbortError") {
        toast.error(
          err?.message || "Failed to export Sales & Profitability report.",
        );
      }
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
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="sales-button sales-button-primary"
            onClick={exportExcel}
            disabled={
              loading || refreshing || total === 0 || exporting || !canExport
            }
            title={
              !canExport
                ? "You do not have permission to export sales reports."
                : undefined
            }
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
          <strong>Scope:</strong> Completed Orders
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
              setPage(1);
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
            <label
              className="sales-filter-field sales-custom-date-field"
              style={{ minWidth: 130 }}
            >
              <span>Start Date</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => {
                  setCustomStart(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label
              className="sales-filter-field sales-custom-date-field"
              style={{ minWidth: 130 }}
            >
              <span>End Date</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => {
                  setCustomEnd(e.target.value);
                  setPage(1);
                }}
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
                <p>
                  Detailed financial breakdown of finalized completed orders.
                </p>
              </div>
              <div className="sales-section-count">{total} record(s)</div>
            </div>

            <div className="sales-table-scroll">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Order Date</th>
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
                  {rows.length === 0 ? (
                    <EmptyRow
                      colSpan={9}
                      text="No records match the current filters."
                    />
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.order_id}
                        className="sales-clickable-row"
                        onDoubleClick={() => openDetail(row)}
                      >
                        <td className="sales-primary-text">
                          {formatDateTime(row.order_date)}
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

            {rows.length > 0 && (
              <div className="sales-pagination-footer">
                <span className="sales-page-info">
                  Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                  {Math.min(page * PAGE_SIZE, total)} of {total} records
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
