/**
 * VC / Fund portal layout.
 *
 * Used by Analyst, Partner, Fund Admin, IC Member roles. Three-pane shell:
 * left rail (nav), top context bar (tenant + fund + search), main content.
 *
 * Sprint 1 ships a minimal shell; Sprint 2 wires real navigation from the
 * module registry, tenant/fund switcher, and the global command palette.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import NotificationBell from "@/components/notification-bell";
import OrgSwitcher from "@/components/org-switcher";
import { requireSession } from "@/lib/require-session";
import { getVCRole, FUND_ADMIN_ROLES } from "@/lib/rbac";
import { homePathForPortal, portalForRole } from "@/lib/roles";
import { db } from "@/lib/db";
import { SessionGuard } from "@/components/session-guard";

const ALL_NAV_ITEMS = [
  { label: "Home",      href: "/home",      roles: null },
  { label: "Sourcing",  href: "/sourcing",  roles: null },
  { label: "Deals",     href: "/deals",     roles: null },
  { label: "Investors", href: "/investors", roles: FUND_ADMIN_ROLES },
  { label: "Admin",     href: "/admin",     roles: FUND_ADMIN_ROLES },
] as const;

export default async function VCLayout({ children }: { children: React.ReactNode }) {
  // Hardened: redirects to /login when no session. Demo bypass requires
  // QUIKVC_DEV_BYPASS=1 (see lib/dev-session.ts).
  const { userId, orgId } = await requireSession();
  const [role, org, fundProfile] = await Promise.all([
    getVCRole(userId, orgId),
    db.org.findUnique({
      where: { id: orgId },
      select: { name: true },
    }),
    db.vCFundProfile.findUnique({
      where: { orgId },
      select: { fundName: true },
    }),
  ]);

  // Portal gate — bounce non-VC roles to their own portal home. Without
  // this, a founder or investor who navigates to /home (manually or via a
  // stale URL) gets the VC layout rendered with their data missing/wrong.
  const portal = portalForRole(role ?? undefined);
  if (portal !== "vc") {
    redirect(homePathForPortal(portal));
  }

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(
    (i) => !i.roles || (role && i.roles.includes(role)),
  );
  return (
    <SessionGuard>
    <div className="min-h-screen flex bg-gray-50">
      {/* Left rail — slim nav (hidden on mobile, shown on md+) */}
      <aside className="hidden md:flex w-56 bg-slate-900 text-slate-100 flex-shrink-0 flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-xs uppercase tracking-wider text-slate-400">QuikVC OS</p>
          <p className="text-sm font-semibold mt-0.5">VC / Fund</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-5 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-400">
          {role ? <>Signed in as <strong className="text-slate-200">{role}</strong></> : "Signed in"}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top context bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <OrgSwitcher currentTenantName={org?.name ?? undefined} />
            {/* Fund switcher placeholder — single-fund-per-tenant in v1; UI hint
                only. Becomes a dropdown when multi-fund support lands. */}
            <span className="text-gray-400 hidden sm:inline">/</span>
            <span className="text-gray-600 hidden sm:inline truncate">
              {fundProfile?.fundName ?? "Fund I"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="hidden sm:inline-block text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              Search…
            </button>
            <NotificationBell />
            <button className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap">
              + New Deal
            </button>
          </div>
        </header>

        {/* Mobile nav strip — visible below md */}
        <nav className="md:hidden bg-slate-900 text-slate-200 flex overflow-x-auto px-2 py-1.5 gap-1 flex-shrink-0">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1 text-xs whitespace-nowrap rounded hover:bg-slate-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
    </SessionGuard>
  );
}
