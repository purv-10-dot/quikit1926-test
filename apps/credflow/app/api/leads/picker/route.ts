import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { ownerScopeFilter } from "@/lib/auth/owner-scope";

export const runtime = "nodejs";

/**
 * GET /api/leads/picker?q=&limit=
 * Returns: { success, data: { items: [{ id, name, company }] } }
 *
 * Lightweight dropdown source for the Lead picker on the contact Edit form.
 * Applies account-scope ACL.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "25", 10) || 25, 1),
      100,
    );

    const acl = await accountScopeFilter(user);
    const ownerScope = await ownerScopeFilter(user);
    const baseWhere: Record<string, unknown> = { tenantId: user.tenantId };
    if (q) {
      baseWhere.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
      ];
    }
    const scopeClauses: Record<string, unknown>[] = [];
    if (acl) scopeClauses.push(acl);
    if (ownerScope) scopeClauses.push(ownerScope);
    const where: Record<string, unknown> =
      scopeClauses.length > 0 ? { AND: [baseWhere, ...scopeClauses] } : baseWhere;

    const leads = await prisma.qcfLead.findMany({
      where,
      select: { id: true, name: true, company: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ success: true, data: { items: leads } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load leads";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
