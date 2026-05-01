export interface ContextUsage {
	tokenLimit: number;
	currentTokens: number;
	systemTokens: number;
	conversationTokens: number;
	toolDefinitionsTokens: number;
}

export function ContextUsageBar({ contextUsage }: { contextUsage: ContextUsage }) {
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
}
