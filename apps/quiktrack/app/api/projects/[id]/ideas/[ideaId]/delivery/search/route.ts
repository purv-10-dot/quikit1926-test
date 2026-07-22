import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Search work items in a chosen space to link as delivery (JPD Delivery "Search
 * for a work item"). Requires ?spaceId=; optional ?q= filters by key/title.
 * Excludes Done-category issues (JPD: "You can't search work items with the done
 * status"). Caller must be able to access the target space.
 */

export const GET = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId }, req) => {
    const url = new URL(req.url);
    const spaceId = url.searchParams.get("spaceId");
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (!spaceId) {
      return NextResponse.json({ success: false, error: "spaceId is required" }, { status: 400 });
    }

    const space = await db.qtProject.findFirst({
      where: { id: spaceId, orgId, isDeleted: false },
      select: { id: true },
    });
    if (!space) {
      return NextResponse.json({ success: false, error: "Space not found" }, { status: 404 });
    }
    const isAdmin = await hasAdminAccess(userId, orgId);
    if (!isAdmin) {
      const pm = await db.qtProjectMember.findFirst({
        where: { projectId: spaceId, userId, isDeleted: false },
        select: { id: true },
      });
      if (!pm) return NextResponse.json({ success: false, error: "Space not found" }, { status: 404 });
    }

    const issues = await db.qtIssue.findMany({
      where: {
        orgId,
        projectId: spaceId,
        isDeleted: false,
        status: { is: { category: { not: "DONE" } } },
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { key: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      // Order by key when searching (so PM-4, PM-40, PM-41… group together);
      // by recency otherwise.
      orderBy: q ? [{ key: "asc" }] : [{ updatedAt: "desc" }],
      take: 50,
      select: {
        id: true, key: true, title: true, type: true,
        status: { select: { name: true, category: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: issues.map((i) => ({
        id: i.id, key: i.key, title: i.title, type: i.type,
        status: i.status?.name ?? null,
      })),
    });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);
