import { cn } from '@/lib/cn';

export interface ProgressRingProps {
  /** Completion 0–100. */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Center label; defaults to the rounded percentage. */
  label?: string;
  className?: string;
}

/**
 * QuikLMS's signature motif: learning rendered as a progress arc. Used for
 * course completion, mastery, attendance, and goals so a QuikLMS screen is
 * recognizable across every role. Uses the tenant brand color via currentColor
 * so it adapts per tenant. Accessible as a progressbar.
 */
export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  label,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={cn('relative inline-grid place-items-center text-[var(--brand-primary)]', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${Math.round(clamped)}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute font-display text-sm font-semibold text-fg tabular">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
