import { useTheme } from '../hooks/useTheme';

export function CRTOverlay() {
	const { theme } = useTheme();

	if (!theme.crtEnabled) return null;

	return (
		<div
			className="crt-overlay"
			style={{
				'--crt-glow-color': theme.glowColor,
				'--crt-scanline-opacity': String(theme.scanlineOpacity),
			} as React.CSSProperties}
			aria-hidden="true"
		>
			<div className="crt-scanlines" />
			<div className="crt-glow" />
		</div>
	);
}
