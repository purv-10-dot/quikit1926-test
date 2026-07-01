import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getScope } from "@/lib/auth/account-acl";

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

    // Scope to the accounts this user can see. `accountScopeFilter` builds an
    // `accountId`-keyed OR clause meant for lead/contact/opportunity tables —
    // applied to CrmAccount (whose own key is `id`, not `accountId`) it matched
    // nothing, so the dropdown showed "No accounts match" for any account the
    // user didn't personally own. Filter CrmAccount.id against the allowed set,
    // mirroring the accounts list endpoint (GET /api/accounts).
    const scope = await getScope(user);
    // Exclude trashed accounts — the picker should only offer accounts that are
    // live on the Accounts page (which filters deletedAt: null for its list view).
    const where: Record<string, unknown> = { orgId: user.orgId, deletedAt: null };
    if (!scope.unrestricted) {
      if (scope.allowedAccountIds.length === 0) {
        return NextResponse.json({ success: true, data: { items: [] } });
      }
      where.id = { in: scope.allowedAccountIds };
    }
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    const accounts = await prisma.crmAccount.findMany({
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
