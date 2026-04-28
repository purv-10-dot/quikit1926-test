/**
 * Root entry — redirect to the portal home for the user's role.
 *
 * Auth-gated: middleware already ensures session exists. We map the
 * NextAuth `membershipRole` to a portal (VC / Founder / Investor).
 *
 * Sprint 2 dev override (kept until external IC member onboarding flow lands):
 *   - `?role=` query param overrides the session role for QA / preview.
 *     Removes once Sprint 5 ships full role lifecycle.
 */
import { redirect } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { homePathForPortal, portalForRole, type QuikVCRole } from "@/lib/roles";

export default async function RootPage({
  searchParams,
}: {
  searchParams?: { role?: string };
}) {
  const session = await getDevAwareSession();

  // Dev override (remove in Sprint 5)
  const overrideRole = searchParams?.role as QuikVCRole | undefined;

  // Session-based role: membershipRole comes from packages/auth/types.ts augment.
  // Falls back to "founder" — the most-restricted portal — when no membership.
  const sessionRole = (session?.user?.membershipRole as QuikVCRole | undefined) ?? "founder";

  const role = overrideRole ?? sessionRole;
  const portal = portalForRole(role);
  redirect(homePathForPortal(portal));
}
