import type { CrmLead } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@quikit/database";
import { createCrmLead } from "@/lib/services/leads/create-record";
import { findDuplicateLeadRecord } from "@/lib/services/leads/duplicate";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
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
  /**
   * Resolved owner user-id (from an owner-email lookup on import). When set, the
   * lead gets a REAL owner link — appears in that user's leads and is scoped by
   * owner-visibility, exactly like a manual assignment. Null/undefined leaves the
   * lead unlinked (ownerName text only), the legacy behavior.
   */
  ownerId?: string | null;
  /**
   * Additional whitelisted standard Lead columns beyond the explicit ones above
   * (e.g. industry, stage, status, website). Caller is responsible for only
   * passing real CrmLead scalar columns — see IMPORTABLE_STANDARD_KEYS.
   */
  standardExtra?: Record<string, unknown> | null;
  /**
   * Validated + coerced custom/dynamic field values, keyed by field key. Stored
   * on Lead.dynamicFields exactly as the manual create/edit paths do.
   */
  dynamicFields?: Record<string, unknown> | null;
};

export type LeadImportRowContext = LeadCreationContext & {
  sourceType?: string | null;
  fileName?: string | null;
};

/** Merge incoming dynamic values onto an existing row's JSON (incoming wins), matching the PATCH path. */
function mergeDynamic(
  existing: Prisma.JsonValue | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): { dynamicFields: Prisma.InputJsonValue } | Record<string, never> {
  if (!incoming || Object.keys(incoming).length === 0) return {};
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { dynamicFields: { ...base, ...incoming } as Prisma.InputJsonValue };
}

export type ImportRowAction = "created" | "updated";
export interface ImportRowResult {
  lead: CrmLead;
  /** Whether this row inserted a new lead or matched + updated an existing one (dedupe). */
  action: ImportRowAction;
}

/**
 * Insert or upsert one imported lead; system activities only on first create.
 *
 * Behaves like a manual create: standard columns write to the Lead row, and
 * validated custom values write to Lead.dynamicFields (merged on update).
 * Reports whether the row was created or updated so the import can surface an
 * honest "N new, M updated" summary instead of a misleading upsert count.
 */
export async function upsertImportedLeadRow(
  data: LeadImportRowInput,
  ctx: LeadImportRowContext,
): Promise<ImportRowResult> {
  const standardExtra = data.standardExtra ?? {};
  const dynamicCreate =
    data.dynamicFields && Object.keys(data.dynamicFields).length > 0
      ? { dynamicFields: data.dynamicFields as Prisma.InputJsonValue }
      : {};

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
    ...(data.ownerId ? { ownerId: data.ownerId } : {}),
    ...standardExtra,
    ...dynamicCreate,
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
      select: { id: true, dynamicFields: true },
    });
    if (existing) {
      const lead = await prisma.crmLead.update({
        where: { id: existing.id },
        data: {
          name: row.name,
          email: row.email,
          phone: row.phone,
          company: row.company,
          // Re-upload with a resolved owner updates the link (and keeps name in
          // sync); a re-upload WITHOUT a resolved owner leaves the existing
          // owner untouched, so it never clobbers a manual reassignment.
          ...(data.ownerId ? { ownerId: data.ownerId, ownerName: data.ownerName || null } : {}),
          ...standardExtra,
          ...mergeDynamic(existing.dynamicFields, data.dynamicFields),
        },
      });
      // Imported UPDATE bypasses updateCrmLead, so enqueue the outbound push here
      // (fire-and-forget, per row — matches createCrmLead in the create branch).
      triggerOutboundSync({ tenantId: lead.tenantId, crmLeadId: lead.id });
      return { lead, action: "updated" };
    }
  }

  // Email/phone dedupe — mirror the manual-create rule (findDuplicateLead) so a
  // re-uploaded file, or any row lacking an externalId, updates the existing lead
  // instead of inserting a duplicate the manual path would have rejected. On a
  // match we also stamp externalId/sourceSystem so future re-uploads key cleanly.
  const dupe = await findDuplicateLeadRecord({
    tenantId: row.tenantId,
    email: typeof row.email === "string" ? row.email : null,
    mobile: typeof row.mobile === "string" ? row.mobile : null,
    phone: typeof row.phone === "string" ? row.phone : null,
  });
  if (dupe) {
    const existing = await prisma.crmLead.findUnique({
      where: { id: dupe.id },
      select: { dynamicFields: true },
    });
    const lead = await prisma.crmLead.update({
      where: { id: dupe.id },
      data: {
        name: row.name,
        email: row.email,
        phone: row.phone,
        mobile: row.mobile,
        company: row.company,
        ...(row.externalId ? { externalId: row.externalId } : {}),
        ...(row.sourceSystem ? { sourceSystem: row.sourceSystem } : {}),
        // Same owner rule as the externalId branch: update the link only when a
        // fresh owner was resolved; never wipe an existing owner on re-upload.
        ...(data.ownerId ? { ownerId: data.ownerId, ownerName: data.ownerName || null } : {}),
        ...standardExtra,
        ...mergeDynamic(existing?.dynamicFields, data.dynamicFields),
      },
    });
    // Dedupe-matched UPDATE also bypasses updateCrmLead — enqueue here too.
    triggerOutboundSync({ tenantId: lead.tenantId, crmLeadId: lead.id });
    return { lead, action: "updated" };
  }

  const lead = await createCrmLead(row, {
    creation: {
      channel: "csv_import",
      userId: ctx.userId,
      metadata: {
        ...(ctx.fileName ? { "Import file": ctx.fileName } : {}),
        ...(ctx.sourceType ? { "Import type": ctx.sourceType } : {}),
      },
    },
  });
  return { lead, action: "created" };
}
