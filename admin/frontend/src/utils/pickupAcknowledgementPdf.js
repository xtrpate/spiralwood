import jsPDF from "jspdf";

const normalize = (value) => String(value || "").trim().toLowerCase();

const formatDateTime = (value) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const recipientTypeLabel = (value) =>
  normalize(value) === "authorized_representative"
    ? "Authorized Representative"
    : "Customer";

const getFurnitureLabel = (order = {}) => {
  if (order.blueprint_title) return order.blueprint_title;
  const customItems = Array.isArray(order.custom_request_items)
    ? order.custom_request_items
    : [];
  if (customItems.length) {
    return customItems[0]?.display_name || customItems[0]?.product_name || "Custom Furniture";
  }
  const items = Array.isArray(order.items) ? order.items : [];
  return items[0]?.display_name || items[0]?.product_name || "Custom Furniture";
};

export function downloadPickupAcknowledgementPdf({ acknowledgement = {}, order = {} } = {}) {
  if (!acknowledgement?.id || !acknowledgement?.signature_data) {
    throw new Error("Pickup acknowledgement is incomplete.");
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const acknowledgementNumber = "PUA-" + String(acknowledgement.id).padStart(5, "0");
  const orderNumber = order.order_number || ("Order #" + (order.id || acknowledgement.order_id));
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(35, 35, 35);
  doc.text("SPIRAL WOOD SERVICES", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(acknowledgementNumber, pageWidth - margin, y, { align: "right" });
  y += 9;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(20, 20, 20);
  doc.text("Pickup Acknowledgement", margin, y);
  y += 7;
  doc.setDrawColor(210, 210, 210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  const field = (label, value) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(105, 105, 105);
    doc.text(label, margin, y);
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(String(value || "—"), contentWidth);
    doc.text(lines, margin, y);
    y += Math.max(1, lines.length) * 4.2 + 4;
  };

  field("Order", orderNumber);
  field("Furniture", getFurnitureLabel(order));
  field("Received By", acknowledgement.received_by_name || "Recipient");
  field("Recipient Type", recipientTypeLabel(acknowledgement.recipient_type));
  field("Pickup Date and Time", formatDateTime(acknowledgement.acknowledged_at));
  field("Released By", acknowledgement.released_by_name || "Spiral Wood Services");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  doc.text("Acknowledgement", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(55, 55, 55);
  const statement = doc.splitTextToSize(
    acknowledgement.acknowledgement_text ||
      "I confirm that I received the furniture listed for this order from Spiral Wood Services.",
    contentWidth,
  );
  doc.text(statement, margin, y);
  y += statement.length * 4.3 + 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  doc.text("Recipient Signature", margin, y);
  y += 5;
  doc.setDrawColor(215, 215, 215);
  doc.rect(margin, y, 82, 30);
  doc.addImage(acknowledgement.signature_data, "PNG", margin + 2, y + 2, 78, 26);
  y += 36;

  if (String(acknowledgement.note || "").trim()) {
    field("Pickup Note", acknowledgement.note);
  }

  y += 2;
  doc.setDrawColor(225, 225, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(105, 105, 105);
  const footer = doc.splitTextToSize(
    "This document records the physical handoff of the furniture and the recipient acknowledgement captured through WISDOM.",
    contentWidth,
  );
  doc.text(footer, margin, y);

  const safeOrder = String(orderNumber).replace(/[^a-zA-Z0-9_-]+/g, "_");
  doc.save("pickup_acknowledgement_" + safeOrder + ".pdf");
}
