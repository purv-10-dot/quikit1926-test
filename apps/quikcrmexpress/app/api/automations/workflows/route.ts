import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["Draft", "Active", "Paused", "Archived"]).optional(),
  triggerType: z.string().optional().nullable(),
  triggerSummary: z.string().optional().nullable(),
  graphNodes: z.array(z.unknown()).default([]),
  graphEdges: z.array(z.unknown()).default([]),
});

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "automations", "view");
    const items = await prisma.qceWorkflowDefinition.findMany({
      where: { orgId: user.orgId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "automations", "create");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
    const wf = await prisma.qceWorkflowDefinition.create({
      data: {
        orgId: user.orgId,
        name: parsed.data.name,
        status: parsed.data.status ?? "Draft",
        triggerType: parsed.data.triggerType ?? null,
        triggerSummary: parsed.data.triggerSummary ?? null,
        graphNodes: parsed.data.graphNodes as Prisma.InputJsonValue,
        graphEdges: parsed.data.graphEdges as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json(wf, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
