const db = require("../../config/db");

const toInt = (value, fallback = 0) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildWhereClause = ({
  q,
  category_id,
  type,
  stock_status,
  price_min,
  price_max,
  includePrice = true,
}) => {
  let where = "WHERE p.is_published = 1";
  const params = [];

  if (q) {
    where += " AND (p.name LIKE ? OR p.barcode LIKE ? OR p.description LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (category_id) {
    where += " AND p.category_id = ?";
    params.push(toInt(category_id));
  }

  if (type) {
    where += " AND p.type = ?";
    params.push(type);
  }

  if (stock_status) {
    where += " AND p.stock_status = ?";
    params.push(stock_status);
  }

  if (includePrice) {
    const minPrice = toFloat(price_min);
    const maxPrice = toFloat(price_max);

    if (minPrice !== null) {
      where += " AND p.online_price >= ?";
      params.push(minPrice);
    }

    if (maxPrice !== null) {
      where += " AND p.online_price <= ?";
      params.push(maxPrice);
    }
  }

  return { where, params };
};

/* ── Get All Products (Catalog) ── */
exports.getAllProducts = async (req, res) => {
  const {
    q = "",
    category_id = "",
    type = "standard",
    stock_status = "",
    price_min = "",
    price_max = "",
    sort = "name_asc",
    page = 1,
    limit = 24,
  } = req.query;

  try {
    const safePage = Math.max(toInt(page, 1), 1);
    const safeLimit = Math.min(Math.max(toInt(limit, 24), 1), 60);
    const offset = (safePage - 1) * safeLimit;

    const { where, params } = buildWhereClause({
      q,
      category_id,
      type,
      stock_status,
      price_min,
      price_max,
      includePrice: true,
    });

    const { where: statsWhere, params: statsParams } = buildWhereClause({
      q,
      category_id,
      type,
      stock_status,
      price_min,
      price_max,
      includePrice: false,
    });

    const sortMap = {
      name_asc: "p.name ASC",
      name_desc: "p.name DESC",
      price_asc: "p.online_price ASC",
      price_desc: "p.online_price DESC",
      newest: "p.created_at DESC",
    };

    const orderBy = sortMap[sort] || "p.name ASC";

    const [products] = await db.query(
      `
      SELECT
        p.id,
        p.barcode,
        p.name,
        p.description,
        p.category_id,
        p.type,
        p.image_url,
        p.is_featured,
        p.online_price,
        p.production_cost,
        p.stock,
        p.stock_status,
        p.reorder_point,
        p.created_at,
        c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
      `,
      [...params, safeLimit, offset],
    );

    if (products.length > 0) {
      const productIds = products.map((product) => product.id);

      const [variationRows] = await db.query(
        `
        SELECT
          id,
          product_id,
          variation_type,
          variation_value,
          variation_name,
          selling_price,
          unit_cost,
          stock
        FROM product_variations
        WHERE product_id IN (?)
        ORDER BY id ASC
        `,
        [productIds],
      );

      const variationMap = new Map();

      variationRows.forEach((variation) => {
        if (!variationMap.has(variation.product_id)) {
          variationMap.set(variation.product_id, []);
        }
        variationMap.get(variation.product_id).push(variation);
      });

      products.forEach((product) => {
        product.variations = variationMap.get(product.id) || [];
      });
    }

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM products p
      ${where}
      `,
      params,
    );

    const [categories] = await db.query(`
      SELECT
        c.id,
        c.name,
        COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p
        ON p.category_id = c.id
       AND p.type = 'standard'
      GROUP BY c.id, c.name
      HAVING COUNT(p.id) > 0
      ORDER BY c.name ASC
    `);

    const [priceStatsRows] = await db.query(
      `
      SELECT
        COALESCE(MIN(p.online_price), 0) AS min,
        COALESCE(MAX(p.online_price), 0) AS max
      FROM products p
      ${statsWhere}
      `,
      statsParams,
    );

    res.json({
      products,
      categories,
      total: Number(countRows[0]?.total || 0),
      page: safePage,
      limit: safeLimit,
      priceRange: {
        min: Number(priceStatsRows[0]?.min || 0),
        max: Number(priceStatsRows[0]?.max || 0),
      },
    });
  } catch (err) {
    console.error("[customer.products]", err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

/* ── Get Single Product Detail By ID ── */
exports.getProductById = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT
        p.*,
        c.name AS categoryvv
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ? AND p.is_published = 1
      `,
      [req.params.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Product not found." });
    }

    const product = rows[0];

    const [vars] = await db.execute(
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

    res.json(product);
  } catch (err) {
    console.error("[customer.products/:id]", err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};
