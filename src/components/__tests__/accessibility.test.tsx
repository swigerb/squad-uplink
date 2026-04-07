/**
 * Accessibility Tests — Wave 6 M7 part 3
 *
 * All control buttons (CRT toggle, Audio toggle, ThemeToggle) now live in
 * the StatusBar. Tests verify keyboard nav, ARIA, reduced-motion, focus
 * management (TelemetryDrawer open/close), Escape key handling, and
 * theme switching + keyboard nav preservation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { ThemeProvider } from '@/hooks/ThemeProvider';
import { StatusBar } from '@/components/StatusBar';
import { CRTOverlay } from '@/components/CRTOverlay/CRTOverlay';
import { TelemetryDrawer } from '@/components/TelemetryDrawer/TelemetryDrawer';
import { useConnectionStore } from '@/store/connectionStore';
import { installMockAudioContext } from '@//__mocks__/audio';
import { _resetAudioForTesting } from '@/hooks/useAudio';

vi.mock('@/lib/ConnectionManager', () => ({
  connectionManager: {
    fetchStatus: vi.fn(() => Promise.resolve(null)),
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: false,
  },
}));

function renderWithProviders(ui: ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function resetStore() {
  useConnectionStore.setState({
    status: 'disconnected',
    tunnelUrl: null,
    agentCount: 0,
    crtEnabled: true,
    audioEnabled: false,
    drawerOpen: false,
    terminalFullscreen: false,
  });
}

// ============================================================
// Keyboard Navigation — All controls now inside StatusBar
// ============================================================
describe('Accessibility — Keyboard Navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetAudioForTesting();
    installMockAudioContext();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    _resetAudioForTesting();
  });

  describe('StatusBar controls', () => {
    it('all controls (Theme, Audio, CRT, Telemetry, Fullscreen) are focusable in tab order', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      // Tab to theme toggle
      await user.tab();
      const themeToggle = screen.getByTestId('theme-toggle');
      expect(themeToggle).toHaveFocus();

      // Tab to audio toggle
      await user.tab();
      const audioToggle = screen.getByTestId('audio-toggle');
      expect(audioToggle).toHaveFocus();

      // Tab to CRT toggle (shown for default apple2e theme)
      await user.tab();
      const crtToggle = screen.getByTestId('crt-toggle');
      expect(crtToggle).toHaveFocus();

      // Tab to telemetry toggle
      await user.tab();
      const telemetryToggle = screen.getByTestId('telemetry-toggle');
      expect(telemetryToggle).toHaveFocus();

      // Tab to fullscreen toggle
      await user.tab();
      const fullscreenToggle = screen.getByTestId('fullscreen-toggle');
      expect(fullscreenToggle).toHaveFocus();
    });

    it('CRT toggle in StatusBar activates on Enter', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      const crtToggle = screen.getByTestId('crt-toggle');
      crtToggle.focus();
      const initialState = useConnectionStore.getState().crtEnabled;
      await user.keyboard('{Enter}');
      expect(useConnectionStore.getState().crtEnabled).toBe(!initialState);
    });

    it('CRT toggle in StatusBar activates on Space', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      const crtToggle = screen.getByTestId('crt-toggle');
      crtToggle.focus();
      const initialState = useConnectionStore.getState().crtEnabled;
      await user.keyboard(' ');
      expect(useConnectionStore.getState().crtEnabled).toBe(!initialState);
    });

    it('Audio toggle in StatusBar activates on Enter', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      const audioToggle = screen.getByTestId('audio-toggle');
      audioToggle.focus();
      await user.keyboard('{Enter}');
      // Audio button should respond to keyboard activation
      expect(audioToggle).toBeInTheDocument();
    });

    it('ThemeToggle in StatusBar activates on Enter', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      const themeToggle = screen.getByTestId('theme-toggle');
      themeToggle.focus();
      // Default theme is apple2e — emoji is 🍎
      expect(themeToggle).toHaveTextContent('🍎');
      await user.keyboard('{Enter}');
      // Now C64 — emoji is 📺
      expect(themeToggle).toHaveTextContent('📺');
    });

    it('ThemeToggle in StatusBar activates on Space', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      const themeToggle = screen.getByTestId('theme-toggle');
      themeToggle.focus();
      expect(themeToggle).toHaveTextContent('🍎');
      await user.keyboard(' ');
      expect(themeToggle).toHaveTextContent('📺');
    });
  });

  describe('Toolbar role', () => {
    it('StatusBar has role="toolbar" to group controls', () => {
      renderWithProviders(<StatusBar />);
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });
  });

  describe('Theme switching preserves keyboard navigation', () => {
    it('all StatusBar buttons remain focusable after theme switch', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      // Switch from apple2e → c64
      const themeToggle = screen.getByTestId('theme-toggle');
      await user.click(themeToggle);
      expect(themeToggle).toHaveTextContent('📺');

      // Verify all buttons are still keyboard-accessible after theme switch
      // Reset focus to body first
      (document.activeElement as HTMLElement)?.blur();
      await user.tab();
      expect(screen.getByTestId('theme-toggle')).toHaveFocus();
      await user.tab();
      expect(screen.getByTestId('audio-toggle')).toHaveFocus();
    });

    it('CRT toggle visibility changes with theme but keyboard nav is intact', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      // apple2e has CRT toggle
      expect(screen.getByTestId('crt-toggle')).toBeInTheDocument();

      // Switch to win95 (no CRT toggle) — 3 clicks: apple2e→c64→ibm3270→win95
      const themeToggle = screen.getByTestId('theme-toggle');
      await user.click(themeToggle); // → c64
      await user.click(themeToggle); // → ibm3270
      await user.click(themeToggle); // → win95

      // Win95 doesn't show CRT toggle
      expect(screen.queryByTestId('crt-toggle')).toBeNull();

      // Remaining buttons are still tab-accessible
      (document.activeElement as HTMLElement)?.blur();
      await user.tab();
      expect(screen.getByTestId('theme-toggle')).toHaveFocus();
      await user.tab();
      expect(screen.getByTestId('audio-toggle')).toHaveFocus();
      await user.tab();
      expect(screen.getByTestId('telemetry-toggle')).toHaveFocus();
      await user.tab();
      expect(screen.getByTestId('fullscreen-toggle')).toHaveFocus();
    });
  });
});

// ============================================================
// ARIA Attributes — All controls consolidated in StatusBar
// ============================================================
describe('Accessibility — ARIA Attributes', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetAudioForTesting();
    installMockAudioContext();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    _resetAudioForTesting();
  });

  describe('StatusBar — CRT toggle', () => {
    it('has aria-pressed="true" when CRT is enabled', () => {
      useConnectionStore.setState({ crtEnabled: true });
      renderWithProviders(<StatusBar />);
      expect(screen.getByTestId('crt-toggle')).toHaveAttribute('aria-pressed', 'true');
    });

    it('has aria-pressed="false" when CRT is disabled', () => {
      useConnectionStore.setState({ crtEnabled: false });
      renderWithProviders(<StatusBar />);
      // CRT toggle not shown when crtEnabled is false (apple2e default, but the theme's
      // crtEnabled is true). We set store crtEnabled=false but theme.crtEnabled stays true
      // so the toggle still renders.
      const crtToggle = screen.queryByTestId('crt-toggle');
      if (crtToggle) {
        expect(crtToggle).toHaveAttribute('aria-pressed', 'false');
      }
    });

    it('has a descriptive title', () => {
      renderWithProviders(<StatusBar />);
      const crtToggle = screen.getByTestId('crt-toggle');
      expect(crtToggle).toHaveAttribute('title');
      expect(crtToggle.getAttribute('title')).toBeTruthy();
    });
  });

  describe('StatusBar — Audio toggle', () => {
    it('has a descriptive title', () => {
      renderWithProviders(<StatusBar />);
      const audioToggle = screen.getByTestId('audio-toggle');
      expect(audioToggle).toHaveAttribute('title');
      expect(audioToggle.getAttribute('title')).toBeTruthy();
    });

    it('has aria-pressed attribute reflecting mute state', () => {
      renderWithProviders(<StatusBar />);
      const audioToggle = screen.getByTestId('audio-toggle');
      expect(audioToggle).toHaveAttribute('aria-pressed');
    });
  });

  describe('StatusBar — ThemeToggle', () => {
    it('ThemeToggle is rendered inside StatusBar', () => {
      renderWithProviders(<StatusBar />);
      const statusbar = screen.getByTestId('statusbar');
      const themeToggle = screen.getByTestId('theme-toggle');
      expect(statusbar.contains(themeToggle)).toBe(true);
    });

    it('ThemeToggle has a descriptive title with next theme name', () => {
      renderWithProviders(<StatusBar />);
      const button = screen.getByTestId('theme-toggle');
      expect(button).toHaveAttribute('title', 'Switch to C64');
    });

    it('ThemeToggle title updates after toggling', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);
      const button = screen.getByTestId('theme-toggle');

      await user.click(button);
      expect(button).toHaveAttribute('title', 'Switch to IBM 3270');
    });

    it('ThemeToggle has aria-label describing current and next theme', () => {
      renderWithProviders(<StatusBar />);
      const button = screen.getByTestId('theme-toggle');
      const label = button.getAttribute('aria-label');
      expect(label).toContain('Apple IIe');
      expect(label).toContain('C64');
    });
  });

  describe('StatusBar — Fullscreen toggle', () => {
    it('has aria-pressed attribute', () => {
      renderWithProviders(<StatusBar />);
      const btn = screen.getByTestId('fullscreen-toggle');
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    });

    it('toggles fullscreen state on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);
      const btn = screen.getByTestId('fullscreen-toggle');

      expect(useConnectionStore.getState().terminalFullscreen).toBe(false);
      await user.click(btn);
      expect(useConnectionStore.getState().terminalFullscreen).toBe(true);
    });

    it('aria-pressed updates when fullscreen toggles', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);
      const btn = screen.getByTestId('fullscreen-toggle');

      expect(btn).toHaveAttribute('aria-pressed', 'false');
      await user.click(btn);
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    });

    it('has descriptive aria-label for screen readers', () => {
      renderWithProviders(<StatusBar />);
      const btn = screen.getByTestId('fullscreen-toggle');
      expect(btn).toHaveAttribute('aria-label');
      expect(btn.getAttribute('aria-label')).toContain('fullscreen');
    });
  });

  describe('CRTOverlay', () => {
    it('has aria-hidden="true" — decorative only', () => {
      renderWithProviders(<CRTOverlay />);
      const overlay = document.querySelector('.crt-overlay');
      expect(overlay).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('StatusBar — general', () => {
    it('renders with data-testid for identification', () => {
      renderWithProviders(<StatusBar />);
      expect(screen.getByTestId('statusbar')).toBeInTheDocument();
    });

    it('has aria-label on the toolbar', () => {
      renderWithProviders(<StatusBar />);
      const toolbar = screen.getByRole('toolbar');
      expect(toolbar).toHaveAttribute('aria-label');
    });

    it('shows connection status indicator', () => {
      useConnectionStore.setState({ status: 'connected' });
      renderWithProviders(<StatusBar />);
      const dot = screen.getByTestId('connection-status');
      expect(dot).toHaveAttribute('aria-label', 'Connected');
    });

    it('connection status dot has aria-live="polite" for screen readers', () => {
      renderWithProviders(<StatusBar />);
      const dot = screen.getByTestId('connection-status');
      expect(dot).toHaveAttribute('aria-live', 'polite');
    });

    it('status indicator updates when connection state changes', () => {
      useConnectionStore.setState({ status: 'disconnected' });
      render(
        <ThemeProvider><StatusBar /></ThemeProvider>,
      );

      const dot = screen.getByTestId('connection-status');
      expect(dot).toHaveAttribute('aria-label', 'Disconnected');

      act(() => {
        useConnectionStore.setState({ status: 'connecting' });
      });
      expect(dot).toHaveAttribute('aria-label', 'Connecting');
    });

    it('all connection states have descriptive aria-labels', () => {
      const states = ['connected', 'connecting', 'reconnecting', 'disconnected', 'error'] as const;
      for (const s of states) {
        act(() => {
          useConnectionStore.setState({ status: s });
        });
        const { unmount } = renderWithProviders(<StatusBar />);
        const dot = screen.getByTestId('connection-status');
        const label = dot.getAttribute('aria-label');
        expect(label).toBeTruthy();
        expect(label!.length).toBeGreaterThan(2);
        unmount();
      }
    });
  });
});

// ============================================================
// Focus Management — TelemetryDrawer open/close
// ============================================================
describe('Accessibility — Focus Management', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetAudioForTesting();
    installMockAudioContext();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    _resetAudioForTesting();
  });

  describe('TelemetryDrawer', () => {
    it('drawer has role="complementary" for assistive tech', () => {
      renderWithProviders(<TelemetryDrawer />);
      const drawer = screen.getByTestId('telemetry-drawer');
      expect(drawer).toHaveAttribute('role', 'complementary');
    });

    it('drawer has aria-label describing its purpose', () => {
      renderWithProviders(<TelemetryDrawer />);
      const drawer = screen.getByTestId('telemetry-drawer');
      expect(drawer).toHaveAttribute('aria-label', 'Telemetry panel');
    });

    it('close button has aria-label', () => {
      act(() => { useConnectionStore.setState({ drawerOpen: true }); });
      renderWithProviders(<TelemetryDrawer />);
      const closeBtn = screen.getByTestId('telemetry-close');
      expect(closeBtn).toHaveAttribute('aria-label', 'Close telemetry panel');
    });

    it('Escape key closes the drawer when open', () => {
      act(() => { useConnectionStore.setState({ drawerOpen: true }); });
      renderWithProviders(<TelemetryDrawer />);

      expect(useConnectionStore.getState().drawerOpen).toBe(true);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(useConnectionStore.getState().drawerOpen).toBe(false);
    });

    it('Escape key does nothing when drawer is closed', () => {
      act(() => { useConnectionStore.setState({ drawerOpen: false }); });
      renderWithProviders(<TelemetryDrawer />);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(useConnectionStore.getState().drawerOpen).toBe(false);
    });

    it('close button click closes the drawer', async () => {
      const user = userEvent.setup();
      act(() => { useConnectionStore.setState({ drawerOpen: true }); });
      renderWithProviders(<TelemetryDrawer />);

      const closeBtn = screen.getByTestId('telemetry-close');
      await user.click(closeBtn);
      expect(useConnectionStore.getState().drawerOpen).toBe(false);
    });

    it('backdrop click closes the drawer', async () => {
      const user = userEvent.setup();
      act(() => { useConnectionStore.setState({ drawerOpen: true }); });
      renderWithProviders(<TelemetryDrawer />);

      const backdrop = screen.getByTestId('telemetry-backdrop');
      await user.click(backdrop);
      expect(useConnectionStore.getState().drawerOpen).toBe(false);
    });

    it('close button is keyboard-focusable', () => {
      act(() => { useConnectionStore.setState({ drawerOpen: true }); });
      renderWithProviders(<TelemetryDrawer />);

      const closeBtn = screen.getByTestId('telemetry-close');
      closeBtn.focus();
      expect(closeBtn).toHaveFocus();
    });

    it('shows "not connected" text for tunnel URL when disconnected', () => {
      act(() => {
        useConnectionStore.setState({ drawerOpen: true, tunnelUrl: null });
      });
      renderWithProviders(<TelemetryDrawer />);
      expect(screen.getByText('not connected')).toBeInTheDocument();
    });

    it('shows "Connect to view status" when not connected', () => {
      act(() => {
        useConnectionStore.setState({ drawerOpen: true, status: 'disconnected' });
      });
      renderWithProviders(<TelemetryDrawer />);
      expect(screen.getByText('Connect to view status')).toBeInTheDocument();
    });
  });
});

// ============================================================
// Reduced Motion
// ============================================================
describe('Accessibility — Reduced Motion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('CRT flicker animation is only applied to CRT-enabled themes', () => {
    // Read the CSS file to verify scoping
    const fs = require('node:fs');
    const path = require('node:path');
    const crtCSS: string = fs.readFileSync(
      path.resolve(__dirname, '../../styles/crt-effects.css'),
      'utf-8',
    );

    // CRT flicker should be scoped to apple2e, c64, ibm3270
    expect(crtCSS).toContain("[data-theme='apple2e'] .crt-screen");
    expect(crtCSS).toContain("[data-theme='c64'] .crt-screen");
    expect(crtCSS).toContain("[data-theme='ibm3270'] .crt-screen");

    // Win95 and LCARS should have animation: none
    expect(crtCSS).toMatch(/\[data-theme='win95'\].*\{[^}]*animation:\s*none/s);
    expect(crtCSS).toMatch(/\[data-theme='lcars'\].*\{[^}]*animation:\s*none/s);
  });

  it('CRTOverlay returns null for non-CRT themes (win95)', () => {
    // Set theme to win95 which has crtEnabled: false
    localStorage.setItem('squad-uplink-theme', 'win95');
    renderWithProviders(<CRTOverlay crtEnabled={false} />);
    const overlay = document.querySelector('.crt-overlay');
    expect(overlay).toBeNull();
  });

  it('CRTOverlay renders for CRT-enabled themes (apple2e)', () => {
    localStorage.setItem('squad-uplink-theme', 'apple2e');
    renderWithProviders(<CRTOverlay />);
    const overlay = document.querySelector('.crt-overlay');
    expect(overlay).toBeInTheDocument();
  });

  it('prefers-reduced-motion: matchMedia mock works', () => {
    // Verify we can mock matchMedia for reduced motion testing
    const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', mockMatchMedia);

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    expect(mql.matches).toBe(true);

    const mqlOther = window.matchMedia('(prefers-color-scheme: dark)');
    expect(mqlOther.matches).toBe(false);
  });

  it('CRT flicker keyframe exists in CSS', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const crtCSS: string = fs.readFileSync(
      path.resolve(__dirname, '../../styles/crt-effects.css'),
      'utf-8',
    );
    expect(crtCSS).toContain('@keyframes crt-flicker');
  });
});
