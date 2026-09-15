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

const PH_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const PH_WALL_CLOCK_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

const getPHWallClockParts = (value) => {
  if (value === null || value === undefined || value === "") return null;

  const raw =
    value instanceof Date ? value.toISOString() : String(value).trim();
  const match = raw.match(PH_WALL_CLOCK_DATE_TIME);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);
  const millisecond = Number((match[7] || "").padEnd(3, "0") || 0);

  const validation = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond),
  );

  if (
    validation.getUTCFullYear() !== year ||
    validation.getUTCMonth() !== month - 1 ||
    validation.getUTCDate() !== day ||
    validation.getUTCHours() !== hour ||
    validation.getUTCMinutes() !== minute ||
    validation.getUTCSeconds() !== second
  ) {
    return null;
  }

  return { year, month, day, hour, minute, second, millisecond };
};

export const parsePHWallClockDateTime = (value) => {
  const parts = getPHWallClockParts(value);
  if (!parts) return null;

  const utcMillis =
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - PH_UTC_OFFSET_MS;

  const date = new Date(utcMillis);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatPHWallClockDateTime = (value, options = {}) => {
  const date = parsePHWallClockDateTime(value);
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

export const formatPHWallClockDate = (value, options = {}) => {
  const date = parsePHWallClockDateTime(value);
  if (!date) return "\u2014";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  }).format(date);
};

export const toPHWallClockDateTimeLocal = (value) => {
  const parts = getPHWallClockParts(value);
  if (!parts) return "";

  const pad = (number) => String(number).padStart(2, "0");
  return [
    String(parts.year).padStart(4, "0"),
    "-",
    pad(parts.month),
    "-",
    pad(parts.day),
    "T",
    pad(parts.hour),
    ":",
    pad(parts.minute),
  ].join("");
};

export const formatPHDateTimeLocalInput = (value = new Date()) => {
  const date = parseSystemDateTime(value);
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const byType = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  if (
    !byType.year ||
    !byType.month ||
    !byType.day ||
    !byType.hour ||
    !byType.minute
  ) {
    return "";
  }

  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`;
};
