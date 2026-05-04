/**
 * Investors section — fund-admin/admin only.
 *
 * Investor list reveals capital commitments which non-admin staff shouldn't
 * see. Gate the whole section at the layout level so every nested page is
 * protected without per-page checks.
 */
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";
import { getVCRole, FUND_ADMIN_ROLES } from "@/lib/rbac";

export default async function InvestorsLayout({ children }: { children: React.ReactNode }) {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  const userId = session?.user?.id;

  if (!orgId || !userId) {
    return (
      <div className="px-6 py-12 max-w-2xl mx-auto text-center">
        <p className="text-sm text-gray-500">Sign in required.</p>
      </div>
    );
  }

  const role = await getVCRole(userId, orgId);
  if (!role || !FUND_ADMIN_ROLES.includes(role)) {
    return (
      <div className="px-6 py-12 max-w-2xl mx-auto text-center space-y-3">
        <p className="text-base font-semibold text-gray-900">Restricted area</p>
        <p className="text-sm text-gray-500">
          Investor management is for Fund Admins only. Your current role is{" "}
          <strong>{role ?? "none"}</strong>.
        </p>
        <Link href="/home" className="inline-block text-xs text-gray-500 hover:text-gray-900">
          ← Back to home
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
