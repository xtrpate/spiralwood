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
  const role = String(entry?.sender_role || "").trim().toLowerCase();

  if (role === "admin") {
    return {
      label: entry?.sender_name || "Admin",
      color: "#7c3aed",
      bg: "#f5f3ff",
      border: "#ddd6fe",
    };
  }

  if (role === "staff") {
    return {
      label: entry?.sender_name || "Staff",
      color: "#0f766e",
      bg: "#ecfeff",
      border: "#a5f3fc",
    };
  }

  if (role === "system") {
    return {
      label: "System",
      color: "#475569",
      bg: "#f8fafc",
      border: "#e2e8f0",
    };
  }

  return {
    label: entry?.sender_name || "Customer",
    color: "#166534",
    bg: "#f0fdf4",
    border: "#bbf7d0",
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
      setDiscussion(Array.isArray(res.data?.discussion) ? res.data.discussion : []);
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
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid #e5e7eb",
          background: "#f8fafc",
          fontWeight: 800,
          color: "#0f172a",
        }}
      >
        Discussion / Chat
      </div>

      <div style={{ padding: 16, display: "grid", gap: 16 }}>
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid #e2e8f0",
              background: "#f8fafc",
              fontWeight: 700,
            }}
          >
            Request Conversation
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              padding: 16,
              maxHeight: 420,
              overflowY: "auto",
            }}
          >
            {loading ? (
              <div style={{ color: "#64748b" }}>Loading discussion…</div>
            ) : !thread.length ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "#f8fafc",
                  color: "#64748b",
                  border: "1px dashed #cbd5e1",
                }}
              >
                No discussion messages yet.
              </div>
            ) : (
              thread.map((entry) => {
                const sender = getSenderMeta(entry);

                return (
                  <div
                    key={entry.id}
                    style={{
                      border: `1px solid ${sender.border}`,
                      background: sender.bg,
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          color: sender.color,
                        }}
                      >
                        {sender.label}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        {formatDate(entry.created_at)}
                      </div>
                    </div>

                    {entry.message ? (
                      <div
                        style={{
                          color: "#0f172a",
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {entry.message}
                      </div>
                    ) : null}

                    {Array.isArray(entry.attachments) && entry.attachments.length ? (
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          marginTop: 12,
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
                                width: 90,
                                height: 90,
                                borderRadius: 12,
                                overflow: "hidden",
                                border: "1px solid #dbeafe",
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
                                padding: "10px 12px",
                                borderRadius: 12,
                                border: "1px solid #e2e8f0",
                                background: "#fff",
                                textDecoration: "none",
                                color: "#0f172a",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 700,
                                  marginBottom: 4,
                                }}
                              >
                                {attachment.file_name || "Attachment"}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#64748b",
                                }}
                              >
                                Open file
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <form
          onSubmit={handleSend}
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            background: "#fff",
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              color: "#0f172a",
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
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              padding: 12,
              font: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />

          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 700,
                color: "#475569",
                marginBottom: 6,
              }}
            >
              Attach Images or PDF
            </label>

            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={handleFilesChange}
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
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#0f172a",
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
                        color: "#64748b",
                      }}
                    >
                      {Math.round((file.size || 0) / 1024)} KB
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fff1f2",
                      color: "#be123c",
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={sending}
              style={{
                minHeight: 44,
                border: "none",
                borderRadius: 12,
                padding: "12px 18px",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {sending ? "Sending..." : "Send Reply"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}