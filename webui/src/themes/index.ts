export type ThemeId = 'default' | 'pipboy' | 'apple2e' | 'c64' | 'matrix' | 'lcars' | 'muthur' | 'wopr' | 'win95';

export interface ThemeConfig {
	id: ThemeId;
	name: string;
	emoji: string;
	swatch: string;
	crtEnabled: boolean;
	glowColor: string;
	scanlineOpacity: number;
}

export const themes: Record<ThemeId, ThemeConfig> = {
	default: {
		id: 'default',
		name: 'Default',
		emoji: '🌙',
		swatch: '#4fc3f7',
		crtEnabled: false,
		glowColor: 'transparent',
		scanlineOpacity: 0,
	},
	pipboy: {
		id: 'pipboy',
		name: 'Pip-Boy',
		emoji: '☢️',
		swatch: '#1bff80',
		crtEnabled: true,
		glowColor: 'rgba(27, 255, 128, 0.7)',
		scanlineOpacity: 0.15,
	},
	apple2e: {
		id: 'apple2e',
		name: 'Apple IIe',
		emoji: '🍎',
		swatch: '#33ff33',
		crtEnabled: true,
		glowColor: 'rgba(51, 255, 51, 0.4)',
		scanlineOpacity: 0.12,
	},
	c64: {
		id: 'c64',
		name: 'Commodore 64',
		emoji: '💾',
		swatch: '#706ce4',
		crtEnabled: true,
		glowColor: 'rgba(112, 108, 228, 0.4)',
		scanlineOpacity: 0.08,
	},
	matrix: {
		id: 'matrix',
		name: 'The Matrix',
		emoji: '🔋',
		swatch: '#00ff00',
		crtEnabled: false,
		glowColor: 'rgba(0, 255, 0, 0.4)',
		scanlineOpacity: 0.06,
	},
	lcars: {
		id: 'lcars',
		name: 'LCARS',
		emoji: '🖖',
		swatch: '#ff9900',
		crtEnabled: false,
		glowColor: 'transparent',
		scanlineOpacity: 0,
	},
	muthur: {
		id: 'muthur',
		name: 'MU-TH-UR 6000',
		emoji: '👽',
		swatch: '#7af042',
		crtEnabled: false,
		glowColor: 'rgba(122, 240, 66, 0.5)',
		scanlineOpacity: 0.04,
	},
	wopr: {
		id: 'wopr',
		name: 'W.O.P.R.',
		emoji: '🎮',
		swatch: '#7cb4fc',
		crtEnabled: false,
		glowColor: 'rgba(137, 211, 253, 0.4)',
		scanlineOpacity: 0.08,
	},
	win95: {
		id: 'win95',
		name: 'Windows 95',
		emoji: '🪟',
		swatch: '#008080',
		crtEnabled: false,
		glowColor: 'transparent',
		scanlineOpacity: 0,
	},
};

export const THEME_ORDER: readonly ThemeId[] = [
	'default',
	'pipboy',
	'apple2e',
	'c64',
	'matrix',
	'lcars',
	'muthur',
	'wopr',
	'win95',
] as const;
