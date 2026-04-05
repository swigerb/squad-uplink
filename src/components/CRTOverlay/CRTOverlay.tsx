import { useTheme } from '@/hooks/useTheme';
import './CRTOverlay.css';

export function CRTOverlay() {
  const { theme } = useTheme();

  return (
    <div
      className="crt-overlay"
      style={
        {
          '--crt-glow-color': theme.glowColor,
          '--crt-scanline-opacity': theme.scanlineOpacity,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="crt-scanlines" />
      <div className="crt-glow" />
    </div>
  );
}
