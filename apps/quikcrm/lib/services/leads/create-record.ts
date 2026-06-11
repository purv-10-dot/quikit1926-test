import type { CrmLead } from "@quikit/database";
import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import {
  logLeadSystemActivitiesOnCreate,
  type LeadCreationContext,
} from "@/lib/services/leads/log-lead-system-activities";

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
  data: Prisma.CrmLeadUncheckedCreateInput,
): Prisma.CrmLeadUncheckedCreateInput {
  const copy = { ...data } as Record<string, unknown>;
  for (const key of PROFILE_COLUMNS) delete copy[key];
  return copy as Prisma.CrmLeadUncheckedCreateInput;
}

export type LeadCreateOptions = {
  /** When set, writes system activities on the lead timeline (Lead created, source, owner, …). */
  creation?: LeadCreationContext;
};

async function insertLead(data: Prisma.CrmLeadUncheckedCreateInput): Promise<CrmLead> {
  try {
    return await prisma.crmLead.create({ data });
  } catch (err) {
    if (!isMissingProfileColumnError(err)) throw err;
    const stripped = withoutProfileColumns(data);
    console.warn(
      "[leads] Profile columns missing in DB — retrying without lead profile/qualification fields. " +
        "Run: npm run db:sql:crm-lead-form-columns && npm run db:generate",
    );
    try {
      return await prisma.crmLead.create({ data: stripped });
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
  data: Prisma.CrmLeadUncheckedCreateInput,
  options?: LeadCreateOptions,
) {
  const lead = await insertLead(data);
  try {
    await logLeadSystemActivitiesOnCreate(lead, options?.creation ?? {});
  } catch (err) {
    console.error("[leads] logLeadSystemActivitiesOnCreate failed", err);
  }
  return lead;
}

/** Update a lead row; same profile-column fallback as create. */
export async function updateCrmLead(
  id: string,
  data: Prisma.CrmLeadUncheckedUpdateInput,
) {
  try {
    return await prisma.crmLead.update({ where: { id }, data });
  } catch (err) {
    if (!isMissingProfileColumnError(err)) throw err;
    console.warn(
      "[leads] Profile columns missing in DB — updating without lead profile/qualification columns.",
    );
    return await prisma.crmLead.update({
      where: { id },
      data: withoutProfileColumns(data as Prisma.CrmLeadUncheckedCreateInput),
    });
  }
}
