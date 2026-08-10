import { requireUser } from "@/lib/auth/require";
import { LeadFieldsPageClient } from "@/components/settings/lead-fields-page";

export default async function LeadFieldsSettingsPage() {
  await requireUser();
  return <LeadFieldsPageClient />;
}
