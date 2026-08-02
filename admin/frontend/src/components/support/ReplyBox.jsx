import { useState } from "react";

import adminSupportService from "../../services/adminSupportService";

export default function ReplyBox({ ticket, onReplySent }) {
  const [message, setMessage] = useState("");

  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!ticket) return;

    if (!message.trim()) return;

    try {
      setSending(true);

      await adminSupportService.reply(ticket.id, {
        message,
      });

      setMessage("");

      if (onReplySent) {
        onReplySent();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="reply-box">
      <textarea
        placeholder="Type your reply..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <button onClick={handleSubmit} disabled={sending}>
        {sending ? "Sending..." : "Send Reply"}
      </button>
    </div>
  );
}
