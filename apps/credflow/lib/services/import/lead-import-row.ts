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

/**
 * Pipeline fields that hold a lead's live workflow position. On a MATCHED
 * (existing) lead we treat the CRM as the source of truth for these: an import
 * may FILL them when the lead is UNWORKED, but must NOT OVERWRITE a value set by
 * real work done in the app. A re-uploaded (possibly stale) export otherwise
 * rolls a lead back — wiping this week's progress and even re-triggering
 * automations on the rollback. (New leads are unaffected: the create branch
 * writes them in full.)
 */
const PROTECTED_PIPELINE_FIELDS = ["stage", "status", "substatus"] as const;

/**
 * "Unworked" values that should NOT be protected — the import is allowed to set a
 * real value over these. `stage`/`status` are NOT-NULL columns with DB defaults
 * ('New' / 'Open'), so a never-worked lead is never literally blank; it sits at
 * the default. Protecting the default would freeze such leads and defeat the
 * import for genuinely-new records. Note the default 'New' is DISTINCT from the
 * real workflow stage 'New Lead', so treating literal 'New'/'Open' as unworked
 * does not collide with a real pipeline value. `substatus` is nullable, so its
 * unworked state is simply blank/null.
 */
const UNWORKED_PIPELINE_VALUES: Record<string, ReadonlySet<string>> = {
  stage: new Set(["new"]),
  status: new Set(["open"]),
  substatus: new Set([]),
};

/** Is this field's current value the unworked/default state (so a fill is OK)? */
function isUnworkedPipelineValue(field: string, current: string | null | undefined): boolean {
  if (current == null || current.trim() === "") return true; // blank (substatus) = unworked
  return (UNWORKED_PIPELINE_VALUES[field] ?? new Set<string>()).has(current.trim().toLowerCase());
}

/**
 * Return a copy of `standardExtra` with pipeline fields removed WHEN the existing
 * lead already holds a REAL (worked) value for them — fill-blanks-only on update,
 * where "blank" also covers the DB defaults ('New'/'Open') that mark an unworked
 * lead. Other standard columns pass through unchanged. `existing` carries the
 * lead's current pipeline values.
 */
function protectExistingPipeline(
  standardExtra: Record<string, unknown>,
  existing: { stage?: string | null; status?: string | null; substatus?: string | null },
): Record<string, unknown> {
  const out = { ...standardExtra };
  for (const f of PROTECTED_PIPELINE_FIELDS) {
    const current = existing[f];
    // Protect only when the lead has been WORKED (a real value, not blank/default).
    if (!isUnworkedPipelineValue(f, current) && f in out) delete out[f];
  }
  return out;
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
      select: { id: true, dynamicFields: true, stage: true, status: true, substatus: true },
    });
    if (existing) {
      // Fill-blanks-only for pipeline fields: never overwrite a stage/status/
      // substatus the CRM already has (protects in-app work from a stale re-upload).
      const safeExtra = protectExistingPipeline(standardExtra, existing);
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
          ...safeExtra,
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
      select: { dynamicFields: true, stage: true, status: true, substatus: true },
    });
    // Fill-blanks-only for pipeline fields (see externalId branch above): protect
    // any stage/status/substatus the CRM already has from a stale re-upload.
    const safeExtra = protectExistingPipeline(standardExtra, existing ?? {});
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
        ...safeExtra,
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
