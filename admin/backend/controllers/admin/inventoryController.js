// controllers/inventoryController.js – Raw Materials, Build Materials, Stock Movement
const pool = require("../../config/db");
const {
  retryPendingStockReservationsForMaterial,
} = require("../../services/blueprintMaterialReservationService");
const {
  isValidNonNegativeInteger,
  isValidUnitLabel,
  isNonEmptyString,
  isValidPhoneNumber,
  isValidEmail,
} = require("../../utils/validators");
const POSITIVE_MOVEMENT_TYPES = new Set(["in", "return"]);

const computeStockStatus = (quantity, reorderPoint = 0) => {
  const qty = Number(quantity) || 0;
  const reorder = Number(reorderPoint) || 0;

  if (qty <= 0) return "out_of_stock";
  if (qty <= reorder) return "low_stock";
  return "in_stock";
};

const normalizeQuantity = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatQuantityForMessage = (value) =>
  normalizeQuantity(value).toLocaleString("en-PH", {
    maximumFractionDigits: 4,
  });

// WISDOM Material Physical Specs V1.1
const MATERIAL_FORMS = new Set([
  "sheet",
  "linear",
  "piece",
  "hardware",
  "other",
]);

const normalizeOptionalPositiveDimension = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return Number.NaN;
  return number;
};

const buildRawMaterialPhysicalSpec = ({
  material_form,
  length_mm,
  width_mm,
  thickness_mm,
} = {}) => {
  const materialForm = String(material_form || "other")
    .trim()
    .toLowerCase();

  if (!MATERIAL_FORMS.has(materialForm)) {
    return { error: "Material form is invalid." };
  }

  const lengthMm = normalizeOptionalPositiveDimension(length_mm);
  const widthMm = normalizeOptionalPositiveDimension(width_mm);
  const thicknessMm = normalizeOptionalPositiveDimension(thickness_mm);

  if ([lengthMm, widthMm, thicknessMm].some((value) => Number.isNaN(value))) {
    return {
      error:
        "Length, width, and thickness must be greater than 0 when provided.",
    };
  }

  if (
    materialForm === "sheet" &&
    [lengthMm, widthMm, thicknessMm].some((value) => value === null)
  ) {
    return {
      error:
        "Sheet / Board materials require length, width, and thickness in millimeters.",
    };
  }

  return {
    materialForm,
    lengthMm,
    widthMm,
    thicknessMm,
    error: null,
  };
};

const lockActiveBlueprintReservations = async (connection, materialIds) => {
  const ids = [
    ...new Set(
      (Array.isArray(materialIds) ? materialIds : [materialIds])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ].sort((a, b) => a - b);

  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await connection.query(
    `SELECT id, order_id, material_id, quantity, status
     FROM blueprint_material_reservations
     WHERE material_id IN (${placeholders})
       AND status IN ('pending_stock', 'reserved')
     ORDER BY material_id, id
     FOR UPDATE`,
    ids,
  );

  return rows;
};

const getReservedQuantityByMaterial = (reservationRows) => {
  const reservedByMaterial = new Map();

  for (const row of reservationRows || []) {
    if (String(row.status || "").toLowerCase() !== "reserved") continue;

    const materialId = Number(row.material_id);
    const quantity = normalizeQuantity(row.quantity);
    reservedByMaterial.set(
      materialId,
      (reservedByMaterial.get(materialId) || 0) + quantity,
    );
  }

  return reservedByMaterial;
};

const getRawMaterialReferenceCounts = async (connection, materialId) => {
  const [[counts]] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM bill_of_materials WHERE raw_material_id = ?) AS bill_of_materials_count,
       (SELECT COUNT(*) FROM stock_movements WHERE material_id = ?) AS stock_movements_count,
       (SELECT COUNT(*) FROM estimation_items WHERE raw_material_id = ?) AS estimation_items_count,
       (SELECT COUNT(*) FROM blueprint_components WHERE raw_material_id = ?) AS blueprint_components_count,
       (SELECT COUNT(*) FROM blueprint_material_reservations WHERE material_id = ?) AS blueprint_material_reservations_count`,
    [materialId, materialId, materialId, materialId, materialId],
  );

  const normalized = {
    bill_of_materials_count: Number(counts?.bill_of_materials_count || 0),
    stock_movements_count: Number(counts?.stock_movements_count || 0),
    estimation_items_count: Number(counts?.estimation_items_count || 0),
    blueprint_components_count: Number(counts?.blueprint_components_count || 0),
    blueprint_material_reservations_count: Number(
      counts?.blueprint_material_reservations_count || 0,
    ),
  };

  return {
    ...normalized,
    total:
      normalized.bill_of_materials_count +
      normalized.stock_movements_count +
      normalized.estimation_items_count +
      normalized.blueprint_components_count +
      normalized.blueprint_material_reservations_count,
  };
};

const getRawMaterialReservationHistory = async (materialId) => {
  const [[material]] = await pool.query(
    `SELECT id, name, unit, quantity, reorder_point, stock_status, is_active
     FROM raw_materials
     WHERE id = ?
     LIMIT 1`,
    [materialId],
  );

  if (!material) return null;

  const [rows] = await pool.query(
    `SELECT
       bmr.id AS reservation_id,
       bmr.order_id,
       o.order_number,
       o.status AS order_status,
       o.payment_status,
       COALESCE(
         NULLIF(TRIM(customer.name), ''),
         NULLIF(TRIM(o.walkin_customer_name), ''),
         'Unknown customer'
       ) AS customer_name,
       bmr.blueprint_id,
       bmr.estimation_id,
       bmr.quantity,
       bmr.unit_snapshot AS unit,
       bmr.status,
       bmr.issue_code,
       bmr.issue_note,
       bmr.reserved_at,
       bmr.consumed_at,
       bmr.released_at,
       bmr.release_reason,
       creator.name AS created_by_name,
       consumer.name AS consumed_by_name,
       releaser.name AS released_by_name
     FROM blueprint_material_reservations bmr
     LEFT JOIN orders o ON o.id = bmr.order_id
     LEFT JOIN users customer ON customer.id = o.customer_id
     LEFT JOIN users creator ON creator.id = bmr.created_by
     LEFT JOIN users consumer ON consumer.id = bmr.consumed_by
     LEFT JOIN users releaser ON releaser.id = bmr.released_by
     WHERE bmr.material_id = ?
     ORDER BY
       CASE bmr.status
         WHEN 'pending_stock' THEN 1
         WHEN 'reserved' THEN 2
         WHEN 'consumed' THEN 3
         WHEN 'released' THEN 4
         ELSE 5
       END,
       bmr.id DESC`,
    [materialId],
  );

  const summary = {
    total_records: rows.length,
    pending_stock_count: 0,
    reserved_count: 0,
    consumed_count: 0,
    released_count: 0,
    pending_need_quantity: 0,
    reserved_quantity: 0,
    consumed_quantity: 0,
    released_quantity: 0,
  };

  for (const row of rows) {
    const status = String(row.status || "").toLowerCase();
    const quantity = Number(row.quantity) || 0;

    if (status === "pending_stock") {
      summary.pending_stock_count += 1;
      summary.pending_need_quantity += quantity;
    } else if (status === "reserved") {
      summary.reserved_count += 1;
      summary.reserved_quantity += quantity;
    } else if (status === "consumed") {
      summary.consumed_count += 1;
      summary.consumed_quantity += quantity;
    } else if (status === "released") {
      summary.released_count += 1;
      summary.released_quantity += quantity;
    }
  }

  const onHandQuantity = Number(material.quantity) || 0;
  const availableQuantity = Math.max(
    0,
    onHandQuantity - summary.reserved_quantity,
  );

  return {
    material: {
      ...material,
      on_hand_quantity: onHandQuantity,
      reserved_quantity: summary.reserved_quantity,
      available_quantity: availableQuantity,
      pending_need_quantity: summary.pending_need_quantity,
    },
    summary,
    rows,
  };
};

// ═══════════════════════════════════════════════════════════
// RAW MATERIALS
// ═══════════════════════════════════════════════════════════

exports.getRawMaterials = async (req, res) => {
  try {
    if (req.query.reservation_material_id !== undefined) {
      const materialId = Number(req.query.reservation_material_id);
      if (!Number.isInteger(materialId) || materialId <= 0) {
        return res.status(400).json({ message: "Invalid raw material ID." });
      }

      const history = await getRawMaterialReservationHistory(materialId);
      if (!history) {
        return res.status(404).json({ message: "Raw material not found." });
      }

      return res.json(history);
    }

    const {
      search,
      status,
      archive_status = "active",
      supplier_id,
      category_id,
      page = 1,
      limit = 20,
    } = req.query;
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNumber - 1) * limitNumber;
    const where = ["1=1"];
    const params = [];
    const reservationSummaryJoin = `
      LEFT JOIN (
        SELECT
          material_id,
          SUM(CASE WHEN status = 'reserved' THEN quantity ELSE 0 END) AS reserved_quantity,
          SUM(CASE WHEN status = 'pending_stock' THEN quantity ELSE 0 END) AS pending_need_quantity,
          COUNT(*) AS reservation_record_count
        FROM blueprint_material_reservations
        GROUP BY material_id
      ) bmr_summary ON bmr_summary.material_id = rm.id`;
    const availableQuantitySql =
      "GREATEST(COALESCE(rm.quantity, 0) - COALESCE(bmr_summary.reserved_quantity, 0), 0)";
    const availabilityStatusSql = `CASE
      WHEN ${availableQuantitySql} <= 0 THEN 'out_of_stock'
      WHEN ${availableQuantitySql} <= COALESCE(rm.reorder_point, 0) THEN 'low_stock'
      ELSE 'in_stock'
    END`;

    if (search) {
      where.push("(rm.name LIKE ?)");
      params.push(`%${search}%`);
    }
    if (status) {
      where.push(`${availabilityStatusSql} = ?`);
      params.push(status);
    }
    if (supplier_id) {
      where.push("rm.supplier_id = ?");
      params.push(supplier_id);
    }
    if (category_id) {
      where.push("rm.category_id = ?");
      params.push(category_id);
    }

    const archiveFilter = String(archive_status || "active").toLowerCase();
    if (archiveFilter === "archived") {
      where.push("rm.is_active = 0");
    } else if (archiveFilter !== "all") {
      where.push("rm.is_active = 1");
    }

    const [rows] = await pool.query(
      `SELECT rm.*, s.name AS supplier_name, c.name AS category_name,
              COALESCE(rm.quantity, 0) AS on_hand_quantity,
              COALESCE(bmr_summary.reserved_quantity, 0) AS reserved_quantity,
              ${availableQuantitySql} AS available_quantity,
              COALESCE(bmr_summary.pending_need_quantity, 0) AS pending_need_quantity,
              COALESCE(bmr_summary.reservation_record_count, 0) AS reservation_record_count,
              ${availabilityStatusSql} AS availability_status,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM bill_of_materials bom
                  WHERE bom.raw_material_id = rm.id LIMIT 1
                ) OR EXISTS (
                  SELECT 1 FROM stock_movements sm
                  WHERE sm.material_id = rm.id LIMIT 1
                ) OR EXISTS (
                  SELECT 1 FROM estimation_items ei
                  WHERE ei.raw_material_id = rm.id LIMIT 1
                ) OR EXISTS (
                  SELECT 1 FROM blueprint_components bc
                  WHERE bc.raw_material_id = rm.id LIMIT 1
                )
                OR EXISTS (
                  SELECT 1 FROM blueprint_material_reservations bmr
                  WHERE bmr.material_id = rm.id LIMIT 1
                )
                THEN 1 ELSE 0
              END AS has_references
       FROM raw_materials rm
       ${reservationSummaryJoin}
       LEFT JOIN suppliers s  ON s.id  = rm.supplier_id
       LEFT JOIN categories c ON c.id  = rm.category_id
       WHERE ${where.join(" AND ")}
       ORDER BY rm.is_active DESC, rm.name ASC
       LIMIT ? OFFSET ?`,
      [...params, limitNumber, offset],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM raw_materials rm
       ${reservationSummaryJoin}
       WHERE ${where.join(" AND ")}`,
      params,
    );

    res.json({ rows, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createRawMaterial = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const {
      name,
      category_id = null,
      unit,
      material_form = "other",
      length_mm = null,
      width_mm = null,
      thickness_mm = null,
      quantity = 0,
      reorder_point = 0,
      unit_cost = 0,
      supplier_id = null,
    } = req.body;

    const qty = Number(quantity);
    const reorderPoint = Number(reorder_point);
    const unitCost = Number(unit_cost);
    const physicalSpec = buildRawMaterialPhysicalSpec({
      material_form,
      length_mm,
      width_mm,
      thickness_mm,
    });

    if (!name || !String(name).trim()) {
      await conn.rollback();
      return res.status(400).json({ message: "Material name is required." });
    }

    if (!unit || !String(unit).trim()) {
      await conn.rollback();
      return res.status(400).json({ message: "Unit is required." });
    }

    if (!isValidUnitLabel(unit)) {
      await conn.rollback();
      return res.status(400).json({
        message: "Unit must be a valid text label such as pcs, kg, meter, or sheet.",
      });
    }

    if (physicalSpec.error) {
      await conn.rollback();
      return res.status(400).json({ message: physicalSpec.error });
    }

    if (
      [qty, reorderPoint, unitCost].some(
        (value) => !Number.isFinite(value) || value < 0,
      )
    ) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Quantity, reorder point, and unit cost must be valid non-negative numbers.",
      });
    }

    if (
      category_id !== null &&
      category_id !== undefined &&
      category_id !== "" &&
      (!isValidNonNegativeInteger(category_id) || Number(category_id) <= 0)
    ) {
      await conn.rollback();
      return res.status(400).json({
        message: "Category must be a valid selection.",
      });
    }

    if (
      supplier_id !== null &&
      supplier_id !== undefined &&
      supplier_id !== "" &&
      (!isValidNonNegativeInteger(supplier_id) || Number(supplier_id) <= 0)
    ) {
      await conn.rollback();
      return res.status(400).json({
        message: "Supplier must be a valid selection.",
      });
    }

    const status = computeStockStatus(qty, reorderPoint);

    const [materialResult] = await conn.query(
      `INSERT INTO raw_materials
         (name, category_id, unit, material_form, length_mm, width_mm, thickness_mm,
          quantity, reorder_point, unit_cost, supplier_id, stock_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        String(name).trim(),
        category_id ? parseInt(category_id, 10) : null,
        String(unit).trim(),
        physicalSpec.materialForm,
        physicalSpec.lengthMm,
        physicalSpec.widthMm,
        physicalSpec.thicknessMm,
        qty,
        reorderPoint,
        unitCost,
        supplier_id ? parseInt(supplier_id, 10) : null,
        status,
      ],
    );

    let initialMovementId = null;
    if (qty > 0) {
      const [movementResult] = await conn.query(
        `INSERT INTO stock_movements
           (material_id, product_id, type, quantity, supplier_id, order_id,
            reference, notes, created_by)
         VALUES (?, NULL, 'in', ?, ?, NULL, ?, ?, ?)`,
        [
          materialResult.insertId,
          qty,
          supplier_id ? parseInt(supplier_id, 10) : null,
          `INITIAL-STOCK-${materialResult.insertId}`,
          "Initial stock recorded when the raw material was created.",
          parseInt(req.user.id, 10),
        ],
      );
      initialMovementId = movementResult.insertId;
    }

    const [[savedMaterial]] = await conn.query(
      `SELECT id, name, category_id, unit, material_form, length_mm, width_mm,
              thickness_mm, quantity, reorder_point, unit_cost, supplier_id, stock_status
       FROM raw_materials
       WHERE id = ?
       LIMIT 1`,
      [materialResult.insertId],
    );

    await conn.commit();

    if (savedMaterial) {
      req.auditRecord = {
        id: materialResult.insertId,
        old: null,
        new: {
          ...savedMaterial,
          initial_stock_movement_id: initialMovementId,
        },
      };
    }

    return res.status(201).json({
      message:
        qty > 0
          ? "Raw material created and initial stock movement recorded."
          : "Raw material created.",
      id: materialResult.insertId,
      initial_stock_movement_id: initialMovementId,
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.updateRawMaterial = async (req, res) => {
  try {
    const {
      name,
      category_id = null,
      unit,
      material_form = "other",
      length_mm = null,
      width_mm = null,
      thickness_mm = null,
      quantity,
      reorder_point = 0,
      unit_cost = 0,
      supplier_id = null,
    } = req.body;

    const materialId = parseInt(req.params.id, 10);
    const reorderPoint = Number(reorder_point);
    const unitCost = Number(unit_cost);
    const physicalSpec = buildRawMaterialPhysicalSpec({
      material_form,
      length_mm,
      width_mm,
      thickness_mm,
    });

    if (!Number.isInteger(materialId) || materialId <= 0) {
      return res.status(400).json({ message: "Invalid raw material ID." });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Material name is required." });
    }

    if (!unit || !String(unit).trim()) {
      return res.status(400).json({ message: "Unit is required." });
    }

    if (!isValidUnitLabel(unit)) {
      return res.status(400).json({
        message: "Unit must be a valid text label such as pcs, kg, meter, or sheet.",
      });
    }

    if (physicalSpec.error) {
      return res.status(400).json({ message: physicalSpec.error });
    }

    if (
      !Number.isFinite(reorderPoint) ||
      reorderPoint < 0 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      return res.status(400).json({
        message: "Reorder point and unit cost must be valid non-negative numbers.",
      });
    }

    if (
      category_id !== null &&
      category_id !== undefined &&
      category_id !== "" &&
      (!isValidNonNegativeInteger(category_id) || Number(category_id) <= 0)
    ) {
      return res.status(400).json({
        message: "Category must be a valid selection.",
      });
    }

    if (
      supplier_id !== null &&
      supplier_id !== undefined &&
      supplier_id !== "" &&
      (!isValidNonNegativeInteger(supplier_id) || Number(supplier_id) <= 0)
    ) {
      return res.status(400).json({
        message: "Supplier must be a valid selection.",
      });
    }

    const [[before]] = await pool.query(
      `SELECT id, name, category_id, unit, material_form, length_mm, width_mm,
              thickness_mm, quantity, reorder_point, unit_cost, supplier_id, stock_status
       FROM raw_materials
       WHERE id = ?
       LIMIT 1`,
      [materialId],
    );

    if (!before) {
      return res.status(404).json({ message: "Raw material not found." });
    }

    const currentQty = normalizeQuantity(before.quantity);
    const requestedQty =
      quantity === undefined || quantity === null || quantity === ""
        ? currentQty
        : Number(quantity);

    if (!Number.isFinite(requestedQty) || requestedQty < 0) {
      return res.status(400).json({
        message: "Quantity must be a valid non-negative number.",
      });
    }

    if (Math.abs(requestedQty - currentQty) > 0.0000001) {
      return res.status(409).json({
        message:
          "On-hand quantity cannot be changed from Edit Raw Material. Use Stock Movement so every physical stock change is recorded.",
        current_quantity: currentQty,
        requested_quantity: requestedQty,
      });
    }

    const status = computeStockStatus(currentQty, reorderPoint);

    const [updateResult] = await pool.query(
      `UPDATE raw_materials
       SET name=?, category_id=?, unit=?, material_form=?, length_mm=?, width_mm=?,
           thickness_mm=?, reorder_point=?, unit_cost=?, supplier_id=?, stock_status=?
       WHERE id=?`,
      [
        String(name).trim(),
        category_id ? parseInt(category_id, 10) : null,
        String(unit).trim(),
        physicalSpec.materialForm,
        physicalSpec.lengthMm,
        physicalSpec.widthMm,
        physicalSpec.thicknessMm,
        reorderPoint,
        unitCost,
        supplier_id ? parseInt(supplier_id, 10) : null,
        status,
        materialId,
      ],
    );

    if (updateResult.affectedRows !== 1) {
      return res.status(409).json({
        message: "Raw material could not be updated. Refresh and try again.",
      });
    }

    const [[after]] = await pool.query(
      `SELECT id, name, category_id, unit, material_form, length_mm, width_mm,
              thickness_mm, quantity, reorder_point, unit_cost, supplier_id, stock_status
       FROM raw_materials
       WHERE id = ?
       LIMIT 1`,
      [materialId],
    );

    if (after) {
      req.auditRecord = { id: materialId, old: before, new: after };
    }

    return res.json({ message: "Raw material updated." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.archiveRawMaterial = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const materialId = parseInt(req.params.id, 10);
    if (!Number.isInteger(materialId) || materialId <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid raw material ID." });
    }

    const [[before]] = await conn.query(
      `SELECT id, name, category_id, unit, quantity, reorder_point,
              unit_cost, supplier_id, stock_status, is_active
       FROM raw_materials
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [materialId],
    );

    if (!before) {
      await conn.rollback();
      return res.status(404).json({ message: "Raw material not found." });
    }

    if (Number(before.is_active) === 0) {
      await conn.rollback();
      return res.json({ message: "Raw material is already archived." });
    }

    const activeReservations = await lockActiveBlueprintReservations(
      conn,
      materialId,
    );

    if (activeReservations.length > 0) {
      await conn.rollback();

      const reservedCount = activeReservations.filter(
        (row) => String(row.status).toLowerCase() === "reserved",
      ).length;
      const pendingCount = activeReservations.filter(
        (row) => String(row.status).toLowerCase() === "pending_stock",
      ).length;

      return res.status(409).json({
        message:
          "This raw material cannot be archived while blueprint orders still reserve it or wait for it. Resolve or cancel those orders first.",
        reserved_count: reservedCount,
        pending_stock_count: pendingCount,
        reservation_ids: activeReservations.map((row) => row.id),
      });
    }

    const [result] = await conn.query(
      `UPDATE raw_materials
       SET is_active = 0
       WHERE id = ? AND is_active = 1`,
      [materialId],
    );

    if (result.affectedRows !== 1) {
      await conn.rollback();
      return res.status(409).json({
        message: "Raw material could not be archived. Refresh and try again.",
      });
    }

    await conn.commit();

    req.auditRecord = {
      id: materialId,
      old: before,
      new: { ...before, is_active: 0, action: "archived" },
    };

    return res.json({ message: "Raw material archived." });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.restoreRawMaterial = async (req, res) => {
  try {
    const materialId = parseInt(req.params.id, 10);
    if (!Number.isInteger(materialId) || materialId <= 0) {
      return res.status(400).json({ message: "Invalid raw material ID." });
    }

    const [[before]] = await pool.query(
      `SELECT id, name, category_id, unit, quantity, reorder_point,
              unit_cost, supplier_id, stock_status, is_active
       FROM raw_materials
       WHERE id = ?
       LIMIT 1`,
      [materialId],
    );

    if (!before) {
      return res.status(404).json({ message: "Raw material not found." });
    }

    if (Number(before.is_active) === 1) {
      return res.json({ message: "Raw material is already active." });
    }

    const [result] = await pool.query(
      `UPDATE raw_materials
       SET is_active = 1
       WHERE id = ? AND is_active = 0`,
      [materialId],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message: "Raw material could not be restored. Refresh and try again.",
      });
    }

    req.auditRecord = {
      id: materialId,
      old: before,
      new: { ...before, is_active: 1, action: "restored" },
    };

    res.json({ message: "Raw material restored." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteRawMaterial = async (req, res) => {
  try {
    const materialId = parseInt(req.params.id, 10);
    if (!Number.isInteger(materialId) || materialId <= 0) {
      return res.status(400).json({ message: "Invalid raw material ID." });
    }

    const [[before]] = await pool.query(
      `SELECT id, name, category_id, unit, quantity, reorder_point,
              unit_cost, supplier_id, stock_status, is_active
       FROM raw_materials
       WHERE id = ?
       LIMIT 1`,
      [materialId],
    );

    if (!before) {
      return res.status(404).json({ message: "Raw material not found." });
    }

    const references = await getRawMaterialReferenceCounts(pool, materialId);
    if (references.total > 0) {
      return res.status(409).json({
        message:
          "This raw material has historical or linked records and cannot be permanently deleted. Archive it instead.",
        can_archive: true,
        references,
      });
    }

    const [deleteResult] = await pool.query(
      "DELETE FROM raw_materials WHERE id = ?",
      [materialId],
    );

    if (deleteResult.affectedRows !== 1) {
      return res.status(409).json({
        message: "Raw material could not be deleted. Refresh and try again.",
      });
    }

    req.auditRecord = {
      id: materialId,
      old: before,
      new: { action: "deleted" },
    };

    res.json({ message: "Raw material permanently deleted." });
  } catch (err) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message:
          "This raw material has linked records and cannot be permanently deleted. Archive it instead.",
        can_archive: true,
      });
    }
    res.status(500).json({ message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// STOCK MOVEMENTS
// ═══════════════════════════════════════════════════════════

exports.getStockMovements = async (req, res) => {
  try {
    const {
      type,
      source,
      search,
      from,
      to,
      product_id,
      material_id,
      page = 1,
      limit = 30,
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(200, Math.max(1, parseInt(limit, 10) || 30));
    const offset = (pageNumber - 1) * limitNumber;
    const where = ["1=1"];
    const params = [];

    const movementSourceSql = `CASE
      WHEN bmr.id IS NOT NULL THEN 'blueprint_production'
      WHEN sm.material_id IS NOT NULL
        AND sm.product_id IS NOT NULL
        AND sm.type = 'out' THEN 'build_production'
      WHEN sm.material_id IS NULL
        AND sm.product_id IS NOT NULL
        AND sm.order_id IS NULL THEN 'ready_made_stock'
      WHEN sm.order_id IS NOT NULL THEN 'order_fulfillment'
      ELSE 'manual'
    END`;

    const movementJoins = `
      LEFT JOIN users u ON u.id = sm.created_by
      LEFT JOIN raw_materials rm ON rm.id = sm.material_id
      LEFT JOIN products p ON p.id = sm.product_id
      LEFT JOIN suppliers s ON s.id = sm.supplier_id
      LEFT JOIN orders o ON o.id = sm.order_id
      LEFT JOIN users customer ON customer.id = o.customer_id
      LEFT JOIN blueprint_material_reservations bmr
        ON sm.reference = CONCAT('BLUEPRINT-RESERVATION-', bmr.id)
       AND bmr.order_id = sm.order_id
       AND bmr.material_id = sm.material_id`;

    if (type) {
      const normalizedType = String(type).trim().toLowerCase();
      if (!["in", "out", "adjustment", "return"].includes(normalizedType)) {
        return res.status(400).json({ message: "Invalid stock movement type filter." });
      }
      where.push("sm.type = ?");
      params.push(normalizedType);
    }

    if (source) {
      const normalizedSource = String(source).trim().toLowerCase();
      const allowedSources = new Set([
        "blueprint_production",
        "build_production",
        "ready_made_stock",
        "order_fulfillment",
        "manual",
      ]);
      if (!allowedSources.has(normalizedSource)) {
        return res.status(400).json({ message: "Invalid stock movement source filter." });
      }
      where.push(`(${movementSourceSql}) = ?`);
      params.push(normalizedSource);
    }

    if (product_id) {
      where.push("sm.product_id = ?");
      params.push(product_id);
    }
    if (material_id) {
      where.push("sm.material_id = ?");
      params.push(material_id);
    }
    if (from) {
      where.push("DATE(sm.created_at) >= ?");
      params.push(from);
    }
    if (to) {
      where.push("DATE(sm.created_at) <= ?");
      params.push(to);
    }
    if (search && String(search).trim()) {
      const pattern = `%${String(search).trim()}%`;
      where.push(`(
        rm.name LIKE ?
        OR p.name LIKE ?
        OR o.order_number LIKE ?
        OR customer.name LIKE ?
        OR o.walkin_customer_name LIKE ?
        OR sm.reference LIKE ?
        OR sm.notes LIKE ?
      )`);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }

    const whereSql = where.join(" AND ");

    const [rows] = await pool.query(
      `SELECT
          sm.*,
          u.name AS created_by_name,
          rm.name AS material_name,
          rm.unit AS material_unit,
          p.name AS product_name,
          s.name AS supplier_name,
          o.order_number,
          o.order_type,
          o.status AS order_status,
          o.payment_status,
          COALESCE(customer.name, o.walkin_customer_name) AS customer_name,
          bmr.id AS reservation_id,
          bmr.blueprint_id AS reservation_blueprint_id,
          bmr.estimation_id AS reservation_estimation_id,
          bmr.status AS reservation_status,
          bmr.reserved_at,
          bmr.consumed_at,
          ${movementSourceSql} AS movement_source
       FROM stock_movements sm
       ${movementJoins}
       WHERE ${whereSql}
       ORDER BY sm.created_at DESC, sm.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNumber, offset],
    );

    const [[summary]] = await pool.query(
      `SELECT
          COUNT(*) AS record_count,
          SUM(CASE WHEN sm.type = 'in' THEN 1 ELSE 0 END) AS in_count,
          SUM(CASE WHEN sm.type = 'out' THEN 1 ELSE 0 END) AS out_count,
          SUM(CASE WHEN sm.type = 'adjustment' THEN 1 ELSE 0 END) AS adjustment_count,
          SUM(CASE WHEN sm.type = 'return' THEN 1 ELSE 0 END) AS return_count,
          SUM(CASE WHEN (${movementSourceSql}) = 'blueprint_production' THEN 1 ELSE 0 END) AS blueprint_production_count,
          SUM(CASE WHEN (${movementSourceSql}) = 'build_production' THEN 1 ELSE 0 END) AS build_production_count,
          SUM(CASE WHEN (${movementSourceSql}) = 'ready_made_stock' THEN 1 ELSE 0 END) AS ready_made_stock_count,
          SUM(CASE WHEN (${movementSourceSql}) = 'order_fulfillment' THEN 1 ELSE 0 END) AS order_fulfillment_count,
          SUM(CASE WHEN (${movementSourceSql}) = 'manual' THEN 1 ELSE 0 END) AS manual_count
       FROM stock_movements sm
       ${movementJoins}
       WHERE ${whereSql}`,
      params,
    );

    res.json({
      rows,
      total: Number(summary?.record_count || 0),
      page: pageNumber,
      limit: limitNumber,
      summary: {
        record_count: Number(summary?.record_count || 0),
        in_count: Number(summary?.in_count || 0),
        out_count: Number(summary?.out_count || 0),
        adjustment_count: Number(summary?.adjustment_count || 0),
        return_count: Number(summary?.return_count || 0),
        blueprint_production_count: Number(
          summary?.blueprint_production_count || 0,
        ),
        build_production_count: Number(summary?.build_production_count || 0),
        ready_made_stock_count: Number(summary?.ready_made_stock_count || 0),
        order_fulfillment_count: Number(
          summary?.order_fulfillment_count || 0,
        ),
        manual_count: Number(summary?.manual_count || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createStockMovement = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const {
      material_id,
      product_id,
      type,
      quantity,
      supplier_id,
      order_id,
      reference,
      notes,
    } = req.body;

    const movementQty = Number(quantity);

    if (!["in", "out", "adjustment", "return"].includes(type)) {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid stock movement type." });
    }

    if (!material_id && !product_id) {
      await conn.rollback();
      return res.status(400).json({
        message: "Please select either a raw material or a ready-made product.",
      });
    }

    if (material_id && product_id) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Only one target is allowed per movement: raw material or ready-made product.",
      });
    }

    if (Number.isNaN(movementQty) || movementQty <= 0) {
      await conn.rollback();
      return res.status(400).json({
        message: "Quantity must be a valid number greater than 0.",
      });
    }

    if (
      supplier_id !== null &&
      supplier_id !== undefined &&
      supplier_id !== "" &&
      (!isValidNonNegativeInteger(supplier_id) || Number(supplier_id) <= 0)
    ) {
      await conn.rollback();
      return res.status(400).json({ message: "Supplier must be a valid selection." });
    }

    if (
      order_id !== null &&
      order_id !== undefined &&
      order_id !== "" &&
      (!isValidNonNegativeInteger(order_id) || Number(order_id) <= 0)
    ) {
      await conn.rollback();
      return res.status(400).json({ message: "Order reference must be a valid selection." });
    }

    const delta = POSITIVE_MOVEMENT_TYPES.has(type)
      ? movementQty
      : -movementQty;

    // ───────────────────────────────────────────────────────────
    // RAW MATERIAL DIRECT MOVEMENT
    // ───────────────────────────────────────────────────────────
    if (material_id) {
      const materialId = parseInt(material_id, 10);

      const [[material]] = await conn.query(
        `SELECT id, name, unit, quantity, reorder_point, is_active
         FROM raw_materials
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [materialId],
      );

      if (!material) {
        await conn.rollback();
        return res.status(404).json({ message: "Raw material not found." });
      }

      if (Number(material.is_active) !== 1) {
        await conn.rollback();
        return res.status(409).json({
          message:
            "Archived raw materials cannot receive stock movements. Restore the material first.",
        });
      }

      const activeReservations = await lockActiveBlueprintReservations(
        conn,
        materialId,
      );
      const reservedByMaterial =
        getReservedQuantityByMaterial(activeReservations);
      const reservedQty = reservedByMaterial.get(materialId) || 0;
      const currentQty = normalizeQuantity(material.quantity);
      const availableQty = Math.max(0, currentQty - reservedQty);
      const isPhysicalDecrease = !POSITIVE_MOVEMENT_TYPES.has(type);

      if (isPhysicalDecrease && movementQty > availableQty + 0.0000001) {
        await conn.rollback();
        return res.status(409).json({
          message: `${material.name} has only ${formatQuantityForMessage(
            availableQty,
          )} ${material.unit || "unit"} available for manual withdrawal. ${formatQuantityForMessage(
            reservedQty,
          )} ${material.unit || "unit"} is protected for paid blueprint orders.`,
          material_id: materialId,
          on_hand: currentQty,
          reserved: reservedQty,
          available: availableQty,
          requested: movementQty,
        });
      }

      const newQty = currentQty + delta;

      if (newQty < -0.0000001) {
        await conn.rollback();
        return res.status(400).json({
          message: `Insufficient stock for ${material.name}. On hand: ${formatQuantityForMessage(
            currentQty,
          )}, needed: ${formatQuantityForMessage(movementQty)}.`,
        });
      }

      const [movementResult] = await conn.query(
        `INSERT INTO stock_movements
           (material_id, product_id, type, quantity, supplier_id, order_id,
            reference, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          materialId,
          null,
          type,
          movementQty,
          supplier_id ? parseInt(supplier_id, 10) : null,
          order_id ? parseInt(order_id, 10) : null,
          reference || null,
          notes || null,
          parseInt(req.user.id, 10),
        ],
      );

      const [stockUpdateResult] = await conn.query(
        `UPDATE raw_materials
         SET quantity = ?, stock_status = ?
         WHERE id = ?`,
        [
          Math.max(0, newQty),
          computeStockStatus(Math.max(0, newQty), material.reorder_point),
          materialId,
        ],
      );

      if (stockUpdateResult.affectedRows !== 1) {
        await conn.rollback();
        return res.status(409).json({
          message:
            "Raw material stock changed before the movement could be completed. Refresh and try again.",
        });
      }

      await conn.commit();

      let reservationRecovery = null;
      if (POSITIVE_MOVEMENT_TYPES.has(type)) {
        try {
          reservationRecovery =
            await retryPendingStockReservationsForMaterial(pool, {
              materialId,
              actorUserId: parseInt(req.user.id, 10),
            });
        } catch (recoveryError) {
          // The stock increase is already committed. Report a warning instead
          // of asking the user to repeat the physical stock movement.
          console.error(
            "[BPI-9] Pending-stock recovery failed after stock increase:",
            recoveryError,
          );
          reservationRecovery = {
            triggered: true,
            material_id: materialId,
            candidate_count: null,
            attempted_count: 0,
            recovered_count: 0,
            still_pending_count: 0,
            unchanged_count: 0,
            failed_count: 1,
            stopped_for_fifo: true,
            recovered_order_ids: [],
            pending_order_ids: [],
            failures: [
              {
                order_id: null,
                code:
                  recoveryError?.code || "PENDING_STOCK_RECOVERY_FAILED",
                message:
                  recoveryError?.message ||
                  "Pending-stock recovery failed after stock increased.",
              },
            ],
          };
        }
      }

      req.auditRecord = {
        id: movementResult.insertId,
        old: null,
        new: {
          material_id: materialId,
          product_id: null,
          type,
          quantity: movementQty,
          supplier_id: supplier_id ? parseInt(supplier_id, 10) : null,
          order_id: order_id ? parseInt(order_id, 10) : null,
          reference: reference || null,
          notes: notes || null,
          previous_stock: currentQty,
          reserved_stock: reservedQty,
          available_before: availableQty,
          new_stock: Math.max(0, newQty),
          available_after: Math.max(0, newQty - reservedQty),
          reservation_recovery: reservationRecovery,
        },
      };

      const recoveredCount = Number(
        reservationRecovery?.recovered_count || 0,
      );
      const recoveryFailed =
        Number(reservationRecovery?.failed_count || 0) > 0;

      let responseMessage = "Stock movement recorded.";
      if (recoveryFailed) {
        responseMessage =
          "Stock movement recorded, but pending blueprint reservation recovery needs review.";
      } else if (recoveredCount > 0) {
        responseMessage = `Stock movement recorded. ${recoveredCount} pending blueprint material reservation${
          recoveredCount === 1 ? " was" : "s were"
        } recovered.`;
      }

      return res.status(201).json({
        message: responseMessage,
        id: movementResult.insertId,
        reservation_recovery: reservationRecovery,
      });
    }

    // WISDOM READY-MADE STOCK MOVEMENT V1
    // ───────────────────────────────────────────────────────────
    // READY-MADE PRODUCT MOVEMENT
    // ───────────────────────────────────────────────────────────
    const [[product]] = await conn.query(
      `SELECT id, name, type, stock, reorder_point
       FROM products
       WHERE id = ?
       FOR UPDATE`,
      [parseInt(product_id)],
    );

    if (!product) {
      await conn.rollback();
      return res.status(404).json({ message: "Ready-made product not found." });
    }

    if (String(product.type || "").toLowerCase() === "blueprint") {
      await conn.rollback();
      return res.status(409).json({
        message:
          "Blueprint products are made to order and do not use finished-product stock movements.",
      });
    }

    const currentProductStock = Number(product.stock) || 0;

    // PRODUCT STOCK-IN = RECEIVE READY-MADE FINISHED PRODUCT
    // Ready-made products are treated as complete inventory items.
    // No raw-material BOM deduction is performed here.
    if (type === "in") {
      const [movementResult] = await conn.query(
        `INSERT INTO stock_movements
           (material_id, product_id, type, quantity, supplier_id, order_id,
            reference, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          null,
          parseInt(product_id, 10),
          type,
          movementQty,
          supplier_id ? parseInt(supplier_id, 10) : null,
          order_id ? parseInt(order_id, 10) : null,
          reference || null,
          notes || null,
          parseInt(req.user.id, 10),
        ],
      );

      const newProductStock = currentProductStock + movementQty;

      const [stockUpdateResult] = await conn.query(
        `UPDATE products
         SET stock = ?, stock_status = ?
         WHERE id = ?`,
        [
          newProductStock,
          computeStockStatus(newProductStock, product.reorder_point),
          parseInt(product_id, 10),
        ],
      );

      if (stockUpdateResult.affectedRows !== 1) {
        await conn.rollback();
        return res.status(409).json({
          message:
            "Product stock changed before the movement could be completed. Refresh and try again.",
        });
      }

      await conn.commit();

      req.auditRecord = {
        id: movementResult.insertId,
        old: null,
        new: {
          material_id: null,
          product_id: parseInt(product_id, 10),
          type,
          quantity: movementQty,
          supplier_id: supplier_id ? parseInt(supplier_id, 10) : null,
          order_id: order_id ? parseInt(order_id, 10) : null,
          reference: reference || null,
          notes: notes || null,
          previous_stock: currentProductStock,
          new_stock: newProductStock,
        },
      };

      return res.status(201).json({
        message: "Ready-made product stock added.",
        id: movementResult.insertId,
      });
    }

    // PRODUCT STOCK-OUT / RETURN / ADJUSTMENT
    const newProductStock = currentProductStock + delta;

    if (newProductStock < 0) {
      await conn.rollback();
      return res.status(400).json({
        message: `Insufficient stock for ${product.name}. Available: ${currentProductStock}, needed: ${movementQty}.`,
      });
    }

    const [r] = await conn.query(
      `INSERT INTO stock_movements
         (material_id, product_id, type, quantity, supplier_id, order_id, reference, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        null,
        parseInt(product_id),
        type,
        movementQty,
        supplier_id ? parseInt(supplier_id) : null,
        order_id ? parseInt(order_id) : null,
        reference || null,
        notes || null,
        parseInt(req.user.id),
      ],
    );

    await conn.query(
      `UPDATE products
       SET stock = ?, stock_status = ?
       WHERE id = ?`,
      [
        newProductStock,
        computeStockStatus(newProductStock, product.reorder_point),
        parseInt(product_id),
      ],
    );

    await conn.commit();

    req.auditRecord = {
      id: r.insertId,
      old: null,
      new: {
        material_id: null,
        product_id: parseInt(product_id),
        type,
        quantity: movementQty,
        supplier_id: supplier_id ? parseInt(supplier_id) : null,
        order_id: order_id ? parseInt(order_id) : null,
        reference: reference || null,
        notes: notes || null,
        previous_stock: currentProductStock,
        new_stock: newProductStock,
      },
    };

    return res.status(201).json({
      message: "Stock movement recorded.",
      id: r.insertId,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════════

exports.getSuppliers = async (req, res) => {
  try {
    const { search } = req.query;
    const where = search ? "WHERE name LIKE ?" : "";
    const params = search ? [`%${search}%`] : [];
    const [rows] = await pool.query(
      `SELECT * FROM suppliers ${where} ORDER BY name ASC`,
      params,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const { name, address, contact_number, email } = req.body;

    if (!isNonEmptyString(name)) {
      return res.status(400).json({ message: "Supplier name is required." });
    }

    if (
      contact_number !== null &&
      contact_number !== undefined &&
      contact_number !== "" &&
      !isValidPhoneNumber(contact_number)
    ) {
      return res.status(400).json({
        message:
          "Contact number must be a valid phone number (digits, spaces, dashes, or + only).",
      });
    }

    if (
      email !== null &&
      email !== undefined &&
      email !== "" &&
      !isValidEmail(email)
    ) {
      return res.status(400).json({ message: "Email must be a valid email address." });
    }

    const [r] = await pool.query(
      "INSERT INTO suppliers (name, address, contact_number, email) VALUES (?,?,?,?)",
      [name, address, contact_number, email],
    );

    const [[savedSupplier]] = await pool.query(
      "SELECT id, name, address, contact_number, email FROM suppliers WHERE id = ?",
      [r.insertId],
    );

    if (savedSupplier) {
      req.auditRecord = { id: r.insertId, old: null, new: savedSupplier };
    }

    res.status(201).json({ message: "Supplier created.", id: r.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const { name, address, contact_number, email } = req.body;

    if (!isNonEmptyString(name)) {
      return res.status(400).json({ message: "Supplier name is required." });
    }

    if (
      contact_number !== null &&
      contact_number !== undefined &&
      contact_number !== "" &&
      !isValidPhoneNumber(contact_number)
    ) {
      return res.status(400).json({
        message:
          "Contact number must be a valid phone number (digits, spaces, dashes, or + only).",
      });
    }

    if (
      email !== null &&
      email !== undefined &&
      email !== "" &&
      !isValidEmail(email)
    ) {
      return res.status(400).json({ message: "Email must be a valid email address." });
    }

    const supplierId = parseInt(req.params.id);

    const [[before]] = await pool.query(
      "SELECT id, name, address, contact_number, email FROM suppliers WHERE id = ?",
      [supplierId],
    );

    const [updateResult] = await pool.query(
      "UPDATE suppliers SET name=?,address=?,contact_number=?,email=? WHERE id=?",
      [name, address, contact_number, email, supplierId],
    );

    if (before && updateResult.affectedRows > 0) {
      const [[after]] = await pool.query(
        "SELECT id, name, address, contact_number, email FROM suppliers WHERE id = ?",
        [supplierId],
      );

      if (after) {
        req.auditRecord = { id: supplierId, old: before, new: after };
      }
    }

    res.json({ message: "Supplier updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSupplier = async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);

    const [[before]] = await pool.query(
      "SELECT id, name, address, contact_number, email FROM suppliers WHERE id = ?",
      [supplierId],
    );

    const [deleteResult] = await pool.query(
      "DELETE FROM suppliers WHERE id = ?",
      [supplierId],
    );

    if (before && deleteResult.affectedRows > 0) {
      req.auditRecord = {
        id: supplierId,
        old: before,
        new: { action: "deleted" },
      };
    }

    res.json({ message: "Supplier deleted." });
  } catch (err) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        message:
          "Cannot delete this supplier because it is linked to one or more raw materials or stock movement records.",
      });
    }
    res.status(500).json({ message: err.message });
  }
};