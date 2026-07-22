import { requireAdmin } from "@/lib/authz/requireAdmin";
import { RolesTab } from "./components/RolesTab";

export const dynamic = "force-dynamic";

/**
 * Admin surface: Roles & Permissions matrix. Server-gated by `requireAdmin`
 * (platform admin-tier OR the QuikChat system `admin` role). Inherits the
 * (dashboard) layout's app-access gates. Non-admins get an access-denied
 * message (the layout already guaranteed app access, so this only fails for
 * authenticated non-admin members).
 */
export default async function RolesSettingsPage() {
  const gate = await requireAdmin();
  if ("error" in gate) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-900">Admin access required</h1>
          <p className="mt-1 text-sm text-gray-500">
            You don&rsquo;t have permission to manage roles for this organization.
          </p>
        </div>
      </div>
    );
  }

  return <RolesTab />;
}
