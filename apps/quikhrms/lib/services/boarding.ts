export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === "string" ? new Date(date) : new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function isoDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

/** The checks a Background Verification step runs when none are configured. */
export const DEFAULT_BGV_CHECKS = ["Education", "Employment", "Criminal", "Address"];

/**
 * Normalize a template step's config before it becomes a live task.
 *
 * A BGV step completes only when EVERY configured check is Clear — so a BGV
 * step copied from a template that never listed any checks could never be
 * cleared, leaving the candidate stuck in Pre-Onboarding. Give those steps the
 * default check list (the same one the auto-injected BGV step uses).
 */
export function normalizeStepConfig(
  stepType: string | null | undefined,
  config: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (stepType !== "BGV") return config ?? undefined;
  const cfg = { ...(config ?? {}) };
  const checks = Array.isArray(cfg.bgvChecks) ? (cfg.bgvChecks as unknown[]).filter(Boolean) : [];
  if (!checks.length) cfg.bgvChecks = [...DEFAULT_BGV_CHECKS];
  if (typeof cfg.bgvStatus !== "object" || cfg.bgvStatus === null) cfg.bgvStatus = {};
  return cfg;
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
