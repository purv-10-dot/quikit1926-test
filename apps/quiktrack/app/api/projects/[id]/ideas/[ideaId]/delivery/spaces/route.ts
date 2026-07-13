import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Spaces (projects) the caller can link delivery work items from — the JPD
 * Delivery "Space" picker. Returns the org's non-discovery projects the caller
 * is a member of (admins see all). Optional ?q= filters by name/key.
 */

export const GET = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId }, req) => {
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    const isAdmin = await hasAdminAccess(userId, orgId);

    const memberProjectIds = isAdmin
      ? null
      : (
          await db.qtProjectMember.findMany({
            where: { userId, isDeleted: false },
            select: { projectId: true },
          })
        ).map((m) => m.projectId);

    const projects = await db.qtProject.findMany({
      where: {
        orgId,
        isDeleted: false,
        // Delivery links point at real work-item projects, not other discovery
        // spaces.
        NOT: { templateKey: "discovery" },
        ...(memberProjectIds ? { id: { in: memberProjectIds } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { projectKey: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, name: true, projectKey: true, icon: true, color: true },
    });

    return NextResponse.json({ success: true, data: projects });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);
