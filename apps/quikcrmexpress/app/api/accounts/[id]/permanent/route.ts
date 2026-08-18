/**
 * DELETE /api/accounts/[id]/permanent — hard-delete a trashed account.
 * Administrator only. Account must already be soft-deleted.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertAccountAccess } from "@/lib/auth/account-acl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLE = "Administrator";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    if (user.role !== ADMIN_ROLE) {
      return NextResponse.json({ success: false, error: "Permanent delete is restricted to administrators." },
        { status: 403 },
      );
    }

    await assertAccountAccess(user, id);

    const existing = await prisma.qceAccount.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!existing.deletedAt) {
      return NextResponse.json({ success: false, error: "Account is not in trash. Move it to trash first, then permanently delete.",
        },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.qceLead.updateMany({
        where: { orgId: user.orgId, accountId: id },
        data: { accountId: null },
      });
      await tx.qceContact.updateMany({
        where: { orgId: user.orgId, accountId: id },
        data: { accountId: null },
      });
      await tx.qceOpportunity.updateMany({
        where: { orgId: user.orgId, accountId: id },
        data: { accountId: null },
      });
      await tx.qceAccount.updateMany({
        where: { orgId: user.orgId, parentAccountId: id },
        data: { parentAccountId: null },
      });
      await tx.qceAccount.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}
