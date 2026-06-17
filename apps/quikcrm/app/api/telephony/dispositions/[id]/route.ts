import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const patchSchema = z.object({
  code: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  name: z.string().min(1).optional().nullable(),
  category: z.string().optional().nullable(),
  triggersPaymentVerification: z.boolean().optional(),
  targetLeadStage: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  config: z.record(z.unknown()).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { config, ...rest } = parsed.data;
    const data: Prisma.CrmCallDispositionUpdateManyMutationInput = { ...rest };
    if (config !== undefined) {
      data.config =
        config === null ? Prisma.JsonNull : (config as Prisma.InputJsonValue);
    }
    const updated = await prisma.crmCallDisposition.updateMany({
      where: { id, orgId: user.orgId },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Disposition not found" }, { status: 404 });
    }
    const item = await prisma.crmCallDisposition.findFirst({
      where: { id, orgId: user.orgId },
    });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { id } = await params;
    const deleted = await prisma.crmCallDisposition.deleteMany({
      where: { id, orgId: user.orgId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Disposition not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}
