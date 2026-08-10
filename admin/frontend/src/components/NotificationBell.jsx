// src/components/NotificationBell.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Bell } from "lucide-react";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import "./NotificationBell.css";

const S = {
  btn: {
    padding: "9px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    transition: "background 0.2s",
  },
  btnGray: {
    background: "#f4f4f5",
    color: "#18181b",
    border: "1px solid #e4e4e7",
  },
  btnIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid #e4e4e7",
    background: "#f4f4f5",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    transition: "background 0.2s",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    width: 480,
    maxWidth: "100%",
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 32,
    boxShadow: "0 25px 60px rgba(0,0,0,.15)",
    border: "1px solid #e4e4e7",
  },
  mTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#0a0a0a",
    marginBottom: 24,
    letterSpacing: "-0.01em",
  },
  notifItem: (isRead) => ({
    padding: "14px 16px",
    borderRadius: 10,
    marginBottom: 10,
    cursor: "pointer",
    background: isRead ? "#ffffff" : "#fafafa",
    border: `1px solid ${isRead ? "#e4e4e7" : "#d4d4d8"}`,
    transition: "background 0.2s",
    userSelect: "none",
  }),
};

// Resolves the exact destination for a notification based on its
// (target_type, target_id, target_order_id) and the logged-in user's own
// role/staff_type — never based on which role happened to receive the
// notification. This lets the same notification "shape" route correctly
// no matter which admin/staff account is viewing it.
function resolveNotificationRoute(
  n,
  { isAdmin, isCashier, isIndoorStaff, isDeliveryRider },
) {
  const targetType = n?.target_type || null;
  const targetId = n?.target_id ?? null;
  const targetOrderId = n?.target_order_id ?? null;

  // Legacy notifications (no target fields) or anything we don't
  // recognize: never guess a specific record from the message text.
  // Fall back to the safest role-appropriate list/dashboard page.
  const safeFallback = () => {
    if (isAdmin) return "/admin/dashboard";
    if (isCashier) return "/staff/support";
    if (isDeliveryRider) return "/staff/rider-dashboard";
    if (isIndoorStaff) return "/staff/dashboard";
    return "/admin/dashboard";
  };

  if (!targetType || targetId == null) {
    return safeFallback();
  }

  switch (targetType) {
    case "order":
    case "custom_request":
      // Admin's order detail route is the only exact-record route
      // available for both plain orders and blueprint/custom-request
      // orders (there is no separate admin custom-request page — it is
      // reviewed from the order itself).
      if (isAdmin) return `/admin/orders/${targetId}`;
      return safeFallback();

    case "blueprint_estimation":
      if (isAdmin) return `/admin/blueprints/${targetId}/estimation`;
      return safeFallback();

    case "task":
      if (isAdmin) return `/admin/tasks?focus_task_id=${targetId}`;
      if (isIndoorStaff) return `/staff/tasks?focus_task_id=${targetId}`;
      return safeFallback();

    case "delivery":
      if (isAdmin) return `/admin/delivery?focus_delivery_id=${targetId}`;
      if (isDeliveryRider)
        return `/staff/deliveries?focus_delivery_id=${targetId}`;
      return safeFallback();

    case "appointment":
      // No active notification creation point produces this today —
      // wired for forward compatibility only.
      if (isAdmin)
        return `/admin/appointments?focus_appointment_id=${targetId}`;
      if (isIndoorStaff)
        return `/staff/appointment?focus_appointment_id=${targetId}`;
      return safeFallback();

    case "support_ticket":
      if (isAdmin) {
        return `/admin/support?ticket=${targetId}`;
      }

      if (isCashier) {
        return `/staff/support?ticket=${targetId}`;
      }

      return safeFallback();

    default:
      return safeFallback();
  }
}

export default function NotificationBell({ compact = false }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const isAdmin = user?.role === "admin";
  const isIndoorStaff = user?.role === "staff" && user?.staff_type === "indoor";
  const isCashier = user?.role === "staff" && user?.staff_type === "cashier";
  const isDeliveryRider =
    user?.role === "staff" && user?.staff_type === "delivery_rider";
  const useMonochromeNotification = isCashier || isDeliveryRider;

  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markingInFlightRef = useRef(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/tasks/notifications");
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
      await api.patch("/tasks/notifications/read-all");
      setNotifications((p) => p.map((n) => ({ ...n, is_read: 1 })));
      toast.success("All notifications cleared.");
    } catch {}
  };

  // Guarded so the same notification is never PATCHed twice concurrently
  // (prevents duplicate requests / HTTP 429 from rapid clicks).
  const markOneRead = useCallback(
    async (id) => {
      if (markingInFlightRef.current.has(id)) return;
      const alreadyRead = notifications.find((n) => n.id === id)?.is_read;
      if (alreadyRead) return;

      markingInFlightRef.current.add(id);
      try {
        await api.patch(`/tasks/notifications/${id}/read`);
        if (isMountedRef.current) {
          setNotifications((p) =>
            p.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)),
          );
        }
      } catch {
        // Best-effort — a failed mark-as-read must never block navigation
        // or surface an error to the user.
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

    // Once the notification is already read, one click opens its exact
    // related record. Legacy notifications still use the safe role-based
    // fallback defined by resolveNotificationRoute.
    setOpen(false);
    const dest = resolveNotificationRoute(n, {
      isAdmin,
      isIndoorStaff,
      isDeliveryRider,
    });
    navigate(dest);
  };

  return (
    <>
      <button
        className={useMonochromeNotification ? "cashier-notification-trigger" : undefined}
        style={
          compact
            ? { ...S.btnIcon, position: "relative" }
            : { ...S.btn, ...S.btnGray, position: "relative" }
        }
        onClick={() => setOpen(true)}
        aria-label={compact ? "Notifications" : undefined}
        title={compact ? "Notifications" : undefined}
      >
        {compact ? (
          useMonochromeNotification ? (
            <Bell size={20} strokeWidth={1.8} />
          ) : (
            "🔔"
          )
        ) : useMonochromeNotification ? (
          <>
            <Bell size={17} strokeWidth={1.8} />
            <span>Notifications</span>
          </>
        ) : (
          "🔔 Notifications"
        )}
        {unreadCount > 0 && (
          <span
            className={
              useMonochromeNotification
                ? "cashier-notification-count"
                : undefined
            }
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              background: "#dc2626",
              color: "#fff",
              borderRadius: "50%",
              width: 20,
              height: 20,
              fontSize: 10,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #f4f4f5",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={S.overlay} onClick={() => setOpen(false)}>
          <div
            className={useMonochromeNotification ? "cashier-notification-modal" : undefined}
            style={{ ...S.modal, width: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <div
                className={useMonochromeNotification ? "cashier-notification-title" : undefined}
                style={{ ...S.mTitle, marginBottom: 0 }}
              >
                {useMonochromeNotification ? (
                  <>
                    <Bell size={18} strokeWidth={1.8} />
                    <span>Notifications</span>
                  </>
                ) : (
                  "🔔 Notifications"
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  className={useMonochromeNotification ? "cashier-notification-mark-all" : undefined}
                  style={{
                    ...S.btn,
                    ...S.btnGray,
                    fontSize: 12,
                    padding: "6px 12px",
                  }}
                  onClick={markAllRead}
                >
                  Mark all as read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#71717a",
                  padding: 30,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={useMonochromeNotification ? "cashier-notification-item" : undefined}
                  style={S.notifItem(!n.is_read)}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div
                    className={useMonochromeNotification ? "cashier-notification-item-title" : undefined}
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#18181b",
                      marginBottom: 4,
                    }}
                  >
                    {n.title}
                  </div>
                  <div
                    className={useMonochromeNotification ? "cashier-notification-item-message" : undefined}
                    style={{
                      fontSize: 13,
                      color: "#52525b",
                      marginBottom: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    {n.message}
                  </div>
                  <div
                    className={useMonochromeNotification ? "cashier-notification-meta" : undefined}
                    style={{
                      fontSize: 11,
                      color: "#71717a",
                      display: "flex",
                      justifyContent: "space-between",
                      fontWeight: 600,
                    }}
                  >
                    <span>
                      {new Date(n.created_at).toLocaleString("en-PH")}
                    </span>
                    {!n.is_read && (
                      <span className={useMonochromeNotification ? "cashier-notification-unread" : undefined} style={{ color: "#0a0a0a", fontWeight: 800 }}>
                        ● Unread
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 16,
              }}
            >
              <button
                className={useMonochromeNotification ? "cashier-notification-close" : undefined}
                style={{ ...S.btn, ...S.btnGray }}
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
