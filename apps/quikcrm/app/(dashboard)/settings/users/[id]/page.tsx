import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { EditUserPageClient } from "@/components/settings/user-detail-page";

/**
 * Settings → Users → edit — same gate as the Users list page. Guarded here too
 * because this is a distinct route: without it, SalesManager / SalesUser /
 * MarketingUser / FinanceUser could still deep-link straight to a user record.
 */
export default async function EditUserSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  if (!isCrmAdminUser(user)) {
    redirect("/dashboard");
  }
  return <EditUserPageClient id={params.id} />;
}
