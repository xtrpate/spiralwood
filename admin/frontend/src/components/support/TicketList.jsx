import TicketItem from "./TicketItem";

export default function TicketList({
  tickets,
  loading,
  selectedTicket,
  onSelect,
}) {
  if (loading) {
    return <div className="support-ticket-list">Loading tickets...</div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="support-ticket-list">
        <h3>No Tickets</h3>

        <p>No customer support tickets found.</p>
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
