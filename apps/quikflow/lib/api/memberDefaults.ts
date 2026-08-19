/**
 * Member role's curated default grants — the single source of truth for what
 * the auto-seeded default "Member" AppRole can do out of the box.
 *
 * Kept in its own dependency-free module (no Prisma / no `@/lib/db` import) so
 * it can be imported by pure unit tests and by both `seedMemberAppRole`
 * (fresh orgs) and `backfillMemberPermissions` (top-up for existing orgs).
 *
 * Mirrors apps/quikscale/lib/api/memberDefaults.ts. Delete is intentionally
 * NOT a Member default — deleting workflows/templates/connections is a
 * destructive action reserved for admins (or a role an admin explicitly
 * grants it to).
 */
export const MEMBER_DEFAULT_GRANTS: Array<{ resource: string; action: string }> = [
  // Dashboard view so the sidebar landing is reachable.
  { resource: "Dashboard", action: "view" },
  // Members can author + edit their own personal workflows (instance-level
  // ownership check happens in the route handlers); RBAC grants them the
  // baseline view/create/update on the Workflows resource, no delete.
  { resource: "Workflows", action: "view" },
  { resource: "Workflows", action: "create" },
  { resource: "Workflows", action: "update" },
  // Templates are read-only for members — starting points, not editable.
  { resource: "Templates", action: "view" },
  // Members can see their own runs and retry a failed one.
  { resource: "Runs", action: "view" },
  { resource: "Runs", action: "update" },
  { resource: "Insights", action: "view" },
  // Members can act on approvals raised to them.
  { resource: "Approvals", action: "view" },
  { resource: "Approvals", action: "update" },
];
