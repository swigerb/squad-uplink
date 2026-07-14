import { CopilotClient, approveAll } from '@github/copilot-sdk';
import { cliNodeOptions } from './cli-env.js';
import type { CopilotSession } from '@github/copilot-sdk';
import type {
	SessionMetadata,
	PermissionRequest,
	PermissionRequestResult,
} from '@github/copilot-sdk';

export interface PortalSessionContext {
	cwd?: string;
	workingDirectory?: string;
	gitRoot?: string;
	repository?: string;
	branch?: string;
}

interface UserInputRequest {
	requestId?: string;
	question?: string;
	message?: string;
	choices?: string[];
	allowFreeform?: boolean;
	freeform?: boolean;
}

interface UserInputResponse {
	answer: string;
	wasFreeform: boolean;
	response?: string;
	kind?: string;
}

// SDK compatibility: getMessages() → getEvents() in copilot-sdk 1.0+
let _sessionApiLogged = false;
function getSessionEvents(session: CopilotSession, log?: (msg: string) => void): Promise<any[]> {
	const useNew = typeof (session as any).getEvents === 'function';
	if (!_sessionApiLogged) {
		_sessionApiLogged = true;
		log?.(`[SDK] Using ${useNew ? 'getEvents()' : 'getMessages()'} API`);
	}
	return useNew ? (session as any).getEvents() : (session as any).getMessages();
}

// SDK connection modes:
//   - Default: new CopilotClient() spawns/owns its own CLI (desktop zip).
//   - Connected: new CopilotClient({ cliUrl }) attaches to an already-running CLI
//     server (used in the container, where the CLI runs as a sibling process, and
//     by the smoke-test harness). Verified working on the pinned SDK (1.0.6).
//     The `as any` cast is retained because `cliUrl` isn't in the public typings.
function createClient(cliUrl?: string, log?: (msg: string) => void): CopilotClient {
	if (cliUrl) {
		log?.(`[SDK] Creating client with cliUrl: ${cliUrl}`);
		return new CopilotClient({ cliUrl } as any);
	}
	// Standalone: the SDK spawns and OWNS the CLI subprocess, inheriting our env.
	// Raise its V8 heap via NODE_OPTIONS so resuming a very large session doesn't
	// OOM-crash the CLI (see cli-env.ts). The launcher/relaunch spawn points set
	// this on their own child env; here the SDK does the spawning, so we set it on
	// process.env for the child to inherit. Idempotent (won't stack flags), and it
	// does not change THIS (already-running) process's heap — only children's.
	process.env.NODE_OPTIONS = cliNodeOptions();
	return new CopilotClient();
}
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as net from 'node:net';

/**
 * True if `id` is a safe session/store identifier — no path separators, no `..`
 * traversal, no NUL. Copilot CLI session IDs are generated UUIDs (hex + dashes),
 * which match this. Anything else is rejected before it is interpolated into a
 * filesystem path (events.jsonl repair, rules store, etc.).
 */
export function isSafeSessionId(id: string | null | undefined): id is string {
	return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[A-Za-z0-9_-]+$/.test(id);
}

/**
 * Thrown by SessionPool.start() when the Copilot CLI is reachable/launchable but
 * has no valid GitHub credentials. The server catches this to enter a non-fatal
 * "needs-auth" state (show a sign-in screen) instead of crash-looping.
 */
export class NotAuthenticatedError extends Error {
	constructor(message = 'Copilot is not signed in') {
		super(message);
		this.name = 'NotAuthenticatedError';
	}
}
import { RulesStore } from './rules.js';
import type { ApprovalRule } from './rules.js';

// Derive the correct approval/deny response format from the SDK's own approveAll handler.
// This stays compatible across SDK versions (0.2.x='approved', 0.3.x='approve-once').
const SDK_APPROVE = approveAll({ kind: 'shell' } as PermissionRequest, { sessionId: '' }) as PermissionRequestResult;
// The SDK maps 'reject' → 'denied-interactively-by-user' internally
const SDK_DENY = ((SDK_APPROVE as { kind: string }).kind === 'approve-once'
	? { kind: 'reject' }
	: { kind: 'denied-interactively-by-user' }) as PermissionRequestResult;

export type { SessionMetadata };
export type { ApprovalRule };

// Defensively reverse a double-encoded ask_user payload. When an upstream layer
// JSON-encodes the tool arguments one time too many, real characters arrive as their
// literal escape *text*: a newline shows up as "\n", a tab as "\t", an arrow as
// "\u2192", and — importantly — a genuine path backslash as "\\". A font issue would
// render tofu, never the literal escape, so seeing "\n"/"\u2192" means the string
// really does contain those ASCII chars.
//
// We only decode when the payload is clearly still encoded: it has NO real newline/CR
// yet DOES contain literal escape sequences. (A correctly-parsed multi-line prompt has
// real newlines, so the gate leaves it untouched.) In that state we reverse exactly one
// JSON string-escape layer in a single left-to-right pass. Handling "\\" in the same
// pass means a doubled path backslash ("C:\\node") collapses back to one ("C:\node")
// instead of its "\n" being misread as a newline.
//
// Fixing it at this single ingestion seam covers the live prompt, the choices, the
// rebroadcast, the choice echoed back as the answer, and the replayed history at once.
//
// Edge: a single-line question that is *only* a bare Windows path with no real newline
// (e.g. "Open C:\node?") is byte-identical to buggy prose ("line1\nline2"), so it would
// be mis-decoded. That's unavoidable ambiguity; since ask_user questions are almost
// always prose, we favor decoding.
function decodeUnicodeEscapes(s: string): string {
	if (typeof s !== 'string' || s.indexOf('\\') === -1) return s;
	const hasRealNewline = s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1;
	const hasEscapeText = /\\(u[0-9a-fA-F]{4}|[nrtbf"\\/])/.test(s);
	if (hasRealNewline || !hasEscapeText) {
		// Already-normal text — only mop up stray \uXXXX escapes just in case.
		return s.indexOf('\\u') === -1 ? s : s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
	}
	return s.replace(/\\(u[0-9a-fA-F]{4}|[nrtbf"\\/])/g, (m, esc: string) => {
		switch (esc[0]) {
			case 'u': return String.fromCharCode(parseInt(esc.slice(1), 16));
			case 'n': return '\n';
			case 'r': return '\r';
			case 't': return '\t';
			case 'b': return '\b';
			case 'f': return '\f';
			case '"': return '"';
			case '\\': return '\\';
			case '/': return '/';
			default: return m;
		}
	});
}
function decodeUnicodeEscapesArr(arr: string[] | undefined): string[] | undefined {
	return arr?.map(decodeUnicodeEscapes);
}

export interface PortalInfo {
	version: string;
	login: string;
	models: Array<{ id: string; name: string }>;
	cliConnected?: boolean;
	defaultCwd?: string;
	lanUrl?: string;
}

export interface PortalEvent {
	type: 'delta' | 'idle' | 'message_end' | 'error' | 'approval_request' | 'approval_resolved' | 'input_request' | 'tool_call' | 'tool_start' | 'tool_complete' | 'tool_update' | 'intent' | 'session_switched' | 'session_not_found' | 'session_renamed' | 'thinking' | 'reasoning_delta' | 'sync' | 'model_changed' | 'rules_list' | 'history_meta' | 'history_user' | 'history_image' | 'cli_approval_pending' | 'cli_approval_resolved' | 'cli_input_pending' | 'cli_input_resolved' | 'turn_stopping' | 'history_start' | 'history_end' | 'session_context_updated' | 'session_created' | 'session_deleted' | 'session_shield_changed' | 'approve_all_changed' | 'warning' | 'info' | 'session_usage' | 'context_usage' | 'cli_status';
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
	context?: PortalSessionContext | null;
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
	images?: string[]; // data: URIs for image attachments (history replay)
	imageTool?: { toolName: string; display: string; completed: boolean }; // for history_image: the tool that produced it
	turnActive?: boolean; // on history_end: authoritative "is a portal turn running right now" so the client can sync its thinking state instead of inferring it from a replayed thinking/idle pair
	questionChoices?: string[];
	toolCallIds?: string[];
	usage?: unknown;
	quota?: unknown;
}

/** Subset of the SDK's ToolExecutionCompleteResult we read for inline media. */
interface ToolResultShape {
	contents?: Array<{ type?: string; data?: string; mimeType?: string }>;
	binaryResultsForLlm?: Array<{ type?: string; assetId?: string; data?: string; mimeType?: string; byteLength?: number }>;
}

type PendingApproval = {	resolve: (r: PermissionRequestResult) => void;
	reject: (e: Error) => void;
	event: PortalEvent;
	req: PermissionRequest;
	timeout: ReturnType<typeof setTimeout>;
};

type PendingInput = {
	// Callback path (owned/non-shared sessions): the SDK is awaiting this promise.
	resolve?: (r: UserInputResponse) => void;
	reject?: (e: Error) => void;
	event: PortalEvent;
	timeout?: ReturnType<typeof setTimeout>;
	// Event/RPC path (shared sessions): resolve via session.rpc.ui.handlePendingUserInput.
	viaRpc?: boolean;
	sdkRequestId?: string;
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
	/** The custom agent currently selected — re-applied after reconnect since SDK doesn't persist it. */
	currentAgent: string | null = null;
	private getModTimeFn: (() => Promise<Date | null>) | null = null;
	private lastKnownModTime: Date | null = null;
	private rulesStore: RulesStore | null = null;

	// Active turn state — replayed to newly joining clients
	private isTurnActive = false;
	private isPortalTurn = false; // true when the current turn was initiated from the portal
	private wasPortalTurn = false; // sticky flag — stays true until final idle, survives intermediate idles
	private activeDeltaBuffer = '';
	private activeReasoningBuffer = '';
	private activeUserMessage = ''; // current in-flight user message (CLI or portal)
	private activeUserMessageTs = 0; // commit timestamp of the in-flight user message, so a mid-turn resync replays its bubble at the ORIGINAL position (not "now")
	private cliApprovalSummary: string | null = null;// set when CLI turn is waiting for tool approval
	private cliInputPending: string | null = null; // set when CLI turn is waiting for user input
	private mcpToolCounts: Record<string, number> = {}; // cached tool counts per MCP server
	private loadedSkills: Array<{ name: string; description: string; source: string; enabled: boolean; userInvocable: boolean; path?: string }> = [];
	private turnProbeTimer: ReturnType<typeof setTimeout> | null = null;
	private turnStartTime: number = 0; // ms timestamp when current turn started
	// Proactive compaction: track estimated tokens since last compaction.
	// When estimated total approaches the context limit, compact before the next portal send.
	private tokensSinceCompaction = 0;
	private static readonly COMPACT_TOKEN_THRESHOLD = 120_000; // ~80% of 150k context window
	// Inline tool-result images (e.g. an MCP `view_image` tool). Caps guard against
	// pathologically large or numerous payloads being pushed over the WS.
	private static readonly MAX_TOOL_IMAGES = 8;
	private static readonly MAX_TOOL_IMAGE_B64 = 12_000_000; // ~9 MB decoded per image
	private static readonly MAX_ASSET_CACHE = 64; // FIFO cap on the per-session binary-asset cache
	// Content-addressed binary assets (session.binary_asset) keyed by assetId. Tools emit
	// the bytes here once (before the referencing tool.execution_complete), so we cache them
	// and resolve `binaryResultsForLlm[].assetId` back to a renderable `data:` URI on complete.
	// This is the GENERIC path: it covers built-in tools (e.g. `view` on an image) AND MCP
	// tools, live AND history — not tied to any one MCP. Keyed by mimeType so it extends to
	// audio/other media later.
	private assetCache = new Map<string, { src: string; mimeType: string; byteLength: number }>();
	lastKnownSummary: string | undefined = undefined; // tracked by getModTimeFn to detect /rename
	knownCwd: string | undefined = undefined; // cwd known at create/resume time, before SDK metadata catches up
	private lastIntent = ''; // last report_intent text seen, to log report cadence + detect repeats

	// Accumulated session usage stats — broadcast on each assistant.usage event
	private sessionUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, requests: 0 };

	/** Get accumulated session usage stats for initial sync. */
	getSessionUsage() { return this.sessionUsage.requests > 0 ? { ...this.sessionUsage } : null; }

	// Per-connection tool tracking — reset on each attachListeners() call
	private deltasSent = false;
	private toolsInFlight = 0;
	/** When true, this session is shared with a CLI TUI — don't respond to non-portal approvals */
	sharedMode = false;

	constructor(
		session: CopilotSession,
		log: (msg: string) => void,
		reconnectFn?: (id: string, model?: string) => Promise<CopilotSession>,
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
			const msgs = await getSessionEvents(this.session, this.log);
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
			const msgs = await getSessionEvents(this.session, this.log);
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
				// Pending inputs (ask_user) survive client disconnects: the SessionHandle
				// stays in the pool, and the runtime waits indefinitely for an answer.
				// A reconnecting (or secondary) client gets them replayed via
				// getPendingInputEvents(), so we never reject them here.
				for (const [, p] of this.pendingApprovals) clearTimeout(p.timeout);
				for (const [, p] of this.pendingInputs) { if (p.timeout) clearTimeout(p.timeout); }
				if (!this.isTurnActive) {
					this.denyAllPending();
				}
		}
	}

	get listenerCount(): number { return this.listeners.size; }
	get turnActive(): boolean { return this.isTurnActive; }

	/**
	 * True when a PORTAL-initiated turn is running right now — i.e. exactly when
	 * getActiveTurnEvents() re-arms the client's thinking dot. The client syncs
	 * its thinking state to this at history_end so a completion `idle` swallowed
	 * by the history-replay window can't strand the spinner. A CLI turn keeps
	 * this false (its events don't drive the portal thinking dot).
	 */
	get portalTurnActive(): boolean { return this.isTurnActive && this.isPortalTurn; }

	/** Events to send to a newly joining client to catch up on an in-progress PORTAL turn. */
	getActiveTurnEvents(): PortalEvent[] {
		if (!this.isTurnActive || !this.isPortalTurn) return [];
		const events: PortalEvent[] = [];
		if (this.activeUserMessage) events.push({ type: 'sync', role: 'user', content: this.activeUserMessage, timestamp: this.activeUserMessageTs || undefined });
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
		const events = await getSessionEvents(this.session, this.log);
		this.log(`[History] ${events.length} events: ${events.map((e: { type: string }) => e.type).join(', ').slice(0, 200)}`);
		return SessionHandle.buildHistoryEvents(events, limit, this.isTurnActive);
	}

	/**
	 * Pure transform from raw SDK session events to the PortalEvent history stream.
	 * Extracted as a static, side-effect-free function so it can be unit-tested offline
	 * against a real events.jsonl without a live SDK connection.
	 */
	static buildHistoryEvents(events: Array<{ type: string; data?: unknown }>, limit: number | undefined, isTurnActive: boolean): PortalEvent[] {
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
		const roundPerMsgTools: Array<Array<{ toolName: string; display: string; completed: boolean; toolCallId?: string }>> = []; // per-message tools
		const askUserToolIds = new Set<string>();
		const askUserChoices = new Map<string, string[]>();
		const askUserQuestions = new Map<string, string>();
		let pendingAskUserAnswers: Array<{ question: string; content: string; choices?: string[]; timestamp?: number }> = [];
		let currentMsgTools: Array<{ toolName: string; display: string; completed: boolean; toolCallId?: string }> = [];
		// Pre-scan: map content-addressed assetId -> data: URI for renderable images. The
		// bytes live in `session.binary_asset` events (persisted to events.jsonl); each
		// referencing tool.execution_complete points at them via binaryResultsForLlm[].assetId.
		// This is what lets tool images survive a refresh/resume — they are NOT inlined on the
		// persisted tool.execution_complete. Generic across built-in tools and MCP servers.
		const assetMap = new Map<string, string>();
		for (const e of slicedEvents) {
			if (e.type !== 'session.binary_asset') continue;
			const a = (e as { data?: { assetId?: string; mimeType?: string; data?: string } }).data;
			if (!a?.assetId || typeof a.data !== 'string' || a.data.length === 0) continue;
			const mime = a.mimeType || '';
			if (!/^image\//.test(mime)) continue; // audio/* seam: extend here + a renderer
			if (a.data.length > SessionHandle.MAX_TOOL_IMAGE_B64) continue;
			assetMap.set(a.assetId, `data:${mime};base64,${a.data}`);
		}
		// Images produced by tools in the current round, emitted as standalone image
		// messages at round flush (positioned after the assistant turn that produced them).
		// Carry the tool-completion timestamp so the FE (which sorts messages by timestamp)
		// places them at the right point in the timeline instead of defaulting to now().
		const roundImages: Array<{ src: string; ts?: number; tool?: { toolName: string; display: string; completed: boolean } }> = [];
		// toolCallIds whose result produced a renderable image, plus each tool's summary.
		// The image is emitted as its own bubble carrying its producing tool as a caption,
		// so that tool is excluded from the round's collapsed "N tools ran" summary.
		const imageToolIds = new Set<string>();
		const toolMeta = new Map<string, { toolName: string; display: string; completed: boolean }>();

		const flushRound = (allIntermediate = false) => {
			// Collect all tools in this round so the final message gets the summary
			const allRoundTools: Array<{ toolName: string; display: string; completed: boolean }> = [];
			for (let i = 0; i < roundMsgs.length; i++) {
				const msgToolsRaw = roundPerMsgTools[i] ?? [];
				// Drop ask_user (not a user-facing "tool") and image-producing tools (those
				// are shown as a caption on their own image bubble, not in the pill). Strip
				// the internal toolCallId so the emitted summary matches the wire shape.
				const msgTools = msgToolsRaw
					.filter(t => t.toolName !== 'ask_user' && !(t.toolCallId && imageToolIds.has(t.toolCallId)))
					.map(({ toolName, display, completed }) => ({ toolName, display, completed }));
				allRoundTools.push(...msgTools);
			}

			for (let i = 0; i < roundMsgs.length; i++) {
				const content = roundMsgs[i];
				const isLast = i === roundMsgs.length - 1;
				const followedByAskUser = roundFollowingTools[i] === 'ask_user';
				const hasToolRequests = roundFollowingTools[i] === '_has_tool_requests' || (roundFollowingTools[i] !== null && roundFollowingTools[i] !== 'ask_user');
				const intermediate = followedByAskUser ? false : (allIntermediate || hasToolRequests);

				// Attach all tools to the final message in the round (matches live behavior)
				const toolSummary = isLast && allRoundTools.length > 0 ? [...allRoundTools] : undefined;

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
			// Emit any tool-produced images for this round as standalone image messages,
			// positioned after the assistant turn that called the tool (mirrors live behavior).
			for (const img of roundImages) {
				result.push({ type: 'history_image', images: [img.src], timestamp: img.ts, imageTool: img.tool });
			}
			roundImages.length = 0;
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
				const content = (raw.data as { content?: string })?.content ?? '';
				// Skip skill-context injections — internal system messages recorded as user.message
				if (content.startsWith('<skill-context')) continue;
				// Save last message's tools before flushing
				if (roundMsgs.length > 0) {
					roundPerMsgTools[roundMsgs.length - 1] = currentMsgTools;
					currentMsgTools = [];
				}
				flushRound();
				result.push({ type: 'history_user', content: (raw.data as { content?: string })?.content ?? '', timestamp: ts,
					images: ((raw.data as { attachments?: Array<{ type: string; data: string; mimeType?: string }> })?.attachments ?? [])
						.filter(a => a.type === 'blob' && a.data)
						.map(a => `data:${a.mimeType ?? 'image/png'};base64,${a.data}`),
				});
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
						askUserChoices.set(toolCallId, decodeUnicodeEscapesArr(a.choices) ?? []);
						askUserQuestions.set(toolCallId, decodeUnicodeEscapes(a.question ?? ''));
					} catch { /* ignore */ }
				}
				if (toolName !== 'report_intent') {
					const tcId = (raw.data as { toolCallId?: string })?.toolCallId;
					const item = SessionHandle.parseToolEvent(raw.data);
					currentMsgTools.push({ ...item, toolCallId: tcId });
					if (tcId) toolMeta.set(tcId, item);
				}
			} else if (e.type === 'tool.execution_complete') {
				const d = raw.data as { toolCallId?: string; result?: { content?: string; binaryResultsForLlm?: Array<{ assetId?: string }> } };
				if (d.toolCallId && askUserToolIds.has(d.toolCallId)) {
					const answer = d.result?.content ?? '';
					const choices = askUserChoices.get(d.toolCallId);
					const question = askUserQuestions.get(d.toolCallId) ?? '';
					if (answer) pendingAskUserAnswers.push({ question, content: answer, choices, timestamp: ts });
					askUserToolIds.delete(d.toolCallId);
					askUserChoices.delete(d.toolCallId);
					askUserQuestions.delete(d.toolCallId);
				}
				// Resolve any content-addressed images this tool produced (built-in or MCP).
				const br = d.result?.binaryResultsForLlm;
				if (Array.isArray(br)) {
					for (const b of br) {
						const src = b?.assetId ? assetMap.get(b.assetId) : undefined;
						if (src && roundImages.length < SessionHandle.MAX_TOOL_IMAGES) {
							// Pair the image with the tool that produced it and mark that tool
							// as image-producing so flushRound omits it from the round's pill.
							if (d.toolCallId) imageToolIds.add(d.toolCallId);
							const tool = d.toolCallId ? toolMeta.get(d.toolCallId) : undefined;
							roundImages.push({ src, ts, tool });
						}
					}
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
		flushRound(isTurnActive);
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
			const allEvents = await getSessionEvents(this.session, this.log);
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
					if (content && !content.startsWith('<skill-context')) {
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
			const msgs = await getSessionEvents(this.session, this.log);
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
			this.restoreAgent();
			const msgs = await getSessionEvents(this.session, this.log);
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
		} catch (e) {
			this.log(`[Sync] CLI reconnect error: ${e}`);
		} finally {
			this.isReconnecting = false;
		}
	}

	async send(prompt: string, attachments?: Array<{ type: 'blob'; data: string; mimeType: string; displayName?: string }>): Promise<void> {
		// Mark turn active immediately so pollForChanges() won't reconnect when
		// user.message fires and changes modifiedTime.
		this.isTurnActive = true;
		this.isPortalTurn = true;
		this.wasPortalTurn = true;
		this.activeUserMessage = prompt;
		this.activeUserMessageTs = Date.now();
		const attachCount = attachments?.length ?? 0;
		this.log(`[${this.sessionId.slice(0, 8)}] Sending prompt (${prompt.length} chars${attachCount ? `, ${attachCount} attachment(s)` : ''}), ~${this.tokensSinceCompaction} tokens since last compaction`);

		// Proactively compact if we're approaching the context limit
		if (this.tokensSinceCompaction >= SessionHandle.COMPACT_TOKEN_THRESHOLD) {
			this.log('[Session] Proactively compacting context before send...');
			this.broadcast({ type: 'thinking', content: 'Compacting context…' });
			try {
				await this.session.rpc.history.compact();
				this.log('[Session] Proactive compaction complete');
				// tokensSinceCompaction will be reset by the session.compaction_complete event
			} catch (e) {
				this.log(`[Session] Proactive compaction failed: ${e} — proceeding anyway`);
			}
		}

		try {
			await this.session.send({ prompt, attachments });
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
					this.restoreAgent();
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
					await this.session.rpc.history.compact();
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
		// Mirror the CLI's onUserAbort: clear Copilot's pending queue BEFORE aborting so
		// any enqueued-but-unprocessed messages don't fire a brand-new turn after Stop.
		// abort() only cancels the in-flight turn; it does not drain the queue.
		try {
			await this.session.rpc.queue.clear();
		} catch (e) {
			this.log(`[Session] queue.clear on abort failed: ${e}`);
		}
		await this.session.abort();
	}

	async setModel(model: string): Promise<void> {
		await this.session.setModel(model);
		// SDK fires session.model_change → onModelChange handles broadcast
		this.currentModel = model;
	}

	/** Set an explicit, user-chosen session name (sticky — the CLI's auto-summary won't overwrite it). */
	async setName(name: string): Promise<void> {
		await this.session.rpc.name.set({ name });
		// Fire the title-changed callback so the pool broadcasts session_renamed.
		// The callback sets lastKnownSummary and calls onTitleChanged.
		void this.titleChangedCallback?.(name);
	}

	async disconnect(): Promise<void> {
		await this.session.disconnect().catch(() => {});
	}

	// Agent management
	async listAgents(): Promise<Array<{ name: string; displayName: string; description: string }>> {
		const result = await this.session.rpc.agent.list();
		return result.agents;
	}
	async getCurrentAgent(): Promise<{ name: string; displayName: string; description: string } | null> {
		const result = await this.session.rpc.agent.getCurrent();
		return result.agent ?? null;
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

	// MCP management (session-scoped RPCs)
	async listMcpServers(): Promise<Array<{ name: string; status: string; source?: string }>> {
		const result = await this.session.rpc.mcp.list();
		return result.servers ?? [];
	}
	async listSkills(): Promise<Array<{ name: string; description: string; source: string; enabled: boolean; userInvocable: boolean; path?: string }>> {
		const result = await this.session.rpc.skills.list();
		const skills = (result.skills ?? []).map((s: any) => ({
			name: s.name, description: s.description ?? '', source: s.source ?? 'unknown',
			enabled: s.enabled ?? true, userInvocable: s.userInvocable ?? false, path: s.path,
		}));
		if (skills.length > 0) this.loadedSkills = skills;
		return skills;
	}
	async mcpOAuthLogin(serverName: string): Promise<{ authorizationUrl?: string }> {
		return await this.session.rpc.mcp.oauth.login({ serverName });
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
			// viaRpc inputs belong to the runtime (shared session) and survive until
			// answered or the runtime fires user_input.completed — don't cancel them.
			if (p.viaRpc) continue;
			this.log(`[Session] Auto-cancelling input ${id}`);
			if (p.timeout) clearTimeout(p.timeout);
			this.pendingInputs.delete(id);
			p.reject?.(new Error('No clients connected'));
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
		if (p.timeout) clearTimeout(p.timeout);
		this.pendingInputs.delete(requestId);
		if (p.viaRpc && p.sdkRequestId) {
			// Shared session: resolve the runtime's pending request directly.
			// The runtime fans a user_input.completed event out to all clients.
			this.log(`[Session] Resolving input via RPC (${p.sdkRequestId}): "${answer.slice(0, 40)}"`);
			void this.session.rpc.ui.handlePendingUserInput({
				requestId: p.sdkRequestId,
				response: { answer, wasFreeform },
			}).then((r: { success?: boolean }) => {
				if (r && r.success === false) this.log('[Session] Input was already resolved by another client');
			}).catch((e: unknown) => this.log(`[Session] handlePendingUserInput failed: ${e}`));
		} else if (p.resolve) {
			p.resolve({ answer, wasFreeform });
			this.log(`[Session] Input answered: "${answer.slice(0, 40)}"`);
		}
		// Carry the answer + original question/choices so OTHER clients can render the
		// Q&A in their timeline (the originating client already rendered it optimistically).
		this.broadcast({ type: 'approval_resolved', requestId, content: answer, inputRequest: p.event.inputRequest });
	}

	private activeApprovalId: string | null = null;

	private broadcastNextApproval(): void {
		if (this.activeApprovalId) return;
		for (const [id, p] of this.pendingApprovals) {
			this.activeApprovalId = id;
			this.log(`[Session] Broadcasting next queued approval: ${id}`);
			this.broadcast(p.event);
			break;
		}
	}

	handlePermissionRequest(req: PermissionRequest): Promise<PermissionRequestResult> {
		const requestId = `approval-${++this.counter}`;
		this.log(`[Session] Permission request: ${JSON.stringify(req).slice(0, 200)}`);

		// approveAll mode — instant approval, no UI, regardless of who started the turn
		if (this.getApproveAll()) {
			this.log(`[Session] Auto-approved (approveAll): ${requestId}`);
			return Promise.resolve(SDK_APPROVE);
		}

		// Connected to CLI server: don't respond to CLI-initiated approvals — let the CLI handle them
		if (this.sharedMode && !this.isPortalTurn) {
			this.log(`[Session] Deferring approval to CLI: ${requestId}`);
			return new Promise(() => {}); // never resolves — CLI TUI will handle it
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
		const question = req.question ?? req.message ?? 'User input requested';
		this.log(`[Session] Input request (callback): "${question.slice(0, 80)}"`);

		// Shared session: the runtime routes ask_user as a targeted RPC to the
		// session-owning connection (the CLI), so this callback usually won't fire.
		// If it does, defer — the user_input.requested event path (onUserInputRequested)
		// shows the interactive prompt and resolves via session.rpc.ui.handlePendingUserInput.
		if (this.sharedMode) {
			this.log(`[Session] Deferring input to event/RPC path: ${requestId}`);
			return new Promise(() => {}); // never resolves — event path handles it
		}

		// Owned session: this callback is the only signal. Show the interactive prompt
		// and await the user's answer indefinitely (no timeout — Copilot waits patiently,
		// matching CLI behavior; a reconnecting client gets the prompt replayed).
		const event: PortalEvent = {
			type: 'input_request',
			requestId,
			inputRequest: { requestId, question: decodeUnicodeEscapes(question), choices: decodeUnicodeEscapesArr(req.choices), allowFreeform: req.allowFreeform ?? req.freeform },
		};
		this.broadcast(event);
		return new Promise((resolve, reject) => {
			this.pendingInputs.set(requestId, { resolve, reject, event });
		});
	}

	private scheduleTurnProbe(gen: number, intervalMs = 45 * 1000): void {
		if (this.turnProbeTimer) clearTimeout(this.turnProbeTimer);
		this.turnProbeTimer = setTimeout(async () => {
			this.turnProbeTimer = null;
			if (!this.isTurnActive || this.sessionGeneration !== gen) return;
			this.log('[Session] Probing turn status via getMessages()...');
			try {
				const msgs = await getSessionEvents(this.session, this.log);
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
		if (content && !content.startsWith('<skill-context')) {
			this.activeUserMessage = content;
			this.activeDeltaBuffer = '';
			this.activeReasoningBuffer = '';
			// Pass the commit timestamp so the client can position the bubble at the ACK
			// point (matches the SDK-recorded ordering seen on reload). The SDK event may
			// carry its own timestamp; fall back to now (the moment of commit on our side).
			const sdkTs = (data as { timestamp?: number; createdAt?: number })?.timestamp
				?? (data as { createdAt?: number })?.createdAt;
			const commitTs = typeof sdkTs === 'number' ? sdkTs : Date.now();
			this.activeUserMessageTs = commitTs;
			this.broadcast({ type: 'sync', role: 'user', content, timestamp: commitTs });
		}
	}

	private onAssistantIntent(data: unknown): void {
		const intent = (data as { intent?: string }).intent ?? '';
		// Log every report_intent the SDK delivers so we can see the actual cadence: a
		// "stale" intent line in the UI usually means the agent simply hasn't re-reported
		// (the client holds the last value), NOT that the portal is re-broadcasting it.
		const repeat = intent === this.lastIntent ? ' (repeat)' : '';
		this.log(`[Intent] report_intent${repeat}: ${JSON.stringify(intent)}`);
		this.lastIntent = intent;
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
		const toolCallIds = toolReqs
			.filter((t): t is { name?: string; toolCallId: string; intentionSummary?: string | null } => !!t.toolCallId && t.name !== 'report_intent')
			.map(t => t.toolCallId);
		this.broadcast({
			type: 'message_end',
			intermediate: isIntermediate || undefined,
			toolCallIds: toolCallIds.length > 0 ? toolCallIds : undefined,
		});
		this.deltasSent = false;
		// Clear the reconnect-replay buffers now that this message is committed. message_end
		// is a hard boundary — the client clears its own streamingRef here too. If we DON'T
		// clear these, and the turn then pauses (e.g. on an ask_user tool call) without a
		// turn_end/idle to reset them, a client reconnecting during the pause would have
		// getActiveTurnEvents() re-emit this already-committed text as a live `delta`. The
		// next assistant message's deltas would then concatenate onto that stale buffer,
		// merging two messages into one bubble and misplacing the ask_user Q&A between them
		// (visible only live; a reload rebuilt from committed history looked correct).
		this.activeDeltaBuffer = '';
		this.activeReasoningBuffer = '';
	}

	private onToolExecutionStart(data: unknown): void {
		this.toolsInFlight++;
		const d = data as { toolCallId?: string; toolName?: string; mcpServerName?: string; arguments?: unknown };
		this.log(`[Session] Tool start (${this.toolsInFlight} in flight): ${d.toolName}`);
		const args = (d.arguments ?? {}) as Record<string, unknown>;
		const labelVal = args.command ?? args.path ?? args.query ?? args.script ?? args.url ?? Object.values(args)[0] ?? '';
		const displayLabel = String(labelVal).replace(/\s+/g, ' ').trim().slice(0, 200);
		this.broadcast({ type: 'tool_start', toolCallId: d.toolCallId, toolName: d.toolName, mcpServerName: d.mcpServerName, displayLabel, content: JSON.stringify(args) });
		// ask_user is surfaced as an interactive prompt via onUserInputRequested
		// (the user_input.requested event) + resolved over RPC — no dead-end banner here.
	}

	private onToolExecutionComplete(data: unknown): void {
		this.toolsInFlight = Math.max(0, this.toolsInFlight - 1);
		const d = data as {
			toolCallId?: string;
			success?: boolean;
			error?: { message?: string };
			result?: ToolResultShape;
		};
		this.log(`[Session] Tool complete (${this.toolsInFlight} remaining): ${d.toolCallId}`);
		if (d.success === false && d.error?.message) {
			this.log(`[Session] ⚠ Tool failed: ${d.error.message}`);
		}
		const errorMsg = (d.success === false && d.error?.message) ? d.error.message : undefined;
		// Tool results may carry native image content (e.g. a built-in `view` of an image
		// file, or an MCP `view_image` tool). Resolve them generically: prefer the
		// content-addressed `binaryResultsForLlm[].assetId` (covers built-in + MCP, and is
		// the only shape that survives to events.jsonl), falling back to inline `contents[]`
		// bytes that some MCP tools send live. See resolveToolImages for details.
		const images = this.resolveToolImages(d.result);
		if (images.length > 0) {
			this.log(`[Session] Tool returned ${images.length} image(s): ${d.toolCallId}`);
		}
		this.broadcast({
			type: 'tool_complete',
			toolCallId: d.toolCallId,
			content: errorMsg ?? (d.success === false ? 'done' : 'success'),
			images: images.length > 0 ? images : undefined,
		});
		// Clear CLI input pending when any tool completes (ask_user resolved)
		if (this.cliInputPending) {
			this.cliInputPending = null;
			this.broadcast({ type: 'cli_input_resolved' });
		}
	}

	/**
	 * Cache the bytes of a content-addressed binary asset. The SDK emits one
	 * `session.binary_asset` event carrying the canonical base64 just before the
	 * `tool.execution_complete` that references it by `assetId`. We keep renderable media
	 * (image/* today; audio/* is a ready seam) so the complete handler can resolve it.
	 */
	private onBinaryAsset(data: unknown): void {
		const d = data as { assetId?: string; mimeType?: string; byteLength?: number; data?: string; type?: string };
		if (!d.assetId || typeof d.data !== 'string' || d.data.length === 0) return;
		if (d.data.length > SessionHandle.MAX_TOOL_IMAGE_B64) return;
		const mime = d.mimeType || '';
		// Only cache media we can render inline. Audio is a deliberate seam — the data
		// plumbing already supports it; the FE renderer is the only missing piece.
		if (!/^image\//.test(mime) && !/^audio\//.test(mime)) return;
		this.assetCache.set(d.assetId, {
			src: `data:${mime || 'image/png'};base64,${d.data}`,
			mimeType: mime || 'image/png',
			byteLength: d.byteLength ?? 0,
		});
		// FIFO cap to bound memory across a long session.
		while (this.assetCache.size > SessionHandle.MAX_ASSET_CACHE) {
			const oldest = this.assetCache.keys().next().value;
			if (oldest === undefined) break;
			this.assetCache.delete(oldest);
		}
	}

	/**
	 * Resolve the renderable images for a completed tool result into `data:` URIs.
	 * Order of preference (generic across built-in tools and MCP servers):
	 *   1. `binaryResultsForLlm[].assetId` resolved via the binary-asset cache — the
	 *      content-addressed shape used by built-in tools AND persisted to events.jsonl.
	 *   2. `binaryResultsForLlm[]` inline base64 (defensive; some shapes inline the bytes).
	 *   3. `contents[]` inline image blocks — sent live by some MCP tools (e.g. ComfyUI).
	 * Falls through only when earlier sources yield nothing, so MCP images aren't double-rendered.
	 */
	private resolveToolImages(result: ToolResultShape | undefined): string[] {
		const out: string[] = [];
		const push = (src: string) => {
			if (out.length >= SessionHandle.MAX_TOOL_IMAGES) return;
			if (src.length > SessionHandle.MAX_TOOL_IMAGE_B64) return;
			out.push(src);
		};
		const br = result?.binaryResultsForLlm;
		if (Array.isArray(br)) {
			for (const b of br) {
				if (out.length >= SessionHandle.MAX_TOOL_IMAGES) break;
				const cached = b?.assetId ? this.assetCache.get(b.assetId) : undefined;
				if (cached && /^image\//.test(cached.mimeType)) { push(cached.src); continue; }
				// Defensive: a result that inlines the bytes directly.
				if (b?.type === 'image' && typeof b.data === 'string' && b.data.length > 0) {
					push(`data:${b.mimeType || 'image/png'};base64,${b.data}`);
				}
			}
		}
		if (out.length > 0) return out;
		// Fallback: inline contents[] image blocks (live MCP path).
		const contents = result?.contents;
		if (Array.isArray(contents)) {
			for (const c of contents) {
				if (out.length >= SessionHandle.MAX_TOOL_IMAGES) break;
				if (c?.type === 'image' && typeof c.data === 'string' && c.data.length > 0) {
					push(`data:${c.mimeType || 'image/png'};base64,${c.data}`);
				}
			}
		}
		return out;
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
		const d = data as { cwd?: string; workingDirectory?: string; gitRoot?: string; repository?: string; branch?: string };
		// Normalize: SDK beta.12+ may use workingDirectory instead of cwd
		if (!d.cwd && d.workingDirectory) d.cwd = d.workingDirectory;
		this.log(`[Session] session.context_changed: ${d.cwd ?? '(no cwd)'}`);
		if (d.cwd) {
			this.broadcast({ type: 'session_context_updated', sessionId: this.session.sessionId, context: d });
		}
	}

	/** Extract context from session.start or session.resume event data and broadcast to clients. */
	private extractAndBroadcastContext(data: unknown): void {
		const d = data as { context?: { cwd?: string; workingDirectory?: string; gitRoot?: string; repository?: string; branch?: string } };
		// Normalize: SDK beta.12+ may use workingDirectory instead of cwd
		if (d.context && !d.context.cwd && d.context.workingDirectory) d.context.cwd = d.context.workingDirectory;
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
				this.restoreAgent();
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
		if (!isSafeSessionId(sessionId)) return 0;
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
			this.log(`[Session] [Event] session.idle with ${this.toolsInFlight} tools still in flight — resetting counter`);
			this.toolsInFlight = 0;
		}
		this.activeUserMessage = '';
		this.broadcast({ type: 'idle' });
		if (this.isPortalTurn || this.wasPortalTurn) {
			// Portal turn (or was portal before subagent idles cleared isPortalTurn):
			// client already has all content from the delta stream.
			// Just advance the sync cursor so polls don't re-broadcast these messages.
			this.isPortalTurn = false;
			this.wasPortalTurn = false;
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
		// Shared session: the runtime broadcasts this event to all attached clients
		// (the in-process ask_user RPC went to the CLI). Portal surfaces it as an
		// interactive prompt and answers via session.rpc.ui.handlePendingUserInput,
		// so it works whether the turn was started from the portal or the CLI.
		// Owned sessions use the handleUserInputRequest callback instead.
		if (!this.sharedMode) return;
		const d = data as { requestId?: string; question?: string; choices?: string[]; allowFreeform?: boolean; toolCallId?: string };
		if (!d?.requestId) {
			// Without a requestId we can't resolve via RPC — fall back to an info banner.
			this.cliInputPending = d?.question ?? 'User input needed';
			this.broadcast({ type: 'cli_input_pending', content: this.cliInputPending });
			return;
		}
		// Dedupe: a single ask_user is outstanding at a time.
		if (this.pendingInputs.has(d.requestId)) return;
		this.log(`[Session] Input request (event ${d.requestId}): "${(d.question ?? '').slice(0, 80)}"`);
		// Clear any stale "respond in terminal" banner — we now have an interactive prompt.
		if (this.cliInputPending) { this.cliInputPending = null; this.broadcast({ type: 'cli_input_resolved' }); }
		const event: PortalEvent = {
			type: 'input_request',
			requestId: d.requestId,
			inputRequest: { requestId: d.requestId, question: decodeUnicodeEscapes(d.question ?? 'User input needed'), choices: decodeUnicodeEscapesArr(d.choices), allowFreeform: d.allowFreeform },
		};
		this.pendingInputs.set(d.requestId, { event, viaRpc: true, sdkRequestId: d.requestId });
		this.broadcast(event);
	}

	private onUserInputCompleted(data?: unknown): void {
		// Runtime resolved the ask_user (by any client). Clear our pending input + banner.
		const d = data as { requestId?: string } | undefined;
		if (d?.requestId && this.pendingInputs.has(d.requestId)) {
			this.pendingInputs.delete(d.requestId);
			this.broadcast({ type: 'approval_resolved', requestId: d.requestId });
		} else if (!d?.requestId) {
			// No requestId — clear any outstanding event-sourced inputs defensively.
			for (const [id, p] of this.pendingInputs) {
				if (p.viaRpc) {
					this.pendingInputs.delete(id);
					this.broadcast({ type: 'approval_resolved', requestId: id });
				}
			}
		}
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
					// If we already have an interactive pending input (live event or replay),
					// don't also raise a dead-end banner for the same ask_user.
					if (!this.cliInputPending && this.pendingInputs.size === 0) {
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
		const d = data as { message?: string; infoType?: string };
		const msg = d.message ?? JSON.stringify(d);
		const prefix = d.infoType ? `(${d.infoType}) ` : '';
		this.log(`[Session] Info: ${prefix}${msg}`);
		this.broadcast({ type: 'info', content: `${prefix}${msg}` });
	}

	private onModelChange(data: unknown): void {
		const d = data as { modelId?: string; newModel?: string };
		const model = d.newModel ?? d.modelId;
		if (model) {
			this.currentModel = model;
			this.log(`[Session] Model changed: ${model}`);
			this.broadcast({ type: 'model_changed', model });
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
		this.log('[Session] assistant.turn_end (informational — waiting for session.idle)');
	}

	private onSessionUsageInfo(data: unknown): void {
		const d = data as { tokenLimit?: number; currentTokens?: number; systemTokens?: number; conversationTokens?: number; toolDefinitionsTokens?: number; messagesLength?: number };
		this.broadcast({ type: 'context_usage', content: JSON.stringify(d) });
	}

	private onMcpServersLoaded(data: unknown): void {
		const d = data as { servers?: Array<{ name: string; status: string; source?: string }> };
		if (d?.servers) {
			this.broadcast({ type: 'mcp_servers_loaded' as any, content: JSON.stringify(d.servers) });
		}
	}

	private onMcpServerStatusChanged(data: unknown): void {
		const d = data as { serverName?: string; status?: string };
		if (d?.serverName && d?.status) {
			this.broadcast({ type: 'mcp_server_status_changed' as any, content: JSON.stringify(d) });
		}
	}

	private onSkillsLoaded(data: unknown): void {
		const d = data as { skills?: Array<{ name: string; description: string; source: string; enabled: boolean; userInvocable: boolean; path?: string }> };
		if (d?.skills) {
			this.loadedSkills = d.skills;
			this.log(`[Session] Skills loaded: ${d.skills.length} (${d.skills.filter(s => s.enabled).length} enabled)`);
			this.broadcast({ type: 'skills_loaded' as any, content: JSON.stringify(d.skills) });
		}
	}

	getLoadedSkills(): Array<{ name: string; description: string; source: string; enabled: boolean; userInvocable: boolean; path?: string }> { return this.loadedSkills; }

	private onSkillInvoked(data: unknown): void {
		const d = data as { name?: string; trigger?: string; description?: string; pluginName?: string };
		if (d?.name) {
			this.log(`[Session] Skill invoked: ${d.name} (${d.trigger ?? 'unknown'})`);
			this.broadcast({ type: 'skill_invoked' as any, content: JSON.stringify(d) });
		}
	}

	private onToolsUpdated(data: unknown): void {
		const d = data as { tools?: Array<{ name: string; namespacedName?: string }> };
		if (d?.tools) {
			const counts: Record<string, number> = {};
			for (const t of d.tools) {
				const ns = t.namespacedName?.split(/[-/]/)[0] ?? t.name.split(/[-/]/)[0];
				if (ns) counts[ns] = (counts[ns] ?? 0) + 1;
			}
			this.mcpToolCounts = counts;
			this.broadcast({ type: 'mcp_tool_counts' as any, content: JSON.stringify(counts) });
		}
	}

	getMcpToolCounts(): Record<string, number> { return this.mcpToolCounts; }

	// --- Event dispatch ---

	/** Event types suppressed from the generic [Event] log (handlers still run). High-frequency,
	 *  low-signal chatter that other log lines already bracket. See attachListeners for rationale. */
	private static readonly QUIET_EVENT_TYPES = new Set<string>([
		'assistant.message_delta',
		'assistant.streaming_delta',
		'assistant.reasoning_delta',
		'assistant.tool_call_delta',
		'assistant.usage',
		'pending_messages.modified',
		'tool.execution_partial_result',
		'session.background_tasks_changed',
	]);

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
		'session.binary_asset':             (d) => this.onBinaryAsset(d),
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
		'user_input.completed':             (d) => this.onUserInputCompleted(d),
		'session.warning':                  (d) => this.onSessionWarning(d),
		'session.info':                     (d) => this.onSessionInfo(d),
		'session.model_change':             (d) => this.onModelChange(d),
		'subagent.completed':               (d) => this.onSubagentCompleted(d),
		'assistant.turn_end':               () => this.onAssistantTurnEnd(),
		'assistant.usage':                  (d) => this.onAssistantUsage(d),
		'session.usage_info':               (d) => this.onSessionUsageInfo(d),
		'session.mcp_servers_loaded':       (d) => this.onMcpServersLoaded(d),
		'session.mcp_server_status_changed': (d) => this.onMcpServerStatusChanged(d),
		'session.skills_loaded':            (d) => this.onSkillsLoaded(d),
		'skill.invoked':                    (d) => this.onSkillInvoked(d),
		'session.tools_updated':            (d) => this.onToolsUpdated(d),
	};

	private attachListeners(): void {
		const gen = this.sessionGeneration;
		this.deltasSent = false;
		this.toolsInFlight = 0;
		this.session.on((event) => {
			if (this.sessionGeneration !== gen) return;
			// Suppress high-frequency / low-signal events from the generic [Event] log.
			// These still run their handlers (if any) — we only skip the catch-all log line:
			//  - *_delta / usage / pending_messages.modified: streaming chatter, bracketed by
			//    turn_start/turn_end and committed via assistant.message. assistant.tool_call_delta
			//    streams a tool call's arguments token-by-token (no handler; the finished call is
			//    reconstructed from tool.execution_start/complete), so it's the same low-signal class.
			//  - tool.execution_partial_result: per-chunk streaming output, bracketed by the
			//    tool's execution_start/execution_complete log lines.
			//  - session.background_tasks_changed: the CLI's internal async-task tracker; has
			//    NO handler and fires constantly — pure noise for triage.
			const quiet = SessionHandle.QUIET_EVENT_TYPES.has(event.type);
			if (!quiet) {
				let extra = '';
				if (event.type === 'session.mcp_server_status_changed' && event.data) {
					extra = ` ${(event.data as any).serverName ?? ''} → ${(event.data as any).status ?? JSON.stringify(event.data)}`;
				} else if (event.type === 'session.tools_updated' && event.data) {
					const tools = (event.data as any).tools;
					if (Array.isArray(tools)) extra = ` (${tools.length} tools: ${tools.slice(0, 5).map((t: any) => t.name ?? t).join(', ')}${tools.length > 5 ? '…' : ''})`;
				} else if (event.type === 'session.mcp_servers_loaded' && event.data) {
					extra = ` ${JSON.stringify(event.data)}`;
				}
				this.log(`[Session] [Event] ${event.type}${extra}`);
			}
			const handler = this.eventHandlers[event.type];
			if (handler) handler(event.data, gen);
		});
	}

	/** Replace the underlying SDK session (used after CWD change via disconnect+resume). */
	replaceSession(newSession: CopilotSession): void {
		this.sessionGeneration++;
		this.session = newSession;
		this.attachListeners();
		this.restoreAgent();
	}

	/** Re-select the current agent after a reconnect (SDK doesn't persist agent selection). */
	private restoreAgent(): void {
		if (this.currentAgent) {
			this.session.rpc.agent.select({ name: this.currentAgent }).catch(() => {});
		}
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
	private workspaceRoot: string;
	/** The root under which auto-created per-session YYMMDD-NN workspaces live.
	 *  Exposed so the portal reports the exact same root the allocator uses,
	 *  preventing any drift between the new-session prompt and real folders. */
	get workspaceRootDir(): string { return this.workspaceRoot; }
	/** True when connected to an external CLI server (--ui-server mode) */
	readonly shared: boolean;
	private cliUrl?: string;

	constructor(log: (msg: string) => void, rulesStore: RulesStore, workspaceRoot: string, cliUrl?: string) {
		this.log = log;
		this.shared = !!cliUrl;
		this.cliUrl = cliUrl;
		this.client = createClient(cliUrl, this.log);
		this.rulesStore = rulesStore;
		this.workspaceRoot = workspaceRoot;
	}

	async start(): Promise<void> {
		this.log(`[Pool] ${this.shared ? 'Connecting to CLI server...' : 'Starting Copilot client...'}`);
		try {
			await this.client.start();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			if (/auth|token|login|credential|unauthorized/i.test(msg)) {
				// Surface as a typed, non-fatal auth error — the server shows a
				// sign-in screen instead of letting the process crash-loop.
				throw new NotAuthenticatedError(msg);
			}
			throw e;
		}
		const auth = await this.client.getAuthStatus();
		if (!auth.isAuthenticated) {
			// Not signed in. Surface a typed, non-fatal needs-auth error so the
			// Portal Server keeps the web UI up and drives the browser device-code
			// sign-in (M2) — in BOTH container and desktop modes. There is no TTY
			// here (the CLI runs as a managed subprocess), so an interactive
			// `copilot login` can't work anyway. Users who prefer a terminal can
			// still run `copilot login` manually before starting the portal.
			this.log(`[Pool] Not authenticated — portal will prompt for browser sign-in`);
			throw new NotAuthenticatedError('Copilot is not signed in');
		}
		this.log(`[Pool] Authenticated as: ${auth.login ?? 'unknown'}`);
	}

	async stop(): Promise<void> {
		for (const handle of this.pool.values()) await handle.disconnect();
		this.pool.clear();
		await this.client.stop();
	}

	/** Stop the SDK client, optionally create a fresh instance, and reconnect. */
	async restart(): Promise<void> {
		await this.stop();
		this.client = createClient(this.cliUrl, this.log);
		await this.start();
	}

	/** Returns session IDs that currently have an active turn (agent is working). */
	getActiveTurnSessions(): string[] {
		return [...this.pool.entries()].filter(([, h]) => h.turnActive).map(([id]) => id);
	}

	async getToolCountsPerMcp(): Promise<Record<string, number>> {
		// Tool counts come from session.tools_updated events — not available via RPC
		return {};
	}

	async listSessions(): Promise<SessionMetadata[]> {
		const sessions = await this.client.listSessions();
		// Normalize context: SDK beta.12+ renamed cwd → workingDirectory
		for (const s of sessions) {
			const ctx = s.context as any;
			if (ctx && !ctx.cwd && ctx.workingDirectory) ctx.cwd = ctx.workingDirectory;
		}
		return sessions.sort((a, b) =>
			new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
		);
	}

	async getStatus() { return this.client.getStatus(); }
	async getAuthStatus() { return this.client.getAuthStatus(); }
	async listModels() { return this.client.listModels(); }
	async getQuota() { return this.client.rpc.account.getQuota({}); }
	async addMcpServer(name: string, config: { command: string; args: string[]; tools?: string[]; env?: Record<string, string> }): Promise<void> {
		await this.client.rpc.mcp.config.add({ name, config: { ...config, tools: config.tools ?? ['*'] } });
		this.log(`[Pool] MCP server added: ${name}`);
	}
	async removeMcpServer(name: string): Promise<void> {
		await this.client.rpc.mcp.config.remove({ name });
		this.log(`[Pool] MCP server removed: ${name}`);
	}
	async mcpOAuthLogin(serverName: string, sessionId: string): Promise<{ authorizationUrl?: string }> {
		const handle = this.pool.get(sessionId);
		if (!handle) throw new Error(`No active session ${sessionId} for MCP OAuth`);
		const result = await handle.mcpOAuthLogin(serverName);
		this.log(`[Pool] MCP OAuth login for ${serverName}: ${result.authorizationUrl ? 'browser auth needed' : 'already authenticated'}`);
		return result;
	}
	async listMcpServers(sessionId?: string): Promise<Array<{ name: string; type: string; source: string; enabled: boolean; status: string }>> {
		// Try session-scoped RPC for live status
		let liveServers: Array<{ name: string; status: string; source?: string }> | null = null;
		if (sessionId) {
			const handle = this.pool.get(sessionId);
			if (handle) {
				try {
					liveServers = await handle.listMcpServers();
					this.log(`[Pool] session.mcp.list: ${JSON.stringify(liveServers.map(s => ({ name: s.name, status: s.status })))}`);
				} catch (e) {
					const msg = String(e);
					if (msg.includes('not found')) {
						// Session not fully registered yet — retry after a delay
						this.log(`[Pool] session.mcp.list: session not ready, will retry via events`);
					} else {
						this.log(`[Pool] session.mcp.list failed: ${e}`);
					}
				}
			} else {
				this.log(`[Pool] No session handle for ${sessionId.slice(0, 8)} — using config discovery`);
			}
		}
		// Get source info from config discovery (knows about plugins vs user)
		let discovered: Array<{ name: string; type: string; source: string; enabled: boolean }> = [];
		const configMap = new Map<string, { type: string; url?: string; command?: string }>();
		try {
			// Use mcp.discover for stdio/plugin servers + read config file for HTTP servers
			discovered = await this.discoverMcpServers();
			try {
				const configPath = path.join(os.homedir(), '.copilot', 'mcp-config.json');
				if (fs.existsSync(configPath)) {
					const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
					for (const [name, cfg] of Object.entries(config.mcpServers ?? {})) {
						const c = cfg as any;
						if (!discovered.find(s => s.name === name)) {
							discovered.push({ name, type: c.type ?? 'stdio', source: 'user', enabled: true });
						}
						// Store config details for clone feature
						configMap.set(name, c.type === 'http' ? { type: 'http', url: c.url } : { type: 'stdio', command: [c.command, ...(c.args ?? [])].join(' ') });
					}
				}
			} catch {}
		} catch {}
		const sourceMap = new Map(discovered.map(s => [s.name, s.source]));

		if (liveServers) {
			const result = liveServers.map(s => ({
				name: s.name,
				type: s.source === 'builtin' ? 'builtin' : 'unknown',
				source: s.source ?? sourceMap.get(s.name) ?? 'unknown',
				enabled: s.status === 'connected',
				status: s.status,
				...(configMap.get(s.name) ? { config: configMap.get(s.name) } : {}),
			}));
			for (const d of discovered) {
				if (!result.find(r => r.name === d.name)) {
					result.push({ ...d, status: 'pending', ...(configMap.get(d.name) ? { config: configMap.get(d.name) } : {}) });
				}
			}
			return result;
		}
		return discovered.map(s => ({ ...s, status: s.enabled ? 'connected' : 'pending', ...(configMap.get(s.name) ? { config: configMap.get(s.name) } : {}) }));
	}

	/** Gather MCP server configs from ~/.copilot/mcp-config.json and installed plugins */
	private loadMcpServers(): Record<string, any> {
		const servers: Record<string, any> = {};
		const home = os.homedir();
		// 1. User config
		try {
			const configPath = path.join(home, '.copilot', 'mcp-config.json');
			if (fs.existsSync(configPath)) {
				const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
				if (config.mcpServers) Object.assign(servers, config.mcpServers);
			}
		} catch { /* ignore */ }
		// 2. Installed plugins
		try {
			const pluginsDir = path.join(home, '.copilot', 'installed-plugins');
			if (fs.existsSync(pluginsDir)) {
				for (const marketplace of fs.readdirSync(pluginsDir)) {
					const mDir = path.join(pluginsDir, marketplace);
					if (!fs.statSync(mDir).isDirectory()) continue;
					for (const plugin of fs.readdirSync(mDir)) {
						const mcpFile = path.join(mDir, plugin, '.mcp.json');
						try {
							if (fs.existsSync(mcpFile)) {
								const config = JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
								if (config.mcpServers) Object.assign(servers, config.mcpServers);
							}
						} catch { /* ignore individual plugin errors */ }
					}
				}
			}
		} catch { /* ignore */ }
		if (Object.keys(servers).length > 0) {
			this.log(`[Pool] MCP config: ${Object.keys(servers).join(', ')}`);
		}
		return servers;
	}

	async discoverMcpServers(directory?: string): Promise<Array<{ name: string; type: string; source: string; enabled: boolean }>> {
		try {
			const result = await this.client.rpc.mcp.discover({ workingDirectory: directory ?? process.cwd() });
			return (result.servers ?? []).map(s => ({
				name: s.name,
				type: s.type ?? 'unknown',
				source: s.source ?? 'unknown',
				enabled: s.enabled ?? true,
			}));
		} catch { return []; }
	}
	async listSessionMcpServers(sessionId: string): Promise<Array<{ name: string; type: string; source: string; enabled: boolean }>> {
		// SDK 0.3.0 doesn't expose built-in MCP servers (e.g. github-mcp-server) via session RPC.
		// Fall back to mcp.discover which shows user/project-configured servers.
		return this.discoverMcpServers();
	}

	/** Change the working directory for an active session (disconnect + resume with new CWD). */
	async changeCwd(sessionId: string, newCwd: string): Promise<void> {
		const handle = this.pool.get(sessionId);
		if (!handle) throw new Error(`Session not found in pool: ${sessionId}`);
		this.log(`[Pool] Changing CWD for ${sessionId.slice(0, 8)} to ${newCwd}`);
		const model = handle.currentModel ?? undefined;
		await handle.disconnect();
		const newSession = await this.client.resumeSession(sessionId, {
			workingDirectory: newCwd,
			enableConfigDiscovery: true,
			mcpServers: this.loadMcpServers(),
			model,
			onPermissionRequest: (req: PermissionRequest) => handle.handlePermissionRequest(req),
			onUserInputRequest: (req: UserInputRequest) => handle.handleUserInputRequest(req),
		});
		handle.replaceSession(newSession);
		this.log(`[Pool] CWD changed for ${sessionId.slice(0, 8)}`);
	}

	/** Set an explicit, user-chosen name on a session (connects it if not already in the pool). */
	async setName(sessionId: string, name: string): Promise<void> {
		const handle = await this.connect(sessionId);
		this.log(`[Pool] Renaming ${sessionId.slice(0, 8)} → ${name}`);
		await handle.setName(name);
	}

	async getLastSessionId(): Promise<string | null> {
		// In shared mode, prefer the CLI's foreground session
		if (this.shared) {
			try {
				const fg = await this.client.getForegroundSessionId();
				if (fg) return fg;
			} catch { /* fall through to default */ }
		}
		return (await this.client.getLastSessionId()) ?? null;
	}

	/** Returns the cached handle without connecting (null if not in pool). */
	getHandle(sessionId: string): SessionHandle | null {
		return this.pool.get(sessionId) ?? null;
	}

	/** Returns handle from pool, or connects to the session and caches it. Concurrent calls for the same sessionId share a single in-flight promise. */
	async connect(sessionId: string, evictIfIdle = false): Promise<SessionHandle> {
		if (this.pool.has(sessionId)) {
			const existing = this.pool.get(sessionId)!;
			// Evict idle handles if requested (fresh snapshot with CLI messages)
			if (evictIfIdle && existing.listenerCount === 0 && !existing.turnActive && !existing.isNew) {
				this.log(`[Pool] Evicting idle: ${sessionId.slice(0, 8)}`);
				await existing.disconnect();
				this.pool.delete(sessionId);
			} else {
				// Verify the SDK connection is still alive before reusing
				try {
					await this.client.ping();
					this.log(`[Pool] Reusing: ${sessionId.slice(0, 8)}`);
					return existing;
				} catch {
					this.log(`[Pool] Stale handle for ${sessionId.slice(0, 8)} — evicting and reconnecting`);
					this.pool.delete(sessionId);
				}
			}
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
			if (msg.includes('Connection is closed') || msg.includes('not connected') || msg.includes('Server port not available') || msg.includes('disposed')) {
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
					this.client = createClient(this.cliUrl, this.log);
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
			if (!isSafeSessionId(sessionId)) return;
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
		// Fetch the session's original CWD — resumeSession defaults to process.cwd() if not specified
		const allSessions = await this.client.listSessions();
		const meta = allSessions.find(s => s.sessionId === sessionId);
		const sessionCwd = meta?.context?.workingDirectory;
		const mcpServers = this.loadMcpServers();
		const mcpNames = Object.keys(mcpServers);
		if (mcpNames.length) {
			this.log(`[Pool] Resuming ${sessionId.slice(0, 8)} — connecting ${mcpNames.length} MCP server(s): ${mcpNames.join(', ')}…`);
		}
		let handle!: SessionHandle;
		const session = await this.client.resumeSession(sessionId, {
			workingDirectory: sessionCwd,
			enableConfigDiscovery: true,
			mcpServers,
			onPermissionRequest: (req) => handle.handlePermissionRequest(req),
			onUserInputRequest: (req) => handle.handleUserInputRequest(req),
		});
		handle = new SessionHandle(
			session,
			this.log,
			(id, model) => this.client.resumeSession(id, {
				workingDirectory: sessionCwd,
				enableConfigDiscovery: true,
				mcpServers: this.loadMcpServers(),
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
		handle.knownCwd = sessionCwd ?? undefined;
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
	/**
	 * Allocate a fresh per-session workspace folder named YYMMDD-NN under the
	 * workspace root (e.g. work/250622-01). Scans for today's existing folders and
	 * picks the next free NN. Mirrors the build-variant counter convention.
	 */
	private allocateWorkspace(): string {
		const now = new Date();
		const yy = String(now.getFullYear()).slice(-2);
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const dd = String(now.getDate()).padStart(2, '0');
		const prefix = `${yy}${mm}${dd}`;
		try { fs.mkdirSync(this.workspaceRoot, { recursive: true }); } catch {}
		let max = 0;
		try {
			const re = new RegExp(`^${prefix}-(\\d+)$`);
			for (const name of fs.readdirSync(this.workspaceRoot)) {
				const m = name.match(re);
				if (m) max = Math.max(max, parseInt(m[1], 10));
			}
		} catch {}
		let n = max + 1;
		let dir: string;
		// Guard against any existing folder (e.g. created out-of-band).
		while (true) {
			dir = path.join(this.workspaceRoot, `${prefix}-${String(n).padStart(2, '0')}`);
			if (!fs.existsSync(dir)) break;
			n++;
		}
		fs.mkdirSync(dir, { recursive: true });
		return dir;
	}

	/**
	 * Drop a hidden marker mapping an auto-created workspace folder back to its
	 * session ID, so the folder is identifiable when browsing the filesystem for
	 * manual cleanup. Only written for auto-created workspaces — never into a
	 * user-chosen folder.
	 */
	private writeSessionMarker(dir: string, sessionId: string): void {
		try {
			const body = `# Copilot Portal workspace\n# Auto-created for the session below. Safe to delete once the session is gone.\nsession: ${sessionId}\ncreated: ${new Date().toISOString()}\n`;
			fs.writeFileSync(path.join(dir, '.copilot-session'), body, 'utf8');
		} catch {}
	}

	async create(workingDirectory?: string): Promise<SessionHandle> {
		const autoCreated = !workingDirectory;
		const cwd = workingDirectory || this.allocateWorkspace();
		this.log(`[Pool] Creating new session (cwd: ${cwd}${autoCreated ? ', auto' : ''})...`);
		let handle!: SessionHandle;
		let session;
		try {
			session = await this.client.createSession({
				workingDirectory: cwd,
				enableConfigDiscovery: true,
				mcpServers: this.loadMcpServers(),
				onPermissionRequest: (req) => handle.handlePermissionRequest(req),
				onUserInputRequest: (req) => handle.handleUserInputRequest(req),
			});
		} catch (e) {
			// Don't leave an empty auto-created folder behind if session creation failed.
			if (autoCreated) { try { fs.rmdirSync(cwd); } catch {} }
			throw e;
		}
		if (autoCreated) this.writeSessionMarker(cwd, session.sessionId);
		handle = new SessionHandle(session, this.log, undefined, undefined, this.rulesStore);
		handle.knownCwd = cwd;
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

	async deleteSession(sessionId: string): Promise<void> {
		await this.evict(sessionId);
		await this.client.deleteSession(sessionId);
		this.rulesStore.removeSession(sessionId);
		this.log(`[Pool] Deleted: ${sessionId.slice(0, 8)}`);
	}
}
