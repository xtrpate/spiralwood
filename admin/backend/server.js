require("dotenv").config();

// Use Philippine Standard Time for Node-generated business dates and labels.
process.env.TZ = process.env.TZ || "Asia/Manila";

const express = require("express");
const http = require("http");
const compression = require("compression");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { Server: SocketIOServer } = require("socket.io");
const { clientIpContextMiddleware } = require("./utils/clientIp");

const adminRoutes = require("./routes/admin");
const customerCustomOrdersRoutes = require("./routes/customer.custom-orders");
const { errorHandler } = require("./middleware/errorHandler");
const { startCronJobs } = require("./services/cronService");
const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
    ].filter(Boolean),
    credentials: true,
  },
});

app.set("io", io);

const jwt = require("jsonwebtoken");

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required."));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [[user]] = await pool.query(
      `SELECT
         id,
         name,
         email,
         role,
         authority_level,
         staff_type,
         is_active,
         token_version,
         must_change_password
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [decoded.id],
    );

    if (!user) {
      return next(new Error("Account not found."));
    }

    if (Number(user.is_active) !== 1) {
      return next(new Error("Account is inactive."));
    }

    if (
      Number(user.token_version || 0) !== Number(decoded.token_version || 0)
    ) {
      return next(new Error("Session has been revoked."));
    }

    socket.user = user;

    next();
  } catch (err) {
    next(new Error("Invalid or expired authentication token."));
  }
});

// io.on("connection", (socket) => {
//   const userId = Number(socket.user?.id);

//   if (Number.isInteger(userId) && userId > 0) {
//     socket.join(`user:${userId}`);
//   }

//   console.log(
//     `[SOCKET CONNECTED] user=${socket.user?.id} role=${socket.user?.role}`,
//   );
// });

io.on("connection", (socket) => {
  const userId = Number(socket.user?.id);
  const role = String(socket.user?.role || "")
    .trim()
    .toLowerCase();

  if (Number.isInteger(userId) && userId > 0) {
    socket.join(`user:${userId}`);
  }

  if (role === "admin" || role === "staff") {
    socket.join("staff-updates");
  }
  console.log(
    `[SOCKET ROOM] user=${socket.user?.id} role=${role} rooms=${[
      ...socket.rooms,
    ].join(",")}`,
  );

  console.log(
    `[SOCKET CONNECTED] user=${socket.user?.id} role=${socket.user?.role}`,
  );

  socket.on("disconnect", (reason) => {
    console.log(
      `[SOCKET DISCONNECTED] user=${socket.user?.id} reason=${reason}`,
    );
  });
});

app.set("trust proxy", 1);

// Capture the visitor address once per request. On Render, the resolver uses
// Cloudflare's trusted visitor-IP header instead of the internal proxy address.
app.use(clientIpContextMiddleware);

app.use(compression());

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
    ].filter(Boolean),
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: "20mb",
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith("/api/customer/paymongo/webhook")) {
        req.rawBody = Buffer.from(buf);
      }
    },
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb",
  }),
);

const readPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// General application traffic needs enough headroom for normal authenticated
// navigation, reports, and background notification polling. The previous
// RATE_LIMIT_MAX=200 value applied one shared per-IP bucket to every /api
// request and could lock out normal users during regular application use.
//
// Use GENERAL_API_RATE_LIMIT_* for this broad safety net. Sensitive auth
// endpoints keep their own much stricter route-specific limiters.
const generalApiLimiter = rateLimit({
  windowMs: readPositiveInt(
    process.env.GENERAL_API_RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
  ),
  max: readPositiveInt(process.env.GENERAL_API_RATE_LIMIT_MAX, 3000),
  message: { message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", generalApiLimiter);

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

// NOTE: Backup files are no longer served via a public express.static route.
// They are downloaded through the authenticated, admin-only
// GET /api/backup/download/:filename route (see routes/admin.js +
// controllers/admin/websiteController.js::downloadBackup).
const { verifyUploadSignature } = require("./utils/signedUrl");

const SENSITIVE_UPLOAD_PREFIXES = [
  "/proofs/",
  "/warranty/",
  "/warranty-replacements/",
  "/deliveries/",
  "/custom-request-assets/",
];

function protectSensitiveUploads(req, res, next) {
  const isSensitive = SENSITIVE_UPLOAD_PREFIXES.some((prefix) =>
    req.path.startsWith(prefix),
  );

  if (!isSensitive) return next(); // product photos, site logo stay public

  const { exp, sig } = req.query;
  if (verifyUploadSignature(req.path, exp, sig)) {
    return next();
  }

  return res.status(403).json({
    message: "Access denied. This file requires a valid link.",
  });
}

app.use(
  "/uploads",
  protectSensitiveUploads,
  express.static(
    path.isAbsolute(uploadDir) ? uploadDir : path.join(__dirname, uploadDir),
    {
      setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".jfif" || ext === ".jpg" || ext === ".jpeg") {
          res.setHeader("Content-Type", "image/jpeg");
        }
        res.setHeader("Content-Disposition", "inline");
      },
    },
  ),
);
app.use("/api/public", require("./routes/public"));
app.use("/api/public/ar", require("./routes/public.ar"));

app.use("/api", require("./routes/admin.oversized-delivery-guard"));
app.use("/api", adminRoutes);
app.use(
  "/api/oversized-delivery",
  require("./routes/admin.oversized-delivery"),
);

app.use("/api/customer/auth", require("./routes/customer.auth"));
app.use("/api/customer/products", require("./routes/customer.products"));
app.use("/api/customer/orders", require("./routes/customer.orders"));
app.use("/api/customer/cart", require("./routes/customer.cart"));
app.use("/api/customer/paymongo", require("./routes/customer.paymongo"));
app.use("/api/customer/profile", require("./routes/customer.profile"));
app.use("/api/customer/blueprints", require("./routes/customer.blueprints"));
app.use(
  "/api/customer/appointments",
  require("./routes/customer.appointments"),
);
app.use("/api/customer/warranty", require("./routes/customer.warranty"));
app.use(
  "/api/customer/custom-orders",
  require("./routes/customer.oversized-delivery-quote"),
);
app.use("/api/customer/custom-orders", customerCustomOrdersRoutes);
app.use(
  "/api/customer/notifications",
  require("./routes/customer.notifications"),
);

app.use("/api/reports", require("./routes/admin.reports"));

app.use("/api/pos/reports", require("./routes/pos.reports"));
app.use("/api/pos/dashboard", require("./routes/pos.dashboard"));
app.use("/api/pos/products", require("./routes/pos.products"));
app.use("/api/pos/orders", require("./routes/pos.orders"));
app.use("/api/pos/qr-payments", require("./routes/pos.qrPayments"));
app.use("/api/pos/blueprints", require("./routes/pos.blueprints"));
app.use("/api/pos/tasks", require("./routes/pos.tasks"));
app.use(
  "/api/pos/blueprint-cash-payments",
  require("./routes/pos.blueprintPayments"),
);
app.use("/api/pos", require("./routes/pos.fulfillment"));
app.use("/api/pos", require("./routes/pos.schedule"));
app.use("/api/pos", require("./routes/pos.receipts"));
app.use("/api/tasks", require("./routes/pos.tasks"));

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1 AS ok");
    res.json({
      status: "ok",
      db: "connected",
      system: "WISDOM Unified System",
      timestamp: new Date(),
    });
  } catch (err) {
    res.status(503).json({
      status: "error",
      db: "disconnected",
      message: err.message,
      timestamp: new Date(),
    });
  }
});

const cron = require("node-cron");
const {
  autoCancelExpiredOrders,
} = require("./controllers/customer/customer.orders");

cron.schedule(
  "0 * * * *",
  () => {
    console.log(
      "Running scheduled task: Checking for expired PayMongo orders...",
    );
    autoCancelExpiredOrders();
  },
  { timezone: "Asia/Manila" },
);

app.use(errorHandler);

httpServer.listen(PORT, () => {
  console.log(`\n🚀  WISDOM Unified API running on http://localhost:${PORT}`);
  console.log(`    Environment: ${process.env.NODE_ENV || "development"}\n`);
  startCronJobs();
});

module.exports = app;
