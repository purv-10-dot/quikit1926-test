"use client";

// SLA health rollup — % of assigned positions currently IN_TAT, banded for a
// glanceable read. Same underlying counts as the Pos→Offer TAT badges in the
// pipeline table (positionToOfferInTat/AtRisk/Missed) — this just rolls them
// up to one number. Shared between the Company Dashboard (org-wide) and
// Team Performance (org-wide or self, depending on scope) tabs.
export function slaBand(pct: number): { label: string; emoji: string; ring: string } {
  if (pct >= 85) return { label: "Excellent", emoji: "🎉", ring: "#16a34a" };
  if (pct >= 65) return { label: "Good", emoji: "🙂", ring: "#22c55e" };
  if (pct >= 45) return { label: "Needs Attention", emoji: "😐", ring: "#f59e0b" };
  return { label: "Critical", emoji: "⚠️", ring: "#ef4444" };
}

export function SlaHealthGauge({ pct, caption = "Position → Offer, org-wide" }: { pct: number; caption?: string }) {
  const band = slaBand(pct);
  return (
    <div className="bg-accent-800 rounded-xl shadow-sm p-4 flex items-center gap-4 min-w-[240px]">
      <div className="relative w-16 h-16 shrink-0 grid place-items-center">
        <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${band.ring} ${pct}%, rgba(255,255,255,0.18) 0)` }} />
        <div className="absolute w-11 h-11 rounded-full bg-accent-800 grid place-items-center text-[13px] font-extrabold text-white tabular-nums">{pct}%</div>
      </div>
      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-wide text-white/60">SLA Health Score</div>
        <div className="text-sm font-bold text-white mt-0.5">{band.label} {band.emoji}</div>
        <div className="text-[10.5px] text-white/50 mt-0.5">{caption}</div>
      </div>
    </div>
  );
}
