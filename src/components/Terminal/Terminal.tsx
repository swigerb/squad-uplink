import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTheme } from '@/hooks/useTheme';
import { useConnectionStore } from '@/store/connectionStore';
import { getBootMessage } from '@/lib/bootMessages';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

const FULLSCREEN_MIN_FONT_SIZE = 16;

export interface TerminalHandle {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
  focus?: () => void;
}

export interface TerminalProps {
  /** Called when user types input and presses Enter */
  onInput?: (data: string) => void;
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  function Terminal({ onInput }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const inputBufferRef = useRef('');
    const { theme } = useTheme();

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        xtermRef.current?.write(data);
      },
      writeln: (data: string) => {
        xtermRef.current?.writeln(data);
        xtermRef.current?.write('> ');
      },
      clear: () => {
        xtermRef.current?.clear();
        xtermRef.current?.write('> ');
      },
      focus: () => {
        xtermRef.current?.focus();
      },
    }));

    // Initialize xterm.js
    useEffect(() => {
      if (!containerRef.current) return;

      const term = new XTerm({
        theme: theme.xtermTheme,
        fontFamily: theme.fontFamily,
        fontSize: theme.fontSize,
        cols: theme.cols,
        rows: theme.rows,
        cursorBlink: true,
        cursorStyle: 'block',
        allowTransparency: true,
        convertEol: true,
      });

      const fit = new FitAddon();
      const canvas = new CanvasAddon();
      const links = new WebLinksAddon();

      term.loadAddon(fit);
      term.loadAddon(canvas);
      term.loadAddon(links);

      term.open(containerRef.current);
      fit.fit();

      // Handle user input character by character
      term.onData((data) => {
        if (data === '\r') {
          // Enter pressed — send the buffered line
          term.write('\r\n');
          if (onInput && inputBufferRef.current.length > 0) {
            onInput(inputBufferRef.current);
          }
          inputBufferRef.current = '';
        } else if (data === '\x7f') {
          // Backspace
          if (inputBufferRef.current.length > 0) {
            inputBufferRef.current = inputBufferRef.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (data >= ' ') {
          // Printable character
          inputBufferRef.current += data;
          term.write(data);
        }
      });

      xtermRef.current = term;
      fitRef.current = fit;

      // Skin-aware boot message
      const bootLines = getBootMessage(theme.id);
      for (const line of bootLines) {
        term.writeln(line);
      }
      term.write('\r\n> ');

      const handleResize = () => fit.fit();
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        term.dispose();
        xtermRef.current = null;
        fitRef.current = null;
      };
      // Only re-init on theme identity change
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme.id]);

    // Dynamically adjust font size for fullscreen mode
    const terminalFullscreen = useConnectionStore((s) => s.terminalFullscreen);
    useEffect(() => {
      const term = xtermRef.current;
      const fit = fitRef.current;
      if (!term || !fit) return;

      const targetSize = terminalFullscreen
        ? Math.max(theme.fontSize, FULLSCREEN_MIN_FONT_SIZE)
        : theme.fontSize;

      if (term.options.fontSize !== targetSize) {
        term.options.fontSize = targetSize;
        // Allow DOM to settle before re-fitting
        requestAnimationFrame(() => fit.fit());
      }
    }, [terminalFullscreen, theme.fontSize]);

    return (
      <div
        ref={containerRef}
        id="terminal"
        className="terminal-container"
        data-testid="terminal"
        role="application"
        aria-label="Squad terminal"
        aria-roledescription="terminal"
      />
    );
  }
);
