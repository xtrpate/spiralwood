// controllers/customer/customer.cart.js
const db = require("../../config/db");

exports.syncCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    // Turn the cart array into a JSON string to store in the database
    const cartData = JSON.stringify(req.body.cart || []);

    // Insert the new cart, or if the user already has a cart, update it
    await db.query(
      `INSERT INTO customer_carts (customer_id, cart_data) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE cart_data = VALUES(cart_data)`,
      [customerId, cartData],
    );

    res.json({ message: "Cart synced successfully" });
  } catch (err) {
    console.error("[customer.cart sync]", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getCart = async (req, res) => {
  try {
    const customerId = req.user.id;

    const [rows] = await db.query(
      `SELECT cart_data FROM customer_carts WHERE customer_id = ?`,
      [customerId],
    );

    if (rows.length > 0) {
      // Send the saved cart back to the frontend!
      const cart =
        typeof rows[0].cart_data === "string"
          ? JSON.parse(rows[0].cart_data)
          : rows[0].cart_data;

      res.json({ cart: cart });
    } else {
      res.json({ cart: [] });
    }
  } catch (err) {
    console.error("[customer.cart get]", err);
    res.status(500).json({ message: "Server error" });
  }
};
