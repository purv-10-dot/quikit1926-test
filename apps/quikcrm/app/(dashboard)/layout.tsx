import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { prisma } from "@/lib/db/prisma";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { DashboardProviders } from "@/components/layout/dashboard-providers";
import { SessionGuard } from "@/components/session-guard";

const ADMIN_ROLE = "Administrator";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  const [profile, matrix] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    }),
    getEffectiveMatrix(session.userId, session.orgId),
  ]);
  if (!profile) {
    // session refers to a user that no longer exists — force re-login
    redirect("/login");
  }
  // Tenant + role come from the OAuth session (Membership), not the User row.
  const user = {
    id: profile.id,
    orgId: session.orgId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    role: session.role,
  };
  const isAdmin = isCrmAdminUser(session) || session.role === ADMIN_ROLE;

  return (
    <SessionGuard>
    <DashboardProviders user={user} matrix={matrix} isAdmin={isAdmin}>
      <div className="flex min-h-screen w-full bg-crm-page">
        {/* App-shell: the sidebar is a full-height column with its own brand
         * header. The topbar sits to its right and houses welcome + global
         * controls (search, notifications, app switcher, user menu). */}
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          {/* Gutter system (single source of truth for page-edge spacing):
            *   mobile  (<sm)  : px-4  → 16px
            *   tablet  (sm)   : px-5  → 20px
            *   laptop  (lg)   : px-6  → 24px
            *   desktop (xl)   : px-8  → 32px
            *   ultrawide(2xl) : px-10 → 40px */}
          <main className="min-w-0 flex-1 overflow-x-hidden px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-3 lg:px-6 lg:pb-6 lg:pt-4 xl:px-8 2xl:px-10">
            {children}
          </main>
        </div>
      </div>
    </DashboardProviders>
    </SessionGuard>
  );
}
