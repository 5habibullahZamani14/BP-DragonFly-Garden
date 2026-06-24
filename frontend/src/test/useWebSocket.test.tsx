import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCallback } from "react";
import { useWebSocket } from "@/lib/useWebSocket";

const originalWebSocket = global.WebSocket;

class MockWebSocket {
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

type TestWrapperProps = {
  token: string | null;
};

const TestWrapper = ({ token }: TestWrapperProps) => {
  const authParamGetter = useCallback(() => token, [token]);
  const connected = useWebSocket(["MENU_UPDATE"], () => {}, authParamGetter);
  return <div data-testid="connected">{connected ? "true" : "false"}</div>;
};

describe("useWebSocket", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    global.WebSocket = MockWebSocket as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.WebSocket = originalWebSocket;
    vi.clearAllMocks();
  });

  it("delays WebSocket connection until auth token is available", async () => {
    const { rerender } = render(<TestWrapper token={null} />);

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(screen.getByTestId("connected").textContent).toBe("false");

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(0);

    await act(async () => {
      rerender(<TestWrapper token="test-token" />);
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    const instance = MockWebSocket.instances[0];
    expect(instance.url).toContain("token=test-token");

    await act(async () => {
      instance.onopen?.();
    });

    expect(screen.getByTestId("connected").textContent).toBe("true");
  });

  it("opens WebSocket immediately when auth token is already available", async () => {
    render(<TestWrapper token="immediate-token" />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("token=immediate-token");
  });

  it("does not recreate the socket when auth getter identity changes but the token stays the same", async () => {
    const { rerender } = render(<TestWrapper token="same-token" />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    await act(async () => {
      rerender(<TestWrapper token="same-token" />);
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
