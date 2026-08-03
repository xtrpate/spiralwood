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

// See components/NotificationBell.jsx for the full rationale of this
// window-based double click/tap detection (native onDoubleClick is not
// used because it does not behave consistently across desktop mouse,
// Chrome responsive/device mode, and mobile double-tap).
const DOUBLE_CLICK_WINDOW_MS = 280;

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
    default:
      return "/orders";
  }
}

export default function CustomerNotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const pendingTimerRef = useRef(null);
  const pendingIdRef = useRef(null);
  const markingInFlightRef = useRef(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/customer/notifications");
      if (isMountedRef.current) setNotifications(data);
    } catch {
      // A failed notification fetch must never break the surrounding page.
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const iv = setInterval(fetchNotifications, 30000);
    return () => clearInterval(iv);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    try {
      await api.patch("/customer/notifications/read-all");
      setNotifications((p) => p.map((n) => ({ ...n, is_read: 1 })));
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
        }
      } catch {
        // Best-effort — a failed mark-as-read must never block navigation
        // or surface an error to the customer.
      } finally {
        markingInFlightRef.current.delete(id);
      }
    },
    [notifications],
  );

  const clearPendingTimer = () => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  };

  const handleNotificationClick = (n) => {
    // Second click/tap on the SAME notification within the window.
    if (pendingIdRef.current === n.id) {
      clearPendingTimer();
      pendingIdRef.current = null;
      markOneRead(n.id);
      setOpen(false);
      navigate(resolveCustomerNotificationRoute(n));
      return;
    }

    // A different notification was tapped while one was still pending —
    // let the previous one resolve as a plain single click, then start
    // tracking the new one. Never navigate using the stale notification.
    if (pendingIdRef.current != null) {
      clearPendingTimer();
      const previousId = pendingIdRef.current;
      pendingIdRef.current = null;
      markOneRead(previousId);
    }

    pendingIdRef.current = n.id;
    pendingTimerRef.current = setTimeout(() => {
      if (pendingIdRef.current === n.id) {
        pendingIdRef.current = null;
      }
      pendingTimerRef.current = null;
      markOneRead(n.id);
    }, DOUBLE_CLICK_WINDOW_MS);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="cust-icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={21} />
        {unreadCount > 0 && (
          <span className="cust-count-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => setOpen(false)}
          />
          <div
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
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    marginBottom: 8,
                    cursor: "pointer",
                    userSelect: "none",
                    background: n.is_read ? "#ffffff" : "#fafafa",
                    border: `1px solid ${n.is_read ? "#e4e4e7" : "#d4d4d8"}`,
                  }}
                >
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
          </div>
        </>
      )}
    </div>
  );
}
