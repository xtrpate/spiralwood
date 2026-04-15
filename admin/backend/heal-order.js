const pool = require("./config/db");

async function healOrder() {
  try {
    console.log("Healing Order #108...");
    // Forcing the correct totals into the bugged order
    await pool.query(
      "UPDATE orders SET total = 11200, down_payment = 3360 WHERE id = 108",
    );
    console.log("✅ SUCCESS: Order totals fixed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    process.exit(1);
  }
}
healOrder();
