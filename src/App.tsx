import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { ThemeProvider } from '@/hooks/ThemeProvider';
import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { Terminal } from '@/components/Terminal';
import type { TerminalHandle } from '@/components/Terminal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CRTOverlay } from '@/components/CRTOverlay';
import { MechanicalSwitch } from '@/components/MechanicalSwitch/MechanicalSwitch';
import { AudioToggle } from '@/components/AudioToggle/AudioToggle';
import { StatusBar } from '@/components/StatusBar';
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
import { PipBoyStat, PipBoyInv, PipBoyMap, PipBoyRadio } from '@/components/PipBoy/tabs';
import '@/styles/pipboy.css';

const TelemetryDrawer = lazy(() =>
  import('@/components/TelemetryDrawer/TelemetryDrawer').then((m) => ({
    default: m.TelemetryDrawer,
  })),
);

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
  const [windowState, setWindowState] = useState<'normal' | 'minimized' | 'maximized' | 'closed'>('normal');
  const [iconSelected, setIconSelected] = useState(false);
  const status = useConnectionStore((s) => s.status);

  // Taskbar clock — updates every minute
  const [clock, setClock] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    };
    const id = setInterval(updateClock, 60000);
    return () => clearInterval(id);
  }, []);

  const isWindowVisible = windowState === 'normal' || windowState === 'maximized';
  const isRunning = windowState !== 'closed';

  const handleMinimize = useCallback(() => setWindowState('minimized'), []);
  const handleMaximize = useCallback(
    () => setWindowState((s) => (s === 'maximized' ? 'normal' : 'maximized')),
    [],
  );
  const handleClose = useCallback(() => {
    setWindowState('closed');
    setIconSelected(false);
  }, []);
  const handleTaskbarClick = useCallback(() => {
    setWindowState((s) => (s === 'minimized' ? 'normal' : 'minimized'));
  }, []);
  const handleDesktopClick = useCallback(() => setIconSelected(false), []);
  const handleIconClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIconSelected(true);
  }, []);
  const handleIconDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setWindowState('normal');
    setIconSelected(false);
  }, []);

  const WIN95_STATUS: Record<string, string> = {
    connected: 'Connected',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    disconnected: 'Disconnected',
    error: 'Error',
  };
  const statusText = WIN95_STATUS[status] ?? status;

  return (
    <div className="win95-desktop" onClick={handleDesktopClick}>
      {/* Desktop icon — visible only when window is closed */}
      {windowState === 'closed' && (
        <div
          className={`win95-desktop-icon ${iconSelected ? 'win95-desktop-icon--selected' : ''}`}
          onClick={handleIconClick}
          onDoubleClick={handleIconDoubleClick}
          role="button"
          aria-label="SQUAD UPLINK — double-click to open"
          tabIndex={0}
          data-testid="win95-desktop-icon"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setWindowState('normal');
              setIconSelected(false);
            }
          }}
        >
          <div className="win95-desktop-icon-img" aria-hidden="true">📟</div>
          <div className="win95-desktop-icon-label">SQUAD UPLINK</div>
        </div>
      )}

      {/* Window — hidden via display:none when minimized/closed to keep terminal mounted */}
      <div
        className={`win95-window ${windowState === 'maximized' ? 'win95-window--maximized' : ''}`}
        style={{ display: isWindowVisible ? undefined : 'none' }}
      >
        <div className="win95-titlebar">
          <span className="win95-titlebar-text">
            📟 SQUAD UPLINK — Remote Agent Terminal
          </span>
          <div className="win95-titlebar-buttons">
            <button className="win95-titlebar-btn" aria-label="Minimize" onClick={handleMinimize}>_</button>
            <button className="win95-titlebar-btn" aria-label="Maximize" onClick={handleMaximize}>
              {windowState === 'maximized' ? '❐' : '□'}
            </button>
            <button className="win95-titlebar-btn" aria-label="Close" onClick={handleClose}>×</button>
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
          <span className="win95-statusbar-section">{statusText}</span>
          <span className="win95-statusbar-section">Windows 95</span>
        </div>
      </div>

      {/* Taskbar — always visible */}
      <div className="win95-taskbar">
        <button className="win95-start-btn">
          🪟 Start
        </button>
        {isRunning && (
          <button
            className={`win95-taskbar-btn ${isWindowVisible ? 'win95-taskbar-btn--active' : ''}`}
            onClick={handleTaskbarClick}
            aria-label="SQUAD UPLINK"
            data-testid="win95-taskbar-app-btn"
          >
            📟 SQUAD UPLINK
          </button>
        )}
        <span className="win95-taskbar-spacer" />
        <div className="win95-taskbar-clock" aria-label={`Time: ${clock}`} data-testid="win95-taskbar-clock">
          {clock}
        </div>
      </div>
    </div>
  );
}

const PIPBOY_TABS = ['STAT', 'INV', 'DATA', 'MAP', 'RADIO'] as const;
type PipBoyTab = (typeof PIPBOY_TABS)[number];

const PIPBOY_TAB_LABELS: Record<PipBoyTab, string> = {
  STAT: 'pipboy-lbl-stat',
  INV: 'pipboy-lbl-inv',
  DATA: 'pipboy-lbl-data',
  MAP: 'pipboy-lbl-map',
  RADIO: 'pipboy-lbl-radio',
};

function usePipBoyScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const sx = window.innerWidth / 660;
      const sy = window.innerHeight / 520;
      setScale(Math.min(sx, sy, 2.5));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

function PipBoyLayout({
  children,
  header,
  statusBar,
  crtEnabled,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  statusBar: React.ReactNode;
  crtEnabled: boolean;
}) {
  const [activeTab, setActiveTab] = useState<PipBoyTab>('DATA');
  const scale = usePipBoyScale();

  const handleTabClick = useCallback((tab: PipBoyTab) => {
    setActiveTab(tab);
  }, []);

  const handleTabKey = useCallback((e: React.KeyboardEvent, tab: PipBoyTab) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActiveTab(tab);
    }
  }, []);

  return (
    <div
      className={crtEnabled ? 'crt-screen' : undefined}
      style={{ width: '100%', height: '100%' }}
    >
      <div className="pipboy-viewport">
        {/* Exact Codepen Pip-Boy 3000 structure */}
        <div className="pipboy-pip" style={{ transform: `scale(${scale})` }}>
          <div className="pipboy-pipfront">
            <div className="pipboy-dtop">
              <div className="pipboy-top-panel" />
            </div>
            <div className="pipboy-top-button" />
            <div className="pipboy-screw1" /><div className="pipboy-screw2" />
            <div className="pipboy-screen-border">
              <div className="pipboy-screen">
                <div className="pipboy-screen-reflection" />
                <div className="pipboy-scan" />
                <nav className="pipboy-nav" role="tablist" aria-label="Pip-Boy navigation">
                  {PIPBOY_TABS.map((tab) => (
                    <span
                      key={tab}
                      className={`${PIPBOY_TAB_LABELS[tab]} ${activeTab === tab ? 'pipboy-active' : ''}`}
                      role="tab"
                      aria-selected={activeTab === tab}
                      aria-label={tab}
                      tabIndex={0}
                      onClick={() => handleTabClick(tab)}
                      onKeyDown={(e) => handleTabKey(e, tab)}
                    />
                  ))}
                  <p>
                    <span className="pipboy-lbl-status" />
                    <span className="pipboy-off pipboy-lbl-special" />
                  </p>
                </nav>

                {/* Controls overlay */}
                <div className="pipboy-controls">{header}</div>

                {/* Functional content area */}
                <div className="pipboy-screen-inner">
                  <div className="pipboy-content">
                    {/* DATA tab — terminal always mounted */}
                    <div
                      id="pipboy-panel-DATA"
                      role="tabpanel"
                      aria-label="DATA"
                      className={`pipboy-tab-panel ${activeTab !== 'DATA' ? 'pipboy-tab-panel--hidden' : ''}`}
                      style={{ display: activeTab !== 'DATA' ? 'none' : undefined }}
                    >
                      <div className="pipboy-terminal-wrap">{children}</div>
                    </div>

                    {activeTab === 'STAT' && (
                      <div id="pipboy-panel-STAT" role="tabpanel" aria-label="STAT" className="pipboy-tab-panel">
                        <PipBoyStat />
                      </div>
                    )}

                    {activeTab === 'INV' && (
                      <div id="pipboy-panel-INV" role="tabpanel" aria-label="INV" className="pipboy-tab-panel">
                        <PipBoyInv />
                      </div>
                    )}

                    {activeTab === 'MAP' && (
                      <div id="pipboy-panel-MAP" role="tabpanel" aria-label="MAP" className="pipboy-tab-panel">
                        <PipBoyMap />
                      </div>
                    )}

                    {activeTab === 'RADIO' && (
                      <div id="pipboy-panel-RADIO" role="tabpanel" aria-label="RADIO" className="pipboy-tab-panel">
                        <PipBoyRadio />
                      </div>
                    )}
                  </div>
                </div>

                {/* Codepen decorative bottom elements */}
                <div className="pipboy-supplies">
                  <span>Stimpak (0)</span><span>Radaway (0)</span><span>UPLINK</span>
                </div>
                <div className="pipboy-info-bar">
                  <span className="pipboy-weapon" />
                  <span className="pipboy-aim"><p>21</p></span>
                  <span className="pipboy-helmet" />
                  <span className="pipboy-shield"><p>110</p></span>
                  <span className="pipboy-voltage"><p>126</p></span>
                  <span className="pipboy-nuclear"><p>35</p></span>
                </div>
                <div className="pipboy-hud-bar">
                  <div className="pipboy-hp" />
                  <div className="pipboy-exp" />
                  <div className="pipboy-ap" />
                </div>
                <div className="pipboy-statusbar">{statusBar}</div>
              </div>
            </div>
            <div className="pipboy-power" /><div className="pipboy-screw4" /><div className="pipboy-screw5" />
          </div>

          {/* Left wheel */}
          <div className="pipboy-left-wheel">
            <div className="pipboy-left-wheel-shadow" /><div className="pipboy-left-wheel-shadow" />
            <div className="pipboy-left-wheel-shadow" /><div className="pipboy-left-wheel-shadow" />
          </div>

          {/* Right wheel with tab names */}
          <div className="pipboy-wheel">
            <div className="pipboy-tab-names">
              {PIPBOY_TABS.map((tab) => (
                <li
                  key={tab}
                  className={PIPBOY_TAB_LABELS[tab]}
                  onClick={() => handleTabClick(tab)}
                />
              ))}
            </div>
            <div className="pipboy-wheel-shadow" /><div className="pipboy-wheel-shadow" /><div className="pipboy-wheel-shadow" />
            <div className="pipboy-wheel-shadow" /><div className="pipboy-wheel-shadow" />
            <div className="pipboy-wheel-plug" /><div className="pipboy-wheel-wire" />
          </div>

          {/* RADS meter */}
          <div className="pipboy-rads">
            <div className="pipboy-rads-meter"><div className="pipboy-rads-value" /><div className="pipboy-bump1" /></div>
          </div>

          {/* Speakers */}
          <div className="pipboy-speakers">
            <div className="pipboy-speaker" /><div className="pipboy-speaker" /><div className="pipboy-speaker" /><div className="pipboy-speaker" />
          </div>
          <div className="pipboy-left-speakers">
            <div className="pipboy-left-speaker" /><div className="pipboy-left-speaker" />
            <div className="pipboy-left-speaker" /><div className="pipboy-left-speaker" /><div className="pipboy-screw3" />
          </div>

          {/* Decorative bumps */}
          <div className="pipboy-bump2" /><div className="pipboy-bump3" />

          {/* Tune meter & wheel */}
          <div className="pipboy-tune-meter" />
          <div className="pipboy-tune-wheel"><div className="pipboy-analog" /></div>

          {/* Bottom panel */}
          <div className="pipboy-bottom">
            <div className="pipboy-bottom-clips">
              <div className="pipboy-bottom-clip"><span /></div><div className="pipboy-bottom-clip"><span /></div>
              <div className="pipboy-bottom-clip"><span /></div><div className="pipboy-bottom-clip"><span /></div>
            </div>
            <div className="pipboy-bottom-switch" /><div className="pipboy-bump4" /><div className="pipboy-bump5" />
          </div>

          {/* Remaining decorative elements */}
          <div className="pipboy-roulette" />
          <div className="pipboy-top-right" />
          <div className="pipboy-spike-wheel" />
        </div>
      </div>

      <CRTOverlay crtEnabled={crtEnabled} />
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
        </Win95Layout>
        <Suspense fallback={null}>
          <TelemetryDrawer />
        </Suspense>
      </>
    );
  }

  if (layout === 'pipboy') {
    return (
      <>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{themeAnnouncement}</div>
        <PipBoyLayout header={controls} statusBar={statusBar} crtEnabled={crtEnabled}>
          <div style={crtOffStyle}>{terminal}</div>
        </PipBoyLayout>
        <Suspense fallback={null}>
          <TelemetryDrawer />
        </Suspense>
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
        <Suspense fallback={null}>
          <TelemetryDrawer />
        </Suspense>
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
      <Suspense fallback={null}>
        <TelemetryDrawer />
      </Suspense>
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
