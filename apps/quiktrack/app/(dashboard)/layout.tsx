import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { authOptions } from "@/lib/auth";
import { SupportLauncher } from "@quikit/ui/support";
import { DashboardShell } from "@/components/shell/dashboard-shell";

// Reads the session per request and gates on app access — never prerender.
export const dynamic = "force-dynamic";

const APP_SLUG = "quiktrack";

/**
 * Server layout for the dashboard route group.
 *
 * The app-access check runs HERE, server-side, before any protected UI is
 * rendered. A user who isn't granted QuikTrack is redirected to the landing
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
  await requireAppAccess({
    userId: session?.user?.id,
    orgId: session?.user?.orgId,
    appSlug: APP_SLUG,
    isSuperAdmin: session?.user?.isSuperAdmin === true,
    memberRole: session?.user?.membershipRole,
    homeUrl: process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL,
  });

  return (
    <>
      <DashboardShell>{children}</DashboardShell>
      {/* Floating support launcher — a sibling of the shell so it stays pinned
          to the viewport rather than to one of the shell's scroll containers. */}
      <SupportLauncher appSlug="quiktrack" />
    </>
  );
}
