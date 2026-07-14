import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { ComponentProps } from 'react';
import { BUILTIN_PRESETS, deriveTheme, applyTheme, clearThemeOverrides, isDark, generateRandomPalette } from './theme';
import { SquadButton } from './components/SquadButton';
import { SquadPanel, type SquadFileChange } from './components/SquadPanel';

type ThemePreset = { id: string; name: string; base: string; accent: string; text?: string; builtIn?: boolean };

function CopyableTable({ children }: { children: React.ReactNode }) {
	const tableRef = useRef<HTMLTableElement>(null);
	const [copied, setCopied] = useState(false);
	const copyTable = async () => {
		const table = tableRef.current;
		if (!table) return;
		const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
		const cleanHtml = table.outerHTML.replace(/\sstyle="[^"]*"/g, '').replace(/\sclass="[^"]*"/g, '');
		if (navigator.clipboard?.write) {
			try {
				await navigator.clipboard.write([new ClipboardItem({
					'text/html': new Blob([cleanHtml], { type: 'text/html' }),
					'text/plain': new Blob([table.innerText], { type: 'text/plain' }),
				})]);
				done();
				return;
			} catch { /* fall through */ }
		}
		const el = document.createElement('div');
		el.contentEditable = 'true';
		el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;color:#000;background:#fff';
		el.innerHTML = cleanHtml;
		document.body.appendChild(el);
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
		document.execCommand('copy');
		sel?.removeAllRanges();
		document.body.removeChild(el);
		done();
	};
	return (
		<div className="code-scroll" style={{ margin: '0.5em 0', position: 'relative' }}>
			<table ref={tableRef} style={{ borderCollapse: 'collapse', minWidth: '100%' }}>{children}</table>
			<button
				type="button"
				data-copy-button
				onClick={copyTable}
				className="rounded p-0.5 transition-opacity"
				style={{ position: 'absolute', top: 2, right: 4, opacity: copied ? 0.8 : 0.3, color: 'inherit', lineHeight: 1, padding: '2px' }}
				title="Copy table"
			>
				{copied
					? <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
					: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
				}
			</button>
		</div>
	);
}

// pre and table need React wrappers for the .code-scroll div — CSS alone can't inject a parent element.
// p, th, and a need inline styles to unconditionally beat Tailwind Typography's generated rules.
// Everything else (ul, ol, blockquote, headings, etc.) is handled by styles.css .prose rules.
const mdComponents: ComponentProps<typeof Markdown>['components'] = {
	p: ({ children }) => (
		<p style={{ marginTop: '0.6em', marginBottom: '0.6em' }}>{children}</p>
	),
	pre: ({ children }) => (
		<div className="code-scroll" style={{ margin: '0.5em 0' }}>
			<pre style={{ margin: 0 }}>{children}</pre>
		</div>
	),
	table: ({ children }) => <CopyableTable>{children}</CopyableTable>,
	th: ({ children }) => (
		<th style={{ textAlign: 'left', background: 'var(--subtle-bg)', fontWeight: 600, color: 'var(--text-bright)' }}>{children}</th>
	),
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent)' }}>{children}</a>
	),
};
// Once any /api/* call returns 401 the stored token is bad. We clear it everywhere
// (localStorage + URL), stop all further /api traffic, and signal the UI to drop to
// the "Enter your session token" screen — instead of letting the pollers and WS keep
// retrying with a dead token and tripping the server's ban limiter (self-ban).
let portalTokenInvalid = false;
function invalidatePortalToken() {
	if (portalTokenInvalid) return;
	portalTokenInvalid = true;
	try { localStorage.removeItem('portal_token'); } catch { /* ignore */ }
	try {
		const params = new URLSearchParams(window.location.search);
		params.delete('token');
		const qs = params.toString();
		window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
	} catch { /* ignore */ }
	try { window.dispatchEvent(new Event('portal-token-invalid')); } catch { /* ignore */ }
}

function readStoredToken(): string | null {
	try { return localStorage.getItem('portal_token'); } catch { return null; }
}

// Single check: does the server accept OUR stored token *right now*?
//  'ok'          — accepted (non-401) → token is fine.
//  'rejected'    — server is reachable and definitively rejects it (wrong token, or
//                  the server has no token configured at all).
//  'unreachable' — couldn't reach the server (down/restarting) → inconclusive.
async function probeStoredToken(): Promise<'ok' | 'rejected' | 'tokenless' | 'unreachable'> {
	const t = readStoredToken();
	if (!t) return 'rejected';
	try {
		const r = await fetch('/api/info', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
		if (r.status !== 401) return 'ok';
	} catch {
		return 'unreachable';
	}
	// A 401 could mean the token is wrong OR the server is still booting (mid-update
	// restart). The status endpoint disambiguates: configured:true → server has a token
	// and rejects ours (genuinely bad). configured:false → server has no token; the
	// caller decides if that's a transient boot blip or a genuinely tokenless server.
	try {
		const s = await fetch('/api/portal-token/status', { cache: 'no-store' });
		if (!s.ok) return 'unreachable';
		const body = await s.json().catch(() => ({} as { configured?: boolean }));
		return body?.configured ? 'rejected' : 'tokenless';
	} catch {
		return 'unreachable';
	}
}

let tokenCheckInFlight: Promise<boolean> | null = null;
// Corroborate a *suspected*-bad token before discarding it. A lone 401 — or a burst
// of fast WS closes — around a server restart (e.g. a container image update where the
// new instance comes up with no token for a beat) must NOT nuke a still-valid token and
// bounce the user back to the sign-in screen. We only clear the token once the server is
// confirmably reachable AND rejects it across two checks ~1.2s apart. Returns true if the
// token was confirmed bad (and invalidated), false if the failure was transient.
async function confirmTokenInvalid(): Promise<boolean> {
	if (portalTokenInvalid) return true;
	if (tokenCheckInFlight) return tokenCheckInFlight;
	tokenCheckInFlight = (async () => {
		try {
			let bad = 0; // 'rejected' (wrong token) or 'tokenless' (server has none) — both mean our token is useless
			for (let i = 0; i < 2; i++) {
				const verdict = await probeStoredToken();
				if (verdict === 'ok') return false; // token works → the 401 was transient
				if (verdict === 'rejected' || verdict === 'tokenless') bad++;
				if (i === 0) await new Promise(r => setTimeout(r, 1200));
			}
			// Two confirmations ~1.2s apart: either the server rejects our token, or it
			// genuinely has none (lost volume / cleared token.txt). The server loads its
			// token synchronously at startup, so a persistent tokenless reply is real, not
			// a boot blip — drop to the claim/enter screen. A lone tokenless reply (the
			// mid-update restart window) is tolerated by the two-check requirement.
			if (bad >= 2) { invalidatePortalToken(); return true; }
			return false; // unreachable / momentary blip → keep the token and reconnect
		} finally {
			tokenCheckInFlight = null;
		}
	})();
	return tokenCheckInFlight;
}

const apiFetch= (url: string, init?: RequestInit) => {
	// Token already known-bad: fail fast without touching the network so a stray
	// poller can't keep hammering /api and get this client IP temp-banned.
	if (portalTokenInvalid) return Promise.resolve(new Response(null, { status: 401, statusText: 'token invalid' }));
	const t = getToken();
	const headers = { ...(init?.headers ?? {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
	return fetch(url, { ...init, headers }).then(res => {
		// Don't trust a lone 401 — corroborate before discarding the token, so a
		// transient 401 during a server restart can't force an unnecessary re-auth.
		if (res.status === 401 && url.startsWith('/api/')) void confirmTokenInvalid();
		return res;
	});
};


const AssistantMarkdown = ({ content }: { content: string }) => (
	<div className="prose prose-sm max-w-none">
		<Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={mdComponents}>
			{content}
		</Markdown>
	</div>
);

interface ToolSummaryItem {
	toolName: string;
	display: string;
	completed: boolean;
	intentionSummary?: string;
}

interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	reasoning?: string;
	timestamp: number;
	intermediate?: boolean;
	queued?: boolean; // user message sent while agent was mid-turn
	toolSummary?: ToolSummaryItem[];
	toolCallIds?: string[]; // tool call IDs dispatched by this message (for tracking completion)
	askUserChoices?: string[];
	questionChoices?: string[];
	images?: string[]; // data: URIs for attached images
	imageTool?: ToolSummaryItem; // for image-only bubbles: the tool that produced the image (provenance caption)
	bytes?: number;
}

interface PortalEvent {
	type: string;
	content?: string;
	sessionId?: string;
	shielded?: boolean;
	session?: SessionInfo;
	summary?: string;
	path?: string;
	changeType?: string;
	timestamp?: number;
	toolName?: string;
	params?: unknown;
	result?: unknown;
	requestId?: string;
	approval?: ApprovalRequest;
	inputRequest?: InputRequest;
	model?: string;
	toolCallId?: string;
	mcpServerName?: string;
	displayLabel?: string;
	intermediate?: boolean;
	role?: string;
	images?: string[];
	imageTool?: ToolSummaryItem;
	turnActive?: boolean;
	total?: number;
	shown?: number;
	askUserChoices?: string[];
	questionChoices?: string[];
	toolSummary?: ToolSummaryItem[];
	intentionSummary?: string;
	rules?: ApprovalRule[];
	approveAll?: boolean;
	bytes?: number;
	sizeMB?: string;
}

function buildToolSummary(events: ToolEvent[]): ToolSummaryItem[] {
	// tool_start events get mutated to tool_complete when done — include both
	// Exclude ask_user and report_intent — they're not "tools" from the user's perspective
	const toolCalls = events.filter(te =>
		(te.type === 'tool_start' || te.type === 'tool_complete') &&
		te.toolName !== 'ask_user' && te.toolName !== 'report_intent'
	);
	return toolCalls.map(te => {
		let display = te.displayLabel ?? '';
		if (!display) {
			// fallback for older events without displayLabel
			try {
				const args = JSON.parse(te.content ?? '{}') as Record<string, unknown>;
				const val = args.command ?? args.path ?? args.query ?? args.script ?? args.url ?? Object.values(args)[0] ?? '';
				display = String(val).replace(/\s+/g, ' ').trim().slice(0, 200);
			} catch { display = (te.content ?? '').slice(0, 100); }
		}
		return { toolName: te.toolName ?? 'tool', display, completed: te.type === 'tool_complete', intentionSummary: te.intentionSummary };
	});
}

interface ToolEvent {
	id: string;
	type: 'tool_start' | 'tool_complete' | 'tool_output' | 'intent';
	toolName?: string;
	toolCallId?: string;
	mcpServerName?: string;
	displayLabel?: string;
	intentionSummary?: string;
	content?: string;
	timestamp: number;
}

interface ApprovalRequest {
	requestId: string;
	action: string;
	summary: string;
	details: unknown;
	alwaysPattern?: string;
	warning?: string;
}

interface ApprovalRule {
	id: string;
	sessionId: string;
	kind: string;
	pattern: string;
	createdAt: number;
}

interface InputRequest {
	requestId: string;
	question: string;
	choices?: string[];
	allowFreeform?: boolean;
}

interface PortalInfo {
	version: string;
	login: string;
	defaultCwd?: string;
	lanUrl?: string;
	models: Array<{ id: string; name: string; contextWindow?: number; vision?: boolean; reasoning?: boolean; premium?: boolean; multiplier?: number; priceCategory?: string }>;
}

interface SessionContext {
	cwd: string;
	gitRoot?: string;
	repository?: string;
	branch?: string;
}

interface SessionInfo {
	sessionId: string;
	summary?: string;
	startTime?: string;
	modifiedTime?: string;
	shielded?: boolean;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'no_token';

interface PackageUpdate {
	name: string;
	installed: string;
	latest: string;
	hasUpdate: boolean;
}

interface UpdateStatus {
	packages: PackageUpdate[];
	portal: { installed: string; latest: string; hasUpdate: boolean; downloadUrl: string | null } | null;
	lastChecked: number | null;
	checking: boolean;
	applying: boolean;
	restartNeeded: boolean;
	error: string | null;
}

function getToken(): string | null {
	if (portalTokenInvalid) return null;
	const urlToken = new URLSearchParams(window.location.search).get('token');
	if (urlToken) {
		localStorage.setItem('portal_token', urlToken);
		return urlToken;
	}
	const stored = localStorage.getItem('portal_token');
	if (stored) {
		// Ensure token is in the URL bar so iOS "Add to Home Screen" captures it
		const params = new URLSearchParams(window.location.search);
		params.set('token', stored);
		window.history.replaceState(null, '', `?${params.toString()}`);
	}
	return stored;
}

function timeAgo(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const m = Math.floor(diff / 60000);
	if (m < 1) return 'just now';
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	const copy = () => {
		const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
		if (navigator.clipboard) {
			navigator.clipboard.writeText(text).then(done).catch(() => fallback());
		} else {
			fallback();
		}
		function fallback() {
			const el = document.createElement('textarea');
			el.value = text;
			el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
			document.body.appendChild(el);
			el.select();
			document.execCommand('copy');
			document.body.removeChild(el);
			done();
		}
	};
	return (
		<button
			type="button"
			onClick={copy}
			className="shrink-0 rounded p-0.5 opacity-40 hover:opacity-80 transition-opacity"
			title="Copy"
			style={{ color: 'inherit' }}
		>
			{copied
				? <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
				: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
			}
		</button>
	);
}

function CopyRichButton({ htmlRef, plainText }: { htmlRef: React.RefObject<HTMLDivElement | null>; plainText?: string }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		const html = htmlRef.current?.innerHTML;
		if (!html) return;
		const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };

		// Strip dark-theme colors so paste into OneNote/Word/Teams looks clean.
		// Keep structure (bold, lists, headings, code blocks) but remove color/background styles.
		// Also remove table copy buttons (data-copy-button) from the output.
		const cleanHtml = html
			.replace(/<button[^>]*data-copy-button[^>]*>[\s\S]*?<\/button>/g, '') // strip table copy buttons
			.replace(/\sstyle="[^"]*"/g, '') // strip all inline styles
			.replace(/\sclass="[^"]*"/g, ''); // strip Tailwind classes

		// Try Clipboard API first (needs HTTPS or localhost) — writes both rich + plain text
		if (navigator.clipboard?.write) {
			try {
				const items: Record<string, Blob> = { 'text/html': new Blob([cleanHtml], { type: 'text/html' }) };
				if (plainText) items['text/plain'] = new Blob([plainText], { type: 'text/plain' });
				await navigator.clipboard.write([new ClipboardItem(items)]);
				done();
				return;
			} catch { /* fall through to execCommand */ }
		}

		// Fallback: offscreen contenteditable + execCommand
		// Force light-theme colors so paste into OneNote/Word doesn't carry dark theme
		const el = document.createElement('div');
		el.contentEditable = 'true';
		el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;color:#000;background:#fff';
		el.innerHTML = cleanHtml;
		document.body.appendChild(el);
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
		document.execCommand('copy');
		sel?.removeAllRanges();
		document.body.removeChild(el);
		done();
	};
	return (
		<button
			type="button"
			onClick={copy}
			className="shrink-0 rounded p-0.5 opacity-40 hover:opacity-80 transition-opacity"
			title="Copy formatted (for Word, Teams, OneNote…)"
			style={{ color: 'inherit' }}
		>
			{copied
				? <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
				: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<rect x="9" y="9" width="13" height="13" rx="2" />
					<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
					<path d="M12 13h5M12 16h3" strokeLinecap="round" />
				  </svg>
			}
		</button>
	);
}

function describeDataUrl(src: string): { mime?: string; bytes?: number } {
	// Parse a data: URL to surface its mime type and approximate byte size.
	const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(src);
	if (!m) return {};
	const mime = m[1] || undefined;
	const isB64 = !!m[2];
	const payload = m[3] ?? '';
	let bytes: number | undefined;
	if (isB64) {
		const pad = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
		bytes = Math.max(0, Math.floor((payload.length * 3) / 4) - pad);
	} else {
		try { bytes = new TextEncoder().encode(decodeURIComponent(payload)).length; } catch { bytes = payload.length; }
	}
	return { mime, bytes };
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssistantMessageBlock({ content, timestamp, bytes }: { content: string; timestamp: number; bytes?: number }) {
	const htmlRef = useRef<HTMLDivElement>(null);
	return (
		<>
			<div ref={htmlRef}><AssistantMarkdown content={content} /></div>
			<div className="mt-1 flex items-center justify-between gap-2 text-xs opacity-50">
				<span>{new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
				{/* Message size indicator — hidden for now, revisit later */}
				{/* {bytes != null && bytes > 0 && (
					<span className="font-mono tabular-nums">
						{bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`}
					</span>
				)} */}
				<div className="flex items-center gap-1">
					<CopyRichButton htmlRef={htmlRef} plainText={content} />
					<CopyButton text={content} />
				</div>
			</div>
		</>
	);
}

function ThoughtBubble({ reasoning, defaultExpanded = false }: { reasoning: string; defaultExpanded?: boolean }) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	return (
		<div className="mb-1 max-w-[85%]">
			<button
				type="button"
				className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
				style={{ background: 'var(--muted-tint)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
				onClick={() => setExpanded(e => !e)}
			>
				<span style={{ fontSize: '10px' }}>{expanded ? '▾' : '▸'}</span>
				<span className="italic">Thought{expanded ? '' : '…'}</span>
			</button>
			{expanded && (
				<div
					className="mt-1 rounded-xl px-3 py-2 text-xs"
					style={{
						background: 'var(--muted-tint)',
						border: '1px solid var(--border)',
						color: 'var(--text-muted)',
						whiteSpace: 'pre-wrap',
						wordBreak: 'break-word',
					}}
				>
					{reasoning}
				</div>
			)}
		</div>
	);
}

function ToolEventBox({ tc }: { tc: ToolEvent }) {
	const [expanded, setExpanded] = useState(false);
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		if (tc.type !== 'tool_start') return;
		setElapsed(Math.floor((Date.now() - tc.timestamp) / 1000));
		const timer = setInterval(() => setElapsed(Math.floor((Date.now() - tc.timestamp) / 1000)), 1000);
		return () => clearInterval(timer);
	}, [tc.type, tc.timestamp]);
	if (tc.type === 'tool_output') return (
		<div className="chat-scroll mb-1 rounded-lg border px-3 py-2 text-xs font-mono" style={{ borderColor: 'var(--border)', background: 'var(--muted-tint)', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '120px', overflowY: 'auto' }}>
			{tc.content}
		</div>
	);
	if (tc.type === 'intent') return (
		<div className="mb-1 flex items-center gap-1.5 text-xs italic py-0.5">
			<span style={{ color: 'var(--purple)' }}>●</span><span style={{ color: 'var(--text-muted)' }}>{tc.content}</span>
		</div>
	);
	const isComplete = tc.type === 'tool_complete';
	const isError = isComplete && tc.content !== 'success' && tc.content !== 'done';
	const isUnsuccessful = isComplete && tc.content === 'done'; // ran but returned false/non-zero
	const label = tc.mcpServerName ? `${tc.mcpServerName} › ${tc.toolName}` : (tc.toolName ?? 'tool');
	const borderColor = isError ? 'var(--error)' : isComplete ? 'var(--success)' : 'var(--tool-call)';
	const bgColor = isError ? 'var(--error-tint)' : isComplete ? 'var(--success-tint)' : 'var(--tool-call-tint)';
	const textColor = isError ? 'var(--error)' : isComplete ? 'var(--success)' : 'var(--tool-call)';
	const hasDetail = !!(tc.displayLabel || tc.content);
	return (
		<div className="mb-2">
			{tc.intentionSummary && (
				<div className="mb-1 flex items-center gap-1.5 text-xs italic py-0.5">
					<span style={{ color: 'var(--purple)' }}>●</span><span style={{ color: 'var(--text-muted)' }}>{tc.intentionSummary}</span>
				</div>
			)}
			<div className="rounded-lg border text-xs" style={{ borderColor, background: bgColor }}>
			<div
				className="flex items-center gap-1.5 p-3 font-medium"
				style={{ color: textColor, cursor: hasDetail ? 'pointer' : 'default', userSelect: 'none' }}
				onClick={() => hasDetail && setExpanded(e => !e)}
			>
				<span className="flex shrink-0 items-center justify-center" style={{ width: 14, height: 14 }}>{isError ? '✗' : isUnsuccessful ? '✗' : isComplete ? <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg> : <svg className="size-3.5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}</span>
				<span className="flex-1">
					{isError ? 'Failed' : isComplete ? 'Done' : 'Running'}: {label}
					{isError && tc.displayLabel && <span style={{ fontWeight: 'normal', opacity: 0.7 }}> — {tc.displayLabel}</span>}
				</span>
				{!isComplete && elapsed > 0 && <span style={{ fontSize: '10px', opacity: 0.5 }}>{elapsed >= 60 ? `${Math.floor(elapsed/60)}m ${elapsed%60}s` : `${elapsed}s`}</span>}
				{!isComplete && <button type="button" title="Copy debug info" style={{ fontSize: '10px', opacity: 0.5, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'inherit' }} onClick={(e) => {
					e.stopPropagation();
					const info = [`tool: ${label}`, elapsed > 0 ? `elapsed: ${elapsed}s` : null, tc.displayLabel ? `label: ${tc.displayLabel}` : null, tc.content ? `args: ${tc.content}` : null].filter(Boolean).join('\n');
					navigator.clipboard.writeText(info).catch(() => {});
				}}><svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>}
				{hasDetail && <span style={{ fontSize: '10px', opacity: 0.6 }}>{expanded ? '▾' : '▸'}</span>}
			</div>
			{expanded && hasDetail && (
				<div className="border-t px-3 pb-3 pt-2" style={{ borderColor, color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '11px' }}>
					{tc.displayLabel && <div className="mb-1 font-medium" style={{ color: textColor }}>{tc.displayLabel}</div>}
					{tc.content && (() => {
						try { return JSON.stringify(JSON.parse(tc.content), null, 2); }
						catch { return tc.content; }
					})()}
				</div>
			)}
			</div>
		</div>
	);
}

function FolderBrowser({ value, onChange }: { value: string; onChange: (path: string) => void }) {
	const [browsePath, setBrowsePath] = useState(value || '');
	const [folders, setFolders] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isValid, setIsValid] = useState(true);
	const [creatingFolder, setCreatingFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState('');
	const [isDriveList, setIsDriveList] = useState(false);

	const fetchFolders = useCallback((p: string) => {
		setLoading(true);
		setError(null);
		setCreatingFolder(false);
		apiFetch(`/api/browse?path=${encodeURIComponent(p)}`).then(r => r.json()).then((data: { path: string; exists: boolean; isDir: boolean; folders: string[]; error?: string; isDriveList?: boolean }) => {
			setBrowsePath(data.path);
			setFolders(data.folders);
			setIsDriveList(!!data.isDriveList);
			setIsValid(data.exists && data.isDir);
			setError(data.error ?? (!data.exists ? 'Path does not exist' : !data.isDir ? 'Not a directory' : null));
			if (data.exists && data.isDir && !data.isDriveList) onChange(data.path);
			setLoading(false);
		}).catch(() => { setLoading(false); setError('Failed to browse'); });
	}, [onChange]);

	// Fetch once on mount only. Empty deps are intentional: the parent-provided
	// `value`/`fetchFolders` change on every keystroke, but re-running this effect
	// on those changes would refetch the folder list mid-edit. Subsequent fetches
	// are driven explicitly by navigation handlers, not by this effect.
	useEffect(() => { fetchFolders(value || ''); }, []);

	const segments = browsePath.split(/[\\/]/).filter(Boolean);
	// Detect OS path separator from the server-resolved path
	const sep = browsePath.includes('\\') ? '\\' : '/';
	// A POSIX absolute path (e.g. /work) must keep its leading slash in each
	// breadcrumb, otherwise clicking a crumb sends a relative path the server
	// resolves against its own cwd → "Path does not exist".
	const isPosixAbsolute = sep === '/' && browsePath.startsWith('/');
	const breadcrumbs: { label: string; path: string }[] = [];
	for (let i = 0; i < segments.length; i++) {
		let p = segments.slice(0, i + 1).join(sep);
		if (sep === '\\' && i === 0) p = p + sep; // Windows drive root (C: → C:\)
		else if (isPosixAbsolute) p = '/' + p; // restore POSIX leading slash
		breadcrumbs.push({ label: segments[i], path: p });
	}

	return (
		<div className="rounded-lg text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
			{/* Breadcrumb path */}
			<div className="flex items-center gap-0.5 px-3 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
				<button type="button" className="rounded px-1 py-0.5 font-mono hover:underline" style={{ color: 'var(--accent)' }} onClick={() => fetchFolders('')} title="Root">
					<svg className="size-3 inline-block mr-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10" /></svg>
				</button>
				{breadcrumbs.map((b, i) => (
					<span key={i} className="flex items-center gap-0.5">
						<span style={{ color: 'var(--text-muted)' }}>{sep}</span>
						<button type="button" className="rounded px-1 py-0.5 font-mono hover:underline" style={{ color: i === breadcrumbs.length - 1 ? 'var(--text)' : 'var(--accent)' }} onClick={() => fetchFolders(b.path)}>
							{b.label}
						</button>
					</span>
				))}
				{loading && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>…</span>}
			</div>
			{/* Folder list */}
			<div className="code-scroll max-h-40 overflow-y-auto">
				{!isDriveList && (creatingFolder ? (
					<form className="flex items-center gap-2 px-3 py-1.5" onSubmit={async (e) => {
						e.preventDefault();
						const name = newFolderName.trim();
						if (!name) return;
						try {
							await apiFetch('/api/browse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentPath: browsePath, name }) });
							setCreatingFolder(false);
							setNewFolderName('');
							fetchFolders(browsePath + sep + name);
						} catch { setError('Failed to create folder'); }
					}}>
						<svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}>
							<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
						</svg>
						<input className="flex-1 min-w-0 bg-transparent border-none outline-none font-mono text-xs" style={{ color: 'var(--text)', borderBottom: '1px solid var(--accent)' }} value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="folder name" autoFocus />
						<button type="submit" className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--primary-contrast)', background: 'var(--primary)' }} disabled={!newFolderName.trim()}>Create</button>
						<button type="button" className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-muted)' }} onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>✕</button>
					</form>
				) : isValid && !error && (
					<button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--surface)]" style={{ color: 'var(--text-muted)' }} onClick={() => setCreatingFolder(true)}>
						<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
						<span className="text-xs">New Folder</span>
					</button>
				))}
				{error && <div className="px-3 py-2 italic" style={{ color: 'var(--error)' }}>{error}</div>}
				{!error && folders.length === 0 && !loading && !creatingFolder && (
					<div className="px-3 py-2 italic" style={{ color: 'var(--text-muted)' }}>No subfolders</div>
				)}
				{folders.map(f => (
					<button key={f} type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--surface)]" onClick={() => { setCreatingFolder(false); fetchFolders(isDriveList ? f + '\\' : browsePath + sep + f); }}>
						<svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}>
							{isDriveList
								? <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12h8M12 8v8" /></>
								: <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
							}
						</svg>
						<span className="font-mono" style={{ color: 'var(--text)' }}>{f}{isDriveList ? '\\' : ''}</span>
					</button>
				))}
			</div>
			{/* Selected path display */}
			{isValid && !error && !isDriveList && (
				<div className="px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--border)' }}>
					<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
					<span className="font-mono truncate" style={{ color: 'var(--text-muted)' }}>{browsePath}</span>
				</div>
			)}
		</div>
	);
}

function SessionDrawer({
	open,
	onToggle,
	info,
	context,
	activeModel,
	onChangeModel,
	onFetchModels,
	onFetchQuota,
	activeSessionId,
	sessionSummary,
	sessionStartTime,
	sessionUsage,
	sessionQuota,
	contextUsage,
	draft,
	onDraftCwdChange,
	onCreateDraft,
	onChangeCwd,
	onAgentChange,
	onMcpChanged,
	mcpServers,
	setMcpServers,
	mcpConfirm,
	setMcpConfirm,
	skills,
}: {
	open: boolean;
	onToggle: () => void;
	info: PortalInfo | null;
	context: SessionContext | null;
	activeModel: string | null;
	onChangeModel: (id: string) => void;
	onFetchModels?: () => Promise<Array<{ id: string; name: string; contextWindow?: number; vision?: boolean; reasoning?: boolean; premium?: boolean; multiplier?: number; priceCategory?: string }>>;
	onFetchQuota?: () => Promise<{ quotaSnapshots: Record<string, { entitlementRequests: number; usedRequests: number; remainingPercentage: number; resetDate?: string }> }>;
	activeSessionId?: string | null;
	sessionSummary?: string | null;
	sessionStartTime?: string;
	sessionUsage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; reasoningTokens: number; requests: number } | null;
	sessionQuota?: { unlimited: boolean; used: number; total: number; remaining: number; resetDate?: string } | null;
	contextUsage?: { tokenLimit: number; currentTokens: number; systemTokens: number; conversationTokens: number; toolDefinitionsTokens: number } | null;
	draft?: { cwd: string } | null;
	onDraftCwdChange?: (cwd: string) => void;
	onCreateDraft?: () => void;
	onChangeCwd?: (newCwd: string) => Promise<void>;
	onAgentChange?: (agentName: string | null) => void;
	onMcpChanged?: () => void;
	mcpServers: Array<{ name: string; type: string; source: string; enabled: boolean; status?: string }>;
	setMcpServers: React.Dispatch<React.SetStateAction<Array<{ name: string; type: string; source: string; enabled: boolean; status?: string }>>>;
	mcpConfirm: { message: string; onConfirm: () => void } | null;
	setMcpConfirm: React.Dispatch<React.SetStateAction<{ message: string; onConfirm: () => void } | null>>;
	skills: Array<{ name: string; description: string; source: string; enabled: boolean; userInvocable: boolean }>;
}) {
	const [showModelPicker, setShowModelPicker] = useState(false);
	const [liveModels, setLiveModels] = useState<Array<{ id: string; name: string; contextWindow?: number; vision?: boolean; reasoning?: boolean; premium?: boolean; multiplier?: number; priceCategory?: string }> | null>(null);
	const [quota, setQuota] = useState<{ unlimited: boolean; used: number; total: number; remaining: number; resetDate?: string } | null>(null);
	const [editingCwd, setEditingCwd] = useState(false);
	const [cwdSaving, setCwdSaving] = useState(false);
	const [browsedCwd, setBrowsedCwd] = useState('');
	// Draft new-session: default to a fresh auto-created workspace (work/YYMMDD-NN).
	// Opt out to pick an existing folder. Reset to "fresh" each time a draft opens.
	const [useFreshWorkspace, setUseFreshWorkspace] = useState(true);
	const prevDraftRef = useRef(false);
	useEffect(() => {
		const isDraft = !!draft;
		if (isDraft && !prevDraftRef.current) {
			setUseFreshWorkspace(true);
			onDraftCwdChange?.('');
		}
		prevDraftRef.current = isDraft;
	}, [draft, onDraftCwdChange]);
	const [showAgentPicker, setShowAgentPicker] = useState(false);
	const [agents, setAgents] = useState<Array<{ name: string; displayName: string; description: string; source?: string }>>([]);
	const [currentAgent, setCurrentAgent] = useState<{ name: string; displayName: string; description: string } | null>(null);
	const [agentsAtBottom, setAgentsAtBottom] = useState(false);
	const [modelsAtBottom, setModelsAtBottom] = useState(false);
	const [mcpListAtBottom, setMcpListAtBottom] = useState(true);
	const [mcpFeaturedAtBottom, setMcpFeaturedAtBottom] = useState(true);
	const [showMcpList, setShowMcpList] = useState(false);
	const [showSkillsList, setShowSkillsList] = useState(false);
	const [skillsListAtBottom, setSkillsListAtBottom] = useState(true);
	const [showMcpAdd, setShowMcpAdd] = useState(false);
	const [mcpAddName, setMcpAddName] = useState('');
	const [mcpAddCommand, setMcpAddCommand] = useState('');
	const [mcpAddType, setMcpAddType] = useState<'featured' | 'command' | 'url'>('featured');
	const [mcpAdding, setMcpAdding] = useState(false);
	const [mcpLoading, setMcpLoading] = useState(false);
	const [m365Servers, setM365Servers] = useState<Array<{ name: string; label: string; toolCount: number; description: string }> | null>(null);
	const [m365TenantId, setM365TenantId] = useState<string | null>(null);
	const [m365Loading, setM365Loading] = useState(false);
	const mcpPickerRef = useRef<HTMLDivElement>(null);
	const skillsPickerRef = useRef<HTMLDivElement>(null);
	const agentPickerRef = useRef<HTMLDivElement>(null);
	const modelPickerRef = useRef<HTMLDivElement>(null);

	const confirmMcpChange = (action: () => Promise<void>) => {
		setMcpConfirm({
			message: 'This will restart the Copilot CLI and reload the page.',
			onConfirm: () => {
				setMcpConfirm(null);
				action().then(() => onMcpChanged?.());
			},
		});
	};
	const models = liveModels ?? info?.models ?? [];
	const currentModelId = activeModel ?? models[0]?.id ?? null;
	const currentModelName = models.find(m => m.id === currentModelId)?.name ?? currentModelId ?? '…';
	const cwd = context?.cwd ?? null;
	const branch = context?.branch ?? null;
	const shortCwd = cwd ? cwd.split(/[\\/]/).pop() || cwd : null;

	// Fetch quota when drawer opens
	useEffect(() => {
		if (open && onFetchQuota && !quota) {
			onFetchQuota().then(data => {
				const chat = data.quotaSnapshots?.['chat'] ?? data.quotaSnapshots?.['premium_interactions'];
				if (chat) setQuota({ unlimited: false, used: chat.usedRequests, total: chat.entitlementRequests, remaining: chat.remainingPercentage, resetDate: chat.resetDate });
			}).catch(() => {});
		}
		// Fetch current agent on mount / session change
		if (activeSessionId && !draft) {
			apiFetch(`/api/sessions/${encodeURIComponent(activeSessionId)}/agents`).then(r => r.json()).then((data: { agents: typeof agents; current: typeof currentAgent }) => {
				setAgents(data.agents);
				setCurrentAgent(data.current);
				onAgentChange?.(data.current?.displayName ?? data.current?.name ?? null);
			}).catch(() => {});
		}
	}, [open, activeSessionId]);

	// Seed MCP server list from config — only on session change
	useEffect(() => {
		if (activeSessionId && !draft) {
			apiFetch('/api/mcp').then(r => r.json()).then((data: { servers: typeof mcpServers }) => {
				setMcpServers(prev => {
					const fetched = data.servers ?? [];
					if (prev.length === 0) return fetched;
					const result = [...prev];
					for (const s of fetched) {
						if (!result.find(x => x.name === s.name)) result.push(s);
					}
					return result;
				});
			}).catch(() => {});
		}
	}, [activeSessionId]);

	// Click-away to close pickers
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (showAgentPicker && agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) {
				setShowAgentPicker(false);
			}
			if (showModelPicker && modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
				setShowModelPicker(false);
			}
			if (showMcpList && mcpPickerRef.current && !mcpPickerRef.current.contains(e.target as Node)) {
				setShowMcpList(false); setShowMcpAdd(false);
			}
			if (showSkillsList && skillsPickerRef.current && !skillsPickerRef.current.contains(e.target as Node)) {
				setShowSkillsList(false);
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [showAgentPicker, showModelPicker, showMcpList, showSkillsList]);

	return (
		<div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'relative', zIndex: 20 }}>
			{/* Bar: session name (click-to-rename) + flex spacer (click-to-toggle) + session ID + chevron */}
			<button className="flex w-full items-center gap-2 border-none bg-transparent px-4 py-2 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }} onClick={onToggle} type="button">
				{/* Session summary — read-only */}
				<div className="relative flex-1 overflow-hidden min-w-0" style={{ whiteSpace: 'nowrap', textAlign: 'left' }}>
					<span style={{ color: draft ? 'var(--primary)' : sessionSummary ? 'var(--text)' : 'var(--text-muted)' }}>
						{draft ? 'New Session' : sessionSummary || <em>untitled session</em>}
					</span>
					<div className="pointer-events-none absolute top-0 right-0 bottom-0" style={{ width: 24, background: 'linear-gradient(to right, transparent, var(--surface))' }} />
				</div>
				{/* Right side: session ID + chevron */}
				<div className="flex items-center gap-1.5 shrink-0">
					{activeSessionId && (
						<span
							className="font-mono text-[10px] opacity-40 hover:opacity-80 cursor-pointer"
							title="Copy session ID"
							onMouseDown={(e) => {
								e.stopPropagation();
								e.preventDefault();
							}}
							onClick={(e) => {
								e.stopPropagation();
								e.preventDefault();
								const id = activeSessionId;
								if (navigator.clipboard) {
									navigator.clipboard.writeText(id).catch(() => {});
								} else {
									const ta = document.createElement('textarea');
									ta.value = id;
									document.body.appendChild(ta);
									ta.select();
									document.execCommand('copy');
									document.body.removeChild(ta);
								}
								const el = e.currentTarget;
								const orig = el.textContent;
								el.textContent = '✓ copied';
								setTimeout(() => { el.textContent = orig; }, 1200);
							}}
						>
							{activeSessionId.slice(0, 8)}
						</span>
					)}
					<svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}><polyline points="6 9 12 15 18 9" /></svg>
				</div>
			</button>

			{/* Expandable panel */}
			{open && (
				<div className="absolute left-0 right-0 px-4 pb-4 pt-1" style={{ top: '100%', background: 'var(--surface)', borderBottom: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 20 }}>
					{/* Version + user + session info */}
					<div className="mb-3 flex items-center gap-2.5">
						<div className="shrink-0">
							<svg className="size-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M23.922 16.992c-.861 1.495-5.859 5.023-11.922 5.023-6.063 0-11.061-3.528-11.922-5.023A.641.641 0 0 1 0 16.736v-2.869a.841.841 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.195 10.195 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952 1.399-1.136 3.392-2.093 6.122-2.093 2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.832.832 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256ZM12.172 11h-.344a4.323 4.323 0 0 1-.355.508C10.703 12.455 9.555 13 7.965 13c-1.725 0-2.989-.359-3.782-1.259a2.005 2.005 0 0 1-.085-.104L4 11.741v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.323 4.323 0 0 1-.355-.508h-.016.016Zm.641-2.935c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z" />
								<path d="M14.5 14.25a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Zm-5 0a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z" />
							</svg>
						</div>
						<div>
							<div className="text-sm font-semibold">GitHub Copilot CLI</div>
							<div className="text-xs" style={{ color: 'var(--text-muted)' }}>
								{info ? <>v{info.version} · <a href="https://github.com/settings/copilot" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{info.login}</a></> : 'Loading…'}
							</div>
						</div>
						<div className="flex-1" />
						<div className="text-right text-xs" style={{ color: 'var(--text-muted)' }}>
							{sessionStartTime && (
								<div>Started {new Date(sessionStartTime).toLocaleString()}</div>
							)}
							{sessionQuota ? (
								sessionQuota.unlimited
									? <div>Quota: Unlimited{sessionQuota.resetDate ? ` · resets ${new Date(sessionQuota.resetDate).toLocaleDateString()}` : ''}</div>
									: <div>Quota: {sessionQuota.used}/{sessionQuota.total} ({sessionQuota.remaining}% left){sessionQuota.resetDate ? ` · resets ${new Date(sessionQuota.resetDate).toLocaleDateString()}` : ''}</div>
							) : (
								<div>Quota: tbd</div>
							)}
						</div>
					</div>

					{/* cwd / branch */}
					{draft ? (
						<div className="mb-3">
							<label className="flex items-center gap-2 mb-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
								<svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
									<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
								</svg>
								Working Directory
							</label>
								<label className="flex items-center gap-2 mb-1.5 text-xs cursor-pointer" style={{ color: 'var(--text)' }}>
									<input
										type="checkbox"
										checked={useFreshWorkspace}
										onChange={(e) => {
											const fresh = e.target.checked;
											setUseFreshWorkspace(fresh);
											if (fresh) onDraftCwdChange?.('');
										}}
									/>
									Create a new workspace folder
								</label>
								{useFreshWorkspace ? (
									<div className="rounded-lg px-3 py-2 text-xs font-mono" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
										{(info?.defaultCwd ?? 'work')}{(info?.defaultCwd?.includes('\\') ? '\\' : '/')}<span style={{ color: 'var(--accent)' }}>YYMMDD-NN</span>
									</div>
								) : (
									<FolderBrowser value={draft.cwd} onChange={(p) => onDraftCwdChange?.(p)} />
								)}
							</div>
						) : editingCwd ? (
					<div className="mb-3">
						<div className="flex items-center justify-between mb-1.5">
							<label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
								<svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
									<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
								</svg>
								Working Directory
							</label>
							<div className="flex gap-2">
								<button type="button" className="rounded-lg px-3 py-1 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setEditingCwd(false)}>Cancel</button>
								<button type="button" className="rounded-lg px-3 py-1 text-xs font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-contrast)', opacity: (!browsedCwd || browsedCwd === cwd || cwdSaving) ? 0.5 : 1 }} disabled={!browsedCwd || browsedCwd === cwd || cwdSaving} onClick={async () => {
									if (!onChangeCwd || !browsedCwd || browsedCwd === cwd) return;
									setCwdSaving(true);
									try { await onChangeCwd(browsedCwd); } catch {}
									setCwdSaving(false);
									setEditingCwd(false);
								}}>{cwdSaving ? 'Applying…' : 'Apply'}</button>
							</div>
						</div>
						<FolderBrowser value={cwd ?? ''} onChange={(p) => setBrowsedCwd(p)} />
					</div>
					) : (
					<div className="code-scroll mb-3 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
						<svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
							<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
						</svg>
						{cwd ? (
							<span className="whitespace-nowrap font-mono" style={{ color: 'var(--text-muted)' }}>{cwd}</span>
						) : (
							<span className="whitespace-nowrap font-mono italic" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>Loading…</span>
						)}
						{branch && (
							<>
								<span style={{ color: 'var(--border)' }}>·</span>
								<svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
									<path d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9" />
								</svg>
								<span className="font-mono" style={{ color: 'var(--text-muted)' }}>{branch}</span>
							</>
						)}
						<div className="flex-1" />
						<span
							className="shrink-0 cursor-pointer opacity-40 hover:opacity-80"
							title="Copy path"
							onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
							onClick={(e) => {
								e.stopPropagation();
								e.preventDefault();
								if (!cwd) return;
								if (navigator.clipboard) {
									navigator.clipboard.writeText(cwd).catch(() => {});
								} else {
									const ta = document.createElement('textarea');
									ta.value = cwd;
									document.body.appendChild(ta);
									ta.select();
									document.execCommand('copy');
									document.body.removeChild(ta);
								}
								const el = e.currentTarget;
								el.innerHTML = '✓';
								setTimeout(() => { el.innerHTML = '<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'; }, 1200);
							}}
						><svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg></span>
						<span className="shrink-0 cursor-pointer opacity-40 hover:opacity-80" title="Edit working directory" onClick={() => { setBrowsedCwd(cwd ?? ''); setEditingCwd(true); }}>
							<svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
						</span>
					</div>
					)}

					{/* Session usage stats */}
					{sessionUsage && sessionUsage.requests > 0 && (
						<div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-mono" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
							<span className="flex-1">
								Tokens: {sessionUsage.inputTokens.toLocaleString()} ↑ {sessionUsage.outputTokens.toLocaleString()} ↓
								{sessionUsage.reasoningTokens > 0 && ` · Reasoning: ${sessionUsage.reasoningTokens.toLocaleString()}`}
								{sessionUsage.cacheReadTokens > 0 && ` · Cached: ${sessionUsage.cacheReadTokens.toLocaleString()}`}
								{` · Credits: ${sessionUsage.requests.toLocaleString()}`}
							</span>
							<CopyButton text={`Tokens: ${sessionUsage.inputTokens.toLocaleString()} ↑ ${sessionUsage.outputTokens.toLocaleString()} ↓${sessionUsage.reasoningTokens > 0 ? ` · Reasoning: ${sessionUsage.reasoningTokens.toLocaleString()}` : ''}${sessionUsage.cacheReadTokens > 0 ? ` · Cached: ${sessionUsage.cacheReadTokens.toLocaleString()}` : ''} · Credits: ${sessionUsage.requests.toLocaleString()}`} />
						</div>
					)}

					{/* MCP Servers — read-only list for active sessions */}
					{!draft && activeSessionId && (
						<div className="relative mt-3" ref={mcpPickerRef}>
							<button
								type="button"
								className="flex w-full items-center justify-between px-3 py-2 text-sm"
								style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: showMcpList ? '0.5rem 0.5rem 0 0' : '0.5rem' }}
								onClick={() => {
									const opening = !showMcpList;
									setShowMcpList(opening);
									if (!opening) setShowMcpAdd(false);
								}}
							>
								<div className="flex items-center gap-2">
									<svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
										<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
									</svg>
									<span>{mcpServers.filter(s => s.enabled).length > 0 ? `${mcpServers.filter(s => s.enabled).length} MCP server${mcpServers.filter(s => s.enabled).length !== 1 ? 's' : ''} active` : 'MCP servers'}</span>
								</div>
								<span style={{ color: 'var(--text-muted)' }}>{showMcpList ? '\u25b4' : '\u25be'}</span>
							</button>
							{showMcpList && (() => {
								const installedNames = new Set(mcpServers.map(s => s.name));
								return (
								<div className="absolute z-10 overflow-hidden" style={{ left: 0, right: 0, top: '100%', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 0.5rem 0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
								<div className="relative">
								<div className="chat-scroll max-h-56 overflow-y-auto py-1" style={{ background: 'var(--surface)' }}
									onScroll={e => { const el = e.currentTarget; setMcpListAtBottom(el.scrollHeight <= el.clientHeight || el.scrollHeight - el.scrollTop - el.clientHeight < 4); }}
									ref={el => { if (el) setMcpListAtBottom(el.scrollHeight <= el.clientHeight || el.scrollHeight - el.scrollTop - el.clientHeight < 4); }}>
									{/* Active servers */}
									{mcpServers.map(s => {
										const isBuiltin = s.source === 'builtin';
										const isRemovable = !isBuiltin && s.source !== 'plugin';
										const label = s.name;
										const knownInfo: Record<string, { desc: string; url?: string }> = {
											'github-mcp-server': { desc: 'Repositories, issues, PRs, code search', url: 'https://github.com/github/github-mcp-server' },
											'workiq': { desc: 'M365 read-only — emails, meetings, Teams, documents', url: 'https://www.npmjs.com/package/@microsoft/workiq' },
											'WorkIQ': { desc: 'M365 read-only — emails, meetings, Teams, documents', url: 'https://www.npmjs.com/package/@microsoft/workiq' },
											'playwright': { desc: 'Browser automation and web scraping', url: 'https://github.com/microsoft/playwright-mcp' },
											'Playwright': { desc: 'Browser automation and web scraping', url: 'https://github.com/microsoft/playwright-mcp' },
											'Teams': { desc: 'Messages, channels, chats, files, search', url: 'https://github.com/microsoft/mcp#-microsoft-teams' },
											'Calendar': { desc: 'Events, meeting times, rooms, RSVP', url: 'https://github.com/microsoft/mcp#-microsoft-365-calendar' },
											'Planner': { desc: 'Plans, goals, tasks, groups', url: 'https://github.com/microsoft/mcp' },
											'Mail': { desc: 'Email messages and folders', url: 'https://github.com/microsoft/mcp#-microsoft-365-mail' },
											'People': { desc: 'User details, manager, reports', url: 'https://github.com/microsoft/mcp#-microsoft-365-user' },
											'Word': { desc: 'Create documents, comments', url: 'https://github.com/microsoft/mcp' },
											'Excel': { desc: 'Create workbooks, comments', url: 'https://github.com/microsoft/mcp' },
											'PowerPoint': { desc: 'Presentations', url: 'https://github.com/microsoft/mcp' },
											'M365 Copilot': { desc: 'Ask Microsoft 365 Copilot', url: 'https://github.com/microsoft/mcp#-microsoft-365-copilot-chat' },
											'microsoft-learn': { desc: 'Official Microsoft documentation', url: 'https://github.com/microsoftdocs/mcp' },
											'foundry': { desc: 'AI models, knowledge, evaluation', url: 'https://github.com/microsoft/mcp' },
											'Automations': { desc: 'Event triggers and automation rules', url: 'https://github.com/microsoft/mcp' },
											'Admin Center': { desc: 'Microsoft 365 admin tools', url: 'https://github.com/microsoft/mcp#%EF%B8%8F-microsoft-admin-center' },
											'Knowledge': { desc: 'Organizational knowledge', url: 'https://github.com/microsoft/mcp' },
											'Web Search': { desc: 'Search the web', url: 'https://github.com/microsoft/mcp' },
										};
										const info = knownInfo[s.name];
										const summary = info?.desc;
										const docsUrl = info?.url;
										const toolCount = (s as any).toolCount as number | undefined;
										const statusText = s.status === 'needs-auth' ? 'Needs sign-in'
											: s.status === 'failed' ? 'Failed to connect'
											: s.status === 'pending' ? 'Connecting…'
											: null;
										const parts: string[] = [];
										if (statusText) parts.push(statusText);
										if (summary) parts.push(summary);
										if (toolCount && toolCount > 0) parts.push(`${toolCount} tools`);
										const desc = parts.length > 0 ? parts.join(' · ') : (isBuiltin ? 'Built-in' : null);
										return (
										<div key={s.name} className="flex w-full items-center gap-2 px-3 py-2 text-sm">
											<span className="w-4 text-xs shrink-0" style={{ color: s.status === 'connected' ? 'var(--success)' : s.status === 'needs-auth' ? 'var(--warning)' : s.status === 'failed' ? 'var(--error)' : 'var(--text-muted)' }}>
												{s.status === 'needs-auth' ? <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> : s.status === 'connected' ? '●' : s.status === 'failed' ? '✗' : '○'}
											</span>
											<div className="flex-1">
												<span>{label}</span>
												{desc && <div style={{ fontSize: 11, color: s.status === 'needs-auth' ? 'var(--warning)' : s.status === 'failed' ? 'var(--error)' : 'var(--text-muted)' }}>
													{desc}
													{docsUrl && <> · <a href={docsUrl} target="_blank" rel="noopener" style={{ color: 'var(--primary)' }}>docs</a></>}
												</div>}
											</div>
											{s.status === 'needs-auth' && (
												<button type="button" className="shrink-0 rounded px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--primary)', color: 'var(--button-contrast)' }}
													onClick={async () => {
														try {
															const res = await apiFetch('/api/mcp/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverName: s.name, sessionId: activeSessionId }) });
															const data = await res.json();
															if (data.authorizationUrl) {
																window.open(data.authorizationUrl, '_blank');
																// Poll for status update after OAuth
																const poll = setInterval(async () => {
																	try {
																		const r = await apiFetch(`/api/mcp?session=${encodeURIComponent(activeSessionId!)}`).then(r => r.json());
																		const updated = r.servers?.find((x: any) => x.name === s.name);
																		if (updated && updated.status !== 'needs-auth') {
																			clearInterval(poll);
																			setMcpServers(r.servers);
																		}
																	} catch {}
																}, 3000);
																setTimeout(() => clearInterval(poll), 60000);
															} else {
																// Already authenticated — refresh list
																const r = await apiFetch(`/api/mcp?session=${encodeURIComponent(activeSessionId!)}`).then(r => r.json());
																setMcpServers(r.servers ?? []);
															}
														} catch {}
													}}
												>Sign in</button>
											)}
											{s.status === 'failed' && (
												<button type="button" className="shrink-0 rounded px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--primary-tint)', color: 'var(--primary)', border: '1px solid var(--border)' }}
													onClick={async () => {
														try {
															await apiFetch('/api/mcp/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverName: s.name, sessionId: activeSessionId }) });
															const r = await apiFetch(`/api/mcp?session=${encodeURIComponent(activeSessionId!)}`).then(r => r.json());
															setMcpServers(r.servers ?? []);
														} catch {}
													}}
												>Retry</button>
											)}
											{isRemovable ? (
												<>
													<button type="button" className="shrink-0 rounded p-1 opacity-30 hover:opacity-70" style={{ color: 'var(--text-muted)' }}
														onClick={async () => {
															// Fetch fresh config for this server
															try {
																const r = await apiFetch('/api/mcp').then(r => r.json());
																const srv = (r.servers ?? []).find((x: any) => x.name === s.name);
																const cfg = srv?.config;
																if (cfg?.type === 'http' && cfg.url) {
																	setMcpAddType('url');
																	setMcpAddName(`${s.name} (copy)`);
																	setMcpAddCommand(cfg.url);
																} else if (cfg?.command) {
																	setMcpAddType('command');
																	setMcpAddName(`${s.name} (copy)`);
																	setMcpAddCommand(cfg.command);
																}
															} catch {}
															setShowMcpAdd(true);
														}}
														title="Clone server"
													>
														<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
													</button>
													<button type="button" className="shrink-0 rounded p-1 opacity-30 hover:opacity-70" style={{ color: 'var(--text-muted)' }}
														onClick={() => confirmMcpChange(async () => {
															await apiFetch(`/api/mcp?name=${encodeURIComponent(s.name)}`, { method: 'DELETE' }).catch(() => {});
															setMcpServers(prev => prev.filter(x => x.name !== s.name));
														})}
														title="Remove server"
													>
														<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
													</button>
												</>
											) : !isRemovable && s.source && s.source !== 'unknown' ? (
												<span className="shrink-0 rounded px-1.5 py-0.5 text-[10px]" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
													{s.source}
												</span>
											) : null}
										</div>
									);})}
									{mcpServers.length === 0 && !showMcpAdd && (
										<div className="px-3 py-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>
											No MCP servers configured
										</div>
									)}
								</div>
								{!mcpListAtBottom && <div className="pointer-events-none absolute bottom-0 left-0 right-0" style={{ height: 24, background: 'linear-gradient(transparent 0%, var(--surface) 100%)' }} />}
								</div>
								{/* Add server — outside scroll area */}
								{showMcpAdd ? (
									<div className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
										<div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
											{(['featured', 'command', 'url'] as const).map(tab => (
												<button key={tab} type="button" className="flex-1 px-3 py-1.5 text-xs font-medium"
													style={{ color: mcpAddType === tab ? 'var(--text)' : 'var(--text-muted)', borderBottom: mcpAddType === tab ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }}
													onClick={() => setMcpAddType(tab)}>{tab === 'featured' ? 'Featured' : tab === 'command' ? 'Command' : 'URL'}</button>
											))}
										</div>
										{mcpAddType === 'featured' ? (
											<div className="relative">
											<div className="chat-scroll max-h-56 overflow-y-auto"
												onScroll={e => { const el = e.currentTarget; setMcpFeaturedAtBottom(el.scrollHeight <= el.clientHeight || el.scrollHeight - el.scrollTop - el.clientHeight < 4); }}
												ref={el => { if (el) setMcpFeaturedAtBottom(el.scrollHeight <= el.clientHeight || el.scrollHeight - el.scrollTop - el.clientHeight < 4); }}>
												{/* Static presets */}
												{[
													{ name: 'workiq', label: 'WorkIQ', description: 'M365 read-only — emails, meetings, Teams, documents', cmd: 'npx -y @microsoft/workiq@latest mcp', url: 'https://www.npmjs.com/package/@microsoft/workiq' },
													{ name: 'playwright', label: 'Playwright', description: 'Browser automation (requires Chrome)', cmd: 'npx -y @playwright/mcp@latest', url: 'https://github.com/microsoft/playwright-mcp' },
													{ name: 'microsoft-learn', label: 'Microsoft Learn', description: 'Official Microsoft documentation', mcpUrl: 'https://learn.microsoft.com/api/mcp', url: 'https://github.com/microsoftdocs/mcp' },
												].filter(f => !installedNames.has(f.name)).map(f => (
													<div key={f.name} className="flex w-full items-center gap-2 px-3 py-2 text-sm">
														<div className="flex-1">
															<span>{f.label}</span>
															<div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
																{f.description}
																{f.url && <> · <a href={f.url} target="_blank" rel="noopener" style={{ color: 'var(--primary)' }}>docs</a></>}
															</div>
														</div>
														<button type="button" className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
															style={{ background: 'var(--primary)', color: 'var(--button-contrast)' }}
															onClick={() => confirmMcpChange(async () => {
																if ((f as any).mcpUrl) {
																	await apiFetch('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, type: 'http', mcpUrl: (f as any).mcpUrl }) });
																	setMcpServers(prev => [...prev, { name: f.name, type: 'http', source: 'user', enabled: false, status: 'pending' }]);
																} else {
																	const parts = ((f as any).cmd as string).split(/\s+/);
																	await apiFetch('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, command: parts[0], args: parts.slice(1) }) });
																	setMcpServers(prev => [...prev, { name: f.name, type: 'stdio', source: 'user', enabled: true }]);
																}
															})}
														>Add</button>
													</div>
												))}
												{/* M365 section */}
												<div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Microsoft Agent 365</div>
												{m365Loading ? (
													<div className="flex items-center justify-center gap-2 px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
														<svg className="size-3.5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 000 20" opacity="0.3" /><path d="M12 2a10 10 0 0110 10" /></svg>
														Discovering servers…
													</div>
												) : m365Servers === null ? (
													(() => {
														// Auto-discover on first render
														if (!m365Loading) {
															setM365Loading(true);
															setTimeout(async () => {
																try {
																	const res = await apiFetch('/api/mcp/discover-m365');
																	const data = await res.json();
																	setM365TenantId(data.tenantId);
																	setM365Servers(data.servers ?? []);
																} catch { setM365Servers([]); }
																setM365Loading(false);
															}, 0);
														}
														return (
															<div className="flex items-center justify-center gap-2 px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
																<svg className="size-3.5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 000 20" opacity="0.3" /><path d="M12 2a10 10 0 0110 10" /></svg>
																Discovering servers…
															</div>
														);
													})()
												) : m365Servers.length === 0 ? (
													<div className="px-3 py-2">
														<button type="button" className="w-full rounded px-3 py-1.5 text-xs font-medium"
															style={{ background: 'var(--primary-tint)', color: 'var(--primary)', border: '1px solid var(--border)' }}
															onClick={async () => {
																setM365Loading(true);
																try {
																	await apiFetch('/api/mcp/m365-signin', { method: 'POST' });
																	// After sign-in, re-discover
																	const res = await apiFetch('/api/mcp/discover-m365');
																	const data = await res.json();
																	setM365TenantId(data.tenantId);
																	setM365Servers(data.servers ?? []);
																} catch {}
																setM365Loading(false);
															}}
														>Sign in with Microsoft 365</button>
													</div>
												) : (
													m365Servers.filter(s => s.toolCount !== 0 && !installedNames.has(s.name) && !installedNames.has(s.label)).map(s => (
														<div key={s.name} className="flex w-full items-center gap-2 px-3 py-2 text-sm">
															<div className="flex-1">
																<span>{s.label}</span>
																<div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
																	{s.description}{s.toolCount > 0 ? ` · ${s.toolCount} tools` : ''}
																	{(s as any).url && <> · <a href={(s as any).url} target="_blank" rel="noopener" style={{ color: 'var(--primary)' }}>docs</a></>}
																</div>
															</div>
															<button type="button" className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
																style={{ background: 'var(--primary)', color: 'var(--button-contrast)' }}
																onClick={() => confirmMcpChange(async () => {
																	const url = `https://agent365.svc.cloud.microsoft/agents/tenants/${m365TenantId}/servers/${s.name}`;
																	await apiFetch('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: s.label, type: 'http', mcpUrl: url }) });
																	setMcpServers(prev => [...prev, { name: s.label, type: 'http', source: 'user', enabled: false, status: 'pending' }]);
																})}
															>Add</button>
														</div>
													))
												)}
											</div>
											{!mcpFeaturedAtBottom && <div className="pointer-events-none absolute bottom-0 left-0 right-0" style={{ height: 24, background: 'linear-gradient(transparent 0%, var(--surface) 100%)' }} />}
											</div>
										) : (
											<div className="px-3 py-2">
												<input className="w-full rounded border px-2 py-1 text-xs mb-1 outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
													placeholder="Server name"
													value={mcpAddName} onChange={e => setMcpAddName(e.target.value)} />
												<input className="w-full rounded border px-2 py-1 text-xs mb-2 outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
													placeholder={mcpAddType === 'command' ? 'npx -y @org/mcp-server' : 'https://mcp.example.com/server'}
													value={mcpAddCommand} onChange={e => setMcpAddCommand(e.target.value)}
													onKeyDown={e => { if (e.key === 'Enter' && mcpAddName && mcpAddCommand && !mcpAdding) { e.preventDefault(); (e.target as HTMLInputElement).closest('div')?.querySelector<HTMLButtonElement>('[data-add]')?.click(); } }} />
												<div className="flex gap-1 justify-end">
													<button type="button" data-add className="rounded px-3 py-1 text-xs font-medium"
														style={{ background: 'var(--primary)', color: 'var(--button-contrast)', opacity: mcpAddName && mcpAddCommand && !mcpAdding ? 1 : 0.5 }}
														disabled={!mcpAddName || !mcpAddCommand || mcpAdding}
														onClick={() => confirmMcpChange(async () => {
															setMcpAdding(true);
															try {
																if (mcpAddType === 'url') {
																	await apiFetch('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: mcpAddName.trim(), type: 'http', mcpUrl: mcpAddCommand.trim() }) });
																	setMcpServers(prev => [...prev, { name: mcpAddName.trim(), type: 'http', source: 'user', enabled: false, status: 'pending' }]);
																} else {
																	const parts = mcpAddCommand.trim().split(/\s+/);
																	await apiFetch('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: mcpAddName.trim(), command: parts[0], args: parts.slice(1) }) });
																	setMcpServers(prev => [...prev, { name: mcpAddName.trim(), type: 'stdio', source: 'user', enabled: true }]);
																}
																setMcpAddName(''); setMcpAddCommand(''); setShowMcpAdd(false);
															} finally { setMcpAdding(false); }
														})}
													>{mcpAdding ? 'Adding…' : 'Add'}</button>
												</div>
											</div>
										)}
										<div className="flex justify-end px-3 py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
											<button type="button" className="rounded px-3 py-1 text-xs" style={{ color: 'var(--text-muted)' }}
												onClick={() => { setShowMcpAdd(false); setMcpAddName(''); setMcpAddCommand(''); }}
											>Close</button>
										</div>
									</div>
								) : (
									<div className="flex items-center border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface)', borderRadius: '0 0 0.5rem 0.5rem' }}>
										<button type="button" className="flex flex-1 items-center gap-1.5 px-3 py-2 text-xs"
											style={{ color: 'var(--primary)' }}
											onClick={() => { setShowMcpAdd(true); setMcpAddType('featured'); }}
										>
											<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
											Add Server
										</button>
										<button type="button" className="px-3 py-2 text-[10px]"
											style={{ color: 'var(--text-muted)' }}
											onClick={async () => {
												try { await apiFetch('/api/restart-cli', { method: 'POST' }); } catch {}
											}}
										>Restart CLI</button>
									</div>
								)}
								</div>
								);
							})()}
						</div>
					)}
					{/* Skills — read-only list of loaded skills */}
					{!draft && activeSessionId && skills.length > 0 && (
						<div className="relative mt-3" ref={skillsPickerRef}>
							<button
								type="button"
								className="flex w-full items-center justify-between px-3 py-2 text-sm"
								style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: showSkillsList ? '0.5rem 0.5rem 0 0' : '0.5rem' }}
								onClick={() => setShowSkillsList(v => !v)}
							>
								<div className="flex items-center gap-2">
									<svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
										<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
									</svg>
									<span>{skills.filter(s => s.enabled).length} skill{skills.filter(s => s.enabled).length !== 1 ? 's' : ''} loaded</span>
								</div>
								<span style={{ color: 'var(--text-muted)' }}>{showSkillsList ? '\u25b4' : '\u25be'}</span>
							</button>
							{showSkillsList && (
								<div className="absolute z-10 overflow-hidden" style={{ left: 0, right: 0, top: '100%', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 0.5rem 0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
								<div className="relative">
								<div className="chat-scroll max-h-56 overflow-y-auto py-1" style={{ background: 'var(--surface)' }}
									onScroll={e => { const el = e.currentTarget; setSkillsListAtBottom(el.scrollHeight <= el.clientHeight || el.scrollHeight - el.scrollTop - el.clientHeight < 4); }}
									ref={el => { if (el) setSkillsListAtBottom(el.scrollHeight <= el.clientHeight || el.scrollHeight - el.scrollTop - el.clientHeight < 4); }}>
									{skills.map(s => {
										const sourceLabel = s.source === 'personal-copilot' ? 'personal' : s.source === 'personal-agents' ? 'agents' : s.source;
										const firstSentence = s.description ? s.description.split(/[.\n]/)[0] : '';
										const brief = firstSentence.length > 80 ? firstSentence.slice(0, 80) + '...' : firstSentence;
										return (
										<div key={s.name} className="flex w-full items-center gap-2 px-3 py-1.5 text-sm">
											<span className="shrink-0" style={{ color: s.enabled ? 'var(--success)' : 'var(--text-muted)', fontSize: 10 }}>●</span>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-1.5">
													<span className="truncate">{s.name}</span>
													{s.userInvocable && (
														<span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium" style={{ background: 'var(--primary-tint)', color: 'var(--primary)' }}>/</span>
													)}
												</div>
												<div className="truncate" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
													{sourceLabel && <>{sourceLabel}{brief ? ' · ' : ''}</>}{brief}
												</div>
											</div>
										</div>
										);
									})}
								</div>
								{!skillsListAtBottom && <div className="pointer-events-none absolute bottom-0 left-0 right-0" style={{ height: 24, background: 'linear-gradient(transparent 0%, var(--surface) 100%)' }} />}
								</div>
								</div>
							)}
						</div>
					)}
					{/* Model selector */}
					{draft && (
						<label className="flex items-center gap-2 mb-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
							<svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
								<circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
							</svg>
							AI Model
						</label>
					)}
					<div className="relative mt-3" ref={modelPickerRef}>
						{/* Context window usage — above model button */}
						{contextUsage && contextUsage.tokenLimit > 0 && !draft && (() => {
							const { tokenLimit, currentTokens, systemTokens, conversationTokens, toolDefinitionsTokens } = contextUsage;
							const systemTotal = systemTokens + toolDefinitionsTokens;
							const free = tokenLimit - currentTokens;
							const pct = Math.round(currentTokens / tokenLimit * 100);
							const sysPct = Math.round(systemTotal / tokenLimit * 100);
							const convPct = Math.round(conversationTokens / tokenLimit * 100);
							const freePct = Math.round(free / tokenLimit * 100);
							return (
								<div className="px-3 py-1.5 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderBottom: 'none', borderRadius: '0.5rem 0.5rem 0 0', color: 'var(--text-muted)' }}>
									<div className="flex items-center justify-between mb-1">
										<span>Context: {pct}%</span>
										<span className="font-mono">{(currentTokens / 1000).toFixed(0)}k / {(tokenLimit / 1000).toFixed(0)}k</span>
									</div>
									<div className="flex rounded-full overflow-hidden" style={{ height: 6, background: 'var(--border)' }}>
										<div style={{ width: `${sysPct}%`, background: 'var(--accent)', opacity: 0.6 }} title={`System/Tools: ${sysPct}%`} />
										<div style={{ width: `${convPct}%`, background: 'var(--primary)' }} title={`Messages: ${convPct}%`} />
									</div>
									<div className="flex gap-3 mt-1" style={{ fontSize: 10 }}>
										<span><span style={{ color: 'var(--accent)', opacity: 0.6 }}>■</span> System {sysPct}% <span className="font-mono">{(systemTotal / 1000).toFixed(0)}k</span></span>
										<span><span style={{ color: 'var(--primary)' }}>■</span> Messages {convPct}% <span className="font-mono">{(conversationTokens / 1000).toFixed(0)}k</span></span>
										<span><span style={{ color: 'var(--border)' }}>■</span> Free {freePct}% <span className="font-mono">{(free / 1000).toFixed(0)}k</span></span>
									</div>
								</div>
							);
						})()}
						<button
							type="button"
							className="flex w-full items-center justify-between px-3 py-2 text-sm"
							style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderTop: (contextUsage && contextUsage.tokenLimit > 0 && !draft) ? 'none' : undefined, borderRadius: (contextUsage && contextUsage.tokenLimit > 0 && !draft) ? (showModelPicker ? '0' : '0 0 0.5rem 0.5rem') : (showModelPicker ? '0.5rem 0.5rem 0 0' : '0.5rem') }}
							onClick={() => {
								const opening = !showModelPicker;
								setShowModelPicker(opening);
								if (opening && onFetchModels) onFetchModels().then(setLiveModels).catch(() => {});
							}}
						>
							<div className="flex items-center gap-2">
								<svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
									<circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
								</svg>
								<span>{currentModelName}</span>
							</div>
							<span style={{ color: 'var(--text-muted)' }}>{showModelPicker ? '\u25b4' : '\u25be'}</span>
						</button>
						{showModelPicker && (
							<div className="absolute z-10 overflow-hidden" style={{ left: 0, right: 0, top: '100%', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 0.5rem 0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
							<div
								className="chat-scroll max-h-56 overflow-y-auto py-1"
								style={{ background: 'var(--surface)' }}
								onScroll={e => {
									const el = e.currentTarget;
									setModelsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 4);
								}}
							>
								{models.map(m => (
									<button
										key={m.id}
										type="button"
										className="flex w-full items-center gap-2 px-3 py-2 text-sm"
										style={{ background: m.id === currentModelId ? 'var(--primary-tint)' : 'transparent' }}
										onClick={() => { onChangeModel(m.id); setShowModelPicker(false); }}
									>
										<span className="w-4 text-xs shrink-0" style={{ color: 'var(--primary)' }}>
											{m.id === currentModelId ? '\u2713' : ''}
										</span>
										<div className="flex-1 text-left">
											<span>{m.name}</span>
											{(!!m.contextWindow || m.vision || m.reasoning || (m.multiplier != null && m.multiplier > 0)) && (
												<div className="flex items-center gap-2 mt-0.5" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
													{m.multiplier != null && m.multiplier > 0 && <span>{m.multiplier}×</span>}
													{(m as any).priceCategory && <span style={{ color: (m as any).priceCategory === 'high' ? 'var(--warning)' : (m as any).priceCategory === 'low' ? 'var(--success)' : 'var(--accent)' }}>{(m as any).priceCategory}</span>}
													{m.contextWindow ? <span>{(m.contextWindow / 1000).toFixed(0)}k</span> : null}
													{m.vision && <span>vision</span>}
													{m.reasoning && <span>thinking</span>}
												</div>
											)}
										</div>
									</button>
								))}
							</div>
							{!modelsAtBottom && (
								<div className="pointer-events-none absolute bottom-0 left-0 right-0" style={{ height: 24, background: 'linear-gradient(transparent 0%, var(--surface) 100%)' }} />
							)}
							</div>
						)}
					</div>
					{/* Agent selector — only for active sessions (not draft) */}
					{!draft && activeSessionId && (
						<div className="relative mt-3" ref={agentPickerRef}>
							<button
								type="button"
								className="flex w-full items-center justify-between px-3 py-2 text-sm"
								style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: showAgentPicker ? '0.5rem 0.5rem 0 0' : '0.5rem' }}
								onClick={() => {
									const opening = !showAgentPicker;
									setShowAgentPicker(opening);
									if (opening) {
										apiFetch(`/api/sessions/${encodeURIComponent(activeSessionId!)}/agents`).then(r => r.json()).then((data: { agents: typeof agents; current: typeof currentAgent }) => {
											setAgents(data.agents);
											setCurrentAgent(data.current);
											onAgentChange?.(data.current?.displayName ?? data.current?.name ?? null);
										}).catch(() => {});
									}
								}}
							>
								<div className="flex items-center gap-2">
									<svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
										<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
									</svg>
									<span>{currentAgent?.displayName ?? currentAgent?.name ?? 'Default'}</span>
								</div>
								<span style={{ color: 'var(--text-muted)' }}>{showAgentPicker ? '\u25b4' : '\u25be'}</span>
							</button>
							{showAgentPicker && (
								<div className="absolute z-10 overflow-hidden" style={{ left: 0, right: 0, top: '100%', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 0.5rem 0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
								<div
									className="chat-scroll max-h-56 overflow-y-auto py-1"
									style={{ background: 'var(--surface)' }}
									onScroll={e => {
										const el = e.currentTarget;
										setAgentsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 4);
									}}
								>
									<button
										type="button"
										className="flex w-full items-center gap-2 px-3 py-2 text-sm"
										style={{ background: !currentAgent ? 'var(--primary-tint)' : 'transparent' }}
										onClick={async () => {
											const res = await apiFetch(`/api/sessions/${encodeURIComponent(activeSessionId!)}/agents/deselect`, { method: 'POST' }).catch(() => null);
											if (res?.ok) {
												const check = await apiFetch(`/api/sessions/${encodeURIComponent(activeSessionId!)}/agents`).then(r => r.json()).catch(() => null);
												setCurrentAgent(check?.current ?? null);
												onAgentChange?.(check?.current?.displayName ?? check?.current?.name ?? null);
											}
											setShowAgentPicker(false);
										}}
									>
										<span className="w-4 text-xs shrink-0" style={{ color: 'var(--primary)' }}>{!currentAgent ? '\u2713' : ''}</span>
										<span>Default</span>
									</button>
									{agents.map(a => (
										<button
											key={a.name}
											type="button"
											className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left"
											style={{ background: currentAgent?.name === a.name ? 'var(--primary-tint)' : 'transparent' }}
											onClick={async () => {
												const res = await apiFetch(`/api/sessions/${encodeURIComponent(activeSessionId!)}/agents/select`, {
													method: 'POST',
													headers: { 'Content-Type': 'application/json' },
													body: JSON.stringify({ name: a.name }),
												}).catch(() => null);
												if (res?.ok) {
													const check = await apiFetch(`/api/sessions/${encodeURIComponent(activeSessionId!)}/agents`).then(r => r.json()).catch(() => null);
													setCurrentAgent(check?.current ?? a);
													onAgentChange?.(check?.current?.displayName ?? check?.current?.name ?? a.displayName ?? a.name);
												}
												setShowAgentPicker(false);
											}}
										>
											<span className="w-4 text-xs shrink-0" style={{ color: 'var(--primary)' }}>{currentAgent?.name === a.name ? '\u2713' : ''}</span>
											<div className="flex-1">
												<div className="flex items-center gap-2">
													<span>{a.displayName || a.name}</span>
													{a.source && <span className="text-[10px] opacity-50">{a.source}</span>}
												</div>
												{a.description && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.description}</div>}
											</div>
										</button>
									))}
									{agents.length === 0 && (
										<div className="px-3 py-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>No custom agents found</div>
									)}
								</div>
								{!agentsAtBottom && (
									<div className="pointer-events-none absolute bottom-0 left-0 right-0" style={{ height: 24, background: 'linear-gradient(transparent 0%, var(--surface) 100%)' }} />
								)}
								</div>
							)}
						</div>
					)}
					{draft && (
						<button
							type="button"
							className="w-full mt-3 rounded-lg px-3 py-2 text-sm font-medium"
							style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
							onClick={onCreateDraft}
						>Create Session</button>
					)}
				</div>
			)}
		</div>
	);
}

// Copilot Portal mark — the stylized "open ring revealing an app window" logo.
// Shared by the app header and the portal-token claim screen.
function PortalLogo({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<defs>
				<clipPath id="pcpOuter"><ellipse cx="8" cy="12" rx="7.5" ry="10" transform="rotate(20, 8, 12)"/></clipPath>
			</defs>
			{/* Outer ellipse — forms the ring body */}
			<ellipse cx="8" cy="12" rx="7.5" ry="10" fill="currentColor" transform="rotate(20, 8, 12)"/>
			{/* Inner ellipse punched out, offset right — left rim thicker (near), right rim thinner (far) */}
			<ellipse cx="8.2" cy="13" rx="4.8" ry="7.8" fill="var(--bg)" transform="rotate(20, 8.2, 13)"/>
			{/* Dark halo behind app rect */}
			<g clipPath="url(#pcpOuter)">
				<rect x="8" y="4" width="17" height="16" rx="2.5" fill="var(--bg)" stroke="none"/>
			</g>
			{/* App window */}
			<rect x="11" y="8" width="13" height="10" rx="1.5" fill="var(--surface)" stroke="currentColor" strokeWidth="1.5"/>
			<line x1="11" y1="10" x2="24" y2="10" stroke="currentColor" strokeWidth="1.5"/>
		</svg>
	);
}


export default function App() {
	const hasSessionInUrl = !!new URLSearchParams(window.location.search).get('session');
	// Decide the very first paint synchronously to avoid a flash of the main UI before
	// the connect effect resolves auth. With no token available anywhere (first visit),
	// we already know the portal-token claim screen is what's coming, so start there.
	const hasAnyToken = !!new URLSearchParams(window.location.search).get('token') || !!readStoredToken();
	const [connectionState, setConnectionState] = useState<ConnectionState>(
		!hasAnyToken ? 'no_token' : hasSessionInUrl ? 'connecting' : 'disconnected',
	);
	const [cliStatus, setCliStatus] = useState<'connected' | 'disconnected' | 'restarting' | 'error'>('connected');
	// M2 first-run auth: 'unknown' until the first /api/auth/status resolves.
	const [authState, setAuthState] = useState<'unknown' | 'starting' | 'ok' | 'needs-auth' | 'error'>('unknown');
	const [authDevice, setAuthDevice] = useState<{ code: string; verificationUri: string } | null>(null);
	const [authMessage, setAuthMessage] = useState<string | null>(null);
	const [authBusy, setAuthBusy] = useState(false);
	const authWasNonOk = useRef(false);
	const [mcpServers, setMcpServers] = useState<Array<{ name: string; type: string; source: string; enabled: boolean; status?: string }>>([]);
	const [mcpConfirm, setMcpConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
	const [serverConfirm, setServerConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
	const [skills, setSkills] = useState<Array<{ name: string; description: string; source: string; enabled: boolean; userInvocable: boolean }>>([]);
	const [messages, setMessagesState] = useState<Message[]>([]);
	const messagesRef = useRef<Message[]>([]);
	const setMessages = useCallback((arg: Message[] | ((prev: Message[]) => Message[])) => {
		const next = typeof arg === 'function' ? arg(messagesRef.current) : arg;
		messagesRef.current = next;
		setMessagesState(next);
	}, []);
	const [toolEvents, setToolEventsState] = useState<ToolEvent[]>([]);
	const toolEventsRef = useRef<ToolEvent[]>([]);
	// toolCallIds whose result produced an inline image — those tools are shown as a
	// provenance caption on their own image bubble, so they're excluded from the parent
	// message's collapsed "N tools ran" pill to avoid listing the same tool twice.
	const imageToolIdsRef = useRef<Set<string>>(new Set());
	const intentionMapRef = useRef<Map<string, string>>(new Map());
	const setToolEvents = useCallback((arg: ToolEvent[] | ((prev: ToolEvent[]) => ToolEvent[])) => {
		// Update the ref synchronously so idle handler can read latest value before React flushes
		const next = typeof arg === 'function' ? arg(toolEventsRef.current) : arg;
		toolEventsRef.current = next;
		setToolEventsState(next);
	}, []);
	const [streamingContent, setStreamingContent] = useState('');
	const [isThinking, setIsThinking] = useState(false);
	const [thinkingText, setThinkingText] = useState('');
	const [reasoningText, setReasoningText] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [notification, setNotification] = useState<{ type: 'warning' | 'info'; message: string; action?: { label: string; onClick: () => void }; count?: number } | null>(null);
	const [input, setInput] = useState('');
	const [pendingImages, setPendingImages] = useState<Array<{ data: string; mimeType: string; name: string }>>([]);
	const [lightboxImage, setLightboxImage] = useState<string | null>(null);
	const [lightboxDims, setLightboxDims] = useState<{ w: number; h: number } | null>(null);
	const [isDraggingImage, setIsDraggingImage] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [isStopping, setIsStopping] = useState(false);
	// Agent is "active" whenever it's thinking, running tools, streaming, or waiting for stop to confirm
	const isAgentActive = isStopping || isStreaming || isThinking || toolEvents.some(te => te.type === 'tool_start');
	const [showPicker, setShowPicker] = useState(!hasSessionInUrl);
	const [showQR, setShowQR] = useState(false);
	const [showThemePicker, setShowThemePicker] = useState(false);
	const [squadPanelOpen, setSquadPanelOpen] = useState(false);
	const [lastSquadChange, setLastSquadChange] = useState<SquadFileChange | null>(null);
	const [customThemes, setCustomThemes] = useState<Array<{ id: string; name: string; base: string; accent: string; text?: string }>>([]);
	const [activeThemeId, setActiveThemeId] = useState<string>(() => localStorage.getItem('portal_theme') ?? 'dark');
	const [defaultThemeId, setDefaultThemeId] = useState<string>('dark');
	const [editingTheme, setEditingTheme] = useState<{ editId: string; name: string; base: string; accent: string; text: string } | null>(null);

	const allPresets = [...BUILTIN_PRESETS, ...customThemes];
	const activePreset = allPresets.find(p => p.id === activeThemeId) ?? BUILTIN_PRESETS[0];

	// Save themes to server whenever they change
	const saveThemesToServer = useCallback((themes: typeof customThemes, defTheme?: string) => {
		apiFetch('/api/themes', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ themes, defaultTheme: defTheme }),
		}).catch(() => {});
	}, []);

	const applyPreset = useCallback((preset: { id: string; base: string; accent: string; text?: string }) => {
		clearThemeOverrides();
		if (preset.id === 'dark') {
			document.documentElement.removeAttribute('data-theme');
		} else if (preset.id === 'light') {
			document.documentElement.setAttribute('data-theme', 'light');
		} else {
			document.documentElement.removeAttribute('data-theme');
			applyTheme(deriveTheme(preset.base, preset.accent, preset.text));
		}
		setActiveThemeId(preset.id);
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta) meta.setAttribute('content', preset.base);
	}, []);

	// Load themes from server on mount — per-session override or starred default
	useEffect(() => {
		const sessionId = new URLSearchParams(window.location.search).get('session');
		Promise.all([
			apiFetch('/api/themes').then(r => r.json()),
			sessionId ? apiFetch(`/api/session-theme/${encodeURIComponent(sessionId)}`).then(r => r.json()) : Promise.resolve({ themeId: null }),
		]).then(([themesData, sessionData]: [{ themes?: typeof customThemes; defaultTheme?: string }, { themeId?: string | null }]) => {
			if (themesData.themes?.length) setCustomThemes(themesData.themes);
			if (themesData.defaultTheme) setDefaultThemeId(themesData.defaultTheme);
			const defId = themesData.defaultTheme ?? 'dark';
			const themeId = sessionData.themeId ?? defId;
			const all = [...BUILTIN_PRESETS, ...(themesData.themes ?? [])];
			const preset = all.find(p => p.id === themeId) ?? BUILTIN_PRESETS[0];
			applyPreset(preset);
		}).catch(() => {
			applyPreset(activePreset);
		});
	}, []);
	// Load and apply theme for a specific session (or fall back to default)
	// Fetches fresh data from server to avoid stale closure issues
	const loadSessionTheme = useCallback((sessionId: string) => {
		Promise.all([
			apiFetch(`/api/session-theme/${encodeURIComponent(sessionId)}`).then(r => r.json()),
			apiFetch('/api/themes').then(r => r.json()),
		]).then(([sessionData, themesData]: [{ themeId?: string | null }, { themes?: ThemePreset[]; defaultTheme?: string }]) => {
			const customs = themesData.themes ?? [];
			const defId = themesData.defaultTheme ?? 'dark';
			const themeId = sessionData.themeId ?? defId;
			const all = [...BUILTIN_PRESETS, ...customs];
			const preset = all.find(p => p.id === themeId) ?? BUILTIN_PRESETS[0];
			setCustomThemes(customs);
			setDefaultThemeId(defId);
			applyPreset(preset);
		}).catch(() => {});
	}, [applyPreset]);

	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState('');
	const [activeSessionId, setActiveSessionId] = useState<string | null>(
		new URLSearchParams(window.location.search).get('session')
	);
	const [activeSessionSummary, setActiveSessionSummary] = useState<string | null>(null);
	const activeSessionIdRef = useRef<string | null>(new URLSearchParams(window.location.search).get('session'));
	const mcpAuthPendingRef = useRef<Map<string, string>>(new Map()); // serverName → authorizationUrl
	const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
	const [pendingInput, setPendingInput] = useState<InputRequest | null>(null);
	const answeredInputsRef = useRef<Set<string>>(new Set()); // ask_user requestIds this client answered locally
	const [rules, setRules] = useState<ApprovalRule[]>([]);
	const [approveAll, setApproveAll] = useState(false);
	const [showRules, setShowRules] = useState(false);
	const [showGuides, setShowGuides] = useState(false);
	const [confirmDeleteGuide, setConfirmDeleteGuide] = useState<string | null>(null);
	const [viewingGuide, setViewingGuide] = useState<{ id: string; guideContent?: string; promptsContent?: string; guideFilePath?: string; promptsFilePath?: string; filePath?: string; activeTab?: 'guide' | 'prompts' } | null>(null);
	const [editingGuide, setEditingGuide] = useState<{ id: string; content: string; isPrompts?: boolean } | null>(null);
	const [editingName, setEditingName] = useState<string | null>(null);
	const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
	const [showNewGuide, setShowNewGuide] = useState(false);
	const [confirmOverwrite, setConfirmOverwrite] = useState(false);
	const [examples, setExamples] = useState<Array<{ id: string; hasGuide: boolean; hasPrompts: boolean }>>([]);
	const [selectedExample, setSelectedExample] = useState<string>('');
	const [examplePreview, setExamplePreview] = useState<{ guide: string; prompts: string } | null>(null);
	const [newGuideCheck, setNewGuideCheck] = useState(true);
	const [newPromptsCheck, setNewPromptsCheck] = useState(true);
	const [previewTab, setPreviewTab] = useState<'guide' | 'prompts'>('guide');
	const [newGuideName, setNewGuideName] = useState('');
	const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
	const [lastViewedGuide, setLastViewedGuide] = useState<string | null>(null);
	const [importUrl, setImportUrl] = useState('');
	const [importLoading, setImportLoading] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const [importItems, setImportItems] = useState<Array<{ name: string; hasGuide: boolean; hasPrompts: boolean; guideContent: string; promptsContent: string; selected: boolean }>>([]);
	const [importPreviewItem, setImportPreviewItem] = useState<string | null>(null);
	const [guides, setGuides] = useState<Array<{ id: string; name: string; hasGuide?: boolean; hasPrompts?: boolean }>>([]);
	const [sessionPrompts, setSessionPrompts] = useState<Array<{ label: string; text: string }>>([]);
	const sessionPromptsRef = useRef<Map<string, Array<{ label: string; text: string }>>>(new Map());
	const [showPromptsTray, setShowPromptsTray] = useState(false);
	const [promptsAtBottom, setPromptsAtBottom] = useState(false);
	const [confirmDeletePrompt, setConfirmDeletePrompt] = useState<string | null>(null);
	const [connectingSecs, setConnectingSecs] = useState(0);
	const [loadingHistory, setLoadingHistory] = useState<{ sizeMB: string; startTime: number } | null>(null);
	const [loadingSecs, setLoadingSecs] = useState(0);
	// Resume-stall escape hatch: when a session in the URL won't open (e.g. the CLI
	// subprocess OOM-crashed, or a resume hangs), the app shell otherwise sits empty
	// forever (the "black screen of despair" on mobile-over-tunnel). We detect the
	// stall and surface a non-destructive panel with a way out.
	const [resumeStalled, setResumeStalled] = useState(false);
	const [resumeAttempt, setResumeAttempt] = useState(0);
	const [historyReady, setHistoryReady] = useState(false);
	const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const stallAnchorRef = useRef<string | null>(null);
	const [historyTruncated, setHistoryTruncated] = useState<{ total: number; shown: number } | null>(null);
	const [cliApprovalInfo, setCliApprovalInfo] = useState<string | null>(null);
	const [cliInputInfo, setCliInputInfo] = useState<string | null>(null);
	const isCliTurnRef = useRef(false);
	const turnActiveRef = useRef(false);
	const [portalInfo, setPortalInfo] = useState<PortalInfo | null>(null);
	const [sessionContext, setSessionContext] = useState<SessionContext | null>(null);
	const [activeModel, setActiveModel] = useState<string | null>(null);
	const [activeAgent, setActiveAgent] = useState<string | null>(null);
	const [sessionUsage, setSessionUsage] = useState<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; reasoningTokens: number; requests: number } | null>(null);
	const [sessionQuota, setSessionQuota] = useState<{ unlimited: boolean; used: number; total: number; remaining: number; resetDate?: string } | null>(null);
	const [contextUsage, setContextUsage] = useState<{ tokenLimit: number; currentTokens: number; systemTokens: number; conversationTokens: number; toolDefinitionsTokens: number } | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [draftSession, setDraftSession] = useState<{ cwd: string } | null>(null);
	const draftRef = useRef(false);
	const [noSession, setNoSession] = useState(!hasSessionInUrl);
	const noSessionRef = useRef(!hasSessionInUrl);
	const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
	const [updateDismissed, setUpdateDismissed] = useState(false);
	const [pwaDismissed, setPwaDismissed] = useState(() => localStorage.getItem('portal_pwa_dismissed') === '1');

	const wsRef = useRef<WebSocket | null>(null);
	const mgmtWsRef = useRef<WebSocket | null>(null);
	const streamingRef = useRef('');
	const historyTimestampRef = useRef<number | undefined>(undefined); // timestamp from last history delta event
	const historyIdCounter = useRef(0); // monotonic counter for unique history message IDs
	const reasoningRef = useRef('');
	const lastStreamedRef = useRef(''); // dedup: content streamed in the last portal turn
	const pendingMsgRef = useRef<Message | null>(null); // buffered message_end — unknown if intermediate or final
	const carriedFinalRef = useRef<Message | null>(null); // pendingMsgRef captured across a mid-turn history_start so a resync can't drop an already-emitted final message
	const flushedInputReqRef = useRef<string | null>(null); // requestId whose pre-prompt stream we've already flushed (probes re-broadcast the same input_request)
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const inputContainerRef = useRef<HTMLDivElement>(null);
	const isStoppingRef = useRef(false);
	const stopClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const heartbeatRef = useRef<{ interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> | null } | null>(null);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const chatScrollRef = useRef<HTMLDivElement>(null);
	const stickToBottomRef = useRef(true);
	const lastScrollTopRef = useRef(0);
	const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inHistoryRef = useRef(false);
	const historyBufferRef = useRef<Message[]>([]);
	const lastConnectTime = useRef(0);
	// When the tab last became hidden — used to decide whether a return-to-foreground
	// warrants a history resync (a long background can miss turns run elsewhere).
	const hiddenAtRef = useRef(0);
	const fastFailCount = useRef(0);

	// Fetch portal info (version, user, models) once on mount
	useEffect(() => {
		apiFetch('/api/info').then(r => r.json()).then(setPortalInfo).catch(() => {});
		// If starting with no session, pre-load the session list for the picker
		if (!hasSessionInUrl) {
			apiFetch('/api/sessions').then(r => r.json()).then(setSessions).catch(() => {});
		}
	}, []);

	// M2 first-run auth watcher: track CLI auth state and drive the sign-in screen.
	// Keeps a dedicated management WS open for auth_state / auth_device_code events so
	// it also catches credentials expiring mid-session. After a successful sign-in the
	// server restarts (exit 76); we detect the reconnect and reload into the authed app.
	useEffect(() => {
		let cancelled = false;
		let ws: WebSocket | null = null;
		let retry: ReturnType<typeof setTimeout> | null = null;
		let pollTimer: ReturnType<typeof setTimeout> | null = null;

		const noteState = (state: string | undefined, message?: string | null) => {
			if (cancelled || !state) return;
			setAuthState(state as typeof authState);
			if (message !== undefined) setAuthMessage(message ?? null);
			// Only a genuine sign-in-required condition counts as "was non-ok". A
			// transient 'starting'/'unknown' on a cold launch (CLI still booting) must
			// NOT, or it would (a) render the misleading "Signed in — restarting" screen
			// and (b) force a full reload once 'ok' arrives.
			if (state === 'needs-auth' || state === 'error') authWasNonOk.current = true;
			if (state === 'ok') {
				setAuthDevice(null);
				if (authWasNonOk.current) window.location.reload();
			}
		};

		const poll = () => apiFetch('/api/auth/status').then(r => r.json()).then((s: { state?: string; message?: string | null; device?: { code: string; verificationUri: string } | null }) => {
			if (cancelled) return;
			if (s.device) setAuthDevice(s.device);
			noteState(s.state, s.message);
			// Keep polling while the CLI is still coming up so a missed management-WS
			// auth_state event doesn't strand the UI on the startup/restarting screen.
			if (!cancelled && (s.state === 'starting' || s.state === 'unknown' || !s.state)) {
				if (pollTimer) clearTimeout(pollTimer);
				pollTimer = setTimeout(poll, 1500);
			}
		}).catch(() => { if (!cancelled) { if (pollTimer) clearTimeout(pollTimer); pollTimer = setTimeout(poll, 2000); } });

		const openWs = () => {
			const token = getToken();
			if (!token || cancelled) return;
			ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}?token=${token}&management=1`);
			ws.onmessage = (e) => {
				try {
					const ev = JSON.parse(e.data as string) as { type: string; state?: string; message?: string | null; code?: string; verificationUri?: string };
					if (ev.type === 'auth_state') {
						noteState(ev.state, ev.message);
					} else if (ev.type === 'auth_device_code' && ev.code) {
						setAuthDevice({ code: ev.code, verificationUri: ev.verificationUri ?? 'https://github.com/login/device' });
					}
				} catch {}
			};
			ws.onclose = () => {
				// Server may be restarting after a successful sign-in — keep retrying
				// and re-polling until it's back and reports its auth state.
				ws = null;
				if (cancelled) return;
				retry = setTimeout(() => { poll(); openWs(); }, 1500);
			};
			ws.onerror = () => { try { ws?.close(); } catch {} };
		};

		poll();
		openWs();
		return () => {
			cancelled = true;
			if (retry) clearTimeout(retry);
			if (pollTimer) clearTimeout(pollTimer);
			if (ws) { ws.onclose = null; ws.onerror = null; try { ws.close(); } catch {} }
		};
	}, []);

	const startLogin = useCallback(() => {
		setAuthBusy(true);
		setAuthMessage(null);
		apiFetch('/api/auth/login', { method: 'POST' })
			.then(r => r.json())
			.then((d: { device?: { code: string; verificationUri: string } | null }) => { if (d?.device) setAuthDevice(d.device); })
			.catch(() => setAuthMessage('Could not start sign-in. Please try again.'))
			.finally(() => setAuthBusy(false));
	}, []);

	const cancelLogin = useCallback(() => {
		apiFetch('/api/auth/login/cancel', { method: 'POST' }).catch(() => {});
		setAuthDevice(null);
	}, []);

	// Access-token (PAT) sign-in tab.
	const [authTab, setAuthTab] = useState<'device' | 'token'>('device');
	const [authToken, setAuthToken] = useState('');
	const submitToken = useCallback(() => {
		const token = authToken.trim();
		if (!token) { setAuthMessage('Paste a token first.'); return; }
		setAuthBusy(true);
		setAuthMessage(null);
		apiFetch('/api/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
			.then(async r => ({ ok: r.ok, body: await r.json().catch(() => ({})) as { error?: string; login?: string } }))
			.then(({ ok, body }) => {
				if (!ok) { setAuthMessage(body?.error ?? 'Could not save the token.'); setAuthBusy(false); return; }
				// Success: server is restarting to authenticate. Clear the field and
				// let the auth-state stream flip us to the restarting/ok screen.
				setAuthToken('');
				setAuthMessage(body?.login ? `Token accepted for ${body.login} — restarting…` : 'Token saved — restarting…');
			})
			.catch(() => { setAuthMessage('Could not save the token. Please try again.'); setAuthBusy(false); });
	}, [authToken]);

	// Portal session-token gate (shown when the page loads without a valid token).
	const [ptStatus, setPtStatus] = useState<'loading' | 'enter' | 'create'>('loading');
	const [ptEnvManaged, setPtEnvManaged] = useState(false);
	const [ptInput, setPtInput] = useState('');
	const [ptGenerated, setPtGenerated] = useState<string | null>(null);
	const [ptBusy, setPtBusy] = useState(false);
	const [ptError, setPtError] = useState<string | null>(null);
	const [ptCopied, setPtCopied] = useState(false);

	// When the token gate appears, ask the server whether a token already exists
	// (→ prompt to paste it) or not (→ offer a one-time "generate" claim).
	useEffect(() => {
		if (connectionState !== 'no_token') return;
		let cancelled = false;
		setPtStatus('loading');
		fetch('/api/portal-token/status')
			.then(r => r.json())
			.then((s: { configured: boolean; envManaged: boolean }) => {
				if (cancelled) return;
				setPtEnvManaged(!!s.envManaged);
				setPtStatus(s.configured ? 'enter' : 'create');
			})
			.catch(() => { if (!cancelled) setPtStatus('enter'); });
		return () => { cancelled = true; };
	}, [connectionState]);

	// Persist the token and reload so the whole app re-bootstraps cleanly with it.
	const applyPortalToken = useCallback((token: string) => {
		localStorage.setItem('portal_token', token);
		const params = new URLSearchParams(window.location.search);
		params.set('token', token);
		window.location.search = params.toString();
	}, []);

	const submitPortalToken = useCallback(() => {
		const token = ptInput.trim();
		if (!token) { setPtError('Enter your session token.'); return; }
		setPtBusy(true); setPtError(null);
		fetch(`/api/info?token=${encodeURIComponent(token)}`)
			.then(r => {
				if (r.status === 401) { setPtError('That session token is not valid.'); setPtBusy(false); return; }
				applyPortalToken(token);
			})
			.catch(() => { setPtError('Could not reach the portal. Try again.'); setPtBusy(false); });
	}, [ptInput, applyPortalToken]);

	const generatePortalToken = useCallback(() => {
		setPtBusy(true); setPtError(null);
		fetch('/api/portal-token/create', { method: 'POST' })
			.then(async r => ({ status: r.status, ok: r.ok, body: await r.json().catch(() => ({})) as { token?: string; error?: string } }))
			.then(({ status, ok, body }) => {
				if (!ok) {
					if (status === 409) { setPtStatus('enter'); setPtError('This portal already has a session token. Enter it below.'); }
					else setPtError(body?.error ?? 'Could not generate a token.');
					setPtBusy(false);
					return;
				}
				setPtGenerated(body.token ?? null);
				setPtBusy(false);
			})
			.catch(() => { setPtError('Could not generate a token. Try again.'); setPtBusy(false); });
	}, []);

	const copyPortalToken = useCallback(() => {
		if (!ptGenerated) return;
		const done = () => { setPtCopied(true); setTimeout(() => setPtCopied(false), 2000); };
		// navigator.clipboard only exists in a secure context (HTTPS or localhost).
		// On a plain-HTTP LAN it's undefined, so fall back to a hidden textarea +
		// execCommand('copy'), which still works there.
		const fallback = () => {
			try {
				const ta = document.createElement('textarea');
				ta.value = ptGenerated;
				ta.style.position = 'fixed';
				ta.style.opacity = '0';
				document.body.appendChild(ta);
				ta.focus(); ta.select();
				const ok = document.execCommand('copy');
				document.body.removeChild(ta);
				if (ok) done();
			} catch { /* clipboard unavailable — user can still select the token manually */ }
		};
		if (navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(ptGenerated).then(done).catch(fallback);
		} else {
			fallback();
		}
	}, [ptGenerated]);

	// Track visit count for PWA install hint (show on 2nd+ mobile visit)
	const [pwaVisitCount] = useState(() => {
		const count = parseInt(localStorage.getItem('portal_visit_count') ?? '0', 10) + 1;
		localStorage.setItem('portal_visit_count', String(count));
		return count;
	});

	// Poll for available updates every 5 minutes (server checks npm every 4 hours)
	useEffect(() => {
		const poll = () => apiFetch('/api/updates').then(r => r.json()).then((s: UpdateStatus) => {
			setUpdateStatus(s);
			// Reset dismissed if no updates (so banner reappears for new updates)
			if (!s.packages.some(p => p.hasUpdate)) setUpdateDismissed(false);
		}).catch(() => {});
		poll();
		const timer = setInterval(poll, 5 * 60 * 1000);
		return () => clearInterval(timer);
	}, []);

	// Auto-collapse drawer when first message arrives
	const drawerAutoCollapsedRef = useRef(false);
	useEffect(() => {
		if (messages.length > 0 && drawerOpen && !drawerAutoCollapsedRef.current) {
			drawerAutoCollapsedRef.current = true;
			setDrawerOpen(false);
		}
		if (messages.length === 0) drawerAutoCollapsedRef.current = false;
	}, [messages.length, drawerOpen]);

	const enterNoSession = useCallback(() => {
		// Null callbacks first so onclose doesn't trigger a reconnect
		const ws = wsRef.current;
		if (ws) { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; ws.close(); }
		wsRef.current = null;
		if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
		if (heartbeatRef.current) { clearInterval(heartbeatRef.current.interval); if (heartbeatRef.current.timeout) clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current = null; }
		if (stopClearTimerRef.current) { clearTimeout(stopClearTimerRef.current); stopClearTimerRef.current = null; }
		noSessionRef.current = true;
		isStoppingRef.current = false;
		pendingMsgRef.current = null;
		setNoSession(true);
		setActiveSessionId(null);
		setSessionContext(null);
		setMessages([]);
		setStreamingContent('');
		setIsStreaming(false);
		setIsThinking(false);
		setIsStopping(false);
		setConnectionState('disconnected');
		setShowPicker(true);
		setPendingApproval(null);
		setCliApprovalInfo(null);
		setCliInputInfo(null);
		setActiveSessionSummary(null);
		setActiveModel(null);
		setRules([]);
		setApproveAll(false);
		const params = new URLSearchParams(window.location.search);
		params.delete('session');
		params.delete('all');
		params.delete('history');
		window.history.replaceState(null, '', `?${params.toString()}`);

		// Open a lightweight management WS to receive session broadcasts (delete/shield)
		const token = getToken();
		if (token) {
			// Close any existing mgmt WS before opening a new one
			if (mgmtWsRef.current) { mgmtWsRef.current.onerror = null; mgmtWsRef.current.close(); }
			const mgmtWs = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}?token=${token}&management=1`);
			mgmtWs.onmessage = (e) => {
				try {
					const event = JSON.parse(e.data as string) as PortalEvent;
					if (event.type === 'session_deleted') {
						setSessions(prev => prev.filter(s => s.sessionId !== event.sessionId));
					} else if (event.type === 'session_shield_changed') {
						setSessions(prev => prev.map(s => s.sessionId === event.sessionId ? { ...s, shielded: event.shielded ?? false } : s));
					} else if (event.type === 'session_renamed') {
						setSessions(prev => prev.map(s => s.sessionId === event.sessionId ? { ...s, summary: event.summary ?? s.summary } : s));
					} else if (event.type === 'session_created' && event.session) {
						setSessions(prev => prev.some(s => s.sessionId === event.session!.sessionId) ? prev : [event.session!, ...prev]);
					} else if (event.type === 'squad_file_changed' && event.path) {
						setLastSquadChange({ path: event.path, changeType: event.changeType ?? 'change', timestamp: event.timestamp ?? Date.now() });
					}
				} catch {}
			};
			mgmtWs.onerror = () => mgmtWs.close();
			mgmtWsRef.current = mgmtWs;
		}
		// Always fetch the current session list so the picker has data even when called dynamically
		apiFetch('/api/sessions').then(r => r.json()).then(setSessions).catch(() => {});
	}, []);

	const connect = useCallback(() => {
		const token = getToken();
		if (!token) { setConnectionState('no_token'); return; }
		if (noSessionRef.current) return; // user must pick a session first
		// Skip if already connecting — prevents duplicate connections from concurrent triggers
		if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

		// Close management WS before opening a session WS (they're mutually exclusive).
		if (mgmtWsRef.current) {
			mgmtWsRef.current.onmessage = null;
			mgmtWsRef.current.onerror = null;
			mgmtWsRef.current.close();
			mgmtWsRef.current = null;
		}

		// Kill any existing connection before creating a new one.
		// Null out callbacks first so onclose doesn't schedule another reconnect.
		lastConnectTime.current = Date.now();
		setConnectionState('connecting');
		const prev = wsRef.current;
		if (prev) {
			// Close first, then detach handlers (prevents stale event delivery)
			if (prev.readyState !== WebSocket.CLOSED) prev.close();
			prev.onopen = null;
			prev.onmessage = null;
			prev.onerror = null;
			prev.onclose = null;
		}

		const sessionId = new URLSearchParams(window.location.search).get('session');
		const sessionParam = sessionId ? `&session=${sessionId}` : '';
		const historyParam = new URLSearchParams(window.location.search).get('history');
		const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
		const wsUrl = `${wsProto}://${window.location.host}?token=${token}${sessionParam}${historyParam ? `&history=${historyParam}` : ''}`;
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;
		let hadMsg = false;

		ws.onopen = () => {
			fastFailCount.current = 0;
			setConnectionState('connected');
			// Restore textarea focus after reconnect (prevents focus loss on background return)
			setTimeout(() => textareaRef.current?.focus(), 100);
			// Clear stale update status from before restart, then re-check
			setUpdateStatus(null);
			setUpdateDismissed(false);
			// Re-check update status on (re)connect — server may have restarted with new versions
			// Poll immediately and again after 15s (server may still be running its initial check)
			const pollUpdates = () => apiFetch('/api/updates').then(r => r.json()).then((s: UpdateStatus) => {
				setUpdateStatus(s);
			}).catch(() => {});
			pollUpdates();
			setTimeout(pollUpdates, 15000);
			// Heartbeat will be started after first message arrives (see onmessage).
			// Starting it on onopen risks timing out during slow session loads
			// where the server is blocked in resumeSession() for 30+ seconds.
			if (heartbeatRef.current) { clearInterval(heartbeatRef.current.interval); if (heartbeatRef.current.timeout) clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current = null; }
		};

		let heartbeatStarted = false;
		ws.onmessage = (e) => {
			hadMsg = true;
			fastFailCount.current = 0;
			// Any message proves the connection is alive — clear heartbeat timeout
			if (heartbeatRef.current?.timeout) { clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current.timeout = null; }
			// Start heartbeat after first message — server is now responsive
			if (!heartbeatStarted) {
				heartbeatStarted = true;
				const hb = { interval: setInterval(() => {
					if (ws.readyState === WebSocket.OPEN) {
						if (document.visibilityState === 'hidden') return;
						ws.send('{"type":"ping"}');
						if (hb.timeout) clearTimeout(hb.timeout);
						hb.timeout = setTimeout(() => { ws.close(); }, 5000);
					}
				}, 30_000), timeout: null as ReturnType<typeof setTimeout> | null };
				heartbeatRef.current = hb;
			}
			try {
				const event = JSON.parse(e.data as string) as PortalEvent;

				if (event.type === 'pong') {
					// Heartbeat response — clear the stale-connection timeout
					if (heartbeatRef.current?.timeout) { clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current.timeout = null; }
					return;
				}

				if (event.type === 'history_loading') {
					setLoadingHistory({ sizeMB: (event as { sizeMB?: string }).sizeMB ?? '?', startTime: Date.now() });
					return;
				}

				if (event.type === 'history_meta') {
								setHistoryTruncated({ total: event.total!, shown: event.shown! });
								return;
							}

							if (event.type === 'history_start') {
					if (event.sessionId && event.sessionId !== activeSessionIdRef.current) return;
					inHistoryRef.current = true;
					historyBufferRef.current = [];
					setHistoryTruncated(null);
					setHistoryReady(false);
					// Clear any in-progress streaming from a previous connection
					streamingRef.current = '';
					reasoningRef.current = '';
					lastStreamedRef.current = '';
					// A completed FINAL assistant message may be sitting in pendingMsgRef,
					// buffered while it waits for `idle` to attach a trailing tool summary. A
					// mid-turn resync/reconnect fires history_start on the SAME App instance,
					// so blindly nulling it here would silently DISCARD an already-emitted
					// message if the freshly-read server history hasn't persisted it yet
					// (the "message appeared then vanished until reload" bug). Carry it over so
					// history_end can re-attach it when the replay comes back short.
					carriedFinalRef.current = pendingMsgRef.current;
					pendingMsgRef.current = null;
					isStoppingRef.current = false;
					// Clear live tool cards from a previous connection. Completed tools are
					// baked into the replayed history messages; a genuinely still-active turn
					// re-sends its in-flight tool_start events after history_end (server
					// getActiveTurnEvents). Without this, a tool that started before a
					// disconnect — and completed while disconnected — would leave a "Running"
					// tool card spinning forever above the history until a full page reload.
					setToolEvents([]);
					imageToolIdsRef.current = new Set(); // rebuilt from history_image events on replay
					// Reset the dequeue gate on every (re)connect. A genuinely active turn
					// re-sets this to true via the replayed `thinking` event after history_end;
					// leaving it stranded true would block a queued message from ever being
					// released, pinning the bubble at "pushing…" until a full page reload.
					turnActiveRef.current = false;
					if (stopClearTimerRef.current) { clearTimeout(stopClearTimerRef.current); stopClearTimerRef.current = null; }
					setStreamingContent('');
					setIsStreaming(false);
					setIsThinking(false);
					setIsStopping(false);
					setThinkingText('');
					setReasoningText('');
					setPendingInput(null);
					return;
				}

				if (event.type === 'history_end') {
					inHistoryRef.current = false;
					setLoadingHistory(null);
					setHistoryReady(true);
					if (event.sessionId && event.sessionId !== activeSessionIdRef.current) {
						historyBufferRef.current = []; return;
					}
					// Authoritatively force the thinking dot OFF when the server reports no
					// portal turn is running. The dot is otherwise inferred from a replayed
					// `thinking` + a future `idle`; if a completion `idle` lands during the
					// history-replay window it's routed to the history `idle` branch (which
					// doesn't clear the dot), stranding the spinner until a manual Stop. The
					// server stamps the truth (handle.portalTurnActive) here. We only act on
					// the OFF case: when a turn IS active, getActiveTurnEvents emits a live
					// `thinking` right after this event which arms the dot AND runs the
					// queued-message dequeue fallback — so we must not pre-set turnActiveRef
					// here, or an image-only queued message (no preceding user `sync`) would
					// be stranded.
					if (event.turnActive === false) {
						turnActiveRef.current = false;
						setIsThinking(false);
						setThinkingText('');
					}
					// Flush any remaining assistant content
					if (streamingRef.current) {
						historyBufferRef.current.push({
							id: `hist-${historyIdCounter.current++}-a`,
							role: 'assistant',
							content: streamingRef.current,
							timestamp: historyTimestampRef.current ?? Date.now(),
							bytes: new TextEncoder().encode(streamingRef.current).length,
						});
						streamingRef.current = '';
					}
					// On reconnect to the same session, adopt the server's authoritative replay
					// when it differs from what we hold. The reconnect replay is capped at the
					// history limit (default 50 messages), so in a long session our LOCAL view
					// can be longer than the replay: we loaded the last N at connect, then live
					// events appended more, pushing us past the limit. A naive
					// `buffer.length >= local.length` guard then REJECTS a newer-but-shorter
					// replay, leaving the final answer invisible until a manual refresh/reselect
					// (the exact reported phone-lock bug). We instead adopt when EITHER the
					// replay is at least as long as our (non-queued) local view, OR the replay's
					// last message differs from ours — i.e. newer content arrived at the tail.
					// A pure older/truncated prefix (same tail, shorter) is NOT adopted, so we
					// never wipe a longer local view for nothing. Locally-queued (unsent)
					// messages are preserved across adoption — they aren't in server history.
					const isReconnect = messagesRef.current.length > 0 && activeSessionIdRef.current === (event.sessionId ?? activeSessionIdRef.current);
					if (isReconnect) {
						const local = messagesRef.current;
						const buf = historyBufferRef.current;
						// Re-attach a final message that was buffered (pendingMsgRef) when this
						// replay began but isn't in the freshly-read history yet (persistence
						// lag mid-turn). Without this, a resync between "message committed" and
						// "history caught up" drops the message until a full reload.
						const carried = carriedFinalRef.current;
						carriedFinalRef.current = null;
						if (carried?.content && !buf.some(m => m.role === 'assistant' && m.content === carried.content)) {
							buf.push(carried);
						}
						const queued = local.filter(m => m.queued);
						const localNonQueued = queued.length ? local.filter(m => !m.queued) : local;
						const sig = (arr: Message[]) => arr.map(m => `${m.role}:${(m.content ?? '').length}`).join('|');
						const changed = sig(localNonQueued) !== sig(buf);
						const lastLocal = localNonQueued[localNonQueued.length - 1];
						const lastBuf = buf[buf.length - 1];
						const tailNewer = !!lastBuf && (!lastLocal || lastLocal.role !== lastBuf.role || (lastLocal.content ?? '') !== (lastBuf.content ?? ''));
						// Mid-turn (server reports the portal turn is still active) our LIVE local
						// tail is authoritative — a shorter history snapshot is a lagging read,
						// NOT a truncated-but-newer view. Adopting it on tailNewer alone would
						// wipe a just-emitted message until a full reload. The tailNewer path is
						// only for the IDLE phone-lock case, where a newer answer completed
						// elsewhere while we were backgrounded and the capped replay is shorter.
						const activeTurn = event.turnActive === true;
						if (changed && (buf.length >= localNonQueued.length || (tailNewer && !activeTurn))) {
							setMessages(queued.length ? [...buf, ...queued] : buf);
						}
						historyBufferRef.current = [];
						return;
					}
					setMessages(historyBufferRef.current);
								// Prevent auto-collapse from firing when user manually opens drawer after history load
								if (historyBufferRef.current.length > 0) drawerAutoCollapsedRef.current = true;
					// Auto-open drawer when session is empty (new session)
					if (historyBufferRef.current.length === 0) setDrawerOpen(true);
					historyBufferRef.current = [];
					// Check for pending prompt from draft session creation
					const pendingPrompt = sessionStorage.getItem('portal_pending_prompt');
					if (pendingPrompt) {
						sessionStorage.removeItem('portal_pending_prompt');
						setTimeout(() => {
							wsRef.current?.send(JSON.stringify({ type: 'prompt', content: pendingPrompt }));
							setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'user', content: pendingPrompt, timestamp: Date.now() }]);
							setIsThinking(true);
						}, 100);
					}
					return;
				}

				if (event.type === 'session_switched') {
					const newId = event.sessionId ?? null;
					activeSessionIdRef.current = newId;
					setActiveSessionId(newId);
					// Use pending CWD from draft creation if SDK metadata isn't ready yet
					let ctx = (event as { context?: SessionContext | null }).context ?? null;
					if (!ctx) {
						const pendingCwd = sessionStorage.getItem('portal_pending_cwd');
						if (pendingCwd) {
							ctx = { cwd: pendingCwd };
							sessionStorage.removeItem('portal_pending_cwd');
						}
					}
					setSessionContext(ctx);
					setActiveSessionSummary((event as { summary?: string | null }).summary ?? null);
					setActiveModel((event as { model?: string | null }).model ?? null);
					// Restore model selected during draft creation (before page reload)
					const pendingModel = sessionStorage.getItem('portal_pending_model');
					if (pendingModel) {
						sessionStorage.removeItem('portal_pending_model');
						setActiveModel(pendingModel);
						// Tell server to switch to this model
						setTimeout(() => {
							wsRef.current?.send(JSON.stringify({ type: 'set_model', content: pendingModel }));
						}, 500);
					}
					// Restore agent name from session_switched event
					setActiveAgent((event as { agent?: string | null }).agent ?? null);
					// Restore accumulated usage from server (survives page reload)
					const usageFromServer = (event as { usage?: typeof sessionUsage }).usage;
					if (usageFromServer) setSessionUsage(usageFromServer);
					// Restore prompts for this session
					setShowPromptsTray(false);
					if (newId) {
						const cached = sessionPromptsRef.current.get(newId);
						if (cached) {
							setSessionPrompts(cached);
						} else {
							apiFetch(`/api/session-prompts/${encodeURIComponent(newId)}`)
								.then(r => r.json())
								.then(({ prompts }: { prompts: Array<{ label: string; text: string }> }) => {
									if (prompts.length > 0) {
										sessionPromptsRef.current.set(newId, prompts);
										setSessionPrompts(prompts);
									}
								}).catch(() => {});
							setSessionPrompts([]);
						}
					} else {
						setSessionPrompts([]);
					}
					// Check for build mismatch between server and client
					const serverBuild = (event as { serverBuild?: string }).serverBuild;
					if (serverBuild && serverBuild !== __BUILD__) {
						if (serverBuild > __BUILD__) {
							// Server is newer — client needs to reload
							setNotification({ type: 'info', message: `Server updated to build ${serverBuild}.`, action: { label: 'Reload', onClick: () => window.location.reload() } });
						} else {
							// Client is newer — server needs restart
							setNotification({ type: 'warning', message: `Server is running build ${serverBuild}, client has ${__BUILD__}.`, action: { label: 'Restart', onClick: () => {
								restartServer();
								setNotification({ type: 'info', message: 'Restarting server… refresh when ready.' });
							} } });
						}
					}
					if (newId) {
						const summary = (event as { summary?: string | null }).summary ?? undefined;
						const startTime = (event as { startTime?: string | null }).startTime ?? undefined;
						setSessions(prev => prev.some(s => s.sessionId === newId)
							? prev.map(s => s.sessionId === newId ? { ...s, summary: summary ?? s.summary, startTime: startTime ?? s.startTime } : s)
							: [{ sessionId: newId, summary, startTime }, ...prev]);					}
					// Keep URL in sync — update ?session= without reloading
					if (newId) {
						const params = new URLSearchParams(window.location.search);
						params.set('session', newId);
						params.delete('all');
						params.delete('history');
						window.history.replaceState(null, '', `?${params.toString()}`);
					}
					return;
				}

				if (event.type === 'model_changed') {
					setActiveModel(event.model ?? null);
					return;
				}

				if (event.type === 'session_usage') {
					const e = event as { usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; reasoningTokens: number; requests: number }; quota?: Record<string, { isUnlimitedEntitlement?: boolean; entitlementRequests: number; usedRequests: number; remainingPercentage: number; resetDate?: string }> };
					if (e.usage) setSessionUsage(e.usage);
					if (e.quota) {
						const q = e.quota['chat'] ?? e.quota['premium_interactions'];
						if (q) setSessionQuota({ unlimited: !!q.isUnlimitedEntitlement, used: q.usedRequests, total: q.entitlementRequests, remaining: q.remainingPercentage, resetDate: q.resetDate });
					}
					return;
				}

				if (event.type === 'context_usage') {
					try {
						const d = JSON.parse(event.content ?? '{}');
						setContextUsage(d);
					} catch {}
					return;
				}

				if (event.type === 'session_not_found') {
					enterNoSession();
					return;
				}

				if (event.type === 'session_resuming') {
					setIsThinking(true);
					setThinkingText('Resuming session…');
					return;
				}

				if (event.type === 'session_deleted') {
					setSessions(prev => prev.filter(s => s.sessionId !== event.sessionId));
					if (event.sessionId === activeSessionIdRef.current) enterNoSession();
					return;
				}

				if (event.type === 'session_shield_changed') {
					setSessions(prev => prev.map(s => s.sessionId === event.sessionId ? { ...s, shielded: event.shielded } : s));
					return;
				}

				if (event.type === 'session_created' && event.session) {
					setSessions(prev => prev.some(s => s.sessionId === event.session!.sessionId) ? prev : [event.session!, ...prev]);
					return;
				}

				if (inHistoryRef.current) {
					if (event.type === 'history_user') {
						// Flush any pending assistant content first
						if (streamingRef.current) {
							historyBufferRef.current.push({
								id: `hist-${historyIdCounter.current++}-a`,
								role: 'assistant',
								content: streamingRef.current,
								timestamp: historyTimestampRef.current ?? Date.now(),
								bytes: new TextEncoder().encode(streamingRef.current).length,
							});
							streamingRef.current = '';
							historyTimestampRef.current = undefined;
						}
						const rawContent = event.content ?? '';
						const isAskUserResponse = !!event.askUserChoices?.length || rawContent.startsWith('User selected: ') || rawContent.startsWith('User responded: ');
						const content = isAskUserResponse ? rawContent.replace(/^User (selected|responded): /, '') : rawContent;
						historyBufferRef.current.push({
							id: `hist-${historyIdCounter.current++}-u`,
							role: 'user',
							content,
							timestamp: event.timestamp ?? Date.now(),
							askUserChoices: event.askUserChoices,
							images: event.images?.length ? event.images : undefined,
						});
					} else if (event.type === 'delta') {
						streamingRef.current += event.content ?? '';
						if (event.timestamp) historyTimestampRef.current = event.timestamp;
						} else if (event.type === 'history_image') {
							// A tool produced an image earlier in this conversation. Flush any
							// pending assistant content first, then add a standalone image bubble
							// (mirrors the live tool_complete image path).
							if (streamingRef.current) {
								historyBufferRef.current.push({
									id: `hist-${historyIdCounter.current++}-a`,
									role: 'assistant',
									content: streamingRef.current,
									timestamp: historyTimestampRef.current ?? Date.now(),
									bytes: new TextEncoder().encode(streamingRef.current).length,
								});
								streamingRef.current = '';
								historyTimestampRef.current = undefined;
							}
							if (event.images?.length) {
								historyBufferRef.current.push({
									id: `hist-${historyIdCounter.current++}-img`,
									role: 'assistant',
									content: '',
									timestamp: event.timestamp ?? Date.now(),
									images: event.images,
									imageTool: event.imageTool,
								});
							}
						} else if (event.type === 'idle') {
						if (streamingRef.current) {
							historyBufferRef.current.push({
								id: `hist-${historyIdCounter.current++}-a`,
								role: 'assistant',
								content: streamingRef.current,
								timestamp: historyTimestampRef.current ?? Date.now(),
								bytes: new TextEncoder().encode(streamingRef.current).length,
								intermediate: event.intermediate || undefined,
								toolSummary: event.toolSummary || undefined,
								questionChoices: event.questionChoices || undefined,
							});
							streamingRef.current = '';
							historyTimestampRef.current = undefined;
						} else if (event.toolSummary?.length) {
							// Tool-only idle (no preceding delta) — attach to the last assistant message
							const buf = historyBufferRef.current;
							const last = buf.length > 0 ? buf[buf.length - 1] : null;
							if (last && last.role === 'assistant') {
								last.toolSummary = [...(last.toolSummary ?? []), ...event.toolSummary];
							}
						}
					}
					return;
				}

				// Live events
				if (event.type === 'delta') {
					streamingRef.current += event.content ?? '';
					setStreamingContent(streamingRef.current);
					if (isStoppingRef.current) {
						// Debounce: reschedule the stop-clear, events are still arriving
						if (stopClearTimerRef.current) clearTimeout(stopClearTimerRef.current);
						stopClearTimerRef.current = setTimeout(() => { isStoppingRef.current = false; setIsStopping(false); stopClearTimerRef.current = null; }, 800);
					} else {
						setCliApprovalInfo(null);
						setIsStreaming(true);
					}
				} else if (event.type === 'thinking') {
					if (isStoppingRef.current) {
						if (stopClearTimerRef.current) clearTimeout(stopClearTimerRef.current);
						stopClearTimerRef.current = setTimeout(() => { isStoppingRef.current = false; setIsStopping(false); stopClearTimerRef.current = null; }, 800);
					} else {
						if (!turnActiveRef.current) {
							// New turn starting — release the oldest queued message (fallback if the
							// authoritative sync/user.message ACK hasn't arrived yet). Restamp to now so
							// it sorts to the dequeue point, consistent with the sync-release path.
							turnActiveRef.current = true;
							setMessages(prev => {
								const idx = prev.findIndex(m => m.queued);
								if (idx === -1) return prev;
								const updated = [...prev];
								updated[idx] = { ...updated[idx], queued: undefined, timestamp: Date.now() };
								return updated;
							});
						}
						setIsThinking(true);
						if (event.content) setThinkingText(event.content);
					}
				} else if (event.type === 'reasoning_delta') {
					if (event.content) {
						reasoningRef.current += event.content;
						setReasoningText(reasoningRef.current);
					}
				} else if (event.type === 'sync') {
					// Message synced from CLI activity — dedup against locally-added messages
					const role = event.role === 'user' ? 'user' : 'assistant';
					const content = event.content ?? '';
					if (content) {
						if (role === 'user') {
							// The SDK has committed this user message into the active turn — i.e. Copilot
							// has now "heard" it. Restamp it with the commit timestamp so the timestamp
							// sort places it at the ACK/dequeue point — uniformly for normal AND queued
							// messages, matching the SDK-recorded order shown on reload. No special-casing.
							const ackTs = event.timestamp ?? Date.now();
							setMessages((prev) => {
								const idx = prev.findIndex(m => m.role === 'user' && m.content === content);
								if (idx !== -1) {
									const existing = prev[idx];
									// Only a still-QUEUED bubble should be repositioned to its ACK point
									// (it was pinned to the bottom while unsent). An already-committed
									// (non-queued) bubble is at its correct SDK-ordered slot — a mid-turn
									// resync that replays the active user message must NOT drag it to
									// "now", which would jump it down next to the final message. No-op.
									if (!existing.queued) return prev;
									const updated = [...prev];
									updated[idx] = { ...existing, queued: undefined, timestamp: ackTs };
									return updated;
								}
								return [...prev, { id: `sync-${Date.now()}-${Math.random()}`, role, content, timestamp: ackTs, toolSummary: event.toolSummary || undefined }];
							});
							// New turn starting — show thinking indicator
							setToolEvents([]); lastStreamedRef.current = '';
							isCliTurnRef.current = true;
							setIsThinking(true);
						} else {
							setMessages((prev) => {
								if (prev.some(m => m.role === role && m.content === content)) return prev;
								return [...prev, { id: `sync-${Date.now()}-${Math.random()}`, role, content, timestamp: Date.now(), toolSummary: event.toolSummary || undefined }];
							});
							// CLI turn produced a reply — clear thinking
							setIsThinking(false);
							setThinkingText('');
							isCliTurnRef.current = false;
							setCliApprovalInfo(null);
							setCliInputInfo(null);
						}
					}
				} else if (event.type === 'message_end') {
					// Commit this message — server tells us if it's intermediate and which tools it dispatched
					const content = streamingRef.current.trim();
					const toolCallIds = (event as { toolCallIds?: string[] }).toolCallIds;
					const hasTools = toolCallIds && toolCallIds.length > 0;

					// Commit message if it has content OR has tools to track
					if (content || hasTools) {
						const msg: Message = {
							id: `msg-${Date.now()}`,
							role: 'assistant',
							content,
							reasoning: reasoningRef.current || undefined,
							intermediate: event.intermediate || undefined,
							toolCallIds: toolCallIds || undefined,
							timestamp: Date.now(),
						};
						if (msg.intermediate || hasTools) {
							// Intermediate or tool-dispatching: commit immediately
							setMessages(prev => prev.length > 0 && prev[prev.length - 1].content === msg.content && msg.content && Date.now() - prev[prev.length - 1].timestamp < 2000 ? prev : [...prev, msg]);
						} else {
							// Final message: buffer for idle to attach remaining tool summary
							lastStreamedRef.current = (lastStreamedRef.current ? lastStreamedRef.current + '\n' : '') + content;
							pendingMsgRef.current = msg;
						}
					}
					streamingRef.current = '';
					reasoningRef.current = '';
					setStreamingContent('');
				} else if (event.type === 'intent') {
					setToolEvents((prev) => [...prev, { id: `intent-${Date.now()}`, type: 'intent', content: event.content, timestamp: Date.now() }]);
				} else if (event.type === 'tool_start') {
					if (event.toolName === 'report_intent') {
						// Use report_intent's argument as the live thinking indicator text
						try {
							const args = JSON.parse(event.content ?? '{}') as { intent?: string };
							if (args.intent && !isStoppingRef.current) {
								setIsThinking(true);
								setThinkingText(args.intent);
							}
						} catch { /* ignore parse errors */ }
					} else if (event.toolName === 'ask_user') {
						// ask_user is handled by the pendingInput UI — don't show as a tool box
						// But still flush any buffered message so the user sees it before the prompt
						if (pendingMsgRef.current) {
							const msg = pendingMsgRef.current;
							pendingMsgRef.current = null;
							setMessages(prev => prev.length > 0 && prev[prev.length - 1].content === msg.content && Date.now() - prev[prev.length - 1].timestamp < 2000 ? prev : [...prev, msg]);
						}
						if (!isStoppingRef.current) {
							setIsThinking(true);
							setThinkingText('Awaiting response…');
						}
					} else {
						// Flush any buffered final message before showing tools
						if (pendingMsgRef.current) {
							const msg = pendingMsgRef.current;
							pendingMsgRef.current = null;
							setMessages(prev => prev.length > 0 && prev[prev.length - 1].content === msg.content && Date.now() - prev[prev.length - 1].timestamp < 2000 ? prev : [...prev, msg]);
						}
						setCliApprovalInfo(null);
						if (!isStoppingRef.current) {
							setIsThinking(true);
							setThinkingText(`Running ${event.toolName ?? 'tool'}…`);
						}
						const intention = event.toolCallId ? intentionMapRef.current.get(event.toolCallId) : undefined;
						setToolEvents((prev) => [...prev, { id: `ts-${event.toolCallId ?? Date.now()}`, type: 'tool_start', toolCallId: event.toolCallId, toolName: event.toolName, mcpServerName: event.mcpServerName, displayLabel: event.displayLabel, intentionSummary: intention, content: event.content, timestamp: Date.now() }]);
					}
				} else if (event.type === 'tool_complete') {
					setToolEvents((prev) => prev.map(te => te.toolCallId === event.toolCallId ? { ...te, type: 'tool_complete' as const, content: event.content } : te));
					// A tool may return inline image content (e.g. an MCP `view_image` tool).
					// Surface it as a standalone assistant image message so it renders in the
					// conversation (reuses the existing <img>+lightbox path). These arrive on
					// the live event only and are not in events.jsonl, so we add them here.
					if (event.images?.length) {
						const imgs = event.images;
						const tcId = event.toolCallId;
						const imgKey = `img-${tcId ?? Date.now()}`;
						// Pair the image with the tool that produced it: pull its summary from
						// the just-completed tool event and render it as a caption on the image
						// bubble. Record the toolCallId so the parent's "N tools ran" pill skips it.
						let imageTool: ToolSummaryItem | undefined;
						if (tcId) {
							imageToolIdsRef.current.add(tcId);
							const te = toolEventsRef.current.find(t => t.toolCallId === tcId);
							const built = te ? buildToolSummary([te]) : [];
							if (built.length) imageTool = { ...built[0], completed: true };
						}
						setMessages(prev => prev.some(m => m.id === imgKey) ? prev : [...prev, { id: imgKey, role: 'assistant', content: '', timestamp: Date.now(), images: imgs, imageTool }]);
					}
					const completedId = event.toolCallId;
					if (!completedId) return;
					// Decide whether this completion finishes a message's tool group, then
					// (after a 2s green flash) collapse it. Read current messages from the
					// ref rather than scheduling the timer inside a setMessages updater —
					// an updater must stay pure (no side effects / no timers).
					const parentMsg = messagesRef.current.find(m => m.toolCallIds?.includes(completedId));
					if (parentMsg?.toolCallIds) {
						const allToolEvents = toolEventsRef.current;
						const allDone = parentMsg.toolCallIds.every(tcId => {
							const te = allToolEvents.find(t => t.toolCallId === tcId);
							return te?.type === 'tool_complete' || tcId === completedId;
						});
						// Keep error tools visible (don't collapse) if any had a real error.
						const hasError = parentMsg.toolCallIds.some(tcId => {
							const te = allToolEvents.find(t => t.toolCallId === tcId);
							return te?.type === 'tool_complete' && te?.content !== 'success' && te?.content !== 'done';
						});
						if (allDone && !hasError) {
							const msgId = parentMsg.id;
							const toolCallIds = parentMsg.toolCallIds;
							// Show green for 2s before collapsing
							setTimeout(() => {
								setMessages(prev2 => prev2.map(m => {
									if (m.id !== msgId || !m.toolCallIds) return m;
									const currentTools = toolEventsRef.current;
									const msgTools = toolCallIds
										.filter(tcId => !imageToolIdsRef.current.has(tcId)) // image tools show on their own bubble
										.map(tcId => currentTools.find(t => t.toolCallId === tcId))
										.filter((t): t is ToolEvent => !!t);
									const summary = buildToolSummary(msgTools);
									setToolEvents(prev3 => prev3.filter(te => !toolCallIds.includes(te.toolCallId ?? '')));
									return { ...m, toolSummary: summary.length ? summary : undefined, toolCallIds: undefined };
								}));
							}, 2000);
						}
					}
					if (!isStoppingRef.current) setThinkingText('Thinking…');
				} else if (event.type === 'tool_update') {
					// Sub-agent name arrived — update the task tool's displayLabel
					if (event.displayLabel) setToolEvents((prev) => prev.map(te => te.toolCallId === event.toolCallId ? { ...te, displayLabel: event.displayLabel } : te));
				} else if (event.type === 'tool_call') {
					// Store intention summary for matching with tool_start
					if (event.intentionSummary && event.toolCallId) {
						intentionMapRef.current.set(event.toolCallId, event.intentionSummary);
					} else if (!event.intentionSummary) {
						// tool_output (partial result streaming)
						setToolEvents((prev) => [...prev, { id: `to-${Date.now()}`, type: 'tool_output', toolCallId: event.toolCallId, content: event.content, timestamp: Date.now() }]);
					}
				} else if (event.type === 'idle') {
					// Any remaining tool events not yet collapsed — exclude failed ones (they stay
					// visible) and image-producing tools (shown as a caption on their image bubble).
					const remainingTools = buildToolSummary(toolEventsRef.current.filter(te =>
						!imageToolIdsRef.current.has(te.toolCallId ?? '') &&
						!(te.type === 'tool_complete' && te.content !== 'success' && te.content !== 'done')));
					// Commit any buffered message as the final reply
					if (pendingMsgRef.current) {
						const pendingBytes = new TextEncoder().encode(pendingMsgRef.current.content).length;
						const msg = { ...pendingMsgRef.current, toolSummary: remainingTools.length ? remainingTools : undefined, bytes: pendingBytes };
						pendingMsgRef.current = null;
						setMessages(prev => prev.length > 0 && prev[prev.length - 1].content === msg.content && Date.now() - prev[prev.length - 1].timestamp < 2000 ? prev : [...prev, msg]);
					}
					const final = streamingRef.current;
					if (final) {
						const finalBytes = new TextEncoder().encode(final).length;
						lastStreamedRef.current = final;
						setMessages((prev) => {
							if (prev.length > 0 && prev[prev.length - 1].role === 'assistant' && prev[prev.length - 1].content === final && Date.now() - prev[prev.length - 1].timestamp < 2000) return prev;
							return [
								...prev,
								{
									id: `msg-${Date.now()}`,
									role: 'assistant',
									content: final,
									reasoning: reasoningRef.current || undefined,
									toolSummary: remainingTools.length ? remainingTools : undefined,
									bytes: finalBytes,
									timestamp: Date.now(),
								},
							];
						});
					}
					streamingRef.current = '';
					reasoningRef.current = '';
					setStreamingContent('');
					setIsStreaming(false);
					setIsThinking(false);
					setThinkingText('');
					setReasoningText('');
					setCliApprovalInfo(null);
					setCliInputInfo(null);
					isCliTurnRef.current = false;
					turnActiveRef.current = false;
					// Keep error tool events visible — only clear successful/done ones
					setToolEvents(prev => prev.filter(te => te.type === 'tool_complete' && te.content !== 'success' && te.content !== 'done'));
					if (isStoppingRef.current) {
						// Don't clear isStopping immediately — wait 800ms in case more events arrive.
						// If they do, delta/thinking handlers will cancel this timer.
						if (stopClearTimerRef.current) clearTimeout(stopClearTimerRef.current);
						stopClearTimerRef.current = setTimeout(() => {
							isStoppingRef.current = false;
							setIsStopping(false);
							stopClearTimerRef.current = null;
						}, 800);
					}
				} else if (event.type === 'cli_approval_pending') {
					setCliApprovalInfo(event.content ?? 'Tool approval needed — respond in your terminal');
				} else if (event.type === 'cli_approval_resolved') {
					setCliApprovalInfo(null);
				} else if (event.type === 'cli_input_pending') {
					setCliInputInfo(event.content ?? 'User input needed — respond in your terminal');
				} else if (event.type === 'cli_input_resolved') {
					setCliInputInfo(null);
				} else if (event.type === 'turn_stopping') {
					// Another client hit Stop — mirror their stopping state so our UI reflects it
					if (!isStoppingRef.current) {
						isStoppingRef.current = true;
						setIsStopping(true);
						if (stopClearTimerRef.current) { clearTimeout(stopClearTimerRef.current); stopClearTimerRef.current = null; }
						turnActiveRef.current = false;
						// Stop also abandons the queue + any ask_user prompt on the server, so
						// mirror that locally: drop queued bubbles and dismiss a pending prompt.
						setPendingInput(null);
						setMessages(prev => {
							const hasQueued = prev.some(m => m.queued);
							return hasQueued ? prev.filter(m => !m.queued) : prev;
						});
					}
				} else if (event.type === 'session_renamed') {
					// Auto-title update — keep sessions list in sync even when picker is closed
					setSessions(prev => prev.map(s => s.sessionId === event.sessionId ? { ...s, summary: event.summary ?? s.summary } : s));
					if (event.sessionId === activeSessionIdRef.current) setActiveSessionSummary((event as { summary?: string }).summary ?? null);
				} else if (event.type === 'session_context_updated') {
					setSessionContext((event as { context?: SessionContext | null }).context ?? null);
				} else if (event.type === 'squad_file_changed' && event.path) {
					setLastSquadChange({ path: event.path, changeType: event.changeType ?? 'change', timestamp: event.timestamp ?? Date.now() });
				} else if (event.type === 'error') {
					setError(event.content ?? 'Unknown error');
					setIsStreaming(false);
					setIsThinking(false);
					setIsStopping(false);
					setThinkingText('');
					setReasoningText('');
					setToolEvents([]);
					streamingRef.current = '';
					reasoningRef.current = '';
					pendingMsgRef.current = null;
					isCliTurnRef.current = false;
					setCliApprovalInfo(null);
					setCliInputInfo(null);
				} else if (event.type === 'reload') {
					// Server switched CLI mode — reload to reconnect cleanly
					window.location.reload();
				} else if (event.type === 'warning' || event.type === 'info') {
					const notificationType = event.type;
					setNotification(prev => {
						if (prev && prev.type === notificationType && prev.message === (event.content ?? '')) {
							return { ...prev, count: (prev.count ?? 1) + 1 };
						}
						return { type: notificationType, message: event.content ?? '' };
					});
					// Info messages auto-dismiss; warnings persist until next user message
					if (event.type === 'info' && !(event as { action?: unknown }).action) {
						setTimeout(() => setNotification(null), 8000);
					}
				} else if ((event as any).type === 'cli_status') {
					setCliStatus((event as any).status ?? 'disconnected');
					// After CLI reconnects, prompt user to reload for clean state
					if ((event as any).status === 'connected') {
						// Auto-reload after CLI restart to get fresh MCP state
						window.location.reload();
					}
				} else if ((event as any).type === 'mcp_servers_loaded') {
					try {
						const servers = JSON.parse((event as any).content ?? '[]') as Array<{ name: string; status: string; source?: string }>;
						setMcpServers(prev => {
							const updated = prev.map(s => {
								const match = servers.find(x => x.name === s.name);
								// Preserve existing source (e.g. 'plugin') — session event may not include it
								return match ? { ...s, enabled: match.status === 'connected', status: match.status, source: s.source !== 'unknown' ? s.source : (match.source ?? s.source) } : s;
							});
							// Add any new servers not in the list
							for (const s of servers) {
								if (!updated.find(x => x.name === s.name)) {
									updated.push({ name: s.name, type: 'unknown', source: s.source ?? 'unknown', enabled: s.status === 'connected', status: s.status });
								}
							}
							return updated;
						});
					} catch {}
				} else if ((event as any).type === 'mcp_server_status_changed') {
					try {
						const d = JSON.parse((event as any).content ?? '{}') as { serverName?: string; status?: string };
						if (d.serverName && d.status === 'needs-auth') {
							// Auto-trigger OAuth login for this server
							(async () => {
								try {
									const res = await apiFetch('/api/mcp/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverName: d.serverName, sessionId: activeSessionIdRef.current }) });
									const data = await res.json();
									if (data.authorizationUrl) {
										mcpAuthPendingRef.current.set(d.serverName!, data.authorizationUrl);
										// Show banner for all pending — Sign in opens only the first
										const showPendingBanner = () => {
											const pending = mcpAuthPendingRef.current;
											if (pending.size === 0) return;
											const names = [...pending.keys()].join(', ');
											const firstUrl = [...pending.values()][0];
											setNotification({ type: 'warning', message: `${names} need${pending.size === 1 ? 's' : ''} sign-in to connect.`, action: { label: 'Sign in', onClick: () => {
												setNotification(null);
												window.open(firstUrl, '_blank');
											} } });
										};
										showPendingBanner();
									}
								} catch {}
							})();
						}
						// Update server status in MCP list (or add if new)
						if (d.serverName && d.status) {
							setMcpServers(prev => {
								const exists = prev.find(s => s.name === d.serverName);
								if (exists) {
									return prev.map(s => s.name === d.serverName ? { ...s, enabled: d.status === 'connected', status: d.status } : s);
								}
								// New server (e.g. builtin) — add it
								return [...prev, { name: d.serverName!, type: 'unknown', source: d.serverName === 'github-mcp-server' ? 'builtin' : 'unknown', enabled: d.status === 'connected', status: d.status }];
							});
							// Remove from pending auth when server connects, re-show banner for remaining
							if (d.status === 'connected') {
								mcpAuthPendingRef.current.delete(d.serverName!);
								const pending = mcpAuthPendingRef.current;
								if (pending.size === 0) {
									setNotification(prev => prev?.type === 'warning' && prev?.message?.includes('sign-in') ? null : prev);
								} else {
									// Re-show banner for next server
									const names = [...pending.keys()].join(', ');
									const firstUrl = [...pending.values()][0];
									setNotification({ type: 'warning', message: `${names} need${pending.size === 1 ? 's' : ''} sign-in to connect.`, action: { label: 'Sign in', onClick: () => {
										setNotification(null);
										window.open(firstUrl, '_blank');
									} } });
								}
							}
						}
					} catch {}
				} else if ((event as any).type === 'mcp_tool_counts') {
					try {
						const counts = JSON.parse((event as any).content ?? '{}') as Record<string, number>;
						setMcpServers(prev => prev.map(s => {
							const count = counts[s.name];
							return count != null ? { ...s, toolCount: count } : s;
						}));
					} catch {}
				} else if ((event as any).type === 'skills_loaded') {
					try {
						const loaded = JSON.parse((event as any).content ?? '[]') as Array<{ name: string; description: string; source: string; enabled: boolean; userInvocable: boolean }>;
						setSkills(loaded);
					} catch {}
				} else if ((event as any).type === 'skill_invoked') {
					// Skill invocation — logged in console, could surface in timeline later
				} else if (event.type === 'approval_request' && event.approval) {
					setPendingApproval(event.approval);
				} else if (event.type === 'approval_resolved') {
					// Another client resolved this approval/input — dismiss it here too
					setPendingApproval(prev => prev?.requestId === event.requestId ? null : prev);
					setPendingInput(prev => prev?.requestId === event.requestId ? null : prev);
					// If another client answered an ask_user, render the Q&A here too (the
					// originating client already rendered it optimistically in respondInput).
					if (event.requestId && event.content != null && event.inputRequest && !answeredInputsRef.current.has(event.requestId)) {
						const ir = event.inputRequest;
						const answer = event.content;
						const now = Date.now();
						setMessages(prev => {
							if (prev.some(m => m.id === `input-resolved-${event.requestId}`)) return prev;
							const additions: Message[] = [];
							if (ir.question) additions.push({ id: `q-resolved-${event.requestId}`, role: 'assistant', content: ir.question, timestamp: now, questionChoices: ir.choices });
							additions.push({ id: `input-resolved-${event.requestId}`, role: 'user', content: answer, timestamp: now, askUserChoices: ir.choices });
							return [...prev, ...additions];
						});
					}
					if (event.requestId) answeredInputsRef.current.delete(event.requestId);
				} else if (event.type === 'input_request' && event.inputRequest) {
					// Only act on a NEW request (probes re-broadcast the same one)
					if (flushedInputReqRef.current !== event.inputRequest.requestId) {
						flushedInputReqRef.current = event.inputRequest.requestId;
						// An ask_user can fire mid-stream: user_input.requested arrives BEFORE
						// message_end, so streamingRef still holds uncommitted deltas. Commit them
						// as an Intermediate Message now (matching what a reload/history rebuild
						// produces) so the user's answer lands BELOW this text and the continued
						// stream starts a fresh box — instead of the answer rendering above a
						// still-live Streaming Message with post-answer deltas appended in-place.
						if (pendingMsgRef.current) {
							const msg = pendingMsgRef.current;
							pendingMsgRef.current = null;
							setMessages(prev => prev.length > 0 && prev[prev.length - 1].content === msg.content && Date.now() - prev[prev.length - 1].timestamp < 2000 ? prev : [...prev, msg]);
						}
						const pending = streamingRef.current.trim();
						if (pending) {
							const msg: Message = {
								id: `msg-${Date.now()}`,
								role: 'assistant',
								content: pending,
								reasoning: reasoningRef.current || undefined,
								// NOT intermediate: text that precedes an ask_user is user-facing
								// (a question preamble), so it gets a full Assistant bubble — matching
								// the history rebuild, which forces followedByAskUser → intermediate:false.
								intermediate: false,
								timestamp: Date.now(),
							};
							setMessages(prev => prev.length > 0 && prev[prev.length - 1].content === msg.content && Date.now() - prev[prev.length - 1].timestamp < 2000 ? prev : [...prev, msg]);
							streamingRef.current = '';
							reasoningRef.current = '';
							setStreamingContent('');
						}
					}
					// Only reset if this is a new request (probe re-broadcasts the same one)
					const inputRequest = event.inputRequest;
					setPendingInput(prev => inputRequest && prev?.requestId === inputRequest.requestId ? prev : inputRequest ?? null);
				} else if (event.type === 'rules_list') {
					setRules(event.rules ?? []);
				} else if (event.type === 'approve_all_changed') {
					setApproveAll(event.approveAll ?? false);
				}
			} catch {}
		};

		ws.onclose = (e) => {
			// Ignore close events from replaced connections
			if (wsRef.current !== ws) return;
			// Stop heartbeat
			if (heartbeatRef.current) { clearInterval(heartbeatRef.current.interval); if (heartbeatRef.current.timeout) clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current = null; }
			setConnectionState('disconnected');
			setIsStreaming(false);
			setIsThinking(false);
			if (e.code === 4404) return; // session not found — handled above, don't retry
			// Detect auth failure: fast close with no messages received suggests a bad token.
			if (!hadMsg && Date.now() - lastConnectTime.current < 5000) {
				fastFailCount.current += 1;
				if (fastFailCount.current >= 3) {
					fastFailCount.current = 0;
					// Don't assume a bad token from fast closes alone — the server may just
					// be restarting (e.g. a container image update, which briefly serves with
					// no token). Corroborate; this only clears the token if it's genuinely
					// rejected. Either way we fall through and keep reconnecting below: if it
					// was bad, the next connect() sees no token and drops to the claim screen.
					void confirmTokenInvalid();
				}
			} else {
				fastFailCount.current = 0; // reset on non-fast failures
			}
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			reconnectTimer.current = setTimeout(() => connect(), 2000);
		};

		ws.onerror = () => ws.close();
	}, []);

	useEffect(() => {
		if (noSessionRef.current || draftRef.current) {
			// Start in no-session mode — open management WS for live broadcasts
			const token = getToken();
			if (token) {
				const mgmtWs = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}?token=${token}&management=1`);
				mgmtWs.onmessage = (e) => {
					try {
						const event = JSON.parse(e.data as string) as PortalEvent;
						if (event.type === 'session_deleted') {
							setSessions(prev => prev.filter(s => s.sessionId !== event.sessionId));
						} else if (event.type === 'session_shield_changed') {
							setSessions(prev => prev.map(s => s.sessionId === event.sessionId ? { ...s, shielded: event.shielded ?? false } : s));
						} else if (event.type === 'session_created' && event.session) {
							setSessions(prev => prev.some(s => s.sessionId === event.session!.sessionId) ? prev : [event.session!, ...prev]);
						} else if (event.type === 'squad_file_changed' && event.path) {
							setLastSquadChange({ path: event.path, changeType: event.changeType ?? 'change', timestamp: event.timestamp ?? Date.now() });
						}
					} catch {}
				};
				mgmtWs.onerror = () => mgmtWs.close();
				mgmtWsRef.current = mgmtWs;
			}
		} else {
			connect();
		}
		return () => {
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			wsRef.current?.close();
			mgmtWsRef.current?.close();
			mgmtWsRef.current = null;
		};
	}, [connect]);

	// Centralised bad-token handling: any /api 401 calls invalidatePortalToken(),
	// which fires this event. Tear down sockets/timers and drop to the claim screen
	// so nothing keeps retrying with the dead token (which would trip the server ban).
	useEffect(() => {
		const onInvalid = () => {
			if (wsRef.current) { try { wsRef.current.onclose = null; wsRef.current.close(); } catch { /* ignore */ } wsRef.current = null; }
			if (mgmtWsRef.current) { try { mgmtWsRef.current.close(); } catch { /* ignore */ } mgmtWsRef.current = null; }
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			setConnectionState('no_token');
		};
		window.addEventListener('portal-token-invalid', onInvalid);
		return () => window.removeEventListener('portal-token-invalid', onInvalid);
	}, []);

	// Count seconds since entering 'connecting' state (continuously, not reset on retries)
	useEffect(() => {
		if (connectionState !== 'connecting') { setConnectingSecs(0); return; }
		const start = Date.now();
		setConnectingSecs(1); // start at 1 immediately
		const t = setInterval(() => setConnectingSecs(Math.floor((Date.now() - start) / 1000) + 1), 1000);
		return () => clearInterval(t);
	}, [connectionState]);

	// Count seconds while loading history
	useEffect(() => {
		if (!loadingHistory) { setLoadingSecs(0); return; }
		setLoadingSecs(1);
		const t = setInterval(() => setLoadingSecs(Math.floor((Date.now() - loadingHistory.startTime) / 1000) + 1), 1000);
		return () => clearInterval(t);
	}, [loadingHistory]);

	// Resume-stall detector — arms a single deadline while a URL session refuses to
	// become usable. "Usable" = history finished loading (even an empty session),
	// any message rendered, a draft is open, or we're in no-session mode. The deadline
	// is anchored to the session id (+ retry attempt) so it survives reconnect flaps
	// (the 2s onclose→connect loop) instead of resetting each cycle. When it fires we
	// flip resumeStalled → the escape-hatch overlay renders. Fully non-destructive:
	// nothing is torn down, a genuinely-slow large load keeps loading underneath.
	const STALL_MS = 20000;
	useEffect(() => {
		const sid = new URLSearchParams(window.location.search).get('session');
		const usable = historyReady || messages.length > 0 || !!draftSession || noSession;
		if (!sid || usable) {
			if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
			stallAnchorRef.current = null;
			if (resumeStalled) setResumeStalled(false);
			return;
		}
		const anchor = `${sid}:${resumeAttempt}`;
		if (stallAnchorRef.current !== anchor) {
			stallAnchorRef.current = anchor;
			if (resumeStalled) setResumeStalled(false);
			if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
			stallTimerRef.current = setTimeout(() => setResumeStalled(true), STALL_MS);
		}
		return () => {};
	}, [historyReady, messages.length, draftSession, noSession, resumeAttempt, resumeStalled]);

	// Retry the stalled resume: re-arm the stall deadline and force a fresh connect
	// to the same session (covers both a hung connect and a stuck reconnect loop).
	const retryResume = useCallback(() => {
		setResumeStalled(false);
		setHistoryReady(false);
		setResumeAttempt(n => n + 1);
		const ws = wsRef.current;
		if (ws) { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; try { ws.close(); } catch { /* ignore */ } }
		wsRef.current = null;
		if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
		setConnectionState('connecting');
		connect();
	}, [connect]);

	// Reconnect when page becomes visible/focused after being backgrounded.
	// Also sends a heartbeat ping to detect stale connections that still report OPEN.
	useEffect(() => {
		const checkConnection = () => {
			if (draftRef.current || noSessionRef.current) return;
			if (Date.now() - lastConnectTime.current < 1500) return;
			// Clear any stale heartbeat timeout — mobile browsers freeze timers while backgrounded,
			// causing old timeouts to fire immediately when the tab becomes visible.
			if (heartbeatRef.current?.timeout) { clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current.timeout = null; }
			const ws = wsRef.current;
			if (!ws) return;
			if (ws.readyState === WebSocket.OPEN) {
				// Connection looks alive — send a ping to verify. If no pong within 5s, onclose fires.
				// Also, if we're returning from a non-trivial background period, proactively ask the
				// server to replay history on this socket: a suspended-but-OPEN socket can miss live
				// events for turns run elsewhere, so no reconnect (hence no replay) would otherwise
				// fire, leaving us stale until a manual reselect/refresh. The history_end dedup adopts
				// only changed/longer history, so this is a cheap no-op when nothing changed.
				const wasHiddenMs = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
				hiddenAtRef.current = 0;
				try {
					ws.send('{"type":"ping"}');
					if (wasHiddenMs > 3000) ws.send('{"type":"resync"}');
				} catch { /* dead socket — fall through to the close timeout below → reconnect+replay */ }
				if (heartbeatRef.current) {
					heartbeatRef.current.timeout = setTimeout(() => ws.close(), 5000);
				}
				return;
			}
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			// If a connection is already in progress, don't interfere
			if (ws.readyState === WebSocket.CONNECTING) return;
			connect();
		};
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') { hiddenAtRef.current = Date.now(); return; }
			checkConnection();
		};
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('focus', checkConnection);
		window.addEventListener('pageshow', checkConnection);
		// Retry every 2s if still not connected — iOS needs ~3 attempts before succeeding.
		// Skip if already CONNECTING to avoid cycling through open/close/open rapidly.
		const retryInterval = setInterval(() => {
			if (draftRef.current || noSessionRef.current) return;
			const state = wsRef.current?.readyState;
			if (state !== WebSocket.OPEN && state !== WebSocket.CONNECTING) connect();
		}, 2000);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('focus', checkConnection);
			window.removeEventListener('pageshow', checkConnection);
			clearInterval(retryInterval);
		};
	}, [connect]);

	useEffect(() => {
		if (stickToBottomRef.current) {
			const el = chatScrollRef.current;
			if (el) {
				// Instant (not smooth) pin: smooth animation fires intermediate onScroll
				// events BELOW the target, which direction detection misreads as a user
				// scroll-up and disengages mid-animation. Instant lands at the clamped max
				// in one step. Record the ACTUAL resulting scrollTop (clamped to
				// scrollHeight - clientHeight) so the follow-up onScroll sees top === prev.
				el.scrollTop = el.scrollHeight;
				lastScrollTopRef.current = el.scrollTop;
			}
		}
	}, [messages, streamingContent, toolEvents, isThinking, notification, pendingInput, pendingApproval]);

	const openPicker = useCallback(async () => {
		try {
			const res = await apiFetch('/api/sessions');
			const data = await res.json() as SessionInfo[];
			setSessions(data);
			// Sync active session summary from fresh data
			const active = data.find(s => s.sessionId === activeSessionIdRef.current);
			if (active) setActiveSessionSummary(active.summary ?? null);
			setShowPicker(true);
		} catch {
			setError('Could not load sessions');
		}
	}, []);

	const switchSession = useCallback((sessionId: string) => {
		noSessionRef.current = false;
		setNoSession(false);
		setShowPicker(false);
		// Clear draft mode if switching to an existing session
		draftRef.current = false;
		setDraftSession(null);
		setMessages([]);
		setStreamingContent('');
		setIsStreaming(false);
		setIsThinking(false);
		setPendingApproval(null);
		setCliApprovalInfo(null);
		setCliInputInfo(null);
		setActiveModel(null);
		setSessionContext(null);
		setActiveSessionSummary(null);
		setSessionUsage(null);
		setSessionQuota(null);
		setContextUsage(null);
		setPendingInput(null);
		// Load the theme for the new session
		loadSessionTheme(sessionId);
		const params = new URLSearchParams(window.location.search);
		params.set('session', sessionId);
		params.delete('all');
		params.delete('history');
		window.history.replaceState(null, '', `?${params.toString()}`);
		// Close existing WS — onclose will trigger reconnect with new session
		const ws = wsRef.current;
		if (ws) { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; ws.close(); }
		wsRef.current = null;
		if (heartbeatRef.current) { clearInterval(heartbeatRef.current.interval); if (heartbeatRef.current.timeout) clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current = null; }
		connect();
	}, [connect, loadSessionTheme]);

	const newSession = useCallback(async () => {
		setShowPicker(false);
		// Disconnect existing WS — draft mode has no active session
		const ws = wsRef.current;
		if (ws) { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; ws.close(); }
		wsRef.current = null;
		if (heartbeatRef.current) { clearInterval(heartbeatRef.current.interval); if (heartbeatRef.current.timeout) clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current = null; }
		// Enter draft mode — session is created when user sends first message or clicks Create
		draftRef.current = true;
		setDraftSession({ cwd: '' });
		setMessages([]);
		setStreamingContent('');
		setIsStreaming(false);
		setIsThinking(false);
		setPendingApproval(null);
		setCliApprovalInfo(null);
		setCliInputInfo(null);
		setActiveModel(null);
		setSessionContext(null);
		setActiveSessionSummary(null);
		setSessionUsage(null);
		setSessionQuota(null);
		setContextUsage(null);
		setActiveSessionId(null);
		setPendingInput(null);
		noSessionRef.current = false;
		setNoSession(false);
		setDrawerOpen(true);
		// Clear URL session param
		const params = new URLSearchParams(window.location.search);
		params.delete('session');
		window.history.replaceState(null, '', `?${params.toString()}`);
	}, [portalInfo?.defaultCwd]);

	/** Actually create the session from draft config and navigate to it. */
	const createDraftSession = useCallback(async (firstPrompt?: string) => {
		if (!draftSession) return;
		try {
			const body: Record<string, string> = {};
			if (draftSession.cwd.trim()) body.workingDirectory = draftSession.cwd.trim();
			const res = await apiFetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			const { sessionId } = await res.json() as { sessionId: string };
			setDraftSession(null);
			draftRef.current = false;
			noSessionRef.current = false;
			setNoSession(false);
			const params = new URLSearchParams(window.location.search);
			params.set('session', sessionId);
			if (firstPrompt) {
				sessionStorage.setItem('portal_pending_prompt', firstPrompt);
			}
			// Store CWD so the new page load can show it immediately (SDK metadata takes time)
			if (draftSession.cwd.trim()) {
				sessionStorage.setItem('portal_pending_cwd', draftSession.cwd.trim());
			}
			// Store selected model so it survives the page reload
			if (activeModel) {
				sessionStorage.setItem('portal_pending_model', activeModel);
			}
			window.location.search = params.toString();
		} catch {
			setError('Could not create session');
		}
	}, [draftSession, activeModel]);

	const changeModel = useCallback((modelId: string) => {
		setActiveModel(modelId);
		wsRef.current?.send(JSON.stringify({ type: 'set_model', content: modelId }));
	}, []);

	const applyUpdates = useCallback(async () => {
		setUpdateStatus(prev => prev ? { ...prev, applying: true, error: null } : prev);
		// Fire the apply request — don't await it (npm install can take minutes)
		apiFetch('/api/updates/apply', { method: 'POST' }).catch(() => {});
		// Poll for completion
		const poll = setInterval(async () => {
			try {
				const res = await apiFetch('/api/updates');
				const status = await res.json() as UpdateStatus;
				if (!status.applying) {
					clearInterval(poll);
					setUpdateStatus({ ...status, restartNeeded: true });
				}
			} catch { /* server busy */ }
		}, 3000);
	}, []);

	const restartServer = useCallback(async (force = false) => {
		try {
			const res = await apiFetch('/api/restart', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ force }),
			});
			if (res.status === 409) {
				const data = await res.json() as { activeSessions?: string[]; updateInProgress?: boolean; message?: string };
				// An update is mid-flight — restarting now would corrupt the install.
				// Don't offer a force option; just tell the user to wait.
				if (data.updateInProgress) {
					setNotification({ type: 'warning', message: data.message ?? 'An update is being applied. Wait for it to finish before restarting.' });
					return;
				}
				const ids = data.activeSessions?.join(', ') ?? 'unknown';
				if (confirm(`Active turns in progress (${ids}). Force restart anyway?`)) {
					restartServer(true);
				} else {
					// User backed out — clear any "Restarting…" bar a caller set optimistically.
					setNotification(null);
				}
				return;
			}
			// Server will restart — our WebSocket reconnect logic handles the rest
		} catch { /* expected — server is shutting down */ }
	}, []);

	const logoutGitHub = useCallback(async () => {
		try {
			const res = await apiFetch('/api/auth/logout', { method: 'POST' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({})) as { error?: string };
				setNotification({ type: 'warning', message: data.error ?? 'Could not sign out.' });
				return;
			}
			setNotification({ type: 'info', message: 'Signing out of GitHub… the portal will return to the sign-in screen.' });
			// Server exits 76 → launcher restarts → auth-watcher reconnects to the
			// sign-in screen and reloads once authenticated again.
		} catch {
			setNotification({ type: 'warning', message: 'Could not sign out.' });
		}
	}, []);

	const removePortalToken = useCallback(async () => {
		try {
			const res = await apiFetch('/api/portal-token', { method: 'DELETE' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({})) as { error?: string };
				setNotification({ type: 'warning', message: data.error === 'env_managed'
					? 'The session token is pinned via PORTAL_TOKEN — change that env var and restart to rotate it.'
					: (data.error ?? 'Could not remove the session token.') });
				return;
			}
			// Token is gone: drop our copy and bounce to the claim screen.
			localStorage.removeItem('portal_token');
			const params = new URLSearchParams(window.location.search);
			params.delete('token');
			window.location.search = params.toString();
		} catch {
			setNotification({ type: 'warning', message: 'Could not remove the session token.' });
		}
	}, []);

	const restartCli = useCallback(async () => {
		try {
			const res = await apiFetch('/api/restart-cli', { method: 'POST' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
				setNotification({ type: 'warning', message: data.message ?? data.error ?? 'Could not restart the Copilot server.' });
				return;
			}
			setNotification({ type: 'info', message: 'Restarting Copilot server…' });
			// cli_status events drive reconnect/reload
		} catch {
			setNotification({ type: 'warning', message: 'Could not restart the Copilot server.' });
		}
	}, []);

	const toggleShield = useCallback(async (sessionId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setSessions(prev => prev.map(s => s.sessionId === sessionId ? { ...s, shielded: !s.shielded } : s));
		try {
			await apiFetch(`/api/sessions/${sessionId}/shield`, { method: 'PATCH' });
		} catch {
			// revert on error
			setSessions(prev => prev.map(s => s.sessionId === sessionId ? { ...s, shielded: !s.shielded } : s));
		}
	}, []);

	const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const wasActive = sessionId === activeSessionId;
		try {
			const res = await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
			if (!res.ok) { setError('Could not delete session'); return; }
			setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
			setConfirmDeleteId(null);
			if (wasActive) enterNoSession();
		} catch {
			setError('Could not delete session');
		}
	}, [activeSessionId, enterNoSession]);

	const renameSession = useCallback(async (sessionId: string, name: string) => {
		const trimmed = name.trim().slice(0, 100);
		setRenamingId(null);
		if (!trimmed) return;
		// Optimistic update; the session_renamed broadcast will confirm it.
		setSessions(prev => prev.map(s => s.sessionId === sessionId ? { ...s, summary: trimmed } : s));
		try {
			const res = await apiFetch(`/api/sessions/${sessionId}/name`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: trimmed }),
			});
			if (!res.ok) setError('Could not rename session');
		} catch {
			setError('Could not rename session');
		}
	}, []);

	const respondApproval = useCallback((approved: boolean) => {
		if (!pendingApproval) return;
		wsRef.current?.send(JSON.stringify({ type: 'approval_response', requestId: pendingApproval.requestId, approved }));
		setPendingApproval(null);
	}, [pendingApproval]);

	const respondApprovalAlways = useCallback(() => {
		if (!pendingApproval?.alwaysPattern) return;
		wsRef.current?.send(JSON.stringify({
			type: 'approval_response_always',
			requestId: pendingApproval.requestId,
			kind: pendingApproval.action,
			pattern: pendingApproval.alwaysPattern,
		}));
		setPendingApproval(null);
	}, [pendingApproval]);

	const deleteRule = useCallback((ruleId: string) => {
		wsRef.current?.send(JSON.stringify({ type: 'rule_delete', ruleId }));
	}, []);

	const clearAllRules = useCallback(() => {
		wsRef.current?.send(JSON.stringify({ type: 'rules_clear' }));
	}, []);

	const toggleApproveAll = useCallback(() => {
		const next = !approveAll;
		setApproveAll(next);
		wsRef.current?.send(JSON.stringify({ type: 'set_approve_all', approveAll: next }));
	}, [approveAll]);

	const respondInput = useCallback((answer: string, wasFreeform: boolean) => {
		if (!pendingInput) return;
		answeredInputsRef.current.add(pendingInput.requestId);
		wsRef.current?.send(JSON.stringify({ type: 'input_response', requestId: pendingInput.requestId, answer, wasFreeform }));
		// Show the question as an assistant message, then the user's answer
		if (pendingInput.question) {
			setMessages(prev => [...prev, {
				id: `q-${Date.now()}`,
				role: 'assistant',
				content: pendingInput.question,
				timestamp: Date.now(),
				questionChoices: pendingInput.choices,
			}]);
		}
		setMessages(prev => [...prev, {
			id: `input-${Date.now()}`,
			role: 'user',
			content: answer,
			timestamp: Date.now(),
			askUserChoices: pendingInput.choices,
		}]);
		setPendingInput(null);
		setInput('');
		setShowPromptsTray(false);
	}, [pendingInput]);

	const removeSessionPrompt = (label: string) => {
		setSessionPrompts(prev => {
			const updated = prev.filter(p => p.label !== label);
			const sid = activeSessionIdRef.current;
			if (sid) {
				sessionPromptsRef.current.set(sid, updated);
				apiFetch(`/api/session-prompts/${encodeURIComponent(sid)}`, {
					method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompts: updated }),
				}).catch(() => {});
			}
			return updated;
		});
	};

	const clearSessionPrompts = () => {
		setSessionPrompts([]);
		setShowPromptsTray(false);
		const sid = activeSessionIdRef.current;
		if (sid) {
			sessionPromptsRef.current.set(sid, []);
			apiFetch(`/api/session-prompts/${encodeURIComponent(sid)}`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompts: [] }),
			}).catch(() => {});
		}
	};

	const hasUnsavedEdits = () => !!editingGuide || (showNewGuide && examplePreview && (examplePreview.guide || examplePreview.prompts));
	const guardDiscard = (action: () => void) => {
		if (hasUnsavedEdits()) { setPendingDiscard(() => action); } else { action(); }
	};

	const doAddGuide = async () => {
		if (!newGuideName || !examplePreview) return;
		try {
			if (newGuideCheck && examplePreview.guide) {
				await apiFetch('/api/guides', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: newGuideName, content: examplePreview.guide }),
				});
			}
			if (newPromptsCheck && examplePreview.prompts) {
				await apiFetch('/api/prompts', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: newGuideName, content: examplePreview.prompts }),
				});
			}
			setShowNewGuide(false);
			setConfirmOverwrite(false);
			setRecentlyAdded(new Set([newGuideName]));
			setTimeout(() => setRecentlyAdded(new Set()), 3000);
			apiFetch('/api/guides').then(r => r.json()).then(setGuides).catch(() => {});
		} catch (e) {
			setError(`Failed to create: ${e}`);
		}
	};

	const loadPromptsForGuide = async (instId: string) => {
		try {
			const pRes = await apiFetch(`/api/guides/${encodeURIComponent(instId)}/prompts`);
			const { prompts: newPrompts } = await pRes.json() as { prompts: Array<{ label: string; text: string }> };
			if (newPrompts.length > 0) {
				setSessionPrompts(prev => {
					const merged = [...prev];
					let replaced = 0;
					for (const p of newPrompts) {
						const idx = merged.findIndex(m => m.label === p.label);
						if (idx >= 0) { merged[idx] = p; replaced++; } else merged.push(p);
					}
					const sid = activeSessionIdRef.current;
					if (sid) {
						sessionPromptsRef.current.set(sid, merged);
						apiFetch(`/api/session-prompts/${encodeURIComponent(sid)}`, {
							method: 'POST', headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ prompts: merged }),
						}).catch(() => {});
					}
					const msg = replaced > 0
						? `Loaded ${newPrompts.length} prompt${newPrompts.length !== 1 ? 's' : ''} (${replaced} replaced)`
						: `Loaded ${newPrompts.length} prompt${newPrompts.length !== 1 ? 's' : ''}`;
					setTimeout(() => {
						setNotification({ type: 'info', message: msg });
						setTimeout(() => setNotification(null), 4000);
					}, 0);
					return merged;
				});
			}
		} catch { /* prompts are optional */ }
	};

	const addImageFiles = useCallback((files: FileList | File[]) => {
		for (const file of files) {
			if (!file.type.startsWith('image/')) continue;
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result as string;
				const base64 = dataUrl.split(',')[1];
				const name = file.name || `image-${Date.now()}.${file.type.split('/')[1]}`;
				setPendingImages(prev => [...prev, { data: base64, mimeType: file.type, name }]);
			};
			reader.readAsDataURL(file);
		}
	}, []);

	const sendPrompt = () => {
		const prompt = input.trim();
		if (!prompt && pendingImages.length === 0) return;
		// Draft mode: create session first, then send after reload
		if (draftSession) {
			setInput('');
			createDraftSession(prompt);
			return;
		}
		if (connectionState !== 'connected') return;
		// Guard against a stale/closed socket whose onclose hasn't fired yet — e.g. the
		// server was just [r]estarted, or a mobile browser silently dropped the socket
		// while backgrounded. React's connectionState can still read 'connected' for a
		// beat after the underlying socket is CLOSING/CLOSED. Calling send() on a
		// non-OPEN socket throws, but by then we've already added the "pushing" bubble
		// and cleared the input — so the message is lost and the bubble is stranded
		// forever (the exact restart/resume stuck-send, which a manual refresh "fixes").
		// Instead, kick a reconnect and ask the user to resend; never strand the bubble.
		const sock = wsRef.current;
		if (!sock || sock.readyState !== WebSocket.OPEN) {
			setConnectionState('connecting');
			connect();
			setNotification({ type: 'warning', message: 'Reconnecting — please send your message again.' });
			return;
		}
		stickToBottomRef.current = true;
		setMessages((prev) => [
			...prev,
			{ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now(), queued: true, images: pendingImages.length > 0 ? pendingImages.map(img => `data:${img.mimeType};base64,${img.data}`) : undefined },
		]);
		setToolEvents([]);
		intentionMapRef.current.clear();
		setError(null);
		setNotification(null);
		setInput('');
		setShowPromptsTray(false);
		setIsThinking(true);
		setThinkingText('');
		setReasoningText('');
		reasoningRef.current = '';
		const attachments = pendingImages.length > 0
			? pendingImages.map(img => ({ type: 'blob' as const, data: img.data, mimeType: img.mimeType, displayName: img.name }))
			: undefined;
		setPendingImages([]);
		sock.send(JSON.stringify({ type: 'prompt', content: prompt, attachments }));
	};

	const stopAgent = () => {
		wsRef.current?.send(JSON.stringify({ type: 'stop' }));
		// Set locally for instant feedback — server will also broadcast turn_stopping
		// to sync other connected clients. The turn_stopping handler guards against
		// the echo coming back.
		isStoppingRef.current = true;
		setIsStopping(true);
		if (stopClearTimerRef.current) { clearTimeout(stopClearTimerRef.current); stopClearTimerRef.current = null; }
		turnActiveRef.current = false;
		// Stopping during an ask_user abandons the question (like Esc+Esc in the CLI).
		setPendingInput(null);
		// Stop abandons the queue. Queued bubbles are pending items that were never
		// committed to history (Copilot's queue is cleared server-side on abort), so
		// remove them entirely rather than leaving them as if they were sent.
		setMessages(prev => {
			const hasQueued = prev.some(m => m.queued);
			return hasQueued ? prev.filter(m => !m.queued) : prev;
		});
	};

	// Send/Stop cluster layout model (unified across normal turns + ask_user):
	//  - idle (no stop available): Send fills the 44px slot.
	//  - stop available + empty composer: the compact diagonal overlap, Stop prominent.
	//  - stop available + composer filled: the two actions split into a vertical stack
	//    (Stop on top, Send below) so each is a clear, separated thumb target. This is
	//    the only genuinely hazardous state — both Stop (kills turn+queue) and Send
	//    (queues a follow-up) are live at once — so it's the only one we un-overlap.
	const answerFreeform = !!pendingInput && (pendingInput.allowFreeform !== false || !pendingInput.choices?.length);
	const composerFilled = input.trim().length > 0 || pendingImages.length > 0;
	const stopAvailable = isAgentActive || answerFreeform;
	const stackButtons = stopAvailable && composerFilled;

	// Auto-resize textarea to fit content (up to maxHeight). When the Send/Stop
	// buttons stack, the composer opens up to ~96px — we raise the textarea's floor
	// to match so there's no dead space above the cursor. At the resting single-line
	// size we clear the explicit height entirely and let min-height:44 govern, so a
	// freshly-loaded (untouched) box and a typed box render at exactly the same height
	// — pinning an explicit "44px" can differ from the natural min-height render by a
	// sub-pixel and made the box look slightly shorter after the first keystroke.
	useEffect(() => {
		const ta = textareaRef.current;
		if (!ta) return;
		ta.style.height = 'auto';
		const floor = stackButtons ? 96 : 44;
		const needed = Math.max(ta.scrollHeight, floor);
		ta.style.height = needed > 44 ? `${needed}px` : '';
	}, [input, stackButtons]);

	// Focus the composer when an ask_user prompt opens with a freeform answer.
	useEffect(() => {
		if (pendingInput && (pendingInput.allowFreeform !== false || !pendingInput.choices?.length)) {
			textareaRef.current?.focus();
		}
	}, [pendingInput]);

	// Dismiss prompts tray on click outside
	useEffect(() => {
		if (!showPromptsTray) return;
		const handler = (e: MouseEvent) => {
			if (inputContainerRef.current && !inputContainerRef.current.contains(e.target as Node)) {
				setShowPromptsTray(false);
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [showPromptsTray]);

	if (connectionState === 'no_token') {
		const Spin = () => (
			<svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
				<circle cx="12" cy="12" r="10" stroke="var(--border)" strokeWidth="4" />
				<path d="M12 2a10 10 0 0 1 10 10" stroke="var(--primary-contrast)" strokeWidth="4" strokeLinecap="round" />
			</svg>
		);
		return (
			<div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
				<div className="w-full max-w-sm rounded-xl p-8" style={{ background: 'var(--surface)' }}>
					<div className="mb-5 flex items-center justify-center gap-2">
						<PortalLogo className="size-9" />
						<span className="text-lg font-semibold">Copilot Portal</span>
					</div>
					{ptStatus === 'loading' ? (
						<div className="flex flex-col items-center gap-3">
							<Spin />
							<p className="text-sm" style={{ color: 'var(--text-muted)' }}>Checking this portal…</p>
						</div>
					) : ptGenerated ? (
						<div className="flex flex-col gap-4 text-left">
							<h1 className="text-center text-xl font-semibold">Save your session token</h1>
							<p className="text-sm" style={{ color: 'var(--text-muted)' }}>
								Make sure to copy your session token now. <strong>You won't be able to see it again.</strong> You'll need it to open this portal from any browser.
							</p>
							<div className="flex flex-col gap-2 rounded-lg px-3 py-2.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
								<code className="block w-full break-all text-center font-mono text-sm leading-snug" style={{ color: 'var(--text)' }}>{ptGenerated}</code>
								<button onClick={copyPortalToken} className="inline-flex shrink-0 items-center justify-center gap-1 self-center rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}>
									{ptCopied ? (
										<><svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>Copied</>
									) : 'Copy'}
								</button>
							</div>
							<button onClick={() => applyPortalToken(ptGenerated)} className="rounded-lg px-5 py-2.5 text-sm font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}>
								I've saved it — open the portal
							</button>
						</div>
					) : ptStatus === 'create' ? (
						<div className="flex flex-col gap-4">
							<h1 className="text-xl font-semibold">Claim this portal</h1>
							<p className="text-sm" style={{ color: 'var(--text-muted)' }}>
								This portal isn't protected yet. Generate a session token to lock it to you — you'll need it whenever you open the portal in a new browser.
							</p>
							<button onClick={generatePortalToken} disabled={ptBusy} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}>
								{ptBusy ? <Spin /> : null}
								{ptBusy ? 'Generating…' : 'Generate session token'}
							</button>
							{ptError ? <p className="text-xs" style={{ color: 'var(--danger, #f87171)' }}>{ptError}</p> : null}
						</div>
					) : (
						<div className="flex flex-col gap-4">
							<h1 className="text-xl font-semibold">Session token required</h1>
							<p className="text-sm" style={{ color: 'var(--text-muted)' }}>
								Enter the portal session token to continue.
							</p>
							<input
								type="password"
								value={ptInput}
								onChange={(e) => setPtInput(e.target.value)}
								onKeyDown={(e) => { if (e.key === 'Enter' && !ptBusy) submitPortalToken(); }}
								placeholder="Session token"
								autoComplete="off"
								spellCheck={false}
								className="w-full rounded-lg px-3 py-2 text-center font-mono text-sm outline-none"
								style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
							/>
							<button onClick={submitPortalToken} disabled={ptBusy || !ptInput.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}>
								{ptBusy ? <Spin /> : null}
								{ptBusy ? 'Checking…' : 'Open portal'}
							</button>
							{ptError ? <p className="text-xs" style={{ color: 'var(--danger, #f87171)' }}>{ptError}</p> : null}
							{!ptEnvManaged ? (
								<p className="text-xs" style={{ color: 'var(--text-muted)' }}>
									Lost your token? Reset it from the host (set <code>PORTAL_TOKEN</code> or remove <code>data/token.txt</code>).
								</p>
							) : null}
						</div>
					)}
				</div>
			</div>
		);
	}

	// M2 first-run sign-in screen. Shown whenever the CLI has no valid GitHub
	// credentials (and during the brief restart right after a successful sign-in).
	if (authState === 'needs-auth' || authState === 'error' || (authState === 'starting' && authWasNonOk.current)) {
		const restarting = authState === 'starting';
		const Spinner = () => (
			<svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
				<circle cx="12" cy="12" r="10" stroke="var(--border)" strokeWidth="4" />
				<path d="M12 2a10 10 0 0 1 10 10" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
			</svg>
		);
		return (
			<div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
				<div className="w-full max-w-md rounded-2xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
					<div className="mb-4 flex items-center justify-center">
						<svg width="40" height="40" viewBox="0 0 16 16" fill="var(--text)" aria-hidden>
							<path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
						</svg>
					</div>
					<h1 className="mb-2 text-xl font-semibold">Sign in to GitHub Copilot</h1>

					{restarting ? (
						<div className="mt-6 flex flex-col items-center gap-3">
							<Spinner />
							<p className="text-sm" style={{ color: 'var(--text-muted)' }}>Signed in — restarting Copilot…</p>
						</div>
					) : authDevice ? (
						<div className="mt-4 flex flex-col items-center gap-4">
							<p className="text-sm" style={{ color: 'var(--text-muted)' }}>
								Open the link below — your code is pre-filled. Just confirm and authorize.
							</p>
							<div
								className="select-all rounded-lg px-5 py-3 font-mono text-2xl font-bold tracking-[0.3em]"
								style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
							>
								{authDevice.code}
							</div>
							<a
								href={`${authDevice.verificationUri}${authDevice.verificationUri.includes('?') ? '&' : '?'}user_code=${encodeURIComponent(authDevice.code)}`}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
								style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
							>
								Open github.com/login/device
								<svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
									<path d="M15 3h6v6" />
									<path d="M10 14 21 3" />
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
								</svg>
							</a>
							<div className="mt-1 flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
								<Spinner /> Waiting for authorization…
							</div>
							<button onClick={cancelLogin} className="mt-1 text-xs underline" style={{ color: 'var(--text-muted)' }}>
								Cancel
							</button>
						</div>
					) : (
						<div className="mt-4 flex flex-col gap-4">
							{/* Tabs: Device sign-in (default) vs Access token */}
							<div className="flex gap-1 self-center rounded-lg p-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
								{([['device', 'Device sign-in'], ['token', 'Access token']] as const).map(([id, label]) => (
									<button
										key={id}
										onClick={() => { setAuthTab(id); setAuthMessage(null); }}
										className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
										style={authTab === id
											? { background: 'var(--primary)', color: 'var(--primary-contrast)' }
											: { background: 'transparent', color: 'var(--text-muted)' }}
									>
										{label}
									</button>
								))}
							</div>

							{authTab === 'device' ? (
								<div className="flex flex-col items-center gap-4">
									<p className="text-sm" style={{ color: 'var(--text-muted)' }}>
										This portal needs to connect to your GitHub Copilot account before you can start chatting.
									</p>
									<button
										onClick={startLogin}
										disabled={authBusy}
										className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60"
										style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
									>
										{authBusy ? <Spinner /> : null}
										{authBusy ? 'Starting…' : 'Sign in with GitHub'}
									</button>
									<p className="text-xs" style={{ color: 'var(--text-muted)' }}>
										You'll get a one-time code to confirm in your browser. Recommended.
									</p>
								</div>
							) : (
								<div className="flex flex-col gap-3 text-left">
									<p className="text-sm" style={{ color: 'var(--text-muted)' }}>
										Paste a <strong>fine-grained personal access token</strong> with the
										{' '}<strong>Copilot Requests</strong> permission. Good for headless or
										automated setups.
									</p>
									<input
										type="password"
										value={authToken}
										onChange={(e) => setAuthToken(e.target.value)}
										onKeyDown={(e) => { if (e.key === 'Enter' && !authBusy) submitToken(); }}
										placeholder="github_pat_…"
										autoComplete="off"
										spellCheck={false}
										className="w-full rounded-lg px-3 py-2 font-mono text-sm outline-none"
										style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
									/>
									<button
										onClick={submitToken}
										disabled={authBusy || !authToken.trim()}
										className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60"
										style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
									>
										{authBusy ? <Spinner /> : null}
										{authBusy ? 'Saving…' : 'Save token & sign in'}
									</button>
									<div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
										<a
											href="https://github.com/settings/personal-access-tokens/new"
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 font-medium"
											style={{ color: 'var(--accent)' }}
										>
											Create a token
											<svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
												<path d="M15 3h6v6" />
												<path d="M10 14 21 3" />
												<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
											</svg>
										</a>
										<ul className="mt-1.5 list-disc space-y-0.5 pl-4">
											<li>Resource owner: your <strong>personal account</strong> (not an org)</li>
											<li>Permissions → Account → <strong>Copilot Requests</strong></li>
											<li>Repository access: whatever suits you</li>
										</ul>
										<p className="mt-1.5">Classic <code>ghp_</code> tokens aren't supported. Stored locally on this server.</p>
									</div>
								</div>
							)}
						</div>
					)}

					{authMessage && !restarting && (
						<p className="mt-5 text-xs" style={{ color: authState === 'error' ? 'var(--danger, #e5534b)' : 'var(--text-muted)' }}>
							{authMessage}
						</p>
					)}
				</div>
			</div>
		);
	}

	// Ask-mode (ask_user) derived flags — used to retune the composer + Send/Stop cluster.
	// freeformMode: the main composer doubles as the answer box (typed answers allowed).
	// pureChoiceMode: only predefined choices, no composer — choices send immediately.
	const pureChoiceMode = !!pendingInput && !answerFreeform;

	return (
		<div className="flex flex-col" style={{ height: '100%' }}>
			{/* Resume-stall escape hatch — the session in the URL won't open (CLI crash,
			    hung resume, or a genuinely huge history still loading). Rather than leave
			    the shell empty forever (the mobile "black screen"), offer a way out. */}
			{resumeStalled && (
				<div
					className="fixed inset-0 z-[70] flex items-center justify-center px-6"
					style={{ background: 'var(--overlay)' }}
				>
					<div
						className="w-full max-w-sm rounded-2xl p-6 text-center"
						style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
					>
						<PortalLogo className="mx-auto mb-4 block size-14" />
						<h2 className="mb-2 text-base font-semibold">Still trying to open this session…</h2>
						<p className="mb-1 text-sm" style={{ color: 'var(--text-muted)' }}>
							This is taking longer than usual. A very large session can just be slow to
							load, or the session may have stopped responding.
						</p>
						<p className="mb-5 text-xs" style={{ color: 'var(--text-muted)' }}>
							{loadingHistory
								? `Loading history… ${loadingSecs}s (${loadingHistory.sizeMB} MB)`
								: connectionState === 'connecting'
									? `Connecting… ${connectingSecs}s`
									: 'Waiting for the session to respond…'}
						</p>
						<div className="flex flex-col gap-2">
							<button
								type="button"
								className="w-full rounded-lg px-4 py-2.5 text-sm font-medium"
								style={{ background: 'var(--accent)', color: 'var(--accent-fg, #fff)' }}
								onClick={() => { setResumeStalled(false); enterNoSession(); }}
							>
								Back to sessions
							</button>
							<button
								type="button"
								className="w-full rounded-lg px-4 py-2.5 text-sm font-medium"
								style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
								onClick={retryResume}
							>
								Retry
							</button>
						</div>
					</div>
				</div>
			)}

			{/* QR Code Modal */}
			{showQR && (
				<div
					className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-14 pb-4"
					style={{ background: 'var(--overlay)' }}
					onClick={() => setShowQR(false)}
				>
					<div
						className="flex flex-col items-center gap-4 rounded-2xl p-6"
						style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
						onClick={(e) => e.stopPropagation()}
					>
						<h2 className="font-semibold">Open on another device</h2>
						{(() => {
							// Prefer the address this browser actually used (correct for
							// containers, reverse proxies, Tailscale, HTTPS hostnames). Only
							// when we're on localhost (e.g. desktop [L]aunch) fall back to the
							// server's LAN URL, since a phone can't reach "localhost".
							const loc = window.location;
							const onLocalhost = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
							const tok = getToken() ?? '';
							const shareUrl = onLocalhost && portalInfo?.lanUrl
								? portalInfo.lanUrl
								: `${loc.origin}/${tok ? `?token=${tok}` : ''}`;
							return (
								<>
									<div className="rounded-xl p-3" style={{ background: 'white' }}>
										<QRCodeSVG value={shareUrl} size={220} />
									</div>
									<code className="max-w-xs break-all text-center font-mono text-xs" style={{ color: 'var(--text)' }}>{shareUrl}</code>
									<p className="max-w-xs text-center text-xs" style={{ color: 'var(--text-muted)' }}>
										Scan the code or open this URL on your phone or tablet — it includes the session token.
									</p>
								</>
							);
						})()}
					</div>
				</div>
			)}

			<SquadPanel open={squadPanelOpen} onClose={() => setSquadPanelOpen(false)} lastChange={lastSquadChange} />

			{/* Guides Picker */}
			{showGuides && (
				<div
					className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-14 pb-4"
					style={{ background: 'var(--overlay)' }}
					onClick={() => guardDiscard(() => { setShowGuides(false); setViewingGuide(null); setConfirmDeleteGuide(null); setEditingGuide(null); setEditingName(null); setShowNewGuide(false); setPendingDiscard(null); })}
				>
					<div
						className={`w-full rounded-2xl p-4 transition-all duration-200 ${viewingGuide || showNewGuide ? 'max-w-2xl' : 'max-w-md'}`}
						style={{ background: 'var(--surface)', border: '1px solid var(--border)', height: viewingGuide || showNewGuide ? 'calc(100vh - 6rem)' : undefined, maxHeight: 'calc(100vh - 6rem)', display: 'flex', flexDirection: 'column' as const }}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="mb-3 flex items-center justify-between">
							<h2 className="font-semibold">Guides and Prompts</h2>
							{!viewingGuide && !showNewGuide && (
								<button
									type="button"
									className="rounded-lg px-3 py-1.5 text-sm font-medium"
									style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
									onClick={() => {
										setShowNewGuide(true);
										setSelectedExample('');
										setExamplePreview({ guide: '# my-new-guide\n\n', prompts: '# my-new-guide Prompts\n\n## Example Prompt\nDescribe what you want here\n' });
										setNewGuideName('');
										setNewGuideCheck(true);
										setNewPromptsCheck(true);
										apiFetch('/api/examples').then(r => r.json()).then(setExamples).catch(() => {});
									}}
								>+ New</button>
							)}
						</div>
						{showNewGuide ? (
							<div>
								<div className="mb-3">
									<label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Start from</label>
									<select
										className="w-full rounded-lg px-3 py-2 text-sm"
										style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
										value={selectedExample}
										onChange={async (e) => {
											const id = e.target.value;
											setSelectedExample(id);
											setImportItems([]);
											setImportPreviewItem(null);
											setImportError(null);
											setImportUrl('');
											if (id === '__import__') {
												setExamplePreview(null);
												setNewGuideName('');
												return;
											}
											if (!id) {
												setExamplePreview({ guide: '# my-new-guide\n\n', prompts: '# my-new-guide Prompts\n\n## Example Prompt\nDescribe what you want here\n' });
												setNewGuideName('');
												setNewGuideCheck(true);
												setNewPromptsCheck(true);
												return;
											}
											setNewGuideName(id);
											try {
												const [gRes, pRes] = await Promise.all([
													apiFetch(`/api/examples/${encodeURIComponent(id)}`).then(r => r.json()),
													apiFetch(`/api/examples/${encodeURIComponent(id)}/prompts`).then(r => r.json()),
												]);
												setExamplePreview({ guide: gRes.content ?? '', prompts: pRes.content ?? '' });
												const ex = examples.find(e => e.id === id);
												setNewGuideCheck(!!ex?.hasGuide);
												setNewPromptsCheck(!!ex?.hasPrompts);
											} catch { setExamplePreview(null); }
										}}
									>
										<option value="">Blank (start from scratch)</option>
										<option value="__import__">Import from URL...</option>
										<option disabled>───────────</option>
										{examples.map(ex => (
											<option key={ex.id} value={ex.id}>{ex.id}</option>
										))}
									</select>
								</div>

								{selectedExample === '__import__' ? (
									<div>
										{/* URL input — positioned same as Name field */}
										<div className="mb-3">
											<label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Gist URL</label>
											<div className="flex gap-2">
												<input
													type="text"
													className="flex-1 rounded-lg px-3 py-2 text-sm"
													style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
													placeholder="https://gist.github.com/user/abc123"
													value={importUrl}
													onChange={(e) => setImportUrl(e.target.value)}
												/>
												<button
													type="button"
													className="rounded-lg px-3 py-1.5 text-xs font-medium"
													style={{ background: 'var(--primary)', color: 'var(--primary-contrast)', opacity: importUrl && !importLoading ? 1 : 0.5 }}
													disabled={!importUrl || importLoading}
													onClick={async () => {
														setImportLoading(true);
														setImportError(null);
														setImportItems([]);
														setImportPreviewItem(null);
														try {
															const res = await apiFetch('/api/guides/import-preview', {
																method: 'POST',
																headers: { 'Content-Type': 'application/json' },
																body: JSON.stringify({ url: importUrl }),
															});
															const data = await res.json() as { items?: Array<{ name: string; hasGuide: boolean; hasPrompts: boolean; guideContent: string; promptsContent: string }>; error?: string };
															if (data.error) { setImportError(data.error); }
															else if (!data.items?.length) { setImportError('No guide/prompt files found. Files must be named like: name_guide.md / name_prompts.md'); }
															else {
																const items = data.items.map(it => ({ ...it, selected: true }));
																setImportItems(items);
																if (items.length === 1) setImportPreviewItem(items[0].name);
															}
														} catch (e) { setImportError(String(e)); }
														setImportLoading(false);
													}}
												>{importLoading ? 'Loading...' : 'Load'}</button>
											</div>
											{importError && <div className="mt-1 text-xs" style={{ color: 'var(--error)' }}>{importError}</div>}
										</div>

										{/* Items list */}
										{importItems.length > 0 && (
											<div className="mb-3">
												<div className="chat-scroll rounded-lg" style={{ overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)' }}>
													{importItems.map((item, i) => (
														<div key={item.name}>
															<div
																className="flex items-center gap-2 px-3 py-2"
																style={{ borderBottom: (importPreviewItem === item.name || i < importItems.length - 1) ? '1px solid var(--border)' : 'none', background: importPreviewItem === item.name ? 'var(--surface)' : 'transparent' }}
															>
																<input
																	type="checkbox"
																	checked={item.selected}
																	onChange={() => setImportItems(prev => prev.map((it, j) => j === i ? { ...it, selected: !it.selected } : it))}
																/>
																<button
																	type="button"
																	className="flex-1 text-left text-sm"
																	style={{ color: 'var(--text)' }}
																	onClick={() => setImportPreviewItem(importPreviewItem === item.name ? null : item.name)}
																>{item.name}</button>
																<span className="text-xs" style={{ color: 'var(--text-muted)' }}>
																	{[item.hasGuide && 'guide', item.hasPrompts && 'prompts'].filter(Boolean).join(' + ')}
																</span>
															</div>
															{importPreviewItem === item.name && (
																<div className="px-3 pb-2">
																	<div className="flex mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
																		<button type="button" className="px-3 py-1 text-xs font-medium" style={{ color: previewTab === 'guide' ? 'var(--text)' : 'var(--text-muted)', borderBottom: previewTab === 'guide' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }} onClick={() => setPreviewTab('guide')}>Guide</button>
																		<button type="button" className="px-3 py-1 text-xs font-medium" style={{ color: previewTab === 'prompts' ? 'var(--text)' : 'var(--text-muted)', borderBottom: previewTab === 'prompts' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }} onClick={() => setPreviewTab('prompts')}>Prompts</button>
																	</div>
																	<pre className="chat-scroll whitespace-pre-wrap text-xs p-2 rounded" style={{ background: 'var(--surface)', color: 'var(--text-muted)', height: `calc(100vh - ${importItems.length > 1 ? '30' : '26'}rem)`, overflow: 'auto' }}>
																		{previewTab === 'guide' ? (item.guideContent || '(no guide)') : (item.promptsContent || '(no prompts)')}
																	</pre>
																</div>
															)}
														</div>
													))}
												</div>
											</div>
										)}

										{/* Action buttons */}
										<div className="flex gap-2 justify-end">
											<button type="button" className="rounded-lg px-3 py-1.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setShowNewGuide(false)}>Cancel</button>
											{importItems.some(it => it.selected) && (
												<button
													type="button"
													className="rounded-lg px-3 py-1.5 text-xs font-medium"
													style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
													onClick={async () => {
														const selected = importItems.filter(it => it.selected);
														const gistMatch = importUrl.match(/gist\.github\.com\/[\w-]+\/([a-f0-9]+)/);
														try {
															await apiFetch('/api/guides/import', {
																method: 'POST',
																headers: { 'Content-Type': 'application/json' },
																body: JSON.stringify({
																	gistId: gistMatch?.[1] ?? 'unknown',
																	url: importUrl,
																	items: selected.map(it => ({ name: it.name, guideContent: it.guideContent || undefined, promptsContent: it.promptsContent || undefined })),
																}),
															});
															setShowNewGuide(false);
															setRecentlyAdded(new Set(selected.map(it => it.name)));
															setTimeout(() => setRecentlyAdded(new Set()), 3000);
															apiFetch('/api/guides').then(r => r.json()).then(setGuides).catch(() => {});
														} catch (e) {
															setImportError(`Import failed: ${e}`);
														}
													}}
												>Add to Portal ({importItems.filter(it => it.selected).length})</button>
											)}
										</div>
									</div>
								) : (
								<>
								{/* Name input */}
								<div className="mb-3">
									<label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Name</label>
									<input
										type="text"
										className="w-full rounded-lg px-3 py-2 text-sm"
										style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
										placeholder="my-guide-name"
										value={newGuideName}
										onChange={(e) => setNewGuideName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '-'))}
									/>
								</div>

								{/* Preview tabs */}
								{examplePreview && (
									<div className="mb-3">
										<div className="flex mb-2" style={{ borderBottom: '1px solid var(--border)' }}>
											<button
												type="button"
												className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
												style={{ color: previewTab === 'guide' ? 'var(--text)' : 'var(--text-muted)', borderBottom: previewTab === 'guide' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }}
												onClick={() => setPreviewTab('guide')}
											>
												<input type="checkbox" checked={newGuideCheck} onChange={(e) => { e.stopPropagation(); setNewGuideCheck(e.target.checked); }} style={{ marginRight: 2 }} />
												Guide
											</button>
											<button
												type="button"
												className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
												style={{ color: previewTab === 'prompts' ? 'var(--text)' : 'var(--text-muted)', borderBottom: previewTab === 'prompts' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }}
												onClick={() => setPreviewTab('prompts')}
											>
												<input type="checkbox" checked={newPromptsCheck} onChange={(e) => { e.stopPropagation(); setNewPromptsCheck(e.target.checked); }} style={{ marginRight: 2 }} />
												Prompts
											</button>
										</div>
										<div className="chat-scroll rounded-lg p-3" style={{ height: 'calc(100vh - 26rem)', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex' }}>
											<textarea
												className="w-full flex-1 resize-none bg-transparent text-xs outline-none"
												style={{ fontFamily: 'monospace', color: 'var(--text)' }}
												value={previewTab === 'guide' ? examplePreview.guide : examplePreview.prompts}
												onChange={(e) => {
													if (previewTab === 'guide') {
														setExamplePreview({ ...examplePreview, guide: e.target.value });
													} else {
														setExamplePreview({ ...examplePreview, prompts: e.target.value });
													}
												}}
												placeholder={previewTab === 'guide' ? '# My Guide\n\nWrite your guide here...' : '# My Prompts\n\n## First Prompt\nDescribe what you want here'}
											/>
										</div>
									</div>
								)}

								{/* Action buttons */}
								<div className="flex gap-2 justify-end">
									<button
										type="button"
										className="rounded-lg px-3 py-1.5 text-xs"
										style={{ border: '1px solid var(--border)' }}
										onClick={() => setShowNewGuide(false)}
									>Cancel</button>
									<button
										type="button"
										className="rounded-lg px-3 py-1.5 text-xs font-medium"
										style={{ background: 'var(--primary)', color: 'var(--primary-contrast)', opacity: newGuideName && (newGuideCheck || newPromptsCheck) ? 1 : 0.5 }}
										disabled={!newGuideName || (!newGuideCheck && !newPromptsCheck)}
										onClick={() => {
											if (!newGuideName) return;
											const existing = guides.find(g => g.id === newGuideName);
											if (existing) {
												setConfirmOverwrite(true);
											} else {
												doAddGuide();
											}
										}}
									>Add</button>
								</div>
								{confirmOverwrite && (
									<div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--warning-tint)', border: '1px solid var(--warning)' }}>
										<span className="flex-1 text-xs" style={{ color: 'var(--warning)' }}>"{newGuideName}" already exists. Overwrite?</span>
										<button type="button" className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--warning)', color: 'var(--button-contrast)' }} onClick={() => { setConfirmOverwrite(false); doAddGuide(); }}>Overwrite</button>
										<button type="button" className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setConfirmOverwrite(false)}>Cancel</button>
									</div>
								)}
								</>
								)}
							</div>
						) : viewingGuide ? (
							<div>
								<div className="mb-2 flex items-center justify-between">
									{editingGuide || editingName !== null ? (
										<input
											type="text"
											className="font-semibold text-sm bg-transparent outline-none border-b"
											style={{ color: 'var(--text)', borderColor: 'var(--primary)', minWidth: 150 }}
											value={editingName ?? viewingGuide.id}
											onChange={(e) => setEditingName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '-'))}
										/>
									) : (
										<h3 className="font-semibold text-sm">{viewingGuide.id}</h3>
									)}
									<div className="flex gap-1">
										{!editingGuide && (
											<button className="rounded px-2 py-1 text-xs font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }} onClick={async () => {
												const vi = viewingGuide;
												setViewingGuide(null);
												setShowGuides(false);
												// Apply guide if it exists
												if (vi.guideContent) {
													try {
														const res = await apiFetch(`/api/guides/${encodeURIComponent(vi.id)}`);
														const { filePath, title } = await res.json() as { filePath: string; title: string };
														if (filePath && wsRef.current?.readyState === WebSocket.OPEN) {
															const prompt = `${title}\n\nRead the file "${filePath}" and follow the guidance in it for this session. Do not summarize the file — just acknowledge that you've read it and are ready.`;
															wsRef.current.send(JSON.stringify({ type: 'prompt', content: prompt }));
															setMessages(prev => [...prev, { id: `inst-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() }]);
															setIsStreaming(true);
															setIsThinking(true);
															setThinkingText('Applying guide...');
														}
													} catch (e) {
														setError(`Failed to load guide: ${e}`);
													}
												}
												// Load prompts if available
												if (vi.promptsContent) await loadPromptsForGuide(vi.id);
											}} type="button">Apply</button>
										)}
										<button className="rounded px-2 py-1 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => {
											if (editingGuide) {
												setEditingGuide(null);
												setEditingName(null);
											} else {
												const tab = viewingGuide.activeTab ?? 'guide';
												const content = tab === 'guide' ? viewingGuide.guideContent : viewingGuide.promptsContent;
												setEditingGuide({ id: viewingGuide.id, content: content ?? '', isPrompts: tab === 'prompts' });
												setEditingName(viewingGuide.id);
											}
										}} type="button">{editingGuide ? 'Cancel Edit' : 'Edit'}</button>
										{editingGuide && (
											<button className="rounded px-2 py-1 text-xs font-medium" style={{ background: 'var(--success)', color: 'var(--button-contrast)' }} onClick={async () => {
												try {
													const newName = editingName ?? editingGuide.id;
													const renamed = newName !== viewingGuide.id;
													// Rename files if name changed
													if (renamed) {
														await apiFetch('/api/guides/rename', {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ oldId: viewingGuide.id, newId: newName }),
														});
													}
													// Save content
													const endpoint = editingGuide.isPrompts ? '/api/prompts' : '/api/guides';
													await apiFetch(endpoint, {
														method: 'POST',
														headers: { 'Content-Type': 'application/json' },
														body: JSON.stringify({ id: newName, content: editingGuide.content }),
													});
													// Update the viewing state
													const tab = viewingGuide.activeTab ?? 'guide';
													const updated = { ...viewingGuide, id: newName };
													if (tab === 'guide' && !editingGuide.isPrompts) {
														updated.guideContent = editingGuide.content;
													} else if (tab === 'prompts' && editingGuide.isPrompts) {
														updated.promptsContent = editingGuide.content;
													}
													setViewingGuide(updated);
													setEditingGuide(null);
													setEditingName(null);
													apiFetch('/api/guides').then(r => r.json()).then(setGuides).catch(() => {});
												} catch (e) {
													setError(`Failed to save: ${e}`);
												}
											}} type="button">Save</button>
										)}
										<button className="rounded px-2 py-1 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => guardDiscard(() => { setLastViewedGuide(viewingGuide.id); setViewingGuide(null); setEditingGuide(null); setEditingName(null); setPendingDiscard(null); })} type="button">Back</button>
									</div>
								</div>
								{(() => {
									const tab = viewingGuide.activeTab ?? 'guide';
									const fp = tab === 'guide' ? viewingGuide.guideFilePath : viewingGuide.promptsFilePath;
									// Show actual path or construct expected path
									let displayPath = fp ?? (viewingGuide.guideFilePath || viewingGuide.promptsFilePath
										? ((tab === 'guide' ? viewingGuide.promptsFilePath : viewingGuide.guideFilePath) ?? '').replace(/([/\\])(guides|prompts)([/\\])/, `$1${tab === 'guide' ? 'guides' : 'prompts'}$3`)
										: '');
									// Live-update filename when renaming
									if (displayPath && editingName && editingName !== viewingGuide.id) {
										displayPath = displayPath.replace(/[/\\][^/\\]+\.md$/, (m) => m.charAt(0) + editingName + '.md');
									}
									const exists = !!(tab === 'guide' ? viewingGuide.guideFilePath : viewingGuide.promptsFilePath);
									return displayPath ? (
										<div className="mb-2 flex items-center gap-1 rounded px-2 py-1" style={{ background: 'var(--bg)' }}>
											<div className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs" style={{ color: 'var(--text-muted)', opacity: exists ? 1 : 0.5 }}>
												{displayPath}{!exists && ' (not created)'}
											</div>
											<CopyButton text={displayPath} />
										</div>
									) : null;
								})()}
								{/* Discard warning */}
								{pendingDiscard && (
									<div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--warning-tint)', border: '1px solid var(--warning)' }}>
										<span className="flex-1 text-xs" style={{ color: 'var(--warning)' }}>You have unsaved changes.</span>
										<button type="button" className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--warning)', color: 'var(--button-contrast)' }} onClick={() => { const action = pendingDiscard; setPendingDiscard(null); action(); }}>Discard</button>
										<button type="button" className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setPendingDiscard(null)}>Keep Editing</button>
									</div>
								)}
								{/* Guide / Prompts tabs */}
								<div className="flex mb-2" style={{ borderBottom: '1px solid var(--border)' }}>
									<button
										type="button"
										className="px-3 py-1.5 text-xs font-medium"
										style={{ color: (viewingGuide.activeTab ?? 'guide') === 'guide' ? 'var(--text)' : 'var(--text-muted)', borderBottom: (viewingGuide.activeTab ?? 'guide') === 'guide' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, opacity: viewingGuide.guideContent ? 1 : 0.4 }}
										onClick={() => guardDiscard(() => { setViewingGuide({ ...viewingGuide, activeTab: 'guide' }); setEditingGuide(null); setPendingDiscard(null); })}
									>Guide</button>
									<button
										type="button"
										className="px-3 py-1.5 text-xs font-medium"
										style={{ color: viewingGuide.activeTab === 'prompts' ? 'var(--text)' : 'var(--text-muted)', borderBottom: viewingGuide.activeTab === 'prompts' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, opacity: viewingGuide.promptsContent ? 1 : 0.4 }}
										onClick={() => guardDiscard(() => { setViewingGuide({ ...viewingGuide, activeTab: 'prompts' }); setEditingGuide(null); setPendingDiscard(null); })}
									>Prompts</button>
								</div>
								<div className="chat-scroll rounded-lg p-3" style={{ height: editingGuide ? 'calc(100vh - 20rem)' : undefined, maxHeight: 'calc(100vh - 20rem)', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', display: editingGuide ? 'flex' : undefined }}>
									{editingGuide ? (
										<textarea
											className="w-full flex-1 resize-none bg-transparent text-xs outline-none"
											style={{ fontFamily: 'monospace', color: 'var(--text)' }}
											value={editingGuide.content}
											onChange={(e) => setEditingGuide({ ...editingGuide, content: e.target.value })}
											placeholder={editingGuide.isPrompts
												? '# Prompts\n\n## My first prompt\nDescribe what you want Copilot to do\n\n## Another prompt\nEach ## heading becomes a selectable prompt'
												: '# Guide Title\n\nWrite instructions for Copilot here.\n\n## Section\nUse sections to organize your guide.'}
										/>
									) : (
										<pre className="text-xs whitespace-pre-wrap break-words" style={{ fontFamily: 'monospace', color: 'var(--text)', opacity: ((viewingGuide.activeTab ?? 'guide') === 'guide' ? viewingGuide.guideContent : viewingGuide.promptsContent) ? 1 : 0.4 }}>
											{((viewingGuide.activeTab ?? 'guide') === 'guide' ? viewingGuide.guideContent : viewingGuide.promptsContent) || ((viewingGuide.activeTab ?? 'guide') === 'prompts' ? 'No prompts file. Click Edit to create one.\n\nFormat: use ## headings for prompt labels,\ntext below becomes the prompt content.' : 'No guide file. Click Edit to create one.')}
										</pre>
									)}
								</div>
							</div>
						) : guides.length === 0 ? (
							<div className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
								No guides found. Add .md files to data/guides/
							</div>
						) : (
							<div className="chat-scroll" style={{ maxHeight: 'calc(100vh - 12rem)', overflowY: 'auto' }}>
								{guides.map(inst => (
									<button
										key={inst.id}
										type="button"
										className="mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-1000"
										style={{ background: recentlyAdded.has(inst.id) || lastViewedGuide === inst.id ? 'var(--primary-tint)' : 'var(--bg)', border: `1px solid ${recentlyAdded.has(inst.id) || lastViewedGuide === inst.id ? 'var(--primary)' : 'var(--border)'}`, minHeight: '2.75rem' }}
										onClick={async () => {
											setLastViewedGuide(null);
											try {
												const [gRes, pRaw] = await Promise.all([
													inst.hasGuide ? apiFetch(`/api/guides/${encodeURIComponent(inst.id)}`).then(r => r.json()) : Promise.resolve(null),
													inst.hasPrompts ? apiFetch(`/api/guides/${encodeURIComponent(inst.id)}/prompts`).then(r => r.json()) : Promise.resolve(null),
												]);
												const promptsContent = pRaw?.prompts?.map((p: { label: string; text: string }) => `## ${p.label}\n${p.text}`).join('\n\n') ?? '';
												setViewingGuide({
													id: inst.id,
													guideContent: gRes?.content ?? '',
													promptsContent,
													guideFilePath: gRes?.filePath,
													promptsFilePath: pRaw?.filePath,
													activeTab: inst.hasGuide ? 'guide' : 'prompts',
												});
											} catch {}
										}}
									>
										<svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
											<rect x="5" y="2" width="14" height="20" rx="2" />
											<path d="M8 8c1-2 2.5 2 3.5 0s2.5 2 3.5 0" />
											<path d="M8 13c1-2 2.5 2 3.5 0s2.5 2 3.5 0" />
										</svg>
										<span className="flex-1">{inst.name}</span>
										{confirmDeleteGuide === inst.id ? (
											<span className="flex items-center gap-1" style={{ minHeight: '1.75rem' }} onClick={e => e.stopPropagation()}>
												<button className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--error)', color: 'white' }} onClick={async (e) => {
													e.stopPropagation();
													await apiFetch(`/api/guides/${encodeURIComponent(inst.id)}`, { method: 'DELETE' });
													setGuides(prev => prev.filter(i => i.id !== inst.id));
													setConfirmDeleteGuide(null);
												}} type="button">Delete</button>
												<button className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={(e) => { e.stopPropagation(); setConfirmDeleteGuide(null); }} type="button">Cancel</button>
											</span>
										) : (
											<span className="flex gap-0.5 shrink-0" style={{ minHeight: '1.75rem' }} onClick={e => e.stopPropagation()}>
												<span className="rounded p-1.5" style={{ opacity: inst.hasGuide ? 0.7 : 0.2 }} title={inst.hasGuide ? 'Has guide' : 'No guide'}>
													<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
														<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
														<circle cx="12" cy="12" r="3" />
													</svg>
												</span>
												<span className="rounded p-1.5" style={{ opacity: inst.hasPrompts ? 0.7 : 0.2 }} title={inst.hasPrompts ? 'Has prompts' : 'No prompts'}>
													<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
														<path d="M3 15a2 2 0 0 0 2 2h12l4 4V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
														<path d="M8 9h8M8 13h5" />
													</svg>
												</span>
												<button className="rounded p-1.5" style={{ opacity: 0.7 }} onClick={(e) => { e.stopPropagation(); setConfirmDeleteGuide(inst.id); }} type="button" title="Delete">
													<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
														<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
													</svg>
												</button>
											</span>
										)}
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* Theme Picker */}
			{showThemePicker && (
				<div
					className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-14 pb-4"
					style={{ background: 'var(--overlay)' }}
					onClick={() => { setShowThemePicker(false); setEditingTheme(null); if (editingTheme) applyPreset(activePreset); }}
				>
					<div
						className="w-full max-w-sm rounded-2xl p-4 overflow-y-auto"
						style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: 'calc(100vh - 5rem)' }}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="mb-3 flex items-center justify-between">
							<h2 className="font-semibold">Theme</h2>
							<div className="flex items-center gap-2">
								{activeThemeId !== defaultThemeId && !editingTheme && (
									<button type="button" className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }} onClick={() => {
										const all = [...BUILTIN_PRESETS, ...customThemes];
										const def = all.find(p => p.id === defaultThemeId) ?? BUILTIN_PRESETS[0];
										applyPreset(def);
										if (activeSessionId) {
											apiFetch(`/api/session-theme/${encodeURIComponent(activeSessionId)}`, {
												method: 'POST', headers: { 'Content-Type': 'application/json' },
												body: JSON.stringify({ themeId: null }),
											}).catch(() => {});
										}
									}}>Use Default</button>
								)}
								<button
									className="rounded-lg px-3 py-1.5 text-sm font-medium"
									style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
									onClick={() => setEditingTheme({ editId: '__new__', name: '', base: activePreset.base, accent: activePreset.accent, text: '' })}
									type="button"
								>+ New</button>
							</div>
						</div>
						<div className="flex flex-col gap-1 mb-3">
							{allPresets.map(p => {
								const isActive = p.id === activeThemeId && !editingTheme;
								const isEditing = editingTheme?.editId === p.id;
								const isCustom = !('builtIn' in p && p.builtIn);
								return (
									<div key={p.id}>
										<button type="button" className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-left" style={{ background: isActive ? 'var(--primary-tint)' : 'var(--bg)', border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}` }}
											onClick={() => {
												if (isEditing) return;
												applyPreset(p);
												if (activeSessionId) {
													apiFetch(`/api/session-theme/${encodeURIComponent(activeSessionId)}`, {
														method: 'POST', headers: { 'Content-Type': 'application/json' },
														body: JSON.stringify({ themeId: p.id }),
													}).catch(() => {});
												}
											}}>
											<span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: p.base, border: '2px solid ' + p.accent, flexShrink: 0 }} />
											<span className="flex-1">{p.name}</span>
											<button type="button" className="shrink-0 rounded p-1" style={{ opacity: p.id === defaultThemeId ? 0.9 : 0.4 }} onClick={(e) => { e.stopPropagation(); setDefaultThemeId(p.id); saveThemesToServer(customThemes, p.id); }} title={p.id === defaultThemeId ? 'Default theme' : 'Set as default'}>
												<svg className="size-4" viewBox="0 0 24 24" fill={p.id === defaultThemeId ? 'var(--warning)' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
													<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
												</svg>
											</button>
											{isCustom && (
												<button type="button" className="shrink-0 rounded p-1" style={{ opacity: 0.5 }} onClick={(e) => {
													e.stopPropagation();
													if (isEditing) { setEditingTheme(null); applyPreset(activePreset); }
													else setEditingTheme({ editId: p.id, name: p.name, base: p.base, accent: p.accent, text: ('text' in p ? (p as { text?: string }).text : undefined) ?? '' });
												}} title="Edit theme">
													<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
												</button>
											)}
											{isCustom && (
												<button type="button" className="shrink-0 rounded p-1" style={{ opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); const updated = customThemes.filter(t => t.id !== p.id); setCustomThemes(updated); if (defaultThemeId === p.id) { setDefaultThemeId('dark'); saveThemesToServer(updated, 'dark'); } else { saveThemesToServer(updated, defaultThemeId); } if (activeThemeId === p.id) applyPreset(BUILTIN_PRESETS[0]); if (isEditing) setEditingTheme(null); }} title="Delete theme">
													<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
												</button>
											)}
										</button>
										{isEditing && editingTheme && (
											<div className="rounded-xl p-3 mt-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
												<div className="mb-3">
													<label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
													<input className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder="My theme" value={editingTheme.name} onChange={e => setEditingTheme({ ...editingTheme, name: e.target.value })} autoFocus />
												</div>
												{(['base', 'accent', 'text'] as const).map(field => {
													const label = field === 'base' ? 'Base' : field === 'accent' ? 'Accent' : 'Text';
													const val = editingTheme[field];
													const updateField = (hex: string, live: boolean) => {
														const t = { ...editingTheme, [field]: hex };
														setEditingTheme(t);
														if (live) { clearThemeOverrides(); document.documentElement.removeAttribute('data-theme'); applyTheme(deriveTheme(t.base, t.accent, t.text || undefined)); }
													};
													return (
														<div key={field} className="flex items-center gap-2 mb-2">
															<label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-muted)', width: 44 }}>{label}</label>
															<input type="color" value={val || (field === 'text' ? (isDark(editingTheme.base) ? '#cccccc' : '#1f1f1f') : '#000000')} onChange={e => updateField(e.target.value, true)} className="rounded shrink-0" style={{ width: 32, height: 28, border: '1px solid var(--border)', padding: 2, cursor: 'pointer', background: 'var(--surface)' }} />
															<input className="min-w-0 flex-1 rounded px-2 py-1 text-xs font-mono" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder={field === 'text' ? 'auto' : ''} value={val} onChange={e => updateField(e.target.value, /^#[0-9a-fA-F]{6}$/.test(e.target.value))} />
														</div>
													);
												})}
												<div className="flex gap-2 justify-end">
													<button type="button" className="rounded-lg px-3 py-1.5 text-xs inline-flex items-center gap-1" style={{ border: '1px solid var(--border)' }} onClick={() => { const rp = generateRandomPalette(); const t = { ...editingTheme, ...rp, name: rp.name }; setEditingTheme(t); clearThemeOverrides(); document.documentElement.removeAttribute('data-theme'); applyTheme(deriveTheme(t.base, t.accent, t.text || undefined)); }}><svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>Surprise me</button>
													<div className="flex-1" />
													<button type="button" className="rounded-lg px-3 py-1.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => { setEditingTheme(null); applyPreset(activePreset); }}>Cancel</button>
													<button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-contrast)', opacity: editingTheme.name.trim() ? 1 : 0.5 }} disabled={!editingTheme.name.trim()} onClick={() => {
														const id = editingTheme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
														if (!id) return;
														const newTheme = { id, name: editingTheme.name, base: editingTheme.base, accent: editingTheme.accent, ...(editingTheme.text ? { text: editingTheme.text } : {}) };
														const updated = [...customThemes.filter(t => t.id !== p.id && t.id !== id), newTheme];
														setCustomThemes(updated);
														saveThemesToServer(updated, defaultThemeId);
														applyPreset(newTheme);
														setEditingTheme(null);
														if (activeSessionId) {
															apiFetch(`/api/session-theme/${encodeURIComponent(activeSessionId)}`, {
																method: 'POST', headers: { 'Content-Type': 'application/json' },
																body: JSON.stringify({ themeId: id }),
															}).catch(() => {});
														}
													}}>Save</button>
												</div>
											</div>
										)}
									</div>
								);
							})}
						</div>
						{editingTheme?.editId === '__new__' && (
							<div className="rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
								<div className="mb-3">
									<label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
									<input className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder="My theme" value={editingTheme.name} onChange={e => setEditingTheme({ ...editingTheme, name: e.target.value })} autoFocus />
								</div>
								{(['base', 'accent', 'text'] as const).map(field => {
									const label = field === 'base' ? 'Base' : field === 'accent' ? 'Accent' : 'Text';
									const val = editingTheme[field];
									const updateField = (hex: string, live: boolean) => {
										const t = { ...editingTheme, [field]: hex };
										setEditingTheme(t);
										if (live) { clearThemeOverrides(); document.documentElement.removeAttribute('data-theme'); applyTheme(deriveTheme(t.base, t.accent, t.text || undefined)); }
									};
									return (
										<div key={field} className="flex items-center gap-2 mb-2">
											<label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-muted)', width: 44 }}>{label}</label>
											<input type="color" value={val || (field === 'text' ? (isDark(editingTheme.base) ? '#cccccc' : '#1f1f1f') : '#000000')} onChange={e => updateField(e.target.value, true)} className="rounded shrink-0" style={{ width: 32, height: 28, border: '1px solid var(--border)', padding: 2, cursor: 'pointer', background: 'var(--surface)' }} />
											<input className="min-w-0 flex-1 rounded px-2 py-1 text-xs font-mono" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder={field === 'text' ? 'auto' : ''} value={val} onChange={e => updateField(e.target.value, /^#[0-9a-fA-F]{6}$/.test(e.target.value))} />
										</div>
									);
								})}
								<div className="flex gap-2 justify-end">
									<button type="button" className="rounded-lg px-3 py-1.5 text-xs inline-flex items-center gap-1" style={{ border: '1px solid var(--border)' }} onClick={() => { const rp = generateRandomPalette(); const t = { ...editingTheme, ...rp, name: rp.name }; setEditingTheme(t); clearThemeOverrides(); document.documentElement.removeAttribute('data-theme'); applyTheme(deriveTheme(t.base, t.accent, t.text || undefined)); }}><svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>Surprise me</button>
									<div className="flex-1" />
									<button type="button" className="rounded-lg px-3 py-1.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => { setEditingTheme(null); applyPreset(activePreset); }}>Cancel</button>
									<button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-contrast)', opacity: editingTheme.name.trim() ? 1 : 0.5 }} disabled={!editingTheme.name.trim()} onClick={() => {
										const id = editingTheme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
										if (!id) return;
										const newTheme = { id, name: editingTheme.name, base: editingTheme.base, accent: editingTheme.accent, ...(editingTheme.text ? { text: editingTheme.text } : {}) };
										const updated = [...customThemes.filter(t => t.id !== id), newTheme];
										setCustomThemes(updated);
										saveThemesToServer(updated, defaultThemeId);
										applyPreset(newTheme);
										setEditingTheme(null);
										if (activeSessionId) {
											apiFetch(`/api/session-theme/${encodeURIComponent(activeSessionId)}`, {
												method: 'POST', headers: { 'Content-Type': 'application/json' },
												body: JSON.stringify({ themeId: id }),
											}).catch(() => {});
										}
									}}>Save</button>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Image Lightbox */}
			{lightboxImage && (
				<div
					className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 gap-3"
					style={{ background: 'rgba(0,0,0,0.85)' }}
					onClick={() => { setLightboxImage(null); setLightboxDims(null); }}
				>
					<img
						src={lightboxImage}
						alt="Full size"
						className="rounded-lg"
						style={{ maxWidth: '95vw', maxHeight: '85vh', objectFit: 'contain' }}
						onClick={(e) => e.stopPropagation()}
						onLoad={(e) => setLightboxDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
					/>
					{(() => {
						const meta = describeDataUrl(lightboxImage);
						const parts: string[] = [];
						if (lightboxDims) parts.push(`${lightboxDims.w} × ${lightboxDims.h}`);
						if (meta.mime) parts.push(meta.mime);
						if (meta.bytes != null) parts.push(formatBytes(meta.bytes));
						if (!parts.length) return null;
						return (
							<div
								className="rounded-md px-3 py-1.5 text-xs font-mono"
								style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.15)' }}
								onClick={(e) => e.stopPropagation()}
							>
								{parts.join('  ·  ')}
							</div>
						);
					})()}
				</div>
			)}

			{/* MCP confirm dialog */}
			{mcpConfirm && (
				<div
					className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-14 pb-4"
					style={{ background: 'var(--overlay)' }}
					onClick={() => setMcpConfirm(null)}
				>
					<div
						className="w-full max-w-sm rounded-2xl p-5"
						style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}
						onClick={e => e.stopPropagation()}
					>
						<div className="text-sm font-semibold mb-2">Confirm</div>
						<div className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{mcpConfirm.message}</div>
						<div className="flex gap-2 justify-end">
							<button type="button" className="rounded-lg px-4 py-2 text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
								onClick={() => setMcpConfirm(null)}
							>Cancel</button>
							<button type="button" className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: 'var(--primary)', color: 'var(--button-contrast)' }}
								onClick={mcpConfirm.onConfirm}
							>OK</button>
						</div>
					</div>
				</div>
			)}

			{serverConfirm && (
				<div
					className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-14 pb-4"
					style={{ background: 'var(--overlay)' }}
					onClick={() => setServerConfirm(null)}
				>
					<div
						className="w-full max-w-sm rounded-2xl p-5"
						style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}
						onClick={e => e.stopPropagation()}
					>
						<div className="text-sm font-semibold mb-2">Confirm</div>
						<div className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{serverConfirm.message}</div>
						<div className="flex gap-2 justify-end">
							<button type="button" className="rounded-lg px-4 py-2 text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
								onClick={() => setServerConfirm(null)}
							>Cancel</button>
							<button type="button" className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: 'var(--primary)', color: 'var(--button-contrast)' }}
								onClick={serverConfirm.onConfirm}
							>Restart</button>
						</div>
					</div>
				</div>
			)}

			{/* Rules Drawer */}
			{showRules && (
				<div
					className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-14 pb-4"
					style={{ background: 'var(--overlay)' }}
					onClick={() => setShowRules(false)}
				>
					<div
						className="w-full max-w-md rounded-2xl p-4"
						style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="mb-3 flex items-center justify-between">
							<h2 className="font-semibold">Always-Allow Rules</h2>
							{rules.length > 0 && (
								<button
									className="rounded-lg px-3 py-1.5 text-xs font-medium"
									style={{ background: 'var(--error)', color: 'white' }}
									onClick={clearAllRules}
									type="button"
								>
									Clear All
								</button>
							)}
						</div>

						{/* Approve All toggle */}
						<div
							className="mb-3 flex items-center justify-between rounded-xl px-3 py-2.5"
							style={{ background: approveAll ? 'var(--success-tint)' : 'var(--bg)', border: `1px solid ${approveAll ? 'var(--success)' : 'var(--border)'}` }}
						>
							<div>
								<div className="text-sm font-medium">Auto-approve all (yolo)</div>
								<div className="text-xs" style={{ color: 'var(--text-muted)' }}>Skip all permission prompts</div>
							</div>
							<button
								type="button"
								onClick={toggleApproveAll}
								className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
								style={{ background: approveAll ? 'var(--success)' : 'var(--text-muted)' }}
							>
								<span
									className="pointer-events-none inline-block size-5 rounded-full bg-white shadow transition-transform"
									style={{ transform: approveAll ? 'translateX(1.25rem)' : 'translateX(0)' }}
								/>
							</button>
						</div>
						{rules.length === 0 ? (
							<p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
								No rules yet. Use "Allow Always" on a permission request to add one.
							</p>
						) : (
							<div className="chat-scroll" style={{ maxHeight: 'calc(100vh - 16rem)', overflowY: 'auto' }}>
								{rules.map(rule => (
									<div
										key={rule.id}
										className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2"
										style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
									>
										<span className="rounded px-1.5 py-0.5 text-xs font-mono" style={{ background: 'var(--tool-call-tint)', color: 'var(--tool-call)', border: '1px solid var(--tool-call)' }}>
											{rule.kind}
										</span>
										<code className="min-w-0 flex-1 truncate text-xs font-mono" style={{ color: 'var(--text)' }}>
											{rule.pattern}
										</code>
										<button
											className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
											onClick={() => deleteRule(rule.id)}
											title="Remove rule"
											type="button"
										>
											<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
												<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
											</svg>
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* Session Picker Modal */}
			{showPicker && (
				<div
					className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-14 pb-4"
					style={{ background: 'var(--overlay)' }}
					onClick={() => { if (!noSession) setShowPicker(false); }}
				>
					<div
						className="w-full max-w-md rounded-2xl p-4"
						style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="mb-3 flex items-center justify-between">
							<h2 className="font-semibold">Sessions</h2>
							<div className="flex items-center gap-2">
								<button
									className="inline-flex items-center justify-center rounded-lg px-2 py-1.5"
									style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
									onClick={() => setServerConfirm({
										message: 'Restart the Portal server? All connected clients will briefly disconnect and reconnect.',
										onConfirm: () => { setServerConfirm(null); setNotification({ type: 'info', message: 'Restarting Portal… reconnecting automatically.' }); restartServer(); },
									})}
									type="button"
									title="Restart Portal server"
								>
									<svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.36-2.64" />
										<path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64" />
										<path d="M21 4v4h-4" />
										<path d="M3 20v-4h4" />
										<text x="12" y="13" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="currentColor" stroke="none">P</text>
									</svg>
								</button>
								<button
									className="inline-flex items-center justify-center rounded-lg px-2 py-1.5"
									style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
									onClick={() => setServerConfirm({
										message: 'Restart the Copilot server? The active session will briefly disconnect while the CLI reloads.',
										onConfirm: () => { setServerConfirm(null); restartCli(); },
									})}
									type="button"
									title="Restart Copilot server"
								>
									<svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M21 12a9 9 0 1 1-2.64-6.36" />
										<path d="M21 4v4h-4" />
										<text x="11" y="13" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="currentColor" stroke="none">C</text>
									</svg>
								</button>
								<button
									className="inline-flex items-center justify-center rounded-lg px-2 py-1.5"
									style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
									onClick={() => setServerConfirm({
										message: 'Sign out of GitHub? Stored credentials are cleared and the portal returns to the sign-in screen.',
										onConfirm: () => { setServerConfirm(null); setShowPicker(false); logoutGitHub(); },
									})}
									type="button"
									title="Log out of GitHub"
								>
									<svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
										<polyline points="16 17 21 12 16 7" />
										<line x1="21" y1="12" x2="9" y2="12" />
									</svg>
								</button>
								<button
									className="inline-flex items-center justify-center rounded-lg px-2 py-1.5"
									style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
									onClick={() => setServerConfirm({
										message: 'Remove the portal session token? Every connected device is signed out and the portal returns to the “Generate session token” screen.',
										onConfirm: () => { setServerConfirm(null); setShowPicker(false); removePortalToken(); },
									})}
									type="button"
									title="Remove portal session token"
								>
									<svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
										<path d="m21 2-9.6 9.6" />
										<circle cx="7.5" cy="15.5" r="5.5" />
									</svg>
								</button>
								<button
									className="inline-flex items-center justify-center rounded-lg px-3 py-1.5"
									style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
									onClick={() => setShowQR(v => !v)}
									type="button"
									title="Show QR code"
								>
									<svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
										{/* Top-left finder */}
										<path fillRule="evenodd" d="M2 2h9v9H2V2zm2 2v5h5V4H4z" />
										<rect x="5.5" y="5.5" width="2" height="2" />
										{/* Top-right finder */}
										<path fillRule="evenodd" d="M13 2h9v9h-9V2zm2 2v5h5V4h-5z" />
										<rect x="16.5" y="5.5" width="2" height="2" />
										{/* Bottom-left finder */}
										<path fillRule="evenodd" d="M2 13h9v9H2v-9zm2 2v5h5v-5H4z" />
										<rect x="5.5" y="16.5" width="2" height="2" />
										{/* Data modules */}
										<rect x="13" y="13" width="2.5" height="2.5" />
										<rect x="17" y="13" width="2.5" height="2.5" />
										<rect x="15" y="15.5" width="2.5" height="2.5" />
										<rect x="13" y="18" width="2.5" height="2.5" />
										<rect x="17" y="18" width="2.5" height="2.5" />
										<rect x="19.5" y="15.5" width="2.5" height="2.5" />
										<rect x="13" y="20.5" width="2.5" height="2.5" />
									</svg>
								</button>
								<button
									className="rounded-lg px-3 py-1.5 text-sm font-medium"
									style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
									onClick={newSession}
									type="button"
								>
									+ New
								</button>
							</div>
						</div>
						<div className="chat-scroll" style={{ maxHeight: "calc(100vh - 12rem)", overflowY: "auto" }}>
							{sessions.map((s) => {
								const isActive = s.sessionId === activeSessionId;
								const isConfirming = confirmDeleteId === s.sessionId;
								const isRenaming = renamingId === s.sessionId;
								return (
									<div
										key={s.sessionId}
										className="mb-2 flex items-center rounded-xl"
										style={{
											background: isActive ? 'var(--primary-tint)' : 'var(--bg)',
											border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
										}}
									>
										{/* Clickable session info — or rename input */}
										{isRenaming ? (
											<div className="min-w-0 flex-1 p-3">
												<input
													className="w-full rounded bg-transparent text-sm font-medium outline-none"
													style={{ border: '1px solid var(--primary)', color: 'var(--text)', padding: '2px 6px' }}
													value={renameValue}
													maxLength={100}
													autoFocus
													onChange={(e) => setRenameValue(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === 'Enter') { e.preventDefault(); renameSession(s.sessionId, renameValue); }
														else if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
													}}
													onClick={(e) => e.stopPropagation()}
												/>
											</div>
										) : (
											<button
												className="min-w-0 flex-1 p-3 text-left"
												onClick={() => switchSession(s.sessionId)}
												type="button"
											>
												<div className="truncate text-sm font-medium">
													{s.summary ?? s.sessionId.slice(0, 8) + '…'}
												</div>
												<div className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
													{s.modifiedTime ? timeAgo(s.modifiedTime) : ''}
													{' · '}<button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (navigator.clipboard) { navigator.clipboard.writeText(s.sessionId); } else { const ta = document.createElement('textarea'); ta.value = s.sessionId; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } }} title="Copy full session ID" className="font-mono cursor-pointer hover:underline border-none bg-transparent p-0 text-xs" style={{ color: 'inherit' }}>{s.sessionId.slice(0, 8)}</button>
												</div>
											</button>
										)}

										{/* Action buttons */}
										{isRenaming ? (
											<div className="flex shrink-0 items-center gap-1 pr-2">
												<button
													onClick={(e) => { e.stopPropagation(); renameSession(s.sessionId, renameValue); }}
													className="rounded px-2 py-1 text-xs font-medium"
													style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
													type="button"
												>Save</button>
												<button
													onClick={(e) => { e.stopPropagation(); setRenamingId(null); }}
													className="rounded px-2 py-1 text-xs"
													style={{ background: 'var(--border)' }}
													type="button"
												>Cancel</button>
											</div>
										) : isConfirming ? (
											<div className="flex shrink-0 items-center gap-1 pr-2">
												<span className="text-xs" style={{ color: isActive ? 'var(--error)' : 'var(--text-muted)' }}>{isActive ? 'End + Delete?' : 'Delete?'}</span>
												<button
													onClick={(e) => deleteSession(s.sessionId, e)}
													className="rounded px-2 py-1 text-xs font-medium"
													style={{ background: 'var(--error)', color: 'white' }}
													type="button"
												>Yes</button>
												<button
													onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
													className="rounded px-2 py-1 text-xs"
													style={{ background: 'var(--border)' }}
													type="button"
												>No</button>
											</div>
										) : (
											<div className="flex shrink-0 items-center gap-0.5 pr-2">
												{/* Shield toggle */}
												<button
													onClick={(e) => toggleShield(s.sessionId, e)}
													className="rounded p-1.5 opacity-70 hover:opacity-100"
													title={s.shielded ? 'Remove shield' : 'Shield session'}
													type="button"
												>
													<svg className="size-4" viewBox="0 0 24 24" fill={s.shielded ? 'var(--shield)' : 'none'} stroke={s.shielded ? 'var(--shield)' : 'currentColor'} strokeWidth="2">
														<path d="M12 2L4 5v6c0 5.25 3.75 10.15 8 11 4.25-.85 8-5.75 8-11V5L12 2z" />
													</svg>
												</button>
												{/* Rename — disabled only if shielded (same pattern as delete) */}
												<button
													onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); setRenameValue(s.summary ?? ''); setRenamingId(s.sessionId); }}
													className="rounded p-1.5"
													style={{ opacity: s.shielded ? 0.25 : 0.7, cursor: s.shielded ? 'not-allowed' : 'pointer' }}
													title={s.shielded ? 'Remove shield to rename' : 'Rename session'}
													disabled={s.shielded}
													type="button"
												>
													<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
														<path d="M12 20h9" />
														<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
													</svg>
												</button>
												{/* Delete — disabled only if shielded */}
												<button
													onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.sessionId); }}
													className="rounded p-1.5"
													style={{ opacity: s.shielded ? 0.25 : 0.7, cursor: s.shielded ? "not-allowed" : "pointer" }}
													title={s.shielded ? 'Remove shield to delete' : isActive ? 'Delete current session' : 'Delete session'}
													disabled={s.shielded}
													type="button"
												>
													<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
														<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
													</svg>
												</button>
											</div>
										)}
									</div>
								);
							})}
							{sessions.length === 0 && (
								<div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
									{/* Arrow curving up toward the "+ New" button (top-right of this modal) */}
									<svg className="self-end" width="92" height="64" viewBox="0 0 92 64" fill="none" aria-hidden="true" style={{ color: 'var(--primary)', marginRight: '0.5rem' }}>
										<path d="M8 58 C 30 58, 70 50, 80 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
										<path d="M80 10 l -10 9 M80 10 l 2 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
									</svg>
									<h3 className="text-lg font-semibold">Welcome!</h3>
									<p className="text-sm" style={{ color: 'var(--text-muted)' }}>
										To get started, create a new session with the <strong>+ New</strong> button above.
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Header */}
			<header
				className="flex items-center justify-between border-b px-4 py-3"
				style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
			>
				<div className="flex items-center gap-2.5">
					<PortalLogo className="size-8" />
					<div>
						<span className="font-semibold">Copilot Portal</span>
						<div className="text-xs" style={{ color: 'var(--text-muted)' }}>v{__VERSION__} · {__BUILD__}</div>
					</div>
				</div>
				<div className="flex flex-col items-end gap-0.5">
					<div className="flex items-center gap-2.5">
						<button
							className="inline-flex items-center justify-center h-8 px-2 rounded-lg"
							style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
							onClick={openPicker}
							type="button"
							title="Sessions"
						>
							{/* stacked windows = sessions */}
							<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<rect x="3" y="7" width="14" height="11" rx="2" />
								<path d="M7 5h12a2 2 0 012 2v10" opacity="0.55" />
							</svg>
						</button>
						<button
							className="inline-flex items-center justify-center h-8 px-2 rounded-lg"
							style={{ background: 'var(--bg)', border: '1px solid var(--border)', opacity: draftSession ? 0.35 : 1 }}
							onClick={() => {
								if (draftSession) return;
								const opening = !showGuides;
								setShowGuides(opening);
								if (opening) apiFetch('/api/guides').then(r => r.json()).then(setGuides).catch(() => {});
							}}
							type="button"
							title="Guides and Prompts"
						>
							<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<path d="M2 6l7-2 6 2 7-2v16l-7 2-6-2-7 2V6z" />
								<line x1="9" y1="4" x2="9" y2="20" />
								<line x1="15" y1="6" x2="15" y2="22" />
							</svg>
						</button>
						<SquadButton onClick={() => setSquadPanelOpen(true)} />
						<button
							className="inline-flex items-center justify-center h-8 px-2 rounded-lg"
							style={{ background: approveAll ? 'var(--success-tint)' : rules.length > 0 ? 'var(--primary-tint)' : 'var(--bg)', border: `1px solid ${approveAll ? 'var(--success)' : rules.length > 0 ? 'var(--primary)' : 'var(--border)'}`, color: approveAll ? 'var(--success)' : rules.length > 0 ? 'var(--primary)' : undefined, opacity: draftSession ? 0.35 : 1 }}
							onClick={() => { if (!draftSession) setShowRules(v => !v); }}
							type="button"
							title={approveAll ? 'Auto-approve all (yolo) enabled' : `Always-allow rules (${rules.length})`}
						>
							{rules.length > 0 ? (
								<span className="flex items-center gap-1">
									<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
										<circle cx="5" cy="7" r="1.5" fill="currentColor" stroke="none"/>
										<line x1="9" y1="7" x2="20" y2="7"/>
										<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
										<line x1="9" y1="12" x2="20" y2="12"/>
										<circle cx="5" cy="17" r="1.5" fill="currentColor" stroke="none"/>
										<line x1="9" y1="17" x2="20" y2="17"/>
									</svg>
									<span className="text-xs font-medium leading-none">{rules.length}</span>
								</span>
							) : (
								<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
									<circle cx="5" cy="7" r="1.5" fill="currentColor" stroke="none"/>
									<line x1="9" y1="7" x2="20" y2="7"/>
									<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
									<line x1="9" y1="12" x2="20" y2="12"/>
									<circle cx="5" cy="17" r="1.5" fill="currentColor" stroke="none"/>
									<line x1="9" y1="17" x2="20" y2="17"/>
								</svg>
							)}
						</button>
						<div className="relative">
						<button
							className="inline-flex items-center justify-center h-8 px-2 rounded-lg"
							style={{ background: 'var(--bg)', border: '1px solid var(--border)', opacity: draftSession ? 0.35 : 1 }}
							onClick={() => { if (!draftSession) setShowThemePicker(v => !v); }}
							type="button"
							title={`Theme: ${activePreset.name}`}
						>
							<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<circle cx="12" cy="12" r="10" />
								<path d="M12 2a7 7 0 000 20" fill="currentColor" opacity="0.3" />
							</svg>
						</button>
						</div>
						<div className="flex flex-col gap-1 items-center" title={`Portal: ${connectionState}\nCopilot: ${connectionState !== 'connected' ? 'unreachable' : cliStatus}`}>
							<div
								className="rounded-full"
								style={{
									width: 6, height: 6,
									background:
										connectionState === 'connected'
											? 'var(--success)'
											: connectionState === 'connecting'
												? 'var(--tool-call)'
												: 'var(--error)',
								}}
							/>
							<div
								className="rounded-full"
								style={{
									width: 6, height: 6,
									background:
										connectionState !== 'connected'
											? 'var(--error)'
											: cliStatus === 'connected'
												? 'var(--success)'
												: cliStatus === 'restarting'
													? 'var(--tool-call)'
													: 'var(--error)',
								}}
							/>
						</div>
					</div>
					</div>
			</header>

			{/* Chat */}
			<main className="flex flex-1 flex-col overflow-hidden">
				{/* Session info drawer — always visible when connected or in draft mode */}
				{(connectionState === 'connected' || draftSession) && (
					<SessionDrawer
						open={drawerOpen}
						onToggle={() => setDrawerOpen(v => !v)}
						info={portalInfo}
						context={sessionContext}
						activeModel={activeModel}
						onChangeModel={changeModel}
						onFetchModels={() => apiFetch('/api/models').then(r => r.json())}
						onFetchQuota={() => apiFetch('/api/quota').then(r => r.json())}
					activeSessionId={activeSessionId}
					sessionSummary={activeSessionSummary}
					sessionStartTime={sessions.find(s => s.sessionId === activeSessionId)?.startTime}
					sessionUsage={sessionUsage}
					sessionQuota={sessionQuota}
					contextUsage={contextUsage}
					draft={draftSession}
					onDraftCwdChange={(cwd) => setDraftSession(prev => prev ? { ...prev, cwd } : null)}
					onCreateDraft={() => createDraftSession()}
					onChangeCwd={async (newCwd) => {
						if (!activeSessionId) return;
						await apiFetch(`/api/sessions/${encodeURIComponent(activeSessionId)}/cwd`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ workingDirectory: newCwd }),
						});
						setSessionContext({ cwd: newCwd });
					}}
					onAgentChange={setActiveAgent}
					onMcpChanged={() => {
						// Auto-restart CLI and reload after MCP config changes
						setNotification({ type: 'info', message: 'Restarting CLI server…' });
						apiFetch('/api/restart-cli', { method: 'POST' }).catch(() => {});
						// cli_status 'connected' event will trigger auto-reload
					}}
					mcpServers={mcpServers}
					setMcpServers={setMcpServers}
					mcpConfirm={mcpConfirm}
					setMcpConfirm={setMcpConfirm}
					skills={skills}
					/>
				)}

				{/* Update banner */}
				{updateStatus && !updateDismissed && (() => {
					const updatable = updateStatus.packages.filter(p => p.hasUpdate);
					const portalUpdate = updateStatus.portal?.hasUpdate ? updateStatus.portal : null;
					const restart = updateStatus.restartNeeded;
					// Nothing to show: no updates, not applying, no error, no restart pending
					if (updatable.length === 0 && !portalUpdate && !updateStatus.applying && !updateStatus.error && !restart) return null;

					return (
						<div
							className="flex items-center gap-2 px-4 py-2 text-xs"
							style={{ background: restart ? 'var(--success-tint)' : 'var(--primary-tint)', borderBottom: '1px solid var(--border)' }}
						>
							{/* Icon */}
							<svg className="size-4 shrink-0" fill="none" stroke={restart ? 'var(--success)' : 'var(--primary)'} strokeWidth="2" viewBox="0 0 24 24">
								{restart
									? <path d="M4 4v5h5M20 20v-5h-5M5 19.5A9 9 0 0112 3m7 1.5A9 9 0 0112 21" strokeLinecap="round" strokeLinejoin="round" />
									: <path d="M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
								}
							</svg>

							{updateStatus.applying ? (
								<span className="flex-1" style={{ color: 'var(--text)' }}>Updating… this may take a minute</span>
							) : updateStatus.error ? (
								<span className="flex-1" style={{ color: 'var(--error)' }}>Update failed: {updateStatus.error}</span>
							) : restart ? (
								<span className="flex-1" style={{ color: 'var(--text)' }}>Update installed — restart to apply</span>
							) : (
								<span className="flex-1" style={{ color: 'var(--text)' }}>
									{[
										portalUpdate ? `Portal v${portalUpdate.installed} → v${portalUpdate.latest}` : '',
										...updatable.map(p => `${p.name.replace('@github/', '')} ${p.installed} → ${p.latest}`),
									].filter(Boolean).join(', ')}
								</span>
							)}

							{/* Action buttons */}
							{!updateStatus.applying && !restart && (portalUpdate || updatable.length > 0) && (
								<button
									type="button"
									className="rounded-md px-2.5 py-1 text-xs font-medium"
									style={{ background: 'var(--primary)', color: 'var(--primary-contrast)' }}
									onClick={async () => {
										setUpdateStatus(prev => prev ? { ...prev, applying: true, error: null } : prev);
										try {
											if (portalUpdate) {
												const res = await apiFetch('/api/updates/apply-portal', { method: 'POST' });
												const status = await res.json() as UpdateStatus;
												// Don't show restart yet if npm updates are also pending
												if (updatable.length > 0) {
													setUpdateStatus({ ...status, restartNeeded: false });
												} else {
													setUpdateStatus(status);
												}
											}
											if (updatable.length > 0) {
												// Fire and forget — npm install can take minutes
												apiFetch('/api/updates/apply', { method: 'POST' }).catch(() => {});
												// Poll for completion
												const poll = setInterval(async () => {
													try {
														const res = await apiFetch('/api/updates');
														const status = await res.json() as UpdateStatus;
														if (!status.applying) {
															clearInterval(poll);
															setUpdateStatus({ ...status, restartNeeded: true });
														}
													} catch { /* server busy */ }
												}, 3000);
												return;
											}
										} catch (e) {
											setUpdateStatus(prev => prev ? { ...prev, applying: false, error: String(e) } : prev);
										}
									}}
								>
									Update
								</button>
							)}
							{restart && (
								<button
									type="button"
									className="rounded-md px-2.5 py-1 text-xs font-medium"
									style={{ background: 'var(--success)', color: 'var(--button-contrast)' }}
									onClick={() => {
										restartServer();
										setUpdateStatus(prev => prev ? { ...prev, restartNeeded: false } : prev);
										setNotification({ type: 'info', message: 'Restarting server… refresh when ready.' });
									}}
								>
									Restart
								</button>
							)}
							{!updateStatus.applying && (
								<button
									type="button"
									className="rounded-md px-2 py-1 text-xs"
									style={{ color: 'var(--text-muted)' }}
									onClick={() => setUpdateDismissed(true)}
								>
									✕
								</button>
							)}
						</div>
					);
				})()}

				{/* PWA install hint — mobile only, 2nd+ visit, not already installed, not dismissed */}
				{!pwaDismissed && pwaVisitCount >= 2
					&& /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
					&& !window.matchMedia('(display-mode: standalone)').matches
					&& (
					<div className="flex items-center justify-between px-4 py-2 text-xs" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
						<span className="flex items-center gap-1.5"><svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg> <span>Tip: Use your browser's <b>Share → Add to Home Screen</b> for an app-like experience</span></span>
						<button
							className="ml-3 px-1.5 rounded"
							style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontSize: '14px' }}
							onClick={() => { setPwaDismissed(true); localStorage.setItem('portal_pwa_dismissed', '1'); }}
						>✕</button>
					</div>
				)}

				<div ref={chatScrollRef} className="chat-scroll flex-1 overflow-y-auto p-4 space-y-4"
					onScroll={() => {
						const el = chatScrollRef.current;
						if (!el) return;
						const top = el.scrollTop;
						const prev = lastScrollTopRef.current;
						lastScrollTopRef.current = top;
						const atBottom = el.scrollHeight - top - el.clientHeight < 80;
						if (atBottom) {
							// Reached the bottom (by user or by our own auto-scroll) → re-engage.
							stickToBottomRef.current = true;
						} else if (top < prev - 2) {
							// Scrolled UP (>2px to ignore sub-pixel jitter) — only a user does
							// this; auto-scroll only ever moves down. Covers wheel, touch,
							// scrollbar drag, and keyboard uniformly.
							stickToBottomRef.current = false;
						}
						// Downward / unchanged motion (our auto-scroll, or user heading toward
						// the bottom) → leave the current engagement state as-is.
					}}>
					{historyTruncated && (() => {
						const { shown, total } = historyTruncated;
						const makeUrl = (n: number | 'all') => {
							const u = new URL(window.location.href);
							u.searchParams.set('history', String(n));
							return u.toString();
						};
						// Dynamic steps: modest bump (+150), half, all
						const steps: { label: string; value: number | 'all' }[] = [];
						const step1 = shown + 150;
						const step2 = Math.floor(total / 2);
						if (step1 < total) steps.push({ label: String(step1), value: step1 });
						if (step2 > (steps.length ? (steps[steps.length - 1].value as number) : shown) && step2 < total)
							steps.push({ label: String(step2), value: step2 });
						steps.push({ label: 'ALL', value: 'all' });
						const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' as const, cursor: 'pointer' as const };
						return (
							<div style={{ textAlign: 'center', padding: '8px 12px', marginBottom: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
								Showing {shown} of {total} messages. Load more:{' '}
								{steps.map((s, i) => (
									<span key={s.label}>{i > 0 && ' · '}<a href={makeUrl(s.value)} style={linkStyle}>{s.label}</a></span>
								))}
							</div>
						);
					})()}
					{/* Interleave messages and tool events by timestamp */}
					{(() => {
						// Consolidate consecutive tool-only messages (no text, just toolSummary)
						const visibleMessages = messages.filter(m => m.content.trim() || m.toolSummary?.length || m.images?.length);
						const consolidated: Message[] = [];
						for (const msg of visibleMessages) {
							const isToolOnly = !msg.content.trim() && msg.toolSummary?.length;
							const prev = consolidated[consolidated.length - 1];
							const prevIsToolOnly = prev && !prev.content.trim() && prev.toolSummary?.length;
							if (isToolOnly && prevIsToolOnly && prev.toolSummary) {
								// Merge into previous tool-only message
								consolidated[consolidated.length - 1] = {
									...prev,
									toolSummary: [...prev.toolSummary, ...(msg.toolSummary ?? [])],
								};
							} else {
								consolidated.push(msg);
							}
						}
						const allItems: Array<{ type: 'message'; msg: Message } | { type: 'tool'; tc: ToolEvent }> = [
							...consolidated.map(msg => ({ type: 'message' as const, msg, ts: msg.timestamp })),
							...toolEvents.map(tc => ({ type: 'tool' as const, tc, ts: tc.timestamp })),
						].sort((a, b) => a.ts - b.ts);
						// Pin queued user messages to the bottom — they haven't been "heard" yet
						const items = allItems.filter(i => !(i.type === 'message' && i.msg.queued));
						const queued = allItems.filter(i => i.type === 'message' && i.msg.queued);
						items.push(...queued);

						return items.map((item) => {
							if (item.type === 'tool') {
								return <ToolEventBox key={item.tc.id} tc={item.tc} />;
							}
							const msg = item.msg;
							const isIntermediate = msg.role === 'assistant' && msg.intermediate;
						return (
						<div key={msg.id}>
						<div className="flex" style={{ justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
							<div
								className={msg.role === 'user' ? 'relative max-w-[85%] px-4 py-3 text-sm' : 'relative w-full px-4 py-3 text-sm'}
								style={
									msg.role === 'user'
										? { background: 'var(--primary)', color: 'var(--primary-contrast)', borderRadius: '18px 18px 2px 18px', opacity: msg.queued ? 0.5 : undefined, animation: msg.queued ? 'pulse 2s ease-in-out infinite' : undefined }
										: {
												background: isIntermediate ? 'transparent' : 'var(--surface)',
												border: isIntermediate ? '0px solid transparent' : '1px solid var(--border)',
												borderLeft: isIntermediate ? '2px dashed var(--border)' : undefined,
												borderBottom: isIntermediate ? '2px dashed var(--border)' : undefined,
												borderRadius: isIntermediate ? '0' : '18px 18px 18px 2px',
												borderBottomLeftRadius: isIntermediate ? '8px' : undefined,
												opacity: isIntermediate ? 0.75 : undefined,
												paddingLeft: isIntermediate ? '12px' : undefined,
												paddingTop: isIntermediate ? '4px' : undefined,
												paddingBottom: isIntermediate ? '4px' : undefined,
											}
								}
							>
								{msg.role === 'assistant' && msg.toolSummary && msg.toolSummary.length > 0 && (
									<details style={{ marginBottom: '8px' }}>
										<summary style={{
											cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center',
											gap: '5px', fontSize: '11px', color: 'var(--text-muted)', userSelect: 'none',
										}}>
											<span><svg className="size-3.5 shrink-0 inline align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>
											<span>{msg.toolSummary.length} tool{msg.toolSummary.length > 1 ? 's' : ''} ran</span>
										</summary>
										<div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
											{msg.toolSummary.map((t, i) => (
												<div key={i}>
													{t.intentionSummary && (
														<div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
															<span style={{ flexShrink: 0, color: 'var(--purple)' }}>●</span>
															<span>{t.intentionSummary}</span>
														</div>
													)}
													<div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', paddingLeft: t.intentionSummary ? '12px' : undefined }}>
														<span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 11, height: 11 }}>{t.completed ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg> : '·'}</span>
														<span style={{ fontWeight: 600, flexShrink: 0 }}>{t.toolName}</span>
														{t.display && <span style={{ opacity: 0.8, wordBreak: 'break-all' }}>{t.display}</span>}
													</div>
												</div>
											))}
										</div>
									</details>
								)}
								{msg.role === 'assistant' && msg.questionChoices && msg.questionChoices.length > 0 && (
									<details style={{ marginBottom: '8px' }}>
										<summary style={{
											cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center',
											gap: '5px', fontSize: '11px', color: 'var(--text-muted)', userSelect: 'none',
										}}>
											<span>⦿</span>
											<span>{msg.questionChoices.length} option{msg.questionChoices.length > 1 ? 's' : ''}</span>
										</summary>
										<div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
											{msg.questionChoices.map((choice, i) => (
												<div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
													<span style={{ flexShrink: 0 }}>○</span>
													<span>{choice}</span>
												</div>
											))}
										</div>
									</details>
								)}
								{msg.role === 'assistant' && msg.reasoning && (
									<details style={{ marginBottom: '8px' }}>
										<summary style={{
											cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center',
											gap: '5px', fontSize: '11px', color: 'var(--text-muted)', userSelect: 'none',
										}}>
											<span><svg className="size-3.5 shrink-0 inline align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="11" rx="9" ry="7"/><circle cx="5" cy="20" r="1.5"/><path d="M7 17.5c-.8.5-1.5 1.2-1.8 2"/><circle cx="9" cy="11" r="0.5" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r="0.5" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="0.5" fill="currentColor" stroke="none"/></svg></span>
											<span>Thought</span>
										</summary>
										<div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
											{msg.reasoning}
										</div>
									</details>
								)}
								{msg.images && msg.images.length > 0 && (
									<div className="mb-2">
										{msg.imageTool && (
											<div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', marginBottom: '4px' }}>
												<span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 11, height: 11 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
												<span style={{ fontWeight: 600, flexShrink: 0 }}>{msg.imageTool.toolName}</span>
												{msg.imageTool.display && <span style={{ opacity: 0.8, wordBreak: 'break-all' }}>{msg.imageTool.display}</span>}
											</div>
										)}
										<div className="flex gap-2 flex-wrap">
											{msg.images.map((src, i) => (
												<img key={i} src={src} alt="Image" className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity" style={{ maxHeight: 150, maxWidth: '100%', objectFit: 'contain' }} onClick={() => { setLightboxDims(null); setLightboxImage(src); }} />
											))}
										</div>
									</div>
								)}
								{msg.role === 'assistant'
									? (msg.content.trim() || !msg.images?.length
										? <AssistantMessageBlock content={msg.content} timestamp={msg.timestamp} bytes={msg.bytes} />
										: null)
									: <>
										{msg.askUserChoices && msg.askUserChoices.length > 0 && (
											<details style={{ marginBottom: '6px' }}>
												<summary style={{
													cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center',
													gap: '5px', fontSize: '11px', opacity: 0.7, userSelect: 'none',
												}}>
													<span><svg className="size-3.5 shrink-0 inline align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span>
													<span>Selected</span>
												</summary>
												<div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
													{msg.askUserChoices.map((choice, i) => (
														<div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '11px', opacity: 0.8 }}>
															<span style={{ flexShrink: 0 }}>{choice === msg.content ? '●' : '○'}</span>
															<span>{choice}</span>
														</div>
													))}
												</div>
											</details>
										)}
										<div className="whitespace-pre-wrap break-words">{msg.content}</div>
										<div className="mt-1 flex items-center justify-between gap-2 text-xs opacity-50">
											<span>
												{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
												{msg.queued && ' • queued'}
											</span>
											<CopyButton text={msg.content} />
										</div>
									</>
								}
							</div>
						</div>
						</div>
						);
					});
					})()}

					{isThinking && (
						<div className="mb-2 flex items-center gap-2 py-1 text-sm" style={{ color: 'var(--text-muted)' }}>
							<span className="flex shrink-0 gap-1">
								{[0, 0.2, 0.4].map((delay) => (
									<span
										key={delay}
										className="size-1.5 rounded-full"
										style={{
											background: 'var(--text-muted)',
											animation: `thinking 1.2s ${delay}s infinite`,
											display: 'inline-block',
										}}
									/>
								))}
							</span>
							<span className="truncate italic">
								{thinkingText ? thinkingText.slice(-80) : 'Thinking…'}
							</span>
						</div>
					)}

					{isStreaming && streamingContent && (
						<div
							className="relative mb-3 w-full rounded-xl px-4 py-3 text-sm"
							style={{
								background: 'var(--surface)',
								border: '1px solid var(--border)',
								borderRadius: '18px 18px 18px 2px',
							}}
						>
							<span className="absolute right-2 top-1 font-mono opacity-30 select-none" style={{ fontSize: '8px' }}>live</span>
							<AssistantMarkdown content={streamingContent} />
							<span
								className="ml-0.5 inline-block size-2 align-text-bottom"
								style={{ background: 'var(--primary)', animation: 'blink 1s infinite' }}
							/>
						</div>
					)}

					{notification && (
						<div
							className="mb-2 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
							style={{
								background: notification.type === 'warning' ? 'var(--warning-tint)' : 'var(--primary-tint)',
								border: `1px solid ${notification.type === 'warning' ? 'var(--warning)' : 'var(--accent)'}`,
								color: notification.type === 'warning' ? 'var(--warning)' : 'var(--accent)',
							}}
						>
							<span className="flex-1 flex items-center gap-1.5 flex-wrap">
								<span className="flex items-center gap-1 font-bold shrink-0">{notification.type === 'warning' ? <><svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Warning:</> : <><svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 14c0 3.87-4.03 7-9 7a10.2 10.2 0 0 1-4.36-.95L2 22l1.5-4.2C2.55 16.36 2 14.74 2 13c0-3.87 4.03-7 9-7h1c4.42.2 8 3.58 8 7v1Z"/></svg> Note:</>}</span> {notification.message}{notification.count && notification.count > 1 ? ` (×${notification.count})` : ''}
							</span>
							{notification.action && (
								<button
									type="button"
									className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
									style={{ background: notification.type === 'warning' ? 'var(--warning)' : 'var(--accent)', color: 'var(--button-contrast)' }}
									onClick={notification.action.onClick}
								>{notification.action.label}</button>
							)}
							{notification.action && (
								<button
									type="button"
									className="shrink-0 rounded px-1.5 py-0.5 text-xs"
									style={{ opacity: 0.7 }}
									onClick={() => setNotification(null)}
								>✕</button>
							)}
						</div>
					)}

					{error && (
						<div
							className="mb-2 rounded-xl px-4 py-3 text-sm"
							style={{ background: 'var(--error-tint)', border: '1px solid var(--error)', color: 'var(--error)' }}
						>
							<strong>Error:</strong> {error}
						</div>
					)}

					<div ref={chatEndRef} />
				</div>

				{/* Pinned interaction zone — approval & input cards sit above the input bar */}
				{(pendingApproval || pendingInput || cliApprovalInfo || cliInputInfo) && (
					<div className="chat-scroll border-t px-4 pt-3 pb-1" style={{ borderColor: 'var(--border)', background: 'var(--surface)', maxHeight: '70vh', overflowY: 'auto' }}>

						{cliApprovalInfo && (
							<div className="mb-2 rounded-xl border p-3" style={{ borderColor: 'var(--text-muted)', background: 'var(--muted-tint)' }}>
								<div className="mb-1 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
									<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> CLI waiting for approval
								</div>
								<div className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{cliApprovalInfo}</div>
								<div className="mt-1 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Approve or deny in your terminal to continue.</div>
							</div>
						)}
						{cliInputInfo && (
							<div className="mb-2 rounded-xl border p-3" style={{ borderColor: 'var(--accent)', background: 'var(--primary-tint)' }}>
								<div className="mb-1 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
									<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 14c0 3.87-4.03 7-9 7a10.2 10.2 0 0 1-4.36-.95L2 22l1.5-4.2C2.55 16.36 2 14.74 2 13c0-3.87 4.03-7 9-7h1c4.42.2 8 3.58 8 7v1Z"/></svg> CLI waiting for your input
								</div>
								<div className="text-xs" style={{ color: 'var(--text)' }}>{cliInputInfo}</div>
								<div className="mt-1 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Respond in your terminal to continue.</div>
							</div>
						)}
						{pendingApproval && (
							<div className="mb-2 rounded-xl border p-3" style={{ borderColor: 'var(--tool-call)', background: 'var(--tool-call-tint)' }}>
								<div className="mb-1 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--tool-call)' }}>
									<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Permission Request — <span className="font-mono text-xs">{pendingApproval.action}</span>
								</div>
								<pre className="chat-scroll mb-2 overflow-auto rounded px-3 py-2 text-xs font-mono" style={{ background: 'var(--bg)', color: 'var(--text)', maxHeight: 80 }}>{pendingApproval.summary}</pre>
								{pendingApproval.warning && (
									<div className="mb-2 flex items-center gap-1.5 rounded px-2 py-1 text-xs" style={{ background: 'var(--warning-tint)', color: 'var(--tool-call)' }}>
										<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> {pendingApproval.warning}
									</div>
								)}
								<div className="flex flex-col gap-1.5">
									<div className="flex gap-2">
										<button className="flex-1 rounded-lg py-2 text-sm font-medium" style={{ background: 'var(--success)', color: 'white' }} onClick={() => respondApproval(true)} type="button">Allow</button>
										<button className="flex-1 rounded-lg py-2 text-sm font-medium" style={{ background: 'var(--error)', color: 'white' }} onClick={() => respondApproval(false)} type="button">Deny</button>
									</div>
									{pendingApproval.alwaysPattern && (
										<button
											className="w-full rounded-lg py-1.5 text-xs font-medium"
											style={{ background: 'var(--tool-call-tint)', border: '1px solid var(--tool-call)', color: 'var(--tool-call)' }}
											onClick={respondApprovalAlways}
											type="button"
										>
											Allow Always: <code className="font-mono">{pendingApproval.alwaysPattern}</code>
										</button>
									)}
								</div>
							</div>
						)}
						{pendingInput && (
							<div className="mb-2 rounded-xl border p-3" style={{ borderColor: 'var(--primary)', background: 'var(--primary-tint)' }}>
								<div className="mb-2 text-sm"><AssistantMarkdown content={pendingInput.question} /></div>
								{pendingInput.choices && pendingInput.choices.length > 0 && (
									<div className="flex flex-col gap-1.5">
										{pendingInput.choices.map((choice, i) => (
											<div key={i} className="flex items-stretch gap-1">
												<button
													className="flex-1 rounded-lg px-3 py-2 text-left text-sm"
													style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
													onClick={() => {
														if (answerFreeform) {
															// Append to the composer so the user can pick several / edit before sending.
															setInput(prev => prev.trim() ? `${prev.replace(/\s+$/, '')}\n${choice}` : choice);
															textareaRef.current?.focus();
														} else {
															respondInput(choice, false);
														}
													}}
													type="button"
												>{choice}</button>
												{answerFreeform && (
													<button
														className="flex shrink-0 items-center justify-center rounded-lg px-2.5"
														style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--primary)' }}
														onClick={() => respondInput(choice, false)}
														type="button"
														title="Send this answer"
													>
														<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 15, height: 15, transform: 'translate(-0.5px, 0.5px)' }}>
															<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
														</svg>
													</button>
												)}
											</div>
										))}
									</div>
								)}
								{pureChoiceMode && (
									<button
										className="mt-2 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
										style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--error)' }}
										onClick={(e) => { e.preventDefault(); stopAgent(); }}
										type="button"
										title="Stop the turn"
									>
										<svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
										Stop
									</button>
								)}
							</div>
						)}
					</div>
				)}

				{/* Input */}
				{!noSession && (!pendingInput || answerFreeform) && <>
				<form
					className="border-t px-4 py-3"
					style={{
						background: 'var(--surface)',
						borderColor: isDraggingImage ? 'var(--primary)' : 'var(--border)',
						paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
						outline: isDraggingImage ? '2px dashed var(--primary)' : undefined,
						outlineOffset: '-2px',
						transition: 'outline 0.15s, border-color 0.15s',
					}}
					onSubmit={(e) => {
						e.preventDefault();
						if (answerFreeform) { const a = input.trim(); if (a) respondInput(a, true); }
						else sendPrompt();
					}}
					onDragOver={(e) => { if (answerFreeform) return; e.preventDefault(); if (e.dataTransfer?.types.includes('Files')) setIsDraggingImage(true); }}
					onDragLeave={() => setIsDraggingImage(false)}
					onDrop={(e) => {
						if (answerFreeform) return;
						e.preventDefault();
						setIsDraggingImage(false);
						if (e.dataTransfer?.files.length) addImageFiles(e.dataTransfer.files);
					}}
				>
					<div ref={inputContainerRef} className="relative flex items-end gap-1">
						<div className="flex-1 relative">
							{/* Prompts overlay — floats above input */}
							{showPromptsTray && sessionPrompts.length > 0 && (
								<div className="absolute inset-x-0 bottom-full z-10 overflow-hidden" style={{ border: '1px solid var(--border)', borderBottom: 'none', borderRadius: '0.75rem 0.75rem 0 0', boxShadow: '0 -8px 24px rgba(0,0,0,0.3)' }}>
									<div className="chat-scroll flex flex-col gap-1 px-3 pt-2 pb-3" style={{ maxHeight: 240, overflowY: 'auto', background: 'var(--bg)' }} onScroll={e => {
										const el = e.currentTarget;
										setPromptsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 4);
									}}>
										{sessionPrompts.map((p, i) => (
											<div key={i} className="flex items-center gap-1">
												<button
													type="button"
													className="flex-1 rounded-lg px-3 py-2 text-left text-sm"
													style={{ color: 'var(--text)' }}
													onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
													onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
													onClick={() => {
														setInput(p.text);
														setShowPromptsTray(false);
														textareaRef.current?.focus();
													}}
												>
													{p.label}
												</button>
												{confirmDeletePrompt === p.label ? (
													<span className="flex shrink-0 gap-1" onClick={e => e.stopPropagation()}>
														<button className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--error)', color: 'white' }} onClick={() => { removeSessionPrompt(p.label); setConfirmDeletePrompt(null); }} type="button">Delete</button>
														<button className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setConfirmDeletePrompt(null)} type="button">Cancel</button>
													</span>
												) : (
													<button
														type="button"
														className="shrink-0 rounded p-1 opacity-30 hover:opacity-70"
														style={{ color: 'var(--text-muted)' }}
														onClick={() => setConfirmDeletePrompt(p.label)}
														title="Remove prompt"
													>
														<svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
															<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
														</svg>
													</button>
												)}
											</div>
										))}
									</div>
									{sessionPrompts.length > 5 && !promptsAtBottom && (
										<div className="pointer-events-none absolute top-0 left-0 right-0" style={{ height: 24, background: 'linear-gradient(var(--bg) 0%, transparent 80%)' }} />
									)}
								</div>
							)}
							<div className="border" style={{ borderColor: 'var(--border)', background: 'var(--bg)', borderRadius: showPromptsTray && sessionPrompts.length > 0 ? '0 0 0.75rem 0.75rem' : '0.75rem' }}>
							<div className="relative">
								{pendingImages.length > 0 && (
									<div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto">
										{pendingImages.map((img, i) => (
											<div key={i} className="relative shrink-0 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
												<img src={`data:${img.mimeType};base64,${img.data}`} alt={img.name} className="block" style={{ height: 64, maxWidth: 120, objectFit: 'cover' }} />
												<button type="button" className="absolute top-0.5 right-0.5 rounded-full p-0.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))} title="Remove">
													<svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
												</button>
											</div>
										))}
									</div>
								)}
								<textarea
									ref={textareaRef}
									id="message-input"
									name="message"
									className="chat-scroll w-full resize-none bg-transparent pl-4 pr-16 py-3 text-sm outline-none"
									style={{ color: 'var(--text)', minHeight: 44, maxHeight: 200, overflow: 'auto', transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)' }}
									placeholder={answerFreeform ? 'Type your answer…' : draftSession ? 'Ask Copilot… (session will be created)' : loadingHistory ? `Loading… ${loadingSecs}s (${loadingHistory.sizeMB} MB)` : connectionState === 'connected' ? (activeAgent ? `Ask ${activeAgent} agent…` : 'Ask Copilot…') : `Connecting… ${connectingSecs}s`}
									disabled={!draftSession && connectionState !== 'connected'}
									rows={1}
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onPaste={(e) => {
										// ask_user answers are text-only — let images paste normally elsewhere, but not here.
										if (answerFreeform) return;
										const items = e.clipboardData?.items;
										if (!items) return;
										const files: File[] = [];
										for (const item of items) {
											if (item.type.startsWith('image/')) {
												e.preventDefault();
												const file = item.getAsFile();
												if (file) files.push(file);
											}
										}
										if (files.length) addImageFiles(files);
									}}
									enterKeyHint="enter"
									onKeyDown={(e) => {
										// Touch devices (iOS): Enter adds newlines — send via button only.
										// Desktop: Enter sends, Shift+Enter adds newline.
										const isTouch = window.matchMedia('(hover: none)').matches;
										if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
											e.preventDefault();
											if (answerFreeform) { const a = input.trim(); if (a) respondInput(a, true); }
											else sendPrompt();
										}
									}}
								/>
								{sessionPrompts.length > 0 && (
									<button
										type="button"
										title="Canned prompts"
										onClick={() => setShowPromptsTray(prev => !prev)}
										className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded opacity-40 hover:opacity-80"
										style={{ color: showPromptsTray ? 'var(--primary)' : 'var(--text-muted)' }}
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
											<path d="M3 15a2 2 0 0 0 2 2h12l4 4V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
											<path d="M8 9h8M8 13h5" />
										</svg>
									</button>
								)}
							</div>
						</div>
						</div>
						<div className="shrink-0 flex items-end" style={{ alignSelf: 'flex-end', marginBottom: 4, gap: 6 }}>
							<input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) { addImageFiles(e.target.files); e.target.value = ''; } }} />
							<div className="flex flex-col items-center justify-end" style={{ gap: 4, alignSelf: 'flex-end' }}>
								{!answerFreeform && (
								<button
									className="flex size-6 items-center justify-center rounded-full border-none opacity-40 hover:opacity-80"
									style={{ background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
									type="button"
									title="Attach image"
									onClick={() => fileInputRef.current?.click()}
								>
									<svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
										<rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
									</svg>
								</button>
								)}
								{!input && messages.filter(m => m.role === 'user').length > 0 ? (
									<button
										type="button"
										title="Recall last message"
										onClick={() => { const msgs = messages.filter(m => m.role === 'user'); if (msgs.length) setInput(msgs[msgs.length - 1].content); }}
										className="flex size-6 items-center justify-center rounded opacity-40 hover:opacity-80"
										style={{ color: 'var(--text-muted)', transform: 'translateY(3px)' }}
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
											<polyline points="9 10 4 15 9 20"/>
											<path d="M20 4v7a4 4 0 0 1-4 4H4"/>
										</svg>
									</button>
								) : input ? (
									<button
										type="button"
										title="Clear"
										onClick={() => { setInput(''); textareaRef.current?.focus(); }}
										className="flex size-6 items-center justify-center rounded opacity-40 hover:opacity-80"
										style={{ color: 'var(--text-muted)', transform: 'translateY(3px)' }}
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4">
											<path d="M18 6L6 18M6 6l12 12"/>
										</svg>
									</button>
								) : <div className="size-6" />}
							</div>
							<div style={{
								position: 'relative',
								width: 44, height: stackButtons ? 96 : 44,
								alignSelf: 'flex-end',
								transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
							}}>
								{/* Send — anchored at the baseline; small overlap during an idle turn, full-size otherwise */}
								<button
									className="flex items-center justify-center rounded-full border-none"
									style={{
										position: 'absolute',
										zIndex: 1,
										transition: 'top 300ms cubic-bezier(0.4, 0, 0.2, 1), left 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1), height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
										width: stackButtons ? 44 : (stopAvailable ? 23 : 44),
										height: stackButtons ? 44 : (stopAvailable ? 23 : 44),
										top: stackButtons ? 52 : (stopAvailable ? 21 : 0),
										left: 0,
										background: input.trim() && connectionState === 'connected' ? 'var(--primary)' : 'var(--border)',
										color: 'white',
										boxShadow: 'none',
										cursor: input.trim() && (connectionState === 'connected' || draftSession) ? 'pointer' : 'default',
									}}
									disabled={(!input.trim() && pendingImages.length === 0) || (!draftSession && connectionState !== 'connected')}
									type="submit"
									title={answerFreeform ? 'Send answer' : 'Send'}
								>
									<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
										style={{ width: stackButtons ? 20 : (stopAvailable ? 11 : 20), height: stackButtons ? 20 : (stopAvailable ? 11 : 20), transform: 'translate(-0.5px, 0.5px)', transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1), height 300ms cubic-bezier(0.4, 0, 0.2, 1)' }}>
										<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
									</svg>
								</button>
								{/* Stop — prominent overlap when composer empty; rises to a full-size button above Send when composing */}
								<button
									className="flex items-center justify-center rounded-full border-none"
									style={{
										position: 'absolute',
										zIndex: 2,
										top: 0,
										left: stackButtons ? 0 : 14,
										width: stackButtons ? 44 : 30,
										height: stackButtons ? 44 : 30,
										background: 'var(--error)',
										color: 'white',
										cursor: stopAvailable ? 'pointer' : 'default',
										transition: 'opacity 250ms cubic-bezier(0.34, 1.56, 0.64, 1) 80ms, transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1) 80ms, top 300ms cubic-bezier(0.4, 0, 0.2, 1), left 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1), height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
										opacity: stopAvailable ? (isStopping ? 0.6 : 1) : 0,
										transform: stopAvailable ? 'scale(1)' : 'scale(0.3)',
										pointerEvents: stopAvailable ? 'auto' : 'none',
										animation: isStopping ? 'blink 1s infinite' : 'none',
									}}
									onClick={(e) => { e.preventDefault(); stopAgent(); }}
									disabled={isStopping}
									type="button"
									title={isStopping ? 'Stopping…' : 'Stop'}
								>
									<svg style={{ width: stackButtons ? 16 : 14, height: stackButtons ? 16 : 14, transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1), height 300ms cubic-bezier(0.4, 0, 0.2, 1)' }} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
										<rect x="5" y="5" width="14" height="14" rx="2"/>
									</svg>
								</button>
							</div>
						</div>
					</div>
				</form>
				</>
				}
			</main>
		</div>
	);
}
