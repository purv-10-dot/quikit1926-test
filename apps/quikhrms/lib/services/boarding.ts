export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === "string" ? new Date(date) : new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** The checks a Background Verification step runs when none are configured. */
const DEFAULT_BGV_CHECKS = ["Education", "Employment", "Criminal", "Address"];

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
