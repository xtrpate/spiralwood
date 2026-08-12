import { useEffect, useRef, useState } from "react";
import { SendHorizontal, Ticket } from "lucide-react";
import useAuthStore from "../../../store/authStore";
import { buildAssetUrl } from "../../../services/api";

export default function Conversation({
  ticket,
  messages = [],
  onReply,
  onClose,
}) {
  const { user } = useAuthStore();

  const [reply, setReply] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.profile_photo]);

  const getAvatarUrl = (value) => {
    const raw = String(value || "").trim();

    if (!raw) return "";

    if (/^(https?:|data:|blob:)/i.test(raw)) {
      return buildAssetUrl(raw);
    }

    const cleaned = raw.replace(/\\/g, "/").replace(/^\/+/, "");

    const withPrefix = cleaned.startsWith("uploads/avatars/")
      ? `/${cleaned}`
      : `/uploads/avatars/${cleaned}`;

    return buildAssetUrl(withPrefix);
  };

  const profileImage =
    user?.profile_photo && !avatarFailed
      ? getAvatarUrl(user.profile_photo)
      : "";

  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);
  if (!ticket) {
    return (
      <div className="support-conversation-empty">
        <Ticket size={56} strokeWidth={1.5} color="#71717a" />
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
      if (textareaRef.current) {
        textareaRef.current.style.height = "24px";
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="support-conversation">
      <div className="support-conversation-header">
        <div>
          <h2>{ticket.subject}</h2>

          <p>
            {ticket.category.replaceAll("_", " ")} •{" "}
            <strong>{ticket.status.replaceAll("_", " ")}</strong>
          </p>
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
            <div className="support-conversation-empty-icon">💬</div>

            <h3>No Messages Yet</h3>

            <p>
              Once you or our support team sends a message, it will appear here.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isCustomer = msg.sender_type === "customer";

          const initials = (msg.sender_name || (isCustomer ? "You" : "Support"))
            .split(" ")
            .map((part) => part[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();

          return (
            <div
              key={msg.id}
              className={`support-conversation-row ${isCustomer ? "customer" : "support"}`}
            >
              {isCustomer ? (
                <>
                  <div className="support-conversation-msg-header customer">
                    <div className="support-conversation-header-info">
                      <div className="support-conversation-name">You</div>

                      <div className="support-conversation-role">Customer</div>

                      <div className="support-conversation-time">
                        {new Date(msg.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="support-conversation-avatar">
                      {profileImage ? (
                        <img
                          src={profileImage}
                          alt="Your profile"
                          className="support-conversation-avatar-img"
                          onError={() => setAvatarFailed(true)}
                        />
                      ) : (
                        initials
                      )}
                    </div>
                  </div>

                  <div className="support-conversation-bubble customer">
                    {msg.message}
                  </div>
                </>
              ) : (
                <>
                  <div className="support-conversation-msg-header support">
                    <div className="support-conversation-avatar">
                      {initials}
                    </div>

                    <div className="support-conversation-meta">
                      <div className="support-conversation-name">
                        Support Team
                      </div>

                      <div className="support-conversation-role">Support</div>

                      <div className="support-conversation-time">
                        {new Date(msg.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="support-conversation-bubble support">
                    {msg.message}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {ticket.status !== "closed" && (
        <form className="support-reply-form" onSubmit={handleSubmit}>
          <div className="support-reply-box">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Type your message here"
              value={reply}
              maxLength={1000}
              onChange={(e) => {
                setReply(e.target.value);

                e.target.style.height = "0px";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();

                  handleSubmit(e);
                }
              }}
              disabled={sending}
            />

            <button
              type="submit"
              className="support-reply-send-btn"
              disabled={sending || !reply.trim()}
            >
              {sending ? "..." : <SendHorizontal size={18} />}
            </button>
          </div>

          <div className="support-reply-footer">
            <span>{reply.length}/1000</span>
          </div>
        </form>
      )}
    </div>
  );
}
