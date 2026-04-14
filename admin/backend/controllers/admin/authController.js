// controllers/authController.js – Admin/Staff authentication
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../../config/db");

// ── POST /api/auth/login ───────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const [[user]] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND role IN ("admin","staff")',
      [email],
    );

    if (!user) return res.status(401).json({ message: "Invalid credentials." });
    if (!user.is_active)
      return res.status(403).json({ message: "Account is deactivated." });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ message: "Invalid credentials." });

    // Update last_login
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = ?", [
      user.id,
    ]);

    if (user.role === "staff" && !user.staff_type) {
      return res.status(403).json({
        message: "Staff account type is not configured yet. Contact admin.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        staff_type: user.staff_type || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );

    const { password: _, otp_code: __, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const [[user]] = await pool.query(
      `SELECT
        id,
        name,
        email,
        role,
        staff_type,
        phone,
        address,
        profile_photo,
        last_login
      FROM users
      WHERE id = ?`,
      [req.user.id],
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PUT /api/auth/profile ──────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const photo = req.file
      ? `/uploads/profiles/${req.file.filename}`
      : undefined;

    const fields = { name, phone, address };
    if (photo) fields.profile_photo = photo;

    const sets = Object.keys(fields)
      .map((k) => `${k} = ?`)
      .join(", ");
    const vals = [...Object.values(fields), req.user.id];

    await pool.query(`UPDATE users SET ${sets} WHERE id = ?`, vals);
    res.json({ message: "Profile updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PUT /api/auth/change-password ─────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    const [[user]] = await pool.query(
      "SELECT password FROM users WHERE id = ?",
      [req.user.id],
    );
    const match = await bcrypt.compare(current_password, user.password);
    if (!match)
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });

    const hashed = await bcrypt.hash(new_password, 12);
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [
      hashed,
      req.user.id,
    ]);

    res.json({ message: "Password changed successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
