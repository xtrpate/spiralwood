const db = require("../../config/db");

const VALID_CATEGORIES = [
  "inquiry",
  "complaint",
  "order_assistance",
  "blueprint_support",
  "other",
];

const { createNotificationSafe } = require("../../utils/notificationHelper");
const { writeAuditLogSafe } = require("../../middleware/auditLog");

/* ──────────────────────────────────────────────────────────────
   Create Support Ticket
────────────────────────────────────────────────────────────── */
const createTicket = async (req, res) => {
  const { subject, category, order_id, message } = req.body;

  if (!subject?.trim()) {
    return res.status(400).json({
      message: "Subject is required.",
    });
  }

  if (!message?.trim()) {
    return res.status(400).json({
      message: "Please enter your concern.",
    });
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({
      message: "Invalid ticket category.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Verify order ownership if supplied
    let linkedOrderId = null;

    if (order_id) {
      const [orders] = await connection.query(
        `
        SELECT id
        FROM orders
        WHERE id = ?
          AND customer_id = ?
        LIMIT 1
        `,
        [order_id, req.user.id],
      );

      if (!orders.length) {
        await connection.rollback();
        connection.release();

        return res.status(404).json({
          message: "Order not found.",
        });
      }

      linkedOrderId = orders[0].id;
    }

    // Create ticket
    const [ticketResult] = await connection.query(
      `
      INSERT INTO support_tickets
      (
        customer_id,
        order_id,
        subject,
        category
      )
      VALUES (?, ?, ?, ?)
      `,
      [req.user.id, linkedOrderId, subject.trim(), category],
    );

    const ticketId = ticketResult.insertId;

    // First message
    await connection.query(
      `
      INSERT INTO support_ticket_messages
      (
        ticket_id,
        sender_id,
        sender_type,
        message
      )
      VALUES (?, ?, 'customer', ?)
      `,
      [ticketId, req.user.id, message.trim()],
    );

    // Notify all admins
    const [admins] = await connection.query(
      `
  SELECT id
  FROM users
  WHERE role = 'admin'
    AND is_active = 1
  `,
    );

    for (const admin of admins) {
      await createNotificationSafe(connection, {
        userId: admin.id,
        type: "support_ticket",
        title: "New Support Ticket",
        message: `A new support ticket has been submitted: "${subject.trim()}".`,
        targetType: "support_ticket",
        targetId: ticketId,
      });
    }

    await connection.commit();

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "create_support_ticket",
      tableName: "support_tickets",
      recordId: ticketId,
      newValues: {
        category,
        order_id: linkedOrderId,
        status: "open",
      },
      ipAddress: req.ip || null,
    });

    res.status(201).json({
      message: "Support ticket created successfully.",
      ticket_id: ticketId,
    });
  } catch (err) {
    await connection.rollback();

    console.error("[customer.support POST]", err);

    res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  } finally {
    connection.release();
  }
};

/* ──────────────────────────────────────────────────────────────
   Get My Support Tickets
────────────────────────────────────────────────────────────── */
const getTickets = async (req, res) => {
  try {
    const { status } = req.query;

    let sql = `
      SELECT
        st.id,
        st.order_id,
        o.order_number,
        st.subject,
        st.category,
        st.priority,
        st.status,
        st.assigned_to,
        st.created_at,
        st.updated_at
      FROM support_tickets st
      LEFT JOIN orders o
        ON o.id = st.order_id
      WHERE st.customer_id = ?
    `;

    const params = [req.user.id];

    if (status?.trim()) {
      sql += ` AND st.status = ?`;
      params.push(status.trim());
    }

    sql += `
      ORDER BY st.updated_at DESC
    `;

    const [rows] = await db.query(sql, params);

    res.json(rows);
  } catch (err) {
    console.error("[customer.support GET]", err);

    res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};

/* ──────────────────────────────────────────────────────────────
   Get Customer Orders for Support Tickets
────────────────────────────────────────────────────────────── */
const getSupportOrders = async (req, res) => {
  try {
    const [orders] = await db.query(
      `
      SELECT
        id,
        order_number,
        status,
        created_at
      FROM orders
      WHERE customer_id = ?
      ORDER BY created_at DESC
      `,
      [req.user.id],
    );

    res.json(orders);
  } catch (err) {
    console.error("[customer.support ORDERS]", err);

    res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};

/* ──────────────────────────────────────────────────────────────
   Get Support Ticket Details
────────────────────────────────────────────────────────────── */
const getTicketById = async (req, res) => {
  const ticketId = parseInt(req.params.id, 10);

  if (Number.isNaN(ticketId)) {
    return res.status(400).json({
      message: "Invalid ticket ID.",
    });
  }

  try {
    // Get ticket (ownership check included)
    const [tickets] = await db.query(
      `
      SELECT
        st.id,
        st.customer_id,
        st.order_id,
        o.order_number,
        st.subject,
        st.category,
        st.priority,
        st.status,
        st.assigned_to,
        st.assigned_at,
        st.resolved_at,
        st.resolution_note,
        st.created_at,
        st.updated_at
      FROM support_tickets st
      LEFT JOIN orders o
        ON o.id = st.order_id
      WHERE st.id = ?
        AND st.customer_id = ?
      LIMIT 1
      `,
      [ticketId, req.user.id],
    );

    if (!tickets.length) {
      return res.status(404).json({
        message: "Support ticket not found.",
      });
    }

    const ticket = tickets[0];

    const [messages] = await db.query(
      `
      SELECT
        stm.id,
        stm.sender_id,
        stm.sender_type,
        stm.message,
        stm.attachment_url,
        stm.created_at,

        u.name AS sender_name

      FROM support_ticket_messages stm

      LEFT JOIN users u
      ON u.id = stm.sender_id

      WHERE stm.ticket_id = ?

      ORDER BY stm.created_at ASC
      `,
      [ticketId],
    );

    res.json({
      ticket,
      messages,
    });
  } catch (err) {
    console.error("[customer.support GET BY ID]", err);

    res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};

/* ──────────────────────────────────────────────────────────────
   Reply to Support Ticket
────────────────────────────────────────────────────────────── */
const replyToTicket = async (req, res) => {
  const ticketId = parseInt(req.params.id, 10);
  const { message } = req.body;

  if (Number.isNaN(ticketId)) {
    return res.status(400).json({
      message: "Invalid ticket ID.",
    });
  }

  if (!message?.trim()) {
    return res.status(400).json({
      message: "Message is required.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Verify ownership
    const [tickets] = await connection.query(
      `
      SELECT
        id,
        status,
        assigned_to,
        subject
      FROM support_tickets
      WHERE id = ?
        AND customer_id = ?
      LIMIT 1
      `,
      [ticketId, req.user.id],
    );

    if (!tickets.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Support ticket not found.",
      });
    }

    const ticket = tickets[0];

    if (ticket.status === "closed") {
      await connection.rollback();

      return res.status(400).json({
        message:
          "This ticket is permanently closed. Please open a new ticket for further assistance.",
      });
    }

    // Insert message
    await connection.query(
      `
      INSERT INTO support_ticket_messages
      (
        ticket_id,
        sender_id,
        sender_type,
        message
      )
      VALUES (?, ?, 'customer', ?)
      `,
      [ticketId, req.user.id, message.trim()],
    );

    // Refresh updated_at and reopen if waiting on customer or resolved
    await connection.query(
      `
      UPDATE support_tickets
      SET 
        updated_at = CURRENT_TIMESTAMP,
        status = CASE 
          WHEN status IN ('resolved', 'awaiting_customer') THEN 'open' 
          ELSE status 
        END,
        resolved_at = CASE 
          WHEN status = 'resolved' THEN NULL 
          ELSE resolved_at 
        END
      WHERE id = ?
      `,
      [ticketId],
    );

    try {
      const customerName = req.user.name || "The customer";
      if (ticket.assigned_to) {
        await createNotificationSafe(connection, {
          userId: ticket.assigned_to,
          type: "support_customer_reply",
          title: "Customer Replied to Support",
          message: `${customerName} replied to “${ticket.subject}”. Open the ticket to continue the conversation.`,
          targetType: "support_ticket",
          targetId: ticketId,
        });
      } else {
        const [admins] = await connection.query(
          `SELECT id FROM users WHERE role = 'admin' AND is_active = 1`,
        );
        for (const admin of admins) {
          await createNotificationSafe(connection, {
            userId: admin.id,
            type: "support_customer_reply",
            title: "Customer Replied to Support",
            message: `${customerName} replied to “${ticket.subject}”. Open the ticket to continue the conversation.`,
            targetType: "support_ticket",
            targetId: ticketId,
          });
        }
      }
    } catch (notificationErr) {
      console.error("[customer.support reply notification skipped]", notificationErr.message || notificationErr);
    }

    await connection.commit();

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "reply_support_ticket",
      tableName: "support_tickets",
      recordId: ticketId,
      oldValues: { status: ticket.status },
      newValues: {
        reply_added: true,
        status: ["resolved", "awaiting_customer"].includes(ticket.status)
          ? "open"
          : ticket.status,
      },
      ipAddress: req.ip || null,
    });

    res.json({
      message: "Reply sent successfully.",
    });
  } catch (err) {
    await connection.rollback();

    console.error("[customer.support REPLY]", err);

    res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  } finally {
    connection.release();
  }
};

/* ──────────────────────────────────────────────────────────────
   Close Support Ticket
────────────────────────────────────────────────────────────── */
const closeTicket = async (req, res) => {
  const ticketId = parseInt(req.params.id, 10);

  if (Number.isNaN(ticketId)) {
    return res.status(400).json({
      message: "Invalid ticket ID.",
    });
  }

  try {
    // Verify ownership
    const [tickets] = await db.query(
      `
      SELECT
        id,
        status
      FROM support_tickets
      WHERE id = ?
        AND customer_id = ?
      LIMIT 1
      `,
      [ticketId, req.user.id],
    );

    if (!tickets.length) {
      return res.status(404).json({
        message: "Support ticket not found.",
      });
    }

    const ticket = tickets[0];

    if (ticket.status === "closed") {
      return res.status(400).json({
        message: "This ticket is already closed.",
      });
    }

    await db.query(
      `
      UPDATE support_tickets
      SET
        status = 'closed',
        resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [ticketId],
    );

    await writeAuditLogSafe({
      userId: req.user.id,
      action: "close_support_ticket",
      tableName: "support_tickets",
      recordId: ticketId,
      oldValues: { status: ticket.status },
      newValues: { status: "closed" },
      ipAddress: req.ip || null,
    });

    res.json({
      message: "Support ticket closed successfully.",
    });
  } catch (err) {
    console.error("[customer.support CLOSE]", err);

    res.status(500).json({
      message: "Server error.",
      error: err.message,
    });
  }
};

module.exports = {
  createTicket,
  getTickets,
  getSupportOrders,
  getTicketById,
  replyToTicket,
  closeTicket,
};
