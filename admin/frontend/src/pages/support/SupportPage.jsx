import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  CircleCheckBig,
  CircleDot,
  Clock3,
  RefreshCw,
  UserCheck,
} from "lucide-react";

import adminSupportService from "../../services/adminSupportService";
import "./SupportPage.css";
import FilterBar from "../../components/support/FilterBar";
import TicketList from "../../components/support/TicketList";
import TicketDetails from "../../components/support/TicketDetails";
import SummaryCard from "../../components/support/SummaryCard";
import TicketConversation from "../../components/support/TicketConversation";

export default function SupportPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

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

    const ticket = tickets.find((item) => item.id === ticketId);
    if (!ticket) return;

    openTicket(ticket.id);
  }, [tickets, location.search]);

  const refreshSelectedTicket = async () => {
    if (!selectedTicket) return;

    const data = await adminSupportService.getTicket(selectedTicket.id);

    setSelectedTicket(data.ticket);
    setMessages(data.messages || []);

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

    const search = filters.search.trim().toLowerCase();

    const matchesSearch =
      !search ||
      String(ticket.subject || "").toLowerCase().includes(search) ||
      String(ticket.customer_name || "").toLowerCase().includes(search) ||
      String(ticket.order_number || "").toLowerCase().includes(search);

    return matchesStatus && matchesCategory && matchesPriority && matchesSearch;
  });

  const summary = {
    open: tickets.filter((ticket) => ticket.status === "open").length,
    assigned: tickets.filter((ticket) =>
      ["assigned", "in_progress"].includes(ticket.status),
    ).length,
    awaiting: tickets.filter(
      (ticket) => ticket.status === "awaiting_customer",
    ).length,
    resolved: tickets.filter((ticket) =>
      ["resolved", "closed"].includes(ticket.status),
    ).length,
  };

  return (
    <div className="support-page admin-support-page">
      {/* WISDOM ADMIN SUPPORT UI POLISH V1 */}
      {/* WISDOM ADMIN SUPPORT VISUAL POLISH V1.1 */}
      <header className="support-header admin-support-header">
        <div>
          <h1>Support Management</h1>
          <p>
            Review customer requests, assignments, status, and conversations.
          </p>
        </div>

        <button
          type="button"
          className="support-refresh-btn admin-support-refresh-btn"
          onClick={loadTickets}
          disabled={loading}
        >
          <RefreshCw size={14} strokeWidth={1.9} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section className="support-summary-grid admin-support-summary-grid">
        <SummaryCard
          title="Open"
          value={summary.open}
          tone="open"
          icon={<CircleDot size={17} strokeWidth={1.9} />}
        />
        <SummaryCard
          title="Assigned"
          value={summary.assigned}
          tone="assigned"
          icon={<UserCheck size={17} strokeWidth={1.9} />}
        />
        <SummaryCard
          title="Waiting for Customer"
          value={summary.awaiting}
          tone="waiting"
          icon={<Clock3 size={17} strokeWidth={1.9} />}
        />
        <SummaryCard
          title="Resolved"
          value={summary.resolved}
          tone="resolved"
          icon={<CircleCheckBig size={17} strokeWidth={1.9} />}
        />
      </section>

      <section className="admin-support-workspace">
        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          total={tickets.length}
          filtered={filteredTickets.length}
          variant="admin"
          onClear={clearFilters}
        />

        <div className="support-content admin-support-content">
          <TicketList
            tickets={filteredTickets}
            loading={loading}
            selectedTicket={selectedTicket}
            onSelect={openTicket}
            onClearFilters={clearFilters}
            title="Support Tickets"
            emptyTitle="No tickets found"
            emptyText="No support tickets match the current filters."
            clearLabel="Reset Filters"
            variant="admin"
          />

          <div className="support-right-panel admin-support-right-panel">
            {activeTab === "details" && (
              <TicketDetails
                ticket={selectedTicket}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onAssigned={refreshSelectedTicket}
                onUpdated={refreshSelectedTicket}
                variant="admin"
              />
            )}

            {activeTab === "conversation" && (
              <TicketConversation
                ticket={selectedTicket}
                messages={messages}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onReplySent={refreshSelectedTicket}
                variant="admin"
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
