import { jsPDF } from "jspdf";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const statusLabel = (value) => {
  const normalized = normalize(value);

  if (!normalized) return "Unknown";
  if (normalized === "in_transit") return "In Transit";
  if (normalized === "completed") return "Delivered";

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

const getDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (number) => String(number).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
};

const formatScheduledDate = (value) => {
  const dateKey = getDateKey(value);
  if (!dateKey) return "-";

  const [year, month, day] = dateKey.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);

  if (Number.isNaN(localDate.getTime())) return String(value || "-");

  return localDate.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const cleanCellText = (value, maxLength = 320) => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "-";
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
};

const formatFilterDate = (value) =>
  value ? formatScheduledDate(value) : "All";

const safeFilenameDate = () => {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-");
};

export function exportDeliveryActivityReportPdf({
  deliveries,
  filters = {},
}) {
  const records = Array.isArray(deliveries) ? deliveries : [];

  if (!records.length) {
    throw new Error("There are no delivery records to export.");
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
  const columnWidths = [28, 36, 55, 27, 31, 34, 23, 43];
  const headers = [
    "Order",
    "Customer",
    "Delivery Address",
    "Scheduled",
    "Actual Delivered",
    "Rider",
    "Status",
    "Notes / Failure Reason",
  ];

  let y = 12;

  const statusCounts = records.reduce(
    (counts, delivery) => {
      const status = normalize(delivery?.report_status || delivery?.status);

      if (status === "scheduled") counts.scheduled += 1;
      if (status === "in_transit") counts.inTransit += 1;
      if (status === "delivered" || status === "completed") {
        counts.delivered += 1;
      }
      if (status === "failed") counts.failed += 1;

      return counts;
    },
    {
      scheduled: 0,
      inTransit: 0,
      delivered: 0,
      failed: 0,
    },
  );

  const addTableHeader = () => {
    doc.setFillColor(35, 35, 35);
    doc.setDrawColor(35, 35, 35);
    doc.rect(margin, y, contentWidth, 8, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);

    let x = margin;
    headers.forEach((header, index) => {
      doc.text(header, x + 1.3, y + 5.1);
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
  doc.text("DELIVERY ACTIVITY REPORT", margin, y + 6.5);

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

  const searchText = cleanCellText(filters.search || "All", 55);
  const statusText =
    normalize(filters.status) && normalize(filters.status) !== "all"
      ? statusLabel(filters.status)
      : "All";
  const riderText =
    normalize(filters.rider) && normalize(filters.rider) !== "all"
      ? cleanCellText(filters.rider, 45)
      : "All";
  const dateText = formatFilterDate(filters.scheduledDate);

  doc.text(`Search: ${searchText}`, margin + 3, y + 10);
  doc.text(`Status: ${statusText}`, margin + 76, y + 10);
  doc.text(`Rider: ${riderText}`, margin + 127, y + 10);
  doc.text(`Scheduled Date: ${dateText}`, margin + 210, y + 10);

  y += 22;

  const summaryItems = [
    ["Total Records", records.length],
    ["Scheduled", statusCounts.scheduled],
    ["In Transit", statusCounts.inTransit],
    ["Delivered", statusCounts.delivered],
    ["Failed", statusCounts.failed],
  ];

  const summaryGap = 3;
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
    doc.setFontSize(7);
    doc.text(String(label), x + 2.5, y + 4.5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(10);
    doc.text(String(value), x + 2.5, y + 10);
  });

  y += 17;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(25, 25, 25);
  doc.setFontSize(8.2);
  doc.text("DELIVERY RECORDS", margin, y);
  y += 3;

  addTableHeader();

  records.forEach((delivery) => {
    const status = normalize(delivery?.report_status || delivery?.status);
    const actualDelivered =
      status === "delivered" || status === "completed"
        ? formatDateTime(delivery?.delivered_date)
        : "-";

    const cells = [
      cleanCellText(
        delivery?.order_number ||
          (delivery?.order_id ? `#${delivery.order_id}` : "-"),
        55,
      ),
      cleanCellText(delivery?.customer_name, 80),
      cleanCellText(delivery?.address, 150),
      formatScheduledDate(delivery?.scheduled_date),
      actualDelivered,
      cleanCellText(delivery?.driver_name, 80),
      statusLabel(status),
      cleanCellText(delivery?.notes, 240),
    ];

    const lineSets = cells.map((cell, index) =>
      doc.splitTextToSize(
        String(cell),
        Math.max(5, columnWidths[index] - 2.6),
      ),
    );

    const maxLines = Math.max(...lineSets.map((lines) => lines.length), 1);
    const rowHeight = Math.max(7.2, maxLines * 3.05 + 2.1);

    if (y + rowHeight > pageHeight - footerReserve) {
      addPageWithTableHeader();
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(35, 35, 35);
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.15);

    let x = margin;

    lineSets.forEach((lines, index) => {
      doc.rect(x, y, columnWidths[index], rowHeight);
      doc.text(lines, x + 1.3, y + 3.8);
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
      "Operational delivery activity report.",
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

  doc.save(`Delivery_Activity_Report_${safeFilenameDate()}.pdf`);
}
