/**
 * TelemetryDrawer — Wave 4 Tests (Updated for actual implementation)
 *
 * Tests the TelemetryDrawer component as built by Woz.
 * Key implementation details:
 * - Drawer is always in the DOM, shown/hidden via CSS transform
 * - drawerOpen state lives in Zustand connectionStore
 * - Telemetry drawer toggled via 📡 button in StatusBar (keyboard shortcut removed)
 * - Escape key closes the drawer (handled inside the component)
 * - /status calls go through connectionManager.fetchStatus()
 * - Telemetry metrics live in store.telemetry sub-object
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/hooks/ThemeProvider';
import { useConnectionStore } from '@/store/connectionStore';
import { TelemetryDrawer } from '../TelemetryDrawer/TelemetryDrawer';

// Mock connectionManager to prevent real WebSocket/fetch calls
vi.mock('@/lib/ConnectionManager', () => ({
  connectionManager: {
    fetchStatus: vi.fn().mockResolvedValue(null),
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    get isConnected() {
      return false;
    },
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
    telemetry: {
      latencyMs: null,
      inboundMps: 0,
      outboundMps: 0,
      connectedAt: null,
      reconnectCount: 0,
      lastDisconnectAt: null,
      statusResponse: null,
      statusFetchedAt: null,
    },
  });
}

function openDrawer() {
  act(() => {
    useConnectionStore.getState().setDrawerOpen(true);
  });
}

// ============================================================
// Part 1: Rendering
// ============================================================
describe('TelemetryDrawer — Rendering', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is in the DOM but not visually open by default', () => {
    renderWithProviders(<TelemetryDrawer />);
    const drawer = screen.getByTestId('telemetry-drawer');
    // Drawer exists but lacks the --open modifier class
    expect(drawer).toBeDefined();
    expect(drawer.className).not.toContain('telemetry-drawer--open');
  });

  it('shows the open class when drawerOpen is true', () => {
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    const drawer = screen.getByTestId('telemetry-drawer');
    expect(drawer.className).toContain('telemetry-drawer--open');
  });

  it('closes on Escape key', () => {
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByTestId('telemetry-drawer').className).toContain('telemetry-drawer--open');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('telemetry-drawer').className).not.toContain('telemetry-drawer--open');
  });

  it('renders with modern styling — no retro theme classes', () => {
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    const drawer = screen.getByTestId('telemetry-drawer');
    expect(drawer.className).not.toMatch(/skin-apple2e|skin-c64|skin-ibm3270|crt-/);
  });

  it('has aria-label for accessibility', () => {
    renderWithProviders(<TelemetryDrawer />);
    const drawer = screen.getByTestId('telemetry-drawer');
    expect(drawer.getAttribute('aria-label')).toBe('Telemetry panel');
  });

  it('has a close button', () => {
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    const closeBtn = screen.getByTestId('telemetry-close');
    expect(closeBtn).toBeDefined();
    expect(closeBtn.getAttribute('aria-label')).toBe('Close telemetry panel');
  });

  it('close button toggles drawer closed', () => {
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByTestId('telemetry-drawer').className).toContain('telemetry-drawer--open');

    fireEvent.click(screen.getByTestId('telemetry-close'));
    expect(screen.getByTestId('telemetry-drawer').className).not.toContain('telemetry-drawer--open');
  });
});

// ============================================================
// Part 2: Connection Metrics
// ============================================================
describe('TelemetryDrawer — Connection Metrics', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('displays latency value from store', () => {
    useConnectionStore.setState({
      telemetry: {
        ...useConnectionStore.getState().telemetry,
        latencyMs: 42,
      },
    });
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('ms')).toBeInTheDocument();
  });

  it('displays inbound messages per second', () => {
    useConnectionStore.setState({
      telemetry: {
        ...useConnectionStore.getState().telemetry,
        inboundMps: 12.5,
      },
    });
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByText('12.5')).toBeInTheDocument();
    expect(screen.getByText('In msg/s')).toBeInTheDocument();
  });

  it('displays dash when latency is null', () => {
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    // When latencyMs is null, the component renders '—'
    const latencyLabel = screen.getByText('Latency');
    const metricDiv = latencyLabel.closest('.telemetry-metric');
    const valueDiv = metricDiv?.querySelector('.telemetry-metric-value');
    expect(valueDiv?.textContent).toBe('—');
  });

  it('metrics update reactively when store changes', async () => {
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();

    // Initial: latency is null → shows '—'
    const latencyLabel = screen.getByText('Latency');
    const metricDiv = latencyLabel.closest('.telemetry-metric');
    const valueDiv = metricDiv?.querySelector('.telemetry-metric-value');
    expect(valueDiv?.textContent).toBe('—');

    // Update store with latency
    act(() => {
      useConnectionStore.getState().updateTelemetry({ latencyMs: 100 });
    });

    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });
});

// ============================================================
// Part 3: Session Info
// ============================================================
describe('TelemetryDrawer — Session Info', () => {
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
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByText(/abc123\.devtunnels\.ms/)).toBeInTheDocument();
  });

  it('shows "not connected" when tunnel URL is null', () => {
    useConnectionStore.setState({ tunnelUrl: null });
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByText('not connected')).toBeInTheDocument();
  });

  it('shows reconnect count from telemetry', () => {
    useConnectionStore.setState({
      telemetry: {
        ...useConnectionStore.getState().telemetry,
        reconnectCount: 3,
      },
    });
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows connection status', () => {
    useConnectionStore.setState({ status: 'connected' });
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByText('connected')).toBeInTheDocument();
  });
});

// ============================================================
// Part 4: Status Endpoint
// ============================================================
describe('TelemetryDrawer — Status Endpoint', () => {
  beforeEach(async () => {
    localStorage.clear();
    resetStore();
    vi.useFakeTimers();

    const { connectionManager } = await import('@/lib/ConnectionManager');
    vi.mocked(connectionManager.fetchStatus).mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('calls connectionManager.fetchStatus when drawer opens while connected', async () => {
    const { connectionManager } = await import('@/lib/ConnectionManager');
    useConnectionStore.setState({ status: 'connected' });
    renderWithProviders(<TelemetryDrawer />);

    await act(async () => {
      useConnectionStore.getState().setDrawerOpen(true);
    });

    expect(connectionManager.fetchStatus).toHaveBeenCalled();
  });

  it('renders status response data when available', () => {
    useConnectionStore.setState({
      status: 'connected',
      tunnelUrl: 'https://example.devtunnels.ms',
      telemetry: {
        ...useConnectionStore.getState().telemetry,
        statusResponse: {
          uptime: 3600,
          connections: 2,
          agents: [],
          version: '1.0.0',
        },
        statusFetchedAt: Date.now(),
      },
    });
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();

    const jsonBlock = screen.getByTestId('telemetry-json');
    expect(jsonBlock.textContent).toContain('1.0.0');
  });

  it('shows "Connect to view status" when disconnected and no response', () => {
    useConnectionStore.setState({ status: 'disconnected' });
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();

    expect(screen.getByText('Connect to view status')).toBeInTheDocument();
  });

  it('auto-refreshes every 30s when drawer is open and connected', async () => {
    const { connectionManager } = await import('@/lib/ConnectionManager');
    useConnectionStore.setState({ status: 'connected' });
    renderWithProviders(<TelemetryDrawer />);

    await act(async () => {
      useConnectionStore.getState().setDrawerOpen(true);
    });

    const initialCallCount = vi.mocked(connectionManager.fetchStatus).mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(vi.mocked(connectionManager.fetchStatus).mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('stops auto-refresh when drawer closes', async () => {
    const { connectionManager } = await import('@/lib/ConnectionManager');
    useConnectionStore.setState({ status: 'connected' });
    renderWithProviders(<TelemetryDrawer />);

    // Open
    await act(async () => {
      useConnectionStore.getState().setDrawerOpen(true);
    });

    // Close
    await act(async () => {
      useConnectionStore.getState().setDrawerOpen(false);
    });

    const callCountAfterClose = vi.mocked(connectionManager.fetchStatus).mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(vi.mocked(connectionManager.fetchStatus).mock.calls.length).toBe(callCountAfterClose);
  });
});

// ============================================================
// Part 5: Edge Cases
// ============================================================
describe('TelemetryDrawer — Edge Cases', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows disconnected status when not connected', () => {
    useConnectionStore.setState({ status: 'disconnected', tunnelUrl: null });
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();

    const drawer = screen.getByTestId('telemetry-drawer');
    expect(drawer.className).toContain('telemetry-drawer--open');
    expect(screen.getByText('disconnected')).toBeInTheDocument();
    expect(screen.getByText('not connected')).toBeInTheDocument();
  });

  it('handles default/null metrics gracefully', () => {
    useConnectionStore.setState({
      status: 'disconnected',
      tunnelUrl: null,
      agentCount: 0,
    });

    expect(() => {
      renderWithProviders(<TelemetryDrawer />);
      openDrawer();
    }).not.toThrow();

    const drawer = screen.getByTestId('telemetry-drawer');
    expect(drawer.className).toContain('telemetry-drawer--open');
  });

  it('shows "No agents reported" when agent list is empty', () => {
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByText('No agents reported')).toBeInTheDocument();
  });

  it('backdrop click closes the drawer', () => {
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();
    expect(screen.getByTestId('telemetry-drawer').className).toContain('telemetry-drawer--open');

    fireEvent.click(screen.getByTestId('telemetry-backdrop'));
    expect(screen.getByTestId('telemetry-drawer').className).not.toContain('telemetry-drawer--open');
  });

  it('multiple rapid open/close toggles do not break state', () => {
    renderWithProviders(<TelemetryDrawer />);

    // Rapid toggle via store: open-close-open-close-open
    for (let i = 0; i < 5; i++) {
      act(() => {
        useConnectionStore.getState().toggleDrawer();
      });
    }

    // After odd number of toggles, drawer should be open
    const drawer = screen.getByTestId('telemetry-drawer');
    expect(drawer.className).toContain('telemetry-drawer--open');
  });

  it('displays agent roster from status response', () => {
    useConnectionStore.setState({
      telemetry: {
        ...useConnectionStore.getState().telemetry,
        statusResponse: {
          uptime: 100,
          connections: 1,
          agents: [
            { name: 'woz', role: 'Lead Dev', status: 'online' as const },
            { name: 'hertzfeld', role: 'Tester', status: 'busy' as const },
          ],
        },
      },
    });
    renderWithProviders(<TelemetryDrawer />);
    openDrawer();

    expect(screen.getByText('woz')).toBeInTheDocument();
    expect(screen.getByText('hertzfeld')).toBeInTheDocument();
    expect(screen.getByText('Lead Dev')).toBeInTheDocument();
    expect(screen.getByText('Tester')).toBeInTheDocument();
  });
});
