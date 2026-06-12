import { requireUser } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/require-permission";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireUser();
  // Server-side guard so users without `dashboard.view` get a route-level redirect
  // rather than landing on a page that immediately renders an API error.
  const allowed = await hasPermission(session, "dashboard", "view");
  if (!allowed) redirect("/");

  return <DashboardClient userRole={session.role} />;
}
