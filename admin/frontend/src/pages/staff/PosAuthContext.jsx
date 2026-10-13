import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

// Requests use /api/... paths, so keep baseURL as host only.
axios.defaults.baseURL =
  window.location.hostname === "localhost" ? "http://localhost:5000" : "";

// Send the HttpOnly session cookie with API requests.
axios.defaults.withCredentials = true;

const LOGIN_PATH = "/login";
const SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Retain the existing context interface for compatibility.
  // Authentication is now validated by the server session cookie.
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearLocalAuthState = () => {
    // Remove legacy authentication credentials from both browser storages.
    const legacyAuthKeys = [
      "wisdom_token",
      "cust_token",
      "token",
      "pos_token",
      "wisdom_user",
      "cust_user",
      "user",
      "pos_user",
    ];

    for (const key of legacyAuthKeys) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }

    delete axios.defaults.headers.common.Authorization;

    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        // The server validates the HttpOnly cookie.
        const response = await axios.get("/api/auth/me");
        const currentUser = response.data?.user ?? response.data;

        if (!["admin", "staff"].includes(currentUser?.role)) {
          throw new Error("This login context is for staff/admin only.");
        }

        if (mounted) {
          setUser(currentUser);
          setToken(null);
        }
      } catch {
        clearLocalAuthState();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Remove old JWTs left by the previous authentication implementation.
    localStorage.removeItem("wisdom_token");
    localStorage.removeItem("token");
    localStorage.removeItem("pos_token");
    delete axios.defaults.headers.common.Authorization;

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let logoutInProgress = false;

    const markLogoutInProgress = () => {
      logoutInProgress = true;
    };

    window.addEventListener("wisdom:logout-started", markLogoutInProgress);

    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const requestUrl = error.config?.url || "";
        const status = error.response?.status;

        const isLoginRequest =
          requestUrl.includes("/api/auth/login") ||
          requestUrl.includes("/auth/login");

        const isLogoutRequest =
          requestUrl.includes("/api/auth/logout") ||
          requestUrl.includes("/auth/logout");

        if (
          status === 401 &&
          !isLoginRequest &&
          !isLogoutRequest &&
          !logoutInProgress
        ) {
          clearLocalAuthState();

          sessionStorage.setItem("auth_notice", SESSION_EXPIRED_MESSAGE);

          if (window.location.pathname !== LOGIN_PATH) {
            window.location.replace(LOGIN_PATH);
          }
        }

        return Promise.reject(error);
      },
    );

    return () => {
      window.removeEventListener("wisdom:logout-started", markLogoutInProgress);
      axios.interceptors.response.eject(interceptorId);
    };
  }, []);

  const login = async (email, password) => {
    const response = await axios.post("/api/auth/login", {
      email,
      password,
    });

    const newUser = response.data?.user;

    if (!["admin", "staff"].includes(newUser?.role)) {
      // Do not leave a customer session active in the staff/admin context.
      try {
        await axios.post("/api/auth/logout");
      } catch {
        // The role restriction still applies if logout cannot be completed.
      }

      throw new Error("This login context is for staff/admin only.");
    }

    // Authentication is managed by the server-side HttpOnly session cookie.
    // Keep the user profile in React memory, not browser storage.
    localStorage.removeItem("wisdom_token");
    localStorage.removeItem("token");
    localStorage.removeItem("pos_token");
    localStorage.removeItem("wisdom_user");
    localStorage.removeItem("user");
    localStorage.removeItem("pos_user");

    sessionStorage.removeItem("wisdom_token");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("pos_token");
    sessionStorage.removeItem("wisdom_user");
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("pos_user");

    delete axios.defaults.headers.common.Authorization;

    sessionStorage.removeItem("auth_notice");

    setToken(null);
    setUser(newUser);

    return newUser;
  };

  const logout = async () => {
    window.dispatchEvent(new Event("wisdom:logout-started"));

    try {
      // Revoke the server-side session and clear its HttpOnly cookie.
      await axios.post("/api/auth/logout");
    } catch (error) {
      console.error(
        "Unable to confirm server-side logout. The session may remain active until it expires.",
      );
    } finally {
      clearLocalAuthState();
      sessionStorage.removeItem("auth_notice");

      if (window.location.pathname !== LOGIN_PATH) {
        window.location.replace(LOGIN_PATH);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
