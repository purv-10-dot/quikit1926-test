import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";

export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const apps = await db.app.findMany({
    orderBy: { createdAt: "desc" },
  });

  const accessCounts = await db.userAppAccess.groupBy({
    by: ["appId"],
    _count: { userId: true },
  });
  const countMap = new Map(accessCounts.map((a) => [a.appId, a._count.userId]));

  const data = apps.map((app) => ({
    id: app.id,
    name: app.name,
    slug: app.slug,
    description: app.description,
    baseUrl: app.baseUrl,
    iconUrl: app.iconUrl,
    status: app.status,
    accessCount: countMap.get(app.id) || 0,
    createdAt: app.createdAt.toISOString(),
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const body = await request.json();
  const { name, slug, description, baseUrl, iconUrl } = body;

  if (!name || !slug || !baseUrl) {
    return NextResponse.json(
      { success: false, error: "name, slug, and baseUrl are required" },
      { status: 400 }
    );
  }

  const existing = await db.app.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json(
      { success: false, error: "An app with this slug already exists" },
      { status: 409 }
    );
  }

  const app = await db.app.create({
    data: {
      name,
      slug,
      description: description || null,
      baseUrl,
      iconUrl: iconUrl || null,
      status: "active",
    },
  });

  return NextResponse.json({ success: true, data: app });
}
