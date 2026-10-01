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
  const { q, barcode, ids } = req.query;
  const normalizedQuery = typeof q === "string" ? q.trim() : "";
  const normalizedBarcode = typeof barcode === "string" ? barcode.trim() : "";

  if (normalizedQuery.length > 100 || normalizedBarcode.length > 100) {
    return res.status(400).json({ message: "Product search is too long." });
  }

  let normalizedIds = [];
  if (ids !== undefined) {
    if (typeof ids !== "string" || !ids.trim()) {
      return res.status(400).json({ message: "Product ids are invalid." });
    }

    const rawIds = ids.split(",");
    if (rawIds.length > 100) {
      return res.status(400).json({ message: "Too many product ids." });
    }

    normalizedIds = [
      ...new Set(
        rawIds.map((value) => {
          const trimmed = value.trim();
          if (!/^\d+$/.test(trimmed)) return null;

          const parsed = Number(trimmed);
          return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
        }),
      ),
    ];

    if (
      normalizedIds.length === 0 ||
      normalizedIds.some((value) => value === null)
    ) {
      return res.status(400).json({ message: "Product ids are invalid." });
    }
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

    if (normalizedIds.length > 0) {
      const placeholders = normalizedIds.map(() => "?").join(",");
      query += ` AND p.id IN (${placeholders})`;
      params.push(...normalizedIds);
    } else if (normalizedBarcode) {
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
      // The current business UI has one selling price. The database still
      // carries legacy online/walk-in columns, so the POS must expose the
      // exact same legacy field consumed by cash checkout instead of falling
      // back to a different price and showing a value checkout will reject.
      const cashierPrice = Number(product.walkin_price);
      const hasValidCashierPrice =
        Number.isFinite(cashierPrice) && cashierPrice > 0;

      product.price = hasValidCashierPrice ? cashierPrice : null;
      product.cashier_sale_available = hasValidCashierPrice;
    }

    res.json(rows);
  } catch (err) {
    console.error("[POS PRODUCTS ERROR]:", err);
    res.status(500).json({ message: "Server error" });
  }
};
