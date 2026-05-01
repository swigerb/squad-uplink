import { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { ComponentProps } from 'react';

// --- Shared types ---
export interface ToolSummaryItem {
	toolName: string;
	display: string;
	completed: boolean;
	intentionSummary?: string;
}

export interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	reasoning?: string;
	timestamp: number;
	intermediate?: boolean;
	toolSummary?: ToolSummaryItem[];
	toolCallIds?: string[];
	askUserChoices?: string[];
	questionChoices?: string[];
	images?: string[];
}

export interface ToolEvent {
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

// --- Helper components (moved from App.tsx) ---

function CopyableTable({ children }: { children: React.ReactNode }) {
	const [copied, setCopied] = useState(false);
	const tableRef = useRef<HTMLTableElement>(null);
	const copy = async () => {
		const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
		const table = tableRef.current;
		if (!table) { done(); return; }
		try {
			const cleanHtml = table.outerHTML
				.replace(/\sstyle="[^"]*"/g, '')
				.replace(/\sclass="[^"]*"/g, '');
			if (navigator.clipboard?.write) {
				try {
					const items: Record<string, Blob> = { 'text/html': new Blob([cleanHtml], { type: 'text/html' }) };
					if (table.innerText) items['text/plain'] = new Blob([table.innerText], { type: 'text/plain' });
					await navigator.clipboard.write([new ClipboardItem(items)]);
					done();
					return;
				} catch { /* fall through to execCommand */ }
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
		} catch {
			done();
		}
	};
	return (
		<div className="code-scroll" style={{ margin: '0.5em 0', position: 'relative' }}>
			<table ref={tableRef} style={{ borderCollapse: 'collapse', minWidth: '100%' }}>{children}</table>
			<button
				type="button"
				data-copy-button
				onClick={copy}
				className="rounded p-0.5 transition-opacity"
				style={{ position: 'absolute', top: 2, right: 4, opacity: copied ? 0.8 : 0.3, color: 'inherit', lineHeight: 1, padding: '2px' }}
				title="Copy table"
			>
				{copied
					? <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
					: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
				}
			</button>
		</div>
	);
}

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
		<th style={{ textAlign: 'left', background: 'var(--subtle-bg)', fontWeight: 600 }}>{children}</th>
	),
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent)' }}>{children}</a>
	),
};

export const AssistantMarkdown = ({ content }: { content: string }) => (
	<Markdown className="prose prose-sm max-w-none" remarkPlugins={[remarkGfm, remarkBreaks]} components={mdComponents}>
		{content}
	</Markdown>
);

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
	const isFailed = isComplete && tc.content !== 'success';
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

// --- Main component ---

export interface ChatMessageListProps {
	messages: Message[];
	toolEvents: ToolEvent[];
	streamingContent: string;
	isStreaming: boolean;
	isThinking: boolean;
	thinkingText: string;
	reasoningText: string;
	notification: { type: 'warning' | 'info'; message: string; action?: { label: string; onClick: () => void }; count?: number } | null;
	error: string | null;
	historyTruncated: { total: number; shown: number } | null;
	chatEndRef: React.RefObject<HTMLDivElement | null>;
	onDismissNotification: () => void;
	onImageClick?: (src: string) => void;
}

export function ChatMessageList({
	messages,
	toolEvents,
	streamingContent,
	isStreaming,
	isThinking,
	thinkingText,
	reasoningText,
	notification,
	error,
	historyTruncated,
	chatEndRef,
	onDismissNotification,
	onImageClick,
}: ChatMessageListProps) {
	return (
		<div className="chat-scroll flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-live="polite" aria-label="Chat messages">
			{historyTruncated && (() => {
				const { shown, total } = historyTruncated;
				const makeUrl = (n: number | 'all') => {
					const u = new URL(window.location.href);
					u.searchParams.set('history', String(n));
					return u.toString();
				};
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
				// Consolidate consecutive tool-only messages
				const visibleMessages = messages.filter(m => m.content.trim() || m.toolSummary?.length || m.images?.length);
				const consolidated: Message[] = [];
				for (const msg of visibleMessages) {
					const isToolOnly = !msg.content.trim() && msg.toolSummary?.length;
					const prev = consolidated[consolidated.length - 1];
					const prevIsToolOnly = prev && !prev.content.trim() && prev.toolSummary?.length;
					if (isToolOnly && prevIsToolOnly && prev.toolSummary) {
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
								<div className="chat-scroll mt-1 rounded-lg p-2 text-xs" style={{ background: 'var(--bg)', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
									{msg.reasoning}
								</div>
							</details>
						)}
						{msg.role === 'assistant'
							? <AssistantMessageBlock content={msg.content} timestamp={msg.timestamp} bytes={new TextEncoder().encode(msg.content).length} />
							: <>
								{msg.askUserChoices && msg.askUserChoices.length > 0 && (
									<details style={{ marginBottom: '6px' }}>
										<summary style={{
											cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center',
											gap: '5px', fontSize: '11px', opacity: 0.7, userSelect: 'none',
										}}>
											<span>⦿</span>
											<span>{msg.askUserChoices.length} option{msg.askUserChoices.length > 1 ? 's' : ''}</span>
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
								{msg.images && msg.images.length > 0 && (
									<div className="flex gap-2 mb-2 flex-wrap">
										{msg.images.map((src, i) => (
											<img key={i} src={src} alt="Attached" className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity" style={{ maxHeight: 150, maxWidth: '100%', objectFit: 'contain' }} onClick={() => onImageClick?.(src)} />
										))}
									</div>
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

			{reasoningText && (
				<details open style={{ marginBottom: '8px' }}>
					<summary style={{
						cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center',
						gap: '5px', fontSize: '11px', color: 'var(--text-muted)', userSelect: 'none',
					}}>
						<span>💭</span>
						<span>Thinking…</span>
					</summary>
					<div className="chat-scroll mt-1 rounded-lg p-2 text-xs" style={{ background: 'var(--bg)', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
						{reasoningText}
					</div>
				</details>
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
						<strong>{notification.type === 'warning' ? '⚠ Warning:' : '💬 Note:'}</strong> {notification.message}{notification.count && notification.count > 1 ? ` (×${notification.count})` : ''}
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
							onClick={onDismissNotification}
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
	);
}
