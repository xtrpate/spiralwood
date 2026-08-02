import { useEffect, useMemo, useState } from "react";
import { LifeBuoy, Clock, CheckCircle, Plus } from "lucide-react";

import "./supportpage.css";

import supportService from "../../services/supportService";

import TicketCard from "../../components/customer/support/TicketCard";
import NewTicketForm from "../../components/customer/support/NewTicketForm";
import Conversation from "../../components/customer/support/Conversation";

const SummaryCard = ({ label, value }) => (
  <div className="support-summary-card">
    <div className="support-summary-label">{label}</div>
    <div className="support-summary-value">{value}</div>
  </div>
);

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);

  const [selectedTicket, setSelectedTicket] = useState(null);

  const [messages, setMessages] = useState([]);

  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);

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

  return (
    <div className="support-page">
      <div className="support-shell">
        <section className="support-page-head">
          <div className="support-page-copy">
            <div className="support-header-top">
              <div>
                <h1>Customer Support</h1>

                <p>
                  Need assistance with your order, blueprint, or another
                  concern? Create a support ticket and communicate directly with
                  our team.
                </p>
              </div>

              <button
                className="support-open-btn"
                onClick={() => setShowForm(!showForm)}
              >
                <Plus size={18} />

                {showForm ? "Cancel" : "New Support Ticket"}
              </button>
            </div>
          </div>
        </section>

        <section className="support-summary-grid">
          <SummaryCard label="Open" value={stats.open} />

          <SummaryCard label="Awaiting" value={stats.awaiting} />

          <SummaryCard label="Resolved" value={stats.resolved} />

          <SummaryCard label="Total Tickets" value={stats.total} />
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

        <section className="support-main-grid">
          <aside className="support-ticket-list">
            <div className="support-ticket-head">
              <h2>My Support Tickets</h2>

              <span>{tickets.length}</span>
            </div>

            {loading ? (
              <div className="support-loading">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="support-empty">
                <LifeBuoy size={42} />

                <h3>No Support Tickets</h3>

                <p>You haven't created any support tickets yet.</p>
              </div>
            ) : (
              <div className="support-ticket-scroll">
                {tickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    active={selectedTicket?.id === ticket.id}
                    onClick={async (selected) => {
                      setSelectedTicket(selected);

                      try {
                        const data = await supportService.getTicket(
                          selected.id,
                        );

                        setSelectedTicket(data.ticket);

                        setMessages(data.messages);
                      } catch {
                        setMessages([]);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </aside>
          <section className="support-conversation-section">
            <Conversation
              ticket={selectedTicket}
              messages={messages}
              onReply={async (reply) => {
                if (!selectedTicket) return;

                await supportService.reply(selectedTicket.id, reply);

                const data = await supportService.getTicket(selectedTicket.id);

                setSelectedTicket(data.ticket);
                setMessages(data.messages);

                await loadTickets();
              }}
              onClose={async () => {
                if (!selectedTicket) return;

                await supportService.close(selectedTicket.id);

                const data = await supportService.getTicket(selectedTicket.id);

                setSelectedTicket(data.ticket);
                setMessages(data.messages);

                await loadTickets();
              }}
            />
          </section>
        </section>
      </div>
    </div>
  );
}
