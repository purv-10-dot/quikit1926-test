import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * "Linked work items" on a discovery idea (JPD). Each link has a linkType
 * ("relates to", etc.) and points to a QtIssue that may live in another project
 * (no FK; resolved at read time). Separate from the Delivery tab's links.
 */

const createSchema = z.object({
  issueId: z.string().min(1),
  linkType: z.string().min(1).max(40).optional(),
});

async function ideaExists(orgId: string, projectId: string, ideaId: string) {
  return db.qtIdea.findFirst({ where: { id: ideaId, orgId, projectId, isDeleted: false }, select: { id: true } });
}

async function canAccessProject(userId: string, orgId: string, projectId: string): Promise<boolean> {
  if (await hasAdminAccess(userId, orgId)) return true;
  const pm = await db.qtProjectMember.findFirst({ where: { projectId, userId, isDeleted: false }, select: { id: true } });
  return !!pm;
}

export const GET = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, projectId }, _req, { params }) => {
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }
    const links = await db.qtIdeaLink.findMany({
      where: { orgId, ideaId: params.ideaId },
      orderBy: { createdAt: "asc" },
      select: { id: true, issueId: true, linkType: true },
    });
    const issueIds = [...new Set(links.map((l) => l.issueId))];
    const issues = issueIds.length
      ? await db.qtIssue.findMany({
          where: { id: { in: issueIds }, isDeleted: false },
          select: { id: true, key: true, title: true, type: true, status: { select: { name: true, category: true } }, project: { select: { name: true } } },
        })
      : [];
    const byId = new Map(issues.map((i) => [i.id, i]));
    const data = links
      .map((l) => {
        const i = byId.get(l.issueId);
        if (!i) return null;
        return { id: l.id, linkType: l.linkType, issueId: i.id, key: i.key, title: i.title, type: i.type, status: i.status?.name ?? null, statusCategory: i.status?.category ?? null, projectName: i.project?.name ?? null };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

export const POST = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "issueId is required" }, { status: 400 });
    }
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }
    const issue = await db.qtIssue.findFirst({ where: { id: parsed.data.issueId, orgId, isDeleted: false }, select: { id: true, projectId: true } });
    if (!issue || !(await canAccessProject(userId, orgId, issue.projectId))) {
      return NextResponse.json({ success: false, error: "Work item not found" }, { status: 404 });
    }
    try {
      await db.qtIdeaLink.upsert({
        where: { ideaId_issueId_linkType: { ideaId: params.ideaId, issueId: issue.id, linkType: parsed.data.linkType ?? "relates to" } },
        create: { orgId, ideaId: params.ideaId, issueId: issue.id, linkType: parsed.data.linkType ?? "relates to", createdBy: userId },
        update: {},
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to link work item";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: { ok: true } }, { status: 201 });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);
