import type { TerminalTheme } from './index';

export const muthurTheme: TerminalTheme = {
  name: 'MU-TH-UR 6000',
  id: 'muthur',

  fg: '#7af042',
  bg: '#000000',
  cursor: '#7af042',
  selection: 'rgba(122, 240, 66, 0.2)',

  fontFamily: '"Share Tech Mono", monospace',
  fontSize: 18,
  cols: 80,
  rows: 24,

  glowColor: 'rgba(122, 240, 66, 0.5)',
  scanlineOpacity: 0.04,

  layout: 'fullscreen',
  crtEnabled: false,
  customCss: 'skin-muthur',

  xtermTheme: {
    foreground: '#7af042',
    background: '#000000',
    cursor: '#7af042',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(122, 240, 66, 0.2)',
    black: '#000000',
    red: '#ff4444',
    green: '#7af042',
    yellow: '#7df14a',
    blue: '#4a7a30',
    magenta: '#7af042',
    cyan: '#5cbf38',
    white: '#7af042',
    brightBlack: '#3a5a20',
    brightRed: '#ff6666',
    brightGreen: '#9aff6a',
    brightYellow: '#b0ff80',
    brightBlue: '#7af042',
    brightMagenta: '#9aff6a',
    brightCyan: '#80e050',
    brightWhite: '#c0ffa0',
  },
};
