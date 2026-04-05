import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MechanicalSwitch } from '../MechanicalSwitch/MechanicalSwitch';
import { ThemeProvider } from '@/hooks/ThemeProvider';
import { installMockAudioContext } from '../../__mocks__/audio';

// Wrap component in ThemeProvider since it uses useTheme()
function renderWithProvider(crtEnabled: boolean, onToggle = vi.fn()) {
  return {
    onToggle,
    ...render(
      <ThemeProvider>
        <MechanicalSwitch crtEnabled={crtEnabled} onToggle={onToggle} />
      </ThemeProvider>,
    ),
  };
}

describe('MechanicalSwitch', () => {
  beforeEach(() => {
    localStorage.clear();
    installMockAudioContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders without crashing', () => {
    renderWithProvider(true);
    expect(screen.getByTestId('mechanical-switch')).toBeDefined();
  });

  it('shows "CRT" label when effects are on', () => {
    renderWithProvider(true);
    expect(screen.getByText('CRT')).toBeDefined();
  });

  it('shows "CLEAR" label when effects are off', () => {
    renderWithProvider(false);
    expect(screen.getByText('CLEAR')).toBeDefined();
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    renderWithProvider(true, onToggle);

    fireEvent.click(screen.getByTestId('mechanical-switch'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('plays crt_toggle sound on click', () => {
    // AudioContext is mocked globally — verify no crash on play
    const onToggle = vi.fn();
    renderWithProvider(true, onToggle);

    expect(() => {
      fireEvent.click(screen.getByTestId('mechanical-switch'));
    }).not.toThrow();
  });

  it('displays lever variant for default apple2e theme', () => {
    renderWithProvider(true);
    const el = screen.getByTestId('mechanical-switch');
    expect(el.classList.contains('mech-switch--lever')).toBe(true);
  });

  it('shows aria-pressed state matching crtEnabled', () => {
    const { rerender } = render(
      <ThemeProvider>
        <MechanicalSwitch crtEnabled={true} onToggle={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mechanical-switch').getAttribute('aria-pressed')).toBe('true');

    rerender(
      <ThemeProvider>
        <MechanicalSwitch crtEnabled={false} onToggle={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mechanical-switch').getAttribute('aria-pressed')).toBe('false');
  });
});
