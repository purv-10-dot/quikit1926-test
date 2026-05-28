/**
 * Purchase Requisition repository — Postgres-backed via Prisma.
 *
 * Routes call these helpers instead of `demo-store`. Masters (projects,
 * items, uoms, work categories, locations) still live in demo-store; the
 * repository denormalises them at read time so the response shape matches
 * what the frontend already expects.
 *
 * Schema-drift resilience: if a field exists in `schema.prisma` but the
 * generated Prisma client (client-side "Unknown argument") or the
 * Postgres DB (P2022 "column does not exist") doesn't know about it,
 * `withSchemaDriftRetry` strips the offending field and retries so the
 * app keeps working until `npx prisma generate` / the ALTER TABLE runs.
 */

import { db } from "@/lib/db/prisma";

// ─── Types ──────────────────────────────────────────────────────────

export interface PRLineInput {
  itemId: string;
  quantity: string | number;
  uomId: string;
  estimatedRate?: string | number;
  estimatedAmount?: string | number;
  specification?: string;
  priority?: string;
  currentStock?: string | number;
  stockCheckStatus?: string;
  remarks?: string;
}

export interface CreatePRInput {
  orgId: string;
  prNumber: string;
  projectId: string;
  requestedById: string;
  requestDate: Date;
  requiredDate?: Date | null;
  purpose?: string | null;
  isUrgent?: boolean;
  urgencyJustification?: string | null;
  workCategoryId?: string | null;
  deliveryLocationId?: string | null;
  estimatedTotal?: number | null;
  stockCheckSummary?: string | null;
  status?: string;
  createdBy: string;
  lines: PRLineInput[];
}

export interface UpdatePRInput {
  prNumber?: string;
  requiredDate?: Date | null;
  purpose?: string | null;
  isUrgent?: boolean;
  urgencyJustification?: string | null;
  workCategoryId?: string | null;
  deliveryLocationId?: string | null;
  status?: string;
  approvalId?: string | null;
  updatedBy: string;
}

export interface ListPRsOptions {
  orgId: string;
  projectIds?: string[] | null;
  status?: string;
  projectId?: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

// ─── Schema-drift strip-and-retry ───────────────────────────────────

const STRIPPABLE_PR_FIELDS = new Set([
  "isUrgent", "urgencyJustification", "workCategoryId",
  "deliveryLocationId", "estimatedTotal", "stockCheckSummary",
]);
const STRIPPABLE_LINE_FIELDS = new Set(["priority", "stockCheckStatus"]);
const loggedMissingFields = new Set<string>();

function extractUnknownArgument(message: string): string | null {
  const m = message.match(/Unknown argument `([^`]+)`/);
  return m?.[1] ?? null;
}
function warnOnceMissing(field: string) {
  if (loggedMissingFields.has(field)) return;
  loggedMissingFields.add(field);
  console.warn(
    `[pr-repository] Prisma field \`${field}\` missing — run \`npx prisma generate\` and the matching ALTER TABLE. Saving other fields only.`,
  );
}
function stripFieldDeep(obj: any, field: string): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((x) => stripFieldDeep(x, field));
  // Only recurse into PLAIN objects. Dates, Decimals, Buffers and every
  // other class instance must pass through untouched — otherwise
  // `Object.entries(new Date())` returns [] and we'd silently replace
  // a real value with `{}`.
  if (typeof obj === "object" && Object.getPrototypeOf(obj) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === field) continue;
      out[k] = stripFieldDeep(v, field);
    }
    return out;
  }
  return obj;
}
async function withSchemaDriftRetry<T>(
  buildPayload: () => Record<string, unknown>,
  run: (payload: any) => Promise<T>,
): Promise<T> {
  let payload = buildPayload();
  for (let i = 0; i < 10; i++) {
    try {
      return await run(payload);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      let bad: string | null = null;
      if (msg.includes("Unknown argument")) bad = extractUnknownArgument(msg);
      else if (err?.code === "P2022") bad = String(err?.meta?.column ?? "") || null;
      if (!bad) throw err;
      // P2022 returns `table.column`; strip the prefix so the
      // STRIPPABLE_* sets (bare field names) can match.
      const bareBad = bad.includes(".") ? bad.split(".").pop()! : bad;
      if (!STRIPPABLE_PR_FIELDS.has(bareBad) && !STRIPPABLE_LINE_FIELDS.has(bareBad)) throw err;
      warnOnceMissing(bareBad);
      payload = stripFieldDeep(payload, bareBad);
    }
  }
  return await run(payload);
}

// ─── Shape helper ───────────────────────────────────────────────────

/**
 * Batch-fetch items + UOMs from Prisma for the given PR rows and
 * return lookup maps. After the Items master migration, new items
 * live in Prisma only with cuid ids — demo-store's resolveItem can't
 * find them, so enrichPR needs this Prisma-first pathway.
 */
async function loadPrLineLookups(rows: any[], orgId: string): Promise<{
  itemById: Map<string, any>;
  uomById: Map<string, any>;
  projectById: Map<string, any>;
  workCategoryById: Map<string, any>;
  locationById: Map<string, any>;
}> {
  const itemIds = new Set<string>();
  const uomIds = new Set<string>();
  const projectIds = new Set<string>();
  const workCategoryIds = new Set<string>();
  const locationIds = new Set<string>();
  for (const r of rows) {
    if (r.projectId) projectIds.add(r.projectId);
    if (r.workCategoryId) workCategoryIds.add(r.workCategoryId);
    if (r.deliveryLocationId) locationIds.add(r.deliveryLocationId);
    for (const l of r.lines ?? []) {
      if (l.itemId) itemIds.add(l.itemId);
      if (l.uomId) uomIds.add(l.uomId);
    }
  }
  const [items, uoms, projects, workCategories, locations] = await Promise.all([
    itemIds.size
      ? (db as any).cnItem.findMany({
          where: { orgId, id: { in: Array.from(itemIds) } },
          select: { id: true, code: true, name: true, standardRate: true },
        })
      : Promise.resolve([]),
    uomIds.size
      ? (db as any).cnUOM.findMany({
          where: { orgId, id: { in: Array.from(uomIds) } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    // Projects live in Postgres now; demo-store's resolveProject misses
    // every DB-only project, leaving projectName/projectCode blank in
    // the PR list. Batch-fetch them here so enrichPR can join.
    projectIds.size
      ? (db as any).cnProject.findMany({
          where: { orgId, id: { in: Array.from(projectIds) } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    workCategoryIds.size
      ? (db as any).cnWorkCategory.findMany({
          where: { orgId, id: { in: Array.from(workCategoryIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    locationIds.size
      ? (db as any).cnLocation.findMany({
          where: { orgId, id: { in: Array.from(locationIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    itemById: new Map<string, any>(items.map((i: any) => [i.id, i])),
    uomById: new Map<string, any>(uoms.map((u: any) => [u.id, u])),
    projectById: new Map<string, any>(projects.map((p: any) => [p.id, p])),
    workCategoryById: new Map<string, any>(workCategories.map((w: any) => [w.id, w])),
    locationById: new Map<string, any>(locations.map((l: any) => [l.id, l])),
  };
}

function enrichPR(
  row: any,
  itemById: Map<string, any> = new Map(),
  uomById: Map<string, any> = new Map(),
  projectById: Map<string, any> = new Map(),
  workCategoryById: Map<string, any> = new Map(),
  locationById: Map<string, any> = new Map(),
): any {
  const project = row.projectId
    ? projectById.get(row.projectId) ?? null
    : null;
  const workCategory = row.workCategoryId
    ? workCategoryById.get(row.workCategoryId) ?? null
    : null;
  const location = row.deliveryLocationId
    ? locationById.get(row.deliveryLocationId) ?? null
    : null;

  const lines = (row.lines ?? []).map((l: any) => {
    const item = itemById.get(l.itemId) ?? null;
    const uom = uomById.get(l.uomId) ?? null;
    return {
      id: l.id,
      itemId: l.itemId,
      itemName: item?.name ?? "",
      itemCode: item?.code ?? "",
      uomId: l.uomId,
      uomCode: uom?.code ?? "",
      quantity: l.quantity?.toString?.() ?? String(l.quantity ?? ""),
      estimatedRate: l.estimatedRate?.toString?.() ?? "",
      estimatedAmount: l.estimatedAmount?.toString?.() ?? "",
      specification: l.specification ?? "",
      priority: l.priority ?? "MEDIUM",
      availableStock: l.currentStock?.toString?.() ?? "0",
      stockCheckStatus: l.stockCheckStatus ?? "",
      remarks: l.remarks ?? "",
    };
  });

  return {
    id: row.id,
    orgId: row.orgId,
    prNumber: row.prNumber,
    mrNumber: row.prNumber,
    projectId: row.projectId,
    projectName: project?.name ?? "",
    projectCode: project?.code ?? "",
    requestDate: row.requestDate?.toISOString?.().slice(0, 10) ?? "",
    mrDate: row.requestDate?.toISOString?.().slice(0, 10) ?? "",
    requiredDate: row.requiredDate?.toISOString?.().slice(0, 10) ?? "",
    purpose: row.purpose ?? "",
    isUrgent: !!row.isUrgent,
    urgencyJustification: row.urgencyJustification ?? "",
    workCategoryId: row.workCategoryId ?? "",
    workCategoryName: workCategory?.name ?? "",
    deliveryLocationId: row.deliveryLocationId ?? "",
    deliveryLocationName: location?.name ?? "",
    stockCheckSummary: row.stockCheckSummary ?? "",
    estimatedTotal: row.estimatedTotal?.toString?.() ?? "0",
    lineCount: lines.length,
    status: row.status,
    approvalId: row.approvalId ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    lines,
  };
}

// ─── Doc-number generator ───────────────────────────────────────────
//
// Replaces the in-memory counter in purchase-engine.generateDocNumber,
// which resets on every server restart / HMR and then collides with PR
// numbers already persisted in cn_purchase_requisitions (P2002).
//
// Strategy: read the highest existing prNumber matching the prefix for
// this tenant/org/project, extract its numeric suffix, return +1. This
// is still racy under concurrent creates from two tabs — but the caller
// catches P2002 and can retry. A retry wrapper is provided below.

function extractSuffix(prNumber: string): number {
  // Matches the tail "-####" of "PR-<code>-<fy>-####"
  const m = prNumber.match(/-(\d+)$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
}

export async function nextPrNumber(
  orgId: string,
  projectCode: string,
  fy: string = "26",
): Promise<string> {
  const prefix = `PR-${projectCode}-${fy}-`;
  const rows: Array<{ prNumber: string }> = await (db as any).cnPurchaseRequisition.findMany({
    where: {
      orgId,
      prNumber: { startsWith: prefix },
    },
    select: { prNumber: true },
  });
  const maxSeq = rows.reduce((max, r) => {
    const n = extractSuffix(r.prNumber);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

/**
 * Run `task` and, if it fails with a P2002 on the prNumber unique
 * constraint, regenerate the number and retry (up to `maxAttempts` times).
 * Handles the race where two concurrent creates pick the same next number.
 */
export async function withPrNumberRetry<T>(
  generate: () => Promise<string>,
  task: (prNumber: string) => Promise<T>,
  maxAttempts: number = 5,
): Promise<T> {
  let lastErr: any = null;
  for (let i = 0; i < maxAttempts; i++) {
    const prNumber = await generate();
    try {
      return await task(prNumber);
    } catch (err: any) {
      const isPrNumberConflict =
        err?.code === "P2002" &&
        Array.isArray(err?.meta?.target) &&
        err.meta.target.includes("prNumber");
      if (!isPrNumberConflict) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

// ─── Queries ────────────────────────────────────────────────────────

export async function listPRs(opts: ListPRsOptions): Promise<any[]> {
  const { orgId, projectIds, status, projectId, search } = opts;
  const where: Record<string, unknown> = { orgId };
  if (projectIds && projectIds.length > 0) where.projectId = { in: projectIds };
  if (projectId) where.projectId = projectId;
  if (status && status !== "all") where.status = status;

  const rows = await (db as any).cnPurchaseRequisition.findMany({
    where,
    include: { lines: true },
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  const { itemById, uomById, projectById, workCategoryById, locationById } = await loadPrLineLookups(rows, orgId);
  const enriched = rows.map((r: any) => enrichPR(r, itemById, uomById, projectById, workCategoryById, locationById));

  if (!search) return enriched;
  const q = search.toLowerCase();
  return enriched.filter(
    (pr: any) =>
      (pr.prNumber ?? "").toLowerCase().includes(q) ||
      (pr.projectName ?? "").toLowerCase().includes(q) ||
      (pr.purpose ?? "").toLowerCase().includes(q),
  );
}

export async function findPRById(orgId: string, id: string): Promise<any | null> {
  const row = await (db as any).cnPurchaseRequisition.findFirst({
    where: { id, orgId },
    include: { lines: true },
  });
  if (!row) return null;
  const { itemById, uomById, projectById, workCategoryById, locationById } = await loadPrLineLookups([row], orgId);
  return enrichPR(row, itemById, uomById, projectById, workCategoryById, locationById);
}

// ─── Mutations ──────────────────────────────────────────────────────

/**
 * Best-effort project existence probe. Projects live in `cn_projects`;
 * if the id isn't there, we let the PR insert hit its native FK error
 * — that's the right signal to the caller. Kept as a hook point so
 * future "sync project from external system" logic has a place to live
 * without changing call sites.
 */
async function ensureProjectExists(projectId: string, orgId: string, _createdBy: string): Promise<void> {
  await (db as any).cnProject.findFirst({ where: { id: projectId, orgId } }).catch(() => null);
}

export async function createPR(input: CreatePRInput): Promise<any> {
  await ensureProjectExists(input.projectId, input.orgId, input.createdBy);

  const row = await withSchemaDriftRetry(
    () => ({
      orgId: input.orgId,
      prNumber: input.prNumber,
      projectId: input.projectId,
      requestedById: input.requestedById,
      requestDate: input.requestDate,
      requiredDate: input.requiredDate ?? null,
      purpose: input.purpose ?? null,
      isUrgent: input.isUrgent ?? false,
      urgencyJustification: input.urgencyJustification ?? null,
      workCategoryId: input.workCategoryId ?? null,
      deliveryLocationId: input.deliveryLocationId ?? null,
      estimatedTotal: input.estimatedTotal ?? null,
      stockCheckSummary: input.stockCheckSummary ?? null,
      status: input.status ?? "draft",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      lines: {
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: String(l.quantity ?? "0"),
          estimatedRate:
            l.estimatedRate !== undefined && l.estimatedRate !== ""
              ? String(l.estimatedRate)
              : null,
          estimatedAmount:
            l.estimatedAmount !== undefined && l.estimatedAmount !== ""
              ? String(l.estimatedAmount)
              : null,
          specification: l.specification ?? null,
          priority: l.priority ?? null,
          currentStock:
            l.currentStock !== undefined && l.currentStock !== ""
              ? String(l.currentStock)
              : null,
          stockCheckStatus: l.stockCheckStatus ?? null,
          remarks: l.remarks ?? null,
        })),
      },
    }),
    (payload) =>
      (db as any).cnPurchaseRequisition.create({
        data: payload,
        include: { lines: true },
      }),
  );
  const { itemById, uomById, projectById, workCategoryById, locationById } = await loadPrLineLookups([row], input.orgId);
  return enrichPR(row, itemById, uomById, projectById, workCategoryById, locationById);
}

export async function updatePR(
  orgId: string,
  id: string,
  patch: UpdatePRInput,
): Promise<any | null> {
  try {
    await withSchemaDriftRetry(
      () => {
        const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined && k !== "updatedBy") data[k] = v;
        }
        return data;
      },
      (payload) =>
        (db as any).cnPurchaseRequisition.update({
          where: { id },
          data: payload,
        }),
    );
  } catch (err: any) {
    if (err?.code === "P2025") return null;
    throw err;
  }
  return findPRById(orgId, id);
}

export async function deletePR(orgId: string, id: string): Promise<boolean> {
  try {
    await (db as any).cnPurchaseRequisition.deleteMany({
      where: { id, orgId },
    });
    return true;
  } catch {
    return false;
  }
}
