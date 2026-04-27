import { CopilotClient, approveAll } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';
import type {
	SessionMetadata,
	SessionContext,
	PermissionRequest,
	PermissionRequestResult,
	UserInputRequest,
	UserInputResponse,
} from '@github/copilot-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import { RulesStore } from './rules.js';
import type { ApprovalRule } from './rules.js';

// Derive the correct approval/deny response format from the SDK's own approveAll handler.
// This stays compatible across SDK versions (0.2.x='approved', 0.3.x='approve-once').
const SDK_APPROVE = approveAll({ kind: 'shell' } as PermissionRequest, { sessionId: '' }) as PermissionRequestResult;
const SDK_DENY = ((SDK_APPROVE as { kind: string }).kind === 'approve-once'
	? { kind: 'reject' }
	: { kind: 'denied-interactively-by-user' }) as PermissionRequestResult;

export type { SessionMetadata };
export type { ApprovalRule };

export interface PortalInfo {
	version: string;
	login: string;
	models: Array<{ id: string; name: string }>;
}

export interface PortalEvent {
	type: 'delta' | 'idle' | 'message_end' | 'error' | 'approval_request' | 'approval_resolved' | 'input_request' | 'tool_call' | 'tool_start' | 'tool_complete' | 'tool_update' | 'intent' | 'session_switched' | 'session_not_found' | 'session_renamed' | 'thinking' | 'reasoning_delta' | 'sync' | 'model_changed' | 'rules_list' | 'history_meta' | 'history_user' | 'cli_approval_pending' | 'cli_approval_resolved' | 'cli_input_pending' | 'cli_input_resolved' | 'turn_stopping' | 'history_start' | 'history_end' | 'session_context_updated' | 'session_created' | 'session_deleted' | 'session_shield_changed' | 'approve_all_changed' | 'warning' | 'info' | 'session_usage';
	content?: string;
	role?: 'user' | 'assistant';
	intermediate?: boolean; // true for assistant.message events that were mid-turn (history replay)
	timestamp?: number; // ms epoch — set on history events if the SDK provides it
	toolSummary?: Array<{ toolName: string; display: string; completed: boolean }>;
	askUserChoices?: string[]; // choices that were presented for an ask_user response
	total?: number;
	shown?: number;
	requestId?: string;
	approval?: { requestId: string; action: string; summary: string; details: unknown; alwaysPattern?: string; warning?: string };
	inputRequest?: { requestId: string; question: string; choices?: string[]; allowFreeform?: boolean };
	sessionId?: string;
	context?: SessionContext | null;
	model?: string;
	toolCallId?: string;
	toolName?: string;
	mcpServerName?: string;
	displayLabel?: string;
	intentionSummary?: string;
	rules?: ApprovalRule[];
	approveAll?: boolean;
	summary?: string;
	shielded?: boolean;
	session?: unknown;
}

type PendingApproval = {
	resolve: (r: PermissionRequestResult) => void;
	reject: (e: Error) => void;
	event: PortalEvent;
	req: PermissionRequest;
	timeout: ReturnType<typeof setTimeout>;
};

type PendingInput = {
	resolve: (r: UserInputResponse) => void;
	reject: (e: Error) => void;
	event: PortalEvent;
	timeout: ReturnType<typeof setTimeout>;
};

/** Wraps one CopilotSession and fans events out to multiple WS listeners. */
export class SessionHandle {
	readonly sessionId: string;
	private session: CopilotSession;
	titleChangedCallback?: (title?: string) => void | Promise<void>;
	private listeners = new Set<(e: PortalEvent) => void>();
	/** True until the first portal client ever connects — prevents evict-on-connect for brand-new sessions. */
	isNew = true;
	private pendingApprovals = new Map<string, PendingApproval>();
	private pendingInputs = new Map<string, PendingInput>();
	private counter = 0;
	private pendingCompletionCount = 0; // # of permission.completed events expected for already-resolved approvals
	private log: (msg: string) => void;
	private lastSyncedCount = 0;
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private sessionGeneration = 0;
	private isReconnecting = false;
	private reconnectFn: ((id: string, model?: string) => Promise<CopilotSession>) | null = null;
	/** The model currently in use by the CLI session — passed to resumeSession on reconnect so portal sends use the same model. */
	currentModel: string | null = null;
	/** Currently selected agent — persisted across reconnects. */
	currentAgent: string | null = null;
	private getModTimeFn: (() => Promise<Date | null>) | null = null;
	private lastKnownModTime: Date | null = null;
	private rulesStore: RulesStore | null = null;

	// Active turn state — replayed to newly joining clients
	private isTurnActive = false;
	private isPortalTurn = false; // true when the current turn was initiated from the portal
	private activeDeltaBuffer = '';
	private activeReasoningBuffer = '';
	private activeUserMessage = ''; // current in-flight user message (CLI or portal)
	private cliApprovalSummary: string | null = null;// set when CLI turn is waiting for tool approval
	private cliInputPending: string | null = null; // set when CLI turn is waiting for user input
	private turnProbeTimer: ReturnType<typeof setTimeout> | null = null;
	private turnStartTime: number = 0; // ms timestamp when current turn started
	// Proactive compaction: track estimated tokens since last compaction.
	// When estimated total approaches the context limit, compact before the next portal send.
	private tokensSinceCompaction = 0;
	private static readonly COMPACT_TOKEN_THRESHOLD = 120_000; // ~80% of 150k context window
	lastKnownSummary: string | undefined = undefined; // tracked by getModTimeFn to detect /rename

	// Accumulated session usage stats — broadcast on each assistant.usage event
	private sessionUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, requests: 0 };

	// Per-connection tool tracking — reset on each attachListeners() call
	private deltasSent = false;
	private toolsInFlight = 0;
	/** When true, this session is shared with a CLI TUI — don't respond to non-portal approvals */
	sharedMode = false;

	constructor(
		session: CopilotSession,
		log: (msg: string) => void,
		reconnectFn?: (id: string) => Promise<CopilotSession>,
		getModTimeFn?: () => Promise<Date | null>,
		rulesStore?: RulesStore,
	) {
		this.sessionId = session.sessionId;
		this.session = session;
		const tag = session.sessionId.slice(0, 8);
		this.log = (msg: string) => log(msg.replace('[Session]', `[${tag}]`).replace('[Sync]', `[${tag}:sync]`));
		this.reconnectFn = reconnectFn ?? null;
		this.getModTimeFn = getModTimeFn ?? null;
		this.rulesStore = rulesStore ?? null;
		this.attachListeners();
		// Seed token estimate from history so proactive compaction works after a server restart
		void this.seedTokenEstimate();
	}

	/** Read session history to estimate tokens since last compaction (for proactive compaction). */
	private async seedTokenEstimate(): Promise<void> {
		try {
			const msgs = await this.session.getMessages();
			// Find the last compaction event
			let lastCompactionIdx = -1;
			let baseTokens = 0;
			for (let i = msgs.length - 1; i >= 0; i--) {
				if (msgs[i].type === 'session.compaction_complete') {
					lastCompactionIdx = i;
					const d = msgs[i].data as { postCompactionTokens?: number; compactionTokensUsed?: { output?: number } };
					baseTokens = d.postCompactionTokens ?? d.compactionTokensUsed?.output ?? 0;
					break;
				}
			}
			// Estimate tokens from assistant messages after the last compaction
			const since = lastCompactionIdx >= 0 ? msgs.slice(lastCompactionIdx + 1) : msgs;
			const estimatedNew = since
				.filter((m) => m.type === 'assistant.message')
				.reduce((sum, m) => sum + Math.ceil(((m.data as { content?: string })?.content?.length ?? 0) / 4), 0);
			this.tokensSinceCompaction = baseTokens + estimatedNew;
			this.log(`[Session] Token estimate seeded: ${this.tokensSinceCompaction} (base=${baseTokens}, +${estimatedNew} since last compaction)`);
		} catch (e) {
			this.log(`[Session] Could not seed token estimate: ${e}`);
		}
	}

	/** Called once on fresh pool connect — checks for pending CLI approvals. */
	async checkInitialState(): Promise<void> {
		try {
			const msgs = await this.session.getMessages();
			this.detectPendingCliApproval(msgs);
		} catch (e) {
			this.log('[Session] checkInitialState error: ' + e);
		}
	}

	addListener(fn: (e: PortalEvent) => void): void {
		this.isNew = false; // once a client connects, no longer considered brand-new
		this.listeners.add(fn);
		if (this.listeners.size === 1) this.startPoll();
	}

	removeListener(fn: (e: PortalEvent) => void): void {
		this.listeners.delete(fn);
		if (this.listeners.size === 0) {
			this.stopPoll();
			// Always clear pending timeouts to prevent accumulation.
			// If no turn is active, also resolve/reject the promises.
			// If a turn IS active, clear timers but let the turn complete —
			// the next client to connect will see the result.
			for (const [, p] of this.pendingApprovals) clearTimeout(p.timeout);
			for (const [, p] of this.pendingInputs) clearTimeout(p.timeout);
			if (!this.isTurnActive) {
				this.denyAllPending();
			} else {
				// Reject inputs even during active turns — they can't be answered without a client
				for (const [id, p] of this.pendingInputs) {
					this.log(`[Session] Auto-cancelling input ${id} (no clients)`);
					this.pendingInputs.delete(id);
					p.reject(new Error('No clients connected'));
				}
			}
		}
	}

	get listenerCount(): number { return this.listeners.size; }
	get turnActive(): boolean { return this.isTurnActive; }

	// --- Agent picker methods ---

	async listAgents(): Promise<Array<{ name: string; displayName: string; description: string }>> {
		try {
			const result = await this.session.rpc.agent.list();
			return result.agents ?? [];
		} catch { return []; }
	}

	async getCurrentAgent(): Promise<{ name: string; displayName: string; description: string } | null> {
		try {
			const result = await this.session.rpc.agent.getCurrent();
			return result.agent ?? null;
		} catch { return null; }
	}

	async selectAgent(name: string): Promise<{ name: string; displayName: string; description: string }> {
		const result = await this.session.rpc.agent.select({ name });
		this.currentAgent = name;
		return result.agent;
	}

	async deselectAgent(): Promise<void> {
		await this.session.rpc.agent.deselect();
		this.currentAgent = null;
	}

	private restoreAgent(): void {
		if (this.currentAgent) {
			this.session.rpc.agent.select({ name: this.currentAgent }).catch(() => {});
		}
	}

	/** Events to send to a newly joining client to catch up on an in-progress PORTAL turn. */
	getActiveTurnEvents(): PortalEvent[] {
		if (!this.isTurnActive || !this.isPortalTurn) return [];
		const events: PortalEvent[] = [];
		if (this.activeUserMessage) events.push({ type: 'sync', role: 'user', content: this.activeUserMessage });
		events.push({ type: 'thinking', content: '' });
		if (this.activeReasoningBuffer) events.push({ type: 'reasoning_delta', content: this.activeReasoningBuffer });
		if (this.activeDeltaBuffer) events.push({ type: 'delta', content: this.activeDeltaBuffer });
		if (this.cliApprovalSummary) events.push({ type: 'cli_approval_pending', content: this.cliApprovalSummary });
		return events;
	}

	/** Returns CLI-pending state events for late-joining clients. */
	getCliPendingEvents(): PortalEvent[] {
		const events: PortalEvent[] = [];
		if (this.cliApprovalSummary) events.push({ type: 'cli_approval_pending', content: this.cliApprovalSummary });
		if (this.cliInputPending) events.push({ type: 'cli_input_pending', content: this.cliInputPending });
		return events;
	}

	private broadcast(event: PortalEvent): void {
		for (const fn of this.listeners) fn(event);
	}

	/** Extract tool name + display from a raw SDK tool.execution_start event. */
	private static parseToolEvent(data: unknown): { toolName: string; display: string; completed: boolean } {
		const d = data as Record<string, unknown> | undefined;
		const toolName = (d?.toolName as string) ?? 'tool';
		let display = (d?.displayLabel as string) ?? '';
		if (!display) {
			try {
				// SDK history stores arguments as an object; live events send it as a JSON string
				const raw = d?.arguments;
				const args = (typeof raw === 'string' ? JSON.parse(raw) : raw ?? {}) as Record<string, unknown>;
				const val = args.command ?? args.path ?? args.query ?? args.script ?? args.url ?? Object.values(args)[0] ?? '';
				display = String(val).replace(/\s+/g, ' ').trim().slice(0, 200);
			} catch { display = ''; }
		}
		return { toolName, display, completed: true };
	}

	async getHistory(limit?: number): Promise<PortalEvent[]> {
		const events = await this.session.getMessages();
		this.log(`[History] ${events.length} events: ${events.map((e: { type: string }) => e.type).join(', ').slice(0, 200)}`);
		// Log the first user.message event to inspect available timestamp fields
		const firstMsg = events.find((e: { type: string }) => e.type === 'user.message' || e.type === 'assistant.message');
		if (firstMsg) this.log(`[History] Event keys: ${JSON.stringify(Object.keys(firstMsg))} | sample: ${JSON.stringify(firstMsg).slice(0, 300)}`);
		const relevantEvents = events.filter((e: { type: string }) => e.type === 'user.message' || e.type === 'assistant.message');
const total = relevantEvents.length;
const slicedEvents = (limit != null && total > limit)
? (() => {
// Find the offset in the full events array to keep the last limit relevant messages
let kept = 0;
let cutIdx = 0;
for (let i = events.length - 1; i >= 0; i--) {
const t = (events[i] as { type: string }).type;
if (t === 'user.message' || t === 'assistant.message') kept++;
if (kept >= limit) { cutIdx = i; break; }
}
return events.slice(cutIdx);
})()
: events;
const shown = slicedEvents.filter((e: { type: string }) => e.type === 'user.message' || e.type === 'assistant.message').length;
const result: PortalEvent[] = [];
if (total !== shown) result.push({ type: 'history_meta', total, shown });
		// Collect assistant messages per round (between user.messages) so we can
		// mark all-but-last as intermediate (they were mid-turn "notes to self")
		// Exception: messages followed by ask_user are user-facing, not intermediate
		const roundMsgs: string[] = [];
		const roundTimestamps: (number | undefined)[] = [];
		const roundFollowingTools: (string | null)[] = [];
		const roundPerMsgTools: Array<Array<{ toolName: string; display: string; completed: boolean }>>[] = []; // per-message tools
		const askUserToolIds = new Set<string>();
		const askUserChoices = new Map<string, string[]>();
		const askUserQuestions = new Map<string, string>();
		let pendingAskUserAnswers: Array<{ question: string; content: string; choices?: string[]; timestamp?: number }> = [];
		let currentMsgTools: Array<{ toolName: string; display: string; completed: boolean }> = [];

		const flushRound = (allIntermediate = false) => {
			for (let i = 0; i < roundMsgs.length; i++) {
				const content = roundMsgs[i];
				const isLast = i === roundMsgs.length - 1;
				const followedByAskUser = roundFollowingTools[i] === 'ask_user';
				const hasToolRequests = roundFollowingTools[i] === '_has_tool_requests' || (roundFollowingTools[i] !== null && roundFollowingTools[i] !== 'ask_user');
				const intermediate = followedByAskUser ? false : (allIntermediate || hasToolRequests);

				// Get this message's tools (filter ask_user)
				const msgToolsRaw = roundPerMsgTools[i] ?? [];
				const msgTools = msgToolsRaw.filter(t => t.toolName !== 'ask_user');
				const toolSummary = msgTools.length > 0 ? [...msgTools] : undefined;

				// Emit the message content or tool-only row
				if (content || toolSummary) {
					if (content) result.push({ type: 'delta', content, timestamp: roundTimestamps[i] });
					result.push({ type: 'idle', intermediate: intermediate || undefined, toolSummary });
				}

				// Emit any buffered ask_user Q&A
				if (followedByAskUser && pendingAskUserAnswers.length > 0) {
					const qa = pendingAskUserAnswers.shift()!;
					// Emit the question as an assistant message if it's not already in the preceding content
					if (qa.question && (!content || !content.includes(qa.question))) {
						result.push({ type: 'delta', content: qa.question, timestamp: qa.timestamp });
						result.push({ type: 'idle', questionChoices: qa.choices?.length ? qa.choices : undefined });
					} else if (content && qa.choices?.length) {
						// Question was in the preceding message — attach choices to it retroactively
						// (The idle for the preceding message was already emitted, so add a separate choices marker)
					}
					result.push({ type: 'history_user', content: qa.content, timestamp: qa.timestamp, askUserChoices: qa.choices });
				}
			}
			roundMsgs.length = 0;
			roundTimestamps.length = 0;
			roundFollowingTools.length = 0;
			roundPerMsgTools.length = 0;
			currentMsgTools = [];
		};

		for (const e of slicedEvents) {
			const raw = e as { type: string; data?: unknown; createdAt?: number; timestamp?: string | number; ts?: number };
			const tsRaw = raw.createdAt ?? raw.timestamp ?? raw.ts;
			const ts = typeof tsRaw === 'string' ? new Date(tsRaw).getTime() : tsRaw;
			if (e.type === 'user.message') {
				// Save last message's tools before flushing
				if (roundMsgs.length > 0) {
					roundPerMsgTools[roundMsgs.length - 1] = currentMsgTools;
					currentMsgTools = [];
				}
				flushRound();
				result.push({ type: 'history_user', content: (raw.data as { content?: string })?.content ?? '', timestamp: ts });
			} else if (e.type === 'assistant.message') {
				// Save accumulated tools for the previous message
				if (roundMsgs.length > 0) {
					roundPerMsgTools[roundMsgs.length - 1] = currentMsgTools;
					currentMsgTools = [];
				}
				const d = raw.data as { content?: string; toolRequests?: Array<{ name?: string; toolCallId?: string }> };
				roundMsgs.push(d.content ?? '');
				roundTimestamps.push(ts);
				const hasToolRequests = Array.isArray(d.toolRequests) && d.toolRequests.length > 0;
				const isAskUser = hasToolRequests && d.toolRequests!.some(t => t.name === 'ask_user');
				roundFollowingTools.push(isAskUser ? 'ask_user' : hasToolRequests ? '_has_tool_requests' : null);
			} else if (e.type === 'tool.execution_start') {
				const toolName = (raw.data as { toolName?: string })?.toolName;
				if (roundMsgs.length > 0 && (roundFollowingTools[roundFollowingTools.length - 1] === null)) {
					roundFollowingTools[roundFollowingTools.length - 1] = toolName ?? null;
				}
				if (toolName === 'ask_user') {
					const toolCallId = (raw.data as { toolCallId?: string })?.toolCallId ?? '';
					askUserToolIds.add(toolCallId);
					const rawArgs = (raw.data as { arguments?: unknown })?.arguments;
					try {
						const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
						const a = args as { question?: string; choices?: string[] };
						askUserChoices.set(toolCallId, a.choices ?? []);
						askUserQuestions.set(toolCallId, a.question ?? '');
					} catch { /* ignore */ }
				}
				if (toolName !== 'report_intent') currentMsgTools.push(SessionHandle.parseToolEvent(raw.data));
			} else if (e.type === 'tool.execution_complete') {
				const d = raw.data as { toolCallId?: string; result?: { content?: string } };
				if (d.toolCallId && askUserToolIds.has(d.toolCallId)) {
					const answer = d.result?.content ?? '';
					const choices = askUserChoices.get(d.toolCallId);
					const question = askUserQuestions.get(d.toolCallId) ?? '';
					if (answer) pendingAskUserAnswers.push({ question, content: answer, choices, timestamp: ts });
					askUserToolIds.delete(d.toolCallId);
					askUserChoices.delete(d.toolCallId);
					askUserQuestions.delete(d.toolCallId);
				}
			}
		}
		// If the turn is still active, every message in the last round is intermediate
		// (more tool calls / messages are coming — none of them are the final reply yet)
		// Save last message's tools before final flush
		if (roundMsgs.length > 0) {
			roundPerMsgTools[roundMsgs.length - 1] = currentMsgTools;
			currentMsgTools = [];
		}
		flushRound(this.isTurnActive);
		return result;
	}

	private startPoll(): void {
		if (this.pollTimer) return;
		if (this.sharedMode) {
			this.log('[Session] Polling disabled (connected to CLI server)');
			return;
		}
		this.pollTimer = setInterval(() => { void this.pollForChanges(); }, 2000);
	}

	private stopPoll(): void {
		if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
	}

	private async pollForChanges(): Promise<void> {
		if (this.listeners.size === 0 || (this.isTurnActive && this.isPortalTurn) || this.isReconnecting) return;
		// Never reconnect while approvals or inputs are pending — would orphan the promises
		if (this.pendingApprovals.size > 0 || this.pendingInputs.size > 0) return;
		void this.syncMessages();
		if (!this.getModTimeFn) return;
		try {
			const modTime = await this.getModTimeFn();
			if (modTime === null) return;
			if (this.lastKnownModTime === null) {
				this.lastKnownModTime = modTime; // seed on first poll, no reconnect
			} else if (modTime > this.lastKnownModTime) {
				this.lastKnownModTime = modTime;
				void this.reconnectFromCli();
			}
		} catch (_) { /* ignore */ }
	}

	private async syncMessages(): Promise<void> {
		if (this.listeners.size === 0) return;
		try {
			const allEvents = await this.session.getMessages();
			const interesting = allEvents.filter((m: {type:string}) => m.type === 'user.message' || m.type === 'assistant.message');
			if (interesting.length <= this.lastSyncedCount) return;
			// If lastSyncedCount is 0 (never seeded), this is our first look at the message list.
			// We have no baseline to know which messages are truly "new", and history replay will
			// deliver them all properly. Just seed the cursor and bail to avoid flooding clients
			// with the entire session history as individual sync events.
			if (this.lastSyncedCount === 0) {
				this.lastSyncedCount = interesting.length;
				this.log(`[Sync] Seeded lastSyncedCount=${this.lastSyncedCount} (skipping initial broadcast)`);
				return;
			}

			// Walk full event stream to build per-message tool summaries
			type ToolInfo = Array<{ toolName: string; display: string; completed: boolean }>;
			let msgIdx = 0;
			let turnTools: ToolInfo = [];
			let lastAssistantIdx = -1;
			const toolsForMsg = new Map<number, ToolInfo>();

			for (const evt of allEvents) {
				const e = evt as { type: string; data?: unknown };
				if (e.type === 'user.message') {
					// Finalize tools for previous turn's last assistant
					if (lastAssistantIdx >= 0 && turnTools.length > 0) {
						toolsForMsg.set(lastAssistantIdx, [...turnTools]);
					}
					turnTools = [];
					lastAssistantIdx = -1;
					msgIdx++;
				} else if (e.type === 'assistant.message') {
					lastAssistantIdx = msgIdx;
					msgIdx++;
				} else if (e.type === 'tool.execution_start') {
					const toolName = (e.data as { toolName?: string })?.toolName;
					if (toolName !== 'report_intent') turnTools.push(SessionHandle.parseToolEvent(e.data));
				}
			}
			// Finalize last turn
			if (lastAssistantIdx >= 0 && turnTools.length > 0) {
				toolsForMsg.set(lastAssistantIdx, [...turnTools]);
			}

			const newMsgs = interesting.slice(this.lastSyncedCount);
			this.log(`[Sync] ${newMsgs.length} new message(s) (total ${interesting.length})`);
			for (let i = 0; i < newMsgs.length; i++) {
				const globalIdx = this.lastSyncedCount + i;
				const msg = newMsgs[i];
				if (msg.type === 'user.message') {
					const content = (msg.data as { content?: string })?.content ?? '';
					if (content) {
						this.broadcast({ type: 'sync', role: 'user', content });
					}
				} else if (msg.type === 'assistant.message') {
					const content = (msg.data as { content?: string })?.content ?? '';
					// Skip empty assistant messages — SDK noise that causes false idle
					if (content) {
						const tools = toolsForMsg.get(globalIdx);
						this.broadcast({ type: 'sync', role: 'assistant', content, toolSummary: tools });
					}
				}
			}
			this.lastSyncedCount = interesting.length;
		} catch (e) {
			this.log(`[Sync] Error: ${e}`);
		}
	}

	/** Advance lastSyncedCount without broadcasting — used after portal turns to skip re-syncing. */
	private async advanceSyncCount(): Promise<void> {
		try {
			const msgs = await this.session.getMessages();
			const count = msgs.filter((m: {type:string}) => m.type === 'user.message' || m.type === 'assistant.message').length;
			if (count > this.lastSyncedCount) {
				this.log(`[Sync] Portal turn: skipping ${count - this.lastSyncedCount} message(s), advancing cursor to ${count}`);
				this.lastSyncedCount = count;
			}
		} catch (_) { /* ignore */ }
	}

	/** Called when session modifiedTime advances without a portal turn — CLI sent messages. */
	private async reconnectFromCli(): Promise<void> {
		if (this.isReconnecting || !this.reconnectFn || this.listeners.size === 0) return;
		if (this.pendingApprovals.size > 0 || this.pendingInputs.size > 0) return;
		this.isReconnecting = true;
		this.log('[Sync] External change detected — refreshing connection for CLI messages...');
		try {
			const gen = ++this.sessionGeneration;
			const oldSession = this.session;
			// One final check: if a PORTAL turn became active in the brief window before we
			// got here, the live event already handled it — no need to reconnect.
			if (this.isTurnActive && this.isPortalTurn) {
				this.log('[Sync] Portal turn active, skipping CLI reconnect');
				this.sessionGeneration--; // undo gen bump
				return;
			}
			// Capture the current model BEFORE disconnecting so the new session uses the same model.
			// Without this, resumeSession() would use the CLI default model (not claude-sonnet-4.6),
			// causing all portal sends to fail with 400 "model not supported" or "Bad Request".
			const modelResult = await oldSession.rpc.model.getCurrent().catch(() => null);
			if (modelResult?.modelId) {
				this.currentModel = modelResult.modelId;
				this.log(`[Sync] Captured model for reconnect: ${this.currentModel}`);
			}
			// Disconnect old IPC connection first — forces a fresh cursor on reconnect
			await oldSession.disconnect().catch(() => {});
			const newSession = await this.reconnectFn(this.sessionId, this.currentModel ?? undefined);
			if (this.sessionGeneration !== gen) return; // concurrent reconnect won the race
			this.session = newSession;
			// Clear stale reasoning/delta content from the previous connection to avoid
			// replaying outdated thinking state to clients that connect after the reconnect.
			this.activeDeltaBuffer = '';
			this.activeReasoningBuffer = '';
			this.attachListeners();
			const msgs = await this.session.getMessages();
			this.log(`[Sync] Post-reconnect getMessages: ${msgs.length} (lastSyncedCount=${this.lastSyncedCount})`);
			await this.syncMessages();
			// Check for pending CLI approvals missed during reconnect
			this.detectPendingCliApproval(msgs);
			// Check if title changed (e.g. /rename from CLI — doesn't fire session.title_changed)
			// No title data available here, so callback without title triggers a fallback check
			void this.titleChangedCallback?.();
			// Re-broadcast any pending approvals/inputs in case reconnect disrupted the UI state
			for (const p of this.pendingApprovals.values()) this.broadcast(p.event);
			for (const p of this.pendingInputs.values()) this.broadcast(p.event);
			// Re-seed modTime AFTER reconnect since resumeSession() itself updates it
			if (this.getModTimeFn) {
				const t = await this.getModTimeFn().catch(() => null);
				if (t) this.lastKnownModTime = t;
			}
			// Restore agent selection after reconnect
			this.restoreAgent();
		} catch (e) {
			this.log(`[Sync] CLI reconnect error: ${e}`);
		} finally {
			this.isReconnecting = false;
		}
	}

	async send(prompt: string): Promise<void> {
		// Mark turn active immediately so pollForChanges() won't reconnect when
		// user.message fires and changes modifiedTime.
		this.isTurnActive = true;
		this.isPortalTurn = true;
		this.activeUserMessage = prompt;
		this.log(`[${this.sessionId.slice(0, 8)}] Sending prompt (${prompt.length} chars), ~${this.tokensSinceCompaction} tokens since last compaction`);

		// Proactively compact if we're approaching the context limit
		if (this.tokensSinceCompaction >= SessionHandle.COMPACT_TOKEN_THRESHOLD) {
			this.log('[Session] Proactively compacting context before send...');
			this.broadcast({ type: 'thinking', content: 'Compacting context…' });
			try {
				await this.session.rpc.compaction.compact();
				this.log('[Session] Proactive compaction complete');
				// tokensSinceCompaction will be reset by the session.compaction_complete event
			} catch (e) {
				this.log(`[Session] Proactive compaction failed: ${e} — proceeding anyway`);
			}
		}

		try {
			await this.session.send({ prompt });
		} catch (e) {
			const statusCode = (e as { statusCode?: number })?.statusCode;
			const errMsg = String(e);
			// Session evicted by CLI server after idle timeout — reconnect and retry
			if (errMsg.includes('Session not found') && this.reconnectFn) {
				this.log('[Session] Session not found on send — reconnecting...');
				this.broadcast({ type: 'thinking', content: 'Reconnecting session…' });
				try {
					this.isReconnecting = true;
					const gen = ++this.sessionGeneration;
					const newSession = await this.reconnectFn(this.sessionId, this.currentModel ?? undefined);
					if (gen !== this.sessionGeneration) return;
					this.session = newSession;
					this.isReconnecting = false;
					this.attachListeners();
					this.log('[Session] Reconnected — retrying send');
					await this.session.send({ prompt });
					return;
				} catch (reconnectErr) {
					this.isReconnecting = false;
					this.log(`[Session] Reconnect or retry failed: ${reconnectErr}`);
				}
			}
			// Retry once on transient errors (429 rate-limit, 5xx server errors, network glitches)
			if (statusCode === 429 || (statusCode !== undefined && statusCode >= 500)) {
				this.log(`[Session] ${statusCode} on send — retrying after 2s...`);
				await new Promise(r => setTimeout(r, 2000));
				try { await this.session.send({ prompt }); return; } catch {}
			}
			// Fallback: if the API rejects with 400 (context too large), compact and retry once
			if (statusCode === 400) {
				this.log('[Session] 400 on send — compacting context and retrying...');
				this.broadcast({ type: 'thinking', content: 'Compacting context…' });
				try {
					await this.session.rpc.compaction.compact();
					this.log('[Session] Fallback compaction complete, retrying send');
					await this.session.send({ prompt });
					return;
				} catch (compactErr) {
					this.log(`[Session] Fallback compaction or retry failed: ${compactErr}`);
				}
			}
			this.isTurnActive = false;
			throw e;
		}
	}

	async abort(): Promise<void> {
		this.broadcast({ type: 'turn_stopping' });
		await this.session.abort();
	}

	async setModel(model: string): Promise<void> {
		await this.session.setModel(model);
		this.currentModel = model;
		this.log(`[Session] Model changed to: ${model}`);
		this.broadcast({ type: 'model_changed', model });
	}

	async disconnect(): Promise<void> {
		await this.session.disconnect().catch(() => {});
	}

	getPendingApprovalEvents(): PortalEvent[] {
		// Only return the currently-active approval (the one being shown to clients).
		// Others are queued and will be sent automatically after the current one resolves.
		if (!this.activeApprovalId) return [];
		const p = this.pendingApprovals.get(this.activeApprovalId);
		return p ? [p.event] : [];
	}

	getPendingInputEvents(): PortalEvent[] {
		return Array.from(this.pendingInputs.values()).map(p => p.event);
	}

	denyAllPending(): void {
		this.activeApprovalId = null;
		for (const [id, p] of this.pendingApprovals) {
			this.log(`[Session] Auto-denying approval ${id}`);
			clearTimeout(p.timeout);
			this.pendingApprovals.delete(id);
			p.resolve(SDK_DENY);
		}
		for (const [id, p] of this.pendingInputs) {
			this.log(`[Session] Auto-cancelling input ${id}`);
			clearTimeout(p.timeout);
			this.pendingInputs.delete(id);
			p.reject(new Error('No clients connected'));
		}
	}

	resolveApproval(requestId: string, approved: boolean): void {
		const p = this.pendingApprovals.get(requestId);
		if (!p) return;
		clearTimeout(p.timeout);
		this.pendingApprovals.delete(requestId);
		if (this.activeApprovalId === requestId) this.activeApprovalId = null;
		p.resolve(approved ? SDK_APPROVE : SDK_DENY);
		this.log(`[Session] Approval ${approved ? 'granted' : 'denied'}: ${requestId}`);
		this.pendingCompletionCount++; // expect one permission.completed for this resolved approval
		this.broadcast({ type: 'approval_resolved', requestId });
		this.broadcastNextApproval();
	}

	resolveUserInput(requestId: string, answer: string, wasFreeform: boolean): void {
		const p = this.pendingInputs.get(requestId);
		if (!p) return;
		clearTimeout(p.timeout);
		this.pendingInputs.delete(requestId);
		p.resolve({ answer, wasFreeform });
		this.log(`[Session] Input answered: "${answer.slice(0, 40)}"`);
		this.broadcast({ type: 'approval_resolved', requestId });
	}

	private activeApprovalId: string | null = null;

	private broadcastNextApproval(): void {
		if (this.activeApprovalId) return;
		for (const [id, p] of this.pendingApprovals) {
			this.activeApprovalId = id;
			this.broadcast(p.event);
			break;
		}
	}

	handlePermissionRequest(req: PermissionRequest): Promise<PermissionRequestResult> {
		const requestId = `approval-${++this.counter}`;
		this.log(`[Session] Permission request: ${JSON.stringify(req).slice(0, 200)}`);

		// Connected to CLI server: don't respond to CLI-initiated approvals — let the CLI handle them
		if (this.sharedMode && !this.isPortalTurn) {
			this.log(`[Session] Deferring approval to CLI: ${requestId}`);
			return new Promise(() => {}); // never resolves — CLI TUI will handle it
		}

		// approveAll mode — instant approval, no UI
		if (this.getApproveAll()) {
			this.log(`[Session] Auto-approved (approveAll): ${requestId}`);
			return Promise.resolve(SDK_APPROVE);
		}
		const r = req as PermissionRequest & { fullCommandText?: string; path?: string; filePath?: string; file?: string; fileName?: string; resource?: string; target?: string; url?: string; toolName?: string; subject?: string; intention?: string; warning?: string };
		const summary = r.fullCommandText ?? r.path ?? r.filePath ?? r.file ?? r.fileName ?? r.resource ?? r.target ?? r.url ?? r.intention ?? r.subject ?? r.toolName ?? r.kind;
		const alwaysPattern = RulesStore.computePattern(req);
		const warning = r.warning;
		this.log(`[Session] Approval ${requestId}: kind=${r.kind} pattern=${alwaysPattern ?? 'none'} warning=${warning ?? 'none'}`);

		// Auto-approve if a matching rule exists
		const matchingRule = this.rulesStore?.matchesRequest(this.sessionId, req) ?? null;
		if (matchingRule) {
			this.log(`[Session] Auto-approved by rule "${matchingRule.pattern}": ${requestId}`);
			return Promise.resolve(SDK_APPROVE);
		}

		const event: PortalEvent = {
			type: 'approval_request',
			requestId,
			approval: { requestId, action: r.kind, details: req, summary, alwaysPattern, warning },
		};
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.pendingApprovals.has(requestId)) {
					this.pendingApprovals.delete(requestId);
					if (this.activeApprovalId === requestId) this.activeApprovalId = null;
					resolve(SDK_DENY);
					this.pendingCompletionCount++; // expect one permission.completed for this timed-out approval
					this.broadcastNextApproval();
				}
			}, 5 * 60 * 1000);
			this.pendingApprovals.set(requestId, { resolve, reject, event, req, timeout });
			// Queue: broadcast immediately only if no approval is currently being shown
			this.broadcastNextApproval();
		});
	}

	addRule(kind: string, pattern: string): void {
		if (!this.rulesStore) return;
		this.rulesStore.addRule(this.sessionId, kind, pattern);
		this.broadcast({ type: 'rules_list', rules: this.rulesStore.getRules(this.sessionId) });
		// Auto-resolve any queued approvals that now match the new rule
		for (const [id, p] of this.pendingApprovals) {
			if (this.rulesStore.matchesRequest(this.sessionId, p.req)) {
				this.log(`[Session] Auto-approved queued approval by new rule "${pattern}": ${id}`);
				clearTimeout(p.timeout);
				this.pendingApprovals.delete(id);
				if (this.activeApprovalId === id) this.activeApprovalId = null;
				p.resolve(SDK_APPROVE);
				this.broadcast({ type: 'approval_resolved', requestId: id });
			}
		}
		this.broadcastNextApproval();
	}

	removeRule(ruleId: string): void {
		if (!this.rulesStore) return;
		this.rulesStore.removeRule(this.sessionId, ruleId);
		this.broadcast({ type: 'rules_list', rules: this.rulesStore.getRules(this.sessionId) });
	}

	clearRules(): void {
		if (!this.rulesStore) return;
		this.rulesStore.clearRules(this.sessionId);
		this.broadcast({ type: 'rules_list', rules: [] });
	}

	getRulesList(): ApprovalRule[] {
		return this.rulesStore?.getRules(this.sessionId) ?? [];
	}

	getApproveAll(): boolean {
		return this.rulesStore?.getApproveAll(this.sessionId) ?? false;
	}

	setApproveAll(enabled: boolean): void {
		if (this.rulesStore) this.rulesStore.setApproveAll(this.sessionId, enabled);
		this.log(`[Session] approveAll ${enabled ? 'enabled' : 'disabled'}`);
		this.broadcast({ type: 'approve_all_changed', approveAll: enabled });
		if (enabled) {
			// Auto-resolve any queued approvals
			for (const [id, p] of this.pendingApprovals) {
				clearTimeout(p.timeout);
				this.pendingApprovals.delete(id);
				if (this.activeApprovalId === id) this.activeApprovalId = null;
				p.resolve(SDK_APPROVE);
				this.broadcast({ type: 'approval_resolved', requestId: id });
			}
			this.broadcastNextApproval();
		}
	}

	handleUserInputRequest(req: UserInputRequest): Promise<UserInputResponse> {
		const requestId = `input-${++this.counter}`;
		this.log(`[Session] Input request: "${req.question.slice(0, 80)}"`);

		// Connected to CLI server: don't respond to CLI-initiated input requests — let the CLI handle them
		if (this.sharedMode && !this.isPortalTurn) {
			this.log(`[Session] Deferring input to CLI: ${requestId}`);
			return new Promise(() => {}); // never resolves — CLI TUI will handle it
		}

		const event: PortalEvent = {
			type: 'input_request',
			requestId,
			inputRequest: { requestId, question: req.question, choices: req.choices, allowFreeform: req.allowFreeform },
		};
		this.broadcast(event);
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.pendingInputs.has(requestId)) {
					this.pendingInputs.delete(requestId);
					reject(new Error('Input timed out'));
				}
			}, 30 * 60 * 1000);
			this.pendingInputs.set(requestId, { resolve, reject, event, timeout });
		});
	}

	private scheduleTurnProbe(gen: number, intervalMs = 45 * 1000): void {
		if (this.turnProbeTimer) clearTimeout(this.turnProbeTimer);
		this.turnProbeTimer = setTimeout(async () => {
			this.turnProbeTimer = null;
			if (!this.isTurnActive || this.sessionGeneration !== gen) return;
			this.log('[Session] Probing turn status via getMessages()...');
			try {
				const msgs = await this.session.getMessages();
				// Look for a turn-ending event after our turn started
				const turnStartIso = new Date(this.turnStartTime).toISOString();
				const turnEndedAfterStart = msgs.some(
					(m) => (m.type === 'session.idle' || m.type === 'assistant.turn_end') && m.timestamp > turnStartIso,
				);
				if (turnEndedAfterStart) {
					this.log('[Session] Probe found turn completion — clearing stuck state');
					this.isTurnActive = false;
					this.isPortalTurn = false;
					this.activeDeltaBuffer = '';
					this.activeReasoningBuffer = '';
					this.activeUserMessage = '';
					this.broadcast({ type: 'idle' });
					// Sync any messages the live listener missed (CLI turn responses)
					await this.syncMessages();
				} else {
					this.log('[Session] Probe: turn still in progress, rescheduling probe');
					// Re-broadcast pending approvals/inputs in case the client missed the original event
					for (const e of this.getPendingApprovalEvents()) this.broadcast(e);
					for (const e of this.getPendingInputEvents()) this.broadcast(e);
					// Re-broadcast CLI approval banner or detect one from history
					if (this.cliApprovalSummary) {
						this.broadcast({ type: 'cli_approval_pending', content: this.cliApprovalSummary });
					} else {
						this.detectPendingCliApproval(msgs);
					}
					this.scheduleTurnProbe(gen, intervalMs);
				}
			} catch (e) {
				this.log(`[Session] Probe error: ${e} — rescheduling`);
				this.scheduleTurnProbe(gen, intervalMs);
			}
		}, intervalMs);
	}

	// --- Event handlers: one method per SDK event type ---

	private onAssistantTurnStart(data: unknown, gen: number): void {
		this.isTurnActive = true;
		this.turnStartTime = Date.now();
		this.activeDeltaBuffer = '';
		this.activeReasoningBuffer = '';
		// Start a probe timer: if session.idle never fires (CLI crash, dropped connection),
		// periodically query getMessages() for a session.idle event newer than turn start.
		// If found → we missed idle, clear state. If not found → still running, reschedule.
		this.scheduleTurnProbe(gen);
		this.broadcast({ type: 'thinking', content: '' });
	}

	private onUserMessage(data: unknown): void {
		const content = (data as { content?: string })?.content ?? '';
		if (content) {
			this.activeUserMessage = content;
			this.activeDeltaBuffer = '';
			this.activeReasoningBuffer = '';
			this.broadcast({ type: 'sync', role: 'user', content });
		}
	}

	private onAssistantIntent(data: unknown): void {
		const intent = (data as { intent?: string }).intent ?? '';
		if (intent) this.broadcast({ type: 'intent', content: intent });
	}

	private onSessionTitleChanged(data: unknown): void {
		const title = (data as { title?: string }).title;
		this.log(`[TitleChanged] event data=${JSON.stringify(data)} extracted title=${title} lastKnown=${this.lastKnownSummary}`);
		if (title && title !== this.lastKnownSummary) {
			this.lastKnownSummary = title;
			void this.titleChangedCallback?.(title);
		}
		void this.syncMessages();
	}

	private onAssistantReasoningDelta(data: unknown): void {
		const delta = (data as { deltaContent?: string }).deltaContent ?? '';
		if (delta) {
			this.activeReasoningBuffer += delta;
			this.broadcast({ type: 'reasoning_delta', content: delta });
		}
	}

	private onAssistantMessageDelta(data: unknown): void {
		const delta = (data as { deltaContent?: string }).deltaContent ?? '';
		if (delta) {
			this.deltasSent = true;
			this.activeDeltaBuffer += delta;
			this.broadcast({ type: 'delta', content: delta });
		}
	}

	private onAssistantMessage(data: unknown): void {
		const d = data as { content?: string; toolRequests?: unknown[] };
		const content = d.content ?? '';
		this.log(`[Session] Assistant message: ${content.slice(0, 200)}`);
		// Accumulate estimated tokens (chars/4) for proactive compaction
		this.tokensSinceCompaction += Math.ceil(content.length / 4);
		if (!this.deltasSent && content) {
			// No deltas were streamed — send the full content as a single delta first
			this.broadcast({ type: 'delta', content });
		}
		// Always commit this message on the client, whether it arrived via deltas or as a blob
		// Include toolRequests so the client can track which tools belong to this message
		// Messages followed only by ask_user/report_intent are NOT intermediate (user-facing)
		const toolReqs = Array.isArray(d.toolRequests) ? d.toolRequests as Array<{ name?: string; toolCallId?: string; intentionSummary?: string | null }> : [];
		// Broadcast intention summaries as tool_call events so the UI can show them
		for (const t of toolReqs) {
			if (t.intentionSummary && t.toolCallId) {
				this.broadcast({ type: 'tool_call', toolCallId: t.toolCallId, toolName: t.name, intentionSummary: t.intentionSummary });
			}
		}
		const nonUserFacingTools = toolReqs.filter(t => t.name !== 'ask_user' && t.name !== 'report_intent');
		const isIntermediate = nonUserFacingTools.length > 0;
		// Send tool call IDs so client can match tool_complete events to this message
		const toolCallIds = toolReqs.filter(t => t.toolCallId && t.name !== 'report_intent').map(t => t.toolCallId);
		this.broadcast({
			type: 'message_end',
			intermediate: isIntermediate || undefined,
			toolCallIds: toolCallIds.length > 0 ? toolCallIds : undefined,
		});
		this.deltasSent = false;
	}

	private onToolExecutionStart(data: unknown): void {
		this.toolsInFlight++;
		const d = data as { toolCallId?: string; toolName?: string; mcpServerName?: string; arguments?: unknown };
		this.log(`[Session] Tool start (${this.toolsInFlight} in flight): ${d.toolName}`);
		const args = (d.arguments ?? {}) as Record<string, unknown>;
		const labelVal = args.command ?? args.path ?? args.query ?? args.script ?? args.url ?? Object.values(args)[0] ?? '';
		const displayLabel = String(labelVal).replace(/\s+/g, ' ').trim().slice(0, 200);
		this.broadcast({ type: 'tool_start', toolCallId: d.toolCallId, toolName: d.toolName, mcpServerName: d.mcpServerName, displayLabel, content: JSON.stringify(args) });
		// If this is ask_user on a CLI turn, show the input pending banner
		if (d.toolName === 'ask_user' && !this.isPortalTurn) {
			this.cliInputPending = (args as { question?: string }).question ?? 'User input needed';
			this.log(`[Session] CLI ask_user detected: ${this.cliInputPending}`);
			this.broadcast({ type: 'cli_input_pending', content: this.cliInputPending });
		}
	}

	private onToolExecutionComplete(data: unknown): void {
		this.toolsInFlight = Math.max(0, this.toolsInFlight - 1);
		const d = data as { toolCallId?: string; success?: boolean; error?: { message?: string } };
		if (d.success === false && d.error?.message) {
			this.log(`[Session] ⚠ Tool failed: ${d.error.message}`);
		}
		const errorMsg = d.success === false ? (d.error?.message ?? 'failed') : undefined;
		this.log(`[Session] Tool complete (${this.toolsInFlight} remaining): ${d.toolCallId}`);
		this.broadcast({ type: 'tool_complete', toolCallId: d.toolCallId, content: errorMsg ?? 'success' });
		// Clear CLI input pending when any tool completes (ask_user resolved)
		if (this.cliInputPending) {
			this.cliInputPending = null;
			this.broadcast({ type: 'cli_input_resolved' });
		}
	}

	private onSubagentStarted(data: unknown): void {
		const d = data as { toolCallId: string; agentDisplayName: string };
		this.broadcast({ type: 'tool_update', toolCallId: d.toolCallId, displayLabel: d.agentDisplayName });
	}

	private onSubagentFailed(data: unknown): void {
		const d = data as { toolCallId: string };
		this.broadcast({ type: 'tool_complete', toolCallId: d.toolCallId, content: 'failed' });
	}

	private onToolExecutionPartialResult(data: unknown): void {
		const d = data as { toolCallId?: string; output?: string };
		if (d.output) this.broadcast({ type: 'tool_call', toolCallId: d.toolCallId, content: d.output });
	}

	private onSessionResume(data: unknown): void {
		this.log('[Session] session.resume — connection re-established');
		this.extractAndBroadcastContext(data);
	}

	private onSessionStart(data: unknown): void {
		this.log('[Session] session.start');
		this.extractAndBroadcastContext(data);
	}

	private onSessionContextChanged(data: unknown): void {
		const d = data as { cwd?: string; gitRoot?: string; repository?: string; branch?: string };
		this.log(`[Session] session.context_changed: ${d.cwd ?? '(no cwd)'}`);
		if (d.cwd) {
			this.broadcast({ type: 'session_context_updated', sessionId: this.session.sessionId, context: d });
		}
	}

	/** Extract context from session.start or session.resume event data and broadcast to clients. */
	private extractAndBroadcastContext(data: unknown): void {
		const d = data as { context?: { cwd?: string; gitRoot?: string; repository?: string; branch?: string } };
		if (d.context?.cwd) {
			this.broadcast({ type: 'session_context_updated', sessionId: this.session.sessionId, context: d.context });
		}
	}

	private onSessionError(data: unknown): void {
		const d = data as { statusCode?: number; message?: string };
		this.log(`[Session] Error: ${d.message ?? JSON.stringify(d)}`);
		this.isTurnActive = false;
		this.isPortalTurn = false;
		this.activeUserMessage = '';
		this.activeDeltaBuffer = '';
		this.activeReasoningBuffer = '';

		// Show a friendlier message for tool corruption errors
		if (d.message?.includes('tool_use') && d.message?.includes('tool_result')) {
			this.broadcast({ type: 'error', content: 'Session history is corrupted (orphaned tool events). Restart the server to auto-repair, or create a new session.' });
			return;
		}

		this.broadcast({ type: 'error', content: d.message ?? 'Unknown error' });
	}

	/** Repair orphaned tools and reconnect the session so the fix takes effect. */
	private async repairAndReconnect(): Promise<void> {
		try {
			await this.repairOrphanedToolsDirect(this.sessionId);
			// Reconnect so the SDK reloads the patched event log
			if (this.reconnectFn) {
				this.isReconnecting = true;
				const gen = ++this.sessionGeneration;
				const newSession = await this.reconnectFn(this.sessionId, this.currentModel ?? undefined);
				if (gen !== this.sessionGeneration) return; // stale
				this.session = newSession;
				this.isReconnecting = false;
				this.attachListeners();
				this.log('[Session] Auto-repair complete — session reconnected');
				this.broadcast({ type: 'info', content: 'Session repaired — try again' });
			}
		} catch (e) {
			this.log(`[Session] Auto-repair failed: ${e}`);
			this.broadcast({ type: 'error', content: 'Session has corrupted history. Try creating a new session.' });
		}
	}

	/** Static repair: scan events.jsonl and fix orphaned tool starts. Usable from both SessionHandle and SessionPool. */
	private async repairOrphanedToolsDirect(sessionId: string): Promise<number> {
		const eventsPath = path.join(os.homedir(), '.copilot', 'session-state', sessionId, 'events.jsonl');
		if (!fs.existsSync(eventsPath)) return 0;

		const content = fs.readFileSync(eventsPath, 'utf8');
		const lines = content.split('\n').filter(l => l.trim());

		// First pass: find all starts and completions
		const starts = new Map<string, { lineIndex: number; parentId: string; timestamp: string }>();
		const completions = new Map<string, number[]>(); // toolCallId → line indices

		for (let i = 0; i < lines.length; i++) {
			try {
				const event = JSON.parse(lines[i]) as { type: string; data?: { toolCallId?: string }; id?: string; timestamp?: string };
				const toolCallId = event.data?.toolCallId;
				if (!toolCallId) continue;
				if (event.type === 'tool.execution_start') {
					starts.set(toolCallId, { lineIndex: i, parentId: event.id ?? '', timestamp: event.timestamp ?? new Date().toISOString() });
				} else if (event.type === 'tool.execution_complete') {
					if (!completions.has(toolCallId)) completions.set(toolCallId, []);
					completions.get(toolCallId)!.push(i);
				}
			} catch { /* skip */ }
		}

		// Find problems:
		// 1. Orphaned starts (no completion)
		const orphanedStarts = [...starts.entries()].filter(([id]) => !completions.has(id));
		// 2. Orphaned completions (no start)
		const orphanedCompletionLines = new Set<number>();
		for (const [tcid, indices] of completions) {
			if (!starts.has(tcid)) indices.forEach(i => orphanedCompletionLines.add(i));
		}
		// 3. Duplicate completions (keep first, remove rest)
		for (const [, indices] of completions) {
			if (indices.length > 1) indices.slice(1).forEach(i => orphanedCompletionLines.add(i));
		}

		if (orphanedStarts.length === 0 && orphanedCompletionLines.size === 0) return 0;

		this.log(`[Session] Repairing: ${orphanedStarts.length} orphaned start(s), ${orphanedCompletionLines.size} orphaned/duplicate completion(s)`);

		// Build new lines: remove bad completions, inject completions for orphaned starts
		const insertions = new Map<number, string>();
		for (const [toolCallId, { lineIndex, parentId, timestamp }] of orphanedStarts) {
			insertions.set(lineIndex, JSON.stringify({
				type: 'tool.execution_complete',
				data: { toolCallId, success: false, result: { content: 'Error: Server was interrupted during execution' } },
				id: crypto.randomUUID(),
				timestamp,
				parentId,
			}));
		}

		const newLines: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			if (orphanedCompletionLines.has(i)) continue; // skip bad completions
			newLines.push(lines[i]);
			if (insertions.has(i)) newLines.push(insertions.get(i)!);
		}

		fs.writeFileSync(eventsPath, newLines.join('\n') + '\n');
		const totalFixed = orphanedStarts.length + orphanedCompletionLines.size;
		this.log(`[Session] Repaired ${totalFixed} event(s) (inline)`);
		return totalFixed;
	}

	private onSessionTruncation(data: unknown): void {
		const d = data as { messagesRemovedDuringTruncation?: number; tokensRemovedDuringTruncation?: number };
		const msgs = d.messagesRemovedDuringTruncation ?? 0;
		const tokens = d.tokensRemovedDuringTruncation ?? 0;
		this.log(`[Session] Truncation: ${msgs} messages, ${tokens} tokens removed`);
		this.broadcast({ type: 'warning', content: `Context truncated — ${msgs} older messages removed to stay within token limits` });
	}

	private onSessionCompactionStart(): void {
		this.log(`[Session] Compaction starting…`);
		this.broadcast({ type: 'info', content: 'Compacting context — summarizing older conversation…' });
	}

	private onSessionCompactionComplete(data: unknown): void {
		const d = data as { postCompactionTokens?: number; compactionTokensUsed?: { output?: number }; success?: boolean; messagesRemoved?: number; checkpointNumber?: number };
		this.tokensSinceCompaction = d.postCompactionTokens ?? d.compactionTokensUsed?.output ?? 0;
		this.log(`[Session] Compaction complete — token baseline: ${this.tokensSinceCompaction}`);
		if (d.success !== false) {
			const parts = ['Context compacted'];
			if (d.checkpointNumber != null) parts.push(`checkpoint #${d.checkpointNumber}`);
			if (d.messagesRemoved) parts.push(`${d.messagesRemoved} messages summarized`);
			this.broadcast({ type: 'info', content: parts.join(' — ') });
		}
	}

	private onSessionSnapshotRewind(data: unknown): void {
		const d = data as { eventsRemoved?: number };
		const count = d.eventsRemoved ?? 0;
		this.log(`[Session] Snapshot rewind: ${count} events removed`);
		this.broadcast({ type: 'warning', content: `Session rewound to checkpoint — ${count} events removed` });
	}

	private onSessionIdle(): void {
		this.isTurnActive = false;
		if (this.turnProbeTimer) { clearTimeout(this.turnProbeTimer); this.turnProbeTimer = null; }
		this.activeDeltaBuffer = '';
		this.activeReasoningBuffer = '';
		// Clear any lingering CLI approval/input banners
		if (this.cliApprovalSummary) {
			this.cliApprovalSummary = null;
			this.broadcast({ type: 'cli_approval_resolved' });
		}
		if (this.cliInputPending) {
			this.cliInputPending = null;
			this.broadcast({ type: 'cli_input_resolved' });
		}
		if (this.toolsInFlight > 0) {
			this.log(`[Event] session.idle with ${this.toolsInFlight} tools still in flight — resetting counter`);
			this.toolsInFlight = 0;
		}
		this.activeUserMessage = '';
		this.broadcast({ type: 'idle' });
		if (this.isPortalTurn) {
			// Portal turn: client already has all content from the delta stream.
			// Just advance the sync cursor so polls don't re-broadcast these messages.
			this.isPortalTurn = false;
			void this.advanceSyncCount();
		} else {
			void this.syncMessages();
		}
		// Re-seed modTime so the turn's messages don't trigger a spurious CLI reconnect
		if (this.getModTimeFn) {
			this.getModTimeFn().then(t => { if (t) this.lastKnownModTime = t; }).catch(() => {});
		}
		// Check if title changed after the turn completed
		void this.titleChangedCallback?.();
	}

	/** Extract a CLI approval description from permission event data. */
	private static describePermission(data: unknown): string {
		const d = data as {
			kind?: string; fullCommandText?: string; intention?: string;
			path?: string; url?: string; toolName?: string; subject?: string;
		};
		const desc = d.fullCommandText ?? d.path ?? d.url ?? d.intention ?? d.subject ?? d.toolName ?? d.kind ?? 'tool';
		const kind = d.kind ?? 'tool';
		return `${kind}: ${desc}`;
	}

	private onPermissionRequested(data: unknown): void {
		// CLI turn waiting for tool approval — portal can't approve, but inform the user
		if (!this.isPortalTurn) {
			this.cliApprovalSummary = SessionHandle.describePermission(data);
			this.log(`[Session] CLI waiting for approval: ${this.cliApprovalSummary}`);
			this.broadcast({ type: 'cli_approval_pending', content: this.cliApprovalSummary });
		}
	}

	private onUserInputRequested(data: unknown): void {
		// CLI turn waiting for user input — portal can't respond, but inform the user
		if (!this.isPortalTurn) {
			const d = data as { question?: string };
			this.cliInputPending = d?.question ?? 'User input needed';
			this.log(`[Session] CLI waiting for input: ${this.cliInputPending}`);
			this.broadcast({ type: 'cli_input_pending', content: this.cliInputPending });
		}
	}

	private onUserInputCompleted(): void {
		if (this.cliInputPending) {
			this.cliInputPending = null;
			this.broadcast({ type: 'cli_input_resolved' });
		}
	}

	/** Scan message history for unresolved permission.requested or ask_user tool calls.
	 *  Called after reconnect / initial connect to catch prompts the live listener missed. */
	private detectPendingCliApproval(msgs: Array<{type: string; data?: unknown}>): void {
		if (this.isPortalTurn) return;
		// Reset pending state — scan will re-set if still pending
		const prevInput = this.cliInputPending;
		const prevApproval = this.cliApprovalSummary;
		this.cliInputPending = null;
		this.cliApprovalSummary = null;
		// Scan backwards for unresolved permission.requested or ask_user tool without completion
		const openToolStarts = new Set<string>(); // toolCallIds seen as completed (scanning backwards)
		for (let i = msgs.length - 1; i >= 0; i--) {
			const m = msgs[i];
			// Stop at session.idle — anything before that is resolved
			if (m.type === 'session.idle') break;
			// Track tool completions (scanning backwards, so we see completions before starts)
			if (m.type === 'tool.execution_complete') {
				const d = m.data as { toolCallId?: string } | undefined;
				if (d?.toolCallId) openToolStarts.add(d.toolCallId);
			}
			// Check for unresolved ask_user tool
			if (m.type === 'tool.execution_start') {
				const d = m.data as { toolCallId?: string; toolName?: string; arguments?: unknown } | undefined;
				if (d?.toolName === 'ask_user' && d?.toolCallId && !openToolStarts.has(d.toolCallId)) {
					if (!this.cliInputPending) {
						const args = (d.arguments ?? {}) as { question?: string };
						this.cliInputPending = args.question ?? 'User input needed';
						this.log(`[Sync] Detected pending ask_user tool from history: ${this.cliInputPending}`);
					}
				}
				if (d?.toolCallId) openToolStarts.delete(d.toolCallId);
			}
			// Check for unresolved permission.requested
			if (m.type === 'permission.completed') break;
			if (m.type === 'permission.requested' && !this.cliApprovalSummary) {
				this.cliApprovalSummary = SessionHandle.describePermission(m.data);
				this.log(`[Sync] Detected pending CLI approval from history: ${this.cliApprovalSummary}`);
			}
		}
		// Broadcast state changes
		if (this.cliInputPending && this.cliInputPending !== prevInput) {
			this.broadcast({ type: 'cli_input_pending', content: this.cliInputPending });
		} else if (!this.cliInputPending && prevInput) {
			this.broadcast({ type: 'cli_input_resolved' });
		}
		if (this.cliApprovalSummary && this.cliApprovalSummary !== prevApproval) {
			this.broadcast({ type: 'cli_approval_pending', content: this.cliApprovalSummary });
		} else if (!this.cliApprovalSummary && prevApproval) {
			this.broadcast({ type: 'cli_approval_resolved' });
		}
	}

	private onPermissionCompleted(data: unknown): void {
		this.log(`[Session] Permission completed: ${JSON.stringify(data).slice(0, 200)}`);
		// Clear CLI approval banner (set by permission.requested, or used as a dismissal signal)
		if (this.cliApprovalSummary) {
			this.cliApprovalSummary = null;
			this.broadcast({ type: 'cli_approval_resolved' });
		} else if (!this.isPortalTurn && this.pendingCompletionCount === 0) {
			// CLI turn: tool was just approved at the terminal — dismiss any hint the client is showing
			this.broadcast({ type: 'cli_approval_resolved' });
		}
		if (this.pendingCompletionCount > 0) {
			// This completion is for an approval already resolved by the portal (or timed out).
			// activeApprovalId has already advanced to the next queued approval — don't touch it.
			this.pendingCompletionCount--;
			this.log(`[Session] permission.completed for portal-resolved approval (${this.pendingCompletionCount} remaining)`);
		} else {
			// External resolution (e.g. CLI client) — clear the active approval now.
			if (this.activeApprovalId && this.pendingApprovals.has(this.activeApprovalId)) {
				const p = this.pendingApprovals.get(this.activeApprovalId)!;
				clearTimeout(p.timeout);
				this.pendingApprovals.delete(this.activeApprovalId);
				this.broadcast({ type: 'approval_resolved', requestId: this.activeApprovalId });
				this.log(`[Session] Cleared portal approval ${this.activeApprovalId} (resolved externally)`);
			}
			this.activeApprovalId = null;
			this.broadcastNextApproval();
		}
	}

	private onSessionWarning(data: unknown): void {
		const d = data as { message?: string };
		const msg = d.message ?? JSON.stringify(d);
		this.log(`[Session] Warning: ${msg}`);
		this.broadcast({ type: 'warning', content: msg });
	}

	private onSessionInfo(data: unknown): void {
		const d = data as { message?: string };
		const msg = d.message ?? JSON.stringify(d);
		this.log(`[Session] Info: ${msg}`);
		this.broadcast({ type: 'info', content: msg });
	}

	private onModelChange(data: unknown): void {
		const d = data as { modelId?: string };
		if (d.modelId) {
			this.currentModel = d.modelId;
			this.log(`[Session] Model changed: ${d.modelId}`);
			this.broadcast({ type: 'model_changed', content: d.modelId });
		}
	}

	private onAssistantUsage(data: unknown): void {
		const d = data as {
			inputTokens?: number; outputTokens?: number; cacheReadTokens?: number;
			cacheWriteTokens?: number; reasoningTokens?: number; cost?: number;
			quotaSnapshots?: Record<string, { isUnlimitedEntitlement?: boolean; entitlementRequests: number; usedRequests: number; remainingPercentage: number; resetDate?: string }>;
		};
		this.sessionUsage.inputTokens += d.inputTokens ?? 0;
		this.sessionUsage.outputTokens += d.outputTokens ?? 0;
		this.sessionUsage.cacheReadTokens += d.cacheReadTokens ?? 0;
		this.sessionUsage.cacheWriteTokens += d.cacheWriteTokens ?? 0;
		this.sessionUsage.reasoningTokens += d.reasoningTokens ?? 0;
		this.sessionUsage.requests += d.cost ?? 1;
		this.broadcast({
			type: 'session_usage',
			usage: { ...this.sessionUsage },
			quota: d.quotaSnapshots,
		});
	}

	private onSubagentCompleted(data: unknown): void {
		const d = data as { name?: string; toolCallId?: string };
		this.log(`[Session] Subagent completed: ${d.name ?? 'unknown'}`);
		this.broadcast({ type: 'tool_complete', toolCallId: d.toolCallId ?? '', content: `Subagent ${d.name ?? 'task'} completed` });
	}

	private onAssistantTurnEnd(): void {
		// assistant.turn_end fires between tool rounds — NOT a definitive session end.
		// Only session.idle signals the entire conversation turn is done.
		// Log it for observability but do NOT clear turn state.
		this.log('[Session] assistant.turn_end (informational — waiting for session.idle)');
	}

	// --- Event dispatch ---

	/** Maps SDK event types to handler methods. */
	private readonly eventHandlers: Record<string, (data: unknown, gen: number) => void> = {
		'assistant.turn_start':             (d, gen) => this.onAssistantTurnStart(d, gen),
		'user.message':                     (d) => this.onUserMessage(d),
		'assistant.intent':                 (d) => this.onAssistantIntent(d),
		'session.title_changed':            (d) => this.onSessionTitleChanged(d),
		'assistant.reasoning_delta':        (d) => this.onAssistantReasoningDelta(d),
		'assistant.message_delta':          (d) => this.onAssistantMessageDelta(d),
		'assistant.message':                (d) => this.onAssistantMessage(d),
		'tool.execution_start':             (d) => this.onToolExecutionStart(d),
		'tool.execution_complete':          (d) => this.onToolExecutionComplete(d),
		'subagent.started':                 (d) => this.onSubagentStarted(d),
		'subagent.failed':                  (d) => this.onSubagentFailed(d),
		'tool.execution_partial_result':    (d) => this.onToolExecutionPartialResult(d),
		'session.resume':                   (d) => this.onSessionResume(d),
		'session.start':                    (d) => this.onSessionStart(d),
		'session.context_changed':          (d) => this.onSessionContextChanged(d),
		'session.error':                    (d) => this.onSessionError(d),
		'session.truncation':               (d) => this.onSessionTruncation(d),
		'session.compaction_start':         ()  => this.onSessionCompactionStart(),
		'session.compaction_complete':      (d) => this.onSessionCompactionComplete(d),
		'session.snapshot_rewind':          (d) => this.onSessionSnapshotRewind(d),
		'session.idle':                     () => this.onSessionIdle(),
		'permission.requested':             (d) => this.onPermissionRequested(d),
		'permission.completed':             (d) => this.onPermissionCompleted(d),
		'user_input.requested':             (d) => this.onUserInputRequested(d),
		'user_input.completed':             () => this.onUserInputCompleted(),
		'session.warning':                  (d) => this.onSessionWarning(d),
		'session.info':                     (d) => this.onSessionInfo(d),
		'session.model_change':             (d) => this.onModelChange(d),
		'subagent.completed':               (d) => this.onSubagentCompleted(d),
		'assistant.turn_end':               () => this.onAssistantTurnEnd(),
		'assistant.usage':                  (d) => this.onAssistantUsage(d),
	};

	private attachListeners(): void {
		const gen = this.sessionGeneration;
		this.deltasSent = false;
		this.toolsInFlight = 0;
		this.session.on((event) => {
			if (this.sessionGeneration !== gen) return;
			// Suppress noisy delta/streaming events from log
			const quiet = event.type === 'assistant.message_delta' || event.type === 'assistant.streaming_delta'
				|| event.type === 'assistant.reasoning_delta' || event.type === 'assistant.usage'
				|| event.type === 'pending_messages.modified';
			if (!quiet) this.log(`[Event] ${event.type}`);
			const handler = this.eventHandlers[event.type];
			if (handler) handler(event.data, gen);
		});
	}
}

/** Manages multiple CopilotSession instances under a single CopilotClient (one auth). */
export class SessionPool {
	private client: CopilotClient;
	onTitleChanged?: (sessionId: string, summary: string | undefined) => void;
	private pool = new Map<string, SessionHandle>();
	private connecting = new Map<string, Promise<SessionHandle>>();
	private log: (msg: string) => void;
	readonly rulesStore: RulesStore;
	private workspacePath: string;
	/** True when connected to an external CLI server (--ui-server mode) */
	readonly shared: boolean;
	private cliUrl?: string;

	constructor(log: (msg: string) => void, rulesStore: RulesStore, workspacePath: string, cliUrl?: string) {
		this.log = log;
		this.shared = !!cliUrl;
		this.cliUrl = cliUrl;
		this.client = cliUrl ? new CopilotClient({ cliUrl }) : new CopilotClient();
		this.rulesStore = rulesStore;
		this.workspacePath = workspacePath;
	}

	async start(): Promise<void> {
		this.log(`[Pool] ${this.shared ? 'Connecting to CLI server...' : 'Starting Copilot client...'}`);
		try {
			await this.client.start();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			if (/auth|token|login|credential|unauthorized/i.test(msg)) {
				this.log(`\n❌ Authentication failed. Please run:\n\n   npx copilot login\n\nThen restart the server.\n`);
			}
			throw e;
		}
		const auth = await this.client.getAuthStatus();
		if (!auth.isAuthenticated) {
			this.log(`\n❌ Not authenticated. Please run:\n\n   npx copilot login\n\nThen restart the server.\n`);
			throw new Error('Not authenticated — run "npx copilot login" first');
		}
		this.log(`[Pool] Authenticated as: ${auth.login ?? 'unknown'}`);
	}

	async stop(): Promise<void> {
		for (const handle of this.pool.values()) await handle.disconnect();
		this.pool.clear();
		await this.client.stop();
	}

	/** Returns session IDs that currently have an active turn (agent is working). */
	getActiveTurnSessions(): string[] {
		return [...this.pool.entries()].filter(([, h]) => h.turnActive).map(([id]) => id);
	}

	async listSessions(): Promise<SessionMetadata[]> {
		const sessions = await this.client.listSessions();
		return sessions.sort((a, b) =>
			new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
		);
	}

	async getStatus() { return this.client.getStatus(); }
	async getAuthStatus() { return this.client.getAuthStatus(); }
	async listModels() { return this.client.listModels(); }
	async getQuota() { return this.client.rpc.account.getQuota(); }

	async getLastSessionId(): Promise<string | null> {
		// In shared mode, prefer the CLI's foreground session
		if (this.shared) {
			try {
				const fg = await this.client.getForegroundSessionId();
				if (fg) return fg;
			} catch { /* fall through to default */ }
		}
		return this.client.getLastSessionId();
	}

	/** Returns the cached handle without connecting (null if not in pool). */
	getHandle(sessionId: string): SessionHandle | null {
		return this.pool.get(sessionId) ?? null;
	}

	/** Returns handle from pool, or connects to the session and caches it. Concurrent calls for the same sessionId share a single in-flight promise. */
	async connect(sessionId: string): Promise<SessionHandle> {
		if (this.pool.has(sessionId)) {
			this.log(`[Pool] Reusing: ${sessionId.slice(0, 8)}`);
			return this.pool.get(sessionId)!;
		}
		if (this.connecting.has(sessionId)) {
			this.log(`[Pool] Joining in-flight connect: ${sessionId.slice(0, 8)}`);
			return this.connecting.get(sessionId)!;
		}
		const p = this._doConnectWithRetry(sessionId);
		this.connecting.set(sessionId, p);
		try {
			return await p;
		} finally {
			this.connecting.delete(sessionId);
		}
	}

	/** Try to connect; if the SDK connection is dead, restart it and retry once. */
	private async _doConnectWithRetry(sessionId: string): Promise<SessionHandle> {
		try {
			return await this._doConnect(sessionId);
		} catch (e) {
			const msg = String(e);
			if (msg.includes('Connection is closed') || msg.includes('not connected') || msg.includes('Server port not available')) {
				this.log(`[Pool] SDK connection lost — restarting client...`);
				try {
					await this.client.stop().catch(() => {});
					// If in shared mode, wait for the CLI server port before reconnecting
					if (this.shared) {
						this.log(`[Pool] Waiting for CLI server on port 3848...`);
						const ready = await this.waitForPort(3848, 15000);
						if (!ready) throw new Error('CLI server not available after 15s');
						this.log(`[Pool] CLI server detected — reconnecting SDK...`);
					}
					// Create a fresh client (stop() may leave the old one in a bad state)
					this.client = this.cliUrl
						? new CopilotClient({ cliUrl: this.cliUrl })
						: new CopilotClient();
					await this.client.start();
					this.log(`[Pool] SDK client restarted`);
					return await this._doConnect(sessionId);
				} catch (retryErr) {
					this.log(`[Pool] Reconnect failed: ${retryErr}`);
					throw retryErr;
				}
			}
			throw e;
		}
	}

	/** Wait for a TCP port to accept connections */
	private waitForPort(port: number, timeoutMs: number): Promise<boolean> {
		return new Promise((resolve) => {
			const start = Date.now();
			const check = () => {
				const sock = net.createConnection({ port, host: 'localhost' }, () => {
					sock.destroy();
					resolve(true);
				});
				sock.on('error', () => {
					if (Date.now() - start > timeoutMs) { resolve(false); return; }
					setTimeout(check, 500);
				});
				sock.setTimeout(1000, () => { sock.destroy(); });
			};
			check();
		});
	}

	/**
	 * Scan the session's events.jsonl for tool.execution_start events that never
	 * got a matching tool.execution_complete. If found, inject a synthetic
	 * completion event so the API doesn't reject the conversation history.
	 * This can happen when the server is killed mid-tool-execution.
	 */
	private async repairOrphanedTools(sessionId: string): Promise<void> {
		try {
			const eventsPath = path.join(os.homedir(), '.copilot', 'session-state', sessionId, 'events.jsonl');
			if (!fs.existsSync(eventsPath)) return;

			const content = fs.readFileSync(eventsPath, 'utf8');
			const lines = content.split('\n').filter(l => l.trim());

			const starts = new Map<string, { lineIndex: number; parentId: string; timestamp: string }>();
			const completions = new Map<string, number[]>();

			for (let i = 0; i < lines.length; i++) {
				try {
					const event = JSON.parse(lines[i]) as { type: string; data?: { toolCallId?: string }; id?: string; timestamp?: string };
					const toolCallId = event.data?.toolCallId;
					if (!toolCallId) continue;
					if (event.type === 'tool.execution_start') {
						starts.set(toolCallId, { lineIndex: i, parentId: event.id ?? '', timestamp: event.timestamp ?? new Date().toISOString() });
					} else if (event.type === 'tool.execution_complete') {
						if (!completions.has(toolCallId)) completions.set(toolCallId, []);
						completions.get(toolCallId)!.push(i);
					}
				} catch { /* skip */ }
			}

			// Orphaned starts, orphaned completions, duplicate completions
			const orphanedStarts = [...starts.entries()].filter(([id]) => !completions.has(id));
			const removeLines = new Set<number>();
			for (const [tcid, indices] of completions) {
				if (!starts.has(tcid)) indices.forEach(i => removeLines.add(i));
				if (indices.length > 1) indices.slice(1).forEach(i => removeLines.add(i));
			}

			if (orphanedStarts.length === 0 && removeLines.size === 0) return;
			this.log(`[Pool] Repairing ${orphanedStarts.length} orphaned start(s), ${removeLines.size} orphaned/duplicate completion(s) in session ${sessionId.slice(0, 8)}`);

			const insertions = new Map<number, string>();
			for (const [toolCallId, { lineIndex, parentId, timestamp }] of orphanedStarts) {
				insertions.set(lineIndex, JSON.stringify({
					type: 'tool.execution_complete',
					data: { toolCallId, success: false, result: { content: 'Error: Server was interrupted during execution' } },
					id: crypto.randomUUID(),
					timestamp,
					parentId,
				}));
			}

			const newLines: string[] = [];
			for (let i = 0; i < lines.length; i++) {
				if (removeLines.has(i)) continue;
				newLines.push(lines[i]);
				if (insertions.has(i)) newLines.push(insertions.get(i)!);
			}

			fs.writeFileSync(eventsPath, newLines.join('\n') + '\n');
			this.log(`[Pool] Repaired ${orphanedStarts.length + removeLines.size} event(s) (inline)`);
		} catch (e) {
			this.log(`[Pool] Tool repair failed (non-fatal): ${e}`);
		}
	}

	private async _doConnect(sessionId: string): Promise<SessionHandle> {
		this.log(`[Pool] Connecting: ${sessionId.slice(0, 8)}...`);
		// Repair any orphaned tool_use events before the SDK loads the session
		await this.repairOrphanedTools(sessionId);
		let handle!: SessionHandle;
		const session = await this.client.resumeSession(sessionId, {
			onPermissionRequest: (req) => handle.handlePermissionRequest(req),
			onUserInputRequest: (req) => handle.handleUserInputRequest(req),
		});
		handle = new SessionHandle(
			session,
			this.log,
			(id, model) => this.client.resumeSession(id, {
				model: model ?? handle.currentModel ?? undefined,
				onPermissionRequest: (req) => handle.handlePermissionRequest(req),
				onUserInputRequest: (req) => handle.handleUserInputRequest(req),
			}),
			async () => {
				const sessions = await this.client.listSessions();
				const meta = sessions.find(s => s.sessionId === sessionId);
				// Piggyback: if summary changed since last check, broadcast it now
				if (meta?.summary !== handle.lastKnownSummary) {
					handle.lastKnownSummary = meta?.summary;
					if (handle.lastKnownSummary !== undefined) {
						this.log(`[TitleChanged] session=${sessionId.slice(0,8)} summary=${handle.lastKnownSummary}`);
						this.onTitleChanged?.(sessionId, handle.lastKnownSummary);
					}
				}
				return meta?.modifiedTime ? new Date(meta.modifiedTime) : null;
			},
			this.rulesStore,
		);
		handle.sharedMode = this.shared;
		this.pool.set(sessionId, handle);
		// Seed the model so reconnects use the same model as the CLI.
		// Without this, resumeSession() would default to the CLI's current default model
		// (not necessarily what the session was configured with).
		session.rpc.model.getCurrent().then(r => {
			if (r.modelId) {
				handle.currentModel = r.modelId;
				this.log(`[Pool] Session ${sessionId.slice(0, 8)} model: ${r.modelId}`);
			}
		}).catch(() => {});
		handle.titleChangedCallback = async (title) => {
			if (title) {
				this.log(`[TitleChanged] session=${sessionId.slice(0,8)} summary=${title}`);
				handle.lastKnownSummary = title;
				this.onTitleChanged?.(sessionId, title);
			} else {
				// No title from event (e.g. session.idle check) — fetch from SDK
				try {
					const sessions = await this.client.listSessions();
					const meta = sessions.find(s => s.sessionId === sessionId);
					if (meta?.summary && meta.summary !== handle.lastKnownSummary) {
						handle.lastKnownSummary = meta.summary;
						this.log(`[TitleChanged] session=${sessionId.slice(0,8)} summary=${meta.summary} (fetched)`);
						this.onTitleChanged?.(sessionId, meta.summary);
					}
				} catch {}
			}
		};
		// Check for pending CLI approvals before the first client receives getActiveTurnEvents()
		await handle.checkInitialState();
		return handle;
	}

	/** Creates a new session and adds it to the pool. */
	async create(opts?: { workingDirectory?: string }): Promise<SessionHandle> {
		this.log('[Pool] Creating new session...');
		let handle!: SessionHandle;
		const session = await this.client.createSession({
			workingDirectory: opts?.workingDirectory ?? this.workspacePath,
			onPermissionRequest: (req) => handle.handlePermissionRequest(req),
			onUserInputRequest: (req) => handle.handleUserInputRequest(req),
		});
		handle = new SessionHandle(session, this.log, undefined, undefined, this.rulesStore);
		handle.sharedMode = this.shared;
		this.pool.set(session.sessionId, handle);
		handle.titleChangedCallback = async (title) => {
			if (title) {
				handle.lastKnownSummary = title;
				this.onTitleChanged?.(session.sessionId, title);
			} else {
				try {
					const sessions = await this.client.listSessions();
					const meta = sessions.find(s => s.sessionId === session.sessionId);
					if (meta?.summary && meta.summary !== handle.lastKnownSummary) {
						handle.lastKnownSummary = meta.summary;
						this.onTitleChanged?.(session.sessionId, meta.summary);
					}
				} catch {}
			}
		};
		this.log(`[Pool] Created: ${session.sessionId.slice(0, 8)}`);
		return handle;
	}

	async evict(sessionId: string): Promise<void> {
		const handle = this.pool.get(sessionId);
		if (handle) {
			await handle.disconnect();
			this.pool.delete(sessionId);
		}
	}

	/** Disconnect a session and reconnect with a new working directory. */
	async reconnectWithCwd(sessionId: string, workingDirectory: string): Promise<SessionHandle> {
		this.log(`[Pool] Reconnecting ${sessionId.slice(0, 8)} with cwd: ${workingDirectory}`);
		// Capture state from the old handle before evicting
		const oldHandle = this.pool.get(sessionId);
		const previousAgent = oldHandle?.currentAgent ?? null;
		const previousModel = oldHandle?.currentModel ?? null;
		await this.evict(sessionId);
		// Reconnect — resumeSession accepts workingDirectory
		let handle!: SessionHandle;
		const session = await this.client.resumeSession(sessionId, {
			workingDirectory,
			onPermissionRequest: (req) => handle.handlePermissionRequest(req),
			onUserInputRequest: (req) => handle.handleUserInputRequest(req),
		});
		handle = new SessionHandle(
			session,
			this.log,
			(id, model) => this.client.resumeSession(id, {
				model: model ?? handle.currentModel ?? undefined,
				workingDirectory,
				onPermissionRequest: (req) => handle.handlePermissionRequest(req),
				onUserInputRequest: (req) => handle.handleUserInputRequest(req),
			}),
			async () => {
				const sessions = await this.client.listSessions();
				const meta = sessions.find(s => s.sessionId === sessionId);
				return meta ? new Date(meta.modifiedTime) : null;
			},
			this.rulesStore,
		);
		handle.sharedMode = this.shared;
		this.pool.set(sessionId, handle);
		// Seed model so reconnects preserve the session's model
		session.rpc.model.getCurrent().then(r => {
			if (r.modelId) {
				handle.currentModel = r.modelId;
				this.log(`[Pool] Session ${sessionId.slice(0, 8)} model: ${r.modelId}`);
			}
		}).catch(() => {
			// Fall back to the model from the previous handle
			if (previousModel) handle.currentModel = previousModel;
		});
		// Restore agent if one was selected before CWD change
		if (previousAgent) {
			handle.currentAgent = previousAgent;
			session.rpc.agent.select({ name: previousAgent }).catch(() => {});
		}
		// Wire up title-change callback (same as _doConnect)
		handle.titleChangedCallback = async (title) => {
			if (title) {
				this.log(`[TitleChanged] session=${sessionId.slice(0,8)} summary=${title}`);
				handle.lastKnownSummary = title;
				this.onTitleChanged?.(sessionId, title);
			} else {
				try {
					const sessions = await this.client.listSessions();
					const meta = sessions.find(s => s.sessionId === sessionId);
					if (meta?.summary && meta.summary !== handle.lastKnownSummary) {
						handle.lastKnownSummary = meta.summary;
						this.log(`[TitleChanged] session=${sessionId.slice(0,8)} summary=${meta.summary} (fetched)`);
						this.onTitleChanged?.(sessionId, meta.summary);
					}
				} catch {}
			}
		};
		this.log(`[Pool] Reconnected ${sessionId.slice(0, 8)} with cwd: ${workingDirectory}`);
		return handle;
	}

	async deleteSession(sessionId: string): Promise<void> {
		await this.evict(sessionId);
		await this.client.deleteSession(sessionId);
		this.rulesStore.removeSession(sessionId);
		this.log(`[Pool] Deleted: ${sessionId.slice(0, 8)}`);
	}
}
