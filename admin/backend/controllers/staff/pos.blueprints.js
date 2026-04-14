// controllers/staff/pos.blueprints.js
const db = require("../../config/db"); // Uses the unified db config

/* ── Get Blueprints (Staff/POS View) ── */
exports.getAllBlueprints = async (req, res) => {
  const { q } = req.query;
  try {
    let where = "WHERE b.is_deleted = 0";
    const params = [];

    if (q) {
      where += " AND (b.title LIKE ? OR b.description LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }

    // Staff can view all gallery/template blueprints + those linked to their orders
    const [rows] = await db.execute(
      `
      SELECT b.id, b.title, b.description, b.stage,
             b.thumbnail_url, b.is_template, b.is_gallery,
             b.source, b.file_type, b.created_at,
             u.name AS creator_name,
             c.name AS client_name
      FROM blueprints b
      LEFT JOIN users u ON u.id = b.creator_id
      LEFT JOIN users c ON c.id = b.client_id
      ${where}
      ORDER BY b.created_at DESC
      LIMIT 50
    `,
      params,
    );

    res.json(rows);
  } catch (err) {
    console.error("[pos.blueprints GET]", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── Get Single Blueprint Detail ── */
exports.getBlueprintById = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT b.*, u.name AS creator_name, c.name AS client_name
      FROM blueprints b
      LEFT JOIN users u ON u.id = b.creator_id
      LEFT JOIN users c ON c.id = b.client_id
      WHERE b.id = ? AND b.is_deleted = 0
    `,
      [req.params.id],
    );

    if (rows.length === 0)
      return res.status(404).json({ message: "Blueprint not found" });

    const blueprint = rows[0];

    // Fetch components
    const [components] = await db.execute(
      "SELECT * FROM blueprint_components WHERE blueprint_id = ?",
      [req.params.id],
    );
    blueprint.components = components;

    res.json(blueprint);
  } catch (err) {
    console.error("[pos.blueprints/:id]", err);
    res.status(500).json({ message: "Server error" });
  }
};
