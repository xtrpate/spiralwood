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
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatScheduledDate = (value) => {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return value ? String(value) : "-";
  const local = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(local.getTime())) return "-";
  return local.toLocaleDateString("en-PH", {
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

const safeFilenameDate = () => {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
};

export function exportDeliveryActivityReportPdf({ deliveries, filters = {} }) {
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
  const columnWidths = [30, 36, 31, 38, 34, 18, 25, 65];
  const headers = [
    "Scheduled",
    "Outcome Date",
    "Order",
    "Customer",
    "Rider",
    "Attempt",
    "Status",
    "Reference",
  ];

  const statusCounts = records.reduce(
    (counts, delivery) => {
      const status = normalize(delivery?.report_status || delivery?.status);
      if (status === "delivered" || status === "completed") counts.delivered += 1;
      if (status === "failed") counts.failed += 1;
      if (status === "scheduled" || status === "in_transit") counts.active += 1;
      return counts;
    },
    { delivered: 0, failed: 0, active: 0 },
  );

  const finished = statusCounts.delivered + statusCounts.failed;
  const successRate = finished > 0 ? (statusCounts.delivered / finished) * 100 : 0;
  let y = 12;

  const addTableHeader = () => {
    doc.setFillColor(35, 35, 35);
    doc.setDrawColor(35, 35, 35);
    doc.rect(margin, y, contentWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
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
  doc.text("DELIVERY REPORT", margin, y + 6.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text(`Generated: ${formatDateTime(new Date())}`, pageWidth - margin, y, {
    align: "right",
  });

  y += 11;
  doc.setFillColor(247, 247, 247);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, y, contentWidth, 22, 1.5, 1.5, "FD");
  doc.setTextColor(25, 25, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.text("FILTERS APPLIED", margin + 3, y + 4.7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(70, 70, 70);
  doc.setFontSize(7.1);

  const searchText = cleanCellText(filters.search || "All", 60);
  const statusText =
    normalize(filters.status) && normalize(filters.status) !== "all"
      ? statusLabel(filters.status)
      : "All";
  const riderText = cleanCellText(filters.rider || "All", 45);
  const fromText = filters.from ? formatScheduledDate(filters.from) : "All";
  const toText = filters.to ? formatScheduledDate(filters.to) : "All";

  doc.text(`Search: ${searchText}`, margin + 3, y + 10);
  doc.text(`Status: ${statusText}`, margin + 94, y + 10);
  doc.text(`Rider: ${riderText}`, margin + 153, y + 10);
  doc.text(`From: ${fromText}`, margin + 3, y + 16);
  doc.text(`To: ${toText}`, margin + 94, y + 16);
  y += 26;

  const summaryItems = [
    ["Total Attempts", records.length],
    ["Delivered", statusCounts.delivered],
    ["Failed", statusCounts.failed],
    ["Active", statusCounts.active],
    ["Success Rate", `${successRate.toFixed(1)}%`],
  ];
  const summaryGap = 3;
  const summaryWidth =
    (contentWidth - summaryGap * (summaryItems.length - 1)) / summaryItems.length;

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
  doc.text("ATTEMPTS", margin, y);
  y += 3;
  addTableHeader();

  records.forEach((delivery) => {
    const status = normalize(delivery?.report_status || delivery?.status);
    const completionDate =
      status === "delivered" || status === "completed"
        ? formatDateTime(delivery?.delivered_date || delivery?.activity_date)
        : status === "failed"
          ? formatDateTime(delivery?.activity_date || delivery?.updated_at)
          : "-";
    const receiptAndNotes = [
      delivery?.delivery_receipt_number
        ? `DR: ${delivery.delivery_receipt_number}`
        : "",
      delivery?.notes || "",
    ]
      .filter(Boolean)
      .join(" | ");

    const cells = [
      formatScheduledDate(delivery?.scheduled_date),
      completionDate,
      cleanCellText(
        delivery?.order_number ||
          (delivery?.order_id ? `#${delivery.order_id}` : "-"),
        55,
      ),
      cleanCellText(delivery?.customer_name, 80),
      cleanCellText(delivery?.driver_name || "Unassigned", 80),
      `${Number(delivery?.attempt_number || 1)} of ${Number(delivery?.attempt_count || 1)}`,
      statusLabel(status),
      cleanCellText(receiptAndNotes || "-", 260),
    ];

    const lineSets = cells.map((cell, index) =>
      doc.splitTextToSize(String(cell), Math.max(5, columnWidths[index] - 2.5)),
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
    doc.line(margin, pageHeight - 8.5, pageWidth - margin, pageHeight - 8.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(105, 105, 105);
    doc.text(
      "Administrative report. Each row represents one attempt.",
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

  doc.save(`Delivery_Report_${safeFilenameDate()}.pdf`);
}

const recordOutcomeDate = (delivery = {}) => {
  const status = normalize(delivery?.report_status || delivery?.status);
  if (status === "delivered" || status === "completed") {
    return delivery?.delivered_date || delivery?.activity_date || delivery?.updated_at || null;
  }
  if (status === "failed") {
    return delivery?.activity_date || delivery?.updated_at || null;
  }
  return null;
};

const recipientTypeLabel = (value) => {
  const normalized = normalize(value);
  if (normalized === "customer") return "Customer";
  if (normalized === "authorized_representative") return "Authorized Representative";
  return "Not available";
};

const safeFilenamePart = (value, fallback = "Delivery") => {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
};

export function exportDeliveryRecordPdf({ delivery }) {
  const record = delivery && typeof delivery === "object" ? delivery : null;
  if (!record) {
    throw new Error("No delivery record is available to export.");
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const footerReserve = 12;
  let y = 14;

  const status = normalize(record.report_status || record.status);
  const isDelivered = status === "delivered" || status === "completed";
  const isFailed = status === "failed";
  const attemptNumber = Number(record.attempt_number || 1);
  const attemptCount = Number(record.attempt_count || 1);
  const items = Array.isArray(record.items) ? record.items : [];

  const addFooter = () => {
    const totalPages = doc.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      doc.setPage(pageNumber);
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(105, 105, 105);
      doc.text(
        "Administrative record. Supporting evidence remains available as separate source documents.",
        margin,
        pageHeight - 5,
      );
      doc.text(
        `Page ${pageNumber} of ${totalPages}`,
        pageWidth - margin,
        pageHeight - 5,
        { align: "right" },
      );
    }
  };

  const ensureSpace = (heightNeeded) => {
    if (y + heightNeeded <= pageHeight - footerReserve) return;
    doc.addPage();
    y = 14;
  };

  const sectionTitle = (title) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(25, 25, 25);
    doc.text(String(title).toUpperCase(), margin, y + 4);
    doc.setDrawColor(210, 210, 210);
    doc.line(margin, y + 6, pageWidth - margin, y + 6);
    y += 10;
  };

  const keyValueGrid = (entries, columns = 2) => {
    const usable = entries.filter(Boolean);
    const gap = 2;
    const cellWidth = (contentWidth - gap * (columns - 1)) / columns;
    const rows = Math.ceil(usable.length / columns);

    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      const rowEntries = usable.slice(rowIndex * columns, rowIndex * columns + columns);
      const valueLinesByEntry = rowEntries.map(([, value]) =>
        doc.splitTextToSize(cleanCellText(value, 260), cellWidth - 6),
      );
      const maxLines = Math.max(
        1,
        ...valueLinesByEntry.map((lines) => lines.length),
      );
      const rowHeight = Math.max(16, 10 + maxLines * 3.4);
      ensureSpace(rowHeight + 2);

      rowEntries.forEach(([label, value], columnIndex) => {
        const x = margin + columnIndex * (cellWidth + gap);
        doc.setDrawColor(220, 220, 220);
        doc.setFillColor(252, 252, 252);
        doc.rect(x, y, cellWidth, rowHeight, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.6);
        doc.setTextColor(105, 105, 105);
        doc.text(String(label).toUpperCase(), x + 3, y + 4.6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.2);
        doc.setTextColor(25, 25, 25);
        const lines = doc.splitTextToSize(cleanCellText(value, 260), cellWidth - 6);
        doc.text(lines, x + 3, y + 10);
      });
      y += rowHeight + 2;
    }
  };

  doc.setTextColor(15, 15, 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("SPIRAL WOOD SERVICES", margin, y);
  doc.setFontSize(11);
  doc.text("DELIVERY RECORD", margin, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${formatDateTime(new Date())}`, pageWidth - margin, y, {
    align: "right",
  });
  y += 14;

  doc.setDrawColor(35, 35, 35);
  doc.setFillColor(35, 35, 35);
  doc.rect(margin, y, contentWidth, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(statusLabel(status).toUpperCase(), margin + 3, y + 7.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Attempt ${attemptNumber} of ${attemptCount}`,
    pageWidth - margin - 3,
    y + 7.5,
    { align: "right" },
  );
  y += 16;

  sectionTitle("Delivery Information");
  keyValueGrid([
    ["Order Number", record.order_number || (record.order_id ? `#${record.order_id}` : "-")],
    ["Order Type", statusLabel(record.order_type)],
    ["Delivery ID", record.delivery_id || record.id || "-"],
    ["Customer", record.customer_name || "Walk-in Customer"],
    ["Rider", record.driver_name || "Unassigned"],
    ["Assigned On", formatDateTime(record.assigned_at)],
    ["Scheduled", formatScheduledDate(record.scheduled_date)],
    ["Outcome Date", formatDateTime(recordOutcomeDate(record))],
  ]);

  sectionTitle("Destination");
  const addressLines = doc.splitTextToSize(
    cleanCellText(record.address || "Address unavailable", 420),
    contentWidth - 6,
  );
  const addressHeight = Math.max(14, 7 + addressLines.length * 3.6);
  ensureSpace(addressHeight + 2);
  doc.setDrawColor(220, 220, 220);
  doc.rect(margin, y, contentWidth, addressHeight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.3);
  doc.setTextColor(35, 35, 35);
  doc.text(addressLines, margin + 3, y + 6);
  y += addressHeight + 4;

  sectionTitle("Items");
  if (!items.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("No item details are available for this delivery record.", margin, y + 4);
    y += 9;
  } else {
    const hasCode = items.some((item) => String(item?.client_code || "").trim());
    const widths = hasCode ? [34, 18, 18, 112] : [22, 22, 138];
    const headers = hasCode
      ? ["Item Code", "Qty", "Unit", "Description"]
      : ["Qty", "Unit", "Description"];

    const drawItemsHeader = () => {
      ensureSpace(9);

      // Draw one continuous high-contrast header strip first, then add
      // separators and labels. This avoids per-cell fill-state rendering
      // inconsistencies in browser PDF viewers.
      doc.setFillColor(45, 45, 45);
      doc.setDrawColor(45, 45, 45);
      doc.rect(margin, y, contentWidth, 8, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(255, 255, 255);

      let x = margin;
      headers.forEach((header, index) => {
        doc.text(header.toUpperCase(), x + 2, y + 5);

        x += widths[index];
        if (index < headers.length - 1) {
          doc.setDrawColor(210, 210, 210);
          doc.line(x, y, x, y + 8);
        }
      });

      y += 8;
    };

    drawItemsHeader();
    items.forEach((item) => {
      const cells = hasCode
        ? [
            cleanCellText(item.client_code || "-", 60),
            String(Number(item.quantity || 0)),
            cleanCellText(item.unit || "pc", 20),
            cleanCellText(item.description || "Item", 220),
          ]
        : [
            String(Number(item.quantity || 0)),
            cleanCellText(item.unit || "pc", 20),
            cleanCellText(item.description || "Item", 220),
          ];
      const lineSets = cells.map((cell, index) =>
        doc.splitTextToSize(cell, Math.max(5, widths[index] - 4)),
      );
      const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));
      const rowHeight = Math.max(8, 3.4 * maxLines + 3.2);
      if (y + rowHeight > pageHeight - footerReserve) {
        doc.addPage();
        y = 14;
        drawItemsHeader();
      }
      let x = margin;
      lineSets.forEach((lines, index) => {
        doc.setDrawColor(225, 225, 225);
        doc.rect(x, y, widths[index], rowHeight);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.2);
        doc.setTextColor(35, 35, 35);
        doc.text(lines, x + 2, y + 4.6);
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 3;
  }

  if (isDelivered) {
    sectionTitle("Recorded Handoff");
    keyValueGrid([
      ["Received By", record.delivery_received_by_name || "Not available"],
      ["Recipient", recipientTypeLabel(record.delivery_recipient_type)],
      ["Received On", formatDateTime(record.delivery_acknowledged_at)],
      ["Delivery Receipt", record.delivery_receipt_number || "Not available"],
      ["Proof of Delivery", record.signed_receipt ? "Recorded" : "Not available"],
      ["E-Signature", Number(record.delivery_has_signature || 0) === 1 ? "Recorded" : "Not captured"],
    ]);
  }

  if (record.notes || isFailed) {
    sectionTitle(isFailed ? "Failure Details" : "Notes");
    const notes = cleanCellText(record.notes || "No failure notes were recorded.", 900);
    const noteLines = doc.splitTextToSize(notes, contentWidth - 6);
    const notesHeight = Math.max(16, 8 + noteLines.length * 3.5);
    ensureSpace(notesHeight + 2);
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, y, contentWidth, notesHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(35, 35, 35);
    doc.text(noteLines, margin + 3, y + 6);
    y += notesHeight + 4;
  }

  addFooter();

  const orderPart = safeFilenamePart(
    record.order_number || (record.order_id ? `Order_${record.order_id}` : "Delivery"),
    "Delivery",
  );
  doc.save(
    `Delivery_Record_${orderPart}_Attempt_${Math.max(1, attemptNumber)}.pdf`,
  );
}
