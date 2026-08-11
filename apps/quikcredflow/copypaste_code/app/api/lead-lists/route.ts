import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { filterPayloadSchema } from "@/lib/validators/lead-filter";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  filter: filterPayloadSchema,
  isDefault: z.boolean().optional(),
});

/**
 * GET /api/lead-lists
 *   Returns lists for the calling user (the saved-list module — distinct from saved-views).
 *   Default-pinned first, newest next.
 */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const items = await prisma.crmLeadSavedList.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({
      items: items.map((l) => ({
        id: l.id,
        name: l.name,
        filter: l.filters,
        isDefault: l.isDefault,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const list = await prisma.crmLeadSavedList.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        name: parsed.data.name,
        filters: parsed.data.filter,
        isDefault: parsed.data.isDefault ?? false,
      },
    });
    return NextResponse.json(
      {
        id: list.id,
        name: list.name,
        filter: list.filters,
        isDefault: list.isDefault,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
