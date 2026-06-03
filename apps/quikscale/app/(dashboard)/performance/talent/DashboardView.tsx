"use client";

/**
 * Talent Dashboard view — combines the 4-quadrant dot-plot (with the org's
 * configured benchmark cut-lines) and an A/B/C/D distribution bar chart
 * broken down per team.
 */

import { useMemo } from "react";
import QuadrantView from "./QuadrantView";

type Quadrant = "A" | "B" | "C" | "D";

interface DashPerson {
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

const BAND_COLOR: Record<Quadrant, string> = {
  A: "bg-green-500",
  B: "bg-amber-500",
  C: "bg-blue-500",
  D: "bg-red-500",
};
const BAND_LABEL: Record<Quadrant, string> = {
  A: "A · Stars",
  B: "B · Future",
  C: "C · Specialist",
  D: "D · At risk",
};

interface Props {
  people: DashPerson[];
  onSelect: (userId: string) => void;
  perfCut: number;
  potentialCut: number;
}

export default function DashboardView({ people, onSelect, perfCut, potentialCut }: Props) {
  // Per-team A/B/C/D counts.
  const distribution = useMemo(() => {
    const byTeam = new Map<string, Record<Quadrant, number>>();
    const ORG = "Organisation";
    const org: Record<Quadrant, number> = { A: 0, B: 0, C: 0, D: 0 };
    let unrated = 0;
    for (const p of people) {
      if (!p.quadrant) { unrated++; continue; }
      org[p.quadrant]++;
      const team = p.teamName ?? "No team";
      const row = byTeam.get(team) ?? { A: 0, B: 0, C: 0, D: 0 };
      row[p.quadrant]++;
      byTeam.set(team, row);
    }
    const teams = Array.from(byTeam.entries())
      .map(([name, counts]) => ({ name, counts, total: counts.A + counts.B + counts.C + counts.D }))
      .sort((a, b) => b.total - a.total);
    return { org, orgTotal: org.A + org.B + org.C + org.D, teams, unrated, ORG };
  }, [people]);

  const orderedBands: Quadrant[] = ["A", "B", "C", "D"];

  return (
    <div className="mt-2 space-y-5">
      {/* ── Org-level distribution summary bar ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Organisation distribution</h3>
          <span className="text-[11px] text-gray-400">{distribution.orgTotal} rated · {distribution.unrated} unrated</span>
        </div>
        {distribution.orgTotal === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No one is rated yet — assess people to populate the quadrant.</p>
        ) : (
          <>
            {/* Single stacked bar */}
            <div className="flex h-6 rounded-md overflow-hidden">
              {orderedBands.map((b) => {
                const pct = (distribution.org[b] / distribution.orgTotal) * 100;
                if (pct === 0) return null;
                return (
                  <div key={b} className={`${BAND_COLOR[b]} flex items-center justify-center`} style={{ width: `${pct}%` }} title={`${BAND_LABEL[b]}: ${distribution.org[b]} (${pct.toFixed(1)}%)`}>
                    {pct > 8 && <span className="text-[10px] font-bold text-white">{distribution.org[b]}</span>}
                  </div>
                );
              })}
            </div>
            {/* 0-100% scale ruler (ticks every 10%) */}
            <div className="relative mt-1 h-3 select-none">
              {Array.from({ length: 11 }, (_, i) => i * 10).map((v) => (
                <div
                  key={v}
                  className="absolute top-0 flex flex-col items-center"
                  style={{ left: `${v}%`, transform: "translateX(-50%)" }}
                >
                  <span className="block h-1.5 w-px bg-gray-300" />
                  <span className="text-[9px] text-gray-400 leading-none mt-0.5">{v}{v === 100 ? "%" : ""}</span>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-3">
              {orderedBands.map((b) => (
                <span key={b} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                  <span className={`inline-block h-2.5 w-2.5 rounded-sm ${BAND_COLOR[b]}`} />
                  {BAND_LABEL[b]} — <span className="font-semibold">{distribution.org[b]}</span>
                  <span className="text-gray-400">({Math.round((distribution.org[b] / distribution.orgTotal) * 100)}%)</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Two-column: quadrant + per-team bars ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Quadrant plot (reuses QuadrantView with the configured cuts) */}
        <div>
          <QuadrantView people={people} onSelect={onSelect} perfCut={perfCut} potentialCut={potentialCut} />
        </div>

        {/* Per-team distribution */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">By team</h3>
          {distribution.teams.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No rated people to break down yet.</p>
          ) : (
            <div className="space-y-3">
              {distribution.teams.map((t) => (
                <div key={t.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{t.name}</span>
                    <span className="text-[10px] text-gray-400">{t.total}</span>
                  </div>
                  <div className="flex h-4 rounded overflow-hidden bg-gray-100">
                    {orderedBands.map((b) => {
                      const pct = (t.counts[b] / t.total) * 100;
                      if (pct === 0) return null;
                      return (
                        <div key={b} className={BAND_COLOR[b]} style={{ width: `${pct}%` }} title={`${BAND_LABEL[b]}: ${t.counts[b]}`} />
                      );
                    })}
                  </div>
                  <div className="flex gap-2.5 mt-1">
                    {orderedBands.filter((b) => t.counts[b] > 0).map((b) => (
                      <span key={b} className="text-[10px] text-gray-500">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${BAND_COLOR[b]} mr-1 align-middle`} />
                        {b} {t.counts[b]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
