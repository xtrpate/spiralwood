const statusColors = {
  open: "#2563eb",
  assigned: "#7c3aed",
  in_progress: "#f59e0b",
  awaiting_customer: "#ea580c",
  resolved: "#16a34a",
  closed: "#6b7280",
};

export default function StatusBadge({ status }) {
  return (
    <span
      className="support-status-badge"
      style={{
        backgroundColor: statusColors[status] || "#6b7280",
      }}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
