import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  SquadRcConfig,
  ConnectionState,
  OutboundMessage,
  InboundMessage,
} from '@/types/squad-rc';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

interface UseWebSocketReturn {
  state: ConnectionState;
  lastMessage: InboundMessage | null;
  send: (message: OutboundMessage) => void;
  connect: (config: SquadRcConfig) => void;
  disconnect: () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<InboundMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const configRef = useRef<SquadRcConfig | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connectRef = useRef<((config: SquadRcConfig) => void) | null>(null);

  const connect = useCallback(
    (config: SquadRcConfig) => {
      cleanup();
      configRef.current = config;
      retriesRef.current = 0;
      setState('connecting');

      const url = new URL(config.wsUrl);
      url.searchParams.set('token', config.token);

      const ws = new WebSocket(url.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        setState('connected');
        retriesRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: InboundMessage = JSON.parse(event.data as string);
          setLastMessage(msg);
        } catch {
          console.error('[squad-uplink] Failed to parse message:', event.data);
        }
      };

      ws.onerror = () => {
        setState('error');
      };

      ws.onclose = () => {
        wsRef.current = null;
        const cfg = configRef.current;
        if (
          cfg?.reconnect !== false &&
          retriesRef.current < (cfg?.maxRetries ?? 10)
        ) {
          setState('reconnecting');
          const delay = Math.min(
            RECONNECT_BASE_DELAY * 2 ** retriesRef.current,
            RECONNECT_MAX_DELAY,
          );
          retriesRef.current++;
          reconnectTimerRef.current = setTimeout(() => {
            if (configRef.current) connectRef.current?.(configRef.current);
          }, delay);
        } else {
          setState('disconnected');
        }
      };
    },
    [cleanup],
  );

  // Keep connectRef in sync for self-referencing reconnect
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    configRef.current = null;
    cleanup();
    setState('disconnected');
  }, [cleanup]);

  const send = useCallback((message: OutboundMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[squad-uplink] WebSocket not connected, cannot send');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  return { state, lastMessage, send, connect, disconnect };
}
