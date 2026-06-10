import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const upsertSchema = z.object({
  module: z.string().min(1),
  name: z.string().min(1),
  filterConfig: z.record(z.unknown()),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { searchParams } = new URL(req.url);
    const module = searchParams.get("module") || undefined;
    const where: Record<string, unknown> = { orgId: user.orgId, userId: user.userId };
    if (module) where.module = module;
    const items = await prisma.crmQuickFilter.findMany({ where, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const item = await prisma.crmQuickFilter.create({
      data: {
        ...parsed.data,
        orgId: user.orgId,
        userId: user.userId,
      } as Prisma.CrmQuickFilterUncheckedCreateInput,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.crmQuickFilter.deleteMany({ where: { id, orgId: user.orgId, userId: user.userId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
