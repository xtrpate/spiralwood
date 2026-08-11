const statusColors = {
  open: "#2563eb",
  assigned: "#52525b",
  in_progress: "#a16207",
  awaiting_customer: "#c2410c",
  resolved: "#2f7d4a",
  closed: "#71717a",
};

const statusLabels = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  awaiting_customer: "Waiting for Customer",
  resolved: "Resolved",
  closed: "Closed",
};

export default function StatusBadge({ status, compact = false }) {
  return (
    <span
      className={`support-status-badge support-status-${status}${compact ? " is-compact" : ""}`}
      style={{
        "--support-status-color": statusColors[status] || "#71717a",
      }}
    >
      <i aria-hidden="true" />
      {statusLabels[status] || String(status || "").replaceAll("_", " ")}
    </span>
  );
}
