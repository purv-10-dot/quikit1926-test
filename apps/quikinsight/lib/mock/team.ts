import type { TeamMember, TeamTask } from "@/types";

export const teamMembers: TeamMember[] = [
  {
    id: "m1", name: "Daniel Osei", role: "Paid Search Lead", initials: "DO", color: "#6C5CE0",
    tasksToday: { done: 4, total: 6 }, weeklyCompletion: 82,
    kpis: [
      { label: "Leads generated", current: 48, target: 60, unit: "" },
      { label: "CAC", current: 412, target: 380, unit: "$", lowerIsBetter: true },
    ],
  },
  {
    id: "m2", name: "Sam Torres", role: "Content & SEO Lead", initials: "ST", color: "#16A34A",
    tasksToday: { done: 5, total: 5 }, weeklyCompletion: 94,
    kpis: [
      { label: "Organic pipeline", current: 1.1, target: 1.0, unit: "M" },
      { label: "Content published", current: 9, target: 8, unit: "" },
    ],
  },
  {
    id: "m3", name: "Ana Kim", role: "Social & Lifecycle", initials: "AK", color: "#E8A33D",
    tasksToday: { done: 2, total: 5 }, weeklyCompletion: 58,
    kpis: [
      { label: "Engagement rate", current: 4.6, target: 5.0, unit: "%" },
      { label: "Email sends", current: 3, target: 4, unit: "" },
    ],
  },
  {
    id: "m4", name: "Marcus Webb", role: "Marketing Ops", initials: "MW", color: "#DC2626",
    tasksToday: { done: 3, total: 3 }, weeklyCompletion: 100,
    kpis: [
      { label: "Data pipeline uptime", current: 99.6, target: 99.5, unit: "%" },
      { label: "Reports automated", current: 6, target: 6, unit: "" },
    ],
  },
];

export const teamTasksToday: TeamTask[] = [
  { id: "t1", title: "Review paid search bid strategy for 4 flagged keywords", assignee: "Daniel Osei", status: "progress" },
  { id: "t2", title: "Publish repurposed LinkedIn carousel from Q3 content refresh", assignee: "Sam Torres", status: "done" },
  { id: "t3", title: "QA the new lifecycle nurture email sequence", assignee: "Ana Kim", status: "todo" },
  { id: "t4", title: "Validate weekly exec report data before send", assignee: "Marcus Webb", status: "done" },
  { id: "t5", title: "Draft budget reallocation proposal (social → content)", assignee: "Daniel Osei", status: "todo" },
  { id: "t6", title: "Publish Instagram growth campaign creative, batch 2", assignee: "Ana Kim", status: "progress" },
];

// Tools your developer can wire the Team page's "connect" banner to.
export const teamConnectOptions = ["Asana", "Linear", "Jira", "monday.com"];
