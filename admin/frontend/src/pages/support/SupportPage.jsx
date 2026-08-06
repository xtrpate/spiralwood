import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import adminSupportService from "../../services/adminSupportService";
import "./SupportPage.css";
import FilterBar from "../../components/support/FilterBar";
import TicketList from "../../components/support/TicketList";
import TicketDetails from "../../components/support/TicketDetails";
import SummaryCard from "../../components/support/SummaryCard";
import TicketConversation from "../../components/support/TicketConversation";

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [activeTab, setActiveTab] = useState("details");

  const [messages, setMessages] = useState([]);

  const [filters, setFilters] = useState({
    status: "",
    category: "",
    priority: "",
    search: "",
  });

  const [loading, setLoading] = useState(true);
  const location = useLocation();

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

  const clearFilters = () => {
    setFilters({
      status: "",
      category: "",
      priority: "",
      search: "",
    });
  };

  const openTicket = async (ticketId) => {
    try {
      const data = await adminSupportService.getTicket(ticketId);

      console.log("Ticket API Response:", data.messages);

      setSelectedTicket(data.ticket);
      setActiveTab("details");

      setMessages(data.messages || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    document.title = "Support Management";

    loadTickets();
  }, []);

  useEffect(() => {
    if (!tickets.length) return;

    const params = new URLSearchParams(location.search);

    const ticketId = Number(params.get("ticket"));

    if (!ticketId) return;

    const ticket = tickets.find((t) => t.id === ticketId);

    if (!ticket) return;

    openTicket(ticket.id);
  }, [tickets, location.search]);

  const refreshSelectedTicket = async () => {
    if (!selectedTicket) return;

    const data = await adminSupportService.getTicket(selectedTicket.id);

    setSelectedTicket(data.ticket);
    setMessages(data.messages);

    await loadTickets();
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesStatus = filters.status
      ? ticket.status === filters.status
      : ticket.status !== "closed";

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

  const summary = {
    open: tickets.filter((t) => t.status === "open").length,

    assigned: tickets.filter((t) => t.status === "assigned").length,

    awaiting: tickets.filter((t) => t.status === "awaiting_customer").length,

    resolved: tickets.filter(
      (t) => t.status === "resolved" || t.status === "closed",
    ).length,
  };

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

      <section className="support-summary-grid">
        <SummaryCard title="Open" value={summary.open} />

        <SummaryCard title="Assigned" value={summary.assigned} />

        <SummaryCard title="Awaiting" value={summary.awaiting} />

        <SummaryCard title="Resolved" value={summary.resolved} />
      </section>

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
          onClearFilters={clearFilters}
        />

        <div className="support-right-panel">
          {activeTab === "details" && (
            <TicketDetails
              ticket={selectedTicket}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onAssigned={refreshSelectedTicket}
              onUpdated={refreshSelectedTicket}
            />
          )}

          {activeTab === "conversation" && (
            <TicketConversation
              ticket={selectedTicket}
              messages={messages}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onReplySent={refreshSelectedTicket}
            />
          )}
        </div>
      </div>
    </div>
  );
}
