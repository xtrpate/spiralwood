import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

// Since requests already use /api/...,
// keep baseURL as host only, NOT host + /api
axios.defaults.baseURL =
  window.location.hostname === "localhost" ? "http://localhost:5000" : "";

const LOGIN_PATH = "/login";
const SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("wisdom_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("wisdom_user");
    const storedToken = localStorage.getItem("wisdom_token");

    if (storedToken) {
      axios.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
      setToken(storedToken);

      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem("wisdom_user");
          setUser(null);
        }
      }
    } else {
      delete axios.defaults.headers.common.Authorization;
      setToken(null);
      setUser(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const requestUrl = error.config?.url || "";
        const status = error.response?.status;
        const message = error.response?.data?.message || "";

        const isLoginRequest =
          requestUrl.includes("/api/customer/auth/login") ||
          requestUrl.includes("/customer/auth/login");

        const isTrulyExpiredToken =
          status === 401 &&
          (message === "Invalid or expired token" ||
            message.toLowerCase().includes("jwt expired") ||
            message.toLowerCase().includes("invalid token"));

        if (!isLoginRequest && isTrulyExpiredToken) {
          localStorage.removeItem("wisdom_token");
          localStorage.removeItem("wisdom_user");
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("pos_token");
          localStorage.removeItem("pos_user");

          sessionStorage.setItem("auth_notice", SESSION_EXPIRED_MESSAGE);

          delete axios.defaults.headers.common.Authorization;

          setToken(null);
          setUser(null);

          if (window.location.pathname !== LOGIN_PATH) {
            window.location.replace(LOGIN_PATH);
          }
        }

        return Promise.reject(error);
      },
    );

    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, []);

  const login = async (email, password) => {
    const res = await axios.post("/api/customer/auth/login", {
      email,
      password,
    });

    const { token: newToken, user: newUser } = res.data;

    if (!["admin", "staff"].includes(newUser?.role)) {
      throw new Error("This login context is for staff/admin only.");
    }

    localStorage.setItem("wisdom_token", newToken);
    localStorage.setItem("wisdom_user", JSON.stringify(newUser));
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));

    sessionStorage.removeItem("auth_notice");

    axios.defaults.headers.common.Authorization = `Bearer ${newToken}`;

    setToken(newToken);
    setUser(newUser);

    return newUser;
  };

  const logout = () => {
    localStorage.removeItem("wisdom_token");
    localStorage.removeItem("wisdom_user");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_user");

    sessionStorage.removeItem("auth_notice");

    delete axios.defaults.headers.common.Authorization;

    setToken(null);
    setUser(null);

    if (window.location.pathname !== LOGIN_PATH) {
      window.location.replace(LOGIN_PATH);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);