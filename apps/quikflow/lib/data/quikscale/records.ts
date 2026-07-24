/**
 * QuikScale record readers (doc §6.1 — C4 query / read). Projects a module's
 * rows onto its registry field keys, using the `binding.model` Prisma accessor
 * and the `column` on each readable FieldDef. Always org-scoped; honours soft
 * delete. Modules with no backing table (Meeting/Scorecard/Review) return
 * `readable: false` cleanly.
 */
import { db } from "@/lib/db";
import { moduleByKey, readableFields, type ModuleDef } from "@/lib/catalog";
import type { RecordQuery, RecordResult, RecordRow } from "../types";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Minimal structural view of a Prisma model delegate (accessed dynamically). */
interface Delegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  count(args: unknown): Promise<number>;
}

function delegate(model: string): Delegate {
  const d = (db as unknown as Record<string, Delegate | undefined>)[model];
  if (!d) throw new Error(`No Prisma delegate for model "${model}"`);
  return d;
}

/** The field whose value best labels a row (name / title / what, else first text). */
function labelFieldKey(mod: ModuleDef): string | null {
  const preferred = ["name", "title", "what"];
  const byPref = mod.fields.find((f) => f.column && preferred.includes(f.key));
  if (byPref) return byPref.key;
  return mod.fields.find((f) => f.column && f.type === "text")?.key ?? null;
}

/** Prisma `select` for the readable projection (id + every column-backed field). */
function buildSelect(mod: ModuleDef): Record<string, boolean> {
  const select: Record<string, boolean> = { id: true };
  for (const f of readableFields(mod)) select[f.column as string] = true;
  return select;
}

function baseWhere(mod: ModuleDef, orgId: string): Record<string, unknown> {
  const where: Record<string, unknown> = { orgId };
  if (mod.binding.softDelete) where.deletedAt = null;
  return where;
}

function projectRow(mod: ModuleDef, labelKey: string | null, row: Record<string, unknown>): RecordRow {
  const fields: Record<string, unknown> = {};
  for (const f of readableFields(mod)) fields[f.key] = row[f.column as string] ?? null;
  const label = labelKey && fields[labelKey] != null ? String(fields[labelKey]) : String(row.id);
  return { id: String(row.id), label, fields };
}

export async function queryRecords(orgId: string, query: RecordQuery): Promise<RecordResult> {
  const mod = moduleByKey(query.moduleKey);
  if (!mod || !mod.binding.readable || !mod.binding.model) {
    return { items: [], total: 0, readable: false };
  }

  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const labelKey = labelFieldKey(mod);
  const where = baseWhere(mod, orgId);

  if (query.search && labelKey) {
    const col = mod.fields.find((f) => f.key === labelKey)?.column;
    if (col) where[col] = { contains: query.search, mode: "insensitive" };
  }

  const d = delegate(mod.binding.model);
  const [rows, total] = await Promise.all([
    d.findMany({ where, select: buildSelect(mod), take: limit, orderBy: { updatedAt: "desc" } }),
    d.count({ where }),
  ]);

  return { items: rows.map((r) => projectRow(mod, labelKey, r)), total, readable: true };
}

export async function getRecord(orgId: string, moduleKey: string, id: string): Promise<RecordRow | null> {
  const mod = moduleByKey(moduleKey);
  if (!mod || !mod.binding.readable || !mod.binding.model) return null;

  const d = delegate(mod.binding.model);
  const row = await d.findFirst({ where: { ...baseWhere(mod, orgId), id }, select: buildSelect(mod) });
  return row ? projectRow(mod, labelFieldKey(mod), row) : null;
}
