"use client";

import type { ReactNode } from "react";
import { useHasMounted } from "@/hooks/use-has-mounted";

export function ChartCard({
  title,
  subtitle,
  height = 280,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  height?: number;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const mounted = useHasMounted();

  return (
    <div className="crm-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-crm-text">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-crm-muted">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4 w-full" style={{ height }}>
        {mounted ? children : null}
      </div>
    </div>
  );
}

export function ChartCardSkeleton({ height = 280, title }: { height?: number; title?: string }) {
  return (
    <div className="crm-card p-5">
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-crm-panel">
          {title ? <span className="sr-only">{title}</span> : null}
        </div>
        <div className="h-3 w-56 animate-pulse rounded bg-crm-panel" />
      </div>
      <div
        className="mt-4 w-full animate-pulse rounded bg-crm-panel/60"
        style={{ height }}
      />
    </div>
  );
}
