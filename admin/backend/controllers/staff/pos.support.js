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
