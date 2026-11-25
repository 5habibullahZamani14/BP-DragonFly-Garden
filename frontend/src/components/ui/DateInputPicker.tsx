import { useEffect, useId, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Keyboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  formatDatePickerValue,
  formatMonthName,
  formatWeekdayNames,
  getDateParts,
  getDaysInMonth,
  getFirstWeekdayOfMonth,
  parseDatePickerValue,
} from "@/lib/datePickerFormat";

interface DateInputPickerProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  id?: string;
  className?: string;
  inputClassName?: string;
}

type DateStep = "year" | "month" | "day";
type DateParts = { year: number; month: number; day: number };

const getParts = (value: string): DateParts => {
  const parts = getDateParts(value);
  if (parts) return parts;
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
};

const getValidDateValue = (parts: DateParts) =>
  parseDatePickerValue(
    `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    "en",
  );

export const DateInputPicker = ({
  value,
  onChange,
  label,
  id,
  className,
  inputClassName,
}: DateInputPickerProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const inputId = useId();
  const [fieldDraft, setFieldDraft] = useState(() => formatDatePickerValue(value, locale));
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(getParts(value).year);
  const [month, setMonth] = useState(getParts(value).month);
  const [day, setDay] = useState(getParts(value).day);
  const [step, setStep] = useState<DateStep>("year");
  const [yearPageStart, setYearPageStart] = useState(Math.max(1, getParts(value).year - 8));
  const [inputMode, setInputMode] = useState<"calendar" | "keyboard">("calendar");

  useEffect(() => {
    setFieldDraft(formatDatePickerValue(value, locale));
  }, [value, locale]);

  const openPicker = () => {
    const parts = getParts(value);
    setYear(parts.year);
    setMonth(parts.month);
    setDay(parts.day);
    setYearPageStart(Math.max(1, Math.min(parts.year - 8, 9999 - 17)));
    setStep("year");
    setInputMode("calendar");
    setOpen(true);
  };

  const applyDate = () => {
    const dateValue = getValidDateValue({ year, month, day });
    if (!dateValue) return;
    onChange(dateValue);
    setOpen(false);
  };

  const weekdayNames = formatWeekdayNames(locale);
  const monthName = formatMonthName(month, locale);
  const years = Array.from({ length: 18 }, (_, index) => yearPageStart + index).filter((value) => value <= 9999);
  const leadingDays = getFirstWeekdayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const validDate = getValidDateValue({ year, month, day });
  const now = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };

  return (
    <>
      <div className={`relative ${className ?? ""}`}>
        <Input
          id={id ?? inputId}
          aria-label={label}
          inputMode="text"
          value={fieldDraft}
          placeholder="DD / MMM / YYYY"
          className={`h-12 rounded-xl border-2 pr-12 text-base font-semibold shadow-sm ${inputClassName ?? ""}`}
          onChange={(event) => {
            const nextDraft = event.target.value;
            setFieldDraft(nextDraft);
            const parsed = parseDatePickerValue(nextDraft, locale);
            if (parsed) onChange(parsed);
          }}
          onBlur={() => {
            if (!parseDatePickerValue(fieldDraft, locale)) {
              setFieldDraft(formatDatePickerValue(value, locale));
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${t("m.datePickerChoose")} ${label}`}
          className="absolute right-1 top-1 h-10 w-10 rounded-lg text-primary hover:bg-accent/30"
          onClick={openPicker}
        >
          <ChevronDown className="h-5 w-5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!h-auto !max-h-[calc(100dvh-2rem)] !w-[calc(100vw-2rem)] !max-w-sm gap-0 overflow-y-auto rounded-3xl border-border/70 bg-card p-0 shadow-2xl sm:rounded-3xl">
          <DialogHeader className="px-6 pb-3 pt-6 text-left">
            <DialogTitle className="text-sm font-semibold tracking-wide text-muted-foreground">
              {label}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("m.datePickerDescription")}</DialogDescription>
          </DialogHeader>

          <div className="px-5">
            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1 rounded-2xl border border-border/70 bg-muted/40 p-3">
              <button
                type="button"
                aria-label={`${t("m.datePickerYear")} ${year}`}
                aria-pressed={step === "year"}
                onClick={() => {
                  setStep("year");
                  setInputMode("calendar");
                }}
                className={`rounded-xl px-2 py-2 text-xl font-semibold tabular-nums transition-colors ${
                  step === "year" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background/70"
                }`}
              >
                {String(year).padStart(4, "0")}
              </button>
              <span className="text-muted-foreground" aria-hidden="true">/</span>
              <button
                type="button"
                aria-label={`${t("m.datePickerMonth")} ${monthName}`}
                aria-pressed={step === "month"}
                onClick={() => {
                  setStep("month");
                  setInputMode("calendar");
                }}
                className={`rounded-xl px-2 py-2 text-lg font-semibold transition-colors ${
                  step === "month" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background/70"
                }`}
              >
                {formatMonthName(month, locale, "short")}
              </button>
              <span className="text-muted-foreground" aria-hidden="true">/</span>
              <button
                type="button"
                aria-label={`${t("m.datePickerDay")} ${day}`}
                aria-pressed={step === "day"}
                onClick={() => {
                  setStep("day");
                  setInputMode("calendar");
                }}
                className={`rounded-xl px-2 py-2 text-xl font-semibold tabular-nums transition-colors ${
                  step === "day" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background/70"
                }`}
              >
                {String(day).padStart(2, "0")}
              </button>
            </div>

            {inputMode === "calendar" && step === "year" && (
              <section aria-label={t("m.datePickerYear")} className="py-4">
                <div className="mb-3 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("m.datePickerPreviousYears")}
                    disabled={yearPageStart <= 1}
                    className="rounded-full text-primary"
                    onClick={() => setYearPageStart((current) => Math.max(1, current - 18))}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {years[0]}–{years[years.length - 1]}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("m.datePickerNextYears")}
                    disabled={yearPageStart + 18 > 9999}
                    className="rounded-full text-primary"
                    onClick={() => setYearPageStart((current) => Math.min(9999 - 17, current + 18))}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {years.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-label={`${t("m.datePickerYear")} ${option}`}
                      aria-pressed={year === option}
                      className={`h-10 rounded-xl text-sm font-medium tabular-nums transition-colors ${
                        year === option
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-accent/40"
                      }`}
                      onClick={() => {
                        setYear(option);
                        setDay((current) => Math.min(current, getDaysInMonth(option, month)));
                        setStep("month");
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {inputMode === "calendar" && step === "month" && (
              <section aria-label={t("m.datePickerMonth")} className="py-4">
                <div className="mb-3 text-center text-sm font-semibold text-muted-foreground">{year}</div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-label={`${t("m.datePickerMonth")} ${formatMonthName(option, locale)}`}
                      aria-pressed={month === option}
                      className={`h-10 rounded-xl px-2 text-sm font-medium transition-colors ${
                        month === option
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-accent/40"
                      }`}
                      onClick={() => {
                        setMonth(option);
                        setDay((current) => Math.min(current, getDaysInMonth(year, option)));
                        setStep("day");
                      }}
                    >
                      {formatMonthName(option, locale, "short")}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {inputMode === "calendar" && step === "day" && (
              <section aria-label={t("m.datePickerDay")} className="py-4">
                <div className="mb-3 text-center text-sm font-semibold text-muted-foreground">
                  {monthName} {year}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {weekdayNames.map((weekday, index) => (
                    <span key={`${weekday}-${index}`} className="py-1 text-[10px] font-semibold text-muted-foreground">
                      {weekday}
                    </span>
                  ))}
                  {Array.from({ length: leadingDays }, (_, index) => (
                    <span key={`empty-${index}`} aria-hidden="true" />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((option) => {
                    const isToday = today.year === year && today.month === month && today.day === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-label={`${t("m.datePickerDay")} ${option} ${monthName} ${year}`}
                        aria-pressed={day === option}
                        className={`aspect-square rounded-full text-sm font-medium tabular-nums transition-colors ${
                          day === option
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : isToday
                              ? "bg-accent/60 text-accent-foreground"
                              : "text-foreground hover:bg-accent/40"
                        }`}
                        onClick={() => setDay(option)}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {inputMode === "keyboard" && (
              <div className="my-5 grid grid-cols-3 gap-3">
                {([
                  { value: year, label: t("m.datePickerYear"), setValue: setYear, maxLength: 4 },
                  { value: month, label: t("m.datePickerMonth"), setValue: setMonth, maxLength: 2 },
                  { value: day, label: t("m.datePickerDay"), setValue: setDay, maxLength: 2 },
                ] as const).map(({ value: part, label: partLabel, setValue, maxLength }) => (
                  <div key={partLabel} className="space-y-2">
                    <label htmlFor={`${inputId}-${partLabel}`} className="text-xs font-medium text-muted-foreground">
                      {partLabel}
                    </label>
                    <Input
                      id={`${inputId}-${partLabel}`}
                      aria-label={partLabel}
                      inputMode="numeric"
                      value={String(part)}
                      maxLength={maxLength}
                      className="h-12 px-2 text-center text-lg font-semibold tabular-nums"
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "").slice(0, maxLength);
                        setValue(digits ? Number(digits) : 0);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={inputMode === "calendar" ? t("m.datePickerKeyboard") : t("m.datePickerCalendar")}
              className="rounded-full text-primary hover:bg-accent/30"
              onClick={() => setInputMode((mode) => mode === "calendar" ? "keyboard" : "calendar")}
            >
              {inputMode === "calendar" ? <Keyboard className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" className="rounded-full text-primary" onClick={() => setOpen(false)}>
                {t("m.cancel")}
              </Button>
              <Button
                type="button"
                className="rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
                disabled={!validDate}
                onClick={applyDate}
              >
                {t("m.timePickerConfirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
