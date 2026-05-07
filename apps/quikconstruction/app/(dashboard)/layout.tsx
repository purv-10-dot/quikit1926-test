import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/next-auth-options";
import { ensureLocalUser } from "@/lib/auth/jit-provision";
import { QuikConstructionShell } from "@/components/QuikConstructionShell";

/**
 * Dashboard layout — server component.
 *
 * Runs on every authenticated page render. Two responsibilities:
 *   1. JIT-provision the SSO user into our local `User` table on first
 *      visit (mirrored from QuikIT's `auth."User"` row).
 *   2. Render the shared @quikit/app-shell via QuikConstructionShell
 *      (client component — header, sidebar, user menu, Cmd+K).
 *
 * The middleware does the "are you logged in?" check; this layout
 * additionally confirms the local mirror exists so the role-gate
 * (re-enabled in middleware after this) sees a valid `roleKey`.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  // Defensive — middleware should have redirected unauth'd requests
  // already, but if a stale render slips through, send them to login.
  if (!email) {
    redirect("/login");
  }

  // Mirror the QuikIT central row into our local `User` table on first
  // visit. Idempotent — subsequent calls take the fast "already exists"
  // path and don't re-INSERT.
  const result = await ensureLocalUser(email);

  if (result.notFoundInCentral) {
    // Authenticated session but the email isn't in `auth."User"` either —
    // shouldn't happen in normal flow. Bounce to login with a hint.
    redirect("/login?error=UserNotProvisioned");
  }

  return (
    <QuikConstructionShell>
      {children}
    </QuikConstructionShell>
  );
}
