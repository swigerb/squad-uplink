import { useTheme } from '@/hooks/useTheme';
import type { ThemeId } from '@/themes';

const labels: Record<ThemeId, string> = {
  apple2e: '🍎 Apple IIe',
  c64: '📺 C64',
};

export function ThemeToggle() {
  const { themeId, toggleTheme, theme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      title={`Switch to ${themeId === 'apple2e' ? 'C64' : 'Apple IIe'} theme`}
      style={{
        background: 'transparent',
        border: `1px solid ${theme.fg}`,
        color: theme.fg,
        fontFamily: theme.fontFamily,
        fontSize: '14px',
        padding: '4px 12px',
        cursor: 'pointer',
        textTransform: 'uppercase',
      }}
      data-testid="theme-toggle"
    >
      {labels[themeId]}
    </button>
  );
}
