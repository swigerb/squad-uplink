import { useState, useRef, useEffect } from 'react';
import type { ConnectionState } from '../hooks/useWebSocket';

export interface InputBarProps {
	input: string;
	onInputChange: (val: string) => void;
	connectionState: ConnectionState;
	connectingSecs: number;
	noSession: boolean;
	draftSession: { cwd: string } | null;
	pendingInput: boolean;
	sessionPrompts: Array<{ label: string; text: string }>;
	messages: Array<{ role: string; content: string }>;
	currentAgent: { name: string; displayName: string; description: string } | null;
	onSendPrompt: () => void;
	onRemovePrompt: (label: string) => void;
	onClearPrompts: () => void;
	onSetDraftCwd: (cwd: string) => void;
	/** Render slot for the FolderBrowser when in draft mode */
	folderBrowser?: React.ReactNode;
}

export function InputBar({
	input,
	onInputChange,
	connectionState,
	connectingSecs,
	noSession,
	draftSession,
	pendingInput,
	sessionPrompts,
	messages,
	currentAgent,
	onSendPrompt,
	onRemovePrompt,
	onClearPrompts,
	folderBrowser,
}: InputBarProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const inputContainerRef = useRef<HTMLDivElement>(null);
	const [showPromptsTray, setShowPromptsTray] = useState(false);
	const [promptsAtBottom, setPromptsAtBottom] = useState(false);
	const [confirmDeletePrompt, setConfirmDeletePrompt] = useState<string | null>(null);

	// Auto-resize textarea
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

	if ((noSession && !draftSession) || pendingInput) return null;

	return (
		<>
			{/* Draft session CWD picker */}
			{draftSession && (
				<div className="border-t px-4 py-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
					<div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>New session — choose working directory (optional):</div>
					{folderBrowser}
					{draftSession.cwd && (
						<div className="mt-1 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
							Selected: {draftSession.cwd}
						</div>
					)}
				</div>
			)}
			<form
				className="border-t px-4 py-3"
				style={{
					background: 'var(--surface)',
					borderColor: 'var(--border)',
					paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
				}}
				onSubmit={(e) => {
					e.preventDefault();
					onSendPrompt();
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
												onInputChange(p.text);
												setShowPromptsTray(false);
												textareaRef.current?.focus();
											}}
										>
											{p.label}
										</button>
										{confirmDeletePrompt === p.label ? (
											<span className="flex shrink-0 gap-1" onClick={e => e.stopPropagation()}>
												<button className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--error)', color: 'white' }} onClick={() => { onRemovePrompt(p.label); setConfirmDeletePrompt(null); }} type="button">Delete</button>
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
								aria-label="Message input"
								className="chat-scroll w-full resize-none bg-transparent pl-4 pr-16 py-3 text-sm outline-none"
								style={{ color: 'var(--text)', minHeight: 44, maxHeight: 200, overflow: 'auto' }}
								placeholder={connectionState === 'connected' ? (currentAgent ? `Ask ${currentAgent.displayName || currentAgent.name}…` : 'Ask Copilot…') : `Connecting… ${connectingSecs}s`}
								disabled={connectionState !== 'connected' && !draftSession}
								rows={1}
								value={input}
								onChange={(e) => onInputChange(e.target.value)}
								enterKeyHint="enter"
								onKeyDown={(e) => {
									const isTouch = window.matchMedia('(hover: none)').matches;
									if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
										e.preventDefault();
										onSendPrompt();
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
									onClick={() => { const msgs = messages.filter(m => m.role === 'user'); if (msgs.length) onInputChange(msgs[msgs.length - 1].content); }}
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
									onClick={() => { onInputChange(''); textareaRef.current?.focus(); }}
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
										<button className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--error)', color: 'white' }} onClick={() => { onClearPrompts(); setConfirmDeletePrompt(null); }} type="button">Delete All</button>
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
									background: input.trim() && (connectionState === 'connected' || draftSession) ? 'var(--primary)' : 'var(--border)',
									color: 'white',
									cursor: input.trim() && (connectionState === 'connected' || draftSession) ? 'pointer' : 'default',
								}}
								disabled={!input.trim() || (connectionState !== 'connected' && !draftSession)}
								type="submit"
								title="Send"
								aria-label="Send message"
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
	);
}
