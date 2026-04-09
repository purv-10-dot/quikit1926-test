import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const search = request.nextUrl.searchParams.get("search") || "";

  const tenants = await db.tenant.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  });

  const memberCounts = await db.membership.groupBy({
    by: ["tenantId"],
    where: { status: "active" },
    _count: { userId: true },
  });
  const countMap = new Map(memberCounts.map((m) => [m.tenantId, m._count.userId]));

  const data = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    status: t.status,
    plan: t.plan,
    brandColor: t.brandColor,
    logoUrl: t.logoUrl,
    memberCount: countMap.get(t.id) || 0,
    createdAt: t.createdAt.toISOString(),
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const body = await request.json();
  const { name, description, plan, brandColor } = body;

  if (!name) {
    return NextResponse.json(
      { success: false, error: "Organisation name is required" },
      { status: 400 }
    );
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;

  const existing = await db.tenant.findUnique({ where: { slug } });
  if (existing) {
    slug = `${baseSlug}-${Date.now()}`;
  }

  const tenant = await db.tenant.create({
    data: {
      name,
      slug,
      description: description || null,
      plan: plan || "startup",
      brandColor: brandColor || "#0066cc",
      status: "active",
      createdBy: auth.userId,
    },
  });

  return NextResponse.json({ success: true, data: tenant });
}
