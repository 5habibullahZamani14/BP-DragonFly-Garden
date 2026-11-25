export interface DateParts {
  year: number;
  month: number;
  day: number;
}

const LOCAL_DIGIT_SETS = [
  "٠١٢٣٤٥٦٧٨٩",
  "۰۱۲۳۴۵۶۷۸۹",
  "०१२३४५६७८९",
  "০১২৩৪৫৬৭৮৯",
  "０１２３４５６７８９",
];

const normalizeDigits = (value: string) => {
  let normalized = value.replace(/[\u200e\u200f\u061c]/g, "");
  for (const digits of LOCAL_DIGIT_SETS) {
    normalized = normalized.replace(new RegExp(`[${digits}]`, "g"), (digit) => String(digits.indexOf(digit)));
  }
  return normalized;
};

const createDate = ({ year, month, day }: DateParts): Date | null => {
  if (!Number.isInteger(year) || year < 1 || year > 9999 ||
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
};

const monthLabels = (locale: string, style: "short" | "long") =>
  Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2020, index, 1)))
  );

export const parseDatePickerValue = (value: string, locale: string): string | null => {
  const normalized = normalizeDigits(value.trim());
  if (!normalized) return null;

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const date = createDate({ year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) });
    return date ? `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}` : null;
  }

  const tokens = normalized.split("/").map((token) => token.trim());
  if (tokens.length !== 3) return null;

  const [first, monthToken, last] = tokens;
  const yearFirst = /^\d{4}$/.test(first);
  const year = Number(yearFirst ? first : last);
  const day = Number(yearFirst ? last : first);
  let month = /^\d{1,2}$/.test(monthToken) ? Number(monthToken) : 0;

  if (!month) {
    const normalizedMonth = monthToken.replace(/\.$/, "").toLocaleLowerCase(locale);
    const names = [...monthLabels(locale, "short"), ...monthLabels(locale, "long"), ...monthLabels("en", "short"), ...monthLabels("en", "long")];
    month = names.findIndex((name) =>
      normalizeDigits(name).replace(/\.$/, "").toLocaleLowerCase(locale) === normalizedMonth
    ) % 12 + 1;
    if (month === 0) return null;
  }

  const date = createDate({ year, month, day });
  if (!date) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const getDateParts = (value: string): DateParts | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return createDate(parts) ? parts : null;
};

export const formatDatePickerValue = (value: string, locale: string): string => {
  const parts = getDateParts(value);
  if (!parts) return "";
  const month = monthLabels(locale, "short")[parts.month - 1];
  return `${String(parts.day).padStart(2, "0")} / ${month} / ${String(parts.year).padStart(4, "0")}`;
};

export const formatMonthName = (month: number, locale: string, style: "short" | "long" = "long") =>
  monthLabels(locale, style)[month - 1] ?? "";

export const formatWeekdayNames = (locale: string, style: "short" | "narrow" = "short") =>
  Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + index)))
  );

export const getDaysInMonth = (year: number, month: number) => {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
};

export const getFirstWeekdayOfMonth = (year: number, month: number) => {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, 1);
  return date.getUTCDay();
};
