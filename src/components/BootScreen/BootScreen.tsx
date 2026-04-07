import { useState, useEffect, useRef, useCallback } from 'react';
import './BootScreen.css';

/**
 * Boot sequence line definitions.
 * Each entry: [text, delayAfterMs, cssModifier?]
 */
const BOOT_LINES: [string, number, string?][] = [
  ['SQUAD UPLINK TERMINAL v0.1.0', 200],
  ['(C) 2026 SQUAD SYSTEMS INC.', 300],
  ['', 200],
  ['MEMORY CHECK... 64K OK', 250],
  ['PERIPHERAL SCAN...', 300],
  ['  DEVTUNNEL ADAPTER    [FOUND]', 180, 'indent'],
  ['  XTERM DISPLAY        [FOUND]', 180, 'indent'],
  ['  AUDIO SUBSYSTEM      [FOUND]', 250, 'indent'],
  ['', 200],
  ['LOADING SYSTEM...', 350],
  ['ESTABLISHING UPLINK...', 400],
  ['CONNECTING TO SQUAD-RC...', 500],
  ['', 200],
  ['>>> SYSTEM READY <<<', 0, 'ready'],
];

interface BootScreenProps {
  onComplete: () => void;
}

export function BootScreen({ onComplete }: BootScreenProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [flicker, setFlicker] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  // Remove flicker class after animation plays
  useEffect(() => {
    const id = setTimeout(() => setFlicker(false), 150);
    return () => clearTimeout(id);
  }, []);

  const advanceLine = useCallback(() => {
    setVisibleCount((prev) => {
      const next = prev + 1;
      if (next >= BOOT_LINES.length) {
        // All lines shown — hold briefly then complete
        if (!completedRef.current) {
          completedRef.current = true;
          timeoutRef.current = setTimeout(onComplete, 600);
        }
        return BOOT_LINES.length;
      }
      // Schedule the next line
      const [, delay] = BOOT_LINES[next];
      timeoutRef.current = setTimeout(advanceLine, delay);
      return next;
    });
  }, [onComplete]);

  // Kick off the sequence
  useEffect(() => {
    const [, firstDelay] = BOOT_LINES[0];
    timeoutRef.current = setTimeout(() => {
      setVisibleCount(1);
      const [, nextDelay] = BOOT_LINES[1] ?? [0, 0];
      timeoutRef.current = setTimeout(advanceLine, nextDelay);
    }, firstDelay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [advanceLine]);

  const isComplete = visibleCount >= BOOT_LINES.length;

  return (
    <div
      className={`boot-screen${flicker ? ' boot-screen--flicker' : ''}`}
      role="status"
      aria-label="System boot sequence"
    >
      {BOOT_LINES.slice(0, visibleCount).map(([text, , mod], i) => {
        const isLast = i === visibleCount - 1 && !isComplete;
        const classNames = [
          'boot-line',
          mod === 'indent' ? 'boot-line--indent' : '',
          mod === 'ready' ? 'boot-line--ready' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div key={i} className={classNames}>
            {text}
            {isLast && <span className="boot-cursor" aria-hidden="true" />}
          </div>
        );
      })}
      {isComplete && (
        <div className="boot-line">
          <span className="boot-cursor" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
