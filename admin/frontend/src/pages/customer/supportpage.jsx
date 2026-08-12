import { useEffect, useMemo, useState } from "react";
import { LifeBuoy, Clock, CheckCircle, Plus, Ticket } from "lucide-react";
import { useLocation } from "react-router-dom";

import "./supportpage.css";

import supportService from "../../services/supportService";

import TicketCard from "../../components/customer/support/TicketCard";
import NewTicketForm from "../../components/customer/support/NewTicketForm";
import Conversation from "../../components/customer/support/Conversation";

const SummaryCard = ({ label, value, subtitle }) => (
  <div className="support-summary-card">
    <div className="support-summary-label">{label}</div>
    <div className="support-summary-value">{value}</div>
    <div className="support-summary-subtitle">{subtitle}</div>
  </div>
);

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);

  const [selectedTicket, setSelectedTicket] = useState(null);

  const [messages, setMessages] = useState([]);

  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);

  const location = useLocation();

  const [statusFilter, setStatusFilter] = useState("all");

  const filteredTickets = useMemo(() => {
    if (statusFilter === "all") {
      return tickets.filter((t) => t.status !== "closed");
    }
    return tickets.filter((t) => t.status === statusFilter);
  }, [tickets, statusFilter]);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      setLoading(true);

      const data = await supportService.getTickets();

      setTickets(Array.isArray(data) ? data : []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === "open").length,
      awaiting: tickets.filter((t) => t.status === "awaiting_customer").length,
      resolved: tickets.filter(
        (t) => t.status === "resolved" || t.status === "closed",
      ).length,
    };
  }, [tickets]);

  const openTicket = async (ticketId) => {
    try {
      const data = await supportService.getTicket(ticketId);

      setSelectedTicket(data.ticket);

      setMessages(data.messages);
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => {
    if (!tickets.length) return;

    const params = new URLSearchParams(location.search);

    const ticketId = Number(params.get("ticket"));

    if (!ticketId) return;

    const ticket = tickets.find((t) => t.id === ticketId);

    if (!ticket) return;

    openTicket(ticket.id);
  }, [tickets, location.search]);

  return (
    <div className="support-page">
      <div className="support-shell">
        <section className="support-page-head">
          <div className="support-page-copy">
            <div className="support-header-top">
              <div>
                <h1>Customer Support</h1>

                <p>
                  Get help with an order, blueprint, payment, or another
                  concern. Create a support ticket and continue the conversation
                  with our team in one place.
                </p>
              </div>

              <button
                className="support-open-btn"
                onClick={() => setShowForm(!showForm)}
              >
                <Plus size={18} />

                {showForm ? "Cancel" : "New support ticket"}
              </button>
            </div>
          </div>
        </section>

        <section className="support-summary-grid">
          {loading ? (
            <>
              <div className="support-summary-card support-summary-skeleton">
                <div className="support-skeleton-line support-summary-skeleton-label" />
                <div className="support-skeleton-line support-summary-skeleton-value" />
                <div className="support-skeleton-line support-summary-skeleton-subtitle" />
              </div>

              <div className="support-summary-card support-summary-skeleton">
                <div className="support-skeleton-line support-summary-skeleton-label" />
                <div className="support-skeleton-line support-summary-skeleton-value" />
                <div className="support-skeleton-line support-summary-skeleton-subtitle" />
              </div>

              <div className="support-summary-card support-summary-skeleton">
                <div className="support-skeleton-line support-summary-skeleton-label" />
                <div className="support-skeleton-line support-summary-skeleton-value" />
                <div className="support-skeleton-line support-summary-skeleton-subtitle" />
              </div>
            </>
          ) : (
            <>
              <SummaryCard
                label="Open"
                value={stats.open}
                subtitle="Active requests"
              />

              <SummaryCard
                label="Waiting for you"
                value={stats.awaiting}
                subtitle="Needs your reply"
              />

              <SummaryCard
                label="Resolved"
                value={stats.resolved}
                subtitle="Finished requests"
              />
            </>
          )}
        </section>

        {showForm && (
          <section className="support-create-ticket">
            <NewTicketForm
              onCreated={async () => {
                setShowForm(false);

                await loadTickets();
              }}
            />
          </section>
        )}

        <section
          className={`support-main-grid support-main-grid-v2 ${
            !loading && tickets.length === 0 ? "is-empty" : ""
          }`}
        >
          <aside className="support-ticket-list">
            <div
              className="support-ticket-head"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>
                Your support tickets
                {tickets.length > 0 ? ` (${tickets.length})` : ""}
              </h2>
              {tickets.length > 0 && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    fontSize: "12px",
                    fontWeight: "600",
                    border: "1px solid #dedede",
                    background: "#ffffff",
                    color: "#111111",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Tickets</option>
                  <option value="open">Open</option>
                  <option value="awaiting_customer">Needs Reply</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              )}
            </div>

            {loading ? (
              <div className="support-ticket-skeleton-list">
                {[1, 2, 3].map((i) => (
                  <div className="support-ticket-skeleton-card" key={i}>
                    <div className="support-skeleton-line support-skeleton-subject" />

                    <div className="support-skeleton-line support-skeleton-category" />

                    <div className="support-skeleton-footer-row">
                      <div className="support-skeleton-line support-skeleton-date" />
                      <div className="support-skeleton-badge" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div className="support-empty">
                <Ticket size={56} strokeWidth={1.5} color="#71717a" />

                <h3>No support tickets yet</h3>

                <p>
                  If you need help with an order, blueprint, payment, or another
                  concern, create a ticket and our team will assist you.
                </p>

                <button
                  type="button"
                  className="support-empty-action-v2"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={16} />
                  Create support ticket
                </button>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="support-empty" style={{ padding: "40px 20px" }}>
                <Ticket size={36} strokeWidth={1.5} color="#71717a" />
                <h3>No tickets found</h3>
                <p>
                  {statusFilter === "all"
                    ? "You have no tickets."
                    : "You have no tickets with this status."}
                </p>
              </div>
            ) : (
              <div className="support-ticket-scroll">
                {filteredTickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    active={selectedTicket?.id === ticket.id}
                    onClick={async (selected) => {
                      await openTicket(selected.id);
                    }}
                  />
                ))}
              </div>
            )}
          </aside>

          <section className="support-conversation-section">
            {loading ? (
              <div className="support-conversation-skeleton">
                <div className="support-conversation-skeleton-header">
                  <div>
                    <div className="support-skeleton-line support-skeleton-title" />
                    <div className="support-skeleton-line support-skeleton-meta" />
                  </div>

                  <div className="support-skeleton-button" />
                </div>

                <div className="support-conversation-skeleton-body">
                  <div className="support-skeleton-message support-message-left">
                    <div className="support-skeleton-avatar" />
                    <div className="support-skeleton-message-content">
                      <div className="support-skeleton-line support-skeleton-name" />
                      <div className="support-skeleton-bubble support-bubble-small" />
                    </div>
                  </div>

                  <div className="support-skeleton-message support-message-right">
                    <div className="support-skeleton-message-content">
                      <div className="support-skeleton-line support-skeleton-name support-name-right" />
                      <div className="support-skeleton-bubble support-bubble-large" />
                    </div>
                    <div className="support-skeleton-avatar" />
                  </div>

                  <div className="support-skeleton-message support-message-left">
                    <div className="support-skeleton-avatar" />
                    <div className="support-skeleton-message-content">
                      <div className="support-skeleton-line support-skeleton-name" />
                      <div className="support-skeleton-bubble support-bubble-medium" />
                    </div>
                  </div>
                </div>

                <div className="support-reply-skeleton">
                  <div className="support-skeleton-reply-input" />
                  <div className="support-skeleton-send-button" />
                </div>
              </div>
            ) : (
              <Conversation
                ticket={selectedTicket}
                messages={messages}
                onReply={async (reply) => {
                  if (!selectedTicket) return;

                  await supportService.reply(selectedTicket.id, reply);

                  const data = await supportService.getTicket(
                    selectedTicket.id,
                  );

                  setSelectedTicket(data.ticket);
                  setMessages(data.messages);

                  await loadTickets();
                }}
                onClose={async () => {
                  if (!selectedTicket) return;

                  await supportService.close(selectedTicket.id);

                  const data = await supportService.getTicket(
                    selectedTicket.id,
                  );

                  setSelectedTicket(data.ticket);
                  setMessages(data.messages);

                  await loadTickets();
                }}
              />
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
