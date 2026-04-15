export type ThemeId = 'default' | 'pipboy';

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
};

export const THEME_ORDER: readonly ThemeId[] = ['default', 'pipboy'] as const;
