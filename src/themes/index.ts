import type { ITheme } from '@xterm/xterm';

export interface TerminalTheme {
  /** Display name */
  name: string;
  /** Machine-readable id */
  id: 'apple2e' | 'c64' | 'ibm3270' | 'win95' | 'lcars' | 'pipboy';

  /** Foreground color */
  fg: string;
  /** Background color */
  bg: string;
  /** Cursor color */
  cursor: string;
  /** Selection background */
  selection: string;

  /** Font family for the terminal */
  fontFamily: string;
  /** Font size in pixels */
  fontSize: number;
  /** Terminal column count */
  cols: number;
  /** Terminal row count */
  rows: number;

  /** CRT glow color (used for CSS text-shadow / box-shadow) */
  glowColor: string;
  /** Scanline opacity (0–1) */
  scanlineOpacity: number;

  /** Border size for themes with decorative borders (C64, Win95) */
  borderSize?: string;
  /** Border color */
  borderColor?: string;
  /** Layout mode: fullscreen CRT, windowed GUI, panel-based, pip-boy tabbed, or apple2e 3D */
  layout?: 'fullscreen' | 'windowed' | 'panel' | 'pipboy' | 'apple2e';
  /** Whether CRT scanline/glow effects are enabled */
  crtEnabled?: boolean;
  /** Skin-specific CSS class name applied to the root */
  customCss?: string;
  /** Font family for non-terminal UI chrome (Win95 title bar, LCARS panels) */
  chromeFontFamily?: string;
  /** Accent colors for multi-color themes (LCARS) */
  accentColors?: string[];

  /** xterm.js ITheme override */
  xtermTheme: ITheme;
}

export type ThemeId = TerminalTheme['id'];

/** Ordered list of all theme IDs for cycling */
export const THEME_ORDER: readonly ThemeId[] = [
  'apple2e',
  'c64',
  'ibm3270',
  'win95',
  'lcars',
  'pipboy',
] as const;

export { apple2eTheme } from './apple2e';
export { c64Theme } from './c64';
export { ibm3270Theme } from './ibm3270';
export { win95Theme } from './win95';
export { lcarsTheme } from './lcars';
export { pipboyTheme } from './pipboy';
