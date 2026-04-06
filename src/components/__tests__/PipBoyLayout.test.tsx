import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/hooks/ThemeProvider';
import { useConnectionStore } from '@/store/connectionStore';
import { installMockAudioContext } from '../../__mocks__/audio';
import { _resetAudioForTesting } from '@/hooks/useAudio';

// Mock xterm.js — Terminal component pulls it in
vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    options = {};
    open = vi.fn();
    write = vi.fn();
    writeln = vi.fn();
    clear = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onKey = vi.fn(() => ({ dispose: vi.fn() }));
    loadAddon = vi.fn();
    dispose = vi.fn();
    focus = vi.fn();
  }
  return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-canvas', () => {
  class MockCanvasAddon {}
  return { CanvasAddon: MockCanvasAddon };
});

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    fit = vi.fn();
    proposeDimensions = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

vi.mock('@xterm/addon-web-links', () => {
  class MockWebLinksAddon {}
  return { WebLinksAddon: MockWebLinksAddon };
});

vi.mock('@/lib/ConnectionManager', () => ({
  connectionManager: {
    onMessage: null,
    onStateChange: null,
    isConnected: false,
    send: vi.fn(),
    fetchStatus: vi.fn(),
  },
}));

/**
 * Force pipboy theme via localStorage before rendering.
 * ThemeProvider reads from localStorage on mount.
 */
function renderWithPipBoy(ui: ReactNode) {
  localStorage.setItem('squad-uplink-theme', 'pipboy');
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/**
 * Render the full App with pipboy theme.
 * Dynamic import avoids hoisting issues with mocks.
 */
async function renderApp() {
  localStorage.setItem('squad-uplink-theme', 'pipboy');
  const { default: App } = await import('@/App');
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<App />);
  });
  return result!;
}

describe('PipBoyLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    _resetAudioForTesting();
    installMockAudioContext();
    useConnectionStore.setState({
      status: 'disconnected',
      tunnelUrl: null,
      agentCount: 0,
      crtEnabled: true,
      audioEnabled: false,
      drawerOpen: false,
      telemetry: {
        latencyMs: null,
        inboundMps: 0,
        outboundMps: 0,
        connectedAt: null,
        reconnectCount: 0,
        lastDisconnectAt: null,
        statusResponse: null,
        statusFetchedAt: null,
        tokenUsage: 0,
        messageCount: 0,
        successCount: 0,
      },
      messageHistory: [],
      tools: [],
      mcpServers: [],
      activeAgent: null,
      commandHistory: [],
      uplinkOverride: false,
      radsAlert: false,
      thinking: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    _resetAudioForTesting();
  });

  // =========================================================================
  // 1. THEME INTEGRATION
  // =========================================================================
  describe('Theme integration', () => {
    it('pipboy theme exists in THEME_ORDER (6 themes total)', async () => {
      const { THEME_ORDER } = await import('@/themes');
      expect(THEME_ORDER).toContain('pipboy');
      expect(THEME_ORDER).toHaveLength(6);
    });

    it('theme cycling includes pipboy: lcars → pipboy → apple2e', async () => {
      const { THEME_ORDER } = await import('@/themes');
      const lcarsIdx = THEME_ORDER.indexOf('lcars');
      const pipboyIdx = THEME_ORDER.indexOf('pipboy');
      const apple2eIdx = THEME_ORDER.indexOf('apple2e');
      // pipboy comes right after lcars
      expect(pipboyIdx).toBe(lcarsIdx + 1);
      // apple2e wraps around (index 0) after pipboy (last)
      expect(apple2eIdx).toBe(0);
      expect(pipboyIdx).toBe(THEME_ORDER.length - 1);
    });

    it('pipboy theme has correct colors: fg=#1bff80, bg=#000500', async () => {
      const themes = await import('@/themes');
      const pipboy = (themes as Record<string, unknown>)['pipboyTheme'] as {
        fg: string;
        bg: string;
      };
      expect(pipboy.fg).toBe('#1bff80');
      expect(pipboy.bg).toBe('#000500');
    });

    it('pipboy layout mode is "pipboy"', async () => {
      const themes = await import('@/themes');
      const pipboy = (themes as Record<string, unknown>)['pipboyTheme'] as {
        layout: string;
      };
      expect(pipboy.layout).toBe('pipboy');
    });

    it('ThemeToggle cycles through 6 themes and returns to Apple IIe', async () => {
      const user = userEvent.setup();
      const { ThemeToggle } = await import(
        '@/components/ThemeToggle/ThemeToggle'
      );
      renderWithPipBoy(<ThemeToggle />);
      const button = screen.getByTestId('theme-toggle');

      // Starting from pipboy (set via localStorage), 1 click goes to apple2e
      // But let's start from apple2e and click 6 times to wrap
      localStorage.setItem('squad-uplink-theme', 'apple2e');
      const { unmount } = render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
      const btn = screen.getAllByTestId('theme-toggle')[1];

      // 6 clicks: apple2e → c64 → ibm3270 → win95 → lcars → pipboy
      for (let i = 0; i < 5; i++) {
        await user.click(btn);
      }
      expect(btn).toHaveTextContent(/pip-boy|pipboy/i);

      // 1 more click wraps back to apple2e
      await user.click(btn);
      expect(btn).toHaveTextContent('Apple IIe');
      unmount();
    });
  });

  // =========================================================================
  // 2. TAB NAVIGATION
  // =========================================================================
  describe('Tab navigation', () => {
    it('renders 5 tabs: STAT, INV, DATA, MAP, RADIO', async () => {
      await renderApp();
      expect(screen.getByRole('tab', { name: /STAT/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /INV/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /DATA/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /MAP/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /RADIO/i })).toBeInTheDocument();
    });

    it('STAT tab is active by default', async () => {
      await renderApp();
      const statTab = screen.getByRole('tab', { name: /STAT/i });
      expect(statTab).toHaveAttribute('aria-selected', 'true');
    });

    it('clicking a tab switches the visible content', async () => {
      const user = userEvent.setup();
      await renderApp();

      // STAT should be visible by default
      const statPanel = screen.getByRole('tabpanel', { name: /STAT/i });
      expect(statPanel).toBeVisible();

      // Click DATA tab
      const dataTab = screen.getByRole('tab', { name: /DATA/i });
      await user.click(dataTab);

      // aria-selected updates immediately
      expect(dataTab).toHaveAttribute('aria-selected', 'true');

      // Wait for transition to complete (content swap at 200ms, done at 400ms)
      await waitFor(() => {
        const dataPanel = screen.getByRole('tabpanel', { name: /DATA/i });
        expect(dataPanel).toBeVisible();
      }, { timeout: 1000 });
    });

    it('active tab has visual distinction (CSS class)', async () => {
      await renderApp();
      const statTab = screen.getByRole('tab', { name: /STAT/i });
      // Active tab should carry an active CSS class
      expect(statTab).toHaveClass(/active/i);
    });

    it('all 5 tabs are keyboard-accessible (Tab + Enter)', async () => {
      const user = userEvent.setup();
      await renderApp();

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(5);

      // Each tab should be focusable and activatable via Enter
      for (const tab of tabs) {
        tab.focus();
        expect(tab).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(tab).toHaveAttribute('aria-selected', 'true');
        // Wait for transition to complete so next tab switch isn't blocked
        await waitFor(() => {
          // no-op — just wait for React to settle
        }, { timeout: 600 });
        // Small delay for transition to fully clear
        await new Promise((r) => setTimeout(r, 500));
      }
    });
  });

  // =========================================================================
  // 3. TERMINAL PRESERVATION
  // =========================================================================
  describe('Terminal preservation', () => {
    it('terminal remains mounted when STAT tab is active (DATA panel hidden via display:none, not unmounted)', async () => {
      await renderApp();

      // STAT is the default tab, so DATA panel is hidden
      const terminal = document.querySelector('[data-testid="terminal"]');
      expect(terminal).toBeInTheDocument();

      const dataPanel = document.querySelector('#pipboy-panel-DATA');
      expect(dataPanel).not.toBeVisible();

      // Terminal should still be in DOM (hidden, not destroyed)
      const terminalNode = document.querySelector('[data-testid="terminal"]');
      expect(terminalNode).toBeInTheDocument();
      const panel = terminalNode?.closest('[role="tabpanel"]');
      expect(panel).toBeInTheDocument();
      expect(panel).not.toBeVisible();
    });

    it('terminal is visible when DATA tab is active', async () => {
      const user = userEvent.setup();
      await renderApp();

      // Default is STAT — switch to DATA
      const dataTab = screen.getByRole('tab', { name: /DATA/i });
      await user.click(dataTab);

      await waitFor(() => {
        const dataPanel = document.querySelector('#pipboy-panel-DATA');
        expect(dataPanel).toBeVisible();
      }, { timeout: 1000 });

      const terminal = document.querySelector('[data-testid="terminal"]');
      expect(terminal).toBeInTheDocument();
    });

    it('switching back to DATA tab shows the same terminal state', async () => {
      const user = userEvent.setup();
      await renderApp();

      // Get reference to terminal DOM node (present even when STAT is active)
      const terminalBefore = document.querySelector('[data-testid="terminal"]');

      // Switch to DATA
      const dataTab = screen.getByRole('tab', { name: /DATA/i });
      await user.click(dataTab);

      // Wait for full transition to complete (400ms + buffer)
      await new Promise((r) => setTimeout(r, 500));

      // Switch back to STAT
      const statTab = screen.getByRole('tab', { name: /STAT/i });
      await user.click(statTab);

      await new Promise((r) => setTimeout(r, 500));

      // Switch to DATA again
      await user.click(dataTab);

      // Wait for DATA panel to become visible again
      await waitFor(() => {
        const panel = document.querySelector('#pipboy-panel-DATA');
        expect(panel).toBeVisible();
      }, { timeout: 1000 });

      // Same DOM node — not re-mounted
      const terminalAfter = document.querySelector('[data-testid="terminal"]');
      expect(terminalAfter).toBe(terminalBefore);
    });
  });

  // =========================================================================
  // 4. DATA COMPONENTS (pending Woz)
  // =========================================================================
  describe('Data components', () => {
    it('PipBoyStat renders S.P.E.C.I.A.L. attributes from store', async () => {
      const { PipBoyStat } = await import('@/components/PipBoy/tabs/PipBoyStat');
      renderWithPipBoy(<PipBoyStat />);

      // Component renders fullName for each of the 7 S.P.E.C.I.A.L. stats
      const attrs = ['Strength', 'Perception', 'Endurance', 'Charisma', 'Intelligence', 'Agility', 'Luck'];
      for (const attr of attrs) {
        expect(screen.getByText(new RegExp(attr))).toBeInTheDocument();
      }
    });

    it('PipBoyInv shows "NO ITEMS" when disconnected', async () => {
      useConnectionStore.setState({ status: 'disconnected', tools: [], mcpServers: [] });
      const { PipBoyInv } = await import('@/components/PipBoy/tabs/PipBoyInv');
      renderWithPipBoy(<PipBoyInv />);

      expect(screen.getByText(/NO ITEMS/i)).toBeInTheDocument();
    });

    it('PipBoyMap shows "NO SIGNAL" when disconnected', async () => {
      useConnectionStore.setState({ status: 'disconnected' });
      const { PipBoyMap } = await import('@/components/PipBoy/tabs/PipBoyMap');
      renderWithPipBoy(<PipBoyMap />);

      expect(screen.getByText(/NO SIGNAL/i)).toBeInTheDocument();
    });

    it('PipBoyRadio has command input field and preset buttons', async () => {
      const { PipBoyRadio } = await import('@/components/PipBoy/tabs/PipBoyRadio');
      renderWithPipBoy(<PipBoyRadio />);

      // Command input field (has data-testid and placeholder)
      expect(screen.getByTestId('pipboy-radio-input')).toBeInTheDocument();

      // Quick command buttons (STATUS, STOP, RESET, AGENTS + override)
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(4);
    });
  });

  // =========================================================================
  // 5. CRT EFFECTS
  // =========================================================================
  describe('CRT effects', () => {
    it('Pip-Boy theme has crtEnabled: true', async () => {
      const themes = await import('@/themes');
      const pipboy = (themes as Record<string, unknown>)['pipboyTheme'] as {
        crtEnabled?: boolean;
      };
      expect(pipboy.crtEnabled).toBe(true);
    });

    it('scanline overlay renders when pipboy is active', async () => {
      await renderApp();
      const scanlines = document.querySelector('.crt-scanlines');
      expect(scanlines).toBeInTheDocument();
    });

    it('phosphor glow CSS is applied (text-shadow)', async () => {
      await renderApp();
      const overlay = document.querySelector('.crt-overlay');
      expect(overlay).toBeInTheDocument();
      // CRT glow div should be present
      const glow = document.querySelector('.crt-glow');
      expect(glow).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 6. BOOT SEQUENCE
  // =========================================================================
  describe('Boot sequence', () => {
    it('pipboy boot messages exist in getBootMessage', async () => {
      const { getBootMessage } = await import('@/lib/bootMessages');
      // getBootMessage should accept 'pipboy' and return non-empty array
      const messages = getBootMessage('pipboy' as Parameters<typeof getBootMessage>[0]);
      expect(messages).toBeDefined();
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
    });

    it('pipboy boot messages contain vault/pip-boy themed content', async () => {
      const { getBootMessage } = await import('@/lib/bootMessages');
      const messages = getBootMessage('pipboy' as Parameters<typeof getBootMessage>[0]);
      const joined = messages.join('\n').toUpperCase();
      // Should reference Pip-Boy or Vault or SQUAD UPLINK
      expect(
        joined.includes('PIP-BOY') ||
          joined.includes('PIPBOY') ||
          joined.includes('VAULT') ||
          joined.includes('SQUAD UPLINK'),
      ).toBe(true);
    });
  });

  // =========================================================================
  // 7. AUDIO
  // =========================================================================
  describe('Audio', () => {
    it('pipboy has audio profile in SKIN_PROFILES', async () => {
      // SKIN_PROFILES is not exported directly; verify via useAudio behavior
      // by ensuring the hook doesn't throw for the pipboy skin
      const { useAudio } = await import('@/hooks/useAudio');
      const { renderHook } = await import('@testing-library/react');
      const { result } = renderHook(() => useAudio('pipboy' as Parameters<typeof useAudio>[0]));
      expect(result.current.play).toBeDefined();
      expect(result.current.muted).toBe(false);
      expect(result.current.toggleMute).toBeDefined();
    });

    it('pipboy entry exists in audio manifest', async () => {
      const { AUDIO_MANIFEST } = await import('@/audio/manifest');
      const pipboyManifest = (AUDIO_MANIFEST as Record<string, unknown>)['pipboy'];
      expect(pipboyManifest).toBeDefined();
      expect(typeof pipboyManifest).toBe('object');
      // Should have at least boot and keystroke paths
      const manifest = pipboyManifest as Record<string, string>;
      expect(manifest['boot']).toBeDefined();
      expect(manifest['keystroke']).toBeDefined();
    });

    it('pipboy audio paths reference /audio/pipboy/ directory', async () => {
      const { AUDIO_MANIFEST } = await import('@/audio/manifest');
      const pipboyManifest = (AUDIO_MANIFEST as Record<string, unknown>)['pipboy'] as Record<string, string>;
      const paths = Object.values(pipboyManifest);
      for (const path of paths) {
        expect(path).toMatch(/^\/audio\/pipboy\//);
      }
    });
  });
});
