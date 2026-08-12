import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { filterPayloadSchema } from "@/lib/validators/lead-filter";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  filter: filterPayloadSchema.optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "edit");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
    const updated = await prisma.qceLeadSavedList.updateMany({
      where: { id, orgId: user.orgId, userId: user.userId },
      data: {
        name: parsed.data.name ?? undefined,
        filters: parsed.data.filter ?? undefined,
        isDefault: parsed.data.isDefault ?? undefined,
      },
    });
    if (updated.count === 0) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    const item = await prisma.qceLeadSavedList.findUnique({ where: { id } });
    return NextResponse.json(item);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "delete");
    const deleted = await prisma.qceLeadSavedList.deleteMany({
      where: { id, orgId: user.orgId, userId: user.userId },
    });
    if (deleted.count === 0) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
