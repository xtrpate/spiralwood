// controllers/staff/pos.orders.js
const db = require("../../config/db");
const { createPosSaleReceipt } = require("../../services/receiptService");
const { parseStrictPositiveInt } = require("../../utils/validators");
const {
  parseDecimalToCentsStrict,
  centsToDecimalString,
  centsToAmount,
  MAX_DECIMAL_12_2_CENTS,
} = require("../../utils/paymentAmounts");
const { emitOrderCreated } = require("../../utils/orderStatusSocket");
const {
  normalizePhilippinePhone,
  getPhoneLookupVariants,
  phoneDigitsSql,
} = require("../../utils/phone");
const {
  getPhilippineDateTimeMinuteKey,
} = require("../../utils/philippineTime");

const MAX_POS_CART_LINES = 100;
const MAX_POS_ITEM_QUANTITY = 1000;
const MAX_DECIMAL_10_2_CENTS = 9999999999;
const MAX_POS_ADDRESS_LENGTH = 1000;
const MAX_POS_NOTES_LENGTH = 2000;
const POS_CASH_TOP_LEVEL_KEYS = new Set([
  "customer_name",
  "customer_phone",
  "items",
  "payment_method",
  "cash_received",
  "discount",
  "delivery_fee",
  "expected_total",
  "notes",
  "delivery",
]);
const POS_CASH_ITEM_KEYS = new Set(["product_id", "quantity"]);
const POS_CASH_DELIVERY_KEYS = new Set([
  "address",
  "lat",
  "lng",
  "requested_date",
  "notes",
]);

const hasOnlyAllowedKeys = (value, allowedKeys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowedKeys.has(key));

const normalizeIdempotencyKey = (value) => {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!key || key.length > 128) return null;
  return /^[A-Za-z0-9._:-]+$/.test(key) ? key : null;
};

const parseSubmittedMoneyCents = (value, { allowZero = true, maxCents } = {}) => {
  if (typeof value !== "string") return null;
  const cents = parseDecimalToCentsStrict(value);
  if (cents === null) return null;
  if (!allowZero && cents <= 0) return null;
  if (typeof maxCents === "number" && cents > maxCents) return null;
  return cents;
};

const normalizeBoundedText = (value, maxLength) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
};

const normalizeDeliveryDateTime = (value) => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value.trim(),
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }

  const pad2 = (number) => String(number).padStart(2, "0");
  return `${match[1]}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
};

const normalizeDateOnly = (value) => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value.trim();
};

const normalizeCoordinate = (value, min, max) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= min && value <= max ? value : null;
};

const centsOrNull = (value) => {
  const parsed = parseDecimalToCentsStrict(value);
  return parsed === null ? null : parsed;
};

const normalizeStoredPhoneDigits = (value) => String(value || "").replace(/\D/g, "");

/* ── Helper: Generate Walk-in Order Number ── */
const generateOrderNumber = async (conn) => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    const candidate = `WLK-${datePart}-${suffix}`;

    const [existing] = await conn.query(
      "SELECT id FROM orders WHERE order_number = ? LIMIT 1",
      [candidate],
    );

    if (existing.length === 0) return candidate;
  }

  return `WLK-${datePart}-${Date.now().toString().slice(-6)}`;
};

/* ── Create Walk-in Order ── */
exports.createOrder = async (req, res) => {
  const body = req.body;

  if (!hasOnlyAllowedKeys(body, POS_CASH_TOP_LEVEL_KEYS)) {
    return res.status(400).json({ message: "Unsupported checkout field detected." });
  }

  const idempotencyKey = normalizeIdempotencyKey(req.get("Idempotency-Key"));
  if (!idempotencyKey) {
    return res.status(400).json({ message: "A valid Idempotency-Key is required." });
  }

  const normalizedPaymentMethod =
    typeof body.payment_method === "string"
      ? body.payment_method.trim().toLowerCase()
      : "";

  if (normalizedPaymentMethod !== "cash") {
    return res.status(400).json({
      message: "Only cash payment is currently available at the cashier.",
    });
  }

  const customerName = normalizeBoundedText(body.customer_name, 150);
  if (!customerName) {
    return res.status(400).json({
      message: customerName === null
        ? "Customer name cannot exceed 150 characters."
        : "Customer name is required.",
    });
  }

  let customerPhone = "";
  if (body.customer_phone !== undefined && body.customer_phone !== null && body.customer_phone !== "") {
    if (typeof body.customer_phone !== "string") {
      return res.status(400).json({ message: "Invalid customer phone number." });
    }
    try {
      const canonicalPhone = normalizePhilippinePhone(body.customer_phone);
      customerPhone = `0${canonicalPhone.slice(2)}`;
    } catch {
      return res.status(400).json({
        message: "Enter a valid Philippine mobile number.",
      });
    }
  }

  const notes = normalizeBoundedText(body.notes, MAX_POS_NOTES_LENGTH);
  if (notes === null) {
    return res.status(400).json({
      message: `Order notes cannot exceed ${MAX_POS_NOTES_LENGTH} characters.`,
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ message: "No items in order." });
  }
  if (body.items.length > MAX_POS_CART_LINES) {
    return res.status(400).json({ message: "Too many cart lines in one order." });
  }

  const dedupedMap = new Map();
  for (const rawItem of body.items) {
    if (!hasOnlyAllowedKeys(rawItem, POS_CASH_ITEM_KEYS)) {
      return res.status(400).json({ message: "Unsupported cart item field detected." });
    }
    const productId = parseStrictPositiveInt(rawItem.product_id);
    const quantity = parseStrictPositiveInt(rawItem.quantity);
    if (!productId || !quantity || quantity > MAX_POS_ITEM_QUANTITY) {
      return res.status(400).json({ message: "Invalid cart item detected." });
    }
    const nextQuantity = (dedupedMap.get(productId) || 0) + quantity;
    if (!Number.isSafeInteger(nextQuantity) || nextQuantity > MAX_POS_ITEM_QUANTITY) {
      return res.status(400).json({ message: "Invalid cart quantity detected." });
    }
    dedupedMap.set(productId, nextQuantity);
  }

  const requestedItems = Array.from(dedupedMap.entries())
    .map(([product_id, quantity]) => ({ product_id, quantity }))
    .sort((a, b) => a.product_id - b.product_id);

  const cashReceivedCents = parseSubmittedMoneyCents(body.cash_received, {
    allowZero: true,
    maxCents: MAX_DECIMAL_10_2_CENTS,
  });
  if (cashReceivedCents === null) {
    return res.status(400).json({
      message: "Cash received must be a valid amount with at most 2 decimal places.",
    });
  }

  const discountCents =
    body.discount === undefined || body.discount === null || body.discount === ""
      ? 0
      : parseSubmittedMoneyCents(body.discount, {
          allowZero: true,
          maxCents: MAX_DECIMAL_10_2_CENTS,
        });
  if (discountCents === null) {
    return res.status(400).json({
      message: "Discount must be a valid amount with at most 2 decimal places.",
    });
  }

  const deliveryFeeCents =
    body.delivery_fee === undefined || body.delivery_fee === null || body.delivery_fee === ""
      ? 0
      : parseSubmittedMoneyCents(body.delivery_fee, {
          allowZero: true,
          maxCents: MAX_DECIMAL_10_2_CENTS,
        });
  if (deliveryFeeCents === null) {
    return res.status(400).json({
      message: "Delivery fee must be a valid amount with at most 2 decimal places.",
    });
  }

  const expectedTotalCents = parseSubmittedMoneyCents(body.expected_total, {
    allowZero: true,
    maxCents: MAX_DECIMAL_12_2_CENTS,
  });
  if (expectedTotalCents === null) {
    return res.status(400).json({
      message: "A valid expected_total is required.",
    });
  }

  let normalizedDelivery = null;
  if (body.delivery !== undefined && body.delivery !== null) {
    if (!hasOnlyAllowedKeys(body.delivery, POS_CASH_DELIVERY_KEYS)) {
      return res.status(400).json({ message: "Unsupported delivery field detected." });
    }

    const address = normalizeBoundedText(body.delivery.address, MAX_POS_ADDRESS_LENGTH);
    if (!address) {
      return res.status(400).json({
        message: address === null
          ? "Delivery address is too long."
          : "Delivery address is required.",
      });
    }
    if (!customerPhone) {
      return res.status(400).json({
        message: "Phone number is required for delivery.",
      });
    }

    const lat = normalizeCoordinate(body.delivery.lat, -90, 90);
    const lng = normalizeCoordinate(body.delivery.lng, -180, 180);
    if (lat === null || lng === null) {
      return res.status(400).json({
        message: "Pin a valid delivery location on the map.",
      });
    }

    const requestedDate = normalizeDeliveryDateTime(body.delivery.requested_date);
    if (!requestedDate) {
      return res.status(400).json({
        message: "A valid delivery date and time is required.",
      });
    }
    if (requestedDate.slice(0, 16) < getPhilippineDateTimeMinuteKey()) {
      return res.status(400).json({
        message: "Delivery date and time cannot be in the past.",
      });
    }

    const deliveryNotes = normalizeBoundedText(
      body.delivery.notes,
      MAX_POS_NOTES_LENGTH,
    );
    if (deliveryNotes === null) {
      return res.status(400).json({ message: "Delivery notes are too long." });
    }

    normalizedDelivery = {
      address,
      lat,
      lng,
      requested_date: requestedDate,
      notes: deliveryNotes || null,
    };
  } else if (deliveryFeeCents !== 0) {
    return res.status(400).json({
      message: "Delivery fee cannot be charged without a delivery request.",
    });
  }

  const incomingReplayShape = {
    customer_name: customerName,
    customer_phone: customerPhone || null,
    items: requestedItems,
    discount_cents: discountCents,
    delivery_fee_cents: deliveryFeeCents,
    expected_total_cents: expectedTotalCents,
    cash_received_cents: cashReceivedCents,
    notes: notes || null,
    delivery: normalizedDelivery
      ? {
          address: normalizedDelivery.address,
          lat: normalizedDelivery.lat.toFixed(7),
          lng: normalizedDelivery.lng.toFixed(7),
          requested_date: normalizedDelivery.requested_date,
          notes: normalizedDelivery.notes,
        }
      : null,
  };

  let conn = null;
  let transactionStarted = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    const [cashierRows] = await conn.query(
      "SELECT id FROM users WHERE id = ? FOR UPDATE",
      [req.user.id],
    );
    if (!cashierRows[0]) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(401).json({ message: "Authenticated user was not found." });
    }

    const [existingRows] = await conn.query(
      `SELECT
         o.id, o.order_number, o.type, o.order_type, o.status,
         o.payment_method, o.payment_status, o.walkin_customer_name,
         o.walkin_customer_phone, o.discount, o.delivery_fee, o.total, o.notes,
         o.delivery_address, o.delivery_lat, o.delivery_lng,
         DATE_FORMAT(o.requested_delivery_date, '%Y-%m-%d %H:%i:%s') AS requested_delivery_date_text,
         o.delivery_request_notes,
         r.id AS receipt_id, r.receipt_number, r.issued_by,
         r.cash_received, r.change_amount
       FROM orders o
       LEFT JOIN receipts r ON r.order_id = o.id
       WHERE o.checkout_idempotency_key = ?
       LIMIT 1
       FOR UPDATE`,
      [idempotencyKey],
    );

    if (existingRows.length) {
      const existing = existingRows[0];
      const [existingItems] = await conn.query(
        `SELECT product_id, quantity
         FROM order_items
         WHERE order_id = ?
         ORDER BY product_id ASC, id ASC
         FOR UPDATE`,
        [existing.id],
      );

      const storedItemsMap = new Map();
      for (const row of existingItems) {
        const productId = parseStrictPositiveInt(row.product_id);
        const quantity = parseStrictPositiveInt(row.quantity);
        if (!productId || !quantity) continue;
        storedItemsMap.set(
          productId,
          (storedItemsMap.get(productId) || 0) + quantity,
        );
      }
      const storedItems = Array.from(storedItemsMap.entries())
        .map(([product_id, quantity]) => ({ product_id, quantity }))
        .sort((a, b) => a.product_id - b.product_id);

      const existingHasDelivery = Boolean(
        existing.delivery_address || existing.requested_delivery_date_text,
      );
      const existingShape = {
        customer_name: String(existing.walkin_customer_name || "").trim(),
        customer_phone: normalizeStoredPhoneDigits(existing.walkin_customer_phone) || null,
        items: storedItems,
        discount_cents: centsOrNull(existing.discount),
        delivery_fee_cents: centsOrNull(existing.delivery_fee),
        expected_total_cents: centsOrNull(existing.total),
        cash_received_cents: centsOrNull(existing.cash_received),
        notes: String(existing.notes || "").trim() || null,
        delivery: existingHasDelivery
          ? {
              address: String(existing.delivery_address || "").trim(),
              lat:
                existing.delivery_lat === null || existing.delivery_lat === undefined
                  ? null
                  : Number(existing.delivery_lat).toFixed(7),
              lng:
                existing.delivery_lng === null || existing.delivery_lng === undefined
                  ? null
                  : Number(existing.delivery_lng).toFixed(7),
              requested_date: existing.requested_delivery_date_text || null,
              notes: String(existing.delivery_request_notes || "").trim() || null,
            }
          : null,
      };

      const existingIsOwnedCashSale =
        existing.type === "walkin" &&
        existing.order_type === "standard" &&
        existing.payment_method === "cash" &&
        Number(existing.issued_by) === Number(req.user.id) &&
        Boolean(existing.receipt_id);

      if (!existingIsOwnedCashSale) {
        const belongsToAnotherCashier =
          Boolean(existing.receipt_id) &&
          Number(existing.issued_by) > 0 &&
          Number(existing.issued_by) !== Number(req.user.id);

        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: belongsToAnotherCashier
            ? "A stale cash checkout key was detected. Review the sale and submit again."
            : "This Idempotency-Key is already in use and cannot be replayed safely.",
          reset_idempotency_key: belongsToAnotherCashier,
        });
      }

      const existingOrderResponse = {
        message: "Order already processed successfully.",
        idempotent_replay: true,
        order_id: existing.id,
        order_number: existing.order_number,
        receipt_id: existing.receipt_id,
        receipt_number: existing.receipt_number,
        total: centsToAmount(existingShape.expected_total_cents),
        cash_received: centsToAmount(existingShape.cash_received_cents),
        change: centsToAmount(centsOrNull(existing.change_amount) || 0),
        payment_status: existing.payment_status,
        delivery: existingShape.delivery
          ? {
              order_id: existing.id,
              address: existingShape.delivery.address,
              requested_date: existingShape.delivery.requested_date,
              status: "awaiting_admin_schedule",
              scheduled_date: null,
              assigned_driver: null,
            }
          : null,
        appointment: null,
      };

      const replayMatches =
        JSON.stringify(existingShape) === JSON.stringify(incomingReplayShape);

      if (!replayMatches) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message:
            "This cash sale was already completed, but the retry details changed. Review the existing receipt before starting another sale.",
          idempotency_conflict: true,
          existing_order: {
            ...existingOrderResponse,
            cart_preserved: true,
            reconciled_cash_retry: true,
          },
        });
      }

      await conn.commit();
      transactionStarted = false;
      return res.json(existingOrderResponse);
    }

    const productIds = requestedItems.map((item) => item.product_id);
    const productPlaceholders = productIds.map(() => "?").join(",");
    const [productRows] = await conn.query(
      `SELECT
         p.id, p.name, p.walkin_price, p.production_cost, p.type, p.is_active,
         p.stock, p.reorder_point,
         COALESCE(ds.quantity, 0) AS display_stock
       FROM products p
       LEFT JOIN ready_made_display_stock ds ON ds.product_id = p.id
       WHERE p.id IN (${productPlaceholders})
       ORDER BY p.id ASC
       FOR UPDATE`,
      productIds,
    );

    const productMap = new Map(productRows.map((row) => [Number(row.id), row]));
    let subtotalCents = 0;
    const canonicalItems = [];

    for (const requestedItem of requestedItems) {
      const product = productMap.get(requestedItem.product_id);
      if (!product) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(404).json({
          message: `Product ${requestedItem.product_id} was not found.`,
        });
      }
      if (String(product.type || "").toLowerCase() !== "standard" || Number(product.is_active) !== 1) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: `${product.name} is not available for cashier sale.`,
        });
      }
      if (Number(product.display_stock || 0) < requestedItem.quantity) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: `Insufficient Sales / Display stock for ${product.name}. Refresh and try again.`,
        });
      }
      if (Number(product.stock || 0) < requestedItem.quantity) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: `Insufficient total stock for ${product.name}. Refresh and try again.`,
        });
      }

      const unitPriceCents = parseDecimalToCentsStrict(product.walkin_price);
      let productionCostCents = 0;
      if (
        product.production_cost !== null &&
        product.production_cost !== undefined &&
        String(product.production_cost).trim() !== ""
      ) {
        productionCostCents = parseDecimalToCentsStrict(product.production_cost);
      }
      if (unitPriceCents === null || unitPriceCents <= 0) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: `${product.name} does not have a valid cashier price.`,
        });
      }
      if (
        productionCostCents === null ||
        productionCostCents > MAX_DECIMAL_10_2_CENTS
      ) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(500).json({ message: "Stored product data is invalid." });
      }

      const lineSubtotalCents = unitPriceCents * requestedItem.quantity;
      if (!Number.isSafeInteger(lineSubtotalCents) || lineSubtotalCents > MAX_DECIMAL_10_2_CENTS) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(400).json({
          message: `Line total for ${product.name} exceeds the allowed amount.`,
        });
      }

      subtotalCents += lineSubtotalCents;
      if (!Number.isSafeInteger(subtotalCents) || subtotalCents > MAX_DECIMAL_12_2_CENTS) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: "Order subtotal exceeds the allowed amount." });
      }

      canonicalItems.push({
        product_id: requestedItem.product_id,
        product_name: String(product.name || "").slice(0, 200),
        quantity: requestedItem.quantity,
        unit_price: centsToDecimalString(unitPriceCents),
        production_cost: centsToDecimalString(productionCostCents),
        subtotal: centsToDecimalString(lineSubtotalCents),
      });
    }

    if (discountCents > subtotalCents) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: "Discount cannot exceed the subtotal." });
    }

    const totalCents = subtotalCents - discountCents + deliveryFeeCents;
    if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > MAX_DECIMAL_12_2_CENTS) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: "Invalid order total." });
    }

    if (expectedTotalCents !== totalCents) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(409).json({
        message: "Product pricing or totals changed. Return to Product Search and review the latest prices before completing the sale.",
        pricing_changed: true,
        server_total: centsToAmount(totalCents),
      });
    }

    if (cashReceivedCents < totalCents) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message: "Cash received cannot be less than the total amount.",
      });
    }

    const orderNumber = await generateOrderNumber(conn);
    const initialPaymentStatus = "paid";
    const initialOrderStatus = normalizedDelivery ? "confirmed" : "completed";
    const subtotalAmount = centsToDecimalString(subtotalCents);
    const discountAmount = centsToDecimalString(discountCents);
    const deliveryFeeAmount = centsToDecimalString(deliveryFeeCents);
    const totalAmount = centsToDecimalString(totalCents);
    const cashReceivedAmount = centsToDecimalString(cashReceivedCents);
    const changeCents = cashReceivedCents - totalCents;
    const changeAmount = centsToDecimalString(changeCents);

    const [orderResult] = await conn.query(
      `INSERT INTO orders
       (order_number, walkin_customer_name, walkin_customer_phone, type, order_type,
        status, payment_method, payment_status, subtotal, tax, discount, delivery_fee, total,
        notes, delivery_address, delivery_lat, delivery_lng, requested_delivery_date,
        delivery_request_notes, checkout_idempotency_key)
       VALUES (?, ?, ?, 'walkin', 'standard', ?, 'cash', ?, ?, '0.00', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        customerName,
        customerPhone || null,
        initialOrderStatus,
        initialPaymentStatus,
        subtotalAmount,
        discountAmount,
        deliveryFeeAmount,
        totalAmount,
        notes || null,
        normalizedDelivery?.address || null,
        normalizedDelivery?.lat ?? null,
        normalizedDelivery?.lng ?? null,
        normalizedDelivery?.requested_date || null,
        normalizedDelivery?.notes || null,
        idempotencyKey,
      ],
    );

    const orderId = orderResult.insertId;

    for (const item of canonicalItems) {
      const [itemResult] = await conn.query(
        `INSERT INTO order_items
          (order_id, product_id, product_name, quantity, unit_price, production_cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.quantity,
          item.unit_price,
          item.production_cost,
        ],
      );

      const [displayDecrementResult] = await conn.query(
        `UPDATE ready_made_display_stock
         SET quantity = quantity - ?
         WHERE product_id = ? AND quantity >= ?`,
        [item.quantity, item.product_id, item.quantity],
      );
      if (displayDecrementResult.affectedRows !== 1) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: `Sales / Display stock changed for ${item.product_name}. Refresh and try again.`,
        });
      }

      const [stockDecrementResult] = await conn.query(
        `UPDATE products
         SET stock = stock - ?
         WHERE id = ? AND stock >= ?`,
        [item.quantity, item.product_id, item.quantity],
      );
      if (stockDecrementResult.affectedRows !== 1) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: `Total stock changed for ${item.product_name}. Refresh and try again.`,
        });
      }

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

      await conn.query(
        `INSERT INTO stock_movements
          (product_id, type, quantity, order_id, order_item_id, notes, created_by)
         VALUES (?, 'out', ?, ?, ?, 'POS walk-in sale', ?)`,
        [item.product_id, item.quantity, orderId, itemResult.insertId, req.user.id],
      );
    }

    const [paymentResult] = await conn.query(
      `INSERT INTO payment_transactions
        (order_id, amount, payment_method, status, verified_by, verified_at)
       VALUES (?, ?, 'cash', 'verified', ?, NOW())`,
      [orderId, totalAmount, req.user.id],
    );

    const receiptNumber = `OR-${Date.now()}`;
    const receiptResult = await createPosSaleReceipt(conn, {
      orderId,
      paymentTransactionId: paymentResult.insertId,
      receiptNumber,
      issuedTo: customerName,
      issuedBy: req.user.id,
      totalAmount,
      cashReceived: cashReceivedAmount,
      changeAmount,
      itemsSnapshot: JSON.stringify(canonicalItems),
    });

    await conn.commit();
    transactionStarted = false;

    const createdDelivery = normalizedDelivery
      ? {
          order_id: orderId,
          address: normalizedDelivery.address,
          requested_date: normalizedDelivery.requested_date,
          status: "awaiting_admin_schedule",
          scheduled_date: null,
          assigned_driver: null,
        }
      : null;

    emitOrderCreated(req.app.get("io"), {
      orderId,
      orderNumber,
      status: initialOrderStatus,
      orderType: "standard",
    });

    req.auditRecord = {
      id: orderId,
      old: null,
      new: {
        order_created: true,
        type: "walkin",
        order_type: "standard",
        // Preserve the historical audit meaning: item_count is cart/order lines,
        // not total units across those lines.
        item_count: canonicalItems.length,
        payment_status: initialPaymentStatus,
        payment_method: "cash",
      },
    };

    return res.json({
      message: "Order created successfully",
      idempotent_replay: false,
      order_id: orderId,
      order_number: orderNumber,
      receipt_id: receiptResult.receiptId,
      receipt_number: receiptNumber,
      total: centsToAmount(totalCents),
      cash_received: centsToAmount(cashReceivedCents),
      change: centsToAmount(changeCents),
      payment_status: initialPaymentStatus,
      delivery: createdDelivery,
      appointment: null,
    });
  } catch (err) {
    if (conn && transactionStarted) {
      try {
        await conn.rollback();
      } catch {}
    }
    console.error("[POS CASH CREATE ORDER]", err);

    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "This checkout was already processed or conflicted with another transaction. Refresh and review before retrying.",
      });
    }

    return res.status(500).json({ message: "Server error." });
  } finally {
    if (conn) conn.release();
  }
};

/* ── Get Single Order Detail ── */
exports.getOrderById = async (req, res) => {
  const cashierOwnOnly =
    req.user?.role === "staff" && req.user?.staff_type === "cashier";
  const orderId = parseStrictPositiveInt(req.params.id);

  if (!orderId) {
    return res.status(400).json({ message: "A valid order id is required." });
  }

  try {
    const [orders] = await db.query(
      `
      SELECT o.*, r.receipt_number, r.id AS receipt_id, r.items_snapshot
      FROM orders o
      LEFT JOIN receipts r ON r.order_id = o.id
      WHERE o.id = ?
        ${cashierOwnOnly ? "AND r.issued_by = ?" : ""}
      `,
      [orderId, ...(cashierOwnOnly ? [req.user.id] : [])],
    );

    if (orders.length === 0)
      return res.status(404).json({ message: "Order not found" });

    const order = orders[0];
    const [items] = await db.query(
      "SELECT * FROM order_items WHERE order_id = ?",
      [orderId],
    );
    order.items = items;

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── List Walk-in Orders (Paginated) ── */
exports.getOrders = async (req, res) => {
  const { from, to, search = "", page = 1, limit = 20 } = req.query;
  const pageNumber = parseStrictPositiveInt(page) || 1;
  const limitNumber = Math.min(100, parseStrictPositiveInt(limit) || 20);
  const offset = (pageNumber - 1) * limitNumber;
  const cashierOwnOnly =
    req.user?.role === "staff" && req.user?.staff_type === "cashier";

  try {
    let where = "WHERE o.type = 'walkin'";
    const params = [];

    if (cashierOwnOnly) {
      where += " AND r.issued_by = ?";
      params.push(req.user.id);
    }

    const fromDate = from ? normalizeDateOnly(String(from)) : null;
    const toDate = to ? normalizeDateOnly(String(to)) : null;

    if (from && !fromDate) {
      return res.status(400).json({ message: "Invalid from date. Use YYYY-MM-DD." });
    }
    if (to && !toDate) {
      return res.status(400).json({ message: "Invalid to date. Use YYYY-MM-DD." });
    }
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ message: "Start date cannot be after end date." });
    }

    if (fromDate) {
      where += " AND DATE(o.created_at) >= ?";
      params.push(fromDate);
    }

    if (toDate) {
      where += " AND DATE(o.created_at) <= ?";
      params.push(toDate);
    }

    const term = String(search || "").trim();
    if (term.length > 100) {
      return res.status(400).json({ message: "Search must be 100 characters or fewer." });
    }
    if (term) {
      const pattern = `%${term}%`;
      const clauses = [
        "o.order_number LIKE ?",
        "o.walkin_customer_name LIKE ?",
        "COALESCE(r.receipt_number, '') LIKE ?",
      ];
      const searchParams = [pattern, pattern, pattern];

      const strictOrderId = /^\d+$/.test(term)
        ? parseStrictPositiveInt(term)
        : null;
      if (strictOrderId) {
        clauses.push("o.id = ?");
        searchParams.push(strictOrderId);
      }

      const rawDigits = term.replace(/\D/g, "");
      const phoneVariants = new Set(rawDigits ? [rawDigits] : []);
      try {
        const canonicalPhone = normalizePhilippinePhone(term);
        getPhoneLookupVariants(canonicalPhone).forEach((variant) => {
          const digits = String(variant || "").replace(/\D/g, "");
          if (digits) phoneVariants.add(digits);
        });
      } catch {
        // Partial/non-phone search text is still valid for the other fields.
      }

      for (const phoneVariant of phoneVariants) {
        if (phoneVariant.length < 4) continue;
        clauses.push(`${phoneDigitsSql("o.walkin_customer_phone")} LIKE ?`);
        searchParams.push(`%${phoneVariant}%`);
      }

      where += ` AND (${clauses.join(" OR ")})`;
      params.push(...searchParams);
    }

    const [rows] = await db.query(
      `
      SELECT o.id, o.order_number, o.walkin_customer_name,
             o.walkin_customer_phone, o.total, o.payment_method,
             o.status, o.created_at, r.receipt_number, r.id AS receipt_id,
             u.name AS processed_by
      FROM orders o
      LEFT JOIN receipts r ON r.order_id = o.id
      LEFT JOIN users u ON u.id = r.issued_by
      ${where}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limitNumber, offset],
    );

    const [count] = await db.query(
      `SELECT COUNT(DISTINCT o.id) AS total
       FROM orders o
       LEFT JOIN receipts r ON r.order_id = o.id
       ${where}`,
      params,
    );

    res.json({
      orders: rows,
      total: Number(count[0]?.total || 0),
      page: pageNumber,
      limit: limitNumber,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
