export default function Conversation({ messages = [] }) {
  if (messages.length === 0) {
    return (
      <div className="support-conversation-empty">No conversation yet.</div>
    );
  }

  return (
    <div className="support-conversation">
      {messages.map((message) => {
        const isAdmin = message.sender_type === "admin";

        return (
          <div
            key={message.id}
            className={`conversation-row ${isAdmin ? "admin" : "customer"}`}
          >
            <div className="conversation-meta">
              <strong>{message.sender_name}</strong>
            </div>

            <div className="conversation-bubble">{message.message}</div>

            <small>{new Date(message.created_at).toLocaleString()}</small>
          </div>
        );
      })}
    </div>
  );
}
