import { useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '@/store/connectionStore';
import type { MessageHistoryEntry } from '@/types/squad-rc';

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function LogEntry({ entry }: { entry: MessageHistoryEntry }) {
  const directionIcon = entry.direction === 'inbound' ? '◄' : '►';
  const directionClass =
    entry.direction === 'inbound'
      ? 'pipboy-data-inbound'
      : 'pipboy-data-outbound';

  return (
    <div
      className={`pipboy-data-entry ${directionClass}`}
      data-testid={`log-entry-${entry.id}`}
    >
      <span className="pipboy-data-time">
        {formatTimestamp(entry.timestamp)}
      </span>
      <span className="pipboy-data-direction">{directionIcon}</span>
      {entry.agent && (
        <span className="pipboy-data-agent">@{entry.agent}</span>
      )}
      <span className="pipboy-data-type">[{entry.type}]</span>
      <span className="pipboy-data-content">
        {truncate(entry.content, 120)}
      </span>
    </div>
  );
}

export function PipBoyData() {
  const messageHistory = useConnectionStore((s) => s.messageHistory);
  const status = useConnectionStore((s) => s.status);
  const [showRaw, setShowRaw] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messageHistory.length]);

  const latestEntry: MessageHistoryEntry | null =
    messageHistory.length > 0
      ? messageHistory[messageHistory.length - 1]
      : null;

  return (
    <div className="pipboy-data" data-testid="pipboy-data">
      <div className="pipboy-data-header">
        <span className="pipboy-data-title">DECISION LOG</span>
        <span className="pipboy-data-count">
          [{messageHistory.length} ENTRIES]
        </span>
        <button
          className="pipboy-data-raw-btn"
          onClick={() => setShowRaw(!showRaw)}
          data-testid="pipboy-data-raw-toggle"
          aria-pressed={showRaw}
        >
          {showRaw ? 'HIDE RAW' : 'SHOW RAW'}
        </button>
      </div>

      {status === 'disconnected' && messageHistory.length === 0 ? (
        <div className="pipboy-data-empty" data-testid="pipboy-data-empty">
          NO DATA — CONNECT TO BEGIN LOGGING
        </div>
      ) : (
        <>
          <div
            className="pipboy-data-log"
            ref={scrollRef}
            data-testid="pipboy-data-log"
          >
            {messageHistory.length === 0 ? (
              <div className="pipboy-data-waiting">
                AWAITING TRANSMISSIONS...
              </div>
            ) : (
              messageHistory.map((entry) => (
                <LogEntry key={entry.id} entry={entry} />
              ))
            )}
          </div>

          {showRaw && latestEntry && (
            <div className="pipboy-data-raw" data-testid="pipboy-data-raw">
              <div className="pipboy-data-raw-title">
                RAW PAYLOAD — {formatTimestamp(latestEntry.timestamp)}
              </div>
              <pre className="pipboy-data-raw-json">
                {JSON.stringify(latestEntry.raw, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
