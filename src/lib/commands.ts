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
  /auth        — Authenticate: /auth <tunnel-url> (opens Microsoft login)
  /disconnect  — Disconnect from squad-rc
  /stop        — Disconnect from squad-rc (alias)
  /reset       — Clear terminal and reconnect
  /clear       — Clear terminal
  /help        — Show this help message
  
\x1b[2mTip: Prefix with @agentName to direct a message to a specific agent\x1b[0m
  
\x1b[2mDevTunnel auth:
  Cookie: /auth <url> → login → /connect <url>
  Anonymous: devtunnel port create -p PORT --protocol https --allow-anonymous\x1b[0m`;

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

    case '/auth': {
      let authUrl = parts[1] || import.meta.env.VITE_TUNNEL_URL;
      if (!authUrl) {
        terminal.writeln('\x1b[31mUsage: /auth <tunnel-url>\x1b[0m');
        terminal.writeln('\x1b[2mOpens the DevTunnel URL for Microsoft login\x1b[0m');
        break;
      }
      // Ensure HTTPS for auth (not WSS)
      if (authUrl.startsWith('wss://')) {
        authUrl = authUrl.replace(/^wss/, 'https');
      } else if (authUrl.startsWith('ws://')) {
        authUrl = authUrl.replace(/^ws/, 'http');
      }
      terminal.writeln('\x1b[2mOpening DevTunnel for authentication...\x1b[0m');
      const connectUrl = authUrl.replace(/^https/, 'wss').replace(/^http/, 'ws');
      const popup = window.open(authUrl, '_blank');
      if (!popup) {
        terminal.writeln('\x1b[33mPopup blocked! Open this URL manually in your browser:\x1b[0m');
        terminal.writeln(`  ${authUrl}`);
      }
      terminal.writeln('\x1b[2mAfter Microsoft login, run:\x1b[0m');
      terminal.writeln(`  /connect ${connectUrl}`);
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
      // Normalize protocol for browser WebSocket compatibility
      let normalizedUrl = wsUrl;
      if (normalizedUrl.startsWith('https://')) {
        normalizedUrl = normalizedUrl.replace(/^https/, 'wss');
      } else if (normalizedUrl.startsWith('http://')) {
        normalizedUrl = normalizedUrl.replace(/^http/, 'ws');
      }
      terminal.writeln(`\x1b[2mConnecting to ${normalizedUrl}...\x1b[0m`);
      terminal.writeln(`\x1b[2m  Auth: ${token ? 'token (access_token param)' : 'cookie (browser session)'}\x1b[0m`);
      if (!token) {
        terminal.writeln(`\x1b[2m  Tip: Run /auth <url> first to sign in via Microsoft\x1b[0m`);
      }
      connectionManager.connectFresh({ wsUrl: normalizedUrl, token: token || '', reconnect: true });
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
