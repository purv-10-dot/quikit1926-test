/**
 * Lightweight telemetry for the LeadSquared sync: structured logs + in-process
 * counters. Intentionally dependency-free — a seam to wire a real metrics
 * backend (StatsD/Prometheus/OTel) later without touching call sites.
 *
 * IMPORTANT: callers must pass IDENTIFIERS ONLY (leadId, prospectId, tenantId,
 * jobId, action). Never pass raw payloads, field values, emails/phones, or the
 * webhook secret — these logs may ship to aggregators.
 *
 * Counters are per-process. In a web+worker deployment each process keeps its
 * own tallies; treat them as coarse health signals, not exact totals.
 */
type LogLevel = "info" | "warn" | "error" | "alert";

const counters = new Map<string, number>();

export function incr(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function getCounters(): Record<string, number> {
  return Object.fromEntries([...counters.entries()].sort());
}

/** Test helper — reset counters between cases. */
export function resetCounters(): void {
  counters.clear();
}

export function logSync(
  level: LogLevel,
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const line = JSON.stringify({ svc: "leadsquared", level, event, ...fields });
  if (level === "error" || level === "alert") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
