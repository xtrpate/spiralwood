// services/warrantyInventoryService.js
// WISDOM Warranty + Inventory V1.0.0
const pool = require("../config/db");

const RESOLUTION_TYPES = new Set(["repair", "part_replacement", "full_product_replacement"]);
const REPLACEMENT_SOURCES = new Set(["warehouse", "display"]);
const RETURN_DISPOSITIONS = new Set(["not_returned", "for_inspection", "damaged_unusable", "usable_returned"]);
const DECIMAL_QUANTITY_UNITS = new Set(["meter", "kg", "liter", "gallon"]);

const fail = (message, status = 400, details = null) => {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  throw error;
};

const normalizeMaterialUsage = (raw) => {
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw || "[]"); } catch { fail("Material usage is invalid JSON."); }
  }
  if (value == null || value === "") value = [];
  if (!Array.isArray(value)) fail("Material usage must be a list.");
  if (value.length > 100) fail("A warranty resolution can use up to 100 material lines.");

  const seen = new Set();
  return value.map((entry) => {
    const materialId = Number(entry?.material_id);
    const quantity = Number(entry?.quantity);
    if (!Number.isInteger(materialId) || materialId <= 0) fail("One selected raw material is invalid.");
    if (!Number.isFinite(quantity) || quantity <= 0) fail("Material quantity must be greater than 0.");
    if (seen.has(materialId)) fail("The same raw material cannot appear twice.");
    seen.add(materialId);
    return { material_id: materialId, quantity: Math.round(quantity * 100) / 100 };
  });
};

const computeRawStatus = (quantity, reorderPoint, safetyStock) => {
  const qty = Number(quantity) || 0;
  if (qty <= 0) return "out_of_stock";
  if (qty <= (Number(safetyStock) || 0)) return "critical_stock";
  if (qty <= (Number(reorderPoint) || 0)) return "low_stock";
  return "healthy_stock";
};

const computeProductStatus = (quantity, reorderPoint) => {
  const qty = Number(quantity) || 0;
  if (qty <= 0) return "out_of_stock";
  if (qty <= (Number(reorderPoint) || 0)) return "low_stock";
  return "healthy_stock";
};

const getClaimBase = async (db, claimId, forUpdate = false) => {
  const [[row]] = await db.query(
    `SELECT
       w.id, w.order_id, w.order_item_id, w.customer_id, w.product_name,
       w.claim_quantity, w.status, w.replacement_receipt,
       o.order_number, o.order_type,
       oi.product_id, oi.product_name AS order_item_name, oi.quantity AS ordered_quantity,
       p.name AS product_catalog_name, p.type AS product_type, p.stock AS product_total_stock,
       p.reorder_point AS product_reorder_point, p.is_active AS product_is_active,
       COALESCE(ds.quantity, 0) AS display_stock
     FROM warranties w
     LEFT JOIN orders o ON o.id = w.order_id
     LEFT JOIN order_items oi ON oi.id = w.order_item_id AND oi.order_id = w.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN ready_made_display_stock ds ON ds.product_id = p.id
     WHERE w.id = ?
     LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [claimId],
  );
  return row || null;
};

const isReadyMadeClaim = (claim) =>
  Number.isInteger(Number(claim?.product_id)) &&
  String(claim?.product_type || "").toLowerCase() === "standard" &&
  String(claim?.order_type || "").toLowerCase() === "standard";

const listRawMaterials = async (db) => {
  const [rows] = await db.query(
    `SELECT
       rm.id, rm.name, rm.unit, rm.quantity AS on_hand_quantity,
       rm.reorder_point, rm.safety_stock, rm.stock_status,
       COALESCE(r.reserved_quantity, 0) AS reserved_quantity,
       GREATEST(rm.quantity - COALESCE(r.reserved_quantity, 0), 0) AS available_quantity
     FROM raw_materials rm
     LEFT JOIN (
       SELECT material_id, SUM(quantity) AS reserved_quantity
       FROM blueprint_material_reservations
       WHERE status = 'reserved'
       GROUP BY material_id
     ) r ON r.material_id = rm.id
     WHERE rm.is_active = 1
     ORDER BY rm.name ASC, rm.id ASC`,
  );
  return rows.map((row) => ({
    ...row,
    on_hand_quantity: Number(row.on_hand_quantity || 0),
    reserved_quantity: Number(row.reserved_quantity || 0),
    available_quantity: Number(row.available_quantity || 0),
  }));
};

exports.getResolutionOptions = async (claimId) => {
  const id = Number(claimId);
  if (!Number.isInteger(id) || id <= 0) fail("Valid warranty claim ID is required.");
  const claim = await getClaimBase(pool, id, false);
  if (!claim) fail("Warranty claim not found.", 404);
  if (!claim.order_item_id) {
    fail("This legacy claim is not linked to an exact order item and cannot be fulfilled safely.", 409);
  }

  const readyMade = isReadyMadeClaim(claim);
  const totalStock = Number(claim.product_total_stock || 0);
  const displayStock = Number(claim.display_stock || 0);
  const materials = await listRawMaterials(pool);

  return {
    claim: {
      id: Number(claim.id),
      order_id: Number(claim.order_id),
      order_item_id: Number(claim.order_item_id),
      order_number: claim.order_number,
      product_name: claim.order_item_name || claim.product_name,
      claim_quantity: Number(claim.claim_quantity || 1),
      ordered_quantity: Number(claim.ordered_quantity || 0),
      inventory_kind: readyMade ? "ready_made" : "custom",
      product_id: claim.product_id ? Number(claim.product_id) : null,
    },
    ready_made_stock: readyMade ? {
      total_stock: totalStock,
      display_stock: displayStock,
      warehouse_stock: Math.max(totalStock - displayStock, 0),
    } : null,
    materials,
  };
};

const lockMaterialRows = async (conn, usages) => {
  if (!usages.length) return new Map();
  const ids = usages.map((x) => x.material_id).sort((a, b) => a - b);
  const placeholders = ids.map(() => "?").join(",");

  const [materials] = await conn.query(
    `SELECT id, name, unit, quantity, reorder_point, safety_stock, is_active
     FROM raw_materials
     WHERE id IN (${placeholders})
     ORDER BY id ASC
     FOR UPDATE`,
    ids,
  );
  const [reservations] = await conn.query(
    `SELECT material_id, COALESCE(SUM(quantity), 0) AS reserved_quantity
     FROM blueprint_material_reservations
     WHERE material_id IN (${placeholders}) AND status = 'reserved'
     GROUP BY material_id`,
    ids,
  );
  const reserved = new Map(reservations.map((row) => [Number(row.material_id), Number(row.reserved_quantity || 0)]));
  return new Map(materials.map((row) => [Number(row.id), { ...row, reserved_quantity: reserved.get(Number(row.id)) || 0 }]));
};

const applyMaterialUsage = async (conn, { claim, usages, actorId, resolutionType, reference }) => {
  if (!usages.length) return [];
  const materialMap = await lockMaterialRows(conn, usages);
  if (materialMap.size !== usages.length) fail("One selected raw material no longer exists.", 409);

  const movements = [];
  for (const usage of usages) {
    const row = materialMap.get(usage.material_id);
    if (!row || Number(row.is_active) !== 1) fail("One selected raw material is archived or unavailable.", 409);

    const unit = String(row.unit || "").trim().toLowerCase();
    if (!DECIMAL_QUANTITY_UNITS.has(unit) && !Number.isInteger(usage.quantity)) {
      fail(`${row.name} quantity must be a whole number for unit ${row.unit || "unit"}.`);
    }

    const onHand = Number(row.quantity || 0);
    const reserved = Number(row.reserved_quantity || 0);
    const available = Math.max(onHand - reserved, 0);
    if (usage.quantity > available + 1e-9) {
      fail(`Insufficient available stock for ${row.name}. Available after reservations: ${available} ${row.unit || "unit"}.`, 409, {
        material_id: usage.material_id, available, requested: usage.quantity,
      });
    }

    const after = Math.round((onHand - usage.quantity) * 100) / 100;
    const status = computeRawStatus(after, row.reorder_point, row.safety_stock);
    await conn.query(`UPDATE raw_materials SET quantity = ?, stock_status = ? WHERE id = ?`, [after, status, row.id]);

    const [movement] = await conn.query(
      `INSERT INTO stock_movements
         (material_id, product_id, type, quantity, supplier_id, order_id, order_item_id,
          reference, notes, created_by)
       VALUES (?, NULL, 'out', ?, NULL, ?, ?, ?, ?, ?)`,
      [
        row.id, usage.quantity, claim.order_id, claim.order_item_id, reference,
        `Warranty ${resolutionType.replaceAll("_", " ")} material usage for Claim #${claim.id}: ${row.name}`,
        actorId,
      ],
    );
    await conn.query(
      `INSERT INTO warranty_inventory_movements
         (warranty_id, stock_movement_id, movement_role, source_location)
       VALUES (?, ?, 'material_usage', NULL)`,
      [claim.id, movement.insertId],
    );
    movements.push({ stock_movement_id: movement.insertId, material_id: row.id, quantity: usage.quantity });
  }
  return movements;
};

const ensureDisplayRow = async (conn, productId) => {
  await conn.query(
    `INSERT INTO ready_made_display_stock (product_id, quantity)
     VALUES (?, 0)
     ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)`,
    [productId],
  );
};

const applyReadyMadeReplacement = async (conn, { claim, source, disposition, actorId, reference }) => {
  if (!REPLACEMENT_SOURCES.has(source)) fail("Choose Warehouse or Sales / Display as the replacement source.");
  if (!RETURN_DISPOSITIONS.has(disposition)) fail("Choose the returned-item disposition.");
  const productId = Number(claim.product_id);
  await ensureDisplayRow(conn, productId);

  const [[stock]] = await conn.query(
    `SELECT p.id, p.name, p.type, p.stock AS total_stock, p.reorder_point, p.is_active,
            ds.quantity AS display_stock
     FROM products p
     INNER JOIN ready_made_display_stock ds ON ds.product_id = p.id
     WHERE p.id = ?
     LIMIT 1 FOR UPDATE`,
    [productId],
  );
  if (!stock || String(stock.type).toLowerCase() !== "standard" || Number(stock.is_active) !== 1) {
    fail("The exact ready-made replacement product is unavailable or archived.", 409);
  }

  const qty = Number(claim.claim_quantity || 1);
  const totalBefore = Number(stock.total_stock || 0);
  const displayBefore = Number(stock.display_stock || 0);
  const warehouseBefore = totalBefore - displayBefore;
  if (totalBefore < 0 || displayBefore < 0 || warehouseBefore < 0) {
    fail(`${stock.name} has an invalid Warehouse / Display balance. Review inventory first.`, 409);
  }
  const sourceAvailable = source === "warehouse" ? warehouseBefore : displayBefore;
  if (qty > sourceAvailable) {
    fail(`Insufficient ${source === "warehouse" ? "Warehouse" : "Sales / Display"} stock for ${stock.name}. Available: ${sourceAvailable}.`, 409);
  }

  const totalAfterIssue = totalBefore - qty;
  const displayAfterIssue = source === "display" ? displayBefore - qty : displayBefore;
  await conn.query(`UPDATE products SET stock = ?, stock_status = ? WHERE id = ?`, [
    totalAfterIssue, computeProductStatus(totalAfterIssue, stock.reorder_point), productId,
  ]);
  if (source === "display") {
    await conn.query(`UPDATE ready_made_display_stock SET quantity = ? WHERE product_id = ?`, [displayAfterIssue, productId]);
  }

  const [issueMovement] = await conn.query(
    `INSERT INTO stock_movements
       (material_id, product_id, type, quantity, supplier_id, order_id, order_item_id,
        reference, notes, created_by)
     VALUES (NULL, ?, 'out', ?, NULL, ?, ?, ?, ?, ?)`,
    [productId, qty, claim.order_id, claim.order_item_id, reference,
     `Warranty full product replacement issued from ${source === "warehouse" ? "Warehouse" : "Sales / Display"} for Claim #${claim.id}`,
     actorId],
  );
  await conn.query(
    `INSERT INTO warranty_inventory_movements
       (warranty_id, stock_movement_id, movement_role, source_location)
     VALUES (?, ?, 'replacement_issue', ?)`,
    [claim.id, issueMovement.insertId, source],
  );

  let returnMovementId = null;
  if (disposition === "usable_returned") {
    const totalAfterReturn = totalAfterIssue + qty;
    await conn.query(`UPDATE products SET stock = ?, stock_status = ? WHERE id = ?`, [
      totalAfterReturn, computeProductStatus(totalAfterReturn, stock.reorder_point), productId,
    ]);
    const [ret] = await conn.query(
      `INSERT INTO stock_movements
         (material_id, product_id, type, quantity, supplier_id, order_id, order_item_id,
          reference, notes, created_by)
       VALUES (NULL, ?, 'return', ?, NULL, ?, ?, ?, ?, ?)`,
      [productId, qty, claim.order_id, claim.order_item_id, reference,
       `Warranty returned item inspected as usable and returned to Warehouse for Claim #${claim.id}`,
       actorId],
    );
    returnMovementId = ret.insertId;
    await conn.query(
      `INSERT INTO warranty_inventory_movements
         (warranty_id, stock_movement_id, movement_role, source_location)
       VALUES (?, ?, 'returned_usable', 'warehouse')`,
      [claim.id, ret.insertId],
    );
  }

  return { issue_movement_id: issueMovement.insertId, return_movement_id: returnMovementId };
};

exports.fulfillClaimWithInventory = async ({
  claimId,
  actorId,
  receiptPath,
  resolutionType,
  resolutionNotes,
  replacementSource,
  returnDisposition,
  materials,
}) => {
  const id = Number(claimId);
  const userId = Number(actorId);
  if (!Number.isInteger(id) || id <= 0) fail("Valid warranty claim ID is required.");
  if (!Number.isInteger(userId) || userId <= 0) fail("Valid admin user is required.", 401);
  const resolution = String(resolutionType || "").trim().toLowerCase();
  if (!RESOLUTION_TYPES.has(resolution)) fail("Choose a valid warranty resolution.");
  const notes = String(resolutionNotes || "").trim().slice(0, 4000) || null;
  const source = String(replacementSource || "").trim().toLowerCase() || null;
  const disposition = String(returnDisposition || "").trim().toLowerCase() || "not_returned";
  const usages = normalizeMaterialUsage(materials);

  const conn = await pool.getConnection();
  let claim;
  try {
    await conn.beginTransaction();
    claim = await getClaimBase(conn, id, true);
    if (!claim) fail("Warranty claim not found.", 404);
    if (String(claim.status || "").toLowerCase() !== "approved") {
      fail("Only approved warranty claims can be fulfilled.", 400);
    }
    if (!claim.order_item_id) {
      fail("This legacy claim is not linked to an exact order item and cannot be fulfilled safely.", 409);
    }

    const claimQty = Number(claim.claim_quantity || 1);
    const orderedQty = Number(claim.ordered_quantity || 0);
    if (!Number.isInteger(claimQty) || claimQty <= 0 || claimQty > orderedQty) {
      fail("Claim quantity is invalid for the linked order item. Review the claim before fulfillment.", 409);
    }

    const finalReceipt = String(receiptPath || claim.replacement_receipt || "").trim();
    if (!finalReceipt) fail("Replacement receipt or fulfillment proof is required.");

    const readyMade = isReadyMadeClaim(claim);
    if (resolution === "full_product_replacement") {
      if (readyMade) {
        if (usages.length) fail("Ready-made full replacement must use the exact finished product, not raw-material deductions.");
        await applyReadyMadeReplacement(conn, {
          claim, source, disposition, actorId: userId, reference: `WARRANTY-${id}`,
        });
      } else {
        if (usages.length === 0) fail("Custom furniture full replacement requires the raw materials actually used.");
        if (source) fail("Warehouse / Display source applies only to ready-made full replacements.");
        if (disposition === "usable_returned") fail("Custom furniture returns cannot be added to ready-made sellable stock.");
        await applyMaterialUsage(conn, {
          claim, usages, actorId: userId, resolutionType: resolution, reference: `WARRANTY-${id}`,
        });
      }
    } else {
      if (resolution === "part_replacement" && usages.length === 0) {
        fail("Part Replacement requires at least one material or part usage line.");
      }
      if (source) fail("Warehouse / Display replacement source is only for full ready-made replacement.");
      if (disposition !== "not_returned") fail("Returned-item disposition is only used for full product replacement.");
      await applyMaterialUsage(conn, {
        claim, usages, actorId: userId, resolutionType: resolution, reference: `WARRANTY-${id}`,
      });
    }

    const [update] = await conn.query(
      `UPDATE warranties
       SET status = 'fulfilled', replacement_receipt = ?, resolution_type = ?,
           resolution_notes = ?, replacement_source = ?, return_disposition = ?,
           fulfilled_at = NOW(), fulfilled_by = ?, updated_at = NOW()
       WHERE id = ? AND status = 'approved'`,
      [
        finalReceipt,
        resolution,
        notes,
        readyMade && resolution === "full_product_replacement" ? source : null,
        resolution === "full_product_replacement" ? disposition : "not_returned",
        userId,
        id,
      ],
    );
    if (update.affectedRows !== 1) fail("Warranty status changed while fulfilling. Refresh and try again.", 409);

    await conn.commit();
    return {
      claim: {
        id: Number(claim.id), customer_id: Number(claim.customer_id), order_id: Number(claim.order_id),
        order_number: claim.order_number, product_name: claim.order_item_name || claim.product_name,
        claim_quantity: claimQty,
      },
      resolution_type: resolution,
      resolution_notes: notes,
      replacement_source: readyMade && resolution === "full_product_replacement" ? source : null,
      return_disposition: resolution === "full_product_replacement" ? disposition : "not_returned",
      receipt_path: finalReceipt,
      material_lines: usages.length,
    };
  } catch (error) {
    try { await conn.rollback(); } catch {}
    throw error;
  } finally {
    conn.release();
  }
};
