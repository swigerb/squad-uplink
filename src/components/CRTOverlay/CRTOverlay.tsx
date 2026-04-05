import { useTheme } from '@/hooks/useTheme';
import './CRTOverlay.css';

interface CRTOverlayProps {
  /** HITL override — when false, disables CRT effects even on CRT-capable themes */
  crtEnabled?: boolean;
}

export function CRTOverlay({ crtEnabled }: CRTOverlayProps) {
  const { theme } = useTheme();

  // Theme doesn't support CRT, or HITL switch turned it off
  if (theme.crtEnabled === false) return null;
  if (crtEnabled === false) return null;

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
