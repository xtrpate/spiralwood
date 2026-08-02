import { Search } from "lucide-react";

export default function FilterBar({ filters, onChange, total, filtered }) {
  return (
    <div className="support-filter-bar">
      <select
        value={filters.status}
        onChange={(e) => onChange("status", e.target.value)}
      >
        <option value="">All Status</option>
        <option value="open">Open</option>
        <option value="assigned">Assigned</option>
        <option value="in_progress">In Progress</option>
        <option value="awaiting_customer">Awaiting Customer</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>

      <select
        value={filters.category}
        onChange={(e) => onChange("category", e.target.value)}
      >
        <option value="">All Categories</option>
        <option value="inquiry">Inquiry</option>
        <option value="complaint">Complaint</option>
        <option value="order_assistance">Order Assistance</option>
        <option value="blueprint_support">Blueprint Support</option>
        <option value="other">Other</option>
      </select>

      <select
        value={filters.priority}
        onChange={(e) => onChange("priority", e.target.value)}
      >
        <option value="">All Priority</option>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      <div className="support-search">
        <Search size={18} />

        <input
          placeholder="Search tickets..."
          value={filters.search}
          onChange={(e) => onChange("search", e.target.value)}
        />
      </div>

      <div className="support-filter-count">
        Showing {filtered} of {total} tickets
      </div>
    </div>
  );
}
