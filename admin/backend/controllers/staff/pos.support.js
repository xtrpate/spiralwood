const db = require("../../config/db");

exports.getAssignedTickets = async (req, res) => {
  try {
    const [tickets] = await db.query(
      `
      SELECT
        st.id,
        st.subject,
        st.category,
        st.priority,
        st.status,
        st.created_at,
        st.updated_at,

        u.name AS customer_name,

        o.order_number

      FROM support_tickets st

      JOIN users u
        ON u.id = st.customer_id

      LEFT JOIN orders o
        ON o.id = st.order_id

      WHERE st.assigned_to = ?

      ORDER BY st.updated_at DESC
      `,
      [req.user.id],
    );

    res.json(tickets);
  } catch (err) {
    console.error("[POS SUPPORT GET]", err);

    res.status(500).json({
      message: "Server error.",
    });
  }
};

exports.getTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;

    // Make sure the ticket belongs to the logged-in staff
    const [tickets] = await db.query(
      `
      SELECT
        st.*,

        c.name AS customer_name,

        o.order_number,

        assigned.name AS assigned_name

      FROM support_tickets st

      JOIN users c
        ON c.id = st.customer_id

      LEFT JOIN orders o
        ON o.id = st.order_id

      LEFT JOIN users assigned
        ON assigned.id = st.assigned_to

      WHERE
        st.id = ?
        AND st.assigned_to = ?
      LIMIT 1
      `,
      [ticketId, req.user.id],
    );

    if (!tickets.length) {
      return res.status(404).json({
        message: "Ticket not found.",
      });
    }

    const ticket = tickets[0];

    const [messages] = await db.query(
      `
      SELECT
        stm.id,
        stm.ticket_id,
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
    console.error("[POS SUPPORT GET BY ID]", err);

    res.status(500).json({
      message: "Server error.",
    });
  }
};

exports.replyToTicket = async (req, res) => {
  const { message } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({
      message: "Reply is required.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [tickets] = await connection.query(
      `
      SELECT
        customer_id,
        assigned_to,
        subject
      FROM support_tickets
      WHERE id = ?
        AND assigned_to = ?
      LIMIT 1
      `,
      [req.params.id, req.user.id],
    );

    if (!tickets.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Ticket not found.",
      });
    }

    const ticket = tickets[0];

    await connection.query(
      `
      INSERT INTO support_ticket_messages
      (
        ticket_id,
        sender_id,
        sender_type,
        message
      )
      VALUES (?, ?, 'admin', ?)
      `,
      [req.params.id, req.user.id, message.trim()],
    );

    await connection.query(
      `
      UPDATE support_tickets
      SET updated_at = NOW()
      WHERE id = ?
      `,
      [req.params.id],
    );

    await connection.commit();

    res.json({
      message: "Reply sent successfully.",
    });
  } catch (err) {
    await connection.rollback();

    console.error("[POS SUPPORT REPLY]", err);

    res.status(500).json({
      message: "Server error.",
    });
  } finally {
    connection.release();
  }
};

exports.updateTicketStatus = async (req, res) => {
  const { status } = req.body;

  const allowedStatuses = [
    "assigned",
    "awaiting_customer",
    "resolved",
    "closed",
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid status.",
    });
  }

  try {
    const [result] = await db.query(
      `
      UPDATE support_tickets
      SET
        status = ?,
        updated_at = NOW(),
        resolved_at =
          CASE
            WHEN ? = 'resolved'
            THEN NOW()
            ELSE resolved_at
          END
      WHERE
        id = ?
        AND assigned_to = ?
      `,
      [status, status, req.params.id, req.user.id],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Ticket not found.",
      });
    }

    res.json({
      message: "Ticket updated successfully.",
    });
  } catch (err) {
    console.error("[POS SUPPORT STATUS]", err);

    res.status(500).json({
      message: "Server error.",
    });
  }
};
