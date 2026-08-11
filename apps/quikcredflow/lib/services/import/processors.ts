/**
 * Per-entity import processors. Each takes a job + parsed payload and inserts/upserts.
 * Errors per row accumulate; the job-level outcome is decided in the worker.
 */

import { parseCsv } from "@/lib/services/import/csv-processor";
import type { QcfLeadImportJob as LeadImportJob } from "@prisma/client";
import { logActivity } from "@/lib/services/activities/log-activity";
import { isPrimaryKind } from "@/lib/services/activities/target-existence";
import { upsertImportedLeadRow } from "@/lib/services/import/lead-import-row";
import { resolveImportRow } from "@/lib/services/import/lead-field-mapping";
import {
  buildPipelineMatchers,
  normalizePipelineFields,
  normalizeSourceValue,
  type NormalizationFlag,
} from "@/lib/services/import/normalize-pipeline-values";
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
  const defs = await listLeadFields(job.orgId);
  const columnMap = parseColumnMap(job.payloadJsonText);

  // Load the tenant's configured pipeline once so incoming stage/status/substatus
  // can be snapped to VALID configured values on the way in (LSQ exports carry
  // spacing + numeric-prefix variants that otherwise land invalid). Also load the
  // source values already present, so "Mobile Signup" collapses onto an existing
  // "mobile signup" (source is free-text, no configured list to match against).
  const ws = await prisma.qcfOrgWorkspaceSettings.findUnique({ where: { orgId: job.orgId } });
  const pipelineCfg = ((ws?.settings as Record<string, unknown> | null) ?? {})["leadPipelineConfig"] as
    | { stages?: string[]; statuses?: string[]; substatuses?: string[] }
    | undefined;
  const matchers = buildPipelineMatchers({
    stages: Array.isArray(pipelineCfg?.stages) ? pipelineCfg!.stages! : [],
    statuses: Array.isArray(pipelineCfg?.statuses) ? pipelineCfg!.statuses! : [],
    substatuses: Array.isArray(pipelineCfg?.substatuses) ? pipelineCfg!.substatuses! : [],
  });
  const existingSourceRows = await prisma.qcfLead.findMany({
    where: { orgId: job.orgId, deletedAt: null, source: { not: null } },
    select: { source: true },
    distinct: ["source"],
  });
  const existingSources = existingSourceRows
    .map((r) => r.source)
    .filter((s): s is string => !!s && s.trim() !== "");

  // Accumulated pipeline-normalization warnings (value not in configured list).
  // Non-blocking: the row still imports with its raw value; these surface in the
  // job's rowErrors summary so the agent can review the handful that didn't match.
  const normalizationFlags: Array<{ row: number; flag: NormalizationFlag }> = [];

  // Build a one-shot email -> real user index so an imported lead can be linked
  // to its actual owner (ownerId), not just carry owner text. Owner email comes
  // from the mapped `owner_email` custom field on each row (see below). Built
  // once here to avoid a per-row user query.
  const ownerIndex = await buildOwnerEmailIndex(job.orgId);

  const errors: RowError[] = [];
  let created = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const resolved = resolveImportRow(r, columnMap, defs);
    // Snap incoming pipeline values to configured spellings (LSQ spacing +
    // numeric-prefix variants); collect any that don't match a configured value
    // as non-blocking warnings. Source is case-folded against existing values.
    const { standard: normalizedStandard, flags } = normalizePipelineFields(resolved.standard, matchers);
    if (typeof normalizedStandard.source === "string" && normalizedStandard.source !== "") {
      normalizedStandard.source = normalizeSourceValue(normalizedStandard.source, existingSources);
    }
    for (const flag of flags) normalizationFlags.push({ row: i + 2, flag });
    const standard = normalizedStandard;
    const dynamicInput = resolved.dynamicInput;
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
          orgId: job.orgId,
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
  // Fold pipeline-normalization warnings into rowErrors so the import summary
  // shows them. These are NON-BLOCKING: the affected rows already imported (with
  // their raw pipeline value); this is a "review these values" notice, marked so
  // it reads distinctly from a hard row failure.
  for (const { row, flag } of normalizationFlags) {
    errors.push({ row, error: `note: ${flag.field} "${flag.value}" is not a configured value (imported as-is)` });
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
        orgId: job.orgId,
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
      await prisma.qcfWorkflowDefinition.create({
        data: {
          orgId: job.orgId,
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
      await prisma.qcfSlaRule.create({
        data: {
          orgId: job.orgId,
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
