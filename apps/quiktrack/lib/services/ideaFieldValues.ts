import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fieldConfig, type FieldValue } from "@/lib/customFields/registry";
import { validateFieldValue, type FieldForValidation } from "@/lib/validation/customField";
import { getActiveFieldsForProject } from "@/lib/services/customFieldValues";
import {
  SCORE_FIELD_KEY,
  SCORE_INPUT_KEYS,
  DISCOVERY_FIELD_KEYS,
} from "@/lib/services/discoveryDefaults";

/**
 * Idea custom-field VALUE service — the QtIdeaFieldValue analogue of
 * customFieldValues.ts (which handles QtIssueFieldValue). Field DEFINITIONS are
 * shared (QtCustomField), so field discovery + validation reuse the issue-side
 * helpers; only the value rows differ (ideaId instead of issueId).
 *
 * Score is computed here (RICE): (Impact × Confidence × Reach) ÷ Effort, and is
 * never writable by the client — writeIdeaValues drops any incoming `score`.
 */

/** Logical values for one idea, keyed by fieldId. */
export async function getValuesForIdea(
  orgId: string,
  ideaId: string,
): Promise<Record<string, FieldValue>> {
  const rows = await db.qtIdeaFieldValue.findMany({
    where: { orgId, ideaId },
    include: { field: { select: { type: true } } },
  });
  const out: Record<string, FieldValue> = {};
  for (const row of rows) out[row.fieldId] = fieldConfig(row.field.type).fromColumns(row);
  return out;
}

/** Bulk values for many ideas (the Table view). ideaId → fieldId → value. */
export async function getValuesForIdeas(
  orgId: string,
  ideaIds: string[],
): Promise<Record<string, Record<string, FieldValue>>> {
  if (ideaIds.length === 0) return {};
  const rows = await db.qtIdeaFieldValue.findMany({
    where: { orgId, ideaId: { in: ideaIds } },
    include: { field: { select: { type: true } } },
  });
  const out: Record<string, Record<string, FieldValue>> = {};
  for (const row of rows) {
    (out[row.ideaId] ??= {})[row.fieldId] = fieldConfig(row.field.type).fromColumns(row);
  }
  return out;
}

function toNumber(v: FieldValue): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * RICE Score = (Impact × Confidence × Reach) ÷ Effort, rounded to 2 dp.
 * Returns null when any input is missing or Effort is 0 (avoids div-by-zero /
 * false zeros — the Table shows those ideas as unscored).
 */
export function computeScore(inputs: {
  impact: number | null;
  confidence: number | null;
  reach: number | null;
  effort: number | null;
}): number | null {
  const { impact, confidence, reach, effort } = inputs;
  if (impact === null || confidence === null || reach === null || effort === null) return null;
  if (effort === 0) return null;
  const raw = (impact * confidence * reach) / effort;
  return Math.round(raw * 100) / 100;
}

export type WriteValuesResult =
  | { ok: false; errors: string[] }
  | { ok: true };

/**
 * Validate + persist idea custom-field values (authoritative — server-side).
 * `values` is a partial fieldId → value map. Unknown/out-of-scope ids are
 * ignored; blank values delete the row. Any attempt to write the computed Score
 * field is dropped. After writing, Score is recomputed from the idea's current
 * Impact/Confidence/Reach/Effort and upserted.
 */
export async function writeIdeaValues(opts: {
  orgId: string;
  ideaId: string;
  projectId: string;
  actorId: string;
  values: Record<string, FieldValue>;
  enforceRequired?: boolean;
}): Promise<WriteValuesResult> {
  const { orgId, ideaId, projectId, actorId, values, enforceRequired } = opts;
  // Values are written non-transactionally AFTER the idea row is committed
  // (mirrors writeIssueValues) so reads for the Score recompute see the writes.
  const client = db;

  const fields = await getActiveFieldsForProject(orgId, projectId);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const scoreField = fields.find((f) => f.key === SCORE_FIELD_KEY);

  // Validate every incoming value except the computed Score (silently dropped).
  const errors: string[] = [];
  const normalized = new Map<string, FieldValue>();
  for (const [fieldId, raw] of Object.entries(values)) {
    const field = byId.get(fieldId);
    if (!field) continue;
    if (field.key === SCORE_FIELD_KEY) continue; // read-only, computed
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
    const existing = await getValuesForIdea(orgId, ideaId);
    for (const field of fields) {
      if (!field.isRequired || field.key === SCORE_FIELD_KEY) continue;
      const provided = normalized.has(field.id) ? normalized.get(field.id) : existing[field.id];
      const blank =
        provided === null || provided === undefined || provided === "" ||
        (Array.isArray(provided) && provided.length === 0);
      if (blank) errors.push(`${field.name} is required.`);
    }
  }

  if (errors.length) return { ok: false, errors };

  for (const [fieldId, value] of normalized.entries()) {
    const field = byId.get(fieldId)!;
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      await client.qtIdeaFieldValue.deleteMany({ where: { orgId, ideaId, fieldId } });
      continue;
    }
    const cols = fieldConfig(field.type).toColumns(value);
    const valueJson = cols.valueJson as Prisma.InputJsonValue | undefined;
    await client.qtIdeaFieldValue.upsert({
      where: { ideaId_fieldId: { ideaId, fieldId } },
      create: { orgId, ideaId, fieldId, ...cols, valueJson, createdBy: actorId, updatedBy: actorId },
      update: { ...cols, valueJson, updatedBy: actorId },
    });
  }

  if (scoreField) await recomputeScore({ orgId, ideaId, projectId, actorId });
  return { ok: true };
}

/** Recompute + persist the Score field value for one idea. */
export async function recomputeScore(opts: {
  orgId: string;
  ideaId: string;
  projectId: string;
  actorId: string;
}): Promise<number | null> {
  const { orgId, ideaId, projectId, actorId } = opts;
  const client = db;

  const fields = await getActiveFieldsForProject(orgId, projectId);
  const scoreField = fields.find((f) => f.key === SCORE_FIELD_KEY);
  if (!scoreField) return null;
  const keyById = new Map(fields.map((f) => [f.id, f.key]));

  const current = await getValuesForIdea(orgId, ideaId);
  const byKey: Record<string, FieldValue> = {};
  for (const [fieldId, value] of Object.entries(current)) {
    const key = keyById.get(fieldId);
    if (key) byKey[key] = value;
  }

  const score = computeScore({
    impact: toNumber(byKey[DISCOVERY_FIELD_KEYS.impact] ?? null),
    confidence: toNumber(byKey[DISCOVERY_FIELD_KEYS.confidence] ?? null),
    reach: toNumber(byKey[DISCOVERY_FIELD_KEYS.reach] ?? null),
    effort: toNumber(byKey[DISCOVERY_FIELD_KEYS.effort] ?? null),
  });

  if (score === null) {
    await client.qtIdeaFieldValue.deleteMany({ where: { orgId, ideaId, fieldId: scoreField.id } });
    return null;
  }
  await client.qtIdeaFieldValue.upsert({
    where: { ideaId_fieldId: { ideaId, fieldId: scoreField.id } },
    create: { orgId, ideaId, fieldId: scoreField.id, valueNumber: score, createdBy: actorId, updatedBy: actorId },
    update: { valueNumber: score, updatedBy: actorId },
  });
  return score;
}

// Mark SCORE_INPUT_KEYS as referenced for callers that gate recompute on input
// changes (kept exported from discoveryDefaults; re-exported here for locality).
export { SCORE_INPUT_KEYS };
