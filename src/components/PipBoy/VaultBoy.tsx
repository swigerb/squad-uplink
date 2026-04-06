/**
 * VaultBoy — SVG figure for the STAT tab.
 * Simplified but recognizable humanoid in Pip-Boy green (#1bff80).
 * Includes limb damage indicator bars and a subtle idle animation.
 */
import { useMemo } from 'react';

interface LimbStatus {
  head: number;
  torso: number;
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
}

interface VaultBoyProps {
  /** 0–1 per limb, where 1 = full health */
  limbs?: Partial<LimbStatus>;
  className?: string;
}

const DEFAULT_LIMBS: LimbStatus = {
  head: 1,
  torso: 1,
  leftArm: 1,
  rightArm: 1,
  leftLeg: 1,
  rightLeg: 1,
};

const GREEN = '#1bff80';
const DIM = '#145b32';

function HealthBar({ x, y, value, vertical = true }: { x: number; y: number; value: number; vertical?: boolean }) {
  const segments = 5;
  const filled = Math.round(value * segments);

  return (
    <g>
      {Array.from({ length: segments }).map((_, i) => {
        const isFilled = i < filled;
        const bx = vertical ? x : x + i * 6;
        const by = vertical ? y + (segments - 1 - i) * 6 : y;
        return (
          <rect
            key={i}
            x={bx}
            y={by}
            width={4}
            height={4}
            rx={0.5}
            fill={isFilled ? GREEN : DIM}
            opacity={isFilled ? 1 : 0.4}
          />
        );
      })}
    </g>
  );
}

export function VaultBoy({ limbs: limbsInput, className }: VaultBoyProps) {
  const limbs = useMemo(() => ({ ...DEFAULT_LIMBS, ...limbsInput }), [limbsInput]);

  return (
    <svg
      className={className}
      viewBox="0 0 160 200"
      width="160"
      height="200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Vault Boy character"
      data-testid="vault-boy"
    >
      <style>{`
        @keyframes vaultboy-idle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1.5px); }
        }
        .vaultboy-body { animation: vaultboy-idle 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .vaultboy-body { animation: none; }
        }
      `}</style>

      <g className="vaultboy-body" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Hair */}
        <path d="M66 38 Q70 24, 80 22 Q90 20, 95 28" fill={GREEN} stroke="none" opacity="0.7" />
        <path d="M68 36 Q72 26, 80 24 Q88 22, 92 30" stroke={GREEN} fill="none" />

        {/* Head */}
        <ellipse cx="80" cy="46" rx="16" ry="18" />

        {/* Face — eyes, smile */}
        <circle cx="74" cy="43" r="2" fill={GREEN} stroke="none" />
        <circle cx="86" cy="43" r="2" fill={GREEN} stroke="none" />
        <path d="M74 52 Q80 58, 86 52" strokeWidth="2" />

        {/* Neck */}
        <line x1="80" y1="64" x2="80" y2="72" />

        {/* Torso */}
        <path d="M64 72 L96 72 L92 118 L68 118 Z" />

        {/* Belt */}
        <line x1="66" y1="112" x2="94" y2="112" strokeWidth="2" />
        <rect x="76" y="109" width="8" height="6" rx="1" fill={GREEN} stroke="none" opacity="0.6" />

        {/* Left arm */}
        <path d="M64 74 L48 96 L44 116" />
        {/* Left hand — thumb up gesture */}
        <circle cx="44" cy="118" r="4" />
        <line x1="44" y1="114" x2="42" y2="106" strokeWidth="2" />

        {/* Right arm */}
        <path d="M96 74 L112 96 L116 116" />
        {/* Right hand */}
        <circle cx="116" cy="118" r="4" />

        {/* Left leg */}
        <path d="M72 118 L66 156 L60 174" />
        {/* Left foot */}
        <path d="M60 174 L52 178 L52 182 L64 182 L64 178" />

        {/* Right leg */}
        <path d="M88 118 L94 156 L100 174" />
        {/* Right foot */}
        <path d="M100 174 L96 178 L96 182 L108 182 L108 178" />

        {/* Collar detail */}
        <path d="M70 72 L80 80 L90 72" strokeWidth="1.5" opacity="0.5" />
      </g>

      {/* Health bars next to limbs */}
      <HealthBar x={58} y={28} value={limbs.head} />
      <HealthBar x={98} y={78} value={limbs.torso} />
      <HealthBar x={32} y={82} value={limbs.leftArm} />
      <HealthBar x={124} y={82} value={limbs.rightArm} />
      <HealthBar x={48} y={148} value={limbs.leftLeg} />
      <HealthBar x={108} y={148} value={limbs.rightLeg} />
    </svg>
  );
}
