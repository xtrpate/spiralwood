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
}) {
  if (!ticket) {
    return (
      <div className="support-conversation-card">
        <h2>Select a Ticket</h2>

        <p>Choose a support ticket to start the conversation.</p>
      </div>
    );
  }

  return (
    <div className="support-conversation-card">
      <p className="ticket-subtitle">
        Read the conversation history and respond to the customer.
      </p>

      {showTabs && (
        <>
          <div className="support-tabs">
            <button
              className={activeTab === "details" ? "active" : ""}
              onClick={() => setActiveTab("details")}
            >
              Details
            </button>

            <button
              className={activeTab === "conversation" ? "active" : ""}
              onClick={() => setActiveTab("conversation")}
            >
              Conversation
            </button>
          </div>

          <hr className="ticket-divider" />
        </>
      )}

      <h3 className="ticket-section-title">Conversation</h3>

      <div className="conversation-card-body">
        <Conversation messages={messages} />
      </div>

      <div className="conversation-card-footer">
        <ReplyBox ticket={ticket} onReplySent={onReplySent} />
      </div>
    </div>
  );
}
