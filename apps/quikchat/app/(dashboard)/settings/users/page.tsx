import { requireAdmin } from "@/lib/authz/requireAdmin";
import { UsersTab } from "./components/UsersTab";

export const dynamic = "force-dynamic";

/**
 * Admin surface: invite people into QuikChat by email (native password or
 * SSO). Server-gated by `requireAdmin` (platform admin-tier OR the QuikChat
 * system `admin` role) — mirrors `settings/roles/page.tsx`.
 */
export default async function UsersSettingsPage() {
  const gate = await requireAdmin();
  if ("error" in gate) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-900">Admin access required</h1>
          <p className="mt-1 text-sm text-gray-500">
            You don&rsquo;t have permission to manage users for this organization.
          </p>
        </div>
      </div>
    );
  }

  return <UsersTab />;
}
