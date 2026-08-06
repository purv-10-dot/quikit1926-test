import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";

/**
 * GET /api/leads/sources
 *   Returns lead sources for the org. Filters to active sources by default —
 *   the Add Lead form must never offer inactive options. Pass ?includeInactive=true
 *   from settings management UIs that need to show every source.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "true";
    const items = await prisma.crmLeadSource.findMany({
      where: { tenantId: user.tenantId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().max(60).optional().nullable(),
  active: z.boolean().optional(),
});

/**
 * POST /api/leads/sources — create a new source. Used by the Add-Lead form's
 * "+ Lead sources" quick-add affordance.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "create");
    const parsed = createSourceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const existing = await prisma.crmLeadSource.findFirst({
      where: { tenantId: user.tenantId, name: { equals: parsed.data.name, mode: "insensitive" } },
    });
    if (existing) {
      return NextResponse.json({ error: "A source with that name already exists." }, { status: 409 });
    }
    const created = await prisma.crmLeadSource.create({
      data: {
        tenantId: user.tenantId,
        name: parsed.data.name,
        type: parsed.data.type ?? null,
        active: parsed.data.active ?? true,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
