import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/auth/context";

export type WbsStatus = "not_started" | "in_progress" | "completed" | "on_hold";

export interface WbsTaskDTO {
  id: string;
  parentId: string | null;
  wbsCode: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: WbsStatus;
  progress: number;
  predecessors: string[];
}

export class WbsError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function assertProjectAccess(ctx: TenantContext, projectId: string) {
  const project = await (db as any).cnProject.findFirst({
    where: { id: projectId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!project) throw new WbsError("PROJECT_NOT_FOUND", "Project not found", 404);
}

export async function listWbsTasks(ctx: TenantContext, projectId: string): Promise<WbsTaskDTO[]> {
  await assertProjectAccess(ctx, projectId);

  const [tasks, deps] = await Promise.all([
    (db as any).cnWBSTask.findMany({
      where: { orgId: ctx.orgId, projectId },
      orderBy: [{ wbsCode: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        parentId: true,
        wbsCode: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        progress: true,
      },
    }),
    (db as any).cnWBSDependency.findMany({
      where: { orgId: ctx.orgId, projectId },
      select: { fromTaskId: true, toTaskId: true },
    }),
  ]);

  const predMap = new Map<string, string[]>();
  for (const d of deps) {
    const arr = predMap.get(d.toTaskId) ?? [];
    arr.push(d.fromTaskId);
    predMap.set(d.toTaskId, arr);
  }

  return tasks.map((t: any) => ({
    id: t.id,
    parentId: t.parentId ?? null,
    wbsCode: t.wbsCode,
    name: t.name,
    startDate: toISODate(t.startDate),
    endDate: toISODate(t.endDate),
    status: t.status,
    progress: t.progress,
    predecessors: predMap.get(t.id) ?? [],
  }));
}

export interface CreateWbsTaskInput {
  parentId?: string | null;
  wbsCode: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: WbsStatus;
  progress?: number;
  predecessors?: string[];
}

/**
 * Compute the next free WBS code for a parent, from authoritative DB state.
 * Mirrors the client's nextWbsCode() but server-side, so rapid / concurrent
 * adds (or a stale client task list on a slow DB) can't collide on the
 * (orgId, projectId, wbsCode) unique key. Roots get "1", "2", … ; children
 * get "<parentCode>.<n>". Uses max(trailing-segment)+1 so deleting a middle
 * sibling never reproduces an existing code.
 */
async function nextFreeWbsCode(
  orgId: string,
  projectId: string,
  parentId: string | null,
): Promise<string> {
  // The unique key is project-wide (orgId, projectId, wbsCode) — NOT
  // per-parent — so a candidate code must be free across the WHOLE project,
  // not just among same-parent siblings. Pull every code once and probe.
  const all = (await (db as any).cnWBSTask.findMany({
    where: { orgId, projectId },
    select: { wbsCode: true, parentId: true },
  })) as Array<{ wbsCode: string; parentId: string | null }>;
  const taken = new Set(all.map((t) => t.wbsCode));

  // Start from max(trailing-segment)+1 among same-parent siblings so normal
  // sequential numbering is preserved and deleting a middle sibling never
  // reproduces an existing code.
  const trailing = all
    .filter((t) => t.parentId === parentId)
    .map((t) => {
      const code = t.wbsCode ?? "";
      const seg = code.includes(".") ? code.slice(code.lastIndexOf(".") + 1) : code;
      const n = parseInt(seg, 10);
      return Number.isFinite(n) ? n : 0;
    });
  let next = trailing.length === 0 ? 1 : Math.max(...trailing) + 1;

  let prefix = "";
  if (parentId !== null) {
    const parent = (await (db as any).cnWBSTask.findFirst({
      where: { orgId, projectId, id: parentId },
      select: { wbsCode: true },
    })) as { wbsCode: string } | null;
    const pc = parent?.wbsCode ?? "";
    prefix = pc ? `${pc}.` : "";
  }

  // Bump until the full code is free project-wide (covers a duplicate that
  // lives under a different parent or came from legacy / manual data).
  while (taken.has(`${prefix}${next}`)) next += 1;
  return `${prefix}${next}`;
}

/**
 * Finish-to-start dependency rule: a task that depends on one or more
 * predecessors cannot start before the latest predecessor finishes. Throws a
 * 400 VALIDATION error naming the blocking predecessor. No-op when there are
 * no predecessors.
 */
async function assertStartsAfterPredecessors(
  orgId: string,
  projectId: string,
  start: Date,
  predecessorIds: string[],
): Promise<void> {
  if (!predecessorIds.length) return;
  const preds = (await (db as any).cnWBSTask.findMany({
    where: { orgId, projectId, id: { in: predecessorIds } },
    select: { wbsCode: true, name: true, endDate: true },
  })) as Array<{ wbsCode: string; name: string; endDate: Date | null }>;
  // Latest-finishing predecessor is the binding constraint.
  const blocker = preds
    .filter((p) => p.endDate)
    .sort((a, b) => (b.endDate as Date).getTime() - (a.endDate as Date).getTime())[0];
  if (blocker && start.getTime() < (blocker.endDate as Date).getTime()) {
    throw new WbsError(
      "VALIDATION",
      `This task can't start before its predecessor "${blocker.wbsCode} – ${blocker.name}" finishes (ends ${toISODate(blocker.endDate as Date)}).`,
      400,
    );
  }
}

/**
 * Reject a proposed predecessor set that would create a circular dependency
 * (e.g. A → B → A) or a self-dependency. Builds the project's full
 * dependent → [predecessors] graph, overlays the proposed set for this task,
 * then walks the predecessor closure from the task — if it reaches itself a
 * cycle would form. Throws a 400 VALIDATION error. No-op for an empty set.
 */
async function assertNoDependencyCycle(
  orgId: string,
  projectId: string,
  taskId: string,
  predecessorIds: string[],
): Promise<void> {
  if (!predecessorIds.length) return;
  if (predecessorIds.includes(taskId)) {
    throw new WbsError("VALIDATION", "A task can't depend on itself.", 400);
  }
  const deps = (await (db as any).cnWBSDependency.findMany({
    where: { orgId, projectId },
    select: { fromTaskId: true, toTaskId: true },
  })) as Array<{ fromTaskId: string; toTaskId: string }>;
  const preds = new Map<string, string[]>();
  for (const d of deps) {
    const arr = preds.get(d.toTaskId) ?? [];
    arr.push(d.fromTaskId);
    preds.set(d.toTaskId, arr);
  }
  // Overlay the proposed predecessor set for the task being saved.
  preds.set(taskId, [...predecessorIds]);

  const seen = new Set<string>();
  const stack = [...predecessorIds];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === taskId) {
      throw new WbsError(
        "VALIDATION",
        "This dependency would create a circular reference (e.g. A → B → A). Remove the conflicting predecessor.",
        400,
      );
    }
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of preds.get(cur) ?? []) stack.push(p);
  }
}

export async function createWbsTask(
  ctx: TenantContext,
  projectId: string,
  input: CreateWbsTaskInput,
): Promise<WbsTaskDTO> {
  await assertProjectAccess(ctx, projectId);

  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new WbsError("VALIDATION", "Invalid startDate/endDate", 400);
  }
  // End must not precede start (same-day, zero-duration tasks are allowed).
  if (end.getTime() < start.getTime()) {
    throw new WbsError("VALIDATION", "End date can't be earlier than start date.", 400);
  }

  const progress = Math.max(0, Math.min(100, Math.floor(input.progress ?? 0)));
  const status: WbsStatus = (input.status ?? "not_started") as WbsStatus;
  const predecessors = Array.isArray(input.predecessors) ? input.predecessors : [];

  // Finish-to-start dependency rule: reject a task that starts before its
  // latest predecessor finishes.
  await assertStartsAfterPredecessors(ctx.orgId, projectId, start, predecessors);

  // Strip NUL bytes — Postgres rejects them in text/varchar columns
  // ("invalid byte sequence for encoding UTF8: 0x00") and they sneak in
  // from Excel pastes / binary blobs serialised as JSON.
  const NUL = String.fromCharCode(0);
  const stripNul = (s: string | null | undefined) =>
    typeof s === "string" ? s.split(NUL).join("") : s;

  // Build the payload first so we can log which field still carries a NUL
  // byte after sanitisation — that flags whether the bad data is coming
  // from session/context (orgId, userId) vs request input.
  const dataPayload: Record<string, unknown> = {
    orgId: stripNul(ctx.orgId),
    projectId: stripNul(projectId),
    parentId: stripNul(input.parentId) ?? null,
    wbsCode: stripNul(input.wbsCode),
    name: stripNul(input.name),
    startDate: start,
    endDate: end,
    status,
    progress,
    createdBy: stripNul(ctx.userId),
    updatedBy: stripNul(ctx.userId),
  };
  for (const [k, v] of Object.entries(dataPayload)) {
    if (typeof v === "string" && v.includes(NUL)) {
      // eslint-disable-next-line no-console
      console.warn(`[wbs.create] NUL byte still present in field "${k}"`, { value: v });
    }
  }

  // Insert with the client-supplied code first; on a unique-key collision
  // (a stale/duplicate client auto-code, or a concurrent add) recompute the
  // next free code from authoritative DB state and retry. This is what stops
  // rapid / concurrent "Add task" clicks — common on the slow DB where the
  // client's task list lags — from throwing P2002. The composite key
  // (orgId, projectId, wbsCode) is the only unique on this model, so any
  // P2002 here is the duplicate-code case.
  const MAX_ATTEMPTS = 12;
  let created:
    | {
        id: string;
        parentId: string | null;
        wbsCode: string;
        name: string;
        startDate: Date;
        endDate: Date;
        status: WbsStatus;
        progress: number;
      }
    | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      created = await db.$transaction(async (tx) => {
        const task = await (tx as any).cnWBSTask.create({
          data: dataPayload,
          select: {
            id: true,
            parentId: true,
            wbsCode: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
            progress: true,
          },
        });
        if (predecessors.length > 0) {
          await (tx as any).cnWBSDependency.createMany({
            data: predecessors.map((fromTaskId) => ({
              orgId: ctx.orgId,
              projectId,
              fromTaskId,
              toTaskId: task.id,
              createdBy: ctx.userId,
            })),
            skipDuplicates: true,
          });
        }
        return task;
      });
      break; // success
    } catch (err: any) {
      if (err?.code === "P2002") {
        dataPayload.wbsCode = await nextFreeWbsCode(
          ctx.orgId,
          projectId,
          (dataPayload.parentId as string | null) ?? null,
        );
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    throw new WbsError(
      "DUPLICATE_WBS_CODE",
      `Could not assign a unique WBS code for "${input.name}" after several attempts. Please try again.`,
      409,
    );
  }

  return {
    id: created.id,
    parentId: created.parentId ?? null,
    wbsCode: created.wbsCode,
    name: created.name,
    startDate: toISODate(created.startDate),
    endDate: toISODate(created.endDate),
    status: created.status,
    progress: created.progress,
    predecessors,
  };
}

export interface UpdateWbsTaskInput {
  parentId?: string | null;
  wbsCode?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  status?: WbsStatus;
  progress?: number;
  predecessors?: string[];
}

export async function updateWbsTask(
  ctx: TenantContext,
  projectId: string,
  taskId: string,
  patch: UpdateWbsTaskInput,
): Promise<WbsTaskDTO> {
  await assertProjectAccess(ctx, projectId);

  const data: Record<string, unknown> = { updatedBy: ctx.userId };
  if (patch.parentId !== undefined) data.parentId = patch.parentId ?? null;
  if (patch.wbsCode !== undefined) data.wbsCode = patch.wbsCode;
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.progress !== undefined) data.progress = Math.max(0, Math.min(100, Math.floor(patch.progress)));
  if (patch.startDate !== undefined) {
    const d = new Date(patch.startDate);
    if (Number.isNaN(d.getTime())) throw new WbsError("VALIDATION", "Invalid startDate", 400);
    data.startDate = d;
  }
  if (patch.endDate !== undefined) {
    const d = new Date(patch.endDate);
    if (Number.isNaN(d.getTime())) throw new WbsError("VALIDATION", "Invalid endDate", 400);
    data.endDate = d;
  }

  // End must not precede start (same-day allowed). Compare effective values so
  // editing just one of the two dates is still validated against the other.
  if (patch.startDate !== undefined || patch.endDate !== undefined) {
    const cur = (await (db as any).cnWBSTask.findFirst({
      where: { orgId: ctx.orgId, projectId, id: taskId },
      select: { startDate: true, endDate: true },
    })) as { startDate: Date; endDate: Date } | null;
    const effStart =
      patch.startDate !== undefined ? new Date(patch.startDate) : cur?.startDate ?? null;
    const effEnd =
      patch.endDate !== undefined ? new Date(patch.endDate) : cur?.endDate ?? null;
    if (effStart && effEnd && effEnd.getTime() < effStart.getTime()) {
      throw new WbsError("VALIDATION", "End date can't be earlier than start date.", 400);
    }
  }

  const predecessors = patch.predecessors !== undefined ? patch.predecessors : undefined;

  // Structural guard first: reject a predecessor change that would form a
  // circular dependency (A → B → A) before any date validation.
  if (patch.predecessors !== undefined) {
    await assertNoDependencyCycle(ctx.orgId, projectId, taskId, predecessors ?? []);
  }

  // Finish-to-start dependency rule — re-check whenever the start date or the
  // predecessor set changes, using the effective (patched-or-existing) values.
  if (patch.startDate !== undefined || patch.predecessors !== undefined) {
    const current = (await (db as any).cnWBSTask.findFirst({
      where: { orgId: ctx.orgId, projectId, id: taskId },
      select: { startDate: true },
    })) as { startDate: Date } | null;
    const effStart =
      patch.startDate !== undefined ? new Date(patch.startDate) : current?.startDate ?? null;
    const effPredecessors =
      predecessors ??
      (((await (db as any).cnWBSDependency.findMany({
        where: { orgId: ctx.orgId, projectId, toTaskId: taskId },
        select: { fromTaskId: true },
      })) as Array<{ fromTaskId: string }>).map((r) => r.fromTaskId));
    if (effStart) {
      await assertStartsAfterPredecessors(ctx.orgId, projectId, effStart, effPredecessors);
    }
  }

  const updated = await db.$transaction(async (tx) => {
    let task;
    try {
      task = await (tx as any).cnWBSTask.update({
        where: { id: taskId },
        data,
        select: {
          id: true,
          parentId: true,
          wbsCode: true,
          name: true,
          startDate: true,
          endDate: true,
          status: true,
          progress: true,
          orgId: true,
          projectId: true,
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new WbsError(
          "DUPLICATE_WBS_CODE",
          `A task with code "${patch.wbsCode}" already exists in this project. Pick a different code.`,
          409,
        );
      }
      throw err;
    }

    if (task.orgId !== ctx.orgId || task.projectId !== projectId) {
      throw new WbsError("NOT_FOUND", "Task not found", 404);
    }

    if (predecessors !== undefined) {
      await (tx as any).cnWBSDependency.deleteMany({
        where: { orgId: ctx.orgId, projectId, toTaskId: taskId },
      });
      if (predecessors.length > 0) {
        await (tx as any).cnWBSDependency.createMany({
          data: predecessors.map((fromTaskId) => ({
            orgId: ctx.orgId,
            projectId,
            fromTaskId,
            toTaskId: taskId,
            createdBy: ctx.userId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return task;
  });

  // For response, re-load predecessors if caller didn't send them.
  const preds =
    predecessors ??
    (await (db as any).cnWBSDependency.findMany({
      where: { orgId: ctx.orgId, projectId, toTaskId: taskId },
      select: { fromTaskId: true },
    })).map((r: any) => r.fromTaskId);

  return {
    id: updated.id,
    parentId: updated.parentId ?? null,
    wbsCode: updated.wbsCode,
    name: updated.name,
    startDate: toISODate(updated.startDate),
    endDate: toISODate(updated.endDate),
    status: updated.status,
    progress: updated.progress,
    predecessors: preds,
  };
}

export async function deleteWbsTask(ctx: TenantContext, projectId: string, taskId: string) {
  await assertProjectAccess(ctx, projectId);

  // Fetch all tasks once, compute descendants in memory, then delete in a txn.
  const all = await (db as any).cnWBSTask.findMany({
    where: { orgId: ctx.orgId, projectId },
    select: { id: true, parentId: true },
  });

  const byParent = new Map<string, string[]>();
  for (const t of all) {
    if (!t.parentId) continue;
    const arr = byParent.get(t.parentId) ?? [];
    arr.push(t.id);
    byParent.set(t.parentId, arr);
  }

  const toDelete = new Set<string>();
  const stack = [taskId];
  while (stack.length) {
    const id = stack.pop()!;
    if (toDelete.has(id)) continue;
    toDelete.add(id);
    const kids = byParent.get(id) ?? [];
    for (const k of kids) stack.push(k);
  }

  if (!toDelete.has(taskId)) throw new WbsError("NOT_FOUND", "Task not found", 404);
  const ids = Array.from(toDelete);

  // Block deletion when the task (or a descendant being removed with it) is
  // still a predecessor of a SURVIVING task — those dependents would be left
  // dangling. Refuse and name them so the user can act.
  const blockingDeps = (await (db as any).cnWBSDependency.findMany({
    where: {
      orgId: ctx.orgId,
      projectId,
      fromTaskId: { in: ids },
      toTaskId: { notIn: ids },
    },
    select: { toTaskId: true },
  })) as Array<{ toTaskId: string }>;
  if (blockingDeps.length > 0) {
    const dependentIds = Array.from(new Set(blockingDeps.map((d) => d.toTaskId)));
    const dependents = (await (db as any).cnWBSTask.findMany({
      where: { orgId: ctx.orgId, projectId, id: { in: dependentIds } },
      select: { wbsCode: true, name: true },
    })) as Array<{ wbsCode: string; name: string }>;
    const list = dependents
      .sort((a, b) => a.wbsCode.localeCompare(b.wbsCode))
      .map((t) => `${t.wbsCode} – ${t.name}`)
      .join(", ");
    throw new WbsError(
      "TASK_HAS_DEPENDENTS",
      `Can't delete this task — the following task(s) depend on it: ${list}. Remove the dependency or delete those task(s) first.`,
      409,
    );
  }

  await db.$transaction(async (tx) => {
    await (tx as any).cnWBSDependency.deleteMany({
      where: {
        orgId: ctx.orgId,
        projectId,
        OR: [{ fromTaskId: { in: ids } }, { toTaskId: { in: ids } }],
      },
    });
    await (tx as any).cnWBSTask.deleteMany({
      where: { orgId: ctx.orgId, projectId, id: { in: ids } },
    });
  });
}

