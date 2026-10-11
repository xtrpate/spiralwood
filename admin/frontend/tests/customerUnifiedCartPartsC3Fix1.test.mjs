import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCustomerPartSchedule } from "../src/pages/customer/customerPartSchedule.mjs";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const cart = fs.readFileSync(path.join(thisDir, "../src/pages/customer/cartpage.jsx"), "utf8");
const dialog = fs.readFileSync(path.join(thisDir, "../src/pages/customer/CartPartScheduleDialog.jsx"), "utf8");

test("C3-FIX1: unified /cart imports the existing C3 schedule rather than duplicating calculations", () => {
  assert.match(cart, /import \{ buildCustomerPartSchedule \} from "\.\/customerPartSchedule\.mjs"/);
  assert.match(cart, /import CartPartScheduleDialog from "\.\/CartPartScheduleDialog"/);
  assert.match(cart, /const partRows = blueprint && liveBlueprintPreview/);
  assert.match(cart, /buildCustomerPartSchedule\(liveBlueprintPreview\.components, item\.quantity\)/);
  assert.match(cart, /View Parts \(\{partRows\.length\}\)/);
  assert.match(cart, /setPartsModalKey\(item\.key\)/);
  assert.match(cart, /<CartPartScheduleDialog/);
});

test("C3-FIX1: parts schedule uses saved component data with exact order multiplier", () => {
  const parts = [
    { id: "left", partCode: "SIDE-L", type: "panel", label: "Left Side", width: 18, height: 876, depth: 620, material: "Marine Plywood", qty: 1 },
    { id: "shelf", partCode: "SHELF", type: "wr_shelf", label: "Shelf", width: 860, height: 20, depth: 578, material: "Marine Plywood", qty: 4 },
    { id: "proxy", type: "reference_proxy", width: 20, height: 20, depth: 20, qty: 50 },
  ];
  const rows = buildCustomerPartSchedule(parts, 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].quantityPerUnit, 1);
  assert.equal(rows[0].totalQuantity, 2);
  assert.equal(rows[1].quantityPerUnit, 4);
  assert.equal(rows[1].totalQuantity, 8);
  assert.equal(rows[1].material, "Marine Plywood");
  assert.equal(rows[1].width, 860);
});

test("C3-FIX1: read-only dialog shows the full schedule; ready-made checkout remains separate", () => {
  for (const label of ["Qty / Unit", "Total Qty", "Width", "Height", "Depth", "Thickness", "Material", "Requested Wood"]) {
    assert.ok(dialog.includes(label), `Missing ${label}`);
  }
  assert.match(dialog, /aria-label="Parts and Measurements"/);
  assert.match(dialog, /aria-label="Close parts"/);
  assert.match(dialog, /if \(!item\) return null/);
  assert.match(cart, /\{blueprint\s*\?/);
  assert.match(cart, /Price to be quoted/);
  assert.match(cart, /navigate\("\/custom-checkout"\)/);
  assert.match(cart, /navigate\("\/checkout"\)/);
});
