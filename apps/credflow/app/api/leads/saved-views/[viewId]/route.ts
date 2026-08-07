import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { savedViewPatchSchema } from "@/lib/validators/lead-filter";

export const runtime = "nodejs";

/** PATCH /api/leads/saved-views/:viewId */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ viewId: string }> }) {
  try {
    const { viewId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const parsed = savedViewPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const updated = await prisma.$transaction(async (tx) => {
      // Ownership check
      const existing = await tx.qcfLeadListView.findFirst({
        where: { id: viewId, tenantId: user.tenantId, userId: user.userId },
      });
      if (!existing) return null;
      if (parsed.data.isDefault) {
        await tx.qcfLeadListView.updateMany({
          where: { tenantId: user.tenantId, userId: user.userId, isDefault: true, id: { not: viewId } },
          data: { isDefault: false },
        });
      }
      return tx.qcfLeadListView.update({
        where: { id: viewId },
        data: {
          name: parsed.data.name ?? undefined,
          filters: parsed.data.filter ?? undefined,
          isDefault: parsed.data.isDefault ?? undefined,
        },
      });
    });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      filter: updated.filters,
      isDefault: updated.isDefault,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/leads/saved-views/:viewId */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ viewId: string }> }) {
  try {
    const { viewId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const result = await prisma.qcfLeadListView.deleteMany({
      where: { id: viewId, tenantId: user.tenantId, userId: user.userId },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
