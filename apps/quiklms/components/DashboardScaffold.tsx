'use client';
/** Simple dashboard/page scaffold used by the role landing pages. */
import { type ReactNode } from 'react';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { ProgressRing } from './ui/ProgressRing';

export function DashboardScaffold({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">
            {t(`pages.${title}`, title)}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  /** Signed percentage change vs. previous period, e.g. +12 or -4. */
  delta?: number;
  /** 0–100 — renders the signature progress ring instead of a flat number. */
  progress?: number;
}

export function StatCard({ label, value, icon: Icon, delta, progress }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
            <span className="truncate">{label}</span>
          </div>
          <div className="mt-2 font-display text-2xl font-semibold tabular text-fg">{value}</div>
          {delta !== undefined && (
            <div
              className={cn(
                'mt-1 inline-flex items-center gap-1 text-xs font-medium',
                positive ? 'text-success' : 'text-danger',
              )}
            >
              {positive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              <span className="tabular">{positive ? '+' : ''}{delta}%</span>
            </div>
          )}
        </div>
        {progress !== undefined && <ProgressRing value={progress} size={56} strokeWidth={5} />}
      </div>
    </div>
  );
}
