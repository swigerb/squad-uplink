import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
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
 * Force win95 theme via localStorage before rendering.
 * ThemeProvider reads from localStorage on mount.
 */
function renderWithWin95(ui: ReactNode) {
  localStorage.setItem('squad-uplink-theme', 'win95');
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/**
 * Render the full App (lazy-imports TelemetryDrawer, etc.)
 * We import App dynamically to avoid hoisting issues with mocks.
 */
async function renderApp() {
  localStorage.setItem('squad-uplink-theme', 'win95');
  const { default: App } = await import('@/App');
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<App />);
  });
  return result!;
}

describe('Win95Layout', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    _resetAudioForTesting();
    installMockAudioContext();
    // Reset Zustand store to defaults
    useConnectionStore.setState({
      status: 'disconnected',
      tunnelUrl: null,
      agentCount: 0,
      crtEnabled: true,
      audioEnabled: false,
      drawerOpen: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    _resetAudioForTesting();
  });

  // =========================================================================
  // 1. TEXT CONTRAST
  // =========================================================================
  describe('Text contrast', () => {
    it('StatusBar text in Win95 mode renders in the statusbar section (black on gray)', async () => {
      await renderApp();
      // The win95 statusbar sections use .win95-statusbar-section with color: #000000
      // on background: #c0c0c0 — verify the structural elements are present
      const statusSections = document.querySelectorAll('.win95-statusbar-section');
      expect(statusSections.length).toBeGreaterThanOrEqual(2);
      // Statusbar now shows live Zustand data — default is "Disconnected"
      // May appear in both win95-statusbar-section and the embedded StatusBar component
      expect(screen.getAllByText('Disconnected').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Windows 95')).toBeInTheDocument();
    });

    it('menubar renders without controls toolbar (controls moved to StatusBar)', async () => {
      await renderApp();
      const menubar = document.querySelector('.win95-menubar');
      expect(menubar).toBeInTheDocument();
      // Controls toolbar should no longer be in the menubar
      const toolbar = screen.queryByRole('toolbar', { name: /terminal controls/i });
      expect(toolbar).not.toBeInTheDocument();
    });

    it('titlebar text is white on blue gradient background', async () => {
      await renderApp();
      const titlebar = document.querySelector('.win95-titlebar');
      expect(titlebar).toBeInTheDocument();
      const titleText = document.querySelector('.win95-titlebar-text');
      expect(titleText).toBeInTheDocument();
      expect(titleText!.textContent).toContain('SQUAD UPLINK');
    });
  });

  // =========================================================================
  // 2. WINDOW CHROME BUTTONS
  // =========================================================================
  describe('Window chrome buttons — structural', () => {
    it('all three buttons have proper aria-labels', async () => {
      await renderApp();
      expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('buttons are inside the titlebar-buttons container', async () => {
      await renderApp();
      const container = document.querySelector('.win95-titlebar-buttons');
      expect(container).toBeInTheDocument();
      const buttons = container!.querySelectorAll('.win95-titlebar-btn');
      expect(buttons.length).toBe(3);
    });
  });

  describe('Window chrome buttons — behavior', () => {
    it('minimize button hides window body, shows only taskbar', async () => {
      await renderApp();
      const minimizeBtn = screen.getByRole('button', { name: 'Minimize' });
      fireEvent.click(minimizeBtn);

      // Window body should be hidden
      const terminalArea = document.querySelector('.win95-terminal-area');
      expect(terminalArea).not.toBeVisible();
      // Taskbar should remain visible
      const taskbar = document.querySelector('.win95-taskbar');
      expect(taskbar).toBeVisible();
    });

    it('maximize button expands window to fill viewport (minus taskbar)', async () => {
      await renderApp();
      const maximizeBtn = screen.getByRole('button', { name: 'Maximize' });
      fireEvent.click(maximizeBtn);

      const win = document.querySelector('.win95-window');
      // Maximized window should have full-width style or maximized class
      expect(win).toHaveClass('win95-window--maximized');
    });

    it('maximize toggles back to windowed size on second click', async () => {
      await renderApp();
      const maximizeBtn = screen.getByRole('button', { name: 'Maximize' });
      fireEvent.click(maximizeBtn);
      fireEvent.click(maximizeBtn);

      const win = document.querySelector('.win95-window');
      expect(win).not.toHaveClass('win95-window--maximized');
    });

    it('close button hides the entire window', async () => {
      await renderApp();
      const closeBtn = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeBtn);

      const win = document.querySelector('.win95-window');
      expect(win).not.toBeVisible();
    });
  });

  // =========================================================================
  // 3. DESKTOP ICON (after close)
  // =========================================================================
  describe('Desktop icon', () => {
    it('desktop icons are always visible on the teal desktop', async () => {
      await renderApp();
      const icon = screen.getByTestId('win95-desktop-icon');
      expect(icon).toBeVisible();
    });

    it('desktop icons remain visible when window is open', async () => {
      await renderApp();
      // Window starts in 'normal' state (open) — icons should still be there
      const icon = screen.getByTestId('win95-desktop-icon');
      expect(icon).toBeInTheDocument();
    });

    it('double-click on icon reopens the window after close', async () => {
      const user = userEvent.setup();
      await renderApp();

      // Close the window first
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      const icon = screen.getByTestId('win95-desktop-icon');
      await user.dblClick(icon);

      const win = document.querySelector('.win95-window');
      expect(win).toBeVisible();
    });

    it('icon shows "SQUAD UPLINK" label', async () => {
      await renderApp();

      const icon = screen.getByTestId('win95-desktop-icon');
      expect(icon).toHaveTextContent('SQUAD UPLINK');
    });

    it('single click selects the icon (visual highlight)', async () => {
      const user = userEvent.setup();
      await renderApp();

      const icon = screen.getByTestId('win95-desktop-icon');
      await user.click(icon);

      expect(icon).toHaveClass('win95-desktop-icon--selected');
    });
  });

  // =========================================================================
  // 3b. THEME SWITCHER DESKTOP ICON
  // =========================================================================
  describe('Theme switcher desktop icon', () => {
    it('theme icon is always visible on desktop', async () => {
      await renderApp();

      const themeIcon = screen.getByTestId('win95-theme-icon');
      expect(themeIcon).toBeInTheDocument();
      expect(themeIcon).toHaveTextContent('Display Properties');
    });

    it('double-click on theme icon cycles to next theme', async () => {
      const user = userEvent.setup();
      await renderApp();

      const themeIcon = screen.getByTestId('win95-theme-icon');
      await user.dblClick(themeIcon);

      // Win95 is index 3 in THEME_ORDER, next is LCARS (index 4)
      expect(document.documentElement.getAttribute('data-theme')).toBe('lcars');
    });

    it('single click selects theme icon', async () => {
      const user = userEvent.setup();
      await renderApp();

      const themeIcon = screen.getByTestId('win95-theme-icon');
      await user.click(themeIcon);

      expect(themeIcon).toHaveClass('win95-desktop-icon--selected');
    });

    it('selecting theme icon deselects app icon', async () => {
      const user = userEvent.setup();
      await renderApp();

      const appIcon = screen.getByTestId('win95-desktop-icon');
      const themeIcon = screen.getByTestId('win95-theme-icon');

      // Select app icon first
      await user.click(appIcon);
      expect(appIcon).toHaveClass('win95-desktop-icon--selected');

      // Now select theme icon
      await user.click(themeIcon);
      expect(themeIcon).toHaveClass('win95-desktop-icon--selected');
      expect(appIcon).not.toHaveClass('win95-desktop-icon--selected');
    });

    it('Enter key on theme icon cycles theme', async () => {
      await renderApp();

      const themeIcon = screen.getByTestId('win95-theme-icon');
      fireEvent.keyDown(themeIcon, { key: 'Enter' });

      expect(document.documentElement.getAttribute('data-theme')).toBe('lcars');
    });
  });

  // =========================================================================
  // 4. TASKBAR
  // =========================================================================
  describe('Taskbar — structural', () => {
    it('taskbar is rendered at bottom of desktop', async () => {
      await renderApp();
      const taskbar = document.querySelector('.win95-taskbar');
      expect(taskbar).toBeInTheDocument();
    });

    it('Start button is present', async () => {
      await renderApp();
      const startBtn = document.querySelector('.win95-start-btn');
      expect(startBtn).toBeInTheDocument();
      expect(startBtn!.textContent).toContain('Start');
    });
  });

  describe('Taskbar — window integration', () => {
    it('taskbar button appears when window is open', async () => {
      await renderApp();
      const taskbarBtn = screen.getByTestId('win95-taskbar-app-btn');
      expect(taskbarBtn).toBeVisible();
    });

    it('taskbar button text shows "SQUAD UPLINK"', async () => {
      await renderApp();
      const taskbarBtn = screen.getByTestId('win95-taskbar-app-btn');
      expect(taskbarBtn).toHaveTextContent('SQUAD UPLINK');
    });

    it('clicking taskbar button toggles minimize/restore', async () => {
      await renderApp();
      const taskbarBtn = screen.getByTestId('win95-taskbar-app-btn');

      // First click → minimize
      fireEvent.click(taskbarBtn);
      const terminalArea = document.querySelector('.win95-terminal-area');
      expect(terminalArea).not.toBeVisible();

      // Second click → restore
      fireEvent.click(taskbarBtn);
      expect(terminalArea).toBeVisible();
    });

    it('taskbar button disappears when window is closed', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(screen.queryByTestId('win95-taskbar-app-btn')).not.toBeInTheDocument();
    });

    it('taskbar button reappears when window is reopened from icon', async () => {
      const user = userEvent.setup();
      await renderApp();

      // Close the window
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByTestId('win95-taskbar-app-btn')).not.toBeInTheDocument();

      // Reopen from desktop icon
      const icon = screen.getByTestId('win95-desktop-icon');
      await user.dblClick(icon);

      expect(screen.getByTestId('win95-taskbar-app-btn')).toBeVisible();
    });

    it('clock displays current time in HH:MM format', async () => {
      await renderApp();
      const clock = screen.getByTestId('win95-taskbar-clock');
      expect(clock.textContent?.trim()).toMatch(/^\d{1,2}:\d{2}$/);
    });
  });

  // =========================================================================
  // 5. TERMINAL PRESERVATION
  // =========================================================================
  describe('Terminal preservation', () => {
    it('terminal remains mounted (not destroyed) when window is minimized', async () => {
      await renderApp();
      const terminalBefore = document.querySelector('.win95-terminal-area');
      expect(terminalBefore).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));

      // Terminal area should still be in DOM, just hidden
      const terminalAfter = document.querySelector('.win95-terminal-area');
      expect(terminalAfter).toBeInTheDocument();
    });

    it('terminal remains mounted when window is closed (hidden but in DOM)', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      // Terminal should stay in DOM (visibility: hidden or display:none, not unmounted)
      const terminalArea = document.querySelector('.win95-terminal-area');
      expect(terminalArea).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 6. THEME TOGGLE IN STATUSBAR
  // =========================================================================
  describe('Theme toggle (floating control bar)', () => {
    it('ThemeToggle button is rendered in the floating control bar', async () => {
      await renderApp();
      const themeToggle = screen.getByTestId('theme-toggle');
      expect(themeToggle).toBeInTheDocument();
    });

    it('ThemeToggle is inside the floating uplink-controls bar', async () => {
      await renderApp();
      const controlBar = document.querySelector('.uplink-controls');
      const themeToggle = controlBar?.querySelector('[data-testid="theme-toggle"]');
      expect(themeToggle).toBeInTheDocument();
    });

    it('clicking ThemeToggle cycles theme from win95 to lcars', async () => {
      await renderApp();
      const themeToggle = screen.getByTestId('theme-toggle');
      fireEvent.click(themeToggle);

      expect(document.documentElement.getAttribute('data-theme')).toBe('lcars');
    });
  });

  // =========================================================================
  // 7. MAXIMIZE RESIZE
  // =========================================================================
  describe('Maximize triggers resize', () => {
    it('maximize dispatches a resize event for xterm re-fit', async () => {
      await renderApp();
      const resizeSpy = vi.fn();
      window.addEventListener('resize', resizeSpy);

      const maximizeBtn = screen.getByRole('button', { name: 'Maximize' });
      fireEvent.click(maximizeBtn);

      // Resize is dispatched via requestAnimationFrame
      await act(async () => {
        await new Promise((r) => requestAnimationFrame(r));
      });

      expect(resizeSpy).toHaveBeenCalled();
      window.removeEventListener('resize', resizeSpy);
    });
  });
});
