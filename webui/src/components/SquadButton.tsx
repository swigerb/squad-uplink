export function SquadButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex items-center justify-center h-8 px-3 rounded-lg transition-colors"
			style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
			title="Squad Info"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
				<path d="M8 1.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM14 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM8 10.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM14 14.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5 14.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
			</svg>
			<span className="ml-1.5 text-sm font-medium">Squad</span>
		</button>
	);
}
