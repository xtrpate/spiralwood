import { useState } from "react";
import toast from "react-hot-toast";

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

      toast.success("Reply sent successfully.");

      setMessage("");

      if (onReplySent) {
        onReplySent();
      }
    } catch (err) {
      toast.error("Failed to send reply.");
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="reply-box">
      <textarea
        maxLength={1000}
        placeholder="Write a helpful reply to the customer..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={sending}
      />

      <div className="reply-box-footer">
        <span
          className={`reply-counter ${message.length > 900 ? "warning" : ""}`}
        >
          {message.length} / 1000
        </span>

        <button onClick={handleSubmit} disabled={sending || !message.trim()}>
          {sending ? "Sending..." : "Send Reply"}
        </button>
      </div>
    </div>
  );
}
