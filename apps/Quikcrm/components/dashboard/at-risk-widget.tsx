"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, PauseCircle, PhoneOff } from "lucide-react";
import {
  callsMissingDispoHref,
  staleLeadsHref,
  stuckOppsHref,
  tasksHref,
} from "@/lib/dashboard/urls";
import type { AtRiskBucket, AtRiskDto } from "@/lib/dashboard/types";

async function fetchAtRisk(qs: string): Promise<AtRiskDto> {
  const res = await fetch(`/api/dashboard/at-risk?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error(`At-risk failed (${res.status})`);
  return res.json();
}

function CardSkeleton() {
  return (
    <div className="crm-card p-4">
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-crm-panel" />
        <div className="h-7 w-20 animate-pulse rounded bg-crm-panel" />
        <div className="space-y-1.5 pt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3 w-full animate-pulse rounded bg-crm-panel" />
          ))}
        </div>
      </div>
    </div>
  );
}

function AtRiskCard({
  title,
  bucket,
  href,
  icon: Icon,
  tone,
}: {
  title: string;
  bucket: AtRiskBucket;
  href: string;
  icon: typeof AlertTriangle;
  tone: string;
}) {
  return (
    <div className="crm-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-crm-muted">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-crm-text">{bucket.count}</p>
        </div>
        <Icon className={`h-7 w-7 shrink-0 ${tone}`} strokeWidth={1.5} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {bucket.samples.length === 0 ? (
          <li className="text-xs text-crm-muted">Nothing flagged.</li>
        ) : (
          bucket.samples.map((s) => (
            <li key={s.id} className="truncate text-xs text-crm-text">
              <span className="font-medium">{s.primary}</span>
              <span className="text-crm-muted"> · {s.secondary}</span>
              <span className="text-crm-muted"> · {s.ownerName}</span>
            </li>
          ))
        )}
      </ul>
      <Link
        href={href}
        className="mt-3 inline-flex text-xs font-medium text-crm-blue hover:underline"
      >
        View all →
      </Link>
    </div>
  );
}

export function AtRiskWidget({
  qs,
  ownerId,
}: {
  qs: string;
  ownerId?: string | null;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "at-risk", qs],
    queryFn: () => fetchAtRisk(qs),
    staleTime: 30_000,
    refetchInterval: false,
  });

  if (isError) {
    return (
      <div className="crm-card p-4 text-sm text-rose-600">Failed to load at-risk metrics.</div>
    );
  }

  // Render the skeleton whenever there's no data yet — gate on `isLoading || !data`,
  // NOT `isLoading` alone. Under React Query v5, `isLoading === isPending && isFetching`.
  // During SSR queries never fetch, so `isFetching` (and thus `isLoading`) is `false`
  // on the server while there's still no data; the first client render has a fetch in
  // flight, so `isLoading` is `true`. Branching on `isLoading` alone therefore renders
  // the error div on the server and the skeleton grid on the client → a structural
  // hydration mismatch. `isLoading || !data` keeps both renders identical, matching the
  // `loading || !data` pattern used by the other dashboard widgets.
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <AtRiskCard
        title="Overdue tasks"
        bucket={data.overdueTasks}
        href={tasksHref("overdue", { ownerId })}
        icon={Clock}
        tone="text-amber-600"
      />
      <AtRiskCard
        title="Stale leads (7d+)"
        bucket={data.staleLeads}
        href={staleLeadsHref({ ownerId })}
        icon={AlertTriangle}
        tone="text-rose-600"
      />
      <AtRiskCard
        title="Stuck opportunities (30d+)"
        bucket={data.stuckOpportunities}
        href={stuckOppsHref({ ownerId })}
        icon={PauseCircle}
        tone="text-violet-600"
      />
      <AtRiskCard
        title="Calls without disposition"
        bucket={data.callsWithoutDispo}
        href={callsMissingDispoHref({ ownerId })}
        icon={PhoneOff}
        tone="text-sky-600"
      />
    </div>
  );
}
