import { useConnectionStore } from '@/store/connectionStore';
import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { ThemeToggle } from '@/components/ThemeToggle';
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
  const toggleCRT = useConnectionStore((s) => s.toggleCRT);
  const { themeId, theme } = useTheme();
  const { muted, toggleMute, play } = useAudio(themeId);

  // CRT toggle only for themes with their own CRT system controlled by this toggle.
  // Pip-Boy has built-in CRT effects; Win95/LCARS have crtEnabled: false.
  const showCrtToggle = theme.crtEnabled === true && theme.id !== 'pipboy';

  const handleCRTToggle = () => {
    play('crt_toggle');
    toggleCRT();
  };

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

      <span className="statusbar-spacer" />

      {showCrtToggle && (
        <button
          className={`statusbar-toggle ${crtEnabled ? 'statusbar-toggle--active' : 'statusbar-toggle--inactive'}`}
          onClick={handleCRTToggle}
          title="Toggle CRT effects"
          aria-label={`CRT effects: ${crtEnabled ? 'on' : 'off'}`}
          aria-pressed={crtEnabled}
          data-testid="crt-toggle"
        >
          <span aria-hidden="true">📺</span> CRT {crtEnabled ? 'ON' : 'OFF'}
        </button>
      )}

      <button
        className={`statusbar-toggle ${!muted ? 'statusbar-toggle--active' : 'statusbar-toggle--inactive'}`}
        onClick={toggleMute}
        title="Toggle audio feedback"
        aria-label={`Audio feedback: ${!muted ? 'on' : 'off'}`}
        aria-pressed={!muted}
        data-testid="audio-toggle"
      >
        <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span> Audio {muted ? 'OFF' : 'ON'}
      </button>

      <ThemeToggle />
    </div>
  );
}
