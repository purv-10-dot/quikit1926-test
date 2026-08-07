import type { TeamMember, TeamTask } from "@/types";

export interface TeamData {
  members: TeamMember[];
  tasksToday: TeamTask[];
}

export interface TeamKpi {
  id:              string;
  name:            string;
  kpiLevel:        string;
  quarter:         string;
  year:            number;
  measurementUnit: string;
  target:          number | null;
  progressPercent: number | null;
  healthStatus:    string;
  teamId:          string | null;
  owner_user:      { id: string; firstName: string | null; lastName: string | null } | null;
  team:            { id: string; name: string } | null;
}

export interface QsTeam { id: string; name: string; }

export interface TeamPriority {
  id:           string;
  name:         string;
  description:  string | null;
  quarter:      string;
  year:         number;
  overallStatus:string;
  startWeek:    number | null;
  endWeek:      number | null;
  teamId:       string | null;
  owner_user:   { id: string; firstName: string | null; lastName: string | null } | null;
  team:         { id: string; name: string } | null;
}

export interface TeamWwwItem {
  id:               string;
  who:              string;
  what:             string;
  when:             string;
  status:           string;
  notes:            string | null;
  linkedPriorityId: string | null;
  linkedKPIId:      string | null;
}

/** GET /team — real data from a connected PM tool (empty until one is connected). */
export async function getTeamData(): Promise<TeamData> {
  const res = await fetch("/api/team", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load team data (${res.status})`);
  return (await res.json()) as TeamData;
}

export async function getTeamKpis(teamId?: string): Promise<{ kpis: TeamKpi[]; teams: QsTeam[] }> {
  const url = teamId ? `/api/team/kpis?teamId=${encodeURIComponent(teamId)}` : "/api/team/kpis";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load KPIs (${res.status})`);
  return (await res.json()) as { kpis: TeamKpi[]; teams: QsTeam[] };
}

export async function getTeamPriorities(): Promise<TeamPriority[]> {
  const res = await fetch("/api/team/priority", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load priorities (${res.status})`);
  return ((await res.json()) as { priorities: TeamPriority[] }).priorities;
}

export async function getTeamWww(): Promise<TeamWwwItem[]> {
  const res = await fetch("/api/team/www", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load WWW items (${res.status})`);
  return ((await res.json()) as { items: TeamWwwItem[] }).items;
}
