import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/hooks/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';

function renderWithTheme(ui: ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });
  // --- TT-01: Renders ---
  it('renders without crashing', () => {
    renderWithTheme(<ThemeToggle />);
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('renders as a button element', () => {
    renderWithTheme(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  // --- TT-02: Shows current theme label ---
  it('shows Apple IIe label by default', () => {
    renderWithTheme(<ThemeToggle />);
    expect(screen.getByTestId('theme-toggle')).toHaveTextContent('Apple IIe');
  });

  // --- TT-03: Clicking toggles theme ---
  it('clicking toggles from Apple IIe to C64', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByTestId('theme-toggle');
    await user.click(button);

    expect(button).toHaveTextContent('C64');
  });

  it('clicking six times returns to Apple IIe', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByTestId('theme-toggle');
    await user.click(button);
    await user.click(button);
    await user.click(button);
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(button).toHaveTextContent('Apple IIe');
  });

  // --- TT-04: Accessibility ---
  it('has a descriptive title attribute', () => {
    renderWithTheme(<ThemeToggle />);
    const button = screen.getByTestId('theme-toggle');
    expect(button).toHaveAttribute('title', 'Switch to C64');
  });

  it('is keyboard accessible', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByTestId('theme-toggle');
    button.focus();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(button).toHaveTextContent('C64');
  });

  // --- Style checks ---
  it('renders a color swatch indicator', () => {
    renderWithTheme(<ThemeToggle />);
    const button = screen.getByTestId('theme-toggle');
    const swatch = button.querySelector('span[aria-hidden="true"]');
    expect(swatch).toBeInTheDocument();
  });
});
