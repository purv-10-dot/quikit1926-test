/**
 * Per-entity import processors. Each takes a job + parsed payload and inserts/upserts.
 * Errors per row accumulate; the job-level outcome is decided in the worker.
 */

import { parseCsv } from "@/lib/services/import/csv-processor";
import type { CrmLeadImportJob as LeadImportJob } from "@prisma/client";
import { logActivity } from "@/lib/services/activities/log-activity";
import { isPrimaryKind } from "@/lib/services/activities/target-existence";
import { upsertImportedLeadRow } from "@/lib/services/import/lead-import-row";
import { prisma } from "@/lib/db/prisma";

export interface RowError { row: number; error: string }
export interface ProcessorResult {
  totalRows: number;
  importedCount: number;
  rowErrors: RowError[];
}

export async function processLeadsImport(job: LeadImportJob): Promise<ProcessorResult> {
  if (!job.payloadCsvText) return { totalRows: 0, importedCount: 0, rowErrors: [{ row: 0, error: "no payload" }] };
  const { rows } = parseCsv(job.payloadCsvText);
  const errors: RowError[] = [];
  let imported = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!r.name) {
      errors.push({ row: i + 2, error: "missing name" });
      continue;
    }
    try {
      await upsertImportedLeadRow(
        {
          orgId: job.orgId,
          name: r.name,
          email: r.email || null,
          phone: r.phone || null,
          mobile: r.mobile || null,
          company: r.company || null,
          jobTitle: r.jobTitle || null,
          source: r.source || null,
          externalId: r.externalId || null,
          sourceSystem: job.sourceSystem || r.sourceSystem || null,
          ownerName: r.ownerName || null,
        },
        {
          channel: "csv_import",
          sourceType: job.sourceType,
          fileName: job.fileName,
          userId: job.createdByUserId ?? undefined,
        },
      );
      imported++;
    } catch (e) {
      errors.push({ row: i + 2, error: e instanceof Error ? e.message : "insert failed" });
    }
  }
  return { totalRows: rows.length, importedCount: imported, rowErrors: errors };
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
      await prisma.crmWorkflowDefinition.create({
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
      await prisma.crmSlaRule.create({
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
