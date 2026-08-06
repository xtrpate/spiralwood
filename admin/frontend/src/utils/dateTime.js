export const PH_TIME_ZONE = "Asia/Manila";

const MYSQL_DATE_TIME_WITHOUT_ZONE =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const parseSystemDateTime = (value) => {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isNaN(copy.getTime()) ? null : copy;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = MYSQL_DATE_TIME_WITHOUT_ZONE.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : DATE_ONLY.test(raw)
      ? `${raw}T00:00:00+08:00`
      : raw;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatPHDateTime = (value, options = {}) => {
  const date = parseSystemDateTime(value);
  if (!date) return "\u2014";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(date);
};

export const formatPHDate = (value, options = {}) => {
  const date = parseSystemDateTime(value);
  if (!date) return "\u2014";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  }).format(date);
};

export const formatPHTime = (value, options = {}) => {
  const date = parseSystemDateTime(value);
  if (!date) return "\u2014";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(date);
};

export const hasSystemTimestampPassed = (value, now = Date.now()) => {
  const date = parseSystemDateTime(value);
  return Boolean(date && date.getTime() <= now);
};
