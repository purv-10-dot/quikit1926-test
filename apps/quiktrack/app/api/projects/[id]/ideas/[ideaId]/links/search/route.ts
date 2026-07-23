import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Global work-item search for the idea "Linked work items" picker (JPD lists work
 * items across ALL projects the user can access). Optional ?q= filters by
 * key/title. Unlike the Delivery search, this is NOT scoped to one space and does
 * not exclude Done items (you can relate to anything).
 */
export const GET = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId }, req) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";

    // Which projects can this user see? Admins see all; others see their memberships.
    const isAdmin = await hasAdminAccess(userId, orgId);
    let projectFilter: { projectId?: { in: string[] } } = {};
    if (!isAdmin) {
      const memberships = await db.qtProjectMember.findMany({
        where: { userId, isDeleted: false, project: { orgId, isDeleted: false } },
        select: { projectId: true },
      });
      projectFilter = { projectId: { in: memberships.map((m) => m.projectId) } };
      if (memberships.length === 0) return NextResponse.json({ success: true, data: [] });
    }

    const issues = await db.qtIssue.findMany({
      where: {
        orgId,
        isDeleted: false,
        ...projectFilter,
        ...(q
          ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { key: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: q ? [{ key: "asc" }] : [{ updatedAt: "desc" }],
      take: 50,
      select: {
        id: true, key: true, title: true, type: true,
        status: { select: { name: true } },
        project: { select: { name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: issues.map((i) => ({
        id: i.id, key: i.key, title: i.title, type: i.type,
        status: i.status?.name ?? null, projectName: i.project?.name ?? null,
      })),
    });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);
