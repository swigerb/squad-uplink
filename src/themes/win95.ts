import type { TerminalTheme } from './index';

export const win95Theme: TerminalTheme = {
  name: 'Windows 95',
  id: 'win95',

  fg: '#c0c0c0',
  bg: '#008080',
  cursor: '#ffffff',
  selection: 'rgba(0, 0, 128, 0.5)',

  fontFamily: '"W95FA", "Fixedsys", "Courier New", monospace',
  fontSize: 14,
  cols: 80,
  rows: 25,

  glowColor: 'transparent',
  scanlineOpacity: 0,

  borderSize: '3px',
  borderColor: '#c0c0c0',
  layout: 'windowed',
  crtEnabled: false,
  customCss: 'skin-win95',
  chromeFontFamily: '"W95FA", "Fixedsys", "Courier New", monospace',

  xtermTheme: {
    foreground: '#c0c0c0',
    background: '#000080',
    cursor: '#ffffff',
    cursorAccent: '#000080',
    selectionBackground: 'rgba(0, 0, 128, 0.5)',
    black: '#000000',
    red: '#aa0000',
    green: '#00aa00',
    yellow: '#aa5500',
    blue: '#0000aa',
    magenta: '#aa00aa',
    cyan: '#00aaaa',
    white: '#aaaaaa',
    brightBlack: '#555555',
    brightRed: '#ff5555',
    brightGreen: '#55ff55',
    brightYellow: '#ffff55',
    brightBlue: '#5555ff',
    brightMagenta: '#ff55ff',
    brightCyan: '#55ffff',
    brightWhite: '#ffffff',
  },
};
