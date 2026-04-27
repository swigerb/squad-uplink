import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { themes, THEME_ORDER, type ThemeId, type ThemeConfig } from '../themes';

const STORAGE_KEY = 'squad-uplink-theme';

// Map of theme CSS importers — Vite handles code-splitting automatically.
// The default theme relies on :root variables in styles.css.
const themeImporters: Partial<Record<ThemeId, () => Promise<unknown>>> = {
	pipboy: () => import('../themes/pipboy.css'),
	apple2e: () => import('../themes/apple2e.css'),
	c64: () => import('../themes/c64.css'),
	matrix: () => import('../themes/matrix.css'),
	lcars: () => import('../themes/lcars.css'),
	muthur: () => import('../themes/muthur.css'),
	wopr: () => import('../themes/wopr.css'),
	win95: () => import('../themes/win95.css'),
};

export interface ThemeContextValue {
	theme: ThemeConfig;
	themeId: ThemeId;
	setTheme: (id: ThemeId) => void;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function loadSavedTheme(): ThemeId {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved && saved in themes) return saved as ThemeId;
	} catch {
		// localStorage unavailable
	}
	return 'default';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [themeId, setThemeIdState] = useState<ThemeId>(loadSavedTheme);
	const theme = themes[themeId];

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, themeId);
		} catch {
			// ignore
		}
		document.documentElement.setAttribute('data-theme', themeId);
		// Lazy-load theme CSS on first use
		const importer = themeImporters[themeId];
		if (importer) importer();
		return () => {
			document.documentElement.removeAttribute('data-theme');
		};
	}, [themeId]);

	const setTheme = useCallback((id: ThemeId) => {
		setThemeIdState(id);
	}, []);

	const toggleTheme = useCallback(() => {
		setThemeIdState((prev) => {
			const idx = THEME_ORDER.indexOf(prev);
			return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
		});
	}, []);

	return (
		<ThemeContext value={{ theme, themeId, setTheme, toggleTheme }}>
			{children}
		</ThemeContext>
	);
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) {
		throw new Error('useTheme must be used within a ThemeProvider');
	}
	return ctx;
}
