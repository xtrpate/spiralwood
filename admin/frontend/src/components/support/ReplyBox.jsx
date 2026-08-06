import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { SendHorizontal } from "lucide-react";

import adminSupportService from "../../services/adminSupportService";

export default function ReplyBox({ ticket, onReplySent }) {
  const [message, setMessage] = useState("");

  const [sending, setSending] = useState(false);

  const textareaRef = useRef(null);

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

      if (textareaRef.current) {
        textareaRef.current.style.height = "44px";
      }

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
    <form
      className="support-reply-form"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="support-reply-box">
        <textarea
          ref={textareaRef}
          maxLength={1000}
          placeholder="Type your message here"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);

            e.target.style.height = "0px";
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
          type="submit"
          className="support-reply-send-btn"
          disabled={sending || !message.trim()}
        >
          <SendHorizontal size={18} />
        </button>
      </div>

      <div className="support-reply-footer">
        <span className={message.length > 900 ? "warning" : ""}>
          {message.length}/1000
        </span>
      </div>
    </form>
  );
}
