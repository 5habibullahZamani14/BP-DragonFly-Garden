const TWELVE_HOUR_TIME_PATTERN = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i;
const STORED_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const parse12HourTime = (value: string): string | null => {
  const match = value.trim().match(TWELVE_HOUR_TIME_PATTERN);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12) return null;

  const period = match[3].toUpperCase();
  const hour24 = (hour % 12) + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const formatTime12Hour = (value: string): string => {
  const match = value.match(STORED_TIME_PATTERN);
  if (!match) return "";

  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 < 12 ? "AM" : "PM";
  return `${String(hour12).padStart(2, "0")}:${match[2]} ${period}`;
};

export const formatDateTime12Hour = (value: string | Date, includeSeconds = false): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const dateText = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeText = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" as const } : {}),
    hour12: true,
  });
  return `${dateText} ${timeText}`;
};

export const formatTimestampTime12Hour = (value: string | Date, includeSeconds = false): string => {
  if (typeof value === "string" && STORED_TIME_PATTERN.test(value)) {
    return formatTime12Hour(value);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" as const } : {}),
    hour12: true,
  });
};
