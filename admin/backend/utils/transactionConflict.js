const RETRYABLE_TRANSACTION_CODES = new Set([
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
]);

const RETRYABLE_TRANSACTION_ERRNOS = new Set([1213, 1205]);

const isRetryableTransactionError = (error) => {
  if (!error) return false;

  const code = String(error.code || "").trim().toUpperCase();
  const errno = Number(error.errno);

  return (
    RETRYABLE_TRANSACTION_CODES.has(code) ||
    RETRYABLE_TRANSACTION_ERRNOS.has(errno)
  );
};

const CONCURRENT_UPDATE_REASON_CODE = "CONCURRENT_UPDATE_RETRY";

const buildConcurrentUpdateResponse = (
  message = "This order was updated at the same time by another process. Refresh and try again.",
) => ({
  reason_code: CONCURRENT_UPDATE_REASON_CODE,
  message,
});

module.exports = {
  isRetryableTransactionError,
  CONCURRENT_UPDATE_REASON_CODE,
  buildConcurrentUpdateResponse,
};
