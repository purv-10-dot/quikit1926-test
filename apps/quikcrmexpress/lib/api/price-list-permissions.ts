import type { SessionUser } from "@/types/permission";

const ADMIN_ROLE = "Administrator";

/** Managers/admins may set prices below floor. Reps may not unless explicitly granted edit. */
export function canOverridePriceFloor(user: SessionUser, allowBelowFloor?: boolean): boolean {
  if (allowBelowFloor === true) return true;
  if (user.role === ADMIN_ROLE) return true;
  return false;
}
