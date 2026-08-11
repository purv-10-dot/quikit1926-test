import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { UsersPageClient } from "@/components/settings/users-page";

/**
 * Settings → Users — Super Admin / Org Admin / CRM Administrator only.
 *
 * SalesManager, SalesUser, MarketingUser and FinanceUser are redirected before
 * any client code loads, so hiding the nav entry (topbar SETTINGS_MENU +
 * the settings tab bar) is not the only line of defence for a direct URL hit.
 * The underlying /api/settings/users routes still enforce their own
 * `users` view/create/edit permission checks independently.
 */
export default async function UsersSettingsPage() {
  const user = await requireUser();
  if (!isCrmAdminUser(user)) {
    redirect("/dashboard");
  }
  return <UsersPageClient />;
}
