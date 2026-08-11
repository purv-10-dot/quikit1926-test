import type { CrmLead } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@quikit/database";
import { createCrmLead } from "@/lib/services/leads/create-record";
import type { LeadCreationContext } from "@/lib/services/leads/log-lead-system-activities";

export type LeadImportRowInput = {
  tenantId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  source?: string | null;
  externalId?: string | null;
  sourceSystem?: string | null;
  ownerName?: string | null;
};

export type LeadImportRowContext = LeadCreationContext & {
  sourceType?: string | null;
  fileName?: string | null;
};

/**
 * Insert or upsert one imported lead; system activities only on first create.
 */
export async function upsertImportedLeadRow(
  data: LeadImportRowInput,
  ctx: LeadImportRowContext,
): Promise<CrmLead> {
  const row: Prisma.CrmLeadUncheckedCreateInput = {
    tenantId: data.tenantId,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    mobile: data.mobile || null,
    company: data.company || null,
    jobTitle: data.jobTitle || null,
    source: data.source || null,
    externalId: data.externalId || null,
    sourceSystem: data.sourceSystem || null,
    ownerName: data.ownerName || null,
  };

  if (row.externalId && row.sourceSystem) {
    const existing = await prisma.crmLead.findUnique({
      where: {
        lead_external_uk: {
          tenantId: row.tenantId,
          sourceSystem: row.sourceSystem,
          externalId: row.externalId,
        },
      },
    });
    if (existing) {
      return prisma.crmLead.update({
        where: { id: existing.id },
        data: {
          name: row.name,
          email: row.email,
          phone: row.phone,
          company: row.company,
        },
      });
    }
  }

  return createCrmLead(row, {
    creation: {
      channel: "csv_import",
      userId: ctx.userId,
      metadata: {
        ...(ctx.fileName ? { "Import file": ctx.fileName } : {}),
        ...(ctx.sourceType ? { "Import type": ctx.sourceType } : {}),
      },
    },
  });
}
