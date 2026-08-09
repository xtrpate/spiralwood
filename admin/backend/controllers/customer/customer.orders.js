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

/* ── Standard checkout constants ── */
const ALLOWED_PAYMENT_METHODS = ["cod", "cop", "paymongo"];
const MAX_ITEM_QUANTITY = 1000; // sanity ceiling, not a business limit

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

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

    // COD and PayMongo (Pay Online) are both delivery orders, so an
    // address is required to actually deliver the items. COP is pickup,
    // so no address is required there.
    const cleanDeliveryAddress = String(delivery_address || "").trim();
    const DELIVERY_REQUIRED_METHODS = ["cod", "paymongo"];
    if (
      DELIVERY_REQUIRED_METHODS.includes(normalizedPaymentMethod) &&
      !cleanDeliveryAddress
    ) {
      await conn.rollback();
      return res.status(400).json({
        message: "Delivery address is required for this payment method.",
      });
    }

    // The map pin is optional for now (not required even for COD/PayMongo)
    // — only validate lat/lng when the customer actually provided a value.
    // If provided, both must be present together (no half-a-pin).
    const hasDeliveryLat =
      delivery_lat !== undefined &&
      delivery_lat !== null &&
      delivery_lat !== "";
    const hasDeliveryLng =
      delivery_lng !== undefined &&
      delivery_lng !== null &&
      delivery_lng !== "";

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
        lngNum > 180
      ) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Invalid map location. Latitude must be between -90 and 90, and longitude between -180 and 180.",
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

    const proof_path = req.file ? `uploads/proofs/${req.file.filename}` : null;
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

    for (const item of validatedItems) {
      await conn.query(
        `INSERT INTO order_items
          (order_id, product_id,
           product_name, quantity, unit_price)
         VALUES (?,?,?,?,?)`,
        [
          order_id,
          item.product_id,
          item.product_name,
          item.quantity,
          item.unit_price,
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

    for (const order of orders) {
      const [items] = await db.query(
        `SELECT oi.product_name, oi.quantity, oi.unit_price, p.image_url
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC`,
        [order.id],
      );

      order.item_count = items.length;
      order.total_qty = items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      );

      // Compact My Orders cards only need a small preview.
      // Full item details still come from GET /customer/orders/:id.
      order.items_preview = items.slice(0, 2);
      order.blueprint_preview = null;
      if (order.blueprint_id) {
        const [blueprintRows] = await db.query(
          `SELECT title, thumbnail_url, source, file_url, file_type
           FROM blueprints
           WHERE id = ?
           LIMIT 1`,
          [order.blueprint_id],
        );

        order.blueprint_preview = blueprintRows[0] || null;
      }
    }

    res.json(orders);
  } catch (err) {
    console.error("[customer.orders GET]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Single Order Detail ── */
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
        `SELECT title, thumbnail_url, source, file_url, file_type
         FROM blueprints
         WHERE id = ?
         LIMIT 1`,
        [order.blueprint_id],
      );

      order.blueprint_detail_preview = blueprintRows[0] || null;
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

    // ── FIXED: Switched to .query and parsed ID ──
    const [result] = await db.query(
      `UPDATE orders
       SET status = 'completed'
       WHERE id = ? AND customer_id = ? AND status = 'delivered' AND payment_status = 'paid'`,
      [parseInt(req.params.id), req.user.id],
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        message: "Order could not be confirmed.",
      });
    }

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

    // 1. Quick read (No transaction locking yet)
    const [[order]] = await db.query(
      `SELECT id, total, payment_status, paymongo_session_id 
       FROM orders 
       WHERE order_number = ? AND customer_id = ? LIMIT 1`,
      [order_number, req.user.id],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    // If already verified, stop here.
    if (order.payment_status === "partial" || order.payment_status === "paid") {
      return res.json({ success: true, message: "Payment already verified." });
    }

    // 2. Ask PayMongo over the network (Database is completely free and unlocked right now)
    if (order.paymongo_session_id) {
      const session = await retrieveCheckoutSession(order.paymongo_session_id);

      const payments = session.attributes.payments || [];
      const hasSuccessfulPayment = payments.some(
        (payment) => payment.attributes.status === "paid",
      );

      // 3. ONLY if PayMongo says "Paid" do we open a strict transaction to write the data
      if (hasSuccessfulPayment) {
        const conn = await db.getConnection();
        try {
          await conn.beginTransaction();

          await conn.query(
            `UPDATE orders 
             SET payment_status = 'paid', status = 'confirmed' 
             WHERE id = ?`,
            [order.id],
          );

          await conn.query(
            `INSERT INTO payment_transactions
              (order_id, amount, payment_method, proof_url, status, verified_at, notes)
             VALUES (?, ?, 'paymongo', '', 'verified', NOW(), 'Automatically verified via PayMongo checkout.')`,
            [order.id, order.total],
          );

          await conn.commit();
          return res.json({
            success: true,
            message: "Payment verified successfully!",
          });
        } catch (dbErr) {
          if (!conn.connection._fatalError) await conn.rollback();
          throw dbErr; // Pass to the outer catch block
        } finally {
          conn.release();
        }
      }
    }

    // 4. Verification Failed (Customer abandoned or payment declined)
    return res.json({
      success: false,
      message: "Payment has not been completed yet. Order remains unpaid.",
    });
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
          // 🚨 RECOVERED PAYMENT! The customer paid but closed the tab.
          await conn.query(
            `UPDATE orders 
             SET payment_status = 'paid', status = 'confirmed' 
             WHERE id = ?`,
            [order.id],
          );

          await conn.query(
            `INSERT INTO payment_transactions
              (order_id, amount, payment_method, proof_url, status, verified_at, notes)
             VALUES (?, ?, 'paymongo', '', 'verified', NOW(), 'Automatically verified via PayMongo checkout (Recovered by System Audit).')`,
            [order.id, order.total],
          );
          console.log(
            `[Cron] Recovered missing payment for order ${order.order_number}`,
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
