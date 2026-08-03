const pool = require("../../config/db");

const { createNotificationSafe } = require("../../utils/notificationHelper");

// =====================================================
// Get All Support Tickets
// =====================================================

exports.getTickets = async (req, res) => {
  try {
    const { status, category, priority, assigned_to } = req.query;

    const where = ["1 = 1"];
    const params = [];

    if (status) {
      where.push("st.status = ?");
      params.push(status);
    }

    if (category) {
      where.push("st.category = ?");
      params.push(category);
    }

    if (priority) {
      where.push("st.priority = ?");
      params.push(priority);
    }

    if (assigned_to) {
      where.push("st.assigned_to = ?");
      params.push(parseInt(assigned_to));
    }

    const [tickets] = await pool.query(
      `
      SELECT
        st.id,
        st.subject,
        st.category,
        st.priority,
        st.status,
        DATE_FORMAT(
  st.created_at,
  '%Y-%m-%d %H:%i:%s'
) AS created_at,

DATE_FORMAT(
  st.updated_at,
  '%Y-%m-%d %H:%i:%s'
) AS updated_at,

        customer.id AS customer_id,
        customer.name AS customer_name,

        assignee.id AS assigned_to,
        assignee.name AS assigned_name

      FROM support_tickets st

      INNER JOIN users customer
        ON st.customer_id = customer.id

      LEFT JOIN users assignee
        ON st.assigned_to = assignee.id

      WHERE ${where.join(" AND ")}

      ORDER BY st.created_at DESC
      `,
      params,
    );

    return res.json({
      tickets,
    });
  } catch (err) {
    console.error("[supportController.getTickets]", err);

    return res.status(500).json({
      message: "Failed to load support tickets.",
    });
  }
};

// =====================================================
// Get Support Ticket Details
// =====================================================

exports.getTicket = async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);

    if (!ticketId) {
      return res.status(400).json({
        message: "Invalid ticket ID.",
      });
    }

    const [ticketRows] = await pool.query(
      `
      SELECT
        st.*,

        customer.name AS customer_name,
        customer.email AS customer_email,

        assignee.name AS assigned_name,

        o.order_number

      FROM support_tickets st

      INNER JOIN users customer
        ON st.customer_id = customer.id

      LEFT JOIN users assignee
        ON st.assigned_to = assignee.id

      LEFT JOIN orders o
        ON st.order_id = o.id

      WHERE st.id = ?
      `,
      [ticketId],
    );

    if (ticketRows.length === 0) {
      return res.status(404).json({
        message: "Support ticket not found.",
      });
    }

    const [messages] = await pool.query(
      `
      SELECT
  stm.id,
  stm.ticket_id,
  stm.sender_id,
  stm.sender_type,
  stm.message,
  stm.attachment_url,

  DATE_FORMAT(
    stm.created_at,
    '%Y-%m-%d %H:%i:%s'
  ) AS created_at,

  u.name AS sender_name

      FROM support_ticket_messages stm

      INNER JOIN users u
        ON stm.sender_id = u.id

      WHERE stm.ticket_id = ?

      ORDER BY stm.created_at ASC
      `,
      [ticketId],
    );

    return res.json({
      ticket: ticketRows[0],
      messages,
    });
  } catch (err) {
    console.error("[supportController.getTicket]", err);

    return res.status(500).json({
      message: "Failed to load support ticket.",
    });
  }
};

// =====================================================
// Get Assignable Users
// =====================================================

exports.getAssignableUsers = async (req, res) => {
  try {
    const [users] = await pool.query(
      `
      SELECT
        id,
        name,
        role
      FROM users
      WHERE role IN ('admin', 'staff')
      ORDER BY
        role ASC,
        name ASC
      `,
    );

    return res.json({
      users,
    });
  } catch (err) {
    console.error("[supportController.getAssignableUsers]", err);

    return res.status(500).json({
      message: "Failed to load assignable users.",
    });
  }
};

// =====================================================
// Assign Support Ticket
// =====================================================

exports.assignTicket = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const ticketId = parseInt(req.params.id);
    const { assigned_to } = req.body;

    if (!ticketId || !assigned_to) {
      return res.status(400).json({
        message: "Ticket ID and assignee are required.",
      });
    }

    await conn.beginTransaction();

    // Check ticket exists
    const [ticketRows] = await conn.query(
      `
      SELECT id, status
      FROM support_tickets
      WHERE id = ?
      `,
      [ticketId],
    );

    if (ticketRows.length === 0) {
      await conn.rollback();

      return res.status(404).json({
        message: "Support ticket not found.",
      });
    }

    // Check assignee exists and is admin/staff
    const [userRows] = await conn.query(
      `
      SELECT id, role
      FROM users
      WHERE id = ?
      `,
      [assigned_to],
    );

    if (userRows.length === 0) {
      await conn.rollback();

      return res.status(404).json({
        message: "Assigned user not found.",
      });
    }

    if (!["admin", "staff"].includes(userRows[0].role)) {
      await conn.rollback();

      return res.status(400).json({
        message: "Ticket can only be assigned to an admin or staff.",
      });
    }

    // Don't move ticket backwards if already in progress
    const nextStatus =
      ticketRows[0].status === "open" ? "assigned" : ticketRows[0].status;

    await conn.query(
      `
      UPDATE support_tickets
      SET
        assigned_to = ?,
        assigned_by = ?,
        assigned_at = NOW(),
        status = ?
      WHERE id = ?
      `,
      [assigned_to, req.user.id, nextStatus, ticketId],
    );

    await conn.commit();

    return res.json({
      message: "Support ticket assigned successfully.",
    });
  } catch (err) {
    await conn.rollback();

    console.error("[supportController.assignTicket]", err);

    return res.status(500).json({
      message: "Failed to assign support ticket.",
    });
  } finally {
    conn.release();
  }
};

// =====================================================
// Update Support Ticket Status
// =====================================================

exports.updateTicketStatus = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const ticketId = parseInt(req.params.id);

    const { status, priority, resolution_note } = req.body;

    if (!ticketId) {
      return res.status(400).json({
        message: "Invalid ticket ID.",
      });
    }

    await conn.beginTransaction();

    const [ticketRows] = await conn.query(
      `
      SELECT id
      FROM support_tickets
      WHERE id = ?
      `,
      [ticketId],
    );

    if (ticketRows.length === 0) {
      await conn.rollback();

      return res.status(404).json({
        message: "Support ticket not found.",
      });
    }

    const updates = [];
    const values = [];

    if (status) {
      updates.push("status = ?");
      values.push(status);

      if (status === "resolved") {
        updates.push("resolved_at = NOW()");
      }

      if (status !== "resolved") {
        updates.push("resolved_at = NULL");
      }
    }

    if (priority) {
      updates.push("priority = ?");
      values.push(priority);
    }

    if (resolution_note !== undefined) {
      updates.push("resolution_note = ?");
      values.push(resolution_note);
    }

    if (updates.length === 0) {
      await conn.rollback();

      return res.status(400).json({
        message: "Nothing to update.",
      });
    }

    values.push(ticketId);

    await conn.query(
      `
      UPDATE support_tickets
      SET
        ${updates.join(", ")}
      WHERE id = ?
      `,
      values,
    );

    const [updatedTicket] = await conn.query(
      `
      SELECT
  id,
  customer_id,
  order_id,
  subject,
  category,
  priority,
  status,
  assigned_to,
  assigned_by,

  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
  DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
  DATE_FORMAT(assigned_at, '%Y-%m-%d %H:%i:%s') AS assigned_at,
  DATE_FORMAT(resolved_at, '%Y-%m-%d %H:%i:%s') AS resolved_at,

  resolution_note
FROM support_tickets
WHERE id = ?
      `,
      [ticketId],
    );

    await conn.commit();

    return res.json({
      message: "Support ticket updated successfully.",
      ticket: updatedTicket[0],
    });
  } catch (err) {
    await conn.rollback();

    console.error("[supportController.updateTicketStatus]", err);

    return res.status(500).json({
      message: "Failed to update support ticket.",
    });
  } finally {
    conn.release();
  }
};

// =====================================================
// Reply to Support Ticket
// =====================================================

exports.replyToTicket = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const ticketId = parseInt(req.params.id);

    const { message, attachment_url = null } = req.body;

    if (!ticketId) {
      return res.status(400).json({
        message: "Invalid ticket ID.",
      });
    }

    if (!message?.trim()) {
      return res.status(400).json({
        message: "Message is required.",
      });
    }

    await conn.beginTransaction();

    const [ticketRows] = await conn.query(
      `
  SELECT
    id,
    customer_id,
    subject
  FROM support_tickets
  WHERE id = ?
  `,
      [ticketId],
    );

    if (ticketRows.length === 0) {
      await conn.rollback();

      return res.status(404).json({
        message: "Support ticket not found.",
      });
    }

    await conn.query(
      `
      INSERT INTO support_ticket_messages
      (
        ticket_id,
        sender_id,
        sender_type,
        message,
        attachment_url
      )
      VALUES (?, ?, 'admin', ?, ?)
      `,
      [ticketId, req.user.id, message, attachment_url],
    );

    await createNotificationSafe(conn, {
      userId: ticketRows[0].customer_id,
      type: "support_reply",
      title: "Support Ticket Updated",
      message: `Your support ticket "${ticketRows[0].subject}" has a new reply.`,
      targetType: "support_ticket",
      targetId: ticketId,
    });

    // If we're waiting for the customer,
    // switch it back to in progress.
    await conn.query(
      `
      UPDATE support_tickets
      SET
        status = CASE
          WHEN status = 'awaiting_customer'
          THEN 'in_progress'
          ELSE status
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [ticketId],
    );

    const [messages] = await conn.query(
      `
      SELECT
        stm.*,
        u.name AS sender_name
      FROM support_ticket_messages stm
      INNER JOIN users u
        ON stm.sender_id = u.id
      WHERE stm.ticket_id = ?
      ORDER BY stm.created_at ASC
      `,
      [ticketId],
    );

    await conn.commit();

    return res.json({
      message: "Reply sent successfully.",
      messages,
    });
  } catch (err) {
    await conn.rollback();

    console.error("[supportController.replyToTicket]", err);

    return res.status(500).json({
      message: "Failed to send reply.",
    });
  } finally {
    conn.release();
  }
};
