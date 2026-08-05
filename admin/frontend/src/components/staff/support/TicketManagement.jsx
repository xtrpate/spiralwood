import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import posSupportService from "../../../services/posSupportService";

export default function TicketManagement({ ticket, onUpdated }) {
  const [status, setStatus] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ticket) return;

    setStatus(ticket.status);
  }, [ticket]);

  const handleSave = async () => {
    if (!ticket) return;

    try {
      setSaving(true);

      await posSupportService.updateStatus(ticket.id, {
        status,
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
        <option value="assigned">Assigned</option>
        <option value="awaiting_customer">Awaiting Customer</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>

      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
