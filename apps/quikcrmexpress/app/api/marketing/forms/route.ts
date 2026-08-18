import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1),
  fields: z.array(z.unknown()).default([]),
  config: z.record(z.unknown()).optional(),
});

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const items = await prisma.qceFormDefinition.findMany({ where: { orgId: user.orgId } });
    return NextResponse.json({ items });
  } catch (e) { return errorResponse(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "campaigns", "create");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
    const f = await prisma.qceFormDefinition.create({
      data: { ...parsed.data, orgId: user.orgId } as Prisma.QceFormDefinitionUncheckedCreateInput,
    });
    return NextResponse.json(f, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
