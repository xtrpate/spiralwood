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
  "You can show up to 4 new products on the homepage. Unmark one product first.";

const MAX_PRODUCT_IMAGES = 6;

function parseGalleryOrder(rawValue) {
  if (
    rawValue === undefined ||
    rawValue === null ||
    rawValue === ""
  ) {
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
    throw new Error(
      `A product can have up to ${MAX_PRODUCT_IMAGES} images.`,
    );
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
    throw new Error(
      `A product can have up to ${MAX_PRODUCT_IMAGES} images.`,
    );
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

async function syncLegacyPrimaryGalleryImage(
  conn,
  productId,
  imageUrl,
) {
  const rows = await getProductGallery(conn, productId);

  await conn.query(
    "UPDATE product_images SET is_primary = 0 WHERE product_id = ?",
    [productId],
  );

  const primary =
    rows.find((row) => Number(row.is_primary) === 1) ||
    rows[0] ||
    null;

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
  {
    productId,
    order,
    newFiles,
    legacyImageUrl,
  },
) {
  if (!Array.isArray(order)) {
    throw new Error("Product image order is invalid.");
  }

  if (order.length > MAX_PRODUCT_IMAGES) {
    throw new Error(
      `A product can have up to ${MAX_PRODUCT_IMAGES} images.`,
    );
  }

  if (newFiles.length > MAX_PRODUCT_IMAGES) {
    throw new Error(
      `A product can have up to ${MAX_PRODUCT_IMAGES} images.`,
    );
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

    const type = String(entry.type || "").trim().toLowerCase();

    if (type === "existing") {
      const imageId = Number(entry.id);
      const row = existingById.get(imageId);

      if (
        !Number.isInteger(imageId) ||
        !row ||
        usedExistingIds.has(imageId)
      ) {
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
        (row) =>
          String(row.image_url || "") === String(legacyImageUrl),
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
    await conn.query(
      "DELETE FROM product_images WHERE product_id = ?",
      [productId],
    );
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

// Shared helper: rolls back the transaction, releases the connection,
// and sends a clear 400 error. Used by both create and update below.
async function respondInvalid(conn, res, message) {
  await conn.rollback();
  conn.release();
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
      page = 1,
      limit = 20,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = ["1=1"];
    const params = [];

    if (req.query.is_active !== undefined) {
      where.push("p.is_active = ?");
      params.push(
        req.query.is_active === "false" || req.query.is_active === "0" ? 0 : 1,
      );
    } else {
      where.push("p.is_active = 1");
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

    const [products] = await pool.query(
      `SELECT p.*, c.name AS category_name,
              COALESCE(b.title, pbs.title) AS blueprint_title,
              COALESCE(b.thumbnail_url, pbs.thumbnail_url) AS blueprint_thumbnail_url,
              COALESCE(b.design_data, pbs.design_data) AS blueprint_design_data,
              COALESCE(b.view_3d_data, pbs.view_3d_data) AS blueprint_view_3d_data,
              pbs.source_blueprint_id AS blueprint_snapshot_source_id,
              pbs.components_json AS blueprint_components_json
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN blueprints b ON b.id = p.blueprint_id
       LEFT JOIN product_blueprint_snapshots pbs ON pbs.product_id = p.id
       WHERE ${where.join(" AND ")}
       ORDER BY 
         CASE 
           WHEN p.is_active = 0 THEN 5
           WHEN p.is_published = 0 THEN 4
           WHEN p.stock_status = 'out_of_stock' THEN 3
           WHEN p.stock_status = 'low_stock' THEN 2
           WHEN p.stock_status = 'in_stock' THEN 1
           ELSE 6 
         END ASC,
         p.created_at DESC
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
              pbs.components_json AS blueprint_components_json
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN blueprints b ON b.id = p.blueprint_id
       LEFT JOIN product_blueprint_snapshots pbs ON pbs.product_id = p.id
       WHERE p.id = ?`,
      [parseInt(req.params.id)],
    );
    if (!product)
      return res.status(404).json({ message: "Product not found." });

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

    const normalizedType = String(type || "standard").trim().toLowerCase();

    if (!["standard", "blueprint"].includes(normalizedType)) {
      return respondInvalid(conn, res, "Invalid product type.");
    }

    // ── Input validation ──────────────────────────────────────────────
    if (!isNonEmptyString(name)) {
      return respondInvalid(conn, res, "Product name is required.");
    }
    if (
      online_price === undefined ||
      online_price === null ||
      online_price === ""
    ) {
      return respondInvalid(conn, res, "Online price is required.");
    }
    if (!isValidNonNegativeNumber(online_price)) {
      return respondInvalid(
        conn,
        res,
        "Online price must be a valid non-negative number.",
      );
    }
    if (
      walkin_price === undefined ||
      walkin_price === null ||
      walkin_price === ""
    ) {
      return respondInvalid(conn, res, "Walk-in price is required.");
    }
    if (!isValidNonNegativeNumber(walkin_price)) {
      return respondInvalid(
        conn,
        res,
        "Walk-in price must be a valid non-negative number.",
      );
    }
    if (!isValidNonNegativeNumber(production_cost)) {
      return respondInvalid(
        conn,
        res,
        "Production cost must be a valid non-negative number.",
      );
    }
    if (!isValidNonNegativeInteger(stock)) {
      return respondInvalid(
        conn,
        res,
        "Stock must be a valid non-negative whole number.",
      );
    }
    if (!isValidNonNegativeInteger(reorder_point)) {
      return respondInvalid(
        conn,
        res,
        "Reorder point must be a valid non-negative whole number.",
      );
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

    const numOnlinePrice = online_price ? parseFloat(online_price) : 0;
    const numWalkinPrice = walkin_price ? parseFloat(walkin_price) : 0;
    const numProdCost = production_cost ? parseFloat(production_cost) : 0;
    const numStock = stock ? parseInt(stock) : 0;
    const numReorder = reorder_point ? parseInt(reorder_point) : 0;
    const wantsFeatured =
      is_featured === "true" || is_featured === 1 || is_featured === true;
    const boolFeatured = normalizedType === "standard" && wantsFeatured ? 1 : 0;
    const catId =
      category_id && !isNaN(parseInt(category_id))
        ? parseInt(category_id)
        : null;
    const bpId =
      blueprint_id && !isNaN(parseInt(blueprint_id))
        ? parseInt(blueprint_id)
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
        barcode || null,
        name,
        description || null,
        catId,
        normalizedType,
        image_url,
        boolFeatured,
        is_published,
        bpId,
        numOnlinePrice,
        numWalkinPrice,
        numProdCost,
        numStock,
        numReorder,
      ],
    );
    const productId = result.insertId;

    for (let index = 0; index < createGalleryUrls.length; index += 1) {
      await conn.query(
        `INSERT INTO product_images
           (product_id, image_url, sort_order, is_primary)
         VALUES (?, ?, ?, ?)`,
        [
          productId,
          createGalleryUrls[index],
          index,
          index === 0 ? 1 : 0,
        ],
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
    const parsedBOM =
      typeof bill_of_materials === "string"
        ? JSON.parse(bill_of_materials)
        : bill_of_materials;
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
      if (!isValidNonNegativeNumber(b.quantity)) {
        return respondInvalid(
          conn,
          res,
          "Bill of materials quantity must be a valid non-negative number.",
        );
      }
      await conn.query(
        "INSERT INTO bill_of_materials (product_id, raw_material_id, quantity) VALUES (?,?,?)",
        [
          productId,
          parseInt(b.raw_material_id),
          b.quantity ? parseFloat(b.quantity) : 0,
        ],
      );
    }

    await conn.commit();
    req.auditRecord = { id: productId, new: { name, type: normalizedType } };
    res.status(201).json({ message: "Product created.", id: productId });
  } catch (err) {
    await conn.rollback();
    console.error("Create Error:", err);
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
    const productId = parseInt(req.params.id);

    const [[old]] = await conn.query("SELECT * FROM products WHERE id = ?", [
      productId,
    ]);
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
      "stock",
      "reorder_point",
      "is_published",
    ];

    // ── Input validation (only for fields actually being updated) ──────
    if (req.body.name !== undefined && !isNonEmptyString(req.body.name)) {
      return respondInvalid(conn, res, "Product name cannot be empty.");
    }
    if (
      req.body.online_price !== undefined &&
      (req.body.online_price === "" ||
        !isValidNonNegativeNumber(req.body.online_price))
    ) {
      return respondInvalid(
        conn,
        res,
        "Online price must be a valid non-negative number.",
      );
    }
    if (
      req.body.walkin_price !== undefined &&
      (req.body.walkin_price === "" ||
        !isValidNonNegativeNumber(req.body.walkin_price))
    ) {
      return respondInvalid(
        conn,
        res,
        "Walk-in price must be a valid non-negative number.",
      );
    }
    if (
      req.body.production_cost !== undefined &&
      !isValidNonNegativeNumber(req.body.production_cost)
    ) {
      return respondInvalid(
        conn,
        res,
        "Production cost must be a valid non-negative number.",
      );
    }
    if (
      req.body.stock !== undefined &&
      !isValidNonNegativeInteger(req.body.stock)
    ) {
      return respondInvalid(
        conn,
        res,
        "Stock must be a valid non-negative whole number.",
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

    const updateData = {};
    allowedColumns.forEach((col) => {
      if (req.body[col] !== undefined) {
        // Safe conversions for numbers and booleans
        if (col === "is_featured" || col === "is_published") {
          updateData[col] =
            req.body[col] === "true" ||
            req.body[col] === 1 ||
            req.body[col] === true
              ? 1
              : 0;
        } else if (
          ["online_price", "walkin_price", "production_cost"].includes(col)
        ) {
          updateData[col] = req.body[col] ? parseFloat(req.body[col]) : 0;
        } else if (["stock", "reorder_point"].includes(col)) {
          updateData[col] = req.body[col] ? parseInt(req.body[col]) : 0;
        } else if (col === "category_id") {
          updateData[col] =
            req.body[col] && !isNaN(parseInt(req.body[col]))
              ? parseInt(req.body[col])
              : null;
        } else {
          updateData[col] = req.body[col] || null;
        }
      }
    });

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
    if (req.body.bill_of_materials) {
      await conn.query("DELETE FROM bill_of_materials WHERE product_id = ?", [
        productId,
      ]);
      const parsedBOM =
        typeof req.body.bill_of_materials === "string"
          ? JSON.parse(req.body.bill_of_materials)
          : req.body.bill_of_materials;
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
        if (!isValidNonNegativeNumber(b.quantity)) {
          return respondInvalid(
            conn,
            res,
            "Bill of materials quantity must be a valid non-negative number.",
          );
        }
        await conn.query(
          "INSERT INTO bill_of_materials (product_id, raw_material_id, quantity) VALUES (?,?,?)",
          [
            productId,
            parseInt(b.raw_material_id),
            b.quantity ? parseFloat(b.quantity) : 0,
          ],
        );
      }
    }

    await conn.commit();
    req.auditRecord = { id: productId, old, new: updateData };
    res.json({ message: "Product updated successfully." });
  } catch (err) {
    await conn.rollback();
    console.error("Update Error:", err);
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
      [parseInt(req.params.id)],
    );
    if (!p) return res.status(404).json({ message: "Product not found." });

    await pool.query("DELETE FROM products WHERE id = ?", [
      parseInt(req.params.id),
    ]);

    req.auditRecord = { id: req.params.id, old: p };
    res.json({ message: "Product deleted." });
  } catch (err) {
    // 👉 THE FIX: Catch the specific Foreign Key Constraint error!
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        message:
          "Cannot delete this product because it is part of existing customer orders. Please unpublish it instead to hide it from the store.",
      });
    }

    // Fallback for any other database errors
    res.status(500).json({ message: err.message });
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

    await conn.query(
      "UPDATE products SET is_featured = ? WHERE id = ?",
      [nextFeatured ? 1 : 0, productId],
    );

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
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      `SELECT p.barcode, p.name, c.name AS category, p.type,
              p.online_price, p.walkin_price, p.production_cost,
              p.profit_margin, p.stock, p.stock_status, p.is_featured
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.name ASC`,
      [],
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

    const publishValue = is_published ? 1 : 0;

    const [result] = await pool.query(
      "UPDATE products SET is_published = ? WHERE id IN (?)",
      [publishValue, ids],
    );

    await writeAuditLogSafe({
      userId: req.user?.id || null,
      action: publishValue ? "bulk_publish_products" : "bulk_unpublish_products",
      tableName: "products",
      newValues: {
        is_published: Boolean(publishValue),
        product_count: Number(result.affectedRows || 0),
        product_ids: ids.slice(0, 100),
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

    await pool.query("UPDATE products SET is_published = ? WHERE id = ?", [
      publishValue,
      productId,
    ]);

    const [[product]] = await pool.query(
      "SELECT name FROM products WHERE id = ? LIMIT 1",
      [productId],
    );

    if (product) {
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
    }

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

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      await conn.rollback();
      return res.status(400).json({
        message: "Select a furniture category before publishing.",
      });
    }

    // Lock the Blueprint row so two publish requests for the same Blueprint
    // cannot create two Products at the same time.
    const [[blueprint]] = await conn.query(
      `SELECT id, is_deleted
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
  try {
    const blueprintId = parseInt(req.params.blueprint_id);

    const [result] = await pool.query(
      "UPDATE products SET is_published = 0 WHERE blueprint_id = ?",
      [blueprintId],
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "No live products found for this blueprint." });
    }

    await writeAuditLogSafe({
      userId: req.user?.id || null,
      action: "unpublish_blueprint_products",
      tableName: "products",
      newValues: {
        blueprint_id: blueprintId,
        affected_products: Number(result.affectedRows || 0),
        is_published: false,
      },
      ipAddress: req.ip || null,
    });

    res.json({ message: "Blueprint product unpublished successfully." });
  } catch (err) {
    console.error("[unpublishByBlueprint Error]:", err);
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/products/:id/active (Enable/Disable Product) ─────────────────
exports.toggleActive = async (req, res) => {
  try {
    const { is_active } = req.body;
    const activeValue = is_active ? 1 : 0;
    const productId = parseInt(req.params.id);
    const [[before]] = await pool.query(
      "SELECT name, is_active FROM products WHERE id = ? LIMIT 1",
      [productId],
    );

    await pool.query("UPDATE products SET is_active = ? WHERE id = ?", [
      activeValue,
      productId,
    ]);

    req.auditRecord = {
      id: productId,
      old: before
        ? { name: before.name, is_active: Boolean(before.is_active) }
        : null,
      new: {
        name: before?.name || null,
        is_active: Boolean(activeValue),
      },
    };

    res.json({
      is_active: !!activeValue,
      message: activeValue ? "Product enabled." : "Product disabled.",
    });
  } catch (err) {
    console.error("[toggleActive Error]:", err);
    res.status(500).json({ message: err.message });
  }
};
