// services/customerMilestoneNotificationService.js
const { sendBrevoEmail } = require("../utils/emailHelper");
const { normalizePhilippinePhone } = require("../utils/phone");
const { sendSms } = require("./semaphore.service");

const MILESTONE_EVENTS = new Set([
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "redelivery_scheduled",
]);

const cleanText = (value) => String(value || "").trim();

const escapeHtml = (value) =>
  cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const isUsableEmail = (value) => {
  const email = cleanText(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const formatScheduleDate = (value) => {
  const raw = cleanText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw;

  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );

  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
};

const getMilestoneContent = ({ event, orderLabel, scheduledDate }) => {
  const scheduleLabel = formatScheduleDate(scheduledDate);

  switch (event) {
    case "ready_for_pickup":
      return {
        subject: `Ready for Pickup: ${orderLabel}`,
        heading: "Your furniture is ready for pickup",
        emailMessage:
          `Your furniture for ${orderLabel} is ready for pickup. ` +
          "Please complete any remaining balance before collection.",
        smsMessage:
          `Spiral Wood Services: ${orderLabel} is ready for pickup. ` +
          "Please complete any remaining balance before collection.",
      };

    case "out_for_delivery":
      return {
        subject: `Out for Delivery: ${orderLabel}`,
        heading: "Your order is on the way",
        emailMessage:
          `${orderLabel} is now out for delivery. ` +
          "Please keep your phone available in case our rider needs to contact you.",
        smsMessage:
          `Spiral Wood Services: ${orderLabel} is now out for delivery. ` +
          "Please keep your phone available for the rider.",
      };

    case "delivered":
      return {
        subject: `Delivered: ${orderLabel}`,
        heading: "Your order has been delivered",
        emailMessage:
          `${orderLabel} has been delivered. ` +
          "Thank you for choosing Spiral Wood Services.",
        smsMessage:
          `Spiral Wood Services: ${orderLabel} has been delivered. Thank you.`,
      };

    case "delivery_failed":
      return {
        subject: `Delivery Update: ${orderLabel}`,
        heading: "Delivery attempt was unsuccessful",
        emailMessage:
          `We were unable to complete the delivery for ${orderLabel}. ` +
          "Our team will contact you to arrange another delivery schedule.",
        smsMessage:
          `Spiral Wood Services: We could not complete delivery for ${orderLabel}. ` +
          "Our team will contact you to arrange another schedule.",
      };

    case "redelivery_scheduled":
      return {
        subject: `Redelivery Scheduled: ${orderLabel}`,
        heading: "A new delivery schedule has been arranged",
        emailMessage: scheduleLabel
          ? `A new delivery schedule for ${orderLabel} has been arranged for ${scheduleLabel}.`
          : `A new delivery schedule for ${orderLabel} has been arranged.`,
        smsMessage: scheduleLabel
          ? `Spiral Wood Services: Redelivery for ${orderLabel} is scheduled for ${scheduleLabel}.`
          : `Spiral Wood Services: A redelivery schedule for ${orderLabel} has been arranged.`,
      };

    default:
      return null;
  }
};

const loadOrderContact = async (db, orderId) => {
  const [[row]] = await db.query(
    `SELECT
       o.id,
       o.order_number,
       o.customer_id,
       COALESCE(
         NULLIF(TRIM(customer.name), ''),
         NULLIF(TRIM(o.walkin_customer_name), ''),
         'Customer'
       ) AS customer_name,
       NULLIF(TRIM(customer.email), '') AS customer_email,
       COALESCE(
         NULLIF(TRIM(customer.phone), ''),
         NULLIF(TRIM(o.walkin_customer_phone), '')
       ) AS customer_phone
     FROM orders o
     LEFT JOIN users customer ON customer.id = o.customer_id
     WHERE o.id = ?
     LIMIT 1`,
    [orderId],
  );

  return row || null;
};

const buildEmailHtml = ({ customerName, orderLabel, heading, emailMessage }) => {
  const safeName = escapeHtml(customerName || "Customer");
  const safeOrder = escapeHtml(orderLabel);
  const safeHeading = escapeHtml(heading);
  const safeMessage = escapeHtml(emailMessage);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#111111;">${safeHeading}</h2>
      <p style="margin:0 0 12px;line-height:1.6;">Hi ${safeName},</p>
      <p style="margin:0 0 16px;line-height:1.6;">${safeMessage}</p>
      <p style="margin:0 0 20px;line-height:1.6;"><strong>Order:</strong> ${safeOrder}</p>
      <p style="margin:0;color:#71717a;font-size:12px;line-height:1.5;">
        This is an automated order status update from Spiral Wood Services.
      </p>
    </div>
  `;
};

const sendCustomerMilestoneNotificationSafe = async (
  db,
  { orderId, event, scheduledDate = null },
) => {
  const numericOrderId = Number(orderId);

  if (!Number.isSafeInteger(numericOrderId) || numericOrderId <= 0) {
    console.warn(
      `[CustomerMilestoneNotification] skipped invalid order id for event=${event}`,
    );
    return { email: false, sms: false, skipped: true };
  }

  if (!MILESTONE_EVENTS.has(event)) {
    console.warn(
      `[CustomerMilestoneNotification] skipped unsupported event=${event} order_id=${numericOrderId}`,
    );
    return { email: false, sms: false, skipped: true };
  }

  try {
    const contact = await loadOrderContact(db, numericOrderId);

    if (!contact) {
      console.warn(
        `[CustomerMilestoneNotification] order not found order_id=${numericOrderId} event=${event}`,
      );
      return { email: false, sms: false, skipped: true };
    }

    const orderLabel = contact.order_number
      ? `Order ${cleanText(contact.order_number)}`
      : `Order #${numericOrderId}`;

    const content = getMilestoneContent({
      event,
      orderLabel,
      scheduledDate,
    });

    if (!content) {
      return { email: false, sms: false, skipped: true };
    }

    let emailSent = false;
    let smsSent = false;

    if (isUsableEmail(contact.customer_email)) {
      emailSent = Boolean(
        await sendBrevoEmail({
          toEmail: cleanText(contact.customer_email),
          toName: cleanText(contact.customer_name) || "Customer",
          subject: content.subject,
          htmlContent: buildEmailHtml({
            customerName: contact.customer_name,
            orderLabel,
            heading: content.heading,
            emailMessage: content.emailMessage,
          }),
        }),
      );
    }

    const rawPhone = cleanText(contact.customer_phone);

    if (rawPhone) {
      try {
        const normalizedPhone = normalizePhilippinePhone(rawPhone);

        try {
          smsSent = Boolean(
            await sendSms({
              phone: normalizedPhone,
              message: content.smsMessage,
            }),
          );
        } catch (smsErr) {
          console.error(
            `[CustomerMilestoneNotification] SMS failed order_id=${numericOrderId} event=${event}:`,
            smsErr?.message || smsErr,
          );
        }
      } catch (phoneErr) {
        console.warn(
          `[CustomerMilestoneNotification] SMS skipped invalid phone order_id=${numericOrderId} event=${event}:`,
          phoneErr?.code || phoneErr?.message || phoneErr,
        );
      }
    }

    console.log(
      `[CustomerMilestoneNotification] event=${event} order_id=${numericOrderId} email=${emailSent ? "sent" : "not_sent"} sms=${smsSent ? "sent" : "not_sent"}`,
    );

    return {
      email: emailSent,
      sms: smsSent,
      skipped: !emailSent && !smsSent,
    };
  } catch (err) {
    console.error(
      `[CustomerMilestoneNotification] non-blocking failure order_id=${numericOrderId} event=${event}:`,
      err?.message || err,
    );

    return { email: false, sms: false, skipped: true };
  }
};

module.exports = {
  sendCustomerMilestoneNotificationSafe,
};
