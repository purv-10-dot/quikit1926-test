"use client";

import { useEffect, useState } from "react";
import { SkeletonList } from "@/components/skeleton";

interface Bucket {
  category: "BACKLOG" | "IN_PROGRESS" | "DONE";
  label: string;
  count: number;
  color: string;
}

const CAT_META: Record<Bucket["category"], { label: string; color: string }> = {
  BACKLOG: { label: "To do", color: "#94a3b8" },
  IN_PROGRESS: { label: "In progress", color: "#3b82f6" },
  DONE: { label: "Done", color: "#10b981" },
};

/**
 * Donut chart of issues across the tenant grouped by status category.
 * Built with a single inline SVG — no external chart lib needed for this
 * level of visual fidelity.
 */
export function StatusChartWidget({ refreshKey = 0 }: { refreshKey?: number }) {
  const [buckets, setBuckets] = useState<Bucket[] | null>(null);

  useEffect(() => {
    void Promise.all(
      (Object.keys(CAT_META) as Bucket["category"][]).map((cat) =>
        fetch(`/api/search?statusCategory=${cat}&limit=1`)
          .then((r) => r.json())
          .then((j) => ({
            category: cat,
            count: j?.success ? (j.data?.totalIssues ?? 0) : 0,
            label: CAT_META[cat].label,
            color: CAT_META[cat].color,
          })),
      ),
    ).then((b) => setBuckets(b));
  }, [refreshKey]);

  if (buckets === null) {
    return (
      <div className="p-4">
        <SkeletonList rows={3} />
      </div>
    );
  }

  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total === 0) {
    return (
      <div className="p-5 text-sm text-gray-400 text-center">No data yet.</div>
    );
  }

  // Build donut arcs.
  const radius = 48;
  const stroke = 16;
  const c = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = buckets.map((b) => {
    const len = (b.count / total) * c;
    const arc = { ...b, len, offset };
    offset += len;
    return arc;
  });

  return (
    <div className="p-4 flex items-center gap-5">
      <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
        <g transform="rotate(-90 70 70)">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#f3f4f6"
            strokeWidth={stroke}
          />
          {arcs.map((a) => (
            <circle
              key={a.category}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={`${a.len} ${c - a.len}`}
              strokeDashoffset={-a.offset}
            />
          ))}
        </g>
        <text
          x="70"
          y="70"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-gray-900"
          style={{ fontSize: 22, fontWeight: 600 }}
        >
          {total}
        </text>
        <text
          x="70"
          y="92"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-gray-500"
          style={{ fontSize: 10 }}
        >
          issues
        </text>
      </svg>
      <ul className="flex-1 space-y-1.5 text-sm">
        {buckets.map((b) => (
          <li key={b.category} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: b.color }}
            />
            <span className="text-gray-700 flex-1">{b.label}</span>
            <span className="text-gray-900 font-semibold">{b.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
