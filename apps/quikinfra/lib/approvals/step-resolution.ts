/**
 * Step resolution for approval instances.
 *
 * An instance's chain comes from one of two places:
 *
 *   1. `stepsSnapshot` — a copy of the workflow steps taken at submit time.
 *      Authoritative when present: the request keeps the chain it was
 *      submitted under no matter what happens to the workflow afterwards.
 *   2. The live `CnApprovalWorkflowStep` rows — the fallback for instances
 *      created before snapshots existed.
 *
 * Fallback instances are exposed to mid-flight workflow edits, which replace
 * step rows wholesale. Two failure modes follow, and this module handles both:
 *
 *   - The workflow shrank, so the instance is parked on a `stepOrder` that no
 *     longer exists. Every approval path used to throw before the actor check,
 *     leaving the request unactionable by anyone including super admin.
 *     `resolveEffectiveStep` degrades to the highest surviving step below it.
 *   - The workflow shrank *and* every surviving step is already approved, so
 *     no approver has anything left to act on. `assessInstanceRepair` flags
 *     those for the admin-only repair action.
 */

import type { Prisma } from "@quikit/database";

type StepClient = Pick<
  Prisma.TransactionClient,
  "cnApprovalWorkflowStep" | "cnApprovalHistory"
>;

export interface WorkflowStepRow {
  stepOrder: number;
  approverRoleId: string | null;
  approverUserId: string | null;
  approverUserIds: string[];
}

/** The instance fields step resolution needs. */
export interface InstanceStepSource {
  workflowId: string;
  currentStepOrder: number;
  stepsSnapshot?: Prisma.JsonValue | null;
}

export interface EffectiveStep {
  /** The step the actor check should run against. Null = no steps at all. */
  step: WorkflowStepRow | null;
  /** `stepOrder` of `step`. Equals the instance's currentStepOrder unless repointed. */
  effectiveStepOrder: number;
  /**
   * True when the instance's own `currentStepOrder` is absent from its chain
   * and we fell back to an earlier surviving step. Callers surface this so the
   * timeline can explain the jump, and skip the double-action guard — history
   * rows were written against the pre-edit numbering.
   */
  repointed: boolean;
  /** The instance's full chain, ascending. Callers derive next-step from this. */
  steps: WorkflowStepRow[];
  /** `steps.length`. */
  totalSteps: number;
}

/**
 * Parse a persisted `stepsSnapshot`. Returns null for anything that isn't a
 * usable non-empty array so callers fall through to the live workflow rows —
 * a malformed snapshot must never make a request unactionable.
 */
export function parseStepsSnapshot(
  raw: Prisma.JsonValue | null | undefined,
): WorkflowStepRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const parsed: WorkflowStepRow[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return null;
    }
    const row = entry as Record<string, unknown>;
    const stepOrder = Number(row.stepOrder);
    if (!Number.isFinite(stepOrder)) return null;
    parsed.push({
      stepOrder,
      approverRoleId:
        typeof row.approverRoleId === "string" ? row.approverRoleId : null,
      approverUserId:
        typeof row.approverUserId === "string" ? row.approverUserId : null,
      approverUserIds: Array.isArray(row.approverUserIds)
        ? row.approverUserIds.filter((v): v is string => typeof v === "string")
        : [],
    });
  }
  return parsed.sort((a, b) => a.stepOrder - b.stepOrder);
}

/** Build the snapshot payload to persist on a new instance. */
export function buildStepsSnapshot(
  steps: Array<{
    stepOrder: number;
    approverRoleId: string | null;
    approverUserId: string | null;
    approverUserIds: string[];
  }>,
): WorkflowStepRow[] {
  return [...steps]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((s) => ({
      stepOrder: s.stepOrder,
      approverRoleId: s.approverRoleId ?? null,
      approverUserId: s.approverUserId ?? null,
      approverUserIds: Array.isArray(s.approverUserIds) ? s.approverUserIds : [],
    }));
}

/** The instance's chain: snapshot when present, else the live workflow rows. */
export async function loadInstanceSteps(
  client: StepClient,
  instance: InstanceStepSource,
): Promise<WorkflowStepRow[]> {
  const snapshot = parseStepsSnapshot(instance.stepsSnapshot);
  if (snapshot) return snapshot;

  const rows = await client.cnApprovalWorkflowStep.findMany({
    where: { workflowId: instance.workflowId },
    orderBy: { stepOrder: "asc" },
  });
  return buildStepsSnapshot(rows);
}

/**
 * Resolve the step an instance should currently be judged against.
 *
 * Exact match wins. When the stored `currentStepOrder` is missing from the
 * chain, the highest surviving step *below* it is used — never a later one, so
 * the fallback can only ever ask for approval the original chain already
 * demanded.
 */
export async function resolveEffectiveStep(
  client: StepClient,
  instance: InstanceStepSource,
): Promise<EffectiveStep> {
  const steps = await loadInstanceSteps(client, instance);
  return resolveEffectiveStepFrom(steps, instance.currentStepOrder);
}

/** Pure form of {@link resolveEffectiveStep} over an already-loaded chain. */
export function resolveEffectiveStepFrom(
  steps: WorkflowStepRow[],
  currentStepOrder: number,
): EffectiveStep {
  const exact = steps.find((s) => s.stepOrder === currentStepOrder);
  if (exact) {
    return {
      step: exact,
      effectiveStepOrder: exact.stepOrder,
      repointed: false,
      steps,
      totalSteps: steps.length,
    };
  }

  const below = steps.filter((s) => s.stepOrder < currentStepOrder);
  const fallback = below.length > 0 ? below[below.length - 1] : null;

  return {
    step: fallback,
    effectiveStepOrder: fallback?.stepOrder ?? currentStepOrder,
    repointed: fallback !== null,
    steps,
    totalSteps: steps.length,
  };
}

export interface RepairAssessment {
  /** True when the instance is parked on a stepOrder absent from its chain. */
  orphaned: boolean;
  /** The vanished stepOrder the instance is parked on. */
  missingStepOrder: number | null;
  /** Steps in the instance's chain. */
  totalSteps: number;
  /** Highest `stepOrder` in the chain, or null when it is empty. */
  lastStepOrder: number | null;
  /**
   * True when every step in the chain already carries an `approve` history
   * row. The chain is satisfied, so no approver has anything left to act on —
   * only the admin repair action can close it.
   */
  allStepsApproved: boolean;
  /**
   * Step orders with history rows but no matching step in the chain. Rendered
   * greyed-out in the timeline so a real approval isn't silently hidden.
   */
  orphanedHistorySteps: number[];
  /** `orphaned && allStepsApproved` — the gate for the repair action. */
  completable: boolean;
}

/**
 * Classify a pending instance against its chain.
 *
 * Used by the approve route to gate the repair action, and by detail GETs to
 * drive the "workflow changed after submission" banner.
 */
export async function assessInstanceRepair(
  client: StepClient,
  instance: InstanceStepSource & { id: string },
): Promise<RepairAssessment> {
  const [steps, history] = await Promise.all([
    loadInstanceSteps(client, instance),
    client.cnApprovalHistory.findMany({
      where: { instanceId: instance.id },
      select: { stepOrder: true, action: true },
    }),
  ]);

  return classifyRepair(steps, history, instance.currentStepOrder);
}

/**
 * Pure form of {@link assessInstanceRepair} for callers that already hold the
 * chain and history — detail-route DTOs load both anyway, so they classify
 * without a second round-trip.
 */
export function classifyRepair(
  steps: Array<{ stepOrder: number }>,
  history: Array<{ stepOrder: number; action: string }>,
  currentStepOrder: number,
): RepairAssessment {
  const stepOrders = steps.map((s) => s.stepOrder).sort((a, b) => a - b);
  const orphaned = !stepOrders.includes(currentStepOrder);
  const approvedSteps = new Set(
    history.filter((h) => h.action === "approve").map((h) => h.stepOrder),
  );

  const allStepsApproved =
    stepOrders.length > 0 && stepOrders.every((o) => approvedSteps.has(o));

  const orphanedHistorySteps = [...new Set(history.map((h) => h.stepOrder))]
    .filter((o) => !stepOrders.includes(o))
    .sort((a, b) => a - b);

  return {
    orphaned,
    missingStepOrder: orphaned ? currentStepOrder : null,
    totalSteps: stepOrders.length,
    lastStepOrder:
      stepOrders.length > 0 ? stepOrders[stepOrders.length - 1] : null,
    allStepsApproved,
    orphanedHistorySteps,
    completable: orphaned && allStepsApproved,
  };
}
