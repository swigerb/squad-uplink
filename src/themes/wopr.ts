import type { TerminalTheme } from './index';

export const woprTheme: TerminalTheme = {
  name: 'W.O.P.R.',
  id: 'wopr',

  fg: '#7cb4fc',
  bg: '#162030',
  cursor: '#7cb4fc',
  selection: 'rgba(124, 180, 252, 0.25)',

  fontFamily: '"VT323", monospace',
  fontSize: 20,
  cols: 80,
  rows: 24,

  glowColor: 'rgba(137, 211, 253, 0.4)',
  scanlineOpacity: 0.08,

  layout: 'fullscreen',
  crtEnabled: false,
  customCss: 'skin-wopr',

  xtermTheme: {
    foreground: '#7cb4fc',
    background: '#162030',
    cursor: '#7cb4fc',
    cursorAccent: '#162030',
    selectionBackground: 'rgba(124, 180, 252, 0.25)',
    black: '#162030',
    red: '#ff6b6b',
    green: '#7cb4fc',
    yellow: '#a8d4ff',
    blue: '#4a8ed4',
    magenta: '#9cb8e0',
    cyan: '#89d3fd',
    white: '#7cb4fc',
    brightBlack: '#2a3a50',
    brightRed: '#ff8888',
    brightGreen: '#a8d4ff',
    brightYellow: '#c0e0ff',
    brightBlue: '#7cb4fc',
    brightMagenta: '#b0d0f0',
    brightCyan: '#a0e4ff',
    brightWhite: '#d4e8ff',
  },
};
