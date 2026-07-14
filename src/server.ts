import * as http from 'node:http';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import { exec, execSync, spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionPool } from './session.js';
import { NotAuthenticatedError } from './session.js';
import { isSafeSessionId } from './session.js';
import { RulesStore } from './rules.js';
import { UpdateChecker } from './updater.js';
import { collectVersionInventory, formatVersionInventory } from './versions.js';
import { cliNodeOptions, cliSpawnEnv } from './cli-env.js';
import { SquadReader } from './squad.js';
import type { PortalEvent, PortalInfo, PortalSessionContext } from './session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Container mode. When running inside a Docker image, the in-app self-updater is
 * disabled: updates come from rebuilding/pulling a new image, not from mutating
 * the running container's node_modules. Toggled via the COPILOT_CONTAINER env.
 */
const CONTAINER_MODE = process.env.COPILOT_CONTAINER === '1' || process.env.COPILOT_CONTAINER === 'true';

/**
 * Workspace root — the base directory under which a fresh per-session folder
 * (work/YYMMDD-NN) is created for each new session that doesn't specify its own
 * working directory. Defaults to <appRoot>/work (gitignored); the container
 * overrides this to a mounted path via PORTAL_WORKSPACE_DIR (e.g. /work).
 */
const WORKSPACE_ROOT = process.env.PORTAL_WORKSPACE_DIR
	? path.resolve(process.env.PORTAL_WORKSPACE_DIR)
	: path.join(__dirname, '..', 'work');
const SQUAD_ROOT = process.env.SQUAD_ROOT
	? path.resolve(process.env.SQUAD_ROOT)
	: path.join(__dirname, '..');

export class PortalServer {
	private httpServer: http.Server;
	private wss: WebSocketServer;
	private token: string | null;
	/** True when the token came from the PORTAL_TOKEN env (admin-managed, not web-claimable). */
	private tokenEnvManaged = false;
	/** Extra hostnames (besides IP literals + localhost) permitted in the Host
	 *  header, to defeat DNS-rebinding. Populated from PORTAL_ALLOWED_HOSTS. */
	private allowedHosts = new Set<string>(
		(process.env.PORTAL_ALLOWED_HOSTS ?? '')
			.split(',').map(h => h.trim().toLowerCase()).filter(Boolean),
	);
	private pool: SessionPool;
	private webuiPath: string;
	private debugDir: string;
	private dataDir: string;
	private clientCounter = 0;
	private logStream: fs.WriteStream | null = null;
	private portalInfo: PortalInfo | null = null;
	/** Lifecycle of the CLI/auth connection, surfaced to the UI and /healthz. */
	private authState: 'starting' | 'ok' | 'needs-auth' | 'error' = 'starting';
	private authMessage: string | null = null;
	/** Resolvers waiting for authState to leave the transient 'starting' state. */
	private authSettleWaiters: Array<() => void> = [];
	/** Active `copilot login` device-flow child + the device code/URL it emitted. */
	private authLoginChild: ChildProcess | null = null;
	private authDevice: { code: string; verificationUri: string } | null = null;
	/** Set once we've fallen back to plaintext token storage after a failed save. */
	private authPlaintextRetried = false;
	private shields: Record<string, boolean> = {};
	private sessionAgents: Record<string, string> = {};
	private sessionPrompts: Record<string, Array<{ label: string; text: string }>> = {};
	private updater: UpdateChecker;
	private squadReader: SquadReader;
	private squadContextInjected = new Set<string>();
	private failedAuth = new Map<string, { count: number; resetTime: number }>();

	constructor(private port: number, dataDir?: string, opts?: { newToken?: boolean; cliUrl?: string }) {
		this.webuiPath = path.join(__dirname, '..', 'dist', 'webui');
		this.debugDir = path.join(__dirname, '..', 'debug');
		this.dataDir = dataDir ?? path.join(__dirname, '..', 'data');
		if (opts?.newToken) {
			const tokenFile = path.join(this.dataDir, 'token.txt');
			try { fs.unlinkSync(tokenFile); } catch {}
		}
		this.token = this.initToken();
		const workspaceRoot = WORKSPACE_ROOT;
		try { fs.mkdirSync(workspaceRoot, { recursive: true }); } catch {}
		// Ensure data/guides and data/prompts exist (empty — the example
		// Guides/Prompts are a read-only catalog served from examples/, not seeded here).
		this.ensureDataDirs();
		this.pool = new SessionPool((msg) => this.log(msg), new RulesStore(this.dataDir), workspaceRoot, opts?.cliUrl);
		this.updater = new UpdateChecker((msg) => this.log(msg));
		this.squadReader = new SquadReader(SQUAD_ROOT);
		this.squadReader.startWatching();
		this.squadReader.on('change', (change: { path: string; type: string }) => {
			this.broadcastAll({ type: 'squad_file_changed', path: change.path, changeType: change.type, timestamp: Date.now() });
		});
		this.pool.onTitleChanged = (sessionId, summary) => {
			this.broadcastAll({ type: 'session_renamed', sessionId, summary });
		};

		this.httpServer = http.createServer((req, res) => this.handleHttp(req, res));

		this.wss = new WebSocketServer({
			server: this.httpServer,
			perMessageDeflate: false,
			verifyClient: ({ req }, callback) => {
				const ip = req.socket.remoteAddress ?? 'unknown';
				const now = Date.now();
				// DNS-rebinding defense: reject WS upgrades whose Host header is an
				// unknown domain (legit access is via IP literal / localhost / an
				// allowlisted name). Defends the same-origin rebinding chain.
				if (!this.isHostAllowed(req)) {
					this.log(`[WS] Rejected upgrade with disallowed Host header: ${req.headers['host'] ?? '(none)'}`);
					callback(false, 403, 'Forbidden');
					return;
				}
				// Rate limit: 15 failed attempts per 60s per IP
				const attempt = this.failedAuth.get(ip);
				if (attempt && now < attempt.resetTime && attempt.count >= 15) {
					const secs = Math.ceil((attempt.resetTime - now) / 1000);
					this.log(`[Auth] Blocked ${ip} (banned, ${secs}s remaining)`);
					callback(false, 429, 'Too many attempts');
					return;
				}
				const url = new URL(req.url ?? '/', 'http://localhost');
				const t = url.searchParams.get('token');
				if (!this.tokenMatches(t)) {
					this.recordFailedAuth(ip);
					callback(false, 401, 'Unauthorized');
				} else {
					this.clearFailedAuth(ip);
					callback(true);
				}
			},
		});

		this.wss.on('error', (err) => this.log(`[WS Error] ${err.message}`));

		this.wss.on('connection', async (ws, req) => {
			const rawIp = req.socket.remoteAddress ?? 'unknown';
			const forwarded = req.headers['x-forwarded-for'];
			const isTunnel = !!forwarded;
			const ip = isTunnel ? (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0]) : rawIp;
			// Clean up IPv6-mapped IPv4 (e.g. ::ffff:192.168.1.12 → 192.168.1.12)
			const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
			const clientId = `C${++this.clientCounter}:${isTunnel ? 'T:' : ''}${cleanIp}`;
			const url = new URL(req.url ?? '/', 'http://localhost');
			let sessionId = url.searchParams.get('session') ?? null;
				const historyParam = url.searchParams.get('history');
				const historyLimit = historyParam === 'all' ? undefined : (historyParam ? parseInt(historyParam, 10) || 50 : 50);
			const isManagement = url.searchParams.get('management') === '1';
			const squadContextEnabled = url.searchParams.get('squadContext') !== '0';

			// Reject a malformed session id before it can reach any filesystem path
			// (events.jsonl repair, rules store). Legit IDs are CLI-generated UUIDs;
			// a null id (auto / last-session) is fine and resolved below.
			if (sessionId && !isSafeSessionId(sessionId)) {
				this.log(`[${clientId}] Rejected malformed session id`);
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: 'error', content: 'Invalid session id' }));
				}
				try { ws.close(); } catch {}
				return;
			}

			this.log(`[${clientId}] Connected, session=${sessionId?.slice(0, 8) ?? (isManagement ? 'mgmt' : 'auto')}`);

			// Management connections: no session, just here to receive broadcasts
			if (isManagement) {
				const pingInterval = setInterval(() => {
					if (ws.readyState === WebSocket.OPEN) ws.ping();
				}, 30_000);
				ws.on('message', (data) => {
					try { if (JSON.parse(data.toString()).type === 'ping') ws.send('{"type":"pong"}'); } catch {}
				});
				ws.on('close', () => clearInterval(pingInterval));
				return;
			}

			// Not authenticated yet: don't try to resolve/create a session (the CLI
			// isn't usable). Tell the client to show the sign-in screen and stop here.
			//
			// First, if auth is still in the transient 'starting' state, wait briefly
			// for it to settle. A client auto-reconnecting immediately after a server
			// restart ([r]) can beat initAuth() by a fraction of a second; without this
			// wait it would hit the branch below and get stranded with a session-less
			// ping-only handler, silently dropping the user's next send until they
			// manually refresh the page. 'starting' is transient (CLI is coming up),
			// unlike 'needs-auth'/'error' which need real user action.
			if (this.authState === 'starting') {
				await this.waitForAuthSettled(15_000);
			}
			if (this.authState !== 'ok') {
				this.log(`[${clientId}] Auth not ready (${this.authState}) — deferring session setup`);
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: 'auth_state', state: this.authState, message: this.authMessage }));
				}
				const pingInterval = setInterval(() => {
					if (ws.readyState === WebSocket.OPEN) ws.ping();
				}, 30_000);
				ws.on('message', (data) => {
					try { if (JSON.parse(data.toString()).type === 'ping') ws.send('{"type":"pong"}'); } catch {}
				});
				ws.on('close', () => clearInterval(pingInterval));
				return;
			}

			// Buffer client messages that arrive *before* the session handle is ready.
			// Resolving + resuming a session can take many seconds (or stall) when it
			// re-initializes remote/stdio MCP servers (e.g. an npx-spawned server that's
			// slow to connect). Until then the real message handler (registered after the
			// connect below) doesn't exist, so a prompt sent in that window would be
			// silently dropped — the client shows "pushing…"/thinking forever and only a
			// manual page refresh recovers (it reconnects to the now-warm pooled session).
			// Instead we attach a temporary listener that answers pings inline and queues
			// everything else, then flush the queue once the handle is connected.
			let handleReady = false;
			const earlyQueue: string[] = [];
			const earlyListener = (data: import('ws').RawData) => {
				const str = data.toString();
				if (str === '{"type":"ping"}') { ws.send('{"type":"pong"}'); return; }
				if (!handleReady) earlyQueue.push(str);
			};
			ws.on('message', earlyListener);

			// Resolve session — use requested ID, fall back to last session
			try {
				if (!sessionId) {
					sessionId = await this.pool.getLastSessionId();
				}
				if (!sessionId) {
					this.log(`[${clientId}] No session available, creating new`);
					const handle = await this.pool.create();
					sessionId = handle.sessionId;
				}
			} catch (e) {
				this.log(`[${clientId}] Session resolve error: ${e}`);
				ws.close(1011, 'Session error');
				return;
			}

			// Connect to the session — evict first if no other clients are watching
			// AND no turn is active, so we get a fresh snapshot with CLI messages.
			// Never evict during an active turn — that would abort the response.
			// Never evict a brand-new session (isNew=true) — it was just created by this
			// portal client and has no CLI history to sync; evicting it would disconnect
			// the session before it's ever been saved, causing a session_not_found error.
			let handle;
			try {
				// Send a loading hint to the client before the (potentially slow) resume +
				// history replay. Always emit it — not just on a cold pool miss — because a
				// browser reload reconnects to a warm session whose history still takes time
				// to stream back, and the user expects the loading counter during that wait.
				// Cleared client-side on history_end.
				{
					const eventsPath = path.join(os.homedir(), '.copilot', 'session-state', sessionId, 'events.jsonl');
					try {
						const stat = fs.statSync(eventsPath);
						const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
						ws.send(JSON.stringify({ type: 'history_loading', sizeBytes: stat.size, sizeMB }));
					} catch { /* file may not exist yet */ }
				}
				handle = await this.pool.connect(sessionId, true);
			} catch (e) {
				this.log(`[${clientId}] Connect error: ${e}`);
				const msg = String(e);
				const isNotFound = msg.includes('Session not found') || msg.includes('not found');
				if (isNotFound && ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: 'session_not_found', sessionId }));
				}
				ws.close(isNotFound ? 4404 : 1011, msg.slice(0, 120));
				return;
			}

			// Per-client event listener — routes session events to this WS only.
			// cancelled is set synchronously when the WS closes so any in-flight
			// async work (e.g. getHistory) never sends data to a closed/stale connection.
			let cancelled = false;
			const listener = (event: PortalEvent) => {
				if (!cancelled && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
			};
			// Mutable ref so reconnect in handleMessage updates the close handler's reference
			const handleRef = { current: handle };
			handle.addListener(listener);

			// Notify client of confirmed session ID + session context (cwd, git info)
			if (!cancelled && ws.readyState === WebSocket.OPEN) {
				const sessions = await this.pool.listSessions().catch(() => []);
				const meta = sessions.find(s => s.sessionId === sessionId);
				const savedAgent = this.sessionAgents[sessionId] ?? null;
				// Prefer SDK metadata context; for brand-new sessions it may not be
				// written yet, so fall back to the cwd we allocated at create time.
				const ctx = meta?.context ?? (handle.knownCwd ? { cwd: handle.knownCwd } : null);
				ws.send(JSON.stringify({ type: 'session_switched', sessionId, context: ctx, summary: meta?.summary ?? null, startTime: meta?.startTime ?? null, model: handle.currentModel ?? null, agent: savedAgent, usage: handle.getSessionUsage(), serverBuild: __BUILD__ }));
				// Re-select saved agent if the SDK session doesn't have it (reconnect resets agent)
				if (savedAgent) {
					handle.selectAgent(savedAgent).catch(() => {});
				}

				// For brand-new sessions the CLI subprocess may not have written cwd yet —
				// retry once after a short delay and push an update if context arrives.
				if (!meta?.context) {
					setTimeout(async () => {
						if (cancelled || ws.readyState !== WebSocket.OPEN) return;
						const sessions2 = await this.pool.listSessions().catch(() => []);
						const meta2 = sessions2.find(s => s.sessionId === sessionId);
						if (meta2?.context) {
							ws.send(JSON.stringify({ type: 'session_context_updated', sessionId, context: meta2.context }));
						}
					}, 1500);
				}
				// Model may not be known yet (getCurrent is async) — push update once it resolves
				if (!handle.currentModel) {
					setTimeout(() => {
						if (cancelled || ws.readyState !== WebSocket.OPEN) return;
						if (handle.currentModel) {
							ws.send(JSON.stringify({ type: 'model_changed', model: handle.currentModel }));
						}
					}, 1000);
				}
			}

			// Replay history + pending requests.
			// We capture sessionId at this point — it never changes for this connection.
			const historySessionId = sessionId;
			handle.getHistory(historyLimit).then(async (events) => {
				if (cancelled || ws.readyState !== WebSocket.OPEN) return;
				ws.send(JSON.stringify({ type: 'history_start', sessionId: historySessionId }));
				for (const e of events) {
					if (cancelled) return; // stop mid-send if connection drops
					ws.send(JSON.stringify(e));
				}
				if (cancelled) return;
				ws.send(JSON.stringify({ type: 'history_end', sessionId: historySessionId, turnActive: handle.portalTurnActive }));
				// Catch up new client on any in-progress turn (thinking/streaming)
				const activeTurnEvents = handle.getActiveTurnEvents();
				this.log('[' + clientId + '] Active turn events: ' + (activeTurnEvents.map(e => e.type).join(', ') || 'none') + ' (isTurnActive=' + handle.turnActive + ')');
				for (const e of activeTurnEvents) ws.send(JSON.stringify(e));
				for (const e of handle.getPendingApprovalEvents()) ws.send(JSON.stringify(e));
				for (const e of handle.getPendingInputEvents()) ws.send(JSON.stringify(e));
				for (const e of handle.getCliPendingEvents()) ws.send(JSON.stringify(e));
				// Send current approval rules and approveAll state for this session
				ws.send(JSON.stringify({ type: 'rules_list', rules: handle.getRulesList() }));
				ws.send(JSON.stringify({ type: 'approve_all_changed', approveAll: handle.getApproveAll() }));
				// Send current MCP server list
				try {
					const mcpServers = await handle.listMcpServers();
					ws.send(JSON.stringify({ type: 'mcp_servers_loaded', content: JSON.stringify(mcpServers) }));
				} catch {}
				// Send cached MCP tool counts (populated after first prompt)
				const toolCounts = handle.getMcpToolCounts();
				if (Object.keys(toolCounts).length > 0) {
					ws.send(JSON.stringify({ type: 'mcp_tool_counts', content: JSON.stringify(toolCounts) }));
				}
				// Send skills list (query via RPC, fall back to cache)
				try {
					const skills = await handle.listSkills();
					if (skills.length > 0) {
						ws.send(JSON.stringify({ type: 'skills_loaded', content: JSON.stringify(skills) }));
					}
				} catch {
					const skills = handle.getLoadedSkills();
					if (skills.length > 0) {
						ws.send(JSON.stringify({ type: 'skills_loaded', content: JSON.stringify(skills) }));
					}
				}
			}).catch(async (e) => {
				const errMsg = String(e);
				if (errMsg.includes('Session not found') || errMsg.includes('not found')) {
					this.log(`[${clientId}] Session stale — evicting and re-resuming: ${sessionId.slice(0, 8)}`);
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ type: 'session_resuming', sessionId }));
					}
					try {
						await this.pool.evict(sessionId);
						const newHandle = await this.pool.connect(sessionId);
						handleRef.current.removeListener(listener);
						handleRef.current = newHandle;
						newHandle.addListener(listener);
						// Retry history with fresh handle
						const events = await newHandle.getHistory(historyLimit);
						if (cancelled || ws.readyState !== WebSocket.OPEN) return;
						ws.send(JSON.stringify({ type: 'history_start', sessionId: historySessionId }));
						for (const ev of events) {
							if (cancelled) return;
							ws.send(JSON.stringify(ev));
						}
						if (cancelled) return;
						ws.send(JSON.stringify({ type: 'history_end', sessionId: historySessionId, turnActive: newHandle.portalTurnActive }));
						const activeTurnEvents = newHandle.getActiveTurnEvents();
						for (const ev of activeTurnEvents) ws.send(JSON.stringify(ev));
						for (const ev of newHandle.getPendingApprovalEvents()) ws.send(JSON.stringify(ev));
						for (const ev of newHandle.getPendingInputEvents()) ws.send(JSON.stringify(ev));
						for (const ev of newHandle.getCliPendingEvents()) ws.send(JSON.stringify(ev));
						ws.send(JSON.stringify({ type: 'rules_list', rules: newHandle.getRulesList() }));
						ws.send(JSON.stringify({ type: 'approve_all_changed', approveAll: newHandle.getApproveAll() }));
						this.log(`[${clientId}] Session re-resumed successfully`);
					} catch (retryErr) {
						this.log(`[${clientId}] Re-resume failed: ${retryErr}`);
						if (ws.readyState === WebSocket.OPEN) {
							ws.send(JSON.stringify({ type: 'session_not_found', sessionId }));
							ws.close(4404, String(retryErr).slice(0, 120));
						}
					}
				} else {
					this.log(`[${clientId}] History error: ${e}`);
				}
			});

			// Keep-alive ping every 30s
			const pingInterval = setInterval(() => {
				if (!cancelled && ws.readyState === WebSocket.OPEN) ws.ping();
			}, 30_000);

			ws.on('message', (data) => {
				const str = data.toString();
				// Application-level heartbeat — browser WS API doesn't expose protocol pings
				if (str === '{"type":"ping"}') { ws.send('{"type":"pong"}'); return; }
				this.handleMessage(str, clientId, handleRef, sessionId!, listener, ws, historyLimit, squadContextEnabled);
			});

			// Session is now wired up: stop buffering, swap to the real handler, and
			// replay anything the client sent while the (possibly slow) connect was in
			// flight so no prompt is lost to a slow/stalled MCP resume.
			handleReady = true;
			ws.off('message', earlyListener);
			if (earlyQueue.length) {
				this.log(`[${clientId}] Flushing ${earlyQueue.length} buffered message(s) sent during connect`);
				for (const str of earlyQueue) {
					this.handleMessage(str, clientId, handleRef, sessionId!, listener, ws, historyLimit, squadContextEnabled);
				}
				earlyQueue.length = 0;
			}
			ws.on('error', (err) => this.log(`[${clientId}] Error: ${err.message}`));
			ws.on('close', (code, reason) => {
				cancelled = true;
				clearInterval(pingInterval);
				handleRef.current.removeListener(listener);
				this.log(`[${clientId}] Disconnected (code: ${code})`);
			});
		});
	}

	private handleMessage(
		raw: string,
		clientId: string,
		handleRef: { current: Awaited<ReturnType<SessionPool['connect']>> },
		sessionId: string,
		listener: (e: PortalEvent) => void,
		ws: WebSocket,
		historyLimit?: number,
		squadContextEnabled = true,
	) {
		try {
			const handle = handleRef.current;
			const msg = JSON.parse(raw) as {
				type: string;
				content?: string;
				requestId?: string;
				approved?: boolean;
				answer?: string;
				wasFreeform?: boolean;
				kind?: string;
				pattern?: string;
				ruleId?: string;
				attachments?: Array<{ type: string; data: string; mimeType: string; displayName?: string }>;
				approveAll?: boolean;
			};
			if (msg.type === 'prompt' && (msg.content || msg.attachments?.length)) {
				let prompt = msg.content || '';
				const attachments = msg.attachments as Array<{ type: 'blob'; data: string; mimeType: string; displayName?: string }> | undefined;
				if (squadContextEnabled && !this.squadContextInjected.has(sessionId)) {
					const guide = this.squadReader.generateGuide();
					if (guide) {
						prompt = `${guide}\n\n---\n\n${prompt}`;
					}
					this.squadContextInjected.add(sessionId);
				}
				this.log(`[${clientId}] Prompt: ${prompt.slice(0, 80) || '(image only)'}${attachments?.length ? ` [${attachments.length} image(s)]` : ''}`);
				handle.send(prompt, attachments).catch(async (e) => {
					const errMsg = String(e);
					this.log(`[${clientId}] Send error: ${errMsg}`);
					if (errMsg.includes('Connection is closed') || errMsg.includes('not connected') || errMsg.includes('disposed')) {
						this.log(`[${clientId}] Connection lost — attempting reconnect...`);
						try {
							const oldHandle = handleRef.current;
							oldHandle.removeListener(listener);
							await this.pool.evict(sessionId);
							const newHandle = await this.pool.connect(sessionId);
							newHandle.addListener(listener);
							handleRef.current = newHandle;
							this.log(`[${clientId}] Reconnected — retrying send`);
							await newHandle.send(prompt, attachments);
						} catch (retryErr) {
							this.log(`[${clientId}] Reconnect failed: ${retryErr}`);
							if (ws.readyState === WebSocket.OPEN) {
								ws.send(JSON.stringify({ type: 'error', content: 'Session connection lost. Please refresh the page.' }));
							}
						}
					} else if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ type: 'error', content: `Send failed: ${errMsg}` }));
					}
				});
			} else if (msg.type === 'stop') {
				handle.abort();
			} else if (msg.type === 'set_model' && msg.content) {
				handle.setModel(msg.content).catch((e) => this.log(`[${clientId}] setModel error: ${e}`));
			} else if (msg.type === 'approval_response' && msg.requestId != null) {
				handle.resolveApproval(msg.requestId, msg.approved ?? false);
			} else if (msg.type === 'approval_response_always' && msg.requestId != null && msg.kind && msg.pattern) {
				handle.resolveApproval(msg.requestId, true);
				handle.addRule(msg.kind, msg.pattern);
				this.log(`[${clientId}] Rule added: ${msg.kind} "${msg.pattern}"`);
			} else if (msg.type === 'rule_delete' && msg.ruleId) {
				handle.removeRule(msg.ruleId);
				this.log(`[${clientId}] Rule deleted: ${msg.ruleId}`);
			} else if (msg.type === 'rules_clear') {
				handle.clearRules();
				this.log(`[${clientId}] Rules cleared`);
			} else if (msg.type === 'set_approve_all' && msg.approveAll != null) {
				handle.setApproveAll(!!msg.approveAll);
				this.log(`[${clientId}] approveAll: ${msg.approveAll}`);
			} else if (msg.type === 'input_response' && msg.requestId != null) {
				handle.resolveUserInput(msg.requestId, msg.answer ?? '', msg.wasFreeform ?? true);
			} else if (msg.type === 'resync') {
				// Lightweight catch-up replay on the EXISTING socket. A client returning
				// from the background (e.g. a phone waking from sleep) can hold a socket
				// that stayed OPEN-but-suspended and missed the live events for turns run
				// elsewhere — so no fresh connection (and thus no history replay) fired,
				// leaving it stale until a manual reselect/refresh. Replaying history here
				// lets the client's history_end reconnect-dedup adopt any new turns. Mirrors
				// the connect-time replay: history_start → events → history_end{turnActive}
				// → active-turn + pending-request catch-up. Cheap no-op when nothing changed.
				handle.getHistory(historyLimit ?? 50).then((events) => {
					if (ws.readyState !== WebSocket.OPEN) return;
					ws.send(JSON.stringify({ type: 'history_start', sessionId }));
					for (const e of events) {
						if (ws.readyState !== WebSocket.OPEN) return;
						ws.send(JSON.stringify(e));
					}
					if (ws.readyState !== WebSocket.OPEN) return;
					ws.send(JSON.stringify({ type: 'history_end', sessionId, turnActive: handle.portalTurnActive }));
					for (const e of handle.getActiveTurnEvents()) ws.send(JSON.stringify(e));
					for (const e of handle.getPendingApprovalEvents()) ws.send(JSON.stringify(e));
					for (const e of handle.getPendingInputEvents()) ws.send(JSON.stringify(e));
					for (const e of handle.getCliPendingEvents()) ws.send(JSON.stringify(e));
					// Repair cheap session state that may have changed from another client
					// while this socket was suspended (parity with the connect-time replay).
					ws.send(JSON.stringify({ type: 'rules_list', rules: handle.getRulesList() }));
					ws.send(JSON.stringify({ type: 'approve_all_changed', approveAll: handle.getApproveAll() }));
				}).catch((e) => this.log(`[${clientId}] resync error: ${e}`));
			} else {
				this.log(`[${clientId}] Unknown message: ${msg.type}`);
			}
		} catch (e) {
			this.log(`[${clientId}] Parse error: ${e}`);
		}
	}

	/** Ensure data directories exist */
	private ensureDataDirs(): void {
		for (const sub of ['guides', 'prompts']) {
			try { fs.mkdirSync(path.join(this.dataDir, sub), { recursive: true }); } catch { /* ignore */ }
		}
	}

	private loadShields(): void {
		try {
			const f = path.join(this.dataDir, 'session-shields.json');
			if (fs.existsSync(f)) this.shields = JSON.parse(fs.readFileSync(f, 'utf8'));
		} catch {}
	}

	private saveShields(): void {
		try {
			fs.mkdirSync(this.dataDir, { recursive: true });
			fs.writeFileSync(path.join(this.dataDir, 'session-shields.json'), JSON.stringify(this.shields, null, 2));
		} catch {}
	}

	private loadSessionAgents(): void {
		try {
			const f = path.join(this.dataDir, 'session-agents.json');
			if (fs.existsSync(f)) this.sessionAgents = JSON.parse(fs.readFileSync(f, 'utf8'));
		} catch {}
	}

	private saveSessionAgents(): void {
		try {
			fs.mkdirSync(this.dataDir, { recursive: true });
			fs.writeFileSync(path.join(this.dataDir, 'session-agents.json'), JSON.stringify(this.sessionAgents, null, 2));
		} catch {}
	}

	private loadSessionPrompts(): void {
		try {
			const f = path.join(this.dataDir, 'session-prompts.json');
			if (fs.existsSync(f)) this.sessionPrompts = JSON.parse(fs.readFileSync(f, 'utf8'));
		} catch {}
	}

	private saveSessionPrompts(): void {
		try {
			fs.mkdirSync(this.dataDir, { recursive: true });
			fs.writeFileSync(path.join(this.dataDir, 'session-prompts.json'), JSON.stringify(this.sessionPrompts, null, 2));
		} catch {}
	}


	private log(msg: string) {
		const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		const line = `[${ts}] ${msg}`;
		process.stdout.write(line + '\n');
		this.logStream?.write(line + '\n');
	}

	/**
	 * Resolve the portal session token at startup.
	 *  - PORTAL_TOKEN env wins (admin-managed; survives redeploys, predictable URL).
	 *  - Else an existing data/token.txt is reused.
	 *  - Else null: no token yet. The user mints one from the portal UI via a
	 *    one-time "Generate session token" claim. This is identical for the
	 *    container and the desktop console (the console shows a tokenless URL/QR
	 *    until the claim happens, then picks up the new token automatically).
	 */
	private initToken(): string | null {
		const envToken = process.env.PORTAL_TOKEN?.trim();
		if (envToken) { this.tokenEnvManaged = true; return envToken; }
		const tokenFile = path.join(this.dataDir, 'token.txt');
		try {
			if (fs.existsSync(tokenFile)) {
				const existing = fs.readFileSync(tokenFile, 'utf8').trim();
				if (existing) return existing;
			}
		} catch {}
		return null;
	}

	/** Generate a fresh random token, persist it to data/token.txt, and return it. */
	private createAndPersistToken(): string {
		const token = crypto.randomBytes(16).toString('hex');
		try {
			fs.mkdirSync(this.dataDir, { recursive: true });
			fs.writeFileSync(path.join(this.dataDir, 'token.txt'), token);
		} catch {}
		return token;
	}

	/**
	 * DNS-rebinding defense for unauthenticated/bootstrap surfaces. A rebinding
	 * attack relies on a victim's browser sending the *attacker's domain* in the
	 * Host header while the connection lands on a LAN IP. We therefore accept only
	 * IP-literal hosts (how the portal is normally reached: http://192.168.x.y:3847),
	 * localhost, and any operator-configured names in PORTAL_ALLOWED_HOSTS (for
	 * reverse-proxy / custom-domain deployments). Unknown domain Host headers are
	 * rejected. Missing Host (raw clients, health probes) is allowed.
	 */
	private isHostAllowed(req?: http.IncomingMessage): boolean {
		const raw = req?.headers['host'];
		if (!raw) return true;
		const host = raw.toLowerCase();
		// Strip the port: handle [::1]:3847, 1.2.3.4:3847, host:3847.
		let name = host;
		if (name.startsWith('[')) {
			name = name.slice(1, name.indexOf(']') > 0 ? name.indexOf(']') : undefined);
		} else if (name.includes(':') && name.split(':').length === 2) {
			name = name.split(':')[0];
		}
		if (name === 'localhost' || name === '0.0.0.0') return true;
		// IPv4 literal
		if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return true;
		// IPv6 literal (the [..] form was stripped above; bare form still has colons)
		if (name.includes(':')) return true;
		return this.allowedHosts.has(name);
	}

	/** Constant-time comparison of a presented token against the real one.
	 *  Defense-in-depth against remote timing attacks (the 15/60s ban already
	 *  makes them impractical, but a non-leaky compare costs nothing). */
	private tokenMatches(presented: string | null | undefined): boolean {
		if (this.token == null || presented == null) return false;
		const a = Buffer.from(presented);
		const b = Buffer.from(this.token);
		if (a.length !== b.length) return false;
		return crypto.timingSafeEqual(a, b);
	}

	private checkToken(url: URL, req?: http.IncomingMessage): boolean {
		if (this.token == null) return false;
		const ip = req?.socket.remoteAddress ?? 'unknown';
		const authHeader = req?.headers['authorization'];
		const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
			? authHeader.slice(7) : null;
		if (this.tokenMatches(url.searchParams.get('token')) || this.tokenMatches(bearer)) {
			if (req) this.clearFailedAuth(ip);
			return true;
		}
		// Track failed attempt for rate limiting
		if (req) this.recordFailedAuth(ip);
		return false;
	}

	/**
	 * Record a failed auth attempt for an IP and emit the right log line.
	 * Ban/lift is lazy (no timer): an IP is banned once it reaches 15 failed
	 * attempts inside the 60s window; the window resets the next time the IP is
	 * seen after it expires. We log the Banned transition once (when count hits 15)
	 * and the lazy "Ban lifted" transition once (when a previously-banned IP returns
	 * past its window). Every individual blocked connection is logged separately at
	 * the 429 gate so each refused attempt is visible.
	 */
	private recordFailedAuth(ip: string): void {
		const now = Date.now();
		const attempt = this.failedAuth.get(ip);
		const within = !!attempt && now < attempt.resetTime;
		if (attempt && !within && attempt.count >= 15) {
			this.log(`[Auth] Ban lifted for ${ip} (rate-limit window expired)`);
		}
		const entry = within
			? { count: attempt!.count + 1, resetTime: attempt!.resetTime }
			: { count: 1, resetTime: now + 60_000 };
		this.failedAuth.set(ip, entry);
		if (entry.count === 15) {
			this.log(`[Auth] Banned ${ip} — 15 failed auth attempts in 60s`);
		} else if (entry.count < 15) {
			this.log(`[Auth] Failed attempt from ${ip} (${entry.count}/15)`);
		}
	}

	/** Clear an IP's failed-attempt record on success; logs the lazy "Ban lifted" transition if it had expired while banned. */
	private clearFailedAuth(ip: string): void {
		const attempt = this.failedAuth.get(ip);
		if (!attempt) return;
		if (attempt.count >= 15 && Date.now() >= attempt.resetTime) {
			this.log(`[Auth] Ban lifted for ${ip} (rate-limit window expired)`);
		}
		this.failedAuth.delete(ip);
	}

	/** Returns true if the IP is rate-limited. Sets 429 on the response. */
	private isRateLimited(req: http.IncomingMessage, res: http.ServerResponse): boolean {
		const ip = req.socket.remoteAddress ?? 'unknown';
		const attempt = this.failedAuth.get(ip);
		const now = Date.now();
		if (attempt && now < attempt.resetTime && attempt.count >= 15) {
			const secs = Math.ceil((attempt.resetTime - now) / 1000);
			this.log(`[Auth] Blocked ${ip} (banned, ${secs}s remaining)`);
			res.writeHead(429); res.end('Too many attempts');
			return true;
		}
		return false;
	}

	private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
		if (this.isRateLimited(req, res)) return;
		const url = new URL(req.url ?? '/', 'http://localhost');
		const method = req.method ?? 'GET';

		// Unauthenticated health probe (for Docker HEALTHCHECK / orchestrators).
		// Returns 200 once the HTTP server is up; never exposes secrets.
		if (url.pathname === '/healthz' && method === 'GET') {
			this.sendJson(res, 200, {
				status: 'ok',
				version: __VERSION__,
				build: __BUILD__,
				cli: this.authState === 'ok' ? 'ready' : this.authState,
			});
			return;
		}

		// Portal session-token bootstrap — unauthenticated by necessity (the caller
		// can't present a token before one exists). status leaks only a boolean;
		// create is a one-shot claim that refuses (409) once a token is set.
		// Both are guarded against DNS-rebinding via the Host allowlist so a
		// remote attacker can't drive them through a victim's rebound browser.
		if (url.pathname === '/api/portal-token/status' && method === 'GET') {
			if (!this.isHostAllowed(req)) { res.writeHead(403); res.end('Forbidden'); return; }
			this.sendJson(res, 200, { configured: this.token != null, envManaged: this.tokenEnvManaged });
			return;
		}
		if (url.pathname === '/api/portal-token/create' && method === 'POST') {
			if (!this.isHostAllowed(req)) {
				this.log(`[Auth] Rejected token claim with disallowed Host header: ${req.headers['host'] ?? '(none)'}`);
				res.writeHead(403); res.end('Forbidden'); return;
			}
			if (this.tokenEnvManaged) { this.sendJson(res, 409, { error: 'env_managed' }); return; }
			if (this.token != null) { this.sendJson(res, 409, { error: 'already_configured' }); return; }
			this.token = this.createAndPersistToken();
			this.log('[Auth] Portal session token created via first-run web claim');
			this.sendJson(res, 200, { token: this.token });
			return;
		}

		// API routes — require token
		if (url.pathname.startsWith('/api/')) {
			if (!this.checkToken(url, req)) { res.writeHead(401); res.end('Unauthorized'); return; }
		}

		if (url.pathname === '/api/info' && method === 'GET') {
			this.sendJson(res, 200, this.portalInfo ?? { version: 'unknown', login: 'unknown', models: [] });
			return;
		}

		// Current auth/CLI connection state — drives the sign-in screen (M2).
		if (url.pathname === '/api/auth/status' && method === 'GET') {
			this.sendJson(res, 200, {
				state: this.authState,
				login: this.portalInfo?.login ?? null,
				message: this.authMessage,
				device: this.authDevice,
			});
			return;
		}

		// Start the GitHub device-code sign-in flow (M2 2b). Spawns `copilot login`,
		// scrapes the device code + URL, and broadcasts them to connected clients.
		if (url.pathname === '/api/auth/login' && method === 'POST') {
			if (this.authState === 'ok') {
				this.sendJson(res, 400, { error: 'Already signed in.' });
				return;
			}
			if (this.authLoginChild) {
				// Flow already running — return whatever code we have so far.
				this.sendJson(res, 200, { started: true, device: this.authDevice });
				return;
			}
			this.startDeviceLogin();
			this.sendJson(res, 202, { started: true, device: this.authDevice });
			return;
		}

		// Cancel an in-progress sign-in flow.
		if (url.pathname === '/api/auth/login/cancel' && method === 'POST') {
			this.cancelDeviceLogin();
			this.sendJson(res, 200, { cancelled: true });
			return;
		}

		// Sign out of GitHub: clear stored credentials, then restart so the portal
		// drops back to the sign-in screen.
		if (url.pathname === '/api/auth/logout' && method === 'POST') {
			const result = this.clearStoredCredentials();
			this.log(`[Auth] Logout requested — ${result.summary}`);
			this.sendJson(res, 200, { ok: true, ...result });
			this.broadcastAll({ type: 'auth_state', state: 'starting', message: 'Signing out — restarting...' });
			// Exit 76: launcher restarts the CLI server (re-reads creds — now none)
			// then relaunches the portal, which comes up needing sign-in.
			setTimeout(() => process.exit(76), 300);
			return;
		}

		// Remove the portal session token (authenticated). Clears it so every device
		// is signed out and the portal returns to the one-time claim screen. No-op
		// (409) when the token is pinned via the PORTAL_TOKEN env.
		if (url.pathname === '/api/portal-token' && method === 'DELETE') {
			if (!this.clearToken()) { this.sendJson(res, 409, { error: 'env_managed' }); return; }
			this.log('[Auth] Portal session token removed via web UI');
			this.sendJson(res, 200, { ok: true });
			return;
		}

		// Authenticate with a pasted personal access token (the documented
		// container/CI method). We persist it for the launcher to inject as
		// COPILOT_GITHUB_TOKEN on (re)start, then exit 76 to restart. Only
		// fine-grained tokens (github_pat_) and gho_/ghu_ are supported; classic
		// ghp_ tokens are explicitly unsupported by the Copilot CLI.
		if (url.pathname === '/api/auth/token' && method === 'POST') {
			let token = '';
			try { token = String((JSON.parse(await this.readBody(req)) as { token?: unknown })?.token ?? '').trim(); } catch { /* bad body */ }
			if (!token) {
				this.sendJson(res, 400, { error: 'Paste a token first.' });
				return;
			}
			if (token.startsWith('ghp_')) {
				this.sendJson(res, 400, { error: 'Classic tokens (ghp_) are not supported by Copilot CLI. Create a fine-grained token with the "Copilot Requests" permission.' });
				return;
			}
			// Best-effort validation: reject only a definitive 401 (invalid/expired).
			// A Copilot-scoped fine-grained token may legitimately 403 on /user, so
			// we never block on anything but 401 — the CLI is the final judge.
			let login: string | null = null;
			try {
				const ctrl = new AbortController();
				const timer = setTimeout(() => ctrl.abort(), 6000);
				const r = await fetch('https://api.github.com/user', {
					headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'copilot-portal', Accept: 'application/vnd.github+json' },
					signal: ctrl.signal,
				});
				clearTimeout(timer);
				if (r.status === 401) {
					this.sendJson(res, 400, { error: 'That token is invalid or expired.' });
					return;
				}
				if (r.ok) { try { login = ((await r.json()) as { login?: string })?.login ?? null; } catch { /* ignore */ } }
			} catch { /* network/timeout — cannot verify; trust the token and let the CLI decide */ }

			// Drop any prior device-flow credentials so the two methods stay
			// mutually exclusive, then persist the new token (0600).
			this.clearStoredCredentials();
			try {
				fs.mkdirSync(this.dataDir, { recursive: true });
				fs.writeFileSync(this.patFile(), token, { mode: 0o600 });
				try { fs.chmodSync(this.patFile(), 0o600); } catch { /* best effort */ }
			} catch (e) {
				this.sendJson(res, 500, { error: `Failed to store token: ${e}` });
				return;
			}
			this.log(`[Auth] Access token saved${login ? ` for ${login}` : ''} — restarting to authenticate via COPILOT_GITHUB_TOKEN`);
			this.sendJson(res, 200, { ok: true, login });
			this.broadcastAll({ type: 'auth_state', state: 'starting', message: 'Token saved — restarting...' });
			setTimeout(() => process.exit(76), 300);
			return;
		}

		if (url.pathname === '/api/mcp' && method === 'GET') {
			const sessionId = url.searchParams.get('session') ?? undefined;
			try {
				const servers = await this.pool.listMcpServers(sessionId);
				this.sendJson(res, 200, { servers });
			} catch (e) {
				this.log(`[Server] /api/mcp failed: ${e}`);
				this.sendJson(res, 200, { servers: [] });
			}
			return;
		}

		if (url.pathname === '/api/mcp' && method === 'POST') {
			const body = JSON.parse(await this.readBody(req));
			const { name, command, args, env, mcpUrl, type } = body as { name: string; command?: string; args?: string[]; env?: Record<string, string>; mcpUrl?: string; type?: string };
			if (!name) {
				this.sendJson(res, 400, { error: 'name is required' });
				return;
			}
			try {
				if (type === 'http' && mcpUrl) {
					await this.pool.addMcpServer(name, { type: 'http', url: mcpUrl, tools: ['*'] } as any);
				} else if (command) {
					await this.pool.addMcpServer(name, { command, args: args ?? [], env });
				} else {
					this.sendJson(res, 400, { error: 'command or mcpUrl is required' });
					return;
				}
				this.sendJson(res, 200, { ok: true });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/mcp' && method === 'DELETE') {
			const name = url.searchParams.get('name');
			if (!name) {
				this.sendJson(res, 400, { error: 'name parameter required' });
				return;
			}
			try {
				await this.pool.removeMcpServer(name);
				this.sendJson(res, 200, { ok: true });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/mcp/login' && method === 'POST') {
			try {
				const body = JSON.parse(await this.readBody(req));
				const { serverName, sessionId } = body as { serverName: string; sessionId?: string };
				if (!serverName || !/^[\w\-. ()]+$/.test(serverName)) {
					this.sendJson(res, 400, { error: 'Invalid serverName' });
					return;
				}
				if (!sessionId || !/^[\w\-]+$/.test(sessionId)) {
					this.sendJson(res, 400, { error: 'Invalid sessionId' });
					return;
				}
				this.log(`[Server] MCP OAuth login requested for: ${serverName} (session: ${sessionId.slice(0, 8)})`);
				const result = await this.pool.mcpOAuthLogin(serverName, sessionId);
				this.sendJson(res, 200, result);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/mcp/discover-m365' && method === 'GET') {
			try {
				this.log('[Server] M365 MCP server discovery started');
				const result = await this.discoverM365Servers();
				this.sendJson(res, 200, result);
			} catch (e) {
				this.log(`[Server] M365 discovery failed: ${e}`);
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/mcp/m365-signin' && method === 'POST') {
			try {
				this.log('[Server] M365 OAuth sign-in started');
				const result = await this.m365OAuthSignIn();
				this.sendJson(res, 200, result);
			} catch (e) {
				this.log(`[Server] M365 OAuth sign-in failed: ${e}`);
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/models' && method === 'GET') {
			try {
				const allModels = await this.pool.listModels();
				const basePrice = Math.min(...allModels.filter((m: any) => m.billing?.tokenPrices?.inputPrice > 0).map((m: any) => m.billing.tokenPrices.inputPrice)) || 0;
				const models = allModels
					.filter((m: any) => !m.policy || m.policy.state === 'enabled')
					.map((m: any) => {
						const inputPrice = m.billing?.tokenPrices?.inputPrice;
						const computedMultiplier = basePrice > 0 && inputPrice > 0 ? Math.max(1, Math.round(inputPrice / basePrice)) : 0;
						return {
							id: m.id,
							name: m.name,
							contextWindow: m.capabilities?.limits?.max_context_window_tokens ?? 0,
							vision: !!m.capabilities?.supports?.vision,
							reasoning: !!m.capabilities?.supports?.adaptive_thinking,
							premium: !!m.billing?.is_premium || m.modelPickerPriceCategory === 'high',
							multiplier: m.billing?.multiplier ?? computedMultiplier,
							priceCategory: m.modelPickerPriceCategory ?? null,
						};
					});
				if (this.portalInfo) this.portalInfo = { ...this.portalInfo, models };
				this.sendJson(res, 200, models);
			} catch {
				this.sendJson(res, 200, this.portalInfo?.models ?? []);
			}
			return;
		}

		if (url.pathname === '/api/sessions' && method === 'GET') {
			try {
				const sessions = await this.pool.listSessions();
				this.sendJson(res, 200, sessions.map(s => ({
					...s,
					shielded: this.shields[s.sessionId] ?? false,
					context: s.context,
				})));
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
		if (sessionMatch && method === 'DELETE') {
			const sessionId = sessionMatch[1];
			if (this.shields[sessionId]) {
				this.sendJson(res, 403, { error: 'Session is shielded' });
				return;
			}
			try {
				await this.pool.deleteSession(sessionId);
				this.broadcastAll({ type: 'session_deleted', sessionId });
				// Clean up persisted data for this session
				delete this.sessionPrompts[sessionId];
				this.squadContextInjected.delete(sessionId);
				this.saveSessionPrompts();
				this.sendJson(res, 200, { ok: true });
				this.log(`[API] Deleted session: ${sessionId.slice(0, 8)}`);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const shieldMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/shield$/);
		if (shieldMatch && method === 'PATCH') {
			const sessionId = shieldMatch[1];
			this.shields[sessionId] = !this.shields[sessionId];
			if (!this.shields[sessionId]) delete this.shields[sessionId];
			this.saveShields();
			const shielded = this.shields[sessionId] ?? false;
			this.broadcastAll({ type: 'session_shield_changed', sessionId, shielded });
			this.sendJson(res, 200, { shielded });
			this.log(`[API] Session ${sessionId.slice(0, 8)} ${shielded ? 'shielded' : 'unshielded'}`);
			return;
		}

		// Agent management — requires active session
		const agentMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/agents(?:\/(.+))?$/);
		if (agentMatch) {
			const sessionId = agentMatch[1];
			const action = agentMatch[2]; // 'current', 'select', 'deselect', or undefined (list)
			const handle = this.pool.getHandle(sessionId);
			if (!handle) { this.sendJson(res, 404, { error: 'Session not found' }); return; }
			try {
				if (!action && method === 'GET') {
					// List available agents with source detection
					const agents = await handle.listAgents();
					const current = await handle.getCurrentAgent();
					// Detect source: check ~/.copilot/agents/ (user), CWD/.github/agents/ (repository), and git root/.github/agents/
					const sessions = await this.pool.listSessions().catch(() => []);
					const sessionMeta = sessions.find(s => s.sessionId === sessionId);
					const sessionContext = sessionMeta?.context as PortalSessionContext | undefined;
					const sessionCwd = sessionContext?.cwd ?? sessionContext?.workingDirectory;
					const gitRoot = sessionContext?.gitRoot;
					const userAgentsDir = path.join(os.homedir(), '.copilot', 'agents');
					const repoDirs: string[] = [];
					if (sessionCwd) repoDirs.push(path.join(sessionCwd, '.github', 'agents'));
					if (gitRoot && gitRoot !== sessionCwd) repoDirs.push(path.join(gitRoot, '.github', 'agents'));
					const agentsWithSource = agents.map(a => {
						let source = 'unknown';
						try { if (fs.existsSync(path.join(userAgentsDir, `${a.name}.agent.md`))) source = 'user'; } catch {}
						if (source === 'unknown') {
							for (const dir of repoDirs) {
								try {
									if (fs.existsSync(path.join(dir, `${a.name}.agent.md`))) { source = 'repository'; break; }
								} catch {}
							}
						}
						return { ...a, source };
					});
					this.sendJson(res, 200, { agents: agentsWithSource, current });
				} else if (action === 'select' && method === 'POST') {
					const body = await this.readBody(req);
					const { name } = JSON.parse(body) as { name: string };
					const agent = await handle.selectAgent(name);
					this.sessionAgents[sessionId] = name;
					this.saveSessionAgents();
					this.sendJson(res, 200, { agent });
					this.log(`[API] Agent selected for ${sessionId.slice(0, 8)}: ${name}`);
				} else if (action === 'deselect' && method === 'POST') {
					await handle.deselectAgent();
					delete this.sessionAgents[sessionId];
					this.saveSessionAgents();
					this.sendJson(res, 200, { ok: true });
					this.log(`[API] Agent deselected for ${sessionId.slice(0, 8)}`);
				} else {
					this.sendJson(res, 400, { error: 'Unknown agent action' });
				}
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Folder browser for CWD picker
		if (url.pathname === '/api/browse' && method === 'GET') {
			const browsePath = url.searchParams.get('path') || '';
			try {
				// No path on Windows → list drive letters
				if (!browsePath && process.platform === 'win32') {
					const drives: string[] = [];
					for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
						try { fs.accessSync(letter + ':\\'); drives.push(letter + ':'); } catch {}
					}
					this.sendJson(res, 200, { path: '', exists: true, isDir: true, folders: drives, isDriveList: true });
					return;
				}
				const resolved = browsePath ? path.resolve(browsePath) : path.parse(process.cwd()).root;
				const stat = fs.statSync(resolved);
				if (!stat.isDirectory()) { this.sendJson(res, 200, { path: resolved, exists: true, isDir: false, folders: [] }); return; }
				const entries = fs.readdirSync(resolved, { withFileTypes: true });
				const folders = entries
					.filter(e => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith('.') && e.name !== 'node_modules')
					.map(e => e.name)
					.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
				this.sendJson(res, 200, { path: resolved, exists: true, isDir: true, folders });
			} catch (e) {
				const errMsg = String(e);
				if (errMsg.includes('ENOENT')) this.sendJson(res, 200, { path: browsePath, exists: false, isDir: false, folders: [] });
				else if (errMsg.includes('EPERM') || errMsg.includes('EACCES')) this.sendJson(res, 200, { path: browsePath, exists: true, isDir: true, folders: [], error: 'Permission denied' });
				else this.sendJson(res, 500, { error: errMsg });
			}
			return;
		}

		if (url.pathname === '/api/browse' && method === 'POST') {
			try {
				const body = await this.readBody(req);
				const { parentPath, name } = JSON.parse(body) as { parentPath: string; name: string };
				if (!parentPath || !name || name === '.' || name === '..' || /[<>:"|?*]/.test(name) || name.includes('\\') || name.includes('/')) {
					this.sendJson(res, 400, { error: 'Invalid folder name' }); return;
				}
				const fullPath = path.join(path.resolve(parentPath), name);
				fs.mkdirSync(fullPath, { recursive: true });
				this.sendJson(res, 200, { path: fullPath, ok: true });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const cwdMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/cwd$/);
		if (cwdMatch && method === 'POST') {
			const sessionId = cwdMatch[1];
			try {
				const body = await this.readBody(req);
				const { workingDirectory } = JSON.parse(body) as { workingDirectory: string };
				if (!workingDirectory) { this.sendJson(res, 400, { error: 'workingDirectory required' }); return; }
				const resolved = path.resolve(workingDirectory);
				try { if (!fs.statSync(resolved).isDirectory()) { this.sendJson(res, 400, { error: 'Path is not a directory' }); return; } } catch { this.sendJson(res, 400, { error: 'Path does not exist' }); return; }
				await this.pool.changeCwd(sessionId, resolved);
				this.broadcastAll({ type: 'session_context_updated', sessionId, context: { cwd: workingDirectory } });
				this.sendJson(res, 200, { ok: true, context: { cwd: workingDirectory } });
				this.log(`[API] CWD changed for ${sessionId.slice(0, 8)} → ${workingDirectory}`);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const nameMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/name$/);
		if (nameMatch && method === 'POST') {
			const sessionId = nameMatch[1];
			try {
				const body = await this.readBody(req);
				const { name } = JSON.parse(body) as { name: string };
				const trimmed = (name ?? '').trim();
				if (!trimmed) { this.sendJson(res, 400, { error: 'name required' }); return; }
				if (trimmed.length > 100) { this.sendJson(res, 400, { error: 'name must be 100 characters or fewer' }); return; }
				// setName fires onTitleChanged → broadcasts session_renamed to all clients.
				await this.pool.setName(sessionId, trimmed);
				this.sendJson(res, 200, { ok: true, summary: trimmed });
				this.log(`[API] Session ${sessionId.slice(0, 8)} renamed → ${trimmed}`);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}


		if (url.pathname === '/api/sessions' && method === 'POST') {
			const body = await this.readBody(req);
			const { sessionId, workingDirectory } = JSON.parse(body || '{}') as { sessionId?: string; workingDirectory?: string };
			try {
				// Validate workingDirectory if provided
				let resolvedCwd: string | undefined;
				if (workingDirectory) {
					resolvedCwd = path.resolve(workingDirectory);
					try { if (!fs.statSync(resolvedCwd).isDirectory()) { this.sendJson(res, 400, { error: 'Path is not a directory' }); return; } } catch { this.sendJson(res, 400, { error: 'Path does not exist' }); return; }
				}
				if (sessionId) {
					// Pre-warm: connect to the session so it's ready when client navigates
					await this.pool.connect(sessionId);
					this.sendJson(res, 200, { sessionId });
				} else {
					const handle = await this.pool.create(resolvedCwd);
					const newId = handle.sessionId;
					// Broadcast so other clients' pickers update
					const sessions = await this.pool.listSessions().catch(() => []);
					this.loadShields();
					const newSession = sessions.find(s => s.sessionId === newId);
					if (newSession) {
						this.broadcastAll({ type: 'session_created', session: { ...newSession, shielded: this.shields[newId] ?? false } });
					}
					this.sendJson(res, 201, { sessionId: newId });
				}
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// --- Update management endpoints ---

		if (url.pathname === '/api/updates' && method === 'GET') {
			this.sendJson(res, 200, this.updater.getStatus());
			return;
		}

		if (url.pathname === '/api/updates/check' && method === 'POST') {
			if (CONTAINER_MODE) { this.sendJson(res, 200, this.updater.getStatus()); return; }
			const status = await this.updater.check();
			this.sendJson(res, 200, status);
			return;
		}

		if (url.pathname === '/api/updates/apply' && method === 'POST') {
			if (CONTAINER_MODE) {
				this.sendJson(res, 200, { ...this.updater.getStatus(), error: 'Updates are managed by the container image — rebuild or pull a new image to update.' });
				return;
			}
			if (this.updater.getStatus().applying) {
				this.sendJson(res, 409, { error: 'Update already in progress' });
				return;
			}
			const status = await this.updater.apply();
			this.sendJson(res, 200, status);
			return;
		}

		if (url.pathname === '/api/updates/apply-portal' && method === 'POST') {
			if (CONTAINER_MODE) {
				this.sendJson(res, 200, { ...this.updater.getStatus(), error: 'Updates are managed by the container image — rebuild or pull a new image to update.' });
				return;
			}
			if (this.updater.getStatus().applying) {
				this.sendJson(res, 409, { error: 'Update already in progress' });
				return;
			}
			const status = await this.updater.applyPortalUpdate();
			// Force restartNeeded if no error — the running process always needs restart after portal update
			if (!status.error) status.restartNeeded = true;
			this.sendJson(res, 200, status);
			return;
		}

		if (url.pathname === '/api/quota' && method === 'GET') {
			try {
				const quota = await this.pool.getQuota();
				this.sendJson(res, 200, quota);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Themes — server-stored so they sync across devices
		if (url.pathname === '/api/themes' && method === 'GET') {
			try {
				const themesFile = path.join(this.dataDir, 'themes.json');
				if (fs.existsSync(themesFile)) {
					const data = JSON.parse(fs.readFileSync(themesFile, 'utf8'));
					this.sendJson(res, 200, data);
				} else {
					this.sendJson(res, 200, { themes: [], active: 'dark' });
				}
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}
		if (url.pathname === '/api/themes' && method === 'POST') {
			try {
				const body = await this.readBody(req);
				const data = JSON.parse(body);
				const themesFile = path.join(this.dataDir, 'themes.json');
				fs.writeFileSync(themesFile, JSON.stringify(data, null, 2) + '\n');
				this.sendJson(res, 200, { ok: true });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Per-session theme — GET returns theme ID for a session, POST sets it
		const sessionThemeMatch = url.pathname.match(/^\/api\/session-theme\/(.+)$/);
		if (sessionThemeMatch && method === 'GET') {
			const sid = decodeURIComponent(sessionThemeMatch[1]);
			const themesFile = path.join(this.dataDir, 'session-themes.json');
			try {
				const data = fs.existsSync(themesFile) ? JSON.parse(fs.readFileSync(themesFile, 'utf8')) : {};
				this.sendJson(res, 200, { themeId: data[sid] ?? null });
			} catch { this.sendJson(res, 200, { themeId: null }); }
			return;
		}
		if (sessionThemeMatch && method === 'POST') {
			const sid = decodeURIComponent(sessionThemeMatch[1]);
			try {
				const body = await this.readBody(req);
				const { themeId } = JSON.parse(body) as { themeId: string | null };
				const themesFile = path.join(this.dataDir, 'session-themes.json');
				const data = fs.existsSync(themesFile) ? JSON.parse(fs.readFileSync(themesFile, 'utf8')) : {};
				if (themeId) data[sid] = themeId; else delete data[sid];
				fs.writeFileSync(themesFile, JSON.stringify(data, null, 2) + '\n');
				this.sendJson(res, 200, { ok: true });
			} catch (e) { this.sendJson(res, 500, { error: String(e) }); }
			return;
		}

		if (url.pathname === '/api/restart' && method === 'POST') {
			// Hard gate: never restart while an update is being applied. npm install /
			// build / portal-zip extraction are mid-write; exiting here corrupts
			// node_modules or dist. This is the single most important safety rail.
			if (this.updater.isBusy()) {
				this.sendJson(res, 409, {
					error: 'Update in progress',
					updateInProgress: true,
					message: 'An update is being applied. Wait for it to finish before restarting.',
				});
				return;
			}

			// Check for active turns across all sessions
			const activeSessions = this.pool.getActiveTurnSessions();

			const body = await this.readBody(req).catch(() => '{}');
			const { force } = JSON.parse(body || '{}') as { force?: boolean };

			if (activeSessions.length > 0 && !force) {
				this.sendJson(res, 409, {
					error: 'Active turns in progress',
					activeSessions: activeSessions.map(id => id.slice(0, 8)),
					message: 'Sessions have active turns. Wait for them to finish or use force:true to restart anyway.',
				});
				return;
			}

			this.sendJson(res, 200, { ok: true, message: 'Restarting...' });
			this.log('[Server] Restart requested — graceful shutdown...');

			// Notify all connected clients that a restart is imminent
			this.broadcastAll({ type: 'info', content: 'Server restarting…' });

			// Graceful shutdown: stop pool (disconnects sessions), close HTTP, exit with restart code
			setTimeout(async () => {
				await this.stop();
				process.exit(75);
			}, 500); // small delay so the HTTP response and broadcast can flush
			return;
		}

		if (url.pathname === '/api/restart-cli' && method === 'POST') {
			if (this.updater.isBusy()) {
				this.sendJson(res, 409, {
					error: 'Update in progress',
					updateInProgress: true,
					message: 'An update is being applied. Wait for it to finish before restarting the Copilot server.',
				});
				return;
			}
			if (!this.pool.shared) {
				this.sendJson(res, 400, { error: 'Not in connected mode — CLI is managed by SDK' });
				return;
			}
			this.log('[Server] CLI server restart requested');
			this.sendJson(res, 200, { ok: true });
			this.broadcastAll({ type: 'cli_status', status: 'restarting' });
			// Stop SDK client, kill CLI server, relaunch, reconnect
			setTimeout(async () => {
				try {
					await this.pool.stop();
					this.broadcastAll({ type: 'cli_status', status: 'disconnected' });
					// Kill CLI process on port 3848
					if (process.platform === 'win32') {
						spawnSync('pwsh', ['-NoProfile', '-Command',
							'Get-NetTCPConnection -LocalPort 3848 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }'
						], { stdio: 'ignore', windowsHide: true });
					} else {
						try { execSync("kill $(lsof -ti:3848) 2>/dev/null", { stdio: 'ignore' }); } catch { /* no process */ }
					}
					// Wait for port to free
					await new Promise(r => setTimeout(r, 1000));
					// Relaunch CLI server
					if (process.platform === 'win32') {
						const which = spawnSync('where.exe', ['copilot.exe'], { stdio: 'pipe', windowsHide: true });
						if (which.status === 0) {
							const copilotPath = which.stdout.toString().trim().split(/\r?\n/)[0];
							// Raise CLI heap on relaunch too, or the OOM recurs on the next big resume (cli-env.ts).
							exec(`pwsh -NoProfile -Command "$env:NODE_OPTIONS='${cliNodeOptions()}'; Start-Process -FilePath '${copilotPath}' -ArgumentList '--server','--port','3848' -WindowStyle Hidden"`, { windowsHide: true });
						}
					} else {
						exec('copilot --server --port 3848 &', { env: cliSpawnEnv() });
					}
					// Wait for CLI to start
					for (let i = 0; i < 30; i++) {
						const ok = await new Promise<boolean>(resolve => {
							const s = net.createConnection({ port: 3848, host: 'localhost' }, () => { s.destroy(); resolve(true); });
							s.on('error', () => resolve(false));
							s.setTimeout(500, () => { s.destroy(); resolve(false); });
						});
						if (ok) break;
						await new Promise(r => setTimeout(r, 1000));
					}
					this.log('[Server] CLI server restarted — reconnecting SDK');
					await this.pool.restart();
					this.log('[Server] SDK reconnected');
					this.broadcastAll({ type: 'cli_status', status: 'connected' });
				} catch (e) {
					this.log(`[Server] CLI restart failed: ${e}`);
					this.broadcastAll({ type: 'cli_status', status: 'error' });
				}
			}, 500);
			return;
		}

		if (url.pathname === '/api/guides' && method === 'GET') {
			try {
				const instrDir = path.join(this.dataDir, 'guides');
				const promptsDir = path.join(this.dataDir, 'prompts');
				const instrFiles = fs.existsSync(instrDir) ? fs.readdirSync(instrDir).filter(f => f.endsWith('.md')) : [];
				const promptFiles = fs.existsSync(promptsDir) ? fs.readdirSync(promptsDir).filter(f => f.endsWith('.md')) : [];
				const allIds = [...new Set([...instrFiles.map(f => f.replace(/\.md$/, '')), ...promptFiles.map(f => f.replace(/\.md$/, ''))])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
				const items = allIds.map(id => ({
					id,
					name: id + '.md',
					file: id + '.md',
					hasGuide: instrFiles.includes(id + '.md'),
					hasPrompts: promptFiles.includes(id + '.md'),
				}));
				this.sendJson(res, 200, items);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const promptsMatch = url.pathname.match(/^\/api\/guides\/(.+)\/prompts$/);
		if (promptsMatch && method === 'GET') {
			try {
				const promptsFile = path.join(this.dataDir, 'prompts', decodeURIComponent(promptsMatch[1]) + '.md');
				const resolved = path.resolve(promptsFile);
				const promptsDir = path.resolve(path.join(this.dataDir, 'prompts'));
				if (!resolved.startsWith(promptsDir + path.sep)) { this.sendJson(res, 403, { error: 'Forbidden' }); return; }
				if (!fs.existsSync(resolved)) { this.sendJson(res, 200, { prompts: [] }); return; }
				const content = fs.readFileSync(resolved, 'utf8');
				const prompts: Array<{ label: string; text: string }> = [];
				let currentLabel = '';
				let currentLines: string[] = [];
				for (const line of content.split('\n')) {
					if (line.startsWith('## ')) {
						if (currentLabel && currentLines.length) {
							prompts.push({ label: currentLabel, text: currentLines.join('\n').trim() });
						}
						currentLabel = line.replace(/^##\s*/, '').trim();
						currentLines = [];
					} else if (currentLabel && !line.startsWith('# ')) {
						currentLines.push(line);
					}
				}
				if (currentLabel && currentLines.length) {
					prompts.push({ label: currentLabel, text: currentLines.join('\n').trim() });
				}
				this.sendJson(res, 200, { prompts, filePath: resolved });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const contextMatch = url.pathname.match(/^\/api\/guides\/(.+)$/);
		if (contextMatch && method === 'GET') {
			try {
				const contextFile = path.join(this.dataDir, 'guides', decodeURIComponent(contextMatch[1]) + '.md');
				const resolved = path.resolve(contextFile);
				const contextsDir = path.resolve(path.join(this.dataDir, 'guides'));
				if (!resolved.startsWith(contextsDir + path.sep)) { this.sendJson(res, 403, { error: 'Forbidden' }); return; }
				if (!fs.existsSync(resolved)) { this.sendJson(res, 404, { error: 'Context not found' }); return; }
				const fileContent = fs.readFileSync(resolved, 'utf8');
				const firstLine = fileContent.split('\n')[0].replace(/^#\s*/, '').trim();
				this.sendJson(res, 200, { filePath: resolved, title: firstLine, content: fileContent });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (contextMatch && method === 'DELETE') {
			try {
				const id = decodeURIComponent(contextMatch[1]);
				const instrFile = path.resolve(path.join(this.dataDir, 'guides', id + '.md'));
				const promptFile = path.resolve(path.join(this.dataDir, 'prompts', id + '.md'));
				const instrDir = path.resolve(path.join(this.dataDir, 'guides'));
				const promptsDir = path.resolve(path.join(this.dataDir, 'prompts'));
				// Path traversal check
				if (!instrFile.startsWith(instrDir + path.sep) || !promptFile.startsWith(promptsDir + path.sep)) {
					this.sendJson(res, 403, { error: 'Forbidden' }); return;
				}
				let deleted = false;
				if (fs.existsSync(instrFile)) { fs.unlinkSync(instrFile); deleted = true; }
				if (fs.existsSync(promptFile)) { fs.unlinkSync(promptFile); deleted = true; }
				if (!deleted) { this.sendJson(res, 404, { error: 'Not found' }); return; }
				this.sendJson(res, 200, { ok: true });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/squad/files' && method === 'GET') {
			this.sendJson(res, 200, { files: this.squadReader.listFiles() });
			return;
		}

		if (url.pathname === '/api/squad/file' && method === 'GET') {
			const filePath = url.searchParams.get('path');
			if (!filePath) {
				this.sendJson(res, 400, { error: 'path required' });
				return;
			}
			const result = this.squadReader.readFile(filePath);
			if ('content' in result) this.sendJson(res, 200, result);
			else this.sendJson(res, result.status, { error: result.error });
			return;
		}

		if (url.pathname === '/api/squad/team' && method === 'GET') {
			const result = this.squadReader.readFile('team.md');
			if ('content' in result) this.sendJson(res, 200, result);
			else this.sendJson(res, result.status, { error: result.error });
			return;
		}

		if (url.pathname === '/api/squad/decisions' && method === 'GET') {
			const result = this.squadReader.readFile('decisions.md');
			if ('content' in result) this.sendJson(res, 200, result);
			else this.sendJson(res, result.status, { error: result.error });
			return;
		}

		if (url.pathname === '/api/squad/guide' && method === 'GET') {
			this.sendJson(res, 200, { content: this.squadReader.generateGuide() });
			return;
		}

		if (url.pathname === '/api/squad/prompts' && method === 'GET') {
			this.sendJson(res, 200, { prompts: this.squadReader.generatePrompts() });
			return;
		}

		// Save a generated context file
		if (url.pathname === '/api/guides' && method === 'POST') {
			try {
				const body = await this.readBody(req);
				const { id, content } = JSON.parse(body) as { id?: string; content?: string };
				if (!id || !content) { this.sendJson(res, 400, { error: 'id and content required' }); return; }
				if (!/^[a-zA-Z0-9_-]+$/.test(id)) { this.sendJson(res, 400, { error: 'id must be alphanumeric with dashes/underscores only' }); return; }
				const contextsDir = path.join(this.dataDir, 'guides');
				if (!fs.existsSync(contextsDir)) fs.mkdirSync(contextsDir, { recursive: true });
				const filePath = path.join(contextsDir, id + '.md');
				fs.writeFileSync(filePath, content, 'utf8');
				this.log(`[Guides] Saved guide: ${id} (${content.length} bytes)`);
				this.sendJson(res, 200, { ok: true, id });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Save/create a prompts file
		if (url.pathname === '/api/prompts' && method === 'POST') {
			try {
				const body = await this.readBody(req);
				const { id, content } = JSON.parse(body) as { id?: string; content?: string };
				if (!id || !content) { this.sendJson(res, 400, { error: 'id and content required' }); return; }
				if (!/^[a-zA-Z0-9_-]+$/.test(id)) { this.sendJson(res, 400, { error: 'id must be alphanumeric with dashes/underscores only' }); return; }
				const promptsDir = path.join(this.dataDir, 'prompts');
				if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });
				const filePath = path.join(promptsDir, id + '.md');
				fs.writeFileSync(filePath, content, 'utf8');
				this.log(`[Prompts] Saved prompts: ${id} (${content.length} bytes)`);
				this.sendJson(res, 200, { ok: true, id });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// List examples (from examples/ directory, read-only catalog)
		if (url.pathname === '/api/examples' && method === 'GET') {
			try {
				const exBase = path.join(__dirname, '..', 'examples');
				const guidesDir = path.join(exBase, 'guides');
				const promptsDir = path.join(exBase, 'prompts');
				const guideFiles = fs.existsSync(guidesDir) ? fs.readdirSync(guidesDir).filter(f => f.endsWith('.md')) : [];
				const promptFiles = fs.existsSync(promptsDir) ? fs.readdirSync(promptsDir).filter(f => f.endsWith('.md')) : [];
				const allIds = [...new Set([...guideFiles.map(f => f.replace(/\.md$/, '')), ...promptFiles.map(f => f.replace(/\.md$/, ''))])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
				const items = allIds.map(id => ({
					id,
					name: id + '.md',
					hasGuide: guideFiles.includes(id + '.md'),
					hasPrompts: promptFiles.includes(id + '.md'),
				}));
				this.sendJson(res, 200, items);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Get example guide content
		const examplePromptsMatch = url.pathname.match(/^\/api\/examples\/(.+)\/prompts$/);
		if (examplePromptsMatch && method === 'GET') {
			try {
				const promptsFile = path.join(__dirname, '..', 'examples', 'prompts', decodeURIComponent(examplePromptsMatch[1]) + '.md');
				const resolved = path.resolve(promptsFile);
				const exDir = path.resolve(path.join(__dirname, '..', 'examples', 'prompts'));
				if (!resolved.startsWith(exDir + path.sep)) { this.sendJson(res, 403, { error: 'Forbidden' }); return; }
				if (!fs.existsSync(resolved)) { this.sendJson(res, 200, { content: '' }); return; }
				this.sendJson(res, 200, { content: fs.readFileSync(resolved, 'utf8') });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const exampleMatch = url.pathname.match(/^\/api\/examples\/(.+)$/);
		if (exampleMatch && method === 'GET') {
			try {
				const guideFile = path.join(__dirname, '..', 'examples', 'guides', decodeURIComponent(exampleMatch[1]) + '.md');
				const resolved = path.resolve(guideFile);
				const exDir = path.resolve(path.join(__dirname, '..', 'examples', 'guides'));
				if (!resolved.startsWith(exDir + path.sep)) { this.sendJson(res, 403, { error: 'Forbidden' }); return; }
				if (!fs.existsSync(resolved)) { this.sendJson(res, 200, { content: '' }); return; }
				this.sendJson(res, 200, { content: fs.readFileSync(resolved, 'utf8') });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Copy example to user's data directory
		if (url.pathname === '/api/guides/from-example' && method === 'POST') {
			try {
				const body = await this.readBody(req);
				const { exampleId, copyGuide, copyPrompts, name } = JSON.parse(body) as { exampleId: string; copyGuide?: boolean; copyPrompts?: boolean; name?: string };
				if (!exampleId || !/^[a-zA-Z0-9_-]+$/.test(exampleId)) { this.sendJson(res, 400, { error: 'exampleId must be alphanumeric with dashes/underscores only' }); return; }
				const targetName = name || exampleId;
				if (!/^[a-zA-Z0-9_-]+$/.test(targetName)) { this.sendJson(res, 400, { error: 'name must be alphanumeric with dashes/underscores only' }); return; }
				const exBase = path.join(__dirname, '..', 'examples');
				const copied: string[] = [];
				if (copyGuide !== false) {
					const src = path.join(exBase, 'guides', exampleId + '.md');
					if (fs.existsSync(src)) {
						const dest = path.join(this.dataDir, 'guides', targetName + '.md');
						fs.mkdirSync(path.dirname(dest), { recursive: true });
						fs.copyFileSync(src, dest);
						copied.push('guide');
					}
				}
				if (copyPrompts !== false) {
					const src = path.join(exBase, 'prompts', exampleId + '.md');
					if (fs.existsSync(src)) {
						const dest = path.join(this.dataDir, 'prompts', targetName + '.md');
						fs.mkdirSync(path.dirname(dest), { recursive: true });
						fs.copyFileSync(src, dest);
						copied.push('prompts');
					}
				}
				this.log(`[Guides] Copied example "${exampleId}" → "${targetName}" (${copied.join(', ') || 'nothing to copy'})`);
				this.sendJson(res, 200, { ok: true, id: targetName, copied });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Rename a guide/prompts pair
		if (url.pathname === '/api/guides/rename' && method === 'POST') {
			try {
				const body = await this.readBody(req);
				const { oldId, newId } = JSON.parse(body) as { oldId?: string; newId?: string };
				if (!oldId || !newId) { this.sendJson(res, 400, { error: 'oldId and newId required' }); return; }
				if (!/^[a-zA-Z0-9_-]+$/.test(oldId)) { this.sendJson(res, 400, { error: 'oldId must be alphanumeric with dashes/underscores only' }); return; }
				if (!/^[a-zA-Z0-9_-]+$/.test(newId)) { this.sendJson(res, 400, { error: 'newId must be alphanumeric with dashes/underscores only' }); return; }
				const renamed: string[] = [];
				for (const sub of ['guides', 'prompts']) {
					const oldFile = path.join(this.dataDir, sub, oldId + '.md');
					const newFile = path.join(this.dataDir, sub, newId + '.md');
					if (fs.existsSync(oldFile)) {
						fs.renameSync(oldFile, newFile);
						renamed.push(sub);
					}
				}
				this.log(`[Guides] Renamed "${oldId}" → "${newId}" (${renamed.join(', ') || 'no files found'})`);
				this.sendJson(res, 200, { ok: true, renamed });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Import preview — fetch a GitHub Gist and parse guide/prompt pairs
		if (url.pathname === '/api/guides/import-preview' && method === 'POST') {
			try {
				const body = await this.readBody(req);
				const { url: gistUrl } = JSON.parse(body) as { url?: string };
				if (!gistUrl) { this.sendJson(res, 400, { error: 'url required' }); return; }
				const gistMatch = gistUrl.match(/gist\.github\.com\/[\w-]+\/([a-f0-9]+)/);
				if (!gistMatch) { this.sendJson(res, 400, { error: 'URL must be a GitHub Gist (gist.github.com/user/id)' }); return; }
				const gistId = gistMatch[1];
				const gist = await this.fetchGist(gistId);
				if (!gist) { this.sendJson(res, 404, { error: 'Could not fetch gist. It may be private — ensure gh CLI is authenticated.' }); return; }
				const items = this.parseGistFiles(gist.files);
				this.sendJson(res, 200, { gistId, description: gist.description ?? '', items });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Import — save selected items from a gist to data/
		if (url.pathname === '/api/guides/import' && method === 'POST') {
			try {
				const body = await this.readBody(req);
				const { gistId, url: gistUrl, items } = JSON.parse(body) as {
					gistId: string; url: string;
					items: Array<{ name: string; guideContent?: string; promptsContent?: string }>;
				};
				if (!items?.length) { this.sendJson(res, 400, { error: 'No items to import' }); return; }
				const imported: string[] = [];
				for (const item of items) {
					if (!/^[a-zA-Z0-9_-]+$/.test(item.name)) continue;
					if (item.guideContent) {
						fs.writeFileSync(path.join(this.dataDir, 'guides', item.name + '.md'), item.guideContent);
					}
					if (item.promptsContent) {
						fs.writeFileSync(path.join(this.dataDir, 'prompts', item.name + '.md'), item.promptsContent);
					}
					imported.push(item.name);
				}
				// Track import metadata
				const importsFile = path.join(this.dataDir, 'imports.json');
				let imports: Record<string, unknown> = {};
				try { if (fs.existsSync(importsFile)) imports = JSON.parse(fs.readFileSync(importsFile, 'utf8')); } catch {}
				imports[gistId] = { url: gistUrl, importedAt: new Date().toISOString(), items: imported };
				fs.writeFileSync(importsFile, JSON.stringify(imports, null, 2) + '\n');
				this.log(`[Import] Imported ${imported.length} items from gist ${gistId}: ${imported.join(', ')}`);
				this.sendJson(res, 200, { imported });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Session prompts — per-session persistent storage
		const sessionPromptsMatch = url.pathname.match(/^\/api\/session-prompts\/(.+)$/);
		if (sessionPromptsMatch && method === 'GET') {
			const sid = decodeURIComponent(sessionPromptsMatch[1]);
			this.sendJson(res, 200, { prompts: this.sessionPrompts[sid] ?? [] });
			return;
		}
		if (sessionPromptsMatch && method === 'POST') {
			try {
				const sid = decodeURIComponent(sessionPromptsMatch[1]);
				const body = await this.readBody(req);
				const { prompts } = JSON.parse(body) as { prompts: Array<{ label: string; text: string }> };
				this.sessionPrompts[sid] = prompts;
				this.saveSessionPrompts();
				this.sendJson(res, 200, { ok: true });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/' || url.pathname === '/index.html') {
			// Serve the HTML unconditionally — auth is handled client-side via localStorage token.
			// API and WebSocket endpoints still require the token.
			// This allows PWA home screen launches (no token in start_url) to work.
			const indexPath = path.join(this.webuiPath, 'index.html');
			fs.readFile(indexPath, 'utf8', (err, html) => {
				if (err) { res.writeHead(404); res.end('Web UI not built.'); return; }
				res.writeHead(200, {
					'Content-Type': 'text/html',
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					...this.securityHeaders(req),
				});
				res.end(html);
			});
			return;
		}

		const filePath = path.resolve(path.join(this.webuiPath, url.pathname));
		const webuiResolved = path.resolve(this.webuiPath);
		if (!filePath.startsWith(webuiResolved + path.sep) && filePath !== webuiResolved) {
			res.writeHead(403); res.end('Forbidden'); return;
		}
		fs.readFile(filePath, (err, data) => {
			if (err) { res.writeHead(404); res.end('Not found'); return; }
			const mime: Record<string, string> = {
				'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
				'.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
				'.json': 'application/json', '.webmanifest': 'application/manifest+json',
			};
			res.writeHead(200, {
				'Content-Type': mime[path.extname(filePath)] ?? 'application/octet-stream',
				...this.securityHeaders(req),
			});
			res.end(data);
		});
	}

	/** Discover M365 MCP servers by parsing OAuth token scopes and probing Agent365. */
	private async discoverM365Servers(): Promise<{ tenantId: string | null; servers: Array<{ name: string; label: string; toolCount: number; description: string; url?: string }> }> {
		// Scope name → server URL name (where they differ)
		const scopeToServer: Record<string, string> = {
			'Calendar': 'mcp_CalendarTools',
			'CopilotMCP': 'mcp_M365Copilot',
			'TaskPersonalization': 'mcp_TaskPersonalizationServer',
			'Mail': 'mcp_MailTools',
			'Knowledge': 'mcp_KnowledgeTools',
			'WebSearch': 'mcp_WebSearchTools',
			'Admin365Graph': 'mcp_AdminTools',
		};
		// Known metadata for discovered servers
		const serverMeta: Record<string, { label: string; description: string; url?: string }> = {
			'Teams': { label: 'Teams', description: 'Messages, channels, chats, files, search', url: 'https://github.com/microsoft/mcp#-microsoft-teams' },
			'Calendar': { label: 'Calendar', description: 'Events, meeting times, rooms, RSVP', url: 'https://github.com/microsoft/mcp#-microsoft-365-calendar' },
			'Planner': { label: 'Planner', description: 'Plans, goals, tasks, groups', url: 'https://github.com/microsoft/mcp' },
			'Mail': { label: 'Mail', description: 'Email messages and folders', url: 'https://github.com/microsoft/mcp#-microsoft-365-mail' },
			'Me': { label: 'People', description: 'User details, manager, reports', url: 'https://github.com/microsoft/mcp#-microsoft-365-user' },
			'Word': { label: 'Word', description: 'Create documents, comments', url: 'https://github.com/microsoft/mcp' },
			'Excel': { label: 'Excel', description: 'Create workbooks, comments', url: 'https://github.com/microsoft/mcp' },
			'Powerpoint': { label: 'PowerPoint', description: 'Presentations', url: 'https://github.com/microsoft/mcp' },
			'CopilotMCP': { label: 'M365 Copilot', description: 'Ask Microsoft 365 Copilot', url: 'https://github.com/microsoft/mcp#-microsoft-365-copilot-chat' },
			'OneDrive': { label: 'OneDrive', description: 'File storage and sharing', url: 'https://github.com/microsoft/mcp' },
			'SharePoint': { label: 'SharePoint', description: 'Sites and document libraries', url: 'https://github.com/microsoft/mcp' },
			'TaskPersonalization': { label: 'Automations', description: 'Event triggers and automation rules', url: 'https://github.com/microsoft/mcp' },
			'WebSearch': { label: 'Web Search', description: 'Search the web', url: 'https://github.com/microsoft/mcp' },
			'Knowledge': { label: 'Knowledge', description: 'Organizational knowledge', url: 'https://github.com/microsoft/mcp' },
			'Files': { label: 'Files', description: 'File management', url: 'https://github.com/microsoft/mcp' },
			'Admin365Graph': { label: 'Admin Center', description: 'Microsoft 365 admin tools', url: 'https://github.com/microsoft/mcp#%EF%B8%8F-microsoft-admin-center' },
		};

		const home = os.homedir();
		const oauthDir = path.join(home, '.copilot', 'mcp-oauth-config');

		// 1. Extract tenant ID and server list from cached OAuth token scopes
		let tenantId: string | null = null;
		let accessToken: string | null = null;
		let refreshToken: string | null = null;
		let refreshClientId: string | null = null;
		let refreshFilePath: string | null = null;
		let discoveredScopes: string[] = [];
		if (fs.existsSync(oauthDir)) {
			for (const file of fs.readdirSync(oauthDir).filter(f => f.endsWith('.tokens.json'))) {
				try {
					const tokens = JSON.parse(fs.readFileSync(path.join(oauthDir, file), 'utf8'));
					if (tokens.accessToken && typeof tokens.accessToken === 'string') {
						const parts = tokens.accessToken.split('.');
						if (parts.length === 3) {
							const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
							const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
							const payload = JSON.parse(Buffer.from(padded, 'base64').toString());
							if (payload.tid && !tenantId) tenantId = payload.tid;
							if (payload.scp) {
								const scopes = (payload.scp as string).split(' ');
								for (const scope of scopes) {
									const match = scope.match(/^McpServers\.(.+)\.All$/);
									if (match && !discoveredScopes.includes(match[1])) {
										discoveredScopes.push(match[1]);
									}
								}
							}
							if (tokens.expiresAt > Date.now() / 1000 && !accessToken) {
								accessToken = tokens.accessToken;
							} else if (!accessToken && tokens.refreshToken && !refreshToken) {
								refreshToken = tokens.refreshToken;
								refreshFilePath = path.join(oauthDir, file);
								// Read client ID from the config file
								const configFile = path.join(oauthDir, file.replace('.tokens.json', '.json'));
								try {
									const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
									refreshClientId = config.clientId;
								} catch {}
							}
						}
					}
				} catch { /* skip */ }
			}
		}
		// Fallback: try az CLI for tenant
		if (!tenantId) {
			try {
				const result = spawnSync('az', ['account', 'show', '--query', 'tenantId', '-o', 'tsv'], { stdio: 'pipe', windowsHide: true, timeout: 5000 });
				if (result.status === 0) tenantId = result.stdout.toString().trim();
			} catch { /* no az */ }
		}
		// Fallback: resolve tenant from GitHub user's company domain
		if (!tenantId) {
			try {
				const auth = await this.pool.getAuthStatus();
				if (auth.login) {
					// Try to get company from GitHub API
					const ghResult = spawnSync('gh', ['api', 'user', '--jq', '.company'], { stdio: 'pipe', windowsHide: true, timeout: 5000 });
					if (ghResult.status === 0) {
						const company = ghResult.stdout.toString().trim().replace(/^@/, '').toLowerCase();
						if (company) {
							const domain = company.includes('.') ? company : `${company}.com`;
							const resp = await fetch(`https://login.microsoftonline.com/${domain}/.well-known/openid-configuration`);
							if (resp.ok) {
								const data = await resp.json() as { token_endpoint?: string };
								const match = data.token_endpoint?.match(/\/([a-f0-9-]{36})\//);
								if (match) tenantId = match[1];
							}
						}
					}
				}
			} catch { /* skip */ }
		}

		// Build server list from discovered scopes
		const buildServerList = () => discoveredScopes.map(scope => {
			const serverName = scopeToServer[scope] ?? `mcp_${scope}Server`;
			const meta = serverMeta[scope];
			return {
				name: serverName,
				label: meta?.label ?? scope,
				description: meta?.description ?? scope,
				url: meta?.url,
				toolCount: -1,
			};
		});

		if (!tenantId) {
			return { tenantId: null, servers: discoveredScopes.length > 0 ? buildServerList() : [] };
		}

		if (!accessToken && refreshToken && refreshClientId) {
			// Try to refresh the expired token
			try {
				this.log('[Server] M365 discovery: refreshing expired token…');
				const tokenResp = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						client_id: refreshClientId,
						grant_type: 'refresh_token',
						refresh_token: refreshToken,
						scope: 'https://agent365.svc.cloud.microsoft/.default offline_access',
					}).toString(),
				});
				if (tokenResp.ok) {
					const tokenData = await tokenResp.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
					accessToken = tokenData.access_token;
					// Update the token file
					if (refreshFilePath) {
						const existing = JSON.parse(fs.readFileSync(refreshFilePath, 'utf8'));
						existing.accessToken = tokenData.access_token;
						if (tokenData.refresh_token) existing.refreshToken = tokenData.refresh_token;
						existing.expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;
						existing.scope = tokenData.scope;
						fs.writeFileSync(refreshFilePath, JSON.stringify(existing));
					}
					this.log('[Server] M365 discovery: token refreshed');
				}
			} catch (e) {
				this.log(`[Server] M365 token refresh failed: ${e}`);
			}
		}

		if (!accessToken) {
			const servers = buildServerList();
			this.log(`[Server] M365 discovery: tenant=${tenantId.slice(0, 8)}…, ${servers.length} servers from scopes (no token for probing)`);
			return { tenantId, servers };
		}

		// Probe each discovered server for tool counts
		const serversToProbe = buildServerList();
		const base = `https://agent365.svc.cloud.microsoft/agents/tenants/${tenantId}/servers`;
		const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
		const toolsBody = JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'tools/list', params: {} });

		const results = await Promise.allSettled(serversToProbe.map(async (s) => {
			try {
				const resp = await fetch(`${base}/${s.name}`, { method: 'POST', headers, body: toolsBody });
				if (!resp.ok) return { ...s, toolCount: 0 };
				const text = await resp.text();
				const json = JSON.parse(text.replace(/^event: message\ndata: /, ''));
				return { ...s, toolCount: json.result?.tools?.length ?? 0 };
			} catch {
				return { ...s, toolCount: 0 };
			}
		}));

		const servers = results
			.map(r => r.status === 'fulfilled' ? r.value : null)
			.filter((s): s is NonNullable<typeof s> => s !== null)
			.sort((a, b) => b.toolCount - a.toolCount);

		this.log(`[Server] M365 discovery: tenant=${tenantId.slice(0, 8)}…, ${servers.filter(s => s.toolCount > 0).length}/${servers.length} servers with tools`);
		return { tenantId, servers };
	}

	/** Run OAuth authorization code + PKCE flow against Microsoft Entra ID to get Agent365 token. */
	private async m365OAuthSignIn(): Promise<{ tenantId: string | null; scopeCount: number }> {
		const clientId = 'aebc6443-996d-45c2-90f0-388ff96faa56';
		const scope = 'https://agent365.svc.cloud.microsoft/.default offline_access';
		const authBase = 'https://login.microsoftonline.com/organizations/oauth2/v2.0';

		// Generate PKCE challenge
		const codeVerifier = crypto.randomBytes(32).toString('base64url');
		const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
		const state = crypto.randomBytes(16).toString('hex');

		// Start a localhost listener for the callback
		return new Promise((resolve, reject) => {
			const callbackServer = http.createServer(async (req, res) => {
				const cbUrl = new URL(req.url ?? '/', `http://localhost`);
				if (cbUrl.pathname !== '/') { res.writeHead(404); res.end(); return; }

				const code = cbUrl.searchParams.get('code');
				const returnedState = cbUrl.searchParams.get('state');
				const error = cbUrl.searchParams.get('error');

				if (error) {
					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.end('<html><body style="font-family:system-ui;background:#1a1a2e;color:#e94560;display:flex;justify-content:center;align-items:center;height:100vh;margin:0"><h2>Sign-in failed: ' + error + '</h2></body></html>');
					callbackServer.close();
					reject(new Error(`OAuth error: ${error}`));
					return;
				}

				if (!code || returnedState !== state) {
					res.writeHead(400); res.end('Invalid callback'); callbackServer.close();
					reject(new Error('Invalid OAuth callback'));
					return;
				}

				// Exchange code for token
				try {
					const tokenResp = await fetch(`${authBase}/token`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
						body: new URLSearchParams({
							client_id: clientId,
							grant_type: 'authorization_code',
							code,
							redirect_uri: `http://127.0.0.1:${(callbackServer.address() as net.AddressInfo).port}/`,
							code_verifier: codeVerifier,
						}).toString(),
					});

					if (!tokenResp.ok) {
						const err = await tokenResp.text();
						throw new Error(`Token exchange failed: ${err}`);
					}

					const tokenData = await tokenResp.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string };

					// Parse tenant ID from token
					const parts = tokenData.access_token.split('.');
					let tenantId: string | null = null;
					if (parts.length === 3) {
						const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
						const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
						const payload = JSON.parse(Buffer.from(padded, 'base64').toString());
						tenantId = payload.tid ?? null;
					}

					// Save token in the same format the SDK uses
					const oauthDir = path.join(os.homedir(), '.copilot', 'mcp-oauth-config');
					fs.mkdirSync(oauthDir, { recursive: true });
					const serverUrl = `https://agent365.svc.cloud.microsoft/agents/tenants/${tenantId ?? 'unknown'}/servers/discovery`;
					const hash = crypto.createHash('sha256').update(serverUrl).digest('hex');

					fs.writeFileSync(path.join(oauthDir, `${hash}.json`), JSON.stringify({
						serverUrl,
						authorizationServerUrl: `${authBase.replace('/oauth2/v2.0', '')}`,
						clientId,
						redirectUri: `http://127.0.0.1:${(callbackServer.address() as net.AddressInfo).port}/`,
						resourceUrl: serverUrl,
						issuedAt: Math.floor(Date.now() / 1000),
						isStatic: false,
					}));

					fs.writeFileSync(path.join(oauthDir, `${hash}.tokens.json`), JSON.stringify({
						accessToken: tokenData.access_token,
						refreshToken: tokenData.refresh_token ?? '',
						expiresAt: Math.floor(Date.now() / 1000) + tokenData.expires_in,
						scope: tokenData.scope,
					}));

					const scopeCount = (tokenData.scope.match(/McpServers\.\w+\.All/g) ?? []).length;
					this.log(`[Server] M365 OAuth sign-in complete: tenant=${tenantId?.slice(0, 8)}…, ${scopeCount} server scopes`);

					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.end('<html><body style="font-family:system-ui;background:#1a1a2e;color:#16c79a;display:flex;justify-content:center;align-items:center;height:100vh;margin:0"><h2>✓ Signed in to Microsoft 365 — you can close this tab</h2></body></html>');
					callbackServer.close();
					resolve({ tenantId, scopeCount });
				} catch (e) {
					res.writeHead(500); res.end('Token exchange failed');
					callbackServer.close();
					reject(e);
				}
			});

			// Listen on a random port
			callbackServer.listen(0, '127.0.0.1', () => {
				const port = (callbackServer.address() as net.AddressInfo).port;
				const redirectUri = `http://127.0.0.1:${port}/`;
				const authUrl = `${authBase}/authorize?` + new URLSearchParams({
					client_id: clientId,
					response_type: 'code',
					redirect_uri: redirectUri,
					scope,
					state,
					code_challenge: codeChallenge,
					code_challenge_method: 'S256',
					prompt: 'select_account',
				}).toString();

				this.log(`[Server] M365 OAuth: opening browser for sign-in (port ${port})`);
				const cmd = process.platform === 'win32' ? `start "" "${authUrl}"`
					: process.platform === 'darwin' ? `open "${authUrl}"`
					: `xdg-open "${authUrl}"`;
				exec(cmd);

				// Timeout after 2 minutes
				setTimeout(() => {
					callbackServer.close();
					reject(new Error('OAuth sign-in timed out'));
				}, 120000);
			});
		});
	}

	private sendJson(res: http.ServerResponse, status: number, body: unknown) {
		const data = JSON.stringify(body);
		res.writeHead(status, {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
			...this.securityHeaders(),
		});
		res.end(data);
	}

	/** Common security headers for all responses */
	private securityHeaders(req?: http.IncomingMessage): Record<string, string> {
		const headers: Record<string, string> = {
			'X-Content-Type-Options': 'nosniff',
			'X-Frame-Options': 'DENY',
			'Referrer-Policy': 'no-referrer',
			'X-DNS-Prefetch-Control': 'off',
			'Content-Security-Policy': [
				"default-src 'self'",
				"script-src 'self'",
				"style-src 'self' 'unsafe-inline'",
				"connect-src 'self' ws: wss:",
				"img-src 'self' data:",
				"font-src 'self'",
				"frame-ancestors 'none'",
			].join('; '),
		};
		// HSTS only over HTTPS (tunnel) — would break local HTTP
		const isHttps = req?.headers['x-forwarded-proto'] === 'https'
			|| req?.headers['x-forwarded-ssl'] === 'on';
		if (isHttps) {
			headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
		}
		return headers;
	}

	private readBody(req: http.IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			let size = 0;
			req.on('data', (c: Buffer) => {
				size += c.length;
				if (size > 1024 * 1024) { req.destroy(); reject(new Error('Request body too large')); return; }
				chunks.push(c);
			});
			req.on('end', () => resolve(Buffer.concat(chunks).toString()));
		});
	}

	getLocalIP(): string {
		const nets = os.networkInterfaces();
		for (const name of Object.keys(nets)) {
			for (const net of nets[name] ?? []) {
				if (net.family === 'IPv4' && !net.internal) return net.address;
			}
		}
		return 'localhost';
	}

	getURL(): string {
		const base = `http://${this.getLocalIP()}:${this.port}`;
		return this.token ? `${base}?token=${this.token}` : base;
	}

	/** URL using localhost — survives network changes, for local browser launch */
	getLocalURL(): string {
		const base = `http://localhost:${this.port}`;
		return this.token ? `${base}?token=${this.token}` : base;
	}

	getToken(): string {
		return this.token ?? '';
	}

	/**
	 * Clear the portal session token, forcing a fresh one-time claim from the UI.
	 * Disconnects all clients. No-op (returns false) when the token is pinned via
	 * the PORTAL_TOKEN env, which can only be changed by restarting with a new value.
	 */
	clearToken(): boolean {
		if (this.tokenEnvManaged) return false;
		const tokenFile = path.join(this.dataDir, 'token.txt');
		try { fs.unlinkSync(tokenFile); } catch {}
		this.token = null;
		// Disconnect all clients — they'll need a freshly claimed token
		for (const client of this.wss.clients) client.terminate();
		return true;
	}

	/** List sessions (for console CLI launcher) */
	async listSessions(): Promise<Array<{ sessionId: string; summary?: string; context?: PortalSessionContext }>> {
		try {
			const sessions = await this.pool.listSessions();
			return sessions.map(s => ({
				sessionId: s.sessionId,
				summary: s.summary,
				context: s.context ? { ...s.context, cwd: s.context.workingDirectory } : undefined,
			}));
		} catch { return []; }
	}

	/** Check for updates (for console command) */
	async checkForUpdates(): Promise<{ hasUpdates: boolean; summary: string }> {
		const status = await this.updater.check();
		const parts: string[] = [];
		const updatable = status.packages.filter(p => p.hasUpdate);
		if (updatable.length > 0) parts.push(...updatable.map(p => `${p.name} ${p.installed} -> ${p.latest}`));
		if (status.portal?.hasUpdate) parts.push(`Portal v${status.portal.installed} -> v${status.portal.latest}`);
		if (parts.length === 0) return { hasUpdates: false, summary: 'All packages up to date' };
		return { hasUpdates: true, summary: parts.join(', ') };
	}

	/** Apply updates (for console command) */
	async applyUpdates(): Promise<string> {
		const status = await this.updater.check();
		const hasPackages = status.packages.some(p => p.hasUpdate);
		const hasPortal = !!status.portal?.hasUpdate;
		if (!hasPackages && !hasPortal) return 'Everything is up to date.';
		const msgs: string[] = [];
		if (hasPackages) {
			const pkgStatus = await this.updater.apply();
			if (pkgStatus.error) msgs.push(`Package update failed: ${pkgStatus.error}`);
			else msgs.push('Packages updated.');
		}
		if (hasPortal) {
			const portalStatus = await this.updater.applyPortalUpdate();
			if (portalStatus.error) msgs.push(`Portal update failed: ${portalStatus.error}`);
			else msgs.push(`Portal updated to v${status.portal!.latest}.`);
		}
		return msgs.join(' ') + ' Press [r] to restart.';
	}

	/** True while an update is being applied. Used by the console [r] handler to
	 *  refuse a restart mid-update (mirrors the /api/restart server-side gate). */
	isUpdateBusy(): boolean {
		return this.updater.isBusy();
	}

	async start(): Promise<void> {
		this.loadShields();
		this.loadSessionAgents();
		this.loadSessionPrompts();

		// Bind the HTTP/WS listener FIRST so the portal is always reachable — even
		// when the CLI isn't authenticated. Auth + CLI connection then happen in the
		// background (initAuth); failures surface as a "needs-auth" sign-in screen
		// instead of crash-looping the process.
		await new Promise<void>((resolve, reject) => {
			this.httpServer.on('error', reject);
			this.httpServer.listen(this.port, '0.0.0.0', () => {
				this.initDebugFiles();
				this.log(`[Build] v${__VERSION__} build ${__BUILD__}`);
				try { this.log(formatVersionInventory(collectVersionInventory())); } catch { /* never block startup on version probe */ }
				this.log(`Server started on port ${this.port}`);
				if (this.token) {
					// In a container getURL() resolves the container's internal Docker
					// IP (useless on the LAN), so don't print it — the user reaches the
					// portal via the host's address, which we can't know here.
					if (CONTAINER_MODE) {
						this.log(`Portal ready on port ${this.port} — open it at your host's address (the session token is already set).`);
					} else {
						this.log(`Open: ${this.getURL()}`);
					}
				} else {
					this.log(`No portal session token set — open the portal in a browser and choose "Generate session token" to claim it.`);
				}
				resolve();
			});
		});

		void this.initAuth();
	}

	/** Update the auth/CLI lifecycle state and notify all connected clients. */
	private setAuthState(state: 'starting' | 'ok' | 'needs-auth' | 'error', message: string | null = null): void {
		this.authState = state;
		this.authMessage = message;
		// Release anything waiting for auth to leave the transient 'starting' state.
		if (state !== 'starting' && this.authSettleWaiters.length) {
			const waiters = this.authSettleWaiters;
			this.authSettleWaiters = [];
			for (const w of waiters) w();
		}
		this.broadcastAll({ type: 'auth_state', state, message });
	}

	/**
	 * Resolve once authState is no longer the transient 'starting' state (i.e. it
	 * has settled to 'ok', 'needs-auth', or 'error'), or after `timeoutMs`. Used by
	 * the WS connection handler so a client auto-reconnecting in the brief window
	 * right after a server restart — before initAuth() finishes — waits for auth to
	 * confirm instead of being stranded with a session-less ping-only handler.
	 */
	private waitForAuthSettled(timeoutMs: number): Promise<void> {
		if (this.authState !== 'starting') return Promise.resolve();
		return new Promise<void>((resolve) => {
			let done = false;
			const finish = () => { if (!done) { done = true; resolve(); } };
			this.authSettleWaiters.push(finish);
			setTimeout(finish, timeoutMs);
		});
	}

	/**
	 * Spawn `copilot login` (GitHub OAuth device flow), scrape the device code +
	 * verification URL from its output, and broadcast them so the browser can show
	 * a sign-in screen. On success the launcher restarts the CLI (exit code 76) so
	 * the freshly-written credentials are picked up; on failure we return to
	 * needs-auth so the user can retry.
	 */
	/**
	 * Ensure `storeTokenPlaintext: true` is set in ~/.copilot/settings.json. The CLI
	 * tries the OS keychain first; when there is no keychain it falls back to an
	 * interactive y/N prompt that needs a TTY we don't have (login authenticates but
	 * the token is not persisted — "Login succeeded, but the token was not saved").
	 * With this flag the CLI writes/reads the token straight from the config dir.
	 *
	 * We only enable this when there's genuinely no keychain: pre-emptively in a
	 * container (none exists), or reactively on desktop AFTER a sign-in attempt
	 * reports the token couldn't be saved. Desktops with a working keychain keep
	 * using secure storage — we never downgrade them.
	 */
	private ensurePlaintextTokenStorage(): boolean {
		try {
			const home = process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
			const file = path.join(home, 'settings.json');
			let settings: Record<string, unknown> = {};
			try {
				settings = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
			} catch {
				// missing or unparseable — start fresh
			}
			if (settings.storeTokenPlaintext !== true) {
				settings.storeTokenPlaintext = true;
				fs.mkdirSync(path.dirname(file), { recursive: true });
				fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
				this.log('[Auth] Enabled plaintext token storage (no keychain available)');
			}
			return true;
		} catch (e) {
			this.log(`[Auth] Could not set storeTokenPlaintext: ${e} — sign-in may not persist`);
			return false;
		}
	}

	/** Resolve the Copilot config dir (honors COPILOT_HOME, else ~/.copilot). */
	private copilotHomeDir(): string {
		return process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
	}

	/** True when settings.json has storeTokenPlaintext enabled. */
	private isPlaintextStorageEnabled(): boolean {
		try {
			const s = JSON.parse(fs.readFileSync(path.join(this.copilotHomeDir(), 'settings.json'), 'utf8'));
			return s?.storeTokenPlaintext === true;
		} catch { return false; }
	}

	/** Read config.json, stripping the leading `//` comment header the CLI writes. */
	private readCopilotConfig(): { file: string; data: Record<string, unknown> } | null {
		const file = path.join(this.copilotHomeDir(), 'config.json');
		try {
			const raw = fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
			return { file, data: JSON.parse(raw) as Record<string, unknown> };
		} catch { return null; }
	}

	/** Path to the persisted pasted access token (injected as COPILOT_GITHUB_TOKEN
	 *  by the launcher on start). Lives in portal-data so it survives rebuilds. */
	private patFile(): string { return path.join(this.dataDir, 'gh-pat'); }

	/** Human description of where the GitHub token is persisted (for the console). */
	private describeTokenStorage(): string {
		if (fs.existsSync(this.patFile())) return 'environment variable (pasted access token)';
		const cfg = this.readCopilotConfig();
		const tokens = cfg?.data?.copilotTokens as Record<string, unknown> | undefined;
		const hasPlaintextToken = !!(tokens && Object.keys(tokens).length);
		if (this.isPlaintextStorageEnabled() || hasPlaintextToken) {
			return `plaintext config file (${cfg?.file ?? path.join(this.copilotHomeDir(), 'config.json')})`;
		}
		return 'OS keychain (secure credential store)';
	}

	/**
	 * Clear stored GitHub credentials for logout. Removes the auth keys from
	 * config.json (this fully clears plaintext/container storage and drops the
	 * loggedInUsers metadata the CLI keys auth off of, so it reports signed-out in
	 * both modes). A keychain entry on desktop may linger but is orphaned and
	 * overwritten on next sign-in.
	 */
	private clearStoredCredentials(): { summary: string; mode: string } {
		const mode = this.describeTokenStorage();
		// Remove a pasted access token (if any) first — covers logout and keeps
		// the device/PAT methods mutually exclusive.
		let patCleared = false;
		try { if (fs.existsSync(this.patFile())) { fs.unlinkSync(this.patFile()); patCleared = true; } } catch { /* ignore */ }
		const cfg = this.readCopilotConfig();
		if (!cfg) {
			return { summary: patCleared ? `cleared access token (${mode})` : `no config.json found (${mode})`, mode };
		}
		let cleared = false;
		for (const k of ['copilotTokens', 'loggedInUsers', 'lastLoggedInUser']) {
			if (k in cfg.data) { delete (cfg.data as Record<string, unknown>)[k]; cleared = true; }
		}
		try {
			const header = '// User settings belong in settings.json.\n// This file is managed automatically.\n';
			fs.writeFileSync(cfg.file, header + JSON.stringify(cfg.data, null, 2) + '\n');
		} catch (e) {
			return { summary: `failed to rewrite config.json: ${e}`, mode };
		}
		const what = [cleared ? 'credentials' : null, patCleared ? 'access token' : null].filter(Boolean).join(' + ');
		return { summary: what ? `cleared ${what} from ${mode}` : `no stored credentials to clear (${mode})`, mode };
	}

	private startDeviceLogin(): void {
		if (this.authLoginChild) return;
		this.authDevice = null;
		// In a container there is no OS keychain, so pre-enable plaintext storage.
		// On desktop we leave the secure keychain in charge and only fall back to
		// plaintext reactively (below) if the CLI reports it couldn't save the token.
		if (CONTAINER_MODE) this.ensurePlaintextTokenStorage();

		const isWin = process.platform === 'win32';
		const bin = isWin ? 'copilot.cmd' : 'copilot';
		this.log('[Auth] Starting GitHub device-code sign-in...');

		const child = spawn(bin, ['login'], {
			cwd: process.cwd(),
			env: process.env,
			stdio: ['ignore', 'pipe', 'pipe'],
			shell: isWin, // resolve copilot.cmd via PATHEXT on Windows
			windowsHide: true,
		});
		this.authLoginChild = child;
		this.setAuthState('needs-auth', 'Starting sign-in...');

		// Tracks whether this attempt authenticated but failed to persist the token
		// (no keychain + no TTY for the plaintext prompt) — triggers the reactive
		// plaintext fallback + auto-retry below.
		let tokenNotSaved = false;

		const onChunk = (buf: Buffer) => {
			const text = buf.toString();
			for (const line of text.split(/\r?\n/)) {
				if (!line.trim()) continue;
				this.log(`[Auth:login] ${line.trim()}`);
				if (/token was not saved|keychain unavailable/i.test(line)) tokenNotSaved = true;
				// "...visit https://github.com/login/device and enter code 998B-81E8."
				const codeMatch = line.match(/\bcode\s+([A-Z0-9]{4}-[A-Z0-9]{4})/i);
				const uriMatch = line.match(/(https?:\/\/\S*github\.com\/login\/device\S*)/i);
				if (codeMatch || uriMatch) {
					const code = codeMatch ? codeMatch[1].toUpperCase() : this.authDevice?.code ?? '';
					const verificationUri = uriMatch
						? uriMatch[1].replace(/[.,)]+$/, '')
						: this.authDevice?.verificationUri ?? 'https://github.com/login/device';
					if (code && (!this.authDevice || this.authDevice.code !== code)) {
						this.authDevice = { code, verificationUri };
						this.log(`[Auth] Device code ${code} — visit ${verificationUri}`);
						this.broadcastAll({ type: 'auth_device_code', code, verificationUri });
						this.setAuthState('needs-auth', 'Waiting for authorization...');
					}
				}
			}
		};
		child.stdout?.on('data', onChunk);
		child.stderr?.on('data', onChunk);

		child.on('error', (err) => {
			this.log(`[Auth] login spawn failed: ${err.message}`);
			this.authLoginChild = null;
			this.authDevice = null;
			this.setAuthState('needs-auth', `Sign-in failed to start: ${err.message}`);
		});

		child.on('exit', (code) => {
			const wasRunning = this.authLoginChild === child;
			this.authLoginChild = null;
			this.authDevice = null;
			if (!wasRunning) return; // cancelled
			if (code === 0) {
				// Device sign-in won — drop any pasted access token so it doesn't
				// override the new OAuth credentials (env var has higher precedence).
				try { if (fs.existsSync(this.patFile())) fs.unlinkSync(this.patFile()); } catch { /* ignore */ }
				this.log(`[Auth] Sign-in succeeded — token persisted to ${this.describeTokenStorage()}`);
				this.log('[Auth] Restarting to load new credentials');
				this.broadcastAll({ type: 'auth_state', state: 'starting', message: 'Signed in — restarting...' });
				// Exit 76: launcher restarts the CLI server (so it re-reads creds)
				// then relaunches the portal, which reconnects authenticated.
				setTimeout(() => process.exit(76), 250);
			} else {
				this.log(`[Auth] Sign-in process exited ${code}`);
				// Reactive fallback: the user authenticated but the CLI couldn't save
				// the token because there's no keychain and no TTY for its plaintext
				// prompt. Enable plaintext storage once and re-run sign-in so the next
				// attempt persists. (Desktops with a working keychain never hit this.)
				if (tokenNotSaved && !this.authPlaintextRetried) {
					this.authPlaintextRetried = true;
					if (this.ensurePlaintextTokenStorage()) {
						this.log('[Auth] Token could not be saved securely — enabled local storage; restarting sign-in');
						this.setAuthState('needs-auth', 'Secure storage unavailable — please sign in once more to finish.');
						setTimeout(() => this.startDeviceLogin(), 400);
						return;
					}
				}
				this.setAuthState('needs-auth', 'Sign-in was not completed. Please try again.');
			}
		});
	}

	/** Cancel an in-progress device-login flow. */
	private cancelDeviceLogin(): void {
		const child = this.authLoginChild;
		this.authLoginChild = null;
		this.authDevice = null;
		if (child) {
			try { child.kill(); } catch { /* already gone */ }
		}
		this.setAuthState('needs-auth', null);
	}

	/**
	 * Connect to the CLI and resolve auth, AFTER the HTTP listener is up. Never
	 * throws — auth/connection problems set a non-fatal state the UI can act on.
	 */
	private async initAuth(): Promise<void> {
		this.setAuthState('starting');
		try {
			await this.pool.start();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			if (e instanceof NotAuthenticatedError || /auth|token|login|credential|unauthorized/i.test(msg)) {
				this.log(`[Auth] Not signed in — portal is up; awaiting browser sign-in`);
				this.setAuthState('needs-auth', 'Copilot is not signed in.');
			} else {
				this.log(`[Auth] CLI connection failed: ${msg}`);
				this.setAuthState('error', msg);
			}
			return;
		}

		// Authenticated — cache portal info (version, user, models).
		try {
			const [status, auth, allModels] = await Promise.all([
				this.pool.getStatus(),
				this.pool.getAuthStatus(),
				this.pool.listModels(),
			]);
			const basePrice2 = Math.min(...allModels.filter((m: any) => m.billing?.tokenPrices?.inputPrice > 0).map((m: any) => m.billing.tokenPrices.inputPrice)) || 0;
			this.portalInfo = {
				version: status.version,
				login: auth.login ?? 'unknown',
				defaultCwd: this.pool.workspaceRootDir,
				lanUrl: this.getURL(),
				cliConnected: true,
				models: allModels
					.filter((m: any) => !m.policy || m.policy.state === 'enabled')
					.map((m: any) => {
						const inputPrice = m.billing?.tokenPrices?.inputPrice;
						const computedMultiplier = basePrice2 > 0 && inputPrice > 0 ? Math.max(1, Math.round(inputPrice / basePrice2)) : 0;
						return {
							id: m.id,
							name: m.name,
							contextWindow: m.capabilities?.limits?.max_context_window_tokens ?? 0,
							vision: !!m.capabilities?.supports?.vision,
							reasoning: !!m.capabilities?.supports?.adaptive_thinking,
							premium: !!m.billing?.is_premium || m.modelPickerPriceCategory === 'high',
							multiplier: m.billing?.multiplier ?? computedMultiplier,
							priceCategory: m.modelPickerPriceCategory ?? null,
						};
					}),
			};
			this.log(`[Pool] CLI runtime: v${status.version}`);
			this.log(`[Mode] ${this.pool.shared ? 'Connected (--server on port 3848)' : 'Standalone (own CLI subprocess)'}`);
			this.log(`[Pool] Models available: ${this.portalInfo?.models.length ?? 0}`);
		} catch (e) {
			this.log(`[Pool] Could not fetch portal info: ${e}`);
		}

		this.log(`[Auth] Signed in — token storage: ${this.describeTokenStorage()}`);
		this.setAuthState('ok');

		// Start periodic update checker (disabled in container mode — updates
		// are delivered by rebuilding/pulling the image, not at runtime).
		if (CONTAINER_MODE) {
			this.log('[Update] Container mode — in-app update checks disabled (update via image rebuild/pull)');
		} else {
			this.updater.start();
		}
	}

	private initDebugFiles() {
		try {
			if (!fs.existsSync(this.debugDir)) fs.mkdirSync(this.debugDir, { recursive: true });
			// Preserve the previous process's log (single generation) so a [r] restart
			// followed by a failure is fully diagnosable — the new process truncates
			// server.log, which would otherwise discard the very session that hit the bug.
			const logPath = path.join(this.debugDir, 'server.log');
			try { if (fs.existsSync(logPath)) fs.renameSync(logPath, logPath + '.prev'); } catch { /* best-effort */ }
			this.logStream = fs.createWriteStream(logPath, { flags: 'w' });
		} catch (e) {
			process.stderr.write(`[Debug] Could not init debug files: ${e}\n`);
		}
	}

	/** Fetch a GitHub Gist by ID (unauthenticated first, then with gh auth token) */
	private fetchGist(gistId: string): Promise<{ description: string; files: Record<string, { content: string }> } | null> {
		const doFetch = (token?: string): Promise<{ description: string; files: Record<string, { content: string }> } | null> => new Promise((resolve) => {
			const headers: Record<string, string> = { 'User-Agent': 'copilot-portal', Accept: 'application/vnd.github+json' };
			if (token) headers['Authorization'] = `Bearer ${token}`;
			const req = https.get({ hostname: 'api.github.com', path: `/gists/${gistId}`, headers, timeout: 10_000 }, (res) => {
				let data = '';
				res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
				res.on('end', () => {
					if (res.statusCode === 200) {
						try { resolve(JSON.parse(data)); } catch { resolve(null); }
					} else if (res.statusCode === 404 && !token) {
						// Try with auth for private gists
						const ghToken = this.getGitHubToken();
						if (ghToken) doFetch(ghToken).then(resolve);
						else resolve(null);
					} else { resolve(null); }
				});
			});
			req.on('error', () => resolve(null));
			req.on('timeout', () => { req.destroy(); resolve(null); });
		});
		return doFetch();
	}

	private getGitHubToken(): string | null {
		if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
		if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
		try {
			return execSync('gh auth token', { stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }).toString().trim() || null;
		} catch { return null; }
	}

	/** Parse gist files into guide/prompt pairs using the name_guide.md / name_prompts.md convention */
	private parseGistFiles(files: Record<string, { content: string }>): Array<{ name: string; hasGuide: boolean; hasPrompts: boolean; guideContent: string; promptsContent: string }> {
		const items = new Map<string, { guide?: string; prompts?: string }>();
		for (const [filename, file] of Object.entries(files)) {
			const guideMatch = filename.match(/^(.+)_guide\.md$/);
			const promptsMatch = filename.match(/^(.+)_prompts\.md$/);
			if (guideMatch) {
				const name = guideMatch[1];
				if (!items.has(name)) items.set(name, {});
				items.get(name)!.guide = file.content;
			} else if (promptsMatch) {
				const name = promptsMatch[1];
				if (!items.has(name)) items.set(name, {});
				items.get(name)!.prompts = file.content;
			}
		}
		return Array.from(items.entries()).map(([name, { guide, prompts }]) => ({
			name,
			hasGuide: !!guide,
			hasPrompts: !!prompts,
			guideContent: guide ?? '',
			promptsContent: prompts ?? '',
		}));
	}

	broadcastAll(msg: object): void {
		const data = JSON.stringify(msg);
		for (const client of this.wss.clients) {
			if (client.readyState === WebSocket.OPEN) {
				try { client.send(data); } catch { client.terminate(); }
			}
		}
	}

	async stop(): Promise<void> {
		this.updater.stop();
		this.squadReader.stopWatching();
		await this.pool.stop();
		// Forcefully close all open WebSocket connections so httpServer.close() doesn't hang
		for (const client of this.wss.clients) client.terminate();
		this.wss.close();
		// Close any lingering HTTP keep-alive connections (Node 18.2+)
		if (typeof (this.httpServer as NodeJS.EventEmitter & { closeAllConnections?: () => void }).closeAllConnections === 'function') {
			(this.httpServer as NodeJS.EventEmitter & { closeAllConnections: () => void }).closeAllConnections();
		}
		return new Promise((resolve) => {
			this.httpServer.close(() => {
				this.logStream?.end();
				this.logStream = null;
				resolve();
			});
		});
	}
}
