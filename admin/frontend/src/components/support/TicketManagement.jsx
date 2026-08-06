import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import adminSupportService from "../../services/adminSupportService";

export default function TicketManagement({ ticket, onUpdated }) {
  const [status, setStatus] = useState("");

  const [priority, setPriority] = useState("");

  const [resolutionNote, setResolutionNote] = useState("");

  const [saving, setSaving] = useState(false);

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

  return (
    <div className="ticket-management">
      <h3>Ticket Management</h3>

      <label>Status</label>

      <select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="open">Open</option>
        <option value="assigned">Assigned</option>
        <option value="in_progress">In Progress</option>
        <option value="awaiting_customer">Awaiting Customer</option>
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

      <label>Add Note (Optional)</label>

      <textarea
        value={resolutionNote}
        onChange={(e) => setResolutionNote(e.target.value)}
        placeholder="Type here"
      />

      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
