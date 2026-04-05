import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import type { ThemeId } from '@/themes';
import './MechanicalSwitch.css';

interface MechanicalSwitchProps {
  crtEnabled: boolean;
  onToggle: () => void;
}

const switchVariant: Record<ThemeId, 'lever' | 'checkbox' | 'pill'> = {
  apple2e: 'lever',
  c64: 'lever',
  ibm3270: 'lever',
  win95: 'checkbox',
  lcars: 'pill',
};

export function MechanicalSwitch({ crtEnabled, onToggle }: MechanicalSwitchProps) {
  const { themeId, theme } = useTheme();
  const { play } = useAudio(themeId);
  const variant = switchVariant[themeId];

  const handleClick = () => {
    play('crt_toggle');
    onToggle();
  };

  const label = crtEnabled ? 'CRT' : 'CLEAR';

  if (variant === 'checkbox') {
    return (
      <label
        className="mech-switch mech-switch--checkbox"
        style={{ color: theme.fg, fontFamily: theme.chromeFontFamily ?? theme.fontFamily }}
        data-testid="mechanical-switch"
      >
        <input
          type="checkbox"
          checked={crtEnabled}
          onChange={handleClick}
          className="mech-switch__input"
          aria-label={`CRT effects: ${label}`}
        />
        <span className="mech-switch__label">{label}</span>
      </label>
    );
  }

  if (variant === 'pill') {
    return (
      <button
        onClick={handleClick}
        className={`mech-switch mech-switch--pill ${crtEnabled ? 'mech-switch--on' : 'mech-switch--off'}`}
        style={{
          fontFamily: theme.chromeFontFamily ?? theme.fontFamily,
          backgroundColor: crtEnabled ? (theme.accentColors?.[0] ?? '#ff9900') : '#555',
          color: crtEnabled ? '#000' : '#ccc',
        }}
        data-testid="mechanical-switch"
        aria-pressed={crtEnabled}
        aria-label={`CRT effects: ${label}`}
      >
        {label}
      </button>
    );
  }

  // Default: lever/rocker for CRT themes
  return (
    <button
      onClick={handleClick}
      className={`mech-switch mech-switch--lever ${crtEnabled ? 'mech-switch--on' : 'mech-switch--off'}`}
      style={{
        borderColor: theme.fg,
        color: theme.fg,
        fontFamily: theme.fontFamily,
      }}
      data-testid="mechanical-switch"
      aria-pressed={crtEnabled}
      aria-label={`CRT effects: ${label}`}
    >
      <span className="mech-switch__track">
        <span className="mech-switch__knob" />
      </span>
      <span className="mech-switch__label">{label}</span>
    </button>
  );
}
