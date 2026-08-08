// export/explodedPartsSchedule.js
// Exploded View balloon -> production parts schedule.
// Read-only export helper. No geometry, pricing, inventory, backend, or DB mutation.

import { resolveProductionPartCode } from "../data/componentUtils";
import {
  GRAIN_DIRECTION_OPTIONS,
  normalizeProductionMetadata,
} from "../data/productionMetadata";
import { escapeHtml, formatDims, getNowStamp } from "../data/utils";
import { resolveExportProjectTitle } from "./exportSheetUtils";

const EXPLODED_PARTS_SHEET_CODE = "A-106B";
const PARTS_PER_PAGE = 15;

const GRAIN_LABELS = Object.fromEntries(
  GRAIN_DIRECTION_OPTIONS.map((item) => [
    item.value,
    item.value === "none" ? "No Grain" : item.label,
  ]),
);

const cleanText = (value = "") =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

function buildExplodedPartScheduleRows(components = []) {
  return (Array.isArray(components) ? components : [])
    .filter(Boolean)
    .map((component, index) => {
      const production = normalizeProductionMetadata(component);

      return {
        itemNo: index + 1,
        partCode: resolveProductionPartCode(component) || `P${index + 1}`,
        partName: cleanText(component.label) || "Component",
        qty: Math.max(1, Number(component.qty) || 1),
        cutSize: formatDims(
          Number(component.width) || 0,
          Number(component.height) || 0,
          Number(component.depth) || 0,
          "mm",
        ),
        material: cleanText(component.material) || "Material not set",
        grain:
          GRAIN_LABELS[production.grainDirection] ||
          cleanText(production.grainDirection) ||
          "No Grain",
      };
    });
}

function chunkRows(rows = [], chunkSize = PARTS_PER_PAGE) {
  const result = [];
  const size = Math.max(1, Number(chunkSize) || PARTS_PER_PAGE);

  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }

  return result.length ? result : [[]];
}

function buildExplodedPartsSchedulePages({
  selectedComponents = [],
  selectedLabel = "",
  selectedDimsText = "",
  selectedMaterialText = "",
  blueprintTitle = "",
} = {}) {
  const rows = buildExplodedPartScheduleRows(selectedComponents);
  if (!rows.length) return [];

  const pages = chunkRows(rows);
  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
  const materialTypes = new Set(
    rows
      .map((row) => row.material.toLowerCase())
      .filter((value) => value && value !== "material not set"),
  ).size;

  const resolvedProjectTitle = resolveExportProjectTitle({
    blueprintTitle,
    objectLabel: selectedLabel,
    selectedComponents,
  });

  return pages.map((pageRows, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const sheetLabel =
      pages.length > 1
        ? `${EXPLODED_PARTS_SHEET_CODE}.${pageNumber}`
        : EXPLODED_PARTS_SHEET_CODE;

    const tableRows = pageRows
      .map(
        (row) => `
          <tr>
            <td style="text-align:center;font-weight:700;">${row.itemNo}</td>
            <td><b>${escapeHtml(row.partCode)}</b></td>
            <td>${escapeHtml(row.partName)}</td>
            <td style="text-align:center;">${row.qty}</td>
            <td>${escapeHtml(row.cutSize)}</td>
            <td>${escapeHtml(row.material)}</td>
            <td>${escapeHtml(row.grain)}</td>
          </tr>
        `,
      )
      .join("");

    return `
      <div class="page">
        <div class="page-inner">
          <div class="sheet-header">
            <div>
              <div class="sheet-title">TECHNICAL BLUEPRINT — EXPLODED PARTS SCHEDULE</div>
              <div class="sheet-subtitle">${escapeHtml(
                selectedLabel || "Production Parts",
              )}</div>
            </div>
            <div class="sheet-meta">
              <div><b>Status:</b> FOR REVIEW</div>
              <div><b>Production Unit:</b> MM</div>
              <div><b>Sheet:</b> ${escapeHtml(sheetLabel)}</div>
              <div><b>Page:</b> ${pageNumber} / ${pages.length}</div>
              <div><b>Date:</b> ${escapeHtml(getNowStamp())}</div>
            </div>
          </div>

          <div class="info-grid">
            <div><b>Project:</b> ${escapeHtml(
              resolvedProjectTitle || "Blueprint Design",
            )}</div>
            <div><b>Object:</b> ${escapeHtml(
              selectedLabel || "Production Parts",
            )}</div>
            <div><b>Overall Dimensions:</b> ${escapeHtml(
              selectedDimsText || "—",
            )}</div>
            <div><b>Material / Finish:</b> ${escapeHtml(
              selectedMaterialText || "—",
            )}</div>
          </div>

          <div class="summary-strip">
            <div class="summary-card">
              <span class="summary-label">Production Parts</span>
              <strong>${rows.length}</strong>
            </div>
            <div class="summary-card">
              <span class="summary-label">Total Qty</span>
              <strong>${totalQty}</strong>
            </div>
            <div class="summary-card">
              <span class="summary-label">Material Types</span>
              <strong>${materialTypes}</strong>
            </div>
          </div>

          <div class="drawing-note">
            <b>EXPLODED VIEW REFERENCE</b>
            <span>Item No. matches the numbered balloon on Exploded View sheet A-106.</span>
            <span>Part Code is the stable production identity. Written cut sizes control; do not scale the drawing.</span>
          </div>

          <h3 class="section-head">Parts Schedule</h3>

          <table class="bp-table">
            <colgroup>
              <col style="width:7%;" />
              <col style="width:13%;" />
              <col style="width:20%;" />
              <col style="width:7%;" />
              <col style="width:18%;" />
              <col style="width:18%;" />
              <col style="width:17%;" />
            </colgroup>
            <thead>
              <tr>
                <th>Item No.</th>
                <th>Part Code</th>
                <th>Part Name</th>
                <th>Qty</th>
                <th>Cut Size</th>
                <th>Material</th>
                <th>Grain</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="drawing-note" style="margin-top:8px;">
            <b>PRODUCTION NOTE</b>
            <span>This schedule is generated from the same saved Blueprint component order used by the exploded-view balloons.</span>
            <span>Inventory selection remains manual in Project Estimate; this sheet does not reserve or deduct stock.</span>
          </div>
        </div>
      </div>
    `;
  });
}

export {
  EXPLODED_PARTS_SHEET_CODE,
  buildExplodedPartScheduleRows,
  buildExplodedPartsSchedulePages,
};