"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { useRoles } from "@/lib/hooks/use-roles";
import { isPathAllowed, type NavAccessCtx } from "@/lib/rbac/nav-access";

/**
 * Route-level permission gate for every dashboard page.
 *
 * Hiding a sidebar link never stopped the URL from working — the dashboard's
 * Quick actions, a pasted link or browser history opened the page regardless
 * of the role's permissions. This renders an access notice instead of the
 * page whenever the nav tree says the route isn't reachable for this user.
 *
 * Server APIs keep their own `withAuth` checks; this closes the UI hole.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { permissions, navKeys, employee, preBoarding, isLoading } = useDashboardConfig();
  const { roles } = useRoles();

  // Config still loading — render the page rather than flashing a denial that
  // would immediately disappear.
  if (isLoading) return <>{children}</>;

  const ctx: NavAccessCtx = {
    isSuper: permissions.includes("*"),
    permissions,
    roles,
    navKeys,
    preBoarding,
    employeeId: employee?.id ?? null,
  };

  if (isPathAllowed(pathname ?? "", ctx)) return <>{children}</>;

  // Same "Access restricted" pattern already used on the employee profile
  // page (app/(dashboard)/employees/[id]/page.tsx) for a 403 — one consistent
  // denial screen across the app instead of a different one per surface.
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5 bg-amber-50 text-amber-500">
        <ShieldAlert size={28} />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">Access restricted</h2>
      <p className="text-sm text-gray-500 mt-1.5 max-w-sm">
        You don&apos;t have permission to view this page. If you think this is a mistake, contact your HR administrator.
      </p>
      <Link href="/dashboard" className="mt-4 inline-flex items-center gap-1.5 btn btn-primary"><ArrowLeft size={14} /> Back</Link>
    </div>
  );
}
