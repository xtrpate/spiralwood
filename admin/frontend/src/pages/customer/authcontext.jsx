/**
 * context/AuthContext.jsx
 * Customer portal — matches wisdom_db + customer.auth.js
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import axios from "axios";

axios.defaults.baseURL =
  process.env.REACT_APP_API_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5000/api"
    : "https://spiralwoodservices.onrender.com/api");

// Use the server-managed HttpOnly session cookie for authentication.
axios.defaults.withCredentials = true;
delete axios.defaults.headers.common.Authorization;

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearCustomerProfile = useCallback(() => {
    localStorage.removeItem("cust_user");
    sessionStorage.removeItem("cust_user");

    // Remove older cached customer profile keys.
    localStorage.removeItem("user");
    localStorage.removeItem("wisdom_user");
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("wisdom_user");

    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      try {
        // baseURL already ends in /api.
        // The browser sends the HttpOnly cookie automatically.
        const response = await axios.get("/auth/me");

        if (!active) return;

        const currentUser = response.data?.user ?? response.data;

        if (currentUser?.role !== "customer") {
          clearCustomerProfile();
          return;
        }

        setUser(currentUser);
        // Keep the customer profile in React memory only.
      } catch (error) {
        if (!active) return;

        const status = error?.response?.status;

        if (status === 401 || status === 403) {
          clearCustomerProfile();
        }

        // Do not treat a network failure as proof that a session
        // is invalid. Keep the UI responsive while reporting no
        // authenticated user until validation succeeds.
      } finally {
        if (active) setLoading(false);
      }
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, [clearCustomerProfile]);

  const register = async (payload) => {
    const res = await axios.post("/customer/auth/register", payload);
    return res.data;
  };

  const verifyOtp = async (email, otp) => {
    const res = await axios.post("/customer/auth/verify-otp", {
      email,
      otp,
    });
    return res.data;
  };

  const resendOtp = async (email) => {
    const res = await axios.post("/customer/auth/resend-otp", { email });
    return res.data;
  };

  const forgotPassword = async (email) => {
    const res = await axios.post("/customer/auth/forgot-password", {
      email,
    });
    return res.data;
  };

  const resetPassword = async (email, otp, newPassword) => {
    const res = await axios.post("/customer/auth/reset-password", {
      email,
      otp,
      new_password: newPassword,
    });
    return res.data;
  };

  const login = async (email, password) => {
    const res = await axios.post("/customer/auth/login", {
      email,
      password,
    });

    const currentUser = res.data?.user;

    if (!currentUser) {
      throw new Error("Login response did not contain user information.");
    }

    // The backend must set the HttpOnly session cookie.
    // Never store the compatibility JWT returned by the backend.
    delete axios.defaults.headers.common.Authorization;

    setUser(currentUser);
    // Keep the customer profile in React memory only.

    return currentUser;
  };

  const logout = async () => {
    await axios.post("/auth/logout");

    delete axios.defaults.headers.common.Authorization;
    clearCustomerProfile();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        register,
        verifyOtp,
        resendOtp,
        forgotPassword,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
