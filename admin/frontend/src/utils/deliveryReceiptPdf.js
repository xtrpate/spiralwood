import { jsPDF } from "jspdf";
import receiptLogo from "../pages/customer/spiral-wood-receipt-logo-v172.png";
import { sanitizeFilenamePart } from "./downloadRemoteFile";

const BUSINESS_ADDRESS =
  "8 Laot Street, Near Gavino, Prenza I, Marilao, 3019 Bulacan";

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

const formatRecipient = (value) => {
  const key = String(value || "").trim().toLowerCase();
  if (key === "authorized_representative") return "Authorized Representative";
  if (key === "customer") return "Customer";
  return "-";
};

const loadImageDataUrl = (src) =>
  new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });

const formatUnit = (value) => {
  const unit = String(value || "").trim();
  if (!unit) return "pc";
  return unit.toLowerCase() === "pc(s)" ? "pc" : unit;
};

const textOrDash = (value) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

export async function downloadDeliveryReceiptPdf(receipt) {
  if (!receipt || !receipt.receipt_number) {
    throw new Error("Delivery Receipt data is unavailable.");
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 14;
  let y = 12;

  const line = (x1, y1, x2, y2, width = 0.25) => {
    doc.setDrawColor(35, 35, 35);
    doc.setLineWidth(width);
    doc.line(x1, y1, x2, y2);
  };

  const box = (x, top, width, height, fill = null) => {
    if (fill) {
      doc.setFillColor(...fill);
      doc.rect(x, top, width, height, "F");
    }
    doc.setDrawColor(35, 35, 35);
    doc.setLineWidth(0.25);
    doc.rect(x, top, width, height);
  };

  const writeLabel = (text, x, top) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(80, 80, 80);
    doc.text(String(text || "").toUpperCase(), x, top);
  };

  const writeValue = (text, x, top, options = {}) => {
    doc.setFont("helvetica", options.bold === false ? "normal" : "bold");
    doc.setFontSize(options.size || 9);
    doc.setTextColor(20, 20, 20);
    const width = options.maxWidth || 60;
    const lines = doc.splitTextToSize(textOrDash(text), width);
    doc.text(lines, x, top, options.align ? { align: options.align } : undefined);
    return lines;
  };

  const logoData = await loadImageDataUrl(receiptLogo);

  const headerHeight = 28;
  box(margin, y, contentWidth, headerHeight);
  const titleCellWidth = 58;
  line(pageWidth - margin - titleCellWidth, y, pageWidth - margin - titleCellWidth, y + headerHeight);

  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", margin + 3, y + 4.5, 20, 17, undefined, "FAST");
    } catch {
      // Company text below remains the authoritative header if the logo
      // cannot be embedded by a particular browser.
    }
  }

  const brandX = margin + (logoData ? 27 : 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 15, 15);
  doc.text("SPIRAL WOOD SERVICES", brandX, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text(doc.splitTextToSize(BUSINESS_ADDRESS, 98), brandX, y + 15);

  const titleX = pageWidth - margin - titleCellWidth / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 15, 15);
  doc.text("DELIVERY RECEIPT", titleX, y + 10, { align: "center" });
  doc.setFontSize(7.3);
  doc.text("DR NUMBER", pageWidth - margin - titleCellWidth + 4, y + 18);
  doc.setFontSize(9.2);
  doc.text(textOrDash(receipt.receipt_number), pageWidth - margin - 4, y + 24, {
    align: "right",
  });
  y += headerHeight;

  const partyHeight = 24;
  const labelWidth = 25;
  const orderWidth = 44;
  box(margin, y, contentWidth, partyHeight);
  line(margin + labelWidth, y, margin + labelWidth, y + partyHeight);
  line(pageWidth - margin - orderWidth, y, pageWidth - margin - orderWidth, y + partyHeight);
  writeLabel("Deliver To", margin + 3, y + 6);
  writeValue(receipt.customer_name, margin + labelWidth + 3, y + 7.5, {
    maxWidth: contentWidth - labelWidth - orderWidth - 8,
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(45, 45, 45);
  doc.text(
    doc.splitTextToSize(textOrDash(receipt.delivery_address), contentWidth - labelWidth - orderWidth - 8),
    margin + labelWidth + 3,
    y + 13,
  );
  writeLabel("Order Number", pageWidth - margin - orderWidth + 3, y + 6);
  writeValue(receipt.order_number, pageWidth - margin - 3, y + 14, {
    maxWidth: orderWidth - 6,
    align: "right",
  });
  y += partyHeight;

  const metaHeight = 20;
  const metaWidth = contentWidth / 3;
  box(margin, y, contentWidth, metaHeight);
  line(margin + metaWidth, y, margin + metaWidth, y + metaHeight);
  line(margin + metaWidth * 2, y, margin + metaWidth * 2, y + metaHeight);
  writeLabel("Delivery Date", margin + 3, y + 5.5);
  writeValue(formatDateTime(receipt.delivered_at || receipt.acknowledged_at), margin + 3, y + 13, {
    maxWidth: metaWidth - 6,
    size: 8.1,
  });
  writeLabel("Delivery Representative", margin + metaWidth + 3, y + 5.5);
  writeValue(receipt.driver_name || receipt.recorded_by_name || "Assigned Rider", margin + metaWidth + 3, y + 13, {
    maxWidth: metaWidth - 6,
    size: 8.1,
  });
  writeLabel("Customer Contact", margin + metaWidth * 2 + 3, y + 5.5);
  writeValue(receipt.customer_phone, margin + metaWidth * 2 + 3, y + 13, {
    maxWidth: metaWidth - 6,
    size: 8.1,
  });
  y += metaHeight + 6;

  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const showItemCode = items.some((item) => String(item?.client_code || "").trim());
  const tableWidths = showItemCode
    ? [37, 23, 23, contentWidth - 83]
    : [28, 28, contentWidth - 56];
  const headers = showItemCode
    ? ["ITEM CODE", "QUANTITY", "UNIT", "DESCRIPTION"]
    : ["QUANTITY", "UNIT", "DESCRIPTION"];

  const drawTableHeader = () => {
    const headerH = 8;
    let x = margin;
    headers.forEach((header, index) => {
      box(x, y, tableWidths[index], headerH, [244, 244, 245]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(30, 30, 30);
      doc.text(header, x + 2, y + 5.2);
      x += tableWidths[index];
    });
    y += headerH;
  };

  drawTableHeader();

  const rows = items.length
    ? items
    : [{ client_code: "-", quantity: 0, unit: "-", description: "No item snapshot available" }];

  rows.forEach((item) => {
    const descriptionWidth = tableWidths[tableWidths.length - 1];
    const descriptionLines = doc.splitTextToSize(
      textOrDash(item.description || "Item"),
      descriptionWidth - 4,
    );
    const rowH = Math.max(8, descriptionLines.length * 3.7 + 3.2);

    if (y + rowH + 70 > bottomLimit) {
      doc.addPage();
      y = 12;
      drawTableHeader();
    }

    let x = margin;
    tableWidths.forEach((width) => {
      box(x, y, width, rowH);
      x += width;
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);

    if (showItemCode) {
      doc.text(textOrDash(item.client_code), margin + 2, y + 5);
      doc.text(
        String(Number(item.quantity || 0)),
        margin + tableWidths[0] + tableWidths[1] / 2,
        y + 5,
        { align: "center" },
      );
      doc.text(
        formatUnit(item.unit),
        margin + tableWidths[0] + tableWidths[1] + tableWidths[2] / 2,
        y + 5,
        { align: "center" },
      );
      doc.text(
        descriptionLines,
        margin + tableWidths[0] + tableWidths[1] + tableWidths[2] + 2,
        y + 5,
      );
    } else {
      doc.text(
        String(Number(item.quantity || 0)),
        margin + tableWidths[0] / 2,
        y + 5,
        { align: "center" },
      );
      doc.text(
        formatUnit(item.unit),
        margin + tableWidths[0] + tableWidths[1] / 2,
        y + 5,
        { align: "center" },
      );
      doc.text(
        descriptionLines,
        margin + tableWidths[0] + tableWidths[1] + 2,
        y + 5,
      );
    }
    y += rowH;
  });

  const totalItems = Number.isFinite(Number(receipt.total_items))
    ? Number(receipt.total_items)
    : items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  box(margin, y, contentWidth, 9, [250, 250, 250]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text("TOTAL ITEMS", margin + 3, y + 6);
  doc.text(String(totalItems), pageWidth - margin - 5, y + 6, { align: "right" });
  y += 14;

  if (y + 72 > bottomLimit) {
    doc.addPage();
    y = 12;
  }

  const turnoverH = 22;
  const turnoverW = contentWidth / 3;
  box(margin, y, contentWidth, turnoverH);
  line(margin + turnoverW, y, margin + turnoverW, y + turnoverH);
  line(margin + turnoverW * 2, y, margin + turnoverW * 2, y + turnoverH);
  writeLabel("Recorded By", margin + 3, y + 5.5);
  writeValue(receipt.recorded_by_name || receipt.captured_by_name || "Assigned Rider", margin + 3, y + 13, {
    maxWidth: turnoverW - 6,
    size: 8.1,
  });
  writeLabel("Received By", margin + turnoverW + 3, y + 5.5);
  writeValue(receipt.received_by_name, margin + turnoverW + 3, y + 13, {
    maxWidth: turnoverW - 6,
    size: 8.1,
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text(formatRecipient(receipt.recipient_type), margin + turnoverW + 3, y + 18.3);
  writeLabel("Received On", margin + turnoverW * 2 + 3, y + 5.5);
  writeValue(formatDateTime(receipt.acknowledged_at), margin + turnoverW * 2 + 3, y + 13, {
    maxWidth: turnoverW - 6,
    size: 8.1,
  });
  y += turnoverH + 5;

  const acknowledgement = textOrDash(
    receipt.acknowledgement_text ||
      "I acknowledge receipt of this order at the delivery address.",
  );
  const acknowledgementLines = doc.splitTextToSize(acknowledgement, contentWidth - 6);
  const ackH = Math.max(17, acknowledgementLines.length * 3.8 + 10);
  box(margin, y, contentWidth, ackH);
  writeLabel("Recipient Acknowledgement", margin + 3, y + 5.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text(acknowledgementLines, margin + 3, y + 11.5);
  y += ackH + 5;

  const signaturePresent = Boolean(receipt.signature_present && receipt.signature_data);
  const signatureH = 35;
  if (y + signatureH + 18 > bottomLimit) {
    doc.addPage();
    y = 12;
  }
  box(margin, y, contentWidth, signatureH);
  writeLabel("Recipient E-Signature (Optional)", margin + 3, y + 5.5);
  if (signaturePresent) {
    try {
      const signatureProps = doc.getImageProperties(receipt.signature_data);
      const maxSignatureWidth = 82;
      const maxSignatureHeight = 23;
      const signatureScale = Math.min(
        maxSignatureWidth / signatureProps.width,
        maxSignatureHeight / signatureProps.height,
      );
      const signatureWidth = signatureProps.width * signatureScale;
      const signatureHeight = signatureProps.height * signatureScale;
      doc.addImage(
        receipt.signature_data,
        "PNG",
        margin + 4,
        y + 8 + (maxSignatureHeight - signatureHeight) / 2,
        signatureWidth,
        signatureHeight,
        undefined,
        "FAST",
      );
    } catch {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text("E-signature is recorded but could not be rendered in this PDF.", margin + 4, y + 17);
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text("No e-signature was captured. Recipient acknowledgement and Proof of Delivery remain recorded.", margin + 4, y + 17);
  }
  y += signatureH + 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.3);
  doc.setTextColor(90, 90, 90);
  const proofText = receipt.proof_of_delivery_recorded
    ? "Proof of Delivery: Recorded"
    : "Proof of Delivery: Not available";
  doc.text(proofText, margin, y);
  doc.text(
    `Issued ${formatDateTime(receipt.issued_at || receipt.acknowledged_at)}`,
    pageWidth - margin,
    y,
    { align: "right" },
  );
  y += 4;
  doc.text(
    "This receipt confirms the recorded delivery handoff for the order shown above.",
    margin,
    y,
  );

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setDrawColor(215, 215, 215);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(105, 105, 105);
    doc.text(textOrDash(receipt.receipt_number), margin, pageHeight - 5.5);
    doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 5.5, {
      align: "right",
    });
  }

  const filename = sanitizeFilenamePart(receipt.receipt_number, "Delivery_Receipt");
  doc.save(`Delivery_Receipt_${filename}.pdf`);
}
