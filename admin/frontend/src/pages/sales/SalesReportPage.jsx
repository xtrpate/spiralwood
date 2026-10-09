import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";
import * as XLSX from "xlsx-js-style";
import "./SalesReportPage.css";

const CHANNELS = [
  { key: "", label: "All Channels" },
  { key: "online", label: "Online" },
  { key: "walkin", label: "Walk-in" },
];

const PAYMENT_TYPES = [
  { key: "", label: "All Payments" },
  { key: "cash", label: "Cash" },
  { key: "online", label: "Online" },
];

const PERIODS = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "yearly", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

const buildSalesReportParams = ({
  channel = "",
  payment = "",
  period = "monthly",
  from = "",
  to = "",
} = {}) => {
  const params = { channel, payment };

  if (period === "custom") {
    params.from = from;
    params.to = to;
  } else {
    params.period = period;
  }

  return params;
};

const money = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const quantity = (value) =>
  Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 4 });

const count = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 0,
  });

const pdfMoney = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const percentage = (value, total) => {
  const numerator = Number(value || 0);
  const denominator = Number(total || 0);

  if (denominator <= 0) return "0.0%";

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
};

const pdfText = (value) =>
  String(value ?? "-")
    .replace(/[–—]/g, "-")
    .replace(/₱/g, "PHP ");

const humanize = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const paymentMethodLabel = (value) => {
  const method = String(value || "").toLowerCase();
  if (method === "paymongo") return "Online Payment";
  if (method === "gcash") return "GCash";
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "cod") return "Cash on Delivery";
  if (method === "cop") return "Cash on Pickup";
  return humanize(method);
};

const salesChannelLabel = (value) => {
  const channel = String(value || "")
    .trim()
    .toLowerCase();
  if (channel === "online") return "Online";
  if (channel === "walkin") return "Walk-in";
  return humanize(value);
};

const dateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-PH", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const REPORT_TIME_ZONE = "Asia/Manila";

const getManilaDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(({ type }) => ["year", "month", "day"].includes(type))
      .map(({ type, value }) => [type, value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
};

const toCalendarYMD = (year, month, day) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const shiftCalendarDate = (year, month, day, days) =>
  new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);

const formatDateOnly = (value) => {
  if (!value) return "—";

  const [year, month, day] = String(value).split("-").map(Number);

  if (!year || !month || !day) return String(value);

  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

function Badge({ value }) {
  const normalized = String(value || "pending")
    .toLowerCase()
    .replace(/\s+/g, "-");

  return (
    <span className={`sales-status sales-status-${normalized}`}>
      {humanize(value)}
    </span>
  );
}

function SummaryCard({ label, value, note }) {
  return (
    <div className="sales-summary-card">
      <div className="sales-summary-label">{label}</div>
      <div className="sales-summary-value">{value}</div>
      {note ? <div className="sales-summary-note">{note}</div> : null}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="sales-section-head">
      <div>
        <h2 className="sales-section-title">{title}</h2>
        {subtitle ? <p className="sales-section-subtitle">{subtitle}</p> : null}
      </div>
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

export default function SalesReportPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canExport = hasPermission("sales_report.export");
  const requestIdRef = useRef(0);

  const [channel, setChannel] = useState("");
  const [payment, setPayment] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [detailSection, setDetailSection] = useState("orders");
  const [search, setSearch] = useState("");
  const reportGeneratedAt = useMemo(() => new Date(), [appliedFilters]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const load = useCallback(async () => {
    if (period === "custom" && (!from || !to || from > to)) return;

    const requestedFilters = {
      channel,
      payment,
      period,
      from: period === "custom" ? from : "",
      to: period === "custom" ? to : "",
    };
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError("");

    try {
      const response = await api.get("/sales/report", {
        params: buildSalesReportParams(requestedFilters),
      });

      if (requestId !== requestIdRef.current) return;

      setData(response.data);
      setAppliedFilters(requestedFilters);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      setError(
        err.response?.data?.message || "Failed to load the sales report.",
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [channel, from, payment, period, to]);

  useEffect(() => {
    if (period !== "custom") load();
  }, [load, period]);
  const summary = data?.summary || {};
  const collections = data?.collections || [];
  const orders = data?.orders || [];
  const paymentMethods = data?.payment_methods || [];
  const products = data?.products || [];

  const salesByChannel = data?.sales_by_channel || [];

  const searchQuery = search.trim().toLowerCase();

  const matchesSearch = (...values) => {
    if (!searchQuery) return true;

    return values.some((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .includes(searchQuery),
    );
  };

  const filteredCollections = useMemo(
    () =>
      collections.filter((row) =>
        matchesSearch(
          row.payment_date,
          row.receipt_number,
          row.order_number,
          row.order_id,
          row.customer_name,
          paymentMethodLabel(row.payment_method),
          row.order_status,
        ),
      ),
    [collections, searchQuery],
  );

  const filteredOrders = useMemo(
    () =>
      orders.filter((row) =>
        matchesSearch(
          row.order_number,
          row.id,
          row.customer_name,
          salesChannelLabel(row.channel),
          humanize(row.order_type),
          row.total_amount,
          row.lifetime_collected,
          row.remaining_balance,
          humanize(row.payment_status),
          humanize(row.status),
        ),
      ),
    [orders, searchQuery],
  );

  const filteredSalesByChannel = useMemo(
    () =>
      salesByChannel.filter((row) =>
        matchesSearch(
          salesChannelLabel(row.channel),
          row.order_count,
          row.sales_revenue,
        ),
      ),
    [salesByChannel, searchQuery],
  );

  const filteredPaymentMethods = useMemo(
    () =>
      paymentMethods.filter((row) =>
        matchesSearch(
          paymentMethodLabel(row.payment_method),
          row.transaction_count,
          row.total_amount,
        ),
      ),
    [paymentMethods, searchQuery],
  );

  const visibleProducts = useMemo(
    () =>
      products
        .filter((row) => Number(row?.gross_order_value || 0) > 0)
        .filter((row) =>
          matchesSearch(
            row.product_name,
            row.units_sold,
            row.gross_order_value,
          ),
        )
        .slice(0, 10),
    [products, searchQuery],
  );

  const outstandingOrders = useMemo(
    () =>
      orders
        .filter((row) => Number(row?.remaining_balance || 0) > 0)
        .sort(
          (a, b) =>
            Number(b?.remaining_balance || 0) -
            Number(a?.remaining_balance || 0),
        ),
    [orders],
  );

  const channelOrderValueTotal = useMemo(
    () =>
      salesByChannel.reduce(
        (sum, row) => sum + Number(row?.sales_revenue || 0),
        0,
      ),
    [salesByChannel],
  );

  const collectionTotal = Number(summary.actual_collected || 0);

  const appliedChannel = appliedFilters?.channel ?? channel;
  const appliedPayment = appliedFilters?.payment ?? payment;
  const appliedPeriod = appliedFilters?.period ?? period;
  const appliedFrom = appliedFilters?.from ?? from;
  const appliedTo = appliedFilters?.to ?? to;

  const reportDateRangeLabel = useMemo(() => {
    if (appliedPeriod === "custom") {
      if (!appliedFrom || !appliedTo) return "Custom Range";
      return `${formatDateOnly(appliedFrom)} – ${formatDateOnly(appliedTo)}`;
    }

    const { year, month, day } = getManilaDateParts();
    const today = toCalendarYMD(year, month, day);

    if (appliedPeriod === "daily") {
      return formatDateOnly(today);
    }

    if (appliedPeriod === "weekly") {
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
      const start = shiftCalendarDate(year, month, day, mondayOffset);
      const end = shiftCalendarDate(year, month, day, mondayOffset + 6);

      return `${formatDateOnly(start)} – ${formatDateOnly(end)}`;
    }

    if (appliedPeriod === "yearly") {
      const start = toCalendarYMD(year, 1, 1);
      const end = toCalendarYMD(year, 12, 31);

      return `${formatDateOnly(start)} – ${formatDateOnly(end)}`;
    }

    const start = toCalendarYMD(year, month, 1);
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

    return `${formatDateOnly(start)} – ${formatDateOnly(end)}`;
  }, [appliedFrom, appliedPeriod, appliedTo]);

  const channelLabel =
    CHANNELS.find((item) => item.key === appliedChannel)?.label ||
    "All Channels";
  const paymentLabel =
    PAYMENT_TYPES.find((item) => item.key === appliedPayment)?.label ||
    "All Payments";
  const exportExcel = async () => {
    if (!data || !appliedFilters || loading || !canExport) return;

    let saveHandle = null;

    try {
      const channelFilenamePart =
        String(appliedChannel || "all")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || "all_channels";

      const paymentFilenamePart =
        String(appliedPayment || "all")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || "all_payments";

      const dateFilenamePart =
        appliedPeriod === "custom"
          ? `${appliedFrom || "start"}_to_${appliedTo || "end"}`
          : appliedPeriod === "daily"
            ? "today"
            : appliedPeriod === "weekly"
              ? "this_week"
              : appliedPeriod === "monthly"
                ? "this_month"
                : appliedPeriod === "yearly"
                  ? "this_year"
                  : "report_period";

      const exportTimestamp = new Date().getTime();

      const fileName = `wisdom_sales_report_${channelFilenamePart}_${paymentFilenamePart}_${dateFilenamePart}_${exportTimestamp}.xlsx`;
      /*
       * IMPORTANT:
       * Open Save As BEFORE any awaited API request so the browser
       * still considers this a direct user action.
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

      const exportParams = buildSalesReportParams(appliedFilters);

      const response = await api.get("/sales/report/print", {
        params: exportParams,
      });

      const exportData = response.data;

      const exSummary = exportData?.summary || {};
      const exSalesByChannel = exportData?.sales_by_channel || [];
      const exPaymentMethods = exportData?.payment_methods || [];

      const exVisibleProducts = (exportData?.products || [])
        .filter((row) => Number(row?.gross_order_value || 0) > 0)
        .slice(0, 10);

      const exOutstandingOrders = (exportData?.orders || [])
        .filter((row) => Number(row?.remaining_balance || 0) > 0)
        .sort(
          (a, b) =>
            Number(b?.remaining_balance || 0) -
            Number(a?.remaining_balance || 0),
        );

      const exChannelTotal = exSalesByChannel.reduce(
        (sum, row) => sum + Number(row?.sales_revenue || 0),
        0,
      );

      const exCollectionTotal = Number(exSummary.actual_collected || 0);

      const periodLabel = reportDateRangeLabel;

      const channelLabel =
        CHANNELS.find((item) => item.key === appliedChannel)?.label ||
        "All Channels";

      const paymentLabel =
        PAYMENT_TYPES.find((item) => item.key === appliedPayment)?.label ||
        "All Payments";

      const workbook = XLSX.utils.book_new();

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

      const tableHeaderStyle = {
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

      const sectionTitleStyle = {
        font: {
          bold: true,
          sz: 12,
          color: { rgb: "111827" },
        },
      };

      const t = (value) => ({
        v: value,
        s: sectionTitleStyle,
      });

      const th = (value) => ({
        v: value,
        s: tableHeaderStyle,
      });

      const c = (value) => ({
        v: value ?? "",
        s: cellStyle,
      });

      const excelMoney = (value) => ({
        v: `₱${Number(value || 0).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
        s: cellStyle,
      });

      const excelNumber = (value) => ({
        v: Number(value || 0).toLocaleString("en-PH", {
          maximumFractionDigits: 0,
        }),
        s: cellStyle,
      });

      const excelPercent = (value, total) => {
        const numerator = Number(value || 0);
        const denominator = Number(total || 0);

        const percent = denominator > 0 ? (numerator / denominator) * 100 : 0;

        return {
          v: `${percent.toFixed(2)}%`,
          s: cellStyle,
        };
      };

      const filterText = [
        "Scope: Current Filters",
        `Channel: ${channelLabel}`,
        `Payment: ${paymentLabel}`,
        `Date Filter: ${periodLabel}`,
      ].join("    |    ");

      const excelData = [
        [
          {
            v: "SPIRAL WOOD SERVICES - SALES PERFORMANCE REPORT",
            s: titleStyle,
          },
        ],
        [
          {
            v: "Review priced sales orders, verified collections, outstanding balances, and product performance.",
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

        // 1. Financial Overview
        [t("1. FINANCIAL OVERVIEW")],
        [
          "Order Value",
          "Verified Collections",
          "Balance Due",
          "Sales Orders",
          "Average Order Value",
        ].map(th),
        [
          excelMoney(exSummary.gross_order_value),
          excelMoney(exSummary.actual_collected),
          excelMoney(exSummary.outstanding_balance),
          excelNumber(exSummary.total_orders),
          excelMoney(exSummary.avg_order_value),
        ],
        [],

        // 2. Sales by Channel
        [t("2. SALES BY CHANNEL")],
        ["Channel", "Sales Orders", "Order Value", "Share of Order Value"].map(
          th,
        ),
      ];

      if (exSalesByChannel.length > 0) {
        exSalesByChannel.forEach((row) => {
          excelData.push([
            c(salesChannelLabel(row.channel)),
            excelNumber(row.order_count),
            excelMoney(row.sales_revenue),
            excelPercent(row.sales_revenue, exChannelTotal),
          ]);
        });
      } else {
        excelData.push([
          c("No channel data for this period"),
          c(""),
          c(""),
          c(""),
        ]);
      }

      excelData.push(
        [],

        // 3. Top Products
        [t("3. TOP PRODUCTS BY ORDER VALUE")],
        ["Product", "Units Ordered", "Order Value", "Share of Order Value"].map(
          th,
        ),
      );

      if (exVisibleProducts.length > 0) {
        exVisibleProducts.forEach((row) => {
          excelData.push([
            c(row.product_name || "—"),
            excelNumber(row.units_sold),
            excelMoney(row.gross_order_value),
            excelPercent(row.gross_order_value, exSummary.gross_order_value),
          ]);
        });
      } else {
        excelData.push([
          c("No product data for this period"),
          c(""),
          c(""),
          c(""),
        ]);
      }

      excelData.push(
        [],

        // 4. Payment Collections
        [t("4. PAYMENT COLLECTIONS")],
        [
          "Payment Method",
          "Verified Payments",
          "Collected Amount",
          "Share of Collections",
        ].map(th),
      );

      if (exPaymentMethods.length > 0) {
        exPaymentMethods.forEach((row) => {
          excelData.push([
            c(paymentMethodLabel(row.payment_method)),
            excelNumber(row.transaction_count),
            excelMoney(row.total_amount),
            excelPercent(row.total_amount, exCollectionTotal),
          ]);
        });
      } else {
        excelData.push([
          c("No payment data for this period"),
          c(""),
          c(""),
          c(""),
        ]);
      }

      excelData.push(
        [],

        // 5. Outstanding Balances
        [t("5. OUTSTANDING BALANCES")],
        [
          "Order Number",
          "Customer",
          "Channel",
          "Order Type",
          "Order Value",
          "Paid to Date",
          "Balance Due",
          "Payment Status",
        ].map(th),
      );

      if (exOutstandingOrders.length > 0) {
        exOutstandingOrders.forEach((row) => {
          excelData.push([
            c(row.order_number || `#${row.id}`),
            c(row.customer_name || "—"),
            c(salesChannelLabel(row.channel)),
            c(humanize(row.order_type)),
            excelMoney(row.total_amount),
            excelMoney(row.lifetime_collected),
            excelMoney(row.remaining_balance),
            c(humanize(row.payment_status)),
          ]);
        });
      } else {
        excelData.push([
          c("No outstanding balances for this period"),
          c(""),
          c(""),
          c(""),
          c(""),
          c(""),
          c(""),
          c(""),
        ]);
      }

      const sheet = XLSX.utils.aoa_to_sheet(excelData);

      sheet["!cols"] = [
        { wch: 32 },
        { wch: 20 },
        { wch: 22 },
        { wch: 22 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 22 },
      ];

      /*
       * Merge only the common report header.
       * Section titles remain normal rows so each section
       * can retain its own table structure.
       */
      sheet["!merges"] = [
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

      XLSX.utils.book_append_sheet(workbook, sheet, "Sales Report");

      if (saveHandle) {
        const writable = await saveHandle.createWritable();

        try {
          const buffer = XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array",
          });

          await writable.write(buffer);
        } finally {
          await writable.close();
        }
      } else {
        XLSX.writeFile(workbook, fileName);
      }

      toast.success("Sales report exported successfully.");
    } catch (err) {
      if (err?.name !== "AbortError") {
        toast.error(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to generate the export file.",
        );
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div id="print-area" className="sales-admin-v3">
      <div className="sales-page-header">
        <div>
          <h1>Sales Report</h1>
          <p>
            Review priced sales orders, verified collections, outstanding
            balances, and product performance.
          </p>
        </div>

        <div className="sales-header-actions no-print">
          <button
            type="button"
            className="sales-button sales-button-primary"
            onClick={exportExcel}
            disabled={!data || !appliedFilters || loading || !canExport}
            title={
              !canExport
                ? "Sales report export permission is required."
                : undefined
            }
          >
            Export Report
          </button>
          <button
            type="button"
            className="sales-button sales-button-secondary"
            onClick={() => window.print()}
            disabled={!data || !appliedFilters || loading || !canExport}
            title={
              !canExport
                ? "Sales report export permission is required."
                : undefined
            }
          >
            Print
          </button>
        </div>
      </div>

      <div className="sales-report-meta">
        <span>
          <strong>Generated:</strong>{" "}
          {reportGeneratedAt.toLocaleString("en-PH", {
            timeZone: REPORT_TIME_ZONE,
          })}
        </span>

        <span>
          <strong>Generated By:</strong> {user?.name || "Administrator"}
        </span>

        <span>
          <strong>Scope:</strong> Sales Report
        </span>
      </div>

      <div
        className="sales-detail-switch no-print"
        role="group"
        aria-label="Sales report detail view"
      >
        <button
          type="button"
          className={
            detailSection === "orders" ? "sales-detail-switch-active" : ""
          }
          aria-pressed={detailSection === "orders"}
          onClick={() => setDetailSection("orders")}
        >
          Order Financial Status
          <span>{count(orders.length)} orders</span>
        </button>

        <button
          type="button"
          className={
            detailSection === "payments" ? "sales-detail-switch-active" : ""
          }
          aria-pressed={detailSection === "payments"}
          onClick={() => setDetailSection("payments")}
        >
          Verified Payments
          <span>{count(collections.length)} payments</span>
        </button>
      </div>

      <div className="sales-toolbar no-print">
        <div className="sales-toolbar-row">
          <label
            className="sales-filter-field"
            style={{
              flex: "1 1 320px",
              minWidth: 320,
            }}
          >
            <span className="sales-filter-label">Search Records</span>

            <input
              type="search"
              value={search}
              maxLength={100}
              aria-label="Search sales report records"
              placeholder="Search orders, customers, payments..."
              onChange={(event) => {
                setSearch(event.target.value.slice(0, 100));
              }}
            />
          </label>
          <label className="sales-filter-field">
            <span className="sales-filter-label">Sales Channel</span>
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              {CHANNELS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="sales-filter-field">
            <span className="sales-filter-label">Payment Type</span>
            <select
              value={payment}
              onChange={(event) => setPayment(event.target.value)}
            >
              {PAYMENT_TYPES.map((item) => (
                <option key={item.key || "all"} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="sales-filter-field">
            <span className="sales-filter-label">Report Period</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              {PERIODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {period === "custom" ? (
            <>
              <label className="sales-filter-field">
                <span className="sales-filter-label">From Date</span>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>

              <label className="sales-filter-field">
                <span className="sales-filter-label">To Date</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>

              <button
                type="button"
                className="sales-button sales-button-primary sales-custom-apply"
                onClick={load}
                disabled={!from || !to || from > to || loading}
              >
                Apply Date Range
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div className="sales-error">{error}</div> : null}
      {loading ? <div className="sales-loading">Loading report...</div> : null}

      {!loading && data ? (
        <>
          <div className="sales-summary-grid">
            <SummaryCard
              label="Order Value"
              value={money(summary.gross_order_value)}
              note="Priced, non-cancelled orders in this period"
            />
            <SummaryCard
              label="Verified Collections"
              value={money(summary.actual_collected)}
              note={`${count(summary.collection_count)} verified payment${
                Number(summary.collection_count || 0) === 1 ? "" : "s"
              } in this period`}
            />
            <SummaryCard
              label="Balance Due"
              value={money(summary.outstanding_balance)}
              note="Current unpaid balance on included sales orders"
            />
            <SummaryCard
              label="Sales Orders"
              value={count(summary.total_orders)}
              note="Priced, non-cancelled orders"
            />
            <SummaryCard
              label="Avg. Order Value"
              value={money(summary.avg_order_value)}
              note="Average value of included sales orders"
            />
          </div>

          <section
            className={`sales-card sales-table-card sales-detail-panel ${
              detailSection === "payments" ? "sales-detail-panel-active" : ""
            }`}
          >
            <SectionHeader
              title="Verified Payments"
              subtitle={`${count(collections.length)} verified payment${
                collections.length === 1 ? "" : "s"
              } recorded in the selected period`}
            />

            <div className="sales-table-scroll sales-table-scroll-payments">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Payment Date</th>
                    <th>Receipt Number</th>
                    <th>Order Number</th>
                    <th>Customer</th>
                    <th>Payment Method</th>
                    <th className="sales-align-right">Amount</th>
                    <th>Order Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCollections.length === 0 ? (
                    <EmptyRow
                      colSpan={7}
                      text="No verified payments for this period."
                    />
                  ) : (
                    filteredCollections.map((row) => (
                      <tr
                        key={row.payment_transaction_id}
                        className="sales-body-row sales-clickable-row"
                        onClick={() =>
                          navigate(`/admin/orders/${row.order_id}`)
                        }
                      >
                        <td>{dateTime(row.payment_date)}</td>
                        <td>{row.receipt_number || "—"}</td>
                        <td className="sales-key-text">
                          {row.order_number || `#${row.order_id}`}
                        </td>
                        <td>{row.customer_name || "—"}</td>
                        <td>{paymentMethodLabel(row.payment_method)}</td>
                        <td className="sales-align-right sales-key-amount">
                          {money(row.amount)}
                        </td>
                        <td>
                          <Badge value={row.order_status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section
            className={`sales-card sales-table-card sales-detail-panel ${
              detailSection === "orders" ? "sales-detail-panel-active" : ""
            }`}
          >
            <SectionHeader
              title="Order Financial Status"
              subtitle="Order value, total verified payments to date, current balance, and status"
            />

            <div className="sales-table-scroll sales-table-scroll-orders">
              <table className="sales-table sales-orders-table">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Customer</th>
                    <th>Channel</th>
                    <th>Order Type</th>
                    <th className="sales-align-right">Order Value</th>
                    <th className="sales-align-right">Paid to Date</th>
                    <th className="sales-align-right">Balance Due</th>
                    <th>Payment Status</th>
                    <th>Order Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <EmptyRow
                      colSpan={9}
                      text="No matching priced sales orders for this period."
                    />
                  ) : (
                    filteredOrders.map((row) => (
                      <tr
                        key={row.id}
                        className="sales-body-row sales-clickable-row"
                        onClick={() => navigate(`/admin/orders/${row.id}`)}
                      >
                        <td className="sales-key-text">
                          {row.order_number || `#${row.id}`}
                        </td>
                        <td>{row.customer_name || "—"}</td>
                        <td>{salesChannelLabel(row.channel)}</td>
                        <td>{humanize(row.order_type)}</td>
                        <td className="sales-align-right">
                          {money(row.total_amount)}
                        </td>
                        <td className="sales-align-right sales-key-amount">
                          {money(row.lifetime_collected)}
                        </td>
                        <td className="sales-align-right">
                          {money(row.remaining_balance)}
                        </td>
                        <td>
                          <Badge value={row.payment_status} />
                        </td>
                        <td>
                          <Badge value={row.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="sales-bottom-grid">
            <section className="sales-card sales-channel-card">
              <SectionHeader
                title="Sales by Channel"
                subtitle="Priced sales orders by sales channel"
              />

              <div className="sales-channel-list">
                {filteredSalesByChannel.map((row) => (
                  <div key={row.channel} className="sales-channel-row">
                    <div>
                      <div className="sales-channel-name">
                        {salesChannelLabel(row.channel)}
                      </div>
                      <div className="sales-channel-meta">
                        {count(row.order_count)} sales order
                        {Number(row.order_count || 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="sales-channel-amount">
                      {money(row.sales_revenue)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="sales-card sales-payment-method-card">
              <SectionHeader
                title="Collection Breakdown"
                subtitle="Verified collections by payment method"
              />

              <div className="sales-payment-method-list">
                {filteredPaymentMethods.length === 0 ? (
                  <div className="sales-small-empty">
                    No verified payments for this period.
                  </div>
                ) : (
                  filteredPaymentMethods.map((row) => (
                    <div
                      key={row.payment_method}
                      className="sales-payment-method-row"
                    >
                      <div>
                        <div className="sales-payment-method-name">
                          {paymentMethodLabel(row.payment_method)}
                        </div>
                        <div className="sales-payment-method-meta">
                          {count(row.transaction_count)} verified payment
                          {Number(row.transaction_count || 0) === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="sales-payment-method-amount">
                        {money(row.total_amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="sales-card sales-top-products-card">
              <SectionHeader
                title="Top Products by Order Value"
                subtitle="Highest-value products from priced sales orders"
              />

              <div className="sales-table-scroll sales-table-scroll-products">
                <table className="sales-table sales-products-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="sales-align-right">Units Ordered</th>
                      <th className="sales-align-right">Order Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.length === 0 ? (
                      <EmptyRow
                        colSpan={3}
                        text="No priced product sales for this period."
                      />
                    ) : (
                      visibleProducts.map((row, index) => (
                        <tr key={`${row.product_name}-${index}`}>
                          <td className="sales-product-name">
                            {row.product_name || "—"}
                          </td>
                          <td className="sales-align-right">
                            {quantity(row.units_sold)}
                          </td>
                          <td className="sales-align-right sales-key-amount">
                            {money(row.gross_order_value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      ) : null}

      {/* PRINT-ONLY SALES REPORT */}
      <div className="sales-print-report">
        <div className="sales-print-header">
          <h1>SPIRAL WOOD SERVICES</h1>
          <h2>SALES PERFORMANCE REPORT</h2>

          <div className="sales-print-meta">
            <span>
              <strong>Channel:</strong> {channelLabel}
            </span>
            <span>
              <strong>Period:</strong> {reportDateRangeLabel}
            </span>
            <span>
              <strong>Generated:</strong>{" "}
              {new Date().toLocaleString("en-PH", {
                timeZone: REPORT_TIME_ZONE,
              })}
            </span>
          </div>

          <p className="sales-print-scope">
            Priced non-cancelled orders created in the selected period.
            Collections are verified payments recorded in the selected period.
          </p>
        </div>

        <section className="sales-print-section">
          <h3>1. Financial Overview</h3>
          <table>
            <thead>
              <tr>
                <th>Order Value</th>
                <th>Verified Collections</th>
                <th>Balance Due</th>
                <th>Sales Orders</th>
                <th>Avg. Order Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{money(summary.gross_order_value)}</td>
                <td>{money(summary.actual_collected)}</td>
                <td>{money(summary.outstanding_balance)}</td>
                <td>{count(summary.total_orders)}</td>
                <td>{money(summary.avg_order_value)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>2. Sales by Channel</h3>
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Sales Orders</th>
                <th>Order Value</th>
                <th>Share of Order Value</th>
              </tr>
            </thead>
            <tbody>
              {salesByChannel.map((row) => (
                <tr key={row.channel}>
                  <td>{salesChannelLabel(row.channel)}</td>
                  <td>{count(row.order_count)}</td>
                  <td>{money(row.sales_revenue)}</td>
                  <td>
                    {percentage(row.sales_revenue, channelOrderValueTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>3. Top Products by Order Value</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Units Ordered</th>
                <th>Order Value</th>
                <th>Share of Order Value</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.length === 0 ? (
                <tr>
                  <td colSpan="4">No priced product sales for this period.</td>
                </tr>
              ) : (
                visibleProducts.map((row, index) => (
                  <tr key={`${row.product_name}-${index}`}>
                    <td>{row.product_name || "—"}</td>
                    <td>{quantity(row.units_sold)}</td>
                    <td>{money(row.gross_order_value)}</td>
                    <td>
                      {percentage(
                        row.gross_order_value,
                        summary.gross_order_value,
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>4. Payment Collections</h3>
          <table>
            <thead>
              <tr>
                <th>Payment Method</th>
                <th>Verified Payments</th>
                <th>Collected Amount</th>
                <th>Share of Collections</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.length === 0 ? (
                <tr>
                  <td colSpan="4">No verified payments for this period.</td>
                </tr>
              ) : (
                paymentMethods.map((row) => (
                  <tr key={row.payment_method}>
                    <td>{paymentMethodLabel(row.payment_method)}</td>
                    <td>{count(row.transaction_count)}</td>
                    <td>{money(row.total_amount)}</td>
                    <td>{percentage(row.total_amount, collectionTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="sales-print-section">
          <h3>5. Outstanding Balances</h3>
          <table>
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Customer</th>
                <th>Channel</th>
                <th>Order Type</th>
                <th>Order Value</th>
                <th>Paid to Date</th>
                <th>Balance Due</th>
                <th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {outstandingOrders.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    No outstanding balances for the selected report scope.
                  </td>
                </tr>
              ) : (
                outstandingOrders.map((row) => (
                  <tr key={row.id}>
                    <td>{row.order_number || `#${row.id}`}</td>
                    <td>{row.customer_name || "—"}</td>
                    <td>{salesChannelLabel(row.channel)}</td>
                    <td>{humanize(row.order_type)}</td>
                    <td>{money(row.total_amount)}</td>
                    <td>{money(row.lifetime_collected)}</td>
                    <td>{money(row.remaining_balance)}</td>
                    <td>{humanize(row.payment_status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <div className="sales-print-footer">
          Internal sales report · Spiral Wood Services
        </div>
      </div>
    </div>
  );
}

// WISDOM SALES REPORT PROFESSIONAL MANAGEMENT REPORT V2
