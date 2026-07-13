import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getQuikAssetAppId } from "@/lib/api/permissions";

// GET /api/org/users/search?q=<prefix>&limit=10
// Returns active org members matching the query, with a `hasQuikAssetAccess`
// flag the Add-User typeahead uses to mark rows already in QuikAsset. Lives
// under /api/org to stay clear of /api/users (the asset Employee directory).
export const GET = withOrgAuth(async ({ orgId }, req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));

  const [memberships, appId] = await Promise.all([
    db.orgMember.findMany({
      where: {
        orgId,
        status: "active",
        ...(q
          ? {
              user: {
                OR: [
                  { email: { contains: q, mode: "insensitive" } },
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      take: limit,
      orderBy: { user: { firstName: "asc" } },
      select: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
    }),
    getQuikAssetAppId(),
  ]);

  const users = memberships.map((m) => m.user).filter(Boolean) as Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
  }>;

  const accessByUserId = new Set<string>();
  if (appId && users.length > 0) {
    const accesses = await db.userAppAccess.findMany({
      where: { orgId, appId, userId: { in: users.map((u) => u.id) } },
      select: { userId: true },
    });
    for (const a of accesses) accessByUserId.add(a.userId);
  }

  const data = users.map((u) => ({
    ...u,
    userId: u.id,
    hasQuikAssetAccess: accessByUserId.has(u.id),
  }));

  return NextResponse.json({ success: true, data });
});
