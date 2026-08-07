import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";

export const runtime = "nodejs";

/**
 * GET /api/contacts/picker?q=&limit=
 * Returns: { success, data: { items: [{ id, name, email }] } }
 *
 * `name` is composed server-side as `firstName lastName` so callers don't
 * have to glue the parts. Applies account-scope ACL.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "view");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "25", 10) || 25, 1),
      100,
    );

    const acl = await accountScopeFilter(user);
    const baseWhere: Record<string, unknown> = { tenantId: user.tenantId, deletedAt: null };
    if (q) {
      baseWhere.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }
    const where: Record<string, unknown> = acl ? { AND: [baseWhere, acl] } : baseWhere;

    const rows = await prisma.qcfContact.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const items = rows.map((c) => ({
      id: c.id,
      name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || "—",
      email: c.email ?? null,
    }));
    return NextResponse.json({ success: true, data: { items } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load contacts";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
