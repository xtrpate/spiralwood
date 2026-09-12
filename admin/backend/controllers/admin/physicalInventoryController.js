// controllers/physicalInventoryController.js – Physical inventory reconciliation
const crypto = require("crypto");
const pool = require("../../config/db");
const {
  retryPendingStockReservationsForMaterial,
} = require("../../services/blueprintMaterialReservationService");

const DECIMAL_QUANTITY_UNITS = new Set(["meter", "kg", "liter", "gallon"]);
const EPSILON = 0.0000001;

const normalizeQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return Number.NaN;
  return Math.round(number * 100) / 100;
};

const unitAllowsDecimalQuantity = (unit) =>
  DECIMAL_QUANTITY_UNITS.has(
    String(unit || "")
      .trim()
      .toLowerCase(),
  );

const isValidPhysicalCountForUnit = (value, unit) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return false;

  if (unitAllowsDecimalQuantity(unit)) {
    const normalized = normalizeQuantity(number);
    return Number.isFinite(normalized) && Math.abs(number - normalized) <= EPSILON;
  }

  return Number.isInteger(number);
};

const computeStockStatus = (quantity, reorderPoint = 0, safetyStock = 0) => {
  const qty = Number(quantity) || 0;
  const reorder = Number(reorderPoint) || 0;
  const safety = Number(safetyStock) || 0;

  if (qty <= 0) return "out_of_stock";
  if (qty <= safety) return "critical_stock";
  if (qty <= reorder) return "low_stock";
  return "healthy_stock";
};

const cleanText = (value, maxLength) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
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
  const token = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `PI-${y}${m}${d}-${token}`;
};

const sendError = (res, error) => {
  const status = Number(error?.status) || 500;
  const body = { message: error?.message || "Physical inventory request failed." };
  if (error?.details) body.details = error.details;
  return res.status(status).json(body);
};

const getReservedQuantities = async (connection, materialIds, { lock = false } = {}) => {
  const ids = [...new Set((materialIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);

  const reservedByMaterial = new Map();
  if (ids.length === 0) return reservedByMaterial;

  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await connection.query(
    `SELECT id, material_id, quantity, status
     FROM blueprint_material_reservations
     WHERE material_id IN (${placeholders})
       AND status IN ('pending_stock', 'reserved')
     ORDER BY material_id, id
     ${lock ? "FOR UPDATE" : ""}`,
    ids,
  );

  for (const row of rows) {
    if (String(row.status || "").toLowerCase() !== "reserved") continue;
    const materialId = Number(row.material_id);
    reservedByMaterial.set(
      materialId,
      normalizeQuantity((reservedByMaterial.get(materialId) || 0) + Number(row.quantity || 0)),
    );
  }

  return reservedByMaterial;
};

const getSessionRow = async (db, sessionId, { lock = false } = {}) => {
  const [[row]] = await db.query(
    `SELECT *
     FROM physical_inventory_sessions
     WHERE id = ?
     LIMIT 1
     ${lock ? "FOR UPDATE" : ""}`,
    [sessionId],
  );
  return row || null;
};

const applyCountPayload = async (
  connection,
  sessionId,
  actorUserId,
  items,
) => {
  if (items === undefined) return;

  if (!Array.isArray(items)) {
    const error = new Error("Physical count items must be a list.");
    error.status = 400;
    throw error;
  }

  const [sessionItems] = await connection.query(
    `SELECT id, material_id, unit_snapshot, system_quantity
     FROM physical_inventory_items
     WHERE session_id = ?
     ORDER BY id
     FOR UPDATE`,
    [sessionId],
  );
  const byId = new Map(sessionItems.map((row) => [Number(row.id), row]));
  const seen = new Set();

  for (const input of items) {
    const itemId = Number(input?.item_id);
    if (!Number.isInteger(itemId) || itemId <= 0 || !byId.has(itemId)) {
      const error = new Error("One of the physical inventory items is invalid.");
      error.status = 400;
      throw error;
    }
    if (seen.has(itemId)) {
      const error = new Error("The same physical inventory item was submitted more than once.");
      error.status = 400;
      throw error;
    }
    seen.add(itemId);

    const row = byId.get(itemId);
    const rawCount = input?.physical_count;
    const reason = cleanText(input?.reason, 500);

    if (rawCount === null || rawCount === undefined || rawCount === "") {
      await connection.query(
        `UPDATE physical_inventory_items
         SET physical_count = NULL,
             difference_quantity = NULL,
             reason = ?,
             counted_by = NULL,
             counted_at = NULL
         WHERE id = ? AND session_id = ?`,
        [reason, itemId, sessionId],
      );
      continue;
    }

    if (!isValidPhysicalCountForUnit(rawCount, row.unit_snapshot)) {
      const error = new Error(
        unitAllowsDecimalQuantity(row.unit_snapshot)
          ? `${row.unit_snapshot || "Material"} physical count can have up to 2 decimal places.`
          : `${row.unit_snapshot || "Material"} physical count must be a whole number.`,
      );
      error.status = 400;
      throw error;
    }

    const physicalCount = normalizeQuantity(rawCount);
    const difference = normalizeQuantity(
      physicalCount - Number(row.system_quantity || 0),
    );

    await connection.query(
      `UPDATE physical_inventory_items
       SET physical_count = ?,
           difference_quantity = ?,
           reason = ?,
           counted_by = ?,
           counted_at = NOW()
       WHERE id = ? AND session_id = ?`,
      [physicalCount, difference, reason, actorUserId, itemId, sessionId],
    );
  }
};

const buildPhysicalInventorySessionFilters = (query = {}) => {
  const where = [];
  const whereParams = [];
  const having = [];
  const havingParams = [];

  const search = String(query.search || "").trim();
  if (search.length > 100) {
    const error = new Error("Search must be 100 characters or less.");
    error.status = 400;
    throw error;
  }
  if (search) {
    where.push("s.reference_code LIKE ?");
    whereParams.push(`%${search}%`);
  }

  const status = String(query.status || "").trim().toLowerCase();
  if (status && !["draft", "completed", "cancelled"].includes(status)) {
    const error = new Error("Invalid physical inventory status filter.");
    error.status = 400;
    throw error;
  }
  if (status) {
    where.push("s.status = ?");
    whereParams.push(status);
  }

  const result = String(query.result || "").trim().toLowerCase();
  if (result && !["with_differences", "no_differences"].includes(result)) {
    const error = new Error("Invalid physical inventory result filter.");
    error.status = 400;
    throw error;
  }
  if (result === "with_differences") {
    having.push(
      "SUM(CASE WHEN ABS(COALESCE(i.difference_quantity, 0)) > ? THEN 1 ELSE 0 END) > 0",
    );
    havingParams.push(EPSILON);
  } else if (result === "no_differences") {
    having.push(
      "SUM(CASE WHEN ABS(COALESCE(i.difference_quantity, 0)) > ? THEN 1 ELSE 0 END) = 0",
    );
    havingParams.push(EPSILON);
  }

  const normalizeDate = (value, label) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const error = new Error(`${label} date must use YYYY-MM-DD format.`);
      error.status = 400;
      throw error;
    }
    const parsed = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      const error = new Error(`${label} date is invalid.`);
      error.status = 400;
      throw error;
    }
    return text;
  };

  const from = normalizeDate(query.from, "From");
  const to = normalizeDate(query.to, "To");
  if (from && to && from > to) {
    const error = new Error("From date cannot be after To date.");
    error.status = 400;
    throw error;
  }
  if (from) {
    where.push("s.started_at >= ?");
    whereParams.push(`${from} 00:00:00`);
  }
  if (to) {
    where.push("s.started_at < DATE_ADD(?, INTERVAL 1 DAY)");
    whereParams.push(`${to} 00:00:00`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    whereParams,
    havingSql: having.length ? `HAVING ${having.join(" AND ")}` : "",
    havingParams,
  };
};

const mapPhysicalInventorySessionSummary = (row) => ({
  ...row,
  item_count: Number(row.item_count || 0),
  counted_count: Number(row.counted_count || 0),
  difference_count: Number(row.difference_count || 0),
});

exports.listPhysicalInventorySessions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const filters = buildPhysicalInventorySessionFilters(req.query);

    const [rows] = await pool.query(
      `SELECT
         s.*,
         starter.name AS started_by_name,
         completer.name AS completed_by_name,
         canceller.name AS cancelled_by_name,
         COUNT(i.id) AS item_count,
         SUM(CASE WHEN i.physical_count IS NOT NULL THEN 1 ELSE 0 END) AS counted_count,
         SUM(CASE WHEN ABS(COALESCE(i.difference_quantity, 0)) > ? THEN 1 ELSE 0 END) AS difference_count
       FROM physical_inventory_sessions s
       LEFT JOIN users starter ON starter.id = s.started_by
       LEFT JOIN users completer ON completer.id = s.completed_by
       LEFT JOIN users canceller ON canceller.id = s.cancelled_by
       LEFT JOIN physical_inventory_items i ON i.session_id = s.id
       ${filters.whereSql}
       GROUP BY s.id
       ${filters.havingSql}
       ORDER BY
         CASE s.status WHEN 'draft' THEN 0 ELSE 1 END,
         s.started_at DESC,
         s.id DESC
       LIMIT ? OFFSET ?`,
      [
        EPSILON,
        ...filters.whereParams,
        ...filters.havingParams,
        limit,
        offset,
      ],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM (
         SELECT s.id
         FROM physical_inventory_sessions s
         LEFT JOIN physical_inventory_items i ON i.session_id = s.id
         ${filters.whereSql}
         GROUP BY s.id
         ${filters.havingSql}
       ) filtered_sessions`,
      [...filters.whereParams, ...filters.havingParams],
    );

    const [[activeSession]] = await pool.query(
      `SELECT
         s.id,
         s.reference_code,
         s.status,
         s.started_at,
         starter.name AS started_by_name
       FROM physical_inventory_sessions s
       LEFT JOIN users starter ON starter.id = s.started_by
       WHERE s.status = 'draft'
       ORDER BY s.started_at DESC, s.id DESC
       LIMIT 1`,
    );

    return res.json({
      rows: rows.map(mapPhysicalInventorySessionSummary),
      total: Number(total || 0),
      page,
      limit,
      active_session: activeSession || null,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getPhysicalInventoryReport = async (req, res) => {
  try {
    const filters = buildPhysicalInventorySessionFilters(req.query);

    const [sessions] = await pool.query(
      `SELECT
         s.*,
         starter.name AS started_by_name,
         completer.name AS completed_by_name,
         canceller.name AS cancelled_by_name,
         COUNT(i.id) AS item_count,
         SUM(CASE WHEN i.physical_count IS NOT NULL THEN 1 ELSE 0 END) AS counted_count,
         SUM(CASE WHEN ABS(COALESCE(i.difference_quantity, 0)) > ? THEN 1 ELSE 0 END) AS difference_count
       FROM physical_inventory_sessions s
       LEFT JOIN users starter ON starter.id = s.started_by
       LEFT JOIN users completer ON completer.id = s.completed_by
       LEFT JOIN users canceller ON canceller.id = s.cancelled_by
       LEFT JOIN physical_inventory_items i ON i.session_id = s.id
       ${filters.whereSql}
       GROUP BY s.id
       ${filters.havingSql}
       ORDER BY
         CASE s.status WHEN 'draft' THEN 0 ELSE 1 END,
         s.started_at DESC,
         s.id DESC
       LIMIT 5000`,
      [EPSILON, ...filters.whereParams, ...filters.havingParams],
    );

    const mappedSessions = sessions.map(mapPhysicalInventorySessionSummary);
    if (mappedSessions.length === 0) {
      return res.json({ sessions: [], items: [] });
    }

    const sessionIds = mappedSessions.map((session) => Number(session.id));
    const placeholders = sessionIds.map(() => "?").join(",");
    const [items] = await pool.query(
      `SELECT
         i.*,
         s.reference_code,
         s.status AS session_status,
         sm.reference AS movement_reference
       FROM physical_inventory_items i
       INNER JOIN physical_inventory_sessions s ON s.id = i.session_id
       LEFT JOIN stock_movements sm ON sm.id = i.stock_movement_id
       WHERE i.session_id IN (${placeholders})
       ORDER BY
         s.started_at DESC,
         s.id DESC,
         i.material_name_snapshot ASC,
         i.id ASC`,
      sessionIds,
    );

    return res.json({
      sessions: mappedSessions,
      items,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getPhysicalInventorySession = async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ message: "Invalid physical inventory session ID." });
    }

    const [[session]] = await pool.query(
      `SELECT
         s.*,
         starter.name AS started_by_name,
         completer.name AS completed_by_name,
         canceller.name AS cancelled_by_name
       FROM physical_inventory_sessions s
       LEFT JOIN users starter ON starter.id = s.started_by
       LEFT JOIN users completer ON completer.id = s.completed_by
       LEFT JOIN users canceller ON canceller.id = s.cancelled_by
       WHERE s.id = ?
       LIMIT 1`,
      [sessionId],
    );

    if (!session) {
      return res.status(404).json({ message: "Physical inventory session not found." });
    }

    const [items] = await pool.query(
      `SELECT
         i.*,
         rm.quantity AS current_on_hand,
         rm.is_active AS material_is_active,
         COALESCE(current_reserved.reserved_quantity, 0) AS current_reserved_quantity
       FROM physical_inventory_items i
       LEFT JOIN raw_materials rm ON rm.id = i.material_id
       LEFT JOIN (
         SELECT material_id, SUM(quantity) AS reserved_quantity
         FROM blueprint_material_reservations
         WHERE status = 'reserved'
         GROUP BY material_id
       ) current_reserved ON current_reserved.material_id = i.material_id
       WHERE i.session_id = ?
       ORDER BY i.material_name_snapshot ASC, i.id ASC`,
      [sessionId],
    );

    const summary = {
      item_count: items.length,
      counted_count: items.filter((item) => item.physical_count !== null).length,
      difference_count: items.filter(
        (item) => Math.abs(Number(item.difference_quantity || 0)) > EPSILON,
      ).length,
      stock_changed_count:
        session.status === "draft"
          ? items.filter(
              (item) =>
                item.physical_count !== null &&
                (Number(item.material_is_active) !== 1 ||
                  Math.abs(
                    Number(item.current_on_hand || 0) -
                      Number(item.system_quantity || 0),
                  ) > EPSILON),
            ).length
          : 0,
    };

    return res.json({ session, items, summary });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.startPhysicalInventory = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const notes = cleanText(req.body?.notes, 1000);
    const actorUserId = Number(req.user?.id);

    await connection.beginTransaction();

    const [[existingDraft]] = await connection.query(
      `SELECT id, reference_code, started_at
       FROM physical_inventory_sessions
       WHERE status = 'draft'
       LIMIT 1
       FOR UPDATE`,
    );

    if (existingDraft) {
      await connection.rollback();
      return res.status(409).json({
        message: "A physical inventory count is already in progress. Resume or cancel it before starting another count.",
        active_session: existingDraft,
      });
    }

    const [materials] = await connection.query(
      `SELECT
         id,
         name,
         unit,
         material_form,
         length_mm,
         width_mm,
         thickness_mm,
         quantity
       FROM raw_materials
       WHERE is_active = 1
       ORDER BY id
       FOR UPDATE`,
    );

    if (materials.length === 0) {
      await connection.rollback();
      return res.status(409).json({
        message: "There are no active raw materials to count.",
      });
    }

    const reservedByMaterial = await getReservedQuantities(
      connection,
      materials.map((material) => material.id),
    );

    const referenceCode = makeReferenceCode();
    const [sessionResult] = await connection.query(
      `INSERT INTO physical_inventory_sessions
         (reference_code, status, active_key, notes, started_by, started_at)
       VALUES (?, 'draft', 1, ?, ?, NOW())`,
      [referenceCode, notes, actorUserId],
    );

    const values = [];
    const placeholders = [];
    for (const material of materials) {
      placeholders.push("(?,?,?,?,?,?,?,?,?,?,?)");
      values.push(
        sessionResult.insertId,
        material.id,
        String(material.name || "").trim(),
        String(material.unit || "").trim(),
        String(material.material_form || "other").trim(),
        material.length_mm ?? null,
        material.width_mm ?? null,
        material.thickness_mm ?? null,
        normalizeQuantity(material.quantity || 0),
        normalizeQuantity(reservedByMaterial.get(Number(material.id)) || 0),
        actorUserId,
      );
    }

    await connection.query(
      `INSERT INTO physical_inventory_items
         (session_id, material_id, material_name_snapshot, unit_snapshot,
          material_form_snapshot, length_mm_snapshot, width_mm_snapshot,
          thickness_mm_snapshot, system_quantity, reserved_quantity_snapshot,
          created_by)
       VALUES ${placeholders.join(",")}`,
      values,
    );

    await connection.commit();

    req.auditRecord = {
      id: sessionResult.insertId,
      old: null,
      new: {
        reference_code: referenceCode,
        status: "draft",
        item_count: materials.length,
        notes,
      },
    };

    return res.status(201).json({
      message: "Physical inventory count started.",
      id: sessionResult.insertId,
      reference_code: referenceCode,
      item_count: materials.length,
    });
  } catch (error) {
    await connection.rollback();

    if (error?.code === "ER_DUP_ENTRY") {
      const [[activeSession]] = await pool.query(
        `SELECT id, reference_code, started_at
         FROM physical_inventory_sessions
         WHERE status = 'draft'
         LIMIT 1`,
      );
      return res.status(409).json({
        message: "A physical inventory count is already in progress.",
        active_session: activeSession || null,
      });
    }

    return sendError(res, error);
  } finally {
    connection.release();
  }
};

exports.savePhysicalInventoryDraft = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ message: "Invalid physical inventory session ID." });
    }

    const notes =
      req.body?.notes === undefined ? undefined : cleanText(req.body.notes, 1000);
    const actorUserId = Number(req.user?.id);

    await connection.beginTransaction();

    const session = await getSessionRow(connection, sessionId, { lock: true });
    if (!session) {
      await connection.rollback();
      return res.status(404).json({ message: "Physical inventory session not found." });
    }
    if (session.status !== "draft") {
      await connection.rollback();
      return res.status(409).json({ message: "Only an active draft count can be edited." });
    }

    await applyCountPayload(
      connection,
      sessionId,
      actorUserId,
      req.body?.items,
    );

    if (notes !== undefined) {
      await connection.query(
        "UPDATE physical_inventory_sessions SET notes = ? WHERE id = ?",
        [notes, sessionId],
      );
    }

    const [[summary]] = await connection.query(
      `SELECT
         COUNT(*) AS item_count,
         SUM(CASE WHEN physical_count IS NOT NULL THEN 1 ELSE 0 END) AS counted_count,
         SUM(CASE WHEN ABS(COALESCE(difference_quantity, 0)) > ? THEN 1 ELSE 0 END) AS difference_count
       FROM physical_inventory_items
       WHERE session_id = ?`,
      [EPSILON, sessionId],
    );

    await connection.commit();

    return res.json({
      message: "Physical inventory draft saved.",
      summary: {
        item_count: Number(summary?.item_count || 0),
        counted_count: Number(summary?.counted_count || 0),
        difference_count: Number(summary?.difference_count || 0),
      },
    });
  } catch (error) {
    await connection.rollback();
    return sendError(res, error);
  } finally {
    connection.release();
  }
};

exports.finalizePhysicalInventory = async (req, res) => {
  const connection = await pool.getConnection();
  const increasedMaterialIds = [];

  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ message: "Invalid physical inventory session ID." });
    }

    const notes =
      req.body?.notes === undefined ? undefined : cleanText(req.body.notes, 1000);
    const actorUserId = Number(req.user?.id);

    await connection.beginTransaction();

    const session = await getSessionRow(connection, sessionId, { lock: true });
    if (!session) {
      await connection.rollback();
      return res.status(404).json({ message: "Physical inventory session not found." });
    }
    if (session.status !== "draft") {
      await connection.rollback();
      return res.status(409).json({ message: "This physical inventory count is no longer active." });
    }

    await applyCountPayload(
      connection,
      sessionId,
      actorUserId,
      req.body?.items,
    );

    if (notes !== undefined) {
      await connection.query(
        "UPDATE physical_inventory_sessions SET notes = ? WHERE id = ?",
        [notes, sessionId],
      );
    }

    const [items] = await connection.query(
      `SELECT *
       FROM physical_inventory_items
       WHERE session_id = ?
       ORDER BY material_id
       FOR UPDATE`,
      [sessionId],
    );

    const countedItems = items.filter((item) => item.physical_count !== null);
    if (countedItems.length === 0) {
      await connection.rollback();
      return res.status(409).json({
        message: "Select and count at least one raw material before finalizing.",
      });
    }
    const missingReasons = countedItems.filter(
      (item) =>
        Math.abs(Number(item.difference_quantity || 0)) > EPSILON &&
        !String(item.reason || "").trim(),
    );
    if (missingReasons.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message: `Add a reason for every quantity difference before finalizing. ${missingReasons.length} item${missingReasons.length === 1 ? " needs" : "s need"} a reason.`,
        details: {
          item_ids: missingReasons.slice(0, 50).map((item) => item.id),
        },
      });
    }

    const materialIds = countedItems
      .map((item) => Number(item.material_id))
      .sort((a, b) => a - b);
    const placeholders = materialIds.map(() => "?").join(",");

    const [materials] = await connection.query(
      `SELECT
         id, name, unit, quantity, reorder_point, safety_stock, is_active
       FROM raw_materials
       WHERE id IN (${placeholders})
       ORDER BY id
       FOR UPDATE`,
      materialIds,
    );
    const materialById = new Map(materials.map((material) => [Number(material.id), material]));

    const inactiveOrMissing = countedItems.filter((item) => {
      const material = materialById.get(Number(item.material_id));
      return !material || Number(material.is_active) !== 1;
    });

    if (inactiveOrMissing.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message:
          "One or more selected raw materials changed or were archived after this count started. Refresh and start a fresh count for those materials.",
        details: {
          inactive_or_missing_item_ids: inactiveOrMissing.map((item) => item.id),
        },
      });
    }
    const stockChanged = [];
    for (const item of countedItems) {
      const material = materialById.get(Number(item.material_id));
      const currentQty = normalizeQuantity(material.quantity || 0);
      const snapshotQty = normalizeQuantity(item.system_quantity || 0);
      if (Math.abs(currentQty - snapshotQty) > EPSILON) {
        stockChanged.push({
          item_id: item.id,
          material_id: item.material_id,
          material_name: item.material_name_snapshot,
          system_snapshot: snapshotQty,
          current_on_hand: currentQty,
          unit: item.unit_snapshot,
        });
      }
    }

    if (stockChanged.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message:
          "Stock changed after this physical count started. No quantities were overwritten. Cancel this count and start a fresh count so the system quantity matches current inventory.",
        details: {
          stock_changed_count: stockChanged.length,
          stock_changed_items: stockChanged.slice(0, 50),
        },
      });
    }

    const reservedByMaterial = await getReservedQuantities(connection, materialIds, {
      lock: true,
    });

    const belowReserved = [];
    for (const item of countedItems) {
      const reserved = normalizeQuantity(
        reservedByMaterial.get(Number(item.material_id)) || 0,
      );
      const physicalCount = normalizeQuantity(item.physical_count);
      if (physicalCount < reserved - EPSILON) {
        belowReserved.push({
          item_id: item.id,
          material_id: item.material_id,
          material_name: item.material_name_snapshot,
          physical_count: physicalCount,
          reserved_quantity: reserved,
          unit: item.unit_snapshot,
        });
      }
    }

    if (belowReserved.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message:
          "A physical count cannot be finalized below quantity already reserved for paid Blueprint orders.",
        details: {
          item_count: belowReserved.length,
          items: belowReserved.slice(0, 50),
        },
      });
    }

    const adjustments = [];

    for (const item of countedItems) {
      const difference = normalizeQuantity(item.difference_quantity || 0);
      if (Math.abs(difference) <= EPSILON) continue;

      const material = materialById.get(Number(item.material_id));
      const previousQty = normalizeQuantity(material.quantity || 0);
      const physicalCount = normalizeQuantity(item.physical_count);
      const reason = String(item.reason || "").trim();
      const unit = String(item.unit_snapshot || "").trim();
      const reference = `PHYSICAL-INVENTORY-${session.reference_code}`;
      const notesText =
        `Physical inventory reconciliation. System: ${previousQty} ${unit}; ` +
        `physical: ${physicalCount} ${unit}; difference: ${difference > 0 ? "+" : ""}${difference} ${unit}. ` +
        `Reason: ${reason}`;

      const [movementResult] = await connection.query(
        `INSERT INTO stock_movements
           (material_id, product_id, type, quantity, supplier_id, order_id,
            reference, notes, created_by)
         VALUES (?, NULL, 'adjustment', ?, NULL, NULL, ?, ?, ?)`,
        [
          Number(item.material_id),
          physicalCount,
          reference,
          notesText,
          actorUserId,
        ],
      );

      const [updateResult] = await connection.query(
        `UPDATE raw_materials
         SET quantity = ?, stock_status = ?
         WHERE id = ?`,
        [
          physicalCount,
          computeStockStatus(
            physicalCount,
            material.reorder_point,
            material.safety_stock,
          ),
          Number(item.material_id),
        ],
      );

      if (updateResult.affectedRows !== 1) {
        const error = new Error(
          `Could not update ${item.material_name_snapshot}. Refresh and try again.`,
        );
        error.status = 409;
        throw error;
      }

      await connection.query(
        `UPDATE physical_inventory_items
         SET stock_movement_id = ?,
             difference_quantity = ?,
             counted_by = COALESCE(counted_by, ?),
             counted_at = COALESCE(counted_at, NOW())
         WHERE id = ?`,
        [movementResult.insertId, difference, actorUserId, item.id],
      );

      if (physicalCount > previousQty + EPSILON) {
        increasedMaterialIds.push(Number(item.material_id));
      }

      adjustments.push({
        item_id: item.id,
        material_id: Number(item.material_id),
        material_name: item.material_name_snapshot,
        unit,
        previous_quantity: previousQty,
        physical_count: physicalCount,
        difference,
        reason,
        stock_movement_id: movementResult.insertId,
      });
    }

    await connection.query(
      `UPDATE physical_inventory_sessions
       SET status = 'completed',
           active_key = NULL,
           completed_by = ?,
           completed_at = NOW()
       WHERE id = ?`,
      [actorUserId, sessionId],
    );

    await connection.commit();

    const recovery = [];
    for (const materialId of [...new Set(increasedMaterialIds)]) {
      try {
        const result = await retryPendingStockReservationsForMaterial(pool, {
          materialId,
          actorUserId,
        });
        recovery.push({ material_id: materialId, ok: true, result });
      } catch (error) {
        console.error(
          "[PHYSICAL-INVENTORY] Pending-stock recovery failed:",
          materialId,
          error,
        );
        recovery.push({
          material_id: materialId,
          ok: false,
          message: error?.message || "Pending-stock recovery failed.",
        });
      }
    }

    req.auditRecord = {
      id: sessionId,
      old: {
        status: "draft",
        reference_code: session.reference_code,
      },
      new: {
        status: "completed",
        reference_code: session.reference_code,
        snapshot_item_count: items.length,
        counted_item_count: countedItems.length,
        adjustment_count: adjustments.length,
        adjustments,
        pending_reservation_recovery: recovery,
      },
    };

    const recoveryFailures = recovery.filter((entry) => !entry.ok).length;
    return res.json({
      message:
        recoveryFailures > 0
          ? `Physical inventory finalized with ${adjustments.length} adjustment${adjustments.length === 1 ? "" : "s"}. Stock was updated, but ${recoveryFailures} pending reservation recovery check${recoveryFailures === 1 ? " needs" : "s need"} review.`
          : `Physical inventory finalized for ${countedItems.length} selected material${countedItems.length === 1 ? "" : "s"}. ${adjustments.length} stock adjustment${adjustments.length === 1 ? "" : "s"} recorded.`,
      session_id: sessionId,
      reference_code: session.reference_code,
      snapshot_item_count: items.length,
      counted_item_count: countedItems.length,
      adjustment_count: adjustments.length,
      adjustments,
      pending_reservation_recovery: recovery,
    });
  } catch (error) {
    await connection.rollback();
    return sendError(res, error);
  } finally {
    connection.release();
  }
};

exports.cancelPhysicalInventory = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ message: "Invalid physical inventory session ID." });
    }

    const reason = cleanText(req.body?.reason, 500);
    if (!reason) {
      return res.status(400).json({ message: "Cancellation reason is required." });
    }
    const actorUserId = Number(req.user?.id);

    await connection.beginTransaction();

    const session = await getSessionRow(connection, sessionId, { lock: true });
    if (!session) {
      await connection.rollback();
      return res.status(404).json({ message: "Physical inventory session not found." });
    }
    if (session.status !== "draft") {
      await connection.rollback();
      return res.status(409).json({ message: "Only an active draft count can be cancelled." });
    }

    await connection.query(
      `UPDATE physical_inventory_sessions
       SET status = 'cancelled',
           active_key = NULL,
           cancel_reason = ?,
           cancelled_by = ?,
           cancelled_at = NOW()
       WHERE id = ?`,
      [reason, actorUserId, sessionId],
    );

    await connection.commit();

    req.auditRecord = {
      id: sessionId,
      old: {
        status: "draft",
        reference_code: session.reference_code,
      },
      new: {
        status: "cancelled",
        reference_code: session.reference_code,
        cancel_reason: reason,
      },
    };

    return res.json({ message: "Physical inventory count cancelled." });
  } catch (error) {
    await connection.rollback();
    return sendError(res, error);
  } finally {
    connection.release();
  }
};
