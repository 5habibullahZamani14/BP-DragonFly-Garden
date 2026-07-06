/*
 * useWebSocket.ts — Custom React hook for the WebSocket connection.
 *
 * This hook manages the lifecycle of a single WebSocket connection to the
 * backend server. Any component that needs real-time updates (KitchenView,
 * CustomerView, PaymentCounterView) calls this hook with the event types it
 * cares about and a callback to handle those events.
 *
 * Design decisions worth noting:
 *
 *   Automatic reconnection: If the connection drops (server restart, network
 *   blip), the hook waits 3 seconds and reconnects automatically. This is
 *   important for the kitchen view — the crew cannot miss an incoming order
 *   because of a temporary connection loss.
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

import { useEffect, useRef, useState } from "react";
import { safeConsoleError, safeConsoleWarn } from "@/lib/safeConsole";

/*
 * getWsBase determines the WebSocket server address. In production this comes
 * from VITE_API_BASE (the same env variable used for HTTP requests), with the
 * protocol swapped from http/https to ws/wss. In development it defaults to
 * the current hostname on port 5000 (the backend dev server port).
 */
const getWsBase = () => {
  const envBase = import.meta.env.VITE_API_BASE;
  if (envBase) {
    return envBase.replace(/^http/, "ws");
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:5000`;
};

const WS_BASE = getWsBase();

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
  | "SETTINGS_UPDATE";

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
  authParamGetter?: () => string | null,
  authParamName: string = "token"
) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  /* Store the latest callback and eventTypes in refs so the effect stays stable. */
  const callbackRef = useRef(callback);
  const eventTypesRef = useRef(eventTypes);
  const authValueRef = useRef<string | null>(null);
  const authValue = authParamGetter ? authParamGetter() : null;

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    eventTypesRef.current = eventTypes;
  }, [eventTypes]);

  useEffect(() => {
    authValueRef.current = authValue;
  }, [authValue]);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectAttempts = 0;
    let cleanupRequested = false;
    let currentWs: WebSocket | null = null;

    const connect = () => {
      if (authParamGetter && !authValueRef.current) {
        setIsConnected(false);
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000) + Math.floor(Math.random() * 3000);
        reconnectAttempts++;
        reconnectTimeout = setTimeout(connect, delay);
        return;
      }

      const sep = WS_BASE.includes("?") ? "&" : "?";
      const url = authValueRef.current
        ? `${WS_BASE}${sep}${encodeURIComponent(authParamName)}=${encodeURIComponent(authValueRef.current)}`
        : WS_BASE;

      try {
        const ws = new WebSocket(url);
        currentWs = ws;
        wsRef.current = ws;

        ws.onopen = () => {
          if (cleanupRequested) {
            ws.close();
            return;
          }
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
        console.error("Failed to create WebSocket connection", error);
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
  }, [authValue, authParamName]); // Reconnect only when the actual auth value or auth param name changes

  return isConnected;
};
