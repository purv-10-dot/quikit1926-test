import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Default post-sign-in landing page (`redirectPath` for SignInComponent).
 *
 * Routing rules:
 *
 * 1. `?fromOAuth=1` query param → always send the user to the profile
 *    confirmation form, regardless of the User row's firstName/lastName.
 *    The OAuth flow appends this flag so users get a chance to confirm /
 *    edit the name we received from Google/Microsoft on every login.
 * 2. No flag, profile is empty → /login?step=profile (admin-added user
 *    finishing setup via credentials).
 * 3. No flag, profile populated → straight to the launcher.
 *
 * Credentials sign-in already gates profile completeness inline before
 * it reaches this page, so the case in (2) is rare for that path.
 */
export default async function SelectOrgPage({
  searchParams,
}: {
  searchParams: { fromOAuth?: string };
}) {
  const launcherUrl =
    process.env.NEXT_PUBLIC_LAUNCHER_URL ??
    "http://localhost:3001/apps"; // prod-safety-allow: dev fallback

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      firstName: true,
      lastName: true,
      // FRD FR-SA-009 / BR-008 — users created via native invite who didn't
      // accept through the invitation link still carry the system default
      // password. Force them through /set-password before they reach the
      // launcher. Cleared once they save (or click Skip).
      mustChangePassword: true,
    },
  });
  if (!user) {
    redirect("/login");
  }

  const fromOAuth = searchParams?.fromOAuth === "1";
  if (fromOAuth) {
    redirect("/login?step=profile");
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  if (fullName.length === 0) {
    redirect("/login?step=profile");
  }

  // FR-SA-009 / BR-008 — Set-Password gate. Routes any native-invite user who
  // is still on Quikit2026 to the Set-Password screen; cleared after submit
  // or skip so they only ever see this once.
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  redirect(launcherUrl);
}
