import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/hrms/layout/sidebar";
import { TopBar } from "@/components/hrms/layout/top-bar";
import { BackButton } from "@/components/hrms/layout/back-button";
import { AuthGuard } from "@/components/hrms/layout/auth-guard";
import { SessionGuard } from "@/components/session-guard";

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
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0b1220]">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {/* Global nav bar — present on every /hrms page, not just the home dashboard. */}
            <div className="sticky top-0 z-30 bg-gray-50/85 backdrop-blur supports-[backdrop-filter]:bg-gray-50/70 dark:bg-[#0b1220]/85 px-4 lg:px-6 py-3 border-b border-gray-200/60 dark:border-white/10">
              <TopBar />
            </div>
            <div className="p-6">
              <div className="mb-2">
                <BackButton />
              </div>
              {children}
            </div>
          </main>
        </div>
      </SessionGuard>
    </AuthGuard>
  );
}
