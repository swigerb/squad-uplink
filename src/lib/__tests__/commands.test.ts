import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleCommand, type TerminalWriter } from '../commands';
import { MockWebSocket, installMockWebSocket } from '../../__mocks__/websocket';
import { connectionManager } from '../ConnectionManager';
import { useConnectionStore } from '@/store/connectionStore';

function createMockTerminal(): TerminalWriter & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    write: vi.fn((data: string) => lines.push(data)),
    writeln: vi.fn((data: string) => lines.push(data)),
    clear: vi.fn(),
  };
}

describe('handleCommand', () => {
  let terminal: ReturnType<typeof createMockTerminal>;

  beforeEach(() => {
    vi.useFakeTimers();
    installMockWebSocket();
    terminal = createMockTerminal();
    // Reset store to default state
    useConnectionStore.setState({
      status: 'disconnected',
      tunnelUrl: null,
      agentCount: 0,
      crtEnabled: true,
      audioEnabled: false,
    });
  });

  afterEach(() => {
    connectionManager.disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
    MockWebSocket.reset();
  });

  // --- /help ---
  describe('/help', () => {
    it('returns help text listing all commands', () => {
      handleCommand('/help', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('/status');
      expect(output).toContain('/agents');
      expect(output).toContain('/connect');
      expect(output).toContain('/disconnect');
      expect(output).toContain('/clear');
      expect(output).toContain('/help');
      expect(output).toContain('@agentName');
    });
  });

  // --- /status ---
  describe('/status', () => {
    it('shows connection state from store', () => {
      useConnectionStore.setState({ status: 'connected' });

      handleCommand('/status', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('connected');
    });

    it('shows disconnected status', () => {
      handleCommand('/status', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('disconnected');
    });

    it('shows CRT and audio state', () => {
      useConnectionStore.setState({ crtEnabled: true });
      localStorage.setItem('squad-uplink-audio-muted', 'true');

      handleCommand('/status', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('CRT');
      expect(output).toContain('Audio');
    });
  });

  // --- /connect ---
  describe('/connect', () => {
    it('calls connectionManager.connectFresh with url and token', () => {
      const spy = vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect wss://tunnel.dev/ws my-token', terminal);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          wsUrl: 'wss://tunnel.dev/ws',
          token: 'my-token',
          reconnect: true,
        }),
      );
      spy.mockRestore();
    });

    it('shows error when url is missing', () => {
      handleCommand('/connect', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Usage');
    });

    it('connects without token for anonymous auth', () => {
      const spy = vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect wss://tunnel.dev/ws', terminal);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          wsUrl: 'wss://tunnel.dev/ws',
          token: '',
          reconnect: true,
        }),
      );
      const output = terminal.lines.join('\n');
      expect(output).toContain('none (anonymous)');
      spy.mockRestore();
    });

    it('shows connecting message', () => {
      vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect wss://x.com/ws tok', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Connecting');
    });

    it('shows token query param auth method when token provided with ws URL', () => {
      vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect wss://x.com/ws my-token', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('token (query param)');
    });

    it('passes https:// URLs as-is to ConnectionManager (no conversion)', () => {
      const spy = vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect https://tunnel.dev my-token', terminal);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          wsUrl: 'https://tunnel.dev',
          token: 'my-token',
          reconnect: true,
        }),
      );

      const output = terminal.lines.join('\n');
      expect(output).toContain('https://tunnel.dev');
      expect(output).toContain('ticket exchange');
      spy.mockRestore();
    });

    it('passes http:// URLs as-is to ConnectionManager (no conversion)', () => {
      const spy = vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect http://localhost:3000 tok', terminal);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          wsUrl: 'http://localhost:3000',
        }),
      );
      const output = terminal.lines.join('\n');
      expect(output).toContain('ticket exchange');
      spy.mockRestore();
    });

    it('shows ticket exchange auth for http URL with token', () => {
      vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect http://localhost:35555 my-uuid-token', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('ticket exchange');
    });

    it('shows anonymous auth for http URL without token', () => {
      vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect http://localhost:35555', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('none (anonymous)');
    });
  });

  // --- /disconnect ---
  describe('/disconnect', () => {
    it('calls connectionManager.disconnect()', () => {
      const spy = vi.spyOn(connectionManager, 'disconnect');

      handleCommand('/disconnect', terminal);

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('writes disconnected confirmation', () => {
      handleCommand('/disconnect', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Disconnected');
    });
  });

  // --- /agents ---
  describe('/agents', () => {
    it('sends agent list request when connected', async () => {
      await connectionManager.connect({ wsUrl: 'wss://x.com/ws', token: 't' });
      MockWebSocket.latest.simulateOpen();
      const spy = vi.spyOn(connectionManager, 'send');

      handleCommand('/agents', terminal);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'prompt', text: '/agents' }),
      );
      spy.mockRestore();
    });

    it('shows error when not connected', () => {
      handleCommand('/agents', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Not connected');
    });
  });

  // --- /clear ---
  describe('/clear', () => {
    it('calls terminal.clear()', () => {
      handleCommand('/clear', terminal);

      expect(terminal.clear).toHaveBeenCalled();
    });
  });

  // --- Unknown commands ---
  describe('unknown commands', () => {
    it('shows "Unknown command" for unrecognized slash commands', () => {
      handleCommand('/foobar', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Unknown command');
    });

    it('suggests /help for unknown commands', () => {
      handleCommand('/xyz', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('/help');
    });
  });

  // --- Null terminal ---
  describe('null terminal', () => {
    it('does nothing when terminal is null', () => {
      expect(() => {
        handleCommand('/help', null);
      }).not.toThrow();
    });
  });

  // --- /auth ---
  describe('/auth', () => {
    let windowOpenSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    afterEach(() => {
      windowOpenSpy.mockRestore();
    });

    it('shows usage when no URL provided', () => {
      handleCommand('/auth', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Usage');
      expect(output).toContain('/auth');
      expect(output).toContain('devtunnel-url');
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it('opens browser tab with valid Dev Tunnel URL', () => {
      handleCommand('/auth https://5r3d84qj-35555.use2.devtunnels.ms', terminal);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://5r3d84qj-35555.use2.devtunnels.ms',
        '_blank',
      );
      const output = terminal.lines.join('\n');
      expect(output).toContain('Opening Dev Tunnel auth');
      expect(output).toContain('5r3d84qj-35555.use2.devtunnels.ms');
    });

    it('strips trailing slashes from URL', () => {
      handleCommand('/auth https://tunnel.devtunnels.ms/', terminal);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://tunnel.devtunnels.ms',
        '_blank',
      );
    });

    it('strips multiple trailing slashes', () => {
      handleCommand('/auth https://tunnel.devtunnels.ms///', terminal);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://tunnel.devtunnels.ms',
        '_blank',
      );
    });

    it('rejects invalid URLs', () => {
      handleCommand('/auth not-a-url', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Invalid URL');
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it('shows Entra ID hint after opening', () => {
      handleCommand('/auth https://tunnel.devtunnels.ms', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Entra ID');
      expect(output).toContain('/connect');
    });

    it('appears in /help output', () => {
      handleCommand('/help', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('/auth');
      expect(output).toContain('Dev Tunnel');
    });

    it('handles case-insensitive /AUTH command', () => {
      handleCommand('/AUTH https://tunnel.devtunnels.ms', terminal);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://tunnel.devtunnels.ms',
        '_blank',
      );
    });

    it('preserves query parameters in URL', () => {
      handleCommand('/auth https://tunnel.devtunnels.ms?foo=bar', terminal);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://tunnel.devtunnels.ms?foo=bar',
        '_blank',
      );
    });

    it('handles URL with port number', () => {
      handleCommand('/auth https://tunnel.devtunnels.ms:8080', terminal);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://tunnel.devtunnels.ms:8080',
        '_blank',
      );
    });

    it('uses only first argument as URL, ignores extra args', () => {
      handleCommand('/auth https://tunnel.devtunnels.ms extra-stuff', terminal);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://tunnel.devtunnels.ms',
        '_blank',
      );
    });

    it('calls window.open exactly once', () => {
      handleCommand('/auth https://tunnel.devtunnels.ms', terminal);

      expect(windowOpenSpy).toHaveBeenCalledTimes(1);
    });

    it('shows /connect hint after successful open', () => {
      handleCommand('/auth https://tunnel.devtunnels.ms', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('/connect');
    });
  });

  // --- Case insensitivity ---
  describe('case handling', () => {
    it('handles uppercase commands', () => {
      handleCommand('/HELP', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('/status');
    });

    it('handles mixed case', () => {
      handleCommand('/Status', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('disconnected');
    });
  });
});
