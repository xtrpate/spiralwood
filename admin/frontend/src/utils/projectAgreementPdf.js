import jsPDF from "jspdf";

const normalize = (value) => String(value || "").trim().toLowerCase();

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
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
};

const titleCase = (value, fallback = "Not specified") => {
  const text = String(value || "").replace(/[_-]+/g, " ").trim();
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
  return items.find((item) => item?.customization || item?.base_blueprint_title) || items[0] || null;
};

const getItemField = (item, customerKey, adminKey) =>
  item?.[customerKey] ?? item?.[adminKey] ?? null;

const getProjectName = (item, order, agreement) =>
  getItemField(item, "base_blueprint_title", "requested_base_blueprint_title") ||
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
  return `${width || "—"} × ${height || "—"} × ${depth || "—"} ${unit}`;
};

const splitParagraphs = (text = "") =>
  String(text || "")
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

const parseNumberedSections = (text = "") => {
  const normalizedText = String(text || "").replace(/\r/g, "").trim();
  if (!normalizedText) return [];
  const regex =
    /(^|\n)(\d+)\.\s*([A-Z][A-Z0-9 &/(),.-]+)\n([\s\S]*?)(?=\n\d+\.\s*[A-Z][A-Z0-9 &/(),.-]+\n|$)/g;
  const sections = [];
  let match;
  while ((match = regex.exec(normalizedText)) !== null) {
    sections.push({ title: match[3].trim(), body: match[4].trim() });
  }
  return sections.length
    ? sections
    : [{ title: "TERMS AND CONDITIONS", body: normalizedText }];
};

const DEFAULT_CANCELLATION_POLICY =
  "The customer may cancel before any payment is verified. After a payment is verified or production starts, the customer must contact Spiral Wood Services. Cancelling the project does not erase the accepted contract or payment records.";

export function downloadProjectAgreementPdf({
  agreement = {},
  order = {},
  estimation = null,
  projectItem = null,
  customerName = "",
  customerEmail = "",
} = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 20;
  let y = 18;

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
    customerName || agreement?.customer_name || order?.customer_name || "Customer";
  const resolvedCustomerEmail =
    customerEmail || agreement?.customer_email || order?.customer_email || "Authenticated WISDOM account";
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
  const assemblyRaw = getItemField(item, "assembly_choice", "requested_assembly_choice");
  const assembly =
    normalize(assemblyRaw) === "included"
      ? "Included"
      : normalize(assemblyRaw) === "none"
        ? "Not included"
        : "Not specified";

  const approvedTotal = Number(
    estimation?.grand_total ?? agreement?.total_amount ?? order?.total_amount ?? order?.total ?? 0,
  );
  const requiredDownPayment = Number(
    agreement?.down_payment || (approvedTotal > 0 ? (approvedTotal * 0.3).toFixed(2) : 0),
  );
  const remainingBalance = Math.max(0, approvedTotal - requiredDownPayment);
  const isPickup = normalize(order?.fulfillment_method) === "pickup";
  const visibleItems = getCustomerVisibleItems(estimation);

  const addPage = () => {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(35, 35, 35);
    doc.text("SPIRAL WOOD SERVICES", margin, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(105, 105, 105);
    doc.text(agreementNumber, pageWidth - margin, 14, { align: "right" });
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, 17, pageWidth - margin, 17);
    y = 24;
  };

  const ensureSpace = (needed = 10) => {
    if (y + needed > bottomLimit) addPage();
  };

  const text = (value, x, width, { size = 9, bold = false, color = [45, 45, 45], lineHeight = 4.1 } = {}) => {
    const lines = doc.splitTextToSize(String(value || "—"), width);
    ensureSpace(Math.max(lines.length, 1) * lineHeight + 1);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(lines, x, y);
    y += Math.max(lines.length, 1) * lineHeight;
  };

  const sectionTitle = (title) => {
    ensureSpace(10);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(25, 25, 25);
    doc.text(title, margin, y);
    y += 5.5;
  };

  const keyValueGrid = (rows) => {
    const leftX = margin;
    const rightX = 109;
    rows.forEach(([l1, v1, l2, v2]) => {
      ensureSpace(11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.4);
      doc.setTextColor(105, 105, 105);
      doc.text(l1, leftX, y);
      doc.text(l2, rightX, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.8);
      doc.setTextColor(25, 25, 25);
      const leftLines = doc.splitTextToSize(String(v1 || "—"), 76);
      const rightLines = doc.splitTextToSize(String(v2 || "—"), 76);
      doc.text(leftLines, leftX, y + 4.1);
      doc.text(rightLines, rightX, y + 4.1);
      y += 7 + Math.max(leftLines.length, rightLines.length) * 3.2;
    });
  };

  const moneyRow = (label, value, strong = false) => {
    ensureSpace(6);
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 9.3 : 8.6);
    doc.setTextColor(strong ? 20 : 55, strong ? 20 : 55, strong ? 20 : 55);
    doc.text(label, margin, y);
    doc.text(formatMoney(value), pageWidth - margin, y, { align: "right" });
    y += strong ? 6 : 5;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text("SPIRAL WOOD SERVICES", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(agreementNumber, pageWidth - margin, y, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(15, 15, 15);
  doc.text("Custom Furniture Contract", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(95, 95, 95);
  doc.text(`Issued ${formatDate(agreement?.created_at)}`, margin, y);
  y += 6;
  doc.setDrawColor(205, 205, 205);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  sectionTitle("Contract Details");
  keyValueGrid([
    ["Contract Number", agreementNumber, "Order", orderRef],
    ["Customer", resolvedCustomerName, "Issued", formatDate(agreement?.created_at)],
  ]);

  sectionTitle("Furniture Details");
  keyValueGrid([
    ["Furniture", projectName, "Quantity", String(quantity)],
    ["Dimensions", dimensions, "Wood", titleCase(wood)],
    ["Finish", titleCase(finish), "Assembly", assembly],
    ["Fulfillment", isPickup ? "Store Pickup" : "Delivery", "", ""],
  ]);

  if (visibleItems.length) {
    sectionTitle("Scope of Work");
    visibleItems.forEach((row, index) => {
      ensureSpace(9);
      const description = row?.description || row?.name || `Item ${index + 1}`;
      const qty = Number(row?.quantity || 0);
      const subtotal = Number(row?.subtotal || qty * Number(row?.unit_cost || 0));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(35, 35, 35);
      const lines = doc.splitTextToSize(`${index + 1}. ${description}`, 118);
      doc.text(lines, margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(`Qty ${qty || "—"}`, 142, y);
      doc.text(formatMoney(subtotal), pageWidth - margin, y, { align: "right" });
      y += Math.max(lines.length, 1) * 4 + 2;
    });
  }

  sectionTitle("Cost Summary");
  moneyRow("Materials", estimation?.material_cost || 0);
  moneyRow("Labor", estimation?.labor_cost || 0);
  if (!isPickup) {
    moneyRow("Logistics", estimation?.overhead_cost || 0);
    if (Number(estimation?.additional_delivery_fee || 0) > 0) {
      moneyRow("Delivery Fee", estimation.additional_delivery_fee);
    }
  }
  const discount = Number(estimation?.discount_amount ?? estimation?.discount ?? 0);
  if (discount > 0) moneyRow("Discount", -discount);
  moneyRow("VAT", estimation?.tax_amount ?? estimation?.tax ?? 0);
  doc.setDrawColor(225, 225, 225);
  doc.line(margin, y - 1, pageWidth - margin, y - 1);
  y += 3;
  moneyRow("Total Price", approvedTotal, true);

  sectionTitle("Payment Terms");
  moneyRow("Down Payment (30%)", requiredDownPayment, true);
  moneyRow("Remaining Balance", remainingBalance, true);
  y += 2;
  text(
    isPickup
      ? "Production starts after the 30% down payment is verified. The remaining balance must be fully paid before the furniture can be released for pickup."
      : "Production starts after the 30% down payment is verified. The remaining balance must be fully paid before the order is completed.",
    margin,
    contentWidth,
  );

  const terms = parseNumberedSections(
    agreement?.terms || agreement?.materials_used || "",
  );
  if (terms.length) {
    sectionTitle("Contract Terms");
    terms.forEach((section, index) => {
      ensureSpace(8);
      text(`${index + 1}. ${section.title}`, margin, contentWidth, {
        size: 9.2,
        bold: true,
        color: [25, 25, 25],
      });
      splitParagraphs(section.body).forEach((paragraph) => {
        text(paragraph, margin, contentWidth, { size: 8.7 });
        y += 1.2;
      });
      y += 1.5;
    });
  }

  const hasCancellation = terms.some((section) =>
    normalize(section.title).includes("cancellation"),
  );
  if (!hasCancellation) {
    sectionTitle("Cancellation Policy");
    text(DEFAULT_CANCELLATION_POLICY, margin, contentWidth, { size: 8.7 });
  }

  sectionTitle("Warranty");
  splitParagraphs(agreement?.warranty_terms || "Warranty terms are not available.").forEach(
    (paragraph) => {
      text(paragraph, margin, contentWidth, { size: 8.7 });
      y += 1.2;
    },
  );

  const accepted = Boolean(agreement?.signed_at);
  sectionTitle(accepted ? "Acceptance Record" : "Acceptance");
  if (accepted) {
    keyValueGrid([
      ["Customer", resolvedCustomerName, "Accepted On", formatDate(agreement.signed_at, true)],
      ["Account", resolvedCustomerEmail, "Method", "WISDOM Customer Account"],
    ]);
  } else {
    text(
      "Waiting for customer acceptance.",
      margin,
      contentWidth,
      { size: 8.7, color: [75, 75, 75] },
    );
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(225, 225, 225);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(115, 115, 115);
    doc.text(`Spiral Wood Services | ${agreementNumber}`, margin, pageHeight - 9);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 9, {
      align: "right",
    });
  }

  doc.save(`contract_${agreementNumber}.pdf`);
  return agreementNumber;
}
