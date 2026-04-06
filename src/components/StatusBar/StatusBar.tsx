import { useConnectionStore } from '@/store/connectionStore';
import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { THEME_ORDER, type ThemeId } from '@/themes';
import './StatusBar.css';

const STATUS_COLOR: Record<string, string> = {
  connected: '#22c55e',
  connecting: '#eab308',
  reconnecting: '#eab308',
  disconnected: '#ef4444',
  error: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  error: 'Connection error',
};

const THEME_LABELS: Record<ThemeId, string> = {
  apple2e: '🍎',
  c64: '📺',
  ibm3270: '🖥️',
  win95: '🪟',
  lcars: '🚀',
  pipboy: '☢️',
  muthur: '👽',
  wopr: '🎮',
  matrix: '💊',
};

const THEME_NAMES: Record<ThemeId, string> = {
  apple2e: 'Apple IIe',
  c64: 'C64',
  ibm3270: 'IBM 3270',
  win95: 'Win 95',
  lcars: 'LCARS',
  pipboy: 'Pip-Boy',
  muthur: 'MU-TH-UR',
  wopr: 'W.O.P.R.',
  matrix: 'The Matrix',
};

export function StatusBar() {
  const status = useConnectionStore((s) => s.status);
  const crtEnabled = useConnectionStore((s) => s.crtEnabled);
  const toggleCRT = useConnectionStore((s) => s.toggleCRT);
  const terminalFullscreen = useConnectionStore((s) => s.terminalFullscreen);
  const toggleFullscreen = useConnectionStore((s) => s.toggleFullscreen);
  const { themeId, theme, toggleTheme } = useTheme();
  const { muted, toggleMute, play } = useAudio(themeId);

  // CRT toggle only for themes with crtEnabled: true, excluding pipboy
  const showCrtToggle = theme.crtEnabled === true && theme.id !== 'pipboy';

  const handleCRTToggle = () => {
    play('crt_toggle');
    toggleCRT();
  };

  const nextIdx = (THEME_ORDER.indexOf(themeId) + 1) % THEME_ORDER.length;
  const nextThemeId = THEME_ORDER[nextIdx];
  const nextThemeDisplayName = THEME_NAMES[nextThemeId];

  return (
    <div className="uplink-controls" data-testid="statusbar" role="toolbar" aria-label="Uplink controls">
      {/* Connection status dot */}
      <span
        className="uplink-controls-dot"
        style={{ background: STATUS_COLOR[status] ?? '#888' }}
        aria-live="polite"
        aria-atomic="true"
        aria-label={STATUS_LABELS[status] ?? status}
        title={STATUS_LABELS[status] ?? status}
        data-testid="connection-status"
      />

      {/* Theme cycle */}
      <button
        className="uplink-controls-btn"
        onClick={toggleTheme}
        title={`Switch to ${nextThemeDisplayName}`}
        aria-label={`Current theme: ${theme.name}. Switch to ${nextThemeDisplayName}`}
        data-testid="theme-toggle"
      >
        {THEME_LABELS[themeId] ?? '🎨'}
      </button>

      {/* Audio toggle */}
      <button
        className={`uplink-controls-btn ${!muted ? 'uplink-controls-btn--active' : ''}`}
        onClick={toggleMute}
        title={`Audio: ${muted ? 'OFF' : 'ON'}`}
        aria-label={`Audio feedback: ${!muted ? 'on' : 'off'}`}
        aria-pressed={!muted}
        data-testid="audio-toggle"
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {/* CRT toggle — only for apple2e, c64, ibm3270 */}
      {showCrtToggle && (
        <button
          className={`uplink-controls-btn ${crtEnabled ? 'uplink-controls-btn--active' : ''}`}
          onClick={handleCRTToggle}
          title={`CRT: ${crtEnabled ? 'ON' : 'OFF'}`}
          aria-label={`CRT effects: ${crtEnabled ? 'on' : 'off'}`}
          aria-pressed={crtEnabled}
          data-testid="crt-toggle"
        >
          📺
        </button>
      )}

      {/* Fullscreen toggle */}
      <button
        className={`uplink-controls-btn ${terminalFullscreen ? 'uplink-controls-btn--active' : ''}`}
        onClick={() => {
          toggleFullscreen();
          requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        }}
        title={terminalFullscreen ? 'Exit fullscreen' : 'Fullscreen terminal'}
        aria-label={terminalFullscreen ? 'Exit fullscreen terminal' : 'Expand terminal to fullscreen'}
        aria-pressed={terminalFullscreen}
        data-testid="fullscreen-toggle"
      >
        {terminalFullscreen ? '⊟' : '⛶'}
      </button>
    </div>
  );
}
