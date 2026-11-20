import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCallback } from "react";
import { useWebSocket } from "@/lib/useWebSocket";

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
  qrCode: string | null;
};

const TestWrapper = ({ qrCode }: TestWrapperProps) => {
  const qrCodeGetter = useCallback(() => qrCode, [qrCode]);
  const connected = useWebSocket(["MENU_UPDATE"], () => {}, qrCodeGetter);
  return <div data-testid="connected">{connected ? "true" : "false"}</div>;
};

const ManagerWrapper = ({ enabled }: { enabled: boolean }) => {
  const connected = useWebSocket(["MENU_UPDATE"], () => {}, undefined, "manager", enabled);
  return <div data-testid="connected">{connected ? "true" : "false"}</div>;
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
    vi.clearAllMocks();
  });

  it("waits for the customer QR code before connecting", async () => {
    const { rerender } = render(<TestWrapper qrCode={null} />);

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(screen.getByTestId("connected").textContent).toBe("false");

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(0);

    await act(async () => {
      rerender(<TestWrapper qrCode="table-1" />);
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    const instance = MockWebSocket.instances[0];
    expect(instance.url).toContain("qr=table-1");

    await act(async () => {
      instance.onopen?.();
    });

    expect(screen.getByTestId("connected").textContent).toBe("true");
  });

  it("opens WebSocket immediately when a QR code is already available", async () => {
    render(<TestWrapper qrCode="table-2" />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("qr=table-2");
  });

  it("does not recreate the socket when the QR getter identity changes but the code stays the same", async () => {
    const { rerender } = render(<TestWrapper qrCode="table-3" />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    await act(async () => {
      rerender(<TestWrapper qrCode="table-3" />);
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
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
});
