import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../ThemeProvider';
import { useTheme } from '../useTheme';

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  // --- TH-01: Default theme ---
  describe('default theme', () => {
    it('defaults to apple2e when no localStorage value', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.themeId).toBe('apple2e');
      expect(result.current.theme.name).toBe('Apple IIe');
    });

    it('default theme has correct fg/bg colors', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.theme.fg).toBe('#33ff33');
      expect(result.current.theme.bg).toBe('#000000');
    });
  });

  // --- TH-02: Load persisted theme ---
  describe('localStorage persistence', () => {
    it('restores c64 theme from localStorage', () => {
      localStorage.setItem('squad-uplink-theme', 'c64');

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.themeId).toBe('c64');
      expect(result.current.theme.name).toBe('Commodore 64');
    });

    it('restores apple2e theme from localStorage', () => {
      localStorage.setItem('squad-uplink-theme', 'apple2e');

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.themeId).toBe('apple2e');
    });

    it('falls back to apple2e for invalid localStorage value', () => {
      localStorage.setItem('squad-uplink-theme', 'invalid-theme');

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.themeId).toBe('apple2e');
    });

    it('falls back to apple2e for empty localStorage value', () => {
      localStorage.setItem('squad-uplink-theme', '');

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.themeId).toBe('apple2e');
    });

    // --- TH-05: Persist to localStorage ---
    it('saves theme to localStorage on change', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => {
        result.current.toggleTheme();
      });

      expect(localStorage.getItem('squad-uplink-theme')).toBe('c64');
    });
  });

  // --- TH-03/04: Toggle theme ---
  describe('toggleTheme', () => {
    it('switches from apple2e to c64', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.themeId).toBe('c64');
      expect(result.current.theme.fg).toBe('#706ce4');
      expect(result.current.theme.bg).toBe('#3528be');
    });

    it('switches from c64 to ibm3270 on second toggle', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => {
        result.current.toggleTheme();
      });
      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.themeId).toBe('ibm3270');
    });

    it('cycles through all 9 themes back to apple2e', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      for (let i = 0; i < 9; i++) {
        act(() => {
          result.current.toggleTheme();
        });
      }

      expect(result.current.themeId).toBe('apple2e');
      expect(result.current.theme.fg).toBe('#33ff33');
      expect(result.current.theme.bg).toBe('#000000');
    });
  });

  // --- setTheme ---
  describe('setTheme', () => {
    it('sets a specific theme by id', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => {
        result.current.setTheme('c64');
      });

      expect(result.current.themeId).toBe('c64');
      expect(result.current.theme.name).toBe('Commodore 64');
    });

    it('sets apple2e explicitly', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => {
        result.current.setTheme('c64');
      });
      act(() => {
        result.current.setTheme('apple2e');
      });

      expect(result.current.themeId).toBe('apple2e');
    });
  });

  // --- data-theme attribute ---
  describe('document data-theme attribute', () => {
    it('sets data-theme on document.documentElement on mount', () => {
      renderHook(() => useTheme(), { wrapper });

      expect(document.documentElement.getAttribute('data-theme')).toBe('apple2e');
    });

    it('updates data-theme when theme changes', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      act(() => {
        result.current.toggleTheme();
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('c64');
    });
  });

  // --- Error: used outside provider ---
  describe('error boundary', () => {
    it('throws when used outside ThemeProvider', () => {
      expect(() => {
        renderHook(() => useTheme());
      }).toThrow('useTheme must be used within a ThemeProvider');
    });
  });
});
