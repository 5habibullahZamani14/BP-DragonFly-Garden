import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimeInput12Hour } from "@/components/ui/TimeInput12Hour";
import { formatDateTime12Hour, formatTime12Hour, parse12HourTime } from "@/lib/timeFormat";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const pickerLabels = {
  cancelLabel: "Cancel",
  confirmLabel: "OK",
  description: "Choose a time",
  keyboardModeLabel: "Switch to keyboard input",
  clockModeLabel: "Switch to clock face",
};

describe("12-hour time formatting", () => {
  it("converts valid typed AM/PM values to the canonical stored time", () => {
    expect(parse12HourTime("12:05 AM")).toBe("00:05");
    expect(parse12HourTime("12:05 pm")).toBe("12:05");
    expect(parse12HourTime("9:30 PM")).toBe("21:30");
    expect(parse12HourTime("13:00 PM")).toBeNull();
    expect(parse12HourTime("09:60 AM")).toBeNull();
  });

  it("formats stored midnight and noon as distinct AM/PM values", () => {
    expect(formatTime12Hour("00:00")).toBe("12:00 AM");
    expect(formatTime12Hour("12:00")).toBe("12:00 PM");
    expect(formatTime12Hour("23:45")).toBe("11:45 PM");
  });

  it("formats timestamps with an explicit uppercase AM/PM marker", () => {
    expect(formatDateTime12Hour(new Date(2026, 0, 2, 0, 5))).toMatch(/12:05 AM$/);
    expect(formatDateTime12Hour(new Date(2026, 0, 2, 12, 5))).toMatch(/12:05 PM$/);
  });

  it("shows a single editable 12-hour field and preserves valid direct entry", () => {
    const onChange = vi.fn();
    render(
      <TimeInput12Hour
        value="21:30"
        onChange={onChange}
        label="Opening time"
        hourLabel="Hour"
        minuteLabel="Minute"
        {...pickerLabels}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Opening time" });
    expect(input).toHaveValue("09:30 PM");
    fireEvent.change(input, { target: { value: "07:45 AM" } });
    expect(onChange).toHaveBeenLastCalledWith("07:45");
    expect(screen.getByRole("button", { name: "Choose Opening time" })).toBeInTheDocument();
  });

  it("uses the arrow menu to change the AM/PM period", async () => {
    const onChange = vi.fn();
    render(
      <TimeInput12Hour
        value="09:30"
        onChange={onChange}
        label="Opening time"
        hourLabel="Hour"
        minuteLabel="Minute"
        {...pickerLabels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Opening time" }));
    expect(await screen.findByRole("group", { name: "Hour clock selector" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hour 7" }));
    expect(screen.getByRole("group", { name: "Minute clock selector" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Minute 35" }));
    fireEvent.click(screen.getByRole("button", { name: "PM" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("19:35"));
  });

  it("supports exact minute entry from the keyboard mode", async () => {
    const onChange = vi.fn();
    render(
      <TimeInput12Hour
        value="09:30"
        onChange={onChange}
        label="Opening time"
        hourLabel="Hour"
        minuteLabel="Minute"
        {...pickerLabels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Opening time" }));
    fireEvent.click(await screen.findByRole("button", { name: "Switch to keyboard input" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Minute" }), { target: { value: "47" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("09:47"));
  });
});
