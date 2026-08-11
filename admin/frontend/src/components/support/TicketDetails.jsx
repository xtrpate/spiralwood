import {
  AlertTriangle,
  Package,
  Tag,
  User,
  UserCheck,
} from "lucide-react";

import StatusBadge from "./StatusBadge";
import AssignDropdown from "./AssignDropdown";
import TicketManagement from "./TicketManagement";

const readable = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function TicketDetails({
  ticket,
  activeTab,
  setActiveTab,
  onAssigned,
  onUpdated,
  variant = "default",
}) {
  const adminMode = variant === "admin";

  if (!ticket) {
    return (
      <div className={`support-ticket-details ${adminMode ? "admin-support-ticket-details is-empty" : ""}`}>
        <h2>Select a Ticket</h2>
        <p>Choose a support ticket to review its details and conversation.</p>
      </div>
    );
  }

  return (
    <div className={`support-ticket-details ${adminMode ? "admin-support-ticket-details" : ""}`}>
      <div className="admin-ticket-detail-heading">
        <div>
          <h2>{ticket.subject}</h2>
          {adminMode && (
            <p className="ticket-subtitle">
              {ticket.customer_name} · {ticket.order_number || "No linked order"}
            </p>
          )}
        </div>

        {adminMode && <StatusBadge status={ticket.status} />}
      </div>

      {!adminMode && (
        <p className="ticket-subtitle">
          Manage customer support requests, assignments, and conversations.
        </p>
      )}

      <div className="support-tabs">
        <button
          type="button"
          className={activeTab === "details" ? "active" : ""}
          onClick={() => setActiveTab("details")}
        >
          Details
        </button>

        <button
          type="button"
          className={activeTab === "conversation" ? "active" : ""}
          onClick={() => setActiveTab("conversation")}
        >
          Conversation
        </button>
      </div>

      <hr className="ticket-divider" />

      <div className="ticket-details-top">
        <h4 className="ticket-section-title">Ticket Information</h4>

        <div className="ticket-meta-grid">
          <div className="ticket-meta-item">
            <span>
              <User size={15} />
              Customer
            </span>
            <strong>{ticket.customer_name}</strong>
          </div>

          <div className="ticket-meta-item">
            <span>
              <Package size={15} />
              Order
            </span>
            <strong>{ticket.order_number || "No linked order"}</strong>
          </div>

          <div className="ticket-meta-item">
            <span>
              <Tag size={15} />
              Category
            </span>
            <strong>{readable(ticket.category)}</strong>
          </div>

          <div className="ticket-meta-item">
            <span>
              <AlertTriangle size={15} />
              Priority
            </span>
            <strong>{readable(ticket.priority)}</strong>
          </div>

          <div className="ticket-meta-item">
            <span>
              <UserCheck size={15} />
              Assigned Staff
            </span>
            <strong>{ticket.assigned_name || "Unassigned"}</strong>
          </div>

          <div className="ticket-meta-item">
            <span>Status</span>
            <StatusBadge status={ticket.status} />
          </div>
        </div>

        <h4 className="ticket-section-title">Assignment</h4>
        <AssignDropdown
          ticket={ticket}
          onAssigned={onAssigned}
          variant={variant}
        />

        <h4 className="ticket-section-title">Ticket Update</h4>
        <TicketManagement
          ticket={ticket}
          onUpdated={onUpdated}
          variant={variant}
        />
      </div>
    </div>
  );
}
