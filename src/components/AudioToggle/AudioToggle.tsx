import { useTheme } from '@/hooks/useTheme';

interface AudioToggleProps {
  muted: boolean;
  onToggle: () => void;
}

export function AudioToggle({ muted, onToggle }: AudioToggleProps) {
  const { theme } = useTheme();

  return (
    <button
      onClick={onToggle}
      className="audio-toggle"
      title={muted ? 'Unmute audio' : 'Mute audio'}
      style={{
        background: 'transparent',
        border: `1px solid ${theme.fg}`,
        color: theme.fg,
        fontFamily: theme.fontFamily,
        fontSize: '14px',
        padding: '4px 8px',
        cursor: 'pointer',
        lineHeight: 1,
      }}
      data-testid="audio-toggle"
      aria-label={muted ? 'Unmute audio' : 'Mute audio'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
