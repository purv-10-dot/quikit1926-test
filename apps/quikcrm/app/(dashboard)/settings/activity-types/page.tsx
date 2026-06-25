import { requireUser } from "@/lib/auth/require";
import { ActivityTypesPageClient } from "@/components/settings/activity-types-page";

export default async function ActivityTypesSettingsPage() {
  await requireUser();
  return <ActivityTypesPageClient />;
}
