/**
 * Zero-dep skeleton loaders. Use instead of "Loading…" text for perceived perf.
 *
 * Usage:
 *   {loading ? <TableSkeleton rows={6} cols={5} /> : <RealTable />}
 */

export function Skeleton({ className = "", width, height }: { className?: string; width?: number | string; height?: number | string }) {
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === "number" ? `${width}px` : width;
  if (height) style.height = typeof height === "number" ? `${height}px` : height;
  return <div style={style} className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-3 py-2 bg-accent-50 flex gap-3">
        {Array.from({ length: cols }).map((_, i) => (<Skeleton key={i} height={14} width="20%" />))}
      </div>
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-3 py-3 border-t border-gray-100 flex gap-3">
            {Array.from({ length: cols }).map((_, c) => (<Skeleton key={c} height={12} width={c === 0 ? "30%" : "20%"} />))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function KpiTileSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <Skeleton className="mb-3" height={30} width={30} />
      <Skeleton height={10} width="50%" className="mb-2" />
      <Skeleton height={22} width="70%" />
    </div>
  );
}
