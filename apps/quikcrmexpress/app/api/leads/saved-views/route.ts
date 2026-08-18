import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { savedViewBodySchema } from "@/lib/validators/lead-filter";

export const runtime = "nodejs";

/**
 * GET /api/leads/saved-views
 *   Returns the calling user's saved lead views, newest first, default-pinned first.
 */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const items = await prisma.qceLeadListView.findMany({
      where: { orgId: user.orgId, userId: user.userId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({
      items: items.map((v) => ({
        id: v.id,
        name: v.name,
        filter: v.filters,
        isDefault: v.isDefault,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/leads/saved-views
 *   Body: { name, filter, isDefault? }
 *   If isDefault=true, clears the default flag on the user's other views first.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const parsed = savedViewBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { name, filter, isDefault } = parsed.data;

    const view = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.qceLeadListView.updateMany({
          where: { orgId: user.orgId, userId: user.userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.qceLeadListView.create({
        data: {
          orgId: user.orgId,
          userId: user.userId,
          name,
          filters: filter,
          isDefault: isDefault ?? false,
        },
      });
    });
    return NextResponse.json(
      {
        id: view.id,
        name: view.name,
        filter: view.filters,
        isDefault: view.isDefault,
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
