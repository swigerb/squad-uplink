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
  /connect     — Connect: /connect <wsUrl> <token>
  /disconnect  — Disconnect from squad-rc
  /clear       — Clear terminal
  /help        — Show this help message
  
\x1b[2mTip: Prefix with @agentName to direct a message to a specific agent\x1b[0m`;

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
      terminal.writeln(`   CRT: ${store.crtEnabled ? 'ON' : 'OFF'} | Audio: ${store.audioEnabled ? 'ON' : 'OFF'}`);
      break;
    }

    case '/agents': {
      if (!connectionManager.isConnected) {
        terminal.writeln('\x1b[31mNot connected. Use /connect <url> <token>\x1b[0m');
        break;
      }
      connectionManager.send({ type: 'prompt', text: '/agents' });
      terminal.writeln('\x1b[2mRequesting agent roster...\x1b[0m');
      break;
    }

    case '/connect': {
      const wsUrl = parts[1] || import.meta.env.VITE_TUNNEL_URL;
      const token = parts[2];
      if (!wsUrl) {
        terminal.writeln('\x1b[31mUsage: /connect <wsUrl> <token>\x1b[0m');
        terminal.writeln('\x1b[2mOr set VITE_TUNNEL_URL env var\x1b[0m');
        break;
      }
      if (!token) {
        terminal.writeln('\x1b[31mUsage: /connect <wsUrl> <token>\x1b[0m');
        break;
      }
      terminal.writeln(`\x1b[2mConnecting to ${wsUrl}...\x1b[0m`);
      connectionManager.connectFresh({ wsUrl, token, reconnect: true });
      break;
    }

    case '/disconnect': {
      connectionManager.disconnect();
      terminal.writeln('Disconnected.');
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
