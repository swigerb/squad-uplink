import type { TerminalTheme } from './index';

export const pipboyTheme: TerminalTheme = {
  name: 'Pip-Boy 3000',
  id: 'pipboy',

  fg: '#1bff80',
  bg: '#000500',
  cursor: '#1bff80',
  selection: 'rgba(27, 255, 128, 0.25)',

  fontFamily: '"VT323", "Share Tech Mono", monospace',
  fontSize: 9,
  cols: 80,
  rows: 24,

  glowColor: 'rgba(27, 255, 128, 0.7)',
  scanlineOpacity: 0.15,

  layout: 'pipboy',
  crtEnabled: true,
  customCss: 'skin-pipboy',

  xtermTheme: {
    foreground: '#1bff80',
    background: '#000500',
    cursor: '#1bff80',
    cursorAccent: '#000500',
    selectionBackground: 'rgba(27, 255, 128, 0.25)',
    black: '#000500',
    red: '#ffb641',
    green: '#1bff80',
    yellow: '#ffb641',
    blue: '#145b32',
    magenta: '#1bff80',
    cyan: '#0dcc66',
    white: '#1bff80',
    brightBlack: '#145b32',
    brightRed: '#ffb641',
    brightGreen: '#4dffaa',
    brightYellow: '#ffcc66',
    brightBlue: '#1bff80',
    brightMagenta: '#4dffaa',
    brightCyan: '#33ffaa',
    brightWhite: '#ccffdd',
  },
};
