import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/* Press feedback (active:scale), disabled clarity, on-brand focus ring, and a
 * minimum 44px tap target on md/lg — per the accessibility/interaction rules. */
const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-md whitespace-nowrap ' +
  'transition-[transform,background-color,box-shadow,border-color] duration-150 ' +
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

const variants: Record<Variant, string> = {
  primary:
    'text-white shadow-sm bg-[var(--brand-primary)] hover:brightness-110 active:brightness-95',
  secondary:
    'text-white bg-[var(--brand-secondary)] hover:brightness-110 active:brightness-95',
  outline:
    'border border-line-strong text-fg bg-surface hover:bg-surface-muted',
  ghost: 'text-fg hover:bg-surface-muted',
  danger: 'text-white bg-danger hover:brightness-110 active:brightness-95',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm', // 44px — meets touch target minimum
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
});
