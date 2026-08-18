import timeAgo from "../../utils/timeAgo";
import { buildAssetUrl } from "../../services/api";
import { FileText } from "lucide-react";
import { useEffect, useRef } from "react";

export default function Conversation({ messages = [] }) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      const scrollContainer = messagesEndRef.current.closest(
        ".conversation-card-body",
      );

      if (scrollContainer) {
        setTimeout(() => {
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }
    }
  }, [messages]);

  const getAttachmentUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) {
      return raw;
    }
    return buildAssetUrl(raw);
  };

  const getAttachmentDownloadUrl = (url) => {
    const normalizedUrl = getAttachmentUrl(url);
    if (!normalizedUrl) return "";

    if (normalizedUrl.toLowerCase().endsWith(".pdf")) {
      return normalizedUrl;
    }

    if (!normalizedUrl.includes("res.cloudinary.com")) return normalizedUrl;
    if (normalizedUrl.includes("/fl_attachment")) return normalizedUrl;

    return normalizedUrl.replace("/upload/", `/upload/fl_attachment/`);
  };

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
        const isAdmin =
          message.sender_type === "admin" || message.sender_type === "staff";

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

            {/* 1. Text Message Bubble (only shows if there is text) */}
            {message.message && (
              <div className="conversation-bubble">{message.message}</div>
            )}

            {/* RENDER ATTACHMENTS HERE */}
            {Array.isArray(message.attachments) &&
              message.attachments.length > 0 && (
                <div className="support-message-attachments-container">
                  {(() => {
                    // Separate images from standard files
                    const imageAttachments = message.attachments.filter((a) =>
                      a.mime_type?.startsWith("image/"),
                    );
                    const fileAttachments = message.attachments.filter(
                      (a) => !a.mime_type?.startsWith("image/"),
                    );

                    return (
                      <>
                        {/* A. SINGLE IMAGE (Normal size, no grid) */}
                        {imageAttachments.length === 1 && (
                          <a
                            href={getAttachmentUrl(
                              imageAttachments[0].file_url,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="support-message-image-link single-image"
                          >
                            <img
                              src={getAttachmentUrl(
                                imageAttachments[0].file_url,
                              )}
                              alt={imageAttachments[0].file_name}
                              className="support-message-image"
                            />
                          </a>
                        )}

                        {/* B. MULTIPLE IMAGES (Side-by-side grid) */}
                        {imageAttachments.length > 1 && (
                          <div className="support-message-image-grid">
                            {imageAttachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={getAttachmentUrl(attachment.file_url)}
                                target="_blank"
                                rel="noreferrer"
                                className="support-message-image-link"
                              >
                                <img
                                  src={getAttachmentUrl(attachment.file_url)}
                                  alt={attachment.file_name}
                                  className="support-message-image"
                                />
                              </a>
                            ))}
                          </div>
                        )}

                        {/* C. FILE STACK (Stacks PDFs cleanly, shrinking to fit) */}
                        {fileAttachments.length > 0 && (
                          <div className="support-message-file-list">
                            {fileAttachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={getAttachmentDownloadUrl(
                                  attachment.file_url,
                                )}
                                target="_blank"
                                rel="noreferrer"
                                download
                                className="support-message-file"
                              >
                                <FileText size={16} />
                                <span>{attachment.file_name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
