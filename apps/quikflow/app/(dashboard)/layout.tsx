import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { authOptions } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

/**
 * Protected dashboard layout (server component). Runs the app-access guard
 * BEFORE any protected UI renders — an org without QuikFlow access is
 * redirected to `/?reason=no_app_access` and never sees the dashboard.
 * Mirrors the pattern in apps/quikscale.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  await requireAppAccess({
    userId: session?.user?.id,
    orgId: session?.user?.orgId,
    appSlug: "quikflow",
    isSuperAdmin: session?.user?.isSuperAdmin === true,
    memberRole: session?.user?.membershipRole,
    homeUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
  });

  return <DashboardShell session={session}>{children}</DashboardShell>;
}
