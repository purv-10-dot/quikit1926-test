import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { loadMyPermissions } from "@/lib/api/permissions";
import { Nav } from "./_components/nav";
import { Hero } from "./_components/hero";
import { Features } from "./_components/features";
import { FooterCTA } from "./_components/footer-cta";

/**
 * Public marketing landing at `/`. Logged-in users are server-redirected past
 * the brochure. The session gate is the only coupling between this page and the
 * app (reads quikasset's own authOptions).
 *
 * Landing target is capability-based: users who can view the dashboard (admins
 * / asset managers) go to /dashboard; everyone else — notably plain Members,
 * who no longer hold Dashboard:view — lands on /employee-view ("My Assets").
 *
 * Exception: a signed-in user bounced here by `requireAppAccess` for lacking
 * QuikAsset access (`?reason=no_app_access`) must see the landing + the
 * access-denied popup — NOT be redirected (which would loop). Mirrors
 * quiktrack's marketing page.
 */
export const dynamic = "force-dynamic";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) {
    // Compute the target first, then redirect exactly once. Never wrap
    // redirect() in try/catch — it signals via a thrown NEXT_REDIRECT.
    let target = "/dashboard";
    const orgId = await getOrgId(session.user.id);
    if (orgId) {
      const perms = await loadMyPermissions(session.user.id, orgId);
      const canSeeDashboard = perms.isAdmin || perms.permissions.includes("Dashboard:view");
      target = canSeeDashboard ? "/dashboard" : "/employee-view";
    }
    // No org resolved → fall through to /dashboard so the dashboard layout's
    // access gate (requireAppAccess) decides, exactly as before.
    redirect(target);
  }

  return (
    <main>
      <AppAccessDeniedPopup appName="QuikAsset" />
      <Nav />
      <Hero />
      <Features />
      <FooterCTA />
    </main>
  );
}
