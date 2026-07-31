// backend/utils/notificationHelper.js
//
// Centralized notification-insert helper for the click-navigation
// feature. Two entry points, matching the two failure behaviors that
// already existed across the codebase before this change:
//
//   createNotification(runner, {...})
//     STRICT — no internal try/catch. If the INSERT fails, it throws
//     and the caller's own transaction/catch handles it (which, at the
//     call sites that use this, means the surrounding transaction rolls
//     back). Use this only where the original code already let the
//     notification INSERT fail loudly.
//
//   createNotificationSafe(runner, {...})
//     SAFE / best-effort — internal try/catch. Logs and resolves
//     without throwing, so a notification failure can never turn a
//     successful business operation (order update, task update,
//     delivery update, payment update) into an HTTP 500. Use this for
//     every call site that was already wrapped in its own try/catch
//     (or equivalent local helper) before this change.
//
// `runner` is either a live transaction connection (`conn`, mid
// transaction — must be `conn.query`/`conn.execute` compatible) or the
// pool (`db`) for standalone inserts. This matches the mixed usage
// already present in the codebase (some sites insert via `conn` inside
// a transaction, some via `db` directly).
//
// CommonJS throughout — module.exports / require only.

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

/**
 * STRICT insert. Throws on failure — caller/transaction must handle it.
 * Mirrors the previously-unwrapped `await conn.query(\`INSERT INTO
 * notifications ...\`)` call sites.
 */
async function createNotification(runner, options) {
  const userId = options && options.userId;
  if (!userId) return;

  const { sql, params } = buildInsert(options);
  await runner.query(sql, params);
}

/**
 * SAFE / best-effort insert. Never throws — logs and returns.
 * Mirrors the previously try/catch-wrapped call sites and local
 * `insertNotificationSafe` / `sendSystemNotificationSafe` /
 * `adminInsertDiscussionNotificationSafe` helpers.
 */
async function createNotificationSafe(runner, options) {
  const userId = options && options.userId;
  if (!userId) return;

  try {
    const { sql, params } = buildInsert(options);
    await runner.query(sql, params);
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