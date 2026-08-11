"use client";
import { useEffect, useState, useMemo } from "react";
import { getTeamKpis, type TeamKpi, type QsTeam } from "@/lib/api/team";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonGrid } from "@/components/ui/Skeleton";

const HEALTH_CONFIG: Record<string, { label: string; color: string }> = {
  "on-track": { label: "On track",  color: "var(--green, #16a34a)" },
  "at-risk":  { label: "At risk",   color: "var(--amber, #d97706)" },
  "critical": { label: "Critical",  color: "var(--red, #dc2626)"   },
  "complete": { label: "Complete",  color: "var(--text-muted)"     },
};

function healthCfg(s: string) {
  return HEALTH_CONFIG[s] ?? { label: s, color: "var(--text-muted)" };
}

function ownerName(kpi: TeamKpi) {
  const u = kpi.owner_user;
  if (!u) return "—";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
}

export default function TeamKpisPage() {
  const [kpis, setKpis]       = useState<TeamKpi[] | null>(null);
  const [teams, setTeams]     = useState<QsTeam[]>([]);
  const [error, setError]     = useState(false);
  const [search, setSearch]   = useState("");
  const [quarter, setQuarter] = useState("all");
  const [teamId, setTeamId]   = useState<string>(""); // "" = all

  useEffect(() => {
    getTeamKpis()
      .then(({ kpis: k, teams: t }) => {
        setTeams(t);
        setKpis(k);
      })
      .catch(() => setError(true));
  }, []);

  // Re-fetch when team selection changes.
  useEffect(() => {
    if (kpis === null) return; // skip initial double-fetch
    setKpis(null);
    getTeamKpis(teamId || undefined)
      .then(({ kpis: k }) => setKpis(k))
      .catch(() => setError(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const quarters = useMemo(() => {
    if (!kpis) return [];
    return Array.from(new Set(kpis.map((k) => `${k.quarter} ${k.year}`))).sort().reverse();
  }, [kpis]);

  const filtered = useMemo(() => {
    if (!kpis) return [];
    return kpis.filter((k) => {
      const matchQ = quarter === "all" || `${k.quarter} ${k.year}` === quarter;
      const matchS = !search || k.name.toLowerCase().includes(search.toLowerCase());
      return matchQ && matchS;
    });
  }, [kpis, quarter, search]);

  const selectedTeamName = teams.find((t) => t.id === teamId)?.name ?? "All teams";

  return (
    <div>
      {error ? (
        <NotConnected icon="⚠️" title="Couldn't load KPIs" body="Something went wrong. Please refresh and try again." ctaHref="/team/kpis" ctaLabel="Retry" />
      ) : !kpis ? (
        <SkeletonGrid />
      ) : (
        <>
          <div className="filter-row" style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {/* Team selector */}
            <select className="range-select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input
              className="range-select"
              placeholder="Search KPIs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 180 }}
            />
            <select className="range-select" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              <option value="all">All quarters</option>
              {quarters.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          {kpis.length === 0 ? (
            <NotConnected icon="📊" title={`No KPIs for ${selectedTeamName}`} body="KPIs created in QuikScale for this team will appear here." />
          ) : filtered.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No KPIs match the current filters.</p>
          ) : (
            <>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["KPI", "Owner", "Team", "Quarter", "Target", "Progress", "Health"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 14px", background: "var(--bg-secondary)", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)", borderBottom: "1px solid var(--hairline)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((k) => {
                      const pct = Math.round(k.progressPercent ?? 0);
                      const hc = healthCfg(k.healthStatus);
                      return (
                        <tr key={k.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 500, color: "var(--ink)" }}>{k.name}</td>
                          <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{ownerName(k)}</td>
                          <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{k.team?.name ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{k.quarter} {k.year}</td>
                          <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{k.target != null ? `${k.target} ${k.measurementUnit}` : "—"}</td>
                          <td style={{ padding: "10px 14px", minWidth: 100 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--hairline)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: hc.color, borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11.5, color: "var(--text-secondary)", width: 32, textAlign: "right" }}>{pct}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: hc.color }}>{hc.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>{filtered.length} KPI{filtered.length !== 1 ? "s" : ""} · {selectedTeamName}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
