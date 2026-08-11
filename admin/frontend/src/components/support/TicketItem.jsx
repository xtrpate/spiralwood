import StatusBadge from "./StatusBadge";
import timeAgo from "../../utils/timeAgo";

const readable = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function TicketItem({
  ticket,
  active,
  onClick,
  variant = "default",
}) {
  if (variant === "admin") {
    return (
      <button
        type="button"
        className={`support-ticket-item admin-support-ticket-item ${active ? "active" : ""}`}
        onClick={onClick}
      >
        <div className="ticket-card-header">
          <h4>{ticket.subject}</h4>
          <StatusBadge status={ticket.status} compact />
        </div>

        <p className="ticket-customer">{ticket.customer_name}</p>

        <div className="ticket-meta admin-ticket-meta">
          <span>{ticket.order_number || "No linked order"}</span>
          <span>{readable(ticket.category)}</span>
        </div>

        <div className="ticket-footer">
          <span className={`priority ${ticket.priority}`}>
            {readable(ticket.priority)} priority
          </span>

          <small>{timeAgo(ticket.created_at)}</small>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`support-ticket-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="ticket-card-header">
        <h4>{ticket.subject}</h4>

        <StatusBadge status={ticket.status} />
      </div>

      <p className="ticket-customer">{ticket.customer_name}</p>

      <div className="ticket-meta">
        <span>{ticket.order_number || "No linked order"}</span>
        <span>{readable(ticket.category)}</span>
      </div>

      <div className="ticket-footer">
        <span className={`priority ${ticket.priority}`}>
          {readable(ticket.priority)}
        </span>

        <small>{timeAgo(ticket.created_at)}</small>
      </div>
    </div>
  );
}
