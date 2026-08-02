import StatusBadge from "./StatusBadge";

const formatDate = (date) => {
  if (!date) return "—";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const CATEGORY_LABELS = {
  inquiry: "Inquiry",
  complaint: "Complaint",
  order_assistance: "Order Assistance",
  blueprint_support: "Blueprint Support",
  other: "Other",
};

export default function TicketCard({ ticket, active = false, onClick }) {
  return (
    <button
      type="button"
      className={`support-ticket-card ${active ? "active" : ""}`}
      onClick={() => onClick(ticket)}
    >
      <div className="support-ticket-header">
        <div className="support-ticket-subject">{ticket.subject}</div>

        <StatusBadge status={ticket.status} />
      </div>

      <div className="support-ticket-category">
        {CATEGORY_LABELS[ticket.category] || "Other"}
      </div>

      {ticket.order_number && (
        <div className="support-ticket-order">Order #{ticket.order_number}</div>
      )}

      <div className="support-ticket-footer">
        <span>Updated {formatDate(ticket.updated_at)}</span>
      </div>
    </button>
  );
}
