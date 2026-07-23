import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { ActivityTrackerClient } from "@/components/dashboard/activity-tracker-client";

/**
 * Activity Target Tracker — Super Admin / Org Admin / CRM Administrator only.
 * Non-admins are redirected before any data loads.
 */
export default async function ActivityTrackerPage() {
  const user = await requireUser();
  if (!isCrmAdminUser(user)) {
    redirect("/dashboard");
  }
  return <ActivityTrackerClient />;
}
