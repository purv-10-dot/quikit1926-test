import type { Prisma, PrismaClient } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Stamp a lead's "last activity" marker in dynamicFields.
 *
 * CrmExpress filters leads on the custom `last_activity_date` field (e.g. "Last
 * Activity Date is before today"). That field is imported once from LeadSquared
 * and was never advanced by in-app activity, so after a call disposition it kept
 * its old value and the lead never dropped off a "before today" filter. This
 * helper is the single place that advances it, called from every lead-touching
 * activity (disposition, note, task, logged activity).
 *
 * - ISO 8601 (UTC) — matches all other dynamic dates and the filter engine's
 *   string comparison for before/after.
 * - Touches only `last_activity_date` (+ label in `last_activity`); leaves
 *   `last_notable_activity_date` alone.
 * - Pure field write (no activity row, no automation emit) — cannot recurse.
 * - Read-merge-write so other dynamicFields are preserved.
 * - Optional tx so callers inside a $transaction stamp atomically.
 * - Best-effort: failures are logged and swallowed, never breaking the save.
 */
export async function touchLeadLastActivity(opts: {
  orgId: string;
  leadId: string;
  when?: Date;
  label?: string;
  tx?: Tx;
}): Promise<void> {
  const { orgId, leadId, when, label, tx } = opts;
  const client: Tx = tx ?? prisma;
  const stampIso = (when ?? new Date()).toISOString();

  try {
    const lead = await client.qceLead.findFirst({
      where: { id: leadId, orgId },
      select: { dynamicFields: true },
    });
    if (!lead) return;

    const dyn = (lead.dynamicFields as Record<string, unknown> | null) ?? {};
    const nextDyn: Record<string, unknown> = {
      ...dyn,
      last_activity_date: stampIso,
      last_activity: label ?? "Activity",
    };

    await client.qceLead.update({
      where: { id: leadId },
      data: { dynamicFields: nextDyn as Prisma.InputJsonValue },
    });
  } catch (err) {
    console.error("[touch-last-activity] failed to stamp last_activity_date", {
      leadId,
      err,
    });
  }
}