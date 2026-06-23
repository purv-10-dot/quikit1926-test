import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES, TRIAL_DURATION_DAYS } from "@quikit/shared";

/**
 * POST /api/org/apps/activate
 *
 * Self-serve app activation from the launcher's "Other Tools" section. Starts
 * a 14-day per-app trial (OrgAppAccess.trialEndsAt = now + 14d), which moves
 * the app into the "Active" section. The Admin Portal is auto-activated
 * alongside the first app (with no trial — it's always free/included).
 *
 * Body: { appSlug, upgrade? }
 *   - upgrade=true converts the app to a paid/active state (trialEndsAt=null),
 *     releasing the trial gate. Real payment integration is out of scope.
 *
 * Org-admin (or super-admin) only — enabling apps is an org-management action.
 */
const Body = z.object({
  appSlug: z.string().trim().min(1),
  upgrade: z.boolean().optional(),
});

const ADMIN_PORTAL_SLUG = "admin";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const orgId = session.user.orgId;
  const isSuperAdmin = session.user.isSuperAdmin === true;
  if (!orgId) {
    return NextResponse.json({ success: false, error: "No organisation selected" }, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const { appSlug, upgrade } = parsed.data;

  // Org-admin gate.
  if (!isSuperAdmin) {
    const member = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    if (!member || !ADMIN_TIER_ROLES.has(member.role)) {
      return NextResponse.json(
        { success: false, error: "Org admin role required to activate apps." },
        { status: 403 },
      );
    }
  }

  const app = await db.app.findUnique({
    where: { slug: appSlug },
    select: { id: true, slug: true, status: true },
  });
  if (!app || app.status === "disabled") {
    return NextResponse.json({ success: false, error: "Unknown or disabled app" }, { status: 404 });
  }

  // Trialing apps get a 14-day window; an upgrade (or the Admin Portal) has
  // no trial → trialEndsAt null → treated as active.
  const trialEndsAt = upgrade ? null : new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await db.orgAppAccess.upsert({
    where: { orgId_appId: { orgId, appId: app.id } },
    update: { enabled: true, trialEndsAt, updatedBy: userId },
    create: { orgId, appId: app.id, enabled: true, trialEndsAt, updatedBy: userId },
  });

  // Auto-activate the Admin Portal alongside the first activated app (free —
  // no trial). Skip if the activated app IS the Admin Portal.
  if (app.slug !== ADMIN_PORTAL_SLUG) {
    const adminApp = await db.app.findUnique({
      where: { slug: ADMIN_PORTAL_SLUG },
      select: { id: true },
    });
    if (adminApp) {
      await db.orgAppAccess.upsert({
        where: { orgId_appId: { orgId, appId: adminApp.id } },
        update: { enabled: true },
        create: { orgId, appId: adminApp.id, enabled: true, trialEndsAt: null, updatedBy: userId },
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: { appSlug: app.slug, trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null },
  });
}
