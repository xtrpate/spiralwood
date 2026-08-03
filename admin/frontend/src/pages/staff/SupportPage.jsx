import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import posSupportService from "../../services/posSupportService";

import TicketList from "../../components/support/TicketList";
import TicketDetails from "../../components/staff/support/TicketDetails";

import "../support/SupportPage.css";

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);

  const [selectedTicket, setSelectedTicket] = useState(null);

  const [messages, setMessages] = useState([]);

  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    const ticketId = searchParams.get("ticket");

    if (!ticketId || tickets.length === 0) {
      return;
    }

    const ticket = tickets.find((t) => t.id === Number(ticketId));

    if (!ticket) {
      return;
    }

    openTicket(ticket.id);

    setSearchParams({}, { replace: true });
  }, [tickets]);

  const loadTickets = async () => {
    try {
      setLoading(true);

      const data = await posSupportService.getTickets();

      setTickets(data);
    } finally {
      setLoading(false);
    }
  };

  const openTicket = async (ticketId) => {
    try {
      const data = await posSupportService.getTicket(ticketId);

      setSelectedTicket(data.ticket);

      setMessages(data.messages || []);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="support-page">
      <div className="support-header">
        <div>
          <span className="support-label">CUSTOMER SERVICE</span>

          <h1>My Assigned Tickets</h1>

          <p>View and respond to support tickets assigned to you.</p>
        </div>
      </div>

      <div className="support-content">
        <TicketList
          tickets={tickets}
          loading={loading}
          selectedTicket={selectedTicket}
          onSelect={openTicket}
        />

        <TicketDetails
          ticket={selectedTicket}
          messages={messages}
          onReplySent={() => openTicket(selectedTicket.id)}
          onUpdated={() => openTicket(selectedTicket.id)}
        />
      </div>
    </div>
  );
}
