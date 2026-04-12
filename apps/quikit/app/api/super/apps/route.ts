import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";

/**
 * GET /api/super/apps — list all registered apps (super admin only)
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  const apps = await db.app.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      baseUrl: true,
      status: true,
      createdAt: true,
      oauthClient: { select: { clientId: true } },
    },
    orderBy: { name: "asc" },
  });

  const data = apps.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    description: a.description,
    baseUrl: a.baseUrl,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    hasOAuthClient: !!a.oauthClient,
  }));

  return NextResponse.json({ success: true, data });
}
