import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { authOptions } from "@/lib/auth";
import { SupportLauncher } from "@quikit/ui/support";
import { SessionGuard } from "@/components/session-guard";

// Reads the session per request and gates on app access — never prerender.
export const dynamic = "force-dynamic";

const APP_SLUG = "quiksupport";


/**
 * Server layout for the dashboard route group. Mirrors quikscale/quiktrack:
 *
 * The app-access check runs HERE, server-side, before any protected UI is
 * rendered — a user not granted QuikSupport is redirected to the launcher
 * (`/?reason=no_app_access…`) and the dashboard never paints. The client
 * `SessionGuard` is the live-revocation backstop for access lost mid-session.
 *
 * The full-screen helpdesk chrome (sidebar + app bar + views) is owned by
 * `HelpdeskShell`, rendered inside the dashboard page — not here.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      {children}
      {/* Floating support launcher — QuikSupport is a helpdesk for OUR
          customers' customers; this is how a QuikSupport agent reaches the
          QuikIT team about QuikSupport itself. */}
      <SupportLauncher appSlug="quiksupport" />
    </SessionGuard>
  );
}
