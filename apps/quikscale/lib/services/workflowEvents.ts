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

/** Shared POST-to-QuikFlow ingest helper — fire-and-forget, never throws. */
function postEvent(body: Record<string, unknown>): void {
  if (process.env.QUIKFLOW_EVENTS_ENABLED !== "true") return;
  const quikflowUrl = process.env.QUIKFLOW_URL;
  const secret = process.env.INTERNAL_SECRET;
  if (!quikflowUrl || !secret) return;
  void fetch(`${quikflowUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify(body),
  }).catch(() => {
    /* intentionally ignored */
  });
}

/** Map the shared traffic-light bg class to a RAG token the registry uses. */
const RAG_BY_BG: Record<string, string> = {
  "bg-red-600": "red",
  "bg-yellow-500": "yellow",
  "bg-green-600": "green",
  // "Exceeded" (blue) counts as green/achieved for RAG-status conditions.
  "bg-blue-600": "green",
};
function ragOf(value: number | null | undefined, weeklyTarget: number, reverse: boolean): string | null {
  if (value === null || value === undefined) return null;
  const c = getColorByPercentage(value, weeklyTarget, true, reverse);
  return RAG_BY_BG[c.bg] ?? null;
}

export interface KpiWeeklyInput {
  orgId: string;
  kpiId: string;
  name: string;
  value: number | null | undefined;
  previousValue: number | null;
  weeklyTarget: number;
  reverseColor: boolean;
  ownerId: string | null;
  ownerIds: string[];
  teamId: string | null;
  quarter: string | null;
  year: number | null;
  weekNumber: number;
}

/** Common data block so downstream actions (create_www / notify) + record-load work. */
function kpiEventData(input: KpiWeeklyInput, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    kpiId: input.kpiId,
    name: input.name,
    ownerId: input.ownerId,
    ownerIds: input.ownerIds,
    teamId: input.teamId,
    quarter: input.quarter,
    year: input.year,
    weekNumber: input.weekNumber,
    ...extra,
  };
}

/** Emit `kpi.reading.logged` on every saved weekly value (not just RED). */
export function emitKpiReadingLogged(input: KpiWeeklyInput): void {
  if (input.value === null || input.value === undefined) return;
  postEvent({
    app: "quikscale",
    event: "kpi.reading.logged",
    orgId: input.orgId,
    dedupeKey: `kpi.reading.logged:${input.kpiId}:w${input.weekNumber}:${input.value}`,
    occurredAt: new Date().toISOString(),
    data: kpiEventData(input, { value: input.value }),
  });
}

/** Emit `kpi.status.changed` only when the RAG bucket transitions vs last value. */
export function emitKpiStatusChanged(input: KpiWeeklyInput): void {
  const before = ragOf(input.previousValue, input.weeklyTarget, input.reverseColor);
  const after = ragOf(input.value, input.weeklyTarget, input.reverseColor);
  if (!after || before === after) return; // no transition → nothing to fire
  postEvent({
    app: "quikscale",
    event: "kpi.status.changed",
    orgId: input.orgId,
    dedupeKey: `kpi.status.changed:${input.kpiId}:w${input.weekNumber}:${before ?? "none"}->${after}`,
    occurredAt: new Date().toISOString(),
    data: kpiEventData(input, { status: after, before, after, value: input.value }),
  });
}

export interface KpiCreatedInput {
  orgId: string;
  kpiId: string;
  name: string;
  /** Individual-KPI owner, or null for a team KPI (then ownerIds carries them). */
  ownerId: string | null;
  ownerIds: string[];
  teamId: string | null;
  quarter: string;
  year: number;
}

/**
 * Emit `kpi.created` when a new KPI is persisted. Carries the KPI's OWN
 * quarter/year/owner so downstream actions (e.g. create_priority) inherit them
 * — which keeps a recovery Priority in the same quarter the user is viewing.
 * Fire-and-forget + flag-gated, exactly like emitKpiBelowTarget.
 */
export function emitKpiCreated(input: KpiCreatedInput): void {
  postEvent({
    app: "quikscale",
    event: "kpi.created",
    orgId: input.orgId,
    // One event per KPI id — a retry of the same create won't duplicate runs.
    dedupeKey: `kpi.created:${input.kpiId}`,
    occurredAt: new Date().toISOString(),
    data: {
      kpiId: input.kpiId,
      name: input.name,
      ownerId: input.ownerId,
      ownerIds: input.ownerIds,
      teamId: input.teamId,
      quarter: input.quarter,
      year: input.year,
    },
  });
}

// ── Priority (Rock) events ──────────────────────────────────────────────────

export interface PriorityEventInput {
  orgId: string;
  priorityId: string;
  name: string;
  owner: string | null;
  teamId: string | null;
  quarter: string | null;
  year: number | null;
}

/** Common Priority payload — `priorityId` lets the engine record-load the Rock. */
function priorityData(input: PriorityEventInput, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    priorityId: input.priorityId,
    recordId: input.priorityId,
    name: input.name,
    ownerId: input.owner,
    ownerIds: input.owner ? [input.owner] : [],
    teamId: input.teamId,
    quarter: input.quarter,
    year: input.year,
    ...extra,
  };
}

/** Emit `priority.created` when a new Rock is persisted. */
export function emitPriorityCreated(input: PriorityEventInput & { status: string | null }): void {
  postEvent({
    app: "quikscale",
    event: "priority.created",
    orgId: input.orgId,
    dedupeKey: `priority.created:${input.priorityId}`,
    occurredAt: new Date().toISOString(),
    data: priorityData(input, { status: input.status }),
  });
}

/**
 * Emit `priority.status.changed` on any status transition, PLUS
 * `priority.completed` when the new status is "completed" (doc §4.3). Skips when
 * the status is unchanged.
 */
export function emitPriorityStatusChanged(
  input: PriorityEventInput & { before: string | null; after: string | null },
): void {
  const { before, after } = input;
  if (!after || before === after) return;
  postEvent({
    app: "quikscale",
    event: "priority.status.changed",
    orgId: input.orgId,
    dedupeKey: `priority.status.changed:${input.priorityId}:${before ?? "none"}->${after}`,
    occurredAt: new Date().toISOString(),
    data: priorityData(input, { status: after, before, after }),
  });
  if (after === "completed") {
    postEvent({
      app: "quikscale",
      event: "priority.completed",
      orgId: input.orgId,
      dedupeKey: `priority.completed:${input.priorityId}`,
      occurredAt: new Date().toISOString(),
      data: priorityData(input, { status: after }),
    });
  }
}

/**
 * Emit `priority.weekly.status.changed` when one week's status changes in the
 * Weekly Status grid (the `PriorityWeeklyStatus` upsert path) — distinct from
 * `priority.status.changed`, which watches the `overallStatus` column that the
 * weekly grid never touches. The weekly status rides on its own payload keys
 * (`weekStatus`/`weekNumber`) so QuikFlow's record-load — which overwrites the
 * payload with the priority's `overallStatus` column — cannot clobber it.
 * Skips no-ops (same status). Callers emit once per CHANGED week.
 */
export function emitPriorityWeeklyStatusChanged(
  input: PriorityEventInput & {
    weekNumber: number;
    weekStatus: string;
    previousWeekStatus: string | null;
  },
): void {
  const { weekNumber, weekStatus, previousWeekStatus } = input;
  if (!weekStatus || previousWeekStatus === weekStatus) return;
  postEvent({
    app: "quikscale",
    event: "priority.weekly.status.changed",
    orgId: input.orgId,
    dedupeKey: `priority.weekly.status.changed:${input.priorityId}:w${weekNumber}:${weekStatus}`,
    occurredAt: new Date().toISOString(),
    data: priorityData(input, { weekNumber, weekStatus, previousWeekStatus }),
  });
}

// ── OPSP events ──────────────────────────────────────────────────────────────
// Real lifecycle is draft → finalized → reviewed (NOT the doc's submit/approve).

export interface OpspEventInput {
  orgId: string;
  opspId: string;
  owner?: string | null; // OPSPData.userId — the plan's owner
  quarter?: string | null;
  year?: number | null;
}

function opspData(input: OpspEventInput, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    opspId: input.opspId,
    recordId: input.opspId, // lets the engine record-load the full OPSP
    ownerId: input.owner ?? null,
    ownerIds: input.owner ? [input.owner] : [],
    quarter: input.quarter ?? null,
    year: input.year ?? null,
    ...extra,
  };
}

/**
 * Emit `opsp.stage.changed` on any transition, PLUS `opsp.finalized`
 * (→finalized, manual OR auto), `opsp.auto_finalized` (auto only), and
 * `opsp.reviewed` (→reviewed).
 */
export function emitOpspStatusChanged(
  input: OpspEventInput & { before: string | null; after: string | null; auto?: boolean },
): void {
  const { before, after } = input;
  if (!after || before === after) return;
  postEvent({
    app: "quikscale",
    event: "opsp.stage.changed",
    orgId: input.orgId,
    dedupeKey: `opsp.stage.changed:${input.opspId}:${before ?? "none"}->${after}`,
    occurredAt: new Date().toISOString(),
    data: opspData(input, { status: after, before, after }),
  });
  if (after === "finalized") {
    postEvent({
      app: "quikscale",
      event: "opsp.finalized",
      orgId: input.orgId,
      dedupeKey: `opsp.finalized:${input.opspId}`,
      occurredAt: new Date().toISOString(),
      data: opspData(input, { status: after }),
    });
    if (input.auto) {
      postEvent({
        app: "quikscale",
        event: "opsp.auto_finalized",
        orgId: input.orgId,
        dedupeKey: `opsp.auto_finalized:${input.opspId}`,
        occurredAt: new Date().toISOString(),
        data: opspData(input, { status: after }),
      });
    }
  }
  if (after === "reviewed") {
    postEvent({
      app: "quikscale",
      event: "opsp.reviewed",
      orgId: input.orgId,
      dedupeKey: `opsp.reviewed:${input.opspId}`,
      occurredAt: new Date().toISOString(),
      data: opspData(input, { status: after }),
    });
  }
}

// ── WWW events ───────────────────────────────────────────────────────────────

export interface WwwEventInput {
  orgId: string;
  wwwId: string;
  what: string;
  owner: string | null; // the "who" userId
}

function wwwData(input: WwwEventInput, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    wwwId: input.wwwId,
    recordId: input.wwwId,
    what: input.what,
    ownerId: input.owner,
    ownerIds: input.owner ? [input.owner] : [],
    ...extra,
  };
}

/** Emit `www.created` when a WWW action item is added. */
export function emitWwwCreated(input: WwwEventInput & { status: string | null }): void {
  postEvent({
    app: "quikscale",
    event: "www.created",
    orgId: input.orgId,
    dedupeKey: `www.created:${input.wwwId}`,
    occurredAt: new Date().toISOString(),
    data: wwwData(input, { status: input.status }),
  });
}

/** Emit `www.completed` when a WWW item transitions to "completed" (doc §4.9). */
export function emitWwwStatusChanged(input: WwwEventInput & { before: string | null; after: string | null }): void {
  const { before, after } = input;
  if (after !== "completed" || before === "completed") return;
  postEvent({
    app: "quikscale",
    event: "www.completed",
    orgId: input.orgId,
    dedupeKey: `www.completed:${input.wwwId}`,
    occurredAt: new Date().toISOString(),
    data: wwwData(input, { status: after }),
  });
}

// ── Goal events ──────────────────────────────────────────────────────────────

export interface GoalEventInput {
  orgId: string;
  goalId: string;
  title: string;
  owner: string | null; // ownerId
  category: string | null; // = pillar
}

function goalData(input: GoalEventInput, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    goalId: input.goalId,
    recordId: input.goalId,
    title: input.title,
    ownerId: input.owner,
    ownerIds: input.owner ? [input.owner] : [],
    pillar: input.category,
    category: input.category,
    ...extra,
  };
}

/** Emit `goal.created` when a new goal is persisted. */
export function emitGoalCreated(input: GoalEventInput & { status: string | null }): void {
  postEvent({
    app: "quikscale",
    event: "goal.created",
    orgId: input.orgId,
    dedupeKey: `goal.created:${input.goalId}`,
    occurredAt: new Date().toISOString(),
    data: goalData(input, { status: input.status }),
  });
}

/**
 * Emit `goal.status.changed` on any transition, PLUS `goal.at_risk` (→at-risk)
 * and `goal.achieved` (→completed) (doc §4.8).
 */
export function emitGoalStatusChanged(input: GoalEventInput & { before: string | null; after: string | null }): void {
  const { before, after } = input;
  if (!after || before === after) return;
  postEvent({
    app: "quikscale",
    event: "goal.status.changed",
    orgId: input.orgId,
    dedupeKey: `goal.status.changed:${input.goalId}:${before ?? "none"}->${after}`,
    occurredAt: new Date().toISOString(),
    data: goalData(input, { status: after, before, after }),
  });
  if (after === "at-risk") {
    postEvent({
      app: "quikscale",
      event: "goal.at_risk",
      orgId: input.orgId,
      dedupeKey: `goal.at_risk:${input.goalId}`,
      occurredAt: new Date().toISOString(),
      data: goalData(input, { status: after }),
    });
  }
  if (after === "completed") {
    postEvent({
      app: "quikscale",
      event: "goal.achieved",
      orgId: input.orgId,
      dedupeKey: `goal.achieved:${input.goalId}`,
      occurredAt: new Date().toISOString(),
      data: goalData(input, { status: after }),
    });
  }
}
