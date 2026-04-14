// controllers/productController.js – Product Management (Admin)
const pool = require("../../config/db");

// ── GET /api/products ─────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const {
      search,
      type,
      status,
      category_id,
      featured,
      page = 1,
      limit = 20,
    } = req.query;
    const offset = (page - 1) * limit;
    const where = ["1=1"];
    const params = [];

    if (search) {
      where.push("(p.name LIKE ? OR p.barcode LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (type) {
      where.push("p.type = ?");
      params.push(type);
    }
    if (status) {
      where.push("p.stock_status = ?");
      params.push(status);
    }
    if (category_id) {
      where.push("p.category_id = ?");
      params.push(category_id);
    }
    if (featured) {
      where.push("p.is_featured = ?");
      params.push(featured === "true" ? 1 : 0);
    }

    const [products] = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where.join(" AND ")}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p WHERE ${where.join(" AND ")}`,
      params,
    );

    res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/products/:id ─────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [[product]] = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`,
      [req.params.id],
    );
    if (!product)
      return res.status(404).json({ message: "Product not found." });

    const [variations] = await pool.query(
      "SELECT * FROM product_variations WHERE product_id = ?",
      [req.params.id],
    );
    const [bom] = await pool.query(
      `SELECT bom.*, rm.name AS material_name, rm.unit
       FROM bill_of_materials bom
       JOIN raw_materials rm ON rm.id = bom.raw_material_id
       WHERE bom.product_id = ?`,
      [req.params.id],
    );

    res.json({ ...product, variations, bill_of_materials: bom });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/products ────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      barcode,
      name,
      description,
      category_id,
      type = "standard",
      online_price,
      walkin_price,
      production_cost,
      stock,
      reorder_point,
      is_featured = false,
      variations = "[]",
      bill_of_materials = "[]",
    } = req.body;

    const image_url = req.file
      ? `/uploads/products/${req.file.filename}`
      : null;

    const [result] = await conn.query(
      `INSERT INTO products
         (barcode, name, description, category_id, type, image_url, is_featured,
          online_price, walkin_price, production_cost, stock, reorder_point)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        barcode,
        name,
        description,
        category_id,
        type,
        image_url,
        is_featured ? 1 : 0,
        online_price,
        walkin_price,
        production_cost,
        stock,
        reorder_point,
      ],
    );
    const productId = result.insertId;

    // Auto-set stock_status
    await conn.query(
      `UPDATE products SET stock_status =
         CASE WHEN stock <= 0 THEN 'out_of_stock'
              WHEN stock <= reorder_point THEN 'low_stock'
              ELSE 'in_stock' END
       WHERE id = ?`,
      [productId],
    );

    // Variations
    const parsedVars = JSON.parse(variations);
    for (const v of parsedVars) {
      await conn.query(
        `INSERT INTO product_variations
           (product_id, variation_type, variation_value, variation_name,
            unit_cost, selling_price, stock)
         VALUES (?,?,?,?,?,?,?)`,
        [
          productId,
          v.type,
          v.value,
          v.name,
          v.unit_cost,
          v.selling_price,
          v.stock || 0,
        ],
      );
    }

    // Bill of Materials
    const parsedBOM = JSON.parse(bill_of_materials);
    for (const b of parsedBOM) {
      await conn.query(
        "INSERT INTO bill_of_materials (product_id, raw_material_id, quantity) VALUES (?,?,?)",
        [productId, b.raw_material_id, b.quantity],
      );
    }

    await conn.commit();
    req.auditRecord = { id: productId, new: { name, type } };
    res.status(201).json({ message: "Product created.", id: productId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── PUT /api/products/:id ─────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[old]] = await conn.query("SELECT * FROM products WHERE id = ?", [
      req.params.id,
    ]);
    if (!old) return res.status(404).json({ message: "Product not found." });

    const fields = { ...req.body };
    delete fields.variations;
    delete fields.bill_of_materials;
    if (req.file) fields.image_url = `/uploads/products/${req.file.filename}`;

    const sets = Object.keys(fields)
      .map((k) => `${k} = ?`)
      .join(", ");
    const vals = [...Object.values(fields), req.params.id];
    await conn.query(`UPDATE products SET ${sets} WHERE id = ?`, vals);

    // Recalculate stock_status
    await conn.query(
      `UPDATE products SET stock_status =
         CASE WHEN stock <= 0 THEN 'out_of_stock'
              WHEN stock <= reorder_point THEN 'low_stock'
              ELSE 'in_stock' END
       WHERE id = ?`,
      [req.params.id],
    );

    // Replace variations if provided
    if (req.body.variations) {
      await conn.query("DELETE FROM product_variations WHERE product_id = ?", [
        req.params.id,
      ]);
      for (const v of JSON.parse(req.body.variations)) {
        await conn.query(
          `INSERT INTO product_variations
             (product_id, variation_type, variation_value, variation_name,
              unit_cost, selling_price, stock)
           VALUES (?,?,?,?,?,?,?)`,
          [
            req.params.id,
            v.type,
            v.value,
            v.name,
            v.unit_cost,
            v.selling_price,
            v.stock || 0,
          ],
        );
      }
    }

    // Replace BOM if provided
    if (req.body.bill_of_materials) {
      await conn.query("DELETE FROM bill_of_materials WHERE product_id = ?", [
        req.params.id,
      ]);
      for (const b of JSON.parse(req.body.bill_of_materials)) {
        await conn.query(
          "INSERT INTO bill_of_materials (product_id, raw_material_id, quantity) VALUES (?,?,?)",
          [req.params.id, b.raw_material_id, b.quantity],
        );
      }
    }

    await conn.commit();
    req.auditRecord = { id: req.params.id, old, new: fields };
    res.json({ message: "Product updated." });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── DELETE /api/products/:id ──────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const [[p]] = await pool.query(
      "SELECT id, name FROM products WHERE id = ?",
      [req.params.id],
    );
    if (!p) return res.status(404).json({ message: "Product not found." });

    await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
    req.auditRecord = { id: req.params.id, old: p };
    res.json({ message: "Product deleted." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/products/:id/featured ─────────────────────────────────────────
exports.toggleFeatured = async (req, res) => {
  try {
    await pool.query(
      "UPDATE products SET is_featured = NOT is_featured WHERE id = ?",
      [req.params.id],
    );
    const [[{ is_featured }]] = await pool.query(
      "SELECT is_featured FROM products WHERE id = ?",
      [req.params.id],
    );
    res.json({ is_featured: !!is_featured });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/products/report ──────────────────────────────────────────────────
exports.getReport = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.barcode, p.name, c.name AS category, p.type,
              p.online_price, p.walkin_price, p.production_cost,
              p.profit_margin, p.stock, p.stock_status, p.is_featured
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.name ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
