import { jsPDF } from "jspdf";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const cleanText = (value, maxLength = 240) => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "-";
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
};

const formatDateTime = (value) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatFilterDate = (value) => {
  if (!value) return "All";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const statusLabel = (order = {}) => {
  if (order.overdue && !order.complete) return "Overdue";

  switch (normalize(order.overallStatus)) {
    case "pending":
      return "Assigned";
    case "in_progress":
      return "In Production";
    case "blocked":
      return "On Hold";
    case "completed":
      return "Completed";
    default:
      return "Unknown";
  }
};

const filterStatusLabel = (value) => {
  switch (normalize(value)) {
    case "":
    case "all":
      return "All";
    case "pending":
      return "Assigned";
    case "in_progress":
      return "In Production";
    case "blocked":
      return "On Hold";
    case "overdue":
      return "Overdue";
    case "completed":
      return "Completed";
    default:
      return cleanText(value, 40);
  }
};

const safeFilenameDate = () => {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-");
};

export function exportTaskAssignmentsReportPdf({
  orders,
  filters = {},
  requiredStepCount = 5,
}) {
  const records = Array.isArray(orders) ? orders : [];

  if (!records.length) {
    throw new Error("There are no production orders to export.");
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const footerReserve = 10;

  const headers = [
    "Order",
    "Customer",
    "Current Staff",
    "Assigned On",
    "Started On",
    "Due Date",
    "Progress",
    "Status",
    "Completed On",
  ];

  const columnWidths = [28, 35, 42, 28, 28, 28, 22, 27, 39];
  let y = 12;

  const summary = records.reduce(
    (counts, order) => {
      const status = normalize(order?.overallStatus);

      if (status === "pending") counts.assigned += 1;
      if (status === "in_progress") counts.inProduction += 1;
      if (status === "blocked") counts.onHold += 1;
      if (order?.overdue && !order?.complete) counts.overdue += 1;
      if (order?.complete || status === "completed") counts.completed += 1;

      return counts;
    },
    {
      assigned: 0,
      inProduction: 0,
      onHold: 0,
      overdue: 0,
      completed: 0,
    },
  );

  const addTableHeader = () => {
    doc.setFillColor(35, 35, 35);
    doc.setDrawColor(35, 35, 35);
    doc.rect(margin, y, contentWidth, 8, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);

    let x = margin;
    headers.forEach((header, index) => {
      doc.text(header, x + 1.2, y + 5.1);
      x += columnWidths[index];
    });

    y += 8;
  };

  const addPageWithTableHeader = () => {
    doc.addPage();
    y = 12;
    addTableHeader();
  };

  doc.setTextColor(15, 15, 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("SPIRAL WOOD SERVICES", margin, y);

  doc.setFontSize(10.5);
  doc.text("PRODUCTION TASK ASSIGNMENT REPORT", margin, y + 6.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Generated: ${formatDateTime(new Date())}`,
    pageWidth - margin,
    y,
    { align: "right" },
  );

  y += 11;

  doc.setFillColor(247, 247, 247);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, y, contentWidth, 18, 1.5, 1.5, "FD");

  doc.setTextColor(25, 25, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("FILTERS APPLIED", margin + 3, y + 4.7);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(70, 70, 70);
  doc.setFontSize(7);

  const searchText = cleanText(filters.search || "All", 50);
  const statusText = filterStatusLabel(filters.status);
  const staffText = cleanText(filters.staffLabel || "All", 45);
  const dueFromText = formatFilterDate(filters.dueFrom);
  const dueToText = formatFilterDate(filters.dueTo);

  doc.text(`Search: ${searchText}`, margin + 3, y + 10);
  doc.text(`Status: ${statusText}`, margin + 70, y + 10);
  doc.text(`Staff: ${staffText}`, margin + 116, y + 10);
  doc.text(`Due From: ${dueFromText}`, margin + 190, y + 10);
  doc.text(`Due To: ${dueToText}`, margin + 238, y + 10);

  y += 22;

  const summaryItems = [
    ["Total Shown", records.length],
    ["Assigned", summary.assigned],
    ["In Production", summary.inProduction],
    ["On Hold", summary.onHold],
    ["Overdue", summary.overdue],
    ["Completed", summary.completed],
  ];

  const summaryGap = 2.5;
  const summaryWidth =
    (contentWidth - summaryGap * (summaryItems.length - 1)) /
    summaryItems.length;

  summaryItems.forEach(([label, value], index) => {
    const x = margin + index * (summaryWidth + summaryGap);

    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(225, 225, 225);
    doc.roundedRect(x, y, summaryWidth, 13, 1, 1, "FD");

    doc.setFont("helvetica", "normal");
    doc.setTextColor(95, 95, 95);
    doc.setFontSize(6.8);
    doc.text(String(label), x + 2.3, y + 4.5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(10);
    doc.text(String(value), x + 2.3, y + 10);
  });

  y += 17;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(25, 25, 25);
  doc.setFontSize(8.2);
  doc.text("PRODUCTION ORDERS", margin, y);
  y += 3;

  addTableHeader();

  records.forEach((order) => {
    const orderLabel = order?.orderNumber
      ? `#${order.orderNumber}`
      : order?.orderId
        ? `Order #${order.orderId}`
        : "-";

    const progress = `${Number(order?.completedCount || 0)}/${Number(
      requiredStepCount || 5,
    )}`;

    const cells = [
      cleanText(orderLabel, 55),
      cleanText(order?.customerName || "Walk-in Customer", 90),
      cleanText(order?.currentStaffLabel || "Not assigned", 110),
      formatDateTime(order?.assignedAt),
      order?.startedAt ? formatDateTime(order.startedAt) : "Not started",
      formatDateTime(order?.dueDate),
      progress,
      statusLabel(order),
      order?.complete && order?.completedAt ? formatDateTime(order.completedAt) : "-",
    ];

    const lineSets = cells.map((cell, index) =>
      doc.splitTextToSize(
        String(cell),
        Math.max(5, columnWidths[index] - 2.4),
      ),
    );

    const maxLines = Math.max(...lineSets.map((lines) => lines.length), 1);
    const rowHeight = Math.max(7.2, maxLines * 3.05 + 2.1);

    if (y + rowHeight > pageHeight - footerReserve) {
      addPageWithTableHeader();
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(35, 35, 35);
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.15);

    let x = margin;

    lineSets.forEach((lines, index) => {
      doc.rect(x, y, columnWidths[index], rowHeight);
      doc.text(lines, x + 1.2, y + 3.8);
      x += columnWidths[index];
    });

    y += rowHeight;
  });

  const totalPages = doc.getNumberOfPages();

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);

    doc.setDrawColor(220, 220, 220);
    doc.line(
      margin,
      pageHeight - 8.5,
      pageWidth - margin,
      pageHeight - 8.5,
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(105, 105, 105);
    doc.text(
      "Operational production task assignment report.",
      margin,
      pageHeight - 4.5,
    );
    doc.text(
      `Page ${pageNumber} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 4.5,
      { align: "right" },
    );
  }

  doc.save(`Production_Task_Assignment_Report_${safeFilenameDate()}.pdf`);
}
