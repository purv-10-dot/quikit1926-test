"use client";
import { useEffect, useState } from "react";
import {
  getTeamData,
  getTeamPriorities,
  getTeamWww,
  type TeamData,
  type TeamPriority,
  type TeamWwwItem,
} from "@/lib/api/team";
import type { TeamMember } from "@/types";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import NotConnected from "@/components/ui/NotConnected";

// ─── helpers ────────────────────────────────────────────────────────────────

function kpiPct(k: TeamMember["kpis"][number]) {
  if (k.lowerIsBetter) return Math.min(100, Math.round((k.target / k.current) * 100));
  return Math.min(100, Math.round((k.current / k.target) * 100));
}

const PRIORITY_STATUS: Record<string, { label: string; bg: string }> = {
  "completed":       { label: "Completed",      bg: "#2563eb" },
  "on-track":        { label: "On track",        bg: "#16a34a" },
  "behind-schedule": { label: "Behind schedule", bg: "#d97706" },
  "not-yet-started": { label: "Not yet started", bg: "#6b7280" },
  "not-applicable":  { label: "N/A",             bg: "#9ca3af" },
};

const WWW_STATUS: Record<string, { label: string; bg: string }> = {
  "completed":       { label: "Completed",   bg: "#2563eb" },
  "in-progress":     { label: "In progress", bg: "#16a34a" },
  "blocked":         { label: "Blocked",     bg: "#dc2626" },
  "not-yet-started": { label: "Not started", bg: "#6b7280" },
};

function matchesMember(fullName: string | undefined, member: TeamMember) {
  if (!fullName) return false;
  return member.name.toLowerCase().includes(fullName.toLowerCase()) ||
         fullName.toLowerCase().includes(member.name.split(" ")[0].toLowerCase());
}

// ─── member grid card ────────────────────────────────────────────────────────

function MemberGridCard({ member, onClick }: { member: TeamMember; onClick: () => void }) {
  const taskPct = member.tasksToday.total > 0
    ? Math.round((member.tasksToday.done / member.tasksToday.total) * 100)
    : 0;
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: "var(--card)",
        border: "1px solid var(--hairline)",
        borderRadius: 14,
        padding: "20px 20px 18px",
        cursor: "pointer",
        transition: "box-shadow .18s, transform .18s",
        textAlign: "left",
        width: "100%",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(0,0,0,.10)";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
        (e.currentTarget as HTMLButtonElement).style.transform = "none";
      }}
    >
      {/* avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: member.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0,
        }}>{member.initials}</div>
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>{member.name}</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{member.role}</p>
        </div>
        <div style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 18 }}>›</div>
      </div>

      {/* task progress */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>
          <span>Today&apos;s tasks</span>
          <span>{member.tasksToday.done}/{member.tasksToday.total}</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: "var(--hairline)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 3, width: `${taskPct}%`, background: "var(--accent)", transition: "width .3s" }} />
        </div>
      </div>

      {/* kpi summary chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {member.kpis.map((k) => {
          const pct = kpiPct(k);
          const color = pct >= 90 ? "#16a34a" : pct >= 60 ? "#d97706" : "#dc2626";
          return (
            <span key={k.label} style={{
              fontSize: 11, padding: "3px 8px", borderRadius: 20,
              background: color + "18", color,
              fontWeight: 600, border: `1px solid ${color}33`,
            }}>{k.label}: {pct}%</span>
          );
        })}
      </div>
    </button>
  );
}

// ─── member detail panel ─────────────────────────────────────────────────────

function MemberDetail({ member, onBack }: { member: TeamMember; onBack: () => void }) {
  const [priorities, setPriorities] = useState<TeamPriority[] | null>(null);
  const [wwwItems, setWwwItems] = useState<TeamWwwItem[] | null>(null);

  useEffect(() => {
    getTeamPriorities().then(setPriorities).catch(() => setPriorities([]));
    getTeamWww().then(setWwwItems).catch(() => setWwwItems([]));
  }, []);

  const memberPriorities = priorities?.filter((p) => {
    const fullName = [p.owner_user?.firstName, p.owner_user?.lastName].filter(Boolean).join(" ");
    return matchesMember(fullName, member);
  }) ?? [];

  const memberWww = wwwItems?.filter((w) => matchesMember(w.who, member)) ?? [];

  return (
    <div>
      {/* header */}
      <div className="page-head" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, color: "var(--text-secondary)", padding: "6px 12px",
              border: "1px solid var(--hairline)", borderRadius: 8,
              background: "var(--card)", transition: "background .15s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--canvas)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--card)")}
          >
            ← Team
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", background: member.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 700, fontSize: 16,
            }}>{member.initials}</div>
            <div>
              <div className="page-title" style={{ marginBottom: 2 }}>{member.name}</div>
              <p className="page-sub" style={{ margin: 0 }}>{member.role}</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {/* kpis */}
        <section>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>KPIs</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {member.kpis.map((k) => {
              const pct = kpiPct(k);
              const color = pct >= 90 ? "#16a34a" : pct >= 60 ? "#d97706" : "#dc2626";
              return (
                <div key={k.label} style={{
                  background: "var(--card)", border: "1px solid var(--hairline)",
                  borderRadius: 12, padding: "16px 18px",
                }}>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-secondary)" }}>{k.label}</p>
                  <p style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700, color }}>
                    {k.unit === "$" ? "$" : ""}{k.current}{k.unit && k.unit !== "$" ? k.unit : ""}
                    <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-muted)", marginLeft: 4 }}>/ {k.unit === "$" ? "$" : ""}{k.target}{k.unit && k.unit !== "$" ? k.unit : ""}</span>
                  </p>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--hairline)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: color }} />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 11, color, fontWeight: 600 }}>{pct}% of target</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* priorities */}
        <section>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Priorities</h3>
          {priorities === null ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</p>
          ) : memberPriorities.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No priorities assigned to {member.name.split(" ")[0]}.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {memberPriorities.map((p) => {
                const cfg = PRIORITY_STATUS[p.overallStatus] ?? { label: p.overallStatus, bg: "#9ca3af" };
                return (
                  <div key={p.id} style={{
                    background: "var(--card)", border: "1px solid var(--hairline)",
                    borderRadius: 12, padding: "16px 18px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{p.name}</p>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: cfg.bg, color: "#fff", whiteSpace: "nowrap", flexShrink: 0 }}>{cfg.label}</span>
                    </div>
                    {p.description && <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-secondary)" }}>{p.description}</p>}
                    <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{p.quarter} {p.year}{p.startWeek != null ? ` · W${p.startWeek}–W${p.endWeek ?? "?"}` : ""}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* www */}
        <section>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>WWW — Who / What / When</h3>
          {wwwItems === null ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</p>
          ) : memberWww.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No WWW commitments for {member.name.split(" ")[0]}.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {memberWww.map((w) => {
                const cfg = WWW_STATUS[w.status] ?? { label: w.status, bg: "#9ca3af" };
                const overdue = w.status !== "completed" && new Date(w.when) < new Date();
                return (
                  <div key={w.id} style={{
                    background: "var(--card)", border: "1px solid var(--hairline)",
                    borderRadius: 12, padding: "16px 18px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{w.what}</p>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: cfg.bg, color: "#fff", whiteSpace: "nowrap", flexShrink: 0 }}>{cfg.label}</span>
                    </div>
                    <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-secondary)" }}>
                      Due {new Date(w.when).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      {overdue && <span style={{ color: "#dc2626", marginLeft: 6, fontWeight: 600 }}>Overdue</span>}
                    </p>
                    {w.notes && <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{w.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [data, setData] = useState<TeamData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<TeamMember | null>(null);

  useEffect(() => {
    getTeamData().then(setData).catch(() => setLoadError(true));
  }, []);

  if (loadError) return (
    <div>
      <div className="page-head"><div><div className="page-title">Team</div><p className="page-sub">Marketing team members</p></div></div>
      <NotConnected icon="⚠️" title="Couldn't load team data" body="Something went wrong reaching the server. Please refresh and try again." ctaHref="/team" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head"><div><div className="page-title">Team</div><p className="page-sub">Marketing team members</p></div></div>
      <SkeletonGrid />
    </div>
  );

  if (selected) return <MemberDetail member={selected} onBack={() => setSelected(null)} />;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Team</div>
          <p className="page-sub">Marketing team members</p>
        </div>
      </div>

      {data.members.length === 0 ? (
        <NotConnected
          icon="🧩"
          title="No project management tool connected"
          body="Connect Jira, Linear, Asana, monday.com, or your custom PM tool to sync real task lists and KPI progress. Nothing here is sample data."
          ctaHref="/integrations"
          ctaLabel="Go to Integrations"
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {data.members.map((m) => (
            <MemberGridCard key={m.id} member={m} onClick={() => setSelected(m)} />
          ))}
        </div>
      )}
    </div>
  );
}
