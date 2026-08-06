import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import posSupportService from "../../services/posSupportService";

const SummaryCard = ({ title, value, subtitle }) => (
  <div className="support-summary-card">
    <span>{subtitle}</span>
    <h2>{value}</h2>
    <p>{title}</p>
  </div>
);

import TicketList from "../../components/support/TicketList";
import TicketDetails from "../../components/staff/support/TicketDetails";
import TicketConversation from "../../components/staff/support/TicketConversation";
import FilterBar from "../../components/support/FilterBar";

import "../support/SupportPage.css";

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState("details");

  const [filters, setFilters] = useState({
    status: "",
    category: "",
    priority: "",
    search: "",
  });

  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  const stats = useMemo(() => {
    return {
      active: tickets.filter((t) =>
        ["open", "assigned", "in_progress"].includes(t.status),
      ).length,
      awaiting: tickets.filter((t) => t.status === "awaiting_customer").length,
      resolved: tickets.filter((t) => ["resolved", "closed"].includes(t.status))
        .length,
      total: tickets.length,
    };
  }, [tickets]);

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

  const openTicket = async (ticketId, preserveTab = false) => {
    try {
      const data = await posSupportService.getTicket(ticketId);

      setSelectedTicket(data.ticket);
      if (!preserveTab) {
        setActiveTab("details");
      }
      setMessages(data.messages || []);

      // Silently sync the updated ticket data into the sidebar list
      setTickets((prevTickets) =>
        prevTickets.map((t) =>
          t.id === ticketId ? { ...t, ...data.ticket } : t,
        ),
      );
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

      <div className="support-summary-grid">
        <SummaryCard
          title="Action Required"
          value={stats.active}
          subtitle="Your Active Queue"
        />
        <SummaryCard
          title="Awaiting Reply"
          value={stats.awaiting}
          subtitle="Waiting on Customer"
        />
        <SummaryCard
          title="Resolved"
          value={stats.resolved}
          subtitle="Completed Tasks"
        />
        <SummaryCard
          title="Total Assigned"
          value={stats.total}
          subtitle="All-Time Tickets"
        />
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        total={tickets.length}
        filtered={tickets.length}
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
          <div className="support-right-panel">
            {activeTab === "details" && (
              <TicketDetails
                ticket={selectedTicket}
                onUpdated={() => openTicket(selectedTicket.id, true)}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === "conversation" && (
              <TicketConversation
                ticket={selectedTicket}
                messages={messages}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onReplySent={() => openTicket(selectedTicket.id, true)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
