import type { TerminalTheme } from './index';

export const c64Theme: TerminalTheme = {
  name: 'Commodore 64',
  id: 'c64',

  fg: '#706ce4',
  bg: '#3528be',
  cursor: '#706ce4',
  selection: 'rgba(112, 108, 228, 0.3)',

  fontFamily: '"C64 Pro Mono", "Courier New", monospace',
  fontSize: 16,
  cols: 40,
  rows: 25,

  glowColor: 'rgba(112, 108, 228, 0.4)',
  scanlineOpacity: 0.08,

  xtermTheme: {
    foreground: '#706ce4',
    background: '#3528be',
    cursor: '#706ce4',
    cursorAccent: '#3528be',
    selectionBackground: 'rgba(112, 108, 228, 0.3)',
    black: '#3528be',
    blue: '#706ce4',
    brightBlue: '#a09cf0',
  },
};
