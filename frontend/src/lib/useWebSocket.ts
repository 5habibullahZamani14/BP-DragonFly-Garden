/*
 * useWebSocket.ts — Custom React hook for the WebSocket connection.
 *
 * This hook manages the lifecycle of a single WebSocket connection to the
 * backend server. Any component that needs real-time updates (CustomerView,
 * PaymentCounterView) calls this hook with the event types it cares about and a
 * callback to handle those events.
 *
 * Design decisions worth noting:
 *
 *   Automatic reconnection: If the connection drops (server restart, network
 *   blip), the hook waits 3 seconds and reconnects automatically. This is
 *   important for real-time updates — staff should not miss an incoming order
 *   because of a temporary connection loss.
 *
 *   Shared connection status: The hook also publishes active and connected
 *   socket counts so the app shell can distinguish a live-update interruption
 *   from the backend itself being unavailable.
 *
 *   Stable refs for callback and eventTypes: I use useRef to store the latest
 *   versions of the callback and eventTypes array. This means the WebSocket
 *   effect only runs once on mount (its dependency array is empty), but the
 *   message handler always sees the current callback. Without refs, every
 *   time the parent component re-renders, the WebSocket would be torn down
 *   and reconnected unnecessarily.
 *
 *   Event filtering: The hook receives a list of event types it is interested
 *   in. Messages with other types are silently ignored. This keeps individual
 *   view components focused on their own events without needing a central
 *   event bus or Redux.
 *
 *   Unmount cleanup: When the component unmounts, the onclose handler is set
 *   to null before closing the socket. This prevents the reconnect timer from
 *   firing after the component is gone, which would cause a React state update
 *   on an unmounted component.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { safeConsoleError, safeConsoleWarn } from "@/lib/safeConsole";
import { API_BASE } from "@/lib/api";

/*
 * In production the backend serves the frontend on the same origin. During
 * development the API server uses port 5000, regardless of the Vite port.
 */
const getWsBase = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = API_BASE || (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : window.location.origin);
  return base.replace(/^http/, "ws");
};

const WS_BASE = getWsBase();

export interface WebSocketConnectionSnapshot {
  activeConnections: number;
  connectedConnections: number;
}

let nextConnectionId = 0;
const connectionStates = new Map<number, boolean>();
const connectionStatusListeners = new Set<() => void>();
let connectionSnapshot: WebSocketConnectionSnapshot = {
  activeConnections: 0,
  connectedConnections: 0,
};

const publishConnectionStatus = () => {
  const activeConnections = connectionStates.size;
  const connectedConnections = Array.from(connectionStates.values()).filter(Boolean).length;
  if (
    connectionSnapshot.activeConnections === activeConnections &&
    connectionSnapshot.connectedConnections === connectedConnections
  ) {
    return;
  }

  connectionSnapshot = { activeConnections, connectedConnections };
  connectionStatusListeners.forEach((listener) => listener());
};

const registerConnection = () => {
  const connectionId = nextConnectionId++;
  connectionStates.set(connectionId, false);
  publishConnectionStatus();

  return {
    setConnected(connected: boolean) {
      if (!connectionStates.has(connectionId) || connectionStates.get(connectionId) === connected) return;
      connectionStates.set(connectionId, connected);
      publishConnectionStatus();
    },
    unregister() {
      if (connectionStates.delete(connectionId)) publishConnectionStatus();
    },
  };
};

const subscribeToConnectionStatus = (listener: () => void) => {
  connectionStatusListeners.add(listener);
  return () => connectionStatusListeners.delete(listener);
};

const getConnectionSnapshot = () => connectionSnapshot;

export const useWebSocketConnectionStatus = () =>
  useSyncExternalStore(subscribeToConnectionStatus, getConnectionSnapshot, getConnectionSnapshot);

/* The event types the backend can push over WebSocket. */
export type WSEventType = 
  | "NEW_ORDER" 
  | "ORDER_STATUS_UPDATE" 
  | "ITEM_STATUS_UPDATE" 
  | "NEW_PAYMENT" 
  | "INVENTORY_UPDATE" 
  | "CALL_WAITER" 
  | "CALL_WAITER_ACK"
  | "NEW_FEEDBACK"
  | "FEEDBACK_ANALYSIS_UPDATE"
  | "MENU_UPDATE"
  | "TABLE_UPDATE"
  | "EMPLOYEE_UPDATE"
  | "SETTINGS_UPDATE"
  | "FEEDBACK_RESPONSE";

interface WSEvent {
  type: WSEventType;
  payload: unknown;
}

type EventCallback = (event: WSEvent) => void;

/*
 * useWebSocket opens a WebSocket connection and calls the provided callback
 * whenever an event matching one of the specified types arrives.
 *
 * @param eventTypes  The event types this component wants to receive.
 * @param callback    Function to call when a matching event arrives.
 * @returns           Boolean indicating whether the socket is currently open.
 */
export const useWebSocket = (
  eventTypes: WSEventType[],
  callback: EventCallback,
  qrCodeGetter?: () => string | null,
  clientRole?: "manager" | "payment_counter",
  enabled = true
) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  /* Store the latest callback and eventTypes in refs so the effect stays stable. */
  const callbackRef = useRef(callback);
  const eventTypesRef = useRef(eventTypes);
  const qrCodeGetterRef = useRef(qrCodeGetter);
  const qrCode = qrCodeGetter ? qrCodeGetter() : null;

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    eventTypesRef.current = eventTypes;
  }, [eventTypes]);

  useEffect(() => {
    qrCodeGetterRef.current = qrCodeGetter;
  }, [qrCodeGetter]);

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      return;
    }

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectAttempts = 0;
    let cleanupRequested = false;
    let currentWs: WebSocket | null = null;
    const connection = registerConnection();

    const connect = () => {
      if (qrCodeGetterRef.current && !qrCode) {
        connection.setConnected(false);
        setIsConnected(false);
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000) + Math.floor(Math.random() * 3000);
        reconnectAttempts++;
        reconnectTimeout = setTimeout(connect, delay);
        return;
      }

      const sep = WS_BASE.includes("?") ? "&" : "?";
      const params = new URLSearchParams();
      if (qrCode) params.set("qr", qrCode);
      if (clientRole) params.set("role", clientRole);
      const query = params.toString();
      const url = query ? `${WS_BASE}${sep}${query}` : WS_BASE;

      try {
        const ws = new WebSocket(url);
        currentWs = ws;
        wsRef.current = ws;
        
        ws.onopen = () => {
          if (cleanupRequested) {
            ws.close();
            return;
          }
          connection.setConnected(true);
          setIsConnected(true);
          reconnectAttempts = 0; // Reset attempts on successful connection
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (typeof data?.type === "string" && eventTypesRef.current.includes(data.type as WSEventType)) {
              callbackRef.current(data as WSEvent);
            }
          } catch (e) {
            safeConsoleError("Failed to parse WebSocket message", e);
          }
        };

        ws.onclose = () => {
          if (cleanupRequested || currentWs !== ws) return;
          connection.setConnected(false);
          setIsConnected(false);
          const base = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000);
          const jitter = Math.floor(Math.random() * 3000);
          const delay = base + jitter;
          reconnectAttempts++;
          reconnectTimeout = setTimeout(connect, delay);
        };

        ws.onerror = (error) => {
          safeConsoleError("WebSocket error", error);
          // Let onclose handle reconnects. Avoid manually closing a socket
          // that is still in CONNECTING state to prevent the browser warning.
        };
      } catch (error) {
        connection.setConnected(false);
        safeConsoleError("Failed to create WebSocket connection", error);
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000) + Math.floor(Math.random() * 3000);
        reconnectAttempts++;
        reconnectTimeout = setTimeout(connect, delay);
      }
    };

    connect();

    /* Cleanup: cancel the reconnect timer and close the socket on unmount. */
    return () => {
      cleanupRequested = true;
      clearTimeout(reconnectTimeout);
      connection.unregister();
      if (currentWs && currentWs.readyState !== WebSocket.CLOSED) {
        currentWs.onclose = null;
        currentWs.onerror = null;
        currentWs.onmessage = null;
        try {
          currentWs.close();
        } catch (error) {
          safeConsoleWarn("WebSocket close failed during cleanup", error);
        }
      }
    };
  }, [qrCode, clientRole, enabled]); // Reconnect only when the non-secret connection context changes

  return isConnected;
};
