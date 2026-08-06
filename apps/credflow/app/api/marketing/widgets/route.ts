import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  config: z.record(z.unknown()).default({}),
});

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const items = await prisma.crmWebWidget.findMany({ where: { tenantId: user.tenantId } });
    return NextResponse.json({ items });
  } catch (e) { return errorResponse(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "campaigns", "create");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const w = await prisma.crmWebWidget.create({
      data: { ...parsed.data, tenantId: user.tenantId } as Prisma.CrmWebWidgetUncheckedCreateInput,
    });
    return NextResponse.json(w, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
