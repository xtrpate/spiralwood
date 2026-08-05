// controllers/customer/customer.deliveryConfig.js
const db = require("../../config/db");
const {
  getStandardTruckLimits,
} = require("../../utils/oversizedDelivery");

/**
 * Public read-only endpoint used by the customer blueprint editor.
 *
 * No guessed truck measurements are returned. The endpoint only exposes
 * the actual standard-truck internal limits saved by the administrator.
 */
exports.getDeliveryConfig = async (req, res) => {
  let conn = null;

  try {
    conn = await db.getConnection();

    const limits = await getStandardTruckLimits(conn);

    return res.json({
      configured: limits.configured,

      standard_truck_limits_mm: limits.configured
        ? {
            width_mm: limits.width_mm,
            height_mm: limits.height_mm,
            depth_mm: limits.depth_mm,
          }
        : null,
    });
  } catch (error) {
    console.error(
      "[customer.deliveryConfig GET]",
      error,
    );

    return res.status(500).json({
      message: "Unable to load delivery capacity limits.",
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
};
