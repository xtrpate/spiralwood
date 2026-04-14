// controllers/taskController.js
// Based on actual wisdom_db schema: project_tasks + notifications tables
const pool = require("../../config/db");

// ── Helper: insert into notifications table ───────────────────────────────────
async function notify(userId, type, title, message) {
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, channel, sent_at)
     VALUES (?, ?, ?, ?, 'system', NOW())`,
    [parseInt(userId), type, title, message],
  );
}

// ── GET /tasks ────────────────────────────────────────────────────────────────
// Admin sees ALL tasks. Staff sees only tasks assigned to them.
exports.getAll = async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const [rows] = await pool.query(
      `SELECT
         pt.id, pt.title, pt.description, pt.task_role, pt.status,
         pt.is_read, pt.due_date, pt.accepted_at, pt.completed_at,
         pt.created_at, pt.updated_at,
         pt.order_id, pt.blueprint_id,
         u1.id   AS assigned_to_id,
         u1.name AS assigned_to_name,
         u1.email AS assigned_to_email,
         u2.id   AS assigned_by_id,
         u2.name AS assigned_by_name,
         o.order_number,
         b.title AS blueprint_title
       FROM project_tasks pt
       JOIN users u1 ON u1.id = pt.assigned_to
       JOIN users u2 ON u2.id = pt.assigned_by
       LEFT JOIN orders o ON o.id = pt.order_id
       LEFT JOIN blueprints b ON b.id = pt.blueprint_id
       ${isAdmin ? "" : "WHERE pt.assigned_to = ?"}
       ORDER BY
         FIELD(pt.status, 'pending','in_progress','blocked','completed'),
         pt.due_date ASC,
         pt.created_at DESC`,
      isAdmin ? [] : [parseInt(req.user.id)],
    );
    res.json(rows);
  } catch (err) {
    console.error("tasks.getAll:", err);
    res.status(500).json({ message: "Failed to fetch tasks." });
  }
};

// ── GET /tasks/:id ────────────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [[row]] = await pool.query(
      `SELECT pt.*, 
         u1.name AS assigned_to_name, u1.email AS assigned_to_email,
         u2.name AS assigned_by_name,
         o.order_number, b.title AS blueprint_title
       FROM project_tasks pt
       JOIN users u1 ON u1.id = pt.assigned_to
       JOIN users u2 ON u2.id = pt.assigned_by
       LEFT JOIN orders o ON o.id = pt.order_id
       LEFT JOIN blueprints b ON b.id = pt.blueprint_id
       WHERE pt.id = ?`,
      [parseInt(req.params.id)],
    );
    if (!row) return res.status(404).json({ message: "Task not found." });

    // Staff can only view their own tasks
    if (
      req.user.role !== "admin" &&
      Number(row.assigned_to) !== Number(req.user.id)
    ) {
      return res.status(403).json({ message: "Access denied." });
    }

    res.json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch task." });
  }
};

// ── POST /tasks ───────────────────────────────────────────────────────────────
// Admin only — create a task and notify the assigned staff
exports.create = async (req, res) => {
  try {
    const {
      title,
      description,
      assigned_to,
      task_role,
      due_date,
      order_id,
      blueprint_id,
    } = req.body;

    if (!title?.trim())
      return res.status(422).json({ message: "Title is required." });
    if (!assigned_to)
      return res.status(422).json({ message: "Assigned staff is required." });

    // Verify the staff exists and is active
    const [[staff]] = await pool.query(
      `SELECT id, name FROM users WHERE id = ? AND is_active = 1`,
      [parseInt(assigned_to)],
    );
    if (!staff)
      return res
        .status(422)
        .json({ message: "Staff member not found or inactive." });

    const [result] = await pool.query(
      `INSERT INTO project_tasks
         (title, description, assigned_to, assigned_by, task_role, due_date, order_id, blueprint_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        description?.trim() || null,
        parseInt(assigned_to),
        parseInt(req.user.id),
        task_role || "Other",
        due_date || null,
        order_id ? parseInt(order_id) : null,
        blueprint_id ? parseInt(blueprint_id) : null,
      ],
    );

    // Notify the assigned staff
    await notify(
      parseInt(assigned_to),
      "task_assigned",
      "New Task Assigned",
      `You have been assigned a new task: "${title.trim()}" by ${req.user.name}.`,
    );

    res.status(201).json({
      id: result.insertId,
      message: "Task created and staff notified.",
    });
  } catch (err) {
    console.error("tasks.create:", err);
    res.status(500).json({ message: "Failed to create task." });
  }
};

// ── PUT /tasks/:id ────────────────────────────────────────────────────────────
// Admin: full update. Staff: can only update status (their own tasks only).
exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const isAdmin = req.user.role === "admin";

    const [[task]] = await pool.query(
      `SELECT * FROM project_tasks WHERE id = ?`,
      [id],
    );
    if (!task) return res.status(404).json({ message: "Task not found." });

    // ── Staff update (status only) ──────────────────────────────────────────
    if (!isAdmin) {
      if (Number(task.assigned_to) !== Number(req.user.id)) {
        return res
          .status(403)
          .json({ message: "You can only update your own tasks." });
      }

      const { status } = req.body;
      if (!status)
        return res.status(422).json({ message: "Status is required." });

      const completedAt = status === "completed" ? new Date() : null;
      const acceptedAt =
        status === "in_progress" && !task.accepted_at
          ? new Date()
          : task.accepted_at;

      await pool.query(
        `UPDATE project_tasks
         SET status = ?, completed_at = ?, accepted_at = ?, is_read = 1
         WHERE id = ?`,
        [status, completedAt, acceptedAt, id],
      );

      // Notify the admin who assigned
      await notify(
        parseInt(task.assigned_by),
        "task_update",
        "Task Status Updated",
        `"${task.title}" has been marked as ${status} by ${req.user.name}.`,
      );

      return res.json({ message: "Task status updated." });
    }

    // ── Admin full update ───────────────────────────────────────────────────
    const {
      title,
      description,
      assigned_to,
      task_role,
      status,
      due_date,
      order_id,
      blueprint_id,
    } = req.body;

    if (!title?.trim())
      return res.status(422).json({ message: "Title is required." });

    const completedAt =
      status === "completed" && task.status !== "completed"
        ? new Date()
        : task.status === "completed" && status !== "completed"
          ? null
          : task.completed_at;

    await pool.query(
      `UPDATE project_tasks
       SET title=?, description=?, assigned_to=?, task_role=?,
           status=?, due_date=?, completed_at=?, order_id=?, blueprint_id=?
       WHERE id=?`,
      [
        title.trim(),
        description?.trim() || null,
        assigned_to ? parseInt(assigned_to) : task.assigned_to,
        task_role || task.task_role,
        status || task.status,
        due_date || null,
        completedAt,
        order_id ? parseInt(order_id) : task.order_id,
        blueprint_id ? parseInt(blueprint_id) : task.blueprint_id,
        id,
      ],
    );

    // Notify if reassigned to someone new
    const newAssignee = Number(assigned_to);
    if (newAssignee && newAssignee !== Number(task.assigned_to)) {
      await notify(
        newAssignee,
        "task_assigned",
        "Task Assigned to You",
        `You have been assigned: "${title.trim()}" by ${req.user.name}.`,
      );
    }

    res.json({ message: "Task updated." });
  } catch (err) {
    console.error("tasks.update:", err);
    res.status(500).json({ message: "Failed to update task." });
  }
};

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────
// Admin only
exports.remove = async (req, res) => {
  try {
    const [[task]] = await pool.query(
      `SELECT id FROM project_tasks WHERE id = ?`,
      [parseInt(req.params.id)],
    );
    if (!task) return res.status(404).json({ message: "Task not found." });

    await pool.query(`DELETE FROM project_tasks WHERE id = ?`, [
      parseInt(req.params.id),
    ]);
    res.json({ message: "Task deleted." });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete task." });
  }
};

// ── GET /tasks/notifications ──────────────────────────────────────────────────
// Uses the existing notifications table
exports.getNotifications = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, title, message, is_read, channel, sent_at, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [parseInt(req.user.id)],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch notifications." });
  }
};

// ── PATCH /tasks/notifications/read-all ──────────────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [
      parseInt(req.user.id),
    ]);
    res.json({ message: "All notifications marked as read." });
  } catch (err) {
    res.status(500).json({ message: "Failed." });
  }
};

// ── PATCH /tasks/notifications/:id/read ──────────────────────────────────────
exports.markOneRead = async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [parseInt(req.params.id), parseInt(req.user.id)],
    );
    res.json({ message: "Notification marked as read." });
  } catch (err) {
    res.status(500).json({ message: "Failed." });
  }
};

// ── GET /tasks/staff-list ─────────────────────────────────────────────────────
// Returns all active admin/staff users for the assign dropdown
exports.getStaffList = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE is_active = 1 AND role IN ('admin','staff')
       ORDER BY name ASC`,
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch staff list." });
  }
};

// ── GET /tasks/orders-list ────────────────────────────────────────────────────
// Returns active orders for the order dropdown when creating tasks
exports.getOrdersList = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      `SELECT id, order_number, status, total
       FROM orders
       WHERE status NOT IN ('cancelled','completed')
       ORDER BY created_at DESC
       LIMIT 100`,
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch orders." });
  }
};
