import type { ITheme } from '@xterm/xterm';

export interface TerminalTheme {
  /** Display name */
  name: string;
  /** Machine-readable id */
  id: 'apple2e' | 'c64';

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

  /** xterm.js ITheme override */
  xtermTheme: ITheme;
}

export type ThemeId = TerminalTheme['id'];

export { apple2eTheme } from './apple2e';
export { c64Theme } from './c64';
