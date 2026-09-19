// backend/utils/notificationHelper.js
//
// Centralized notification insert + realtime delivery.
//
// STRICT:
//   createNotification(runner, {...})
//   - throws when the INSERT fails
//   - transaction callers can still roll back normally
//
// SAFE:
//   createNotificationSafe(runner, {...})
//   - logs and resolves when the INSERT fails
//   - notification failure never turns a successful business operation
//     into an HTTP 500
//
// Realtime behavior:
//   - pool/standalone inserts emit immediately after INSERT
//   - transaction-connection inserts are queued
//   - queued notifications emit only after a successful commit
//   - rollback clears queued realtime notifications

const notificationTransactionStates = new WeakMap();

const getSocketIo = () => global.io || null;

const buildInsert = ({
  userId,
  type,
  title,
  message,
  channel = "system",
  targetType = null,
  targetId = null,
  targetOrderId = null,
}) => ({
  sql: `INSERT INTO notifications
          (user_id, type, title, message, is_read, channel, sent_at, created_at,
           target_type, target_id, target_order_id)
        VALUES (?, ?, ?, ?, 0, ?, NOW(), NOW(), ?, ?, ?)`,
  params: [
    userId,
    type,
    title,
    message,
    channel,
    targetType,
    targetId,
    targetOrderId,
  ],
});

const buildRealtimePayload = (options, insertId) => {
  const createdAt = new Date().toISOString();

  return {
    id: Number(insertId) || null,
    user_id: Number(options?.userId) || null,
    type: options?.type || null,
    title: options?.title || "",
    message: options?.message || "",
    is_read: 0,
    channel: options?.channel || "system",
    sent_at: createdAt,
    created_at: createdAt,
    target_type: options?.targetType || null,
    target_id: options?.targetId ? Number(options.targetId) : null,
    target_order_id: options?.targetOrderId
      ? Number(options.targetOrderId)
      : null,
  };
};

const emitRealtimeNotification = (payload) => {
  const io = getSocketIo();

  if (!io || !payload?.user_id) return;

  try {
    io.to(`user:${payload.user_id}`).emit("notification:new", payload);

    console.log("[SOCKET EMIT] Sending new notification:", payload);
  } catch (socketErr) {
    console.error(
      "[NOTIFICATION SOCKET EMIT]",
      socketErr?.message || socketErr,
    );
  }
};

const attachTransactionHooks = (connection) => {
  if (!connection || typeof connection.commit !== "function") {
    return null;
  }

  const existingState = notificationTransactionStates.get(connection);

  if (existingState) {
    return existingState;
  }

  const originalCommit = connection.commit.bind(connection);
  const originalRollback = connection.rollback.bind(connection);
  const originalBeginTransaction =
    typeof connection.beginTransaction === "function"
      ? connection.beginTransaction.bind(connection)
      : null;

  const state = {
    inTransaction: true,
    pending: [],
  };

  connection.commit = async (...args) => {
    try {
      const result = await originalCommit(...args);
      const pending = state.pending.splice(0);

      state.inTransaction = false;

      for (const payload of pending) {
        emitRealtimeNotification(payload);
      }

      return result;
    } catch (err) {
      state.pending.length = 0;
      state.inTransaction = false;
      throw err;
    }
  };

  connection.rollback = async (...args) => {
    state.pending.length = 0;
    state.inTransaction = false;
    return originalRollback(...args);
  };

  if (originalBeginTransaction) {
    connection.beginTransaction = async (...args) => {
      const result = await originalBeginTransaction(...args);
      state.inTransaction = true;
      state.pending.length = 0;
      return result;
    };
  }

  notificationTransactionStates.set(connection, state);

  return state;
};

const queueOrEmitRealtimeNotification = (runner, payload) => {
  const state = attachTransactionHooks(runner);

  if (!state) {
    emitRealtimeNotification(payload);
    return;
  }

  if (state.inTransaction) {
    state.pending.push(payload);
    return;
  }

  emitRealtimeNotification(payload);
};

/**
 * STRICT insert.
 * Throws on database failure.
 */
async function createNotification(runner, options) {
  const userId = options && options.userId;
  if (!userId) return;

  const { sql, params } = buildInsert(options);
  const [result] = await runner.query(sql, params);

  queueOrEmitRealtimeNotification(
    runner,
    buildRealtimePayload(options, result?.insertId),
  );
}

/**
 * SAFE / best-effort insert.
 * Never throws due to notification failures.
 */
async function createNotificationSafe(runner, options) {
  const userId = options && options.userId;
  if (!userId) return;

  try {
    const { sql, params } = buildInsert(options);
    const [result] = await runner.query(sql, params);

    queueOrEmitRealtimeNotification(
      runner,
      buildRealtimePayload(options, result?.insertId),
    );
  } catch (err) {
    console.error(
      "[notificationHelper] createNotificationSafe skipped:",
      err && err.message ? err.message : err,
    );
  }
}

module.exports = {
  createNotification,
  createNotificationSafe,
};
