import { useEffect, useState } from "react";
import { Clock3, Keyboard, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTime12Hour, parse12HourTime } from "@/lib/timeFormat";

interface TimeInput12HourProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  hourLabel: string;
  minuteLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  keyboardModeLabel: string;
  clockModeLabel: string;
  className?: string;
}

type TimeParts = {
  hour: string;
  minute: string;
  period: "AM" | "PM";
};

const getParts = (value: string): TimeParts => {
  const [storedHour, storedMinute] = value.split(":");
  const hour24 = Number(storedHour);
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23 || !/^[0-5]\d$/.test(storedMinute ?? "")) {
    return { hour: "09", minute: "00", period: "AM" };
  }
  return {
    hour: String(hour24 % 12 || 12).padStart(2, "0"),
    minute: storedMinute,
    period: hour24 < 12 ? "AM" : "PM",
  };
};

const getDialItems = (unit: "hour" | "minute") => unit === "hour"
  ? Array.from({ length: 12 }, (_, index) => {
    const value = index === 0 ? 12 : index;
    return { value, label: String(value) };
  })
  : Array.from({ length: 12 }, (_, index) => {
    const value = index * 5;
    return { value, label: String(value).padStart(2, "0") };
  });

export const TimeInput12Hour = ({
  value,
  onChange,
  label,
  hourLabel,
  minuteLabel,
  cancelLabel,
  confirmLabel,
  description,
  keyboardModeLabel,
  clockModeLabel,
  className,
}: TimeInput12HourProps) => {
  const [fieldDraft, setFieldDraft] = useState(() => formatTime12Hour(value));
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState("09");
  const [draftMinute, setDraftMinute] = useState("00");
  const [period, setPeriod] = useState<"AM" | "PM">("AM");
  const [activeUnit, setActiveUnit] = useState<"hour" | "minute">("hour");
  const [inputMode, setInputMode] = useState<"clock" | "keyboard">("clock");

  useEffect(() => {
    setFieldDraft(formatTime12Hour(value));
  }, [value]);

  const openPicker = () => {
    const parts = getParts(value);
    setDraftHour(parts.hour);
    setDraftMinute(parts.minute);
    setPeriod(parts.period);
    setActiveUnit("hour");
    setInputMode("clock");
    setOpen(true);
  };

  const applyTime = () => {
    const storedTime = parse12HourTime(`${draftHour}:${draftMinute} ${period}`);
    if (!storedTime) return;
    onChange(storedTime);
    setOpen(false);
  };

  const updateDialValue = (nextValue: number) => {
    if (activeUnit === "hour") {
      setDraftHour(String(nextValue).padStart(2, "0"));
      setActiveUnit("minute");
      return;
    }
    setDraftMinute(String(nextValue).padStart(2, "0"));
  };

  const dialItems = getDialItems(activeUnit);
  const selectedDialValue = Number(activeUnit === "hour" ? draftHour : draftMinute);
  const dialAngle = activeUnit === "hour"
    ? (Number(draftHour) % 12) * 30 - 90
    : Number(draftMinute) * 6 - 90;
  const handEndX = 50 + 34 * Math.cos((dialAngle * Math.PI) / 180);
  const handEndY = 50 + 34 * Math.sin((dialAngle * Math.PI) / 180);

  return (
    <>
      <div className={`relative ${className ?? ""}`}>
        <Input
          aria-label={label}
          inputMode="text"
          value={fieldDraft}
          placeholder="09:30 AM"
          className="h-12 rounded-xl border-2 pr-12 text-lg font-semibold shadow-sm"
          onChange={(event) => {
            const nextDraft = event.target.value;
            setFieldDraft(nextDraft);
            const parsed = parse12HourTime(nextDraft);
            if (parsed) onChange(parsed);
          }}
          onBlur={() => {
            if (!parse12HourTime(fieldDraft)) setFieldDraft(formatTime12Hour(value));
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Choose ${label}`}
          className="absolute right-1 top-1 h-10 w-10 rounded-lg text-primary hover:bg-accent/30"
          onClick={openPicker}
        >
          <ChevronDown className="h-5 w-5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="!h-auto !max-h-[calc(100dvh-2rem)] !w-[calc(100vw-2rem)] !max-w-sm gap-0 overflow-y-auto rounded-3xl border-border/70 bg-card p-0 shadow-2xl sm:rounded-3xl"
        >
          <DialogHeader className="px-6 pb-3 pt-6 text-left">
            <DialogTitle className="text-sm font-semibold tracking-wide text-muted-foreground">
              {label}
            </DialogTitle>
            <DialogDescription className="sr-only">{description}</DialogDescription>
          </DialogHeader>

          <div className="px-6">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3">
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={hourLabel}
                  aria-pressed={activeUnit === "hour"}
                  onClick={() => {
                    setInputMode("clock");
                    setActiveUnit("hour");
                  }}
                  className={`min-w-[4.25rem] rounded-xl px-3 py-2 text-4xl font-semibold tabular-nums tracking-tight transition-colors ${
                    activeUnit === "hour"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-background/70"
                  }`}
                >
                  {draftHour}
                </button>
                <span className="text-3xl font-semibold text-muted-foreground" aria-hidden="true">:</span>
                <button
                  type="button"
                  aria-label={minuteLabel}
                  aria-pressed={activeUnit === "minute"}
                  onClick={() => {
                    setInputMode("clock");
                    setActiveUnit("minute");
                  }}
                  className={`min-w-[4.25rem] rounded-xl px-3 py-2 text-4xl font-semibold tabular-nums tracking-tight transition-colors ${
                    activeUnit === "minute"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-background/70"
                  }`}
                >
                  {draftMinute}
                </button>
              </div>

              <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-primary/20 bg-background shadow-sm">
                {(["AM", "PM"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={value}
                    aria-pressed={period === value}
                    onClick={() => setPeriod(value)}
                    className={`px-3 py-2 text-sm font-bold transition-colors ${
                      period === value
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {inputMode === "clock" ? (
              <div
                role="group"
                aria-label={`${activeUnit === "hour" ? hourLabel : minuteLabel} clock selector`}
                className="relative mx-auto my-5 aspect-square w-full max-w-[17rem] rounded-full border border-border/70 bg-muted/30 shadow-inner"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 100 100"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  <line
                    x1="50"
                    y1="50"
                    x2={handEndX}
                    y2={handEndY}
                    stroke="hsl(var(--primary))"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle cx="50" cy="50" r="2.5" fill="hsl(var(--primary))" />
                </svg>
                {dialItems.map(({ value: dialValue, label: dialLabel }, index) => {
                  const angle = (index * 30 - 90) * (Math.PI / 180);
                  const isSelected = selectedDialValue === dialValue;
                  return (
                    <button
                      key={dialValue}
                      type="button"
                      aria-label={activeUnit === "hour"
                        ? `${hourLabel} ${dialLabel}`
                        : `${minuteLabel} ${dialLabel}`}
                      aria-pressed={isSelected}
                      onClick={() => updateDialValue(dialValue)}
                      className={`absolute z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "text-foreground hover:bg-accent/50"
                      }`}
                      style={{
                        left: `${50 + 39 * Math.cos(angle)}%`,
                        top: `${50 + 39 * Math.sin(angle)}%`,
                      }}
                    >
                      {dialLabel}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="my-5 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label htmlFor={`${label}-hour-entry`} className="text-xs font-medium text-muted-foreground">
                    {hourLabel}
                  </label>
                  <Input
                    id={`${label}-hour-entry`}
                    aria-label={hourLabel}
                    inputMode="numeric"
                    value={draftHour}
                    maxLength={2}
                    className="h-12 text-center text-xl font-semibold tabular-nums"
                    onChange={(event) => setDraftHour(event.target.value.replace(/\D/g, "").slice(0, 2))}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor={`${label}-minute-entry`} className="text-xs font-medium text-muted-foreground">
                    {minuteLabel}
                  </label>
                  <Input
                    id={`${label}-minute-entry`}
                    aria-label={minuteLabel}
                    inputMode="numeric"
                    value={draftMinute}
                    maxLength={2}
                    className="h-12 text-center text-xl font-semibold tabular-nums"
                    onChange={(event) => setDraftMinute(event.target.value.replace(/\D/g, "").slice(0, 2))}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={inputMode === "clock" ? keyboardModeLabel : clockModeLabel}
              className="rounded-full text-primary hover:bg-accent/30"
              onClick={() => setInputMode((mode) => mode === "clock" ? "keyboard" : "clock")}
            >
              {inputMode === "clock" ? <Keyboard className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" className="rounded-full text-primary" onClick={() => setOpen(false)}>
                {cancelLabel}
              </Button>
              <Button
                type="button"
                className="rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
                disabled={!parse12HourTime(`${draftHour}:${draftMinute} ${period}`)}
                onClick={applyTime}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
