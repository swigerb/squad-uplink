import { describe, it, expect } from 'vitest';
import { apple2eTheme } from '../apple2e';
import { c64Theme } from '../c64';
import { ibm3270Theme } from '../ibm3270';
import { win95Theme } from '../win95';
import { lcarsTheme } from '../lcars';
import { pipboyTheme } from '../pipboy';
import { woprTheme } from '../wopr';
import { matrixTheme } from '../matrix';
import type { TerminalTheme } from '../index';

const allThemes: [string, TerminalTheme][] = [
  ['apple2e', apple2eTheme],
  ['c64', c64Theme],
  ['ibm3270', ibm3270Theme],
  ['win95', win95Theme],
  ['lcars', lcarsTheme],
  ['pipboy', pipboyTheme],
  ['wopr', woprTheme],
  ['matrix', matrixTheme],
];

describe('Theme Configs', () => {
  // --- Required fields ---
  describe('required fields', () => {
    allThemes.forEach(([name, theme]) => {
      describe(name, () => {
        it('has a name', () => {
          expect(theme.name).toBeDefined();
          expect(typeof theme.name).toBe('string');
          expect(theme.name.length).toBeGreaterThan(0);
        });

        it('has an id', () => {
          expect(theme.id).toBeDefined();
          expect(typeof theme.id).toBe('string');
        });

        it('has fg color', () => {
          expect(theme.fg).toBeDefined();
          expect(theme.fg).toMatch(/^#[0-9a-fA-F]{6}$|^rgba?\(/);
        });

        it('has bg color', () => {
          expect(theme.bg).toBeDefined();
          expect(theme.bg).toMatch(/^#[0-9a-fA-F]{6}$|^rgba?\(/);
        });

        it('has cursor color', () => {
          expect(theme.cursor).toBeDefined();
        });

        it('has selection color', () => {
          expect(theme.selection).toBeDefined();
        });

        it('has fontFamily', () => {
          expect(theme.fontFamily).toBeDefined();
          expect(typeof theme.fontFamily).toBe('string');
        });

        it('has fontSize', () => {
          expect(theme.fontSize).toBeDefined();
          expect(typeof theme.fontSize).toBe('number');
          expect(theme.fontSize).toBeGreaterThan(0);
        });

        it('has cols', () => {
          expect(theme.cols).toBeDefined();
          expect(typeof theme.cols).toBe('number');
          expect(theme.cols).toBeGreaterThan(0);
        });

        it('has rows', () => {
          expect(theme.rows).toBeDefined();
          expect(typeof theme.rows).toBe('number');
          expect(theme.rows).toBeGreaterThan(0);
        });

        it('has glowColor', () => {
          expect(theme.glowColor).toBeDefined();
        });

        it('has scanlineOpacity between 0 and 1', () => {
          expect(theme.scanlineOpacity).toBeDefined();
          expect(theme.scanlineOpacity).toBeGreaterThanOrEqual(0);
          expect(theme.scanlineOpacity).toBeLessThanOrEqual(1);
        });

        it('has xtermTheme', () => {
          expect(theme.xtermTheme).toBeDefined();
          expect(typeof theme.xtermTheme).toBe('object');
        });
      });
    });
  });

  // --- Apple IIe spec ---
  describe('Apple IIe theme', () => {
    it('has correct fg color #33ff33', () => {
      expect(apple2eTheme.fg).toBe('#33ff33');
    });

    it('has correct bg color #000000', () => {
      expect(apple2eTheme.bg).toBe('#000000');
    });

    it('enforces 80 columns', () => {
      expect(apple2eTheme.cols).toBe(80);
    });

    it('has 24 rows', () => {
      expect(apple2eTheme.rows).toBe(24);
    });

    it('has green phosphor glow color', () => {
      expect(apple2eTheme.glowColor).toContain('51, 255, 51');
    });

    it('has id of apple2e', () => {
      expect(apple2eTheme.id).toBe('apple2e');
    });

    it('xterm theme foreground matches fg', () => {
      expect(apple2eTheme.xtermTheme.foreground).toBe(apple2eTheme.fg);
    });

    it('xterm theme background matches bg', () => {
      expect(apple2eTheme.xtermTheme.background).toBe(apple2eTheme.bg);
    });

    it('xterm theme cursor matches cursor', () => {
      expect(apple2eTheme.xtermTheme.cursor).toBe(apple2eTheme.cursor);
    });
  });

  // --- C64 spec ---
  describe('C64 theme', () => {
    it('has correct fg color #706ce4', () => {
      expect(c64Theme.fg).toBe('#706ce4');
    });

    it('has correct bg color #3528be', () => {
      expect(c64Theme.bg).toBe('#3528be');
    });

    it('enforces 40 columns', () => {
      expect(c64Theme.cols).toBe(40);
    });

    it('has 25 rows', () => {
      expect(c64Theme.rows).toBe(25);
    });

    it('has purple glow color', () => {
      expect(c64Theme.glowColor).toContain('112, 108, 228');
    });

    it('has id of c64', () => {
      expect(c64Theme.id).toBe('c64');
    });

    it('xterm theme foreground matches fg', () => {
      expect(c64Theme.xtermTheme.foreground).toBe(c64Theme.fg);
    });

    it('xterm theme background matches bg', () => {
      expect(c64Theme.xtermTheme.background).toBe(c64Theme.bg);
    });

    it('xterm theme cursor matches cursor', () => {
      expect(c64Theme.xtermTheme.cursor).toBe(c64Theme.cursor);
    });

    it('uses C64 Pro Mono font', () => {
      expect(c64Theme.fontFamily).toContain('C64 Pro Mono');
    });
  });

  // --- Cross-theme consistency ---
  describe('cross-theme consistency', () => {
    it('all themes have unique ids', () => {
      const ids = allThemes.map(([, t]) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all themes have unique names', () => {
      const names = allThemes.map(([, t]) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('all themes have matching xterm foreground to top-level fg', () => {
      allThemes.forEach(([, theme]) => {
        expect(theme.xtermTheme.foreground).toBe(theme.fg);
      });
    });

    it('fullscreen themes have matching xterm bg to top-level bg', () => {
      // Win95 intentionally has different desktop bg vs terminal bg
      const fullscreenThemes = allThemes.filter(
        ([, t]) => t.layout !== 'windowed',
      );
      fullscreenThemes.forEach(([, theme]) => {
        expect(theme.xtermTheme.background).toBe(theme.bg);
      });
    });
  });
});
