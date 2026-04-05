import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTheme } from '@/hooks/useTheme';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

export interface TerminalProps {
  /** Called when user types input and presses Enter */
  onInput?: (data: string) => void;
  /** Content to write to the terminal */
  output?: string;
}

export function Terminal({ onInput, output }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const inputBufferRef = useRef('');
  const { theme } = useTheme();

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

    // Boot message
    term.writeln('╔══════════════════════════════════════╗');
    term.writeln('║       SQUAD UPLINK v0.1.0            ║');
    term.writeln('║   Remote Agent Control Terminal      ║');
    term.writeln('╚══════════════════════════════════════╝');
    term.writeln('');
    term.writeln('Type /status to check connection...');
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

  // Write output to terminal when it changes
  useEffect(() => {
    if (output && xtermRef.current) {
      xtermRef.current.writeln(output);
      xtermRef.current.write('> ');
    }
  }, [output]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      data-testid="terminal"
    />
  );
}
