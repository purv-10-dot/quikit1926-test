"use client";

import { nodeMeta } from "@/lib/builder/node-meta";
import { cn } from "@/lib/utils";

/**
 * n8n-style workflow node card: a left icon chip (colored per kind), the node's
 * category label, and its title line. Rendered as a button when `onClick` is
 * given (builder canvas) or a static card otherwise (read-only detail view).
 */
export function NodeCard({
  kind,
  title,
  subtitle,
  selected = false,
  onClick,
}: {
  kind: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const meta = nodeMeta(kind);
  const Icon = meta.icon;

  const body = (
    <div className="flex items-center gap-3">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.chip)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{meta.label}</p>
        <p className="truncate font-medium">{title}</p>
        {subtitle ? <p className="truncate text-xs text-gray-500">{subtitle}</p> : null}
      </div>
    </div>
  );

  const classes = cn(
    "w-full rounded-xl border-2 bg-[var(--color-bg-primary)] p-4 text-left shadow-sm transition-colors",
    selected ? "border-accent-500 ring-2 ring-accent-400/30" : "border-[var(--color-border)]",
    onClick ? "hover:border-accent-400" : "",
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
