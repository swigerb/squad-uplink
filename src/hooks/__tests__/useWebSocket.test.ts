import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';
import { MockWebSocket, installMockWebSocket } from '../../__mocks__/websocket';
import type { SquadRcConfig, OutboundMessage } from '@/types/squad-rc';

const defaultConfig: SquadRcConfig = {
  wsUrl: 'wss://example.com/ws',
  token: 'test-token-123',
  reconnect: true,
  maxRetries: 5,
};

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installMockWebSocket();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    MockWebSocket.reset();
  });

  // --- WS-01: Connection lifecycle ---
  describe('connection lifecycle', () => {
    it('starts in disconnected state', () => {
      const { result } = renderHook(() => useWebSocket());
      expect(result.current.state).toBe('disconnected');
    });

    it('transitions to connecting when connect is called', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });

      expect(result.current.state).toBe('connecting');
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('transitions to connected on WebSocket open', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });

      expect(result.current.state).toBe('connected');
    });
  });

  // --- WS-02: Auth token ---
  describe('authentication', () => {
    it('appends token as query param to URL', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });

      const url = new URL(MockWebSocket.latest.url);
      expect(url.searchParams.get('token')).toBe('test-token-123');
    });

    it('preserves the base WebSocket URL', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });

      const url = new URL(MockWebSocket.latest.url);
      expect(url.origin).toBe('wss://example.com');
      expect(url.pathname).toBe('/ws');
    });
  });

  // --- WS-03: Receives messages ---
  describe('message handling', () => {
    it('parses JSON messages and sets lastMessage', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });
      act(() => {
        MockWebSocket.latest.simulateMessage({
          type: 'text',
          content: 'Hello from server',
        });
      });

      expect(result.current.lastMessage).toEqual({
        type: 'text',
        content: 'Hello from server',
      });
    });

    it('updates lastMessage with each new message', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });
      act(() => {
        MockWebSocket.latest.simulateMessage({ type: 'text', content: 'first' });
      });
      act(() => {
        MockWebSocket.latest.simulateMessage({ type: 'text', content: 'second' });
      });

      expect(result.current.lastMessage).toEqual({
        type: 'text',
        content: 'second',
      });
    });

    it('handles invalid JSON gracefully without crashing', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });
      act(() => {
        MockWebSocket.latest.simulateRawMessage('not valid json{{{');
      });

      expect(result.current.lastMessage).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // --- WS-04: Sends messages ---
  describe('send', () => {
    it('serializes OutboundMessage to JSON and sends via ws.send()', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });

      const message: OutboundMessage = { type: 'prompt', text: 'hello' };
      act(() => {
        result.current.send(message);
      });

      expect(MockWebSocket.latest.sentMessages).toHaveLength(1);
      expect(JSON.parse(MockWebSocket.latest.sentMessages[0])).toEqual(message);
    });

    it('does not send when WebSocket is not connected', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.send({ type: 'prompt', text: 'hello' });
      });

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('includes agent target when specified in message', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });

      const message: OutboundMessage = { type: 'prompt', text: 'build it', agent: '@woz' };
      act(() => {
        result.current.send(message);
      });

      const sent = JSON.parse(MockWebSocket.latest.sentMessages[0]);
      expect(sent.agent).toBe('@woz');
    });
  });

  // --- WS-05/06/07: Reconnection logic ---
  describe('reconnection', () => {
    it('transitions to reconnecting after unexpected close', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });

      act(() => {
        MockWebSocket.latest.simulateClose(1006, 'abnormal');
      });

      expect(result.current.state).toBe('reconnecting');
    });

    it('creates a new WebSocket after reconnect delay', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });

      act(() => {
        MockWebSocket.latest.simulateClose(1006);
      });

      // Not reconnected yet before delay
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(MockWebSocket.instances).toHaveLength(1);

      // Reconnected after 1s (2^0 * 1000)
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('uses initial 1s delay for first reconnect attempt', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });
      act(() => {
        MockWebSocket.latest.simulateClose(1006);
      });

      // Should not reconnect at 999ms
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(MockWebSocket.instances).toHaveLength(1);

      // Should reconnect at 1000ms
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('does not reconnect when reconnect is disabled', () => {
      const config: SquadRcConfig = {
        ...defaultConfig,
        reconnect: false,
      };
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(config);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });
      act(() => {
        MockWebSocket.latest.simulateClose(1006);
      });

      expect(result.current.state).toBe('disconnected');
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('successfully reconnects and transitions to connected', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });
      act(() => {
        MockWebSocket.latest.simulateClose(1006);
      });

      expect(result.current.state).toBe('reconnecting');

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // New WebSocket created, simulate it opening
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });

      expect(result.current.state).toBe('connected');
    });
  });

  // --- WS-09: Cleanup ---
  describe('cleanup', () => {
    it('cleans up on disconnect()', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });
      act(() => {
        result.current.disconnect();
      });

      expect(result.current.state).toBe('disconnected');
    });

    it('cleans up on unmount', () => {
      const { result, unmount } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });

      unmount();

      // No error thrown — cleanup was successful
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('cancels pending reconnect timer on disconnect', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });
      act(() => {
        MockWebSocket.latest.simulateClose(1006);
      });

      expect(result.current.state).toBe('reconnecting');

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.state).toBe('disconnected');
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  // --- WS-12: Error state ---
  describe('error handling', () => {
    it('sets error state on WebSocket error event', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect(defaultConfig);
      });
      act(() => {
        MockWebSocket.latest.simulateError();
      });

      expect(result.current.state).toBe('error');
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    it('handles rapid connect/disconnect without leaking connections', () => {
      const { result } = renderHook(() => useWebSocket());

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.connect(defaultConfig);
        });
        act(() => {
          result.current.disconnect();
        });
      }

      expect(result.current.state).toBe('disconnected');
    });

    it('resets retry counter on successful reconnect', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.connect({ ...defaultConfig, maxRetries: 3 });
      });
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });

      // Close and reconnect
      act(() => {
        MockWebSocket.latest.simulateClose(1006);
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Successful reconnect resets counter
      act(() => {
        MockWebSocket.latest.simulateOpen();
      });

      expect(result.current.state).toBe('connected');

      // Should be able to reconnect again from 0
      act(() => {
        MockWebSocket.latest.simulateClose(1006);
      });
      expect(result.current.state).toBe('reconnecting');
    });
  });
});
