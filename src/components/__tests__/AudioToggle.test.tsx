import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AudioToggle } from '../AudioToggle/AudioToggle';
import { ThemeProvider } from '@/hooks/useTheme';

function renderWithProvider(muted: boolean, onToggle = vi.fn()) {
  return {
    onToggle,
    ...render(
      <ThemeProvider>
        <AudioToggle muted={muted} onToggle={onToggle} />
      </ThemeProvider>,
    ),
  };
}

describe('AudioToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders 🔊 when unmuted', () => {
    renderWithProvider(false);
    expect(screen.getByTestId('audio-toggle').textContent).toBe('🔊');
  });

  it('renders 🔇 when muted', () => {
    renderWithProvider(true);
    expect(screen.getByTestId('audio-toggle').textContent).toBe('🔇');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    renderWithProvider(false, onToggle);

    fireEvent.click(screen.getByTestId('audio-toggle'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('has correct aria-label when unmuted', () => {
    renderWithProvider(false);
    expect(screen.getByTestId('audio-toggle').getAttribute('aria-label')).toBe('Mute audio');
  });

  it('has correct aria-label when muted', () => {
    renderWithProvider(true);
    expect(screen.getByTestId('audio-toggle').getAttribute('aria-label')).toBe('Unmute audio');
  });

  it('has correct title when unmuted', () => {
    renderWithProvider(false);
    expect(screen.getByTestId('audio-toggle').getAttribute('title')).toBe('Mute audio');
  });

  it('has correct title when muted', () => {
    renderWithProvider(true);
    expect(screen.getByTestId('audio-toggle').getAttribute('title')).toBe('Unmute audio');
  });

  it('renders as a button element', () => {
    renderWithProvider(false);
    expect(screen.getByTestId('audio-toggle').tagName).toBe('BUTTON');
  });
});
