import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { SalesCostPageClient } from "@/components/settings/sales-cost-page";

/**
 * Sales Cost Management — Super Admin / Org Admin / CRM Administrator only.
 *
 * This is an admin-level financial surface (salaries, per-rep spend), so the
 * guard runs server-side before any client code loads: a direct URL hit from a
 * Sales Manager or Sales User redirects without ever rendering the page or
 * shipping cost data to the browser. The APIs re-check independently via
 * requireSalesCostAdmin, so hiding the nav entry is never the only defence.
 */
export default async function SalesCostSettingsPage() {
  const user = await requireUser();
  if (!isCrmAdminUser(user)) {
    redirect("/dashboard");
  }
  return <SalesCostPageClient />;
}
