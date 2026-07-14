// Theme color derivation — generates a full CSS variable palette from base + accent colors.

/** Parse hex color (#RGB or #RRGGBB) to [r, g, b] (0-255) */
export function hexToRgb(hex: string): [number, number, number] {
	hex = hex.replace('#', '');
	if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
	return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}

/** Convert [r, g, b] to hex string */
export function rgbToHex(r: number, g: number, b: number): string {
	return '#' + [r, g, b].map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}

/** WCAG relative luminance (0 = black, 1 = white) */
export function luminance(r: number, g: number, b: number): number {
	const [rs, gs, bs] = [r, g, b].map(c => {
		c /= 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** WCAG contrast ratio between two luminances (1:1 to 21:1) */
export function contrastRatio(l1: number, l2: number): number {
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Is the color perceptually dark? */
export function isDark(hex: string): boolean {
	const [r, g, b] = hexToRgb(hex);
	return luminance(r, g, b) < 0.5;
}

/** Lighten or darken a hex color by a percentage (-100 to 100) */
export function adjustBrightness(hex: string, percent: number): string {
	const [r, g, b] = hexToRgb(hex);
	const factor = percent / 100;
	if (factor > 0) {
		return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
	}
	return rgbToHex(r * (1 + factor), g * (1 + factor), b * (1 + factor));
}

/** Mix two hex colors at a ratio (0 = color1, 1 = color2) */
export function mixColors(hex1: string, hex2: string, ratio: number): string {
	const [r1, g1, b1] = hexToRgb(hex1);
	const [r2, g2, b2] = hexToRgb(hex2);
	return rgbToHex(
		r1 + (r2 - r1) * ratio,
		g1 + (g2 - g1) * ratio,
		b1 + (b2 - b1) * ratio,
	);
}

/** Ensure a status color has sufficient contrast against the base. Shifts lightness if needed. */
function ensureContrast(statusHex: string, baseHex: string, minRatio = 3): string {
	const [sr, sg, sb] = hexToRgb(statusHex);
	const baseLum = luminance(...hexToRgb(baseHex));
	const statusLum = luminance(sr, sg, sb);
	if (contrastRatio(baseLum, statusLum) >= minRatio) return statusHex;

	// Shift toward white (if dark base) or black (if light base) until we pass
	const dark = baseLum < 0.5;
	let adjusted = statusHex;
	for (let i = 5; i <= 60; i += 5) {
		adjusted = adjustBrightness(statusHex, dark ? i : -i);
		const adjLum = luminance(...hexToRgb(adjusted));
		if (contrastRatio(baseLum, adjLum) >= minRatio) break;
	}
	return adjusted;
}

/** Status color sets for dark and light base themes */
const STATUS_DARK = {
	error: '#f48771', success: '#4ec9b0', warning: '#e6b43c', shield: '#f5a623',
	toolCall: '#dcdcaa', purple: '#c586c0', codeInline: '#ce9178',
};
const STATUS_LIGHT = {
	error: '#cf222e', success: '#1a7f37', warning: '#9a6700', shield: '#bf8700',
	toolCall: '#6e5e08', purple: '#8250df', codeInline: '#953800',
};

export interface ThemePreset {
	id: string;
	name: string;
	base: string;
	accent: string;
	text?: string;
	builtIn?: boolean;
}

export interface ThemeVariables {
	[key: string]: string;
}

/** Derive a full set of CSS variables from base + accent + optional text colors */
export function deriveTheme(base: string, accent: string, textColor?: string): ThemeVariables {
	const dark = isDark(base);
	const contrastColor = dark ? '#ffffff' : '#000000';
	const status = dark ? STATUS_DARK : STATUS_LIGHT;

	// Text colors: use provided textColor, shifting it for contrast if needed
	const autoText = dark ? '#cccccc' : '#1f1f1f';
	const text = textColor ? ensureContrast(textColor, base, 4.5) : autoText;
	const textMuted = textColor ? mixColors(base, text, 0.5) : (dark ? '#858585' : '#666666');
	const textBright = textColor ? adjustBrightness(text, dark ? 15 : -15) : contrastColor;

	// Ensure status colors have enough contrast against the base
	const error = ensureContrast(status.error, base);
	const success = ensureContrast(status.success, base);
	const warning = ensureContrast(status.warning, base);
	const shield = ensureContrast(status.shield, base);
	const toolCall = ensureContrast(status.toolCall, base);
	const purple = ensureContrast(status.purple, base);
	const codeInline = ensureContrast(status.codeInline, base);

	const tintOpacity = dark ? 0.10 : 0.08;

	return {
		'--bg': base,
		'--surface': adjustBrightness(base, dark ? 5 : -3),
		'--border': adjustBrightness(base, dark ? 15 : -12),
		'--text': text,
		'--text-muted': textMuted,
		'--text-bright': textBright,
		'--primary': accent,
		'--primary-hover': adjustBrightness(accent, dark ? 10 : -10),
		'--error': error,
		'--success': success,
		'--tool-call': toolCall,
		'--purple': purple,
		'--accent': accent,
		'--warning': warning,
		'--shield': shield,
		'--error-tint': `rgba(${hexToRgb(error).join(',')},${tintOpacity})`,
		'--success-tint': `rgba(${hexToRgb(success).join(',')},${tintOpacity})`,
		'--tool-call-tint': `rgba(${hexToRgb(toolCall).join(',')},${tintOpacity})`,
		'--primary-tint': `rgba(${hexToRgb(accent).join(',')},${tintOpacity})`,
		'--warning-tint': `rgba(${hexToRgb(warning).join(',')},${tintOpacity + 0.02})`,
		'--muted-tint': `rgba(128,128,160,${dark ? 0.08 : 0.06})`,
		'--overlay': `rgba(0,0,0,${dark ? 0.6 : 0.3})`,
		'--subtle-bg': `rgba(${hexToRgb(contrastColor).join(',')},${dark ? 0.08 : 0.04})`,
		'--code-inline': codeInline,
		'--code-bg': adjustBrightness(base, dark ? -3 : 3),
		'--code-fg': dark ? '#d4d4d4' : '#1f2328',
		'--scrollbar': `rgba(${hexToRgb(contrastColor).join(',')},0.15)`,
		'--scrollbar-code': `rgba(${hexToRgb(contrastColor).join(',')},${dark ? 0.25 : 0.20})`,
		'--button-contrast': dark ? '#111111' : '#ffffff',
		'--primary-contrast': (() => {
			// Try to use the text color on accent backgrounds, shifting for contrast if needed
			if (textColor) {
				const shifted = ensureContrast(textColor, accent, 4.5);
				return shifted;
			}
			return isDark(accent) ? '#ffffff' : '#111111';
		})(),
	};
}

/** Apply a derived theme to the document */
export function applyTheme(vars: ThemeVariables): void {
	const root = document.documentElement;
	for (const [key, value] of Object.entries(vars)) {
		root.style.setProperty(key, value);
	}
}

/** Remove all inline theme overrides (revert to CSS stylesheet) */
export function clearThemeOverrides(): void {
	const root = document.documentElement;
	const props = Array.from(root.style).filter(p => p.startsWith('--'));
	for (const p of props) root.style.removeProperty(p);
}

/** Built-in presets */
export const BUILTIN_PRESETS: ThemePreset[] = [
	{ id: 'dark', name: 'Dark', base: '#1e1e1e', accent: '#4fc3f7', builtIn: true },
	{ id: 'light', name: 'Light', base: '#f0f0f0', accent: '#0969da', builtIn: true },
];

/** Convert HSL (h: 0-360, s: 0-100, l: 0-100) to hex */
function hslToHex(h: number, s: number, l: number): string {
	h = ((h % 360) + 360) % 360;
	s /= 100; l /= 100;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
	};
	return rgbToHex(f(0), f(8), f(4));
}

/** Generate a random harmonious theme palette */
export function generateRandomPalette(): { base: string; accent: string; text: string; name: string } {
	const baseHue = Math.random() * 360;
	const isDarkTheme = Math.random() > 0.35; // slight bias toward dark

	// Base: low saturation, controlled lightness for a clean background
	const baseSat = isDarkTheme ? 8 + Math.random() * 15 : 5 + Math.random() * 12;
	const baseLight = isDarkTheme ? 8 + Math.random() * 10 : 90 + Math.random() * 6;

	// Accent: pick from curated harmony strategies with guaranteed hue distance
	const strategies = ['complementary', 'analogous', 'triadic', 'split', 'golden'] as const;
	const strategy = strategies[Math.floor(Math.random() * strategies.length)];
	let accentHue: number;
	switch (strategy) {
		case 'complementary': accentHue = baseHue + 180 + (Math.random() * 20 - 10); break;
		case 'analogous': accentHue = baseHue + 25 + Math.random() * 35; break;
		case 'triadic': accentHue = baseHue + (Math.random() > 0.5 ? 120 : 240) + (Math.random() * 15 - 7); break;
		case 'split': accentHue = baseHue + (Math.random() > 0.5 ? 150 : 210); break;
		case 'golden': accentHue = baseHue + 137.5; break; // golden angle — naturally pleasing
	}
	// Accent saturation: vibrant but not neon. Lightness: visible against the base.
	const accentSat = 60 + Math.random() * 25;
	const accentLight = isDarkTheme
		? 50 + Math.random() * 15 // bright enough on dark backgrounds
		: 40 + Math.random() * 15; // rich enough on light backgrounds

	// Text: tinted slightly toward base hue, high contrast
	const textSat = 4 + Math.random() * 8;
	const textLight = isDarkTheme ? 75 + Math.random() * 10 : 15 + Math.random() * 10;

	const name = generatePaletteName(baseHue, accentHue % 360, isDarkTheme);
	return {
		base: hslToHex(baseHue, baseSat, baseLight),
		accent: hslToHex(accentHue % 360, accentSat, accentLight),
		text: hslToHex(baseHue, textSat, textLight),
		name,
	};
}

function hueToColorName(hue: number): string {
	hue = ((hue % 360) + 360) % 360;
	const colors: [number, string][] = [
		[15, 'Rose'], [35, 'Coral'], [50, 'Amber'], [65, 'Gold'],
		[80, 'Lime'], [100, 'Sage'], [140, 'Emerald'], [165, 'Jade'],
		[185, 'Teal'], [200, 'Cyan'], [220, 'Azure'], [245, 'Indigo'],
		[270, 'Violet'], [290, 'Orchid'], [320, 'Magenta'], [345, 'Crimson'],
		[360, 'Rose'],
	];
	for (const [h, name] of colors) { if (hue <= h) return name; }
	return 'Rose';
}

function generatePaletteName(baseHue: number, accentHue: number, isDark: boolean): string {
	const moods = isDark
		? ['Deep', 'Midnight', 'Dark', 'Shadow', 'Dusk', 'Obsidian', 'Velvet', 'Night']
		: ['Soft', 'Morning', 'Light', 'Pale', 'Dawn', 'Misty', 'Cloud', 'Frost'];
	const mood = moods[Math.floor(Math.random() * moods.length)];
	const color = hueToColorName(accentHue);
	return `${mood} ${color}`;
}
