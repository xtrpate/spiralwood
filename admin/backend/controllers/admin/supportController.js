const pool = require("../../config/db");
const { createNotificationSafe } = require("../../utils/notificationHelper");
const {
  storeUploadBuffer,
  cleanupStoredUpload,
} = require("../../utils/adaptiveUpload");
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
        st.created_at,
        st.updated_at,

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
        stm.created_at,
        u.name AS sender_name
      FROM support_ticket_messages stm
      INNER JOIN users u
        ON stm.sender_id = u.id
      WHERE stm.ticket_id = ?
      ORDER BY stm.created_at ASC
      `,
      [ticketId],
    );

    for (const msg of messages) {
      const [attachments] = await pool.query(
        `
        SELECT id, file_url, file_name, mime_type, file_size, created_at
        FROM support_ticket_message_attachments
        WHERE message_id = ?
        ORDER BY id ASC
        `,
        [msg.id],
      );

      msg.attachments = attachments;
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
        role,
        staff_type,
        is_active
      FROM users
      WHERE role = 'staff'
        AND staff_type = 'cashier'
        AND is_active = 1
      ORDER BY name ASC
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
      SELECT id, status, subject
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

    // Support tickets are handled by active cashier staff. Enforce this on
    // the server even if a stale/cached frontend submits another user id.
    const [userRows] = await conn.query(
      `
      SELECT id, role, staff_type, is_active
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [assigned_to],
    );

    if (userRows.length === 0) {
      await conn.rollback();

      return res.status(404).json({
        message: "Assigned user not found.",
      });
    }

    const assignee = userRows[0];
    if (
      assignee.role !== "staff" ||
      assignee.staff_type !== "cashier" ||
      Number(assignee.is_active) !== 1
    ) {
      await conn.rollback();

      return res.status(400).json({
        message: "Ticket can only be assigned to an active cashier.",
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

    await createNotificationSafe(conn, {
      userId: assigned_to,
      type: "support_assignment",
      title: "Support Ticket Assigned",
      message: `You were assigned support ticket “${ticketRows[0].subject}”. Open the ticket to review the customer’s concern.`,
      targetType: "support_ticket",
      targetId: ticketId,
    });

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
      SELECT id, customer_id, subject, status
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

  created_at,
  updated_at,
  assigned_at,
  resolved_at,

  resolution_note
FROM support_tickets
WHERE id = ?
      `,
      [ticketId],
    );

    if (
      status === "resolved" &&
      ticketRows[0].status !== "resolved" &&
      ticketRows[0].customer_id
    ) {
      const resolution = String(resolution_note || "").trim();
      await createNotificationSafe(conn, {
        userId: ticketRows[0].customer_id,
        type: "support_resolved",
        title: "Support Request Resolved",
        message: resolution
          ? `Your support request “${ticketRows[0].subject}” has been resolved. Resolution: ${resolution}`
          : `Your support request “${ticketRows[0].subject}” has been resolved. Open the ticket to review the update.`,
        targetType: "support_ticket",
        targetId: ticketId,
      });
    }

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
  const ticketId = parseInt(req.params.id);
  const message = String(req.body?.message || "").trim();
  const files = Array.isArray(req.files) ? req.files : [];

  if (!ticketId) {
    return res.status(400).json({ message: "Invalid ticket ID." });
  }

  if (!message && files.length === 0) {
    return res
      .status(400)
      .json({ message: "Write a message or attach a file." });
  }

  let conn;
  let transactionActive = false;
  let committed = false;
  const storedAssets = [];

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [ticketRows] = await conn.query(
      `SELECT id, customer_id, subject FROM support_tickets WHERE id = ?`,
      [ticketId],
    );

    if (ticketRows.length === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Support ticket not found." });
    }

    // 1. Upload the files to Cloudinary
    for (const file of files) {
      const stored = await storeUploadBuffer({
        file,
        folder: "support-attachments", // Standardized folder for support files
      });
      storedAssets.push(stored);
    }

    // 2. Insert the main message
    const [messageResult] = await conn.query(
      `
      INSERT INTO support_ticket_messages
      (ticket_id, sender_id, sender_type, message)
      VALUES (?, ?, 'admin', ?)
      `,
      [ticketId, req.user.id, message || null],
    );

    const messageId = messageResult.insertId;

    // 3. Save the uploaded file links to the attachments table
    for (const asset of storedAssets) {
      await conn.query(
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

    await createNotificationSafe(conn, {
      userId: ticketRows[0].customer_id,
      type: "support_reply",
      title: "New Reply from Spiral Wood Services",
      message: `Our team replied to your support request “${ticketRows[0].subject}”. Open Support to read the message.`,
      targetType: "support_ticket",
      targetId: ticketId,
    });

    await conn.query(
      `
      UPDATE support_tickets
      SET
        status = CASE
          WHEN status IN ('open', 'assigned', 'awaiting_customer') THEN 'in_progress'
          ELSE status
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [ticketId],
    );

    const [messages] = await conn.query(
      `
      SELECT stm.*, u.name AS sender_name
      FROM support_ticket_messages stm
      INNER JOIN users u ON stm.sender_id = u.id
      WHERE stm.ticket_id = ?
      ORDER BY stm.created_at ASC
      `,
      [ticketId],
    );

    // Fetch attachments to return in the immediate response
    for (const msg of messages) {
      const [attachments] = await conn.query(
        `SELECT id, file_url, file_name, mime_type, file_size, created_at
         FROM support_ticket_message_attachments WHERE message_id = ? ORDER BY id ASC`,
        [msg.id],
      );
      msg.attachments = attachments;
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

    await conn.commit();
    transactionActive = false;
    committed = true;

    return res.json({
      message: files.length
        ? "Reply and attachment sent successfully."
        : "Reply sent successfully.",
      messages,
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch (rollbackErr) {}
    }
    console.error("[supportController.replyToTicket]", err);
    return res.status(500).json({ message: "Failed to send reply." });
  } finally {
    // If the database transaction failed, delete the orphaned images from Cloudinary!
    if (!committed && storedAssets.length) {
      await Promise.allSettled(
        storedAssets.map((asset) => cleanupStoredUpload(asset)),
      );
    }
    if (conn) conn.release();
  }
};
