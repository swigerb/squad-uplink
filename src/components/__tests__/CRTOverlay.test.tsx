import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/hooks/useTheme';
import { CRTOverlay } from '@/components/CRTOverlay/CRTOverlay';

function renderWithTheme(ui: ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('CRTOverlay', () => {
  // --- CRT-01: Renders ---
  it('renders without crashing', () => {
    renderWithTheme(<CRTOverlay />);
    const overlay = document.querySelector('.crt-overlay');
    expect(overlay).toBeInTheDocument();
  });

  // --- CRT-03: Scanline effect ---
  it('renders scanlines element', () => {
    renderWithTheme(<CRTOverlay />);
    const scanlines = document.querySelector('.crt-scanlines');
    expect(scanlines).toBeInTheDocument();
  });

  // --- CRT-04: Phosphor glow ---
  it('renders glow element', () => {
    renderWithTheme(<CRTOverlay />);
    const glow = document.querySelector('.crt-glow');
    expect(glow).toBeInTheDocument();
  });

  // --- CSS variables from theme ---
  it('sets --crt-glow-color CSS variable from apple2e theme', () => {
    renderWithTheme(<CRTOverlay />);
    const overlay = document.querySelector('.crt-overlay') as HTMLElement;
    expect(overlay.style.getPropertyValue('--crt-glow-color')).toBe('rgba(51, 255, 51, 0.4)');
  });

  it('sets --crt-scanline-opacity CSS variable from apple2e theme', () => {
    renderWithTheme(<CRTOverlay />);
    const overlay = document.querySelector('.crt-overlay') as HTMLElement;
    expect(overlay.style.getPropertyValue('--crt-scanline-opacity')).toBe('0.12');
  });

  // --- Accessibility ---
  it('has aria-hidden="true" for accessibility', () => {
    renderWithTheme(<CRTOverlay />);
    const overlay = document.querySelector('.crt-overlay');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  // --- Structure ---
  it('contains exactly two child elements (scanlines and glow)', () => {
    renderWithTheme(<CRTOverlay />);
    const overlay = document.querySelector('.crt-overlay');
    expect(overlay?.children).toHaveLength(2);
  });
});
