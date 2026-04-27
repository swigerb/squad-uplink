import { AssistantMarkdown } from './ChatMessageList';

export interface ApprovalRequest {
	requestId: string;
	action: string;
	summary: string;
	details: unknown;
	alwaysPattern?: string;
	warning?: string;
}

export interface InputRequest {
	requestId: string;
	question: string;
	choices?: string[];
	allowFreeform?: boolean;
}

export interface ApprovalCardProps {
	pendingApproval: ApprovalRequest | null;
	pendingInput: InputRequest | null;
	cliApprovalInfo: string | null;
	cliInputInfo: string | null;
	freeformAnswer: string;
	onFreeformChange: (val: string) => void;
	onRespondApproval: (approved: boolean) => void;
	onRespondApprovalAlways: () => void;
	onRespondInput: (answer: string, wasFreeform: boolean) => void;
}

export function ApprovalCard({
	pendingApproval,
	pendingInput,
	cliApprovalInfo,
	cliInputInfo,
	freeformAnswer,
	onFreeformChange,
	onRespondApproval,
	onRespondApprovalAlways,
	onRespondInput,
}: ApprovalCardProps) {
	if (!pendingApproval && !pendingInput && !cliApprovalInfo && !cliInputInfo) return null;

	return (
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
							<button className="flex-1 rounded-lg py-2 text-sm font-medium" style={{ background: 'var(--success)', color: 'white' }} onClick={() => onRespondApproval(true)} type="button">Allow</button>
							<button className="flex-1 rounded-lg py-2 text-sm font-medium" style={{ background: 'var(--error)', color: 'white' }} onClick={() => onRespondApproval(false)} type="button">Deny</button>
						</div>
						{pendingApproval.alwaysPattern && (
							<button
								className="w-full rounded-lg py-1.5 text-xs font-medium"
								style={{ background: 'var(--tool-call-tint)', border: '1px solid var(--tool-call)', color: 'var(--tool-call)' }}
								onClick={onRespondApprovalAlways}
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
							onClick={() => { onRespondInput('', true); }}
							type="button"
							title="Skip this question"
						>Skip</button>
					</div>
					{pendingInput.choices && pendingInput.choices.length > 0 && (
						<div className="mb-2 flex flex-col gap-1.5">
							{pendingInput.choices.map((choice, i) => (
								<button key={i} className="rounded-lg px-3 py-2 text-left text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={() => onRespondInput(choice, false)} type="button">{choice}</button>
							))}
						</div>
					)}
					{(pendingInput.allowFreeform !== false || !pendingInput.choices?.length) && (
						<div className="flex gap-2">
							<textarea
								className="chat-scroll flex-1 rounded-lg border px-3 py-2 text-sm resize-none"
								style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', minHeight: 44, maxHeight: 200, overflow: 'auto' }}
								placeholder="Type your answer…"
								value={freeformAnswer}
								onChange={(e) => onFreeformChange(e.target.value)}
								onKeyDown={(e) => {
									const isTouch = window.matchMedia('(hover: none)').matches;
									if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
										e.preventDefault();
										onRespondInput(freeformAnswer, true);
									}
								}}
								onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }}
								autoFocus
								rows={1}
							/>
							<button className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: 'var(--primary)', color: 'white' }} onClick={() => onRespondInput(freeformAnswer, true)} type="button">Send</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
