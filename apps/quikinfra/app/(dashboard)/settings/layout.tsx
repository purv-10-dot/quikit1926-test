import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/auth/context";

/**
 * Settings subtree guard. The `/settings/*` pages (Users, Workflows, future
 * platform-managed surfaces) are intentionally restricted to the platform
 * Super Admin role. Tenant Admins — even with the `*` permission wildcard
 * — are bounced back to the dashboard.
 *
 * The sidebar already hides these entries from non-Super-Admins, but a
 * sidebar gate is cosmetic: anyone could type the URL. This server check
 * is the actual security boundary. Runs on every request to anything
 * under `/settings/*` (Next.js executes the closest layout above the
 * matched page).
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();
  if (!ctx) {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL;
    redirect(authUrl ? `${authUrl}/login` : "/dashboard");
  }
  if (ctx.userType !== "SUPER_ADMIN") redirect("/dashboard");
  return <>{children}</>;
}
