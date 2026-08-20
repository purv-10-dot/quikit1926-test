import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { getWorkflowInitialStatusId } from "@/lib/services/projectDefaults";

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }, req) => {
    const statuses = await db.qtIssueStatus.findMany({
      where: { projectId, isDeleted: false },
      orderBy: { orderIndex: "asc" },
    });

    // ?creatable=1 — the statuses a NEW work item may be created in. Under a
    // published workflow that's ONLY the initial status (the "Create" transition
    // target), matching the create API's gate; ungated projects return the full
    // list. Used by the Create-work-item modal's Status field.
    if (new URL(req.url).searchParams.get("creatable") === "1") {
      const initial = await getWorkflowInitialStatusId(db, projectId);
      if (initial) {
        return NextResponse.json({ success: true, data: statuses.filter((s) => s.id === initial) });
      }
      return NextResponse.json({ success: true, data: statuses });
    }

    // A workflow can be attached as an UNPUBLISHED DRAFT that introduces new
    // statuses (e.g. the classic Open/Resolved/Reopened/Closed). Those must NOT
    // appear in item status dropdowns until the workflow is published — the item
    // still lives on its current status. So by default we hide "draft-only"
    // statuses: nodes of an INACTIVE workflow that are not yet in real use
    // (no issue on them, not mapped to a board column). The publish/migration
    // dialog opts back in with ?includeDraft=1 to offer them as mapping targets.
    const includeDraft = new URL(req.url).searchParams.get("includeDraft") === "1";
    if (includeDraft) {
      return NextResponse.json({ success: true, data: statuses });
    }

    const draftOnly = await draftOnlyStatusIds(projectId);
    const visible = statuses.filter((s) => !draftOnly.has(s.id));
    return NextResponse.json({ success: true, data: visible });
  },
  { paramKey: "id" },
);

/**
 * Status ids that exist ONLY as part of an unpublished draft workflow — i.e.
 * nodes of an INACTIVE workflow that no issue sits on and that aren't mapped to
 * a board column. These are hidden from item status dropdowns until publish.
 */
async function draftOnlyStatusIds(projectId: string): Promise<Set<string>> {
  const scheme = await db.qtWorkflowScheme.findUnique({
    where: { projectId },
    select: { hasDraft: true },
  });
  if (!scheme?.hasDraft) return new Set();

  // Statuses that are nodes of an inactive workflow in this project.
  const draftNodes = await db.qtWorkflowStatus.findMany({
    where: { workflow: { projectId, isActive: false, isDeleted: false } },
    select: { statusId: true },
  });
  const candidateIds = [...new Set(draftNodes.map((n) => n.statusId))];
  if (candidateIds.length === 0) return new Set();

  // Keep any candidate that's actually in use (an issue is on it, or it's mapped
  // to a board column) — those are live, not draft-only.
  const [inUse, mapped] = await Promise.all([
    db.qtIssue.groupBy({
      by: ["statusId"],
      where: { projectId, isDeleted: false, statusId: { in: candidateIds } },
      _count: { _all: true },
    }),
    db.qtBoardColumnStatus.findMany({
      where: { statusId: { in: candidateIds } },
      select: { statusId: true },
    }),
  ]);
  const live = new Set<string>([
    ...inUse.map((u) => u.statusId),
    ...mapped.map((m) => m.statusId),
  ]);
  return new Set(candidateIds.filter((id) => !live.has(id)));
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  category: z.enum(["BACKLOG", "IN_PROGRESS", "DONE"]),
});

export const POST = withProjectAccess<{ id: string }>(
  async ({ projectId }, req) => {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const last = await db.qtIssueStatus.findFirst({
      where: { projectId, isDeleted: false },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });

    const status = await db.qtIssueStatus.create({
      data: {
        projectId,
        name: parsed.data.name,
        color: parsed.data.color ?? "#94a3b8",
        category: parsed.data.category,
        orderIndex: (last?.orderIndex ?? -1) + 1,
      },
    });
    return NextResponse.json({ success: true, data: status }, { status: 201 });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
