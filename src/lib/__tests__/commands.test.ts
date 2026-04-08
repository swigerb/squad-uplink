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

  // --- /connect improvements ---
  describe('/connect token warnings', () => {
    it('warns when no token provided', () => {
      vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect wss://tunnel.dev/ws', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('No session token');
      expect(output).toContain('Squad RC requires a token');
    });

    it('suggests /probe when connecting without token', () => {
      vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect http://localhost:35555', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('/probe');
    });

    it('does not warn when token is provided', () => {
      vi.spyOn(connectionManager, 'connectFresh').mockResolvedValue();

      handleCommand('/connect wss://tunnel.dev/ws my-token', terminal);

      const output = terminal.lines.join('\n');
      expect(output).not.toContain('No session token');
    });
  });

  // --- /probe ---
  describe('/probe', () => {
    it('shows usage when no URL provided', () => {
      handleCommand('/probe', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Usage');
      expect(output).toContain('/probe');
    });

    it('rejects invalid URLs', () => {
      handleCommand('/probe not-a-url', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Invalid URL');
    });

    it('shows probing message with valid URL', () => {
      // Mock fetch to return a resolved promise (will resolve async)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html><script src="app.js"></script></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );

      handleCommand('/probe http://localhost:35555', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Probing');
    });

    it('appears in /help output', () => {
      handleCommand('/help', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('/probe');
    });

    it('handles case-insensitive /PROBE command', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html>squad</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );

      handleCommand('/PROBE http://localhost:35555', terminal);

      const output = terminal.lines.join('\n');
      expect(output).toContain('Probing');
    });

    it('strips trailing slashes from probe URL', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html>squad</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );

      handleCommand('/probe http://localhost:35555/', terminal);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:35555',
        expect.any(Object),
      );
    });
  });
});

// --- probeSquadRc async tests ---
describe('probeSquadRc', () => {
  let terminal: ReturnType<typeof createMockTerminal>;

  beforeEach(() => {
    terminal = createMockTerminal();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects Squad RC when HTML contains "squad"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><title>Squad Remote Control</title></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const { _probeSquadRc } = await import('../commands');
    await _probeSquadRc('http://localhost:35555', terminal);

    const output = terminal.lines.join('\n');
    expect(output).toContain('Squad RC detected');
    expect(output).toContain('/connect');
    expect(output).toContain('session-token');
  });

  it('detects Squad RC when HTML contains "app.js"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><script src="app.js"></script></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const { _probeSquadRc } = await import('../commands');
    await _probeSquadRc('http://localhost:35555', terminal);

    const output = terminal.lines.join('\n');
    expect(output).toContain('Squad RC detected');
  });

  it('warns when server responds but is not Squad RC', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><title>My Web App</title><p>Hello world</p></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const { _probeSquadRc } = await import('../commands');
    await _probeSquadRc('http://localhost:35555', terminal);

    const output = terminal.lines.join('\n');
    expect(output).toContain("doesn't look like Squad RC");
  });

  it('reports non-200 status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    );

    const { _probeSquadRc } = await import('../commands');
    await _probeSquadRc('http://localhost:35555', terminal);

    const output = terminal.lines.join('\n');
    expect(output).toContain('404');
    expect(output).toContain('Not Found');
  });

  it('reports unexpected content-type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { _probeSquadRc } = await import('../commands');
    await _probeSquadRc('http://localhost:35555', terminal);

    const output = terminal.lines.join('\n');
    expect(output).toContain('Unexpected content-type');
    expect(output).toContain('application/json');
  });

  it('shows timeout error when server unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted', 'TimeoutError'),
    );

    const { _probeSquadRc } = await import('../commands');
    await _probeSquadRc('http://localhost:99999', terminal);

    const output = terminal.lines.join('\n');
    expect(output).toContain('timed out');
  });

  it('shows network error when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const { _probeSquadRc } = await import('../commands');
    await _probeSquadRc('http://localhost:35555', terminal);

    const output = terminal.lines.join('\n');
    expect(output).toContain('Cannot reach');
    expect(output).toContain('squad rc --port');
  });

  it('shows agent count from status endpoint', async () => {
    // First call returns HTML (root page), second call returns status JSON
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('<html>Squad RC</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ agents: [{ name: 'Woz' }, { name: 'Jobs' }], version: '0.9.1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const { _probeSquadRc } = await import('../commands');
    await _probeSquadRc('http://localhost:35555', terminal);

    const output = terminal.lines.join('\n');
    expect(output).toContain('Squad RC detected');
    expect(output).toContain('2 registered');
    expect(output).toContain('0.9.1');
  });
});
