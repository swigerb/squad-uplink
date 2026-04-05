import type {
  SquadRcConfig,
  ConnectionState,
  OutboundMessage,
  InboundMessage,
  TicketResponse,
} from '@/types/squad-rc';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const DEFAULT_MAX_RETRIES = 10;

// Rate limiting: 20 messages/min WS limit, start queueing at 16
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_THRESHOLD = 16;
const DRAIN_INTERVAL = 3000; // drain timer interval in ms

export class ConnectionManager {
  private ws: WebSocket | null = null;
  private retries = 0;
  private config: SquadRcConfig | null = null;
  private messageQueue: OutboundMessage[] = [];
  private rateLimiter = { count: 0, resetAt: 0 };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  /** Set by consumers to receive inbound messages */
  onMessage: ((msg: InboundMessage) => void) | null = null;

  /** Set by consumers to receive connection state changes */
  onStateChange: ((state: ConnectionState) => void) | null = null;

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

      // If the URL is HTTP(S), do ticket exchange first
      if (wsUrl.startsWith('http')) {
        const ticket = await this.exchangeTicket(wsUrl, config.token);
        const base = wsUrl.replace(/^http/, 'ws');
        const url = new URL(base);
        url.searchParams.set('ticket', ticket);
        wsUrl = url.toString();
      } else {
        const url = new URL(wsUrl);
        url.searchParams.set('token', config.token);
        wsUrl = url.toString();
      }

      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        // Only a successful open resets the retry counter (fixes backoff bug)
        this.retries = 0;
        this.emitState('connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg: InboundMessage = JSON.parse(event.data as string);
          this.onMessage?.(msg);
        } catch {
          console.error('[squad-uplink] Failed to parse message:', event.data);
        }
      };

      ws.onerror = () => {
        this.emitState('error');
      };

      ws.onclose = () => {
        this.ws = null;
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('[squad-uplink] Connection failed:', err);
      this.emitState('error');
      this.scheduleReconnect();
    }
  }

  /** User-initiated connect — resets retry counter */
  async connectFresh(config: SquadRcConfig): Promise<void> {
    this.retries = 0;
    return this.connect(config);
  }

  /** Disconnect and stop all reconnection attempts */
  disconnect(): void {
    this.config = null;
    this.cleanup();
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

    // If under threshold, send immediately
    if (this.rateLimiter.count < RATE_LIMIT_THRESHOLD) {
      this.sendImmediate(message);
      return;
    }

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

  // --- Private ---

  private sendImmediate(message: OutboundMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      this.rateLimiter.count++;
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

  private async exchangeTicket(baseUrl: string, token: string): Promise<string> {
    const resp = await fetch(`${baseUrl}/api/auth/ticket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!resp.ok) {
      throw new Error(`Ticket exchange failed: ${resp.status} ${resp.statusText}`);
    }
    const data: TicketResponse = await resp.json();
    return data.token;
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Key fix: retries are NOT reset here. Only a successful onopen resets them.
   */
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

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
}

/** Singleton instance for the app */
export const connectionManager = new ConnectionManager();
