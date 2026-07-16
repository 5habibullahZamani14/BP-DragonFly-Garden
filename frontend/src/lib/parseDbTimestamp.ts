export type TimeframeValue = "all" | "today" | "yesterday" | "week" | "month" | "custom";

export function parseDbTimestamp(raw?: string | null): Date | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  const sqliteUtcPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const normalized = sqliteUtcPattern.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value.replace(" ", "T");

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function matchesTimeframe(
  rawDate: string | null | undefined,
  timeframe: TimeframeValue,
  startDate = "",
  endDate = ""
): boolean {
  const date = parseDbTimestamp(rawDate);
  if (!date) return false;
  if (timeframe === "all") return true;

  const now = new Date();
  const todayStr = getLocalDateString(now);
  const itemDateStr = getLocalDateString(date);

  if (timeframe === "today") return itemDateStr === todayStr;
  if (timeframe === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return itemDateStr === getLocalDateString(yesterday);
  }
  if (timeframe === "week") {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return date >= sevenDaysAgo;
  }
  if (timeframe === "month") {
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return date >= thirtyDaysAgo;
  }
  if (timeframe === "custom") {
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (date < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (date > end) return false;
    }
    return true;
  }
  return true;
}
