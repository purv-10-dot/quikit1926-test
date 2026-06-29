import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fieldConfig, type FieldValue } from "@/lib/customFields/registry";
import { validateFieldValue, type FieldForValidation } from "@/lib/validation/customField";
import { serializeField, type CustomFieldDTO } from "@/lib/services/customFields";

/**
 * Custom field VALUE service — reads/writes QtIssueFieldValue and assembles the
 * active field set for an issue's scope (global + that project's space fields).
 * Definitions live in customFields.ts.
 */

/**
 * Active fields visible on an issue in `projectId`: all active global fields +
 * that project's active space fields. Ordering (FRD §5.3): global fields first
 * (alphabetical), then space fields (by admin position, then alphabetical).
 */
export async function getActiveFieldsForProject(
  orgId: string,
  projectId: string,
): Promise<CustomFieldDTO[]> {
  const rows = await db.qtCustomField.findMany({
    where: {
      orgId,
      status: "active",
      isDeleted: false,
      OR: [{ scope: "global" }, { scope: "space", projectId }],
    },
    include: { options: true },
  });
  const fields = rows.map(serializeField);
  return fields.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "global" ? -1 : 1;
    if (a.scope === "global") return a.name.localeCompare(b.name);
    if (a.position !== b.position) return a.position - b.position;
    return a.name.localeCompare(b.name);
  });
}

/** Logical values for one issue, keyed by fieldId. */
export async function getValuesForIssue(orgId: string, issueId: string): Promise<Record<string, FieldValue>> {
  const rows = await db.qtIssueFieldValue.findMany({
    where: { orgId, issueId },
    include: { field: { select: { type: true } } },
  });
  const out: Record<string, FieldValue> = {};
  for (const row of rows) {
    out[row.fieldId] = fieldConfig(row.field.type).fromColumns(row);
  }
  return out;
}

/** Bulk values for many issues (filtering / list views). issueId → fieldId → value. */
export async function getValuesForIssues(
  orgId: string,
  issueIds: string[],
): Promise<Record<string, Record<string, FieldValue>>> {
  if (issueIds.length === 0) return {};
  const rows = await db.qtIssueFieldValue.findMany({
    where: { orgId, issueId: { in: issueIds } },
    include: { field: { select: { type: true } } },
  });
  const out: Record<string, Record<string, FieldValue>> = {};
  for (const row of rows) {
    (out[row.issueId] ??= {})[row.fieldId] = fieldConfig(row.field.type).fromColumns(row);
  }
  return out;
}

export interface ValueChange {
  fieldId: string;
  fieldName: string;
  oldValue: FieldValue;
  newValue: FieldValue;
}

/**
 * Validate (without persisting) a partial map of custom field values for an
 * issue. Used to block issue creation before the row is written (UC-03 alt A).
 * Returns normalized values keyed by fieldId when ok.
 */
export async function validateIssueValues(opts: {
  orgId: string;
  projectId: string;
  issueId?: string;
  values: Record<string, FieldValue>;
  enforceRequired?: boolean;
}): Promise<{ ok: false; errors: string[] } | { ok: true; normalized: Map<string, FieldValue> }> {
  const { orgId, projectId, issueId, values, enforceRequired } = opts;
  const fields = await getActiveFieldsForProject(orgId, projectId);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const existing = issueId ? await getValuesForIssue(orgId, issueId) : {};

  const errors: string[] = [];
  const normalized = new Map<string, FieldValue>();

  for (const [fieldId, raw] of Object.entries(values)) {
    const field = byId.get(fieldId);
    if (!field) continue; // ignore unknown / out-of-scope ids
    const def: FieldForValidation = {
      id: field.id,
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      options: field.options.map((o) => ({ value: o.value, isActive: o.isActive })),
    };
    const res = validateFieldValue(def, raw);
    if (!res.ok) errors.push(res.error!);
    else normalized.set(fieldId, res.value ?? null);
  }

  if (enforceRequired) {
    for (const field of fields) {
      if (!field.isRequired) continue;
      const provided = normalized.has(field.id) ? normalized.get(field.id) : existing[field.id];
      const blankish =
        provided === null || provided === undefined || provided === "" ||
        (Array.isArray(provided) && provided.length === 0);
      if (blankish) errors.push(`${field.name} is required.`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, normalized };
}

export type WriteValuesResult =
  | { ok: false; errors: string[] }
  | { ok: true; changes: ValueChange[] };

/**
 * Validate + persist custom field values for an issue (authoritative — NFR-05).
 * `values` is a partial map of fieldId → value. Unknown/out-of-scope field ids
 * are ignored. Blank values delete the row. On create, pass enforceRequired so
 * required fields must be present.
 */
export async function writeIssueValues(opts: {
  orgId: string;
  issueId: string;
  projectId: string;
  actorId: string;
  values: Record<string, FieldValue>;
  enforceRequired?: boolean;
  tx?: typeof db;
}): Promise<WriteValuesResult> {
  const { orgId, issueId, projectId, actorId, values, enforceRequired } = opts;
  const client = opts.tx ?? db;

  const validation = await validateIssueValues({ orgId, projectId, issueId, values, enforceRequired });
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const normalized = validation.normalized;

  const fields = await getActiveFieldsForProject(orgId, projectId);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const existing = await getValuesForIssue(orgId, issueId);

  const changes: ValueChange[] = [];
  for (const [fieldId, value] of normalized.entries()) {
    const field = byId.get(fieldId)!;
    const prev = existing[fieldId] ?? null;
    const cfg = fieldConfig(field.type);

    if (value === null || (Array.isArray(value) && value.length === 0)) {
      await client.qtIssueFieldValue.deleteMany({ where: { orgId, issueId, fieldId } });
      if (prev !== null && !(Array.isArray(prev) && prev.length === 0)) {
        changes.push({ fieldId, fieldName: field.name, oldValue: prev, newValue: null });
      }
      continue;
    }

    const cols = cfg.toColumns(value);
    // `toColumns` types valueJson as `unknown` (it holds a JSON-safe string[] | null);
    // narrow it to Prisma's Json input type — value is unchanged at runtime.
    const valueJson = cols.valueJson as Prisma.InputJsonValue | undefined;
    await client.qtIssueFieldValue.upsert({
      where: { issueId_fieldId: { issueId, fieldId } },
      create: { orgId, issueId, fieldId, ...cols, valueJson, createdBy: actorId, updatedBy: actorId },
      update: { ...cols, valueJson, updatedBy: actorId },
    });
    if (JSON.stringify(prev) !== JSON.stringify(value)) {
      changes.push({ fieldId, fieldName: field.name, oldValue: prev, newValue: value });
    }
  }

  return { ok: true, changes };
}
