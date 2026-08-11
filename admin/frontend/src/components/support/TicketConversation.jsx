import Conversation from "./Conversation";
import ReplyBox from "./ReplyBox";

export default function TicketConversation({
  ticket,
  messages,
  activeTab,
  setActiveTab,
  onReplySent,
  ReplyComponent,
  showTabs = true,
  variant = "default",
}) {
  const adminMode = variant === "admin";

  if (!ticket) {
    return (
      <div className={`support-conversation-card ${adminMode ? "admin-support-conversation-card is-empty" : ""}`}>
        <h2>Select a Ticket</h2>
        <p>Choose a support ticket to review the conversation.</p>
      </div>
    );
  }

  return (
    <div className={`support-conversation-card ${adminMode ? "admin-support-conversation-card" : ""}`}>
      {adminMode && (
        <div className="admin-conversation-heading">
          <h2>{ticket.subject}</h2>
          <p className="ticket-subtitle">
            Review the conversation and reply to the customer.
          </p>
        </div>
      )}

      {!adminMode && (
        <p className="ticket-subtitle">
          Read the conversation history and respond to the customer.
        </p>
      )}

      {showTabs && (
        <>
          <div className="support-tabs">
            <button
              type="button"
              className={activeTab === "details" ? "active" : ""}
              onClick={() => setActiveTab("details")}
            >
              Details
            </button>

            <button
              type="button"
              className={activeTab === "conversation" ? "active" : ""}
              onClick={() => setActiveTab("conversation")}
            >
              Conversation
            </button>
          </div>

          <hr className="ticket-divider" />
        </>
      )}

      {!adminMode && <h3 className="ticket-section-title">Conversation</h3>}

      <div className="conversation-card-body">
        <Conversation messages={messages} />
      </div>

      <div className="conversation-card-footer">
        <ReplyBox ticket={ticket} onReplySent={onReplySent} />
      </div>
    </div>
  );
}
