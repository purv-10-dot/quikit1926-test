import type { CSSProperties } from "react";

// Shimmering placeholder block + a few presets that mirror the real content
// shapes, shown while data is loading (replaces bare "Loading…" text).

export function Skeleton({ h = 14, w = "100%", r = 8, style }: { h?: number | string; w?: number | string; r?: number; style?: CSSProperties }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

export function SkeletonKpiStrip({ n = 4 }: { n?: number }) {
  return (
    <div className="kpi-strip">
      {Array.from({ length: n }).map((_, i) => (
        <div className="kpi" key={i}>
          <Skeleton h={11} w="55%" />
          <Skeleton h={26} w="70%" style={{ marginTop: 12 }} />
          <Skeleton h={10} w="45%" style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChartCards({ n = 2, height = 200 }: { n?: number; height?: number }) {
  return (
    <div className="grid-2">
      {Array.from({ length: n }).map((_, i) => (
        <div className="chart-card" key={i}>
          <Skeleton h={14} w="35%" />
          <Skeleton h={10} w="22%" style={{ marginTop: 8 }} />
          <Skeleton h={height} w="100%" style={{ marginTop: 14, borderRadius: 12 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ n = 4 }: { n?: number }) {
  return (
    <div className="team-grid">
      {Array.from({ length: n }).map((_, i) => (
        <div className="team-card" key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Skeleton h={38} w={38} r={999} />
            <div style={{ flex: 1 }}>
              <Skeleton h={13} w="60%" />
              <Skeleton h={10} w="40%" style={{ marginTop: 8 }} />
            </div>
          </div>
          <Skeleton h={10} w="100%" style={{ marginTop: 16 }} />
          <Skeleton h={10} w="80%" style={{ marginTop: 8 }} />
          <Skeleton h={10} w="90%" style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 4 }: { lines?: number }) {
  return (
    <div className="card">
      <Skeleton h={16} w="40%" />
      <div style={{ marginTop: 16 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} h={11} w={`${90 - i * 8}%`} style={{ display: "block", marginBottom: 10 }} />
        ))}
      </div>
    </div>
  );
}
