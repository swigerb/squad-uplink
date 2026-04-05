import type { TerminalTheme } from './index';

export const apple2eTheme: TerminalTheme = {
  name: 'Apple IIe',
  id: 'apple2e',

  fg: '#33ff33',
  bg: '#000000',
  cursor: '#33ff33',
  selection: 'rgba(51, 255, 51, 0.25)',

  fontFamily: '"PrintChar21", "Courier New", monospace',
  fontSize: 16,
  cols: 80,
  rows: 24,

  glowColor: 'rgba(51, 255, 51, 0.4)',
  scanlineOpacity: 0.12,

  layout: 'fullscreen',
  crtEnabled: true,
  customCss: 'skin-apple2e',

  xtermTheme: {
    foreground: '#33ff33',
    background: '#000000',
    cursor: '#33ff33',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(51, 255, 51, 0.25)',
    black: '#000000',
    green: '#33ff33',
    brightGreen: '#66ff66',
  },
};
