/**
 * Admin section layout — fund-admin/admin only.
 *
 * Anyone else gets a 403-style block screen with no leaked data. Server-side
 * check means this is enforced on every navigation, not just client routing.
 */
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";
import { getVCRole, FUND_ADMIN_ROLES } from "@/lib/rbac";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;

  if (!tenantId || !userId) {
    return (
      <div className="px-6 py-12 max-w-2xl mx-auto text-center">
        <p className="text-sm text-gray-500">Sign in required.</p>
      </div>
    );
  }

  const role = await getVCRole(userId, tenantId);
  if (!role || !FUND_ADMIN_ROLES.includes(role)) {
    return (
      <div className="px-6 py-12 max-w-2xl mx-auto text-center space-y-3">
        <p className="text-base font-semibold text-gray-900">Restricted area</p>
        <p className="text-sm text-gray-500">
          The Underwriting Setup section is for Fund Admins only. Your current
          role is <strong>{role ?? "none"}</strong>.
        </p>
        <Link href="/home" className="inline-block text-xs text-gray-500 hover:text-gray-900">
          ← Back to home
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
