import { useTheme } from '../hooks/useTheme';
import { THEME_ORDER, themes, type ThemeId } from '../themes';

export function ThemeToggle() {
	const { themeId, toggleTheme } = useTheme();
	const current = themes[themeId];
	const nextIdx = (THEME_ORDER.indexOf(themeId) + 1) % THEME_ORDER.length;
	const next = themes[THEME_ORDER[nextIdx] as ThemeId];

	return (
		<button
			onClick={toggleTheme}
			className="inline-flex items-center justify-center h-8 px-2 rounded-lg"
			style={{
				background: 'var(--bg)',
				border: '1px solid var(--border)',
				gap: '6px',
				fontSize: '12px',
			}}
			title={`Switch to ${next.name}`}
			aria-label={`Current theme: ${current.name}. Switch to ${next.name}`}
			data-testid="theme-toggle"
			type="button"
		>
			<span
				style={{
					display: 'inline-block',
					width: '8px',
					height: '8px',
					borderRadius: '50%',
					backgroundColor: current.swatch,
					border: '1px solid rgba(255,255,255,0.3)',
					flexShrink: 0,
				}}
				aria-hidden="true"
			/>
			{current.emoji}
		</button>
	);
}
