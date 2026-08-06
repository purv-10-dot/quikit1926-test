import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { authOptions } from "@/lib/auth";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { BrandCreationProvider } from "@/components/providers/BrandCreationContext";
import { SessionGuard } from "@/components/session-guard";
import { SupportLauncher } from "@quikit/ui/support";

// Every page under /dashboard reads the session, hits MongoDB, or talks to
// internal API routes. Marking the segment dynamic prevents Next.js from
// trying to statically prerender these routes at build time.
export const dynamic = "force-dynamic";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side app-access gate — runs before any dashboard UI renders, so a
  // user without QuikSocial access is redirected to the landing page + popup
  // with no flash of the app.
  const session = await getServerSession(authOptions);
  await requireAppAccess({
    userId: session?.user?.id,
    orgId: session?.user?.orgId,
    appSlug: "quiksocial",
    isSuperAdmin: session?.user?.isSuperAdmin === true,
    memberRole: session?.user?.membershipRole,
    homeUrl: process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL,
  });

  return (
    <SessionGuard>
      <BrandCreationProvider>
        <DashboardLayout>{children}</DashboardLayout>
        {/* Floating support launcher — a sibling of the layout so it stays
            pinned to the viewport on every dashboard route. */}
        <SupportLauncher appSlug="quiksocial" />
      </BrandCreationProvider>
    </SessionGuard>
  );
}
