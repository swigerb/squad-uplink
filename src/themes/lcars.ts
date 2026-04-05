import type { TerminalTheme } from './index';

export const lcarsTheme: TerminalTheme = {
  name: 'LCARS',
  id: 'lcars',

  fg: '#ccccff',
  bg: '#000000',
  cursor: '#ff9900',
  selection: 'rgba(153, 153, 255, 0.3)',

  fontFamily: '"Trek", "Antonio", monospace',
  fontSize: 14,
  cols: 80,
  rows: 24,

  glowColor: 'transparent',
  scanlineOpacity: 0,

  layout: 'panel',
  crtEnabled: false,
  customCss: 'skin-lcars',
  chromeFontFamily: '"Trek", "Antonio", sans-serif',
  accentColors: [
    '#ff9900', // orange
    '#cc99cc', // lavender
    '#9999ff', // periwinkle
    '#ffcc66', // gold
    '#ff6666', // salmon
  ],

  xtermTheme: {
    foreground: '#ccccff',
    background: '#000000',
    cursor: '#ff9900',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(153, 153, 255, 0.3)',
    black: '#000000',
    red: '#ff6666',
    green: '#99cc99',
    yellow: '#ffcc66',
    blue: '#9999ff',
    magenta: '#cc99cc',
    cyan: '#99ccff',
    white: '#ffffff',
    brightBlack: '#666666',
    brightRed: '#ff9999',
    brightGreen: '#ccffcc',
    brightYellow: '#ffee99',
    brightBlue: '#ccccff',
    brightMagenta: '#eeccee',
    brightCyan: '#cceeff',
    brightWhite: '#ffffff',
  },
};
