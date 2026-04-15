import { create } from "zustand";
import api from "../services/api";

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("wisdom_user") || "null");
  } catch {
    return null;
  }
};

const savedUser = getStoredUser();
const savedToken = localStorage.getItem("wisdom_token") || null;

if (savedToken) {
  api.defaults.headers.common.Authorization = `Bearer ${savedToken}`;
} else {
  delete api.defaults.headers.common.Authorization;
}

const persistSession = (token, user) => {
  localStorage.setItem("wisdom_token", token);
  localStorage.setItem("wisdom_user", JSON.stringify(user));

  // legacy/shared keys para sa ibang pages na umaasa pa dito
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));

  // clear old POS-only session para walang banggaan
  localStorage.removeItem("pos_token");
  localStorage.removeItem("pos_user");

  api.defaults.headers.common.Authorization = `Bearer ${token}`;
};

const clearSession = () => {
  localStorage.removeItem("wisdom_token");
  localStorage.removeItem("wisdom_user");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("pos_token");
  localStorage.removeItem("pos_user");

  delete api.defaults.headers.common.Authorization;
};

const useAuthStore = create((set, get) => ({
  user: savedUser,
  token: savedToken,

  login: async (email, password) => {
    const cleanEmail = String(email || "").trim();

    try {
      const { data } = await api.post("/auth/login", {
        email: cleanEmail,
        password,
      });

      persistSession(data.token, data.user);

      set({
        user: data.user,
        token: data.token,
      });

      return data.user;
    } catch (adminErr) {
      const { data } = await api.post("/customer/auth/login", {
        email: cleanEmail,
        password,
      });

      persistSession(data.token, data.user);

      set({
        user: data.user,
        token: data.token,
      });

      return data.user;
    }
  },

  register: async (userData) => {
    const { data } = await api.post("/customer/auth/register", userData);
    return data;
  },

  verifyOtp: async (email, otp) => {
    const { data } = await api.post("/customer/auth/verify-otp", {
      email,
      otp,
    });
    return data;
  },

  resendOtp: async (email) => {
    const { data } = await api.post("/customer/auth/resend-otp", { email });
    return data;
  },

  forgotPassword: async (email) => {
    const { data } = await api.post("/customer/auth/forgot-password", {
      email: String(email || "").trim(),
    });
    return data;
  },

  resetPassword: async (email, otp, newPassword) => {
    const { data } = await api.post("/customer/auth/reset-password", {
      email: String(email || "").trim(),
      otp: String(otp || "").trim(),
      new_password: newPassword,
    });
    return data;
  },

  logout: () => {
    clearSession();
    set({
      user: null,
      token: null,
    });
  },

  refreshMe: async () => {
    const token = get().token || localStorage.getItem("wisdom_token");
    const storedUser = getStoredUser();

    if (!token) {
      clearSession();
      set({ user: null, token: null });
      return null;
    }

    api.defaults.headers.common.Authorization = `Bearer ${token}`;

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

        localStorage.setItem("wisdom_user", JSON.stringify(mergedUser));
        localStorage.setItem("user", JSON.stringify(mergedUser));
        set({ user: mergedUser, token });
        return mergedUser;
      }

      if (storedUser?.role === "customer") {
        set({ user: storedUser, token });
        return storedUser;
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
