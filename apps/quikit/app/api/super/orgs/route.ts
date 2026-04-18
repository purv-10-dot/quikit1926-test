import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { createOrgSchema } from "@/lib/schemas/superAdminSchemas";
import { logAudit } from "@/lib/auditLog";
import { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "@quikit/shared/pagination";

/**
 * GET /api/super/orgs — list all tenants with pagination + search (super admin only)
 */
export const GET = withSuperAdminAuth(async (_auth, request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const pagination = parsePaginationParams(searchParams);
    const search = searchParams.get("search") || "";

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [tenants, total] = await Promise.all([
      db.tenant.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          status: true,
          createdAt: true,
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginationToSkipTake(pagination),
      }),
      db.tenant.count({ where }),
    ]);

    const data = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      status: t.status,
      memberCount: t._count.users,
      createdAt: t.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, ...buildPaginationResponse(data, total, pagination) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * POST /api/super/orgs — create a new organization (super admin only)
 */
export const POST = withSuperAdminAuth(async ({ userId }, request: NextRequest) => {
  try {
    const body = await request.json();
    const parsed = createOrgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const { name, slug, plan, billingEmail, description } = parsed.data;

    // Check slug uniqueness
    const existing = await db.tenant.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "An organization with this slug already exists" },
        { status: 409 },
      );
    }

    const tenant = await db.tenant.create({
      data: { name, slug, plan, billingEmail, description, createdBy: userId },
    });

    logAudit({
      action: "create",
      entityType: "tenant",
      entityId: tenant.id,
      actorId: userId,
      tenantId: tenant.id,
      newValues: JSON.stringify({ name, slug, plan }),
    });

    return NextResponse.json({ success: true, data: tenant }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
