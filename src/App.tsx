import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { ThemeProvider } from '@/hooks/ThemeProvider';
import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { Terminal } from '@/components/Terminal';
import type { TerminalHandle } from '@/components/Terminal';
import { CRTOverlay } from '@/components/CRTOverlay';
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
import { usePipBoyTransition, PIPBOY_TABS } from '@/hooks/usePipBoyTransition';
import type { PipBoyTab } from '@/hooks/usePipBoyTransition';
import { Apple2eLayout } from '@/components/Apple2e';
import '@/styles/pipboy.css';
import '@/styles/apple2e-3d.css';

const TelemetryDrawer = lazy(() =>
  import('@/components/TelemetryDrawer/TelemetryDrawer').then((m) => ({
    default: m.TelemetryDrawer,
  })),
);

function FullscreenLayout({
  children,
  crtEnabled,
}: {
  children: React.ReactNode;
  crtEnabled: boolean;
}) {
  return (
    <div
      className={crtEnabled ? 'crt-screen' : undefined}
      style={{ width: '100%', height: '100%' }}
    >
      {children}
      <CRTOverlay crtEnabled={crtEnabled} />
    </div>
  );
}

function Win95Layout({
  children,
  statusBar,
}: {
  children: React.ReactNode;
  statusBar: React.ReactNode;
}) {
  const [windowState, setWindowState] = useState<'normal' | 'minimized' | 'maximized' | 'closed'>('normal');
  const [iconSelected, setIconSelected] = useState(false);
  const [themeIconSelected, setThemeIconSelected] = useState(false);
  const status = useConnectionStore((s) => s.status);
  const { toggleTheme } = useTheme();

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
    () => {
      setWindowState((s) => (s === 'maximized' ? 'normal' : 'maximized'));
      // Dispatch resize so xterm.js FitAddon re-fits to the new container size
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    },
    [],
  );
  const handleClose = useCallback(() => {
    setWindowState('closed');
    setIconSelected(false);
    setThemeIconSelected(false);
  }, []);
  const handleTaskbarClick = useCallback(() => {
    setWindowState((s) => {
      const next = s === 'minimized' ? 'normal' : 'minimized';
      // Trigger resize when restoring from minimized so xterm re-fits
      if (next === 'normal') {
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      }
      return next;
    });
  }, []);
  const handleDesktopClick = useCallback(() => {
    setIconSelected(false);
    setThemeIconSelected(false);
  }, []);
  const handleIconClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIconSelected(true);
    setThemeIconSelected(false);
  }, []);
  const handleIconDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setWindowState('normal');
    setIconSelected(false);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }, []);

  const handleThemeIconClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setThemeIconSelected(true);
    setIconSelected(false);
  }, []);
  const handleThemeIconDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTheme();
  }, [toggleTheme]);

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
      {/* Desktop icons — always visible on the teal desktop */}
      <div className="win95-desktop-icons" data-testid="win95-desktop-icons">
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
              requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
            }
          }}
        >
          <div className="win95-desktop-icon-img" aria-hidden="true">📟</div>
          <div className="win95-desktop-icon-label">SQUAD UPLINK</div>
        </div>
        <div
          className={`win95-desktop-icon win95-desktop-icon--theme ${themeIconSelected ? 'win95-desktop-icon--selected' : ''}`}
          onClick={handleThemeIconClick}
          onDoubleClick={handleThemeIconDoubleClick}
          role="button"
          aria-label="Display Properties — double-click to change theme"
          tabIndex={0}
          data-testid="win95-theme-icon"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              toggleTheme();
            }
          }}
        >
          <div className="win95-desktop-icon-img" aria-hidden="true">🎨</div>
          <div className="win95-desktop-icon-label">Display Properties</div>
        </div>
      </div>

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
        </div>
        <div className="win95-terminal-area">{children}</div>
        <div className="win95-statusbar">
          <span className="win95-statusbar-section">{statusText}</span>
          <span className="win95-statusbar-section win95-statusbar-controls">{statusBar}</span>
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
  statusBar,
  crtEnabled,
}: {
  children: React.ReactNode;
  statusBar: React.ReactNode;
  crtEnabled: boolean;
}) {
  const { activeTab, tabIndex, displayTab, switchTab, nextTab, prevTab, transitionPhase } = usePipBoyTransition('STAT');
  const scale = usePipBoyScale();
  const radsAlert = useConnectionStore((s) => s.radsAlert);
  const thinking = useConnectionStore((s) => s.thinking);
  const { play } = useAudio('pipboy');

  // Spike wheel rotation: base 10deg + 15deg per tab index
  const spikeRotation = 10 + tabIndex * 15;

  // Tune wheel scroll tracking
  const [tuneRotation, setTuneRotation] = useState(0);
  const tuneWheelRef = useRef<HTMLDivElement>(null);
  const tuneDragRef = useRef<{ active: boolean; lastY: number }>({ active: false, lastY: 0 });

  /** Find the scroll container for the currently visible tab */
  const getActiveScrollContainer = useCallback((): HTMLElement | null => {
    const panel = document.querySelector(`#pipboy-panel-${displayTab}`) as HTMLElement | null;
    return panel;
  }, [displayTab]);

  const handleTabClick = useCallback((tab: PipBoyTab) => {
    switchTab(tab);
  }, [switchTab]);

  const handleTabKey = useCallback((e: React.KeyboardEvent, tab: PipBoyTab) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      switchTab(tab);
    }
  }, [switchTab]);

  // ── Spike Wheel handlers (tab navigation) ──
  const handleSpikeClick = useCallback(() => {
    play('toggle');
    nextTab();
  }, [play, nextTab]);

  const handleSpikeWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    play('toggle');
    if (e.deltaY > 0) nextTab(); else prevTab();
  }, [play, nextTab, prevTab]);

  const handleSpikeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault(); play('toggle'); nextTab();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); play('toggle'); prevTab();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); play('toggle'); nextTab();
    }
  }, [play, nextTab, prevTab]);

  // ── Tune Wheel handlers (content scrolling) ──
  const scrollContent = useCallback((delta: number) => {
    const container = getActiveScrollContainer();
    if (container) {
      container.scrollTop += delta;
    }
    setTuneRotation((prev) => prev + delta * 0.5);
    play('toggle');
  }, [getActiveScrollContainer, play]);

  const handleTuneWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scrollDelta = e.deltaY > 0 ? 40 : -40;
    scrollContent(scrollDelta);
  }, [scrollContent]);

  const handleTuneMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    tuneDragRef.current = { active: true, lastY: e.clientY };

    const handleMouseMove = (me: MouseEvent) => {
      if (!tuneDragRef.current.active) return;
      const delta = me.clientY - tuneDragRef.current.lastY;
      tuneDragRef.current.lastY = me.clientY;
      if (Math.abs(delta) > 2) {
        const container = getActiveScrollContainer();
        if (container) container.scrollTop += delta;
        setTuneRotation((prev) => prev + delta * 0.5);
      }
    };

    const handleMouseUp = () => {
      tuneDragRef.current.active = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [getActiveScrollContainer]);

  const handleTuneKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); scrollContent(40);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); scrollContent(-40);
    }
  }, [scrollContent]);

  // The tab that's currently shown on screen (lags during transitions)
  const visibleTab = displayTab;

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

                {/* Functional content area */}
                <div className="pipboy-screen-inner">
                  <div className={`pipboy-content ${transitionPhase === 'fade' ? 'pipboy-phosphor-fade' : ''}`}>
                    {/* Transition overlays */}
                    {transitionPhase === 'static' && <div className="pipboy-static-burst" />}
                    {transitionPhase === 'sweep' && <div className="pipboy-sweep-line" />}

                    {/* DATA tab — terminal always mounted */}
                    <div
                      id="pipboy-panel-DATA"
                      role="tabpanel"
                      aria-label="DATA"
                      className={`pipboy-tab-panel ${visibleTab !== 'DATA' ? 'pipboy-tab-panel--hidden' : ''}`}
                      style={{ display: visibleTab !== 'DATA' ? 'none' : undefined }}
                    >
                      <div className="pipboy-terminal-wrap">{children}</div>
                    </div>

                    {visibleTab === 'STAT' && (
                      <div id="pipboy-panel-STAT" role="tabpanel" aria-label="STAT" className="pipboy-tab-panel">
                        <PipBoyStat />
                      </div>
                    )}

                    {visibleTab === 'INV' && (
                      <div id="pipboy-panel-INV" role="tabpanel" aria-label="INV" className="pipboy-tab-panel">
                        <PipBoyInv />
                      </div>
                    )}

                    {visibleTab === 'MAP' && (
                      <div id="pipboy-panel-MAP" role="tabpanel" aria-label="MAP" className="pipboy-tab-panel">
                        <PipBoyMap />
                      </div>
                    )}

                    {visibleTab === 'RADIO' && (
                      <div id="pipboy-panel-RADIO" role="tabpanel" aria-label="RADIO" className="pipboy-tab-panel">
                        <PipBoyRadio />
                      </div>
                    )}
                  </div>
                </div>

                {/* Codepen decorative bottom elements */}
                <div className="pipboy-supplies">
                  <span>Stimpak (0)</span><span>Radaway (0)</span><span>BRIAN</span>
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
            <div className={`pipboy-power ${thinking ? 'pipboy-power-thinking' : ''}`} /><div className="pipboy-screw4" /><div className="pipboy-screw5" />
          </div>

          {/* Left wheel */}
          <div className="pipboy-left-wheel">
            <div className="pipboy-left-wheel-shadow" /><div className="pipboy-left-wheel-shadow" />
            <div className="pipboy-left-wheel-shadow" /><div className="pipboy-left-wheel-shadow" />
          </div>

          {/* Right wheel with tab names — clickable dial */}
          <div className="pipboy-wheel">
            <div className="pipboy-tab-names">
              {PIPBOY_TABS.map((tab) => (
                <li
                  key={tab}
                  className={PIPBOY_TAB_LABELS[tab]}
                  role="button"
                  aria-label={`Switch to ${tab}`}
                  tabIndex={0}
                  onClick={() => handleTabClick(tab)}
                  onKeyDown={(e) => handleTabKey(e, tab)}
                />
              ))}
            </div>
            <div className="pipboy-wheel-shadow" /><div className="pipboy-wheel-shadow" /><div className="pipboy-wheel-shadow" />
            <div className="pipboy-wheel-shadow" /><div className="pipboy-wheel-shadow" />
            <div className="pipboy-wheel-plug" /><div className="pipboy-wheel-wire" />
          </div>

          {/* RADS meter — spikes on error/rate-limit */}
          <div className={`pipboy-rads ${radsAlert ? 'pipboy-rads-alert' : ''}`}>
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
          <div
            className="pipboy-tune-wheel"
            ref={tuneWheelRef}
            role="slider"
            aria-label="Content scroll dial"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
            tabIndex={0}
            style={{ transform: `rotate(${45 + tuneRotation}deg)`, transition: 'transform 100ms ease-out' }}
            onWheel={handleTuneWheel}
            onMouseDown={handleTuneMouseDown}
            onKeyDown={handleTuneKeyDown}
          ><div className="pipboy-analog" /></div>

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
          <div
            className="pipboy-spike-wheel"
            role="slider"
            aria-label="Tab navigation dial"
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={tabIndex}
            aria-valuetext={activeTab}
            tabIndex={0}
            style={{ transform: `rotate(${spikeRotation}deg)`, transition: 'transform 200ms ease-out' }}
            onClick={handleSpikeClick}
            onWheel={handleSpikeWheel}
            onKeyDown={handleSpikeKeyDown}
          />
        </div>
      </div>

      <CRTOverlay crtEnabled={crtEnabled} />
    </div>
  );
}

function LcarsLayout({
  children,
}: {
  children: React.ReactNode;
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
  const { theme } = useTheme();
  const terminalRef = useRef<TerminalHandle>(null);
  const crtEnabled = useConnectionStore((s) => s.crtEnabled);
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

  const crtOffStyle = !crtEnabled ? { textShadow: 'none' } as React.CSSProperties : undefined;

  const layout = theme.layout ?? 'fullscreen';

  const statusBar = <StatusBar />;

  if (layout === 'windowed') {
    return (
      <>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{themeAnnouncement}</div>
        <Win95Layout statusBar={statusBar}>
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
        <PipBoyLayout statusBar={statusBar} crtEnabled={crtEnabled}>
          <div style={crtOffStyle}>{terminal}</div>
        </PipBoyLayout>
        <Suspense fallback={null}>
          <TelemetryDrawer />
        </Suspense>
      </>
    );
  }

  if (layout === 'apple2e') {
    return (
      <>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{themeAnnouncement}</div>
        <Apple2eLayout statusBar={statusBar} crtEnabled={crtEnabled}>
          <div style={crtOffStyle}>{terminal}</div>
        </Apple2eLayout>
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
        <LcarsLayout>
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
      <FullscreenLayout crtEnabled={crtEnabled}>
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
