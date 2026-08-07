import { NextResponse } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { db } from "@/lib/db";

/**
 * GET /api/apps/switcher
 *
 * Returns the list of apps the current user has access to in their current org.
 * Consumed by the shared <AppSwitcher /> in the topbar.
 *
 * Mirrors apps/quikscale/app/api/apps/switcher/route.ts — the shared platform
 * tables (App / OrgMember / UserAppAccess) live in the `quikit` schema and are
 * the source of truth for cross-app navigation.
 */
export async function GET() {
  const user = await requireApiUser();
  if (isResponse(user)) return user;

  const userId = user.userId;
  let orgId: string | undefined = user.orgId;

  if (!orgId) {
    const membership = await db.orgMember.findFirst({
      where: { userId, status: "active" },
      select: { orgId: true },
      orderBy: { createdAt: "asc" },
    });
    orgId = membership?.orgId ?? undefined;
  }

  const allApps = await db.app.findMany({
    where: { status: { not: "disabled" } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconUrl: true,
      baseUrl: true,
      status: true,
    },
    orderBy: { name: "asc" },
  });

  const accessRecords = orgId
    ? await db.userAppAccess.findMany({
        where: { userId, orgId },
        select: { appId: true },
      })
    : [];

  const accessSet = new Set(accessRecords.map((a) => a.appId));
  const data = allApps.filter((app) => accessSet.has(app.id));

  const quikitUrl = process.env.QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    },
  );
}
