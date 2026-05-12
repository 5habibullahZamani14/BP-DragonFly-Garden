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

/* The four event types the backend can push over WebSocket. */
export type WSEventType = "NEW_ORDER" | "ORDER_STATUS_UPDATE" | "NEW_PAYMENT" | "INVENTORY_UPDATE";

interface WSEvent {
  type: WSEventType;
  payload: any;
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
export const useWebSocket = (eventTypes: WSEventType[], callback: EventCallback) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  /* Store the latest callback and eventTypes in refs so the effect stays stable. */
  const callbackRef = useRef(callback);
  const eventTypesRef = useRef(eventTypes);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    eventTypesRef.current = eventTypes;
  }, [eventTypes]);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      const ws = new WebSocket(WS_BASE);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (eventTypesRef.current.includes(data.type)) {
            callbackRef.current(data);
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        /* Schedule a reconnect attempt 3 seconds after the connection drops. */
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        ws.close();
      };
    };

    connect();

    /* Cleanup: cancel the reconnect timer and close the socket on unmount. */
    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        /* Nullify onclose before closing to suppress the reconnect attempt. */
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []); // Empty deps: connect once on mount, reconnect on close, clean up on unmount.

  return isConnected;
};
