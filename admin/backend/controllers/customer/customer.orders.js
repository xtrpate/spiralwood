// controllers/customer/customer.orders.js
const db = require("../../config/db"); // Uses the unified db config
const {
  createCheckoutSession,
  retrieveCheckoutSession,
} = require("../../services/paymongoService");
const { isValidPositiveInteger } = require("../../utils/validators");
const {
  getGlobalEmailFooter,
  sendBrevoEmail,
} = require("../../utils/emailHelper");
const { createNotificationSafe } = require("../../utils/notificationHelper");
const { writeAuditLogSafe } = require("../../middleware/auditLog");
const {
  createStandardOnlineReceipt,
} = require("../../services/receiptService");

/* ── Standard checkout constants ── */
const ALLOWED_PAYMENT_METHODS = ["cod", "cop", "paymongo"];
const MAX_ITEM_QUANTITY = 1000; // sanity ceiling, not a business limit

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getPaymentMethodLabel = (method) => {
  const normalized = String(method || "")
    .trim()
    .toLowerCase();
  if (normalized === "cod") return "Cash on Delivery";
  if (normalized === "cop") return "Cash on Pickup";
  if (normalized === "paymongo") return "Online Payment";
  return "the selected payment method";
};

const parseStoredPaymentToggle = (value, fallback = true) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return fallback;
};

const getStandardCheckoutPaymentAvailability = async (conn) => {
  const [rows] = await conn.query(
    `SELECT content_key, content
     FROM website_content
     WHERE content_type = 'setting'
       AND content_key IN ('cod_enabled', 'paymongo_enabled')`,
  );

  const values = new Map(
    rows.map((row) => [String(row.content_key), row.content]),
  );

  return {
    cod: parseStoredPaymentToggle(values.get("cod_enabled"), true),
    paymongo: parseStoredPaymentToggle(values.get("paymongo_enabled"), true),
  };
};

/* WISDOM STANDARD PAYMONGO IDEMPOTENCY + RECEIPT V1 */
const getVerifiedStandardPaymongoPayment = async (conn, orderId) => {
  const [[payment]] = await conn.query(
    `SELECT id, amount, payment_method, status
     FROM payment_transactions
     WHERE order_id = ?
       AND LOWER(status) = 'verified'
       AND LOWER(payment_method) = 'paymongo'
     ORDER BY id ASC
     LIMIT 1`,
    [orderId],
  );
  return payment || null;
};

const ensureStandardPaymongoReceipt = async (
  conn,
  order,
  paymentTransactionId,
) => {
  const [[existing]] = await conn.query(
    `SELECT id, receipt_number
     FROM receipts
     WHERE payment_transaction_id = ?
     LIMIT 1`,
    [paymentTransactionId],
  );

  if (existing) {
    return {
      receiptId: existing.id,
      receiptNumber: existing.receipt_number,
      created: false,
    };
  }

  const [items] = await conn.query(
    `SELECT product_name, quantity, unit_price
     FROM order_items
     WHERE order_id = ?
     ORDER BY id ASC`,
    [order.id],
  );

  const receiptNumber = `OR-${Date.now()}`;
  const receipt = await createStandardOnlineReceipt(conn, {
    orderId: order.id,
    paymentTransactionId,
    receiptNumber,
    issuedTo: order.customer_name || order.walkin_customer_name || "Customer",
    issuedBy: order.customer_id,
    totalAmount: Number(order.total || 0),
    providerReference: order.paymongo_session_id || null,
    itemsSnapshot: JSON.stringify(items || []),
  });

  return { ...receipt, created: true };
};

/* ── Get Settings (Payment Info) ── */
exports.getSettings = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT setting_key, value FROM website_settings
       WHERE setting_key IN ('gcash_number','bank_account_name','bank_account_number')`,
    );
    const out = {};
    rows.forEach((r) => {
      out[r.setting_key] = r.value;
    });
    res.json(out);
  } catch (err) {
    res.json({}); // silently return empty — non-critical
  }
};

/* ── Place a New Order ── */
exports.createOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      items: itemsRaw,
      name,
      phone,
      delivery_address,
      delivery_lat,
      delivery_lng,
      payment_method,
      notes,
      assembly_choice,
    } = req.body;
    // NOTE: client-submitted unit_price, subtotal, total, and product_name
    // are intentionally never read from req.body — the server recomputes
    // all of these from the database below.

    let items;
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid items payload." });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Cart is empty." });
    }

    if (!name || !String(name).trim() || !phone || !String(phone).trim()) {
      await conn.rollback();
      return res.status(400).json({ message: "Missing required fields." });
    }

    const normalizedPaymentMethod = String(payment_method || "")
      .trim()
      .toLowerCase();

    if (!ALLOWED_PAYMENT_METHODS.includes(normalizedPaymentMethod)) {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid payment method." });
    }

    if (["cod", "paymongo"].includes(normalizedPaymentMethod)) {
      const paymentAvailability =
        await getStandardCheckoutPaymentAvailability(conn);

      const isAvailable =
        normalizedPaymentMethod === "cod"
          ? paymentAvailability.cod
          : paymentAvailability.paymongo;

      if (!isAvailable) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "The selected payment method is currently unavailable. Please choose another method.",
        });
      }
    }

    // COD and PayMongo (Pay Online) are both delivery orders, so an
    // address is required to actually deliver the items. COP is pickup,
    // so no address is required there.
    const cleanDeliveryAddress = String(delivery_address || "").trim();
    const DELIVERY_REQUIRED_METHODS = ["cod", "paymongo"];
    const isDeliveryOrder = DELIVERY_REQUIRED_METHODS.includes(
      normalizedPaymentMethod,
    );
    const cleanAssemblyChoice = String(assembly_choice || "")
      .trim()
      .toLowerCase();

    if (
      isDeliveryOrder &&
      !["included", "none"].includes(cleanAssemblyChoice)
    ) {
      await conn.rollback();
      return res.status(400).json({
        message: "Please choose an assembly option before placing the order.",
      });
    }

    const storedAssemblyChoice = isDeliveryOrder ? cleanAssemblyChoice : null;

    if (
      DELIVERY_REQUIRED_METHODS.includes(normalizedPaymentMethod) &&
      !cleanDeliveryAddress
    ) {
      await conn.rollback();
      return res.status(400).json({
        message: "Delivery address is required for this payment method.",
      });
    }

    // Delivery orders require a complete map pin as well as the address
    // text. COP is pickup and remains exempt from the map requirement.
    const hasDeliveryLat =
      delivery_lat !== undefined &&
      delivery_lat !== null &&
      delivery_lat !== "";
    const hasDeliveryLng =
      delivery_lng !== undefined &&
      delivery_lng !== null &&
      delivery_lng !== "";
    const requiresDeliveryPin = DELIVERY_REQUIRED_METHODS.includes(
      normalizedPaymentMethod,
    );

    if (requiresDeliveryPin && (!hasDeliveryLat || !hasDeliveryLng)) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Please pin the delivery location on the map before placing the order.",
      });
    }

    let cleanDeliveryLat = null;
    let cleanDeliveryLng = null;

    if (hasDeliveryLat || hasDeliveryLng) {
      const latNum = Number(delivery_lat);
      const lngNum = Number(delivery_lng);

      if (
        !hasDeliveryLat ||
        !hasDeliveryLng ||
        !Number.isFinite(latNum) ||
        !Number.isFinite(lngNum) ||
        latNum < -90 ||
        latNum > 90 ||
        lngNum < -180 ||
        lngNum > 180 ||
        (latNum === 0 && lngNum === 0)
      ) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Invalid delivery pin. Please select the actual delivery location on the map.",
        });
      }

      cleanDeliveryLat = latNum;
      cleanDeliveryLng = lngNum;
    }

    const mergedItemsMap = new Map();

    for (const rawItem of items) {
      const productId = Number(rawItem?.product_id);

      if (!Number.isInteger(productId) || productId <= 0) {
        await conn.rollback();
        return res.status(400).json({ message: "Invalid product in cart." });
      }

      if (!isValidPositiveInteger(rawItem?.quantity)) {
        await conn.rollback();
        return res.status(400).json({
          message: "Quantity must be a whole number greater than 0.",
        });
      }

      const qty = Number(rawItem.quantity);
      const existing = mergedItemsMap.get(productId);

      mergedItemsMap.set(productId, {
        product_id: productId,
        quantity: (existing?.quantity || 0) + qty,
      });
    }

    /* ── Step 2: validate + price each merged (deduplicated) line from
       the database (never trust the client). ── */
    const validatedItems = [];

    for (const {
      product_id: productId,
      quantity: qty,
    } of mergedItemsMap.values()) {
      if (qty > MAX_ITEM_QUANTITY) {
        await conn.rollback();
        return res.status(400).json({
          message: `Quantity per item cannot exceed ${MAX_ITEM_QUANTITY}.`,
        });
      }

      // Lock the row for this transaction so two customers checking out
      // at the same time can't both oversell the same stock.
      const [productRows] = await conn.query(
        `SELECT id, name, online_price, stock, is_published
         FROM products
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [productId],
      );

      const product = productRows[0];

      if (!product || Number(product.is_published) !== 1) {
        await conn.rollback();
        return res.status(400).json({
          message: "One of the items in your cart is no longer available.",
        });
      }

      let unitPrice = Number(product.online_price || 0);
      let availableStock = Number(product.stock || 0);
      let displayName = product.name;

      if (qty > availableStock) {
        await conn.rollback();
        return res.status(400).json({
          message: `Insufficient stock for "${displayName}". Only ${availableStock} left.`,
        });
      }

      validatedItems.push({
        product_id: productId,
        product_name: displayName,
        quantity: qty,
        unit_price: unitPrice,
        item_subtotal: roundMoney(unitPrice * qty),
      });
    }

    const subtotal = roundMoney(
      validatedItems.reduce((sum, item) => sum + item.item_subtotal, 0),
    );
    const total = subtotal; // no tax/discount in standard checkout currently

    /* Generate order number: SWS-YYYYMMDD-XXXX */
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    const order_number = `SWS-${dateStr}-${rand}`;

    /* Payment status logic */
    const payment_status = ["cod", "cop"].includes(normalizedPaymentMethod)
      ? "unpaid"
      : "partial";

    const proof_path = req.file ? req.file.path : null; // Use the Cloudinary URL
    /* Insert order */
    const [orderRes] = await conn.query(
      `INSERT INTO orders
        (order_number, customer_id, type, order_type, status,
        payment_method, payment_status, payment_proof,
        delivery_address, delivery_lat, delivery_lng,
        walkin_customer_name, walkin_customer_phone,
        notes, subtotal, total, created_at)
      VALUES (?,?,'online','standard','pending',?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        order_number,
        req.user.id,
        normalizedPaymentMethod,
        payment_status,
        proof_path,
        cleanDeliveryAddress,
        cleanDeliveryLat,
        cleanDeliveryLng,
        String(name).trim(),
        String(phone).trim(),
        notes || "",
        subtotal,
        total,
      ],
    );

    const order_id = orderRes.insertId;

    const readyMadeCustomizationJson = storedAssemblyChoice
      ? JSON.stringify({
          assembly_choice: storedAssemblyChoice,
          source: "ready_made_checkout",
        })
      : null;

    for (const item of validatedItems) {
      await conn.query(
        `INSERT INTO order_items
          (order_id, product_id,
           product_name, quantity, unit_price, customization_json)
         VALUES (?,?,?,?,?,?)`,
        [
          order_id,
          item.product_id,
          item.product_name,
          item.quantity,
          item.unit_price,
          readyMadeCustomizationJson,
        ],
      );

      /* Deduct stock */
      await conn.query(
        `UPDATE products
   SET stock = stock - ?
   WHERE id = ?`,
        [item.quantity, item.product_id],
      );

      /* Update stock_status after deduction */
      await conn.query(
        `UPDATE products
         SET stock_status = CASE
           WHEN stock <= 0              THEN 'out_of_stock'
           WHEN stock <= reorder_point  THEN 'low_stock'
           ELSE 'in_stock'
         END
         WHERE id = ?`,
        [item.product_id],
      );
    }

    await conn.commit();

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "create_online_order",
      tableName: "orders",
      recordId: order_id,
      newValues: {
        order_number,
        status: "pending",
        payment_status,
        payment_method: normalizedPaymentMethod,
        assembly_choice: storedAssemblyChoice,
        total,
        item_count: validatedItems.reduce(
          (sum, item) => sum + Number(item.quantity || 0),
          0,
        ),
      },
      ipAddress: req.ip || null,
    });

    // In-system admin alert: email remains unchanged, but the dashboard bell
    // should also surface a new online order immediately.
    try {
      const [activeAdmins] = await conn.query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active = 1`,
      );
      const totalLabel = Number(total || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const paymentLabel = getPaymentMethodLabel(normalizedPaymentMethod);

      for (const admin of activeAdmins) {
        await createNotificationSafe(conn, {
          userId: admin.id,
          type: "new_online_order",
          title: "New Online Order",
          message: `Order ${order_number} from ${String(name).trim()} was placed for ₱${totalLabel} using ${paymentLabel}. Review the order before processing.`,
          targetType: "order",
          targetId: order_id,
          targetOrderId: order_id,
        });
      }
    } catch (notificationErr) {
      console.error("[New Order Notification Error]", notificationErr.message);
    }

    // 👉 D. Admin Alert Routing
    try {
      const [[adminEmailSetting]] = await conn.query(
        "SELECT content FROM website_content WHERE content_key = 'admin_alert_email' LIMIT 1",
      );
      const adminAlertEmail = adminEmailSetting?.content?.trim();
      if (adminAlertEmail) {
        const footerHtml = await getGlobalEmailFooter(conn);
        await sendBrevoEmail({
          toEmail: adminAlertEmail,
          toName: "System Admin",
          subject: `New Order Received: ${order_number}`,
          htmlContent: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
              <h2 style="color:#8B4513">New Order Alert</h2>
              <p>A new order has been placed on the storefront.</p>
              <p><strong>Order Number:</strong> ${order_number}</p>
              <p><strong>Customer Name:</strong> ${name}</p>
              <p><strong>Phone:</strong> ${phone}</p>
              <p><strong>Total Amount:</strong> ₱${Number(total).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;">
                ${footerHtml}
              </table>
            </div>
          `,
        });
      }
    } catch (alertErr) {
      console.error("[Admin Alert Email Error]", alertErr.message);
    }

    if (normalizedPaymentMethod === "paymongo") {
      try {
        // Fetch the customer's email from the database
        const [[userRecord]] = await conn.query(
          `SELECT email FROM users WHERE id = ? LIMIT 1`,
          [req.user.id],
        );
        const customerEmail = userRecord?.email || "";

        const frontendUrl = process.env.FRONTEND_URL || req.headers.origin;

        const checkout = await createCheckoutSession({
          customer: {
            name,
            phone,
            email: customerEmail,
          },
          amount: total,
          description: `Order ${order_number} - Spiral Wood`,
          successUrl: `${frontendUrl}/orders?verify_success=true&order=${order_number}`,
          cancelUrl: `${frontendUrl}/cart`,
          metadata: {
            order_id: order_id,
            order_type: "standard",
          },
        });

        const checkoutUrl = checkout.checkoutUrl;

        const sessionId = checkout.sessionId;

        await conn.query(
          `UPDATE orders 
           SET payment_status = 'unpaid', payment_url = ?, paymongo_session_id = ? 
           WHERE id = ?`,
          [checkoutUrl, sessionId, order_id],
        );

        return res.status(201).json({
          message: "Order placed. Redirecting to payment...",
          order_id,
          order_number,
          payment_url: checkoutUrl,
        });
      } catch (paymongoError) {
        console.error(
          "PayMongo Error:",
          paymongoError.response?.data || paymongoError.message,
        );
        return res.status(201).json({
          message: "Order placed, but payment link generation failed.",
          order_id,
          order_number,
          total: parseFloat(total),
          payment_status,
        });
      }
    }

    res.status(201).json({
      message: "Order placed successfully.",
      order_id,
      order_number,
      total: parseFloat(total),
      payment_status,
    });
  } catch (err) {
    if (!conn.connection._fatalError) await conn.rollback();
    console.error("[customer.orders POST]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  } finally {
    conn.release();
  }
};

/* ── List My Orders ── */
exports.getOrders = async (req, res) => {
  try {
    // WISDOM CUSTOMER ORDERS BATCH READ V1
    // Keep the response shape unchanged while avoiding one or more
    // database round-trips for every order on the page.
    const [orders] = await db.query(
      `SELECT id, order_number, status, payment_method,
              payment_status, subtotal, total, payment_url,
              delivery_address, order_type, blueprint_id,
              walkin_customer_name AS recipient_name,
              notes, created_at
       FROM orders
       WHERE customer_id = ?
       ORDER BY created_at DESC`,
      [req.user.id],
    );

    if (!orders.length) {
      return res.json([]);
    }

    const orderIds = orders
      .map((order) => Number(order.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const orderPlaceholders = orderIds.map(() => "?").join(",");
    const [itemRows] = await db.query(
      `SELECT
          oi.id,
          oi.order_id,
          oi.product_name,
          oi.quantity,
          oi.unit_price,
          oi.customization_json,
          p.image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id IN (${orderPlaceholders})
       ORDER BY oi.order_id ASC, oi.id ASC`,
      orderIds,
    );

    const orderTypeById = new Map(
      orders.map((order) => [
        Number(order.id),
        String(order.order_type || "")
          .trim()
          .toLowerCase(),
      ]),
    );

    // WISDOM MY ORDERS PER-ITEM BLUEPRINT SCENE V1.0.0
    const parseCustomizationJson = (value) => {
      if (!value) return {};
      if (typeof value === "object" && !Array.isArray(value)) return value;

      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    };

    const itemsByOrderId = new Map();

    for (const row of itemRows) {
      const orderId = Number(row.order_id);
      if (!itemsByOrderId.has(orderId)) {
        itemsByOrderId.set(orderId, []);
      }

      const isBlueprintOrder = orderTypeById.get(orderId) === "blueprint";
      const customization = parseCustomizationJson(row.customization_json);
      const editorSnapshot =
        customization?.editor_snapshot &&
        typeof customization.editor_snapshot === "object" &&
        !Array.isArray(customization.editor_snapshot)
          ? customization.editor_snapshot
          : {};

      const components = Array.isArray(editorSnapshot.components)
        ? editorSnapshot.components
        : [];
      const worldSize =
        editorSnapshot?.worldSize &&
        typeof editorSnapshot.worldSize === "object"
          ? editorSnapshot.worldSize
          : null;

      const blueprintTitle = String(
        customization?.base_blueprint_title ||
          row.product_name ||
          "Custom Furniture",
      ).trim();

      const submittedBlueprintPreview =
        isBlueprintOrder && components.length > 0
          ? {
              id: `order-item-${row.id}`,
              updated_at: `submitted-order-item-${row.id}`,
              title: blueprintTitle,
              thumbnail_url: null,
              components,
              view_3d_data: {
                components,
                worldSize,
              },
            }
          : null;

      const customImageUrl = String(
        customization?.preview_image_url || customization?.image_url || "",
      ).trim();

      itemsByOrderId.get(orderId).push({
        product_name: row.product_name,
        quantity: row.quantity,
        unit_price: row.unit_price,
        image_url: customImageUrl || row.image_url,
        is_custom_blueprint: isBlueprintOrder,
        blueprint_title: isBlueprintOrder ? blueprintTitle : null,
        blueprint_preview: submittedBlueprintPreview,
      });
    }

    const blueprintIds = [
      ...new Set(
        orders
          .map((order) => Number(order.blueprint_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    const blueprintById = new Map();
    const blueprintComponentsById = new Map();

    if (blueprintIds.length > 0) {
      const blueprintPlaceholders = blueprintIds.map(() => "?").join(",");
      const [blueprintRows] = await db.query(
        `SELECT id, title, thumbnail_url, source, file_url, file_type,
                design_data, view_3d_data
         FROM blueprints
         WHERE id IN (${blueprintPlaceholders})`,
        blueprintIds,
      );

      // WISDOM CUSTOMER ORDER COMPONENT PREVIEW FALLBACK V1
      const [blueprintComponentRows] = await db.query(
        `SELECT *
         FROM blueprint_components
         WHERE blueprint_id IN (${blueprintPlaceholders})
         ORDER BY blueprint_id ASC, id ASC`,
        blueprintIds,
      );

      for (const component of blueprintComponentRows) {
        const blueprintId = Number(component.blueprint_id);
        if (!blueprintComponentsById.has(blueprintId)) {
          blueprintComponentsById.set(blueprintId, []);
        }
        blueprintComponentsById.get(blueprintId).push(component);
      }

      for (const row of blueprintRows) {
        blueprintById.set(Number(row.id), {
          id: row.id,
          title: row.title,
          thumbnail_url: row.thumbnail_url,
          source: row.source,
          file_url: row.file_url,
          file_type: row.file_type,
          design_data: row.design_data,
          view_3d_data: row.view_3d_data,
          components: blueprintComponentsById.get(Number(row.id)) || [],
        });
      }
    }

    for (const order of orders) {
      const items = itemsByOrderId.get(Number(order.id)) || [];

      order.item_count = items.length;
      order.total_qty = items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      );

      // Compact My Orders cards only need a small preview.
      // Full item details still come from GET /customer/orders/:id.
      order.items_preview = items.slice(0, 2);

      const blueprintId = Number(order.blueprint_id);
      order.blueprint_preview =
        Number.isInteger(blueprintId) && blueprintId > 0
          ? blueprintById.get(blueprintId) || null
          : null;
    }

    return res.json(orders);
  } catch (err) {
    console.error("[customer.orders GET]", err);
    return res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [rows] = await db.query(
      `SELECT * FROM orders
       WHERE id = ? AND customer_id = ?`,
      [parseInt(req.params.id), req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Order not found." });

    const order = rows[0];
    order.blueprint_detail_preview = null;
    if (order.blueprint_id) {
      const [blueprintRows] = await db.query(
        `SELECT title, thumbnail_url, source, file_url, file_type, design_data, view_3d_data
         FROM blueprints
         WHERE id = ?
         LIMIT 1`,
        [order.blueprint_id],
      );

      order.blueprint_detail_preview = blueprintRows[0] || null;

      // WISDOM CUSTOMER ORDER DETAIL COMPONENT PREVIEW V1
      if (order.blueprint_detail_preview) {
        const [detailComponentRows] = await db.query(
          `SELECT *
           FROM blueprint_components
           WHERE blueprint_id = ?
           ORDER BY id ASC`,
          [order.blueprint_id],
        );
        order.blueprint_detail_preview.components = detailComponentRows;
      }
    }
    // ── FIXED: Switched to .query ──
    const [items] = await db.query(
      `SELECT oi.*, p.image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [order.id],
    );
    order.items = items;

    // WISDOM STANDARD ORDER RECEIPT METADATA V1
    // My Orders only needs the newest real, verified receipt reference.
    // Receipt content is loaded separately through an ownership-checked
    // customer endpoint.
    const [[receipt]] = await db.query(
      `SELECT
         r.id,
         r.receipt_number,
         r.payment_method_snapshot,
         r.created_at
       FROM receipts r
       INNER JOIN payment_transactions pt
         ON pt.id = r.payment_transaction_id
         AND pt.order_id = r.order_id
         AND LOWER(pt.status) = 'verified'
       WHERE r.order_id = ?
         AND r.receipt_type = 'pos_sale'
       ORDER BY r.id DESC
       LIMIT 1`,
      [order.id],
    );

    order.receipt = receipt || null;

    res.json(order);
  } catch (err) {
    console.error("[customer.orders/:id]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Customer Confirms Delivery ── */
exports.confirmOrder = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [[order]] = await db.query(
      `SELECT id, status, payment_status, payment_method
       FROM orders
       WHERE id = ? AND customer_id = ?
       LIMIT 1`,
      [parseInt(req.params.id), req.user.id],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.status !== "delivered") {
      return res.status(400).json({
        message: "Only delivered orders can be confirmed by the customer.",
      });
    }

    if (String(order.payment_status || "").toLowerCase() !== "paid") {
      return res.status(400).json({
        message:
          "This order cannot be completed yet because payment is not fully settled.",
      });
    }

    const parsedOrderId = parseInt(req.params.id);

    // ── FIXED: Switched to .query and parsed ID ──
    const [result] = await db.query(
      `UPDATE orders
       SET status = 'completed'
       WHERE id = ? AND customer_id = ? AND status = 'delivered' AND payment_status = 'paid'`,
      [parsedOrderId, req.user.id],
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        message: "Order could not be confirmed.",
      });
    }

    // 👉 NEW: Also update the rider's delivery record to 'completed'
    await db.query(
      `UPDATE deliveries 
       SET status = 'completed', updated_at = NOW() 
       WHERE order_id = ? AND status = 'delivered'`,
      [parsedOrderId],
    );

    req.auditRecord = {
      id: order.id,
      old: { status: "delivered" },
      new: { status: "completed" },
    };

    res.json({ message: "Order confirmed successfully." });
  } catch (err) {
    console.error("[customer.orders/:id/confirm]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Verify PayMongo Redirect ── */
exports.verifyPayment = async (req, res) => {
  try {
    const { order_number } = req.body;

    if (!order_number) {
      return res.status(400).json({ message: "Order number is required." });
    }

    const [[order]] = await db.query(
      `SELECT id, order_number, total, payment_status, paymongo_session_id,
              customer_id,
              COALESCE(
                (SELECT name FROM users WHERE id = customer_id LIMIT 1),
                walkin_customer_name,
                'Customer'
              ) AS customer_name,
              walkin_customer_name
       FROM orders
       WHERE order_number = ? AND customer_id = ?
       LIMIT 1`,
      [order_number, req.user.id],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    // Already-paid returns still run through a short locked transaction so
    // older successful orders can gain their missing receipt idempotently.
    if (String(order.payment_status || "").toLowerCase() === "paid") {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const [[lockedOrder]] = await conn.query(
          `SELECT id, order_number, total, payment_status, paymongo_session_id,
                  customer_id,
                  COALESCE(
                    (SELECT name FROM users WHERE id = customer_id LIMIT 1),
                    walkin_customer_name,
                    'Customer'
                  ) AS customer_name,
                  walkin_customer_name
           FROM orders
           WHERE id = ? AND customer_id = ?
           LIMIT 1
           FOR UPDATE`,
          [order.id, req.user.id],
        );

        if (!lockedOrder) {
          await conn.rollback();
          return res.status(404).json({ message: "Order not found." });
        }

        const existingPayment = await getVerifiedStandardPaymongoPayment(
          conn,
          lockedOrder.id,
        );

        let receipt = null;
        if (existingPayment) {
          receipt = await ensureStandardPaymongoReceipt(
            conn,
            lockedOrder,
            existingPayment.id,
          );
        }

        await conn.commit();

        return res.json({
          success: true,
          already_verified: true,
          message: "Payment already verified.",
          order_id: lockedOrder.id,
          order_number: lockedOrder.order_number,
          payment_status: "paid",
          receipt_id: receipt?.receiptId || null,
          receipt_number: receipt?.receiptNumber || null,
        });
      } catch (dbErr) {
        if (!conn.connection._fatalError) await conn.rollback();
        throw dbErr;
      } finally {
        conn.release();
      }
    }

    if (!order.paymongo_session_id) {
      return res.json({
        success: false,
        message: "Payment session is unavailable. Order remains unpaid.",
      });
    }

    // Provider lookup intentionally occurs before taking a DB lock.
    const session = await retrieveCheckoutSession(order.paymongo_session_id);
    const payments = session.attributes.payments || [];
    const hasSuccessfulPayment = payments.some(
      (payment) => payment.attributes.status === "paid",
    );

    if (!hasSuccessfulPayment) {
      return res.json({
        success: false,
        message: "Payment has not been completed yet. Order remains unpaid.",
      });
    }

    // PayMongo says paid. Serialize finalization on the order row. This second
    // check is the critical race fix: two simultaneous browser verification
    // calls can no longer both insert a verified payment transaction.
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[lockedOrder]] = await conn.query(
        `SELECT id, order_number, total, payment_status, paymongo_session_id,
                customer_id,
                COALESCE(
                  (SELECT name FROM users WHERE id = customer_id LIMIT 1),
                  walkin_customer_name,
                  'Customer'
                ) AS customer_name,
                walkin_customer_name
         FROM orders
         WHERE id = ? AND customer_id = ?
         LIMIT 1
         FOR UPDATE`,
        [order.id, req.user.id],
      );

      if (!lockedOrder) {
        await conn.rollback();
        return res.status(404).json({ message: "Order not found." });
      }

      let verifiedPayment = await getVerifiedStandardPaymongoPayment(
        conn,
        lockedOrder.id,
      );
      let insertedPayment = false;

      if (!verifiedPayment) {
        const [paymentInsertResult] = await conn.query(
          `INSERT INTO payment_transactions
            (order_id, amount, payment_method, proof_url, status, verified_at, notes)
           VALUES (?, ?, 'paymongo', '', 'verified', NOW(),
                   'Automatically verified via PayMongo checkout.')`,
          [lockedOrder.id, lockedOrder.total],
        );

        verifiedPayment = {
          id: paymentInsertResult.insertId,
          amount: lockedOrder.total,
          payment_method: "paymongo",
          status: "verified",
        };
        insertedPayment = true;
      }

      await conn.query(
        `UPDATE orders
         SET payment_status = 'paid', status = 'confirmed'
         WHERE id = ?`,
        [lockedOrder.id],
      );

      const receipt = await ensureStandardPaymongoReceipt(
        conn,
        lockedOrder,
        verifiedPayment.id,
      );

      await conn.commit();

      if (insertedPayment) {
        await writeAuditLogSafe({
          userId: req.user.id,
          action: "verify_online_payment",
          tableName: "payment_transactions",
          recordId: verifiedPayment.id,
          newValues: {
            order_id: lockedOrder.id,
            order_number: lockedOrder.order_number,
            amount: lockedOrder.total,
            payment_method: "paymongo",
            payment_status: "paid",
            result: "verified",
            receipt_number: receipt.receiptNumber,
          },
          ipAddress: req.ip || null,
        });
      }

      return res.json({
        success: true,
        already_verified: !insertedPayment,
        message: insertedPayment
          ? "Payment verified successfully!"
          : "Payment already verified.",
        order_id: lockedOrder.id,
        order_number: lockedOrder.order_number,
        payment_status: "paid",
        receipt_id: receipt.receiptId,
        receipt_number: receipt.receiptNumber,
      });
    } catch (dbErr) {
      if (!conn.connection._fatalError) await conn.rollback();
      throw dbErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(
      "[customer.orders verifyPayment]",
      err.response?.data || err.message,
    );
    res.status(500).json({
      message: "Server error during verification.",
      error: err.message,
    });
  }
};

/* ── Customer Cancels Order ── */
exports.cancelOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { reason } = req.body;
    const orderId = parseInt(req.params.id); // ── FIXED: Parse ID ──
    const customerId = req.user.id;

    // 1. Update the order ONLY if it is still 'pending'
    const [updateResult] = await conn.query(
      `UPDATE orders
   SET status = 'cancelled',
       cancellation_reason = ?,
       cancelled_at = NOW()
   WHERE id = ? AND customer_id = ? AND status = 'pending'`,
      [reason || "Cancelled by customer", orderId, customerId],
    );

    if (updateResult.affectedRows === 0) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Order could not be cancelled. It may not exist or is no longer pending.",
      });
    }

    // 2. Fetch all items associated with this cancelled order
    const [items] = await conn.query(
      `SELECT product_id, quantity
   FROM order_items
   WHERE order_id = ?`,
      [orderId],
    );

    for (const item of items) {
      await conn.query(
        `UPDATE products
     SET stock = stock + ?
     WHERE id = ?`,
        [item.quantity, item.product_id],
      );

      await conn.query(
        `UPDATE products
     SET stock_status = CASE
       WHEN stock <= 0 THEN 'out_of_stock'
       WHEN stock <= reorder_point THEN 'low_stock'
       ELSE 'in_stock'
     END
     WHERE id = ?`,
        [item.product_id],
      );
    }

    await conn.commit();

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "cancel_online_order",
      tableName: "orders",
      recordId: orderId,
      oldValues: { status: "pending" },
      newValues: {
        status: "cancelled",
        cancellation_reason_provided: Boolean(String(reason || "").trim()),
      },
      ipAddress: req.ip || null,
    });

    res.json({ message: "Order cancelled and submitted for admin review." });
  } catch (err) {
    if (!conn.connection._fatalError) await conn.rollback();
    console.error("[customer.orders/:id/cancel]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  } finally {
    conn.release();
  }
};

// taking back the reserve stock on unpaid online transactions

/* ── Automated Task: Audit and Cancel Unpaid PayMongo Orders ── */
exports.autoCancelExpiredOrders = async () => {
  try {
    // 1. Find expired orders (No transaction lock here to save Aiven DB limits)
    const [expiredOrders] = await db.query(
      `SELECT id, order_number, total, paymongo_session_id FROM orders 
       WHERE payment_method = 'paymongo' 
         AND payment_status = 'unpaid' 
         AND status = 'pending' 
         AND created_at <= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    );

    if (expiredOrders.length === 0) return;

    // 2. Loop through and audit each order ONE BY ONE
    for (const order of expiredOrders) {
      let isActuallyPaid = false;

      // Double-check with PayMongo over the network (No DB locks held during this wait!)
      if (order.paymongo_session_id) {
        try {
          const session = await retrieveCheckoutSession(
            order.paymongo_session_id,
          );

          const payments = session.attributes.payments || [];
          isActuallyPaid = payments.some((p) => p.attributes.status === "paid");
        } catch (pmErr) {
          console.error(
            `[Cron] PayMongo check failed for order ${order.order_number}:`,
            pmErr.message,
          );
          continue; // Skip this order safely and try again next time the cron runs
        }
      }

      // 3. Open a short, fast transaction to update this specific order
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        if (isActuallyPaid) {
          // RECOVERED PAYMENT. Lock + re-check so the cron and customer
          // return flow cannot create two verified rows for the same standard order.
          const [[lockedOrder]] = await conn.query(
            `SELECT id, order_number, total, payment_status, paymongo_session_id,
                    customer_id,
                    COALESCE(
                      (SELECT name FROM users WHERE id = customer_id LIMIT 1),
                      walkin_customer_name,
                      'Customer'
                    ) AS customer_name,
                    walkin_customer_name
             FROM orders
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [order.id],
          );

          if (!lockedOrder) {
            await conn.rollback();
            continue;
          }

          let verifiedPayment = await getVerifiedStandardPaymongoPayment(
            conn,
            lockedOrder.id,
          );

          if (!verifiedPayment) {
            const [paymentInsertResult] = await conn.query(
              `INSERT INTO payment_transactions
                (order_id, amount, payment_method, proof_url, status, verified_at, notes)
               VALUES (?, ?, 'paymongo', '', 'verified', NOW(),
                       'Automatically verified via PayMongo checkout (Recovered by System Audit).')`,
              [lockedOrder.id, lockedOrder.total],
            );
            verifiedPayment = { id: paymentInsertResult.insertId };
          }

          await conn.query(
            `UPDATE orders
             SET payment_status = 'paid', status = 'confirmed'
             WHERE id = ?`,
            [lockedOrder.id],
          );

          await ensureStandardPaymongoReceipt(
            conn,
            lockedOrder,
            verifiedPayment.id,
          );

          console.log(
            `[Cron] Recovered payment safely for order ${lockedOrder.order_number}`,
          );
        } else {
          // Cancel the order and return the stock.
          await conn.query(
            `UPDATE orders
             SET status = 'cancelled',
                 notes = CONCAT(IFNULL(notes, ''), '\n[System]: Auto-cancelled due to payment timeout.')
             WHERE id = ?`,
            [order.id],
          );

          const [items] = await conn.query(
            `SELECT product_id, quantity
   FROM order_items
   WHERE order_id = ?`,
            [order.id],
          );

          for (const item of items) {
            await conn.query(
              `UPDATE products
     SET stock = stock + ?
     WHERE id = ?`,
              [item.quantity, item.product_id],
            );

            await conn.query(
              `UPDATE products
     SET stock_status = CASE
       WHEN stock <= 0 THEN 'out_of_stock'
       WHEN stock <= reorder_point THEN 'low_stock'
       ELSE 'in_stock'
     END
     WHERE id = ?`,
              [item.product_id],
            );
          }
          console.log(
            `[Cron] Auto-cancelled and restocked order ${order.order_number}`,
          );
        }

        await conn.commit();

        await writeAuditLogSafe({
          userId: null,
          action: isActuallyPaid
            ? "system_recover_online_payment"
            : "system_cancel_unpaid_order",
          tableName: "orders",
          recordId: order.id,
          newValues: isActuallyPaid
            ? {
                order_number: order.order_number,
                payment_status: "paid",
                order_status: "confirmed",
                amount: order.total,
                result: "recovered",
              }
            : {
                order_number: order.order_number,
                order_status: "cancelled",
                reason: "payment_timeout",
                result: "auto_cancelled",
              },
          ipAddress: null,
        });
      } catch (dbErr) {
        if (!conn.connection._fatalError) await conn.rollback();
        console.error(`[Cron DB Error] Order ${order.order_number}:`, dbErr);
      } finally {
        conn.release();
      }
    }
  } catch (err) {
    console.error("[Cron Error] Auto-cancelling expired orders:", err);
  }
};
