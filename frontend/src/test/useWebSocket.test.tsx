import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWebSocket, useWebSocketConnectionStatus } from "@/lib/useWebSocket";

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((error: unknown) => void) | null = null;
  public readyState = 0;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    this.readyState = 0;
  }

  close() {
    this.readyState = 3;
    if (typeof this.onclose === "function") {
      this.onclose();
    }
  }

  send() {
    // noop for tests
  }
}

const ManagerWrapper = ({ enabled }: { enabled: boolean }) => {
  const connected = useWebSocket(["MENU_UPDATE"], () => {}, "manager", enabled);
  return <div data-testid="connected">{connected ? "true" : "false"}</div>;
};

const ConnectionStatusWrapper = () => {
  const { activeConnections, connectedConnections } = useWebSocketConnectionStatus();
  return <div data-testid="connection-status">{`${activeConnections}:${connectedConnections}`}</div>;
};

const ReconnectWrapper = ({ onReconnect }: { onReconnect: () => void }) => {
  useWebSocket(["CONNECTION_RESTORED"], (event) => {
    if (event.type === "CONNECTION_RESTORED") onReconnect();
  }, "manager");
  return null;
};

const DataRefreshWrapper = ({ onRefresh }: { onRefresh: () => void }) => {
  useWebSocket(["DATA_REFRESH"], (event) => {
    if (event.type === "DATA_REFRESH") onRefresh();
  }, "manager");
  return null;
};

describe("useWebSocket", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("uses a non-secret role hint for customer sockets without sending a QR credential", async () => {
    const CustomerWrapper = () => {
      const connected = useWebSocket(["MENU_UPDATE"], () => {}, "customer_waiter");
      return <div data-testid="connected">{connected ? "true" : "false"}</div>;
    };
    render(<CustomerWrapper />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("role=customer_waiter");
    expect(MockWebSocket.instances[0].url).not.toContain("qr=");
  });

  it("uses a non-secret role hint for cookie-authenticated sockets and waits until enabled", async () => {
    const { rerender } = render(<ManagerWrapper enabled={false} />);
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    expect(MockWebSocket.instances).toHaveLength(0);

    await act(async () => {
      rerender(<ManagerWrapper enabled={true} />);
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("role=manager");
    expect(MockWebSocket.instances[0].url).not.toContain("token=");
  });

  it("publishes active and connected socket counts for the shared connection notice", async () => {
    const { rerender } = render(
      <>
        <ManagerWrapper enabled />
        <ConnectionStatusWrapper />
      </>
    );

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByTestId("connection-status").textContent).toBe("1:0");
    const socket = MockWebSocket.instances[0];

    await act(async () => {
      socket.onopen?.();
    });
    expect(screen.getByTestId("connection-status").textContent).toBe("1:1");

    await act(async () => {
      socket.onclose?.();
    });
    expect(screen.getByTestId("connection-status").textContent).toBe("1:0");

    await act(async () => {
      rerender(
        <>
          <ManagerWrapper enabled={false} />
          <ConnectionStatusWrapper />
        </>
      );
    });
    expect(screen.getByTestId("connection-status").textContent).toBe("0:0");
  });

  it("reconnects quickly and tells views to refresh after a dropped connection", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const onReconnect = vi.fn();
    render(<ReconnectWrapper onReconnect={onReconnect} />);
    const firstSocket = MockWebSocket.instances[0];

    await act(async () => {
      firstSocket.onopen?.();
    });
    expect(onReconnect).not.toHaveBeenCalled();

    await act(async () => {
      firstSocket.onclose?.();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(MockWebSocket.instances).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    await act(async () => {
      MockWebSocket.instances[1].onopen?.();
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("refreshes subscribed views when a backgrounded tab becomes visible again", async () => {
    const onReconnect = vi.fn();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    render(<ReconnectWrapper onReconnect={onReconnect} />);
    const socket = MockWebSocket.instances[0];
    socket.readyState = 1;

    await act(async () => {
      socket.onopen?.();
    });
    expect(onReconnect).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onReconnect).toHaveBeenCalledWith();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      window.dispatchEvent(new Event("online"));
    });
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it("delivers server data-refresh events to subscribed views", async () => {
    const onRefresh = vi.fn();
    render(<DataRefreshWrapper onRefresh={onRefresh} />);
    const socket = MockWebSocket.instances[0];

    await act(async () => {
      socket.onmessage?.({ data: JSON.stringify({ type: "DATA_REFRESH", payload: {} }) });
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
