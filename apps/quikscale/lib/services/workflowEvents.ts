import { getColorByPercentage } from "@/lib/utils/colorLogic";

/**
 * QuikScale → QuikFlow workflow-event emitter.
 *
 * Fire-and-forget: emits a `kpi.below_target` event to QuikFlow's ingest API
 * when a saved weekly value lands in the RED bucket. It MUST NEVER throw or
 * block the KPI save — mirrors the existing `notifyKPIAssignment(...).catch()`
 * convention. Gated by QUIKFLOW_EVENTS_ENABLED so it is inert unless turned on.
 *
 * "Below target" is defined as the per-week RED cell from the shared
 * `getColorByPercentage` helper (`.bg === "bg-red-600"`), honoring reverse-mode
 * KPIs — the same semantics the UI traffic-light uses.
 */
export interface KpiBelowTargetInput {
  orgId: string;
  kpiId: string;
  name: string;
  value: number | null | undefined;
  weeklyTarget: number;
  reverseColor: boolean;
  ownerId: string | null;
  ownerIds: string[];
  teamId: string | null;
  quarter: string | null;
  year: number | null;
  weekNumber: number;
  previousValue: number | null;
}

const RED = "bg-red-600";

/** True when this weekly value is below target (RED), per shared color logic. */
export function isBelowTarget(value: number | null | undefined, weeklyTarget: number, reverse: boolean): boolean {
  if (value === null || value === undefined) return false;
  const color = getColorByPercentage(value, weeklyTarget, true, reverse);
  return color.bg === RED;
}

export function emitKpiBelowTarget(input: KpiBelowTargetInput): void {
  if (process.env.QUIKFLOW_EVENTS_ENABLED !== "true") return;

  const quikflowUrl = process.env.QUIKFLOW_URL;
  const secret = process.env.INTERNAL_SECRET;
  if (!quikflowUrl || !secret) return;

  if (!isBelowTarget(input.value, input.weeklyTarget, input.reverseColor)) return;

  const gapPct =
    input.weeklyTarget > 0 && input.value != null
      ? Math.round((1 - input.value / input.weeklyTarget) * 100)
      : 0;

  const body = {
    app: "quikscale",
    event: "kpi.below_target",
    orgId: input.orgId,
    // Idempotency: one event per (kpi, week, value) — a re-save with the same
    // value won't spawn a duplicate downstream run.
    dedupeKey: `kpi:${input.kpiId}:w${input.weekNumber}:${input.value}`,
    occurredAt: new Date().toISOString(),
    data: {
      kpiId: input.kpiId,
      name: input.name,
      value: input.value,
      target: input.weeklyTarget,
      gapPct,
      ownerId: input.ownerId,
      ownerIds: input.ownerIds,
      teamId: input.teamId,
      quarter: input.quarter,
      year: input.year,
      weekNumber: input.weekNumber,
      previousValue: input.previousValue,
    },
  };

  // Fire-and-forget. Any failure (network, QuikFlow down) is swallowed so a
  // KPI save is never impacted.
  void fetch(`${quikflowUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify(body),
  }).catch(() => {
    /* intentionally ignored */
  });
}
