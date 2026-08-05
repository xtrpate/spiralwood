const STATUS_CONFIG = {
  open: {
    className: "support-badge-open",
    label: "Open",
  },
  assigned: {
    className: "support-badge-assigned",
    label: "Assigned",
  },
  in_progress: {
    className: "support-badge-progress",
    label: "In Progress",
  },
  awaiting_customer: {
    className: "support-badge-awaiting",
    label: "Awaiting Customer",
  },
  resolved: {
    className: "support-badge-resolved",
    label: "Resolved",
  },
  closed: {
    className: "support-badge-closed",
    label: "Closed",
  },
};

export default function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();

  const config = STATUS_CONFIG[normalized] || {
    className: "support-badge-open",
    label: status || "Open",
  };

  return (
    <span className={`support-badge ${config.className}`}>{config.label}</span>
  );
}
