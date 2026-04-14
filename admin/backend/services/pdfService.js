// services/pdfService.js – Generate PDF quotations for Cost Estimations
const PDFDocument = require('pdfkit');
const path        = require('path');
const fs          = require('fs');

/**
 * Generate a PDF quotation from an estimation record.
 * Returns the file path of the generated PDF.
 */
async function generateQuotationPDF(estimation, blueprint, customer) {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(process.env.UPLOAD_DIR || './uploads', 'quotations');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const fileName = `quotation_${estimation.id}_${Date.now()}.pdf`;
    const filePath = path.join(outputDir, fileName);
    const doc      = new PDFDocument({ margin: 50, size: 'A4' });
    const stream   = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // ── Header ─────────────────────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').text('Spiral Wood Services', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('8 Sitio Laot, Prenza 1, Marilao, Bulacan', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').text('PROJECT COST QUOTATION', { align: 'center' });
    doc.moveDown();

    // ── Meta info ───────────────────────────────────────────────────────────
    doc.fontSize(10).font('Helvetica');
    doc.text(`Quotation #: ${estimation.id}`);
    doc.text(`Date: ${new Date().toLocaleDateString('en-PH')}`);
    doc.text(`Blueprint: ${blueprint.title}`);
    if (customer) doc.text(`Client: ${customer.name}  |  ${customer.email}`);
    doc.moveDown();

    // ── Line Items ──────────────────────────────────────────────────────────
    const items = JSON.parse(estimation.line_items || '[]');
    const tableTop = doc.y;
    const col      = { item: 50, qty: 310, unit: 370, sub: 450 };

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Item / Component',  col.item, tableTop);
    doc.text('Qty',               col.qty,  tableTop);
    doc.text('Unit Cost',         col.unit, tableTop);
    doc.text('Subtotal',          col.sub,  tableTop);
    doc.moveTo(50, doc.y + 2).lineTo(550, doc.y + 2).stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9);
    for (const item of items) {
      const y = doc.y;
      doc.text(item.name,                             col.item, y);
      doc.text(String(item.quantity),                 col.qty,  y);
      doc.text(`₱ ${Number(item.unit_cost).toFixed(2)}`,   col.unit, y);
      doc.text(`₱ ${Number(item.subtotal).toFixed(2)}`,    col.sub,  y);
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Totals ──────────────────────────────────────────────────────────────
    const right = 450;
    doc.font('Helvetica').fontSize(10);
    doc.text('Material Cost:',   50,   doc.y);
    doc.text(`₱ ${Number(estimation.material_cost).toFixed(2)}`, right, doc.y - 12, { align: 'right', width: 100 });

    doc.text('Labor Cost:',      50,   doc.y);
    doc.text(`₱ ${Number(estimation.labor_cost).toFixed(2)}`,    right, doc.y - 12, { align: 'right', width: 100 });

    doc.text('Tax:',             50,   doc.y);
    doc.text(`₱ ${Number(estimation.tax || 0).toFixed(2)}`,      right, doc.y - 12, { align: 'right', width: 100 });

    doc.text('Discount:',        50,   doc.y);
    doc.text(`- ₱ ${Number(estimation.discount || 0).toFixed(2)}`, right, doc.y - 12, { align: 'right', width: 100 });

    doc.moveDown(0.3);
    doc.font('Helvetica-Bold');
    doc.text('GRAND TOTAL:',     50,   doc.y);
    doc.text(`₱ ${Number(estimation.grand_total).toFixed(2)}`,   right, doc.y - 12, { align: 'right', width: 100 });

    // ── Notes ───────────────────────────────────────────────────────────────
    if (estimation.notes) {
      doc.moveDown();
      doc.font('Helvetica').fontSize(9).text(`Notes: ${estimation.notes}`);
    }

    // ── Footer / Signature ──────────────────────────────────────────────────
    doc.moveDown(3);
    doc.font('Helvetica').fontSize(9);
    doc.text('________________________________', 50);
    doc.text('Authorized Signature / Owner',    50);

    doc.end();

    stream.on('finish', () => resolve(`/uploads/quotations/${fileName}`));
    stream.on('error', reject);
  });
}

module.exports = { generateQuotationPDF };
