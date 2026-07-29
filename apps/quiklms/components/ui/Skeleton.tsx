import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Loading placeholder — reserves space to avoid layout shift (CLS).
 * Shimmer respects prefers-reduced-motion via the global media query. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-md bg-surface-muted',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:animate-shimmer before:bg-gradient-to-r',
        'before:from-transparent before:via-black/5 before:to-transparent dark:before:via-white/5',
        className,
      )}
      {...props}
    />
  );
}
