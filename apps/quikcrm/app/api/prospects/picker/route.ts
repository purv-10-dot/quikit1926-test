import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";

/**
 * GET /api/prospects/picker?q=&limit=
 * Returns: { success, data: { items: [{ id, name, company }] } }
 *
 * Lightweight dropdown source for the Prospect picker in the Log Activity
 * composer. Mirrors /api/leads/picker.
 *
 * No account-scope ACL here — unlike CrmLead, CrmProspect has no `accountId`
 * column, so there is nothing for `accountScopeFilter` to filter on. Prospects
 * are a pre-lead capture surfaced under the Leads module, so the org filter plus
 * the `leads:view` gate is the whole authorization story (the same pair the
 * Prospects settings screen and POST /api/prospects already use).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "25", 10) || 25, 1),
      100,
    );

    const where: Record<string, unknown> = { orgId: user.orgId };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
      ];
    }

    const prospects = await prisma.crmProspect.findMany({
      where,
      select: { id: true, name: true, company: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ success: true, data: { items: prospects } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load prospects";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
