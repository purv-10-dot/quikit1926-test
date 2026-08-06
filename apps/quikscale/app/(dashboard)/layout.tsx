import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { seedDemoDataForOrg } from "@/lib/services/demoData";

// Reads the session per request and gates on app access — never prerender.
export const dynamic = "force-dynamic";

const APP_SLUG = "quikscale";

/**
 * Server layout for the dashboard route group.
 *
 * The app-access check runs HERE, server-side, before any protected UI is
 * rendered. A user who isn't granted QuikScale is redirected to the landing
 * page (`/?reason=no_app_access&…`) and the dashboard never paints — no flash.
 * The client `SessionGuard` inside <DashboardShell> remains the live-revocation
 * backstop for access lost while the user is already inside the app.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  // Resolve orgId fresh from the DB (matches every API route via withOrgAuth)
  // rather than trusting session.user.orgId off the JWT. Root cause of a real
  // bug found in testing: right after creating a brand-new org, the session
  // cookie can still carry the pre-org-creation JWT (no orgId yet) on this
  // layout's one-time SSR render, even though client-side requests moments
  // later see a refreshed session with the correct orgId (NextAuth re-derives
  // claims per session fetch, but this layout only runs once per navigation
  // into the route group — it never gets a second chance). That silently
  // skipped BOTH requireAppAccess (which just no-ops without an orgId) and
  // demo-data seeding below, so a freshly-created org could permanently miss
  // seeding for the rest of that browser session even though every module
  // page (auth'd independently via getOrgId) rendered as if nothing were wrong.
  const orgId = session?.user?.id ? await getOrgId(session.user.id) : null;
  await requireAppAccess({
    userId: session?.user?.id,
    orgId,
    appSlug: APP_SLUG,
    isSuperAdmin: session?.user?.isSuperAdmin === true,
    memberRole: session?.user?.membershipRole,
    homeUrl: process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL,
  });

  // Seed demo/sample data BEFORE any child page renders, so no client-side
  // data fetch can ever race ahead of it and cache an empty result (that
  // race was the original bug: pages showed empty until a manual refresh).
  // Idempotent — a single indexed DemoDataState lookup on every request
  // after the first, so this is a no-op cost once an org is seeded/cleared.
  const memberIsAdmin =
    session?.user?.isSuperAdmin === true || ADMIN_TIER_ROLES.has(String(session?.user?.membershipRole ?? ""));
  if (session?.user?.id && orgId && memberIsAdmin) {
    await seedDemoDataForOrg(orgId, session.user.id).catch((err) => {
      // Never swallow silently — a seed failure should be diagnosable from
      // server logs, not invisible. Never blocks the dashboard from rendering.
      console.error("[demo-data] seedDemoDataForOrg failed", { orgId, error: err });
      return null;
    });
  }

  return <DashboardShell>{children}</DashboardShell>;
}
