import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { useWebSocketConnectionStatus } from "@/lib/useWebSocket";

export type ServerConnectionNoticeKind = "retrying" | "offline" | "liveUpdates" | "restored";

type ServerHealthState = "checking" | "online" | "retrying" | "offline" | "restored";

const HEALTH_CHECK_INTERVAL_MS = 5000;
const HEALTH_REQUEST_TIMEOUT_MS = 2500;
const WEBSOCKET_DISCONNECT_GRACE_MS = 5000;

const isHealthyResponse = (value: unknown): value is { status: "ok" } =>
  typeof value === "object" &&
  value !== null &&
  "status" in value &&
  value.status === "ok";

export const useServerConnectionNotice = (): ServerConnectionNoticeKind | null => {
  const [serverHealth, setServerHealth] = useState<ServerHealthState>("checking");
  const [liveUpdatesDelayed, setLiveUpdatesDelayed] = useState(false);
  const consecutiveFailures = useRef(0);
  const { activeConnections, connectedConnections } = useWebSocketConnectionStatus();

  useEffect(() => {
    let active = true;
    let retryTimer: number | undefined;
    let requestTimeout: number | undefined;
    let recoveryTimer: number | undefined;

    const checkServer = async () => {
      const controller = new AbortController();
      requestTimeout = window.setTimeout(() => controller.abort(), HEALTH_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${API_BASE}/health`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok || !isHealthyResponse(await response.json())) {
          throw new Error("The health endpoint did not return a healthy response.");
        }

        if (!active) return;
        const wasOffline = consecutiveFailures.current >= 2;
        consecutiveFailures.current = 0;
        setServerHealth(wasOffline ? "restored" : "online");
        if (wasOffline) {
          recoveryTimer = window.setTimeout(() => {
            setServerHealth("online");
          }, 3000);
        }
      } catch {
        if (!active) return;
        if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
        consecutiveFailures.current += 1;
        setServerHealth(consecutiveFailures.current >= 2 ? "offline" : "retrying");
      } finally {
        if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
        if (active) {
          retryTimer = window.setTimeout(() => {
            void checkServer();
          }, HEALTH_CHECK_INTERVAL_MS);
        }
      }
    };

    void checkServer();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
    };
  }, []);

  useEffect(() => {
    if (activeConnections === 0 || connectedConnections === activeConnections) {
      setLiveUpdatesDelayed(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setLiveUpdatesDelayed(true);
    }, WEBSOCKET_DISCONNECT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [activeConnections, connectedConnections]);

  if (serverHealth === "offline") return "offline";
  if (serverHealth === "retrying") return "retrying";
  if (serverHealth === "restored") return "restored";
  if (serverHealth === "online" && liveUpdatesDelayed) return "liveUpdates";
  return null;
};
