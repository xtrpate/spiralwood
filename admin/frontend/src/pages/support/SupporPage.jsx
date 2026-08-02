import { useEffect, useState } from "react";

import adminSupportService from "../../services/adminSupportService";

import "./SupportPage.css";

import FilterBar from "../../components/support/FilterBar";
import TicketList from "../../components/support/TicketList";
import TicketDetails from "../../components/support/TicketDetails";

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const [messages, setMessages] = useState([]);

  const [filters, setFilters] = useState({
    status: "",
    category: "",
    priority: "",
    search: "",
  });

  const [loading, setLoading] = useState(true);

  const loadTickets = async () => {
    try {
      setLoading(true);

      const data = await adminSupportService.getTickets();

      setTickets(data.tickets || []);
    } catch (err) {
      console.error(err);

      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const openTicket = async (ticketId) => {
    try {
      const data = await adminSupportService.getTicket(ticketId);

      setSelectedTicket(data.ticket);

      setMessages(data.messages || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    document.title = "Support Management";

    loadTickets();
  }, []);

  const refreshSelectedTicket = async () => {
    if (!selectedTicket) return;

    const data = await adminSupportService.getTicket(selectedTicket.id);

    setSelectedTicket(data.ticket);
    setMessages(data.messages);

    await loadTickets();
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesStatus = !filters.status || ticket.status === filters.status;

    const matchesCategory =
      !filters.category || ticket.category === filters.category;

    const matchesPriority =
      !filters.priority || ticket.priority === filters.priority;

    const search = filters.search.toLowerCase();

    const matchesSearch =
      !search ||
      ticket.subject.toLowerCase().includes(search) ||
      ticket.customer_name.toLowerCase().includes(search);

    return matchesStatus && matchesCategory && matchesPriority && matchesSearch;
  });

  return (
    <div className="support-page">
      <div className="support-header">
        <div>
          <span className="support-label">CUSTOMER SERVICE</span>

          <h1>Support Management</h1>

          <p>Manage customer support tickets, assignments and conversations.</p>
        </div>

        <button className="support-refresh-btn" onClick={loadTickets}>
          Refresh
        </button>
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        total={tickets.length}
        filtered={filteredTickets.length}
      />

      <div className="support-content">
        <TicketList
          tickets={filteredTickets}
          loading={loading}
          selectedTicket={selectedTicket}
          onSelect={openTicket}
        />

        <TicketDetails
          ticket={selectedTicket}
          messages={messages}
          onAssigned={refreshSelectedTicket}
          onReplySent={refreshSelectedTicket}
          onUpdated={refreshSelectedTicket}
        />
      </div>
    </div>
  );
}
