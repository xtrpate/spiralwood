import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { SendHorizontal } from "lucide-react";

import posSupportService from "../../../services/posSupportService";

export default function ReplyBox({ ticket, onReplySent }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const textareaRef = useRef(null);

  const handleSubmit = async () => {
    if (!ticket) return;
    if (!message.trim()) return;

    try {
      setSending(true);

      await posSupportService.reply(ticket.id, {
        message,
      });

      toast.success("Reply sent successfully.");

      setMessage("");

      if (textareaRef.current) {
        textareaRef.current.style.height = "26px";
      }

      onReplySent?.();
    } catch (err) {
      toast.error("Failed to send reply.");
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="reply-box">
      <div className="reply-composer">
        <textarea
          ref={textareaRef}
          maxLength={1000}
          placeholder="Type your reply..."
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);

            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          disabled={sending}
        />

        <button
          className="reply-send-btn"
          onClick={handleSubmit}
          disabled={sending || !message.trim()}
        >
          <SendHorizontal size={18} />
        </button>
      </div>

      <span
        className={`reply-counter ${message.length > 900 ? "warning" : ""}`}
      >
        {message.length}/1000
      </span>
    </div>
  );
}
