"use client";

import { RecordCard } from "@/components/design/RecordCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { DataColumn, TableRow } from "@/lib/modules";

type Common = {
  columns: DataColumn[];
  rows: TableRow[];
  rowHref?: ((r: TableRow) => string) | undefined;
  onCardClick?: ((r: TableRow) => void) | undefined;
};

/** Kanban — rows grouped into columns by their status field. */
export function KanbanView({ columns, rows, statusKey, rowHref, onCardClick }: Common & { statusKey: string }) {
  const groups = new Map<string, TableRow[]>();
  for (const r of rows) {
    const s = String(r[statusKey] ?? "—");
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s)!.push(r);
  }
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {Array.from(groups.entries()).map(([status, items]) => (
        <div key={status} className="w-72 shrink-0">
          <div className="mb-2 flex items-center justify-between px-1">
            <StatusBadge status={status} />
            <span className="text-xs font-medium text-muted-foreground">{items.length}</span>
          </div>
          <div className="space-y-3 rounded-2xl bg-muted/30 p-2">
            {items.map((r) => (
              <RecordCard key={r.id} columns={columns} row={r} href={rowHref ? rowHref(r) : null} onClick={onCardClick ? () => onCardClick(r) : undefined} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Timeline — rows on a vertical date rail, newest first. */
export function TimelineView({ columns, rows, dateKey, rowHref, onCardClick }: Common & { dateKey: string }) {
  const sorted = [...rows].sort((a, b) => String(b[dateKey] ?? "").localeCompare(String(a[dateKey] ?? "")));
  return (
    <ol className="relative space-y-4 border-l border-border/60 pl-6">
      {sorted.map((r) => {
        const raw = String(r[dateKey] ?? "");
        const d = raw ? new Date(raw) : null;
        const label = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : raw || "—";
        return (
          <li key={r.id} className="relative">
            <span className="absolute -left-[27px] top-3 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-background" />
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className="max-w-xl">
              <RecordCard columns={columns} row={r} href={rowHref ? rowHref(r) : null} onClick={onCardClick ? () => onCardClick(r) : undefined} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
