import { useState } from "react";

export default function Conversation({
  ticket,
  messages = [],
  onReply,
  onClose,
}) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  if (!ticket) {
    return (
      <div className="support-conversation-empty">
        <h3>Select a Support Ticket</h3>
        <p>Choose a ticket from the list to view its conversation.</p>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!reply.trim()) return;

    try {
      setSending(true);

      await onReply(reply);

      setReply("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="support-conversation">
      <div className="support-conversation-header">
        <div>
          <h2>{ticket.subject}</h2>

          <p>{ticket.category.replaceAll("_", " ")}</p>
        </div>

        {ticket.status !== "closed" && (
          <button className="support-close-btn" onClick={onClose}>
            Close Ticket
          </button>
        )}
      </div>

      <div className="support-message-list">
        {messages.length === 0 && (
          <div className="support-no-messages">
            <div className="conversation-empty-icon">💬</div>

            <h3>No Messages Yet</h3>

            <p>
              Once you or our support team sends a message, it will appear here.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`support-message ${
              msg.sender_type === "customer" ? "customer" : "staff"
            }`}
          >
            <div className="support-message-author">
              {msg.sender_type === "customer" ? "You" : "Support Team"}
            </div>

            <div className="support-message-body">{msg.message}</div>

            <div className="support-message-time">
              {new Date(msg.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {ticket.status !== "closed" && (
        <form className="support-reply-form" onSubmit={handleSubmit}>
          <textarea
            rows={4}
            placeholder="Write your reply..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />

          <button type="submit" disabled={sending}>
            {sending ? "Sending..." : "Send Reply"}
          </button>
        </form>
      )}
    </div>
  );
}
