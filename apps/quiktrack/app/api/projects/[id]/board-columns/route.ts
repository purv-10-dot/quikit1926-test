import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Board Settings — "map statuses to columns" (Jira-style).
 *
 * GET  → the project's columns (each with its ordered statuses), the unmapped
 *        statuses, and a per-status open-issue count for the ⚠ warnings.
 * PUT  → replace the whole mapping atomically. Statuses omitted from every
 *        column become "unmapped" (hidden from the board). Opt-in: a project
 *        with no columns falls back to one-column-per-status on the board.
 */

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }) => {
    const [columns, statuses, counts] = await Promise.all([
      db.qtBoardColumn.findMany({
        where: { projectId },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          name: true,
          orderIndex: true,
          statuses: {
            orderBy: { orderIndex: "asc" },
            select: { statusId: true, orderIndex: true },
          },
        },
      }),
      db.qtIssueStatus.findMany({
        where: { projectId, isDeleted: false },
        orderBy: { orderIndex: "asc" },
        select: { id: true, name: true, color: true, category: true },
      }),
      db.qtIssue.groupBy({
        by: ["statusId"],
        where: { projectId, isDeleted: false },
        _count: { _all: true },
      }),
    ]);

    const countByStatus: Record<string, number> = {};
    for (const c of counts) countByStatus[c.statusId] = c._count._all;

    const mapped = new Set(columns.flatMap((c) => c.statuses.map((s) => s.statusId)));
    const unmappedStatusIds = statuses.filter((s) => !mapped.has(s.id)).map((s) => s.id);

    return NextResponse.json({
      success: true,
      data: {
        configured: columns.length > 0,
        columns: columns.map((c) => ({
          id: c.id,
          name: c.name,
          statusIds: c.statuses.map((s) => s.statusId),
        })),
        unmappedStatusIds,
        statuses,
        countByStatus,
      },
    });
  },
  { paramKey: "id" },
);

const putSchema = z.object({
  columns: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        statusIds: z.array(z.string().min(1)),
      }),
    )
    .max(20),
});

export const PUT = withProjectAccess<{ id: string }>(
  async ({ projectId }, req) => {
    const parsed = putSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { columns } = parsed.data;

    // Every referenced status must belong to this project, and no status may
    // appear in more than one column.
    const projectStatusIds = new Set(
      (
        await db.qtIssueStatus.findMany({
          where: { projectId, isDeleted: false },
          select: { id: true },
        })
      ).map((s) => s.id),
    );
    const seen = new Set<string>();
    for (const col of columns) {
      for (const sid of col.statusIds) {
        if (!projectStatusIds.has(sid)) {
          return NextResponse.json(
            { success: false, error: "A column references a status not in this project." },
            { status: 400 },
          );
        }
        if (seen.has(sid)) {
          return NextResponse.json(
            { success: false, error: "A status is mapped to more than one column." },
            { status: 400 },
          );
        }
        seen.add(sid);
      }
    }

    await db.$transaction(async (tx) => {
      // Deleting columns cascades their QtBoardColumnStatus rows.
      await tx.qtBoardColumn.deleteMany({ where: { projectId } });
      for (const [ci, col] of columns.entries()) {
        const created = await tx.qtBoardColumn.create({
          data: { projectId, name: col.name, orderIndex: ci },
          select: { id: true },
        });
        if (col.statusIds.length > 0) {
          await tx.qtBoardColumnStatus.createMany({
            data: col.statusIds.map((statusId, si) => ({
              columnId: created.id,
              statusId,
              orderIndex: si,
            })),
          });
        }
      }
    });

    return NextResponse.json({ success: true, data: { columns: columns.length } });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
