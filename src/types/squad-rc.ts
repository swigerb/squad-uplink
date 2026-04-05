/** Message sent from the client to squad-rc over WebSocket */
export interface OutboundMessage {
  type: 'prompt';
  text: string;
  /** Optional agent target, e.g. "@woz" */
  agent?: string;
}

/** JSON-RPC response envelope from Copilot CLI via ACP passthrough */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Inbound message types from the squad-rc WebSocket */
export type InboundMessage =
  | InboundText
  | InboundStatus
  | InboundAgentList
  | InboundError;

export interface InboundText {
  type: 'text';
  content: string;
  /** Which agent responded */
  agent?: string;
}

export interface InboundStatus {
  type: 'status';
  connected: boolean;
  tunnel?: string;
}

export interface InboundAgentList {
  type: 'agents';
  agents: AgentInfo[];
}

export interface InboundError {
  type: 'error';
  message: string;
  code?: string;
}

/** Agent metadata from team.md roster */
export interface AgentInfo {
  name: string;
  role: string;
  status: 'online' | 'offline' | 'busy';
}

/** WebSocket connection states */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/** Auth ticket exchange response */
export interface TicketResponse {
  token: string;
  expiresAt: string;
}

/** Configuration for connecting to squad-rc */
export interface SquadRcConfig {
  /** WebSocket URL for the devtunnel endpoint */
  wsUrl: string;
  /** Session auth token */
  token: string;
  /** Auto-reconnect on disconnect */
  reconnect?: boolean;
  /** Max reconnect attempts */
  maxRetries?: number;
}

/** Response from the squad-rc /status endpoint */
export interface StatusResponse {
  uptime: number;
  connections: number;
  agents: AgentInfo[];
  tunnel?: string;
  version?: string;
  /** Raw JSON fields we don't explicitly type */
  [key: string]: unknown;
}

/** Telemetry metrics tracked by ConnectionManager */
export interface TelemetryMetrics {
  /** Round-trip latency to squad-rc in ms */
  latencyMs: number | null;
  /** Messages received per second (rolling average) */
  inboundMps: number;
  /** Messages sent per second (rolling average) */
  outboundMps: number;
  /** Epoch ms when connection was established */
  connectedAt: number | null;
  /** Number of reconnection attempts since initial connect */
  reconnectCount: number;
  /** ISO timestamp of last disconnect event */
  lastDisconnectAt: string | null;
  /** Latest /status response from squad-rc */
  statusResponse: StatusResponse | null;
  /** Epoch ms of last /status fetch */
  statusFetchedAt: number | null;
  /** Tokens consumed this session (Pip-Boy Intelligence stat) */
  tokenUsage: number;
  /** Total messages sent + received this session */
  messageCount: number;
  /** Successfully delivered messages this session */
  successCount: number;
}

/** Entry in the Pip-Boy message history buffer */
export interface MessageHistoryEntry {
  id: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  agent?: string;
  type: string;
  content: string;
  raw: unknown;
}

/** Tool info for Pip-Boy Inventory tab */
export interface ToolInfo {
  name: string;
  type: string;
  status: 'active' | 'inactive';
  description?: string;
}

/** MCP server connection info for Pip-Boy Inventory tab */
export interface McpServerInfo {
  name: string;
  status: 'connected' | 'disconnected';
  url?: string;
}
