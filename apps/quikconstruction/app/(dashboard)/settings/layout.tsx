import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/next-auth-options";
import { ensureLocalUser } from "@/lib/auth/jit-provision";

/**
 * Settings layout — admin-only gate.
 *
 * Why this lives here (server component) and not in middleware:
 * SSO-issued JWTs from QuikIT central don't carry construction-app
 * specific fields like `roleKey`. The middleware (Edge runtime) can't
 * query Postgres. So the role check happens here, where we have full
 * Prisma access via `ensureLocalUser` (the same JIT helper the parent
 * dashboard layout uses — fast path on the second call within a single
 * request because the row is already in PG's plan cache).
 *
 * Allowed roles mirror the wildcard / SETTINGS_USERS+SETTINGS_WORKFLOWS
 * grants in src/lib/rbac/roles.ts. Kept as a literal set here so this
 * layout is self-contained.
 */
const SETTINGS_ADMIN_ROLES = new Set([
  "platform_super_admin",
  "tenant_admin",
  "company_admin",
]);

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  // Defensive — middleware should already have redirected unauth'd
  // requests; the parent dashboard layout also covers this. Still bail
  // out cleanly if a render reaches here without a session.
  if (!email) {
    redirect("/login");
  }

  // Re-uses the JIT helper. By the time we reach this layout, the parent
  // dashboard layout has already run ensureLocalUser, so this is the
  // fast-path lookup (one indexed SELECT, no INSERT).
  const result = await ensureLocalUser(email);
  if (!result.localUser) {
    redirect("/dashboard");
  }

  if (!SETTINGS_ADMIN_ROLES.has(result.localUser.roleKey)) {
    // Authenticated but not authorised for /settings/*. Bounce to the
    // dashboard rather than /login — they're a valid user, just not
    // an admin.
    redirect("/dashboard");
  }

  return <>{children}</>;
}
