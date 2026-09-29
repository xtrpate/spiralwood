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
        COALESCE(rmds.quantity, 0) AS stock,
        CASE
          WHEN COALESCE(rmds.quantity, 0) <= 0 THEN 'out_of_stock'
          WHEN COALESCE(rmds.quantity, 0) <= COALESCE(p.reorder_point, 0) THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_status,
        p.reorder_point,
        p.type,
        c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN ready_made_display_stock rmds ON rmds.product_id = p.id
      ORDER BY
        CASE
          WHEN COALESCE(rmds.quantity, 0) <= 0 THEN 3
          WHEN COALESCE(rmds.quantity, 0) <= COALESCE(p.reorder_point, 0) THEN 2
          ELSE 1
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
  const normalizedQuery = typeof q === "string" ? q.trim() : "";
  const normalizedBarcode = typeof barcode === "string" ? barcode.trim() : "";

  if (normalizedQuery.length > 100 || normalizedBarcode.length > 100) {
    return res.status(400).json({ message: "Product search is too long." });
  }

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
        COALESCE(rmds.quantity, 0) AS stock,
        CASE
          WHEN COALESCE(rmds.quantity, 0) <= 0 THEN 'out_of_stock'
          WHEN COALESCE(rmds.quantity, 0) <= COALESCE(p.reorder_point, 0) THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_status,
        p.type,
        c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN ready_made_display_stock rmds ON rmds.product_id = p.id
      WHERE p.type = 'standard'
        AND COALESCE(p.is_active, 0) = 1
    `;
    const params = [];

    if (normalizedBarcode) {
      query += ` AND p.barcode = ?`;
      params.push(normalizedBarcode);
    } else if (normalizedQuery) {
      const keyword = `%${normalizedQuery}%`;
      query += `
        AND (
          p.name LIKE ?
          OR p.barcode LIKE ?
          OR c.name LIKE ?
        )
      `;
      params.push(keyword, keyword, keyword);
    }

    query += `
      ORDER BY
        CASE
          WHEN COALESCE(rmds.quantity, 0) <= 0 THEN 3
          WHEN COALESCE(rmds.quantity, 0) <= COALESCE(p.reorder_point, 0) THEN 2
          ELSE 1
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
    }

    res.json(rows);
  } catch (err) {
    console.error("[POS PRODUCTS ERROR]:", err);
    res.status(500).json({ message: "Server error" });
  }
};
