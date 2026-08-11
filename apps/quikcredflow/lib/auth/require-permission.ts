/**
 * Centralized permission gate for Settings (and other) routes.
 *
 * Wraps assertModule with a uniform error contract and consolidates the rule
 * that Settings module access requires either the user be an Administrator
 * or have the explicit `settings` module permission.
 */

import type { SessionUser } from "@/types/permission";
import { assertModule } from "@/lib/auth/permissions";
import { isAdminRole } from "@/lib/auth/role-grants";
import type { ModuleAction } from "@/types/permission";

export class PermissionDeniedError extends Error {
  constructor(message: string, public statusCode = 403) {
    super(message);
  }
}

/**
 * Throws PermissionDeniedError unless the user is an Administrator. Use for
 * sensitive, admin-only surfaces such as managing permission templates — these
 * must NOT be reachable via a `settings` grant a user could give themselves.
 */
export function assertAdmin(user: SessionUser): void {
  if (!isAdminRole(user.role)) {
    throw new PermissionDeniedError("Administrator access required");
  }
}

/**
 * Throws PermissionDeniedError (or whatever assertModule throws) if the user
 * lacks permission. Administrators are always allowed.
 */
export async function requirePermission(
  user: SessionUser,
  module: string,
  action: ModuleAction,
): Promise<void> {
  if (user.role === "Administrator") return;
  await assertModule(user, module, action);
}

/**
 * Convenience: returns true if the user has the permission (no throw).
 * Useful for conditional UI hints inside route handlers, e.g. determining
 * whether to include sensitive fields in a response.
 */
export async function hasPermission(
  user: SessionUser,
  module: string,
  action: ModuleAction,
): Promise<boolean> {
  try {
    await requirePermission(user, module, action);
    return true;
  } catch {
    return false;
  }
}
