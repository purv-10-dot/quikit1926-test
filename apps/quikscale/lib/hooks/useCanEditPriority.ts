"use client";

import { useSession } from "next-auth/react";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY[ROLES.ADMIN];

/**
 * Client-side permission check — mirrors the server-side `canEditPriority`
 * helper (`@/lib/api/priorityPermissions`). The server is always the source
 * of truth; this is a UX hint for greying edit controls.
 *
 * Allowed when ANY of:
 *   - Creator (`priority.createdBy === userId`)
 *   - Assignee (`priority.owner === userId`)
 *   - Admin-level role
 *   - Super-admin
 */
export function useCanEditPriority(
  priority: { createdBy?: string; owner?: string } | null | undefined,
): boolean {
  const { data: session } = useSession();
  if (!priority || !session?.user?.id) return false;

  const userId = session.user.id;

  if (priority.createdBy === userId) return true;
  if (priority.owner === userId) return true;

  const role = (session.user as { membershipRole?: string }).membershipRole;
  if (role && (ROLE_HIERARCHY[role] ?? 0) >= ADMIN_MIN_LEVEL) return true;

  if ((session.user as { isSuperAdmin?: boolean }).isSuperAdmin) return true;

  return false;
}
