"use client";

export function LeadDashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-28 rounded-xl bg-crm-panel" />
      <div className="h-16 rounded-xl bg-crm-panel" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-crm-panel" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-96 rounded-xl bg-crm-panel lg:col-span-2" />
        <div className="h-96 rounded-xl bg-crm-panel" />
      </div>
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="crm-card animate-pulse p-4" aria-hidden>
      <div className="h-3 w-20 rounded bg-crm-panel" />
      <div className="mt-3 h-8 w-16 rounded bg-crm-panel" />
      <div className="mt-2 h-8 w-full rounded bg-crm-panel/80" />
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-crm-panel" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-crm-panel" />
            <div className="h-3 w-1/2 rounded bg-crm-panel/80" />
          </div>
        </div>
      ))}
    </div>
  );
}
