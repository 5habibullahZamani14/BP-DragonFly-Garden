import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { useWebSocketConnectionStatus } from "@/lib/useWebSocket";

export type ServerConnectionNoticeKind =
  | "retrying"
  | "offline"
  | "liveUpdates"
  | "restored"
  | "shutdownRequested"
  | "shutdownFinishing"
  | "shutdownOffline";

export type ServerConnectionOutageKind = Exclude<
  ServerConnectionNoticeKind,
  "liveUpdates" | "restored"
>;

export const isServerConnectionOutage = (
  kind: ServerConnectionNoticeKind | null,
): kind is ServerConnectionOutageKind =>
  kind !== null && kind !== "liveUpdates" && kind !== "restored";

type ServerHealthState = "checking" | "online" | "retrying" | "offline" | "restored";

const SERVER_SHUTDOWN_REQUESTED_EVENT = "dragonfly:server-shutdown-requested";
const HEALTH_CHECK_INTERVAL_MS = 5000;
const HEALTH_REQUEST_TIMEOUT_MS = 2500;
const WEBSOCKET_DISCONNECT_GRACE_MS = 5000;

export const notifyServerShutdownRequested = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SERVER_SHUTDOWN_REQUESTED_EVENT));
  }
};

const isHealthyResponse = (value: unknown): value is { status: "ok" } =>
  typeof value === "object" &&
  value !== null &&
  "status" in value &&
  value.status === "ok";

export const useServerConnectionNotice = (): ServerConnectionNoticeKind | null => {
  const [serverHealth, setServerHealth] = useState<ServerHealthState>("checking");
  const [liveUpdatesDelayed, setLiveUpdatesDelayed] = useState(false);
  const [shutdownRequested, setShutdownRequested] = useState(false);
  const [shutdownFinishing, setShutdownFinishing] = useState(false);
  const consecutiveFailures = useRef(0);
  const shutdownRequestedRef = useRef(false);
  const { activeConnections, connectedConnections } = useWebSocketConnectionStatus();

  useEffect(() => {
    let active = true;
    let retryTimer: number | undefined;
    let requestTimeout: number | undefined;
    let recoveryTimer: number | undefined;
    let shutdownProgressTimer: number | undefined;

    const handleShutdownRequested = () => {
      shutdownRequestedRef.current = true;
      setShutdownRequested(true);
      setShutdownFinishing(false);
      if (shutdownProgressTimer !== undefined) window.clearTimeout(shutdownProgressTimer);
      shutdownProgressTimer = window.setTimeout(() => {
        setShutdownFinishing(true);
      }, 1000);
    };

    window.addEventListener(SERVER_SHUTDOWN_REQUESTED_EVENT, handleShutdownRequested);

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
        if (shutdownRequestedRef.current && wasOffline) {
          shutdownRequestedRef.current = false;
          setShutdownRequested(false);
          setShutdownFinishing(false);
        }
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
        if (shutdownRequestedRef.current) {
          setShutdownFinishing(true);
          if (shutdownProgressTimer !== undefined) window.clearTimeout(shutdownProgressTimer);
          shutdownProgressTimer = undefined;
        }
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
      window.removeEventListener(SERVER_SHUTDOWN_REQUESTED_EVENT, handleShutdownRequested);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
      if (shutdownProgressTimer !== undefined) window.clearTimeout(shutdownProgressTimer);
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

  if (shutdownRequested) {
    if (serverHealth === "offline") return "shutdownOffline";
    if (shutdownFinishing || serverHealth === "retrying") return "shutdownFinishing";
    return "shutdownRequested";
  }
  if (serverHealth === "offline") return "offline";
  if (serverHealth === "retrying") return "retrying";
  if (serverHealth === "restored") return "restored";
  if (serverHealth === "online" && liveUpdatesDelayed) return "liveUpdates";
  return null;
};
