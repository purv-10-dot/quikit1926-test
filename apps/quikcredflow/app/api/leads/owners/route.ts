import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";

/**
 * GET /api/leads/owners
 *
 * Lightweight owner picker for the leads filter. Returns active org members of
 * the caller's tenant as { id, name, email } — the `id` is the value the owner
 * filter matches against Lead.ownerId.
 *
 * Deliberately separate from GET /api/settings/users:
 *   - Gated on leads:view (NOT users:view). Anyone who can see leads can pick an
 *     owner to filter by; they need not have access to the Users admin screen.
 *   - No permission-template / app-role / account-ACL enrichment (that endpoint
 *     does per-user fan-out joins the picker doesn't need).
 *   - No pagination cap — returns the full active team (the settings endpoint
 *     defaults to pageSize 50, which would silently truncate a larger team).
 *
 * Tenant scoping: orgMember.orgId === orgId (same join the users service uses).
 */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const members = await prisma.orgMember.findMany({
      where: { orgId: user.orgId, status: "active" },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    const items = members.map((m) => ({
      id: m.userId,
      name: [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email || m.userId,
      email: m.user.email ?? "",
    }));

    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}
