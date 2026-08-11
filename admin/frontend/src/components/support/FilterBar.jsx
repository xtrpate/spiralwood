import { Search } from "lucide-react";

export default function FilterBar({
  filters,
  onChange,
  total,
  filtered,
  variant = "default",
  onClear,
}) {
  const staffMode = variant === "staff";
  const adminMode = variant === "admin";

  if (adminMode) {
    const hasFilters = Boolean(
      filters.status ||
        filters.category ||
        filters.priority ||
        String(filters.search || "").trim(),
    );

    return (
      <div className="support-filter-bar admin-support-filter-bar">
        <label className="admin-support-filter-field">
          <span>Search</span>
          <div className="support-search admin-support-search">
            <Search size={15} strokeWidth={1.8} />
            <input
              placeholder="Search subject, customer, or order..."
              value={filters.search}
              onChange={(event) => onChange("search", event.target.value)}
            />
          </div>
        </label>

        <label className="admin-support-filter-field">
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => onChange("status", event.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="awaiting_customer">Waiting for Customer</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        <label className="admin-support-filter-field">
          <span>Category</span>
          <select
            value={filters.category}
            onChange={(event) => onChange("category", event.target.value)}
          >
            <option value="">All Categories</option>
            <option value="inquiry">Inquiry</option>
            <option value="complaint">Complaint</option>
            <option value="order_assistance">Order Assistance</option>
            <option value="blueprint_support">Blueprint Support</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="admin-support-filter-field">
          <span>Priority</span>
          <select
            value={filters.priority}
            onChange={(event) => onChange("priority", event.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>

        <div className="admin-support-filter-result">
          <span>
            {filtered} of {total} tickets
          </span>

          {hasFilters && (
            <button type="button" onClick={onClear}>
              Reset Filters
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="support-filter-bar">
      <select
        value={filters.status}
        onChange={(e) => onChange("status", e.target.value)}
      >
        <option value="">{staffMode ? "All statuses" : "All Statuses"}</option>
        <option value="open">Open</option>
        <option value="assigned">Assigned</option>
        <option value="in_progress">In Progress</option>
        <option value="awaiting_customer">
          {staffMode ? "Waiting for Customer" : "Waiting for Customer"}
        </option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>

      <select
        value={filters.category}
        onChange={(e) => onChange("category", e.target.value)}
      >
        <option value="">
          {staffMode ? "All categories" : "All Categories"}
        </option>
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
        <option value="">
          {staffMode ? "All priorities" : "All Priorities"}
        </option>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      <div className="support-search">
        <Search size={18} />

        <input
          placeholder={staffMode ? "Search tickets" : "Search tickets..."}
          value={filters.search}
          onChange={(e) => onChange("search", e.target.value)}
        />
      </div>

      <div className="support-filter-count">
        {staffMode
          ? `${filtered} of ${total} tickets`
          : `Showing ${filtered} of ${total} tickets`}
      </div>
    </div>
  );
}
