const db = require("../config/db");

const parsePositiveInt = (value) => {
  const text = String(value ?? "").trim();

  if (!/^[1-9][0-9]*$/.test(text)) {
    return null;
  }

  const parsed = Number(text);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
};

const parseJsonSafe = (value, fallback = {}) => {
  try {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : value;

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatPeso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const buildCustomerDeliverySummary = ({
  decision,
  additionalDeliveryFee,
  reason,
  truckType,
}) => {
  const parts = ["Oversized delivery assessment"];

  if (decision === "fee_required") {
    parts.push(
      `Additional larger-truck delivery fee: ${formatPeso(
        additionalDeliveryFee,
      )}`,
    );
  } else if (decision === "no_additional_fee") {
    parts.push("No additional delivery fee required");
  }

  if (truckType) {
    parts.push(`Truck type/arrangement: ${truckType}`);
  }

  if (reason) {
    parts.push(`Reason: ${reason}`);
  }

  return `${parts.join(" — ")}.`;
};

const appendSummaryToNotes = (notes, summary) => {
  const originalNotes = String(notes || "").trim();

  if (!originalNotes) {
    return summary;
  }

  if (originalNotes.includes(summary)) {
    return originalNotes;
  }

  return `${summary}\n\n${originalNotes}`;
};

module.exports = function appendCustomerOversizedDeliveryQuote(
  req,
  res,
  next,
) {
  const orderId = parsePositiveInt(req.params.id);

  if (!orderId) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    const enrichAndSend = async () => {
      if (
        res.statusCode >= 400 ||
        !payload ||
        typeof payload !== "object" ||
        !payload.latest_estimation
      ) {
        return originalJson(payload);
      }

      const latestEstimation = payload.latest_estimation;
      const estimationId = parsePositiveInt(latestEstimation.id);
      const estimationStatus = normalize(latestEstimation.status);

      if (
        !estimationId ||
        !["sent", "approved"].includes(estimationStatus)
      ) {
        return originalJson(payload);
      }

      let conn;

      try {
        conn = await db.getConnection();

        const [rows] = await conn.query(
          `SELECT
             e.id,
             e.status,
             e.estimation_data
           FROM estimations e
           INNER JOIN blueprints b ON b.id = e.blueprint_id
           INNER JOIN orders o ON o.blueprint_id = b.id
           WHERE e.id = ?
             AND o.id = ?
             AND o.customer_id = ?
             AND o.order_type = 'blueprint'
           LIMIT 1`,
          [estimationId, orderId, req.user.id],
        );

        if (!rows.length) {
          return originalJson(payload);
        }

        const estimation = rows[0];
        const storedStatus = normalize(estimation.status);

        if (!["sent", "approved"].includes(storedStatus)) {
          return originalJson(payload);
        }

        const meta =
          parseJsonSafe(estimation.estimation_data, {}) || {};

        const decision = normalize(
          meta.oversized_delivery_decision,
        );

        if (
          ![
            "fee_required",
            "no_additional_fee",
          ].includes(decision)
        ) {
          return originalJson(payload);
        }

        const additionalDeliveryFee =
          decision === "fee_required"
            ? Math.max(
                0,
                Number(meta.additional_delivery_fee || 0),
              )
            : 0;

        const reason = String(
          meta.oversized_delivery_reason || "",
        ).trim();

        const truckType = String(
          meta.oversized_truck_type || "",
        ).trim();

        const summary = buildCustomerDeliverySummary({
          decision,
          additionalDeliveryFee,
          reason,
          truckType,
        });

        payload.latest_estimation = {
          ...latestEstimation,
          additional_delivery_fee: additionalDeliveryFee,
          oversized_delivery_decision: decision,
          oversized_delivery_reason: reason,
          oversized_truck_type: truckType,
          delivery_requirement:
            meta.delivery_requirement || null,
          notes: appendSummaryToNotes(
            latestEstimation.notes,
            summary,
          ),
        };

        payload.oversized_delivery_quote = {
          decision,
          additional_delivery_fee: additionalDeliveryFee,
          reason,
          truck_type: truckType,
          delivery_requirement:
            meta.delivery_requirement || null,
          customer_summary: summary,
        };

        return originalJson(payload);
      } catch (error) {
        console.error(
          "[appendCustomerOversizedDeliveryQuote]",
          error,
        );

        // Do not break the existing custom-request page if this
        // display-only enrichment fails. The underlying quotation
        // response remains authoritative and usable.
        return originalJson(payload);
      } finally {
        if (conn) conn.release();
      }
    };

    enrichAndSend();
    return res;
  };

  return next();
};
