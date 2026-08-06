import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const schema = z.object({ module: z.string().min(1), filterId: z.string().trim().min(1).optional().nullable() });

export async function PUT(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    await prisma.crmQuickFilter.updateMany({
      where: { tenantId: user.tenantId, userId: user.userId, module: parsed.data.module, isLastApplied: true },
      data: { isLastApplied: false },
    });
    if (parsed.data.filterId) {
      await prisma.crmQuickFilter.updateMany({
        where: { id: parsed.data.filterId, tenantId: user.tenantId, userId: user.userId },
        data: { isLastApplied: true },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
