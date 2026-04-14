// controllers/staff/pos.products.js
const db = require("../../config/db"); // Uses the unified db config

/* ── Full Inventory List (For Lookup) ── */
exports.getAllInventory = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and added empty array [] ──
    const [rows] = await db.query(
      `
      SELECT
        p.id,
        p.barcode,
        p.name,
        p.description,
        p.image_url,
        p.walkin_price,
        p.online_price,
        p.production_cost,
        p.stock,
        p.stock_status,
        p.reorder_point,
        p.type,
        c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY
        CASE
          WHEN p.stock_status = 'in_stock' THEN 1
          WHEN p.stock_status = 'low_stock' THEN 2
          WHEN p.stock_status = 'out_of_stock' THEN 3
          ELSE 4
        END,
        p.name ASC
    `,
      [],
    );

    res.json(rows);
  } catch (err) {
    console.error("[POS PRODUCTS ALL ERROR]:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── Search Products (Barcode or Keyword) ── */
exports.searchProducts = async (req, res) => {
  const { q, barcode } = req.query;

  try {
    let query = `
      SELECT
        p.id,
        p.barcode,
        p.name,
        p.description,
        p.image_url,
        p.walkin_price,
        p.online_price,
        p.production_cost,
        p.stock,
        p.stock_status,
        p.type,
        c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE 1=1
    `;
    const params = [];

    if (barcode && String(barcode).trim()) {
      query += ` AND p.barcode = ?`;
      params.push(String(barcode).trim());
    } else if (q && String(q).trim()) {
      const keyword = `%${String(q).trim()}%`;
      query += `
        AND (
          p.name LIKE ?
          OR p.barcode LIKE ?
          OR c.name LIKE ?
          OR p.type LIKE ?
        )
      `;
      params.push(keyword, keyword, keyword, keyword);
    }

    query += `
      ORDER BY
        CASE
          WHEN p.stock_status = 'in_stock' THEN 1
          WHEN p.stock_status = 'low_stock' THEN 2
          WHEN p.stock_status = 'out_of_stock' THEN 3
          ELSE 4
        END,
        p.name ASC
      LIMIT 100
    `;

    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(query, params);

    for (const product of rows) {
      product.price =
        parseFloat(product.walkin_price) > 0
          ? parseFloat(product.walkin_price)
          : parseFloat(product.online_price || 0);

      // ── FIXED: Switched to .query ──
      const [vars] = await db.query(
        `
        SELECT
          id,
          variation_type,
          variation_value,
          variation_name,
          selling_price,
          unit_cost,
          stock
        FROM product_variations
        WHERE product_id = ?
        ORDER BY id ASC
        `,
        [product.id],
      );

      product.variations = vars;
    }

    res.json(rows);
  } catch (err) {
    console.error("[POS PRODUCTS ERROR]:", err);
    res.status(500).json({ message: "Server error" });
  }
};
