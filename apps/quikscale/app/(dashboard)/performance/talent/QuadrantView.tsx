"use client";

/**
 * 4-quadrant talent dot plot (A/B/C/D) with density heat map + team filter.
 *
 * Axes:
 *   X = performance (0–100, KPI/Priority/Huddle weighted composite)
 *   Y = potential   (0–100, derived from coreValuesScore + rehireDecision)
 *
 * Quadrant labels at cut-line 50:
 *   A = top-right · stars              (high-perf, high-pot)
 *   B = top-left  · future stars       (low-perf,  high-pot)
 *   C = bottom-right · specialists     (high-perf, low-pot)
 *   D = bottom-left · at risk          (low-perf,  low-pot)
 *
 * Team filter hides non-matching dots entirely (per validated UFJE).
 * Heat map = grid-cell density of plotted dots (deeper tint = more people).
 * Click any dot → opens the existing talent drawer.
 */

import { useMemo, useState } from "react";

type Quadrant = "A" | "B" | "C" | "D";

interface QuadrantPerson {
  userId: string;
  firstName: string;
  lastName: string;
  teamName: string | null;
  performanceScore: number | null;
  potentialScore: number | null;
  quadrant: Quadrant | null;
  kpiScore: number | null;
  rehireDecision: string;
  coreValuesScore: number | null;
}

// SVG canvas in viewBox units. Padding leaves room for axis labels.
const VB_W = 480;
const VB_H = 380;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 36;
const PLOT_W = VB_W - PAD_L - PAD_R;   // 424
const PLOT_H = VB_H - PAD_T - PAD_B;   // 320
const HEAT_COLS = 8;
const HEAT_ROWS = 6;

const QUADRANT_STYLE: Record<Quadrant, { bg: string; label: string; tagline: string }> = {
  A: { bg: "rgba(34,197,94,0.10)",   label: "A · Stars",        tagline: "high perf · high potential" },
  B: { bg: "rgba(245,158,11,0.10)",  label: "B · Future stars", tagline: "low perf · high potential" },
  C: { bg: "rgba(59,130,246,0.10)",  label: "C · Specialists",  tagline: "high perf · low potential" },
  D: { bg: "rgba(239,68,68,0.10)",   label: "D · At risk",      tagline: "low perf · low potential" },
};

const DOT_FILL: Record<Quadrant, string> = {
  A: "#16a34a", // green-600
  B: "#d97706", // amber-600
  C: "#2563eb", // blue-600
  D: "#dc2626", // red-600
};

function initials(p: QuadrantPerson) {
  return `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase();
}

// Stable jitter so dots that share exact coordinates don't perfectly overlap.
// Hash the userId into a [-3, +3] vbUnit offset.
function jitter(userId: string): { dx: number; dy: number } {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return { dx: (h % 7) - 3, dy: (((h >> 3) % 7) - 3) };
}

interface Props {
  people: QuadrantPerson[];
  onSelect: (userId: string) => void;
  /** Org benchmark cut-lines (0–100). Default 50/50. Moves the cross-hair. */
  perfCut?: number;
  potentialCut?: number;
}

export default function QuadrantView({ people, onSelect, perfCut = 50, potentialCut = 50 }: Props) {
  // Team chips — derived from the people list.
  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) if (p.teamName) set.add(p.teamName);
    return ["All teams", ...Array.from(set).sort()];
  }, [people]);

  const [teamFilter, setTeamFilter] = useState<string>("All teams");
  const [hovered, setHovered] = useState<QuadrantPerson | null>(null);

  // Filter (hide other teams entirely — per UFJE decision).
  const filtered = useMemo(() => {
    if (teamFilter === "All teams") return people;
    return people.filter((p) => p.teamName === teamFilter);
  }, [people, teamFilter]);

  // Only dots with both scores get plotted.
  const plotted = useMemo(
    () => filtered.filter((p) => p.performanceScore !== null && p.potentialScore !== null && p.quadrant),
    [filtered],
  );

  // Unrated bucket — people in the team but missing scores.
  const unrated = useMemo(() => filtered.filter((p) => !plotted.includes(p)), [filtered, plotted]);

  // Per-quadrant counts (filtered).
  const counts = useMemo(() => {
    const c: Record<Quadrant, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const p of plotted) c[p.quadrant!]++;
    return c;
  }, [plotted]);

  // Build heat-map grid: count dots per cell.
  const heat = useMemo(() => {
    const grid: number[][] = Array.from({ length: HEAT_ROWS }, () => Array(HEAT_COLS).fill(0));
    for (const p of plotted) {
      const cx = Math.min(HEAT_COLS - 1, Math.floor((p.performanceScore! / 100) * HEAT_COLS));
      const cy = Math.min(HEAT_ROWS - 1, Math.floor(((100 - p.potentialScore!) / 100) * HEAT_ROWS));
      grid[cy]![cx]!++;
    }
    let max = 0;
    for (const row of grid) for (const v of row) if (v > max) max = v;
    return { grid, max };
  }, [plotted]);

  function xToPx(perf: number) { return PAD_L + (perf / 100) * PLOT_W; }
  function yToPx(pot: number)  { return PAD_T + ((100 - pot) / 100) * PLOT_H; }

  const cellW = PLOT_W / HEAT_COLS;
  const cellH = PLOT_H / HEAT_ROWS;

  // Cut-line pixel positions (cross-hair + quadrant region edges).
  const cutX = xToPx(perfCut);       // vertical line at performance cut
  const cutY = yToPx(potentialCut);  // horizontal line at potential cut
  const leftW = cutX - PAD_L;
  const rightW = PAD_L + PLOT_W - cutX;
  const topH = cutY - PAD_T;
  const botH = PAD_T + PLOT_H - cutY;

  return (
    <div className="mt-2 space-y-3">
      {/* Team filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 mr-1">Team:</span>
        {teams.map((t) => (
          <button
            key={t}
            onClick={() => setTeamFilter(t)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
              teamFilter === t
                ? "bg-accent-600 text-white border-transparent"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-600" />A&nbsp;{counts.A}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-600" />B&nbsp;{counts.B}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-600" />C&nbsp;{counts.C}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-600" />D&nbsp;{counts.D}</span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <div className="relative">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full select-none" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
            {/* Quadrant backgrounds (sized to the configured cut-lines) */}
            <rect x={PAD_L} y={PAD_T}   width={leftW}  height={topH} fill={QUADRANT_STYLE.B.bg} />
            <rect x={cutX}  y={PAD_T}   width={rightW} height={topH} fill={QUADRANT_STYLE.A.bg} />
            <rect x={PAD_L} y={cutY}    width={leftW}  height={botH} fill={QUADRANT_STYLE.D.bg} />
            <rect x={cutX}  y={cutY}    width={rightW} height={botH} fill={QUADRANT_STYLE.C.bg} />

            {/* Heat-map cells */}
            {heat.grid.map((row, ri) =>
              row.map((count, ci) => {
                if (count === 0 || heat.max === 0) return null;
                const intensity = count / heat.max; // 0–1
                return (
                  <rect
                    key={`heat-${ri}-${ci}`}
                    x={PAD_L + ci * cellW}
                    y={PAD_T + ri * cellH}
                    width={cellW}
                    height={cellH}
                    fill={`rgba(99,102,241,${0.06 + intensity * 0.18})`} // indigo, capped at ~0.24
                  />
                );
              }),
            )}

            {/* Cross-hairs at the configured cut-lines */}
            <line x1={cutX} y1={PAD_T} x2={cutX} y2={PAD_T + PLOT_H} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" />
            <line x1={PAD_L} y1={cutY} x2={PAD_L + PLOT_W} y2={cutY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" />
            <text x={cutX} y={PAD_T - 8} fontSize="8" fill="#94a3b8" textAnchor="middle">perf {perfCut}</text>
            <text x={PAD_L + PLOT_W + 2} y={cutY + 3} fontSize="8" fill="#94a3b8" textAnchor="start">pot {potentialCut}</text>

            {/* Axes (clean lines on the outside) */}
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PLOT_H} stroke="#94a3b8" strokeWidth="1" />
            <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H} stroke="#94a3b8" strokeWidth="1" />

            {/* X-axis ticks (Performance 0-100, label every 20) */}
            {Array.from({ length: 11 }, (_, i) => i * 10).map((v) => {
              const x = PAD_L + (v / 100) * PLOT_W;
              const showLabel = v % 20 === 0;
              return (
                <g key={`xtick-${v}`}>
                  <line x1={x} y1={PAD_T + PLOT_H} x2={x} y2={PAD_T + PLOT_H + (showLabel ? 5 : 3)} stroke="#94a3b8" strokeWidth={1} />
                  {showLabel && (
                    <text x={x} y={PAD_T + PLOT_H + 14} fontSize={8} fill="#64748b" textAnchor="middle">{v}</text>
                  )}
                </g>
              );
            })}
            {/* Y-axis ticks (Potential 0-100, label every 20) */}
            {Array.from({ length: 11 }, (_, i) => i * 10).map((v) => {
              const y = PAD_T + ((100 - v) / 100) * PLOT_H;
              const showLabel = v % 20 === 0;
              return (
                <g key={`ytick-${v}`}>
                  <line x1={PAD_L - (showLabel ? 5 : 3)} y1={y} x2={PAD_L} y2={y} stroke="#94a3b8" strokeWidth={1} />
                  {showLabel && (
                    <text x={PAD_L - 7} y={y + 3} fontSize={8} fill="#64748b" textAnchor="end">{v}</text>
                  )}
                </g>
              );
            })}

            {/* Quadrant labels (top corners of each quadrant, low-contrast) */}
            <text x={PAD_L + 8}               y={PAD_T + 14}                fontSize="10" fontWeight="700" fill="#a16207">{QUADRANT_STYLE.B.label}</text>
            <text x={PAD_L + PLOT_W - 8}      y={PAD_T + 14}                fontSize="10" fontWeight="700" fill="#15803d" textAnchor="end">{QUADRANT_STYLE.A.label}</text>
            <text x={PAD_L + 8}               y={PAD_T + PLOT_H - 6}        fontSize="10" fontWeight="700" fill="#b91c1c">{QUADRANT_STYLE.D.label}</text>
            <text x={PAD_L + PLOT_W - 8}      y={PAD_T + PLOT_H - 6}        fontSize="10" fontWeight="700" fill="#1d4ed8" textAnchor="end">{QUADRANT_STYLE.C.label}</text>

            {/* Axis labels */}
            <text x={PAD_L + PLOT_W / 2} y={VB_H - 8} fontSize="10" fill="#64748b" textAnchor="middle">Performance →</text>
            <text x={12} y={PAD_T + PLOT_H / 2} fontSize="10" fill="#64748b" textAnchor="middle" transform={`rotate(-90 12 ${PAD_T + PLOT_H / 2})`}>Potential →</text>

            {/* Dots */}
            {plotted.map((p) => {
              const { dx, dy } = jitter(p.userId);
              const cx = xToPx(p.performanceScore!) + dx;
              const cy = yToPx(p.potentialScore!) + dy;
              const fill = DOT_FILL[p.quadrant!];
              const isHov = hovered?.userId === p.userId;
              return (
                <g
                  key={p.userId}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(p)}
                  onMouseLeave={() => setHovered((curr) => (curr?.userId === p.userId ? null : curr))}
                  onClick={() => onSelect(p.userId)}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHov ? 11 : 9}
                    fill={fill}
                    stroke="white"
                    strokeWidth={2}
                    opacity={0.92}
                  />
                  <text
                    x={cx}
                    y={cy + 3}
                    fontSize={9}
                    fontWeight={700}
                    fill="white"
                    textAnchor="middle"
                    pointerEvents="none"
                  >
                    {initials(p)}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Hover tooltip */}
          {hovered && (
            <div className="absolute top-2 right-2 bg-white border border-gray-200 rounded-lg shadow-md p-2.5 text-xs max-w-[220px] pointer-events-none">
              <p className="font-semibold text-gray-900">{hovered.firstName} {hovered.lastName}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{hovered.teamName ?? "no team"}</p>
              <div className="mt-1.5 space-y-0.5 text-[11px] text-gray-700">
                <p>Performance: <span className="font-medium">{hovered.performanceScore}%</span></p>
                <p>Potential: <span className="font-medium">{hovered.potentialScore}%</span></p>
                <p>KPI hit: <span className="font-medium">{hovered.kpiScore ?? "—"}%</span></p>
                <p>Rehire: <span className="font-medium capitalize">{hovered.rehireDecision}</span></p>
                <p>Core values: <span className="font-medium">{hovered.coreValuesScore ?? "—"}/5</span></p>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">Click dot to open assessment</p>
            </div>
          )}
        </div>
      </div>

      {/* Unrated list */}
      {unrated.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-amber-800 mb-1.5">
            {unrated.length} {unrated.length === 1 ? "person not yet plotted" : "people not yet plotted"} — they have no rehire decision or core-values rating yet.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unrated.map((p) => (
              <button
                key={p.userId}
                onClick={() => onSelect(p.userId)}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-amber-200 text-xs text-amber-800 hover:bg-amber-100 transition-colors"
              >
                <span className="h-4 w-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-[9px] font-bold">{initials(p)}</span>
                {p.firstName} {p.lastName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
