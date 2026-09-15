// WISDOM PHILIPPINE BUSINESS TIME V1
// Real event timestamps stay in UTC. These helpers convert Philippine
// calendar boundaries to UTC for database range queries.
const PH_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

const formatMysqlUtcDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("A valid Date is required.");
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
};

const getPhilippineCalendarParts = (value = new Date()) => {
  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(instant.getTime())) {
    throw new TypeError("A valid date/time value is required.");
  }

  // Asia/Manila is UTC+08:00 year-round. Shift the instant, then read the
  // resulting Philippine wall-clock fields through UTC getters so the
  // server operating-system timezone never affects business-day logic.
  const philippineClock = new Date(instant.getTime() + PH_UTC_OFFSET_MS);

  return {
    year: philippineClock.getUTCFullYear(),
    monthIndex: philippineClock.getUTCMonth(),
    day: philippineClock.getUTCDate(),
    dayOfWeek: philippineClock.getUTCDay(),
  };
};

const philippineMidnightAsUtc = (year, monthIndex, day) =>
  new Date(Date.UTC(year, monthIndex, day) - PH_UTC_OFFSET_MS);

const getPhilippineBusinessPeriods = (value = new Date()) => {
  const { year, monthIndex, day, dayOfWeek } =
    getPhilippineCalendarParts(value);

  // Monday = 0 ... Sunday = 6, matching the prior YEARWEEK(..., 1)
  // business-week behavior.
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  const todayStart = philippineMidnightAsUtc(year, monthIndex, day);
  const tomorrowStart = philippineMidnightAsUtc(year, monthIndex, day + 1);
  const weekStart = philippineMidnightAsUtc(
    year,
    monthIndex,
    day - daysSinceMonday,
  );
  const nextWeekStart = philippineMidnightAsUtc(
    year,
    monthIndex,
    day - daysSinceMonday + 7,
  );
  const monthStart = philippineMidnightAsUtc(year, monthIndex, 1);
  const nextMonthStart = philippineMidnightAsUtc(year, monthIndex + 1, 1);

  return {
    todayStart: formatMysqlUtcDateTime(todayStart),
    tomorrowStart: formatMysqlUtcDateTime(tomorrowStart),
    weekStart: formatMysqlUtcDateTime(weekStart),
    nextWeekStart: formatMysqlUtcDateTime(nextWeekStart),
    monthStart: formatMysqlUtcDateTime(monthStart),
    nextMonthStart: formatMysqlUtcDateTime(nextMonthStart),
  };
};

module.exports = {
  PH_UTC_OFFSET_MS,
  formatMysqlUtcDateTime,
  getPhilippineBusinessPeriods,
};
