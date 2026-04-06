import { useEffect, useRef, useState, useCallback } from 'react';

interface MatrixRainProps {
  onComplete?: () => void;
}

const CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*';

const DURATION_MS = 3000;
const FADE_MS = 800;
const FONT_SIZE = 14;

export function MatrixRain({ onComplete }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [fading, setFading] = useState(false);

  const startTime = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Lazy-init columns on first draw
    if (!startTime.current) {
      startTime.current = performance.now();
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const cols = Math.floor(canvas.width / FONT_SIZE);
      const drops: number[] = new Array(cols).fill(0).map(() => Math.random() * -50);
      (canvas as unknown as Record<string, unknown>)._drops = drops;
    }

    const drops = (canvas as unknown as Record<string, unknown>)._drops as number[];
    const elapsed = performance.now() - startTime.current;

    if (elapsed > DURATION_MS) {
      setFading(true);
      // Let CSS transition handle fade, then call onComplete
      setTimeout(() => onComplete?.(), FADE_MS);
      return;
    }

    // Fade trail
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#00ff00';
    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 4;

    for (let i = 0; i < drops.length; i++) {
      const char = CHARS[Math.floor(Math.random() * CHARS.length)];
      const x = i * FONT_SIZE;
      const y = drops[i] * FONT_SIZE;

      // Bright head character
      ctx.fillStyle = '#ffffff';
      ctx.fillText(char, x, y);

      // Trail characters are green
      ctx.fillStyle = '#00ff00';

      drops[i]++;

      if (drops[i] * FONT_SIZE > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, [onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Fill initial black
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className={`matrix-rain-canvas${fading ? ' matrix-rain-canvas--fading' : ''}`}
      aria-hidden="true"
    />
  );
}
