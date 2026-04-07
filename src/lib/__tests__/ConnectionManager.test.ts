import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManager } from '../ConnectionManager';
import { MockWebSocket, installMockWebSocket } from '../../__mocks__/websocket';
import type { OutboundMessage, InboundMessage } from '@/types/squad-rc';

describe('ConnectionManager', () => {
  let cm: ConnectionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    installMockWebSocket();
    cm = new ConnectionManager();
  });

  afterEach(() => {
    cm.disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
    MockWebSocket.reset();
  });

  // --- Connection lifecycle ---
  describe('connection lifecycle', () => {
    it('creates WebSocket with token in URL query params', async () => {
      await cm.connect({ wsUrl: 'wss://tunnel.example.com/ws', token: 'abc-123' });

      expect(MockWebSocket.instances).toHaveLength(1);
      const url = new URL(MockWebSocket.latest.url);
      expect(url.searchParams.get('access_token')).toBe('abc-123');
      expect(url.searchParams.get('X-Tunnel-Skip-AntiPhishing-Page')).toBe('true');
    });

    it('omits access_token and anti-phishing param when token is empty (cookie auth)', async () => {
      await cm.connect({ wsUrl: 'wss://tunnel.example.com/ws', token: '' });

      expect(MockWebSocket.instances).toHaveLength(1);
      const url = new URL(MockWebSocket.latest.url);
      expect(url.searchParams.has('access_token')).toBe(false);
      expect(url.searchParams.has('X-Tunnel-Skip-AntiPhishing-Page')).toBe(false);
    });

    it('transitions disconnected → connecting on connect()', async () => {
      const states: string[] = [];
      cm.onStateChange = (s) => states.push(s);

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });

      expect(states).toContain('connecting');
    });

    it('transitions connecting → connected on WebSocket open', async () => {
      const states: string[] = [];
      cm.onStateChange = (s) => states.push(s);

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();

      expect(states).toContain('connected');
    });

    it('transitions to disconnected on user disconnect()', async () => {
      const states: string[] = [];
      cm.onStateChange = (s) => states.push(s);

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();
      cm.disconnect();

      expect(states[states.length - 1]).toBe('disconnected');
    });
  });

  // --- Reconnection with exponential backoff ---
  describe('reconnection backoff', () => {
    it('schedules reconnect after unexpected close with 1s initial delay', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true });
      MockWebSocket.latest.simulateOpen();
      MockWebSocket.latest.simulateClose(1006, 'abnormal');

      // Not reconnected before 1s
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances).toHaveLength(1);

      // Reconnected at 1s
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('uses exponential backoff: 1s, 2s, 4s, 8s', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true, maxRetries: 10 });
      MockWebSocket.latest.simulateOpen();

      const delays = [1000, 2000, 4000, 8000];

      for (let i = 0; i < delays.length; i++) {
        const instancesBefore = MockWebSocket.instances.length;
        MockWebSocket.latest.simulateClose(1006);

        // Advance just short of the expected delay — no new instance
        vi.advanceTimersByTime(delays[i] - 1);
        expect(MockWebSocket.instances).toHaveLength(instancesBefore);

        // Advance the remaining 1ms — new instance created
        vi.advanceTimersByTime(1);
        expect(MockWebSocket.instances).toHaveLength(instancesBefore + 1);
      }
    });

    it('caps backoff delay at 30s', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true, maxRetries: 20 });
      MockWebSocket.latest.simulateOpen();

      // Close 5 times to get retries to 5 (delay would be 32s → capped at 30s)
      for (let i = 0; i < 5; i++) {
        MockWebSocket.latest.simulateClose(1006);
        vi.advanceTimersByTime(Math.min(1000 * 2 ** i, 30000));
      }

      const instancesBefore = MockWebSocket.instances.length;
      MockWebSocket.latest.simulateClose(1006);

      // At 30s (the cap), not before
      vi.advanceTimersByTime(29999);
      expect(MockWebSocket.instances).toHaveLength(instancesBefore);

      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(instancesBefore + 1);
    });

    it('does NOT reset retries when connect() is called (the bug fix)', async () => {
      const states: string[] = [];
      cm.onStateChange = (s) => states.push(s);

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true, maxRetries: 10 });
      MockWebSocket.latest.simulateOpen();

      // First close → retry 0, delay 1s
      MockWebSocket.latest.simulateClose(1006);
      vi.advanceTimersByTime(1000);
      // connect() is called internally but retries should NOT be reset

      // Second close → retry 1, delay should be 2s (not 1s)
      MockWebSocket.latest.simulateClose(1006);

      // If retries were reset, this would reconnect at 1s. It should NOT.
      vi.advanceTimersByTime(1000);
      const instancesAt1s = MockWebSocket.instances.length;

      vi.advanceTimersByTime(1000); // total 2s
      expect(MockWebSocket.instances.length).toBe(instancesAt1s + 1);
    });

    it('resets retries to 0 only after successful onopen', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true, maxRetries: 10 });
      MockWebSocket.latest.simulateOpen();

      // Close → reconnect at 1s
      MockWebSocket.latest.simulateClose(1006);
      vi.advanceTimersByTime(1000);

      // Close again → reconnect at 2s (retry incremented)
      MockWebSocket.latest.simulateClose(1006);
      vi.advanceTimersByTime(2000);

      // Successful open → retries reset
      MockWebSocket.latest.simulateOpen();

      // Close again → should reconnect at 1s (back to retry 0)
      MockWebSocket.latest.simulateClose(1006);
      const before = MockWebSocket.instances.length;
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances.length).toBe(before + 1);
    });

    it('stops reconnecting when maxRetries is reached', async () => {
      const states: string[] = [];
      cm.onStateChange = (s) => states.push(s);

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true, maxRetries: 2 });
      MockWebSocket.latest.simulateOpen();

      // Close 1 (retry 0 → delay 1s)
      MockWebSocket.latest.simulateClose(1006);
      vi.advanceTimersByTime(1000);

      // Close 2 (retry 1 → delay 2s)
      MockWebSocket.latest.simulateClose(1006);
      vi.advanceTimersByTime(2000);

      // Close 3 — retries exhausted (retry count is now 2 = maxRetries)
      MockWebSocket.latest.simulateClose(1006);

      expect(states[states.length - 1]).toBe('disconnected');
      const instances = MockWebSocket.instances.length;
      vi.advanceTimersByTime(60000);
      expect(MockWebSocket.instances.length).toBe(instances);
    });

    it('does not reconnect when reconnect option is false', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: false });
      MockWebSocket.latest.simulateOpen();

      const states: string[] = [];
      cm.onStateChange = (s) => states.push(s);

      MockWebSocket.latest.simulateClose(1006);

      expect(states).toContain('disconnected');
      vi.advanceTimersByTime(60000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  // --- Rate limiting ---
  describe('rate limiting', () => {
    it('sends messages immediately when under threshold', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();

      const msg: OutboundMessage = { type: 'prompt', text: 'hello' };
      cm.send(msg);

      expect(MockWebSocket.latest.sentMessages).toHaveLength(1);
      expect(JSON.parse(MockWebSocket.latest.sentMessages[0])).toEqual(msg);
    });

    it('serializes OutboundMessage to JSON on send', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();

      const msg: OutboundMessage = { type: 'prompt', text: 'build it', agent: 'woz' };
      cm.send(msg);

      const parsed = JSON.parse(MockWebSocket.latest.sentMessages[0]);
      expect(parsed.type).toBe('prompt');
      expect(parsed.text).toBe('build it');
      expect(parsed.agent).toBe('woz');
    });

    it('queues messages when approaching rate limit', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();

      // Send 16 messages (threshold) — all should go immediately
      for (let i = 0; i < 16; i++) {
        cm.send({ type: 'prompt', text: `msg-${i}` });
      }
      expect(MockWebSocket.latest.sentMessages).toHaveLength(16);

      // 17th message should be queued (above threshold)
      cm.send({ type: 'prompt', text: 'queued' });
      expect(MockWebSocket.latest.sentMessages).toHaveLength(16);
    });

    it('drains queued messages after rate window expires', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();

      // Fill to threshold
      for (let i = 0; i < 16; i++) {
        cm.send({ type: 'prompt', text: `msg-${i}` });
      }

      // Queue extra messages
      cm.send({ type: 'prompt', text: 'queued-1' });
      cm.send({ type: 'prompt', text: 'queued-2' });

      // Advance past the rate window so drain timer fires
      vi.advanceTimersByTime(60_000);

      // Queued messages should eventually be drained
      expect(MockWebSocket.latest.sentMessages.length).toBeGreaterThan(16);
    });
  });

  // --- send() when disconnected ---
  describe('send when disconnected', () => {
    it('logs warning and does not throw when sending while disconnected', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => {
        cm.send({ type: 'prompt', text: 'hello' });
      }).not.toThrow();

      warnSpy.mockRestore();
    });
  });

  // --- onMessage callback ---
  describe('message handling', () => {
    it('receives parsed InboundMessage via onMessage callback', async () => {
      const messages: InboundMessage[] = [];
      cm.onMessage = (msg) => messages.push(msg);

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();
      MockWebSocket.latest.simulateMessage({ type: 'text', content: 'Hello' });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ type: 'text', content: 'Hello' });
    });

    it('handles agent list messages', async () => {
      const messages: InboundMessage[] = [];
      cm.onMessage = (msg) => messages.push(msg);

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();
      MockWebSocket.latest.simulateMessage({
        type: 'agents',
        agents: [{ name: 'woz', role: 'dev', status: 'online' }],
      });

      expect(messages[0]).toEqual({
        type: 'agents',
        agents: [{ name: 'woz', role: 'dev', status: 'online' }],
      });
    });

    it('handles invalid JSON gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const messages: InboundMessage[] = [];
      cm.onMessage = (msg) => messages.push(msg);

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();
      MockWebSocket.latest.simulateRawMessage('not json{{{');

      expect(messages).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // --- disconnect() cleanup ---
  describe('disconnect cleanup', () => {
    it('closes WebSocket and clears timers on disconnect', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();

      cm.disconnect();

      expect(MockWebSocket.latest.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('cancels pending reconnect timer on disconnect', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true });
      MockWebSocket.latest.simulateOpen();
      MockWebSocket.latest.simulateClose(1006);

      // Reconnect is scheduled
      cm.disconnect();

      const instances = MockWebSocket.instances.length;
      vi.advanceTimersByTime(60000);
      expect(MockWebSocket.instances.length).toBe(instances);
    });

    it('stops reconnection attempts after disconnect', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true });
      MockWebSocket.latest.simulateOpen();

      cm.disconnect();
      MockWebSocket.latest.simulateClose(1006);

      vi.advanceTimersByTime(60000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  // --- Protocol normalization & DevTunnel params ---
  describe('protocol normalization', () => {
    it('normalizes https:// to wss:// and sets access_token + anti-phishing param', async () => {
      await cm.connect({ wsUrl: 'https://tunnel.example.com', token: 'bearer-abc' });

      const wsUrl = new URL(MockWebSocket.latest.url);
      expect(wsUrl.protocol).toBe('wss:');
      expect(wsUrl.searchParams.get('access_token')).toBe('bearer-abc');
      expect(wsUrl.searchParams.get('X-Tunnel-Skip-AntiPhishing-Page')).toBe('true');
    });

    it('normalizes http:// to ws://', async () => {
      await cm.connect({ wsUrl: 'http://localhost:3000', token: 'local-tok' });

      const wsUrl = new URL(MockWebSocket.latest.url);
      expect(wsUrl.protocol).toBe('ws:');
      expect(wsUrl.searchParams.get('access_token')).toBe('local-tok');
    });

    it('preserves wss:// URLs as-is', async () => {
      await cm.connect({ wsUrl: 'wss://tunnel.example.com/ws', token: 't' });

      const wsUrl = new URL(MockWebSocket.latest.url);
      expect(wsUrl.protocol).toBe('wss:');
    });

    it('always includes X-Tunnel-Skip-AntiPhishing-Page param', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });

      const wsUrl = new URL(MockWebSocket.latest.url);
      expect(wsUrl.searchParams.get('X-Tunnel-Skip-AntiPhishing-Page')).toBe('true');
    });
  });

  // --- connectFresh vs connect ---
  describe('connectFresh', () => {
    it('resets retries before connecting', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true, maxRetries: 10 });
      MockWebSocket.latest.simulateOpen();

      // Accumulate retries
      MockWebSocket.latest.simulateClose(1006);
      vi.advanceTimersByTime(1000);
      MockWebSocket.latest.simulateClose(1006);
      vi.advanceTimersByTime(2000);

      // connectFresh should reset retries — delay should be 1s again
      await cm.connectFresh({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true });
      MockWebSocket.latest.simulateOpen();
      MockWebSocket.latest.simulateClose(1006);

      const before = MockWebSocket.instances.length;
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances.length).toBe(before + 1);
    });
  });

  // --- Error state ---
  describe('error handling', () => {
    it('emits error state on WebSocket error event', async () => {
      const states: string[] = [];
      cm.onStateChange = (s) => states.push(s);

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateError();

      expect(states).toContain('error');
    });

    it('adds devtunnel diagnostic hint after repeated 1006 closes', async () => {
      const { useConnectionStore } = await import('@/store/connectionStore');

      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't', reconnect: true, maxRetries: 10 });
      MockWebSocket.latest.simulateOpen();

      // First two 1006 closes — no diagnostic yet (retries < 2 at time of close)
      MockWebSocket.latest.simulateClose(1006);
      vi.advanceTimersByTime(1000);
      MockWebSocket.latest.simulateClose(1006);
      vi.advanceTimersByTime(2000);

      // Third 1006 close — retries >= 2, diagnostic should appear
      MockWebSocket.latest.simulateClose(1006);

      const errors = useConnectionStore.getState().telemetry.connectionErrors;
      const lastError = errors[errors.length - 1];
      expect(lastError.message).toContain('DevTunnel browser auth');
      expect(lastError.message).toContain('allow-anonymous');
    });
  });

  // --- isConnected ---
  describe('isConnected', () => {
    it('returns false when not connected', () => {
      expect(cm.isConnected).toBe(false);
    });

    it('returns true when WebSocket is open', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();
      expect(cm.isConnected).toBe(true);
    });

    it('returns false after disconnect', async () => {
      await cm.connect({ wsUrl: 'wss://example.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();
      cm.disconnect();
      expect(cm.isConnected).toBe(false);
    });
  });
});
