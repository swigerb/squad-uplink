import type { AgentInfo, InboundStatus } from '@/types/squad-rc';

const STATUS_ICONS: Record<string, string> = {
  online: '🟢',
  offline: '🔴',
  busy: '🟡',
};

export function formatAgentList(agents: AgentInfo[]): string {
  if (agents.length === 0) {
    return '\x1b[2mNo agents connected.\x1b[0m\r\n';
  }
  const header = '\x1b[1mAgent Roster:\x1b[0m\r\n';
  const rows = agents
    .map((a) => `  ${STATUS_ICONS[a.status] ?? '⚪'} ${a.name} — ${a.role} (${a.status})`)
    .join('\r\n');
  return header + rows + '\r\n';
}

export function formatStatus(msg: InboundStatus): string {
  const icon = msg.connected ? '🟢' : '🔴';
  let text = `${icon} Server: ${msg.connected ? 'connected' : 'disconnected'}`;
  if (msg.tunnel) {
    text += ` | Tunnel: ${msg.tunnel}`;
  }
  return text + '\r\n';
}
