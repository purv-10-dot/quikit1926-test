import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { ThemeApplier } from "@quikit/ui/theme-applier";
import { authOptions } from "@/lib/auth";
import { SessionGuard } from "@/components/session-guard";

// Reads the session per request and gates on app access — never prerender.
export const dynamic = "force-dynamic";


const APP_SLUG = "quikchat";

/**
 * Server layout for the (dashboard) route group — wraps the QuikChat workspace
 * (`/dashboard`) and the admin `/settings/roles` page. Runs the standard
 * app-access gate server-side before any protected UI paints.
 *
 * `requireAppAccess` covers BOTH the org-level entitlement (OrgAppAccess) and
 * the per-user grant (UserAppAccess). A user who isn't granted QuikChat — for
 * either reason — is redirected to the PUBLIC marketing landing
 * (`/?reason=no_app_access&…`), where <AppAccessDeniedPopup /> shows the
 * "Access not granted" message. This is the EXACT flow QuikInfra / QuikTrack /
 * every other app use (they call only `requireAppAccess` — no `gateTenantAppRoute`
 * launcher bounce, which is what previously sent QuikChat users straight to
 * `/apps` instead of showing the popup).
 *
 * Session note: QuikChat is an OAuth-client app, so `isSuperAdmin` is always
 * false here (`createOAuthClientOptions` hardcodes it) — org-admins still pass
 * via `membershipRole`. Same behavior as every other consumer app.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  await requireAppAccess({
    userId: session?.user?.id,
    orgId: session?.user?.orgId,
    appSlug: APP_SLUG,
    isSuperAdmin: session?.user?.isSuperAdmin === true,
    memberRole: session?.user?.membershipRole,
    homeUrl: process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL,
  });

  return (
    <SessionGuard>
      {/* Platform accent parity — themes the `accent-*` Tailwind classes from
          the user's stored accentColor (same source as every other app). */}
      <ThemeApplier />
      {children}
    </SessionGuard>
  );
}
