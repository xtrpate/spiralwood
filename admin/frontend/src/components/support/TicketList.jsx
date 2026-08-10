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
}) {
  if (loading) {
    return (
      <div className="support-ticket-list">
        <SkeletonTicket />

        <SkeletonTicket />

        <SkeletonTicket />

        <SkeletonTicket />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="support-ticket-list">
        <div className="support-empty-state">
          <div className="support-empty-icon">🛟</div>

          <h3>{emptyTitle}</h3>

          <p>{emptyText}</p>

          <button className="support-clear-filter-btn" onClick={onClearFilters}>
            {clearLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="support-ticket-list">
      <h3>{title}</h3>

      {tickets.map((ticket) => (
        <TicketItem
          key={ticket.id}
          ticket={ticket}
          active={selectedTicket?.id === ticket.id}
          onClick={() => onSelect(ticket.id)}
        />
      ))}
    </div>
  );
}
