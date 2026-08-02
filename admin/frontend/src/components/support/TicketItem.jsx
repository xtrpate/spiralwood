import StatusBadge from "./StatusBadge";

export default function TicketItem({ ticket, active, onClick }) {
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
        <span>📦 {ticket.order_number || "No Order"}</span>

        <span>{ticket.category.replaceAll("_", " ")}</span>
      </div>

      <div className="ticket-footer">
        <span className={`priority ${ticket.priority}`}>{ticket.priority}</span>

        <small>{new Date(ticket.created_at).toLocaleDateString()}</small>
      </div>
    </div>
  );
}
