/**
 * Default QuikCRM AppRole seeders (mirrors QuikScale seedAdminAppRole pattern).
 */
import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";
import { isCrmRbacClientReady, rbacDb } from "@/lib/api/crm-rbac-client";
import {
  allCrmPermissionPairs,
  type CrmAction,
  type CrmModule,
} from "@/lib/api/permissions-registry";

type Grant = { resource: CrmModule; action: CrmAction };

const WORK_MODULES: CrmModule[] = [
  "leads",
  "accounts",
  "contacts",
  "opportunities",
  "activities",
  "tasks",
  "notes",
  "telephony",
];

const WORK_ACTIONS: CrmAction[] = ["view", "create", "edit", "markComplete"];

function grants(
  modules: CrmModule[],
  actions: CrmAction[],
): Grant[] {
  return modules.flatMap((resource) => actions.map((action) => ({ resource, action })));
}

/**
 * A mailbox is PERSONAL data, not shared org config: every user connects their
 * own account and every read is scoped to their own `mailboxConnectionId` (see
 * lib/services/email/mailbox-query.ts). So mailbox access belongs to every role
 * — withholding it only produced a 403 on Inbox/Sent/Drafts/All for users who
 * had already connected and synced their own mailbox.
 */
const MAILBOX_GRANTS: Grant[] = [
  { resource: "mailbox", action: "view" },
  { resource: "mailbox", action: "create" },
  { resource: "mailbox", action: "edit" },
  { resource: "mailbox", action: "delete" },
];

/**
 * ICP is org-level MASTER config (like price lists), not per-rep working data.
 * Reps read it to know who they should be selling to; managers curate it. So
 * `view` is granted broadly and write actions stop at sales-manager. Admins get
 * everything automatically via the "all" spec.
 */
const ICP_VIEW_GRANT: Grant = { resource: "icp", action: "view" };

const ICP_MANAGE_GRANTS: Grant[] = [
  ICP_VIEW_GRANT,
  { resource: "icp", action: "create" },
  { resource: "icp", action: "edit" },
  { resource: "icp", action: "delete" },
];

const SALES_USER_GRANTS: Grant[] = [
  { resource: "dashboard", action: "view" },
  ...grants(WORK_MODULES, WORK_ACTIONS),
  ...MAILBOX_GRANTS,
  ICP_VIEW_GRANT,
];

const SALES_MANAGER_GRANTS: Grant[] = [
  ...SALES_USER_GRANTS,
  ...grants(WORK_MODULES, ["delete", "export"]),
  { resource: "reports", action: "view" },
  { resource: "imports", action: "view" },
  { resource: "imports", action: "import" },
  { resource: "quotes", action: "view" },
  { resource: "quotes", action: "create" },
  { resource: "quotes", action: "edit" },
  { resource: "documents", action: "view" },
  ...ICP_MANAGE_GRANTS,
];

const MARKETING_USER_GRANTS: Grant[] = [
  { resource: "dashboard", action: "view" },
  { resource: "leads", action: "view" },
  { resource: "leads", action: "create" },
  { resource: "leads", action: "edit" },
  { resource: "campaigns", action: "view" },
  { resource: "campaigns", action: "create" },
  { resource: "campaigns", action: "edit" },
  { resource: "activities", action: "view" },
  { resource: "activities", action: "create" },
  ...MAILBOX_GRANTS,
  // Marketing typically OWNS the ideal-customer definition, so they curate it.
  ...ICP_MANAGE_GRANTS,
];

const FINANCE_USER_GRANTS: Grant[] = [
  { resource: "dashboard", action: "view" },
  { resource: "accounts", action: "view" },
  { resource: "opportunities", action: "view" },
  { resource: "quotes", action: "view" },
  { resource: "quotes", action: "create" },
  { resource: "quotes", action: "edit" },
  { resource: "quotes", action: "export" },
  { resource: "reports", action: "view" },
  { resource: "reports", action: "export" },
  ...MAILBOX_GRANTS,
  ICP_VIEW_GRANT,
];

interface RoleSpec {
  name: string;
  description: string;
  isSystem: boolean;
  isDefault: boolean;
  grants: Grant[] | "all";
}

const ROLE_SPECS: RoleSpec[] = [
  {
    name: "admin",
    description: "Full CRM access — auto-seeded. Permissions editable; rename/delete protected.",
    isSystem: true,
    isDefault: false,
    grants: "all",
  },
  {
    name: "sales-user",
    description: "Default sales rep — core CRM modules.",
    isSystem: false,
    isDefault: true,
    grants: SALES_USER_GRANTS,
  },
  {
    name: "sales-manager",
    description: "Sales manager — export/delete plus quotes and reports.",
    isSystem: false,
    isDefault: false,
    grants: SALES_MANAGER_GRANTS,
  },
  {
    name: "marketing-user",
    description: "Marketing — leads and campaigns.",
    isSystem: false,
    isDefault: false,
    grants: MARKETING_USER_GRANTS,
  },
  {
    name: "finance-user",
    description: "Finance — quotes and reporting.",
    isSystem: false,
    isDefault: false,
    grants: FINANCE_USER_GRANTS,
  },
];

async function seedRole(orgId: string, appId: string, spec: RoleSpec): Promise<string> {
  const client = rbacDb();
  if (!client) throw new Error("CRM RBAC client not ready");

  const existing = await client.crmAppRole.findFirst({
    where: { orgId, appId, name: spec.name },
    select: { id: true },
  });

  if (!spec.isSystem && spec.isDefault && !existing) {
    await client.crmAppRole.updateMany({
      where: { orgId, appId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const role =
    existing ??
    (await client.crmAppRole.create({
      data: {
        orgId,
        appId,
        name: spec.name,
        description: spec.description,
        isSystem: spec.isSystem,
        isDefault: spec.isDefault,
      },
      select: { id: true },
    }));

  const grantCount = await client.crmRolePermission.count({ where: { roleId: role.id } });
  if (grantCount > 0) return role.id;

  const pairs =
    spec.grants === "all"
      ? allCrmPermissionPairs()
      : spec.grants.map((g) => ({ resource: g.resource, action: g.action }));

  await client.crmRolePermission.createMany({
    data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
    skipDuplicates: true,
  });

  return role.id;
}

/**
 * Backfill the `mailbox` grants onto the seeded non-admin roles.
 *
 * `seedRole` only writes grants when a role has NONE (so an admin's hand-edited
 * permission set is never overwritten). Every org seeded before mailbox was
 * added to the role specs therefore has roles with grants but no mailbox rows —
 * their users connected + synced a mailbox fine but got a 403 on
 * Inbox/Sent/Drafts/All. This adds ONLY the missing mailbox pairs and leaves
 * every other resource untouched, so admin customisation is preserved.
 */
async function backfillMailboxPermissions(orgId: string, appId: string): Promise<void> {
  const client = rbacDb();
  if (!client) return;

  const roleNames = ROLE_SPECS.filter((s) => s.grants !== "all").map((s) => s.name);
  const roles = await client.crmAppRole.findMany({
    where: { orgId, appId, name: { in: roleNames } },
    select: {
      id: true,
      permissions: { where: { resource: "mailbox" }, select: { action: true } },
    },
  });

  if (!Array.isArray(roles) || roles.length === 0) return;

  const missing = roles.flatMap((role) => {
    const have = new Set((role.permissions ?? []).map((p) => p.action));
    return MAILBOX_GRANTS.filter((g) => !have.has(g.action)).map((g) => ({
      roleId: role.id,
      resource: g.resource,
      action: g.action,
    }));
  });
  if (missing.length === 0) return;

  await client.crmRolePermission.createMany({ data: missing, skipDuplicates: true });
}

/**
 * Backfill the `icp` grants onto the seeded non-admin roles.
 *
 * Same reasoning as backfillMailboxPermissions: `seedRole` only writes grants
 * when a role has NONE, so every org seeded before the ICP module shipped has
 * roles with grants but no `icp` rows — their users would get a 403 on /icp.
 * This adds ONLY the missing icp pairs for each role's intended level (manage
 * for sales-manager/marketing-user, view-only for sales-user/finance-user) and
 * leaves every other resource untouched, so admin customisation is preserved.
 */
async function backfillIcpPermissions(orgId: string, appId: string): Promise<void> {
  const client = rbacDb();
  if (!client) return;

  // Per-role intent, so a backfill never over-grants a read-only role.
  const wantByRole = new Map<string, Grant[]>([
    ["sales-user", [ICP_VIEW_GRANT]],
    ["sales-manager", ICP_MANAGE_GRANTS],
    ["marketing-user", ICP_MANAGE_GRANTS],
    ["finance-user", [ICP_VIEW_GRANT]],
  ]);

  const roles = await client.crmAppRole.findMany({
    where: { orgId, appId, name: { in: [...wantByRole.keys()] } },
    select: {
      id: true,
      name: true,
      permissions: { where: { resource: "icp" }, select: { action: true } },
    },
  });

  if (!Array.isArray(roles) || roles.length === 0) return;

  const missing = roles.flatMap((role) => {
    const want = wantByRole.get(role.name) ?? [];
    const have = new Set((role.permissions ?? []).map((p) => p.action));
    return want
      .filter((g) => !have.has(g.action))
      .map((g) => ({ roleId: role.id, resource: g.resource, action: g.action }));
  });
  if (missing.length === 0) return;

  await client.crmRolePermission.createMany({ data: missing, skipDuplicates: true });
}

async function backfillAdminPermissions(orgId: string, appId: string): Promise<void> {
  const client = rbacDb();
  if (!client) return;

  const admin = await client.crmAppRole.findFirst({
    where: { orgId, appId, isSystem: true, name: "admin" },
    select: { id: true, permissions: { select: { resource: true, action: true } } },
  });
  if (!admin) return;

  const have = new Set(admin.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = allCrmPermissionPairs().filter(
    (p) => !have.has(`${p.resource}:${p.action}`),
  );
  if (missing.length === 0) return;

  await client.crmRolePermission.createMany({
    data: missing.map((p) => ({ roleId: admin.id, resource: p.resource, action: p.action })),
    skipDuplicates: true,
  });
}

type SeedResult = { adminRoleId: string; defaultRoleId: string };

const seededOrgs = new Map<string, number>();
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * In-flight seed promises, keyed by orgId. Deduplicates concurrent cold
 * requests for the same org so they share ONE seeding pass instead of each
 * firing the full ~15-query burst. Without this, a burst of first-hit
 * requests (e.g. a page that fans out to several API calls) multiplied the
 * seeding load by the request fan-out and starved the connection pool —
 * exactly the P2024 timeout we're fixing.
 */
const inFlightSeeds = new Map<string, Promise<SeedResult>>();

export function seedAllDefaultCrmRoles(orgId: string): Promise<SeedResult> {
  const existing = inFlightSeeds.get(orgId);
  if (existing) return existing;

  const p = runSeed(orgId).finally(() => {
    // Only clear if this promise is still the registered one (guards against
    // a later call having already replaced it).
    if (inFlightSeeds.get(orgId) === p) inFlightSeeds.delete(orgId);
  });
  inFlightSeeds.set(orgId, p);
  return p;
}

async function runSeed(orgId: string): Promise<SeedResult> {
  if (!isCrmRbacClientReady()) {
    throw new Error(
      "CRM RBAC tables are not available — run prisma generate (stop dev server first on Windows).",
    );
  }

  const cached = seededOrgs.get(orgId);
  const now = Date.now();
  if (cached && now - cached < SEED_CACHE_TTL_MS) {
    const appId = await getQuikCrmAppId();
    if (appId && isCrmRbacClientReady()) {
      const client = rbacDb();
      if (client) {
        const [admin, def] = await Promise.all([
          client.crmAppRole.findFirst({ where: { orgId, appId, name: "admin" }, select: { id: true } }),
          client.crmAppRole.findFirst({
            where: { orgId, appId, isDefault: true },
            select: { id: true },
          }),
        ]);
        if (admin && def) return { adminRoleId: admin.id, defaultRoleId: def.id };
      }
    }
  }

  const appId = await getQuikCrmAppId();
  if (!appId) throw new Error("QuikCRM App not registered in quikit.App");

  // Seed all role specs concurrently. Each seedRole call is independent —
  // they touch distinct AppRole rows (unique per orgId+appId+name) and only
  // the `sales-user` spec carries `isDefault: true`, so the isDefault-flip
  // updateMany inside seedRole can't race another spec. Running them in
  // parallel collapses ~15-20 sequential round-trips into one batch, which
  // is what was starving the connection pool on cold lambdas.
  const ids = await Promise.all(ROLE_SPECS.map((spec) => seedRole(orgId, appId, spec)));
  await Promise.all([
    backfillAdminPermissions(orgId, appId),
    backfillMailboxPermissions(orgId, appId),
    backfillIcpPermissions(orgId, appId),
  ]);

  seededOrgs.set(orgId, now);
  const adminRoleId = ids[0]!;
  const client = rbacDb();
  const defaultRoleId =
    (await client?.crmAppRole.findFirst({
      where: { orgId, appId, isDefault: true },
      select: { id: true },
    }))?.id ?? ids[1]!;
  return { adminRoleId, defaultRoleId };
}
