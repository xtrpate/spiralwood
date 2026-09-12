import { jsPDF } from "jspdf";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const titleCase = (value) => {
  const text = String(value || "")
    .replace(/_/g, " ")
    .trim();

  return text
    ? text.replace(/\b\w/g, (char) => char.toUpperCase())
    : "-";
};

const formatMoney = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const getCustomDimensions = (item = {}) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  if (!components.length) {
    return {
      width: Number(item.requested_width) || 0,
      height: Number(item.requested_height) || 0,
      depth: Number(item.requested_depth) || 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  components.forEach((component) => {
    const x = Number(component?.x) || 0;
    const y = Number(component?.y) || 0;
    const z = Number(component?.z) || 0;
    const width = Math.max(0, Number(component?.width) || 0);
    const height = Math.max(0, Number(component?.height) || 0);
    const depth = Math.max(0, Number(component?.depth) || 0);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
    maxZ = Math.max(maxZ, z + depth);
  });

  return {
    width: Math.round(maxX - minX) || Number(item.requested_width) || 0,
    height: Math.round(maxY - minY) || Number(item.requested_height) || 0,
    depth: Math.round(maxZ - minZ) || Number(item.requested_depth) || 0,
  };
};

const sanitizeFilenamePart = (value) =>
  String(value || "ORDER")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "ORDER";

export function exportOrderCompletionReportPdf(order) {
  if (!order || normalize(order.status) !== "completed") {
    throw new Error("Only completed orders can generate a completion report.");
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const footerReserve = 11;
  let y = 12;

  const ensureSpace = (heightNeeded = 10) => {
    if (y + heightNeeded <= pageHeight - footerReserve) return;

    doc.addPage();
    y = 12;
  };

  const addRule = () => {
    doc.setDrawColor(210);
    doc.setLineWidth(0.25);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  };

  const addSectionTitle = (title) => {
    ensureSpace(11);
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y, contentWidth, 7.5, "F");
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    doc.text(String(title || "").toUpperCase(), margin + 3, y + 5);
    y += 10;
  };

  const addField = (label, value) => {
    const safeValue =
      value === null || value === undefined || value === "" ? "-" : String(value);
    const valueLines = doc.splitTextToSize(safeValue, contentWidth - 52);
    const rowHeight = Math.max(5.5, valueLines.length * 4.1 + 0.8);

    ensureSpace(rowHeight + 0.5);

    doc.setFontSize(8.7);
    doc.setTextColor(95, 95, 95);
    doc.setFont("helvetica", "normal");
    doc.text(String(label || ""), margin, y + 3.3);

    doc.setTextColor(25, 25, 25);
    doc.setFont("helvetica", "bold");
    doc.text(valueLines, margin + 52, y + 3.3);

    y += rowHeight;
  };

  const addStandardItemTableHeader = () => {
    ensureSpace(9);

    const widths = [76, 18, 38, 48];
    const labels = ["Item", "Qty", "Unit Price", "Subtotal"];
    let cursor = margin;

    doc.setFillColor(35, 35, 35);
    doc.rect(margin, y, contentWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);

    labels.forEach((label, index) => {
      const alignRight = index >= 2;
      doc.text(
        label,
        alignRight ? cursor + widths[index] - 2 : cursor + 2,
        y + 5.3,
        alignRight ? { align: "right" } : undefined,
      );
      cursor += widths[index];
    });

    y += 8;
  };

  const addStandardItemRow = (item) => {
    const widths = [76, 18, 38, 48];
    const productName =
      item?.display_name || item?.product_name || "Order item";
    const nameLines = doc.splitTextToSize(String(productName), widths[0] - 4);
    const rowHeight = Math.max(8, nameLines.length * 4.3 + 3);

    ensureSpace(rowHeight + 1);

    doc.setDrawColor(225);
    doc.setLineWidth(0.2);

    let cursor = margin;
    widths.forEach((width) => {
      doc.rect(cursor, y, width, rowHeight);
      cursor += width;
    });

    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(nameLines, margin + 2, y + 4.6);

    doc.text(String(item?.quantity ?? "-"), margin + 76 + 9, y + 4.6, {
      align: "center",
    });

    doc.text(
      formatMoney(item?.unit_price),
      margin + 76 + 18 + 38 - 2,
      y + 4.6,
      { align: "right" },
    );

    doc.setFont("helvetica", "bold");
    doc.text(
      formatMoney(item?.subtotal),
      margin + contentWidth - 2,
      y + 4.6,
      { align: "right" },
    );

    y += rowHeight;
  };

  const addCustomItemTableHeader = () => {
    ensureSpace(9);

    const itemWidth = 150;
    const qtyWidth = 30;

    doc.setFillColor(35, 35, 35);
    doc.rect(margin, y, contentWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Item", margin + 2, y + 5.3);
    doc.text("Qty", margin + itemWidth + qtyWidth / 2, y + 5.3, {
      align: "center",
    });

    y += 8;
  };

  const addCustomItemRow = (item) => {
    const itemWidth = 150;
    const qtyWidth = 30;
    const productName =
      item?.display_name || item?.product_name || "Custom Furniture";
    const nameLines = doc.splitTextToSize(String(productName), itemWidth - 4);
    const rowHeight = Math.max(8, nameLines.length * 4.3 + 3);

    ensureSpace(rowHeight + 1);

    doc.setDrawColor(225);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, itemWidth, rowHeight);
    doc.rect(margin + itemWidth, y, qtyWidth, rowHeight);

    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(nameLines, margin + 2, y + 4.6);
    doc.text(
      String(item?.quantity ?? "-"),
      margin + itemWidth + qtyWidth / 2,
      y + 4.6,
      { align: "center" },
    );

    y += rowHeight;
  };

  const addOrderTotal = (totalAmount, label = "ORDER TOTAL") => {
    ensureSpace(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(9.3);
    doc.text(label, pageWidth - margin - 48, y + 5, {
      align: "right",
    });
    doc.text(formatMoney(totalAmount), pageWidth - margin, y + 5, {
      align: "right",
    });
    y += 9;
  };

  const addDocumentHeader = () => {
    doc.setTextColor(15, 15, 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("SPIRAL WOOD SERVICES", margin, y);

    doc.setFontSize(11);
    doc.text("ORDER COMPLETION REPORT", margin, y + 7);

    doc.setFillColor(232, 249, 240);
    doc.setDrawColor(120, 210, 165);
    doc.roundedRect(pageWidth - margin - 31, y - 5, 31, 9, 1.5, 1.5, "FD");
    doc.setTextColor(10, 115, 75);
    doc.setFontSize(8.5);
    doc.text("COMPLETED", pageWidth - margin - 15.5, y + 0.8, {
      align: "center",
    });

    y += 13;
    addRule();
  };

  const items = Array.isArray(order.items) ? order.items : [];
  const customItems = Array.isArray(order.custom_request_items)
    ? order.custom_request_items
    : [];
  const tasks = Array.isArray(order.blueprint_tasks)
    ? order.blueprint_tasks
    : [];

  const isCustomOrder =
    normalize(order.order_type) === "blueprint" || customItems.length > 0;

  const explicitFulfillment = normalize(order.fulfillment_method);
  const hasDeliveryRecord = Boolean(
    order.delivery ||
      String(order.delivery_address || "").trim() ||
      String(order.requested_delivery_date || "").trim(),
  );

  const fulfillmentMethod =
    explicitFulfillment === "pickup" || normalize(order.payment_method) === "cop"
      ? "Pickup"
      : explicitFulfillment === "delivery" || hasDeliveryRecord
        ? "Delivery"
        : "Pickup";

  const deliveryAddress =
    order.delivery?.address || order.delivery_address || "";

  const scheduledDate =
    order.delivery?.scheduled_date || order.requested_delivery_date || null;

  const deliveredDate = order.delivery?.delivered_date || null;

  const totalAmount = Number(order.total_amount || order.total || 0);
  const verifiedPaymentTotal = Number(order.payment_verified_total || 0);
  const paymentBalance = Number(order.payment_balance || 0);
  const paymentStatus = titleCase(
    order.payment_status_display || order.payment_status || "unpaid",
  );

  const completedTasks = tasks.filter(
    (task) => normalize(task?.status) === "completed",
  );
  const completedTaskCount = completedTasks.length;
  const latestProductionCompletion = completedTasks
    .map((task) => task?.completed_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const productionStatus =
    tasks.length > 0 && completedTaskCount === tasks.length
      ? "All production tasks completed"
      : tasks.length > 0
        ? `${completedTaskCount} of ${tasks.length} production tasks completed`
        : "No production task packet recorded";

  addDocumentHeader();

  addSectionTitle("Order Information");
  addField("Order Number", order.order_number || `#${order.id || "-"}`);
  addField("Order Type", isCustomOrder ? "Custom Furniture" : "Ready-Made");
  addField("Channel", titleCase(order.channel || order.type));
  addField("Date Placed", formatDateTime(order.created_at));
  addField("Fulfillment", fulfillmentMethod);
  addField("Status", "Completed");

  addSectionTitle("Customer");
  addField("Name", order.customer_name);
  addField("Email", order.customer_email);
  addField("Phone", order.customer_phone);
  if (fulfillmentMethod === "Delivery") {
    addField(
      "Delivery Address",
      deliveryAddress || order.customer_address || "-",
    );
  } else if (order.customer_address) {
    addField("Address", order.customer_address);
  }

  if (items.length > 0) {
    addSectionTitle("Order Items");

    if (isCustomOrder) {
      addCustomItemTableHeader();
      items.forEach(addCustomItemRow);
      addOrderTotal(totalAmount, "PROJECT TOTAL");
    } else {
      addStandardItemTableHeader();
      items.forEach(addStandardItemRow);
      addOrderTotal(totalAmount);
    }
  }

  if (isCustomOrder && customItems.length > 0) {
    addSectionTitle("Custom Furniture Details");

    customItems.forEach((item, index) => {
      const dimensions = getCustomDimensions(item);
      const unit = item?.requested_unit || "mm";
      const dimensionText =
        dimensions.width || dimensions.height || dimensions.depth
          ? `W ${dimensions.width || 0} x H ${dimensions.height || 0} x D ${dimensions.depth || 0} ${unit}`
          : "-";

      if (customItems.length > 1) {
        addField(
          `Item ${index + 1}`,
          item?.display_name || item?.product_name || "Custom Furniture",
        );
      } else {
        addField(
          "Item",
          item?.display_name || item?.product_name || "Custom Furniture",
        );
      }

      addField("Dimensions", dimensionText);
      addField("Wood Type", titleCase(item?.requested_wood_type));
      addField("Finish", titleCase(item?.requested_finish_color));
      addField(
        "Assembly",
        normalize(item?.requested_assembly_choice) === "included"
          ? "Included (Free)"
          : normalize(item?.requested_assembly_choice) === "none"
            ? "Not Requested"
            : titleCase(item?.requested_assembly_choice),
      );

      if (index < customItems.length - 1) {
        ensureSpace(5);
        doc.setDrawColor(230);
        doc.line(margin + 8, y, pageWidth - margin - 8, y);
        y += 4;
      }
    });
  }

  addSectionTitle("Payment Summary");
  addField("Order Total", formatMoney(totalAmount));
  addField("Verified Payments", formatMoney(verifiedPaymentTotal));
  addField("Remaining Balance", formatMoney(paymentBalance));
  addField("Payment Status", paymentStatus);

  // Keep Fulfillment and Production together when the remaining space
  // would otherwise create a nearly-empty trailing page.
  if (isCustomOrder || tasks.length > 0) {
    ensureSpace(fulfillmentMethod === "Delivery" ? 66 : 48);
  }

  addSectionTitle("Fulfillment");
  addField("Method", fulfillmentMethod);

  if (fulfillmentMethod === "Delivery") {
    addField("Address", deliveryAddress || "-");
    addField("Scheduled", formatDateTime(scheduledDate));
    addField("Delivered", formatDateTime(deliveredDate));
    addField("Delivery Status", titleCase(order.delivery?.status));
    addField(
      "Proof of Delivery",
      order.delivery?.signed_receipt ? "Recorded" : "Not recorded",
    );

    if (order.delivery?.received_by_name) {
      addField("Received By", order.delivery.received_by_name);
    }

    if (order.delivery?.recipient_type) {
      addField("Recipient", titleCase(order.delivery.recipient_type));
    }
  } else {
    addField("Delivery Record", "Not applicable");
  }

  if (isCustomOrder || tasks.length > 0) {
    addSectionTitle("Production");
    addField(
      "Task Progress",
      `${completedTaskCount} of ${tasks.length} production tasks`,
    );
    addField("Production Status", productionStatus);
    addField(
      "Production Completed",
      latestProductionCompletion
        ? formatDateTime(latestProductionCompletion)
        : "-",
    );
  }

  ensureSpace(20);
  y += 2;
  addRule();

  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.text(
    "Order completion summary for customer and company records. This document is not a payment receipt.",
    margin,
    y,
  );
  y += 4.5;
  doc.text(`Report generated: ${formatDateTime(new Date())}`, margin, y);

  const totalPages = doc.getNumberOfPages();

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setDrawColor(225);
    doc.line(
      margin,
      pageHeight - 11,
      pageWidth - margin,
      pageHeight - 11,
    );
    doc.setTextColor(110, 110, 110);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(
      `Order ${order.order_number || order.id || "-"} | Page ${pageNumber} of ${totalPages}`,
      margin,
      pageHeight - 6,
    );
  }

  const filenameOrder = sanitizeFilenamePart(
    order.order_number || `ORDER_${order.id || ""}`,
  );

  doc.save(`Order_Completion_${filenameOrder}.pdf`);
}
