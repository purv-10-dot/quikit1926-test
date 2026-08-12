import type { QceLead } from "@quikit/database";
import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import {
  logLeadSystemActivitiesOnCreate,
  type LeadCreationContext,
} from "@/lib/services/leads/log-lead-system-activities";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
import { onLeadCreated } from "@/lib/services/automation/triggers";

/**
 * Columns added in migration `20260519130000_crm_lead_profile_fields`.
 * If the migration has not been applied yet, Prisma insert fails — we retry
 * without these fields so lead create still works (values are dropped until migrated).
 */
const PROFILE_COLUMNS = [
  "secondaryEmail",
  "website",
  "linkedinUrl",
  "annualRevenueDisplay",
  "descriptionInformation",
  "topic",
  "technology",
  "budgetAmount",
  "budgetCurrency",
  "purchaseTimeframe",
  "leadType",
  "firstName",
  "lastName",
  "sourceDetails",
  "contactLinkedinUrl",
  "nextFollowUpAt",
  "lastContactedAt",
  "followupNotes",
  "internalRemarks",
  "requirementDetails",
] as const;

function isMissingProfileColumnError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
    const column = (err.meta as { column?: string } | undefined)?.column ?? "";
    return PROFILE_COLUMNS.some(
      (c) => column === c || column.endsWith(`.${c}`) || column.includes(c),
    );
  }
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // DB column missing — not Prisma "Unknown argument" (stale client / schema drift)
  if (msg.includes("unknown argument")) return false;
  return (
    msg.includes("does not exist") ||
    msg.includes("unknown column") ||
    (msg.includes("column") && PROFILE_COLUMNS.some((c) => msg.includes(c.toLowerCase())))
  );
}

function withoutProfileColumns(
  data: Prisma.QceLeadUncheckedCreateInput,
): Prisma.QceLeadUncheckedCreateInput {
  const copy = { ...data } as Record<string, unknown>;
  for (const key of PROFILE_COLUMNS) delete copy[key];
  return copy as Prisma.QceLeadUncheckedCreateInput;
}

export type LeadCreateOptions = {
  /** When set, writes system activities on the lead timeline (Lead created, source, owner, …). */
  creation?: LeadCreationContext;
};

async function insertLead(data: Prisma.QceLeadUncheckedCreateInput): Promise<QceLead> {
  try {
    return await prisma.qceLead.create({ data });
  } catch (err) {
    if (!isMissingProfileColumnError(err)) throw err;
    const stripped = withoutProfileColumns(data);
    console.warn(
      "[leads] Profile columns missing in DB — retrying without lead profile/qualification fields. " +
        "Run: npm run db:sql:crm-lead-form-columns && npm run db:generate",
    );
    try {
      return await prisma.qceLead.create({ data: stripped });
    } catch (retryErr) {
      console.error("[leads] Create failed after stripping profile columns.", retryErr);
      throw new Error(
        "Lead could not be saved. Run: npm run db:sql:crm-lead-form-columns && npm run db:generate, then restart quikcrm:dev",
        { cause: retryErr },
      );
    }
  }
}

/** Create a lead row; retries without profile columns when the DB migration is pending. */
export async function createCrmLead(
  data: Prisma.QceLeadUncheckedCreateInput,
  options?: LeadCreateOptions,
) {
  const lead = await insertLead(data);
  // Enqueue outbound sync FIRST — before the (throwable) activity log below and
  // before any caller-side scoring/change-log — so it can never be skipped.
  triggerOutboundSync({ orgId: lead.orgId, crmLeadId: lead.id });
  // Fire the New-Lead automation trigger from the SERVICE layer so EVERY create
  // path fires rules — the API route AND bulk import (lead-import-row) both call
  // createCrmLead, so this closes the SURVEY #2 silent no-fire on the import
  // path. STANDING RULE (SPEC §1): any future lead write path must emit its
  // trigger or rules silently won't fire there. Fire-and-forget + Redis-safe
  // (fireTrigger no-ops without Redis).
  void Promise.resolve(
    onLeadCreated(lead.orgId, lead.id, lead.ownerName ?? ""),
  ).catch((err) => console.error("[automation] onLeadCreated failed", err));
  try {
    await logLeadSystemActivitiesOnCreate(lead, options?.creation ?? {});
  } catch (err) {
    console.error("[leads] logLeadSystemActivitiesOnCreate failed", err);
  }
  return lead;
}

async function runUpdate(
  id: string,
  data: Prisma.QceLeadUncheckedUpdateInput,
): Promise<QceLead> {
  try {
    return await prisma.qceLead.update({ where: { id }, data });
  } catch (err) {
    if (!isMissingProfileColumnError(err)) throw err;
    console.warn(
      "[leads] Profile columns missing in DB — updating without lead profile/qualification columns.",
    );
    return await prisma.qceLead.update({
      where: { id },
      data: withoutProfileColumns(data as Prisma.QceLeadUncheckedCreateInput),
    });
  }
}

/** Update a lead row; same profile-column fallback as create. Enqueues the
 *  outbound sync right after the row is committed. NOTE: this covers only the
 *  PATCH /api/leads/[id] path — other update paths (telephony/FR-RE/automation/
 *  bulk-assign/convert/transition) call prisma.qceLead.update directly and are
 *  NOT routed through here. */
export async function updateCrmLead(
  id: string,
  data: Prisma.QceLeadUncheckedUpdateInput,
) {
  const updated = await runUpdate(id, data);
  triggerOutboundSync({ orgId: updated.orgId, crmLeadId: updated.id });
  return updated;
}
