// controllers/admin/stockTransferController.js
// WISDOM Internal Stock Transfer V1.0.0
// One physical site: Warehouse / Production <-> Sales / Display.
// Ready-made products only. products.stock remains the company-wide total.

const crypto = require("crypto");
const pool = require("../../config/db");

const DIRECTIONS = new Set([
  "warehouse_to_display",
  "display_to_warehouse",
]);

const cleanText = (value, maxLength) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length > maxLength) {
    const error = new Error(`Text must be ${maxLength} characters or less.`);
    error.status = 400;
    throw error;
  }
  return text;
};

const makeReferenceCode = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const token = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ST-${y}${m}${d}-${token}`;
};

const oppositeDirection = (direction) =>
  direction === "warehouse_to_display"
    ? "display_to_warehouse"
    : "warehouse_to_display";

const normalizeItems = (rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    const error = new Error("Add at least one ready-made product to transfer.");
    error.status = 400;
    throw error;
  }

  if (rawItems.length > 50) {
    const error = new Error("A transfer can contain up to 50 products.");
    error.status = 400;
    throw error;
  }

  const seen = new Set();
  return rawItems.map((item) => {
    const productId = Number(item?.product_id);
    const quantity = Number(item?.quantity);

    if (!Number.isInteger(productId) || productId <= 0) {
      const error = new Error("One of the selected products is invalid.");
      error.status = 400;
      throw error;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      const error = new Error("Transfer quantity must be a whole number greater than 0.");
      error.status = 400;
      throw error;
    }

    if (seen.has(productId)) {
      const error = new Error("The same product cannot appear twice in one transfer.");
      error.status = 400;
      throw error;
    }
    seen.add(productId);

    return { product_id: productId, quantity };
  });
};

const sendError = (res, error) => {
  const status = Number(error?.status) || 500;
  return res.status(status).json({
    message: error?.message || "Stock transfer request failed.",
    ...(error?.details ? { details: error.details } : {}),
  });
};

const ensureDisplayRows = async (conn, productIds) => {
  const placeholders = productIds.map(() => "?").join(",");
  await conn.query(
    `INSERT INTO ready_made_display_stock (product_id, quantity)
     SELECT id, 0
     FROM products
     WHERE id IN (${placeholders})
       AND LOWER(COALESCE(type, 'standard')) = 'standard'
     ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)`,
    productIds,
  );
};

const lockReadyMadeStocks = async (conn, productIds) => {
  await ensureDisplayRows(conn, productIds);

  const placeholders = productIds.map(() => "?").join(",");
  const [rows] = await conn.query(
    `SELECT
       p.id,
       p.name,
       p.type,
       p.is_active,
       p.stock AS total_stock,
       ds.quantity AS display_stock
     FROM products p
     INNER JOIN ready_made_display_stock ds ON ds.product_id = p.id
     WHERE p.id IN (${placeholders})
     ORDER BY p.id ASC
     FOR UPDATE`,
    productIds,
  );

  return new Map(rows.map((row) => [Number(row.id), row]));
};

const applyTransfer = async (
  conn,
  { direction, items, reason, actorUserId, reversalOfTransferId = null },
) => {
  if (!DIRECTIONS.has(direction)) {
    const error = new Error("Invalid stock transfer direction.");
    error.status = 400;
    throw error;
  }

  const cleanReason = cleanText(reason, 500);
  if (!cleanReason) {
    const error = new Error("Reason is required for every stock transfer.");
    error.status = 400;
    throw error;
  }

  const normalizedItems = normalizeItems(items);
  const productIds = normalizedItems
    .map((item) => item.product_id)
    .sort((a, b) => a - b);
  const stockMap = await lockReadyMadeStocks(conn, productIds);

  if (stockMap.size !== productIds.length) {
    const error = new Error("One of the selected ready-made products no longer exists.");
    error.status = 409;
    throw error;
  }

  const preparedItems = [];

  for (const item of normalizedItems) {
    const row = stockMap.get(item.product_id);
    const type = String(row?.type || "").trim().toLowerCase();

    if (!row || type !== "standard") {
      const error = new Error("Only ready-made products can be transferred.");
      error.status = 409;
      throw error;
    }

    if (Number(row.is_active) !== 1) {
      const error = new Error(`${row.name} is archived and cannot be transferred.`);
      error.status = 409;
      throw error;
    }

    const totalStock = Number(row.total_stock || 0);
    const displayBefore = Number(row.display_stock || 0);
    const warehouseBefore = totalStock - displayBefore;

    if (
      !Number.isInteger(totalStock) ||
      !Number.isInteger(displayBefore) ||
      totalStock < 0 ||
      displayBefore < 0 ||
      warehouseBefore < 0
    ) {
      const error = new Error(
        `${row.name} has an invalid location balance. Review inventory before transferring it.`,
      );
      error.status = 409;
      throw error;
    }

    const availableSource =
      direction === "warehouse_to_display" ? warehouseBefore : displayBefore;

    if (item.quantity > availableSource) {
      const sourceLabel =
        direction === "warehouse_to_display"
          ? "Warehouse / Production"
          : "Sales / Display";
      const error = new Error(
        `Insufficient ${sourceLabel} stock for ${row.name}. Available: ${availableSource}.`,
      );
      error.status = 409;
      error.details = {
        product_id: item.product_id,
        product_name: row.name,
        source_available: availableSource,
        requested: item.quantity,
      };
      throw error;
    }

    const displayAfter =
      direction === "warehouse_to_display"
        ? displayBefore + item.quantity
        : displayBefore - item.quantity;
    const warehouseAfter = totalStock - displayAfter;

    if (displayAfter < 0 || warehouseAfter < 0) {
      const error = new Error(`Transfer would make ${row.name} stock negative.`);
      error.status = 409;
      throw error;
    }

    preparedItems.push({
      product_id: item.product_id,
      product_name_snapshot: row.name,
      quantity: item.quantity,
      total_stock_snapshot: totalStock,
      warehouse_before: warehouseBefore,
      display_before: displayBefore,
      warehouse_after: warehouseAfter,
      display_after: displayAfter,
    });
  }

  const referenceCode = makeReferenceCode();
  const [transferResult] = await conn.query(
    `INSERT INTO stock_transfers
       (reference_code, direction, reason, transferred_by, reversal_of_transfer_id, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [
      referenceCode,
      direction,
      cleanReason,
      actorUserId,
      reversalOfTransferId,
    ],
  );

  const transferId = transferResult.insertId;

  for (const item of preparedItems) {
    const [allocationResult] = await conn.query(
      `UPDATE ready_made_display_stock
       SET quantity = ?
       WHERE product_id = ?`,
      [item.display_after, item.product_id],
    );

    if (allocationResult.affectedRows !== 1) {
      const error = new Error(
        `Location stock changed for ${item.product_name_snapshot}. Refresh and try again.`,
      );
      error.status = 409;
      throw error;
    }

    await conn.query(
      `INSERT INTO stock_transfer_items
         (transfer_id, product_id, product_name_snapshot, quantity,
          total_stock_snapshot, warehouse_before, display_before,
          warehouse_after, display_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transferId,
        item.product_id,
        item.product_name_snapshot,
        item.quantity,
        item.total_stock_snapshot,
        item.warehouse_before,
        item.display_before,
        item.warehouse_after,
        item.display_after,
      ],
    );
  }

  return {
    id: transferId,
    reference_code: referenceCode,
    direction,
    reason: cleanReason,
    reversal_of_transfer_id: reversalOfTransferId,
    items: preparedItems,
  };
};

exports.getTransferInventory = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.barcode,
         p.stock AS total_stock,
         COALESCE(ds.quantity, 0) AS display_stock,
         GREATEST(p.stock - COALESCE(ds.quantity, 0), 0) AS warehouse_stock,
         p.reorder_point,
         p.stock_status
       FROM products p
       LEFT JOIN ready_made_display_stock ds ON ds.product_id = p.id
       WHERE LOWER(COALESCE(p.type, 'standard')) = 'standard'
         AND p.is_active = 1
       ORDER BY p.name ASC, p.id ASC`,
    );

    const inventory = rows.map((row) => ({
      ...row,
      total_stock: Number(row.total_stock || 0),
      display_stock: Number(row.display_stock || 0),
      warehouse_stock: Number(row.warehouse_stock || 0),
    }));

    const summary = inventory.reduce(
      (acc, row) => {
        acc.product_count += 1;
        acc.total_stock += row.total_stock;
        acc.warehouse_stock += row.warehouse_stock;
        acc.display_stock += row.display_stock;
        return acc;
      },
      { product_count: 0, total_stock: 0, warehouse_stock: 0, display_stock: 0 },
    );

    return res.json({ inventory, summary });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listTransfers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = ["1=1"];
    const params = [];

    const direction = String(req.query.direction || "").trim().toLowerCase();
    if (direction) {
      if (!DIRECTIONS.has(direction)) {
        return res.status(400).json({ message: "Invalid direction filter." });
      }
      where.push("st.direction = ?");
      params.push(direction);
    }

    const search = String(req.query.search || "").trim();
    if (search) {
      if (search.length > 100) {
        return res.status(400).json({ message: "Search must be 100 characters or less." });
      }
      const pattern = `%${search}%`;
      where.push(`(
        st.reference_code LIKE ?
        OR st.reason LIKE ?
        OR EXISTS (
          SELECT 1 FROM stock_transfer_items sti_search
          WHERE sti_search.transfer_id = st.id
            AND sti_search.product_name_snapshot LIKE ?
        )
      )`);
      params.push(pattern, pattern, pattern);
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    if (from) {
      if (!datePattern.test(from)) {
        return res.status(400).json({ message: "From date must use YYYY-MM-DD." });
      }
      // created_at is stored/interpreted in UTC. A date picked in the UI is a
      // Philippine calendar date, so convert Manila midnight (+08:00) to UTC.
      where.push("st.created_at >= DATE_SUB(?, INTERVAL 8 HOUR)");
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      if (!datePattern.test(to)) {
        return res.status(400).json({ message: "To date must use YYYY-MM-DD." });
      }
      // Use an exclusive next-day Manila boundary, converted to UTC.
      where.push(
        "st.created_at < DATE_SUB(DATE_ADD(?, INTERVAL 1 DAY), INTERVAL 8 HOUR)",
      );
      params.push(`${to} 00:00:00`);
    }
    if (from && to && from > to) {
      return res.status(400).json({ message: "From date cannot be after To date." });
    }

    const whereSql = where.join(" AND ");

    const [rows] = await pool.query(
      `SELECT
         st.id,
         st.reference_code,
         st.direction,
         st.reason,
         st.transferred_by,
         st.reversal_of_transfer_id,
         st.created_at,
         actor.name AS transferred_by_name,
         COUNT(sti.id) AS item_count,
         COALESCE(SUM(sti.quantity), 0) AS total_quantity,
         GROUP_CONCAT(
           CONCAT(sti.product_name_snapshot, ' x', sti.quantity)
           ORDER BY sti.id ASC SEPARATOR ', '
         ) AS item_summary,
         reversal.id AS reversed_by_transfer_id,
         reversal.reference_code AS reversed_by_reference
       FROM stock_transfers st
       LEFT JOIN users actor ON actor.id = st.transferred_by
       LEFT JOIN stock_transfer_items sti ON sti.transfer_id = st.id
       LEFT JOIN stock_transfers reversal ON reversal.reversal_of_transfer_id = st.id
       WHERE ${whereSql}
       GROUP BY st.id
       ORDER BY st.created_at DESC, st.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM stock_transfers st
       WHERE ${whereSql}`,
      params,
    );

    return res.json({
      rows: rows.map((row) => ({
        ...row,
        item_count: Number(row.item_count || 0),
        total_quantity: Number(row.total_quantity || 0),
      })),
      total: Number(countRow?.total || 0),
      page,
      limit,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getTransfer = async (req, res) => {
  try {
    const transferId = Number(req.params.id);
    if (!Number.isInteger(transferId) || transferId <= 0) {
      return res.status(400).json({ message: "Invalid transfer ID." });
    }

    const [[transfer]] = await pool.query(
      `SELECT
         st.*,
         actor.name AS transferred_by_name,
         original.reference_code AS reversal_of_reference,
         reversal.id AS reversed_by_transfer_id,
         reversal.reference_code AS reversed_by_reference
       FROM stock_transfers st
       LEFT JOIN users actor ON actor.id = st.transferred_by
       LEFT JOIN stock_transfers original ON original.id = st.reversal_of_transfer_id
       LEFT JOIN stock_transfers reversal ON reversal.reversal_of_transfer_id = st.id
       WHERE st.id = ?
       LIMIT 1`,
      [transferId],
    );

    if (!transfer) {
      return res.status(404).json({ message: "Stock transfer not found." });
    }

    const [items] = await pool.query(
      `SELECT
         id,
         product_id,
         product_name_snapshot,
         quantity,
         total_stock_snapshot,
         warehouse_before,
         display_before,
         warehouse_after,
         display_after
       FROM stock_transfer_items
       WHERE transfer_id = ?
       ORDER BY id ASC`,
      [transferId],
    );

    return res.json({
      ...transfer,
      items: items.map((item) => ({
        ...item,
        quantity: Number(item.quantity || 0),
        total_stock_snapshot: Number(item.total_stock_snapshot || 0),
        warehouse_before: Number(item.warehouse_before || 0),
        display_before: Number(item.display_before || 0),
        warehouse_after: Number(item.warehouse_after || 0),
        display_after: Number(item.display_after || 0),
      })),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.createTransfer = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const result = await applyTransfer(conn, {
      direction: String(req.body?.direction || "").trim().toLowerCase(),
      items: req.body?.items,
      reason: req.body?.reason,
      actorUserId: Number(req.user.id),
    });

    await conn.commit();

    req.auditRecord = {
      id: result.id,
      old: null,
      new: {
        reference_code: result.reference_code,
        direction: result.direction,
        reason: result.reason,
        item_count: result.items.length,
        items: result.items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name_snapshot,
          quantity: item.quantity,
          warehouse_before: item.warehouse_before,
          display_before: item.display_before,
          warehouse_after: item.warehouse_after,
          display_after: item.display_after,
        })),
      },
    };

    return res.status(201).json({
      message: "Internal stock transfer completed.",
      id: result.id,
      reference_code: result.reference_code,
    });
  } catch (error) {
    await conn.rollback();
    return sendError(res, error);
  } finally {
    conn.release();
  }
};

exports.reverseTransfer = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const transferId = Number(req.params.id);
    if (!Number.isInteger(transferId) || transferId <= 0) {
      return res.status(400).json({ message: "Invalid transfer ID." });
    }

    const reason = cleanText(req.body?.reason, 500);
    if (!reason) {
      return res.status(400).json({ message: "Reason is required to reverse a transfer." });
    }

    await conn.beginTransaction();

    const [[original]] = await conn.query(
      `SELECT id, reference_code, direction, reversal_of_transfer_id
       FROM stock_transfers
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [transferId],
    );

    if (!original) {
      await conn.rollback();
      return res.status(404).json({ message: "Stock transfer not found." });
    }

    if (original.reversal_of_transfer_id) {
      await conn.rollback();
      return res.status(409).json({
        message:
          "A reversal record cannot be reversed automatically. Create a new transfer if another correction is required.",
      });
    }

    const [[existingReversal]] = await conn.query(
      `SELECT id, reference_code
       FROM stock_transfers
       WHERE reversal_of_transfer_id = ?
       LIMIT 1
       FOR UPDATE`,
      [transferId],
    );

    if (existingReversal) {
      await conn.rollback();
      return res.status(409).json({
        message: `This transfer was already reversed by ${existingReversal.reference_code}.`,
        reversal_id: existingReversal.id,
      });
    }

    const [originalItems] = await conn.query(
      `SELECT product_id, quantity
       FROM stock_transfer_items
       WHERE transfer_id = ?
       ORDER BY id ASC
       FOR UPDATE`,
      [transferId],
    );

    if (!originalItems.length || originalItems.some((item) => !item.product_id)) {
      await conn.rollback();
      return res.status(409).json({
        message:
          "This historical transfer cannot be automatically reversed because one of its products is no longer available.",
      });
    }

    const result = await applyTransfer(conn, {
      direction: oppositeDirection(original.direction),
      items: originalItems.map((item) => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
      })),
      reason: `Reversal of ${original.reference_code}: ${reason}`,
      actorUserId: Number(req.user.id),
      reversalOfTransferId: original.id,
    });

    await conn.commit();

    req.auditRecord = {
      id: result.id,
      old: {
        transfer_id: original.id,
        reference_code: original.reference_code,
        direction: original.direction,
      },
      new: {
        reversal_transfer_id: result.id,
        reference_code: result.reference_code,
        direction: result.direction,
        reason: result.reason,
      },
    };

    return res.status(201).json({
      message: "Stock transfer reversed through a new traceable transfer.",
      id: result.id,
      reference_code: result.reference_code,
    });
  } catch (error) {
    await conn.rollback();
    return sendError(res, error);
  } finally {
    conn.release();
  }
};
