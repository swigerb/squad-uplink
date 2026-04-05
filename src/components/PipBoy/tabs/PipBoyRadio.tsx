import { useState, useCallback, useRef, type KeyboardEvent } from 'react';
import { useConnectionStore } from '@/store/connectionStore';
import { connectionManager } from '@/lib/ConnectionManager';
import { handleCommand, type TerminalWriter } from '@/lib/commands';

const QUICK_COMMANDS = ['STATUS', 'STOP', 'RESET', 'AGENTS'] as const;

export function PipBoyRadio() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const commandHistory = useConnectionStore((s) => s.commandHistory);
  const uplinkOverride = useConnectionStore((s) => s.uplinkOverride);
  const addCommand = useConnectionStore((s) => s.addCommand);
  const toggleUplinkOverride = useConnectionStore(
    (s) => s.toggleUplinkOverride,
  );
  const status = useConnectionStore((s) => s.status);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const terminalWriter: TerminalWriter = {
    write: (data: string) => {
      setOutput((prev) => [...prev, data]);
      scrollToBottom();
    },
    writeln: (data: string) => {
      // Strip ANSI escape codes for display
      const clean = data.replace(/\x1b\[[0-9;]*m/g, '');
      setOutput((prev) => [...prev, clean]);
      scrollToBottom();
    },
    clear: () => setOutput([]),
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    });
  };

  const executeCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      addCommand(trimmed);
      setOutput((prev) => [...prev, `> ${trimmed}`]);
      setHistoryIndex(-1);

      // If it starts with /, route to command handler
      if (trimmed.startsWith('/')) {
        handleCommand(trimmed, terminalWriter);
      } else {
        // Send as a prompt to squad-rc
        if (connectionManager.isConnected) {
          connectionManager.send({
            type: 'prompt',
            text: trimmed,
            ...(uplinkOverride ? { agent: '__override__' } : {}),
          });
          terminalWriter.writeln('Sent.');
        } else {
          terminalWriter.writeln('Not connected. Use /connect first.');
        }
      }
      setInput('');
      scrollToBottom();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addCommand, uplinkOverride],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const newIndex =
        historyIndex < commandHistory.length - 1
          ? historyIndex + 1
          : historyIndex;
      setHistoryIndex(newIndex);
      setInput(commandHistory[commandHistory.length - 1 - newIndex] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex] ?? '');
      }
    }
  };

  const handleQuickCommand = (cmd: string) => {
    executeCommand(`/${cmd.toLowerCase()}`);
  };

  return (
    <div className="pipboy-radio" data-testid="pipboy-radio">
      <div className="pipboy-radio-header">COMMAND CONSOLE</div>

      {/* Output area */}
      <div
        className="pipboy-radio-output"
        ref={outputRef}
        data-testid="pipboy-radio-output"
      >
        {output.length === 0 ? (
          <div className="pipboy-radio-placeholder">
            READY FOR INPUT. TYPE /HELP FOR COMMANDS.
          </div>
        ) : (
          output.map((line, i) => (
            <div key={i} className="pipboy-radio-line">
              {line}
            </div>
          ))
        )}
      </div>

      {/* Quick command buttons */}
      <div className="pipboy-radio-buttons" data-testid="pipboy-radio-buttons">
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            className="pipboy-radio-btn"
            onClick={() => handleQuickCommand(cmd)}
            data-testid={`radio-btn-${cmd.toLowerCase()}`}
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Uplink Override toggle */}
      <div className="pipboy-radio-override">
        <button
          className={`pipboy-radio-override-btn ${uplinkOverride ? 'pipboy-radio-override-btn--active' : ''}`}
          onClick={toggleUplinkOverride}
          aria-pressed={uplinkOverride}
          data-testid="pipboy-radio-override"
        >
          UPLINK OVERRIDE [{uplinkOverride ? 'ON' : 'OFF'}]
        </button>
        {uplinkOverride && (
          <span className="pipboy-radio-override-warn">
            ⚠ AUTONOMOUS PLANNING BYPASSED
          </span>
        )}
      </div>

      {/* Input field */}
      <div className="pipboy-radio-input-row">
        <span className="pipboy-radio-prompt">
          {status === 'connected' ? '▶' : '▷'}
        </span>
        <input
          ref={inputRef}
          className="pipboy-radio-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          autoComplete="off"
          spellCheck={false}
          data-testid="pipboy-radio-input"
        />
      </div>
    </div>
  );
}
