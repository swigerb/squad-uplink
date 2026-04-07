import type { TerminalTheme } from './index';

/**
 * Authentic LCARS theme — Doug Drexler reference palette.
 * Colors sourced from screen-accurate TNG/DS9/Voyager captures (louh/lcars).
 * Font: LCARSGTJ3 free recreation of Helvetica Ultra Compressed.
 */
export const lcarsTheme: TerminalTheme = {
  name: 'LCARS',
  id: 'lcars',

  fg: '#ff9900',
  bg: '#000000',
  cursor: '#ec943a',
  selection: 'rgba(236, 148, 58, 0.3)',

  fontFamily: '"LCARSGTJ3", "Antonio", sans-serif',
  fontSize: 14,
  cols: 80,
  rows: 24,

  glowColor: 'transparent',
  scanlineOpacity: 0,

  layout: 'panel',
  crtEnabled: false,
  customCss: 'skin-lcars',
  chromeFontFamily: '"LCARSGTJ3", "Antonio", sans-serif',
  accentColors: [
    '#ec943a', // warm orange — primary navigation
    '#c082a9', // mauve/pink — accent
    '#8b72aa', // deep lavender/violet
    '#faa41b', // golden yellow — highlights
    '#d29a7f', // salmon
    '#9c698a', // deep mauve
    '#b6a5d1', // light lavender
  ],

  xtermTheme: {
    foreground: '#ff9900',
    background: '#000000',
    cursor: '#ec943a',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(236, 148, 58, 0.3)',
    black: '#000000',
    red: '#e76f51',
    green: '#80ffdb',
    yellow: '#faa41b',
    blue: '#b6a5d1',
    magenta: '#c082a9',
    cyan: '#76c7f0',
    white: '#f1df6f',
    brightBlack: '#666666',
    brightRed: '#eb9870',
    brightGreen: '#80ffdb',
    brightYellow: '#f4a261',
    brightBlue: '#c19ee0',
    brightMagenta: '#d29a7f',
    brightCyan: '#99ccff',
    brightWhite: '#ffffff',
  },
};
