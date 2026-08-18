import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { SendHorizontal, Paperclip, X, FileText } from "lucide-react";

import posSupportService from "../../../services/posSupportService";

export default function ReplyBox({ ticket, onReplySent }) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);

  const textareaRef = useRef(null);
  const attachmentInputRef = useRef(null);

  const handleAttachmentChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    const maxSize = 15 * 1024 * 1024; // 15MB
    const maxFiles = 5;

    const validFiles = selectedFiles.filter((file) => {
      if (!allowedTypes.includes(file.type)) return false;
      if (file.size > maxSize) return false;
      return true;
    });

    if (validFiles.length !== selectedFiles.length) {
      toast.error(
        "Only JPG, PNG, WEBP, and PDF files up to 15 MB each are allowed.",
      );
    }

    setAttachments((prev) => {
      const combined = [...prev, ...validFiles];
      const unique = combined.filter(
        (file, index, array) =>
          index ===
          array.findIndex(
            (item) =>
              item.name === file.name &&
              item.size === file.size &&
              item.lastModified === file.lastModified,
          ),
      );
      return unique.slice(0, maxFiles);
    });

    e.target.value = "";
  };

  const removeAttachment = (index) => {
    setAttachments((prev) =>
      prev.filter((_, fileIndex) => fileIndex !== index),
    );
  };

  const handleSubmit = async () => {
    if (!ticket) return;
    if (!message.trim() && attachments.length === 0) return;

    try {
      setSending(true);

      // 👉 Use FormData to send both text and files!
      const formData = new FormData();
      if (message.trim()) {
        formData.append("message", message.trim());
      }
      attachments.forEach((file) => {
        formData.append("attachments", file);
      });

      await posSupportService.reply(ticket.id, formData);

      toast.success("Reply sent successfully.");

      setMessage("");
      setAttachments([]);

      if (textareaRef.current) {
        textareaRef.current.style.height = "38px";
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
    <form
      className="support-reply-form"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      {/* 👉 Attachment Preview Area (Above the input box) */}
      {attachments.length > 0 && (
        <div className="support-reply-attachment-list">
          {attachments.map((file, index) => (
            <div
              className="support-reply-attachment"
              key={`${file.name}-${file.size}-${file.lastModified}`}
            >
              {file.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="support-reply-attachment-preview"
                />
              ) : (
                <div className="support-reply-attachment-file-icon">
                  <FileText size={16} />
                </div>
              )}

              <div className="support-reply-attachment-info">
                <div className="support-reply-attachment-name">{file.name}</div>
                <div className="support-reply-attachment-size">
                  {Math.max(1, Math.round(file.size / 1024))} KB
                </div>
              </div>

              <button
                type="button"
                className="support-reply-attachment-remove"
                onClick={() => removeAttachment(index)}
                disabled={sending}
                aria-label={`Remove ${file.name}`}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="support-reply-box">
        <div className="support-reply-input-row">
          <input
            ref={attachmentInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            multiple
            onChange={handleAttachmentChange}
            hidden
          />

          <button
            type="button"
            className="support-reply-attach-btn"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={sending}
            aria-label="Attach file"
            title="Attach file"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            maxLength={1000}
            placeholder="Type your message here"
            value={message}
            onChange={(e) => {
              const value = e.target.value;
              setMessage(value);

              e.target.style.height = "38px";

              if (!value.trim()) {
                e.target.style.height = "38px";
                return;
              }

              e.target.style.height = `${Math.min(
                Math.max(e.target.scrollHeight, 38),
                140,
              )}px`;
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
            disabled={sending || (!message.trim() && attachments.length === 0)}
          >
            {sending ? "..." : <SendHorizontal size={18} />}
          </button>
        </div>
      </div>

      <div className="support-reply-footer">
        <span className={message.length > 900 ? "warning" : ""}>
          {message.length}/1000
        </span>
      </div>
    </form>
  );
}
