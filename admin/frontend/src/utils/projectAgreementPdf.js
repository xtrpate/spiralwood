import jsPDF from "jspdf";
import contractLogo from "../pages/customer/spiral-wood-contract-logo.png";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatMoney = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value, withTime = false) => {
  if (!value) return "Not yet recorded";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet recorded";

  return withTime
    ? date.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : date.toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
};

const formatAgreementDate = (value) => {
  if (!value) return "the date stated in this Agreement";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "the date stated in this Agreement";

  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).formatToParts(date);

  const day = Number(parts.find((part) => part.type === "day")?.value || 0);
  const month = parts.find((part) => part.type === "month")?.value || "";
  const year = parts.find((part) => part.type === "year")?.value || "";
  const mod100 = day % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";

  return `${day}${suffix} day of ${month}, ${year}`;
};

const titleCase = (value, fallback = "Not specified") => {
  const text = String(value || "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!text) return fallback;
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
};

const getCustomerVisibleItems = (estimation) =>
  (Array.isArray(estimation?.items) ? estimation.items : []).filter(
    (item) =>
      !item?.raw_material_id &&
      normalize(item?.source_type || item?.sourceType) !== "inventory_material",
  );

const getProjectItem = (order, explicitItem) => {
  if (explicitItem) return explicitItem;
  const customItems = Array.isArray(order?.custom_request_items)
    ? order.custom_request_items
    : [];
  if (customItems.length) return customItems[0];
  const items = Array.isArray(order?.items) ? order.items : [];
  return (
    items.find((item) => item?.customization || item?.base_blueprint_title) ||
    items[0] ||
    null
  );
};

const getItemField = (item, customerKey, adminKey) =>
  item?.[customerKey] ?? item?.[adminKey] ?? null;

const getProjectName = (item, order, agreement) =>
  getItemField(
    item,
    "base_blueprint_title",
    "requested_base_blueprint_title",
  ) ||
  item?.display_name ||
  item?.product_name ||
  agreement?.blueprint_title ||
  order?.blueprint_title ||
  "Custom Furniture";

const getDimensions = (item) => {
  const width = Number(getItemField(item, "width", "requested_width") || 0);
  const height = Number(getItemField(item, "height", "requested_height") || 0);
  const depth = Number(getItemField(item, "depth", "requested_depth") || 0);
  const unit = String(getItemField(item, "unit", "requested_unit") || "mm");
  if (!(width > 0 || height > 0 || depth > 0)) return "Not specified";
  return `${width || "-"} × ${height || "-"} × ${depth || "-"} ${unit}`;
};

const splitParagraphs = (text = "") =>
  String(text || "")
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

const parseNumberedSections = (text = "") => {
  const normalizedText = String(text || "")
    .replace(/\r/g, "")
    .trim();
  if (!normalizedText) return [];

  const regex =
    /(^|\n)(\d+)\.\s*([A-Z][A-Z0-9 &/(),.-]+)\n([\s\S]*?)(?=\n\d+\.\s*[A-Z][A-Z0-9 &/(),.-]+\n|$)/g;
  const sections = [];
  let match;
  while ((match = regex.exec(normalizedText)) !== null) {
    sections.push({
      number: match[2],
      title: match[3].trim(),
      body: match[4].trim(),
    });
  }

  return sections.length
    ? sections
    : [{ number: null, title: "TERMS AND CONDITIONS", body: normalizedText }];
};

const DEFAULT_CANCELLATION_POLICY =
  "Before production starts, the Customer may request cancellation through the applicable WISDOM workflow for administrative review. Verified payments remain recorded and are not refunded by this workflow. Once production starts or project-specific materials are committed or consumed, withdrawal may stop avoidable future work but does not erase the agreed contract price; any unpaid balance remains due in accordance with the Agreement. If delivery is already in transit, the delivery attempt must first be recorded as failed or refused after the furniture is returned before the withdrawal can be finalized. Nothing in this provision limits customer rights or remedies that cannot legally be waived.";

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

const toRoman = (value) => {
  const number = Math.max(1, Number(value) || 1);
  const values = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = number;
  let output = "";
  values.forEach(([amount, numeral]) => {
    while (remaining >= amount) {
      output += numeral;
      remaining -= amount;
    }
  });
  return output;
};

export async function downloadProjectAgreementPdf({
  agreement = {},
  order = {},
  estimation = null,
  projectItem = null,
  customerName = "",
  customerEmail = "",
} = {}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const logoData = await loadImageDataUrl(contractLogo);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 20;
  let y = 14;

  const agreementId = agreement?.id || null;
  const agreementNumber = agreementId
    ? `CNT-${String(agreementId).padStart(5, "0")}`
    : "CNT-PENDING";
  const orderRef =
    order?.order_number ||
    (agreement?.order_id || order?.id
      ? `#${String(agreement?.order_id || order?.id).padStart(5, "0")}`
      : "Not available");
  const resolvedCustomerName =
    customerName ||
    agreement?.customer_name ||
    order?.customer_name ||
    "Customer";
  const resolvedCustomerEmail =
    customerEmail ||
    agreement?.customer_email ||
    order?.customer_email ||
    "Authenticated WISDOM account";
  const item = getProjectItem(order, projectItem);
  const projectName = getProjectName(item, order, agreement);
  const dimensions = getDimensions(item);
  const wood =
    getItemField(item, "wood_type", "requested_wood_type") || "Not specified";
  const finish =
    getItemField(item, "finish_color", "requested_finish_color") ||
    getItemField(item, "color", "requested_finish_color") ||
    "Not specified";
  const quantity = Number(item?.quantity || 1) || 1;
  const assemblyRaw = getItemField(
    item,
    "assembly_choice",
    "requested_assembly_choice",
  );
  const assemblyNormalized = normalize(assemblyRaw);
  const assembly =
    assemblyNormalized === "included" ||
    assemblyNormalized === "included (free)"
      ? "Included (Free)"
      : assemblyNormalized === "none"
        ? "Not included"
        : "Not specified";

  const approvedTotal = Number(
    estimation?.grand_total ??
      agreement?.total_amount ??
      order?.total_amount ??
      order?.total ??
      0,
  );
  const requiredDownPayment = Number(
    agreement?.down_payment ??
      (approvedTotal > 0 ? (approvedTotal * 0.3).toFixed(2) : 0),
  );
  const remainingBalance = Math.max(0, approvedTotal - requiredDownPayment);
  const isPickup = normalize(order?.fulfillment_method) === "pickup";
  const visibleItems = getCustomerVisibleItems(estimation);

  const setBodyFont = (bold = false, size = 9) => {
    doc.setFont("times", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(20, 20, 20);
  };

  const drawPageLogo = ({
    x = margin + 2,
    yPosition = 11,
    width = 26,
    height = 22,
  } = {}) => {
    if (!logoData) return;
    try {
      doc.addImage(
        logoData,
        "PNG",
        x,
        yPosition,
        width,
        height,
        undefined,
        "FAST",
      );
    } catch {
      // Text branding remains visible even if the image cannot be embedded.
    }
  };

  const addContinuationHeader = (title = "CONTRACT AGREEMENT") => {
    doc.addPage();
    y = 13;
    drawPageLogo({
      x: margin,
      yPosition: 6.5,
      width: 15,
      height: 13,
    });
    setBodyFont(true, 8.5);
    doc.text("SPIRAL WOOD SERVICES", margin + 19, y);
    setBodyFont(false, 7.5);
    doc.setTextColor(90, 90, 90);
    doc.text(`${agreementNumber} | ${title}`, pageWidth - margin, y, {
      align: "right",
    });
    doc.setDrawColor(205, 205, 205);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 3, pageWidth - margin, y + 3);
    y += 10;
  };

  const ensureSpace = (needed = 10, continuationTitle) => {
    if (y + needed > bottomLimit) {
      addContinuationHeader(continuationTitle);
      return true;
    }
    return false;
  };

  const writeParagraph = (
    value,
    { size = 9, bold = false, indent = 0, gap = 2.2, lineHeight = 4.1 } = {},
  ) => {
    const width = contentWidth - indent;
    const lines = doc.splitTextToSize(String(value || ""), width);
    ensureSpace(Math.max(1, lines.length) * lineHeight + gap + 1);
    setBodyFont(bold, size);
    doc.text(lines, margin + indent, y);
    y += Math.max(1, lines.length) * lineHeight + gap;
  };

  const drawFirstPageHeader = () => {
    drawPageLogo();

    setBodyFont(true, 9.5);
    doc.text("SPIRAL WOOD SERVICES", pageWidth / 2, 18, { align: "center" });
    setBodyFont(true, 16);
    doc.text("CONTRACT AGREEMENT", pageWidth / 2, 27, { align: "center" });
    setBodyFont(false, 9);
    doc.setTextColor(85, 85, 85);
    doc.text("Custom Furniture Project", pageWidth / 2, 34, { align: "center" });
    y = 45;
  };

  const drawSectionHeading = (title, { centered = false, size = 10.5 } = {}) => {
    ensureSpace(8);
    y += 1;
    setBodyFont(true, size);
    doc.text(title, centered ? pageWidth / 2 : margin, y, {
      align: centered ? "center" : "left",
    });
    y += 5.5;
  };

  const drawProjectDetailsTable = () => {
    const widths = [27, 57, 29, contentWidth - 113];
    const rows = [
      ["CONTRACT NO.", agreementNumber, "ORDER NO.", orderRef],
      ["CUSTOMER", resolvedCustomerName, "ISSUED", formatDate(agreement?.created_at)],
      ["FURNITURE", projectName, "QUANTITY", String(quantity)],
      ["DIMENSIONS", dimensions, "WOOD", titleCase(wood)],
      ["FINISH", titleCase(finish), "ASSEMBLY", assembly],
      ["FULFILLMENT", isPickup ? "Pickup" : "Delivery", "", ""],
    ];

    rows.forEach((row) => {
      const valueLines = [
        doc.splitTextToSize(String(row[1] || "-"), widths[1] - 4),
        doc.splitTextToSize(String(row[3] || "-"), widths[3] - 4),
      ];
      const rowHeight = Math.max(7.5, Math.max(valueLines[0].length, valueLines[1].length) * 3.6 + 3.5);
      ensureSpace(rowHeight + 1);
      let x = margin;

      row.forEach((cell, index) => {
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.2);
        doc.setFillColor(index % 2 === 0 ? 238 : 255, index % 2 === 0 ? 238 : 255, index % 2 === 0 ? 238 : 255);
        doc.rect(x, y, widths[index], rowHeight, index % 2 === 0 ? "FD" : "D");
        setBodyFont(index % 2 === 0, index % 2 === 0 ? 7.8 : 8.4);
        const cellLines = doc.splitTextToSize(String(cell || ""), widths[index] - 4);
        doc.text(cellLines, x + 2, y + 4.8);
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 6;
  };

  const scopeWidths = [12, 72, 18, 14, 33, contentWidth - 149];
  const drawScopeHeader = () => {
    const headers = ["ITEM", "DESCRIPTION", "UNIT", "QTY.", "UNIT PRICE", "TOTAL"];
    let x = margin;
    headers.forEach((header, index) => {
      doc.setFillColor(235, 235, 235);
      doc.setDrawColor(145, 145, 145);
      doc.setLineWidth(0.2);
      doc.rect(x, y, scopeWidths[index], 8, "FD");
      setBodyFont(true, 7.4);
      doc.text(header, x + 1.8, y + 5.2);
      x += scopeWidths[index];
    });
    y += 8;
  };

  const drawScopeOfWork = () => {
    drawSectionHeading("SCOPE OF WORK", { size: 10.5 });
    drawScopeHeader();

    const rows = visibleItems.length
      ? visibleItems
      : [
          {
            description: projectName,
            quantity,
            unit: "pcs",
            quotation_reference_only: true,
          },
        ];

    rows.forEach((row, index) => {
      const qty = Number(row?.quantity || 0) || 0;
      const subtotal = Number(row?.subtotal ?? qty * Number(row?.unit_cost || 0));
      const unitPrice = Number(
        row?.unit_cost ?? (qty > 0 ? subtotal / qty : subtotal),
      );
      const cells = [
        toRoman(index + 1),
        row?.description || row?.name || `Item ${index + 1}`,
        row?.unit || row?.uom || "pcs",
        qty || "-",
        row?.quotation_reference_only ? "See quotation" : formatMoney(unitPrice),
        row?.quotation_reference_only ? "See quotation" : formatMoney(subtotal),
      ];
      const wrapped = cells.map((cell, cellIndex) =>
        doc.splitTextToSize(String(cell), scopeWidths[cellIndex] - 3),
      );
      const rowHeight = Math.max(
        8,
        Math.max(...wrapped.map((lines) => lines.length)) * 3.5 + 3,
      );

      if (y + rowHeight > bottomLimit) {
        addContinuationHeader("SCOPE OF WORK");
        drawScopeHeader();
      }

      let x = margin;
      wrapped.forEach((lines, cellIndex) => {
        doc.setDrawColor(160, 160, 160);
        doc.setLineWidth(0.18);
        doc.rect(x, y, scopeWidths[cellIndex], rowHeight);
        setBodyFont(false, 7.8);
        const alignRight = cellIndex >= 3;
        const textX = alignRight
          ? x + scopeWidths[cellIndex] - 1.8
          : cellIndex === 0 || cellIndex === 2
            ? x + scopeWidths[cellIndex] / 2
            : x + 1.8;
        doc.text(lines, textX, y + 4.8, {
          align: alignRight ? "right" : cellIndex === 0 || cellIndex === 2 ? "center" : "left",
        });
        x += scopeWidths[cellIndex];
      });
      y += rowHeight;
    });
    y += 7;
  };

  const drawMoneyRow = (label, value, { strong = false } = {}) => {
    ensureSpace(strong ? 7 : 5.5);
    setBodyFont(strong, strong ? 9.2 : 8.6);
    doc.text(String(label || ""), margin + 2, y);
    doc.text(formatMoney(value), pageWidth - margin - 2, y, { align: "right" });
    y += strong ? 6 : 5.2;
  };

  const drawCostSummary = () => {
    drawMoneyRow("FURNITURE PARTS", estimation?.material_cost || 0);
    drawMoneyRow("LABOR", estimation?.labor_cost || 0);
    if (!isPickup) {
      drawMoneyRow("LOGISTICS", estimation?.overhead_cost || 0);
      if (Number(estimation?.additional_delivery_fee || 0) > 0) {
        drawMoneyRow("ADDITIONAL DELIVERY FEE", estimation.additional_delivery_fee);
      }
    }
    const discount = Number(
      estimation?.discount_amount ?? estimation?.discount ?? 0,
    );
    if (discount > 0) drawMoneyRow("DISCOUNT", -discount);
    drawMoneyRow("VAT", estimation?.tax_amount ?? estimation?.tax ?? 0);
    doc.setDrawColor(70, 70, 70);
    doc.setLineWidth(0.25);
    doc.line(margin, y - 1.5, pageWidth - margin, y - 1.5);
    y += 2;
    drawMoneyRow("TOTAL CONTRACT PRICE", approvedTotal, { strong: true });
  };

  const startTermsPage = () => {
    doc.addPage();
    y = 18;
    drawPageLogo({
      x: margin + 2,
      yPosition: 10,
      width: 22,
      height: 18,
    });
    setBodyFont(true, 9.5);
    doc.text("SPIRAL WOOD SERVICES", pageWidth / 2, y, { align: "center" });
    y += 8;
    setBodyFont(true, 14);
    doc.text("CONTRACT TERMS AND CONDITIONS", pageWidth / 2, y, {
      align: "center",
    });
    y += 12;
  };

  drawFirstPageHeader();

  const agreementOpening = `THIS AGREEMENT, made this ${formatAgreementDate(
    agreement?.created_at,
  )}, is entered into by and between SPIRAL WOOD SERVICES, hereinafter referred to as the CONTRACTOR, and ${String(
    resolvedCustomerName,
  ).toUpperCase()}, hereinafter referred to as the CUSTOMER, for the manufacture and completion of the custom furniture project identified under Contract No. ${agreementNumber} and Order No. ${orderRef}.`;
  writeParagraph(agreementOpening, { size: 9.2, gap: 4 });

  writeParagraph("WITNESSETH AS FOLLOWS:", {
    size: 9.5,
    bold: true,
    gap: 3,
  });
  writeParagraph(
    "1. The Customer engages the Contractor to build and complete the furniture described in this Agreement based on the approved design, quotation, specifications, and project details recorded for the order.",
    { size: 9.1, gap: 3 },
  );
  writeParagraph(
    "2. The project details and scope of work forming part of this Agreement are as follows:",
    { size: 9.1, gap: 4 },
  );

  drawProjectDetailsTable();
  drawScopeOfWork();
  drawCostSummary();

  startTermsPage();

  const terms = parseNumberedSections(
    agreement?.terms || agreement?.materials_used || "",
  );

  const paymentClause = `The total contract price is ${formatMoney(
    approvedTotal,
  )}. A minimum down payment of 30%, amounting to ${formatMoney(
    requiredDownPayment,
  )}, is required before production starts. The Customer may pay more than the minimum, up to the full project total. The remaining balance of ${formatMoney(
    remainingBalance,
  )}, subject to any approved changes or additional charges, must be fully paid before the order is completed or finally released.`;

  terms.forEach((section) => {
    const heading = section.number
      ? `${section.number}. ${section.title}`
      : section.title;
    const sectionBody =
      normalize(section.title) === "payment" ? paymentClause : section.body;
    ensureSpace(13, "CONTRACT TERMS AND CONDITIONS");
    setBodyFont(true, 9.8);
    doc.text(heading, margin, y);
    y += 5.2;
    splitParagraphs(sectionBody).forEach((paragraph) => {
      writeParagraph(paragraph, { size: 9, gap: 2.5 });
    });
    y += 2;
  });

  const hasCancellation = terms.some((section) =>
    normalize(section.title).includes("cancellation"),
  );
  if (!hasCancellation) {
    ensureSpace(18, "CONTRACT TERMS AND CONDITIONS");
    setBodyFont(true, 9.8);
    doc.text("CANCELLATION", margin, y);
    y += 5.2;
    writeParagraph(DEFAULT_CANCELLATION_POLICY, { size: 9, gap: 3 });
  }

  ensureSpace(22, "CONTRACT TERMS AND CONDITIONS");
  setBodyFont(true, 9.8);
  doc.text("WARRANTY", margin, y);
  y += 5.2;
  splitParagraphs(
    agreement?.warranty_terms || "Warranty terms are not available.",
  ).forEach((paragraph) => {
    writeParagraph(paragraph, { size: 9, gap: 2.5 });
  });

  ensureSpace(36, "ACCEPTANCE RECORD");
  y += 2;
  setBodyFont(true, 10.5);
  doc.text("ACCEPTANCE RECORD", margin, y);
  y += 6;

  const accepted = Boolean(agreement?.signed_at);
  if (accepted) {
    writeParagraph(
      "The Customer accepted this Agreement through the WISDOM Customer Account.",
      { size: 9, gap: 4 },
    );

    const acceptanceRows = [
      ["Customer", resolvedCustomerName],
      ["Accepted On", formatDate(agreement.signed_at, true)],
      ["Account", resolvedCustomerEmail],
      ["Method", "WISDOM Customer Account"],
    ];
    const labelWidth = 34;
    acceptanceRows.forEach(([label, value]) => {
      const valueLines = doc.splitTextToSize(String(value || "-"), contentWidth - labelWidth - 5);
      const rowHeight = Math.max(8, valueLines.length * 3.8 + 3.5);
      ensureSpace(rowHeight + 1, "ACCEPTANCE RECORD");
      doc.setDrawColor(155, 155, 155);
      doc.setFillColor(238, 238, 238);
      doc.rect(margin, y, labelWidth, rowHeight, "FD");
      doc.rect(margin + labelWidth, y, contentWidth - labelWidth, rowHeight);
      setBodyFont(true, 8);
      doc.text(label.toUpperCase(), margin + 2, y + 5);
      setBodyFont(false, 8.6);
      doc.text(valueLines, margin + labelWidth + 2.5, y + 5);
      y += rowHeight;
    });
  } else {
    writeParagraph(
      "Pending customer acceptance through the WISDOM Customer Account.",
      { size: 9, gap: 3 },
    );
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(190, 190, 190);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    doc.setFont("times", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(105, 105, 105);
    doc.text(`Spiral Wood Services | ${agreementNumber}`, margin, pageHeight - 9);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 9, {
      align: "right",
    });
  }

  doc.save(`contract_${agreementNumber}.pdf`);
  return agreementNumber;
}
