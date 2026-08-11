import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import adminSupportService from "../../services/adminSupportService";

export default function TicketManagement({
  ticket,
  onUpdated,
  variant = "default",
}) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [saving, setSaving] = useState(false);

  const adminMode = variant === "admin";

  useEffect(() => {
    if (!ticket) return;

    setStatus(ticket.status);
    setPriority(ticket.priority);
    setResolutionNote(ticket.resolution_note || "");
  }, [ticket]);

  const handleSave = async () => {
    if (!ticket) return;

    try {
      setSaving(true);

      await adminSupportService.updateStatus(ticket.id, {
        status,
        priority,
        resolution_note: resolutionNote,
      });

      toast.success("Ticket updated successfully.");

      if (onUpdated) {
        onUpdated();
      }
    } catch (err) {
      toast.error("Failed to update ticket.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (adminMode) {
    return (
      <div className="ticket-management admin-ticket-management">
        <div className="admin-ticket-management-grid">
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="awaiting_customer">Waiting for Customer</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </label>

          <label>
            <span>Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        </div>

        <label className="admin-resolution-note">
          <span>Resolution Note</span>
          <textarea
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            placeholder="Add a note if needed."
          />
        </label>

        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    );
  }

  return (
    <div className="ticket-management">
      <h3>Ticket Management</h3>

      <label>Status</label>
      <select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="open">Open</option>
        <option value="assigned">Assigned</option>
        <option value="in_progress">In Progress</option>
        <option value="awaiting_customer">Waiting for Customer</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>

      <label>Priority</label>
      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      <label>Resolution Note</label>
      <textarea
        value={resolutionNote}
        onChange={(e) => setResolutionNote(e.target.value)}
        placeholder="Add a note if needed."
      />

      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
