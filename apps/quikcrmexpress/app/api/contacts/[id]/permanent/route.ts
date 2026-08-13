/**
 * DELETE /api/contacts/[id]/permanent — hard-delete a trashed contact.
 * Administrator only.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLE = "Administrator";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    if (user.role !== ADMIN_ROLE) {
      return NextResponse.json(
        { success: false, error: "Permanent delete is restricted to administrators." },
        { status: 403 },
      );
    }

    const existing = await prisma.qceContact.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true, deletedAt: true, leadId: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!existing.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "Contact is not in trash. Move it to trash first, then permanently delete.",
        },
        { status: 409 },
      );
    }

    const leadOr: Array<Record<string, unknown>> = [{ linkedContactId: id }];
    if (existing.leadId) leadOr.push({ id: existing.leadId });

    await prisma.$transaction(async (tx) => {
      await tx.qceLead.updateMany({
        where: { orgId: user.orgId, OR: leadOr },
        data: { status: "Open", convertedAt: null, linkedContactId: null },
      });
      await tx.qceContact.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Permanent delete failed";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
