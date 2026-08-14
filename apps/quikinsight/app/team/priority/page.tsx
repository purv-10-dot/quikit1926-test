"use client";
import { useEffect, useState, useMemo } from "react";
import { getTeamPriorities, type TeamPriority } from "@/lib/api/team";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonGrid } from "@/components/ui/Skeleton";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  "completed":       { label: "Completed",       color: "#fff",     bg: "#2563eb" },
  "on-track":        { label: "On track",         color: "#fff",     bg: "#16a34a" },
  "behind-schedule": { label: "Behind schedule",  color: "#fff",     bg: "#d97706" },
  "not-started":     { label: "Not started",      color: "#fff",     bg: "#dc2626" },
  "not-yet-started": { label: "Not yet started",  color: "#fff",     bg: "#6b7280" },
  "not-applicable":  { label: "N/A",              color: "#fff",     bg: "#9ca3af" },
};

function statusCfg(s: string) {
  return STATUS_CONFIG[s] ?? { label: s, color: "#fff", bg: "#9ca3af" };
}

function ownerName(p: TeamPriority) {
  const u = p.owner_user;
  if (!u) return "—";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
}

export default function TeamPriorityPage() {
  const [priorities, setPriorities] = useState<TeamPriority[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [quarter, setQuarter] = useState("all");

  useEffect(() => {
    getTeamPriorities().then(setPriorities).catch(() => setError(true));
  }, []);

  const quarters = useMemo(() => {
    if (!priorities) return [];
    return Array.from(new Set(priorities.map((p) => `${p.quarter} ${p.year}`))).sort().reverse();
  }, [priorities]);

  const filtered = useMemo(() => {
    if (!priorities) return [];
    return priorities.filter((p) => {
      const matchQ = quarter === "all" || `${p.quarter} ${p.year}` === quarter;
      const matchS = !search || p.name.toLowerCase().includes(search.toLowerCase());
      return matchQ && matchS;
    });
  }, [priorities, quarter, search]);

  return (
    <div>
      {error ? (
        <NotConnected icon="⚠️" title="Couldn't load priorities" body="Something went wrong. Please refresh and try again." ctaHref="/team/priority" ctaLabel="Retry" />
      ) : !priorities ? (
        <SkeletonGrid />
      ) : priorities.length === 0 ? (
        <NotConnected icon="🎯" title="No priorities found" body="Priorities set in QuikScale for your organisation will appear here." />
      ) : (
        <>
          <div className="filter-row" style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              className="range-select"
              placeholder="Search priorities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 180 }}
            />
            <select className="range-select" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              <option value="all">All quarters</option>
              {quarters.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Priority", "Owner", "Team", "Quarter", "Weeks", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", background: "var(--bg-secondary)", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)", borderBottom: "1px solid var(--hairline)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const sc = statusCfg(p.overallStatus);
                  const weekRange = p.startWeek && p.endWeek ? `W${p.startWeek}–W${p.endWeek}` : "—";
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
                      <td style={{ padding: "10px 14px" }}>
                        <p style={{ margin: 0, fontWeight: 500, color: "var(--ink)" }}>{p.name}</p>
                        {p.description && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{p.description}</p>}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{ownerName(p)}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{p.team?.name ?? "—"}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{p.quarter} {p.year}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{weekRange}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, background: sc.bg, color: sc.color }}>{sc.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>{filtered.length} priorit{filtered.length !== 1 ? "ies" : "y"}</p>
        </>
      )}
    </div>
  );
}
