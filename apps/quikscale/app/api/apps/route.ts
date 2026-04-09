import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/apps?tenantId=xxx
 * Returns apps the current user has access to for the given tenant.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "tenantId query param required" }, { status: 400 });
  }

  // Get all apps the user has access to in this org
  const accessRecords = await db.userAppAccess.findMany({
    where: {
      userId: session.user.id,
      tenantId,
    },
    include: {
      app: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          iconUrl: true,
          baseUrl: true,
          status: true,
        },
      },
    },
  });

  const apps = accessRecords.map((a) => ({
    appId: a.app.id,
    name: a.app.name,
    slug: a.app.slug,
    description: a.app.description,
    iconUrl: a.app.iconUrl,
    baseUrl: a.app.baseUrl,
    status: a.app.status,
    role: a.role,
  }));

  return NextResponse.json({ success: true, data: apps });
}
