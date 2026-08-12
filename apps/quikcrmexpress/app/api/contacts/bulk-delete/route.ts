/**
 * POST /api/contacts/bulk-delete — soft-delete all active contacts (tenant-scoped + ACL).
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { applyContactListWhere } from "@/lib/services/contacts/list-where";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "delete");

    const acl = await accountScopeFilter(user);
    const scoped = applyContactListWhere(
      { orgId: user.orgId },
      { trashed: false },
    );
    const where = acl ? { AND: [scoped, acl] } : scoped;

    const result = await prisma.qceContact.updateMany({
      where,
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true, data: { count: result.count } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Bulk delete failed";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/contacts/bulk-delete POST]", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
