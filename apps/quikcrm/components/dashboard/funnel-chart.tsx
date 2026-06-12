"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChartCard, ChartCardSkeleton } from "./chart-card";
import { leadsByStageHref } from "@/lib/dashboard/urls";
import type { FunnelStep } from "@/lib/dashboard/types";

type DrillCtx = { fromIso?: string; toIso?: string; ownerId?: string | null };

const FUNNEL_COLORS = ["#2563eb", "#3b82f6", "#7c3aed", "#0d9488", "#059669", "#d97706"];

async function fetchFunnel(qs: string): Promise<{ steps: FunnelStep[] }> {
  const res = await fetch(`/api/dashboard/funnel?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Funnel failed (${res.status})`);
  return res.json();
}

export function FunnelChart({
  qs,
  drill,
}: {
  /** Pre-built query string (from + to + ownerId). */
  qs: string;
  drill: DrillCtx;
}) {
  const router = useRouter();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", "funnel", qs],
    queryFn: () => fetchFunnel(qs),
    staleTime: 30_000,
    refetchInterval: false,
  });

  if (isLoading) return <ChartCardSkeleton height={300} title="Lead funnel" />;
  if (isError) {
    return (
      <ChartCard title="Lead funnel" subtitle="Conversion percentages from top-of-funnel" height={300}>
        <p className="py-8 text-center text-sm text-rose-600">
          {(error as Error)?.message ?? "Failed to load"}
        </p>
      </ChartCard>
    );
  }

  const steps = data?.steps ?? [];
  return (
    <ChartCard
      title="Lead funnel"
      subtitle="Conversion percentages from top-of-funnel (click a step to drill in)"
      height={300}
    >
      {steps.length === 0 ? (
        <p className="py-8 text-center text-sm text-crm-muted">No leads in this range.</p>
      ) : (
        <div className="flex h-full flex-col justify-between py-2">
          {steps.map((s, i) => {
            const width = Math.max(8, s.pct);
            const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length];
            return (
              <button
                key={s.stage}
                type="button"
                onClick={() => router.push(leadsByStageHref(s.stage, drill))}
                className="group flex items-center gap-3 text-left"
                aria-label={`${s.stage}: ${s.count} leads (${s.pct}%)`}
              >
                <div className="w-32 shrink-0 truncate text-xs font-medium text-crm-text">
                  {s.stage}
                </div>
                <div className="relative h-7 flex-1 rounded bg-crm-panel">
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-all group-hover:opacity-90"
                    style={{ width: `${width}%`, backgroundColor: color }}
                  />
                </div>
                <div className="w-24 shrink-0 text-right text-xs tabular-nums text-crm-text">
                  {s.count} <span className="text-crm-muted">({s.pct}%)</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}
