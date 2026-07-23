import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { loadMyPermissions } from "@/lib/api/permissions";
import { canSeeDashboard } from "@/lib/api/landing";

/**
 * Route gate for /dashboard only. The parent (dashboard) layout has already
 * enforced session + QuikAsset app-access; this adds the Dashboard:view check
 * so a user who lacks it (a plain Member) is redirected to /employee-view
 * server-side, BEFORE the dashboard renders. Safety net for the post-login
 * landing: even if some entry point sends a Member here, they never end up
 * stuck on a page whose /api/dashboard call 403s into an infinite spinner.
 */
export const dynamic = "force-dynamic";

export default async function DashboardGateLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const orgId = await getOrgId(session.user.id);
  if (!orgId) redirect("/login?reason=no_org");

  const perms = await loadMyPermissions(session.user.id, orgId);
  if (!canSeeDashboard(perms)) redirect("/employee-view");

  return <>{children}</>;
}
