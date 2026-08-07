import type { TeamMember } from "@/types";

function kpiPct(k: TeamMember["kpis"][number]) {
  if (k.lowerIsBetter) return Math.min(100, Math.round((k.target / k.current) * 100));
  return Math.min(100, Math.round((k.current / k.target) * 100));
}

export default function TeamMemberCard({ member }: { member: TeamMember }) {
  const taskPct = Math.round((member.tasksToday.done / member.tasksToday.total) * 100);
  return (
    <div className="team-card">
      <div className="team-card-head">
        <div className="team-avatar" style={{ background: member.color }}>{member.initials}</div>
        <div><p className="team-name">{member.name}</p><p className="team-role">{member.role}</p></div>
      </div>

      <div className="team-stat-row">
        <div className="team-stat-label"><span>Today&apos;s tasks</span><span>{member.tasksToday.done} / {member.tasksToday.total} done</span></div>
        <div className="mini-bar-track"><div className="mini-bar-fill" style={{ width: `${taskPct}%`, background: "var(--accent)" }} /></div>
      </div>
      <div className="team-stat-row">
        <div className="team-stat-label"><span>Weekly completion</span><span>{member.weeklyCompletion}%</span></div>
        <div className="mini-bar-track"><div className="mini-bar-fill" style={{ width: `${member.weeklyCompletion}%`, background: "var(--green)" }} /></div>
      </div>

      <p className="team-section-label">KPIs</p>
      {member.kpis.map((k) => {
        const pct = kpiPct(k);
        const color = pct >= 90 ? "var(--green)" : pct >= 60 ? "var(--accent)" : "var(--red)";
        return (
          <div className="team-stat-row" key={k.label}>
            <div className="team-stat-label">
              <span>{k.label}</span>
              <span>{k.unit === "$" ? "$" : ""}{k.current}{k.unit && k.unit !== "$" ? k.unit : ""} / {k.unit === "$" ? "$" : ""}{k.target}{k.unit && k.unit !== "$" ? k.unit : ""}</span>
            </div>
            <div className="mini-bar-track"><div className="mini-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
          </div>
        );
      })}
    </div>
  );
}
