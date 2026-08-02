// utils/posOrderNumber.js
//
// Shared walk-in order-number generator for POS QR payment finalization.
// The existing cash POS controller remains unchanged.

const generateWalkInOrderNumber = async (conn) => {
  const now = new Date();

  const datePart =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, "0")}` +
    `${String(now.getDate()).padStart(2, "0")}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    const candidate = `WLK-${datePart}-${suffix}`;

    const [existing] = await conn.query(
      "SELECT id FROM orders WHERE order_number = ? LIMIT 1",
      [candidate],
    );

    if (existing.length === 0) {
      return candidate;
    }
  }

  return `WLK-${datePart}-${Date.now().toString().slice(-6)}`;
};

module.exports = { generateWalkInOrderNumber };