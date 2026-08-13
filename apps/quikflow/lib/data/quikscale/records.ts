/**
 * QuikScale record readers (doc §6.1 — C4 query / read). Projects a module's
 * rows onto its registry field keys, using the `binding.model` Prisma accessor
 * and the `column` on each readable FieldDef. Always org-scoped; honours soft
 * delete. Modules with no backing table (Meeting/Scorecard/Review) return
 * `readable: false` cleanly.
 */
import { db } from "@/lib/db";
import { moduleByKey, readableFields, type ModuleDef } from "@/lib/catalog";
import type { FieldDef } from "@/lib/catalog";
import { listMaster } from "./master";
import { masterTableOf, type MasterTable, type RecordQuery, type RecordResult, type RecordRow } from "../types";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Human label + email for a resolved user id. */
interface UserLabel {
  name: string;
  email: string | null;
}

/** People-type columns (owner/assignee) store a user id → resolve to name/email. */
function peopleFields(mod: ModuleDef): FieldDef[] {
  return readableFields(mod).filter((f) => f.type === "people");
}

/**
 * Batch-load the users referenced by a module's people columns across all rows,
 * so `{{trigger.ownerName}}` / `{{trigger.ownerEmail}}` render a real person
 * instead of the raw id stored in the column. One query regardless of row count.
 */
async function loadUserLabels(
  mod: ModuleDef,
  rows: Record<string, unknown>[],
): Promise<Map<string, UserLabel>> {
  const pf = peopleFields(mod);
  const map = new Map<string, UserLabel>();
  if (pf.length === 0) return map;

  const ids = new Set<string>();
  for (const row of rows) {
    for (const f of pf) {
      const v = row[f.column as string];
      if (typeof v === "string" && v) ids.add(v);
    }
  }
  if (ids.size === 0) return map;

  const users =
    (await db.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    })) ?? [];
  for (const u of users) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || u.id;
    map.set(u.id, { name, email: u.email ?? null });
  }
  return map;
}

/** Reference columns (team/category/quarter/unit) store a master id → resolve to a label. */
function referenceFields(mod: ModuleDef): FieldDef[] {
  return readableFields(mod).filter((f) => f.type === "reference" && !!f.source);
}

/**
 * Resolve a module's reference columns to display labels via the master readers,
 * so `{{trigger.teamName}}` renders "Sales" instead of a team id. Best-effort:
 * a lookup that fails (or a column that already holds a readable code, e.g.
 * quarter="Q2") simply falls back to the raw value in projectRow. One query per
 * distinct master table, and only for tables actually referenced with a value.
 */
async function loadReferenceLabels(
  orgId: string,
  mod: ModuleDef,
  rows: Record<string, unknown>[],
): Promise<Map<MasterTable, Map<string, string>>> {
  const out = new Map<MasterTable, Map<string, string>>();
  const rf = referenceFields(mod);
  if (rf.length === 0) return out;

  const tables = new Set(rf.map((f) => masterTableOf(f.source!)));
  for (const table of tables) {
    const hasValue = rows.some((row) =>
      rf.some((f) => masterTableOf(f.source!) === table && typeof row[f.column as string] === "string" && row[f.column as string]),
    );
    if (!hasValue) continue;
    try {
      const { items } = await listMaster(orgId, table);
      out.set(table, new Map(items.map((i) => [i.id, i.label])));
    } catch {
      // Best-effort enrichment — projectRow falls back to the raw id/value.
    }
  }
  return out;
}

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

function projectRow(
  mod: ModuleDef,
  labelKey: string | null,
  row: Record<string, unknown>,
  userLabels: Map<string, UserLabel>,
  refLabels: Map<MasterTable, Map<string, string>>,
): RecordRow {
  const fields: Record<string, unknown> = {};
  for (const f of readableFields(mod)) {
    const value = row[f.column as string] ?? null;
    fields[f.key] = value;
    // People columns hold a user id — add resolved companions so tokens like
    // {{trigger.ownerName}} / {{trigger.ownerEmail}} render a real person.
    if (f.type === "people") {
      const u = typeof value === "string" ? userLabels.get(value) : undefined;
      fields[`${f.key}Name`] = u?.name ?? null;
      fields[`${f.key}Email`] = u?.email ?? null;
    } else if (f.type === "reference" && f.source) {
      // Reference columns hold a master id — add a resolved <key>Name, falling
      // back to the raw value when it's unresolved or already readable (e.g. "Q2").
      const label = typeof value === "string" ? refLabels.get(masterTableOf(f.source))?.get(value) : undefined;
      fields[`${f.key}Name`] = label ?? (value != null ? String(value) : null);
    }
  }
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

  const [userLabels, refLabels] = await Promise.all([
    loadUserLabels(mod, rows),
    loadReferenceLabels(orgId, mod, rows),
  ]);
  return { items: rows.map((r) => projectRow(mod, labelKey, r, userLabels, refLabels)), total, readable: true };
}

export async function getRecord(orgId: string, moduleKey: string, id: string): Promise<RecordRow | null> {
  const mod = moduleByKey(moduleKey);
  if (!mod || !mod.binding.readable || !mod.binding.model) return null;

  const d = delegate(mod.binding.model);
  const row = await d.findFirst({ where: { ...baseWhere(mod, orgId), id }, select: buildSelect(mod) });
  if (!row) return null;
  const [userLabels, refLabels] = await Promise.all([
    loadUserLabels(mod, [row]),
    loadReferenceLabels(orgId, mod, [row]),
  ]);
  return projectRow(mod, labelFieldKey(mod), row, userLabels, refLabels);
}
