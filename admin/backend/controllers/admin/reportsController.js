const db = require("../../config/db");

exports.getSalesProfitabilityReport = async (req, res) => {
  try {
    const { from, to, limit = 500, page = 1 } = req.query;
    const offset = (Math.max(1, page) - 1) * limit;

    let dateFilter = "";
    const params = [];

    // Optional Date Filtering
    if (from && to) {
      dateFilter = "AND o.created_at >= ? AND o.created_at <= ?";
      params.push(`${from} 00:00:00`, `${to} 23:59:59`);
    }

    // THE MERGE QUERY:
    const sql = `
      SELECT 
        o.id AS order_id,
        o.order_number,
        o.created_at AS date_sold,
        o.order_type,
        o.customer_id,
        COALESCE(u.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name,
        o.total AS revenue,
        
        -- Calculate COGS (Cost of Goods Sold)
        CASE 
          WHEN o.order_type = 'blueprint' THEN COALESCE(e.material_cost, 0) + COALESCE(e.labor_cost, 0)
          ELSE COALESCE((
            SELECT SUM(oi.quantity * p.production_cost)
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = o.id
          ), 0)
        END AS cogs

      FROM orders o
      LEFT JOIN users u ON u.id = o.customer_id
      LEFT JOIN estimations e ON e.blueprint_id = o.blueprint_id AND e.status = 'approved'
      WHERE o.status IN ('completed', 'delivered') 
      ${dateFilter}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));

    const [rows] = await db.query(sql, params);

    // Calculate Margins and Summaries before sending to frontend
    let totalRevenue = 0;
    let totalCogs = 0;

    const formattedRows = rows.map((row) => {
      const revenue = Number(row.revenue || 0);
      const cogs = Number(row.cogs || 0);
      const grossProfit = revenue - cogs;

      // Prevent division by zero
      const marginPercentage = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      totalRevenue += revenue;
      totalCogs += cogs;

      return {
        ...row,
        revenue,
        cogs,
        gross_profit: grossProfit,
        margin_percentage: marginPercentage.toFixed(2),
      };
    });

    const totalGrossProfit = totalRevenue - totalCogs;
    const overallMargin =
      totalRevenue > 0
        ? ((totalGrossProfit / totalRevenue) * 100).toFixed(2)
        : 0;

    res.json({
      summary: {
        total_revenue: totalRevenue,
        total_cogs: totalCogs,
        total_gross_profit: totalGrossProfit,
        overall_margin_percentage: overallMargin,
      },
      records: formattedRows,
    });
  } catch (err) {
    console.error("[Reports] Failed to fetch sales profitability:", err);
    res.status(500).json({ message: "Failed to generate report." });
  }
};
