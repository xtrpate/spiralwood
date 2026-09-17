import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import api, { buildAssetUrl } from "../../services/api";
import { getSocket, subscribeSocketReady } from "../../services/socket";

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
      role,
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
      role,
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
    role: role || "customer",
  };
};

const sameSender = (a = {}, b = {}) => {
  const roleA = String(a?.sender_role || "").trim().toLowerCase();
  const roleB = String(b?.sender_role || "").trim().toLowerCase();
  const idA = Number(a?.sender_id || 0);
  const idB = Number(b?.sender_id || 0);

  if (!roleA || !roleB || roleA !== roleB) return false;
  if (roleA === "system") return false;

  if (idA > 0 || idB > 0) {
    return idA > 0 && idB > 0 && idA === idB;
  }

  return String(a?.sender_name || "") === String(b?.sender_name || "");
};

const isNearBottom = (element, threshold = 88) => {
  if (!element) return true;
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distance <= threshold;
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
  const [expandedMessageIds, setExpandedMessageIds] = useState(() => new Set());
  const [remoteTypingLabel, setRemoteTypingLabel] = useState("");
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const threadRef = useRef(null);
  const threadEndRef = useRef(null);
  const messageIdsRef = useRef(new Set());
  const autoScrollRef = useRef(true);
  const typingStopTimerRef = useRef(null);
  const remoteTypingTimerRef = useRef(null);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTo({ top: thread.scrollHeight, behavior });
  }, []);

  const loadDiscussion = useCallback(async () => {
    if (!orderId || !enabled) return;

    setLoading(true);
    try {
      const res = await api.get(`/orders/${orderId}/discussion`);
      const rows = Array.isArray(res.data?.discussion) ? res.data.discussion : [];
      messageIdsRef.current = new Set(
        rows.map((entry) => Number(entry?.id || 0)).filter((value) => value > 0),
      );
      setDiscussion(rows);
      autoScrollRef.current = true;
      setHasNewMessage(false);
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to load discussion thread.",
      );
      messageIdsRef.current = new Set();
      setDiscussion([]);
    } finally {
      setLoading(false);
    }
  }, [orderId, enabled]);

  useEffect(() => {
    if (!enabled) {
      messageIdsRef.current = new Set();
      setDiscussion([]);
      setLoading(false);
      return;
    }

    loadDiscussion();
  }, [enabled, loadDiscussion]);

  const thread = useMemo(() => discussion || [], [discussion]);

  useEffect(() => {
    if (loading || !thread.length || !autoScrollRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      scrollToBottom(thread.length > 1 ? "smooth" : "auto");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [loading, thread.length, scrollToBottom]);

  useEffect(() => {
    if (!remoteTypingLabel) return undefined;

    const threadElement = threadRef.current;
    const shouldFollowTyping =
      autoScrollRef.current || isNearBottom(threadElement, 140);

    if (!shouldFollowTyping) return undefined;

    autoScrollRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      scrollToBottom("smooth");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [remoteTypingLabel, scrollToBottom]);

  const appendDiscussionMessage = useCallback(
    (entry, { forceScroll = false } = {}) => {
      const messageId = Number(entry?.id || 0);
      if (!messageId || messageIdsRef.current.has(messageId)) return false;

      const shouldStick = forceScroll || isNearBottom(threadRef.current);
      messageIdsRef.current.add(messageId);
      autoScrollRef.current = shouldStick;

      setDiscussion((prev) => [...prev, entry]);

      window.requestAnimationFrame(() => {
        if (shouldStick) {
          scrollToBottom("smooth");
          setHasNewMessage(false);
        } else {
          setHasNewMessage(true);
        }
      });

      return true;
    },
    [scrollToBottom],
  );

  useEffect(() => {
    if (!enabled || !orderId) return undefined;

    const numericOrderId = Number(orderId);
    if (!Number.isInteger(numericOrderId) || numericOrderId <= 0) {
      return undefined;
    }

    let boundSocket = null;

    const handleRealtimeMessage = (entry) => {
      if (Number(entry?.order_id || 0) !== numericOrderId) return;
      appendDiscussionMessage(entry);
    };

    const handleRealtimeTyping = (payload = {}) => {
      if (Number(payload?.orderId || 0) !== numericOrderId) return;

      if (remoteTypingTimerRef.current) {
        window.clearTimeout(remoteTypingTimerRef.current);
        remoteTypingTimerRef.current = null;
      }

      if (!payload?.isTyping) {
        setRemoteTypingLabel("");
        return;
      }

      const role = String(payload?.role || "").trim().toLowerCase();
      setRemoteTypingLabel(
        role === "customer" ? "Customer is typing" : "Team member is typing",
      );

      remoteTypingTimerRef.current = window.setTimeout(() => {
        setRemoteTypingLabel("");
        remoteTypingTimerRef.current = null;
      }, 2600);
    };

    const bindSocket = (socket) => {
      if (!socket) return;

      if (boundSocket && boundSocket !== socket) {
        boundSocket.off("discussion:message", handleRealtimeMessage);
        boundSocket.off("discussion:typing", handleRealtimeTyping);
      }

      boundSocket = socket;
      socket.off("discussion:message", handleRealtimeMessage);
      socket.off("discussion:typing", handleRealtimeTyping);
      socket.on("discussion:message", handleRealtimeMessage);
      socket.on("discussion:typing", handleRealtimeTyping);
      socket.emit("discussion:join", { orderId: numericOrderId }, (ack = {}) => {
        if (!ack?.ok) {
          console.warn("[DISCUSSION ROOM JOIN FAILED]", ack?.message || ack);
        }
      });
    };

    const unsubscribeReady = subscribeSocketReady(bindSocket);

    return () => {
      unsubscribeReady();

      if (boundSocket) {
        boundSocket.emit("discussion:typing", {
          orderId: numericOrderId,
          isTyping: false,
        });
        boundSocket.emit("discussion:leave", { orderId: numericOrderId });
        boundSocket.off("discussion:message", handleRealtimeMessage);
        boundSocket.off("discussion:typing", handleRealtimeTyping);
      }

      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }

      if (remoteTypingTimerRef.current) {
        window.clearTimeout(remoteTypingTimerRef.current);
        remoteTypingTimerRef.current = null;
      }
    };
  }, [appendDiscussionMessage, enabled, orderId]);

  const emitTyping = useCallback(
    (isTyping) => {
      const numericOrderId = Number(orderId);
      const socket = getSocket();
      if (
        !socket?.connected ||
        !Number.isInteger(numericOrderId) ||
        numericOrderId <= 0
      ) {
        return;
      }

      socket.emit("discussion:typing", {
        orderId: numericOrderId,
        isTyping: Boolean(isTyping),
      });
    },
    [orderId],
  );

  const stopTyping = useCallback(() => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    emitTyping(false);
  }, [emitTyping]);

  const handleMessageChange = (e) => {
    const next = e.target.value;
    setMessage(next);

    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }

    if (!next.trim()) {
      emitTyping(false);
      return;
    }

    emitTyping(true);
    typingStopTimerRef.current = window.setTimeout(() => {
      emitTyping(false);
      typingStopTimerRef.current = null;
    }, 1200);
  };

  const handleThreadScroll = () => {
    const nearBottom = isNearBottom(threadRef.current);
    autoScrollRef.current = nearBottom;
    if (nearBottom) setHasNewMessage(false);
  };

  const handleFilesChange = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
    e.target.value = "";
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleTimestamp = (messageId) => {
    const id = Number(messageId || 0);
    if (!id) return;

    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMessageKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent?.isComposing) return;
    e.preventDefault();
    if (!sending) e.currentTarget.form?.requestSubmit();
  };

  const handleSend = async (e) => {
    e.preventDefault();

    if (!orderId) return;

    if (!message.trim() && !files.length) {
      toast.error("Write a message or add at least one attachment.");
      return;
    }

    const hadFiles = files.length > 0;
    const formData = new FormData();
    formData.append("message", message.trim());
    files.forEach((file) => formData.append("attachments", file));

    setSending(true);
    try {
      const res = await api.post(`/orders/${orderId}/discussion`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const createdMessage = res.data?.discussion_message || null;
      if (createdMessage) {
        appendDiscussionMessage(createdMessage, { forceScroll: true });
      } else {
        await loadDiscussion();
      }

      setMessage("");
      setFiles([]);
      stopTyping();
      toast.success(hadFiles ? "Message and attachment sent." : "Message sent.");
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

      <div style={{ position: "relative" }}>
        <div
          ref={threadRef}
          onScroll={handleThreadScroll}
          style={{
            background: "#f7f7f8",
            minHeight: 300,
            maxHeight: 500,
            overflowY: "auto",
            padding: "18px 16px",
            scrollBehavior: "smooth",
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
            <div style={{ display: "grid", gap: 4 }}>
              {thread.map((entry, index) => {
                const sender = getSenderMeta(entry);
                const grouped = index > 0 && sameSender(thread[index - 1], entry);
                const expanded = expandedMessageIds.has(Number(entry.id));
                const isSystem = sender.system === true;

                if (isSystem) {
                  return (
                    <div
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => toggleTimestamp(entry.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleTimestamp(entry.id);
                        }
                      }}
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        width: "100%",
                        cursor: "pointer",
                        outline: "none",
                        margin: "6px 0",
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
                        {expanded ? (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 10.5,
                              color: sender.dateColor,
                            }}
                          >
                            {formatDate(entry.created_at)}
                          </div>
                        ) : null}
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
                      marginTop: grouped ? 0 : 10,
                    }}
                  >
                    {!grouped ? (
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
                    ) : null}

                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => toggleTimestamp(entry.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleTimestamp(entry.id);
                        }
                      }}
                      style={{
                        maxWidth: "68%",
                        minWidth: 88,
                        padding: "10px 12px",
                        background: sender.bg,
                        color: sender.color,
                        border: `1px solid ${sender.border}`,
                        borderRadius: sender.own
                          ? grouped
                            ? "14px 5px 5px 14px"
                            : "14px 14px 4px 14px"
                          : grouped
                            ? "5px 14px 14px 5px"
                            : "14px 14px 14px 4px",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.025)",
                        cursor: "pointer",
                        outline: "none",
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

                      {Array.isArray(entry.attachments) && entry.attachments.length ? (
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
                                onClick={(event) => event.stopPropagation()}
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
                                onClick={(event) => event.stopPropagation()}
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
                                  {Math.round((attachment.file_size || 0) / 1024)} KB
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>

                    {expanded ? (
                      <div
                        style={{
                          margin: sender.own ? "4px 6px 0 0" : "4px 0 0 6px",
                          fontSize: 10.5,
                          color: sender.dateColor,
                        }}
                      >
                        {formatDate(entry.created_at)}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {remoteTypingLabel ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{
                      margin: "0 0 4px 6px",
                      color: "#71717a",
                      fontSize: 10.5,
                      fontWeight: 500,
                    }}
                  >
                    {remoteTypingLabel}
                  </div>
                  <div
                    aria-label={remoteTypingLabel}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "10px 12px",
                      border: "1px solid #dfe2e5",
                      background: "#ffffff",
                      borderRadius: "14px 14px 14px 4px",
                    }}
                  >
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: "#9ca3af",
                          animation: `wisdomDiscussionDot 1.15s ${index * 0.14}s infinite ease-in-out`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div ref={threadEndRef} />
            </div>
          )}
        </div>

        {hasNewMessage ? (
          <button
            type="button"
            onClick={() => {
              autoScrollRef.current = true;
              scrollToBottom("smooth");
              setHasNewMessage(false);
            }}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 12,
              transform: "translateX(-50%)",
              border: "1px solid #d4d4d8",
              background: "#ffffff",
              color: "#18181b",
              minHeight: 32,
              padding: "0 12px",
              borderRadius: 16,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
              zIndex: 2,
            }}
          >
            New message ↓
          </button>
        ) : null}
      </div>

      <form
        onSubmit={handleSend}
        style={{
          borderTop: "1px solid #e4e4e7",
          background: "#ffffff",
          padding: "12px 14px",
          display: "grid",
          gap: 9,
        }}
      >
        {files.length ? (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
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
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr) auto",
            alignItems: "end",
            gap: 8,
          }}
        >
          <label
            title="Add attachment"
            style={{
              width: 38,
              height: 38,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #e4e4e7",
              background: "#f4f4f5",
              color: "#27272a",
              borderRadius: "50%",
              fontSize: 20,
              cursor: files.length >= 5 || sending ? "not-allowed" : "pointer",
              opacity: files.length >= 5 || sending ? 0.45 : 1,
            }}
          >
            +
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={handleFilesChange}
              disabled={files.length >= 5 || sending}
              style={{ display: "none" }}
            />
          </label>

          <textarea
            rows={1}
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleMessageKeyDown}
            placeholder="Type a message..."
            style={{
              width: "100%",
              minHeight: 38,
              maxHeight: 116,
              borderRadius: 18,
              border: "1px solid #e1e2e4",
              padding: "9px 13px",
              fontSize: 13,
              lineHeight: 1.45,
              color: "#18181b",
              resize: "none",
              boxSizing: "border-box",
              outline: "none",
              background: "#f4f5f6",
              fontFamily: "inherit",
            }}
          />

          <button
            type="submit"
            disabled={sending || (!message.trim() && !files.length)}
            aria-label="Send message"
            title="Send message"
            style={{
              width: 38,
              height: 38,
              border: "none",
              borderRadius: "50%",
              background:
                sending || (!message.trim() && !files.length) ? "#d4d4d8" : "#18181b",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 15,
              cursor:
                sending || (!message.trim() && !files.length)
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {sending ? "…" : "➤"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
            color: "#8a8f96",
            fontSize: 10.5,
          }}
        >
          <span>Enter to send · Shift + Enter for a new line</span>
          <span>Up to 5 files</span>
        </div>
      </form>

      <style>{`
        @keyframes wisdomDiscussionDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </section>
  );
}
