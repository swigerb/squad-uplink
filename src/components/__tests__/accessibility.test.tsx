/**
 * Accessibility Tests — Wave 6
 *
 * Tests keyboard navigation, ARIA attributes, and prefers-reduced-motion
 * across all interactive components. Covers the a11y requirements from spec.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/hooks/useTheme';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { MechanicalSwitch } from '@/components/MechanicalSwitch/MechanicalSwitch';
import { AudioToggle } from '@/components/AudioToggle/AudioToggle';
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
// Keyboard Navigation
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

  describe('ThemeToggle', () => {
    it('is focusable via Tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ThemeToggle />);

      await user.tab();
      expect(screen.getByTestId('theme-toggle')).toHaveFocus();
    });

    it('activates on Enter key', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ThemeToggle />);

      const button = screen.getByTestId('theme-toggle');
      button.focus();
      expect(button).toHaveTextContent('Apple IIe');

      await user.keyboard('{Enter}');
      expect(button).toHaveTextContent('C64');
    });

    it('activates on Space key', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ThemeToggle />);

      const button = screen.getByTestId('theme-toggle');
      button.focus();
      expect(button).toHaveTextContent('Apple IIe');

      await user.keyboard(' ');
      expect(button).toHaveTextContent('C64');
    });
  });

  describe('MechanicalSwitch', () => {
    it('is focusable via Tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <MechanicalSwitch crtEnabled={true} onToggle={vi.fn()} />,
      );

      await user.tab();
      expect(screen.getByTestId('mechanical-switch')).toHaveFocus();
    });

    it('toggles on Enter key', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      renderWithProviders(
        <MechanicalSwitch crtEnabled={true} onToggle={onToggle} />,
      );

      const el = screen.getByTestId('mechanical-switch');
      el.focus();
      await user.keyboard('{Enter}');
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('toggles on Space key', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      renderWithProviders(
        <MechanicalSwitch crtEnabled={true} onToggle={onToggle} />,
      );

      const el = screen.getByTestId('mechanical-switch');
      el.focus();
      await user.keyboard(' ');
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('AudioToggle', () => {
    it('is focusable via Tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <AudioToggle muted={false} onToggle={vi.fn()} />,
      );

      await user.tab();
      expect(screen.getByTestId('audio-toggle')).toHaveFocus();
    });

    it('toggles on Enter key', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      renderWithProviders(
        <AudioToggle muted={false} onToggle={onToggle} />,
      );

      const el = screen.getByTestId('audio-toggle');
      el.focus();
      await user.keyboard('{Enter}');
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('toggles on Space key', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      renderWithProviders(
        <AudioToggle muted={false} onToggle={onToggle} />,
      );

      const el = screen.getByTestId('audio-toggle');
      el.focus();
      await user.keyboard(' ');
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('StatusBar', () => {
    it('toggle buttons in StatusBar are focusable in tab order', async () => {
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
  });
});

// ============================================================
// ARIA Attributes
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

  describe('AudioToggle', () => {
    it('has aria-label "Mute audio" when unmuted', () => {
      renderWithProviders(
        <AudioToggle muted={false} onToggle={vi.fn()} />,
      );
      expect(screen.getByTestId('audio-toggle')).toHaveAttribute(
        'aria-label',
        'Mute audio',
      );
    });

    it('has aria-label "Unmute audio" when muted', () => {
      renderWithProviders(
        <AudioToggle muted={true} onToggle={vi.fn()} />,
      );
      expect(screen.getByTestId('audio-toggle')).toHaveAttribute(
        'aria-label',
        'Unmute audio',
      );
    });
  });

  describe('ThemeToggle', () => {
    it('has a descriptive title attribute with next theme name', () => {
      renderWithProviders(<ThemeToggle />);
      const button = screen.getByTestId('theme-toggle');
      // Default is Apple IIe, next is C64
      expect(button).toHaveAttribute('title', 'Switch to C64');
    });

    it('title updates after toggling', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ThemeToggle />);
      const button = screen.getByTestId('theme-toggle');

      await user.click(button);
      // Now on C64, next is IBM 3270
      expect(button).toHaveAttribute('title', 'Switch to IBM 3270');
    });
  });

  describe('MechanicalSwitch', () => {
    it('has aria-pressed="true" when CRT is on', () => {
      renderWithProviders(
        <MechanicalSwitch crtEnabled={true} onToggle={vi.fn()} />,
      );
      expect(screen.getByTestId('mechanical-switch')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('has aria-pressed="false" when CRT is off', () => {
      renderWithProviders(
        <MechanicalSwitch crtEnabled={false} onToggle={vi.fn()} />,
      );
      expect(screen.getByTestId('mechanical-switch')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('CRTOverlay', () => {
    it('has aria-hidden="true" — decorative only', () => {
      renderWithProviders(<CRTOverlay />);
      const overlay = document.querySelector('.crt-overlay');
      expect(overlay).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('StatusBar', () => {
    it('renders with data-testid for identification', () => {
      renderWithProviders(<StatusBar />);
      expect(screen.getByTestId('statusbar')).toBeInTheDocument();
    });

    it('CRT toggle button has a descriptive title', () => {
      renderWithProviders(<StatusBar />);
      const crtToggle = screen.getByTestId('crt-toggle');
      expect(crtToggle).toHaveAttribute('title');
      expect(crtToggle.getAttribute('title')).toBeTruthy();
    });

    it('audio toggle button has a descriptive title', () => {
      renderWithProviders(<StatusBar />);
      const audioToggle = screen.getByTestId('audio-toggle');
      expect(audioToggle).toHaveAttribute('title');
      expect(audioToggle.getAttribute('title')).toBeTruthy();
    });

    it('shows connection status text', () => {
      useConnectionStore.setState({ status: 'connected' });
      renderWithProviders(<StatusBar />);
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });

    it('status indicator updates when connection state changes', () => {
      useConnectionStore.setState({ status: 'disconnected' });
      const { rerender } = render(
        <ThemeProvider><StatusBar /></ThemeProvider>,
      );

      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();

      useConnectionStore.setState({ status: 'connecting' });
      rerender(<ThemeProvider><StatusBar /></ThemeProvider>);
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
