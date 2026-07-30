import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

/* Soft fg/bg token pairs keep status colors legible in light and dark.
 * Status is never conveyed by color alone — pair with a label or icon.
 *
 * The brand tone uses color-mix() rather than `bg-[var(--brand-primary)]/10`:
 * `--brand-primary` is a per-tenant hex, and Tailwind 3.4 silently DROPS an
 * opacity modifier applied to an arbitrary `var()` color, so the old class
 * emitted no CSS and this badge rendered with a transparent background. */
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-fg-muted',
  brand: 'bg-[color-mix(in_srgb,var(--brand-primary)_10%,transparent)] text-[var(--brand-primary)]',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
