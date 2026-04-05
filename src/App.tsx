import { useState, useCallback } from 'react';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { Terminal } from '@/components/Terminal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CRTOverlay } from '@/components/CRTOverlay';
import '@/styles/global.css';
import '@/styles/crt-effects.css';
import '@/styles/fonts.css';
import '@/styles/win95-chrome.css';
import '@/styles/lcars-panels.css';

function FullscreenLayout({
  children,
  header,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
}) {
  return (
    <div className="crt-screen" style={{ width: '100%', height: '100%' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '8px 12px',
          position: 'absolute',
          top: 0,
          right: 0,
          zIndex: 1001,
        }}
      >
        {header}
      </header>
      {children}
      <CRTOverlay />
    </div>
  );
}

function Win95Layout({
  children,
  header,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
}) {
  return (
    <div className="win95-desktop">
      <div className="win95-window">
        <div className="win95-titlebar">
          <span className="win95-titlebar-text">
            📟 SQUAD UPLINK — Remote Agent Terminal
          </span>
          <div className="win95-titlebar-buttons">
            <button className="win95-titlebar-btn" aria-label="Minimize">_</button>
            <button className="win95-titlebar-btn" aria-label="Maximize">□</button>
            <button className="win95-titlebar-btn" aria-label="Close">×</button>
          </div>
        </div>
        <div className="win95-menubar">
          <span className="win95-menu-item">File</span>
          <span className="win95-menu-item">Edit</span>
          <span className="win95-menu-item">View</span>
          <span className="win95-menu-item">Help</span>
          <span style={{ flex: 1 }} />
          {header}
        </div>
        <div className="win95-terminal-area">{children}</div>
        <div className="win95-statusbar">
          <span className="win95-statusbar-section">Ready</span>
          <span className="win95-statusbar-section">Connected</span>
        </div>
      </div>
      <div className="win95-taskbar">
        <button className="win95-start-btn">
          🪟 Start
        </button>
      </div>
    </div>
  );
}

function LcarsLayout({
  children,
  header,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
}) {
  return (
    <div className="lcars-layout">
      <div className="lcars-sidebar">
        <div className="lcars-sidebar-top">UPLINK</div>
        <div className="lcars-sidebar-pills">
          <div className="lcars-pill" style={{ background: '#ff9900' }}>AGENTS</div>
          <div className="lcars-pill" style={{ background: '#cc99cc' }}>STATUS</div>
          <div className="lcars-pill" style={{ background: '#9999ff' }}>COMMS</div>
          <div className="lcars-pill" style={{ background: '#ffcc66' }}>LOGS</div>
          <div className="lcars-pill" style={{ background: '#ff6666' }}>ALERTS</div>
          <div className="lcars-pill" style={{ background: '#ff9900' }}>CONFIG</div>
          <div className="lcars-pill" style={{ background: '#cc99cc' }}>TASKS</div>
          <div style={{ flex: 1 }} />
        </div>
        <div className="lcars-sidebar-bottom" />
      </div>

      <div className="lcars-header">
        <div className="lcars-header-elbow" />
        <div className="lcars-header-bar">
          <div className="lcars-header-pill" style={{ background: '#ff9900' }}>
            SQUAD UPLINK
          </div>
          <div className="lcars-header-pill" style={{ background: '#ffcc66' }}>
            v0.1.0
          </div>
          <div className="lcars-header-spacer" />
          {header}
        </div>
        <div className="lcars-header-endcap" />
      </div>

      <div className="lcars-main">{children}</div>

      <div className="lcars-footer">
        <div className="lcars-footer-elbow" />
        <div className="lcars-footer-bar">
          <div className="lcars-footer-pill" style={{ background: '#9999ff' }}>
            CONNECTED
          </div>
          <div className="lcars-footer-pill" style={{ background: '#ff6666' }}>
            ACTIVE
          </div>
          <div className="lcars-footer-spacer" />
          <span className="lcars-status-text">STARDATE 2026.04</span>
        </div>
        <div className="lcars-footer-endcap" />
      </div>
    </div>
  );
}

function AppContent() {
  const [output, setOutput] = useState<string | undefined>();
  const { theme } = useTheme();

  const handleInput = useCallback((data: string) => {
    // For now, echo input back — will be wired to WebSocket
    setOutput(`[echo] ${data}`);
  }, []);

  const terminal = <Terminal onInput={handleInput} output={output} />;
  const themeToggle = <ThemeToggle />;

  const layout = theme.layout ?? 'fullscreen';

  if (layout === 'windowed') {
    return (
      <Win95Layout header={themeToggle}>
        {terminal}
      </Win95Layout>
    );
  }

  if (layout === 'panel') {
    return (
      <LcarsLayout header={themeToggle}>
        {terminal}
      </LcarsLayout>
    );
  }

  return (
    <FullscreenLayout header={themeToggle}>
      {terminal}
    </FullscreenLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
