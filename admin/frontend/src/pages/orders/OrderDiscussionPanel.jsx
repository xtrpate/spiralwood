import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import api, { buildAssetUrl } from "../../services/api";

const resolveAttachmentUrl = (src) => {
  const raw = String(src || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const isImageAttachment = (attachment = {}) => {
  const mime = String(attachment?.mime_type || "").toLowerCase();
  const url = String(attachment?.file_url || "").toLowerCase();

  return mime.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(url);
};

const getSenderMeta = (entry = {}) => {
  const role = String(entry?.sender_role || "")
    .trim()
    .toLowerCase();

  if (role === "admin" || role === "staff") {
    return {
      label: entry?.sender_name || (role === "admin" ? "Admin" : "Staff"),
      color: "#ffffff",
      bg: "#18181b",
      border: "#18181b",
      align: "flex-start",
      dateColor: "#a1a1aa",
    };
  }

  if (role === "system") {
    return {
      label: "System",
      color: "#52525b",
      bg: "#f4f4f5",
      border: "#e4e4e7",
      align: "center",
      dateColor: "#71717a",
    };
  }

  return {
    label: entry?.sender_name || "Customer",
    color: "#0a0a0a",
    bg: "#ffffff",
    border: "#e4e4e7",
    align: "flex-end",
    dateColor: "#71717a",
  };
};

export default function OrderDiscussionPanel({ orderId, enabled = true }) {
  const [discussion, setDiscussion] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);

  const loadDiscussion = useCallback(async () => {
    if (!orderId || !enabled) return;

    setLoading(true);
    try {
      const res = await api.get(`/orders/${orderId}/discussion`);
      setDiscussion(
        Array.isArray(res.data?.discussion) ? res.data.discussion : [],
      );
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to load discussion thread.",
      );
      setDiscussion([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!enabled) {
      setDiscussion([]);
      setLoading(false);
      return;
    }

    loadDiscussion();
  }, [enabled, loadDiscussion]);

  const handleFilesChange = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
    e.target.value = "";
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e) => {
    e.preventDefault();

    if (!orderId) return;

    if (!message.trim() && !files.length) {
      toast.error("Write a reply or upload at least one attachment.");
      return;
    }

    const formData = new FormData();
    formData.append("message", message.trim());
    files.forEach((file) => formData.append("attachments", file));

    setSending(true);
    try {
      await api.post(`/orders/${orderId}/discussion`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setMessage("");
      setFiles([]);
      await loadDiscussion();
      toast.success("Discussion reply sent successfully.");
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to send discussion reply.",
      );
    } finally {
      setSending(false);
    }
  };

  const thread = useMemo(() => discussion || [], [discussion]);

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 16,
        background: "#fff",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e4e4e7",
          background: "#fafafa",
          fontWeight: 800,
          color: "#0a0a0a",
          fontSize: 16,
          letterSpacing: "-0.01em",
        }}
      >
        Discussion / Chat
      </div>

      <div style={{ padding: 20, display: "grid", gap: 16 }}>
        <div
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 16,
              padding: 20,
              maxHeight: 480,
              overflowY: "auto",
            }}
          >
            {loading ? (
              <div
                style={{
                  color: "#71717a",
                  textAlign: "center",
                  padding: 20,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Loading discussion…
              </div>
            ) : !thread.length ? (
              <div
                style={{
                  padding: 32,
                  borderRadius: 12,
                  background: "#fafafa",
                  color: "#71717a",
                  border: "1px dashed #d4d4d8",
                  textAlign: "center",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                No discussion messages yet.
              </div>
            ) : (
              thread.map((entry) => {
                const sender = getSenderMeta(entry);
                const isSystem = entry.sender_role === "system";

                return (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: sender.align,
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        border: `1px solid ${sender.border}`,
                        background: sender.bg,
                        borderRadius: 14,
                        padding: "14px 16px",
                        maxWidth: isSystem ? "100%" : "85%",
                        boxShadow: isSystem
                          ? "none"
                          : "0 1px 2px rgba(0,0,0,0.02)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          alignItems: "center",
                          marginBottom: 8,
                          borderBottom: isSystem
                            ? "none"
                            : `1px solid ${sender.color}20`,
                          paddingBottom: isSystem ? 0 : 6,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            color: sender.color,
                            fontSize: 13,
                          }}
                        >
                          {sender.label}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: sender.dateColor,
                            fontWeight: 500,
                          }}
                        >
                          {formatDate(entry.created_at)}
                        </div>
                      </div>

                      {entry.message ? (
                        <div
                          style={{
                            color: sender.color,
                            lineHeight: 1.6,
                            whiteSpace: "pre-wrap",
                            fontSize: 13,
                            opacity: isSystem ? 0.9 : 1,
                          }}
                        >
                          {entry.message}
                        </div>
                      ) : null}

                      {Array.isArray(entry.attachments) &&
                      entry.attachments.length ? (
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            marginTop: 12,
                          }}
                        >
                          {entry.attachments.map((attachment) => {
                            const href = resolveAttachmentUrl(
                              attachment.file_url,
                            );

                            return isImageAttachment(attachment) ? (
                              <a
                                key={attachment.id}
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "block",
                                  width: 100,
                                  height: 100,
                                  borderRadius: 8,
                                  overflow: "hidden",
                                  border: `1px solid ${sender.color}30`,
                                  background: "#fff",
                                }}
                              >
                                <img
                                  src={href}
                                  alt={attachment.file_name || "Attachment"}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                              </a>
                            ) : (
                              <a
                                key={attachment.id}
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  minWidth: 180,
                                  maxWidth: 260,
                                  padding: "10px 14px",
                                  borderRadius: 8,
                                  border: `1px solid ${sender.color}30`,
                                  background: "rgba(255,255,255,0.1)",
                                  textDecoration: "none",
                                  color: sender.color,
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 700,
                                    marginBottom: 4,
                                    fontSize: 13,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {attachment.file_name || "Attachment"}
                                </div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: sender.dateColor,
                                  }}
                                >
                                  {Math.round(
                                    (attachment.file_size || 0) / 1024,
                                  )}{" "}
                                  KB
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <form
          onSubmit={handleSend}
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            background: "#fafafa",
            padding: 20,
            display: "grid",
            gap: 16,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              color: "#0a0a0a",
              fontSize: 14,
            }}
          >
            Reply to Customer
          </div>

          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your admin reply, clarification, or request update here..."
            style={{
              width: "100%",
              borderRadius: 8,
              border: "1px solid #d4d4d8",
              padding: 14,
              fontSize: 13,
              color: "#18181b",
              resize: "vertical",
              boxSizing: "border-box",
              outline: "none",
            }}
          />

          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 800,
                color: "#18181b",
                marginBottom: 8,
              }}
            >
              Attach Images or PDF
            </label>

            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={handleFilesChange}
              style={{
                fontSize: 13,
                color: "#52525b",
              }}
            />
          </div>

          {files.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {files.map((file, index) => (
                <div
                  key={`${file.name}_${index}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "#ffffff",
                    border: "1px solid #e4e4e7",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#0a0a0a",
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#71717a",
                        marginTop: 2,
                      }}
                    >
                      {Math.round((attachment.file_size || 0) / 1024)} KB
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#991b1b",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontWeight: 700,
                      fontSize: 11,
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#fee2e2")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "#fef2f2")
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 4,
            }}
          >
            <button
              type="submit"
              disabled={sending}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "10px 24px",
                background: "#18181b",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "background 0.2s",
                opacity: sending ? 0.7 : 1,
              }}
              onMouseEnter={(e) =>
                !sending && (e.currentTarget.style.background = "#3f3f46")
              }
              onMouseLeave={(e) =>
                !sending && (e.currentTarget.style.background = "#18181b")
              }
            >
              {sending ? "Sending..." : "Send Reply"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
