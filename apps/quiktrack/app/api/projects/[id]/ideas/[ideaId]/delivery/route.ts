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

  const issues = await db.qtIssue.findMany({
    where: { id: { in: links.map((l) => l.issueId) }, isDeleted: false },
    select: {
      id: true, key: true, title: true, type: true, storyPoints: true,
      status: { select: { name: true, category: true } },
      project: { select: { id: true, name: true, projectKey: true } },
      children: {
        where: { isDeleted: false },
        select: { id: true, key: true, title: true, type: true, storyPoints: true, status: { select: { name: true, category: true } } },
      },
    },
  });
  const byId = new Map(issues.map((i) => [i.id, i]));

  const items = links
    .map((l) => {
      const i = byId.get(l.issueId);
      if (!i) return null;
      return {
        linkId: l.id,
        id: i.id,
        key: i.key,
        title: i.title,
        type: i.type,
        storyPoints: i.storyPoints,
        status: i.status?.name ?? null,
        statusCategory: i.status?.category ?? null,
        projectName: i.project?.name ?? null,
        children: i.children.map((c) => ({
          id: c.id, key: c.key, title: c.title, type: c.type,
          storyPoints: c.storyPoints,
          status: c.status?.name ?? null, statusCategory: c.status?.category ?? null,
        })),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Progress = share of linked top-level items that are Done.
  const done = items.filter((i) => i.statusCategory === "DONE").length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;
  return { items, progress };
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
