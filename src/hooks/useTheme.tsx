import { createContext, useContext } from 'react';
import {
  apple2eTheme,
  c64Theme,
  ibm3270Theme,
  win95Theme,
  lcarsTheme,
  pipboyTheme,
  woprTheme,
  muthurTheme,
  matrixTheme,
  THEME_ORDER,
  type TerminalTheme,
  type ThemeId,
} from '@/themes';

const STORAGE_KEY = 'squad-uplink-theme';

export interface ThemeContextValue {
  theme: TerminalTheme;
  themeId: ThemeId;
  toggleTheme: () => void;
  setTheme: (id: ThemeId) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_MAP: Record<ThemeId, TerminalTheme> = {
  apple2e: apple2eTheme,
  c64: c64Theme,
  ibm3270: ibm3270Theme,
  win95: win95Theme,
  lcars: lcarsTheme,
  pipboy: pipboyTheme,
  wopr: woprTheme,
  muthur: muthurTheme,
  matrix: matrixTheme,
};

export function getThemeById(id: ThemeId): TerminalTheme {
  return THEME_MAP[id] ?? apple2eTheme;
}

const VALID_IDS = new Set<string>(THEME_ORDER);

export function loadSavedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID_IDS.has(saved)) return saved as ThemeId;
  } catch {
    // localStorage unavailable (SSR, private mode, etc.)
  }
  return 'apple2e';
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
