import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateInputPicker } from "@/components/ui/DateInputPicker";
import { formatDatePickerValue, parseDatePickerValue } from "@/lib/datePickerFormat";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", resolvedLanguage: "en" },
  }),
}));

describe("date picker formatting", () => {
  it("formats and parses the visible day-month-year value while keeping ISO state", () => {
    expect(formatDatePickerValue("1993-08-06", "en")).toBe("06 / Aug / 1993");
    expect(parseDatePickerValue("06 / Aug / 1993", "en")).toBe("1993-08-06");
    expect(parseDatePickerValue("1993-08-06", "en")).toBe("1993-08-06");
    expect(parseDatePickerValue("29 / Feb / 2025", "en")).toBeNull();
    expect(parseDatePickerValue("29 / Feb / 2024", "en")).toBe("2024-02-29");
  });

  it("accepts localized numerals and month names for direct date editing", () => {
    expect(parseDatePickerValue("٠٦ / أغسطس / ١٩٩٣", "ar")).toBe("1993-08-06");
  });

  it("walks through year, month, then day before applying the selected date", async () => {
    const onChange = vi.fn();
    render(
      <DateInputPicker
        value="1993-08-06"
        onChange={onChange}
        label="Birthdate"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "m.datePickerChoose Birthdate" }));
    expect(await screen.findByRole("region", { name: "m.datePickerYear" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "m.datePickerYear 1994" }));
    expect(screen.getByRole("region", { name: "m.datePickerMonth" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("region", { name: "m.datePickerMonth" }))
      .getByRole("button", { name: "m.datePickerMonth August" }));
    expect(screen.getByRole("region", { name: "m.datePickerDay" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "m.datePickerDay 7 August 1994" }));
    fireEvent.click(screen.getByRole("button", { name: "m.timePickerConfirm" }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("1994-08-07"));
  });

  it("allows direct edits in the year-month-day keyboard mode", async () => {
    const onChange = vi.fn();
    render(
      <DateInputPicker
        value="1993-08-06"
        onChange={onChange}
        label="Birthdate"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "m.datePickerChoose Birthdate" }));
    fireEvent.click(await screen.findByRole("button", { name: "m.datePickerKeyboard" }));
    fireEvent.change(screen.getByRole("textbox", { name: "m.datePickerYear" }), { target: { value: "2024" } });
    fireEvent.change(screen.getByRole("textbox", { name: "m.datePickerMonth" }), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("textbox", { name: "m.datePickerDay" }), { target: { value: "29" } });
    fireEvent.click(screen.getByRole("button", { name: "m.timePickerConfirm" }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("2024-02-29"));
  });
});
