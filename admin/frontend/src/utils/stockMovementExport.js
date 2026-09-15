// WISDOM STOCK MOVEMENT EXPORT E1 V1
import * as XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import * as DOCX from "docx";

const {
  AlignmentType,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = DOCX;

export const STOCK_MOVEMENT_EXPORT_FORMATS = {
  pdf: {
    label: "PDF",
    extension: ".pdf",
    description: "Print-ready formal report",
  },
  xlsx: {
    label: "Excel",
    extension: ".xlsx",
    description: "Editable formatted spreadsheet",
  },
  csv: {
    label: "CSV",
    extension: ".csv",
    description: "Raw data for Excel, WPS, or Google Sheets",
  },
  docx: {
    label: "Word",
    extension: ".docx",
    description: "Editable document report",
  },
};

const REPORT_COLUMNS = [
  { key: "date", label: "Date & Time", width: 24 },
  { key: "movement", label: "Movement", width: 15 },
  { key: "source", label: "Source", width: 22 },
  { key: "item", label: "Item", width: 34 },
  { key: "specification", label: "Specification", width: 30 },
  { key: "quantity", label: "Quantity", width: 16 },
  { key: "order", label: "Order", width: 20 },
  { key: "reference", label: "Reference", width: 20 },
  { key: "notes", label: "Notes", width: 34 },
  { key: "recordedBy", label: "Recorded By", width: 22 },
];

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const asText = (value) => String(value ?? "").trim();

const excelSafeText = (value) => {
  const text = String(value ?? "");
  return text.length > 32000 ? `${text.slice(0, 31997)}...` : text;
};

const csvSafeText = (value) => {
  const text = excelSafeText(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) return `'${text}`;
  return text;
};

const pdfSafeText = (value) =>
  String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/×/g, "x")
    .replace(/•/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const fileBaseName = (dateKey) =>
  `Stock-Movements-Report-${String(dateKey || "export")
    .trim()
    .replace(/[^0-9A-Za-z_-]+/g, "-")}`;

const saveBlob = async ({ blob, fileName }) => {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

const metadataRows = (meta, titleCell, valueCell) => {
  const rows = [
    [titleCell("SPIRAL WOOD SERVICES - STOCK MOVEMENT HISTORY REPORT")],
    [titleCell("Scope:"), valueCell(meta.scopeLabel || "Current filters")],
    [titleCell("Records:"), valueCell(Number(meta.recordCount || 0))],
    [titleCell("Generated:"), valueCell(meta.generatedAt || "")],
  ];

  const filters = Array.isArray(meta.filters) ? meta.filters : [];
  filters.forEach(([label, value]) => {
    rows.push([titleCell(`${label}:`), valueCell(value || "All")]);
  });

  return rows;
};

const exportXlsx = async ({ rows, meta }) => {
  const workbook = XLSX.utils.book_new();

  const titleStyle = {
    font: { bold: true, color: { rgb: "111827" } },
  };
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "18181B" } },
    border: {
      top: { style: "thin", color: { rgb: "D1D5DB" } },
      bottom: { style: "thin", color: { rgb: "D1D5DB" } },
      left: { style: "thin", color: { rgb: "D1D5DB" } },
      right: { style: "thin", color: { rgb: "D1D5DB" } },
    },
  };
  const cellStyle = {
    border: {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      left: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "thin", color: { rgb: "E5E7EB" } },
    },
    alignment: { vertical: "top", wrapText: true },
  };

  const title = (value) => ({ v: excelSafeText(value), s: titleStyle });
  const header = (value) => ({ v: excelSafeText(value), s: headerStyle });
  const cell = (value) => ({ v: excelSafeText(value), s: cellStyle });

  const sheetData = [
    ...metadataRows(meta, title, cell),
    [],
    REPORT_COLUMNS.map((column) => header(column.label)),
    ...rows.map((row) =>
      REPORT_COLUMNS.map((column) => cell(row[column.key] ?? "")),
    ),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(sheetData);
  sheet["!cols"] = REPORT_COLUMNS.map((column) => ({ wch: column.width }));
  sheet["!merges"] = [
    {
      s: { r: 0, c: 0 },
      e: { r: 0, c: REPORT_COLUMNS.length - 1 },
    },
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, "Stock Movements");

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  await saveBlob({
    blob: new Blob([buffer], { type: XLSX_MIME }),
    fileName: `${fileBaseName(meta.dateKey)}.xlsx`
  });
};

const exportCsv = async ({ rows, meta }) => {
  const csvRows = [
    REPORT_COLUMNS.map((column) => csvSafeText(column.label)),
    ...rows.map((row) =>
      REPORT_COLUMNS.map((column) => csvSafeText(row[column.key] ?? "")),
    ),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(csvRows);
  const csv = XLSX.utils.sheet_to_csv(sheet, {
    FS: ",",
    RS: "\r\n",
    forceQuotes: true,
  });

  await saveBlob({
    blob: new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    }),
    fileName: `${fileBaseName(meta.dateKey)}.csv`
  });
};

const exportPdf = async ({ rows, meta }) => {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const margin = 8;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text("SPIRAL WOOD SERVICES", margin, 11);

  doc.setFontSize(10);
  doc.text("STOCK MOVEMENT HISTORY REPORT", margin, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);

  let metaY = 22;
  const metadata = [
    ["Scope", meta.scopeLabel || "Current filters"],
    ["Records", String(Number(meta.recordCount || 0))],
    ["Generated", meta.generatedAt || ""],
    ...(Array.isArray(meta.filters) ? meta.filters : []),
  ];

  metadata.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + column * ((pageWidth - margin * 2) / 3);
    const y = metaY + row * 4;
    doc.text(
      `${pdfSafeText(label)}: ${pdfSafeText(value || "All")}`,
      x,
      y,
      { maxWidth: (pageWidth - margin * 2) / 3 - 4 },
    );
  });

  const metadataLines = Math.max(1, Math.ceil(metadata.length / 3));
  const startY = metaY + metadataLines * 4 + 3;

  autoTable(doc, {
    startY,
    head: [REPORT_COLUMNS.map((column) => column.label)],
    body: rows.map((row) =>
      REPORT_COLUMNS.map((column) => pdfSafeText(row[column.key] ?? "")),
    ),
    theme: "grid",
    margin: { left: margin, right: margin, bottom: 12 },
    styles: {
      font: "helvetica",
      fontSize: 5.8,
      cellPadding: 1.2,
      overflow: "linebreak",
      valign: "top",
      textColor: [30, 30, 30],
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 23 },
      1: { cellWidth: 15 },
      2: { cellWidth: 22 },
      3: { cellWidth: 34 },
      4: { cellWidth: 30 },
      5: { cellWidth: 17 },
      6: { cellWidth: 20 },
      7: { cellWidth: 20 },
      8: { cellWidth: 40 },
      9: { cellWidth: 22 },
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `Page ${pageNumber} of ${pageCount}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 5,
      { align: "right" },
    );
  }

  await saveBlob({
    blob: doc.output("blob"),
    fileName: `${fileBaseName(meta.dateKey)}.pdf`
  });
};

const docxText = (value, options = {}) =>
  new TextRun({
    text: asText(value) || "—",
    size: options.size || 14,
    bold: Boolean(options.bold),
    color: options.color,
  });

const docxParagraph = (value, options = {}) =>
  new Paragraph({
    children: [docxText(value, options)],
    alignment: options.alignment,
    spacing: options.spacing,
  });

const exportDocx = async ({ rows, meta }) => {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "SPIRAL WOOD SERVICES",
          bold: true,
          size: 28,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: "STOCK MOVEMENT HISTORY REPORT",
          bold: true,
          size: 20,
        }),
      ],
    }),
    docxParagraph(`Scope: ${meta.scopeLabel || "Current filters"}`, {
      size: 16,
    }),
    docxParagraph(`Records: ${Number(meta.recordCount || 0)}`, { size: 16 }),
    docxParagraph(`Generated: ${meta.generatedAt || ""}`, {
      size: 16,
      spacing: { after: 80 },
    }),
  ];

  (Array.isArray(meta.filters) ? meta.filters : []).forEach(([label, value]) => {
    children.push(docxParagraph(`${label}: ${value || "All"}`, { size: 15 }));
  });

  children.push(
    new Paragraph({
      spacing: { before: 180, after: 100 },
      children: [
        new TextRun({
          text: "Movement History",
          bold: true,
          size: 20,
        }),
      ],
    }),
  );

  const headerRow = new TableRow({
    tableHeader: true,
    children: REPORT_COLUMNS.map(
      (column) =>
        new TableCell({
          shading: { fill: "18181B" },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: column.label,
                  bold: true,
                  color: "FFFFFF",
                  size: 13,
                }),
              ],
            }),
          ],
        }),
    ),
  });

  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: REPORT_COLUMNS.map(
          (column) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: excelSafeText(row[column.key] ?? "") || "—",
                      size: 12,
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
  );

  children.push(
    new Table({
      style: "TableGrid",
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      rows: [headerRow, ...dataRows],
    }),
  );

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: 540,
              right: 360,
              bottom: 540,
              left: 360,
            },
          },
        },
        children,
      },
    ],
  });

  await saveBlob({
    blob: await Packer.toBlob(document),
    fileName: `${fileBaseName(meta.dateKey)}.docx`
  });
};

export async function exportStockMovementReport({ format, rows, meta }) {
  const normalizedFormat = String(format || "").toLowerCase();
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeMeta = {
    ...(meta || {}),
    recordCount: safeRows.length,
  };

  if (!STOCK_MOVEMENT_EXPORT_FORMATS[normalizedFormat]) {
    throw new Error("Unsupported export format.");
  }

  if (normalizedFormat === "xlsx") {
    return exportXlsx({ rows: safeRows, meta: safeMeta });
  }

  if (normalizedFormat === "csv") {
    return exportCsv({ rows: safeRows, meta: safeMeta });
  }

  if (normalizedFormat === "pdf") {
    return exportPdf({ rows: safeRows, meta: safeMeta });
  }

  return exportDocx({ rows: safeRows, meta: safeMeta });
}
