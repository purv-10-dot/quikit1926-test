import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";

export const runtime = "nodejs";

/**
 * GET /api/accounts/picker?q=&limit=
 * Returns: { success, data: { items: [{ id, name }] } }
 *
 * Lightweight dropdown source for the contacts/leads/opportunities forms.
 * Applies account-scope ACL so a restricted user only sees their allowed set.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "view");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "25", 10) || 25, 1),
      100,
    );

    const acl = await accountScopeFilter(user);
    const baseWhere: Record<string, unknown> = { orgId: user.orgId };
    if (q) {
      baseWhere.name = { contains: q, mode: "insensitive" };
    }
    const where: Record<string, unknown> = acl ? { AND: [baseWhere, acl] } : baseWhere;

    const accounts = await prisma.qceAccount.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: limit,
    });
    return NextResponse.json({ success: true, data: { items: accounts } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load accounts";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
