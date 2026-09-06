// src/components/CustomerNotificationBell.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import api from "../services/api";

const formatCustomerNotificationDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-PH");
};

// This bell only ever renders for a logged-in customer, so the
// destination only needs to branch on target_type, not on role.
function resolveCustomerNotificationRoute(n) {
  const targetType = n?.target_type || null;
  const targetId = n?.target_id ?? null;

  // Legacy notifications (no target fields) or anything unrecognized:
  // never guess a specific record from the message text. Fall back to
  // the customer's own order list, which is always safe to open.
  if (!targetType || targetId == null) {
    return "/orders";
  }

  switch (targetType) {
    case "custom_request":
      // /custom-requests/:id resolves against orders.id (confirmed via
      // the backend controller), so target_id is always an order id here.
      return `/custom-requests/${targetId}`;
    case "order":
      return `/orders?focus_order_id=${targetId}`;
    case "support_ticket":
      return `/support?ticket=${targetId}`;
    case "appointment":
      return `/appointment?focus_appointment_id=${targetId}`;
    case "warranty":
      return `/warranty?focus_claim_id=${targetId}`;
    default:
      return "/orders";
  }
}

export default function CustomerNotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  const CUSTOMER_NOTIFICATION_PAGE_SIZE = 20;

  const markingInFlightRef = useRef(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const mergeNotifications = useCallback((current, incoming) => {
    const byId = new Map(current.map((item) => [item.id, item]));
    incoming.forEach((item) => byId.set(item.id, item));

    return Array.from(byId.values()).sort((a, b) => {
      const timeDiff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return timeDiff || Number(b.id) - Number(a.id);
    });
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get("/customer/notifications/unread-count");
      if (isMountedRef.current) {
        setUnreadCount(Number(data?.notification_count) || 0);
      }
    } catch {
      // Badge failure must never break the surrounding customer page.
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get(
        `/customer/notifications?limit=${CUSTOMER_NOTIFICATION_PAGE_SIZE}&offset=0`,
      );
      if (isMountedRef.current) {
        setNotifications((current) => mergeNotifications(current, data));
        // Once the complete historical list has been reached, normal polling
        // must not re-enable "Load older" just because the first page is full.
        setHistoryHasMore(
          (hasMore) =>
            hasMore && data.length === CUSTOMER_NOTIFICATION_PAGE_SIZE,
        );
      }
    } catch {
      // A failed notification fetch must never break the surrounding page.
    }
  }, [mergeNotifications]);

  const loadOlderNotifications = useCallback(async () => {
    if (historyLoading || !historyHasMore) return;

    setHistoryLoading(true);
    try {
      const offset = notifications.length;
      const { data } = await api.get(
        `/customer/notifications?limit=${CUSTOMER_NOTIFICATION_PAGE_SIZE}&offset=${offset}`,
      );

      if (isMountedRef.current) {
        setNotifications((current) => mergeNotifications(current, data));
        setHistoryHasMore(data.length === CUSTOMER_NOTIFICATION_PAGE_SIZE);
      }
    } catch {
      // Loading history is best-effort and must not break the customer page.
    } finally {
      if (isMountedRef.current) setHistoryLoading(false);
    }
  }, [
    historyHasMore,
    historyLoading,
    mergeNotifications,
    notifications.length,
  ]);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    const iv = setInterval(() => {
      fetchNotifications();
      fetchUnreadCount();
    }, 30000);
    return () => clearInterval(iv);
  }, [fetchNotifications, fetchUnreadCount]);

  const markAllRead = async () => {
    try {
      await api.patch("/customer/notifications/read-all");
      setNotifications((p) => p.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {}
  };

  // Guarded so the same notification is never PATCHed twice concurrently
  // (prevents duplicate requests / HTTP 429 from rapid taps).
  const markOneRead = useCallback(
    async (id) => {
      if (markingInFlightRef.current.has(id)) return;
      const alreadyRead = notifications.find((n) => n.id === id)?.is_read;
      if (alreadyRead) return;

      markingInFlightRef.current.add(id);
      try {
        await api.patch(`/customer/notifications/${id}/read`);
        if (isMountedRef.current) {
          setNotifications((p) =>
            p.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)),
          );
          setUnreadCount((count) => Math.max(0, count - 1));
        }
      } catch {
        // Best-effort ΓÇö a failed mark-as-read must never block navigation
        // or surface an error to the customer.
      } finally {
        markingInFlightRef.current.delete(id);
      }
    },
    [notifications],
  );

  const handleNotificationClick = async (n) => {
    // First click on an unread notification only marks it as read.
    if (!n.is_read) {
      await markOneRead(n.id);
      return;
    }

    // A notification that is already read opens its exact destination
    // with one click. Legacy notifications still fall back to My Orders.
    setOpen(false);
    navigate(resolveCustomerNotificationRoute(n));
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="cust-icon-btn cust-notification-trigger-radius-only"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        title="Notifications"
      >
        {/* WISDOM CUSTOMER NOTIFICATION BADGE CART ALIGN V1.2.0
            Same 28x28 relative icon anchor geometry as the cart badge.
            Notification behavior remains unchanged. */}
        <span
          className="cust-cart-summary-icon-wrap"
          style={{
            position: "relative",
            width: 28,
            height: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 28px",
          }}
        >
          <Bell size={21} />
          {unreadCount > 0 && (
            <span className="cust-count-badge">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => setOpen(false)}
          />
          <div
            className="cust-notification-panel-radius-only"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 340,
              maxWidth: "90vw",
              maxHeight: "70vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
              zIndex: 1000,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>
                Notifications
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="cust-notification-mark-radius-only"
                  onClick={markAllRead}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#3f3f46",
                    background: "#f4f4f5",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#71717a",
                  padding: "24px 8px",
                  fontSize: 13,
                }}
              >
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="cust-notification-item-radius-only"
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    marginBottom: 8,
                    cursor: "pointer",
                    userSelect: "none",
                    background: n.is_read ? "#ffffff" : "#fafafa",
                    border: `1px solid ${n.is_read ? "#e4e4e7" : "#d4d4d8"}`,
                    position: "relative" /* Required for the red dot */,
                  }}
                >
                  {/* The Unread Red Dot */}
                  {!n.is_read && (
                    <span
                      style={{
                        position: "absolute",
                        top: "14px",
                        right: "14px",
                        width: "8px",
                        height: "8px",
                        backgroundColor: "#ef4444",
                        borderRadius: "50%",
                      }}
                      aria-hidden="true"
                    />
                  )}

                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#18181b",
                      marginBottom: 4,
                    }}
                  >
                    {n.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#52525b" }}>
                    {n.message}
                  </div>
                  {formatCustomerNotificationDate(n.created_at) && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#71717a",
                        fontWeight: 600,
                        marginTop: 6,
                      }}
                    >
                      {formatCustomerNotificationDate(n.created_at)}
                    </div>
                  )}
                </div>
              ))
            )}

            {notifications.length > 0 && historyHasMore && (
              <button
                type="button"
                onClick={loadOlderNotifications}
                disabled={historyLoading}
                style={{
                  width: "100%",
                  minHeight: 36,
                  marginTop: 4,
                  border: "1px solid #d4d4d8",
                  borderRadius: 8,
                  background: "#ffffff",
                  color: historyLoading ? "#a1a1aa" : "#3f3f46",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: historyLoading ? "wait" : "pointer",
                }}
              >
                {historyLoading
                  ? "Loading older notifications..."
                  : "Load older notifications"}
              </button>
            )}

            {notifications.length > 0 && !historyHasMore && (
              <div
                style={{
                  padding: "10px 4px 2px",
                  color: "#a1a1aa",
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                No older notifications.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
