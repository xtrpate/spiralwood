import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import adminSupportService from "../../services/adminSupportService";

export default function AssignDropdown({ ticket, onAssigned }) {
  const [users, setUsers] = useState([]);

  const [selectedUser, setSelectedUser] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (ticket?.assigned_to) {
      setSelectedUser(ticket.assigned_to);
    } else {
      setSelectedUser("");
    }
  }, [ticket]);

  const loadUsers = async () => {
    try {
      const data = await adminSupportService.getAssignableUsers();

      setUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssign = async () => {
    if (!ticket || !selectedUser) return;

    try {
      setLoading(true);

      await adminSupportService.assignTicket(ticket.id, selectedUser);

      if (onAssigned) {
        onAssigned();
        toast.success("Ticket assigned successfully.");
      }
    } catch (err) {
      toast.error("Failed to assign ticket.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="assign-dropdown">
      <label>Assign To</label>

      <select
        value={selectedUser}
        onChange={(e) => setSelectedUser(e.target.value)}
      >
        <option value="">-- Select User --</option>

        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.role})
          </option>
        ))}
      </select>

      <button onClick={handleAssign} disabled={!selectedUser || loading}>
        {loading ? "Assigning..." : "Assign Ticket"}
      </button>
    </div>
  );
}
