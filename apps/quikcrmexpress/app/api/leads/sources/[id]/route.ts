import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: z.string().trim().max(60).nullable().optional(),
  active: z.boolean().optional(),
});

/** PATCH /api/leads/sources/[id] — rename, reclassify, or toggle active. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const existing = await prisma.qceLeadSource.findFirst({ where: { id: params.id, orgId: user.orgId } });
    if (!existing) return NextResponse.json({ success: false, error: "Source not found" }, { status: 404 });

    if (parsed.data.name && parsed.data.name !== existing.name) {
      const dup = await prisma.qceLeadSource.findFirst({
        where: {
          orgId: user.orgId,
          name: { equals: parsed.data.name, mode: "insensitive" },
          NOT: { id: existing.id },
        },
      });
      if (dup) return NextResponse.json({ success: false, error: "A source with that name already exists." }, { status: 409 });
    }

    const updated = await prisma.qceLeadSource.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name ?? existing.name,
        type: parsed.data.type ?? existing.type,
        active: parsed.data.active ?? existing.active,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/leads/sources/[id] — remove a source. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "delete");
    const existing = await prisma.qceLeadSource.findFirst({ where: { id: params.id, orgId: user.orgId } });
    if (!existing) return NextResponse.json({ success: false, error: "Source not found" }, { status: 404 });
    await prisma.qceLeadSource.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
