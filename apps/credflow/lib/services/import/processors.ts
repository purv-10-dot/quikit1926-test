/**
 * Per-entity import processors. Each takes a job + parsed payload and inserts/upserts.
 * Errors per row accumulate; the job-level outcome is decided in the worker.
 */

import { parseCsv } from "@/lib/services/import/csv-processor";
import type { CrmLeadImportJob as LeadImportJob } from "@prisma/client";
import { logActivity } from "@/lib/services/activities/log-activity";
import { isPrimaryKind } from "@/lib/services/activities/target-existence";
import { upsertImportedLeadRow } from "@/lib/services/import/lead-import-row";
import { resolveImportRow } from "@/lib/services/import/lead-field-mapping";
import { buildOwnerEmailIndex } from "@/lib/services/import/resolve-owner";
import { listLeadFields } from "@/lib/services/fields/repo";
import { validateDynamicFields } from "@/lib/services/fields/validate";
import { prisma } from "@/lib/db/prisma";

/** Optional CSV-header → field-key map, persisted by the import route on the job. */
function parseColumnMap(payloadJsonText: string | null): Record<string, string> | null {
  if (!payloadJsonText) return null;
  try {
    const parsed = JSON.parse(payloadJsonText) as { columnMap?: Record<string, string> };
    if (parsed?.columnMap && typeof parsed.columnMap === "object") return parsed.columnMap;
  } catch {
    /* malformed JSON → fall back to header/label matching */
  }
  return null;
}

export interface RowError { row: number; error: string }
export interface ProcessorResult {
  totalRows: number;
  importedCount: number;
  /** New leads inserted (leads import only). */
  createdCount?: number;
  /** Existing leads matched + updated via dedupe (leads import only). */
  updatedCount?: number;
  rowErrors: RowError[];
}

export async function processLeadsImport(job: LeadImportJob): Promise<ProcessorResult> {
  if (!job.payloadCsvText) return { totalRows: 0, importedCount: 0, rowErrors: [{ row: 0, error: "no payload" }] };
  const { rows } = parseCsv(job.payloadCsvText);

  // Read the org's LIVE field definitions so the import maps to whatever standard
  // + custom fields currently exist — a field added later imports with no code
  // change. An optional columnMap (from the mapping UI) overrides header matching.
  const defs = await listLeadFields(job.tenantId);
  const columnMap = parseColumnMap(job.payloadJsonText);

  // Build a one-shot email -> real user index so an imported lead can be linked
  // to its actual owner (ownerId), not just carry owner text. Owner email comes
  // from the mapped `owner_email` custom field on each row (see below). Built
  // once here to avoid a per-row user query.
  const ownerIndex = await buildOwnerEmailIndex(job.tenantId);

  const errors: RowError[] = [];
  let created = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const { standard, dynamicInput } = resolveImportRow(r, columnMap, defs);
    // Split the explicit dedupe/common columns from the rest of the standard set.
    const {
      name: rawName,
      email,
      phone,
      mobile,
      company,
      jobTitle,
      source,
      externalId,
      sourceSystem,
      ownerName,
      ...standardExtra
    } = standard;
    const name = (rawName ?? "").trim();
    if (!name) {
      errors.push({ row: i + 2, error: "missing name" });
      continue;
    }

    // Validate + coerce custom fields exactly like manual create (required enforced,
    // types respected, Select/MultiSelect option-checked).
    const { values: dynamicFields, errors: dynErrors } = validateDynamicFields({
      defs,
      input: dynamicInput,
      requireMissing: true,
    });
    if (Object.keys(dynErrors).length > 0) {
      errors.push({
        row: i + 2,
        error: Object.entries(dynErrors).map(([k, v]) => `${k}: ${v}`).join("; "),
      });
      continue;
    }

    // Resolve the lead's owner to a REAL user via the owner email, so the imported
    // lead is assigned exactly like a manual assignment (ownerId set → shows in
    // that user's leads, scoped by owner-visibility). CF maps their "Owner Email"
    // column to the `owner_email` custom field, so read the email from there.
    // Fallbacks: unmatched or missing email → keep the text owner name, leave
    // ownerId unset (legacy behavior); the row still imports. `resolvedOwnerName`
    // is the matched account's canonical name (so name + id agree); when no match
    // we keep whatever the file's Owner-name column provided.
    const ownerEmailRaw = dynamicInput["owner_email"];
    const ownerEmail = typeof ownerEmailRaw === "string" ? ownerEmailRaw.trim().toLowerCase() : "";
    const resolvedOwner = ownerEmail ? ownerIndex.get(ownerEmail) : undefined;
    const resolvedOwnerId = resolvedOwner?.ownerId ?? null;
    const resolvedOwnerName = resolvedOwner?.ownerName ?? (ownerName || null);

    try {
      const { action } = await upsertImportedLeadRow(
        {
          tenantId: job.tenantId,
          name,
          email: email || null,
          phone: phone || null,
          mobile: mobile || null,
          company: company || null,
          jobTitle: jobTitle || null,
          source: source || null,
          externalId: externalId || null,
          sourceSystem: sourceSystem || job.sourceSystem || null,
          ownerName: resolvedOwnerName,
          ownerId: resolvedOwnerId,
          standardExtra,
          dynamicFields,
        },
        {
          channel: "csv_import",
          sourceType: job.sourceType,
          fileName: job.fileName,
          userId: job.createdByUserId ?? undefined,
        },
      );
      if (action === "created") created++;
      else updated++;
    } catch (e) {
      errors.push({ row: i + 2, error: e instanceof Error ? e.message : "insert failed" });
    }
  }
  return {
    totalRows: rows.length,
    importedCount: created + updated,
    createdCount: created,
    updatedCount: updated,
    rowErrors: errors,
  };
}

interface ActivityRow {
  type?: string;
  relatedKind?: string;
  relatedObjectId?: string;
  subject?: string;
  outcome?: string;
  ownerName?: string;
  occurredAt?: string;
  externalId?: string;
}

export async function processActivitiesImport(job: LeadImportJob): Promise<ProcessorResult> {
  if (!job.payloadJsonText) return { totalRows: 0, importedCount: 0, rowErrors: [{ row: 0, error: "no payload" }] };
  let arr: ActivityRow[] = [];
  try {
    arr = JSON.parse(job.payloadJsonText) as ActivityRow[];
  } catch (e) {
    return { totalRows: 0, importedCount: 0, rowErrors: [{ row: 0, error: e instanceof Error ? e.message : "bad json" }] };
  }
  const errors: RowError[] = [];
  let imported = 0;
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i]!;
    if (!r.type || !r.relatedKind || !r.relatedObjectId) {
      errors.push({ row: i, error: "missing required field" });
      continue;
    }
    if (!isPrimaryKind(r.relatedKind)) {
      errors.push({
        row: i,
        error: `relatedKind must be Lead | Opportunity | Contact | Account`,
      });
      continue;
    }
    try {
      await logActivity({
        tenantId: job.tenantId,
        type: r.type,
        relatedKind: r.relatedKind,
        relatedObjectId: r.relatedObjectId,
        subject: r.subject ?? "",
        outcome: r.outcome ?? "",
        ownerName: r.ownerName,
        occurredAt: r.occurredAt ? new Date(r.occurredAt) : new Date(),
        externalId: r.externalId,
        sourceSystem: job.sourceSystem ?? undefined,
      });
      imported++;
    } catch (e) {
      errors.push({ row: i, error: e instanceof Error ? e.message : "insert failed" });
    }
  }
  return { totalRows: arr.length, importedCount: imported, rowErrors: errors };
}

export async function processWorkflowsImport(job: LeadImportJob): Promise<ProcessorResult> {
  // Skeleton — workflow imports rely on graph definitions; expand per the legacy code in
  // import-worker-core.service.ts processWorkflows when needed.
  if (!job.payloadJsonText) return { totalRows: 0, importedCount: 0, rowErrors: [{ row: 0, error: "no payload" }] };
  let arr: Array<Record<string, unknown>> = [];
  try { arr = JSON.parse(job.payloadJsonText); } catch { /* */ }
  let imported = 0;
  const errors: RowError[] = [];
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i]!;
    try {
      await prisma.crmWorkflowDefinition.create({
        data: {
          tenantId: job.tenantId,
          name: String(r.name ?? `Imported workflow #${i}`),
          status: (r.status as "Draft" | "Active") ?? "Draft",
          triggerType: (r.triggerType as string) ?? null,
          triggerSummary: (r.triggerSummary as string) ?? null,
          graphNodes: (r.graphNodes as object) ?? [],
          graphEdges: (r.graphEdges as object) ?? [],
          externalId: (r.externalId as string) ?? null,
          sourceSystem: job.sourceSystem,
        },
      });
      imported++;
    } catch (e) {
      errors.push({ row: i, error: e instanceof Error ? e.message : "insert failed" });
    }
  }
  return { totalRows: arr.length, importedCount: imported, rowErrors: errors };
}

export async function processSlaImport(job: LeadImportJob): Promise<ProcessorResult> {
  // Skeleton matching the legacy "rules + tracking" payload shape.
  if (!job.payloadJsonText) return { totalRows: 0, importedCount: 0, rowErrors: [{ row: 0, error: "no payload" }] };
  let payload: { rules?: Array<Record<string, unknown>>; tracking?: Array<Record<string, unknown>> } = {};
  try { payload = JSON.parse(job.payloadJsonText); } catch { /* */ }
  let imported = 0;
  const errors: RowError[] = [];
  for (let i = 0; i < (payload.rules ?? []).length; i++) {
    const r = payload.rules![i]!;
    try {
      await prisma.crmSlaRule.create({
        data: {
          tenantId: job.tenantId,
          name: String(r.name ?? `Rule #${i}`),
          targetHours: Number(r.targetHours ?? 24),
          appliesTo: (r.appliesTo as string) ?? null,
          externalId: (r.externalId as string) ?? null,
          sourceSystem: job.sourceSystem,
        },
      });
      imported++;
    } catch (e) {
      errors.push({ row: i, error: e instanceof Error ? e.message : "insert failed" });
    }
  }
  const total = (payload.rules ?? []).length + (payload.tracking ?? []).length;
  return { totalRows: total, importedCount: imported, rowErrors: errors };
}
