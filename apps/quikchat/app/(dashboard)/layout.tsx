import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getAppAccess } from "@quikit/auth/app-access";
import { gateTenantAppRoute } from "@quikit/auth/feature-gate";
import { authOptions } from "@/lib/auth";

// Reads the session per request and gates on app access — never prerender.
export const dynamic = "force-dynamic";

const APP_SLUG = "quikchat";

/**
 * Server layout for the (dashboard) route group — wraps the ChatShell SPA
 * (`/`) and the admin `/settings/roles` page. Runs the app-access gates
 * server-side before any protected UI paints. Renders `children` unchanged
 * (no new chrome) so ChatShell is unaffected.
 *
 * Enforcement order (matches the RBAC invariant OrgAppAccess → per-user):
 *   1. `gateTenantAppRoute` — org-level hard block (revoked app / no org).
 *      Redirects to the launcher (external origin) — loop-safe.
 *   2. per-user access via `getAppAccess`.
 *
 * ⚠️ We deliberately do NOT use `requireAppAccess`: it ends in
 * `redirect("/?reason=…")`, and in QuikChat `/` IS this gated page (the SPA),
 * so that would infinite-loop. We call the lower-level `getAppAccess` and
 * bounce unauthorized users to the launcher instead. The ultimate fallback is
 * `/login` (a NON-gated path) — never `/`.
 *
 * Session note: QuikChat is an OAuth-client app, so `isSuperAdmin` is always
 * false here (`createOAuthClientOptions` hardcodes it) — org-admins still pass
 * via `membershipRole`. Same behavior as every other consumer app.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await gateTenantAppRoute(APP_SLUG, authOptions);

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const orgId = session?.user?.orgId;

  if (userId && orgId) {
    const { hasAccess } = await getAppAccess({
      userId,
      orgId,
      appSlug: APP_SLUG,
      isSuperAdmin: session?.user?.isSuperAdmin === true,
      memberRole: session?.user?.membershipRole,
    });
    if (!hasAccess) {
      const launcher = (process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(
        /\/+$/,
        "",
      );
      redirect(launcher ? `${launcher}/apps?reason=no_app_access` : "/login");
    }
  }

  return <>{children}</>;
}
