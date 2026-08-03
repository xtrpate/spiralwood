import timeAgo from "../../utils/timeAgo";

export default function Conversation({ messages = [] }) {
  if (!messages.length) {
    return (
      <div className="support-conversation-empty">
        <div className="conversation-empty-icon">💬</div>

        <h3>No Conversation Yet</h3>

        <p>Start helping the customer by sending the first reply.</p>
      </div>
    );
  }

  return (
    <div className="support-conversation">
      {messages.map((message) => {
        const isAdmin = message.sender_type === "admin";

        const initials = (message.sender_name || "?")
          .split(" ")
          .map((part) => part[0])
          .join("")
          .substring(0, 2)
          .toUpperCase();

        return (
          <div
            key={message.id}
            className={`conversation-row ${isAdmin ? "admin" : "customer"}`}
          >
            <div className="conversation-header">
              <div className="conversation-avatar">{initials}</div>

              <div className="conversation-user">
                <div className="conversation-user-top">
                  <div className="conversation-name">{message.sender_name}</div>

                  <div className="conversation-time">
                    {timeAgo(message.created_at)}
                  </div>
                </div>

                <div className="conversation-role">
                  {isAdmin ? "Support Team" : "Customer"}
                </div>
              </div>
            </div>

            <div className="conversation-bubble">{message.message}</div>
          </div>
        );
      })}
    </div>
  );
}
