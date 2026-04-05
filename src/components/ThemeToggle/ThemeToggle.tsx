import { useTheme } from '@/hooks/useTheme';
import { THEME_ORDER, type ThemeId } from '@/themes';

const labels: Record<ThemeId, { emoji: string; name: string; swatch: string }> = {
  apple2e: { emoji: '🍎', name: 'Apple IIe', swatch: '#33ff33' },
  c64: { emoji: '📺', name: 'C64', swatch: '#706ce4' },
  ibm3270: { emoji: '🖥️', name: 'IBM 3270', swatch: '#ffb000' },
  win95: { emoji: '🪟', name: 'Win 95', swatch: '#008080' },
  lcars: { emoji: '🚀', name: 'LCARS', swatch: '#ff9900' },
  pipboy: { emoji: '☢️', name: 'Pip-Boy', swatch: '#1bff80' },
};

export function ThemeToggle() {
  const { themeId, toggleTheme, theme } = useTheme();
  const current = labels[themeId];
  const nextIdx = (THEME_ORDER.indexOf(themeId) + 1) % THEME_ORDER.length;
  const next = labels[THEME_ORDER[nextIdx]];

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      title={`Switch to ${next.name}`}
      aria-label={`Current theme: ${current.name}. Switch to ${next.name}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
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
      <span
        style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: current.swatch,
          border: '1px solid rgba(255,255,255,0.3)',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      {current.emoji} {current.name}
    </button>
  );
}
