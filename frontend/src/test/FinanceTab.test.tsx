import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceTab } from "@/components/garden/management/FinanceTab";
import { fetchFinanceData } from "@/lib/api";
import { useWebSocket, type WSEventType } from "@/lib/useWebSocket";

const mocks = vi.hoisted(() => ({
  fetchFinanceData: vi.fn(),
  useWebSocket: vi.fn(),
  onEvent: null as ((event: { type: WSEventType; payload: unknown }) => void) | null,
}));

vi.mock("@/lib/api", () => ({
  fetchFinanceData: mocks.fetchFinanceData,
}));

vi.mock("@/lib/useWebSocket", () => ({
  useWebSocket: mocks.useWebSocket,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const financeData = {
  orders: [],
  items: [],
  order_items: [],
  feedbacks: [],
  help_stats: [],
  inventory_forecast: [],
  recipe_ingredients: [],
  help_requests: [],
};

describe("FinanceTab live refresh", () => {
  beforeEach(() => {
    vi.mocked(fetchFinanceData).mockReset();
    vi.mocked(useWebSocket).mockImplementation((_eventTypes, callback) => {
      mocks.onEvent = callback;
      return false;
    });
    vi.mocked(fetchFinanceData).mockResolvedValue(financeData);
  });

  it("refreshes on payment and reconnect events without restoring the initial loading state", async () => {
    render(<FinanceTab />);
    await waitFor(() => expect(fetchFinanceData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("m.calculatingFinance")).not.toBeInTheDocument());

    vi.mocked(fetchFinanceData).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(financeData), 0))
    );
    await act(async () => {
      mocks.onEvent?.({ type: "NEW_PAYMENT", payload: {} });
    });
    await waitFor(() => expect(fetchFinanceData).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("m.calculatingFinance")).not.toBeInTheDocument();

    await act(async () => {
      mocks.onEvent?.({ type: "CONNECTION_RESTORED", payload: {} });
    });
    await waitFor(() => expect(fetchFinanceData).toHaveBeenCalledTimes(3));

    await act(async () => {
      mocks.onEvent?.({ type: "DATA_REFRESH", payload: {} });
    });
    await waitFor(() => expect(fetchFinanceData).toHaveBeenCalledTimes(4));
  });
});
