import { allPermissionPairs } from "@/lib/api/permissionsRegistry";

/**
 * True when a role already grants EVERY valid permission pair — i.e. the user
 * has nothing left to add as an extra (e.g. Admin). Drives the "all permissions
 * are inherited from the role" note in the per-user permissions editor, which
 * explains why no cell is toggleable for a broadly-privileged user.
 */
export function allValidPairsGranted(roleGrants: Set<string>): boolean {
  return allPermissionPairs().every((p) => roleGrants.has(`${p.resource}:${p.action}`));
}
