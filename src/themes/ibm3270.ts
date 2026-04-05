import type { TerminalTheme } from './index';

export const ibm3270Theme: TerminalTheme = {
  name: 'IBM 3270',
  id: 'ibm3270',

  fg: '#ffb000',
  bg: '#000000',
  cursor: '#ffb000',
  selection: 'rgba(255, 176, 0, 0.25)',

  fontFamily: '"IBM 3270", "IBM Plex Mono", monospace',
  fontSize: 16,
  cols: 80,
  rows: 24,

  glowColor: 'rgba(255, 176, 0, 0.35)',
  scanlineOpacity: 0.15,

  layout: 'fullscreen',
  crtEnabled: true,
  customCss: 'skin-ibm3270',

  xtermTheme: {
    foreground: '#ffb000',
    background: '#000000',
    cursor: '#ffb000',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(255, 176, 0, 0.25)',
    black: '#000000',
    yellow: '#ffb000',
    brightYellow: '#ffd966',
    green: '#33ff33',
    red: '#ff3333',
    blue: '#5599ff',
    white: '#ffb000',
    brightWhite: '#ffe0a0',
  },
};
