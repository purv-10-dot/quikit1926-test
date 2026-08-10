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
] as const;

function isMissingProfileFieldError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("unknown column") ||
    msg.includes("unknown argument") ||
    (msg.includes("column") && PROFILE_COLUMNS.some((c) => msg.includes(c.toLowerCase()))) ||
    PROFILE_COLUMNS.some((c) => msg.includes(c.toLowerCase()))
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
    if (!isMissingProfileFieldError(err)) throw err;
    console.warn(
      "[leads] Profile columns missing in DB — saving without secondaryEmail/website/linkedinUrl/annualRevenueDisplay/descriptionInformation. " +
        "Apply latest lead profile-field migrations under packages/database/prisma/migrations.",
    );
    return await prisma.crmLead.create({ data: withoutProfileColumns(data) });
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
    if (!isMissingProfileFieldError(err)) throw err;
    console.warn(
      "[leads] Profile columns missing in DB — updating without secondaryEmail/website/linkedinUrl/annualRevenueDisplay/descriptionInformation.",
    );
    return await prisma.crmLead.update({
      where: { id },
      data: withoutProfileColumns(data as Prisma.CrmLeadUncheckedCreateInput),
    });
  }
}
