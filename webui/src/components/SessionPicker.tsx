import type { SessionInfo } from '../hooks/useSessionManager';

function timeAgo(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const m = Math.floor(diff / 60000);
	if (m < 1) return 'just now';
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

export interface SessionPickerProps {
	sessions: SessionInfo[];
	activeSessionId: string | null;
	confirmDeleteId: string | null;
	noSession: boolean;
	onClose: () => void;
	onSwitchSession: (sessionId: string) => void;
	onNewSession: () => void;
	onShowQR: () => void;
	onConfirmDelete: (sessionId: string | null) => void;
	onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
	onToggleShield: (sessionId: string, e: React.MouseEvent) => void;
}

export function SessionPicker({
	sessions,
	activeSessionId,
	confirmDeleteId,
	noSession,
	onClose,
	onSwitchSession,
	onNewSession,
	onShowQR,
	onConfirmDelete,
	onDeleteSession,
	onToggleShield,
}: SessionPickerProps) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-14 pb-4"
			style={{ background: 'var(--overlay)' }}
			onClick={() => { if (!noSession) onClose(); }}
			role="dialog"
			aria-modal="true"
			aria-labelledby="session-picker-title"
		>
			<div
				className="w-full max-w-md rounded-2xl p-4"
				style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="mb-3 flex items-center justify-between">
					<h2 id="session-picker-title" className="font-semibold">Sessions</h2>
					<div className="flex items-center gap-2">
						<button
							className="inline-flex items-center justify-center rounded-lg px-3 py-1.5"
							style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
							onClick={onShowQR}
							type="button"
							title="Show QR code"
						>
							<svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path fillRule="evenodd" d="M2 2h9v9H2V2zm2 2v5h5V4H4z" />
								<rect x="5.5" y="5.5" width="2" height="2" />
								<path fillRule="evenodd" d="M13 2h9v9h-9V2zm2 2v5h5V4h-5z" />
								<rect x="16.5" y="5.5" width="2" height="2" />
								<path fillRule="evenodd" d="M2 13h9v9H2v-9zm2 2v5h5v-5H4z" />
								<rect x="5.5" y="16.5" width="2" height="2" />
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
							onClick={onNewSession}
							type="button"
						>
							+ New
						</button>
					</div>
				</div>
				<div className="chat-scroll" role="listbox" aria-label="Session list" style={{ maxHeight: "calc(100vh - 12rem)", overflowY: "auto" }}>
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
								<button
									className="min-w-0 flex-1 p-3 text-left"
									onClick={() => onSwitchSession(s.sessionId)}
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
								{isConfirming ? (
									<div className="flex shrink-0 items-center gap-1 pr-2">
										<span className="text-xs" style={{ color: isActive ? 'var(--error)' : 'var(--text-muted)' }}>{isActive ? 'End + Delete?' : 'Delete?'}</span>
										<button
											onClick={(e) => onDeleteSession(s.sessionId, e)}
											className="rounded px-2 py-1 text-xs font-medium"
											style={{ background: 'var(--error)', color: 'white' }}
											type="button"
										>Yes</button>
										<button
											onClick={(e) => { e.stopPropagation(); onConfirmDelete(null); }}
											className="rounded px-2 py-1 text-xs"
											style={{ background: 'var(--border)' }}
											type="button"
										>No</button>
									</div>
								) : (
									<div className="flex shrink-0 items-center gap-0.5 pr-2">
										<button
											onClick={(e) => onToggleShield(s.sessionId, e)}
											className="rounded p-1.5 opacity-70 hover:opacity-100"
											title={s.shielded ? 'Remove shield' : 'Shield session'}
											type="button"
										>
											<svg className="size-4" viewBox="0 0 24 24" fill={s.shielded ? 'var(--shield)' : 'none'} stroke={s.shielded ? 'var(--shield)' : 'currentColor'} strokeWidth="2">
												<path d="M12 2L4 5v6c0 5.25 3.75 10.15 8 11 4.25-.85 8-5.75 8-11V5L12 2z" />
											</svg>
										</button>
										<button
											onClick={(e) => { e.stopPropagation(); onConfirmDelete(s.sessionId); }}
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
	);
}
