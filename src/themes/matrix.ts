import type { TerminalTheme } from './index';

export const matrixTheme: TerminalTheme = {
  name: 'The Matrix',
  id: 'matrix',

  fg: '#00ff00',
  bg: '#000000',
  cursor: '#00ff00',
  selection: 'rgba(0, 255, 0, 0.2)',

  fontFamily: '"Share Tech Mono", monospace',
  fontSize: 16,
  cols: 80,
  rows: 24,

  glowColor: 'rgba(0, 255, 0, 0.4)',
  scanlineOpacity: 0.06,

  layout: 'fullscreen',
  crtEnabled: false,
  customCss: 'skin-matrix',

  xtermTheme: {
    foreground: '#00ff00',
    background: '#000000',
    cursor: '#00ff00',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(0, 255, 0, 0.2)',
    black: '#000000',
    red: '#ff3333',
    green: '#00ff00',
    yellow: '#ccff00',
    blue: '#009900',
    magenta: '#00cc66',
    cyan: '#00ff66',
    white: '#00ff00',
    brightBlack: '#003300',
    brightRed: '#ff6666',
    brightGreen: '#66ff66',
    brightYellow: '#ccff66',
    brightBlue: '#33ff33',
    brightMagenta: '#33ff99',
    brightCyan: '#66ffcc',
    brightWhite: '#ccffcc',
  },
};
