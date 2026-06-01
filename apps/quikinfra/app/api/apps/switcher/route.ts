import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db as dbCentral } from "@quikit/database";
import { authOptions } from "@/lib/auth/next-auth-options";

/**
 * GET /api/apps/switcher
 *
 * Returns the list of apps the current user has access to. Used by the
 * `<AppSwitcher />` component in the header. Mirrors quikscale's identical
 * endpoint so the shared @quikit/ui component works in both apps without
 * any prop overrides.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let orgId = (session.user as { orgId?: string }).orgId;

  // Fall back to first active membership if orgId not in session.
  if (!orgId) {
    const membership = await (dbCentral as any).orgMember.findFirst({
      where: { userId, status: "active" },
      select: { orgId: true },
      orderBy: { createdAt: "asc" },
    });
    orgId = membership?.orgId ?? undefined;
  }

  // Every active App in the registry.
  const allApps = await (dbCentral as any).app.findMany({
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

  // Filter to the ones this user has access to in this org.
  const accessRecords = orgId
    ? await (dbCentral as any).userAppAccess.findMany({
        where: { userId, orgId },
        select: { appId: true },
      })
    : [];
  const accessSet = new Set(
    (accessRecords as Array<{ appId: string }>).map((a) => a.appId),
  );
  const data = (allApps as Array<{ id: string }>).filter((app) =>
    accessSet.has(app.id),
  );

  // Surface QUIKIT_URL so the switcher's "View all apps" link doesn't
  // need NEXT_PUBLIC_QUIKIT_URL baked in at build time.
  const quikitUrl = process.env.QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
