/**
 * [P2.2] Attribution for automated lead writes (SPEC §8 / Build-Plan Task 2.2).
 *
 * One QcfAutomationAttribution row per automated field write so "why did this
 * lead change?" is a single read: engine source, automation + rule/node,
 * trigger event, before→after, and the trigger-time field snapshot. Written by
 * BOTH engines; `engineSource` discriminates "automation" vs "legacy-disposition".
 *
 * Best-effort: a failure here is logged and swallowed — attribution must never
 * break the underlying lead write.
 */
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { QcfLead as Lead } from "@prisma/client";

/** Optional trigger context threaded from the emit site (Task 2.3) into runFrom.
 *  When absent, runFrom captures a run-start snapshot and generates an eventId. */
export interface TriggerContext {
  eventId?: string;
  type?: string;
  snapshot?: Record<string, unknown>;
}

/** Fields captured as the trigger-time snapshot ("field was X at trigger"). */
const SNAPSHOT_FIELDS = ["stage", "status", "substatus", "ownerId", "source", "score", "name"] as const;

export function snapshotOf(lead: Lead): Record<string, unknown> {
  const rec = lead as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SNAPSHOT_FIELDS) out[k] = rec[k] ?? null;
  return out;
}

const asStr = (v: unknown): string | null => (v == null ? null : String(v));

export async function recordAttribution(a: {
  orgId: string;
  leadId: string;
  engineSource: "automation" | "legacy-disposition";
  workflowId?: string | null;
  nodeId?: string | null;
  ruleId?: string | null;
  triggerEventId?: string | null;
  triggerType?: string | null;
  field: string;
  before: unknown;
  after: unknown;
  snapshot?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.qcfAutomationAttribution.create({
      data: {
        orgId: a.orgId,
        leadId: a.leadId,
        engineSource: a.engineSource,
        workflowId: a.workflowId ?? null,
        nodeId: a.nodeId ?? null,
        ruleId: a.ruleId ?? null,
        triggerEventId: a.triggerEventId ?? null,
        triggerType: a.triggerType ?? null,
        field: a.field,
        beforeValue: asStr(a.before),
        afterValue: asStr(a.after),
        ...(a.snapshot
          ? { triggerSnapshot: a.snapshot as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  } catch (err) {
    console.error("[attribution] failed to record", { leadId: a.leadId, field: a.field, err });
  }
}
