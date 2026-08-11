import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { ownerScopeFilter } from "@/lib/auth/owner-scope";

export const runtime = "nodejs";

const schema = z.object({ isStarred: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "edit");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    // Owner-restricted roles can only star leads they own: fold the owner scope
    // into the where, so a non-owned lead matches 0 rows → 404 below.
    const ownerScope = await ownerScopeFilter(user);
    const updated = await prisma.qcfLead.updateMany({
      where: { id, orgId: user.orgId, ...(ownerScope ?? {}) },
      data: { isStarred: parsed.data.isStarred },
    });
    if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, isStarred: parsed.data.isStarred });
  } catch (e) {
    return errorResponse(e);
  }
}
