import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, X, FileDown, Download } from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import useAuthStore from "../../store/authStore";

import DeliveryReceiptModal from "../../components/delivery/DeliveryReceiptModal";
import DownloadFileButton from "../../components/delivery/DownloadFileButton";
import { exportDeliveryRecordPdf } from "../staff/DeliveryReportPdf";

import "./OperationsReportPage.css";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatStatus = (value) => {
  const status = normalize(value);
  if (!status) return "Unknown";
  if (status === "in_transit") return "In Transit";
  if (status === "completed") return "Delivered";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatDateOnly = (value) => {
  if (!value) return "—";
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    const local = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    if (!Number.isNaN(local.getTime())) {
      return local.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  }
  return formatDateTime(value);
};

const formatRecipientType = (value) => {
  const recipient = normalize(value);
  if (recipient === "customer") return "Customer";
  if (recipient === "authorized_representative") {
    return "Authorized Representative";
  }
  return "—";
};

const getOutcomeDate = (record = {}) => {
  const status = normalize(record.report_status || record.status);
  if (status === "delivered" || status === "completed") {
    return (
      record.delivered_date || record.activity_date || record.updated_at || null
    );
  }
  if (status === "failed") {
    return record.activity_date || record.updated_at || null;
  }
  return null;
};

const getProofFilename = (record = {}) => {
  const orderNumber = String(
    record.order_number || `delivery-${record.delivery_id || "proof"}`,
  )
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_");
  const cleanUrl = String(record.signed_receipt || "").split("?")[0];
  const extensionMatch = cleanUrl.match(/\.(jpg|jpeg|jfif|png|webp|pdf)$/i);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : "";
  return `Proof_of_Delivery_${orderNumber}${extension}`;
};

const OPERATION_TYPES = [
  { value: "tasks", label: "Task Assignments", endpoint: "/tasks" },
  {
    value: "appointments",
    label: "Appointments",
    endpoint: "/pos/appointments",
  },
  {
    value: "delivery",
    label: "Deliveries",
    endpoint: "/pos/deliveries",
  },
  { value: "warranty", label: "Warranty Claims", endpoint: "/warranty" },
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

const humanize = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

/*
 * ============================================================
 * OPERATIONS DETAIL RECORD PDF EXPORT
 * ============================================================
 * This follows the same browser-download approach as the
 * Delivery Record PDF, but keeps the fields specific to:
 *
 * - Tasks
 * - Appointments
 * - Deliveries
 * - Warranty Claims
 * ============================================================
 */

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

const pdfSanitizeFilename = (value) =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "record";

const pdfFormatValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return value.toLocaleString("en-PH");
  }

  return String(value);
};

const createOperationsRecordPdf = ({
  recordType,
  record = {},
  fields = [],
  skipKeys = [],
  filename,
}) => {
  const doc = new jsPDF();

  let currentY = 18;

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
    doc.text("WISDOM", leftMargin, currentY);

    currentY += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(82, 82, 91);
    doc.text("Operations Report", leftMargin, currentY);

    currentY += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(63, 63, 70);
    doc.text(`${recordType} Record`, leftMargin, currentY);

    currentY += 6;

    doc.setDrawColor(212, 212, 216);
    doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY);

    currentY += 10;
  };

  const addFooter = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);

    doc.text("WISDOM Operations Report", leftMargin, pageHeight - 10);

    doc.text(
      `Generated ${pdfFormatDateTime(new Date())}`,
      pageWidth - rightMargin,
      pageHeight - 10,
      { align: "right" },
    );
  };

  const ensureSpace = (requiredHeight = 10) => {
    if (currentY + requiredHeight <= pageHeight - 20) {
      return;
    }

    addFooter();

    doc.addPage();

    currentY = 18;

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

    doc.text(`${label}:`, leftMargin, currentY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(63, 63, 70);

    doc.text(wrappedValue, valueX, currentY);

    currentY += rowHeight;
  };

  const addSection = (sectionTitle) => {
    ensureSpace(14);

    currentY += 3;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(24, 24, 27);

    doc.text(sectionTitle, leftMargin, currentY);

    currentY += 7;
  };

  addHeader();

  /*
   * Record identity/status shown at the top of View Details.
   */
  addField(
    recordType === "Task Assignment"
      ? "Task ID"
      : recordType === "Appointment"
        ? "Appointment ID"
        : recordType === "Warranty Claim"
          ? "Claim ID"
          : "Record ID",
    record.id ||
      record.task_id ||
      record.appointment_id ||
      record.claim_id ||
      "—",
  );

  if (record.order_number || record.order_id || record.reference_code) {
    addField(
      "Order / Reference",
      record.order_number || record.order_id || record.reference_code || "—",
    );
  }

  if (record.customer_name) {
    addField("Customer", record.customer_name);
  }

  addField("Status", humanize(record.status || "completed"));

  /*
   * Main operation-specific details.
   */
  addSection(`${recordType} Details`);

  fields.forEach(([label, value]) => {
    addField(label, value);
  });

  /*
   * Same Additional Details behavior as the View Details modal.
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

const exportTaskRecordPdf = (record = {}) => {
  const recordId = record.id || record.task_id || record.order_id || "record";

  createOperationsRecordPdf({
    recordType: "Task Assignment",
    record,
    fields: [
      ["Assigned To", record.assigned_to_name || "Unassigned"],
      ["Order Reference", record.order_id || record.order_number || "—"],
      ["Created At", pdfFormatDateTime(record.created_at)],
      ["Updated At", pdfFormatDateTime(record.updated_at)],
    ],
    skipKeys: [
      "id",
      "task_id",
      "order_id",
      "order_number",
      "status",
      "created_at",
      "updated_at",
      "assigned_to_name",
      "customer_name",
    ],
    filename: `operations_task_${pdfSanitizeFilename(recordId)}.pdf`,
  });
};

const exportAppointmentRecordPdf = (record = {}) => {
  const recordId = record.id || record.appointment_id || "record";

  createOperationsRecordPdf({
    recordType: "Appointment",
    record,
    fields: [
      [
        "Service Type",
        humanize(
          record.purpose ||
            record.service_type ||
            record.type ||
            record.service,
        ),
      ],
      [
        "Scheduled Date",
        pdfFormatDateTime(
          record.scheduled_date ||
            record.preferred_date ||
            record.appointment_date,
        ),
      ],
      ["Created At", pdfFormatDateTime(record.created_at)],
    ],
    skipKeys: [
      "id",
      "appointment_id",
      "status",
      "created_at",
      "updated_at",
      "purpose",
      "service_type",
      "type",
      "service",
      "scheduled_date",
      "preferred_date",
      "appointment_date",
      "customer_name",
      "order_number",
      "order_id",
      "reference_code",
    ],
    filename: `operations_appointment_${pdfSanitizeFilename(recordId)}.pdf`,
  });
};

const exportWarrantyRecordPdf = (record = {}) => {
  const recordId = record.id || record.claim_id || "record";

  createOperationsRecordPdf({
    recordType: "Warranty Claim",
    record,
    fields: [
      [
        "Issue Description",
        record.issue_description || record.description || "—",
      ],
      ["Filed On", pdfFormatDateTime(record.created_at)],
      ["Updated At", pdfFormatDateTime(record.updated_at)],
    ],
    skipKeys: [
      "id",
      "claim_id",
      "status",
      "created_at",
      "updated_at",
      "issue_description",
      "description",
      "customer_name",
      "order_number",
      "order_id",
      "product_name",
      "product",
      "reference_code",
    ],
    filename: `operations_warranty_${pdfSanitizeFilename(recordId)}.pdf`,
  });
};

const exportOperationsRecordPdf = (record = {}, operationType) => {
  switch (operationType) {
    case "tasks":
      return exportTaskRecordPdf(record);

    case "appointments":
      return exportAppointmentRecordPdf(record);

    case "warranty":
      return exportWarrantyRecordPdf(record);

    default:
      throw new Error(`Unsupported Operations PDF type: ${operationType}`);
  }
};

// Helper to extract the correct date field based on operation type
const getRowDate = (row, opType) => {
  if (opType === "appointments")
    return new Date(
      row.scheduled_date ||
        row.preferred_date ||
        row.appointment_date ||
        row.created_at ||
        row.updated_at,
    );
  if (opType === "delivery")
    return new Date(
      row.scheduled_date ||
        row.delivery_date ||
        row.created_at ||
        row.updated_at,
    );
  return new Date(row.created_at || row.updated_at);
};

// Helper to evaluate date ranges
const isDateInRange = (dateObj, filterType, customStart, customEnd) => {
  if (filterType === "all") return true;
  if (!dateObj || Number.isNaN(dateObj.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(dateObj);
  target.setHours(0, 0, 0, 0);

  if (filterType === "today") {
    return target.getTime() === today.getTime();
  }

  if (filterType === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return target.getTime() === yesterday.getTime();
  }

  if (filterType === "this_week") {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6); // Saturday
    return target >= startOfWeek && target <= endOfWeek;
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
    if (customStart) {
      const sDate = new Date(`${customStart}T00:00:00`);
      if (target < sDate) return false;
    }
    if (customEnd) {
      const eDate = new Date(`${customEnd}T00:00:00`);
      if (target > eDate) return false;
    }
    return true;
  }

  return true;
};

function SummaryCard({ label, value, note }) {
  return (
    <div className="opr-summary-card">
      <div className="opr-summary-label">{label}</div>
      <div className="opr-summary-value">{value}</div>
      {note ? <div className="opr-summary-note">{note}</div> : null}
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="opr-empty-cell">
        {text}
      </td>
    </tr>
  );
}

export default function OperationsReportPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [operationType, setOperationType] = useState("tasks");
  const [search, setSearch] = useState("");

  // Date filter state
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState({
    open: false,
    data: null,
    loading: false,
    error: "",
  });
  const [receiptModal, setReceiptModal] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
  });
  const [signatureViewer, setSignatureViewer] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
  });

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");

  const activeOperation = useMemo(
    () => OPERATION_TYPES.find((op) => op.value === operationType),
    [operationType],
  );

  const loadReport = useCallback(async () => {
    if (!activeOperation) return;
    setLoading(true);

    try {
      const { data } = await api.get(activeOperation.endpoint, {
        params: { limit: 5000 },
      });

      const fetchedRows =
        data.tasks ||
        data.claims ||
        data.deliveries ||
        data.appointments ||
        data.rows ||
        data ||
        [];

      setRows(Array.isArray(fetchedRows) ? fetchedRows : []);
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      toast.error(`Failed to load ${activeOperation.label.toLowerCase()}.`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeOperation]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // 1. Date check
      const rowDate = getRowDate(row, operationType);
      if (!isDateInRange(rowDate, dateFilter, customStart, customEnd)) {
        return false;
      }

      // 2. Search check
      const query = search.trim().toLowerCase();
      if (query) {
        const matchesSearch = Object.values(row).some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(query),
        );
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [rows, search, operationType, dateFilter, customStart, customEnd]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, operationType, dateFilter, customStart, customEnd]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * 20;
    return filteredRows.slice(start, start + 20);
  }, [filteredRows, page]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 20));

  const openDetail = async (row) => {
    if (operationType === "delivery") {
      setDetail({ open: true, data: null, loading: true, error: "" });
      setReceiptModal({ open: false, loading: false, data: null, error: "" });
      setSignatureViewer({
        open: false,
        loading: false,
        data: null,
        error: "",
      });

      try {
        const { data } = await api.get(`/pos/deliveries/report/${row.id}`);
        setDetail({ open: true, loading: false, data, error: "" });
      } catch (err) {
        setDetail({
          open: true,
          loading: false,
          data: null,
          error: err?.response?.data?.message || "Failed to load the attempt.",
        });
      }
    } else {
      setDetail({ open: true, data: row, loading: false, error: "" });
    }
  };

  const closeDetail = () => {
    setDetail({ open: false, loading: false, data: null, error: "" });
    setReceiptModal({ open: false, loading: false, data: null, error: "" });
    setSignatureViewer({ open: false, loading: false, data: null, error: "" });
  };

  useEffect(() => {
    if (!detail.open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeDetail();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detail.open]);

  const openReceipt = async () => {
    const deliveryId = Number(detail.data?.delivery_id || 0);
    if (!deliveryId || receiptModal.loading) return;

    setReceiptModal({ open: true, loading: true, data: null, error: "" });
    try {
      const { data } = await api.get(`/pos/deliveries/${deliveryId}/receipt`);
      setReceiptModal({ open: true, loading: false, data, error: "" });
    } catch (err) {
      setReceiptModal({
        open: true,
        loading: false,
        data: null,
        error:
          err?.response?.data?.message ||
          "Failed to load the Delivery Receipt.",
      });
    }
  };

  const openSignature = async () => {
    const deliveryId = Number(detail.data?.delivery_id || 0);
    if (!deliveryId || signatureViewer.loading) return;

    setSignatureViewer({ open: true, loading: true, data: null, error: "" });
    try {
      const { data } = await api.get(
        `/pos/deliveries/${deliveryId}/acknowledgement`,
      );
      setSignatureViewer({ open: true, loading: false, data, error: "" });
    } catch (err) {
      setSignatureViewer({
        open: true,
        loading: false,
        data: null,
        error:
          err?.response?.data?.message ||
          "Failed to load the recipient e-signature.",
      });
    }
  };

  const handleExportOperationsRecord = () => {
    if (!detail.data) return;

    try {
      if (operationType === "delivery") {
        exportDeliveryRecordPdf({
          delivery: detail.data,
        });

        return;
      }

      exportOperationsRecordPdf(detail.data, operationType);

      toast.success(
        `${activeOperation?.label || "Operation"} record downloaded.`,
      );
    } catch (exportError) {
      console.error("Operations PDF Export Error:", exportError);

      toast.error(
        exportError?.message ||
          `Failed to export the selected ${
            activeOperation?.label?.toLowerCase() || "operation"
          } record.`,
      );
    }
  };

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const pending = filteredRows.filter((r) =>
      ["pending", "scheduled", "in_progress"].includes(
        String(r.status).toLowerCase(),
      ),
    ).length;
    const completed = filteredRows.filter((r) =>
      ["completed", "resolved", "delivered", "done"].includes(
        String(r.status).toLowerCase(),
      ),
    ).length;

    return { total, pending, completed };
  }, [filteredRows]);

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

      if (operationType === "tasks") {
        headers = [
          "Task ID",
          "Order / Reference",
          "Assigned To",
          "Status",
          "Created At",
        ];
        mappedData = filteredRows.map((r) => [
          r.id,
          r.order_id || "—",
          r.assigned_to_name || "Unassigned",
          humanize(r.status),
          formatDateTime(r.created_at),
        ]);
      } else if (operationType === "appointments") {
        headers = [
          "Appointment ID",
          "Customer",
          "Service Type",
          "Status",
          "Scheduled Date",
        ];
        mappedData = filteredRows.map((r) => [
          r.id,
          r.customer_name || "—",
          humanize(r.purpose || r.service_type || r.type || r.service),
          humanize(r.status),
          formatDateTime(
            r.scheduled_date ||
              r.preferred_date ||
              r.appointment_date ||
              r.created_at,
          ),
        ]);
      } else if (operationType === "delivery") {
        headers = [
          "Delivery ID",
          "Order Number",
          "Driver",
          "Status",
          "Delivery Date",
        ];
        mappedData = filteredRows.map((r) => [
          r.id,
          r.order_number || "—",
          r.driver_name || "Unassigned",
          humanize(r.status),
          formatDateTime(r.scheduled_date || r.delivery_date || r.created_at),
        ]);
      } else if (operationType === "warranty") {
        headers = ["Claim ID", "Customer", "Issue", "Status", "Filed On"];
        mappedData = filteredRows.map((r) => [
          r.id,
          r.customer_name || "—",
          r.issue_description || "—",
          humanize(r.status),
          formatDateTime(r.created_at),
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

      const excelData = [
        [{ v: `Operations Report - ${activeOperation.label}`, s: titleStyle }],
        [], // Empty row to accommodate the vertical merge
        [
          {
            v: "Review historical performance, assignments, and fulfillment metrics across all service and operational channels.",
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

      XLSX.utils.book_append_sheet(workbook, sheet, activeOperation.label);

      const fileName = `operations_report_${operationType}_${new Date().getTime()}.xlsx`;

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

      toast.success(`${activeOperation.label} report exported.`);
    } catch (err) {
      if (err.name !== "AbortError") toast.error("Failed to export report.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="operations-report">
      <div className="opr-page-header">
        <div>
          <h1>Operations Report</h1>
          <p>
            Review historical performance, assignments, and fulfillment metrics
            across all service and operational channels.
          </p>
        </div>

        <div className="opr-header-actions opr-no-print">
          <button
            type="button"
            className="opr-button opr-button-secondary"
            onClick={loadReport}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="opr-button opr-button-primary"
            onClick={exportExcel}
            disabled={loading || filteredRows.length === 0 || exporting}
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      <div className="opr-report-meta">
        <span>
          <strong>Generated:</strong> {formatDateTime(generatedAt)}
        </span>
        <span>
          <strong>Generated By:</strong> {user?.name || "Administrator"}
        </span>
        <span>
          <strong>Scope:</strong> {activeOperation?.label} logs
        </span>
      </div>

      <div className="opr-toolbar opr-no-print">
        {/* SEARCH BAR PLACED FIRST TO EXPAND ON LEFT */}
        <label className="opr-filter-field opr-search-field">
          <span>Search Records</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, customer, status..."
          />
        </label>

        <label className="opr-filter-field" style={{ minWidth: 180 }}>
          <span>Operation Type</span>
          <select
            value={operationType}
            onChange={(e) => {
              setOperationType(e.target.value);
              setSearch("");
            }}
          >
            {OPERATION_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {/* NEW DATE RANGE FILTER */}
        <label className="opr-filter-field" style={{ minWidth: 160 }}>
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
            <option value="custom">Custom Date Range</option>
          </select>
        </label>

        {/* CUSTOM DATE INPUTS VISIBLE ONLY IF CUSTOM SELECTED */}
        {dateFilter === "custom" && (
          <>
            <label
              className="opr-filter-field"
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
              className="opr-filter-field"
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
            className="opr-summary-grid"
            style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            <SummaryCard
              label="Total Records"
              value={summary.total}
              note={`Total ${activeOperation.label.toLowerCase()} found`}
            />
            <SummaryCard
              label="Pending / Active"
              value={summary.pending}
              note="Awaiting action or currently in progress"
            />
            <SummaryCard
              label="Completed"
              value={summary.completed}
              note="Successfully resolved or delivered"
            />
          </div>

          <section className="opr-card">
            <div className="opr-section-head">
              <div>
                <h2>{activeOperation.label} Data</h2>
                <p>
                  Historical log of all operations corresponding to the selected
                  category.
                </p>
              </div>
              <div className="opr-section-count">
                {filteredRows.length} record(s)
              </div>
            </div>

            <div className="opr-table-scroll">
              <table className="opr-table">
                <thead>
                  <tr>
                    {operationType === "tasks" && (
                      <>
                        <th>Task ID</th>
                        <th>Order Reference</th>
                        <th>Assigned To</th>
                        <th>Status</th>
                        <th>Created At</th>
                      </>
                    )}
                    {operationType === "appointments" && (
                      <>
                        <th>Appt ID</th>
                        <th>Customer</th>
                        <th>Service Type</th>
                        <th>Status</th>
                        <th>Scheduled Date</th>
                      </>
                    )}
                    {operationType === "delivery" && (
                      <>
                        <th>Delivery ID</th>
                        <th>Order Number</th>
                        <th>Driver</th>
                        <th>Status</th>
                        <th>Delivery Date</th>
                      </>
                    )}
                    {operationType === "warranty" && (
                      <>
                        <th>Claim ID</th>
                        <th>Customer</th>
                        <th>Issue Description</th>
                        <th>Status</th>
                        <th>Filed On</th>
                      </>
                    )}
                    <th style={{ width: 110 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <EmptyRow
                      colSpan={5}
                      text={`No ${activeOperation.label.toLowerCase()} match the current filters.`}
                    />
                  ) : (
                    paginatedRows.map((row) => (
                      <tr key={row.id}>
                        {operationType === "tasks" && (
                          <>
                            <td className="opr-primary-text">#{row.id}</td>
                            <td>{row.order_id || "—"}</td>
                            <td>{row.assigned_to_name || "Unassigned"}</td>
                            <td>{humanize(row.status)}</td>
                            <td>{formatDateTime(row.created_at)}</td>
                          </>
                        )}
                        {operationType === "appointments" && (
                          <>
                            <td className="opr-primary-text">#{row.id}</td>
                            <td>{row.customer_name || "—"}</td>
                            <td>
                              {humanize(
                                row.purpose ||
                                  row.service_type ||
                                  row.type ||
                                  row.service,
                              )}
                            </td>
                            <td>{humanize(row.status)}</td>
                            <td>
                              {formatDateTime(
                                row.scheduled_date ||
                                  row.preferred_date ||
                                  row.appointment_date ||
                                  row.created_at,
                              )}
                            </td>
                          </>
                        )}
                        {operationType === "delivery" && (
                          <>
                            <td className="opr-primary-text">#{row.id}</td>
                            <td>{row.order_number || "—"}</td>
                            <td>{row.driver_name || "Unassigned"}</td>
                            <td>{humanize(row.status)}</td>
                            <td>
                              {formatDateTime(
                                row.scheduled_date ||
                                  row.delivery_date ||
                                  row.created_at,
                              )}
                            </td>
                          </>
                        )}
                        {operationType === "warranty" && (
                          <>
                            <td className="opr-primary-text">#{row.id}</td>
                            <td>{row.customer_name || "—"}</td>
                            <td
                              style={{
                                maxWidth: 250,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {row.issue_description || "—"}
                            </td>
                            <td>{humanize(row.status)}</td>
                            <td>{formatDateTime(row.created_at)}</td>
                          </>
                        )}
                        <td className="opr-action-cell">
                          <button
                            type="button"
                            className="opr-button-text"
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
                    className="opr-button opr-button-secondary"
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
                    className="opr-button opr-button-secondary"
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
        <div className="opr-loading">Loading operations data...</div>
      )}

      {detail.open &&
        (operationType === "delivery" ? (
          <div className="delivery-report-detail-overlay" onClick={closeDetail}>
            <aside
              className="delivery-report-detail-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delivery-report-detail-title"
              onClick={(event) => event.stopPropagation()}
            >
              {detail.loading ? (
                <div className="delivery-report-detail-loading">
                  Loading attempt...
                </div>
              ) : detail.error ? (
                <div className="delivery-report-alert" role="alert">
                  {detail.error}
                </div>
              ) : detail.data ? (
                <>
                  <div className="delivery-report-detail-head">
                    <div>
                      <span>Attempt Details</span>
                      <h2 id="delivery-report-detail-title">
                        {detail.data.order_number || "Attempt Details"}
                      </h2>
                      <p>{detail.data.customer_name || "Customer"}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={closeDetail}
                    >
                      <X size={19} />
                    </button>
                  </div>

                  <div className="delivery-report-detail-status-row">
                    <span
                      className={`delivery-report-status delivery-report-status-${normalize(detail.data.report_status)}`}
                    >
                      {formatStatus(detail.data.report_status)}
                    </span>
                    <span>
                      Attempt {Number(detail.data.attempt_number || 1)} of{" "}
                      {Number(detail.data.attempt_count || 1)}
                    </span>
                  </div>

                  <section className="delivery-report-detail-grid">
                    <div>
                      <span>Order Type</span>
                      <strong>{formatStatus(detail.data.order_type)}</strong>
                    </div>
                    <div>
                      <span>Rider</span>
                      <strong>{detail.data.driver_name || "Unassigned"}</strong>
                    </div>
                    <div>
                      <span>Assigned On</span>
                      <strong>{formatDateTime(detail.data.assigned_at)}</strong>
                    </div>
                    <div>
                      <span>Scheduled</span>
                      <strong>
                        {formatDateOnly(detail.data.scheduled_date)}
                      </strong>
                    </div>
                    <div>
                      <span>Outcome Date</span>
                      <strong>
                        {formatDateTime(getOutcomeDate(detail.data))}
                      </strong>
                    </div>
                    <div>
                      <span>DR Number</span>
                      <strong>
                        {detail.data.delivery_receipt_number || "Not available"}
                      </strong>
                    </div>
                  </section>

                  <section className="delivery-report-detail-section">
                    <h3>Destination</h3>
                    <p>{detail.data.address || "Address unavailable"}</p>
                  </section>

                  <section className="delivery-report-detail-section">
                    <h3>Items</h3>
                    {Array.isArray(detail.data.items) &&
                    detail.data.items.length ? (
                      <div className="delivery-report-items-scroll">
                        <table className="delivery-report-items-table">
                          <thead>
                            <tr>
                              {detail.data.items.some((item) =>
                                String(item?.client_code || "").trim(),
                              ) ? (
                                <th>Item Code</th>
                              ) : null}
                              <th>Qty</th>
                              <th>Unit</th>
                              <th>Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.data.items.map((item, index) => (
                              <tr
                                key={`${item.order_item_id || item.client_code || item.description || "item"}-${index}`}
                              >
                                {detail.data.items.some((i) =>
                                  String(i?.client_code || "").trim(),
                                ) ? (
                                  <td>{item.client_code || "—"}</td>
                                ) : null}
                                <td>{Number(item.quantity || 0)}</td>
                                <td>{item.unit || "pc"}</td>
                                <td>{item.description || "Item"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>
                        No item details are available for this delivery record.
                      </p>
                    )}
                  </section>

                  {normalize(detail.data.report_status) === "delivered" ? (
                    <section className="delivery-report-detail-section">
                      <h3>Recorded Handoff</h3>
                      <div className="delivery-report-handoff-grid">
                        <div>
                          <span>Received By</span>
                          <strong>
                            {detail.data.delivery_received_by_name || "—"}
                          </strong>
                        </div>
                        <div>
                          <span>Recipient</span>
                          <strong>
                            {formatRecipientType(
                              detail.data.delivery_recipient_type,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Received On</span>
                          <strong>
                            {formatDateTime(
                              detail.data.delivery_acknowledged_at,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Proof of Delivery</span>
                          <strong>
                            {detail.data.signed_receipt
                              ? "Recorded"
                              : "Unavailable"}
                          </strong>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {detail.data.notes ? (
                    <section className="delivery-report-detail-section">
                      <h3>
                        {normalize(detail.data.report_status) === "failed"
                          ? "Failure Details"
                          : "Notes"}
                      </h3>
                      <p className="delivery-report-notes">
                        {detail.data.notes}
                      </p>
                    </section>
                  ) : null}

                  <section className="delivery-report-detail-section">
                    <h3>Documents</h3>
                    <div className="delivery-report-document-actions">
                      {detail.data.signed_receipt ? (
                        <>
                          <a
                            href={buildAssetUrl(detail.data.signed_receipt)}
                            target="_blank"
                            rel="noreferrer"
                            className="delivery-report-button delivery-report-button-secondary"
                          >
                            <Eye size={14} /> View Proof
                          </a>
                          <DownloadFileButton
                            url={buildAssetUrl(detail.data.signed_receipt)}
                            filename={getProofFilename(detail.data)}
                            label="Download Proof"
                            loadingLabel="Downloading..."
                            className="delivery-report-button delivery-report-button-secondary"
                          />
                        </>
                      ) : null}

                      {Number(detail.data.delivery_has_signature || 0) === 1 ? (
                        <button
                          type="button"
                          className="delivery-report-button delivery-report-button-secondary"
                          onClick={openSignature}
                        >
                          <Eye size={14} /> View E-Signature
                        </button>
                      ) : null}

                      {Boolean(detail.data.delivery_receipt_number) ? (
                        <button
                          type="button"
                          className="delivery-report-button delivery-report-button-secondary"
                          onClick={openReceipt}
                          disabled={receiptModal.loading}
                        >
                          <Download size={14} />
                          {receiptModal.loading
                            ? "Loading Receipt..."
                            : "View Receipt"}
                        </button>
                      ) : null}

                      {!detail.data.signed_receipt &&
                      Number(detail.data.delivery_has_signature || 0) !== 1 &&
                      !Boolean(detail.data.delivery_receipt_number) ? (
                        <p>No documents are available for this attempt.</p>
                      ) : null}
                    </div>
                    {receiptModal.error ? (
                      <div className="delivery-report-inline-error">
                        {receiptModal.error}
                      </div>
                    ) : null}
                  </section>

                  <div className="delivery-report-detail-footer">
                    <button
                      type="button"
                      className="delivery-report-button delivery-report-button-secondary"
                      onClick={handleExportOperationsRecord}
                    >
                      <FileDown size={14} /> Export Record
                    </button>
                    <button
                      type="button"
                      className="delivery-report-button delivery-report-button-primary"
                      onClick={() =>
                        navigate(`/admin/orders/${detail.data.order_id}`)
                      }
                    >
                      Open Order
                    </button>
                    <button
                      type="button"
                      className="delivery-report-button delivery-report-button-secondary"
                      onClick={closeDetail}
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : null}
            </aside>
          </div>
        ) : detail.data ? (
          <div className="delivery-report-detail-overlay" onClick={closeDetail}>
            <aside
              className="delivery-report-detail-panel"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="delivery-report-detail-head">
                <div>
                  <span>{activeOperation.label.toUpperCase()} DETAILS</span>
                  <h2>
                    {detail.data.order_number ||
                      detail.data.reference_code ||
                      `Record #${detail.data.id}`}
                  </h2>
                  {detail.data.customer_name && (
                    <p>{detail.data.customer_name}</p>
                  )}
                </div>
                <button type="button" aria-label="Close" onClick={closeDetail}>
                  <X size={19} />
                </button>
              </div>

              <div className="delivery-report-detail-status-row">
                <span
                  className={`delivery-report-status delivery-report-status-${normalize(detail.data.status || "completed")}`}
                >
                  {humanize(detail.data.status || "Completed")}
                </span>
                <span>ID: {detail.data.id}</span>
              </div>

              <section className="delivery-report-detail-grid">
                {operationType === "tasks" && (
                  <>
                    <div>
                      <span>Assigned To</span>
                      <strong>
                        {detail.data.assigned_to_name || "Unassigned"}
                      </strong>
                    </div>
                    <div>
                      <span>Order Reference</span>
                      <strong>{detail.data.order_id || "—"}</strong>
                    </div>
                    <div>
                      <span>Created At</span>
                      <strong>{formatDateTime(detail.data.created_at)}</strong>
                    </div>
                    <div>
                      <span>Updated At</span>
                      <strong>{formatDateTime(detail.data.updated_at)}</strong>
                    </div>
                  </>
                )}
                {operationType === "appointments" && (
                  <>
                    <div>
                      <span>Service Type</span>
                      <strong>
                        {humanize(
                          detail.data.purpose ||
                            detail.data.service_type ||
                            detail.data.type ||
                            detail.data.service,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Scheduled Date</span>
                      <strong>
                        {formatDateTime(
                          detail.data.scheduled_date ||
                            detail.data.preferred_date ||
                            detail.data.appointment_date,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Created At</span>
                      <strong>{formatDateTime(detail.data.created_at)}</strong>
                    </div>
                  </>
                )}
                {operationType === "warranty" && (
                  <>
                    <div>
                      <span>Issue Description</span>
                      <strong>{detail.data.issue_description || "—"}</strong>
                    </div>
                    <div>
                      <span>Filed On</span>
                      <strong>{formatDateTime(detail.data.created_at)}</strong>
                    </div>
                    <div>
                      <span>Updated At</span>
                      <strong>{formatDateTime(detail.data.updated_at)}</strong>
                    </div>
                  </>
                )}
              </section>

              {(() => {
                const skipKeys = [
                  "id",
                  "status",
                  "created_at",
                  "updated_at",
                  "assigned_to_name",
                  "order_id",
                  "purpose",
                  "service_type",
                  "type",
                  "service",
                  "scheduled_date",
                  "preferred_date",
                  "appointment_date",
                  "customer_name",
                  "issue_description",
                  "order_number",
                  "reference_code",
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
                    <section className="delivery-report-detail-section">
                      <h3>Additional Details</h3>
                      <div
                        className="delivery-report-handoff-grid"
                        style={{ marginTop: "16px" }}
                      >
                        {extraKeys.map(([k, v]) => {
                          const isDate =
                            k.includes("date") || k.includes("_at");
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

              <div className="delivery-report-detail-footer">
                <button
                  type="button"
                  className="delivery-report-button delivery-report-button-secondary"
                  onClick={closeDetail}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="delivery-report-button delivery-report-button-primary"
                  onClick={handleExportOperationsRecord}
                >
                  <FileDown size={14} /> Export Record
                </button>
              </div>
            </aside>
          </div>
        ) : null)}

      {receiptModal.open && receiptModal.data ? (
        <DeliveryReceiptModal
          receipt={receiptModal.data}
          onClose={() =>
            setReceiptModal({
              open: false,
              loading: false,
              data: null,
              error: "",
            })
          }
        />
      ) : null}

      {signatureViewer.open ? (
        <div
          className="delivery-report-signature-overlay"
          onClick={() =>
            setSignatureViewer({
              open: false,
              loading: false,
              data: null,
              error: "",
            })
          }
        >
          <div
            className="delivery-report-signature-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="delivery-report-signature-head">
              <div>
                <span>Recipient E-Signature</span>
                <strong>{detail.data?.order_number || "Delivery"}</strong>
              </div>
              <button
                type="button"
                aria-label="Close signature"
                onClick={() =>
                  setSignatureViewer({
                    open: false,
                    loading: false,
                    data: null,
                    error: "",
                  })
                }
              >
                <X size={18} />
              </button>
            </div>
            <div className="delivery-report-signature-body">
              {signatureViewer.loading ? (
                <p>Loading e-signature...</p>
              ) : signatureViewer.error ? (
                <div className="delivery-report-alert">
                  {signatureViewer.error}
                </div>
              ) : signatureViewer.data?.signature_data ? (
                <>
                  <img
                    src={signatureViewer.data.signature_data}
                    alt="Recipient e-signature"
                  />
                  <div className="delivery-report-signature-meta">
                    <strong>
                      {signatureViewer.data.received_by_name || "Recipient"}
                    </strong>
                    <span>
                      {formatRecipientType(signatureViewer.data.recipient_type)}
                    </span>
                    <span>
                      {formatDateTime(signatureViewer.data.acknowledged_at)}
                    </span>
                  </div>
                </>
              ) : (
                <p>No e-signature was captured for this delivery.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
