import { create } from 'zustand';
import type {
  ConnectionState,
  TelemetryMetrics,
  StatusResponse,
  MessageHistoryEntry,
  ToolInfo,
  McpServerInfo,
} from '@/types/squad-rc';

const MAX_MESSAGE_HISTORY = 50;
const MAX_COMMAND_HISTORY = 10;

export interface ConnectionStore {
  status: ConnectionState;
  tunnelUrl: string | null;
  agentCount: number;
  crtEnabled: boolean;
  audioEnabled: boolean;

  // Telemetry
  drawerOpen: boolean;
  telemetry: TelemetryMetrics;

  // Pip-Boy state
  messageHistory: MessageHistoryEntry[];
  tools: ToolInfo[];
  mcpServers: McpServerInfo[];
  activeAgent: string | null;
  commandHistory: string[];
  uplinkOverride: boolean;

  // Hardware feedback state
  radsAlert: boolean;
  thinking: boolean;

  // Terminal fullscreen state
  terminalFullscreen: boolean;

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

  // Pip-Boy actions
  addMessageHistory: (entry: MessageHistoryEntry) => void;
  setTools: (tools: ToolInfo[]) => void;
  setMcpServers: (servers: McpServerInfo[]) => void;
  setActiveAgent: (agent: string | null) => void;
  addCommand: (cmd: string) => void;
  toggleUplinkOverride: () => void;

  // Hardware feedback actions
  setRadsAlert: (alert: boolean) => void;
  setThinking: (thinking: boolean) => void;

  // Terminal fullscreen actions
  toggleFullscreen: () => void;
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
  tokenUsage: 0,
  messageCount: 0,
  successCount: 0,
};

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'disconnected',
  tunnelUrl: null,
  agentCount: 0,
  crtEnabled: true,
  audioEnabled: false,

  drawerOpen: false,
  telemetry: { ...initialTelemetry },

  // Pip-Boy initial state
  messageHistory: [],
  tools: [],
  mcpServers: [],
  activeAgent: null,
  commandHistory: [],
  uplinkOverride: false,

  // Hardware feedback initial state
  radsAlert: false,
  thinking: false,

  // Terminal fullscreen initial state
  terminalFullscreen: false,

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

  // Pip-Boy actions
  addMessageHistory: (entry) =>
    set((s) => ({
      messageHistory: [...s.messageHistory, entry].slice(-MAX_MESSAGE_HISTORY),
    })),
  setTools: (tools) => set({ tools }),
  setMcpServers: (servers) => set({ mcpServers: servers }),
  setActiveAgent: (agent) => set({ activeAgent: agent }),
  addCommand: (cmd) =>
    set((s) => ({
      commandHistory: [...s.commandHistory, cmd].slice(-MAX_COMMAND_HISTORY),
    })),
  toggleUplinkOverride: () =>
    set((s) => ({ uplinkOverride: !s.uplinkOverride })),

  // Hardware feedback actions
  setRadsAlert: (alert) => set({ radsAlert: alert }),
  setThinking: (thinking) => set({ thinking }),

  // Terminal fullscreen actions
  toggleFullscreen: () =>
    set((s) => ({ terminalFullscreen: !s.terminalFullscreen })),
}));
