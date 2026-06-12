export function KpiCardSkeleton() {
  return (
    <div className="crm-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="w-full min-w-0 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-crm-panel" />
          <div className="h-7 w-32 animate-pulse rounded bg-crm-panel" />
          <div className="h-3 w-40 animate-pulse rounded bg-crm-panel" />
        </div>
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-crm-panel" />
      </div>
    </div>
  );
}
