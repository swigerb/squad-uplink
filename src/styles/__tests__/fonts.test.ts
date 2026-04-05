/**
 * Font Loading Tests — Wave 6
 *
 * Verifies @font-face declarations, fallback chains, and graceful degradation.
 * Tests the CSS file statically and the theme config font stacks programmatically.
 */
import { describe, it, expect } from 'vitest';
import fontsCSS from '../fonts.css?raw';
import { apple2eTheme } from '@/themes/apple2e';
import { c64Theme } from '@/themes/c64';
import { ibm3270Theme } from '@/themes/ibm3270';
import { win95Theme } from '@/themes/win95';
import { lcarsTheme } from '@/themes/lcars';
import type { TerminalTheme } from '@/themes/index';

// Extract actual @font-face blocks (between { and }) from the CSS
const fontFaceBlocks = Array.from(
  fontsCSS.matchAll(/@font-face\s*\{([^}]+)\}/g),
).map((match) => match[1]);

const allThemes: [string, TerminalTheme][] = [
  ['apple2e', apple2eTheme],
  ['c64', c64Theme],
  ['ibm3270', ibm3270Theme],
  ['win95', win95Theme],
  ['lcars', lcarsTheme],
];

// ============================================================
// Part 1: @font-face declarations
// ============================================================
describe('fonts.css — @font-face declarations', () => {
  it('declares at least 4 @font-face rules', () => {
    expect(fontFaceBlocks.length).toBeGreaterThanOrEqual(4);
  });

  it('every @font-face uses font-display: swap', () => {
    expect(fontFaceBlocks.length).toBeGreaterThan(0);

    for (const block of fontFaceBlocks) {
      expect(block).toContain('font-display: swap');
    }
  });

  it('declares PrintChar21 font for Apple IIe', () => {
    expect(fontsCSS).toContain("font-family: 'PrintChar21'");
  });

  it('declares C64 Pro Mono font', () => {
    expect(fontsCSS).toContain("font-family: 'C64 Pro Mono'");
  });

  it('declares IBM 3270 font', () => {
    expect(fontsCSS).toContain("font-family: 'IBM 3270'");
  });

  it('declares W95FA font for Windows 95', () => {
    expect(fontsCSS).toContain("font-family: 'W95FA'");
  });

  it('declares Trek font for LCARS', () => {
    expect(fontsCSS).toContain("font-family: 'Trek'");
  });

  it('uses woff2 format (modern, compressed)', () => {
    const woff2Refs = fontsCSS.match(/format\('woff2'\)/g);
    expect(woff2Refs).not.toBeNull();
    expect(woff2Refs!.length).toBeGreaterThanOrEqual(fontFaceBlocks.length);
  });
});

// ============================================================
// Part 2: Fallback font chains
// ============================================================
describe('Theme fontFamily — Fallback chains', () => {
  allThemes.forEach(([name, theme]) => {
    describe(name, () => {
      it('has a fontFamily string', () => {
        expect(theme.fontFamily).toBeDefined();
        expect(typeof theme.fontFamily).toBe('string');
        expect(theme.fontFamily.length).toBeGreaterThan(0);
      });

      it('ends with a generic family keyword (monospace or sans-serif)', () => {
        // Every font stack should have a web-safe generic fallback at the end
        const normalized = theme.fontFamily.replace(/\s/g, '').toLowerCase();
        expect(normalized).toMatch(/(monospace|sans-serif|serif)$/);
      });

      it('has at least 2 fonts in the fallback stack', () => {
        // Split by comma — each entry is a font in the fallback chain
        const entries = theme.fontFamily.split(',').map((s) => s.trim());
        expect(entries.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  it('Apple IIe uses PrintChar21 with Apple II fallback', () => {
    expect(apple2eTheme.fontFamily).toContain('PrintChar21');
    expect(apple2eTheme.fontFamily).toContain('Apple II');
    expect(apple2eTheme.fontFamily).toContain('monospace');
  });

  it('C64 uses C64 Pro Mono with PetMe fallback', () => {
    expect(c64Theme.fontFamily).toContain('C64 Pro Mono');
    expect(c64Theme.fontFamily).toContain('PetMe');
    expect(c64Theme.fontFamily).toContain('monospace');
  });

  it('IBM 3270 uses IBM 3270 with IBM Plex Mono fallback', () => {
    expect(ibm3270Theme.fontFamily).toContain('IBM 3270');
    expect(ibm3270Theme.fontFamily).toContain('IBM Plex Mono');
    expect(ibm3270Theme.fontFamily).toContain('monospace');
  });

  it('Win95 terminal uses W95FA with Fixedsys and Courier New fallback', () => {
    expect(win95Theme.fontFamily).toContain('W95FA');
    expect(win95Theme.fontFamily).toContain('Fixedsys');
    expect(win95Theme.fontFamily).toContain('Courier New');
    expect(win95Theme.fontFamily).toContain('monospace');
  });

  it('Win95 chrome uses W95FA with Fixedsys and Courier New fallback', () => {
    expect(win95Theme.chromeFontFamily).toBeDefined();
    expect(win95Theme.chromeFontFamily).toContain('W95FA');
    expect(win95Theme.chromeFontFamily).toContain('Fixedsys');
    expect(win95Theme.chromeFontFamily).toContain('Courier New');
    expect(win95Theme.chromeFontFamily).toContain('monospace');
  });

  it('LCARS chrome uses Trek with Antonio fallback', () => {
    expect(lcarsTheme.chromeFontFamily).toBeDefined();
    expect(lcarsTheme.chromeFontFamily).toContain('Trek');
    expect(lcarsTheme.chromeFontFamily).toContain('Antonio');
    expect(lcarsTheme.chromeFontFamily).toContain('sans-serif');
  });
});

// ============================================================
// Part 3: Graceful degradation
// ============================================================
describe('Font loading — Graceful degradation', () => {
  it('every theme fontFamily contains a web-safe or generic fallback', () => {
    // Web-safe fonts or genre-specific retro fonts that degrade gracefully to generic
    const webSafe = [
      'courier new',
      'consolas',
      'menlo',
      'monaco',
      'tahoma',
      'ms sans serif',
      'helvetica neue',
      'helvetica',
      'arial',
      'monospace',
      'sans-serif',
      'serif',
    ];

    allThemes.forEach(([name, theme]) => {
      const normalized = theme.fontFamily.toLowerCase();
      const hasWebSafe = webSafe.some((f) => normalized.includes(f));
      expect(hasWebSafe, `${name} fontFamily "${theme.fontFamily}" has no web-safe fallback`).toBe(
        true,
      );
    });
  });

  it('chromeFontFamily also has a web-safe or generic fallback where defined', () => {
    const webSafe = [
      'tahoma',
      'ms sans serif',
      'helvetica neue',
      'helvetica',
      'arial',
      'courier new',
      'consolas',
      'sans-serif',
      'monospace',
    ];

    allThemes.forEach(([name, theme]) => {
      if (!theme.chromeFontFamily) return;
      const normalized = theme.chromeFontFamily.toLowerCase();
      const hasWebSafe = webSafe.some((f) => normalized.includes(f));
      expect(
        hasWebSafe,
        `${name} chromeFontFamily "${theme.chromeFontFamily}" has no web-safe fallback`,
      ).toBe(true);
    });
  });

  it('custom font names in themes match @font-face declarations in CSS', () => {
    // Extract font-family names from @font-face blocks
    const declaredFonts = Array.from(
      fontsCSS.matchAll(/font-family:\s*'([^']+)'/g),
    ).map((match) => match[1].toLowerCase());

    // Each theme's primary font (first in stack) should be declared in CSS
    // Exception: system fonts like Consolas, Menlo (not custom, don't need @font-face)
    const systemFonts = new Set([
      'consolas',
      'menlo',
      'courier new',
      'monaco',
      'monospace',
      'sans-serif',
      'serif',
    ]);

    allThemes.forEach(([name, theme]) => {
      // Get first font in fontFamily
      const primaryFont = theme.fontFamily
        .split(',')[0]
        .trim()
        .replace(/"/g, '')
        .toLowerCase();

      if (!systemFonts.has(primaryFont)) {
        expect(
          declaredFonts,
          `${name} primary font "${primaryFont}" not in fonts.css`,
        ).toContain(primaryFont);
      }
    });
  });
});
