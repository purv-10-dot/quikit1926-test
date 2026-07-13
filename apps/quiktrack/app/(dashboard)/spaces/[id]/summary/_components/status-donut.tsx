"use client";

import { useRef, useState } from "react";

interface Segment {
  name: string;
  color: string;
  count: number;
}

/**
 * Hand-rolled SVG donut chart for the Summary "Status overview" card.
 * No charting dependency — segments are stroked arcs on a single circle
 * using stroke-dasharray, starting at 12 o'clock. Custom cursor-following
 * tooltip on hover.
 */
export function StatusDonut({
  segments,
  total,
}: {
  segments: Segment[];
  total: number;
}) {
  const visible = segments.filter((s) => s.count > 0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const size = 168;
  const baseStroke = 18;
  const hoverStroke = 24;
  // Leave room for the thicker hover stroke so the ring never clips at the
  // viewBox edge: r + hoverStroke/2 must stay inside size/2 (minus a little).
  const r = size / 2 - hoverStroke / 2 - 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  function move(e: React.MouseEvent, i: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ i, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  let offset = 0;

  return (
    <div className="flex w-full items-center justify-center gap-12">
      <div ref={wrapRef} className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Status distribution">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={baseStroke} />
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {visible.map((s, i) => {
              const frac = total > 0 ? s.count / total : 0;
              const dash = frac * c;
              const isHover = hover?.i === i;
              const seg = (
                <circle
                  key={s.name}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={s.color || "#94a3b8"}
                  strokeWidth={isHover ? hoverStroke : baseStroke}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  className="cursor-pointer transition-[stroke-width] duration-150"
                  onMouseMove={(e) => move(e, i)}
                  onMouseLeave={() => setHover(null)}
                />
              );
              offset += dash;
              return seg;
            })}
          </g>
          {/* SVG `fill` isn't touched by the global dark remap (that targets
              `color`), so the total went near-black-on-dark. Set dark fills. */}
          <text x={cx} y={cy - 2} textAnchor="middle" className="fill-gray-900 dark:fill-slate-100" style={{ fontSize: 28, fontWeight: 600 }}>
            {total}
          </text>
          <text x={cx} y={cy + 17} textAnchor="middle" className="fill-gray-500 dark:fill-slate-400" style={{ fontSize: 11 }}>
            Total
          </text>
        </svg>

        {hover && hover.x >= 0 && visible[hover.i] && (
          <div
            className="pointer-events-none absolute z-20 flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: hover.x + 12,
              top: hover.y + 12,
            }}
          >
            <span
              className="h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ background: visible[hover.i]!.color || "#94a3b8" }}
            />
            <span className="font-medium text-gray-900">{visible[hover.i]!.name}</span>
            <span className="tabular-nums text-gray-500">
              {visible[hover.i]!.count} · {Math.round((visible[hover.i]!.count / Math.max(1, total)) * 100)}%
            </span>
          </div>
        )}
      </div>

      <ul className="space-y-1.5 min-w-0">
        {visible.map((s, i) => {
          const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
          return (
            <li
              key={s.name}
              className="flex items-center gap-2 text-xs"
              onMouseEnter={() => setHover((h) => (h ? { ...h, i } : { i, x: -9999, y: -9999 }))}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: s.color || "#94a3b8" }}
              />
              <span className="truncate text-gray-700" title={s.name}>
                {s.name}
              </span>
              <span className="tabular-nums text-gray-500">
                {s.count} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
