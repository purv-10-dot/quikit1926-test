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
  const siblings = (await (db as any).cnWBSTask.findMany({
    where: { orgId, projectId, parentId },
    select: { wbsCode: true },
  })) as Array<{ wbsCode: string }>;
  const trailing = siblings.map((s) => {
    const code = s.wbsCode ?? "";
    const seg = code.includes(".") ? code.slice(code.lastIndexOf(".") + 1) : code;
    const n = parseInt(seg, 10);
    return Number.isFinite(n) ? n : 0;
  });
  const next = trailing.length === 0 ? 1 : Math.max(...trailing) + 1;
  if (parentId === null) return `${next}`;
  const parent = (await (db as any).cnWBSTask.findFirst({
    where: { orgId, projectId, id: parentId },
    select: { wbsCode: true },
  })) as { wbsCode: string } | null;
  const prefix = parent?.wbsCode ?? "";
  return prefix ? `${prefix}.${next}` : `${next}`;
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

  const progress = Math.max(0, Math.min(100, Math.floor(input.progress ?? 0)));
  const status: WbsStatus = (input.status ?? "not_started") as WbsStatus;
  const predecessors = Array.isArray(input.predecessors) ? input.predecessors : [];

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

  const predecessors = patch.predecessors !== undefined ? patch.predecessors : undefined;

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

