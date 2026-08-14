import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import api, { buildAssetUrl } from "../../services/api";

// WISDOM Admin Orders Compact Chat UI Fix V1.0.1
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
    hour: "numeric",
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
      align: "flex-end",
      dateColor: "#71717a",
      own: true,
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
      own: false,
      system: true,
    };
  }

  return {
    label: entry?.sender_name || "Customer",
    color: "#18181b",
    bg: "#ffffff",
    border: "#dfe2e5",
    align: "flex-start",
    dateColor: "#71717a",
    own: false,
  };
};

export default function OrderDiscussionPanel({ orderId, enabled = true }) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [discussion, setDiscussion] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const threadEndRef = useRef(null);

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
  }, [orderId, enabled]);

  useEffect(() => {
    if (!enabled) {
      setDiscussion([]);
      setLoading(false);
      return;
    }

    loadDiscussion();
  }, [enabled, loadDiscussion]);

  const thread = useMemo(() => discussion || [], [discussion]);

  useEffect(() => {
    if (!loading && thread.length) {
      threadEndRef.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  }, [loading, thread.length]);

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
      toast.error("Write a message or add at least one attachment.");
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
      toast.success("Message sent.");
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to send message.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      style={{
        width: "100%",
        maxWidth: 920,
        margin: "0 auto",
        border: "1px solid #dfe2e5",
        borderRadius: 0,
        background: "#ffffff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "13px 16px",
          borderBottom: "1px solid #e4e4e7",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: "#18181b",
            fontSize: 15,
            lineHeight: 1.25,
          }}
        >
          Discussion
        </div>
        <div
          style={{
            marginTop: 3,
            color: "#71717a",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          Messages between the customer and your team.
        </div>
      </div>

      <div
        style={{
          background: "#f7f7f8",
          minHeight: 300,
          maxHeight: 500,
          overflowY: "auto",
          padding: "18px 16px",
        }}
      >
        {loading ? (
          <div
            style={{
              color: "#71717a",
              textAlign: "center",
              padding: "54px 20px",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Loading messages...
          </div>
        ) : !thread.length ? (
          <div
            style={{
              textAlign: "center",
              padding: "62px 20px",
              color: "#71717a",
            }}
          >
            <div
              style={{
                color: "#27272a",
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 5,
              }}
            >
              No messages yet
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              Start the conversation using the message box below.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {thread.map((entry) => {
              const sender = getSenderMeta(entry);
              const isSystem = sender.system === true;

              if (isSystem) {
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "78%",
                        padding: "8px 12px",
                        background: sender.bg,
                        color: sender.color,
                        border: `1px solid ${sender.border}`,
                        borderRadius: 12,
                        textAlign: "center",
                        fontSize: 12,
                        lineHeight: 1.45,
                      }}
                    >
                      {entry.message || sender.label}
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 10.5,
                          color: sender.dateColor,
                        }}
                      >
                        {formatDate(entry.created_at)}
                      </div>
                    </div>
                  </div>
                );
              }

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
                      margin: sender.own ? "0 6px 4px 0" : "0 0 4px 6px",
                      color: "#71717a",
                      fontSize: 10.5,
                      fontWeight: 500,
                    }}
                  >
                    {sender.label}
                  </div>

                  <div
                    style={{
                      maxWidth: "68%",
                      minWidth: 88,
                      padding: "10px 12px",
                      background: sender.bg,
                      color: sender.color,
                      border: `1px solid ${sender.border}`,
                      borderRadius: sender.own
                        ? "14px 14px 4px 14px"
                        : "14px 14px 14px 4px",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.025)",
                    }}
                  >
                    {entry.message ? (
                      <div
                        style={{
                          color: sender.color,
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          fontSize: 13,
                          wordBreak: "break-word",
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
                          gap: 8,
                          flexWrap: "wrap",
                          marginTop: entry.message ? 9 : 0,
                        }}
                      >
                        {entry.attachments.map((attachment) => {
                          const href = resolveAttachmentUrl(attachment.file_url);

                          return isImageAttachment(attachment) ? (
                            <a
                              key={attachment.id}
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "block",
                                width: 96,
                                height: 96,
                                borderRadius: 8,
                                overflow: "hidden",
                                border: sender.own
                                  ? "1px solid rgba(255,255,255,0.25)"
                                  : "1px solid #e4e4e7",
                                background: "#ffffff",
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
                                minWidth: 150,
                                maxWidth: 230,
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: sender.own
                                  ? "1px solid rgba(255,255,255,0.25)"
                                  : "1px solid #e4e4e7",
                                background: sender.own
                                  ? "rgba(255,255,255,0.08)"
                                  : "#fafafa",
                                textDecoration: "none",
                                color: sender.color,
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 12,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {attachment.file_name || "Attachment"}
                              </div>
                              <div
                                style={{
                                  fontSize: 10.5,
                                  color: sender.own ? "#d4d4d8" : "#71717a",
                                  marginTop: 2,
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

                  <div
                    style={{
                      margin: sender.own ? "4px 6px 0 0" : "4px 0 0 6px",
                      fontSize: 10.5,
                      color: sender.dateColor,
                    }}
                  >
                    {formatDate(entry.created_at)}
                  </div>
                </div>
              );
            })}
            <div ref={threadEndRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={handleSend}
        style={{
          borderTop: "1px solid #e4e4e7",
          background: "#ffffff",
          padding: "14px 16px",
          display: "grid",
          gap: 10,
        }}
      >
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write a message..."
          style={{
            width: "100%",
            minHeight: 82,
            maxHeight: 150,
            borderRadius: 10,
            border: "1px solid #d4d4d8",
            padding: "11px 12px",
            fontSize: 13,
            lineHeight: 1.45,
            color: "#18181b",
            resize: "vertical",
            boxSizing: "border-box",
            outline: "none",
            background: "#ffffff",
            fontFamily: "inherit",
          }}
        />

        {files.length ? (
          <div
            style={{
              display: "flex",
              gap: 7,
              flexWrap: "wrap",
            }}
          >
            {files.map((file, index) => (
              <div
                key={`${file.name}_${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  maxWidth: 260,
                  padding: "6px 8px",
                  border: "1px solid #e4e4e7",
                  background: "#fafafa",
                  borderRadius: 8,
                }}
              >
                <span
                  title={file.name}
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 11.5,
                    color: "#3f3f46",
                  }}
                >
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  aria-label={`Remove ${file.name}`}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#b91c1c",
                    padding: 0,
                    width: 18,
                    height: 18,
                    fontSize: 15,
                    lineHeight: "18px",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 34,
              padding: "0 12px",
              border: "1px solid #d4d4d8",
              background: "#ffffff",
              color: "#27272a",
              borderRadius: 0,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Add attachment
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={handleFilesChange}
              style={{ display: "none" }}
            />
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                color: "#8a8f96",
                fontSize: 10.5,
              }}
            >
              Up to 5 files
            </span>
            <button
              type="submit"
              disabled={sending}
              style={{
                border: "1px solid #18181b",
                borderRadius: 0,
                minHeight: 34,
                padding: "0 18px",
                background: "#18181b",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 11.5,
                cursor: sending ? "not-allowed" : "pointer",
                opacity: sending ? 0.65 : 1,
              }}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
