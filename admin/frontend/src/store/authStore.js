import { create } from "zustand";
import api from "../services/api";

const AUTH_KEYS = ["wisdom_token", "wisdom_user", "token", "user"];
const POS_KEYS = ["pos_token", "pos_user"];
const REMEMBER_KEY = "wisdom_remember_me";

const parseJson = (value) => {
  try {
    return JSON.parse(value || "null");
  } catch {
    return null;
  }
};

const extractAuthErrorMessage = (
  err,
  fallback = "Incorrect email or password.",
) =>
  err?.response?.data?.message ||
  err?.response?.data?.error ||
  err?.message ||
  fallback;

const getStoredUser = () =>
  parseJson(localStorage.getItem("wisdom_user")) ||
  parseJson(sessionStorage.getItem("wisdom_user")) ||
  parseJson(localStorage.getItem("user")) ||
  parseJson(sessionStorage.getItem("user"));

const getStoredToken = () =>
  localStorage.getItem("wisdom_token") ||
  sessionStorage.getItem("wisdom_token") ||
  localStorage.getItem("token") ||
  sessionStorage.getItem("token") ||
  null;

const normalizePermissionKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizePermissions = (value) => {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(normalizePermissionKey).filter(Boolean))].sort();
};

const hasLocalAuth = () =>
  !!(localStorage.getItem("wisdom_token") || localStorage.getItem("token"));

const getActiveStorage = () => (hasLocalAuth() ? localStorage : sessionStorage);

const syncAuthHeader = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

const removeKeys = (storage, keys) => {
  keys.forEach((key) => storage.removeItem(key));
};

const persistSession = (token, user, rememberMe = false) => {
  const targetStorage = rememberMe ? localStorage : sessionStorage;
  const otherStorage = rememberMe ? sessionStorage : localStorage;

  removeKeys(targetStorage, AUTH_KEYS);
  removeKeys(otherStorage, AUTH_KEYS);

  removeKeys(localStorage, POS_KEYS);
  removeKeys(sessionStorage, POS_KEYS);

  targetStorage.setItem("wisdom_token", token);
  targetStorage.setItem("wisdom_user", JSON.stringify(user));

  // legacy/shared keys para sa ibang pages na umaasa pa dito
  targetStorage.setItem("token", token);
  targetStorage.setItem("user", JSON.stringify(user));

  localStorage.setItem(REMEMBER_KEY, rememberMe ? "true" : "false");

  syncAuthHeader(token);
};

const persistUserOnly = (user) => {
  const storage = getActiveStorage();

  storage.setItem("wisdom_user", JSON.stringify(user));
  storage.setItem("user", JSON.stringify(user));
};

const clearSession = () => {
  removeKeys(localStorage, [...AUTH_KEYS, ...POS_KEYS]);
  removeKeys(sessionStorage, [...AUTH_KEYS, ...POS_KEYS]);

  // IMPORTANT:
  // Huwag buburahin ang cust_cart para hindi mawala ang cart after logout/login
  sessionStorage.removeItem("cust_custom_cart");
  sessionStorage.removeItem("cust_selected_keys");
  sessionStorage.removeItem("cust_selected_custom_checkout");
  sessionStorage.removeItem("pos_cart");

  syncAuthHeader(null);
};

const savedUser = getStoredUser();
const savedToken = getStoredToken();

syncAuthHeader(savedToken);

const useAuthStore = create((set, get) => ({
  user: savedUser,
  token: savedToken,
  permissions: normalizePermissions(savedUser?.permissions),

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
      // Point this to the customer auth controller we just updated!
      const { data } = await api.post("/customer/auth/login", {
        email: cleanEmail,
        password,
        recaptcha_token: recaptchaToken,
      });

      // 2. Persist and Set State
      const permissions = normalizePermissions(data.user?.permissions);

      const normalizedUser = {
        ...data.user,
        permissions,
      };

      persistSession(data.token, normalizedUser, rememberMe);

      set({
        user: normalizedUser,
        token: data.token,
        permissions,
      });

      // 3. Return the user (which includes their role!)
      return data.user;
    } catch (err) {
      // 4. Clean, unified error handling
      const finalError = new Error(
        extractAuthErrorMessage(err, "Incorrect email or password."),
      );

      // Attach response so LoginPage.jsx can read "EMAIL_NOT_VERIFIED"
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
    const { data } = await api.post("/customer/auth/verify-otp", {
      email,
      otp,
    });
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
    const { data } = await api.post("/customer/auth/verify-phone-otp", {
      email,
      otp,
    });

    return data;
  },

  verifyResetOtp: async (email, otp) => {
    const { data } = await api.post("/customer/auth/verify-reset-otp", {
      email,
      otp,
    });

    return data;
  },

  resendOtp: async (email) => {
    const { data } = await api.post("/customer/auth/resend-otp", { email });
    return data;
  },

  resendPhoneOtp: async (email) => {
    const { data } = await api.post("/customer/auth/resend-phone-otp", {
      email,
    });
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

  forgotPassword: async (email, recaptchaToken = "") => {
    const { data } = await api.post("/customer/auth/forgot-password", {
      email: String(email || "").trim(),
      recaptcha_token: recaptchaToken,
    });
    return data;
  },

  resetPassword: async (resetToken, newPassword) => {
    const { data } = await api.post("/customer/auth/reset-password", {
      reset_token: resetToken,
      new_password: newPassword,
    });

    return data;
  },

  completeTemporaryPasswordChange: async (currentPassword, newPassword) => {
    try {
      const { data } = await api.put("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });

      const updatedUser = {
        ...(get().user || {}),
        must_change_password: 0,
        permissions: normalizePermissions(get().permissions),
      };
      const freshToken = data?.token || get().token;
      const rememberMe = localStorage.getItem(REMEMBER_KEY) === "true";

      if (freshToken) {
        persistSession(freshToken, updatedUser, rememberMe);
        set({
          user: updatedUser,
          token: freshToken,
          permissions: normalizePermissions(updatedUser.permissions),
        });
      } else {
        persistUserOnly(updatedUser);
        set({ user: updatedUser });
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

  logout: () => {
    clearSession();

    set({
      user: null,
      token: null,
      permissions: [],
    });
  },

  refreshMe: async () => {
    const token = get().token || getStoredToken();
    const storedUser = getStoredUser();

    if (!token) {
      clearSession();
      set({ user: null, token: null });
      return null;
    }

    syncAuthHeader(token);

    try {
      if (storedUser?.role === "admin" || storedUser?.role === "staff") {
        const { data } = await api.get("/auth/me");

        const mergedUser =
          storedUser?.role === "staff"
            ? {
                ...storedUser,
                ...data,
                staff_type: data?.staff_type || storedUser?.staff_type || null,
              }
            : data;

        const permissions = normalizePermissions(mergedUser?.permissions);

        const normalizedUser = {
          ...mergedUser,
          permissions,
        };

        persistUserOnly(normalizedUser);

        set({
          user: normalizedUser,
          token,
          permissions,
        });

        return normalizedUser;
      }

      if (storedUser?.role === "customer") {
        const permissions = normalizePermissions(storedUser?.permissions);

        const normalizedUser = {
          ...storedUser,
          permissions,
        };

        persistUserOnly(normalizedUser);

        set({
          user: normalizedUser,
          token,
          permissions,
        });

        return normalizedUser;
      }

      clearSession();
      set({ user: null, token: null });
      return null;
    } catch {
      clearSession();
      set({ user: null, token: null });
      return null;
    }
  },
}));

export default useAuthStore;
