import TicketItem from "./TicketItem";
import SkeletonTicket from "./SkeletonTicket";

export default function TicketList({
  tickets,
  loading,
  selectedTicket,
  onSelect,
  onClearFilters,
  title = "Support Tickets",
  emptyTitle = "No Support Tickets",
  emptyText = "There are currently no support tickets matching your filters.",
  clearLabel = "Clear Filters",
  variant = "default",
}) {
  if (loading) {
    return (
      <div className={`support-ticket-list ${variant === "admin" ? "admin-support-ticket-list" : ""}`}>
        <SkeletonTicket />
        <SkeletonTicket />
        <SkeletonTicket />
        <SkeletonTicket />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className={`support-ticket-list ${variant === "admin" ? "admin-support-ticket-list" : ""}`}>
        <div className="support-empty-state">
          <h3>{emptyTitle}</h3>
          <p>{emptyText}</p>

          <button
            type="button"
            className="support-clear-filter-btn"
            onClick={onClearFilters}
          >
            {clearLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`support-ticket-list ${variant === "admin" ? "admin-support-ticket-list" : ""}`}>
      <div className="admin-support-ticket-list-head">
        <h3>{title}</h3>
        {variant === "admin" && <span>{tickets.length} visible</span>}
      </div>

      {tickets.map((ticket) => (
        <TicketItem
          key={ticket.id}
          ticket={ticket}
          active={selectedTicket?.id === ticket.id}
          onClick={() => onSelect(ticket.id)}
          variant={variant}
        />
      ))}
    </div>
  );
}
