require("dotenv").config();
const pool = require("./config/db"); // Make sure this path points to your db.js

async function wipeDatabase() {
  try {
    console.log("⏳ Starting database wipe...");

    // 1. Temporarily disable Foreign Key Checks so MySQL doesn't block the deletions
    await pool.query("SET FOREIGN_KEY_CHECKS = 0;");

    // 2. Wipe all transaction-related tables and reset their ID counters to 1
    const tablesToTruncate = [
      "custom_order_attachments",
      "custom_order_messages",
      "payment_transactions",
      "deliveries",
      "warranties",
      "appointments",
      "contracts",
      "cancellations",
      "project_tasks",
      "order_items",
      "orders",
      "cart_items",
      "custom_cart_items",
      "reviews",
    ];

    for (const table of tablesToTruncate) {
      try {
        await pool.query(`TRUNCATE TABLE ${table};`);
        console.log(`✅ Wiped table: ${table}`);
      } catch (err) {
        console.log(`⚠️ Skipped table: ${table} (May not exist)`);
      }
    }

    // 3. Delete all Notifications belonging to Customers
    console.log("🗑️ Deleting customer notifications...");
    try {
      await pool.query(`
        DELETE n FROM notifications n
        JOIN users u ON n.user_id = u.id
        WHERE u.role = 'customer';
      `);
    } catch (e) {}

    // 4. Finally, delete the Customer accounts
    console.log("🗑️ Deleting customer accounts...");
    const [customerResult] = await pool.query(
      "DELETE FROM users WHERE role = 'customer';",
    );
    console.log(
      `✅ Deleted ${customerResult.affectedRows} customer account(s).`,
    );

    // 5. Turn Foreign Key Checks back on
    await pool.query("SET FOREIGN_KEY_CHECKS = 1;");

    console.log(
      "\n🎉 SUCCESS! All customer accounts, transactions, contracts, and appointments have been completely wiped.",
    );
    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR WIPING DATABASE:", error);

    // Ensure checks are turned back on even if it fails
    try {
      await pool.query("SET FOREIGN_KEY_CHECKS = 1;");
    } catch (e) {}

    process.exit(1);
  }
}

wipeDatabase();
