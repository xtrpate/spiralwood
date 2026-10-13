import { create } from "zustand";
import api from "../services/api";
import { connectSocket, disconnectSocket } from "../services/socket";

const AUTH_KEYS = [
  "wisdom_token",
  "cust_token",
  "wisdom_user",
  "cust_user",
  "token",
  "user",
];

const POS_KEYS = ["pos_token", "pos_user"];
const REMEMBER_KEY = "wisdom_remember_me";

// Authentication profiles are kept in application memory only.
// Never restore a user or authentication state from browser storage.

const extractAuthErrorMessage = (
  err,
  fallback = "Incorrect email or password.",
) =>
  err?.response?.data?.message ||
  err?.response?.data?.error ||
  err?.message ||
  fallback;

// Authentication profiles are kept in application memory only.
// Never restore a user or authentication state from browser storage.

const normalizePermissionKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizePermissions = (value) => {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(normalizePermissionKey).filter(Boolean))].sort();
};

const removeKeys = (storage, keys) => {
  keys.forEach((key) => storage.removeItem(key));
};

const getActiveStorage = () =>
  localStorage.getItem(REMEMBER_KEY) === "true" ? localStorage : sessionStorage;

const hasStoredPosQrAttempt = () =>
  Boolean(sessionStorage.getItem("pos_qr_attempt"));

const clearCashierCashState = ({ preserveQrCart = false } = {}) => {
  sessionStorage.removeItem("pos_cash_checkout");

  if (!preserveQrCart || !hasStoredPosQrAttempt()) {
    sessionStorage.removeItem("pos_cart");
  }
};

const persistSession = (rememberMe = false) => {
  // Remove legacy authentication credentials and cached profiles.
  removeKeys(localStorage, AUTH_KEYS);
  removeKeys(sessionStorage, AUTH_KEYS);

  removeKeys(localStorage, POS_KEYS);
  removeKeys(sessionStorage, POS_KEYS);

  // Preserve the existing cashier and QR-cart cleanup behavior.
  clearCashierCashState({ preserveQrCart: true });

  // Remember Me controls the existing preference only.
  // Authentication remains in the server-managed HttpOnly cookie.
  localStorage.setItem(REMEMBER_KEY, rememberMe ? "true" : "false");
};

const persistUserOnly = () => {
  // User profiles belong in application memory, not browser storage.
  removeKeys(localStorage, ["wisdom_user", "user"]);
  removeKeys(sessionStorage, ["wisdom_user", "user"]);
};

const clearSession = () => {
  removeKeys(localStorage, [...AUTH_KEYS, ...POS_KEYS]);
  removeKeys(sessionStorage, [...AUTH_KEYS, ...POS_KEYS]);

  // Preserve the existing customer custom-checkout cleanup behavior.
  sessionStorage.removeItem("cust_custom_cart");
  sessionStorage.removeItem("cust_selected_keys");
  sessionStorage.removeItem("cust_selected_custom_checkout");

  clearCashierCashState();
};

// Remove legacy authentication credentials and cached profiles
// from both browser storage areas.
// Do not clear cart, checkout, or other unrelated browser state.
const LEGACY_AUTH_KEYS = [
  "wisdom_token",
  "cust_token",
  "token",
  "wisdom_user",
  "cust_user",
  "user",
  "pos_token",
  "pos_user",
];

removeKeys(localStorage, LEGACY_AUTH_KEYS);
removeKeys(sessionStorage, LEGACY_AUTH_KEYS);

delete api.defaults.headers.common.Authorization;

// A stored profile is not proof of authentication.
// The server must validate the HttpOnly session cookie.
const savedUser = null;

const useAuthStore = create((set, get) => ({
  user: savedUser,
  token: null,
  permissions: normalizePermissions(savedUser?.permissions),

  // True only after the initial server session check has completed.
  authInitialized: false,

  hasPermission: (permissionKey) => {
    const key = normalizePermissionKey(permissionKey);

    if (!key) return false;

    return get().permissions.includes(key);
  },

  hasAnyPermission: (permissionKeys) => {
    if (!Array.isArray(permissionKeys)) return false;

    return permissionKeys.some((permissionKey) =>
      get().hasPermission(permissionKey),
    );
  },

  setUser: (updater) => {
    const currentUser = get().user;
    const nextUser =
      typeof updater === "function" ? updater(currentUser) : updater;

    const permissions = normalizePermissions(nextUser?.permissions);

    const normalizedUser = nextUser
      ? {
          ...nextUser,
          permissions,
        }
      : null;

    persistUserOnly(normalizedUser);

    set({
      user: normalizedUser,
      permissions,
    });
  },

  login: async (email, password, rememberMe = false, recaptchaToken = "") => {
    const cleanEmail = String(email || "").trim();

    try {
      const { data } = await api.post("/customer/auth/login", {
        email: cleanEmail,
        password,
        recaptcha_token: recaptchaToken,
      });

      const permissions = normalizePermissions(data.user?.permissions);

      const normalizedUser = {
        ...data.user,
        permissions,
      };

      // The backend sets the HttpOnly session cookie.
      // Never persist or keep the returned compatibility JWT.
      persistSession(rememberMe);

      delete api.defaults.headers.common.Authorization;

      set({
        user: normalizedUser,
        token: null,
        permissions,
        authInitialized: true,
      });

      if (normalizedUser?.role) {
        connectSocket();
      }

      return data.user;
    } catch (err) {
      const finalError = new Error(
        extractAuthErrorMessage(err, "Incorrect email or password."),
      );

      // Preserve LoginPage.jsx handling for EMAIL_NOT_VERIFIED and
      // other backend authentication errors.
      if (err.response) {
        finalError.response = err.response;
      }

      throw finalError;
    }
  },

  register: async (userData) => {
    const { data } = await api.post("/customer/auth/register", userData);

    return data;
  },

  invalidateRegistrationEmailOtp: async (email) => {
    const { data } = await api.post(
      "/customer/auth/invalidate-registration-email-otp",
      {
        email,
      },
    );

    return data;
  },

  changeRegistrationEmail: async (currentEmail, newEmail) => {
    const { data } = await api.post(
      "/customer/auth/change-registration-email",
      {
        current_email: currentEmail,
        new_email: newEmail,
      },
    );

    return data;
  },

  verifyOtp: async (email, otp) => {
    const { data } = await api.post(
      "/customer/auth/verify-otp",
      {
        email,
        otp,
      },
      {
        suppressGlobalErrorToast: true,
      },
    );

    return data;
  },

  invalidateRegistrationPhoneOtp: async (email) => {
    const { data } = await api.post(
      "/customer/auth/invalidate-registration-phone-otp",
      {
        email,
      },
    );

    return data;
  },

  changeRegistrationPhone: async (email, newPhone) => {
    const { data } = await api.post(
      "/customer/auth/change-registration-phone",
      {
        email,
        new_phone: newPhone,
      },
    );

    return data;
  },

  verifyPhoneOtp: async (email, otp) => {
    const { data } = await api.post(
      "/customer/auth/verify-phone-otp",
      {
        email,
        otp,
      },
      {
        suppressGlobalErrorToast: true,
      },
    );

    return data;
  },

  verifyResetOtp: async (identifier, otp) => {
    const { data } = await api.post(
      "/customer/auth/verify-reset-otp",
      {
        identifier: String(identifier || "").trim(),
        otp,
      },
      {
        suppressGlobalErrorToast: true,
      },
    );

    return data;
  },

  resendOtp: async (email) => {
    const { data } = await api.post(
      "/customer/auth/resend-otp",
      { email },
      {
        suppressGlobalErrorToast: true,
      },
    );

    return data;
  },

  resendPhoneOtp: async (email) => {
    const { data } = await api.post(
      "/customer/auth/resend-phone-otp",
      {
        email,
      },
      {
        suppressGlobalErrorToast: true,
      },
    );

    return data;
  },

  hasAuthority: (allowedRoles = []) => {
    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    const authority = String(get().user?.authority_level || "user")
      .trim()
      .toLowerCase();

    return allowed
      .map((role) => String(role).toLowerCase())
      .includes(authority);
  },

  forgotPassword: async (identifier, recaptchaToken = "") => {
    const { data } = await api.post("/customer/auth/forgot-password", {
      identifier: String(identifier || "").trim(),
      recaptcha_token: recaptchaToken,
    });

    return data;
  },

  resendResetOtp: async (identifier) => {
    const { data } = await api.post(
      "/customer/auth/resend-reset-otp",
      {
        identifier: String(identifier || "").trim(),
      },
      {
        suppressGlobalErrorToast: true,
      },
    );

    return data;
  },

  resetPassword: async (resetToken, newPassword) => {
    const { data } = await api.post(
      "/customer/auth/reset-password",
      {
        reset_token: resetToken,
        new_password: newPassword,
      },
      {
        suppressGlobalErrorToast: true,
      },
    );

    return data;
  },

  completeTemporaryPasswordChange: async (currentPassword, newPassword) => {
    try {
      await api.put("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });

      const updatedUser = {
        ...(get().user || {}),
        must_change_password: 0,
        permissions: normalizePermissions(get().permissions),
      };

      persistUserOnly(updatedUser);

      delete api.defaults.headers.common.Authorization;

      set({
        user: updatedUser,
        token: null,
        permissions: normalizePermissions(updatedUser.permissions),
      });

      if (updatedUser?.role) {
        connectSocket();
      }

      return updatedUser;
    } catch (err) {
      const wrapped = new Error(
        extractAuthErrorMessage(err, "Password could not be changed."),
      );

      if (err.response) wrapped.response = err.response;

      throw wrapped;
    }
  },

  logout: async () => {
    try {
      // Revoke the server-managed session and clear its HttpOnly cookie.
      await api.post("/auth/logout");
    } catch {
      // Clear local UI state even if the server is temporarily unavailable.
    } finally {
      disconnectSocket();
      clearSession();

      delete api.defaults.headers.common.Authorization;

      set({
        user: null,
        token: null,
        permissions: [],
      });
    }
  },

  refreshMe: async () => {
    try {
      // The browser sends the HttpOnly session cookie automatically.
      // A JWT in frontend state or storage is not required.
      const { data } = await api.get("/auth/me");

      const permissions = normalizePermissions(data?.permissions);

      const normalizedUser = {
        ...data,
        permissions,
      };

      persistUserOnly();

      delete api.defaults.headers.common.Authorization;

      set({
        user: normalizedUser,
        token: null,
        permissions,
        authInitialized: true,
      });

      if (normalizedUser?.role) {
        connectSocket();
      }

      return normalizedUser;
    } catch (err) {
      disconnectSocket();

      const status = err?.response?.status;

      if (status === 401 || status === 403) {
        // Clear authentication credentials and cached profiles only.
        // Preserve carts and checkout data during session validation.
        removeKeys(localStorage, [...AUTH_KEYS, ...POS_KEYS]);
        removeKeys(sessionStorage, [...AUTH_KEYS, ...POS_KEYS]);

        delete api.defaults.headers.common.Authorization;

        set({
          user: null,
          token: null,
          permissions: [],
          authInitialized: true,
        });
      } else {
        // A network or server error does not prove the session is invalid,
        // but it also must not leave an old profile authorized in the UI.
        // Keep the HttpOnly cookie untouched so the session can be retried.
        set({
          user: null,
          token: null,
          permissions: [],
          authInitialized: true,
        });
      }

      return null;
    }
  },
}));

export default useAuthStore;
