import { useEffect, useRef, useState } from "react";
import { SendHorizontal, Ticket, Paperclip, X, FileText } from "lucide-react";
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

  const [attachments, setAttachments] = useState([]);
  const attachmentInputRef = useRef(null);

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

  const getAttachmentUrl = (value) => {
    const raw = String(value || "").trim();

    if (!raw) return "";

    if (/^(https?:|data:|blob:)/i.test(raw)) {
      return raw;
    }

    return buildAssetUrl(raw);
  };

  const getAttachmentDownloadUrl = (url, fileName = "download") => {
    const normalizedUrl = getAttachmentUrl(url);

    if (!normalizedUrl) {
      return "";
    }

    // Only transform Cloudinary URLs.
    if (!normalizedUrl.includes("res.cloudinary.com")) {
      return normalizedUrl;
    }

    // Already configured as a download URL.
    if (normalizedUrl.includes("/fl_attachment")) {
      return normalizedUrl;
    }

    const safeFileName = String(fileName || "download").replace(
      /[^\w.-]+/g,
      "_",
    );

    return normalizedUrl.replace(
      "/upload/",
      `/upload/fl_attachment:${encodeURIComponent(safeFileName)}/`,
    );
  };

  const handleAttachmentChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);

    if (!selectedFiles.length) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    const maxSize = 15 * 1024 * 1024;
    const maxFiles = 5;

    const validFiles = selectedFiles.filter((file) => {
      if (!allowedTypes.includes(file.type)) {
        return false;
      }

      if (file.size > maxSize) {
        return false;
      }

      return true;
    });

    if (validFiles.length !== selectedFiles.length) {
      alert("Only JPG, PNG, WEBP, and PDF files up to 15 MB each are allowed.");
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

  const profileImage =
    user?.profile_photo && !avatarFailed
      ? getAvatarUrl(user.profile_photo)
      : "";

  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Scroll ONLY the message box itself, preventing the whole page from jumping
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

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

    if (!reply.trim() && attachments.length === 0) return;

    try {
      setSending(true);

      await onReply({
        message: reply.trim(),
        attachments,
      });

      setReply("");
      setAttachments([]);

      if (textareaRef.current) {
        textareaRef.current.style.height = "24px";
      }
    } finally {
      setSending(false);
    }
  };

  const isImageAttachment = (url = "") => {
    const value = String(url || "").toLowerCase();

    return (
      value.includes("/image/upload/") ||
      /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(value)
    );
  };

  const getAttachmentName = (url = "") => {
    try {
      const cleanUrl = String(url || "").split("?")[0];
      const lastPart = cleanUrl.split("/").pop();

      if (!lastPart) return "Attachment";

      return decodeURIComponent(lastPart);
    } catch {
      return "Attachment";
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

      <div className="support-message-list" ref={scrollContainerRef}>
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
                    {msg.message && <div>{msg.message}</div>}

                    {Array.isArray(msg.attachments) &&
                      msg.attachments.length > 0 && (
                        <div className="support-message-attachments">
                          {msg.attachments.map((attachment) => {
                            const url = getAttachmentUrl(attachment.file_url);

                            const isImage =
                              attachment.mime_type?.startsWith("image/");

                            return isImage ? (
                              <a
                                key={attachment.id}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="support-message-image-link"
                              >
                                <img
                                  src={url}
                                  alt={attachment.file_name}
                                  className="support-message-image"
                                />
                              </a>
                            ) : (
                              <a
                                key={attachment.id}
                                href={getAttachmentDownloadUrl(
                                  attachment.file_url,
                                  attachment.file_name,
                                )}
                                download
                                className="support-message-file"
                              >
                                <FileText size={18} />

                                <span>{attachment.file_name}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
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
                    {msg.message && <div>{msg.message}</div>}

                    {Array.isArray(msg.attachments) &&
                      msg.attachments.length > 0 && (
                        <div className="support-message-attachments">
                          {msg.attachments.map((attachment) => {
                            const url = getAttachmentUrl(attachment.file_url);

                            const isImage =
                              attachment.mime_type?.startsWith("image/");

                            return isImage ? (
                              <a
                                key={attachment.id}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="support-message-image-link"
                              >
                                <img
                                  src={url}
                                  alt={attachment.file_name}
                                  className="support-message-image"
                                />
                              </a>
                            ) : (
                              <a
                                key={attachment.id}
                                href={getAttachmentDownloadUrl(
                                  attachment.file_url,
                                  attachment.file_name,
                                )}
                                download
                                className="support-message-file"
                              >
                                <FileText size={18} />

                                <span>{attachment.file_name}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {ticket.status !== "closed" && (
        <form className="support-reply-form" onSubmit={handleSubmit}>
          <div
            className={`support-reply-box ${
              attachments.length > 0 ? "has-attachment" : ""
            }`}
          >
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
                      <div className="support-reply-attachment-name">
                        {file.name}
                      </div>

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
                rows={1}
                placeholder="Type your message here"
                value={reply}
                maxLength={1000}
                onChange={(e) => {
                  setReply(e.target.value);

                  e.target.style.height = "0px";
                  e.target.style.height = `${Math.min(
                    e.target.scrollHeight,
                    140,
                  )}px`;
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
                disabled={
                  sending || (!reply.trim() && attachments.length === 0)
                }
                aria-label="Send message"
              >
                {sending ? "..." : <SendHorizontal size={18} />}
              </button>
            </div>
          </div>

          <div className="support-reply-footer">
            <span>{reply.length}/1000</span>
          </div>
        </form>
      )}
    </div>
  );
}
