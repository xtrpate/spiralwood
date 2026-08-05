import TicketItem from "./TicketItem";
import SkeletonTicket from "./SkeletonTicket";

export default function TicketList({
  tickets,
  loading,
  selectedTicket,
  onSelect,
  onClearFilters,
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

          <h3>No Support Tickets</h3>

          <p>There are currently no support tickets matching your filters.</p>

          <button className="support-clear-filter-btn" onClick={onClearFilters}>
            Clear Filters
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="support-ticket-list">
      <h3>Support Tickets</h3>

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
