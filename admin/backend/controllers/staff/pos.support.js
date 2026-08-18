const db = require("../../config/db");

const {
  storeUploadBuffer,
  cleanupStoredUpload,
} = require("../../utils/adaptiveUpload");

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

    const [tickets] = await db.query(
      `
      SELECT
        st.*,
        c.name AS customer_name,
        o.order_number,
        assigned.name AS assigned_name
      FROM support_tickets st
      JOIN users c ON c.id = st.customer_id
      LEFT JOIN orders o ON o.id = st.order_id
      LEFT JOIN users assigned ON assigned.id = st.assigned_to
      WHERE
        st.id = ? AND st.assigned_to = ?
      LIMIT 1
      `,
      [ticketId, req.user.id],
    );

    if (!tickets.length) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    const ticket = tickets[0];

    const [messages] = await db.query(
      `
      SELECT
        stm.id, stm.ticket_id, stm.sender_id, stm.sender_type,
        stm.message, stm.attachment_url, stm.created_at,
        u.name AS sender_name
      FROM support_ticket_messages stm
      LEFT JOIN users u ON u.id = stm.sender_id
      WHERE stm.ticket_id = ?
      ORDER BY stm.created_at ASC
      `,
      [ticketId],
    );

    for (const msg of messages) {
      const [attachments] = await db.query(
        `
        SELECT id, file_url, file_name, mime_type, file_size, created_at
        FROM support_ticket_message_attachments
        WHERE message_id = ?
        ORDER BY id ASC
        `,
        [msg.id],
      );

      msg.attachments = attachments;

      // Fallback for legacy attachments
      if (msg.attachment_url && msg.attachments.length === 0) {
        msg.attachments.push({
          id: `legacy-${msg.id}`,
          file_url: msg.attachment_url,
          file_name: "Attachment",
          mime_type: null,
          file_size: null,
          created_at: msg.created_at,
        });
      }
    }

    res.json({
      ticket,
      messages,
    });
  } catch (err) {
    console.error("[POS SUPPORT GET BY ID]", err);
    res.status(500).json({ message: "Server error." });
  }
};

exports.replyToTicket = async (req, res) => {
  const ticketId = parseInt(req.params.id);
  const message = String(req.body?.message || "").trim();
  const files = Array.isArray(req.files) ? req.files : [];

  if (!message && files.length === 0) {
    return res.status(400).json({
      message: "Reply or attachment is required.",
    });
  }

  let connection;
  let transactionActive = false;
  let committed = false;
  const storedAssets = [];

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionActive = true;

    const [tickets] = await connection.query(
      `
      SELECT customer_id, assigned_to, subject
      FROM support_tickets
      WHERE id = ? AND assigned_to = ?
      LIMIT 1
      `,
      [ticketId, req.user.id],
    );

    if (!tickets.length) {
      await connection.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Ticket not found." });
    }

    // 1. Upload files to Cloudinary
    for (const file of files) {
      const stored = await storeUploadBuffer({
        file,
        folder: "support-attachments",
      });
      storedAssets.push(stored);
    }

    // 2. Insert main message
    const [messageResult] = await connection.query(
      `
      INSERT INTO support_ticket_messages
      (ticket_id, sender_id, sender_type, message)
      VALUES (?, ?, 'admin', ?)
      `,
      [ticketId, req.user.id, message || null],
    );

    const messageId = messageResult.insertId;

    // 3. Save attachments to DB
    for (const asset of storedAssets) {
      await connection.query(
        `
        INSERT INTO support_ticket_message_attachments
        (message_id, file_url, file_name, mime_type, file_size)
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          messageId,
          asset.file_url,
          asset.file_name,
          asset.mime_type,
          asset.file_size,
        ],
      );
    }

    // 4. Update ticket status
    await connection.query(
      `
      UPDATE support_tickets
      SET 
        updated_at = NOW(),
        status = CASE
          WHEN status IN ('open', 'assigned', 'awaiting_customer')
          THEN 'in_progress'
          ELSE status
        END
      WHERE id = ?
      `,
      [ticketId],
    );

    await connection.commit();
    transactionActive = false;
    committed = true;

    res.json({
      message: files.length
        ? "Reply and attachment sent successfully."
        : "Reply sent successfully.",
    });
  } catch (err) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
        transactionActive = false;
      } catch (rollbackErr) {}
    }
    console.error("[POS SUPPORT REPLY]", err);
    res.status(500).json({ message: "Server error." });
  } finally {
    if (!committed && storedAssets.length) {
      await Promise.allSettled(
        storedAssets.map((asset) => cleanupStoredUpload(asset)),
      );
    }
    if (connection) connection.release();
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
