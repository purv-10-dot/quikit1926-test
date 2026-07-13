"use client";

import { useQuery } from "@tanstack/react-query";
import { Inbox, type LucideIcon } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader, EmptyState } from "@/components/portal/widgets";

export type Col = { key: string; label: string; kind?: "money" | "date" | "status" | "text"; align?: "left" | "right" };

const fmtDate = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString() : "—");

export function ClientList({ type, title, description, columns, icon, endpoint = "/api/v1/portal/client/list" }: { type: string; title: string; description?: string; columns: Col[]; icon?: LucideIcon; endpoint?: string }) {
  const { format } = useCurrency();
  const { data, isPending } = useQuery({
    queryKey: ["portal-list", endpoint, type],
    queryFn: async () => {
      const r = await fetch(`${endpoint}?type=${type}`);
      return r.ok ? ((await r.json()).data as Array<Record<string, unknown>>) : [];
    }
  });

  const render = (row: Record<string, unknown>, col: Col, first: boolean) => {
    const v = row[col.key];
    if (col.kind === "money") return <span className="tabular-nums">{format(Number(v ?? 0))}</span>;
    if (col.kind === "date") return <span className="text-muted-foreground">{fmtDate(v)}</span>;
    if (col.kind === "status") {
      const s = String(v ?? "").toLowerCase();
      const tone = ["paid", "accepted", "completed"].includes(s) ? "bg-emerald-100 text-emerald-700" : ["overdue", "rejected", "declined"].includes(s) ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700";
      return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", tone)}>{String(v ?? "—")}</span>;
    }
    return <span className={cn(first && "font-medium text-primary")}>{v == null || v === "" ? "—" : String(v)}</span>;
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title={title} description={description} />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {isPending ? (
          <div className="space-y-2 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (data ?? []).length === 0 ? (
          <EmptyState icon={icon ?? Inbox} title={`No ${title.toLowerCase()} yet`} hint="When there are records, they'll appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>{columns.map((c) => <th key={c.key} className={cn("px-5 py-2.5", c.align === "right" ? "text-right" : "text-left")}>{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {data!.map((row, ri) => (
                  <tr key={String(row.id ?? ri)} className="hover:bg-muted/40">
                    {columns.map((c, ci) => <td key={c.key} className={cn("px-5 py-2.5", c.align === "right" ? "text-right" : "text-left")}>{render(row, c, ci === 0)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
