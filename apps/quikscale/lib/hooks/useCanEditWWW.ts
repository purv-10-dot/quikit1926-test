"use client";

import { useSession } from "next-auth/react";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import type { WWWItem } from "@/lib/types/www";

/**
 * Client-side permission check — mirrors the server-side `canEditWWW` helper
 * (`@/lib/api/wwwPermissions`). The server is always the source of truth; this
 * is a UX hint so we can grey-out edit controls.
 *
 * Allowed (ANY of):
 *   - Creator (`item.createdBy === userId`)
 *   - Assignee (`item.who === userId`)
 *   - Org admin (RBAC v2 `isAdmin` — same signal the sidebar/app use; the
 *     legacy `membershipRole` hint missed v2 admins whose legacy role is just
 *     `member`)
 */
export function useCanEditWWW(
  item: Pick<WWWItem, "createdBy" | "who"> | null | undefined,
): boolean {
  const { data: session } = useSession();
  const { isAdmin } = useMyPermissions();
  if (!item || !session?.user?.id) return false;

  const userId = session.user.id;

  // 1. Creator or assignee
  if (item.createdBy === userId || item.who === userId) return true;

  // 2. Org admin (RBAC v2)
  return isAdmin;
}

/**
 * Client-side check for editing the ASSIGNMENT fields — "Who" (assignee) and
 * "When" (due date). Mirrors the server-side `canEditWWWAssignment` helper.
 *
 * Stricter than {@link useCanEditWWW}: the assignee is NOT allowed here. Only
 * the creator (or an admin) may change Who/When; everyone else sees those two
 * fields disabled. UX hint only — the server enforces it.
 *
 * Allowed (ANY of):
 *   - Creator (`item.createdBy === userId`)
 *   - Org admin (RBAC v2 `isAdmin`)
 */
export function useCanEditWWWAssignment(
  item: Pick<WWWItem, "createdBy"> | null | undefined,
): boolean {
  const { data: session } = useSession();
  const { isAdmin } = useMyPermissions();
  if (!item || !session?.user?.id) return false;

  const userId = session.user.id;

  // 1. Creator
  if (item.createdBy === userId) return true;

  // 2. Org admin (RBAC v2)
  return isAdmin;
}
