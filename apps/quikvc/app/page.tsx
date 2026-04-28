/**
 * Root entry — redirect to the portal home for the user's role.
 *
 * Sprint 1 dev-mode: read `?role=` query param so you can preview each portal
 * without auth. Sprint 2 replaces this with NextAuth session lookup.
 */
import { redirect } from "next/navigation";
import { homePathForPortal, portalForRole, type QuikVCRole } from "@/lib/roles";

export default function RootPage({
  searchParams,
}: {
  searchParams?: { role?: string };
}) {
  const role = (searchParams?.role as QuikVCRole | undefined) ?? "founder";
  const portal = portalForRole(role);
  redirect(homePathForPortal(portal));
}
