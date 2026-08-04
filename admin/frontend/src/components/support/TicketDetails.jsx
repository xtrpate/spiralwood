import { User, Package, Tag, AlertTriangle, UserCheck } from "lucide-react";

import StatusBadge from "./StatusBadge";
import AssignDropdown from "./AssignDropdown";
import TicketManagement from "./TicketManagement";

export default function TicketDetails({
  ticket,
  activeTab,
  setActiveTab,
  onAssigned,
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

      <p className="ticket-subtitle">
        Manage customer support requests, assignments, and conversations.
      </p>

      <div className="support-tabs">
        <button
          className={activeTab === "details" ? "active" : ""}
          onClick={() => setActiveTab("details")}
        >
          Details
        </button>

        <button
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

            <strong>{ticket.order_number || "N/A"}</strong>
          </div>

          <div className="ticket-meta-item">
            <span>
              <Tag size={15} />
              Category
            </span>

            <strong>{ticket.category.replaceAll("_", " ")}</strong>
          </div>

          <div className="ticket-meta-item">
            <span>
              <AlertTriangle size={15} />
              Priority
            </span>

            <strong>{ticket.priority}</strong>
          </div>

          <div className="ticket-meta-item">
            <span>
              <UserCheck size={15} />
              Assigned To
            </span>

            <strong>{ticket.assigned_name || "Unassigned"}</strong>
          </div>

          <div className="ticket-meta-item">
            <span>Status</span>

            <StatusBadge status={ticket.status} />
          </div>
        </div>

        <h4 className="ticket-section-title">Assignment</h4>

        <AssignDropdown ticket={ticket} onAssigned={onAssigned} />

        <h4 className="ticket-section-title">Ticket Management</h4>

        <TicketManagement ticket={ticket} onUpdated={onUpdated} />

        <hr className="ticket-divider" />
      </div>
    </div>
  );
}
