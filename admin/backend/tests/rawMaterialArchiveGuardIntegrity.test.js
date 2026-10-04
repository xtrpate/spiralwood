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

const archiveController = sliceBetween(
  inventory,
  "exports.archiveRawMaterial = async (req, res) => {",
  "exports.restoreRawMaterial = async (req, res) => {",
);

assert.match(
  archiveController,
  /parseStrictPositiveInt\(req\.params\.id\)/,
  "Archive must reject malformed IDs instead of partially parsing them.",
);
assert.match(
  archiveController,
  /FROM raw_materials[\s\S]{0,400}FOR UPDATE/,
  "Archive must lock the raw-material row before validating inventory state.",
);
assert.match(
  archiveController,
  /lockActiveBlueprintReservations\([\s\S]{0,120}materialId/,
  "Archive must preserve the active Blueprint reservation guard.",
);
assert.match(
  archiveController,
  /const currentQty = normalizeRawMaterialQuantity\(before\.quantity\)/,
  "Archive must calculate current on-hand quantity from the locked row.",
);
assert.match(
  archiveController,
  /Math\.abs\(currentQty\) > 0\.0000001/,
  "Archive must require exact zero on-hand stock.",
);
assert.match(
  archiveController,
  /Reduce stock to zero through Stock Movement before archiving it\./,
  "Archive response must direct stock reconciliation through Stock Movement.",
);
assert.match(archiveController, /current_quantity: currentQty/);
assert.match(archiveController, /unit: before\.unit \|\| null/);
assert.match(
  archiveController,
  /Raw material could not be archived\./,
  "Unexpected archive failures must use a safe client message.",
);
assert.doesNotMatch(
  archiveController,
  /json\(\{\s*message:\s*err\.message\s*\}\)/,
  "Archive must not expose raw backend error messages to the client.",
);

assert.match(
  routes,
  /"\/inventory\/raw\/:id\/archive"[\s\S]{0,260}requirePermission\("raw_materials\.manage"\)[\s\S]{0,260}logAction\("archive_raw_material", "raw_materials"\)[\s\S]{0,260}inventory\.archiveRawMaterial/,
  "Archive route must retain permission and audit middleware.",
);

const frontendArchiveHandler = sliceBetween(
  rawMaterialsPage,
  "const handleArchive = (item) => {",
  "const handleRestore = async (item) => {",
);

assert.match(
  frontendArchiveHandler,
  /const onHandQuantity = Number\(item\.on_hand_quantity \?\? item\.quantity\)/,
);

const reservationGuardIndex = frontendArchiveHandler.indexOf(
  "if (reservedQuantity > 0 || pendingNeedQuantity > 0)",
);
const invalidStockGuardIndex = frontendArchiveHandler.indexOf(
  "if (!Number.isFinite(onHandQuantity))",
);
const nonZeroStockGuardIndex = frontendArchiveHandler.indexOf(
  "if (Math.abs(onHandQuantity) > 0.0000001)",
);
const openConfirmationIndex = frontendArchiveHandler.indexOf(
  'setConfirmAction({ type: "archive", item });',
);

assert.ok(
  reservationGuardIndex >= 0,
  "Frontend must keep the active reservation/pending-stock guard.",
);
assert.ok(
  invalidStockGuardIndex >= 0,
  "Frontend must block archive when current on-hand stock cannot be verified.",
);
assert.ok(
  nonZeroStockGuardIndex >= 0,
  "Frontend must block archive when on-hand stock is not zero.",
);
assert.ok(
  openConfirmationIndex >= 0,
  "Frontend must retain the Archive confirmation flow.",
);
assert.ok(
  reservationGuardIndex < invalidStockGuardIndex &&
    invalidStockGuardIndex < nonZeroStockGuardIndex &&
    nonZeroStockGuardIndex < openConfirmationIndex,
  "Frontend guards must run before opening Archive confirmation, with reservations checked first.",
);

assert.match(
  frontendArchiveHandler,
  /Reduce stock to zero through Stock Movement before archiving it\./,
);
assert.match(rawMaterialsPage, /const hasOnHandStock =/);
assert.match(rawMaterialsPage, /const archiveBlocked =/);
assert.match(rawMaterialsPage, /disabled=\{archiveBlocked\}/);
assert.match(
  rawMaterialsPage,
  /Reduce on-hand stock to zero through Stock Movement before archiving\./,
);

console.log("PASS: Raw material zero-stock archive guard integrity checks passed.");
