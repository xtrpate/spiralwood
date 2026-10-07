// controllers/productController.js – Product Management (Admin)
const pool = require("../../config/db");
const {
  isValidNonNegativeNumber,
  isValidNonNegativeInteger,
  isNonEmptyString,
} = require("../../utils/validators");
const { writeAuditLogSafe } = require("../../middleware/auditLog");
const MAX_HOMEPAGE_NEW_PRODUCTS = 4;
const NEW_PRODUCT_LIMIT_MESSAGE =
  "You can show up to 4 new products on the homepage.";

const MAX_PRODUCT_IMAGES = 6;

// Product field limits must match the database schema.
const MAX_PRODUCT_NAME_LENGTH = 200;
const MAX_PRODUCT_BARCODE_LENGTH = 100;
const MAX_PRODUCT_DESCRIPTION_LENGTH = 5000;

// products.*_price are DECIMAL(10,2).
const MAX_PRODUCT_PRICE = 99999999.99;

// bill_of_materials.quantity is DECIMAL(10,2).
const MAX_BOM_QUANTITY = 99999999.99;

function parseBOMQuantity(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const raw = String(value).trim();

  // BOM quantities must be non-negative numbers with at most 2 decimals.
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(
      "Bill of materials quantity must be a valid non-negative number with up to 2 decimal places.",
    );
  }

  const number = Number(raw);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(
      "Bill of materials quantity must be a valid non-negative number.",
    );
  }

  if (number > MAX_BOM_QUANTITY) {
    throw new Error("Bill of materials quantity cannot exceed 99,999,999.99.");
  }

  return number;
}

function normalizeProductName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return null;
  }

  if (normalized.length > MAX_PRODUCT_NAME_LENGTH) {
    return null;
  }

  return normalized;
}

function normalizeProductBarcode(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > MAX_PRODUCT_BARCODE_LENGTH) {
    return null;
  }

  // Barcode/SKU values should not contain whitespace or control characters.
  if (/[\s\u0000-\u001F\u007F]/.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeProductDescription(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  if (value.length > MAX_PRODUCT_DESCRIPTION_LENGTH) {
    return null;
  }

  return value;
}

function parseStrictBoolean(value, fieldName) {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return 1;
  }

  if (value === false || value === 0 || value === "0" || value === "false") {
    return 0;
  }

  throw new Error(`${fieldName} must be true or false.`);
}

function parseProductPrice(value, fieldName, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new Error(`${fieldName} is required.`);
    }

    return 0;
  }

  const raw = String(value).trim();

  // Product prices use at most two decimal places.
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(
      `${fieldName} must be a valid non-negative amount with up to 2 decimal places.`,
    );
  }

  const number = Number(raw);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} must be a valid non-negative amount.`);
  }

  if (number > MAX_PRODUCT_PRICE) {
    throw new Error(`${fieldName} cannot exceed ₱99,999,999.99.`);
  }

  return number;
}

function parseGalleryOrder(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  let parsed = rawValue;

  if (typeof rawValue === "string") {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      throw new Error("Product image order is invalid.");
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Product image order is invalid.");
  }

  if (parsed.length > MAX_PRODUCT_IMAGES) {
    throw new Error(`A product can have up to ${MAX_PRODUCT_IMAGES} images.`);
  }

  return parsed;
}

function getGalleryUploads(req) {
  const legacy = req.productImageUploads?.legacy || null;
  const gallery = Array.isArray(req.productImageUploads?.gallery)
    ? req.productImageUploads.gallery
    : [];

  return {
    legacy,
    gallery,
    all: [...(legacy ? [legacy] : []), ...gallery],
  };
}

function resolveCreateGalleryUrls(req, galleryOrder) {
  const uploads = getGalleryUploads(req);
  const files = uploads.gallery.length
    ? uploads.gallery
    : uploads.legacy
      ? [uploads.legacy]
      : [];

  if (files.length > MAX_PRODUCT_IMAGES) {
    throw new Error(`A product can have up to ${MAX_PRODUCT_IMAGES} images.`);
  }

  if (galleryOrder === null) {
    return files.map((file) => file.path);
  }

  if (uploads.legacy) {
    throw new Error(
      "The legacy product image field cannot be mixed with gallery ordering.",
    );
  }

  const usedNewIndexes = new Set();
  const urls = [];

  for (const entry of galleryOrder) {
    if (!entry || String(entry.type || "") !== "new") {
      throw new Error(
        "New products can only reference newly uploaded gallery images.",
      );
    }

    const index = Number(entry.index);

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= uploads.gallery.length ||
      usedNewIndexes.has(index)
    ) {
      throw new Error("Product image order contains an invalid upload.");
    }

    usedNewIndexes.add(index);
    urls.push(uploads.gallery[index].path);
  }

  if (usedNewIndexes.size !== uploads.gallery.length) {
    throw new Error(
      "Every uploaded product image must appear in the image order.",
    );
  }

  return urls;
}

async function getProductGallery(conn, productId) {
  const [rows] = await conn.query(
    `SELECT id, product_id, image_url, sort_order, is_primary
     FROM product_images
     WHERE product_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [productId],
  );

  return rows;
}

async function syncLegacyPrimaryGalleryImage(conn, productId, imageUrl) {
  const rows = await getProductGallery(conn, productId);

  await conn.query(
    "UPDATE product_images SET is_primary = 0 WHERE product_id = ?",
    [productId],
  );

  const primary =
    rows.find((row) => Number(row.is_primary) === 1) || rows[0] || null;

  if (primary) {
    await conn.query(
      `UPDATE product_images
       SET image_url = ?, sort_order = 0, is_primary = 1
       WHERE id = ? AND product_id = ?`,
      [imageUrl, primary.id, productId],
    );
    return;
  }

  await conn.query(
    `INSERT INTO product_images
       (product_id, image_url, sort_order, is_primary)
     VALUES (?, ?, 0, 1)`,
    [productId, imageUrl],
  );
}

async function applyProductGalleryOrder(
  conn,
  { productId, order, newFiles, legacyImageUrl },
) {
  if (!Array.isArray(order)) {
    throw new Error("Product image order is invalid.");
  }

  if (order.length > MAX_PRODUCT_IMAGES) {
    throw new Error(`A product can have up to ${MAX_PRODUCT_IMAGES} images.`);
  }

  if (newFiles.length > MAX_PRODUCT_IMAGES) {
    throw new Error(`A product can have up to ${MAX_PRODUCT_IMAGES} images.`);
  }

  const existingRows = await getProductGallery(conn, productId);
  const existingById = new Map(
    existingRows.map((row) => [Number(row.id), row]),
  );

  const usedExistingIds = new Set();
  const usedNewIndexes = new Set();
  let legacyUsed = false;
  const resolved = [];

  for (const entry of order) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Product image order contains an invalid item.");
    }

    const type = String(entry.type || "")
      .trim()
      .toLowerCase();

    if (type === "existing") {
      const imageId = Number(entry.id);
      const row = existingById.get(imageId);

      if (!Number.isInteger(imageId) || !row || usedExistingIds.has(imageId)) {
        throw new Error(
          "Product image order contains an invalid existing image.",
        );
      }

      usedExistingIds.add(imageId);
      resolved.push({
        type: "existing",
        id: imageId,
        image_url: row.image_url,
      });
      continue;
    }

    if (type === "new") {
      const index = Number(entry.index);

      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= newFiles.length ||
        usedNewIndexes.has(index)
      ) {
        throw new Error(
          "Product image order contains an invalid uploaded image.",
        );
      }

      usedNewIndexes.add(index);
      resolved.push({
        type: "new",
        file: newFiles[index],
        image_url: newFiles[index].path,
      });
      continue;
    }

    if (type === "legacy") {
      if (!legacyImageUrl || legacyUsed) {
        throw new Error(
          "Product image order contains an invalid legacy image.",
        );
      }

      legacyUsed = true;

      const matchingRow = existingRows.find(
        (row) => String(row.image_url || "") === String(legacyImageUrl),
      );

      if (matchingRow && !usedExistingIds.has(Number(matchingRow.id))) {
        usedExistingIds.add(Number(matchingRow.id));
        resolved.push({
          type: "existing",
          id: Number(matchingRow.id),
          image_url: matchingRow.image_url,
        });
      } else {
        resolved.push({
          type: "legacy",
          image_url: legacyImageUrl,
        });
      }

      continue;
    }

    throw new Error("Product image order contains an unknown item type.");
  }

  if (usedNewIndexes.size !== newFiles.length) {
    throw new Error(
      "Every uploaded product image must appear in the image order.",
    );
  }

  const retainedIds = resolved
    .filter((item) => item.type === "existing")
    .map((item) => item.id);

  if (retainedIds.length > 0) {
    const placeholders = retainedIds.map(() => "?").join(",");
    await conn.query(
      `DELETE FROM product_images
       WHERE product_id = ?
         AND id NOT IN (${placeholders})`,
      [productId, ...retainedIds],
    );
  } else {
    await conn.query("DELETE FROM product_images WHERE product_id = ?", [
      productId,
    ]);
  }

  for (let index = 0; index < resolved.length; index += 1) {
    const item = resolved[index];
    const isPrimary = index === 0 ? 1 : 0;

    if (item.type === "existing") {
      await conn.query(
        `UPDATE product_images
         SET sort_order = ?, is_primary = ?
         WHERE id = ? AND product_id = ?`,
        [index, isPrimary, item.id, productId],
      );
      continue;
    }

    await conn.query(
      `INSERT INTO product_images
         (product_id, image_url, sort_order, is_primary)
       VALUES (?, ?, ?, ?)`,
      [productId, item.image_url, index, isPrimary],
    );
  }

  return resolved[0]?.image_url || null;
}

async function getHomepageNewProductCount(conn, excludeProductId = null) {
  let sql =
    "SELECT id FROM products WHERE type = 'standard' AND is_featured = 1";
  const params = [];

  if (Number.isInteger(excludeProductId)) {
    sql += " AND id <> ?";
    params.push(excludeProductId);
  }

  sql += " FOR UPDATE";

  const [rows] = await conn.query(sql, params);
  return rows.length;
}

// Shared helper: rolls back the transaction and sends a clear 400 error.
// The caller's finally block is responsible for releasing the connection.
async function respondInvalid(conn, res, message) {
  await conn.rollback();
  return res.status(400).json({ message });
}

// ── GET /api/products ─────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const {
      search,
      type,
      status,
      category_id,
      featured,
      sort,
      page = 1,
      limit = 20,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = ["1=1"];
    const params = [];

    if (
      req.query.is_active !== undefined &&
      req.query.is_active !== "" &&
      req.query.is_active !== "all"
    ) {
      where.push("p.is_active = ?");

      params.push(
        req.query.is_active === "false" || req.query.is_active === "0" ? 0 : 1,
      );
    } else {
      where.push("p.is_active = 1");
    }

    if (req.query.is_published !== undefined && req.query.is_published !== "") {
      where.push("p.is_published = ?");
      params.push(
        req.query.is_published === "true" || req.query.is_published === "1"
          ? 1
          : 0,
      );
    }

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

    const orderBy =
      sort === "admin_product_management"
        ? `CASE
             WHEN p.type = 'standard' THEN 0
             WHEN p.type = 'blueprint' THEN 1
             ELSE 2
           END ASC,
           p.created_at DESC,
           p.id DESC`
        : `CASE
             WHEN p.is_active = 0 THEN 5
             WHEN p.is_published = 0 THEN 4
             WHEN p.stock_status = 'out_of_stock' THEN 3
             WHEN p.stock_status = 'low_stock' THEN 2
             WHEN p.stock_status = 'in_stock' THEN 1
             ELSE 6
           END ASC,
           p.created_at DESC`;

    const isAdminProductManagement = sort === "admin_product_management";

    const blueprintSelectSql = isAdminProductManagement
      ? `COALESCE(b.title, pbs.title) AS blueprint_title,
         COALESCE(b.thumbnail_url, pbs.thumbnail_url) AS blueprint_thumbnail_url,
         pbs.source_blueprint_id AS blueprint_snapshot_source_id,
         CASE
           WHEN COALESCE(b.design_data, b.view_3d_data) IS NOT NULL
             THEN COALESCE(CAST(b.updated_at AS CHAR), '')
           ELSE COALESCE(CAST(pbs.captured_at AS CHAR), '')
         END AS blueprint_preview_revision,
         CASE
           WHEN COALESCE(b.design_data, pbs.design_data) IS NOT NULL
             OR COALESCE(b.view_3d_data, pbs.view_3d_data) IS NOT NULL
             OR (
               pbs.components_json IS NOT NULL
               AND TRIM(pbs.components_json) NOT IN ('', '[]')
             )
           THEN 1 ELSE 0
         END AS blueprint_has_scene`
      : `COALESCE(b.title, pbs.title) AS blueprint_title,
         COALESCE(b.thumbnail_url, pbs.thumbnail_url) AS blueprint_thumbnail_url,
         COALESCE(b.design_data, pbs.design_data) AS blueprint_design_data,
         COALESCE(b.view_3d_data, pbs.view_3d_data) AS blueprint_view_3d_data,
         pbs.source_blueprint_id AS blueprint_snapshot_source_id,
         pbs.components_json AS blueprint_components_json`;

    const [products] = await pool.query(
      `SELECT p.*, c.name AS category_name,
              ${blueprintSelectSql}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN blueprints b ON b.id = p.blueprint_id
       LEFT JOIN product_blueprint_snapshots pbs ON pbs.product_id = p.id
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
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

// ── GET /api/products/summary ─────────────────────────────────────────────────
exports.getSummary = async (req, res) => {
  try {
    // Preserve the Product Management summary's existing population:
    // published products across both active and disabled records.
    const [[summaryRow]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(p.type, '') <> 'blueprint'
                AND p.stock_status = 'in_stock'
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS in_stock,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(p.type, '') <> 'blueprint'
                AND p.stock_status = 'out_of_stock'
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS out_of_stock,
        COALESCE(
          SUM(
            CASE
              WHEN p.type = 'standard' AND p.is_featured = 1
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS featured_standard
      FROM products p
      WHERE p.is_published = 1
        AND p.is_active IN (0, 1)
    `);

    const [categories] = await pool.query(`
      SELECT DISTINCT
        c.id,
        c.name
      FROM products p
      INNER JOIN categories c ON c.id = p.category_id
      WHERE p.is_published = 1
        AND p.is_active IN (0, 1)
      ORDER BY c.name ASC
    `);

    const total = Number(summaryRow?.total || 0);

    res.json({
      total,
      inStock: Number(summaryRow?.in_stock || 0),
      outOfStock: Number(summaryRow?.out_of_stock || 0),
      published: total,
      featuredStandard: Number(summaryRow?.featured_standard || 0),
      categories,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/products/:id ─────────────────────────────────────────────────────
exports.getCategories = async (req, res) => {
  try {
    const [categories] = await pool.query(
      `SELECT id, name, type
       FROM categories
       WHERE type = 'build'
       ORDER BY name ASC`,
    );

    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getOne = async (req, res) => {
  try {
    const [[product]] = await pool.query(
      `SELECT p.*, c.name AS category_name,
              COALESCE(b.title, pbs.title) AS blueprint_title,
              COALESCE(b.thumbnail_url, pbs.thumbnail_url) AS blueprint_thumbnail_url,
              COALESCE(b.design_data, pbs.design_data) AS blueprint_design_data,
              COALESCE(b.view_3d_data, pbs.view_3d_data) AS blueprint_view_3d_data,
              pbs.source_blueprint_id AS blueprint_snapshot_source_id,
              pbs.components_json AS blueprint_components_json,
              CASE
                WHEN COALESCE(b.design_data, b.view_3d_data) IS NOT NULL
                  THEN COALESCE(CAST(b.updated_at AS CHAR), '')
                ELSE COALESCE(CAST(pbs.captured_at AS CHAR), '')
              END AS blueprint_preview_revision
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN blueprints b ON b.id = p.blueprint_id
       LEFT JOIN product_blueprint_snapshots pbs ON pbs.product_id = p.id
       WHERE p.id = ?`,
      [parseInt(req.params.id)],
    );
    if (!product)
      return res.status(404).json({ message: "Product not found." });

    if (
      String(req.query.blueprint_preview || "").trim() === "1" &&
      product.type === "blueprint"
    ) {
      return res.json({
        id: product.id,
        name: product.name,
        type: product.type,
        blueprint_id: product.blueprint_id,
        blueprint_title: product.blueprint_title,
        blueprint_thumbnail_url: product.blueprint_thumbnail_url,
        blueprint_design_data: product.blueprint_design_data,
        blueprint_view_3d_data: product.blueprint_view_3d_data,
        blueprint_snapshot_source_id: product.blueprint_snapshot_source_id,
        blueprint_components_json: product.blueprint_components_json,
        blueprint_preview_revision: product.blueprint_preview_revision,
      });
    }

    const [bom] = await pool.query(
      `SELECT bom.*, rm.name AS material_name, rm.unit
   FROM bill_of_materials bom
   JOIN raw_materials rm ON rm.id = bom.raw_material_id
   WHERE bom.product_id = ?`,
      [parseInt(req.params.id)],
    );

    const images = await getProductGallery(pool, parseInt(req.params.id));

    res.json({
      ...product,
      bill_of_materials: bom,
      images:
        images.length > 0
          ? images
          : product.image_url
            ? [
                {
                  id: null,
                  product_id: product.id,
                  image_url: product.image_url,
                  sort_order: 0,
                  is_primary: 1,
                },
              ]
            : [],
    });
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
      is_published = 1,
      blueprint_id,
      bill_of_materials = "[]",
    } = req.body;

    const normalizedType = String(type === undefined ? "standard" : type)
      .trim()
      .toLowerCase();

    if (!["standard", "blueprint"].includes(normalizedType)) {
      return respondInvalid(conn, res, "Invalid product type.");
    }

    // ── Input validation ──────────────────────────────────────────────

    const normalizedName = normalizeProductName(name);

    if (!normalizedName) {
      if (typeof name !== "string" || !name.trim()) {
        return respondInvalid(conn, res, "Product name is required.");
      }

      return respondInvalid(
        conn,
        res,
        `Product name must be ${MAX_PRODUCT_NAME_LENGTH} characters or fewer.`,
      );
    }

    const normalizedBarcode = normalizeProductBarcode(barcode);

    if (
      barcode !== undefined &&
      barcode !== null &&
      barcode !== "" &&
      !normalizedBarcode
    ) {
      return respondInvalid(
        conn,
        res,
        `Barcode must be a non-empty value without spaces or control characters and must be ${MAX_PRODUCT_BARCODE_LENGTH} characters or fewer.`,
      );
    }

    const normalizedDescription = normalizeProductDescription(description);

    if (
      description !== undefined &&
      description !== null &&
      description !== "" &&
      normalizedDescription === null
    ) {
      return respondInvalid(
        conn,
        res,
        `Description must be ${MAX_PRODUCT_DESCRIPTION_LENGTH} characters or fewer.`,
      );
    }

    let numOnlinePrice;
    let numWalkinPrice;
    let numProdCost;

    try {
      numOnlinePrice = parseProductPrice(online_price, "Online price", {
        required: true,
      });

      numWalkinPrice = parseProductPrice(walkin_price, "Walk-in price", {
        required: true,
      });

      numProdCost = parseProductPrice(production_cost, "Production cost", {
        required: true,
      });
    } catch (priceError) {
      return respondInvalid(conn, res, priceError.message);
    }

    if (
      stock !== undefined &&
      stock !== null &&
      stock !== "" &&
      (!isValidNonNegativeInteger(stock) || Number(stock) !== 0)
    ) {
      return respondInvalid(
        conn,
        res,
        "New ready-made products start at 0 stock. Record physical stock through Stock Movement after creating the product.",
      );
    }

    if (!isValidNonNegativeInteger(reorder_point)) {
      return respondInvalid(
        conn,
        res,
        "Reorder point must be a valid non-negative whole number.",
      );
    }

    let normalizedFeatured;
    let normalizedPublished;

    try {
      normalizedFeatured = parseStrictBoolean(is_featured, "is_featured");

      normalizedPublished = parseStrictBoolean(is_published, "is_published");
    } catch (booleanError) {
      return respondInvalid(conn, res, booleanError.message);
    }

    if (
      category_id === undefined ||
      category_id === null ||
      category_id === "" ||
      !/^\d+$/.test(String(category_id).trim()) ||
      Number(category_id) <= 0
    ) {
      return respondInvalid(
        conn,
        res,
        "A valid furniture category is required.",
      );
    }

    const catId = Number(category_id);

    const [[validCategory]] = await conn.query(
      `SELECT id
   FROM categories
   WHERE id = ?
     AND type = 'build'
   LIMIT 1
   FOR UPDATE`,
      [catId],
    );

    if (!validCategory) {
      return respondInvalid(conn, res, "Select a valid furniture category.");
    }

    let galleryOrder;
    let createGalleryUrls;

    try {
      galleryOrder = parseGalleryOrder(req.body.gallery_order);
      createGalleryUrls = resolveCreateGalleryUrls(req, galleryOrder);
    } catch (galleryError) {
      return respondInvalid(conn, res, galleryError.message);
    }

    const image_url = createGalleryUrls[0] || null;

    const numStock = 0;
    const numReorder =
      reorder_point === undefined ||
      reorder_point === null ||
      reorder_point === ""
        ? 0
        : Number(reorder_point);

    const boolFeatured =
      normalizedType === "standard" && normalizedFeatured === 1 ? 1 : 0;

    const bpId =
      blueprint_id === undefined || blueprint_id === null || blueprint_id === ""
        ? null
        : /^\d+$/.test(String(blueprint_id).trim())
          ? Number(blueprint_id)
          : null;

    if (normalizedType === "blueprint") {
      if (!bpId) {
        return respondInvalid(
          conn,
          res,
          "Blueprint products must be published from Blueprint Management.",
        );
      }

      const [[linkedBlueprint]] = await conn.query(
        "SELECT id FROM blueprints WHERE id = ? AND is_deleted = 0 LIMIT 1",
        [bpId],
      );

      if (!linkedBlueprint) {
        return respondInvalid(
          conn,
          res,
          "The linked Blueprint could not be found or is archived.",
        );
      }
    } else if (bpId) {
      return respondInvalid(
        conn,
        res,
        "Ready-made products cannot be linked to a Blueprint.",
      );
    }

    if (boolFeatured) {
      const featuredCount = await getHomepageNewProductCount(conn);

      if (featuredCount >= MAX_HOMEPAGE_NEW_PRODUCTS) {
        await conn.rollback();
        return res.status(400).json({ message: NEW_PRODUCT_LIMIT_MESSAGE });
      }
    }

    const [result] = await conn.query(
      `INSERT INTO products
   (barcode, name, description, category_id, type, image_url, is_featured, is_published, blueprint_id,
    online_price, walkin_price, production_cost, stock, reorder_point)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        normalizedBarcode,
        normalizedName,
        normalizedDescription,
        catId,
        normalizedType,
        image_url,
        boolFeatured,
        normalizedPublished,
        bpId,
        numOnlinePrice,
        numWalkinPrice,
        numProdCost,
        numStock,
        numReorder,
      ],
    );
    const productId = result.insertId;

    if (normalizedType === "standard") {
      await conn.query(
        `INSERT INTO ready_made_display_stock (product_id, quantity)
         VALUES (?, 0)
         ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)`,
        [productId],
      );
    }

    for (let index = 0; index < createGalleryUrls.length; index += 1) {
      await conn.query(
        `INSERT INTO product_images
           (product_id, image_url, sort_order, is_primary)
         VALUES (?, ?, ?, ?)`,
        [productId, createGalleryUrls[index], index, index === 0 ? 1 : 0],
      );
    }

    // Auto-set stock_status
    await conn.query(
      `UPDATE products SET stock_status =
         CASE WHEN stock <= 0 THEN 'out_of_stock'
              WHEN stock <= reorder_point THEN 'low_stock'
              ELSE 'in_stock' END
       WHERE id = ?`,
      [productId],
    );

    // Bill of Materials
    let parsedBOM = [];

    if (
      bill_of_materials !== undefined &&
      bill_of_materials !== null &&
      bill_of_materials !== ""
    ) {
      try {
        parsedBOM =
          typeof bill_of_materials === "string"
            ? JSON.parse(bill_of_materials)
            : bill_of_materials;
      } catch (bomError) {
        return respondInvalid(
          conn,
          res,
          "Bill of materials must contain valid JSON.",
        );
      }

      if (!Array.isArray(parsedBOM)) {
        return respondInvalid(
          conn,
          res,
          "Bill of materials must be an array of material rows.",
        );
      }
    }

    for (const b of parsedBOM) {
      if (
        b.raw_material_id === undefined ||
        b.raw_material_id === null ||
        b.raw_material_id === "" ||
        !isValidNonNegativeInteger(b.raw_material_id) ||
        Number(b.raw_material_id) <= 0
      ) {
        return respondInvalid(
          conn,
          res,
          "Each bill of materials row needs a valid raw material selected.",
        );
      }

      const rawMaterialId = Number(b.raw_material_id);

      const [[rawMaterial]] = await conn.query(
        `SELECT id, is_active
   FROM raw_materials
   WHERE id = ?
   LIMIT 1`,
        [rawMaterialId],
      );

      if (!rawMaterial) {
        return respondInvalid(
          conn,
          res,
          "The selected raw material does not exist.",
        );
      }

      if (Number(rawMaterial.is_active) !== 1) {
        return respondInvalid(
          conn,
          res,
          "The selected raw material is archived and cannot be used.",
        );
      }
      let bomQuantity;

      try {
        bomQuantity = parseBOMQuantity(b.quantity);
      } catch (quantityError) {
        return respondInvalid(conn, res, quantityError.message);
      }

      await conn.query(
        "INSERT INTO bill_of_materials (product_id, raw_material_id, quantity) VALUES (?,?,?)",
        [productId, rawMaterialId, bomQuantity],
      );
    }

    await conn.commit();
    req.auditRecord = { id: productId, new: { name, type: normalizedType } };
    res.status(201).json({ message: "Product created.", id: productId });
  } catch (err) {
    await conn.rollback();

    console.error("Create Error:", err);

    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "A product with this barcode already exists.",
      });
    }

    if (
      err?.code === "ER_DATA_TOO_LONG" ||
      err?.code === "ER_WARN_DATA_OUT_OF_RANGE"
    ) {
      return res.status(400).json({
        message:
          "One or more product values exceed the allowed database limits.",
      });
    }

    return res.status(500).json({
      message: "Unable to create product.",
    });
  } finally {
    conn.release();
  }
};

// ── PUT /api/products/:id ─────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const productId = Number(req.params.id);

    if (
      !Number.isInteger(productId) ||
      productId <= 0 ||
      String(req.params.id).trim() !== String(productId)
    ) {
      return res.status(400).json({
        message: "Invalid product ID.",
      });
    }

    const [[old]] = await conn.query(
      "SELECT * FROM products WHERE id = ? FOR UPDATE",
      [productId],
    );
    if (!old) return res.status(404).json({ message: "Product not found." });

    if (req.body.type !== undefined) {
      const requestedType = String(req.body.type || "")
        .trim()
        .toLowerCase();
      const currentType = String(old.type || "")
        .trim()
        .toLowerCase();

      if (requestedType !== currentType) {
        return respondInvalid(
          conn,
          res,
          "Product type cannot be changed. Publish Blueprint products from Blueprint Management.",
        );
      }
    }

    const allowedColumns = [
      "barcode",
      "name",
      "description",
      "category_id",
      "is_featured",
      "online_price",
      "walkin_price",
      "production_cost",
      "reorder_point",
      "is_published",
    ];

    // ── Input validation (only for fields actually being updated) ──────

    let normalizedUpdateName;
    let normalizedUpdateBarcode;
    let normalizedUpdateDescription;

    if (req.body.name !== undefined) {
      normalizedUpdateName = normalizeProductName(req.body.name);

      if (!normalizedUpdateName) {
        if (typeof req.body.name !== "string" || !req.body.name.trim()) {
          return respondInvalid(conn, res, "Product name cannot be empty.");
        }

        return respondInvalid(
          conn,
          res,
          `Product name must be ${MAX_PRODUCT_NAME_LENGTH} characters or fewer.`,
        );
      }
    }

    if (req.body.barcode !== undefined) {
      normalizedUpdateBarcode = normalizeProductBarcode(req.body.barcode);

      if (
        req.body.barcode !== null &&
        req.body.barcode !== "" &&
        !normalizedUpdateBarcode
      ) {
        return respondInvalid(
          conn,
          res,
          `Barcode must be a non-empty value without spaces or control characters and must be ${MAX_PRODUCT_BARCODE_LENGTH} characters or fewer.`,
        );
      }
    }

    if (req.body.description !== undefined) {
      normalizedUpdateDescription = normalizeProductDescription(
        req.body.description,
      );

      if (
        req.body.description !== null &&
        req.body.description !== "" &&
        normalizedUpdateDescription === null
      ) {
        return respondInvalid(
          conn,
          res,
          `Description must be ${MAX_PRODUCT_DESCRIPTION_LENGTH} characters or fewer.`,
        );
      }
    }

    if (req.body.category_id !== undefined) {
      if (
        req.body.category_id === null ||
        req.body.category_id === "" ||
        !/^\d+$/.test(String(req.body.category_id).trim()) ||
        Number(req.body.category_id) <= 0
      ) {
        return respondInvalid(
          conn,
          res,
          "A valid furniture category is required.",
        );
      }

      const updateCategoryId = Number(req.body.category_id);

      const [[validCategory]] = await conn.query(
        `SELECT id
     FROM categories
     WHERE id = ?
       AND type = 'build'
     LIMIT 1
     FOR UPDATE`,
        [updateCategoryId],
      );

      if (!validCategory) {
        return respondInvalid(conn, res, "Select a valid furniture category.");
      }
    }

    try {
      if (req.body.online_price !== undefined) {
        parseProductPrice(req.body.online_price, "Online price", {
          required: true,
        });
      }

      if (req.body.walkin_price !== undefined) {
        parseProductPrice(req.body.walkin_price, "Walk-in price", {
          required: true,
        });
      }

      if (req.body.production_cost !== undefined) {
        parseProductPrice(req.body.production_cost, "Production cost", {
          required: true,
        });
      }
    } catch (priceError) {
      return respondInvalid(conn, res, priceError.message);
    }

    if (
      req.body.stock !== undefined &&
      Number(req.body.stock) !== Number(old.stock || 0)
    ) {
      return respondInvalid(
        conn,
        res,
        "Stock on hand cannot be changed from Product Management. Use Stock Movement, Internal Stock Transfer, sales, or cancellation flows so every inventory change stays traceable.",
      );
    }

    if (
      req.body.reorder_point !== undefined &&
      !isValidNonNegativeInteger(req.body.reorder_point)
    ) {
      return respondInvalid(
        conn,
        res,
        "Reorder point must be a valid non-negative whole number.",
      );
    }

    let normalizedUpdateFeatured;
    let normalizedUpdatePublished;

    try {
      if (req.body.is_featured !== undefined) {
        normalizedUpdateFeatured = parseStrictBoolean(
          req.body.is_featured,
          "is_featured",
        );
      }

      if (req.body.is_published !== undefined) {
        normalizedUpdatePublished = parseStrictBoolean(
          req.body.is_published,
          "is_published",
        );
      }
    } catch (booleanError) {
      return respondInvalid(conn, res, booleanError.message);
    }

    const updateData = {};

    if (req.body.barcode !== undefined) {
      updateData.barcode = normalizedUpdateBarcode;
    }

    if (req.body.name !== undefined) {
      updateData.name = normalizedUpdateName;
    }

    if (req.body.description !== undefined) {
      updateData.description = normalizedUpdateDescription;
    }

    if (req.body.category_id !== undefined) {
      updateData.category_id = Number(req.body.category_id);
    }

    if (normalizedUpdateFeatured !== undefined) {
      updateData.is_featured = normalizedUpdateFeatured;
    }

    if (normalizedUpdatePublished !== undefined) {
      updateData.is_published = normalizedUpdatePublished;
    }

    if (req.body.online_price !== undefined) {
      updateData.online_price = parseProductPrice(
        req.body.online_price,
        "Online price",
        { required: true },
      );
    }

    if (req.body.walkin_price !== undefined) {
      updateData.walkin_price = parseProductPrice(
        req.body.walkin_price,
        "Walk-in price",
        { required: true },
      );
    }

    if (req.body.production_cost !== undefined) {
      updateData.production_cost = parseProductPrice(
        req.body.production_cost,
        "Production cost",
        { required: true },
      );
    }

    if (req.body.reorder_point !== undefined) {
      updateData.reorder_point = Number(req.body.reorder_point);
    }

    const targetType = old.type;

    if (targetType !== "standard") {
      updateData.is_featured = 0;
    }

    const willBeFeatured =
      targetType === "standard" &&
      Number(
        updateData.is_featured !== undefined
          ? updateData.is_featured
          : old.is_featured,
      ) === 1;

    const wasFeaturedReadyMade =
      old.type === "standard" && Number(old.is_featured || 0) === 1;

    if (willBeFeatured && !wasFeaturedReadyMade) {
      const featuredCount = await getHomepageNewProductCount(conn, productId);

      if (featuredCount >= MAX_HOMEPAGE_NEW_PRODUCTS) {
        await conn.rollback();
        return res.status(400).json({ message: NEW_PRODUCT_LIMIT_MESSAGE });
      }
    }
    let galleryOrder;

    try {
      galleryOrder = parseGalleryOrder(req.body.gallery_order);
    } catch (galleryError) {
      return respondInvalid(conn, res, galleryError.message);
    }

    const galleryUploads = getGalleryUploads(req);

    if (galleryOrder !== null) {
      if (galleryUploads.legacy) {
        return respondInvalid(
          conn,
          res,
          "The legacy image field cannot be mixed with gallery ordering.",
        );
      }

      try {
        updateData.image_url = await applyProductGalleryOrder(conn, {
          productId,
          order: galleryOrder,
          newFiles: galleryUploads.gallery,
          legacyImageUrl: old.image_url || null,
        });
      } catch (galleryError) {
        return respondInvalid(conn, res, galleryError.message);
      }
    } else if (galleryUploads.legacy) {
      // Backward compatibility for older clients that still replace one image.
      updateData.image_url = galleryUploads.legacy.path;

      await syncLegacyPrimaryGalleryImage(
        conn,
        productId,
        galleryUploads.legacy.path,
      );
    } else if (galleryUploads.gallery.length > 0) {
      return respondInvalid(
        conn,
        res,
        "Product gallery ordering is required when uploading multiple images.",
      );
    }

    const keys = Object.keys(updateData);
    if (keys.length > 0) {
      const sets = keys.map((k) => `${k} = ?`).join(", ");
      const vals = [...Object.values(updateData), productId];
      await conn.query(`UPDATE products SET ${sets} WHERE id = ?`, vals);
    }

    // Recalculate stock_status
    await conn.query(
      `UPDATE products SET stock_status =
         CASE WHEN stock <= 0 THEN 'out_of_stock'
              WHEN stock <= reorder_point THEN 'low_stock'
              ELSE 'in_stock' END
       WHERE id = ?`,
      [productId],
    );

    // Replace BOM if provided
    if (
      req.body.bill_of_materials !== undefined &&
      req.body.bill_of_materials !== null &&
      req.body.bill_of_materials !== ""
    ) {
      let parsedBOM;

      try {
        parsedBOM =
          typeof req.body.bill_of_materials === "string"
            ? JSON.parse(req.body.bill_of_materials)
            : req.body.bill_of_materials;
      } catch (bomError) {
        return respondInvalid(
          conn,
          res,
          "Bill of materials must contain valid JSON.",
        );
      }

      if (!Array.isArray(parsedBOM)) {
        return respondInvalid(
          conn,
          res,
          "Bill of materials must be an array of material rows.",
        );
      }

      await conn.query("DELETE FROM bill_of_materials WHERE product_id = ?", [
        productId,
      ]);

      for (const b of parsedBOM) {
        if (
          b.raw_material_id === undefined ||
          b.raw_material_id === null ||
          b.raw_material_id === "" ||
          !isValidNonNegativeInteger(b.raw_material_id) ||
          Number(b.raw_material_id) <= 0
        ) {
          return respondInvalid(
            conn,
            res,
            "Each bill of materials row needs a valid raw material selected.",
          );
        }

        const rawMaterialId = Number(b.raw_material_id);

        const [[rawMaterial]] = await conn.query(
          `SELECT id, is_active
   FROM raw_materials
   WHERE id = ?
   LIMIT 1`,
          [rawMaterialId],
        );

        if (!rawMaterial) {
          return respondInvalid(
            conn,
            res,
            "The selected raw material does not exist.",
          );
        }

        if (Number(rawMaterial.is_active) !== 1) {
          return respondInvalid(
            conn,
            res,
            "The selected raw material is archived and cannot be used.",
          );
        }

        let bomQuantity;

        try {
          bomQuantity = parseBOMQuantity(b.quantity);
        } catch (quantityError) {
          return respondInvalid(conn, res, quantityError.message);
        }

        await conn.query(
          "INSERT INTO bill_of_materials (product_id, raw_material_id, quantity) VALUES (?,?,?)",
          [productId, rawMaterialId, bomQuantity],
        );
      }
    }

    await conn.commit();
    req.auditRecord = { id: productId, old, new: updateData };
    res.json({ message: "Product updated successfully." });
  } catch (err) {
    await conn.rollback();

    console.error("Update Error:", err);

    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "A product with this barcode already exists.",
      });
    }

    if (
      err?.code === "ER_DATA_TOO_LONG" ||
      err?.code === "ER_WARN_DATA_OUT_OF_RANGE"
    ) {
      return res.status(400).json({
        message:
          "One or more product values exceed the allowed database limits.",
      });
    }

    return res.status(500).json({
      message: "Unable to update product.",
    });
  } finally {
    conn.release();
  }
};

// ── DELETE /api/products/:id ──────────────────────────────────────────────────
exports.remove = async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Invalid product ID." });
  }

  const conn = await pool.getConnection();
  let transactionActive = false;

  try {
    await conn.beginTransaction();
    transactionActive = true;

    const [[p]] = await conn.query(
      `SELECT
         p.id,
         p.name,
         p.type,
         p.stock,
         p.is_active,
         p.is_published,
         COALESCE(ds.quantity, 0) AS display_stock
       FROM products p
       LEFT JOIN ready_made_display_stock ds ON ds.product_id = p.id
       WHERE p.id = ?
       LIMIT 1
       FOR UPDATE`,
      [productId],
    );

    if (!p) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Product not found." });
    }

    if (p.type === "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "Blueprint products are managed from Blueprint Management and cannot be permanently deleted here.",
      });
    }

    const [[references]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM stock_movements WHERE product_id = ?) AS stock_movements_count,
         (SELECT COUNT(*) FROM order_items WHERE product_id = ?) AS order_items_count,
         (SELECT COUNT(*) FROM stock_transfer_items WHERE product_id = ?) AS stock_transfer_items_count`,
      [productId, productId, productId],
    );

    const referenceCounts = {
      stock_movements_count: Number(references?.stock_movements_count || 0),
      order_items_count: Number(references?.order_items_count || 0),
      stock_transfer_items_count: Number(
        references?.stock_transfer_items_count || 0,
      ),
    };
    const historicalReferenceCount =
      referenceCounts.stock_movements_count +
      referenceCounts.order_items_count +
      referenceCounts.stock_transfer_items_count;

    if (historicalReferenceCount > 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "This product has inventory or sales history and cannot be permanently deleted. Disable or unpublish it instead.",
        can_disable: true,
        references: referenceCounts,
      });
    }

    const totalStock = Number(p.stock || 0);
    const displayStock = Number(p.display_stock || 0);
    if (totalStock > 0 || displayStock > 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "This product still has stock on hand and cannot be permanently deleted. Resolve the stock first, then disable or unpublish the product.",
        can_disable: true,
        total_stock: totalStock,
        display_stock: displayStock,
      });
    }

    const [deleteResult] = await conn.query(
      "DELETE FROM products WHERE id = ?",
      [productId],
    );

    if (deleteResult.affectedRows !== 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message: "Product could not be deleted. Refresh and try again.",
      });
    }

    await conn.commit();
    transactionActive = false;

    req.auditRecord = { id: productId, old: p, new: { action: "deleted" } };
    return res.json({ message: "Product deleted." });
  } catch (err) {
    if (transactionActive) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("[product.remove rollback]", rollbackError);
      }
    }

    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message:
          "This product has linked records and cannot be permanently deleted. Disable or unpublish it instead.",
        can_disable: true,
      });
    }

    console.error("[product.remove]", err);
    return res.status(500).json({ message: "Product could not be deleted." });
  } finally {
    conn.release();
  }
};

// ── PATCH /api/products/:id/featured ─────────────────────────────────────────
exports.toggleFeatured = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const productId = parseInt(req.params.id);
    const [[product]] = await conn.query(
      "SELECT id, name, type, is_featured FROM products WHERE id = ? FOR UPDATE",
      [productId],
    );

    if (!product) {
      await conn.rollback();
      return res.status(404).json({ message: "Product not found." });
    }

    if (product.type !== "standard") {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Only ready-made products can be shown as new products on the homepage.",
      });
    }

    const nextFeatured = !Boolean(product.is_featured);

    if (nextFeatured) {
      const featuredCount = await getHomepageNewProductCount(conn, productId);

      if (featuredCount >= MAX_HOMEPAGE_NEW_PRODUCTS) {
        await conn.rollback();
        return res.status(400).json({ message: NEW_PRODUCT_LIMIT_MESSAGE });
      }
    }

    await conn.query("UPDATE products SET is_featured = ? WHERE id = ?", [
      nextFeatured ? 1 : 0,
      productId,
    ]);

    await conn.commit();

    await writeAuditLogSafe({
      userId: req.user?.id || null,
      action: nextFeatured ? "feature_product" : "unfeature_product",
      tableName: "products",
      recordId: productId,
      newValues: {
        name: product.name,
        is_featured: nextFeatured,
      },
      ipAddress: req.ip || null,
    });

    res.json({
      is_featured: nextFeatured,
      featured_limit: MAX_HOMEPAGE_NEW_PRODUCTS,
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Keep the original error.
    }

    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};
// ── GET /api/products/report ──────────────────────────────────────────────────
exports.getReport = async (req, res) => {
  try {
    const { search, type, status, category_id, is_active } = req.query;
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

    if (is_active !== undefined && is_active !== "") {
      where.push("p.is_active = ?");
      params.push(is_active === "false" || is_active === "0" ? 0 : 1);
    }

    const [rows] = await pool.query(
      `SELECT
          p.id AS product_id,
          p.barcode,
          p.name,
          c.name AS category,
          p.type,
          COALESCE(p.blueprint_id, pbs.source_blueprint_id) AS blueprint_source_id,
          p.online_price AS price,
          p.production_cost,
          p.profit_margin,
          p.stock,
          p.reorder_point,
          p.stock_status,
          p.is_published,
          p.is_active,
          p.is_featured,
          p.created_at,
          p.updated_at
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_blueprint_snapshots pbs ON pbs.product_id = p.id
       WHERE ${where.join(" AND ")}
       ORDER BY p.name ASC, p.id ASC`,
      params,
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/products/bulk-publish ─────────────────────────────────────────
exports.bulkPublish = async (req, res) => {
  try {
    const { ids, is_published } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No product IDs provided." });
    }

    const normalizedIds = [
      ...new Set(
        ids
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    ];

    if (normalizedIds.length !== ids.length) {
      return res.status(400).json({ message: "Invalid product IDs provided." });
    }

    const [targets] = await pool.query(
      "SELECT id, type FROM products WHERE id IN (?)",
      [normalizedIds],
    );

    if (targets.some((product) => product.type === "blueprint")) {
      return res.status(409).json({
        message:
          "Blueprint publication is managed from Blueprint Management. Remove Blueprint products from this selection.",
      });
    }

    const publishValue = is_published ? 1 : 0;

    const [result] = await pool.query(
      "UPDATE products SET is_published = ? WHERE id IN (?) AND type <> 'blueprint'",
      [publishValue, normalizedIds],
    );

    await writeAuditLogSafe({
      userId: req.user?.id || null,
      action: publishValue
        ? "bulk_publish_products"
        : "bulk_unpublish_products",
      tableName: "products",
      newValues: {
        is_published: Boolean(publishValue),
        product_count: Number(result.affectedRows || 0),
        product_ids: normalizedIds.slice(0, 100),
      },
      ipAddress: req.ip || null,
    });

    res.json({ message: "Products updated successfully." });
  } catch (err) {
    console.error("[bulkPublish Error]:", err);
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/products/:id/publish ─────────────────────────────────────────
exports.togglePublish = async (req, res) => {
  try {
    const { is_published } = req.body;
    const publishValue = is_published ? 1 : 0;
    const productId = parseInt(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Invalid product ID." });
    }

    const [[product]] = await pool.query(
      "SELECT id, name, type FROM products WHERE id = ? LIMIT 1",
      [productId],
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    if (product.type === "blueprint") {
      return res.status(409).json({
        message: "Blueprint publication is managed from Blueprint Management.",
      });
    }

    await pool.query(
      "UPDATE products SET is_published = ? WHERE id = ? AND type <> 'blueprint'",
      [publishValue, productId],
    );

    await writeAuditLogSafe({
      userId: req.user?.id || null,
      action: publishValue ? "publish_product" : "unpublish_product",
      tableName: "products",
      recordId: productId,
      newValues: {
        name: product.name,
        is_published: Boolean(publishValue),
      },
      ipAddress: req.ip || null,
    });

    res.json({ is_published: !!publishValue });
  } catch (err) {
    console.error("[togglePublish Error]:", err);
    res.status(500).json({ message: err.message });
  }
};

// ── PUT /api/products/blueprint/:blueprint_id/publish ───────────────────
exports.publishByBlueprint = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const blueprintId = parseInt(req.params.blueprint_id);
    const productName = String(req.body.name || "").trim();
    const productDescription =
      String(req.body.description || "Custom blueprint product.").trim() ||
      "Custom blueprint product.";
    const categoryId = parseInt(req.body.category_id);

    if (!Number.isInteger(blueprintId) || blueprintId <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid Blueprint ID." });
    }

    if (!productName) {
      await conn.rollback();
      return res.status(400).json({ message: "Product name is required." });
    }

    if (productName.length > 200) {
      await conn.rollback();
      return res.status(400).json({
        message: "Product name must be 200 characters or fewer.",
      });
    }

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      await conn.rollback();
      return res.status(400).json({
        message: "Select a furniture category before publishing.",
      });
    }

    // Lock the Blueprint row so two publish requests for the same Blueprint
    // cannot create two Products at the same time.
    const [[blueprint]] = await conn.query(
      `SELECT id, is_deleted, design_data, view_3d_data
       FROM blueprints
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [blueprintId],
    );

    if (!blueprint || Number(blueprint.is_deleted) === 1) {
      await conn.rollback();
      return res.status(404).json({
        message: "The Blueprint could not be found or is archived.",
      });
    }

    const parseSceneComponents = (value) => {
      if (!value) return [];
      try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return Array.isArray(parsed?.components) ? parsed.components : [];
      } catch {
        return [];
      }
    };

    const persistedComponents = [
      ...parseSceneComponents(blueprint.design_data),
      ...parseSceneComponents(blueprint.view_3d_data),
    ];

    let hasRealComponent = persistedComponents.some(
      (component) => component && component.type !== "reference_proxy",
    );

    if (!hasRealComponent) {
      const [[legacyComponents]] = await conn.query(
        `SELECT COUNT(*) AS component_count
         FROM blueprint_components
         WHERE blueprint_id = ?`,
        [blueprintId],
      );
      hasRealComponent = Number(legacyComponents?.component_count || 0) > 0;
    }

    if (!hasRealComponent) {
      await conn.rollback();
      return res.status(409).json({
        code: "BLUEPRINT_EMPTY_DESIGN",
        message:
          "Add or convert at least one real furniture part before publishing this Blueprint.",
      });
    }

    const [[category]] = await conn.query(
      `SELECT id
       FROM categories
       WHERE id = ? AND type = 'build'
       LIMIT 1`,
      [categoryId],
    );

    if (!category) {
      await conn.rollback();
      return res.status(400).json({
        message: "Select a valid furniture category before publishing.",
      });
    }

    const [linkedProducts] = await conn.query(
      `SELECT id, name, description, category_id, is_published, is_active
       FROM products
       WHERE blueprint_id = ?
         AND type = 'blueprint'
       ORDER BY id ASC
       FOR UPDATE`,
      [blueprintId],
    );

    const canonicalProduct = linkedProducts[0] || null;
    let productId = canonicalProduct ? Number(canonicalProduct.id) : null;
    let created = false;

    if (canonicalProduct) {
      // Do not change the Product's existing price, stock, active state,
      // images, or BOM during republish.
      await conn.query(
        `UPDATE products
         SET name = ?,
             description = ?,
             category_id = ?,
             is_featured = 0,
             is_published = 1
         WHERE id = ?`,
        [productName, productDescription, categoryId, productId],
      );
    } else {
      const [createResult] = await conn.query(
        `INSERT INTO products
           (name, description, category_id, type, is_featured, is_published,
            blueprint_id, online_price, walkin_price, production_cost, stock,
            reorder_point, stock_status)
         VALUES (?, ?, ?, 'blueprint', 0, 1, ?, 0, 0, 0, 0, 0, 'out_of_stock')`,
        [productName, productDescription, categoryId, blueprintId],
      );

      productId = Number(createResult.insertId);
      created = true;
    }

    // Old duplicate rows are kept for history/order references. Only the first
    // Product remains published for this Blueprint.
    const duplicateProductIds = linkedProducts
      .slice(1)
      .map((row) => Number(row.id))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (duplicateProductIds.length > 0) {
      const placeholders = duplicateProductIds.map(() => "?").join(",");
      await conn.query(
        `UPDATE products
         SET is_published = 0
         WHERE id IN (${placeholders})`,
        duplicateProductIds,
      );
    }

    // Keep the current Blueprint publish fields. Product price behavior is not
    // changed by this fix.
    await conn.query(
      `UPDATE blueprints
       SET title = ?,
           description = ?,
           is_template = 1,
           is_gallery = 1,
           base_price = 0
       WHERE id = ?`,
      [productName, productDescription, blueprintId],
    );

    const [[publishedProduct]] = await conn.query(
      `SELECT id, name, description, category_id, type, is_published,
              is_active, blueprint_id
       FROM products
       WHERE id = ?
       LIMIT 1`,
      [productId],
    );

    await conn.commit();

    req.auditRecord = {
      id: productId,
      old: canonicalProduct,
      new: {
        name: productName,
        description: productDescription,
        category_id: categoryId,
        blueprint_id: blueprintId,
        is_published: true,
        created,
        duplicate_products_unpublished: duplicateProductIds.length,
      },
    };

    res.status(created ? 201 : 200).json({
      message: created
        ? "Blueprint Product created."
        : "Blueprint Product updated.",
      created,
      product: publishedProduct,
      duplicate_products_unpublished: duplicateProductIds.length,
      blueprint: {
        id: blueprintId,
        title: productName,
        description: productDescription,
        is_template: 1,
        is_gallery: 1,
        base_price: 0,
        has_published_product: 1,
      },
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Keep the original error.
    }

    console.error("[publishByBlueprint Error]:", err);
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── PATCH /api/products/blueprint/:blueprint_id/unpublish ─────────────────
exports.unpublishByBlueprint = async (req, res) => {
  const blueprintId = parseInt(req.params.blueprint_id);

  if (!Number.isInteger(blueprintId) || blueprintId <= 0) {
    return res.status(400).json({ message: "Invalid Blueprint ID." });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[blueprint]] = await conn.query(
      `SELECT id, is_deleted, is_template, is_gallery, base_price
       FROM blueprints
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [blueprintId],
    );

    if (!blueprint) {
      await conn.rollback();
      return res.status(404).json({ message: "Blueprint not found." });
    }

    const [linkedProducts] = await conn.query(
      `SELECT id, is_published, is_active
       FROM products
       WHERE blueprint_id = ?
         AND type = 'blueprint'
       ORDER BY id ASC
       FOR UPDATE`,
      [blueprintId],
    );

    const [productResult] = await conn.query(
      `UPDATE products
       SET is_published = 0
       WHERE blueprint_id = ?
         AND type = 'blueprint'
         AND is_published <> 0`,
      [blueprintId],
    );

    await conn.query(
      `UPDATE blueprints
       SET is_template = 0,
           is_gallery = 0,
           base_price = 0
       WHERE id = ?`,
      [blueprintId],
    );

    await conn.commit();

    await writeAuditLogSafe({
      userId: req.user?.id || null,
      action: "unpublish_blueprint_products",
      tableName: "products",
      recordId: linkedProducts[0]?.id || null,
      oldValues: {
        blueprint_id: blueprintId,
        blueprint_is_template: Boolean(Number(blueprint.is_template)),
        blueprint_is_gallery: Boolean(Number(blueprint.is_gallery)),
        blueprint_base_price: Number(blueprint.base_price || 0),
        published_products: linkedProducts.filter(
          (product) => Number(product.is_published) === 1,
        ).length,
      },
      newValues: {
        blueprint_id: blueprintId,
        affected_products: Number(productResult.affectedRows || 0),
        is_published: false,
        blueprint_is_template: false,
        blueprint_is_gallery: false,
        blueprint_base_price: 0,
      },
      ipAddress: req.ip || null,
    });

    return res.json({
      message: "Blueprint product unpublished successfully.",
      affected_products: Number(productResult.affectedRows || 0),
      blueprint: {
        id: blueprintId,
        is_template: 0,
        is_gallery: 0,
        base_price: 0,
        has_published_product: 0,
      },
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Keep the original error.
    }

    console.error("[unpublishByBlueprint Error]:", err);
    return res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── PATCH /api/products/:id/active (Enable/Disable Product) ─────────────────
exports.toggleActive = async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Invalid product ID." });
  }

  const requestedActive = req.body?.is_active;
  const activeValue =
    requestedActive === true || requestedActive === 1 || requestedActive === "1"
      ? 1
      : requestedActive === false ||
          requestedActive === 0 ||
          requestedActive === "0"
        ? 0
        : null;

  if (activeValue === null) {
    return res.status(400).json({
      message: "is_active must be true or false.",
    });
  }

  const conn = await pool.getConnection();
  let transactionActive = false;

  try {
    await conn.beginTransaction();
    transactionActive = true;

    const [[before]] = await conn.query(
      `SELECT
         p.id,
         p.name,
         p.type,
         p.stock,
         p.is_active,
         p.is_published,
         COALESCE(ds.quantity, 0) AS display_stock
       FROM products p
       LEFT JOIN ready_made_display_stock ds ON ds.product_id = p.id
       WHERE p.id = ?
       LIMIT 1
       FOR UPDATE`,
      [productId],
    );

    if (!before) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Product not found." });
    }

    if (activeValue === 0) {
      if (Number(before.is_published) === 1) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message: "Unpublish the product before archiving it.",
        });
      }

      const totalStock = Number(before.stock || 0);
      const displayStock = Number(before.display_stock || 0);

      if (totalStock > 0 || displayStock > 0) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message:
            "This product still has stock on hand and cannot be archived. Reduce stock to zero through the proper inventory workflow first.",
          total_stock: totalStock,
          display_stock: displayStock,
        });
      }
    }

    const [updateResult] = await conn.query(
      "UPDATE products SET is_active = ? WHERE id = ?",
      [activeValue, productId],
    );

    if (updateResult.affectedRows !== 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message: "Product status could not be changed. Refresh and try again.",
      });
    }

    await conn.commit();
    transactionActive = false;

    req.auditRecord = {
      id: productId,
      old: {
        name: before.name,
        is_active: Boolean(before.is_active),
      },
      new: {
        name: before.name,
        is_active: Boolean(activeValue),
      },
    };

    return res.json({
      is_active: Boolean(activeValue),
      message: activeValue ? "Product enabled." : "Product archived.",
    });
  } catch (err) {
    if (transactionActive) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("[product.toggleActive rollback]", rollbackError);
      }
    }

    console.error("[product.toggleActive]", err);
    return res.status(500).json({
      message: "Product status could not be changed.",
    });
  } finally {
    conn.release();
  }
};
