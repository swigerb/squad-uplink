import * as http from 'node:http';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionPool } from './session.js';
import { RulesStore } from './rules.js';
import { UpdateChecker } from './updater.js';
import { SquadReader } from './squad.js';
import type { PortalEvent, PortalInfo } from './session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class PortalServer {
	private httpServer: http.Server;
	private wss: WebSocketServer;
	private token: string;
	private pool: SessionPool;
	private webuiPath: string;
	private debugDir: string;
	private dataDir: string;
	private clientCounter = 0;
	private logStream: fs.WriteStream | null = null;
	private portalInfo: PortalInfo | null = null;
	private shields: Record<string, boolean> = {};
	private sessionPrompts: Record<string, Array<{ label: string; text: string }>> = {};
	private sessionAgents: Record<string, string> = {}; // sessionId -> agentName
	private updater: UpdateChecker;
	private squadReader: SquadReader;
	private squadContext = true; // auto-inject squad context into first message per session
	private squadContextInjected = new Set<string>(); // track sessions that already got context
	private failedAuth = new Map<string, { count: number; resetTime: number }>();

	constructor(private port: number, dataDir?: string, opts?: { newToken?: boolean; cliUrl?: string }) {
		this.webuiPath = path.join(__dirname, '..', 'dist', 'webui');
		this.debugDir = path.join(__dirname, '..', 'debug');
		this.dataDir = dataDir ?? path.join(__dirname, '..', 'data');
		if (opts?.newToken) {
			const tokenFile = path.join(this.dataDir, 'token.txt');
			try { fs.unlinkSync(tokenFile); } catch {}
		}
		this.token = this.loadOrCreateToken();
		const workspacePath = path.join(this.dataDir, 'workspaces', 'default');
		try { fs.mkdirSync(workspacePath, { recursive: true }); } catch {}
		// Seed guide examples on first run
		this.ensureDataDirs();
		this.pool = new SessionPool((msg) => this.log(msg), new RulesStore(this.dataDir), workspacePath, opts?.cliUrl);
		this.updater = new UpdateChecker((msg) => this.log(msg));
		this.squadReader = new SquadReader(path.join(__dirname, '..'));
		this.squadReader.startWatching();
		this.squadReader.on('change', (change: { path: string; type: string }) => {
			this.broadcastAll({ type: 'squad_file_changed', path: change.path, changeType: change.type });
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
				// Rate limit: 15 failed attempts per 60s per IP
				const attempt = this.failedAuth.get(ip);
				if (attempt && now < attempt.resetTime && attempt.count >= 15) {
					this.log(`[Auth] Blocked ${ip} (rate limited)`);
					callback(false, 429, 'Too many attempts');
					return;
				}
				const url = new URL(req.url ?? '/', 'http://localhost');
				const t = url.searchParams.get('token');
				if (t !== this.token) {
					const entry = attempt && now < attempt.resetTime
						? { count: attempt.count + 1, resetTime: attempt.resetTime }
						: { count: 1, resetTime: now + 60_000 };
					this.failedAuth.set(ip, entry);
					this.log(`[Auth] Failed attempt from ${ip} (${entry.count}/15)`);
					callback(false, 401, 'Unauthorized');
				} else {
					this.failedAuth.delete(ip);
					callback(true);
				}
			},
		});

		this.wss.on('error', (err) => this.log(`[WS Error] ${err.message}`));

		this.wss.on('connection', async (ws, req) => {
			const clientId = `C${++this.clientCounter}`;
			const ip = req.socket.remoteAddress ?? 'unknown';
			const url = new URL(req.url ?? '/', 'http://localhost');
			let sessionId = url.searchParams.get('session') ?? null;
				const historyParam = url.searchParams.get('history');
				const historyLimit = historyParam === 'all' ? undefined : (historyParam ? parseInt(historyParam, 10) || 50 : 50);
			const isManagement = url.searchParams.get('management') === '1';

			this.log(`[${clientId}] Connected from ${ip}, session=${sessionId?.slice(0, 8) ?? (isManagement ? 'mgmt' : 'auto')}`);

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
				const existing = this.pool.getHandle(sessionId);
				if (existing && existing.listenerCount === 0 && !existing.turnActive && !existing.isNew) {
					await this.pool.evict(sessionId);
				}
				handle = await this.pool.connect(sessionId);
			} catch (e) {
				this.log(`[${clientId}] Connect error: ${e}`);
				const msg = String(e);
				const isNotFound = msg.includes('Session not found') || msg.includes('not found');
				if (isNotFound && ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: 'session_not_found', sessionId }));
				}
				ws.close(isNotFound ? 4404 : 1011, msg);
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
				ws.send(JSON.stringify({ type: 'session_switched', sessionId, context: meta?.context ?? null, summary: meta?.summary ?? null, startTime: meta?.startTime ?? null, model: handle.currentModel ?? null, serverBuild: __BUILD__ }));

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
			}

			// Replay history + pending requests.
			// We capture sessionId at this point — it never changes for this connection.
			const historySessionId = sessionId;
			handle.getHistory(historyLimit).then((events) => {
				if (cancelled || ws.readyState !== WebSocket.OPEN) return;
				ws.send(JSON.stringify({ type: 'history_start', sessionId: historySessionId }));
				for (const e of events) {
					if (cancelled) return; // stop mid-send if connection drops
					ws.send(JSON.stringify(e));
				}
				if (cancelled) return;
				ws.send(JSON.stringify({ type: 'history_end', sessionId: historySessionId }));
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
						ws.send(JSON.stringify({ type: 'history_end', sessionId: historySessionId }));
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
							ws.close(4404, String(retryErr));
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
				this.handleMessage(str, clientId, handleRef, sessionId!, listener, ws);
			});
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
			};
			if (msg.type === 'prompt' && msg.content) {
				// Auto-inject squad context on first message per session
				let prompt = msg.content;
				const squadCtxParam = url.searchParams.get('squadContext');
				const squadEnabled = squadCtxParam !== null ? squadCtxParam !== '0' && squadCtxParam !== 'false' : this.squadContext;
				if (squadEnabled && !this.squadContextInjected.has(sessionId)) {
					const guide = this.squadReader.generateGuide();
					if (guide) {
						prompt = `<squad-context>\n${guide}\n</squad-context>\n\n${prompt}`;
						this.log(`[${clientId}] Injected squad context (${guide.length} chars)`);
					}
					this.squadContextInjected.add(sessionId);
				}
				this.log(`[${clientId}] Prompt: ${msg.content.slice(0, 80)}`);
				handle.send(prompt).catch(async (e) => {
					const errMsg = String(e);
					this.log(`[${clientId}] Send error: ${errMsg}`);
					if (errMsg.includes('Connection is closed') || errMsg.includes('not connected')) {
						this.log(`[${clientId}] Connection lost — attempting reconnect...`);
						try {
							const oldHandle = handleRef.current;
							oldHandle.removeListener(listener);
							await this.pool.evict(sessionId);
							const newHandle = await this.pool.connect(sessionId);
							newHandle.addListener(listener);
							handleRef.current = newHandle;
							this.log(`[${clientId}] Reconnected — retrying send`);
							await newHandle.send(msg.content!);
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


	private log(msg: string) {
		const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		const line = `[${ts}] ${msg}`;
		process.stdout.write(line + '\n');
		this.logStream?.write(line + '\n');
	}

	private loadOrCreateToken(): string {
		const tokenFile = path.join(this.dataDir, 'token.txt');
		try {
			if (fs.existsSync(tokenFile)) return fs.readFileSync(tokenFile, 'utf8').trim();
		} catch {}
		const token = crypto.randomBytes(16).toString('hex');
		try {
			fs.mkdirSync(this.dataDir, { recursive: true });
			fs.writeFileSync(tokenFile, token);
		} catch {}
		return token;
	}

	private checkToken(url: URL, req?: http.IncomingMessage): boolean {
		if (url.searchParams.get('token') === this.token) return true;
		const auth = req?.headers['authorization'] ?? '';
		if (auth === `Bearer ${this.token}`) return true;
		// Track failed attempt for rate limiting
		if (req) {
			const ip = req.socket.remoteAddress ?? 'unknown';
			const now = Date.now();
			const attempt = this.failedAuth.get(ip);
			const entry = attempt && now < attempt.resetTime
				? { count: attempt.count + 1, resetTime: attempt.resetTime }
				: { count: 1, resetTime: now + 60_000 };
			this.failedAuth.set(ip, entry);
			this.log(`[Auth] Failed attempt from ${ip} (${entry.count}/15)`);
		}
		return false;
	}

	/** Returns true if the IP is rate-limited. Sets 429 on the response. */
	private isRateLimited(req: http.IncomingMessage, res: http.ServerResponse): boolean {
		const ip = req.socket.remoteAddress ?? 'unknown';
		const attempt = this.failedAuth.get(ip);
		if (attempt && Date.now() < attempt.resetTime && attempt.count >= 15) {
			this.log(`[Auth] Blocked ${ip} (rate limited)`);
			res.writeHead(429); res.end('Too many attempts');
			return true;
		}
		return false;
	}

	private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
		if (this.isRateLimited(req, res)) return;
		const url = new URL(req.url ?? '/', 'http://localhost');
		const method = req.method ?? 'GET';

		// API routes — require token
		if (url.pathname.startsWith('/api/')) {
			if (!this.checkToken(url, req)) { res.writeHead(401); res.end('Unauthorized'); return; }
		}

		if (url.pathname === '/api/info' && method === 'GET') {
			this.sendJson(res, 200, this.portalInfo ?? { version: 'unknown', login: 'unknown', models: [] });
			return;
		}

		if (url.pathname === '/api/models' && method === 'GET') {
			try {
				const allModels = await this.pool.listModels();
				const models = allModels
					.filter(m => !m.policy || m.policy.state === 'enabled')
					.map(m => ({ id: m.id, name: m.name }));
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
				this.sendJson(res, 200, sessions.map(s => ({ ...s, shielded: this.shields[s.sessionId] ?? false })));
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
				this.saveSessionPrompts();
				delete this.sessionAgents[sessionId];
				this.saveSessionAgents();
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

		// --- Agent picker endpoints ---

		const agentsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/agents$/);
		if (agentsMatch && method === 'GET') {
			const sessionId = agentsMatch[1];
			try {
				const handle = await this.pool.connect(sessionId);
				const [agents, current] = await Promise.all([handle.listAgents(), handle.getCurrentAgent()]);
				// Detect agent source
				const userAgentsDir = path.join(os.homedir(), '.copilot', 'agents');
				const enriched = agents.map(a => {
					let source: 'user' | 'repository' | 'unknown' = 'unknown';
					try {
						if (fs.existsSync(path.join(userAgentsDir, `${a.name}.agent.md`))) {
							source = 'user';
						}
					} catch {}
					return { ...a, source };
				});
				this.sendJson(res, 200, { agents: enriched, current });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const agentSelectMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/agents\/select$/);
		if (agentSelectMatch && method === 'POST') {
			const sessionId = agentSelectMatch[1];
			try {
				const body = await this.readBody(req);
				const { name } = JSON.parse(body || '{}') as { name: string };
				const handle = await this.pool.connect(sessionId);
				const agent = await handle.selectAgent(name);
				this.sessionAgents[sessionId] = name;
				this.saveSessionAgents();
				this.sendJson(res, 200, { agent });
				this.log(`[API] Session ${sessionId.slice(0, 8)} selected agent: ${name}`);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const agentDeselectMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/agents\/deselect$/);
		if (agentDeselectMatch && method === 'POST') {
			const sessionId = agentDeselectMatch[1];
			try {
				const handle = await this.pool.connect(sessionId);
				await handle.deselectAgent();
				delete this.sessionAgents[sessionId];
				this.saveSessionAgents();
				this.sendJson(res, 200, { ok: true });
				this.log(`[API] Session ${sessionId.slice(0, 8)} deselected agent`);
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
				const { workingDirectory } = JSON.parse(body || '{}') as { workingDirectory?: string };
				if (!workingDirectory) {
					this.sendJson(res, 400, { error: 'workingDirectory is required' });
					return;
				}
				const resolved = path.resolve(workingDirectory);
				if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
					this.sendJson(res, 400, { error: 'Path is not a valid directory' });
					return;
				}
				await this.pool.reconnectWithCwd(sessionId, resolved);
				this.broadcastAll({ type: 'session_context_updated', sessionId, context: { cwd: resolved } });
				this.sendJson(res, 200, { ok: true });
				this.log(`[API] Session ${sessionId.slice(0, 8)} CWD changed to: ${resolved}`);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}


		if (url.pathname === '/api/sessions' && method === 'POST') {
			const body = await this.readBody(req);
			const { sessionId, model, workingDirectory } = JSON.parse(body || '{}') as { sessionId?: string; model?: string; workingDirectory?: string };
			try {
				if (sessionId) {
					// Pre-warm: connect to the session so it's ready when client navigates
					await this.pool.connect(sessionId);
					this.sendJson(res, 200, { sessionId });
				} else {
					const handle = await this.pool.create(workingDirectory ? { workingDirectory } : undefined);
					const newId = handle.sessionId;
					// Broadcast so other clients' pickers update
					const sessions = await this.pool.listSessions().catch(() => []);
					const shields = this.loadShields();
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
			const status = await this.updater.check();
			this.sendJson(res, 200, status);
			return;
		}

		if (url.pathname === '/api/updates/apply' && method === 'POST') {
			if (this.updater.getStatus().applying) {
				this.sendJson(res, 409, { error: 'Update already in progress' });
				return;
			}
			const status = await this.updater.apply();
			this.sendJson(res, 200, status);
			return;
		}

		if (url.pathname === '/api/updates/apply-portal' && method === 'POST') {
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

		// --- Browse / CWD endpoints ---

		if (url.pathname === '/api/browse' && method === 'GET') {
			const rawPath = url.searchParams.get('path') || '';
			try {
				// No path on Windows: list drive letters
				if (!rawPath && os.platform() === 'win32') {
					const drives: Array<{ name: string; path: string }> = [];
					for (let c = 65; c <= 90; c++) {
						const letter = String.fromCharCode(c);
						const driveRoot = letter + ':\\';
						try { fs.accessSync(driveRoot); drives.push({ name: driveRoot, path: driveRoot }); } catch {}
					}
					this.sendJson(res, 200, { path: '', exists: true, isDir: true, folders: drives, isDriveList: true });
					return;
				}
				// No path on non-Windows: use home directory
				const resolved = rawPath ? path.resolve(rawPath) : os.homedir();
				let stat: fs.Stats;
				try { stat = fs.statSync(resolved); } catch (e: unknown) {
					const code = (e as NodeJS.ErrnoException).code;
					if (code === 'ENOENT') { this.sendJson(res, 200, { path: resolved, exists: false, isDir: false, folders: [] }); return; }
					if (code === 'EPERM' || code === 'EACCES') { this.sendJson(res, 200, { path: resolved, exists: true, isDir: true, folders: [], error: 'Permission denied' }); return; }
					throw e;
				}
				if (!stat.isDirectory()) {
					this.sendJson(res, 200, { path: resolved, exists: true, isDir: false, folders: [] });
					return;
				}
				const entries = fs.readdirSync(resolved, { withFileTypes: true });
				const folders = entries
					.filter(e => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith('.') && e.name !== 'node_modules')
					.map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
					.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
				this.sendJson(res, 200, { path: resolved, exists: true, isDir: true, folders });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/browse' && method === 'POST') {
			try {
				const body = await this.readBody(req);
				const { parentPath, name } = JSON.parse(body || '{}') as { parentPath?: string; name?: string };
				if (!parentPath || !name) {
					this.sendJson(res, 400, { error: 'parentPath and name are required' });
					return;
				}
				// Validate folder name
				if (name === '.' || name === '..' || /[<>:"|?*\\/]/.test(name)) {
					this.sendJson(res, 400, { error: 'Invalid folder name' });
					return;
				}
				const fullPath = path.join(path.resolve(parentPath), name);
				fs.mkdirSync(fullPath, { recursive: true });
				this.log(`[API] Created folder: ${fullPath}`);
				this.sendJson(res, 201, { path: fullPath, ok: true });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/restart' && method === 'POST') {
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
			this.log('[Update] Restart requested — graceful shutdown...');

			// Notify all connected clients that a restart is imminent
			this.broadcastAll({ type: 'info', content: 'Server restarting…' });

			// Graceful shutdown: stop pool (disconnects sessions), close HTTP, exit with restart code
			setTimeout(async () => {
				await this.stop();
				process.exit(75);
			}, 500); // small delay so the HTTP response and broadcast can flush
			return;
		}

		if (url.pathname === '/api/guides' && method === 'GET') {
			try {
				const instrDir = path.join(this.dataDir, 'guides');
				const promptsDir = path.join(this.dataDir, 'prompts');
				const instrFiles = fs.existsSync(instrDir) ? fs.readdirSync(instrDir).filter(f => f.endsWith('.md')) : [];
				const promptFiles = fs.existsSync(promptsDir) ? fs.readdirSync(promptsDir).filter(f => f.endsWith('.md')) : [];
				const allIds = [...new Set([...instrFiles.map(f => f.replace(/\.md$/, '')), ...promptFiles.map(f => f.replace(/\.md$/, ''))])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
				const items: Array<{ id: string; name: string; file: string; hasGuide: boolean; hasPrompts: boolean; virtual?: boolean }> = allIds.map(id => ({
					id,
					name: id + '.md',
					file: id + '.md',
					hasGuide: instrFiles.includes(id + '.md'),
					hasPrompts: promptFiles.includes(id + '.md'),
				}));
				// Inject virtual Squad guide if .squad/ exists and has prompts
				if (this.squadReader.exists()) {
					const squadPrompts = this.squadReader.generatePrompts();
					if (squadPrompts.length > 0) {
						items.unshift({
							id: '_squad',
							name: 'Squad',
							file: '_squad.md',
							hasGuide: true,
							hasPrompts: true,
							virtual: true,
						});
					}
				}
				this.sendJson(res, 200, items);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		const promptsMatch = url.pathname.match(/^\/api\/guides\/(.+)\/prompts$/);
		if (promptsMatch && method === 'GET') {
			const guideId = decodeURIComponent(promptsMatch[1]);
			// Virtual Squad guide prompts
			if (guideId === '_squad') {
				try {
					const prompts = this.squadReader.generatePrompts();
					this.sendJson(res, 200, { prompts });
				} catch (e) {
					this.sendJson(res, 500, { error: String(e) });
				}
				return;
			}
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
			const guideId = decodeURIComponent(contextMatch[1]);
			// Virtual Squad guide content
			if (guideId === '_squad') {
				try {
					const guide = this.squadReader.generateGuide();
					this.sendJson(res, 200, { title: 'Squad Context', content: guide, virtual: true });
				} catch (e) {
					this.sendJson(res, 500, { error: String(e) });
				}
				return;
			}
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

		// List context templates
		if (url.pathname === '/api/context-templates' && method === 'GET') {
			try {
				const templatesDir = path.join(__dirname, '..', 'context-templates');
				if (!fs.existsSync(templatesDir)) { this.sendJson(res, 200, []); return; }
				const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));
				const templates = files.map(f => ({
					id: f.replace(/\.md$/, ''),
					name: f.replace(/\.md$/, '').replace(/[-_]/g, ' '),
					file: f,
				}));
				this.sendJson(res, 200, templates);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// Read a specific context template
		const templateMatch = url.pathname.match(/^\/api\/context-templates\/(.+)$/);
		if (templateMatch && method === 'GET') {
			try {
				const templatesDir = path.resolve(path.join(__dirname, '..', 'context-templates'));
				const templateFile = path.join(templatesDir, decodeURIComponent(templateMatch[1]) + '.md');
				const resolved = path.resolve(templateFile);
				if (!resolved.startsWith(templatesDir + path.sep)) { this.sendJson(res, 403, { error: 'Forbidden' }); return; }
				if (!fs.existsSync(resolved)) { this.sendJson(res, 404, { error: 'Template not found' }); return; }
				const content = fs.readFileSync(resolved, 'utf8');
				this.sendJson(res, 200, { content });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		// --- Squad file API ---

		if (url.pathname === '/api/squad/files' && method === 'GET') {
			try {
				const files = this.squadReader.listFiles();
				this.sendJson(res, 200, files);
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/squad/file' && method === 'GET') {
			const filePath = url.searchParams.get('path');
			if (!filePath) { this.sendJson(res, 400, { error: 'Missing path parameter' }); return; }
			const result = this.squadReader.readFile(filePath);
			if ('error' in result) { this.sendJson(res, result.status, { error: result.error }); return; }
			this.sendJson(res, 200, result);
			return;
		}

		if (url.pathname === '/api/squad/team' && method === 'GET') {
			const result = this.squadReader.readFile('team.md');
			if ('error' in result) { this.sendJson(res, result.status, { error: result.error }); return; }
			this.sendJson(res, 200, result);
			return;
		}

		if (url.pathname === '/api/squad/decisions' && method === 'GET') {
			const result = this.squadReader.readFile('decisions.md');
			if ('error' in result) { this.sendJson(res, result.status, { error: result.error }); return; }
			this.sendJson(res, 200, result);
			return;
		}

		if (url.pathname === '/api/squad/guide' && method === 'GET') {
			try {
				const guide = this.squadReader.generateGuide();
				this.sendJson(res, 200, { guide });
			} catch (e) {
				this.sendJson(res, 500, { error: String(e) });
			}
			return;
		}

		if (url.pathname === '/api/squad/prompts' && method === 'GET') {
			try {
				const prompts = this.squadReader.generatePrompts();
				this.sendJson(res, 200, { prompts });
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
		return `http://${this.getLocalIP()}:${this.port}?token=${this.token}`;
	}

	getToken(): string {
		return this.token;
	}

	/** Rotate the access token — invalidates all existing URLs and disconnects all clients */
	rotateToken(): string {
		const tokenFile = path.join(this.dataDir, 'token.txt');
		try { fs.unlinkSync(tokenFile); } catch {}
		this.token = this.loadOrCreateToken();
		// Disconnect all clients — they'll need the new token
		for (const client of this.wss.clients) client.terminate();
		return this.token;
	}

	/** List sessions (for console CLI launcher) */
	async listSessions(): Promise<Array<{ sessionId: string; summary?: string }>> {
		try {
			const sessions = await this.pool.listSessions();
			return sessions.map(s => ({ sessionId: s.sessionId, summary: s.summary }));
		} catch { return []; }
	}

	/** Check for updates (for console command) */
	async checkForUpdates(): Promise<{ hasUpdates: boolean; summary: string }> {
		const status = await this.updater.check();
		const updatable = status.packages.filter(p => p.hasUpdate);
		if (updatable.length === 0) return { hasUpdates: false, summary: 'All packages up to date' };
		return { hasUpdates: true, summary: updatable.map(p => `${p.name} ${p.installed} -> ${p.latest}`).join(', ') };
	}

	/** Apply updates (for console command) */
	async applyUpdates(): Promise<string> {
		const status = await this.updater.apply();
		if (status.error) return `Update failed: ${status.error}`;
		return status.restartNeeded ? 'Updates applied. Press [r] to restart.' : 'Updates applied.';
	}

	async start(): Promise<void> {
		this.loadShields();
		this.loadSessionPrompts();
		this.loadSessionAgents();
		await this.pool.start();
		// Cache portal info (version, user, models) once at startup
		try {
			const [status, auth, allModels] = await Promise.all([
				this.pool.getStatus(),
				this.pool.getAuthStatus(),
				this.pool.listModels(),
			]);
			this.portalInfo = {
				version: status.version,
				login: auth.login ?? 'unknown',
				models: allModels
					.filter(m => !m.policy || m.policy.state === 'enabled')
					.map(m => ({ id: m.id, name: m.name })),
			};
			this.log(`[Pool] Models available: ${this.portalInfo.models.length}`);
		} catch (e) {
			this.log(`[Pool] Could not fetch portal info: ${e}`);
		}
		// Start periodic update checker
		this.updater.start();
		return new Promise((resolve, reject) => {
			this.httpServer.on('error', reject);
			this.httpServer.listen(this.port, '0.0.0.0', () => {
				this.initDebugFiles();
				this.log(`[Build] v${__VERSION__} build ${__BUILD__}`);
				this.log(`[Mode] ${this.pool.shared ? 'Connected (--server on port 3848)' : 'Standalone (own CLI subprocess)'}`);
				this.log(`Server started on port ${this.port}`);
				this.log(`Open: ${this.getURL()}`);
				resolve();
			});
		});
	}

	private initDebugFiles() {
		try {
			if (!fs.existsSync(this.debugDir)) fs.mkdirSync(this.debugDir, { recursive: true });
			this.logStream = fs.createWriteStream(path.join(this.debugDir, 'server.log'), { flags: 'w' });
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
			if (client.readyState === WebSocket.OPEN) client.send(data);
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
