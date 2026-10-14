/*
 * WISDOM Order Completion PDF pagination integrity (no DB, no browser, no real PDF writes).
 * Runs the actual frontend generator against a geometry-aware jsPDF stand-in.
 * The stand-in does not replace opening and inspecting an exported PDF in the UI.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "../../..");
const sourcePath = path.join(repoRoot, "admin/frontend/src/pages/orders/OrderCompletionReport.jsx");
const source = fs.readFileSync(sourcePath, "utf8");

assert.match(source, /const\s+footerReserve\s*=\s*11\s*;/);
assert.match(source, /const\s+rowHeight\s*=\s*Math\.max\(5\.1,\s*valueLines\.length\s*\*\s*4\.1\s*\+\s*0\.8\)/);
assert.match(source, /const\s+addSectionTitle\s*=\s*\(title\)\s*=>\s*\{[\s\S]*?y\s*\+=\s*9\.5\s*;/);

let savedDocument;
class PdfGeometrySpy {
  constructor() {
    this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    this.page = 1;
    this.pages = 1;
    this.entries = [];
    savedDocument = this;
  }
  setDrawColor() { return this; }
  setLineWidth() { return this; }
  line() { return this; }
  setFillColor() { return this; }
  rect() { return this; }
  roundedRect() { return this; }
  setTextColor() { return this; }
  setFont() { return this; }
  setFontSize() { return this; }
  splitTextToSize(value, availableMm) {
    const s = String(value);
    const widthPerCharacterMm = 1.15;
    const maxChars = Math.max(1, Math.floor(availableMm / widthPerCharacterMm));
    if (s.length <= maxChars) return [s];
    const chunks = [];
    let remaining = s;
    while (remaining.length) {
      if (remaining.length <= maxChars) { chunks.push(remaining); break; }
      const split = remaining.lastIndexOf(" ", maxChars);
      const take = split > Math.floor(maxChars / 2) ? split : maxChars;
      chunks.push(remaining.slice(0, take));
      remaining = remaining.slice(take).trimStart();
    }
    return chunks;
  }
  text(value, x, y) {
    const texts = Array.isArray(value) ? value : [value];
    texts.forEach((line, index) => {
      this.entries.push({ page: this.page, content: String(line), x, y: y + index * 4.1 });
    });
    return this;
  }
  addPage() { this.pages += 1; this.page = this.pages; return this; }
  setPage(page) { assert(page >= 1 && page <= this.pages); this.page = page; return this; }
  getNumberOfPages() { return this.pages; }
  save(filename) { this.filename = filename; return this; }
}

const executable = source
  .replace(/^import\s+\{\s*jsPDF\s*\}\s+from\s+["']jspdf["'];?\s*/m, "")
  .replace(/export\s+function\s+exportOrderCompletionReportPdf\s*\(/, "function exportOrderCompletionReportPdf(");
assert.notEqual(executable, source, "generator imports/exports must be recognized");
const context = { jsPDF: PdfGeometrySpy, Date, Intl, Number, Math, String, Array, Boolean, Error };
vm.runInNewContext(executable + "\nthis.renderCompletion = exportOrderCompletionReportPdf;", context, { filename: sourcePath });

function fixture() {
  const deliveryAddress = "Ramcar Subdivision Phase 2, Saog, Marilao, Bulacan, Central Luzon, 3019, Philippines";
  return {
    id: 621, order_number: "SWS-20261014-0001", status: "completed",
    order_type: "blueprint", channel: "online", created_at: "2026-10-13T23:56:00.000Z",
    customer_name: "Jericho Flores", customer_email: "test-customer@example.test", customer_phone: "09000000000",
    delivery_address: deliveryAddress, fulfillment_method: "delivery", payment_method: "cash",
    total: 60928, payment_verified_total: 60928, payment_balance: 0, payment_status: "paid",
    items: [{ display_name: "wardobe", quantity: 1 }],
    custom_request_items: [{ display_name: "wardobe", requested_width: 960,
      requested_height: 2400, requested_depth: 720, requested_unit: "mm",
      requested_wood_type: "mixed_wood_types", requested_finish_color: "oak-natural",
      requested_assembly_choice: "included" }],
    blueprint_tasks: ["cutting", "edging", "drilling", "retouching", "packing"].map((name) => ({
      name, status: "completed", completed_at: "2026-10-14T01:33:00.000Z",
    })),
    delivery: { address: deliveryAddress, scheduled_date: "2026-10-14T00:00:00.000Z",
      delivered_date: "2026-10-14T01:35:00.000Z", status: "completed", signed_receipt: "demo-proof" },
  };
}
const closing = "Order completion summary for customer and company records. This document is not a payment receipt.";
function verifyFooter(doc) {
  assert.equal(doc.entries.filter((e) => e.content.includes("Order completion summary")).length, 1);
  assert.equal(doc.entries.filter((e) => e.content.startsWith("Report generated:")).length, 1);
  assert.equal(doc.entries.filter((e) => /^Order SWS-20261014-0001 \| Page/.test(e.content)).length, doc.pages);
  for (const e of doc.entries) {
    if (/^Order SWS-20261014-0001 \| Page/.test(e.content)) continue;
    assert(e.y < 286, `body text overlaps footer line: page=${e.page}, y=${e.y}, text=${e.content}`);
  }
}

context.renderCompletion(fixture());
assert.equal(savedDocument.getNumberOfPages(), 1, "Order #621 fixture should fit on ONE page");
assert(savedDocument.entries.some((e) => e.page === 1 && e.content === closing));
assert(savedDocument.entries.some((e) => e.page === 1 && e.content.includes("Production Completed")));
verifyFooter(savedDocument);
console.log("PASS: Order #621 completion report stays on one A4 page, with closing note and footer.");

const extended = fixture();
extended.items = Array.from({ length: 46 }, (_, i) => ({ display_name: `Custom furniture component ${i + 1}`, quantity: 1 }));
context.renderCompletion(extended);
assert(savedDocument.getNumberOfPages() > 1, "Long documents must still paginate");
const extendedNote = savedDocument.entries.find((e) => e.content === closing);
assert.equal(extendedNote.page, savedDocument.pages, "Closing note belongs on last page");
verifyFooter(savedDocument);
console.log("PASS: Long completion reports still paginate and keep the closing note on the last page.");
console.log("PASS: Mock-only PDF layout regression. No database, API, or browser accessed.");
