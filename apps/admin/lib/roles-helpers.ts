/**
 * DEFERRED — depends on AppRole / AppPermission / AppRolePermission /
 * UserAppRole tables not yet in the shared schema. See
 * apps/new-admin/MIGRATION_NOTES.md for the migration path. Until the
 * tables exist these helpers are no-ops so callers can be wired today
 * without runtime errors.
 *
 * The original bodies (copy preserved in MIGRATION_NOTES) should be
 * restored once the schema is migrated.
 */

export async function ensureSystemRoles(
  _orgId: string,
  _appId: string,
): Promise<void> {
  // no-op until schema migrates
}

export async function assignDefaultRolesForAccess(
  _orgId: string,
  _assignments: { userId: string; appId: string }[],
): Promise<void> {
  // no-op until schema migrates
}

export async function assignNamedRolesForAccess(
  _orgId: string,
  _assignments: { userId: string; appId: string; roleName: string }[],
): Promise<void> {
  // no-op until schema migrates
}
