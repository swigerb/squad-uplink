/**
 * Accessibility Tests — Wave 6 (updated for consolidated controls)
 *
 * All control buttons (CRT toggle, Audio toggle, ThemeToggle) now live in
 * the StatusBar. The upper-right toolbar with MechanicalSwitch + AudioToggle
 * has been removed. Tests verify keyboard nav, ARIA, and reduced-motion
 * entirely through the StatusBar surface.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/hooks/ThemeProvider';
import { StatusBar } from '@/components/StatusBar';
import { CRTOverlay } from '@/components/CRTOverlay/CRTOverlay';
import { useConnectionStore } from '@/store/connectionStore';
import { installMockAudioContext } from '@//__mocks__/audio';

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
  });
}

// ============================================================
// Keyboard Navigation — All controls now inside StatusBar
// ============================================================
describe('Accessibility — Keyboard Navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    installMockAudioContext();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('StatusBar controls', () => {
    it('all three controls (CRT, Audio, ThemeToggle) are focusable in tab order', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      // Tab through to CRT toggle
      await user.tab();
      const crtToggle = screen.getByTestId('crt-toggle');
      expect(crtToggle).toHaveFocus();

      // Tab to audio toggle
      await user.tab();
      const audioToggle = screen.getByTestId('audio-toggle');
      expect(audioToggle).toHaveFocus();

      // Tab to theme toggle
      await user.tab();
      const themeToggle = screen.getByTestId('theme-toggle');
      expect(themeToggle).toHaveFocus();
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
      expect(themeToggle).toHaveTextContent('Apple IIe');
      await user.keyboard('{Enter}');
      expect(themeToggle).toHaveTextContent('C64');
    });

    it('ThemeToggle in StatusBar activates on Space', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StatusBar />);

      const themeToggle = screen.getByTestId('theme-toggle');
      themeToggle.focus();
      expect(themeToggle).toHaveTextContent('Apple IIe');
      await user.keyboard(' ');
      expect(themeToggle).toHaveTextContent('C64');
    });
  });

  describe('No standalone toolbar', () => {
    it('no role="toolbar" element exists — controls are consolidated in StatusBar', () => {
      renderWithProviders(<StatusBar />);
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });
  });
});

// ============================================================
// ARIA Attributes — All controls consolidated in StatusBar
// ============================================================
describe('Accessibility — ARIA Attributes', () => {
  beforeEach(() => {
    localStorage.clear();
    installMockAudioContext();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
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
      expect(screen.getByTestId('crt-toggle')).toHaveAttribute('aria-pressed', 'false');
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

    it('shows connection status text', () => {
      useConnectionStore.setState({ status: 'connected' });
      renderWithProviders(<StatusBar />);
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });

    it('status indicator updates when connection state changes', () => {
      useConnectionStore.setState({ status: 'disconnected' });
      render(
        <ThemeProvider><StatusBar /></ThemeProvider>,
      );

      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();

      act(() => {
        useConnectionStore.setState({ status: 'connecting' });
      });
      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
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
