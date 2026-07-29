'use client';
/**
 * The bar that opens every super-admin page.
 *
 * What it replaces: an identical ~35-line block of hardcoded indigo/violet
 * gradient, an inlined SVG grid data-URI and a 6xl title, pasted into six
 * pages. That block was ~210px tall on a laptop — a third of the fold spent on
 * a title — and, being hardcoded, ignored the console theme entirely.
 *
 * Sized to match the school/corporate tenant banners (large frosted icon, bold
 * display title + subtitle, rounded-3xl) so the super-admin console reads as the
 * same product — every colour still comes from the brand vars (see `.qs-hero` in
 * globals.css), so the super-admin's chosen accent drives it.
 */
import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export function PageHero({
  icon: Icon,
  title,
  highlight,
  subtitle,
  badge,
  actions,
  className,
}: {
  icon?: LucideIcon;
  /** First half of the heading — kept solid. */
  title: string;
  /** Optional second half, rendered de-emphasised ("Platform **Partners**"). */
  highlight?: string;
  subtitle?: string;
  /** Small chip beside the title, e.g. "Portal Settings". */
  badge?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('qs-hero rounded-2xl px-5 py-6 sm:rounded-3xl sm:px-7 sm:py-7', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {Icon && (
            <span className="qs-hero-icon grid size-12 shrink-0 place-items-center rounded-2xl sm:size-14">
              <Icon className="size-6 sm:size-7" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {/* The accessible name is "<title> <highlight>" — the explicit
                  space matters, several e2e specs match on the full string. */}
              <h1 className="text-xl font-extrabold leading-tight tracking-tight sm:text-2xl lg:text-3xl">
                {title}
                {highlight && (
                  <>
                    {' '}
                    <span className="qs-hero-accent">{highlight}</span>
                  </>
                )}
              </h1>
              {badge && (
                <span className="qs-hero-chip rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="qs-hero-sub mt-1.5 max-w-3xl text-[13px] font-medium leading-snug sm:text-sm">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Buttons for the hero's action slot.
 *  - `solid`  — the one primary action (white chip, accent label)
 *  - `ghost`  — secondary actions
 *  - `danger` — destructive; red on hover only, and deliberately un-themed
 */
export function HeroAction({
  variant = 'ghost',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'ghost' | 'danger' }) {
  return (
    <button
      type="button"
      className={cn('qs-hero-btn', `qs-hero-btn-${variant}`, className)}
      {...props}
    >
      {children}
    </button>
  );
}
