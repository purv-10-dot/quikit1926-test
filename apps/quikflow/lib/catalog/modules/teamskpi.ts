import type { ModuleDef } from "./types";

/**
 * Teams KPI — doc §8. NOT a KPI with a team label: it's an aggregate roll-up
 * across a team's KPIs, so it fires on team maths (avg gap, % Red, worst-of)
 * rather than a single record changing. No backing table (`readable: false`) —
 * the aggregate is computed by QuikScale and arrives on the event payload; the
 * smart values it exposes are team-level (team.pctRed, team.worstOwner, …).
 */
export const TEAMSKPI_MODULE: ModuleDef = {
  key: "teamkpi",
  label: "Teams KPI",
  recordNoun: "a team roll-up",
  capabilities: { trigger: true, condition: true, action: false },
  binding: { readable: false },
  fields: [
    { key: "team", label: "Team", type: "reference", usableIn: ["trigger", "condition"], source: "master:teams" },
    { key: "rollupStatus", label: "Team Health Status (Red / Yellow / Green)", type: "status", usableIn: ["trigger", "condition"], values: ["red", "yellow", "green"] },
    { key: "pctRed", label: "% of KPIs below target", type: "number", usableIn: ["trigger", "condition"] },
    { key: "countRed", label: "Number of Red KPIs", type: "number", usableIn: ["trigger", "condition"] },
    { key: "avgGap", label: "Average Gap %", type: "number", usableIn: ["trigger", "condition"] },
    { key: "worstOwner", label: "Worst-performing owner", type: "people", usableIn: ["condition"], source: "master:users" },
    { key: "quarter", label: "Quarter", type: "reference", usableIn: ["trigger", "condition"], source: "master:quarters" },
  ],
  events: [
    { id: "teamkpi.rollup.changed", label: "The team's health status changes (Red / Yellow / Green)", firesWhen: "Team roll-up health status transitions", payloadFields: ["team", "before", "after"] },
    { id: "teamkpi.rollup.red", label: "The team roll-up goes Red", firesWhen: "Team roll-up enters Red", payloadFields: ["team", "avgGap"] },
    { id: "teamkpi.pct_below", label: "X% of a team's KPIs are below target", firesWhen: "% Red crosses a threshold (e.g. ≥ 30%)", payloadFields: ["team", "pctRed"] },
    { id: "teamkpi.count_red.crosses", label: "Number of Red KPIs crosses N", firesWhen: "Red count crosses a threshold", payloadFields: ["team", "countRed"] },
    { id: "teamkpi.avg_gap.crosses", label: "Team average gap % crosses N", firesWhen: "Average gap crosses a threshold", payloadFields: ["team", "avgGap"] },
    { id: "teamkpi.member_red", label: "Any member's KPI in the team goes Red", firesWhen: "A member KPI enters Red", payloadFields: ["team", "worstOwner"] },
    { id: "teamkpi.kpi_added", label: "A KPI is added to the team", firesWhen: "New KPI joins the team roll-up", payloadFields: ["team"] },
    { id: "teamkpi.all_green", label: "Every KPI in the team is Green", firesWhen: "Whole team roll-up is Green", payloadFields: ["team"] },
    { id: "teamkpi.worst_changed", label: "The worst-performing KPI/owner changes", firesWhen: "Worst-of owner changes", payloadFields: ["team", "worstOwner"] },
    { id: "teamkpi.digest", label: "On a schedule, summarise the team scorecard", firesWhen: "Scheduled team digest", payloadFields: ["team"] },
  ],
  actionIds: [],
};
