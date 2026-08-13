/**
 * Member role's curated default grants — the single source of truth for what
 * the auto-seeded default "Member" AppRole can do out of the box.
 *
 * Kept in its own dependency-free module (no Prisma / no `@/lib/db` import) so
 * it can be imported by pure unit tests and by both `seedMemberAppRole`
 * (fresh orgs) and `backfillMemberPermissions` (top-up for existing orgs).
 *
 * Delete is intentionally NOT a Member default — deleting KPIs/Priorities/WWW
 * is a destructive action reserved for admins (or roles an admin explicitly
 * grants it to). Because `backfillMemberPermissions` only ever ADDS missing
 * default grants, omitting "delete" here also means an admin who un-ticks
 * Member's delete keeps it off (it won't be re-added on the next seed pass).
 */
export const MEMBER_DEFAULT_GRANTS: Array<{ resource: string; action: string }> = [
  // Dashboard view so the sidebar landing is reachable.
  { resource: "Dashboard", action: "view" },
  // View/Create/Update on the day-to-day work surfaces (no delete).
  ...["KPI", "TeamKPI", "Priority", "WWW"].flatMap((resource) =>
    (["view", "create", "update"] as const).map((action) => ({ resource, action })),
  ),
  // OPSP day-to-day surfaces for members:
  //   - Create OPSP   → view  (see the plan + fill their OWN per-user sections;
  //                            authoring the full strategic plan needs `create`,
  //                            granted by an admin).
  //   - OPSP History  → view  (read the post-finalize change history).
  //   - Critical #    → view + update  (members enter their OWN Achieved/Comment).
  //   - Category Mgmt → view  (read the category list; editing is admin-granted).
  { resource: "OPSP.Create", action: "view" },
  { resource: "OPSP.History", action: "view" },
  { resource: "OPSP.Review.Critical", action: "view" },
  { resource: "OPSP.Review.Critical", action: "update" },
  { resource: "OPSP.Categories", action: "view" },
  // Meeting report: members may generate + view a report from a transcript.
  // Editing + saving (the "Edit Report" gate) is `update`, left admin-only.
  { resource: "ClientMeetings.Report", action: "view" },
];
