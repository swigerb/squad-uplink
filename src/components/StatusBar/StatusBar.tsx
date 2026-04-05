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

export function StatusBar() {
  const status = useConnectionStore((s) => s.status);
  const tunnelUrl = useConnectionStore((s) => s.tunnelUrl);
  const crtEnabled = useConnectionStore((s) => s.crtEnabled);
  const audioEnabled = useConnectionStore((s) => s.audioEnabled);
  const toggleCRT = useConnectionStore((s) => s.toggleCRT);
  const toggleAudio = useConnectionStore((s) => s.toggleAudio);
  const { theme } = useTheme();

  return (
    <div className="statusbar" data-testid="statusbar">
      <span className="statusbar-indicator">
        {STATUS_INDICATORS[status] ?? '⚪'} {status}
      </span>

      {tunnelUrl && (
        <span className="statusbar-value" title={tunnelUrl}>
          🔗 {tunnelUrl.length > 40 ? tunnelUrl.slice(0, 40) + '…' : tunnelUrl}
        </span>
      )}

      <span className="statusbar-label">{theme.name}</span>

      <span className="statusbar-spacer" />

      <button
        className={`statusbar-toggle ${crtEnabled ? 'statusbar-toggle--active' : 'statusbar-toggle--inactive'}`}
        onClick={toggleCRT}
        title="Toggle CRT effects (Mechanical Switch)"
        data-testid="crt-toggle"
      >
        📺 CRT {crtEnabled ? 'ON' : 'OFF'}
      </button>

      <button
        className={`statusbar-toggle ${audioEnabled ? 'statusbar-toggle--active' : 'statusbar-toggle--inactive'}`}
        onClick={toggleAudio}
        title="Toggle audio feedback"
        data-testid="audio-toggle"
      >
        🔊 Audio {audioEnabled ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
