import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveDateTime } from "@/components/garden/LiveDateTime";

describe("LiveDateTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates the displayed time every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 2, 12, 5, 0));
    render(<LiveDateTime />);

    expect(screen.getByText(/12:05:00 PM/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/12:05:01 PM/)).toBeInTheDocument();
  });
});
