import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import adminSupportService from "../../services/adminSupportService";

export default function AssignDropdown({
  ticket,
  onAssigned,
  variant = "default",
}) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [loading, setLoading] = useState(false);

  const adminMode = variant === "admin";

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

  const cashierUsers = users.filter(
    (user) =>
      String(user.role || "").toLowerCase() === "staff" &&
      String(user.staff_type || "").toLowerCase() === "cashier",
  );

  return (
    <div className={`assign-dropdown ${adminMode ? "admin-assign-dropdown" : ""}`}>
      <label>{adminMode ? "Assigned Staff" : "Assign To"}</label>

      <div className={adminMode ? "admin-assign-row" : ""}>
        <select
          value={selectedUser}
          onChange={(event) => setSelectedUser(event.target.value)}
        >
          <option value="">
            {adminMode ? "Select cashier" : "-- Select User --"}
          </option>

          {cashierUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {adminMode ? user.name : `${user.name} (${user.role})`}
            </option>
          ))}
        </select>

        <button onClick={handleAssign} disabled={!selectedUser || loading}>
          {loading ? "Assigning..." : adminMode ? "Assign" : "Assign Ticket"}
        </button>
      </div>
    </div>
  );
}
