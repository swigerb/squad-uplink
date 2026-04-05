import { useConnectionStore } from '@/store/connectionStore';
import { useTheme } from '@/hooks/useTheme';
import './StatusBar.css';

const STATUS_INDICATORS: Record<string, string> = {
  connected: '🟢',
  connecting: '🟡',
  reconnecting: '🟡',
  disconnected: '🔴',
  error: '🔴',
};

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  error: 'Connection error',
};

export function StatusBar() {
  const status = useConnectionStore((s) => s.status);
  const tunnelUrl = useConnectionStore((s) => s.tunnelUrl);
  const crtEnabled = useConnectionStore((s) => s.crtEnabled);
  const audioEnabled = useConnectionStore((s) => s.audioEnabled);
  const toggleCRT = useConnectionStore((s) => s.toggleCRT);
  const toggleAudio = useConnectionStore((s) => s.toggleAudio);
  const { theme } = useTheme();

  return (
    <div className="statusbar" data-testid="statusbar" role="status" aria-label="Connection status bar">
      <span className="statusbar-indicator" aria-live="polite" aria-atomic="true">
        <span aria-hidden="true">{STATUS_INDICATORS[status] ?? '⚪'}</span>{' '}
        <span>{STATUS_LABELS[status] ?? status}</span>
      </span>

      {tunnelUrl && (
        <span className="statusbar-value" title={tunnelUrl} aria-label={`Tunnel URL: ${tunnelUrl}`}>
          <span aria-hidden="true">🔗</span> {tunnelUrl.length > 40 ? tunnelUrl.slice(0, 40) + '…' : tunnelUrl}
        </span>
      )}

      <span className="statusbar-label" aria-label={`Current theme: ${theme.name}`}>{theme.name}</span>

      <span className="statusbar-spacer" />

      <button
        className={`statusbar-toggle ${crtEnabled ? 'statusbar-toggle--active' : 'statusbar-toggle--inactive'}`}
        onClick={toggleCRT}
        title="Toggle CRT effects (Mechanical Switch)"
        aria-label={`CRT effects: ${crtEnabled ? 'on' : 'off'}`}
        aria-pressed={crtEnabled}
        data-testid="crt-toggle"
      >
        <span aria-hidden="true">📺</span> CRT {crtEnabled ? 'ON' : 'OFF'}
      </button>

      <button
        className={`statusbar-toggle ${audioEnabled ? 'statusbar-toggle--active' : 'statusbar-toggle--inactive'}`}
        onClick={toggleAudio}
        title="Toggle audio feedback"
        aria-label={`Audio feedback: ${audioEnabled ? 'on' : 'off'}`}
        aria-pressed={audioEnabled}
        data-testid="audio-toggle"
      >
        <span aria-hidden="true">🔊</span> Audio {audioEnabled ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
