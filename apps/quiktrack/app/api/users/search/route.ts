import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getQuikTrackAppId } from "@/lib/api/permissions";

/**
 * Split a search query into whitespace-separated tokens for an AND-of-tokens
 * match. A single-token query ("Sagar", "sagar@x.com") keeps its old
 * single-OR behaviour exactly (see buildUserNameFilter). Multi-token queries
 * ("Sagar Roy") require EVERY token to match somewhere across
 * firstName/lastName/email — no single column contains the full name, so a
 * plain OR-of-the-whole-string (the previous behaviour) could never match a
 * two-token full name at all.
 */
function buildUserNameFilter(q: string) {
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};
  const perToken = (token: string) => ({
    OR: [
      { email: { contains: token, mode: "insensitive" as const } },
      { firstName: { contains: token, mode: "insensitive" as const } },
      { lastName: { contains: token, mode: "insensitive" as const } },
    ],
  });
  if (tokens.length === 1) return perToken(tokens[0]!);
  return { AND: tokens.map(perToken) };
}

// GET /api/users/search?q=<prefix>&limit=10
// Returns active org members matching the query, with a `hasQuikTrackAccess`
// flag the Add-User typeahead uses to mark rows already in QuikTrack.
export const GET = withOrgAuth(async ({ orgId }, req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));
  // Offset paging so callers (e.g. the executive report's employee picker) can
  // scroll through every org member instead of being capped at the first page.
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));

  const [memberships, appId] = await Promise.all([
    db.orgMember.findMany({
      where: {
        orgId,
        status: "active",
        ...(q ? { user: buildUserNameFilter(q) } : {}),
      },
      // Fetch one extra row to tell the client whether another page exists.
      take: limit + 1,
      skip: offset,
      orderBy: { user: { firstName: "asc" } },
      select: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
    }),
    getQuikTrackAppId(),
  ]);

  const hasMore = memberships.length > limit;
  if (hasMore) memberships.length = limit;

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
    hasQuikTrackAccess: accessByUserId.has(u.id),
  }));

  return NextResponse.json({ success: true, data, hasMore });
});
