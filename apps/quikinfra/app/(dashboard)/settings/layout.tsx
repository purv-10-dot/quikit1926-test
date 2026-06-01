import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/auth/context";

/**
 * Settings subtree guard. Anyone with a "manage" grant on the settings-
 * tier resources can reach these pages:
 *
 *   construction.users.manage      ← invite / list users
 *   construction.workflows.manage  ← approval workflows
 *   construction.roles.manage      ← per-app roles
 *   construction.settings.manage   ← misc settings
 *
 * Tenant admins get these by default (admin role grants `*.manage`).
 * Sub-admins can be granted access individually via UserPermissionExtra
 * (the "Grant Settings access" checkbox on the Add User form). Platform
 * super admins also pass via the `*` wildcard.
 *
 * The sidebar already hides these entries from users without the grant,
 * but a sidebar gate is cosmetic — anyone could type the URL. This
 * server check is the actual security boundary.
 */
const SETTINGS_PERMS = [
  "construction.users.manage",
  "construction.workflows.manage",
  "construction.roles.manage",
  "construction.settings.manage",
];

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
  const hasSettingsAccess =
    ctx.permissions.has("*") ||
    SETTINGS_PERMS.some((p) => ctx.permissions.has(p));
  if (!hasSettingsAccess) redirect("/dashboard");
  return <>{children}</>;
}
