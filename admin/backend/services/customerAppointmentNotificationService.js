const { sendBrevoEmail } = require("../utils/emailHelper");
const { normalizePhilippinePhone } = require("../utils/phone");
const { sendSms } = require("./semaphore.service");

const APPOINTMENT_EVENTS = new Set([
  "confirmed",
  "in_progress",
  "rescheduled",
  "completed",
  "cancelled",
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

const formatScheduleParts = (value) => {
  const raw = cleanText(value).replace("T", " ");

  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    raw,
  );

  if (!match) {
    return {
      date: "the scheduled date",
      time: "the scheduled time",
    };
  }

  const [, year, month, day, hour, minute] = match;

  const dateValue = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );

  const date = Number.isNaN(dateValue.getTime())
    ? `${year}-${month}-${day}`
    : dateValue.toLocaleDateString("en-PH", {
        timeZone: "UTC",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  const hourNumber = Number(hour);
  const displayHour = hourNumber % 12 || 12;

  const period = hourNumber >= 12 ? "PM" : "AM";

  return {
    date,
    time: `${displayHour}:${minute} ${period}`,
  };
};

const getAppointmentContent = ({ event, scheduledDate }) => {
  const { date, time } = formatScheduleParts(scheduledDate);

  switch (event) {
    case "confirmed":
      return {
        subject: "Your appointment has been accepted",
        heading: "Appointment Accepted",
        message:
          `Your appointment is accepted. ` +
          `Please make sure to be available at the ` +
          `${date} and ${time} of your appointment ` +
          `as our staff will contact you. ` +
          `If you cannot be contacted for 30 mins ` +
          `your appointment will be canceled automatically.`,
      };

    case "in_progress":
      return {
        subject: "Your appointment is now in progress",
        heading: "Appointment In Progress",
        message:
          `Your appointment scheduled for ${date} ` +
          `at ${time} is now in progress. ` +
          `Our staff has started the appointment.`,
      };

    case "rescheduled":
      return {
        subject: "Your appointment has been rescheduled",
        heading: "Appointment Rescheduled",
        message:
          `Your appointment has been rescheduled to ` +
          `${date} at ${time}. Please make sure to keep ` +
          `your phone available for contact from our staff.`,
      };

    case "completed":
      return {
        subject: "Your appointment has been completed",
        heading: "Appointment Completed",
        message:
          `Your appointment scheduled for ${date} ` +
          `at ${time} has been completed. ` +
          `Thank you for choosing Spiral Wood Services.`,
      };

    case "cancelled":
      return {
        subject: "Your appointment has been cancelled",
        heading: "Appointment Cancelled",
        message:
          `Your appointment scheduled for ${date} ` +
          `at ${time} has been cancelled. ` +
          `Please contact our team if you need further assistance.`,
      };

    default:
      return null;
  }
};

const extractContactFromNotes = (notes) => {
  const match = String(notes || "").match(
    /(?:^|\r?\n)Contact:\s*([0-9+\-()\s]+)\s*$/im,
  );

  return cleanText(match?.[1] || "");
};

const loadAppointmentContact = async (db, appointmentId) => {
  const [[row]] = await db.query(
    `
    SELECT
      a.id,

      DATE_FORMAT(
        a.scheduled_date,
        '%Y-%m-%d %H:%i:%s'
      ) AS scheduled_date,

      a.notes,

      COALESCE(
        a.customer_id,
        o.customer_id
      ) AS resolved_customer_id,

      COALESCE(
        NULLIF(TRIM(customer.name), ''),
        NULLIF(
          TRIM(o.walkin_customer_name),
          ''
        ),
        'Customer'
      ) AS customer_name,

      NULLIF(
        TRIM(customer.email),
        ''
      ) AS customer_email,

      COALESCE(
        NULLIF(TRIM(customer.phone), ''),
        NULLIF(
          TRIM(o.walkin_customer_phone),
          ''
        )
      ) AS customer_phone

    FROM appointments a

    LEFT JOIN orders o
      ON o.id = a.order_id

    LEFT JOIN users customer
      ON customer.id =
        COALESCE(
          a.customer_id,
          o.customer_id
        )

    WHERE a.id = ?
    LIMIT 1
    `,
    [appointmentId],
  );

  return row || null;
};

const buildEmailHtml = ({ customerName, heading, message }) => {
  const safeName = escapeHtml(customerName || "Customer");

  const safeHeading = escapeHtml(heading);

  const safeMessage = escapeHtml(message);

  return `
    <div
      style="
        font-family:Arial,Helvetica,sans-serif;
        max-width:560px;
        margin:0 auto;
        padding:24px;
        color:#18181b;
      "
    >
      <h2
        style="
          margin:0 0 16px;
          font-size:20px;
          color:#111111;
        "
      >
        ${safeHeading}
      </h2>

      <p
        style="
          margin:0 0 12px;
          line-height:1.6;
        "
      >
        Hi ${safeName},
      </p>

      <p
        style="
          margin:0 0 16px;
          line-height:1.6;
        "
      >
        ${safeMessage}
      </p>

      <p
        style="
          margin:0;
          color:#71717a;
          font-size:12px;
          line-height:1.5;
        "
      >
        This is an automated appointment update
        from Spiral Wood Services.
      </p>
    </div>
  `;
};

const sendCustomerAppointmentNotificationSafe = async (
  db,
  { appointmentId, event },
) => {
  const numericAppointmentId = Number(appointmentId);

  if (
    !Number.isSafeInteger(numericAppointmentId) ||
    numericAppointmentId <= 0
  ) {
    return {
      email: false,
      sms: false,
      skipped: true,
    };
  }

  if (!APPOINTMENT_EVENTS.has(event)) {
    return {
      email: false,
      sms: false,
      skipped: true,
    };
  }

  try {
    const contact = await loadAppointmentContact(db, numericAppointmentId);

    if (!contact || !contact.resolved_customer_id) {
      return {
        email: false,
        sms: false,
        skipped: true,
      };
    }

    const content = getAppointmentContent({
      event,
      scheduledDate: contact.scheduled_date,
    });

    if (!content) {
      return {
        email: false,
        sms: false,
        skipped: true,
      };
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
            heading: content.heading,
            message: content.message,
          }),
        }),
      );
    }

    const notePhone = extractContactFromNotes(contact.notes);

    const rawPhone = notePhone || cleanText(contact.customer_phone);

    if (rawPhone) {
      try {
        const normalizedPhone = normalizePhilippinePhone(rawPhone);

        smsSent = Boolean(
          await sendSms({
            phone: normalizedPhone,
            message: `Spiral Wood Services: ${content.message}`,
          }),
        );
      } catch (smsErr) {
        console.error(
          "[CustomerAppointmentNotification] SMS failed:",
          smsErr?.message || smsErr,
        );
      }
    }

    return {
      email: emailSent,
      sms: smsSent,
      skipped: !emailSent && !smsSent,
    };
  } catch (err) {
    console.error(
      "[CustomerAppointmentNotification] failed:",
      err?.message || err,
    );

    return {
      email: false,
      sms: false,
      skipped: true,
    };
  }
};

module.exports = {
  sendCustomerAppointmentNotificationSafe,
};
