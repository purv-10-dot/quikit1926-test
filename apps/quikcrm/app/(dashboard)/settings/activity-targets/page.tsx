import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { ActivityTargetsPageClient } from "@/components/settings/activity-targets-page";

/**
 * Activity Targets settings — Super Admin / Org Admin / CRM Administrator only.
 * Unauthorized users are redirected before any client code loads, so a direct
 * URL hit does not expose the page.
 */
export default async function ActivityTargetsSettingsPage() {
  const user = await requireUser();
  if (!isCrmAdminUser(user)) {
    redirect("/dashboard");
  }
  return <ActivityTargetsPageClient />;
}
