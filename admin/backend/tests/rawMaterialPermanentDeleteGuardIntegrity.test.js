"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend/src");

const readBackend = (relPath) =>
  fs.readFileSync(path.join(backendRoot, relPath), "utf8");
const readFrontend = (relPath) =>
  fs.readFileSync(path.join(frontendRoot, relPath), "utf8");

const inventory = readBackend("controllers/admin/inventoryController.js");
const routes = readBackend("routes/admin.js");
const rawMaterialsPage = readFrontend("pages/inventory/RawMaterialsPage.jsx");

const sliceBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
};

const deleteController = sliceBetween(
  inventory,
  "exports.deleteRawMaterial = async (req, res) => {",
  "// ═══════════════════════════════════════════════════════════\n// STOCK MOVEMENTS",
);

assert.match(
  deleteController,
  /parseStrictPositiveInt\(req\.params\.id\)/,
  "Permanent delete must reject malformed IDs instead of partially parsing them.",
);
assert.match(
  deleteController,
  /pool\.getConnection\(\)/,
  "Permanent delete must use a dedicated connection.",
);
assert.match(
  deleteController,
  /beginTransaction\(\)/,
  "Permanent delete must run validation and deletion in one transaction.",
);
assert.match(
  deleteController,
  /FROM raw_materials[\s\S]{0,450}FOR UPDATE/,
  "Permanent delete must lock the raw-material row before validating destructive state.",
);
assert.match(
  deleteController,
  /getRawMaterialReferenceCounts\(conn, materialId\)/,
  "Permanent delete must check historical references on the same transaction connection.",
);
assert.match(
  deleteController,
  /const currentQty = Number\(before\.quantity\)/,
  "Permanent delete must read current on-hand quantity from the locked row.",
);
assert.match(
  deleteController,
  /before\.quantity === null[\s\S]{0,220}!Number\.isFinite\(currentQty\)[\s\S]{0,220}Math\.abs\(currentQty\) > 0\.0000001/,
  "Permanent delete must fail closed for unknown stock and require exact zero on-hand stock.",
);
assert.match(
  deleteController,
  /Reconcile the stock through Stock Movement, then archive the material to preserve its inventory history\./,
  "Non-zero stock guidance must preserve inventory history instead of encouraging delete-after-adjustment.",
);
assert.match(
  deleteController,
  /current_quantity: Number\.isFinite\(currentQty\) \? currentQty : null/,
  "Permanent delete must not echo an unverifiable stock value as a real quantity.",
);
assert.match(deleteController, /unit: before\.unit \|\| null/);
assert.match(
  deleteController,
  /DELETE FROM raw_materials WHERE id = \?/,
  "Permanent delete SQL must remain scoped to the validated material ID.",
);
assert.match(
  deleteController,
  /await conn\.commit\(\)/,
  "Successful permanent delete must commit the transaction.",
);
assert.match(
  deleteController,
  /ER_ROW_IS_REFERENCED_2/,
  "Database FK conflicts must remain a safe 409 fallback.",
);
assert.match(
  deleteController,
  /Raw material could not be permanently deleted\./,
  "Unexpected permanent-delete failures must use a safe client message.",
);
assert.doesNotMatch(
  deleteController,
  /json\(\{\s*message:\s*err\.message\s*\}\)/,
  "Permanent delete must not expose raw backend error messages to the client.",
);
assert.match(
  deleteController,
  /finally\s*\{[\s\S]{0,160}conn\?\.release\(\)/,
  "Permanent delete must release its database connection.",
);

const referenceCheckIndex = deleteController.indexOf(
  "const references = await getRawMaterialReferenceCounts(conn, materialId);",
);
const stockCheckIndex = deleteController.indexOf(
  "const currentQty = Number(before.quantity);",
);
const deleteSqlIndex = deleteController.indexOf(
  '"DELETE FROM raw_materials WHERE id = ?"',
);
assert.ok(referenceCheckIndex >= 0, "Missing permanent-delete reference check.");
assert.ok(stockCheckIndex >= 0, "Missing permanent-delete stock check.");
assert.ok(deleteSqlIndex >= 0, "Missing permanent-delete SQL.");
assert.ok(
  referenceCheckIndex < stockCheckIndex && stockCheckIndex < deleteSqlIndex,
  "Permanent delete must check history first, then stock, before DELETE.",
);

assert.match(
  routes,
  /"\/inventory\/raw\/:id"[\s\S]{0,260}requirePermission\("raw_materials\.delete"\)[\s\S]{0,260}logAction\("delete_raw_material", "raw_materials"\)[\s\S]{0,260}inventory\.deleteRawMaterial/,
  "Permanent-delete route must retain permission and audit middleware.",
);

const frontendDeleteHandler = sliceBetween(
  rawMaterialsPage,
  "const handleDelete = (item) => {",
  "const confirmMaterialAction = async () => {",
);

assert.match(
  frontendDeleteHandler,
  /const hasReferences = Number\(item\.has_references\) === 1/,
  "Frontend delete handler must re-check linked/history state before confirmation.",
);
assert.match(
  frontendDeleteHandler,
  /const onHandQuantity = Number\(item\.on_hand_quantity \?\? item\.quantity\)/,
);
const frontendReferenceGuardIndex = frontendDeleteHandler.indexOf(
  "if (hasReferences || reservedQuantity > 0 || pendingNeedQuantity > 0)",
);
const frontendInvalidStockGuardIndex = frontendDeleteHandler.indexOf(
  "if (!Number.isFinite(onHandQuantity))",
);
const frontendNonZeroStockGuardIndex = frontendDeleteHandler.indexOf(
  "if (Math.abs(onHandQuantity) > 0.0000001)",
);
const frontendOpenConfirmationIndex = frontendDeleteHandler.indexOf(
  'setConfirmAction({ type: "delete", item });',
);
assert.ok(frontendReferenceGuardIndex >= 0, "Missing frontend history guard.");
assert.ok(frontendInvalidStockGuardIndex >= 0, "Missing frontend unknown-stock guard.");
assert.ok(frontendNonZeroStockGuardIndex >= 0, "Missing frontend non-zero-stock guard.");
assert.ok(frontendOpenConfirmationIndex >= 0, "Missing Delete confirmation flow.");
assert.ok(
  frontendReferenceGuardIndex < frontendInvalidStockGuardIndex &&
    frontendInvalidStockGuardIndex < frontendNonZeroStockGuardIndex &&
    frontendNonZeroStockGuardIndex < frontendOpenConfirmationIndex,
  "Frontend destructive guards must run before opening Delete confirmation.",
);
assert.match(
  frontendDeleteHandler,
  /Reconcile stock through Stock Movement, then archive it to preserve inventory history\./,
);

assert.match(rawMaterialsPage, /const deleteBlocked =/);
assert.match(rawMaterialsPage, /disabled=\{deleteBlocked\}/);
assert.match(
  rawMaterialsPage,
  /Reconcile on-hand stock through Stock Movement, then archive this material\./,
  "Delete tooltip must explain the safe lifecycle for non-zero stock.",
);
assert.match(
  rawMaterialsPage,
  /unused material with zero on-hand stock and no linked or historical records/,
  "Permanent-delete confirmation must state the zero-stock/no-history rule.",
);

console.log(
  "PASS: Raw material permanent-delete zero-stock guard integrity checks passed.",
);
