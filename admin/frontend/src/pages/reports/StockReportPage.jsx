import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, X, FileDown } from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

import "./StockReportPage.css";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const humanize = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const pdfFormatDateTime = (value) => {
  if (!value) return "—";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const pdfFormatQuantity = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString("en-PH", {
    maximumFractionDigits: 4,
  });
};

const pdfSanitizeFilename = (value) =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "record";

const pdfGetMovementQuantity = (record = {}) => {
  const isPositive = record.type === "in" || record.type === "return";

  const unit = record.material_unit ? ` ${record.material_unit}` : "";

  if (record.type === "adjustment") {
    return `Set to ${pdfFormatQuantity(record.quantity)}${unit}`;
  }

  return `${
    isPositive ? "+" : "-"
  }${pdfFormatQuantity(record.quantity)}${unit}`;
};

const createStockRecordPdf = ({
  recordType,
  record = {},
  fields = [],
  skipKeys = [],
  filename,
}) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const leftMargin = 15;
  const rightMargin = 15;
  const contentWidth = pageWidth - leftMargin - rightMargin;

  let currentY = 15;

  const generatedAt = pdfFormatDateTime(new Date());
  const title = `${String(recordType).toUpperCase()} RECORD`;

  const addHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(25, 25, 25);
    doc.text("SPIRAL WOOD SERVICES", leftMargin, currentY);

    currentY += 7;

    doc.setFontSize(10.5);
    doc.text(title, leftMargin, currentY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(95, 95, 95);
    doc.text(`Generated: ${generatedAt}`, pageWidth - rightMargin, 15, {
      align: "right",
    });

    currentY += 6;

    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.3);
    doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY);

    currentY += 8;
  };

  const addFooter = () => {
    const totalPages = doc.getNumberOfPages();

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      doc.setPage(pageNumber);

      doc.setDrawColor(215, 215, 215);
      doc.setLineWidth(0.25);

      doc.line(
        leftMargin,
        pageHeight - 12,
        pageWidth - rightMargin,
        pageHeight - 12,
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);

      doc.text(`Report generated: ${generatedAt}`, leftMargin, pageHeight - 6);

      doc.text(
        `${recordType} Record | Page ${pageNumber} of ${totalPages}`,
        pageWidth - rightMargin,
        pageHeight - 6,
        { align: "right" },
      );
    }
  };

  const ensureSpace = (requiredHeight = 10) => {
    if (currentY + requiredHeight <= pageHeight - 18) {
      return;
    }

    doc.addPage();
    currentY = 15;
    addHeader();
  };

  const addSection = (sectionTitle) => {
    ensureSpace(13);

    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.25);

    doc.rect(leftMargin, currentY, contentWidth, 8, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(40, 40, 40);

    doc.text(sectionTitle.toUpperCase(), leftMargin + 3, currentY + 5.2);

    currentY += 11;
  };

  const addField = (label, value) => {
    const safeValue =
      value === null || value === undefined || value === ""
        ? "—"
        : String(value);

    const labelWidth = 48;
    const valueX = leftMargin + labelWidth + 3;
    const valueWidth = contentWidth - labelWidth - 6;

    const wrappedValue = doc.splitTextToSize(safeValue, valueWidth);

    const rowHeight = Math.max(9, wrappedValue.length * 4.5 + 4);

    ensureSpace(rowHeight);

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.25);

    doc.rect(leftMargin, currentY, contentWidth, rowHeight);

    doc.line(
      leftMargin + labelWidth,
      currentY,
      leftMargin + labelWidth,
      currentY + rowHeight,
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(55, 55, 55);

    doc.text(label, leftMargin + 3, currentY + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(45, 45, 45);

    doc.text(wrappedValue, valueX, currentY + 5.5);

    currentY += rowHeight;
  };

  const addTable = (headers, rows, widths) => {
    const headerHeight = 8;

    ensureSpace(headerHeight + 8);

    doc.setFillColor(38, 38, 38);
    doc.setDrawColor(38, 38, 38);

    doc.rect(leftMargin, currentY, contentWidth, headerHeight, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);

    let headerX = leftMargin;

    headers.forEach((header, index) => {
      doc.text(String(header), headerX + 2, currentY + 5.2);

      headerX += widths[index];
    });

    currentY += headerHeight;

    rows.forEach((row) => {
      const lineSets = row.map((cell, index) =>
        doc.splitTextToSize(
          String(cell ?? "—"),
          Math.max(8, widths[index] - 4),
        ),
      );

      const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));

      const rowHeight = Math.max(8, maxLines * 4 + 4);

      if (currentY + rowHeight > pageHeight - 18) {
        doc.addPage();
        currentY = 15;
        addHeader();

        doc.setFillColor(38, 38, 38);
        doc.rect(leftMargin, currentY, contentWidth, headerHeight, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);

        let repeatedHeaderX = leftMargin;

        headers.forEach((header, index) => {
          doc.text(String(header), repeatedHeaderX + 2, currentY + 5.2);

          repeatedHeaderX += widths[index];
        });

        currentY += headerHeight;
      }

      let x = leftMargin;

      row.forEach((_, index) => {
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.25);

        doc.rect(x, currentY, widths[index], rowHeight);

        x += widths[index];
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(45, 45, 45);

      x = leftMargin;

      lineSets.forEach((lines, index) => {
        doc.text(lines, x + 2, currentY + 4.7);

        x += widths[index];
      });

      currentY += rowHeight;
    });
  };

  addHeader();

  /*
   * Record header/status area.
   */
  addSection("Record Information");

  addField("Record ID", record.id);

  if (record.reference_code || record.reference) {
    addField("Reference", record.reference_code || record.reference || "—");
  }

  addSection(`${recordType} Details`);

  fields.forEach(([label, value]) => {
    addField(label, value);
  });

  /*
   * Same Additional Details behavior as View Details.
   */
  const extraKeys = Object.entries(record).filter(
    ([key, value]) =>
      value !== null &&
      value !== "" &&
      typeof value !== "object" &&
      !key.includes("url") &&
      !key.includes("json") &&
      !skipKeys.includes(key),
  );

  if (extraKeys.length > 0) {
    addSection("Additional Details");

    extraKeys.forEach(([key, value]) => {
      const isDate = key.includes("date") || key.includes("_at");

      addField(humanize(key), isDate ? pdfFormatDateTime(value) : value);
    });
  }

  if (
    recordType === "Stock Transfer" &&
    Array.isArray(record.items) &&
    record.items.length > 0
  ) {
    addSection("Transferred Items");

    addTable(
      ["Item", "Quantity", "Unit"],
      record.items.map((item) => [
        item.product_name || item.material_name || item.name || "—",
        pdfFormatQuantity(item.quantity ?? item.total_quantity),
        item.unit || item.material_unit || "—",
      ]),
      [95, 40, contentWidth - 135],
    );
  }

  addFooter();

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const exportStockMovementRecordPdf = (record = {}) => {
  const recordId =
    record.id || record.reference_code || record.reference || "record";

  createStockRecordPdf({
    recordType: "Stock Movement",
    record,
    fields: [
      ["Movement", MOVEMENT_LABELS[record.type] || humanize(record.type)],
      ["Source", SOURCE_LABELS[record.movement_source] || "Manual entry"],
      [
        "Item",
        record.material_name ||
          record.product_name ||
          record.item_summary ||
          "—",
      ],
      ["Quantity", pdfGetMovementQuantity(record)],
      ["Recorded By", record.created_by_name || "System"],
      ["Date & Time", pdfFormatDateTime(record.created_at)],
    ],
    skipKeys: [
      "id",
      "reference_code",
      "reference",
      "type",
      "movement_source",
      "quantity",
      "material_unit",
      "material_name",
      "product_name",
      "item_summary",
      "created_by_name",
      "created_at",
      "updated_at",
    ],
    filename: `stock_movement_${pdfSanitizeFilename(recordId)}.pdf`,
  });
};

const exportStockTransferRecordPdf = (record = {}) => {
  const recordId =
    record.id || record.reference_code || record.reference || "record";

  createStockRecordPdf({
    recordType: "Stock Transfer",
    record,
    fields: [
      ["From", DIRECTIONS[record.direction]?.from || "—"],
      ["To", DIRECTIONS[record.direction]?.to || "—"],
      ["Total Quantity", pdfFormatQuantity(record.total_quantity)],
      ["Items", record.item_summary || `${record.item_count || 0} product(s)`],
      ["Transferred By", record.transferred_by_name || "System"],
      ["Date & Time", pdfFormatDateTime(record.created_at)],
    ],
    skipKeys: [
      "id",
      "reference_code",
      "reference",
      "direction",
      "total_quantity",
      "item_summary",
      "item_count",
      "transferred_by_name",
      "created_by_name",
      "created_at",
      "updated_at",
      "reversal_of_transfer_id",
      "reversed_by_transfer_id",
    ],
    filename: `stock_transfer_${pdfSanitizeFilename(recordId)}.pdf`,
  });
};

const exportStockRecordPdf = (record = {}, reportType) => {
  if (!record || typeof record !== "object") {
    throw new Error("No stock record is available for export.");
  }

  if (reportType === "transfers") {
    return exportStockTransferRecordPdf(record);
  }

  return exportStockMovementRecordPdf(record);
};

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

const PAGE_SIZE = 20;
const MOVEMENT_EXPORT_PAGE_SIZE = 200;

const TRANSFER_EXPORT_PAGE_SIZE = 100;

const EMPTY_TRANSFER_SUMMARY = {
  completed_transfers: 0,
  reversed_transfers: 0,
};

const buildStockTransferParams = ({
  page,
  limit,
  search,
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

  if (normalizedSearch) {
    params.search = normalizedSearch;
  }

  if (dateFilter === "custom") {
    if (customStart) params.from = customStart;
    if (customEnd) params.to = customEnd;
  }

  if (!includeSummary) {
    params.include_summary = 0;
  }

  return params;
};

const EMPTY_MOVEMENT_SUMMARY = {
  record_count: 0,
  in_count: 0,
  out_count: 0,
};

const buildStockMovementParams = ({
  page,
  limit,
  search,
  movementType,
  inventoryType,
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

  if (normalizedSearch) {
    params.search = normalizedSearch;
  }

  if (movementType) {
    params.type = movementType;
  }

  if (inventoryType) {
    params.inventory_type = inventoryType;
  }

  if (dateFilter === "custom") {
    if (customStart) params.from = customStart;
    if (customEnd) params.to = customEnd;
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [movementType, setMovementType] = useState("");
  const [inventoryType, setInventoryType] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState({ open: false, data: null });

  // Data
  const [rows, setRows] = useState([]);
  const [movementTotal, setMovementTotal] = useState(0);
  const [movementSummary, setMovementSummary] = useState(
    EMPTY_MOVEMENT_SUMMARY,
  );
  const [transferTotal, setTransferTotal] = useState(0);
  const [transferSummary, setTransferSummary] = useState(
    EMPTY_TRANSFER_SUMMARY,
  );
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const loadMovements = useCallback(async () => {
    setLoading(true);

    try {
      const { data } = await api.get("/inventory/movements", {
        params: buildStockMovementParams({
          page,
          limit: PAGE_SIZE,
          search: debouncedSearch,
          movementType,
          inventoryType,
          dateFilter,
          customStart,
          customEnd,
        }),
      });

      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setMovementTotal(Number(data?.total || 0));
      setMovementSummary({
        ...EMPTY_MOVEMENT_SUMMARY,
        ...(data?.summary || {}),
      });
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load stock movements.",
      );
      setRows([]);
      setMovementTotal(0);
      setMovementSummary(EMPTY_MOVEMENT_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    debouncedSearch,
    movementType,
    inventoryType,
    dateFilter,
    customStart,
    customEnd,
  ]);

  const loadTransfers = useCallback(async () => {
    setLoading(true);

    try {
      const { data } = await api.get("/inventory/transfers", {
        params: buildStockTransferParams({
          page,
          limit: PAGE_SIZE,
          search: debouncedSearch,
          dateFilter,
          customStart,
          customEnd,
        }),
      });

      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTransferTotal(Number(data?.total || 0));
      setTransferSummary({
        ...EMPTY_TRANSFER_SUMMARY,
        ...(data?.summary || {}),
      });
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load stock transfers.",
      );
      setRows([]);
      setTransferTotal(0);
      setTransferSummary(EMPTY_TRANSFER_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    debouncedSearch,
    dateFilter,
    customStart,
    customEnd,
  ]);


  const loadReport = useCallback(() => {
    if (reportType === "movements") {
      return loadMovements();
    }

    return loadTransfers();
  }, [loadMovements, loadTransfers, reportType]);

  useEffect(() => {
    if (reportType === "movements") {
      loadMovements();
    }
  }, [loadMovements, reportType]);

  useEffect(() => {
    if (reportType === "transfers") {
      loadTransfers();
    }
  }, [loadTransfers, reportType]);

  const filteredRows = rows;

  const reportRecordCount =
    reportType === "movements" ? movementTotal : transferTotal;

  const paginatedRows = rows;

  const totalPages = Math.max(
    1,
    Math.ceil(reportRecordCount / PAGE_SIZE),
  );

  const summary = useMemo(() => {
    if (reportType === "movements") {
      return {
        total: movementTotal,
        metric1: Number(movementSummary?.in_count || 0),
        metric2: Number(movementSummary?.out_count || 0),
      };
    }

    return {
      total: transferTotal,
      metric1: Number(transferSummary?.completed_transfers || 0),
      metric2: Number(transferSummary?.reversed_transfers || 0),
    };
  }, [
    movementSummary,
    movementTotal,
    reportType,
    transferSummary,
    transferTotal,
  ]);

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
      let exportRows = filteredRows;

      if (reportType === "movements") {
        const firstResponse = await api.get("/inventory/movements", {
          params: buildStockMovementParams({
            page: 1,
            limit: MOVEMENT_EXPORT_PAGE_SIZE,
            search,
            movementType,
            inventoryType,
            dateFilter,
            customStart,
            customEnd,
          }),
        });

        exportRows = Array.isArray(firstResponse.data?.rows)
          ? [...firstResponse.data.rows]
          : [];

        const exportTotal = Number(firstResponse.data?.total || 0);
        const exportPages = Math.max(
          1,
          Math.ceil(exportTotal / MOVEMENT_EXPORT_PAGE_SIZE),
        );

        for (let exportPage = 2; exportPage <= exportPages; exportPage += 1) {
          const { data } = await api.get("/inventory/movements", {
            params: buildStockMovementParams({
              page: exportPage,
              limit: MOVEMENT_EXPORT_PAGE_SIZE,
              search,
              movementType,
              inventoryType,
              dateFilter,
              customStart,
              customEnd,
              includeSummary: false,
            }),
          });

          const batch = Array.isArray(data?.rows) ? data.rows : [];
          exportRows.push(...batch);

          if (batch.length === 0) break;
        }

        if (exportRows.length !== exportTotal) {
          throw new Error(
            "Stock movement records changed while the export was being prepared. Please export again.",
          );
        }

        headers = [
          "Date & Time",
          "Movement Type",
          "Source",
          "Item Name",
          "Quantity",
          "Order / Ref",
          "Recorded By",
        ];
        mappedData = exportRows.map((r) => [
          formatDateTime(r.created_at),
          MOVEMENT_LABELS[r.type] || "Movement",
          SOURCE_LABELS[r.movement_source] || "Manual entry",
          r.material_name || r.product_name || "—",
          getMovementQuantityLabel(r),
          r.order_number || r.reference || "—",
          r.created_by_name || "System",
        ]);
      } else {
        const firstResponse = await api.get("/inventory/transfers", {
          params: buildStockTransferParams({
            page: 1,
            limit: TRANSFER_EXPORT_PAGE_SIZE,
            search,
            dateFilter,
            customStart,
            customEnd,
          }),
        });

        exportRows = Array.isArray(firstResponse.data?.rows)
          ? [...firstResponse.data.rows]
          : [];

        const exportTotal = Number(firstResponse.data?.total || 0);
        const exportPages = Math.max(
          1,
          Math.ceil(exportTotal / TRANSFER_EXPORT_PAGE_SIZE),
        );

        for (let exportPage = 2; exportPage <= exportPages; exportPage += 1) {
          const { data } = await api.get("/inventory/transfers", {
            params: buildStockTransferParams({
              page: exportPage,
              limit: TRANSFER_EXPORT_PAGE_SIZE,
              search,
              dateFilter,
              customStart,
              customEnd,
              includeSummary: false,
            }),
          });

          const batch = Array.isArray(data?.rows) ? data.rows : [];
          exportRows.push(...batch);

          if (batch.length === 0) break;
        }

        if (exportRows.length !== exportTotal) {
          throw new Error(
            "Stock transfer records changed while the export was being prepared. Please export again.",
          );
        }

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
        mappedData = exportRows.map((r) => [
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
            disabled={loading || reportRecordCount === 0 || exporting}
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

      <div
        className="stk-report-tabs stk-no-print"
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
            setReportType("movements");
            setMovementType("");
            setInventoryType("");
            setSearch("");
            setDebouncedSearch("");
            setPage(1);
          }}
          style={{
            padding: "10px 18px",
            border: "none",
            borderBottom:
              reportType === "movements"
                ? "2px solid #18181b"
                : "2px solid transparent",
            background: reportType === "movements" ? "#18181b" : "#f1f1f3",
            color: reportType === "movements" ? "#ffffff" : "#3f3f46",
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: "4px 4px 0 0",
            boxShadow:
              reportType === "movements"
                ? "0 2px 0 #18181b"
                : "0 2px 4px rgba(24, 24, 27, 0.14)",
          }}
        >
          Stock Movement
        </button>

        <button
          type="button"
          onClick={() => {
            setReportType("transfers");
            setMovementType("");
            setInventoryType("");
            setSearch("");
            setDebouncedSearch("");
            setPage(1);
          }}
          style={{
            padding: "10px 18px",
            border: "none",
            borderBottom:
              reportType === "transfers"
                ? "2px solid #18181b"
                : "2px solid transparent",
            background: reportType === "transfers" ? "#18181b" : "#f1f1f3",
            color: reportType === "transfers" ? "#ffffff" : "#3f3f46",
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: "4px 4px 0 0",
            boxShadow:
              reportType === "transfers"
                ? "0 2px 0 #18181b"
                : "0 2px 4px rgba(24, 24, 27, 0.14)",
          }}
        >
          Stock Transfer
        </button>
      </div>

      <div className="stk-toolbar stk-no-print">
        {/* SEARCH BAR PLACED FIRST TO EXPAND ON LEFT */}
        <label className="stk-filter-field stk-search-field">
          <span>Search Records</span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search references, items, users..."
          />
        </label>

        {reportType === "movements" && (
          <>
            <label className="stk-filter-field" style={{ minWidth: 140 }}>
              <span>Inventory Type</span>
              <select
                value={inventoryType}
                onChange={(e) => {
                  setInventoryType(e.target.value);
                  setPage(1);
                }}
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
                onChange={(e) => {
                  setMovementType(e.target.value);
                  setPage(1);
                }}
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
              setPage(1);
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
                onChange={(e) => {
                  setCustomStart(e.target.value);
                  setPage(1);
                }}
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
                {reportRecordCount} record(s)
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
                    <th style={{ width: 110 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
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
                        <td className="stk-action-cell">
                          <button
                            type="button"
                            className="stk-button-text"
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

            {reportRecordCount > 0 && (
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
                  Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                  {Math.min(page * PAGE_SIZE, reportRecordCount)} of{" "}
                  {reportRecordCount} records
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

      {detail.open && detail.data && (
        <div
          className="stk-detail-overlay"
          onClick={() => setDetail({ open: false, data: null })}
        >
          <aside
            className="stk-detail-panel"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="stk-detail-head">
              <div>
                <span>
                  {reportType === "movements" ? "MOVEMENT" : "TRANSFER"} DETAILS
                </span>
                <h2>
                  {detail.data.reference_code ||
                    detail.data.reference ||
                    `Record #${detail.data.id}`}
                </h2>
                <p>
                  {detail.data.material_name ||
                    detail.data.product_name ||
                    detail.data.item_summary ||
                    "Inventory Record"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDetail({ open: false, data: null })}
              >
                <X size={19} />
              </button>
            </div>

            <div className="stk-detail-status-row">
              <span
                className={`stk-detail-status stk-detail-status-${normalize(detail.data.type || (detail.data.reversal_of_transfer_id ? "undo" : detail.data.reversed_by_transfer_id ? "undone" : "completed"))}`}
              >
                {reportType === "movements"
                  ? MOVEMENT_LABELS[detail.data.type] || "Movement"
                  : detail.data.reversal_of_transfer_id
                    ? "Undo"
                    : detail.data.reversed_by_transfer_id
                      ? "Undone"
                      : "Completed"}
              </span>
              <span>Record ID: {detail.data.id}</span>
            </div>

            <section className="stk-detail-grid">
              {reportType === "movements" ? (
                <>
                  <div>
                    <span>Source</span>
                    <strong>
                      {SOURCE_LABELS[detail.data.movement_source] ||
                        "Manual entry"}
                    </strong>
                  </div>
                  <div>
                    <span>Quantity</span>
                    <strong>{getMovementQuantityLabel(detail.data)}</strong>
                  </div>
                  <div>
                    <span>Recorded By</span>
                    <strong>{detail.data.created_by_name || "System"}</strong>
                  </div>
                  <div>
                    <span>Date & Time</span>
                    <strong>{formatDateTime(detail.data.created_at)}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>From</span>
                    <strong>
                      {DIRECTIONS[detail.data.direction]?.from || "—"}
                    </strong>
                  </div>
                  <div>
                    <span>To</span>
                    <strong>
                      {DIRECTIONS[detail.data.direction]?.to || "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Total Quantity</span>
                    <strong>{Number(detail.data.total_quantity || 0)}</strong>
                  </div>
                  <div>
                    <span>Items</span>
                    <strong>
                      {detail.data.item_summary ||
                        `${detail.data.item_count || 0} product(s)`}
                    </strong>
                  </div>
                  <div>
                    <span>Transferred By</span>
                    <strong>
                      {detail.data.transferred_by_name || "System"}
                    </strong>
                  </div>
                  <div>
                    <span>Date & Time</span>
                    <strong>{formatDateTime(detail.data.created_at)}</strong>
                  </div>
                </>
              )}
            </section>

            {(() => {
              const skipKeys = [
                "id",
                "type",
                "movement_source",
                "quantity",
                "material_unit",
                "created_by_name",
                "created_at",
                "updated_at",
                "direction",
                "total_quantity",
                "item_summary",
                "item_count",
                "transferred_by_name",
                "reference_code",
                "reference",
                "material_name",
                "product_name",
                "reversal_of_transfer_id",
                "reversed_by_transfer_id",
              ];
              const extraKeys = Object.entries(detail.data).filter(
                ([k, v]) =>
                  v !== null &&
                  v !== "" &&
                  typeof v !== "object" &&
                  !k.includes("url") &&
                  !k.includes("json") &&
                  !skipKeys.includes(k),
              );

              if (extraKeys.length > 0) {
                return (
                  <section className="stk-detail-section">
                    <h3>Additional Details</h3>
                    <div className="stk-detail-subgrid">
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

            <div className="stk-detail-footer">
              <button
                type="button"
                className="stk-button stk-button-secondary"
                onClick={() => setDetail({ open: false, data: null })}
              >
                Close
              </button>
              <button
                type="button"
                className="stk-button stk-button-primary"
                onClick={() => {
                  if (!detail.data) return;

                  try {
                    exportStockRecordPdf(detail.data, reportType);

                    toast.success(
                      `${
                        reportType === "movements"
                          ? "Stock movement"
                          : "Stock transfer"
                      } record downloaded.`,
                    );
                  } catch (exportError) {
                    console.error("Stock PDF Export Error:", exportError);

                    toast.error(
                      exportError?.message ||
                        "Failed to export the selected stock record.",
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
