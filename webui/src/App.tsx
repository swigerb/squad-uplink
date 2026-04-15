import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { ComponentProps } from 'react';
import { ThemeProvider } from './hooks/useTheme';
import { ThemeToggle } from './components/ThemeToggle';
import { CRTOverlay } from './components/CRTOverlay';
import { PipBoyLayout } from './components/PipBoyLayout';
import { SquadPanel } from './components/SquadPanel';
import { SquadButton } from './components/SquadButton';

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
	table: ({ children }) => (
		<div className="code-scroll" style={{ margin: '0.5em 0' }}>
			<table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>{children}</table>
		</div>
	),
	th: ({ children }) => (
		<th style={{ textAlign: 'left', background: 'var(--subtle-bg)', fontWeight: 600 }}>{children}</th>
	),
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent)' }}>{children}</a>
	),
};
const apiFetch= (url: string, init?: RequestInit) => {
	const t = getToken();
	const headers = { ...(init?.headers ?? {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
	return fetch(url, { ...init, headers });
};


const AssistantMarkdown = ({ content }: { content: string }) => (
	<Markdown className="prose prose-sm max-w-none" remarkPlugins={[remarkGfm, remarkBreaks]} components={mdComponents}>
		{content}
	</Markdown>
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
	toolSummary?: ToolSummaryItem[];
	toolCallIds?: string[]; // tool call IDs dispatched by this message (for tracking completion)
	askUserChoices?: string[];
	questionChoices?: string[];
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
	models: Array<{ id: string; name: string }>;
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
				? <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
				: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
			}
		</button>
	);
}

function CopyRichButton({ htmlRef }: { htmlRef: React.RefObject<HTMLDivElement | null> }) {
	const [copied, setCopied] = useState(false);
	const copy = () => {
		const html = htmlRef.current?.innerHTML;
		if (!html) return;
		const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
		// Mirror what the browser does on manual select+copy: put rendered HTML into
		// an offscreen contenteditable element, select it, then execCommand('copy').
		const el = document.createElement('div');
		el.contentEditable = 'true';
		el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
		el.innerHTML = html;
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
				? <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
				: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<rect x="9" y="9" width="13" height="13" rx="2" />
					<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
					<path d="M12 13h5M12 16h3" strokeLinecap="round" />
				  </svg>
			}
		</button>
	);
}

function AssistantMessageBlock({ content, timestamp, bytes }: { content: string; timestamp: number; bytes?: number }) {
	const htmlRef = useRef<HTMLDivElement>(null);
	return (
		<>
			<div ref={htmlRef}><AssistantMarkdown content={content} /></div>
			<div className="mt-1 flex items-center justify-between gap-2 text-xs opacity-50">
				<span>{new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
				{bytes != null && bytes > 0 && (
					<span className="font-mono tabular-nums">
						{bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`}
					</span>
				)}
				<div className="flex items-center gap-1">
					<CopyRichButton htmlRef={htmlRef} />
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
						wordBreak: 'break-words',
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
	const isFailed = isComplete && tc.content === 'failed';
	const label = tc.mcpServerName ? `${tc.mcpServerName} › ${tc.toolName}` : (tc.toolName ?? 'tool');
	const borderColor = isFailed ? 'var(--error)' : isComplete ? 'var(--success)' : 'var(--tool-call)';
	const bgColor = isFailed ? 'var(--error-tint)' : isComplete ? 'var(--success-tint)' : 'var(--tool-call-tint)';
	const textColor = isFailed ? 'var(--error)' : isComplete ? 'var(--success)' : 'var(--tool-call)';
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
				<span>{isFailed ? '✗' : isComplete ? '✅' : '⚙️'}</span>
				<span className="flex-1">{isFailed ? 'Failed' : isComplete ? 'Done' : 'Running'}: {label}</span>
				{!isComplete && elapsed > 0 && <span style={{ fontSize: '10px', opacity: 0.5 }}>{elapsed >= 60 ? `${Math.floor(elapsed/60)}m ${elapsed%60}s` : `${elapsed}s`}</span>}
				{!isComplete && <button type="button" title="Copy debug info" style={{ fontSize: '10px', opacity: 0.5, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'inherit' }} onClick={(e) => {
					e.stopPropagation();
					const info = [`tool: ${label}`, elapsed > 0 ? `elapsed: ${elapsed}s` : null, tc.displayLabel ? `label: ${tc.displayLabel}` : null, tc.content ? `args: ${tc.content}` : null].filter(Boolean).join('\n');
					navigator.clipboard.writeText(info).catch(() => {});
				}}>📋</button>}
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
}: {
	open: boolean;
	onToggle: () => void;
	info: PortalInfo | null;
	context: SessionContext | null;
	activeModel: string | null;
	onChangeModel: (id: string) => void;
	onFetchModels?: () => Promise<Array<{ id: string; name: string }>>;
	onFetchQuota?: () => Promise<{ quotaSnapshots: Record<string, { entitlementRequests: number; usedRequests: number; remainingPercentage: number; resetDate?: string }> }>;
	activeSessionId?: string | null;
	sessionSummary?: string | null;
	sessionStartTime?: string;
	sessionUsage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; reasoningTokens: number; requests: number } | null;
	sessionQuota?: { unlimited: boolean; used: number; total: number; remaining: number; resetDate?: string } | null;
}) {
	const [showModelPicker, setShowModelPicker] = useState(false);
	const [liveModels, setLiveModels] = useState<Array<{ id: string; name: string }> | null>(null);
	const [quota, setQuota] = useState<{ unlimited: boolean; used: number; total: number; remaining: number; resetDate?: string } | null>(null);
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
	}, [open]);

	return (
		<div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
			{/* Bar: session name (click-to-rename) + flex spacer (click-to-toggle) + session ID + chevron */}
			<button className="flex w-full items-center gap-2 border-none bg-transparent px-4 py-2 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }} onClick={onToggle} type="button">
				{/* Session summary — read-only */}
				<span className="whitespace-nowrap shrink-0" style={{ color: sessionSummary ? 'var(--text)' : 'var(--text-muted)' }}>
					{sessionSummary || <em>untitled session</em>}
				</span>
				{/* Flex spacer — blank space clicks toggle the tray */}
				<div className="flex-1" />
				{/* Right side: session ID + chevron */}
				<div className="flex items-center gap-1.5 shrink-0">
					{activeSessionId && (
						<span className="font-mono text-[10px] opacity-40" title={activeSessionId}>
							{activeSessionId.slice(0, 8)}
						</span>
					)}
					<span>{open ? '▴' : '▾'}</span>
				</div>
			</button>

			{/* Expandable panel */}
			{open && (
				<div className="px-4 pb-4 pt-1">
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
					<div className="code-scroll mb-3 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
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
					</div>

					{/* Session usage stats */}
					{sessionUsage && sessionUsage.requests > 0 && (
						<div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-mono" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
							<span className="flex-1">
								Tokens: {sessionUsage.inputTokens.toLocaleString()} ↑ {sessionUsage.outputTokens.toLocaleString()} ↓
								{sessionUsage.reasoningTokens > 0 && ` · Reasoning: ${sessionUsage.reasoningTokens.toLocaleString()}`}
								{sessionUsage.cacheReadTokens > 0 && ` · Cached: ${sessionUsage.cacheReadTokens.toLocaleString()}`}
								{` · Requests: ${sessionUsage.requests}`}
							</span>
							<CopyButton text={`Tokens: ${sessionUsage.inputTokens.toLocaleString()} ↑ ${sessionUsage.outputTokens.toLocaleString()} ↓${sessionUsage.reasoningTokens > 0 ? ` · Reasoning: ${sessionUsage.reasoningTokens.toLocaleString()}` : ''}${sessionUsage.cacheReadTokens > 0 ? ` · Cached: ${sessionUsage.cacheReadTokens.toLocaleString()}` : ''} · Requests: ${sessionUsage.requests}`} />
						</div>
					)}

					{/* Model selector */}
					<div className="relative">
						<button
							type="button"
							className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm"
							style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
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
							<div
								className="chat-scroll absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg py-1"
								style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
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
										<span>{m.name}</span>
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}


export default function App() {
	const hasSessionInUrl = !!new URLSearchParams(window.location.search).get('session');
	const [connectionState, setConnectionState] = useState<ConnectionState>(hasSessionInUrl ? 'connecting' : 'disconnected');
	const [messages, setMessages] = useState<Message[]>([]);
	const [toolEvents, setToolEventsState] = useState<ToolEvent[]>([]);
	const toolEventsRef = useRef<ToolEvent[]>([]);
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
	const [notification, setNotification] = useState<{ type: 'warning' | 'info'; message: string; action?: { label: string; onClick: () => void } } | null>(null);
	const [input, setInput] = useState('');
	const [isStreaming, setIsStreaming] = useState(false);
	const [isStopping, setIsStopping] = useState(false);
	// Agent is "active" whenever it's thinking, running tools, streaming, or waiting for stop to confirm
	const isAgentActive = isStopping || isStreaming || isThinking || toolEvents.some(te => te.type === 'tool_start');
	const [showPicker, setShowPicker] = useState(!hasSessionInUrl);
	const [showQR, setShowQR] = useState(false);
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(
		new URLSearchParams(window.location.search).get('session')
	);
	const [activeSessionSummary, setActiveSessionSummary] = useState<string | null>(null);
	const activeSessionIdRef = useRef<string | null>(new URLSearchParams(window.location.search).get('session'));
	const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
	const [pendingInput, setPendingInput] = useState<InputRequest | null>(null);
	const [freeformAnswer, setFreeformAnswer] = useState('');
	const [rules, setRules] = useState<ApprovalRule[]>([]);
	const [approveAll, setApproveAll] = useState(false);
	const [showRules, setShowRules] = useState(false);
	const [showGuides, setshowGuides] = useState(false);
	const [confirmDeleteGuide, setconfirmDeleteGuide] = useState<string | null>(null);
	const [viewingGuide, setviewingGuide] = useState<{ id: string; guideContent?: string; promptsContent?: string; guideFilePath?: string; promptsFilePath?: string; filePath?: string; activeTab?: 'guide' | 'prompts' } | null>(null);
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
	const [historyTruncated, setHistoryTruncated] = useState<{ total: number; shown: number } | null>(null);
	const [cliApprovalInfo, setCliApprovalInfo] = useState<string | null>(null);
	const [cliInputInfo, setCliInputInfo] = useState<string | null>(null);
	const isCliTurnRef = useRef(false);
	const [portalInfo, setPortalInfo] = useState<PortalInfo | null>(null);
	const [sessionContext, setSessionContext] = useState<SessionContext | null>(null);
	const [activeModel, setActiveModel] = useState<string | null>(null);
	const [sessionUsage, setSessionUsage] = useState<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; reasoningTokens: number; requests: number } | null>(null);
	const [sessionQuota, setSessionQuota] = useState<{ unlimited: boolean; used: number; total: number; remaining: number; resetDate?: string } | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [squadPanelOpen, setSquadPanelOpen] = useState(false);
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
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const inputContainerRef = useRef<HTMLDivElement>(null);
	const isStoppingRef = useRef(false);
	const stopClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const heartbeatRef = useRef<{ interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> | null } | null>(null);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inHistoryRef = useRef(false);
	const historyBufferRef = useRef<Message[]>([]);
	const lastConnectTime = useRef(0);
	const fastFailCount = useRef(0);

	// Fetch portal info (version, user, models) once on mount
	useEffect(() => {
		apiFetch('/api/info').then(r => r.json()).then(setPortalInfo).catch(() => {});
		// If starting with no session, pre-load the session list for the picker
		if (!hasSessionInUrl) {
			apiFetch('/api/sessions').then(r => r.json()).then(setSessions).catch(() => {});
		}
	}, []);

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
					const event = JSON.parse(e.data as string) as { type: string; sessionId?: string; shielded?: boolean; session?: SessionInfo };
					if (event.type === 'session_deleted') {
						setSessions(prev => prev.filter(s => s.sessionId !== event.sessionId));
					} else if (event.type === 'session_shield_changed') {
						setSessions(prev => prev.map(s => s.sessionId === event.sessionId ? { ...s, shielded: event.shielded ?? false } : s));
					} else if (event.type === 'session_renamed') {
						setSessions(prev => prev.map(s => s.sessionId === event.sessionId ? { ...s, summary: event.summary ?? s.summary } : s));
					} else if (event.type === 'session_created' && event.session) {
						setSessions(prev => prev.some(s => s.sessionId === event.session!.sessionId) ? prev : [event.session!, ...prev]);
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
			// Re-check update status on (re)connect — server may have restarted with new versions
			// Poll immediately and again after 15s (server may still be running its initial check)
			const pollUpdates = () => apiFetch('/api/updates').then(r => r.json()).then((s: UpdateStatus) => {
				setUpdateStatus(s);
				if (!s.packages.some(p => p.hasUpdate) && !s.restartNeeded) setUpdateDismissed(false);
			}).catch(() => {});
			pollUpdates();
			setTimeout(pollUpdates, 15000);
			// Start application-level heartbeat (browser WS API doesn't expose protocol pings)
			if (heartbeatRef.current) { clearInterval(heartbeatRef.current.interval); if (heartbeatRef.current.timeout) clearTimeout(heartbeatRef.current.timeout); }
			const hb = { interval: setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send('{"type":"ping"}');
					hb.timeout = setTimeout(() => {
						// No pong received — connection is stale
						ws.close();
					}, 5000);
				}
			}, 30_000), timeout: null as ReturnType<typeof setTimeout> | null };
			heartbeatRef.current = hb;
		};

		ws.onmessage = (e) => {
			hadMsg = true;
			fastFailCount.current = 0;
			try {
				const event = JSON.parse(e.data as string) as {
					type: string;
					content?: string;
					sessionId?: string;
					shielded?: boolean;
					toolName?: string;
					params?: unknown;
					result?: unknown;
					requestId?: string;
					approval?: ApprovalRequest;
					inputRequest?: InputRequest;
					session?: SessionInfo;
					model?: string;
					toolCallId?: string;
					mcpServerName?: string;
					displayLabel?: string;
					intermediate?: boolean;
					role?: string;
				};

				if (event.type === 'pong') {
					// Heartbeat response — clear the stale-connection timeout
					if (heartbeatRef.current?.timeout) { clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current.timeout = null; }
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
					// Clear any in-progress streaming from a previous connection
					streamingRef.current = '';
					reasoningRef.current = '';
					lastStreamedRef.current = '';
					pendingMsgRef.current = null;
					isStoppingRef.current = false;
					if (stopClearTimerRef.current) { clearTimeout(stopClearTimerRef.current); stopClearTimerRef.current = null; }
					setStreamingContent('');
					setIsStreaming(false);
					setIsThinking(false);
					setIsStopping(false);
					setThinkingText('');
					setReasoningText('');
					return;
				}

				if (event.type === 'history_end') {
					inHistoryRef.current = false;
					if (event.sessionId && event.sessionId !== activeSessionIdRef.current) {
						historyBufferRef.current = []; return;
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
					setMessages(historyBufferRef.current);
								// Prevent auto-collapse from firing when user manually opens drawer after history load
								if (historyBufferRef.current.length > 0) drawerAutoCollapsedRef.current = true;
					// Auto-open drawer when session is empty (new session)
					if (historyBufferRef.current.length === 0) setDrawerOpen(true);
					historyBufferRef.current = [];
					return;
				}

				if (event.type === 'session_switched') {
					const newId = event.sessionId ?? null;
					activeSessionIdRef.current = newId;
					setActiveSessionId(newId);
					setSessionContext((event as { context?: SessionContext | null }).context ?? null);
					setActiveSessionSummary((event as { summary?: string | null }).summary ?? null);
					setActiveModel((event as { model?: string | null }).model ?? null);
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
					// Check if the server has a newer build than the client
					const serverBuild = (event as { serverBuild?: string }).serverBuild;
					if (serverBuild && serverBuild !== __BUILD__) {
						setNotification({ type: 'info', message: `Server updated to build ${serverBuild}.`, action: { label: 'Reload', onClick: () => window.location.reload() } });
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
					if (event.sessionId === activeSessionId) enterNoSession();
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
						});
					} else if (event.type === 'delta') {
						streamingRef.current += event.content ?? '';
						if (event.timestamp) historyTimestampRef.current = event.timestamp;
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
						setMessages((prev) => {
							if (prev.some(m => m.role === role && m.content === content)) return prev;
							return [...prev, { id: `sync-${Date.now()}-${Math.random()}`, role, content, timestamp: Date.now(), toolSummary: event.toolSummary || undefined }];
						});
						if (role === 'user') {
							// CLI turn starting — show thinking indicator
							setToolEvents([]); lastStreamedRef.current = '';
							isCliTurnRef.current = true;
							setIsThinking(true);
						} else if (role === 'assistant') {
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
							setMessages(prev => prev.some(m => m.content === msg.content && msg.content) ? prev : [...prev, msg]);
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
							setMessages(prev => prev.some(m => m.content === msg.content) ? prev : [...prev, msg]);
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
							setMessages(prev => prev.some(m => m.content === msg.content) ? prev : [...prev, msg]);
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
					setToolEvents((prev) => prev.map(te => te.toolCallId === event.toolCallId ? { ...te, type: 'tool_complete' as const } : te));
					const completedId = event.toolCallId;
					// Check if all tools for any message are now complete → delay then collapse
					setMessages(prev => {
						const parentMsg = prev.find(m => m.toolCallIds?.includes(completedId));
						if (!parentMsg?.toolCallIds) return prev;
						const allToolEvents = toolEventsRef.current;
						const allDone = parentMsg.toolCallIds.every(tcId => {
							const te = allToolEvents.find(t => t.toolCallId === tcId);
							return te?.type === 'tool_complete' || tcId === completedId;
						});
						if (allDone) {
							const msgId = parentMsg.id;
							const toolCallIds = parentMsg.toolCallIds;
							// Show green for 2s before collapsing
							setTimeout(() => {
								setMessages(prev2 => prev2.map(m => {
									if (m.id !== msgId || !m.toolCallIds) return m;
									const currentTools = toolEventsRef.current;
									const msgTools = toolCallIds
										.map(tcId => currentTools.find(t => t.toolCallId === tcId))
										.filter((t): t is ToolEvent => !!t);
									const summary = buildToolSummary(msgTools);
									setToolEvents(prev3 => prev3.filter(te => !toolCallIds.includes(te.toolCallId ?? '')));
									return { ...m, toolSummary: summary.length ? summary : undefined, toolCallIds: undefined };
								}));
							}, 2000);
						}
						return prev; // don't modify messages yet
					});
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
					// Any remaining tool events not yet collapsed into per-message summaries
					const remainingTools = buildToolSummary(toolEventsRef.current);
					// Commit any buffered message as the final reply
					if (pendingMsgRef.current) {
						const pendingBytes = new TextEncoder().encode(pendingMsgRef.current.content).length;
						const msg = { ...pendingMsgRef.current, toolSummary: remainingTools.length ? remainingTools : undefined, bytes: pendingBytes };
						pendingMsgRef.current = null;
						setMessages(prev => prev.some(m => m.content === msg.content) ? prev : [...prev, msg]);
					}
					const final = streamingRef.current;
					if (final) {
						const finalBytes = new TextEncoder().encode(final).length;
						lastStreamedRef.current = final;
						setMessages((prev) => {
							if (prev.some(m => m.role === 'assistant' && m.content === final)) return prev;
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
					setToolEvents([]);
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
					}
				} else if (event.type === 'session_renamed') {
					// Auto-title update — keep sessions list in sync even when picker is closed
					setSessions(prev => prev.map(s => s.sessionId === event.sessionId ? { ...s, summary: event.summary ?? s.summary } : s));
					if (event.sessionId === activeSessionIdRef.current) setActiveSessionSummary((event as { summary?: string }).summary ?? null);
				} else if (event.type === 'session_context_updated') {
					setSessionContext((event as { context?: SessionContext | null }).context ?? null);
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
					setNotification({ type: event.type, message: event.content ?? '' });
					if (!(event as { action?: unknown }).action) {
						setTimeout(() => setNotification(null), 8000);
					}
				} else if (event.type === 'approval_request' && event.approval) {
					setPendingApproval(event.approval);
				} else if (event.type === 'approval_resolved') {
					// Another client resolved this approval/input — dismiss it here too
					setPendingApproval(prev => prev?.requestId === event.requestId ? null : prev);
					setPendingInput(prev => prev?.requestId === event.requestId ? null : prev);
				} else if (event.type === 'input_request' && event.inputRequest) {
					// Only reset if this is a new request (probe re-broadcasts the same one)
					setPendingInput(prev => {
						if (prev?.requestId === event.inputRequest.requestId) return prev;
						setFreeformAnswer('');
						return event.inputRequest;
					});
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
					localStorage.removeItem('portal_token');
					fastFailCount.current = 0;
					setConnectionState('no_token');
					return; // stop retrying — token is invalid
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
		if (noSessionRef.current) {
			// Start in no-session mode — open management WS for live broadcasts
			const token = getToken();
			if (token) {
				const mgmtWs = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}?token=${token}&management=1`);
				mgmtWs.onmessage = (e) => {
					try {
						const event = JSON.parse(e.data as string) as { type: string; sessionId?: string; shielded?: boolean; session?: SessionInfo };
						if (event.type === 'session_deleted') {
							setSessions(prev => prev.filter(s => s.sessionId !== event.sessionId));
						} else if (event.type === 'session_shield_changed') {
							setSessions(prev => prev.map(s => s.sessionId === event.sessionId ? { ...s, shielded: event.shielded ?? false } : s));
						} else if (event.type === 'session_created' && event.session) {
							setSessions(prev => prev.some(s => s.sessionId === event.session!.sessionId) ? prev : [event.session!, ...prev]);
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

	// Count seconds since entering 'connecting' state (continuously, not reset on retries)
	useEffect(() => {
		if (connectionState !== 'connecting') { setConnectingSecs(0); return; }
		const start = Date.now();
		setConnectingSecs(1); // start at 1 immediately
		const t = setInterval(() => setConnectingSecs(Math.floor((Date.now() - start) / 1000) + 1), 1000);
		return () => clearInterval(t);
	}, [connectionState]);

	// Reconnect when page becomes visible/focused after being backgrounded.
	// Also sends a heartbeat ping to detect stale connections that still report OPEN.
	useEffect(() => {
		const checkConnection = () => {
			if (Date.now() - lastConnectTime.current < 1500) return;
			const ws = wsRef.current;
			if (!ws) return;
			if (ws.readyState === WebSocket.OPEN) {
				// Connection looks alive — send a ping to verify. If no pong within 5s, onclose fires.
				ws.send('{"type":"ping"}');
				if (heartbeatRef.current) {
					if (heartbeatRef.current.timeout) clearTimeout(heartbeatRef.current.timeout);
					heartbeatRef.current.timeout = setTimeout(() => ws.close(), 5000);
				}
				return;
			}
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			if (ws.readyState === WebSocket.CONNECTING) ws.close();
			connect();
		};
		const onVisibility = () => { if (document.visibilityState === 'visible') checkConnection(); };
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('focus', checkConnection);
		window.addEventListener('pageshow', checkConnection);
		// Retry every 2s if still not connected — iOS needs ~3 attempts before succeeding.
		// Skip if already CONNECTING to avoid cycling through open/close/open rapidly.
		const retryInterval = setInterval(() => {
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
		chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
	}, [connect]);

	const newSession = useCallback(async () => {
		setShowPicker(false);
		try {
			const res = await apiFetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
			const { sessionId } = await res.json() as { sessionId: string };
			noSessionRef.current = false;
			setNoSession(false);
			const params = new URLSearchParams(window.location.search);
			params.set('session', sessionId);
			window.location.search = params.toString();
		} catch {
			setError('Could not create session');
		}
	}, []);

	const changeModel = useCallback((modelId: string) => {
		setActiveModel(modelId);
		wsRef.current?.send(JSON.stringify({ type: 'set_model', content: modelId }));
	}, []);

	const applyUpdates = useCallback(async () => {
		setUpdateStatus(prev => prev ? { ...prev, applying: true, error: null } : prev);
		try {
			const res = await apiFetch('/api/updates/apply', { method: 'POST' });
			const status = await res.json() as UpdateStatus;
			// Force restartNeeded on client side — older servers may not track it
			setUpdateStatus({ ...status, restartNeeded: true });
		} catch (e) {
			setUpdateStatus(prev => prev ? { ...prev, applying: false, error: String(e) } : prev);
		}
	}, []);

	const restartServer = useCallback(async (force = false) => {
		try {
			const res = await apiFetch('/api/restart', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ force }),
			});
			if (res.status === 409) {
				const data = await res.json() as { activeSessions?: string[] };
				const ids = data.activeSessions?.join(', ') ?? 'unknown';
				if (confirm(`Active turns in progress (${ids}). Force restart anyway?`)) {
					restartServer(true);
				}
				return;
			}
			// Server will restart — our WebSocket reconnect logic handles the rest
		} catch { /* expected — server is shutting down */ }
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
		setFreeformAnswer('');
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

	const sendPrompt = () => {
		const prompt = input.trim();
		if (!prompt || connectionState !== 'connected') return;
		setMessages((prev) => [
			...prev,
			{ id: `msg-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() },
		]);
		setToolEvents([]);
		intentionMapRef.current.clear();
		setError(null);
		setInput('');
		setShowPromptsTray(false);
		setIsThinking(true);
		setThinkingText('');
		setReasoningText('');
		reasoningRef.current = '';
		wsRef.current?.send(JSON.stringify({ type: 'prompt', content: prompt }));
	};

	const stopAgent = () => {
		wsRef.current?.send(JSON.stringify({ type: 'stop' }));
		// Set locally for instant feedback — server will also broadcast turn_stopping
		// to sync other connected clients. The turn_stopping handler guards against
		// the echo coming back.
		isStoppingRef.current = true;
		setIsStopping(true);
		if (stopClearTimerRef.current) { clearTimeout(stopClearTimerRef.current); stopClearTimerRef.current = null; }
	};

	// Auto-resize textarea to fit content (up to maxHeight)
	useEffect(() => {
		const ta = textareaRef.current;
		if (!ta) return;
		ta.style.height = 'auto';
		ta.style.height = `${ta.scrollHeight}px`;
	}, [input]);

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

	// Scroll chat to bottom when prompts tray opens
	useEffect(() => {
		if (showPromptsTray) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [showPromptsTray]);

	if (connectionState === 'no_token') {
		return (
			<div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
				<div className="max-w-sm rounded-xl p-8" style={{ background: 'var(--surface)' }}>
					<h1 className="mb-3 text-xl font-semibold">Token Required</h1>
					<p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
						Open the URL shown in the terminal (includes <code>?token=…</code>).
					</p>
				</div>
			</div>
		);
	}

	return (
		<PipBoyLayout>
		<div className="flex flex-col" style={{ height: '100%' }}>
			<CRTOverlay />
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
						<div className="rounded-xl p-3" style={{ background: 'white' }}>
							<QRCodeSVG value={window.location.href} size={220} />
						</div>
						<p className="max-w-xs text-center text-xs" style={{ color: 'var(--text-muted)' }}>
							Scan to open this session on your phone or tablet
						</p>
					</div>
				</div>
			)}

			{/* Guides Picker */}
			{showGuides && (
				<div
					className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-14 pb-4"
					style={{ background: 'var(--overlay)' }}
					onClick={() => guardDiscard(() => { setshowGuides(false); setviewingGuide(null); setconfirmDeleteGuide(null); setEditingGuide(null); setEditingName(null); setShowNewGuide(false); setPendingDiscard(null); })}
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
									style={{ background: 'var(--primary)', color: 'white' }}
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
													style={{ background: 'var(--primary)', color: 'white', opacity: importUrl && !importLoading ? 1 : 0.5 }}
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
													style={{ background: 'var(--primary)', color: 'white' }}
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
										style={{ background: 'var(--primary)', color: 'white', opacity: newGuideName && (newGuideCheck || newPromptsCheck) ? 1 : 0.5 }}
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
										<button type="button" className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--warning)', color: '#111' }} onClick={() => { setConfirmOverwrite(false); doAddGuide(); }}>Overwrite</button>
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
											<button className="rounded px-2 py-1 text-xs font-medium" style={{ background: 'var(--primary)', color: 'white' }} onClick={async () => {
												const vi = viewingGuide;
												setviewingGuide(null);
												setshowGuides(false);
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
											<button className="rounded px-2 py-1 text-xs font-medium" style={{ background: 'var(--success)', color: '#111' }} onClick={async () => {
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
													setviewingGuide(updated);
													setEditingGuide(null);
													setEditingName(null);
													apiFetch('/api/guides').then(r => r.json()).then(setGuides).catch(() => {});
												} catch (e) {
													setError(`Failed to save: ${e}`);
												}
											}} type="button">Save</button>
										)}
										<button className="rounded px-2 py-1 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => guardDiscard(() => { setLastViewedGuide(viewingGuide.id); setviewingGuide(null); setEditingGuide(null); setEditingName(null); setPendingDiscard(null); })} type="button">Back</button>
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
										<button type="button" className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--warning)', color: '#111' }} onClick={() => { const action = pendingDiscard; setPendingDiscard(null); action(); }}>Discard</button>
										<button type="button" className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setPendingDiscard(null)}>Keep Editing</button>
									</div>
								)}
								{/* Guide / Prompts tabs */}
								<div className="flex mb-2" style={{ borderBottom: '1px solid var(--border)' }}>
									<button
										type="button"
										className="px-3 py-1.5 text-xs font-medium"
										style={{ color: (viewingGuide.activeTab ?? 'guide') === 'guide' ? 'var(--text)' : 'var(--text-muted)', borderBottom: (viewingGuide.activeTab ?? 'guide') === 'guide' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, opacity: viewingGuide.guideContent ? 1 : 0.4 }}
										onClick={() => guardDiscard(() => { setviewingGuide({ ...viewingGuide, activeTab: 'guide' }); setEditingGuide(null); setPendingDiscard(null); })}
									>Guide</button>
									<button
										type="button"
										className="px-3 py-1.5 text-xs font-medium"
										style={{ color: viewingGuide.activeTab === 'prompts' ? 'var(--text)' : 'var(--text-muted)', borderBottom: viewingGuide.activeTab === 'prompts' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, opacity: viewingGuide.promptsContent ? 1 : 0.4 }}
										onClick={() => guardDiscard(() => { setviewingGuide({ ...viewingGuide, activeTab: 'prompts' }); setEditingGuide(null); setPendingDiscard(null); })}
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
												setviewingGuide({
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
													setconfirmDeleteGuide(null);
												}} type="button">Delete</button>
												<button className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={(e) => { e.stopPropagation(); setconfirmDeleteGuide(null); }} type="button">Cancel</button>
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
												<button className="rounded p-1.5" style={{ opacity: 0.7 }} onClick={(e) => { e.stopPropagation(); setconfirmDeleteGuide(inst.id); }} type="button" title="Delete">
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
									style={{ background: 'var(--primary)', color: 'white' }}
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
								return (
									<div
										key={s.sessionId}
										className="mb-2 flex items-center rounded-xl"
										style={{
											background: isActive ? 'var(--primary-tint)' : 'var(--bg)',
											border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
										}}
									>
										{/* Clickable session info */}
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

										{/* Action buttons */}
										{isConfirming ? (
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
						</div>
					</div>
				</div>
			)}

			{/* Squad Panel */}
			<SquadPanel open={squadPanelOpen} onClose={() => setSquadPanelOpen(false)} />

			{/* Header */}
			<header
				className="flex items-center justify-between border-b px-4 py-3"
				style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
			>
				<div className="flex items-center gap-2.5">
					<svg className="size-8" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								{/* Original logo preserved as comment:
								  Filled oval: <ellipse cx="8" cy="12" rx="7" ry="9.5" fill/stroke, rotate(20,8,12)>
								*/}
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
					<div>
						<span className="font-semibold">Copilot Portal</span>
						<div className="text-xs" style={{ color: 'var(--text-muted)' }}>v{__VERSION__} · build {__BUILD__}</div>
					</div>
				</div>
				<div className="flex flex-col items-end gap-0.5">
					<div className="flex items-center gap-2.5">
						{isAgentActive && (
							<button
								className="inline-flex items-center justify-center h-8 px-2 rounded-lg"
								style={{ background: 'var(--error)', color: 'white', opacity: isStopping ? 0.6 : 1, animation: isStopping ? 'blink 1s infinite' : 'none' }}
								onClick={stopAgent}
								disabled={isStopping}
								type="button"
								title={isStopping ? 'Stopping…' : 'Stop'}
							>
								<svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<rect x="5" y="5" width="14" height="14" rx="2"/>
								</svg>
							</button>
						)}
						<ThemeToggle />
						<SquadButton onClick={() => setSquadPanelOpen(true)} />
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
							style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
							onClick={() => {
								const opening = !showGuides;
								setshowGuides(opening);
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
						<button
							className="inline-flex items-center justify-center h-8 px-2 rounded-lg"
							style={{ background: approveAll ? 'var(--success-tint)' : rules.length > 0 ? 'var(--primary-tint)' : 'var(--bg)', border: `1px solid ${approveAll ? 'var(--success)' : rules.length > 0 ? 'var(--primary)' : 'var(--border)'}`, color: approveAll ? 'var(--success)' : rules.length > 0 ? 'var(--primary)' : undefined }}
							onClick={() => setShowRules(v => !v)}
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
						<div
							className="size-2 rounded-full"
							style={{
								background:
									connectionState === 'connected'
										? 'var(--success)'
										: connectionState === 'connecting'
											? 'var(--tool-call)'
											: 'var(--error)',
							}}
							title={connectionState}
						/>
					</div>
					</div>
			</header>

			{/* Chat */}
			<main className="flex flex-1 flex-col overflow-hidden">
				{/* Session info drawer — always visible when connected */}
				{connectionState === 'connected' && (
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
									style={{ background: 'var(--primary)', color: 'white' }}
									onClick={async () => {
										setUpdateStatus(prev => prev ? { ...prev, applying: true, error: null } : prev);
										try {
											if (portalUpdate) {
												const res = await apiFetch('/api/updates/apply-portal', { method: 'POST' });
												const status = await res.json() as UpdateStatus;
												setUpdateStatus(status);
											}
											if (updatable.length > 0) {
												const res = await apiFetch('/api/updates/apply', { method: 'POST' });
												const status = await res.json() as UpdateStatus;
												setUpdateStatus({ ...status, restartNeeded: true });
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
									style={{ background: 'var(--success)', color: '#111' }}
									onClick={() => restartServer()}
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
						<span>📱 Tip: Use your browser's <b>Share → Add to Home Screen</b> for an app-like experience</span>
						<button
							className="ml-3 px-1.5 rounded"
							style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontSize: '14px' }}
							onClick={() => { setPwaDismissed(true); localStorage.setItem('portal_pwa_dismissed', '1'); }}
						>✕</button>
					</div>
				)}

				<div className="chat-scroll flex-1 overflow-y-auto p-4 space-y-4">
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
						const visibleMessages = messages.filter(m => m.content.trim() || m.toolSummary?.length);
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
						const items: Array<{ type: 'message'; msg: Message } | { type: 'tool'; tc: ToolEvent }> = [
							...consolidated.map(msg => ({ type: 'message' as const, msg, ts: msg.timestamp })),
							...toolEvents.map(tc => ({ type: 'tool' as const, tc, ts: tc.timestamp })),
						].sort((a, b) => a.ts - b.ts);

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
								className={msg.role === 'user' ? 'relative max-w-[85%] rounded-xl px-4 py-3 text-sm' : 'relative w-full rounded-xl px-4 py-3 text-sm'}
								style={
									msg.role === 'user'
										? { background: 'var(--primary)', color: 'white', borderRadius: '18px 18px 4px 18px' }
										: {
												background: 'var(--surface)',
												border: isIntermediate ? '1.5px dashed var(--border)' : '1px solid var(--border)',
												borderRadius: '18px 18px 18px 4px',
											}
								}
							>
								{msg.role === 'assistant' && msg.toolSummary && msg.toolSummary.length > 0 && (
									<details style={{ marginBottom: '8px' }}>
										<summary style={{
											cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center',
											gap: '5px', fontSize: '11px', color: 'var(--text-muted)', userSelect: 'none',
										}}>
											<span>🔧</span>
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
														<span style={{ flexShrink: 0 }}>{t.completed ? '✓' : '·'}</span>
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
											<span>💭</span>
											<span>Thought</span>
										</summary>
										<div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
											{msg.reasoning}
										</div>
									</details>
								)}
								{msg.role === 'assistant'
									? <AssistantMessageBlock content={msg.content} timestamp={msg.timestamp} bytes={msg.bytes} />
									: <>
										{msg.askUserChoices && msg.askUserChoices.length > 0 && (
											<details style={{ marginBottom: '6px' }}>
												<summary style={{
													cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center',
													gap: '5px', fontSize: '11px', opacity: 0.7, userSelect: 'none',
												}}>
													<span>👉</span>
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
											<span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
								borderRadius: '18px 18px 18px 4px',
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
							<span className="flex-1">
								<strong>{notification.type === 'warning' ? '⚠ Warning:' : '💬 Note:'}</strong> {notification.message}
							</span>
							{notification.action && (
								<button
									type="button"
									className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
									style={{ background: notification.type === 'warning' ? 'var(--warning)' : 'var(--accent)', color: '#111' }}
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
					<div className="border-t px-4 pt-3 pb-1" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>

						{cliApprovalInfo && (
							<div className="mb-2 rounded-xl border p-3" style={{ borderColor: 'var(--text-muted)', background: 'var(--muted-tint)' }}>
								<div className="mb-1 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
									<span>⏳</span> CLI waiting for approval
								</div>
								<div className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{cliApprovalInfo}</div>
								<div className="mt-1 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Approve or deny in your terminal to continue.</div>
							</div>
						)}
						{cliInputInfo && (
							<div className="mb-2 rounded-xl border p-3" style={{ borderColor: 'var(--accent)', background: 'var(--primary-tint)' }}>
								<div className="mb-1 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
									<span>💬</span> CLI waiting for your input
								</div>
								<div className="text-xs" style={{ color: 'var(--text)' }}>{cliInputInfo}</div>
								<div className="mt-1 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Respond in your terminal to continue.</div>
							</div>
						)}
						{pendingApproval && (
							<div className="mb-2 rounded-xl border p-3" style={{ borderColor: 'var(--tool-call)', background: 'var(--tool-call-tint)' }}>
								<div className="mb-1 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--tool-call)' }}>
									<span>⚠️</span> Permission Request — <span className="font-mono text-xs">{pendingApproval.action}</span>
								</div>
								<pre className="chat-scroll mb-2 overflow-auto rounded px-3 py-2 text-xs font-mono" style={{ background: 'var(--bg)', color: 'var(--text)', maxHeight: 80 }}>{pendingApproval.summary}</pre>
								{pendingApproval.warning && (
									<div className="mb-2 flex items-center gap-1.5 rounded px-2 py-1 text-xs" style={{ background: 'var(--warning-tint)', color: 'var(--tool-call)' }}>
										<span>⚠</span> {pendingApproval.warning}
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
								<div className="mb-2 flex items-center justify-between">
									<div className="text-sm font-semibold"><AssistantMarkdown content={pendingInput.question} /></div>
									<button
										className="rounded px-2 py-0.5 text-xs"
										style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
										onClick={() => { respondInput('', true); }}
										type="button"
										title="Skip this question"
									>Skip</button>
								</div>
								{pendingInput.choices && pendingInput.choices.length > 0 && (
									<div className="mb-2 flex flex-col gap-1.5">
										{pendingInput.choices.map((choice, i) => (
											<button key={i} className="rounded-lg px-3 py-2 text-left text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={() => respondInput(choice, false)} type="button">{choice}</button>
										))}
									</div>
								)}
								{(pendingInput.allowFreeform !== false || !pendingInput.choices?.length) && (
									<div className="flex gap-2">
										<input
											className="flex-1 rounded-lg border px-3 py-2 text-sm"
											style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
											placeholder="Type your answer…"
											value={freeformAnswer}
											onChange={(e) => setFreeformAnswer(e.target.value)}
											onKeyDown={(e) => { if (e.key === 'Enter') respondInput(freeformAnswer, true); }}
											autoFocus
										/>
										<button className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: 'var(--primary)', color: 'white' }} onClick={() => respondInput(freeformAnswer, true)} type="button">Send</button>
									</div>
								)}
							</div>
						)}
					</div>
				)}

				{/* Input */}
				{!noSession && !pendingInput && <>
				<form
					className="border-t px-4 py-3"
					style={{
						background: 'var(--surface)',
						borderColor: 'var(--border)',
						paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
					}}
					onSubmit={(e) => {
						e.preventDefault();
						sendPrompt();
					}}
				>
					<div ref={inputContainerRef} className="flex gap-2">
						<div className="flex-1 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
							{showPromptsTray && sessionPrompts.length > 0 && (
								<div className="relative overflow-hidden border-b" style={{ borderColor: 'var(--border)' }}>
									<div className="chat-scroll flex flex-col gap-1 px-3 pt-2 pb-3" style={{ maxHeight: 200, overflowY: 'auto' }} onScroll={e => {
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
													<svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
														<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
													</svg>
												</button>
											)}
										</div>
									))}
								</div>
								{sessionPrompts.length > 5 && !promptsAtBottom && (
									<div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10" style={{ height: 36, background: 'linear-gradient(transparent 0%, var(--bg) 60%)' }} />
								)}
								</div>
							)}
							<div className="relative">
								<textarea
									ref={textareaRef}
									id="message-input"
									name="message"
									className="chat-scroll w-full resize-none bg-transparent pl-4 pr-16 py-3 text-sm outline-none"
									style={{ color: 'var(--text)', minHeight: 44, maxHeight: 200, overflow: 'auto' }}
									placeholder={connectionState === 'connected' ? 'Ask Copilot…' : `Connecting… ${connectingSecs}s`}
									disabled={connectionState !== 'connected'}
									rows={1}
									value={input}
									onChange={(e) => setInput(e.target.value)}
									enterKeyHint="enter"
									onKeyDown={(e) => {
										// Touch devices (iOS): Enter adds newlines — send via button only.
										// Desktop: Enter sends, Shift+Enter adds newline.
										const isTouch = window.matchMedia('(hover: none)').matches;
										if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
											e.preventDefault();
											sendPrompt();
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
								{!input && messages.filter(m => m.role === 'user').length > 0 && (
									<button
										type="button"
										title="Recall last message"
										onClick={() => { const msgs = messages.filter(m => m.role === 'user'); if (msgs.length) setInput(msgs[msgs.length - 1].content); }}
										className="absolute top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded opacity-40 hover:opacity-80"
										style={{ color: 'var(--text-muted)', right: sessionPrompts.length > 0 ? 28 : 8 }}
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
											<polyline points="9 10 4 15 9 20"/>
											<path d="M20 4v7a4 4 0 0 1-4 4H4"/>
										</svg>
									</button>
								)}
								{input && (
									<button
										type="button"
										title="Clear"
										onClick={() => { setInput(''); textareaRef.current?.focus(); }}
										className="absolute top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded opacity-40 hover:opacity-80"
										style={{ color: 'var(--text-muted)', right: sessionPrompts.length > 0 ? 28 : 8 }}
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4">
											<path d="M18 6L6 18M6 6l12 12"/>
										</svg>
									</button>
								)}
							</div>
						</div>
						<div className="flex shrink-0 flex-col items-center">
							{showPromptsTray && sessionPrompts.length > 0 && (
								<div className="flex flex-1 items-center">
									{confirmDeletePrompt === '__all__' ? (
										<div className="flex flex-col gap-1 items-center">
											<button className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--error)', color: 'white' }} onClick={() => { clearSessionPrompts(); setConfirmDeletePrompt(null); }} type="button">Delete All</button>
											<button className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setConfirmDeletePrompt(null)} type="button">Cancel</button>
										</div>
									) : (
										<button
											className="flex size-8 items-center justify-center rounded-full border-none"
											style={{ background: 'var(--error)', color: 'white', opacity: 0.8 }}
											onClick={() => setConfirmDeletePrompt('__all__')}
											type="button"
											title="Remove all prompts"
										>
											<svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
												<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
											</svg>
										</button>
									)}
								</div>
							)}
							<div className="flex items-center" style={{ marginTop: 'auto', marginBottom: 4 }}>
								<button
									className="flex size-11 items-center justify-center rounded-full border-none"
									style={{
										background: input.trim() && connectionState === 'connected' ? 'var(--primary)' : 'var(--border)',
										color: 'white',
										cursor: input.trim() && connectionState === 'connected' ? 'pointer' : 'default',
									}}
									disabled={!input.trim() || connectionState !== 'connected'}
									type="submit"
									title="Send"
								>
									<svg className="size-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
										<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
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
		</PipBoyLayout>
	);
}