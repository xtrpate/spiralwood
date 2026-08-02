import StatusBadge from "./StatusBadge";
import AssignDropdown from "./AssignDropdown";
import Conversation from "./Conversation";
import ReplyBox from "./ReplyBox";
import TicketManagement from "./TicketManagement";

export default function TicketDetails({
  ticket,
  messages,
  onAssigned,
  onReplySent,
  onUpdated,
}) {
  if (!ticket) {
    return (
      <div className="support-ticket-details">
        <h2>Select a Ticket</h2>

        <p>Choose a support ticket to view its details.</p>
      </div>
    );
  }

  return (
    <div className="support-ticket-details">
      <h2>{ticket.subject}</h2>

      <div className="ticket-meta-grid">
        <div>
          <span>Customer</span>

          <strong>{ticket.customer_name}</strong>
        </div>

        <div>
          <span>Order</span>

          <strong>{ticket.order_number || "N/A"}</strong>
        </div>

        <div>
          <span>Status</span>

          <StatusBadge status={ticket.status} />
        </div>

        <div>
          <span>Priority</span>

          <strong>{ticket.priority}</strong>
        </div>

        <div>
          <span>Assigned To</span>

          <strong>{ticket.assigned_name || "Unassigned"}</strong>
        </div>
      </div>

      <AssignDropdown ticket={ticket} onAssigned={onAssigned} />

      <TicketManagement ticket={ticket} onUpdated={onUpdated} />

      <hr />

      <h3>Conversation</h3>

      <Conversation messages={messages} />
      <ReplyBox ticket={ticket} onReplySent={onReplySent} />
    </div>
  );
}
