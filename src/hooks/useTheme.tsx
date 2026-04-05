import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  apple2eTheme,
  c64Theme,
  ibm3270Theme,
  win95Theme,
  lcarsTheme,
  THEME_ORDER,
  type TerminalTheme,
  type ThemeId,
} from '@/themes';

const STORAGE_KEY = 'squad-uplink-theme';

interface ThemeContextValue {
  theme: TerminalTheme;
  themeId: ThemeId;
  toggleTheme: () => void;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_MAP: Record<ThemeId, TerminalTheme> = {
  apple2e: apple2eTheme,
  c64: c64Theme,
  ibm3270: ibm3270Theme,
  win95: win95Theme,
  lcars: lcarsTheme,
};

function getThemeById(id: ThemeId): TerminalTheme {
  return THEME_MAP[id] ?? apple2eTheme;
}

const VALID_IDS = new Set<string>(THEME_ORDER);

function loadSavedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID_IDS.has(saved)) return saved as ThemeId;
  } catch {
    // localStorage unavailable (SSR, private mode, etc.)
  }
  return 'apple2e';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(loadSavedTheme);

  const theme = getThemeById(themeId);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      // ignore
    }
    // Apply theme to document for global CSS vars
    document.documentElement.setAttribute('data-theme', themeId);
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
    <ThemeContext value={{ theme, themeId, toggleTheme, setTheme }}>
      {children}
    </ThemeContext>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
