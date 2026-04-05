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

function getThemeById(id: ThemeId): TerminalTheme {
  return id === 'c64' ? c64Theme : apple2eTheme;
}

function loadSavedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'c64' || saved === 'apple2e') return saved;
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
    setThemeIdState((prev) => (prev === 'apple2e' ? 'c64' : 'apple2e'));
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
