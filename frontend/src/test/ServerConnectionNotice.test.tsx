import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerConnectionNotice } from "@/components/ServerConnectionNotice";
import { useServerConnectionNotice } from "@/lib/useServerConnectionNotice";
import { useWebSocketConnectionStatus } from "@/lib/useWebSocket";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/useWebSocket", () => ({
  useWebSocketConnectionStatus: vi.fn(),
}));

const Notice = () => <ServerConnectionNotice kind={useServerConnectionNotice()} />;

describe("ServerConnectionNotice", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.mocked(useWebSocketConnectionStatus).mockReturnValue({
      activeConnections: 1,
      connectedConnections: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("announces server outages and clears the notice after health checks recover", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) });

    render(<Notice />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/health$/);
    expect(screen.getByRole("status").textContent).toContain("connection.retryingTitle");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("alert").textContent).toContain("connection.offlineTitle");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toContain("connection.restoredTitle");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("distinguishes a live-update reconnect from an unavailable server", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) });
    vi.mocked(useWebSocketConnectionStatus).mockReturnValue({
      activeConnections: 1,
      connectedConnections: 0,
    });

    render(<Notice />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("status").textContent).toContain("connection.liveUpdatesTitle");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
