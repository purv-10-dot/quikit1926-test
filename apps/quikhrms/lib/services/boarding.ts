export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === "string" ? new Date(date) : new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function isoDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

export const DEFAULT_OFFBOARDING_TASKS = [
  { title: "Return company laptop", category: "AssetReturn" as const, department: "IT", sortOrder: 1 },
  { title: "Return ID & access cards", category: "AssetReturn" as const, department: "Admin", sortOrder: 2 },
  { title: "Revoke email and SSO", category: "AccessRevoke" as const, department: "IT", sortOrder: 3 },
  { title: "Revoke application access (Slack, Jira, etc.)", category: "AccessRevoke" as const, department: "IT", sortOrder: 4 },
  { title: "Knowledge transfer session", category: "KnowledgeTransfer" as const, department: "Team", sortOrder: 5 },
  { title: "IT clearance", category: "Clearance" as const, department: "IT", sortOrder: 6 },
  { title: "HR clearance", category: "Clearance" as const, department: "HR", sortOrder: 7 },
  { title: "Finance clearance", category: "Clearance" as const, department: "Finance", sortOrder: 8 },
  { title: "Admin clearance", category: "Clearance" as const, department: "Admin", sortOrder: 9 },
];
