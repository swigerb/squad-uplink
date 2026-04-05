import { useConnectionStore } from '@/store/connectionStore';
import type { AgentInfo } from '@/types/squad-rc';

const STATUS_ICON: Record<string, string> = {
  online: '●',
  offline: '○',
  busy: '◐',
};

const STATUS_LABEL: Record<string, string> = {
  online: 'IDLE',
  offline: 'OFFLINE',
  busy: 'WORKING',
};

function AgentNode({
  agent,
  isActive,
  isLast,
}: {
  agent: AgentInfo;
  isActive: boolean;
  isLast: boolean;
}) {
  const prefix = isLast ? '└──' : '├──';
  const statusIcon = STATUS_ICON[agent.status] ?? '?';
  const statusLabel = STATUS_LABEL[agent.status] ?? agent.status;
  const statusClass = `pipboy-map-status-${agent.status}`;

  return (
    <div
      className={`pipboy-map-node ${isActive ? 'pipboy-map-node-active' : ''}`}
      data-testid={`map-agent-${agent.name}`}
    >
      <span className="pipboy-map-branch">{prefix} </span>
      <span className={`pipboy-map-icon ${statusClass}`}>{statusIcon}</span>
      <span className="pipboy-map-name">
        {agent.name}
      </span>
      <span className="pipboy-map-role">({agent.role})</span>
      <span className={`pipboy-map-label ${statusClass}`}>
        {statusLabel}
      </span>
      {isActive && (
        <span className="pipboy-map-active-indicator"> ◄ ACTIVE</span>
      )}
    </div>
  );
}

export function PipBoyMap() {
  const status = useConnectionStore((s) => s.status);
  const telemetry = useConnectionStore((s) => s.telemetry);
  const activeAgent = useConnectionStore((s) => s.activeAgent);

  const agents: AgentInfo[] = telemetry.statusResponse?.agents ?? [];

  if (status === 'disconnected') {
    return (
      <div className="pipboy-map" data-testid="pipboy-map">
        <div className="pipboy-map-offline" data-testid="pipboy-map-offline">
          <div className="pipboy-map-offline-icon">⦻</div>
          <div>NO SIGNAL — AGENTS OFFLINE</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pipboy-map" data-testid="pipboy-map">
      <div className="pipboy-map-header">AGENT TOPOLOGY</div>

      <div className="pipboy-map-tree" data-testid="pipboy-map-tree">
        <div className="pipboy-map-root">
          <span className="pipboy-map-branch">┌─ </span>
          <span className="pipboy-map-root-label">SQUAD COORDINATOR</span>
        </div>

        {agents.length === 0 ? (
          <div className="pipboy-map-empty">
            <span className="pipboy-map-branch">└── </span>
            <span className="pipboy-map-none">No agents reported</span>
          </div>
        ) : (
          agents.map((agent, i) => (
            <AgentNode
              key={agent.name}
              agent={agent}
              isActive={activeAgent === agent.name}
              isLast={i === agents.length - 1}
            />
          ))
        )}
      </div>

      <div className="pipboy-map-footer">
        ACTIVE NODES: {agents.filter((a) => a.status !== 'offline').length}/
        {agents.length}
      </div>
    </div>
  );
}
