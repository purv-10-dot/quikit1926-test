/**
 * Lightweight skeleton primitives used across QuikTrack lists/tables. Pure
 * Tailwind + the `qt-shimmer` keyframes in globals.css — no JS state.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`qt-shimmer block rounded ${className}`} />;
}

export function SkeletonText({ width = "w-24", height = "h-3" }: { width?: string; height?: string }) {
  return <Skeleton className={`${width} ${height}`} />;
}

export function SkeletonAvatar() {
  return <span className="qt-shimmer inline-block h-6 w-6 rounded-full" />;
}

export function SkeletonBadge() {
  return <Skeleton className="h-4 w-16 rounded-full" />;
}

/**
 * Generic vertical list of shimmer rows. Drop-in replacement for "Loading…"
 * text across feeds, comments, history, work logs, etc.
 */
export function SkeletonList({
  rows = 3,
  withAvatar = false,
}: {
  rows?: number;
  withAvatar?: boolean;
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-2">
          {withAvatar && <span className="qt-shimmer h-7 w-7 rounded-full shrink-0" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Page-level skeleton for the full issue view. Mirrors the breadcrumb +
 * title + description + sub-section layout so the swap-in feels stable.
 */
export function IssueViewSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_360px] gap-6 px-8 pb-6 mx-auto items-start">
      <div className="min-w-0">
        <div className="py-3 border-b border-gray-100 flex items-center gap-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-2" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-2" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="mt-5 space-y-4">
          <Skeleton className="h-7 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
          <Skeleton className="h-4 w-32" />
          <SkeletonList rows={4} />
          <Skeleton className="h-4 w-40" />
          <SkeletonList rows={3} />
        </div>
      </div>
      <div className="space-y-3 pt-6">
        <Skeleton className="h-8 w-24 rounded" />
        <div className="border border-gray-200 rounded-md p-3 space-y-2.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
        </div>
        <div className="border border-gray-200 rounded-md p-3 space-y-2.5">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
