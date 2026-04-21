"use client";

import { useSession } from "next-auth/react";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";
import type { WWWItem } from "@/lib/types/www";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY[ROLES.ADMIN];

/**
 * Client-side permission check — mirrors the server-side `canEditWWW` helper
 * (`@/lib/api/wwwPermissions`). The server is always the source of truth; this
 * is a UX hint so we can grey-out edit controls.
 *
 * Allowed (ANY of):
 *   - Creator (`item.createdBy === userId`)
 *   - Assignee (`item.who === userId`)
 *   - Admin-level role on this tenant (role >= admin)
 *   - Super-admin flag on the user
 */
export function useCanEditWWW(
  item: Pick<WWWItem, "createdBy" | "who"> | null | undefined,
): boolean {
  const { data: session } = useSession();
  if (!item || !session?.user?.id) return false;

  const userId = session.user.id;

  // 1. Creator or assignee
  if (item.createdBy === userId || item.who === userId) return true;

  // 2. Admin-level role
  const role = (session.user as { membershipRole?: string }).membershipRole;
  if (role && (ROLE_HIERARCHY[role] ?? 0) >= ADMIN_MIN_LEVEL) return true;

  // 3. Super-admin
  if ((session.user as { isSuperAdmin?: boolean }).isSuperAdmin) return true;

  return false;
}
