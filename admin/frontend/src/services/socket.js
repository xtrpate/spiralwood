import { io } from "socket.io-client";

const SOCKET_URL = (() => {
  const configured = String(process.env.REACT_APP_API_URL || "").trim();

  if (configured) {
    return configured.replace(/\/api\/?$/i, "");
  }

  if (window.location.hostname === "localhost") {
    return "http://localhost:5000";
  }

  return window.location.origin;
})();

let socket = null;

const socketReadyListeners = new Set();

const notifySocketReady = () => {
  socketReadyListeners.forEach((listener) => {
    try {
      listener(socket);
    } catch (err) {
      console.error("[SOCKET READY LISTENER]", err);
    }
  });
};

export const connectSocket = (token) => {
  const cleanToken = String(token || "").trim();

  if (!cleanToken) {
    return null;
  }

  if (socket) {
    const currentToken = String(socket.auth?.token || "");

    if (currentToken === cleanToken) {
      if (!socket.connected) {
        socket.connect();
      }

      if (socket.connected) {
        notifySocketReady();
      }

      return socket;
    }

    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    auth: {
      token: cleanToken,
    },
    withCredentials: true,
    reconnection: true,
  });

  socket.on("connect", () => {
    notifySocketReady();
  });

  return socket;
};

export const getSocket = () => socket;

export const subscribeSocketReady = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }

  socketReadyListeners.add(listener);

  if (socket?.connected) {
    try {
      listener(socket);
    } catch (err) {
      console.error("[SOCKET READY LISTENER]", err);
    }
  }

  return () => {
    socketReadyListeners.delete(listener);
  };
};

export const disconnectSocket = () => {
  if (!socket) return;

  socket.disconnect();
  socket = null;
};

export default {
  connectSocket,
  getSocket,
  subscribeSocketReady,
  disconnectSocket,
};
