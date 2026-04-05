import { create } from 'zustand';
import type { ConnectionState } from '@/types/squad-rc';

export interface ConnectionStore {
  status: ConnectionState;
  tunnelUrl: string | null;
  agentCount: number;
  crtEnabled: boolean;
  audioEnabled: boolean;

  setStatus: (status: ConnectionState) => void;
  setTunnelUrl: (url: string | null) => void;
  setAgentCount: (count: number) => void;
  toggleCRT: () => void;
  toggleAudio: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'disconnected',
  tunnelUrl: null,
  agentCount: 0,
  crtEnabled: true,
  audioEnabled: false,

  setStatus: (status) => set({ status }),
  setTunnelUrl: (url) => set({ tunnelUrl: url }),
  setAgentCount: (count) => set({ agentCount: count }),
  toggleCRT: () => set((s) => ({ crtEnabled: !s.crtEnabled })),
  toggleAudio: () => set((s) => ({ audioEnabled: !s.audioEnabled })),
}));
