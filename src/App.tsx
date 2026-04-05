import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { Terminal } from '@/components/Terminal';
import type { TerminalHandle } from '@/components/Terminal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CRTOverlay } from '@/components/CRTOverlay';
import { MechanicalSwitch } from '@/components/MechanicalSwitch/MechanicalSwitch';
import { AudioToggle } from '@/components/AudioToggle/AudioToggle';
import { StatusBar } from '@/components/StatusBar';
import { TelemetryDrawer } from '@/components/TelemetryDrawer';
import { connectionManager } from '@/lib/ConnectionManager';
import { useConnectionStore } from '@/store/connectionStore';
import { handleCommand } from '@/lib/commands';
import { formatAgentList, formatStatus } from '@/lib/formatters';
import type { OutboundMessage } from '@/types/squad-rc';
import '@/styles/global.css';
import '@/styles/crt-effects.css';
import '@/styles/fonts.css';
import '@/styles/accessibility.css';
import '@/styles/win95-chrome.css';
import '@/styles/lcars-panels.css';

function FullscreenLayout({
  children,
  header,
  crtEnabled,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  crtEnabled: boolean;
}) {
  return (
    <div
      className={crtEnabled ? 'crt-screen' : undefined}
      style={{ width: '100%', height: '100%' }}
    >
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
      <CRTOverlay crtEnabled={crtEnabled} />
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
  const { theme, themeId } = useTheme();
  const { muted, toggleMute } = useAudio(themeId);
  const terminalRef = useRef<TerminalHandle>(null);
  const crtEnabled = useConnectionStore((s) => s.crtEnabled);
  const toggleCRT = useConnectionStore((s) => s.toggleCRT);
  const toggleDrawer = useConnectionStore((s) => s.toggleDrawer);
  const [themeAnnouncement, setThemeAnnouncement] = useState('');

  // Announce theme changes to screen readers
  useEffect(() => {
    setThemeAnnouncement(`Theme changed to ${theme.name}`);
  }, [theme.name]);

  // Wire ConnectionManager → terminal + store
  useEffect(() => {
    connectionManager.onMessage = (msg) => {
      if (!terminalRef.current) return;
      if (msg.type === 'text') {
        const prefix = msg.agent ? `\x1b[36m[${msg.agent}]\x1b[0m ` : '';
        terminalRef.current.write(`${prefix}${msg.content}\r\n> `);
      } else if (msg.type === 'agents') {
        useConnectionStore.getState().setAgentCount(msg.agents.length);
        terminalRef.current.write(formatAgentList(msg.agents));
        terminalRef.current.write('> ');
      } else if (msg.type === 'status') {
        if (msg.tunnel) {
          useConnectionStore.getState().setTunnelUrl(msg.tunnel);
        }
        terminalRef.current.write(formatStatus(msg));
        terminalRef.current.write('> ');
      } else if (msg.type === 'error') {
        terminalRef.current.write(`\x1b[31mERROR: ${msg.message}\x1b[0m\r\n> `);
      }
    };

    connectionManager.onStateChange = (state) => {
      useConnectionStore.getState().setStatus(state);
    };

    return () => {
      connectionManager.onMessage = null;
      connectionManager.onStateChange = null;
    };
  }, []);

  const handleInput = useCallback((data: string) => {
    if (data.startsWith('/')) {
      handleCommand(data, terminalRef.current);
      return;
    }

    const msg: OutboundMessage = { type: 'prompt', text: data };

    if (data.startsWith('@')) {
      const spaceIdx = data.indexOf(' ');
      msg.agent = data.substring(1, spaceIdx > 0 ? spaceIdx : undefined);
      msg.text = spaceIdx > 0 ? data.substring(spaceIdx + 1) : '';
    }

    if (!connectionManager.isConnected) {
      terminalRef.current?.write('\x1b[31mNot connected. Use /connect <url> <token>\x1b[0m\r\n> ');
      return;
    }

    connectionManager.send(msg);
  }, []);

  // Close overlays on Escape, toggle TelemetryDrawer on Ctrl+Shift+T
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        terminalRef.current?.focus?.();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        toggleDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDrawer]);

  const terminal = <Terminal ref={terminalRef} onInput={handleInput} />;
  const controls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} role="toolbar" aria-label="Terminal controls">
      <MechanicalSwitch crtEnabled={crtEnabled} onToggle={toggleCRT} />
      <AudioToggle muted={muted} onToggle={toggleMute} />
      <ThemeToggle />
    </div>
  );

  const crtOffStyle = !crtEnabled ? { textShadow: 'none' } as React.CSSProperties : undefined;

  const layout = theme.layout ?? 'fullscreen';

  const statusBar = <StatusBar />;

  if (layout === 'windowed') {
    return (
      <>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{themeAnnouncement}</div>
        <Win95Layout header={controls}>
          <div style={crtOffStyle}>{terminal}</div>
          {statusBar}
        </Win95Layout>
        <TelemetryDrawer />
      </>
    );
  }

  if (layout === 'panel') {
    return (
      <>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{themeAnnouncement}</div>
        <LcarsLayout header={controls}>
          <div style={crtOffStyle}>{terminal}</div>
          {statusBar}
        </LcarsLayout>
        <TelemetryDrawer />
      </>
    );
  }

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">{themeAnnouncement}</div>
      <FullscreenLayout header={controls} crtEnabled={crtEnabled}>
        <div style={crtOffStyle}>{terminal}</div>
        {statusBar}
      </FullscreenLayout>
      <TelemetryDrawer />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
