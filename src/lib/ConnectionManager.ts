import type {
  SquadRcConfig,
  ConnectionState,
  OutboundMessage,
  InboundMessage,
  StatusResponse,
  MessageHistoryEntry,
} from '@/types/squad-rc';
import { useConnectionStore } from '@/store/connectionStore';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const DEFAULT_MAX_RETRIES = 10;

// Rate limiting: 20 messages/min WS limit, start queueing at 16
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_THRESHOLD = 16;
const DRAIN_INTERVAL = 3000; // drain timer interval in ms

// Heartbeat: keep DevTunnel / Azure LB connections alive during long agent thinking
const HEARTBEAT_INTERVAL = 30_000;

// Metrics tracking
const METRICS_WINDOW = 10_000; // 10s rolling window for message rates

export class ConnectionManager {
  private ws: WebSocket | null = null;
  private retries = 0;
  private config: SquadRcConfig | null = null;
  private messageQueue: OutboundMessage[] = [];
  private rateLimiter = { count: 0, resetAt: 0 };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private drainTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Metrics tracking
  private inboundTimestamps: number[] = [];
  private outboundTimestamps: number[] = [];
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectCount = 0;

  /** Singleton instance for the app */
  onMessage: ((msg: InboundMessage) => void) | null = null;

  /** Set by consumers to receive connection state changes */
  onStateChange: ((state: ConnectionState) => void) | null = null;

  /** Timer for auto-clearing RADS alert */
  private radsAlertTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Connect to a squad-rc WebSocket endpoint.
   * Performs ticket exchange if the config uses a base URL + token.
   * Does NOT reset retry counter — only onopen does that.
   */
  async connect(config: SquadRcConfig): Promise<void> {
    this.cleanup();
    this.config = config;
    this.emitState('connecting');

    try {
      let wsUrl = config.wsUrl;

      // Normalize protocol: https→wss, http→ws for browser WebSocket compatibility
      if (wsUrl.startsWith('https://')) {
        wsUrl = wsUrl.replace(/^https/, 'wss');
      } else if (wsUrl.startsWith('http://')) {
        wsUrl = wsUrl.replace(/^http/, 'ws');
      }

      // Build WebSocket URL with optional auth token
      const url = new URL(wsUrl);
      if (config.token) {
        url.searchParams.set('access_token', config.token);
        // Anti-phishing bypass only needed for programmatic token auth
        // For cookie auth (no token), the browser cookie handles auth + anti-phishing skip
        url.searchParams.set('X-Tunnel-Skip-AntiPhishing-Page', 'true');
      }
      wsUrl = url.toString();

      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        // Only a successful open resets the retry counter (fixes backoff bug)
        this.retries = 0;
        this.emitState('connected');
        useConnectionStore.getState().updateTelemetry({
          connectedAt: Date.now(),
        });
        this.startMetricsTimer();
        this.startHeartbeat();
      };

      ws.onmessage = (event) => {
        // Skip heartbeat responses (empty frames)
        if (!event.data || event.data === '') return;

        this.inboundTimestamps.push(Date.now());
        const store = useConnectionStore.getState();

        // Clear thinking state on any inbound message
        if (store.thinking) {
          store.setThinking(false);
        }

        store.updateTelemetry({
          messageCount: store.telemetry.messageCount + 1,
          successCount: store.telemetry.successCount + 1,
        });
        try {
          const msg: InboundMessage = JSON.parse(event.data as string);
          this.trackMessageHistory(msg, 'inbound');

          // Spike RADS needle on error messages
          if (msg.type === 'error') {
            this.triggerRadsAlert();
          }

          this.onMessage?.(msg);
        } catch {
          console.error('[squad-uplink] Failed to parse message:', event.data);
        }
      };

      ws.onerror = () => {
        this.emitState('error');
        useConnectionStore.getState().addConnectionError({
          timestamp: Date.now(),
          type: 'ws_error',
          message: 'WebSocket error — check browser console for details',
          url: wsUrl.replace(/access_token=[^&]+/, 'access_token=***'),
        });
      };

      ws.onclose = (event) => {
        this.ws = null;
        const store = useConnectionStore.getState();
        store.updateTelemetry({
          lastDisconnectAt: new Date().toISOString(),
        });

        let message = `WebSocket closed: ${event.code} ${event.reason || '(no reason)'}`;

        // Add diagnostic hint for common devtunnel auth failure
        if (event.code === 1006 && this.retries >= 2) {
          message += ' — DevTunnel browser auth may require: (1) anonymous tunnel access via `devtunnel port create -p PORT --protocol https --allow-anonymous`, or (2) visit tunnel URL in browser first to authenticate via Microsoft login';
        }

        store.addConnectionError({
          timestamp: Date.now(),
          type: 'ws_close',
          message,
          code: event.code,
          url: wsUrl.replace(/access_token=[^&]+/, 'access_token=***'),
        });
        this.stopHeartbeat();
        this.stopMetricsTimer();
        this.scheduleReconnect();
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[squad-uplink] Connection failed:', err);
      useConnectionStore.getState().addConnectionError({
        timestamp: Date.now(),
        type: 'connect_failed',
        message,
        url: config.wsUrl?.replace(/access_token=[^&]+/, 'access_token=***'),
      });
      this.emitState('error');
      this.scheduleReconnect();
    }
  }

  /** User-initiated connect — resets retry counter */
  async connectFresh(config: SquadRcConfig): Promise<void> {
    this.retries = 0;
    this.reconnectCount = 0;
    useConnectionStore.getState().updateTelemetry({
      reconnectCount: 0,
      connectedAt: null,
      lastDisconnectAt: null,
    });
    return this.connect(config);
  }

  /** Disconnect and stop all reconnection attempts */
  disconnect(): void {
    this.config = null;
    this.cleanup();
    this.stopMetricsTimer();
    this.emitState('disconnected');
  }

  /**
   * Send a message with rate limiting.
   * If approaching the WS rate limit, messages are queued and drained on a timer.
   */
  send(message: OutboundMessage): void {
    const now = Date.now();

    // Reset rate window if expired
    if (now >= this.rateLimiter.resetAt) {
      this.rateLimiter.count = 0;
      this.rateLimiter.resetAt = now + RATE_LIMIT_WINDOW;
    }

    // Set thinking state — we're awaiting a response
    useConnectionStore.getState().setThinking(true);

    // If under threshold, send immediately
    if (this.rateLimiter.count < RATE_LIMIT_THRESHOLD) {
      this.sendImmediate(message);
      return;
    }

    // Rate limit threshold reached — spike RADS
    this.triggerRadsAlert();

    // If at hard limit, queue
    if (this.rateLimiter.count >= RATE_LIMIT_MAX) {
      this.messageQueue.push(message);
      this.startDrainTimer();
      return;
    }

    // Between threshold and max — queue to be safe
    this.messageQueue.push(message);
    this.startDrainTimer();
  }

  /** Check if the WebSocket is currently connected */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Fetch the /status endpoint from squad-rc.
   * Measures round-trip latency and pushes results to the telemetry store.
   */
  async fetchStatus(): Promise<StatusResponse | null> {
    const cfg = this.config;
    if (!cfg) return null;

    // Derive HTTP base URL from wsUrl
    let baseUrl = cfg.wsUrl;
    if (baseUrl.startsWith('ws')) {
      baseUrl = baseUrl.replace(/^ws/, 'http');
    }
    // Strip path segments after the host (we want just the origin)
    const urlObj = new URL(baseUrl);
    const origin = urlObj.origin;

    const start = performance.now();
    try {
      const resp = await fetch(`${origin}/status`, {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
        },
      });
      const latencyMs = Math.round(performance.now() - start);

      if (!resp.ok) {
        console.error(`[squad-uplink] /status returned ${resp.status}`);
        return null;
      }

      const data = (await resp.json()) as StatusResponse;
      const store = useConnectionStore.getState();
      store.updateTelemetry({ latencyMs });
      store.setStatusResponse(data);

      if (data.agents) {
        store.setAgentCount(data.agents.length);
      }
      if (data.tunnel) {
        store.setTunnelUrl(data.tunnel);
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[squad-uplink] /status fetch failed:', err);
      useConnectionStore.getState().addConnectionError({
        timestamp: Date.now(),
        type: 'status_fetch_failed',
        message,
      });
      return null;
    }
  }

  // --- Private ---

  private sendImmediate(message: OutboundMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      this.rateLimiter.count++;
      this.outboundTimestamps.push(Date.now());
      const store = useConnectionStore.getState();
      store.updateTelemetry({
        messageCount: store.telemetry.messageCount + 1,
      });
      this.trackMessageHistory(message, 'outbound');
    } else {
      console.warn('[squad-uplink] WebSocket not connected, queueing message');
      this.messageQueue.push(message);
    }
  }

  private startDrainTimer(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => {
      if (this.messageQueue.length === 0) {
        this.stopDrainTimer();
        return;
      }
      const now = Date.now();
      if (now >= this.rateLimiter.resetAt) {
        this.rateLimiter.count = 0;
        this.rateLimiter.resetAt = now + RATE_LIMIT_WINDOW;
      }
      if (this.rateLimiter.count < RATE_LIMIT_THRESHOLD) {
        const msg = this.messageQueue.shift();
        if (msg) this.sendImmediate(msg);
      }
    }, DRAIN_INTERVAL);
  }

  private stopDrainTimer(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('');
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    const cfg = this.config;
    if (!cfg || cfg.reconnect === false) {
      this.emitState('disconnected');
      return;
    }

    const maxRetries = cfg.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (this.retries >= maxRetries) {
      this.emitState('disconnected');
      return;
    }

    this.emitState('reconnecting');
    this.reconnectCount++;
    useConnectionStore.getState().updateTelemetry({
      reconnectCount: this.reconnectCount,
    });

    const delay = Math.min(
      RECONNECT_BASE_DELAY * 2 ** this.retries,
      RECONNECT_MAX_DELAY,
    );
    this.retries++;

    this.reconnectTimer = setTimeout(() => {
      if (this.config) {
        this.connect(this.config);
      }
    }, delay);
  }

  private emitState(state: ConnectionState): void {
    this.onStateChange?.(state);
  }

  /** Push rolling message-rate metrics to the store every 2s */
  private startMetricsTimer(): void {
    this.stopMetricsTimer();
    this.metricsTimer = setInterval(() => {
      const now = Date.now();
      const cutoff = now - METRICS_WINDOW;

      this.inboundTimestamps = this.inboundTimestamps.filter((t) => t > cutoff);
      this.outboundTimestamps = this.outboundTimestamps.filter((t) => t > cutoff);

      const windowSec = METRICS_WINDOW / 1000;
      useConnectionStore.getState().updateTelemetry({
        inboundMps: Math.round((this.inboundTimestamps.length / windowSec) * 10) / 10,
        outboundMps: Math.round((this.outboundTimestamps.length / windowSec) * 10) / 10,
      });
    }, 2000);
  }

  private stopMetricsTimer(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  /** Track a message in the Pip-Boy history buffer */
  private trackMessageHistory(
    msg: InboundMessage | OutboundMessage,
    direction: 'inbound' | 'outbound',
  ): void {
    const entry: MessageHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      direction,
      agent: 'agent' in msg ? (msg.agent ?? undefined) : undefined,
      type: msg.type,
      content:
        'content' in msg
          ? String(msg.content)
          : 'text' in msg
            ? String(msg.text)
            : 'message' in msg
              ? String(msg.message)
              : JSON.stringify(msg),
      raw: msg,
    };
    useConnectionStore.getState().addMessageHistory(entry);
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.radsAlertTimer) {
      clearTimeout(this.radsAlertTimer);
      this.radsAlertTimer = null;
    }
    this.stopHeartbeat();
    this.stopDrainTimer();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  /** Spike the RADS needle for 2 seconds (error/rate-limit indicator) */
  private triggerRadsAlert(): void {
    const store = useConnectionStore.getState();
    store.setRadsAlert(true);
    if (this.radsAlertTimer) clearTimeout(this.radsAlertTimer);
    this.radsAlertTimer = setTimeout(() => {
      useConnectionStore.getState().setRadsAlert(false);
      this.radsAlertTimer = null;
    }, 2000);
  }
}

/** Singleton instance for the app */
export const connectionManager = new ConnectionManager();
