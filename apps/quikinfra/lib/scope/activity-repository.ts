/**
 * Activity Repository — CRUD for the FREE_SCOPE activity tree plus the guarded
 * execution-mode conversion.
 *
 * Every activity operation first asserts the project is actually in FREE_SCOPE
 * mode (and the feature is enabled). Conversion between modes is deliberately
 * hard: it is blocked once execution transactions exist (unless super-admin)
 * and blocked when the target mode's anchor data would be orphaned.
 */

import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/auth/context";
import { recordAudit } from "@/lib/workflow/audit";
import { logger } from "@/lib/observability/logger";
import { ScopeError, isFreeScopeEnabled } from "./free-scope";
import type { ExecutionMode } from "./scope-resolver";

// Any Prisma client (top-level `db` or a transaction client) accepted by the
// helpers below — the full client is structurally assignable to the narrower
// transaction type.
type DbClient = Prisma.TransactionClient;

export interface ActivityRecord {
  id: string;
  projectId: string;
  activityCode: string;
  description: string;
  category: string | null;
  uomId: string | null;
  uomCode: string | null;
  tenderQty: number | null;
  scopeQty: number | null;
  rate: number | null;
  startDate: string | null;
  endDate: string | null;
  parentId: string | null;
  isGroup: boolean;
  depth: number;
  sortOrder: number;
  status: string;
  locked: boolean;
  /** Ancestor breadcrumb. Only set on flattened search results. */
  path?: string;
}

export interface ActivityLeaf extends ActivityRecord {
  /** Breadcrumb of ancestor activity codes, e.g. "A / A.1 / A.1.2". */
  path: string;
}

export interface ListActivitiesOptions {
  /** Case-insensitive match on activityCode / description. Flattens the result. */
  search?: string | null;
  /** Page slice over the DFS-ordered list. Omit for the whole tree. */
  take?: number;
  skip?: number;
}

export interface ListActivitiesResult {
  data: ActivityRecord[];
  total: number;
  /** Baseline lock state, read from the project — not inferred from the page. */
  isLocked: boolean;
}

export interface CreateActivityInput {
  /** Leave blank to auto-generate a BOQ-style dotted WBS path (1, 1.1, 1.2, 2 …). */
  activityCode?: string;
  description: string;
  category?: string | null;
  uomId?: string | null;
  tenderQty?: number | null;
  scopeQty?: number | null;
  rate?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  parentId?: string | null;
  isGroup?: boolean;
  sortOrder?: number;
}

export interface UpdateActivityInput {
  activityCode?: string;
  description?: string;
  category?: string | null;
  uomId?: string | null;
  tenderQty?: number | null;
  scopeQty?: number | null;
  rate?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  parentId?: string | null;
  isGroup?: boolean;
  sortOrder?: number;
  status?: string;
}

type ActivityRow = {
  id: string;
  projectId: string;
  activityCode: string;
  description: string;
  category: string | null;
  uomId: string | null;
  tenderQty: Prisma.Decimal | null;
  scopeQty: Prisma.Decimal | null;
  rate: Prisma.Decimal | null;
  startDate: Date | null;
  endDate: Date | null;
  parentId: string | null;
  isGroup: boolean;
  depth: number;
  sortOrder: number;
  status: string;
  locked: boolean;
};

function toNum(d: Prisma.Decimal | null): number | null {
  return d === null ? null : Number(d.toString());
}

/**
 * Sibling order: explicit `sortOrder` first, then the activity code compared
 * naturally. `sortOrder` is 0 on every row until something reorders the tree,
 * so the code is what actually decides — and it must compare numerically
 * (`numeric: true`), otherwise "10" sorts before "2" and "1.10" before "1.9".
 */
function bySortThenCode(
  a: { sortOrder: number; activityCode: string },
  b: { sortOrder: number; activityCode: string }
): number {
  return (
    a.sortOrder - b.sortOrder ||
    a.activityCode.localeCompare(b.activityCode, undefined, { numeric: true })
  );
}

/** Resolve uomId → readable UOM code for a set of rows (single query). */
async function uomCodeMap(
  orgId: string,
  rows: Array<{ uomId: string | null }>
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.uomId).filter(Boolean) as string[])];
  if (!ids.length) return new Map();
  const uoms = await db.cnUOM.findMany({
    where: { orgId, id: { in: ids } },
    select: { id: true, code: true },
  });
  return new Map(uoms.map((u) => [u.id, u.code]));
}

function toActivityRecord(row: ActivityRow, uomCode: string | null = null): ActivityRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    activityCode: row.activityCode,
    description: row.description,
    category: row.category,
    uomId: row.uomId,
    uomCode,
    tenderQty: toNum(row.tenderQty),
    scopeQty: toNum(row.scopeQty),
    rate: toNum(row.rate),
    startDate: row.startDate ? row.startDate.toISOString().slice(0, 10) : null,
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    parentId: row.parentId,
    isGroup: row.isGroup,
    depth: row.depth,
    sortOrder: row.sortOrder,
    status: row.status,
    locked: row.locked,
  };
}

/**
 * Guard run at the start of every activity operation: the feature must be
 * enabled AND the project must be in FREE_SCOPE mode. Returns the project row.
 */
export async function assertFreeScopeProject(orgId: string, projectId: string) {
  if (!isFreeScopeEnabled()) {
    throw new ScopeError("FREE_SCOPE_DISABLED", "Free-Scope mode is disabled", 400);
  }
  const project = await db.cnProject.findFirst({
    where: { id: projectId, orgId },
    select: { id: true, executionMode: true, freeScopeLocked: true },
  });
  if (!project) {
    throw new ScopeError("PROJECT_NOT_FOUND", `Project ${projectId} not found`, 404);
  }
  if (project.executionMode !== "FREE_SCOPE") {
    throw new ScopeError(
      "NOT_FREE_SCOPE",
      `Project ${projectId} is not in FREE_SCOPE mode`,
      400
    );
  }
  return project;
}

async function resolveDepth(
  client: DbClient,
  orgId: string,
  projectId: string,
  parentId: string | null | undefined
): Promise<number> {
  if (!parentId) return 0;
  const parent = await client.cnActivityItem.findFirst({
    where: { id: parentId, orgId, projectId },
    select: { depth: true, isGroup: true },
  });
  if (!parent) {
    throw new ScopeError(
      "PARENT_NOT_FOUND",
      `Parent activity ${parentId} not found in project`,
      400
    );
  }
  if (!parent.isGroup) {
    throw new ScopeError(
      "PARENT_NOT_FOLDER",
      `Parent ${parentId} is a line item — only folders can contain items`,
      400
    );
  }
  return parent.depth + 1;
}

/** All descendant ids of `rootId` (its whole subtree), for cycle/child guards. */
async function descendantIds(
  client: DbClient,
  orgId: string,
  projectId: string,
  rootId: string
): Promise<Set<string>> {
  const all = await client.cnActivityItem.findMany({
    where: { orgId, projectId },
    select: { id: true, parentId: true },
  });
  const childrenBy = new Map<string, string[]>();
  for (const a of all) {
    if (a.parentId) {
      const arr = childrenBy.get(a.parentId) ?? [];
      arr.push(a.id);
      childrenBy.set(a.parentId, arr);
    }
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const c of childrenBy.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}

/**
 * Returns the caller-supplied code (trimmed) or, when blank, the next
 * BOQ-style dotted WBS path. A node's code is its parent's code plus a
 * 1-based position segment among its siblings; folders and leaves share
 * one sequence per parent, exactly like an imported BOQ:
 *   top-level      → 1, 2, 3 …
 *   children of 1  → 1.1, 1.2 …
 *   children of 1.2→ 1.2.1 …
 * Slots are max-based per parent (soft-deleted siblings keep their number,
 * so codes are never reused). Reparenting keeps a node's code stable.
 *
 * The sibling max alone is not enough: uniqueness is enforced project-wide
 * (`@@unique([projectId, activityCode])`) while the max is per parent, so a
 * code that was reparented out of this slot — or minted under a parent with a
 * blank code — can already own the candidate. The candidate is therefore
 * advanced past every code already taken under the same prefix.
 */
async function resolveActivityCode(
  client: DbClient,
  orgId: string,
  projectId: string,
  input: CreateActivityInput
): Promise<string> {
  const provided = input.activityCode?.trim();
  if (provided) return provided;

  let parentPrefix = "";
  if (input.parentId) {
    const parent = await client.cnActivityItem.findFirst({
      where: { id: input.parentId, orgId, projectId },
      select: { activityCode: true },
    });
    const parentCode = parent?.activityCode?.trim();
    if (parentCode) parentPrefix = `${parentCode}.`;
  }

  const siblings = await client.cnActivityItem.findMany({
    where: { orgId, projectId, parentId: input.parentId ?? null },
    select: { activityCode: true },
  });
  let max = 0;
  for (const s of siblings) {
    const last = s.activityCode.split(".").pop() ?? "";
    const n = parseInt(last, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }

  const taken = new Set(
    (
      await client.cnActivityItem.findMany({
        where: { orgId, projectId, activityCode: { startsWith: parentPrefix } },
        select: { activityCode: true },
      })
    ).map((r) => r.activityCode)
  );
  let next = max + 1;
  while (taken.has(`${parentPrefix}${next}`)) next++;
  return `${parentPrefix}${next}`;
}

function buildCreateData(
  ctx: TenantContext,
  projectId: string,
  input: CreateActivityInput,
  depth: number
): Prisma.CnActivityItemUncheckedCreateInput {
  return {
    orgId: ctx.orgId,
    projectId,
    activityCode: (input.activityCode ?? "").trim(),
    description: input.description,
    category: input.category ?? null,
    uomId: input.uomId ?? null,
    tenderQty: input.tenderQty ?? null,
    scopeQty: input.scopeQty ?? 0,
    rate: input.rate ?? null,
    startDate: input.startDate ? new Date(input.startDate) : null,
    endDate: input.endDate ? new Date(input.endDate) : null,
    parentId: input.parentId ?? null,
    isGroup: input.isGroup ?? false,
    depth,
    sortOrder: input.sortOrder ?? 0,
    status: "active",
    locked: false,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  };
}

/**
 * Turns the project-wide `(projectId, activityCode)` unique violation into a
 * readable 409 — otherwise the route's catch-all reports a bare 500.
 */
function rethrowCodeConflict(e: unknown, activityCode: string): never {
  if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
    throw new ScopeError(
      "ACTIVITY_CODE_EXISTS",
      `Activity code "${activityCode}" is already used in this project`,
      409,
      { activityCode }
    );
  }
  throw e;
}

export async function createActivity(
  ctx: TenantContext,
  projectId: string,
  input: CreateActivityInput
): Promise<ActivityRecord> {
  await assertFreeScopeProject(ctx.orgId, projectId);
  const depth = await resolveDepth(db, ctx.orgId, projectId, input.parentId);
  const activityCode = await resolveActivityCode(db, ctx.orgId, projectId, input);
  try {
    const row = await db.cnActivityItem.create({
      data: buildCreateData(ctx, projectId, { ...input, activityCode }, depth),
    });
    return toActivityRecord(row);
  } catch (e: unknown) {
    rethrowCodeConflict(e, activityCode);
  }
}

/**
 * Bulk create in one transaction. `parentId` may reference rows created earlier
 * in the same list (pass parents before their children).
 */
export async function createActivities(
  ctx: TenantContext,
  projectId: string,
  inputs: CreateActivityInput[]
): Promise<ActivityRecord[]> {
  await assertFreeScopeProject(ctx.orgId, projectId);
  return db.$transaction(async (tx) => {
    const out: ActivityRecord[] = [];
    for (const input of inputs) {
      const depth = await resolveDepth(tx, ctx.orgId, projectId, input.parentId);
      const activityCode = await resolveActivityCode(tx, ctx.orgId, projectId, input);
      try {
        const row = await tx.cnActivityItem.create({
          data: buildCreateData(ctx, projectId, { ...input, activityCode }, depth),
        });
        out.push(toActivityRecord(row));
      } catch (e: unknown) {
        rethrowCodeConflict(e, activityCode);
      }
    }
    return out;
  });
}

export async function updateActivity(
  ctx: TenantContext,
  projectId: string,
  id: string,
  patch: UpdateActivityInput
): Promise<ActivityRecord> {
  await assertFreeScopeProject(ctx.orgId, projectId);
  const existing = await db.cnActivityItem.findFirst({
    where: { id, orgId: ctx.orgId, projectId },
    select: { id: true },
  });
  if (!existing) {
    throw new ScopeError("ACTIVITY_NOT_FOUND", `Activity ${id} not found in project`, 404);
  }

  const data: Prisma.CnActivityItemUncheckedUpdateInput = { updatedBy: ctx.userId };
  if (patch.activityCode !== undefined) data.activityCode = patch.activityCode.trim();
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.category !== undefined) data.category = patch.category;
  if (patch.uomId !== undefined) data.uomId = patch.uomId;
  if (patch.tenderQty !== undefined) data.tenderQty = patch.tenderQty;
  if (patch.scopeQty !== undefined) data.scopeQty = patch.scopeQty ?? 0;
  if (patch.rate !== undefined) data.rate = patch.rate;
  if (patch.startDate !== undefined) data.startDate = patch.startDate ? new Date(patch.startDate) : null;
  if (patch.endDate !== undefined) data.endDate = patch.endDate ? new Date(patch.endDate) : null;
  if (patch.isGroup !== undefined) data.isGroup = patch.isGroup;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.parentId !== undefined) {
    if (patch.parentId) {
      if (patch.parentId === id) {
        throw new ScopeError("PARENT_CYCLE", "An item can't be its own parent.", 400);
      }
      const desc = await descendantIds(db, ctx.orgId, projectId, id);
      if (desc.has(patch.parentId)) {
        throw new ScopeError(
          "PARENT_CYCLE",
          "Can't move a folder inside one of its own descendants.",
          400
        );
      }
    }
    data.parentId = patch.parentId;
    // Best-effort stored depth; the UI recomputes display depth from the tree.
    data.depth = await resolveDepth(db, ctx.orgId, projectId, patch.parentId);
  }

  try {
    const row = await db.cnActivityItem.update({ where: { id }, data });
    return toActivityRecord(row);
  } catch (e: unknown) {
    rethrowCodeConflict(e, String(data.activityCode ?? ""));
  }
}

/**
 * Delete an activity. Blocked if it's locked or still has children — callers
 * must unlock / clear the subtree first.
 */
export async function deleteActivity(
  ctx: TenantContext,
  projectId: string,
  id: string
): Promise<void> {
  await assertFreeScopeProject(ctx.orgId, projectId);
  const existing = await db.cnActivityItem.findFirst({
    where: { id, orgId: ctx.orgId, projectId },
    select: { id: true, locked: true },
  });
  if (!existing) {
    throw new ScopeError("ACTIVITY_NOT_FOUND", `Activity ${id} not found in project`, 404);
  }
  if (existing.locked) {
    throw new ScopeError(
      "ACTIVITY_LOCKED",
      "This activity is locked — unlock the baseline before deleting.",
      409
    );
  }

  // Soft delete (status = "inactive"), cascading to the whole subtree so a
  // folder and everything inside it are removed together. Mirrors the masters
  // soft-delete convention; ledgers keep referencing the id for history.
  const desc = await descendantIds(db, ctx.orgId, projectId, id);
  const ids = [id, ...desc];
  await db.$transaction(async (tx) => {
    await tx.cnActivityItem.updateMany({
      where: { id: { in: ids }, orgId: ctx.orgId, projectId },
      data: { status: "inactive", updatedBy: ctx.userId },
    });
    await recordAudit(tx, ctx, {
      entityType: "cn_activity_item",
      entityId: id,
      action: "delete",
      changes: { softDeleted: ids.length },
    });
  });
  logger.info({
    msg: "activity_soft_deleted",
    projectId,
    activityId: id,
    count: ids.length,
    byUserId: ctx.userId,
  });
}

/**
 * Activity tree for a project, one page at a time.
 *
 * Rows are ordered depth-first (parent immediately followed by its subtree)
 * rather than by stored depth, so a `take`/`skip` slice is always a set of
 * whole top-of-page subtrees — the client can render it as a tree without
 * holding an orphaned child whose parent landed on an earlier page. Mirrors
 * the BOQ tree read, which slices the same way.
 *
 * `search` changes the shape deliberately: matches are scattered across the
 * hierarchy, so the result is FLAT and each row carries a `path` breadcrumb.
 * A tree slice would silently drop any match whose ancestors didn't match.
 */
export async function listActivities(
  ctx: TenantContext,
  projectId: string,
  opts: ListActivitiesOptions = {}
): Promise<ListActivitiesResult> {
  const project = await assertFreeScopeProject(ctx.orgId, projectId);

  // The whole project is loaded regardless of the page because both the DFS
  // order and the search breadcrumbs need every ancestor. The slice below is
  // what keeps the response — and the client render — bounded.
  const rows = await db.cnActivityItem.findMany({
    where: { orgId: ctx.orgId, projectId, status: { not: "inactive" } },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
  });
  const codes = await uomCodeMap(ctx.orgId, rows);
  const record = (r: (typeof rows)[number]) =>
    toActivityRecord(r, r.uomId ? codes.get(r.uomId) ?? null : null);

  const childrenBy = new Map<string, typeof rows>();
  const roots: typeof rows = [];
  for (const r of rows) {
    if (r.parentId) {
      const arr = childrenBy.get(r.parentId) ?? [];
      arr.push(r);
      childrenBy.set(r.parentId, arr);
    } else {
      roots.push(r);
    }
  }
  roots.sort(bySortThenCode);
  childrenBy.forEach((a) => a.sort(bySortThenCode));

  const ordered: typeof rows = [];
  const walk = (n: (typeof rows)[number]) => {
    ordered.push(n);
    for (const c of childrenBy.get(n.id) ?? []) walk(c);
  };
  roots.forEach(walk);
  // A row whose parent was soft-deleted is unreachable from any root; append
  // it so the page never silently hides live activities.
  if (ordered.length < rows.length) {
    const seen = new Set(ordered.map((r) => r.id));
    for (const r of rows) if (!seen.has(r.id)) ordered.push(r);
  }

  const term = opts.search?.trim().toLowerCase() ?? "";
  let selected: ActivityRecord[];
  if (term) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const pathOf = (r: (typeof rows)[number]): string => {
      const parts: string[] = [];
      let cursor = r.parentId ? byId.get(r.parentId) : undefined;
      let guard = 0;
      while (cursor && guard++ < 50) {
        parts.unshift(cursor.activityCode);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return parts.join(" / ");
    };
    selected = ordered
      .filter(
        (r) =>
          r.activityCode.toLowerCase().includes(term) ||
          r.description.toLowerCase().includes(term)
      )
      .map((r) => ({ ...record(r), path: pathOf(r) }));
  } else {
    selected = ordered.map(record);
  }

  const total = selected.length;
  const data =
    opts.take === undefined
      ? selected
      : selected.slice(opts.skip ?? 0, (opts.skip ?? 0) + opts.take);

  return { data, total, isLocked: project.freeScopeLocked === true };
}

/**
 * Every folder in the project with its breadcrumb `path`, unpaginated.
 *
 * The "Parent folder" pickers must offer all folders regardless of which page
 * of the tree is loaded, and folders are a small fraction of a scope, so this
 * stays a full read rather than a page.
 */
export async function listActivityFolders(
  ctx: TenantContext,
  projectId: string
): Promise<ActivityLeaf[]> {
  await assertFreeScopeProject(ctx.orgId, projectId);
  const rows = await db.cnActivityItem.findMany({
    where: { orgId: ctx.orgId, projectId, status: { not: "inactive" } },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const codes = await uomCodeMap(ctx.orgId, rows);

  return rows
    .filter((r) => r.isGroup)
    .sort(bySortThenCode)
    .map((folder) => {
      const parts: string[] = [];
      let cursor: (typeof rows)[number] | undefined = folder;
      let guard = 0;
      while (cursor && guard++ < 50) {
        parts.unshift(cursor.activityCode);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return {
        ...toActivityRecord(folder, folder.uomId ? codes.get(folder.uomId) ?? null : null),
        path: parts.join(" / "),
      };
    });
}

/** Active leaf activities with a breadcrumb `path` — feeds the scope pickers. */
export async function listLeafActivities(
  ctx: TenantContext,
  projectId: string
): Promise<ActivityLeaf[]> {
  await assertFreeScopeProject(ctx.orgId, projectId);
  const rows = await db.cnActivityItem.findMany({
    where: { orgId: ctx.orgId, projectId, status: "active" },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const codes = await uomCodeMap(ctx.orgId, rows);

  return rows
    .filter((r) => !r.isGroup)
    .sort(bySortThenCode)
    .map((leaf) => {
      const parts: string[] = [];
      let cursor = leaf.parentId ? byId.get(leaf.parentId) : undefined;
      let guard = 0;
      while (cursor && guard++ < 50) {
        parts.unshift(cursor.activityCode);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return {
        ...toActivityRecord(leaf, leaf.uomId ? codes.get(leaf.uomId) ?? null : null),
        path: parts.join(" / "),
      };
    });
}

/**
 * Guarded execution-mode conversion. Error ladder:
 *   1. invalid mode                         → VALIDATION (400)
 *   2. same as current                      → no-op
 *   3. has WO / progress / billing txns     → MODE_IMMUTABLE_WITH_TXNS (409, unless super-admin)
 *   4. → FREE_SCOPE with priced BOQ present → CONVERSION_BLOCKED (409)
 *   5. → BOQ with activities present        → CONVERSION_BLOCKED (409, unless super-admin)
 * On success: update + audit row + structured log.
 */
export async function setExecutionMode(
  ctx: TenantContext,
  projectId: string,
  mode: ExecutionMode,
  isSuperAdmin: boolean
): Promise<void> {
  if (mode !== "BOQ" && mode !== "FREE_SCOPE") {
    throw new ScopeError("VALIDATION", `Invalid execution mode "${mode}"`, 400);
  }

  const project = await db.cnProject.findFirst({
    where: { id: projectId, orgId: ctx.orgId },
    select: { id: true, executionMode: true },
  });
  if (!project) {
    throw new ScopeError("PROJECT_NOT_FOUND", `Project ${projectId} not found`, 404);
  }

  const current: ExecutionMode =
    project.executionMode === "FREE_SCOPE" ? "FREE_SCOPE" : "BOQ";
  if (current === mode) return; // no-op

  const [woCount, progressCount, billingCount] = await Promise.all([
    db.cnWorkOrder.count({ where: { orgId: ctx.orgId, projectId } }),
    db.cnBOQProgressLedger.count({ where: { orgId: ctx.orgId, projectId } }),
    db.cnBOQBillingLedger.count({ where: { orgId: ctx.orgId, projectId } }),
  ]);
  const hasTxns = woCount + progressCount + billingCount > 0;
  if (hasTxns && !isSuperAdmin) {
    throw new ScopeError(
      "MODE_IMMUTABLE_WITH_TXNS",
      `Cannot change execution mode: project has execution transactions ` +
        `(${woCount} work orders, ${progressCount} progress, ${billingCount} billing). ` +
        `Requires super-admin.`,
      409,
      { woCount, progressCount, billingCount }
    );
  }

  if (mode === "FREE_SCOPE") {
    const pricedBoq = await db.cnBOQItemV2.count({
      where: {
        orgId: ctx.orgId,
        projectId,
        isGroup: false,
        deletedAt: null,
        rate: { not: null },
      },
    });
    if (pricedBoq > 0) {
      throw new ScopeError(
        "CONVERSION_BLOCKED",
        `Cannot convert to FREE_SCOPE: ${pricedBoq} priced BOQ item(s) exist.`,
        409,
        { pricedBoq }
      );
    }
  } else {
    const activityCount = await db.cnActivityItem.count({
      where: { orgId: ctx.orgId, projectId },
    });
    if (activityCount > 0 && !isSuperAdmin) {
      throw new ScopeError(
        "CONVERSION_BLOCKED",
        `Cannot convert to BOQ: ${activityCount} activity item(s) exist. Requires super-admin.`,
        409,
        { activityCount }
      );
    }
  }

  await db.$transaction(async (tx) => {
    await tx.cnProject.update({
      where: { id: projectId },
      data: { executionMode: mode, updatedBy: ctx.userId },
    });
    await recordAudit(tx, ctx, {
      entityType: "cn_project",
      entityId: projectId,
      action: "execution_mode_change",
      changes: { from: current, to: mode, bySuperAdmin: isSuperAdmin },
    });
  });

  logger.info({
    msg: "execution_mode_changed",
    projectId,
    fromMode: current,
    toMode: mode,
    byUserId: ctx.userId,
  });
}

/** Baseline lock/unlock all activities and set CnProject.freeScopeLocked. */
export async function setActivitiesLocked(
  ctx: TenantContext,
  projectId: string,
  locked: boolean
): Promise<void> {
  await assertFreeScopeProject(ctx.orgId, projectId);

  await db.$transaction(async (tx) => {
    await tx.cnActivityItem.updateMany({
      where: { orgId: ctx.orgId, projectId },
      data: { locked, updatedBy: ctx.userId },
    });
    await tx.cnProject.update({
      where: { id: projectId },
      data: { freeScopeLocked: locked, updatedBy: ctx.userId },
    });
    await recordAudit(tx, ctx, {
      entityType: "cn_project",
      entityId: projectId,
      action: locked ? "activities_locked" : "activities_unlocked",
      changes: { locked },
    });
  });

  logger.info({
    msg: locked ? "activities_locked" : "activities_unlocked",
    projectId,
    byUserId: ctx.userId,
  });
}
