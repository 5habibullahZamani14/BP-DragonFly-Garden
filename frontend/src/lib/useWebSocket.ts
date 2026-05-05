import { useEffect, useRef, useState } from "react";

const getWsBase = () => {
  const envBase = import.meta.env.VITE_API_BASE;
  if (envBase) {
    return envBase.replace(/^http/, "ws");
  }
  // Default to the current hostname, but port 5000 for the backend WS server
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:5000`;
};

const WS_BASE = getWsBase();

export type WSEventType = "NEW_ORDER" | "ORDER_STATUS_UPDATE" | "NEW_PAYMENT" | "INVENTORY_UPDATE";

interface WSEvent {
  type: WSEventType;
  payload: any;
}

type EventCallback = (event: WSEvent) => void;

export const useWebSocket = (eventTypes: WSEventType[], callback: EventCallback) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const callbackRef = useRef(callback);
  const eventTypesRef = useRef(eventTypes);

  // Keep refs up to date without triggering reconnections
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
        // Reconnect after 3 seconds
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, []);

  return isConnected;
};
