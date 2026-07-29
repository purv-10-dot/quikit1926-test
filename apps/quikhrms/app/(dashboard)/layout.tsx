import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/hrms/layout/sidebar";
import { TopBar } from "@/components/hrms/layout/top-bar";
import { DelegationBanner } from "@/components/hrms/layout/delegation-banner";
import { AuthGuard } from "@/components/hrms/layout/auth-guard";
import { SessionGuard } from "@/components/session-guard";
import { SetupGate } from "@/components/hrms/setup/setup-gate";

// Reads the session per request and gates on app access — never prerender.
export const dynamic = "force-dynamic";

export default async function HRMSLayout({ children }: { children: React.ReactNode }) {
  // Server-side app-access gate — runs before any dashboard UI renders, so a
  // user without QuikHRMS access is redirected to the landing page + popup with
  // no flash of the app.
  const session = await getServerSession(authOptions);
  await requireAppAccess({
    userId: session?.user?.id,
    orgId: session?.user?.orgId,
    appSlug: "quikhrms",
    isSuperAdmin: session?.user?.isSuperAdmin === true,
    memberRole: session?.user?.membershipRole,
    homeUrl: process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL,
  });

  return (
    <AuthGuard>
      <SessionGuard>
        {/* First-run org-setup gate — blocks admins behind a checklist until
            core configuration is complete (no-op for non-admins / once done). */}
        <SetupGate />
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0b1220]">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {/* Global nav bar — present on every /hrms page, not just the home dashboard. */}
            {/* Top bar + module sub-menu stick together as one header block. */}
            <div className="sticky top-0 z-30">
              <div className="hrms-topbar bg-gray-50 dark:bg-[#0b1220] px-4 lg:px-6 py-3 border-b border-gray-200/60 dark:border-white/10">
                <TopBar />
              </div>
            </div>
            <div className="px-4 py-4 lg:px-6 lg:py-5">
              <DelegationBanner />
              {children}
            </div>
          </main>
        </div>
      </SessionGuard>
    </AuthGuard>
  );
}
