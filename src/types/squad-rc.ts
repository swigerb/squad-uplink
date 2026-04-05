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
