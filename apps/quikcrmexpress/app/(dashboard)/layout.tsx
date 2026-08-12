import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAppAccess } from "@quikit/auth/app-access";
import { ThemeApplier } from "@quikit/ui/theme-applier";
import { requireUser } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { prisma } from "@/lib/db/prisma";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { DashboardProviders } from "@/components/layout/dashboard-providers";
import { SessionGuard } from "@/components/session-guard";
import { SupportLauncher } from "@quikit/ui/support";

const ADMIN_ROLE = "Administrator";
const APP_SLUG = "quikcrmexpress";

// Reads the session per request and gates on app access — never prerender.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();

  /**
   * Platform app-access gate — the same shared guard quikinfra, quikasset and
   * quikchat use. It enforces, in order: the org has OrgAppAccess.enabled for
   * this app; a `requiresOrgAdmin` app needs an admin-tier caller; org/super
   * admins pass on org access alone while everyone else needs an explicit
   * UserAppAccess row; and an expired per-app trial revokes access.
   *
   * This app previously honoured NONE of that — it derived permissions purely
   * from an in-code role map, so a QuikIT super admin granting or revoking the
   * app had no effect here. Running it in the layout (not a page) means an
   * unauthorised user is redirected to `/?reason=no_app_access` before any
   * protected UI paints, where the landing page shows <AppAccessDeniedPopup />.
   */
  await requireAppAccess({
    userId: session.userId,
    orgId: session.orgId,
    appSlug: APP_SLUG,
    isSuperAdmin: session.isSuperAdmin === true,
    memberRole: session.membershipRole,
    homeUrl: process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL,
  });

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
    getEffectiveMatrix(session.userId, session.orgId, session.role),
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
      {/* Writes the --accent-* CSS variables the accent-* Tailwind classes
       * resolve against. Without it every one of this app's ~387 accent-*
       * usages silently fell back to the hardcoded default in
       * packages/ui/tailwind.config.ts, so tenant accent colours had no
       * effect. quikscale, quiktrack and quikasset all mount this. */}
      <ThemeApplier apiEndpoint="/api/settings/theme" />
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
      {/* Floating support launcher — a sibling of the shell so it stays pinned
       * to the viewport rather than to one of the shell's scroll containers.
       * Backed by app/api/support/*. 15 of 16 apps ship this; _template marks
       * it "NOT optional — every QuikIT app ships Contact Support". */}
      {/* appName is passed explicitly: packages/shared/lib/supportContent.ts has
       * no `quikcrmexpress` entry yet, and getSupportContent() falls back to a
       * generic "QuikIT" panel header for unregistered slugs. Registering the
       * slug properly means editing packages/shared, which this app may not do
       * (app CLAUDE.md rule #2) — that is an integration-owner request. */}
      <SupportLauncher appSlug="quikcrmexpress" appName="QuikCRMExpress" />
    </SessionGuard>
  );
}
