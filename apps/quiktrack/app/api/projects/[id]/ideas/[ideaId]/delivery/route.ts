import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Delivery links between a discovery idea and QtIssues (JPD "Delivery" tab). The
 * linked work items may live in OTHER projects, so we resolve them at read time
 * (no FK). GET returns the linked items with status/points + progress; POST
 * links an existing issue the caller can access. Reading is IdeaView:view;
 * linking is Idea:update.
 */

const linkSchema = z.object({ issueId: z.string().min(1) });

async function ideaExists(orgId: string, projectId: string, ideaId: string) {
  return db.qtIdea.findFirst({
    where: { id: ideaId, orgId, projectId, isDeleted: false },
    select: { id: true },
  });
}

/** True if the caller may access `issue`'s project (admin or a project member). */
async function canAccessProject(userId: string, orgId: string, projectId: string): Promise<boolean> {
  if (await hasAdminAccess(userId, orgId)) return true;
  const pm = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { id: true },
  });
  return !!pm;
}

/** Resolve linked issues (cross-project) into the shape the Delivery table needs. */
async function loadLinkedItems(orgId: string, ideaId: string) {
  const links = await db.qtIdeaDelivery.findMany({
    where: { orgId, ideaId },
    orderBy: { createdAt: "asc" },
    select: { id: true, issueId: true },
  });
  if (links.length === 0) return { items: [], progress: 0 };

  // Build a nested tree so an epic → its tasks → their subtasks all expand.
  // Descendant edges in QuikTrack: epicId (epic → tasks) and parentId (task →
  // subtasks). We walk up to 3 levels down from each linked issue.
  const nodeSelect = {
    id: true, key: true, title: true, type: true, storyPoints: true,
    assigneeId: true, dueDate: true,
    status: { select: { name: true, category: true } },
    sprint: { select: { name: true } },
  } as const;

  const rootIds = links.map((l) => l.issueId);
  const roots = await db.qtIssue.findMany({
    where: { id: { in: rootIds }, isDeleted: false },
    select: { ...nodeSelect, project: { select: { id: true, name: true, projectKey: true } } },
  });
  const rootById = new Map(roots.map((r) => [r.id, r]));

  interface Node {
    id: string; key: string; title: string; type: string;
    storyPoints: number | null; status: string | null; statusCategory: string | null;
    assigneeId: string | null; assigneeName: string | null; dueDate: string | null;
    sprint: string | null;
    children: Node[];
  }
  const shape = (i: {
    id: string; key: string; title: string; type: string; storyPoints: number | null;
    assigneeId: string | null; dueDate: Date | null; status: { name: string; category: string } | null;
    sprint: { name: string } | null;
  }): Node => ({
    id: i.id, key: i.key, title: i.title, type: i.type,
    storyPoints: i.storyPoints, status: i.status?.name ?? null, statusCategory: i.status?.category ?? null,
    assigneeId: i.assigneeId, assigneeName: null,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    sprint: i.sprint?.name ?? null,
    children: [],
  });

  // Fetch descendants level-by-level (breadth-first), attaching under whichever
  // parent edge (epicId or parentId) points at an already-loaded node.
  const nodeById = new Map<string, Node>();
  roots.forEach((r) => nodeById.set(r.id, shape(r)));
  let frontier = [...rootIds];
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const kids = await db.qtIssue.findMany({
      where: {
        isDeleted: false,
        OR: [{ epicId: { in: frontier } }, { parentId: { in: frontier } }],
      },
      select: { ...nodeSelect, epicId: true, parentId: true },
    });
    const next: string[] = [];
    for (const k of kids) {
      if (nodeById.has(k.id)) continue; // avoid cycles/dupes
      const node = shape(k);
      const parentId = (k.parentId && nodeById.has(k.parentId)) ? k.parentId
        : (k.epicId && nodeById.has(k.epicId)) ? k.epicId : null;
      if (!parentId) continue;
      nodeById.get(parentId)!.children.push(node);
      nodeById.set(k.id, node);
      next.push(k.id);
    }
    frontier = next;
  }

  // Resolve assignee display names across every node in one query.
  const assigneeIds = [...new Set([...nodeById.values()].map((n) => n.assigneeId).filter((v): v is string => Boolean(v)))];
  if (assigneeIds.length) {
    const users = await db.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const nameById = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]));
    for (const n of nodeById.values()) {
      if (n.assigneeId) n.assigneeName = nameById.get(n.assigneeId) ?? null;
    }
  }

  const items = links
    .map((l) => {
      const r = rootById.get(l.issueId);
      const node = nodeById.get(l.issueId);
      if (!r || !node) return null;
      return {
        linkId: l.id,
        ...node,
        projectName: r.project?.name ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Progress = share of linked top-level items that are Done. Also return the
  // To Do / In Progress / Done breakdown for the progress-bar hover popover.
  const done = items.filter((i) => i.statusCategory === "DONE").length;
  const inProgress = items.filter((i) => i.statusCategory === "IN_PROGRESS").length;
  const todo = items.length - done - inProgress;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;
  return { items, progress, counts: { total: items.length, todo, inProgress, done } };
}

export const GET = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, projectId }, _req, { params }) => {
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }
    const data = await loadLinkedItems(orgId, params.ideaId);
    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

export const POST = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = linkSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "issueId is required" }, { status: 400 });
    }
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }
    // The issue must exist in this org and be in a project the caller can access.
    const issue = await db.qtIssue.findFirst({
      where: { id: parsed.data.issueId, orgId, isDeleted: false },
      select: { id: true, projectId: true },
    });
    if (!issue || !(await canAccessProject(userId, orgId, issue.projectId))) {
      return NextResponse.json({ success: false, error: "Work item not found" }, { status: 404 });
    }

    try {
      await db.qtIdeaDelivery.upsert({
        where: { ideaId_issueId: { ideaId: params.ideaId, issueId: issue.id } },
        create: { orgId, ideaId: params.ideaId, issueId: issue.id, createdBy: userId },
        update: {},
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to link work item";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    const data = await loadLinkedItems(orgId, params.ideaId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);
