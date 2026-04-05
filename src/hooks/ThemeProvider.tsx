import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { THEME_ORDER, type ThemeId } from '@/themes';
import { ThemeContext, getThemeById, loadSavedTheme } from './useTheme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(loadSavedTheme);

  const theme = getThemeById(themeId);

  useEffect(() => {
    try {
      localStorage.setItem('squad-uplink-theme', themeId);
    } catch {
      // ignore
    }
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
