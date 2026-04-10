"use client";

import { useSession } from "next-auth/react";
import { useTeams } from "./useTeams";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY[ROLES.ADMIN];

/**
 * Client-side permission check for managing a team's KPIs.
 *
 * Returns true when:
 *   - The user's membershipRole has an admin-level rank (>= ADMIN in ROLE_HIERARCHY), OR
 *   - The user is the team.headId for the given team
 *
 * Matches the server-side `canManageTeamKPI` helper. The server is still the source
 * of truth and will return 403 if its check disagrees, but keeping the two in sync
 * means team heads and admins both see the correct UI affordances.
 */
export function useCanManageTeamKPI(teamId: string | undefined | null): boolean {
  const { data: session } = useSession();
  const { data: teams = [] } = useTeams();

  if (!session?.user?.id || !teamId) return false;

  // 1. Admin role check (covers admin, executive if configured, super_admin)
  const role = (session.user as { membershipRole?: string }).membershipRole;
  if (role) {
    const level = ROLE_HIERARCHY[role] ?? 0;
    if (level >= ADMIN_MIN_LEVEL) return true;
  }
  if ((session.user as { isSuperAdmin?: boolean }).isSuperAdmin) return true;

  // 2. Team head check
  const team = teams.find((t) => t.id === teamId);
  return !!team && team.headId === session.user.id;
}
