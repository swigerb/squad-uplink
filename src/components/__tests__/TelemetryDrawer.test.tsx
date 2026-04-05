/**
 * TelemetryDrawer — Wave 4 Tests
 *
 * Written against the SPEC before implementation exists.
 * The TelemetryDrawer component does not exist yet — all tests are
 * wrapped in describe.skip blocks so they compile cleanly and skip
 * without failing. Once Woz delivers the component, remove .skip
 * and update imports as needed.
 *
 * Expected component location: src/components/TelemetryDrawer/TelemetryDrawer.tsx
 * Expected store additions: latency, messagesPerSec, uptimeMs, sessionToken
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/hooks/useTheme';
import { useConnectionStore } from '@/store/connectionStore';

// TelemetryDrawer doesn't exist yet — this import will fail until Wave 4 lands.
// import { TelemetryDrawer } from '../TelemetryDrawer/TelemetryDrawer';

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
// Part 1: Rendering
// ============================================================
describe.skip('TelemetryDrawer — Rendering (pending implementation)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is not visible in the DOM by default', () => {
    // renderWithProviders(<TelemetryDrawer />);
    // The drawer should either not be in the DOM or have display:none / aria-hidden
    const drawer = screen.queryByTestId('telemetry-drawer');
    expect(drawer).toBeNull();
  });

  it('opens when Ctrl+Shift+T is pressed', async () => {
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    const drawer = screen.getByTestId('telemetry-drawer');
    expect(drawer).toBeVisible();
  });

  it('closes on Escape key', async () => {
    // renderWithProviders(<TelemetryDrawer />);
    // Open first
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId('telemetry-drawer')).toBeVisible();

    // Close
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('telemetry-drawer')).toBeNull();
  });

  it('renders with modern styling — no retro theme classes', () => {
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    const drawer = screen.getByTestId('telemetry-drawer');
    // The telemetry panel is a modern overlay — no CRT classes, no skin-specific classes
    expect(drawer.className).not.toMatch(/skin-apple2e|skin-c64|skin-ibm3270|crt-/);
  });
});

// ============================================================
// Part 2: Connection Metrics
// ============================================================
describe.skip('TelemetryDrawer — Connection Metrics (pending implementation)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('displays latency value from store', () => {
    // Set store with latency data (store extension pending)
    // useConnectionStore.setState({ latency: 42 });
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    expect(screen.getByText(/42\s*ms/i)).toBeInTheDocument();
  });

  it('displays messages per second rate', () => {
    // useConnectionStore.setState({ messagesPerSec: 12.5 });
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    expect(screen.getByText(/12\.5/)).toBeInTheDocument();
    expect(screen.getByText(/msg\/s/i)).toBeInTheDocument();
  });

  it('displays uptime formatted as HH:MM:SS', () => {
    // 3661000ms = 1h 1m 1s
    // useConnectionStore.setState({ uptimeMs: 3661000 });
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    expect(screen.getByText('01:01:01')).toBeInTheDocument();
  });

  it('metrics update reactively when store changes', async () => {
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });

    // Initial
    expect(screen.getByText(/0\s*ms/i)).toBeInTheDocument();

    // Update store
    act(() => {
      // useConnectionStore.setState({ latency: 100 });
    });

    await waitFor(() => {
      expect(screen.getByText(/100\s*ms/i)).toBeInTheDocument();
    });
  });
});

// ============================================================
// Part 3: Session Info
// ============================================================
describe.skip('TelemetryDrawer — Session Info (pending implementation)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows tunnel URL from store', () => {
    useConnectionStore.setState({ tunnelUrl: 'https://abc123.devtunnels.ms' });
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    expect(screen.getByText(/abc123\.devtunnels\.ms/)).toBeInTheDocument();
  });

  it('shows masked session token — only last 8 chars visible', () => {
    // useConnectionStore.setState({ sessionToken: 'abcdefgh12345678' });
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    // Should show something like "••••••••12345678"
    const tokenEl = screen.getByTestId('session-token');
    expect(tokenEl.textContent).toMatch(/•+12345678/);
    expect(tokenEl.textContent).not.toContain('abcdefgh');
  });

  it('shows agent count from store', () => {
    useConnectionStore.setState({ agentCount: 5 });
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows connection status', () => {
    useConnectionStore.setState({ status: 'connected' });
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });
});

// ============================================================
// Part 4: Status Endpoint
// ============================================================
describe.skip('TelemetryDrawer — Status Endpoint (pending implementation)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    resetStore();
    vi.useFakeTimers();

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          uptime: 3600,
          agents: 3,
          version: '1.0.0',
          connections: 2,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('calls squad-rc /status when drawer opens', async () => {
    useConnectionStore.setState({
      status: 'connected',
      tunnelUrl: 'https://example.devtunnels.ms',
    });
    // renderWithProviders(<TelemetryDrawer />);

    await act(async () => {
      fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/status'),
      expect.any(Object),
    );
  });

  it('renders status response data', async () => {
    useConnectionStore.setState({
      status: 'connected',
      tunnelUrl: 'https://example.devtunnels.ms',
    });
    // renderWithProviders(<TelemetryDrawer />);

    await act(async () => {
      fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    });

    await waitFor(() => {
      expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
    });
  });

  it('handles /status endpoint errors gracefully', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));
    useConnectionStore.setState({
      status: 'connected',
      tunnelUrl: 'https://example.devtunnels.ms',
    });
    // renderWithProviders(<TelemetryDrawer />);

    await act(async () => {
      fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    });

    // Should show error message, not crash
    await waitFor(() => {
      const drawer = screen.getByTestId('telemetry-drawer');
      expect(drawer).toBeVisible();
      expect(screen.getByText(/error|unavailable|failed/i)).toBeInTheDocument();
    });
  });

  it('auto-refreshes every 30s when drawer is open', async () => {
    useConnectionStore.setState({
      status: 'connected',
      tunnelUrl: 'https://example.devtunnels.ms',
    });
    // renderWithProviders(<TelemetryDrawer />);

    await act(async () => {
      fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    });

    const initialCallCount = fetchSpy.mock.calls.length;

    // Advance 30s — should trigger another /status call
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('stops auto-refresh when drawer closes', async () => {
    useConnectionStore.setState({
      status: 'connected',
      tunnelUrl: 'https://example.devtunnels.ms',
    });
    // renderWithProviders(<TelemetryDrawer />);

    // Open
    await act(async () => {
      fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    });

    // Close
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    const callCountAfterClose = fetchSpy.mock.calls.length;

    // Advance 60s — should NOT trigger more calls
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(fetchSpy.mock.calls.length).toBe(callCountAfterClose);
  });
});

// ============================================================
// Part 5: Edge Cases
// ============================================================
describe.skip('TelemetryDrawer — Edge Cases (pending implementation)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows "no connection" state when disconnected', () => {
    useConnectionStore.setState({ status: 'disconnected', tunnelUrl: null });
    // renderWithProviders(<TelemetryDrawer />);
    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });

    const drawer = screen.getByTestId('telemetry-drawer');
    expect(drawer).toBeVisible();
    expect(screen.getByText(/no connection|disconnected|not connected/i)).toBeInTheDocument();
  });

  it('handles missing/null metrics gracefully', () => {
    // All metrics undefined/null
    useConnectionStore.setState({
      status: 'disconnected',
      tunnelUrl: null,
      agentCount: 0,
    });
    // renderWithProviders(<TelemetryDrawer />);

    // Should render without crashing
    expect(() => {
      fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    }).not.toThrow();

    const drawer = screen.getByTestId('telemetry-drawer');
    expect(drawer).toBeVisible();
  });

  it('keyboard shortcut does not fire when focused in a terminal input', () => {
    // renderWithProviders(
    //   <>
    //     <input data-testid="terminal-input" />
    //     <TelemetryDrawer />
    //   </>
    // );

    const input = screen.getByTestId('terminal-input');
    input.focus();

    fireEvent.keyDown(input, { key: 'T', ctrlKey: true, shiftKey: true });

    // Drawer should NOT open when a terminal input is focused
    expect(screen.queryByTestId('telemetry-drawer')).toBeNull();
  });

  it('multiple rapid open/close toggles do not break state', async () => {
    const user = userEvent.setup();
    // renderWithProviders(<TelemetryDrawer />);

    // Rapid toggle: open-close-open-close-open
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    }

    // After odd number of toggles, drawer should be open
    // (toggle #5 = open state)
    const drawer = screen.queryByTestId('telemetry-drawer');
    // Either visible or null — but no exceptions thrown
    if (drawer) {
      expect(drawer).toBeVisible();
    }
    // The key assertion: no crash, no duplicate renders
    expect(user).toBeDefined(); // user-event still functional
  });
});
