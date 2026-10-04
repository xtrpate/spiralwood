const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const helperPath = require.resolve("../utils/notificationHelper");

const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

async function run() {
  const previousGlobalIo = global.io;
  const emitted = [];

  global.io = {
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };

  delete require.cache[helperPath];
  const { createNotification } = require("../utils/notificationHelper");

  const poolRunner = {
    async query() {
      return [{ insertId: 101 }];
    },
  };

  await createNotification(poolRunner, {
    userId: 7,
    type: "order_update",
    title: "Order Updated",
    message: "Realtime payload must reach only the owned user room.",
    targetType: "order",
    targetId: 88,
    targetOrderId: 88,
  });

  assert.equal(emitted.length, 1, "Standalone notification must emit once.");
  assert.equal(emitted[0].room, "user:7");
  assert.equal(emitted[0].event, "notification:new");
  assert.equal(emitted[0].payload.id, 101);
  assert.equal(emitted[0].payload.user_id, 7);

  const transactionEvents = [];
  let nextInsertId = 200;
  const connection = {
    async beginTransaction() {
      transactionEvents.push("begin");
    },
    async commit() {
      transactionEvents.push("commit");
    },
    async rollback() {
      transactionEvents.push("rollback");
    },
    async query() {
      nextInsertId += 1;
      return [{ insertId: nextInsertId }];
    },
  };

  await connection.beginTransaction();
  await createNotification(connection, {
    userId: 8,
    type: "task_update",
    title: "Task Updated",
    message: "Must wait for commit.",
    targetType: "task",
    targetId: 12,
  });

  assert.equal(
    emitted.length,
    1,
    "Transactional notification must not emit before commit.",
  );

  await connection.commit();
  assert.equal(
    emitted.length,
    2,
    "Committed transactional notification must emit exactly once.",
  );
  assert.equal(emitted[1].room, "user:8");
  assert.equal(emitted[1].payload.id, 201);

  await connection.beginTransaction();
  await createNotification(connection, {
    userId: 9,
    type: "delivery_update",
    title: "Delivery Updated",
    message: "Rollback must suppress realtime delivery.",
    targetType: "delivery",
    targetId: 33,
  });
  await connection.rollback();

  assert.equal(
    emitted.length,
    2,
    "Rolled-back notification must never emit to the socket.",
  );

  const managementSource = read(
    "admin/backend/controllers/admin/managementController.js",
  );
  const helperSource = read("admin/backend/utils/notificationHelper.js");
  const bellSource = read("admin/frontend/src/components/NotificationBell.jsx");
  const posLayoutSource = read("admin/frontend/src/pages/staff/POSLayout.jsx");

  assert.match(
    managementSource,
    /const disconnectRevokedInternalUserSockets = \(req, userId\) =>/,
    "Internal-user socket revoke helper must exist.",
  );

  const revokeCalls =
    managementSource.match(
      /disconnectRevokedInternalUserSockets\(req, targetId\);/g,
    ) || [];
  assert.equal(
    revokeCalls.length,
    4,
    "Role/access changes, password reset, deactivation, and authority changes must revoke existing sockets.",
  );

  assert.match(
    managementSource,
    /room\.disconnectSockets\(true\)/,
    "Revocation must force-disconnect sockets in the user's room.",
  );

  assert.doesNotMatch(
    helperSource,
    /Sending new notification:\s*",\s*payload/,
    "Full notification payloads must not be logged.",
  );
  assert.match(
    helperSource,
    /process\.env\.NODE_ENV !== "production"/,
    "Realtime emit logging must be suppressed in production.",
  );
  assert.match(
    helperSource,
    /id:\s*payload\.id[\s\S]*type:\s*payload\.type/,
    "Development logging should contain only safe notification metadata.",
  );

  assert.match(
    bellSource,
    /setHistoryHasMore\(\s*\(hasMore\) =>\s*hasMore && data\.length === NOTIFICATION_PAGE_SIZE/,
    "Staff/admin reconnect must preserve an exhausted notification history state.",
  );

  assert.match(
    posLayoutSource,
    /const \[isStaffCompactViewport, setIsStaffCompactViewport\] = useState/,
    "POS layout must track the active staff viewport mode.",
  );
  assert.match(
    posLayoutSource,
    /setIsStaffCompactViewport\(event\.matches\)/,
    "Viewport mode must stay synchronized with the existing 899px breakpoint.",
  );
  assert.match(
    posLayoutSource,
    /isStaffCompactViewport && <NotificationBell compact \/>/,
    "Compact staff shell must own the single mobile notification bell.",
  );
  assert.match(
    posLayoutSource,
    /!isStaffCompactViewport &&[\s\S]*mini-bell-wrapper/,
    "Collapsed desktop sidebar bell must not mount in compact mode.",
  );
  assert.match(
    posLayoutSource,
    /!isStaffCompactViewport &&[\s\S]*sidebarOpen &&[\s\S]*<NotificationBell compact \/>/,
    "Expanded desktop sidebar bell must not mount in compact mode.",
  );

  console.log("PASS: Real-Time Notifications R1 integrity checks passed.");

  global.io = previousGlobalIo;
}

run().catch((error) => {
  console.error("FAIL: Real-Time Notifications R1 integrity checks failed.");
  console.error(error);
  process.exitCode = 1;
});
