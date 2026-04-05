import { create } from 'zustand';
import type { ConnectionState, TelemetryMetrics, StatusResponse } from '@/types/squad-rc';

export interface ConnectionStore {
  status: ConnectionState;
  tunnelUrl: string | null;
  agentCount: number;
  crtEnabled: boolean;
  audioEnabled: boolean;

  // Telemetry
  drawerOpen: boolean;
  telemetry: TelemetryMetrics;

  setStatus: (status: ConnectionState) => void;
  setTunnelUrl: (url: string | null) => void;
  setAgentCount: (count: number) => void;
  toggleCRT: () => void;
  toggleAudio: () => void;

  // Telemetry actions
  toggleDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
  updateTelemetry: (partial: Partial<TelemetryMetrics>) => void;
  setStatusResponse: (response: StatusResponse) => void;
}

const initialTelemetry: TelemetryMetrics = {
  latencyMs: null,
  inboundMps: 0,
  outboundMps: 0,
  connectedAt: null,
  reconnectCount: 0,
  lastDisconnectAt: null,
  statusResponse: null,
  statusFetchedAt: null,
};

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'disconnected',
  tunnelUrl: null,
  agentCount: 0,
  crtEnabled: true,
  audioEnabled: false,

  drawerOpen: false,
  telemetry: { ...initialTelemetry },

  setStatus: (status) => set({ status }),
  setTunnelUrl: (url) => set({ tunnelUrl: url }),
  setAgentCount: (count) => set({ agentCount: count }),
  toggleCRT: () => set((s) => ({ crtEnabled: !s.crtEnabled })),
  toggleAudio: () => set((s) => ({ audioEnabled: !s.audioEnabled })),

  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  updateTelemetry: (partial) =>
    set((s) => ({ telemetry: { ...s.telemetry, ...partial } })),
  setStatusResponse: (response) =>
    set((s) => ({
      telemetry: {
        ...s.telemetry,
        statusResponse: response,
        statusFetchedAt: Date.now(),
      },
    })),
}));
