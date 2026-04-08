import { connectionManager } from './ConnectionManager';
import { useConnectionStore } from '@/store/connectionStore';

export interface TerminalWriter {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
}

const HELP_TEXT = `\x1b[1mAvailable commands:\x1b[0m
  /status      — Show connection state, tunnel URL, agent count
  /agents      — Request agent roster from squad-rc
  /connect     — Connect: /connect <url> [token]
  /probe       — Check if Squad RC is running: /probe <url>
  /auth        — Open Dev Tunnel auth in browser: /auth <tunnel-url>
  /disconnect  — Disconnect from squad-rc
  /reset       — Clear terminal and reconnect
  /clear       — Clear terminal
  /help        — Show this help message
  
\x1b[2mTip: Prefix with @agentName to direct a message to a specific agent\x1b[0m
  
\x1b[2mSquad RC auth:
  1. Get the session token from squad rc output (printed at startup)
  2. /connect http://localhost:PORT <token>
  For Dev Tunnels: /auth <url> → login → /connect <url> <token>
  Anonymous tunnels: devtunnel port create -p PORT --protocol https --allow-anonymous\x1b[0m`;

export function handleCommand(input: string, terminal: TerminalWriter | null): void {
  if (!terminal) return;

  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help': {
      terminal.writeln(HELP_TEXT);
      break;
    }

    case '/status': {
      const store = useConnectionStore.getState();
      const statusIcon =
        store.status === 'connected' ? '🟢' :
        store.status === 'connecting' || store.status === 'reconnecting' ? '🟡' :
        '🔴';
      terminal.writeln(`${statusIcon} Connection: ${store.status}`);
      if (store.tunnelUrl) {
        terminal.writeln(`   Tunnel: ${store.tunnelUrl}`);
      }
      terminal.writeln(`   Agents: ${store.agentCount}`);
      const audioMuted = localStorage.getItem('squad-uplink-audio-muted') === 'true';
      terminal.writeln(`   CRT: ${store.crtEnabled ? 'ON' : 'OFF'} | Audio: ${audioMuted ? 'OFF' : 'ON'}`);
      break;
    }

    case '/agents': {
      if (!connectionManager.isConnected) {
        terminal.writeln('\x1b[31mNot connected. Use /connect <url> or /auth <url> first\x1b[0m');
        break;
      }
      connectionManager.send({ type: 'prompt', text: '/agents' });
      terminal.writeln('\x1b[2mRequesting agent roster...\x1b[0m');
      break;
    }

    case '/connect': {
      const wsUrl = parts[1] || import.meta.env.VITE_TUNNEL_URL;
      const token = parts[2]; // Optional — omit for anonymous tunnels or cookie auth
      if (!wsUrl) {
        terminal.writeln('\x1b[31mUsage: /connect <url> [token]\x1b[0m');
        terminal.writeln('\x1b[2mToken is optional for anonymous tunnels or cookie-based auth\x1b[0m');
        terminal.writeln('\x1b[2mOr set VITE_TUNNEL_URL env var\x1b[0m');
        break;
      }
      // Pass raw URL to ConnectionManager — it handles protocol conversion
      // and auth strategy (ticket exchange for HTTP, token param for WS)
      terminal.writeln(`\x1b[2mConnecting to ${wsUrl}...\x1b[0m`);
      let authLabel: string;
      if (token) {
        if (wsUrl.startsWith('https://') || wsUrl.startsWith('http://')) {
          authLabel = 'ticket exchange';
        } else {
          authLabel = 'token (query param)';
        }
      } else {
        authLabel = 'none (anonymous)';
      }
      terminal.writeln(`\x1b[2m  Auth: ${authLabel}\x1b[0m`);
      if (!token) {
        terminal.writeln(`\x1b[33m  ⚠ No session token provided. Squad RC requires a token for WebSocket auth.\x1b[0m`);
        terminal.writeln(`\x1b[2m  Get the token from squad rc startup output, then: /connect <url> <token>\x1b[0m`);
        terminal.writeln(`\x1b[2m  Or run /probe ${wsUrl} to check if Squad RC is running.\x1b[0m`);
      }
      connectionManager.connectFresh({ wsUrl, token: token || '', reconnect: true });
      break;
    }

    case '/stop':
    case '/disconnect': {
      connectionManager.disconnect();
      terminal.writeln('Disconnected.');
      break;
    }

    case '/reset': {
      const wasConnected = connectionManager.isConnected;
      connectionManager.disconnect();
      terminal.clear();
      terminal.writeln('Terminal cleared. Connection reset.');
      if (wasConnected) {
        terminal.writeln('Use /connect to re-establish connection.');
      }
      break;
    }

    case '/auth': {
      const tunnelUrl = parts[1];
      if (!tunnelUrl) {
        terminal.writeln('\x1b[31mUsage: /auth <devtunnel-url>\x1b[0m');
        terminal.writeln('\x1b[2mOpens the Dev Tunnel URL in a new browser tab for Entra ID authentication.\x1b[0m');
        break;
      }
      // Strip trailing slashes — Dev Tunnel relay is sensitive to these
      const cleanUrl = tunnelUrl.trim().replace(/\/+$/, '');
      try {
        new URL(cleanUrl); // validate URL
      } catch {
        terminal.writeln(`\x1b[31mInvalid URL: ${cleanUrl}\x1b[0m`);
        terminal.writeln('\x1b[2mExpected format: https://<id>.use2.devtunnels.ms\x1b[0m');
        break;
      }
      window.open(cleanUrl, '_blank');
      terminal.writeln(`\x1b[32m🔐 Opening Dev Tunnel auth in browser...\x1b[0m`);
      terminal.writeln(`\x1b[2m   ${cleanUrl}\x1b[0m`);
      terminal.writeln(`\x1b[2mComplete Entra ID sign-in, then use /connect to establish the WebSocket.\x1b[0m`);
      break;
    }

    case '/probe': {
      const probeUrl = parts[1];
      if (!probeUrl) {
        terminal.writeln('\x1b[31mUsage: /probe <url>\x1b[0m');
        terminal.writeln('\x1b[2mChecks if a Squad RC instance is running at the given URL.\x1b[0m');
        break;
      }
      const cleanProbeUrl = probeUrl.trim().replace(/\/+$/, '');
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(cleanProbeUrl);
      } catch {
        terminal.writeln(`\x1b[31mInvalid URL: ${cleanProbeUrl}\x1b[0m`);
        terminal.writeln('\x1b[2mExpected format: http://localhost:35555\x1b[0m');
        break;
      }
      terminal.writeln(`\x1b[2m🔍 Probing ${parsedUrl.origin}...\x1b[0m`);
      probeSquadRc(parsedUrl.origin, terminal);
      break;
    }

    case '/clear': {
      terminal.clear();
      break;
    }

    default: {
      terminal.writeln(`\x1b[31mUnknown command: ${cmd}\x1b[0m`);
      terminal.writeln('Type /help for available commands.');
      break;
    }
  }
}

/**
 * Probe a URL to check if a Squad RC instance is running.
 * Fetches the root page and looks for Squad RC HTML markers.
 */
async function probeSquadRc(origin: string, terminal: TerminalWriter): Promise<void> {
  try {
    const resp = await fetch(origin, {
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      terminal.writeln(`\x1b[33m⚠ Server responded with ${resp.status} ${resp.statusText}\x1b[0m`);
      terminal.writeln('\x1b[2mMay not be a Squad RC instance.\x1b[0m');
      return;
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      terminal.writeln(`\x1b[33m⚠ Unexpected content-type: ${contentType}\x1b[0m`);
      terminal.writeln('\x1b[2mSquad RC serves HTML at /. This may not be Squad RC.\x1b[0m');
      return;
    }

    const html = await resp.text();
    const isSquadRc = html.includes('squad') || html.includes('Squad') || html.includes('app.js');

    if (isSquadRc) {
      terminal.writeln(`\x1b[32m✓ Squad RC detected at ${origin}\x1b[0m`);
      terminal.writeln('\x1b[2mAuth: Session token required for WebSocket connection.\x1b[0m');
      terminal.writeln(`\x1b[2mUsage: /connect ${origin} <session-token>\x1b[0m`);
      terminal.writeln('\x1b[2mThe session token UUID is printed by squad rc at startup.\x1b[0m');

      // Try the status endpoint (will fail without token, but 401 confirms auth is needed)
      try {
        const statusResp = await fetch(`${origin}/status`, {
          signal: AbortSignal.timeout(3000),
        });
        if (statusResp.ok) {
          const data = await statusResp.json();
          if (data.agents) {
            terminal.writeln(`\x1b[32m  Agents: ${data.agents.length} registered\x1b[0m`);
          }
          if (data.version) {
            terminal.writeln(`\x1b[2m  Version: ${data.version}\x1b[0m`);
          }
        }
      } catch {
        // Status endpoint may require auth — expected
      }
    } else {
      terminal.writeln(`\x1b[33m⚠ Server is running but doesn't look like Squad RC.\x1b[0m`);
      terminal.writeln('\x1b[2mSquad RC serves a PWA with app.js at /.\x1b[0m');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort') || message.includes('timeout') || message.includes('TimeoutError')) {
      terminal.writeln(`\x1b[31m✗ Connection timed out (5s)\x1b[0m`);
      terminal.writeln(`\x1b[2mNo server responding at ${origin}\x1b[0m`);
    } else if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('fetch')) {
      terminal.writeln(`\x1b[31m✗ Cannot reach ${origin}\x1b[0m`);
      terminal.writeln('\x1b[2mIs Squad RC running? Start it with: squad rc --port PORT\x1b[0m');
    } else {
      terminal.writeln(`\x1b[31m✗ Probe failed: ${message}\x1b[0m`);
    }
  }
}

// Export for testing
export { probeSquadRc as _probeSquadRc };
