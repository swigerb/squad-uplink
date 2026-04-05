import { useEffect, useState } from 'react';
import { useConnectionStore } from '@/store/connectionStore';

interface SpecialStat {
  key: string;
  label: string;
  fullName: string;
  value: number;
  display: string;
}

function latencyToStrength(ms: number | null): number {
  if (ms === null) return 0;
  if (ms < 100) return 10;
  if (ms < 500) return 7;
  if (ms < 1000) return 4;
  return 1;
}

function throughputToPerception(mps: number): number {
  if (mps <= 0) return 0;
  return Math.min(10, Math.max(1, Math.round(mps * 2)));
}

function uptimeToEndurance(connectedAt: number | null): number {
  if (!connectedAt) return 0;
  const hours = (Date.now() - connectedAt) / 3_600_000;
  if (hours < 0.01) return 1;
  if (hours < 0.5) return 3;
  if (hours < 1) return 5;
  if (hours < 4) return 7;
  if (hours < 8) return 9;
  return 10;
}

function agentsToCharisma(count: number): number {
  if (count <= 0) return 0;
  return Math.min(10, count);
}

function successToLuck(success: number, total: number): number {
  if (total === 0) return 0;
  const pct = (success / total) * 100;
  return Math.min(10, Math.max(1, Math.round(pct / 10)));
}

function formatUptime(connectedAt: number | null): string {
  if (!connectedAt) return '—';
  const elapsed = Math.max(0, Math.floor((Date.now() - connectedAt) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatBar({ stat }: { stat: SpecialStat }) {
  const filled = Math.round(stat.value);
  const empty = 10 - filled;

  return (
    <div className="pipboy-stat-row" data-testid={`stat-${stat.key}`}>
      <span className="pipboy-stat-letter">{stat.key}</span>
      <span className="pipboy-stat-name">{stat.fullName}</span>
      <span className="pipboy-stat-bar">
        {'█'.repeat(filled)}
        {'░'.repeat(Math.max(0, empty))}
      </span>
      <span className="pipboy-stat-value">{stat.display}</span>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  connected: '#1bff80',
  connecting: '#ffb641',
  reconnecting: '#ffb641',
  disconnected: '#ff4444',
  error: '#ff4444',
};

const STATUS_LABEL: Record<string, string> = {
  connected: 'CONNECTED',
  connecting: 'CONNECTING...',
  reconnecting: 'RECONNECTING...',
  disconnected: 'DISCONNECTED',
  error: 'ERROR',
};

export function PipBoyStat() {
  const status = useConnectionStore((s) => s.status);
  const agentCount = useConnectionStore((s) => s.agentCount);
  const telemetry = useConnectionStore((s) => s.telemetry);
  const [, setTick] = useState(0);

  // Tick every second for uptime refresh
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const totalMps = telemetry.inboundMps + telemetry.outboundMps;
  const successPct =
    telemetry.messageCount > 0
      ? Math.round((telemetry.successCount / telemetry.messageCount) * 100)
      : 0;

  const stats: SpecialStat[] = [
    {
      key: 'S',
      label: 'STR',
      fullName: 'Strength',
      value: latencyToStrength(telemetry.latencyMs),
      display:
        telemetry.latencyMs !== null ? `${telemetry.latencyMs}ms` : '— ms',
    },
    {
      key: 'P',
      label: 'PER',
      fullName: 'Perception',
      value: throughputToPerception(totalMps),
      display: `${totalMps.toFixed(1)}/s`,
    },
    {
      key: 'E',
      label: 'END',
      fullName: 'Endurance',
      value: uptimeToEndurance(telemetry.connectedAt),
      display: formatUptime(telemetry.connectedAt),
    },
    {
      key: 'C',
      label: 'CHR',
      fullName: 'Charisma',
      value: agentsToCharisma(agentCount),
      display: `${agentCount} agent${agentCount !== 1 ? 's' : ''}`,
    },
    {
      key: 'I',
      label: 'INT',
      fullName: 'Intelligence',
      value: Math.min(
        10,
        Math.max(0, Math.round(telemetry.tokenUsage / 1000)),
      ),
      display: `${telemetry.tokenUsage.toLocaleString()} tok`,
    },
    {
      key: 'A',
      label: 'AGL',
      fullName: 'Agility',
      value: latencyToStrength(telemetry.latencyMs),
      display:
        telemetry.latencyMs !== null ? `${telemetry.latencyMs}ms RTT` : '— ms',
    },
    {
      key: 'L',
      label: 'LCK',
      fullName: 'Luck',
      value: successToLuck(telemetry.successCount, telemetry.messageCount),
      display:
        telemetry.messageCount > 0
          ? `${successPct}%`
          : '— %',
    },
  ];

  return (
    <div className="pipboy-stat" data-testid="pipboy-stat">
      <div
        className="pipboy-stat-status"
        style={{ color: STATUS_COLOR[status] ?? '#666' }}
        data-testid="pipboy-stat-status"
      >
        ■ {STATUS_LABEL[status] ?? status.toUpperCase()}
      </div>

      <div className="pipboy-stat-title">S.P.E.C.I.A.L.</div>

      <div className="pipboy-stat-list">
        {stats.map((stat) => (
          <StatBar key={stat.key} stat={stat} />
        ))}
      </div>

      <div className="pipboy-stat-footer">
        MSGS: {telemetry.messageCount} | RECONNECTS:{' '}
        {telemetry.reconnectCount}
      </div>
    </div>
  );
}
