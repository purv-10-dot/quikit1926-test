/**
 * QuikInfra — default role seeder.
 *
 * On every authenticated request, /api/me/permissions calls this once per
 * (process, org) to ensure the 4 system roles exist with their initial
 * RolePermission grants. Idempotent after the first call.
 *
 * Roles seeded (matches src/lib/permissions.ts ROLE_PERMISSIONS):
 *   - admin          → ALL permissions      (system, full access)
 *   - ho_user        → curated HO subset
 *   - site_admin     → curated site-ops subset
 *   - user           → minimal (also: isDefault for new invitees)
 *
 * Also performs first-time userType → role migration — every CnUser with a
 * legacy userType (SUPER_ADMIN / ADMIN / HO_USER / SITE_ADMIN / USER)
 * gets a CnUserAppRole row pointing at the matching v2 role.
 *
 * Mirrors apps/quikscale/lib/api/seedAdminAppRole.ts.
 */

import { db } from "@quikit/database";
import { PERMISSIONS, ROLES, type ConstructionRole } from "@/lib/permissions";
import { parsePermissionKey, allPermissionPairs } from "./permissionsRegistry";
import { getQuikInfraAppId } from "./userCan";

// In-process cache. Prevents the seed from running on every request.
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;
const seedCache = new Map<string, number>();

interface SeedResult {
  adminRoleId: string;
  hoUserRoleId: string;
  siteAdminRoleId: string;
  userRoleId: string;
}

/** UI display labels for the 4 seeded roles. */
const ROLE_DISPLAY: Record<ConstructionRole, { name: string; description: string; isSystem: boolean; isDefault: boolean }> = {
  admin: {
    name: "admin",
    description: "Full access to all modules. Protected from rename/delete.",
    isSystem: true,
    isDefault: false,
  },
  ho_user: {
    name: "ho_user",
    description: "Head office staff — purchase + project oversight, no settings.",
    isSystem: false,
    isDefault: false,
  },
  site_admin: {
    name: "site_admin",
    description: "Site administrator — full site ops, GRN/issue/stock/DPR control.",
    isSystem: false,
    isDefault: false,
  },
  user: {
    name: "user",
    description: "Standard user — read-only on most modules, can file DPRs.",
    isSystem: false,
    isDefault: true, // new invitees land here
  },
};

const ROLES_TO_SEED: ConstructionRole[] = [
  ROLES.ADMIN,
  ROLES.HO_USER,
  ROLES.SITE_ADMIN,
  ROLES.USER,
];

// Per-page resources introduced by the per-page-permissions split (Phase 1).
// Phase 2 grants these to the same roles that already hold the umbrella
// resource, so no role loses access at the Phase-4 cutover (routes still gate
// on the umbrella until then). Plain strings — additive DB grants, not yet
// referenced by any PERMISSIONS.* constant. Keep in sync with the leaves in
// permissionsRegistry.ts and MENU_TO_RESOURCE in matrixV2Bridge.ts.
const MASTER_PAGE_RESOURCES = [
  "construction.master_item",
  "construction.master_item_group",
  "construction.master_vendor",
  "construction.master_contractor",
  "construction.master_customer",
  "construction.master_location",
  "construction.master_machinery",
  "construction.master_asset",
  "construction.master_cost_center",
  "construction.master_labour",
  "construction.master_workman",
];
const ORG_PAGE_RESOURCES = [
  "construction.org_company",
  "construction.org_department",
  "construction.org_gst",
  "construction.org_tds",
  "construction.org_uom",
  "construction.org_work_category",
  "construction.org_terms",
];
const PAGE_SPLIT_RESOURCES = new Set<string>([
  ...MASTER_PAGE_RESOURCES,
  ...ORG_PAGE_RESOURCES,
]);

// Umbrella resources retired by the per-page split (Phase 5). The legacy
// ROLE_PERMISSIONS lists in lib/permissions.ts still reference them (e.g.
// PERMISSIONS.MASTERS_VIEW), so strip them out of every seeded role's grants —
// roles now hold only the per-page construction.master_* / construction.org_*
// resources. Removing the DB rows themselves is the Phase-5 cleanup SQL.
const UMBRELLA_RESOURCES = new Set<string>([
  "construction.masters",
  "construction.organization",
]);

function stripUmbrella(
  pairs: Array<{ resource: string; action: string }>,
): Array<{ resource: string; action: string }> {
  return pairs.filter((p) => !UMBRELLA_RESOURCES.has(p.resource));
}

/**
 * Grants for the new per-page resources, mirroring each role's CURRENT
 * effective access to the umbrella resources so cutover is loss-free:
 *   - Admin: the full action set of every new resource (read from the tree —
 *     picks up master_item's import/export and master_labour's approve).
 *   - HO / Site Admin / User: today they can VIEW every Masters and
 *     Organization page through `construction.masters.view` (Organization
 *     routes gate on masters), so grant `view` on each new resource. HO also
 *     held `construction.masters.export`, mirrored onto master_item.
 * Sub-admins (app-level "admin", not central) inherit these via the seeded
 * admin role's rolePermissions, so they need no separate wiring.
 */
function newPageGrants(role: ConstructionRole): Array<{ resource: string; action: string }> {
  if (role === ROLES.ADMIN) {
    return allPermissionPairs()
      .filter((p) => PAGE_SPLIT_RESOURCES.has(p.resource))
      .map((p) => ({ resource: p.resource, action: p.action }));
  }
  const grants: Array<{ resource: string; action: string }> = [];
  for (const resource of PAGE_SPLIT_RESOURCES) {
    grants.push({ resource, action: "view" });
  }
  if (role === ROLES.HO_USER) {
    grants.push({ resource: "construction.master_item", action: "export" });
  }
  return grants;
}

/** Map ROLE_PERMISSIONS["admin"] etc. into (resource, action) pairs. */
function roleGrants(role: ConstructionRole): Array<{ resource: string; action: string }> {
  // Re-import the runtime map. ROLE_PERMISSIONS isn't exported from permissions.ts —
  // we replicate the data here by re-deriving from PERMISSIONS + the same logic.
  // To keep this file the single source of seeding truth, we mirror the map.
  const ALL = Object.values(PERMISSIONS);

  if (role === ROLES.ADMIN) return [...stripUmbrella(splitKeys(ALL)), ...newPageGrants(role)];

  if (role === ROLES.HO_USER) return [...stripUmbrella(splitKeys([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ORGANIZATION_VIEW,
    PERMISSIONS.MASTERS_VIEW,
    PERMISSIONS.PR_VIEW, PERMISSIONS.PR_CREATE,
    PERMISSIONS.INDENT_VIEW, PERMISSIONS.INDENT_CREATE,
    PERMISSIONS.PO_VIEW, PERMISSIONS.PO_CREATE, PERMISSIONS.PO_APPROVE,
    PERMISSIONS.GRN_VIEW,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.BOQ_VIEW, PERMISSIONS.BOQ_EDIT, PERMISSIONS.BOQ_LOCK,
    PERMISSIONS.WBS_VIEW,
    PERMISSIONS.WO_VIEW, PERMISSIONS.WO_APPROVE,
    PERMISSIONS.DPR_VIEW, PERMISSIONS.DPR_APPROVE,
    PERMISSIONS.GANTT_VIEW,
    PERMISSIONS.HINDRANCE_VIEW,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.RAB_VIEW, PERMISSIONS.RAB_APPROVE,
    PERMISSIONS.QUALITY_SAFETY_VIEW,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.MASTERS_EXPORT,
  ])), ...newPageGrants(role)];

  // Site Admin / Project Manager — a manager role. It gets FULL operational
  // actions (view + create + edit + delete + approve/import/lock/receive/
  // reverse where they exist) across every page in its modules: Purchase,
  // Store, Project Mgmt, Quality & Safety. So assigning one of those modules
  // means the user can actually operate it, not just view it. Masters/Project
  // stay view-only here (creating the project master itself is org-admin work).
  if (role === ROLES.SITE_ADMIN) return [...stripUmbrella(splitKeys([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.MASTERS_VIEW,
    // Purchase
    PERMISSIONS.PR_VIEW, PERMISSIONS.PR_CREATE, PERMISSIONS.PR_EDIT, PERMISSIONS.PR_DELETE, PERMISSIONS.PR_APPROVE,
    PERMISSIONS.INDENT_VIEW, PERMISSIONS.INDENT_CREATE, PERMISSIONS.INDENT_EDIT, PERMISSIONS.INDENT_DELETE, PERMISSIONS.INDENT_APPROVE,
    PERMISSIONS.RFQ_VIEW, PERMISSIONS.RFQ_CREATE, PERMISSIONS.RFQ_EDIT, PERMISSIONS.RFQ_DELETE, PERMISSIONS.RFQ_APPROVE,
    PERMISSIONS.PO_VIEW, PERMISSIONS.PO_CREATE, PERMISSIONS.PO_EDIT, PERMISSIONS.PO_DELETE, PERMISSIONS.PO_APPROVE,
    PERMISSIONS.GRN_VIEW, PERMISSIONS.GRN_CREATE, PERMISSIONS.GRN_EDIT, PERMISSIONS.GRN_DELETE, PERMISSIONS.GRN_APPROVE,
    // Store
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.ISSUE_VIEW, PERMISSIONS.ISSUE_CREATE, PERMISSIONS.ISSUE_EDIT, PERMISSIONS.ISSUE_DELETE, PERMISSIONS.ISSUE_APPROVE,
    PERMISSIONS.GATEPASS_VIEW, PERMISSIONS.GATEPASS_CREATE, PERMISSIONS.GATEPASS_EDIT, PERMISSIONS.GATEPASS_DELETE, PERMISSIONS.GATEPASS_APPROVE,
    PERMISSIONS.RETURN_VIEW, PERMISSIONS.RETURN_CREATE, PERMISSIONS.RETURN_EDIT, PERMISSIONS.RETURN_DELETE, PERMISSIONS.RETURN_APPROVE,
    PERMISSIONS.TRANSFER_VIEW, PERMISSIONS.TRANSFER_CREATE, PERMISSIONS.TRANSFER_EDIT, PERMISSIONS.TRANSFER_DELETE, PERMISSIONS.TRANSFER_APPROVE, PERMISSIONS.TRANSFER_RECEIVE,
    PERMISSIONS.RECONCILIATION_VIEW, PERMISSIONS.RECONCILIATION_CREATE, PERMISSIONS.RECONCILIATION_EDIT, PERMISSIONS.RECONCILIATION_DELETE, PERMISSIONS.RECONCILIATION_APPROVE,
    PERMISSIONS.DIESEL_VIEW, PERMISSIONS.DIESEL_CREATE, PERMISSIONS.DIESEL_EDIT, PERMISSIONS.DIESEL_DELETE,
    PERMISSIONS.EQUIPMENT_LOG_VIEW, PERMISSIONS.EQUIPMENT_LOG_CREATE, PERMISSIONS.EQUIPMENT_LOG_EDIT, PERMISSIONS.EQUIPMENT_LOG_DELETE, PERMISSIONS.EQUIPMENT_LOG_APPROVE,
    PERMISSIONS.EQUIPMENT_MAINT_VIEW, PERMISSIONS.EQUIPMENT_MAINT_CREATE, PERMISSIONS.EQUIPMENT_MAINT_EDIT, PERMISSIONS.EQUIPMENT_MAINT_DELETE,
    PERMISSIONS.EQUIPMENT_DEPLOY_VIEW, PERMISSIONS.EQUIPMENT_DEPLOY_CREATE, PERMISSIONS.EQUIPMENT_DEPLOY_EDIT, PERMISSIONS.EQUIPMENT_DEPLOY_DELETE,
    // Project Mgmt
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.BOQ_VIEW, PERMISSIONS.BOQ_CREATE, PERMISSIONS.BOQ_EDIT, PERMISSIONS.BOQ_DELETE, PERMISSIONS.BOQ_IMPORT, PERMISSIONS.BOQ_LOCK,
    PERMISSIONS.WBS_VIEW, PERMISSIONS.WBS_CREATE, PERMISSIONS.WBS_EDIT, PERMISSIONS.WBS_DELETE,
    PERMISSIONS.ESTIMATION_VIEW, PERMISSIONS.ESTIMATION_CREATE, PERMISSIONS.ESTIMATION_EDIT, PERMISSIONS.ESTIMATION_DELETE, PERMISSIONS.ESTIMATION_APPROVE,
    PERMISSIONS.WO_VIEW, PERMISSIONS.WO_CREATE, PERMISSIONS.WO_EDIT, PERMISSIONS.WO_DELETE, PERMISSIONS.WO_APPROVE,
    PERMISSIONS.DPR_VIEW, PERMISSIONS.DPR_CREATE, PERMISSIONS.DPR_EDIT, PERMISSIONS.DPR_DELETE, PERMISSIONS.DPR_APPROVE, PERMISSIONS.DPR_REVERSE,
    PERMISSIONS.GANTT_VIEW,
    PERMISSIONS.HINDRANCE_VIEW, PERMISSIONS.HINDRANCE_CREATE, PERMISSIONS.HINDRANCE_EDIT, PERMISSIONS.HINDRANCE_DELETE,
    PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_CREATE, PERMISSIONS.DOCUMENTS_EDIT, PERMISSIONS.DOCUMENTS_DELETE,
    PERMISSIONS.RAB_VIEW, PERMISSIONS.RAB_CREATE, PERMISSIONS.RAB_EDIT, PERMISSIONS.RAB_DELETE, PERMISSIONS.RAB_APPROVE,
    // Quality & Safety
    PERMISSIONS.QUALITY_SAFETY_VIEW, PERMISSIONS.QUALITY_SAFETY_CREATE, PERMISSIONS.QUALITY_SAFETY_EDIT,
  ])), ...newPageGrants(role)];

  if (role === ROLES.USER) return [...stripUmbrella(splitKeys([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ORGANIZATION_VIEW,
    PERMISSIONS.MASTERS_VIEW,
    PERMISSIONS.PR_VIEW, PERMISSIONS.PR_CREATE,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.GATEPASS_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.BOQ_VIEW,
    PERMISSIONS.WBS_VIEW,
    PERMISSIONS.DPR_VIEW, PERMISSIONS.DPR_CREATE,
    PERMISSIONS.GANTT_VIEW,
    PERMISSIONS.HINDRANCE_VIEW, PERMISSIONS.HINDRANCE_CREATE,
    PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_CREATE,
    PERMISSIONS.EQUIPMENT_LOG_VIEW, PERMISSIONS.EQUIPMENT_LOG_CREATE,
    PERMISSIONS.EQUIPMENT_MAINT_VIEW, PERMISSIONS.EQUIPMENT_MAINT_CREATE,
    PERMISSIONS.EQUIPMENT_DEPLOY_VIEW, PERMISSIONS.EQUIPMENT_DEPLOY_CREATE,
    PERMISSIONS.QUALITY_SAFETY_VIEW,
  ])), ...newPageGrants(role)];

  // Silence the dead-branch warning; ALL is only used by admin path.
  void ALL;
  return [];
}

function splitKeys(keys: string[]): Array<{ resource: string; action: string }> {
  const out: Array<{ resource: string; action: string }> = [];
  for (const k of keys) {
    const parsed = parsePermissionKey(k);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Seed the 4 default roles for one org, plus assign every existing CnUser
 * row to the v2 role matching their legacy userType. Idempotent.
 */
export async function seedDefaultRoles(orgId: string): Promise<SeedResult | null> {
  const cacheHit = seedCache.get(orgId);
  if (cacheHit && Date.now() - cacheHit < SEED_CACHE_TTL_MS) {
    // Cache hit — return the existing role IDs without re-seeding. BUT if the
    // rows were deleted out-of-band (cache stale), fall through to a full
    // re-seed in THIS call instead of returning null. Mirrors quikscale's
    // seedAllDefaultRoles, so a delete + single reload re-seeds immediately
    // (previously QuikInfra needed a second reload to recover).
    const existing = await loadSeededIds(orgId);
    if (existing) return existing;
    // rows missing → fall through to the full seed below
  }

  const appId = await getQuikInfraAppId();
  if (!appId) return null;

  // 1. Upsert the 4 system roles.
  const roleIds: Partial<Record<ConstructionRole, string>> = {};
  for (const role of ROLES_TO_SEED) {
    const meta = ROLE_DISPLAY[role];
    const existing = await db.cnAppRole.upsert({
      where: { orgId_appId_name: { orgId, appId, name: meta.name } },
      update: {
        // Don't overwrite isSystem/isDefault if admin re-flagged them in the UI.
      },
      create: {
        orgId,
        appId,
        name: meta.name,
        description: meta.description,
        isSystem: meta.isSystem,
        isDefault: meta.isDefault,
      },
      select: { id: true },
    });
    roleIds[role] = existing.id;
  }

  // 2. Backfill RolePermission rows for any role that has none yet.
  //    (Won't overwrite admin un-ticks — only adds, never removes.)
  for (const role of ROLES_TO_SEED) {
    const roleId = roleIds[role]!;
    const have = await db.cnRolePermissionV2.findMany({
      where: { roleId },
      select: { resource: true, action: true },
    });
    const haveSet = new Set(have.map((p) => `${p.resource}::${p.action}`));
    const want = roleGrants(role);
    const missing = want.filter((p) => !haveSet.has(`${p.resource}::${p.action}`));
    if (missing.length > 0) {
      await db.cnRolePermissionV2.createMany({
        data: missing.map((p) => ({ roleId, resource: p.resource, action: p.action })),
        skipDuplicates: true,
      });
    }
  }

  // Step H: legacy `migrateLegacyUserTypes()` removed — cn_users is
  // gone, every user is assigned a v2 role at invite time (POST
  // /api/settings/users) or lazily on first login (context.ts auto-
  // assign). No backfill needed anymore.

  seedCache.set(orgId, Date.now());

  return {
    adminRoleId: roleIds[ROLES.ADMIN]!,
    hoUserRoleId:       roleIds[ROLES.HO_USER]!,
    siteAdminRoleId:    roleIds[ROLES.SITE_ADMIN]!,
    userRoleId:         roleIds[ROLES.USER]!,
  };
}

async function loadSeededIds(orgId: string): Promise<SeedResult | null> {
  const appId = await getQuikInfraAppId();
  if (!appId) return null;
  const rows = await db.cnAppRole.findMany({
    where: { orgId, appId, name: { in: ROLES_TO_SEED.map((r) => ROLE_DISPLAY[r].name) } },
    select: { id: true, name: true },
  });
  const byName = new Map<string, string>(
    (rows as Array<{ id: string; name: string }>).map((r) => [r.name, r.id]),
  );
  const get = (k: ConstructionRole): string | undefined =>
    byName.get(ROLE_DISPLAY[k].name);
  if (!get(ROLES.ADMIN) || !get(ROLES.HO_USER) || !get(ROLES.SITE_ADMIN) || !get(ROLES.USER)) {
    seedCache.delete(orgId);
    return null;
  }
  return {
    adminRoleId: get(ROLES.ADMIN)!,
    hoUserRoleId:       get(ROLES.HO_USER)!,
    siteAdminRoleId:    get(ROLES.SITE_ADMIN)!,
    userRoleId:         get(ROLES.USER)!,
  };
}

/* ───────────────────────── user → role assignment ───────────────────────── */

/**
 * Assign a user to a role via `app_quikinfra.CnUserAppRole`. Idempotent —
 * a row already linking (userId, orgId, roleId) is a no-op.
 *
 * Mirrors apps/quikscale/lib/api/seedAdminAppRole.ts ensureUserOnRole. Used
 * by the internal provisioning endpoint so the launcher can pre-assign the
 * org admin the moment QuikInfra gets enabled for their org — no lazy-seed
 * gap, dropdown shows roles immediately in the admin portal.
 */
export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const existing = await db.cnUserAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  try {
    await db.cnUserAppRole.create({
      data: { userId, orgId, roleId, assignedBy: assignedBy ?? null },
    });
  } catch (err) {
    // Race-condition: a concurrent request created the row between our
    // findFirst and create. Prisma raises P2002 on the unique constraint.
    // Treat as success — the row exists either way.
    if ((err as { code?: string })?.code === "P2002") return;
    throw err;
  }
}

// migrateLegacyUserTypes() + mapUserTypeToRoleId() removed in Step H —
// cn_users no longer exists. New invitees get a v2 role at creation
// time in POST /api/settings/users; existing users were backfilled
// before the table was dropped.
