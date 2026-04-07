import { useEffect, useRef, useCallback, useState, type JSX } from 'react';
import { useConnectionStore } from '@/store/connectionStore';
import { connectionManager } from '@/lib/ConnectionManager';
import type { StatusResponse, ConnectionError } from '@/types/squad-rc';
import './TelemetryDrawer.css';

const STATUS_REFRESH_INTERVAL = 30_000;
const EMPTY_ERRORS: ConnectionError[] = [];

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

function maskToken(token: string | undefined | null): string {
  if (!token) return '—';
  if (token.length <= 8) return '••••••••';
  return token.slice(0, 4) + '••••' + token.slice(-4);
}

function latencyClass(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 100) return 'telemetry-metric-value--good';
  if (ms < 300) return 'telemetry-metric-value--warn';
  return 'telemetry-metric-value--bad';
}

/** Render JSON with colored syntax tokens */
function renderJson(data: unknown): JSX.Element[] {
  const json = JSON.stringify(data, null, 2);
  const lines = json.split('\n');
  return lines.map((line, i) => {
    const parts: JSX.Element[] = [];
    let remaining = line;
    let keyIdx = 0;

    // Match key-value patterns
    const kvMatch = remaining.match(/^(\s*)"([^"]+)"(\s*:\s*)(.*)/);
    if (kvMatch) {
      parts.push(<span key={`${i}-indent`}>{kvMatch[1]}</span>);
      parts.push(
        <span key={`${i}-key`} className="telemetry-json-key">
          &quot;{kvMatch[2]}&quot;
        </span>,
      );
      parts.push(<span key={`${i}-colon`}>{kvMatch[3]}</span>);
      remaining = kvMatch[4];
      keyIdx = 4;
    }

    // Colorize values
    if (/^".*"/.test(remaining)) {
      parts.push(
        <span key={`${i}-val-${keyIdx}`} className="telemetry-json-string">
          {remaining}
        </span>,
      );
    } else if (/^-?\d/.test(remaining)) {
      parts.push(
        <span key={`${i}-val-${keyIdx}`} className="telemetry-json-number">
          {remaining}
        </span>,
      );
    } else if (/^(true|false|null)/.test(remaining)) {
      parts.push(
        <span key={`${i}-val-${keyIdx}`} className="telemetry-json-bool">
          {remaining}
        </span>,
      );
    } else {
      parts.push(<span key={`${i}-val-${keyIdx}`}>{remaining}</span>);
    }

    return (
      <span key={i}>
        {parts}
        {'\n'}
      </span>
    );
  });
}

const STATUS_DOT: Record<string, string> = {
  connected: 'telemetry-status-dot--connected',
  connecting: 'telemetry-status-dot--connecting',
  reconnecting: 'telemetry-status-dot--reconnecting',
  disconnected: 'telemetry-status-dot--disconnected',
  error: 'telemetry-status-dot--error',
};

const AGENT_STATUS_DOT: Record<string, string> = {
  online: 'telemetry-status-dot--connected',
  offline: 'telemetry-status-dot--disconnected',
  busy: 'telemetry-status-dot--connecting',
};

export function TelemetryDrawer() {
  const drawerOpen = useConnectionStore((s) => s.drawerOpen);
  const toggleDrawer = useConnectionStore((s) => s.toggleDrawer);
  const status = useConnectionStore((s) => s.status);
  const tunnelUrl = useConnectionStore((s) => s.tunnelUrl);
  const telemetry = useConnectionStore((s) => s.telemetry);
  const connectionErrors = useConnectionStore((s) => s.telemetry.connectionErrors ?? EMPTY_ERRORS);

  const [uptimeDisplay, setUptimeDisplay] = useState('—');
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uptimeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Uptime ticker — update every second when drawer is open
  useEffect(() => {
    if (!drawerOpen) {
      if (uptimeTimerRef.current) {
        clearInterval(uptimeTimerRef.current);
        uptimeTimerRef.current = null;
      }
      return;
    }

    setUptimeDisplay(formatUptime(telemetry.connectedAt));
    uptimeTimerRef.current = setInterval(() => {
      setUptimeDisplay(formatUptime(telemetry.connectedAt));
    }, 1000);

    return () => {
      if (uptimeTimerRef.current) {
        clearInterval(uptimeTimerRef.current);
        uptimeTimerRef.current = null;
      }
    };
  }, [drawerOpen, telemetry.connectedAt]);

  // Focus management: move focus to close button on open, restore on close
  useEffect(() => {
    if (drawerOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      // Defer focus to next frame so the drawer transition has started
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    } else if (previousFocusRef.current) {
      const el = previousFocusRef.current;
      previousFocusRef.current = null;
      // Restore focus to the element that opened the drawer
      requestAnimationFrame(() => {
        el?.focus();
      });
    }
  }, [drawerOpen]);

  // Auto-refresh /status every 30s when drawer is open and connected
  useEffect(() => {
    if (!drawerOpen || status !== 'connected') {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    // Initial fetch
    connectionManager.fetchStatus();

    refreshTimerRef.current = setInterval(() => {
      connectionManager.fetchStatus();
    }, STATUS_REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [drawerOpen, status]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await connectionManager.fetchStatus();
    setRefreshing(false);
  }, []);

  const handleBackdropClick = useCallback(() => {
    toggleDrawer();
  }, [toggleDrawer]);

  // Escape key closes the drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        toggleDrawer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, toggleDrawer]);

  const statusResponse: StatusResponse | null = telemetry.statusResponse;
  const agents = statusResponse?.agents ?? [];
  const token = tunnelUrl ? '(from config)' : null;

  return (
    <>
      <div
        className={`telemetry-backdrop ${drawerOpen ? 'telemetry-backdrop--open' : ''}`}
        onClick={handleBackdropClick}
        data-testid="telemetry-backdrop"
      />
      <aside
        className={`telemetry-drawer ${drawerOpen ? 'telemetry-drawer--open' : ''}`}
        role="complementary"
        aria-label="Telemetry panel"
        data-testid="telemetry-drawer"
      >
        {/* Header */}
        <div className="telemetry-header">
          <h2 className="telemetry-title">Telemetry</h2>
          <button
            className="telemetry-close"
            onClick={toggleDrawer}
            aria-label="Close telemetry panel"
            data-testid="telemetry-close"
            ref={closeButtonRef}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="telemetry-body">
          {/* Connection status */}
          <div className="telemetry-section">
            <h3 className="telemetry-section-title">Connection</h3>
            <div className="telemetry-status-row">
              <span
                className={`telemetry-status-dot ${STATUS_DOT[status] ?? ''}`}
              />
              <span className="telemetry-status-label">{status}</span>
            </div>
            <div className="telemetry-metrics">
              <div className="telemetry-metric">
                <div className="telemetry-metric-label">Latency</div>
                <div
                  className={`telemetry-metric-value ${latencyClass(telemetry.latencyMs)}`}
                >
                  {telemetry.latencyMs !== null ? telemetry.latencyMs : '—'}
                  {telemetry.latencyMs !== null && (
                    <span className="telemetry-metric-unit">ms</span>
                  )}
                </div>
              </div>
              <div className="telemetry-metric">
                <div className="telemetry-metric-label">Uptime</div>
                <div className="telemetry-metric-value">{uptimeDisplay}</div>
              </div>
              <div className="telemetry-metric">
                <div className="telemetry-metric-label">In msg/s</div>
                <div className="telemetry-metric-value">
                  {telemetry.inboundMps.toFixed(1)}
                </div>
              </div>
              <div className="telemetry-metric">
                <div className="telemetry-metric-label">Out msg/s</div>
                <div className="telemetry-metric-value">
                  {telemetry.outboundMps.toFixed(1)}
                </div>
              </div>
            </div>
          </div>

          {/* Session info */}
          <div className="telemetry-section">
            <h3 className="telemetry-section-title">Session</h3>
            <div className="telemetry-kv">
              <span className="telemetry-kv-key">Tunnel URL</span>
              <span className="telemetry-kv-value">
                {tunnelUrl ?? <span className="telemetry-empty">not connected</span>}
              </span>
            </div>
            <div className="telemetry-kv">
              <span className="telemetry-kv-key">Token</span>
              <span className="telemetry-kv-value telemetry-kv-value--masked">
                {maskToken(token)}
              </span>
            </div>
            <div className="telemetry-kv">
              <span className="telemetry-kv-key">Reconnects</span>
              <span className="telemetry-kv-value">
                {telemetry.reconnectCount}
              </span>
            </div>
            <div className="telemetry-kv">
              <span className="telemetry-kv-key">Last disconnect</span>
              <span className="telemetry-kv-value">
                {telemetry.lastDisconnectAt
                  ? new Date(telemetry.lastDisconnectAt).toLocaleTimeString()
                  : '—'}
              </span>
            </div>
          </div>

          {/* Connection errors */}
          {connectionErrors.length > 0 && (
            <div className="telemetry-section">
              <h3 className="telemetry-section-title">Connection Log</h3>
              <div className="telemetry-error-log">
                {connectionErrors.slice().reverse().map((err, i) => (
                  <div key={i} className="telemetry-error-entry">
                    <span className="telemetry-error-time">
                      {new Date(err.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`telemetry-error-type telemetry-error-type--${err.type}`}>
                      {err.type}
                    </span>
                    <span className="telemetry-error-message">{err.message}</span>
                    {err.url && (
                      <span className="telemetry-error-url">{err.url}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent roster */}
          <div className="telemetry-section">
            <h3 className="telemetry-section-title">Agents</h3>
            {agents.length === 0 ? (
              <span className="telemetry-empty">No agents reported</span>
            ) : (
              <ul className="telemetry-agent-list">
                {agents.map((agent) => (
                  <li key={agent.name} className="telemetry-agent-item">
                    <span
                      className={`telemetry-status-dot ${AGENT_STATUS_DOT[agent.status] ?? ''}`}
                    />
                    <span className="telemetry-agent-name">{agent.name}</span>
                    <span className="telemetry-agent-role">{agent.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Raw status response */}
          <div className="telemetry-section">
            <div className="telemetry-section-header">
              <h3 className="telemetry-section-title telemetry-section-title--flush">
                /status Response
              </h3>
              <button
                className="telemetry-refresh-btn"
                onClick={handleRefresh}
                disabled={refreshing || status !== 'connected'}
                data-testid="telemetry-refresh"
              >
                {refreshing ? '⟳ …' : '⟳ Refresh'}
              </button>
            </div>
            {statusResponse ? (
              <div className="telemetry-json" data-testid="telemetry-json">
                {renderJson(statusResponse)}
              </div>
            ) : (
              <span className="telemetry-empty">
                {status === 'connected'
                  ? 'Fetching…'
                  : status === 'reconnecting'
                    ? `Reconnecting… (attempt ${telemetry.reconnectCount})`
                    : status === 'error'
                      ? 'Connection error — see log below'
                      : 'Connect to view status'}
              </span>
            )}
            {telemetry.statusFetchedAt && (
              <div className="telemetry-timestamp">
                Last fetched:{' '}
                {new Date(telemetry.statusFetchedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="telemetry-footer">
          📡 button to toggle &nbsp;·&nbsp; Auto-refreshes every 30s
        </div>
      </aside>
    </>
  );
}
