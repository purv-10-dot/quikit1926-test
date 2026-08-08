/**
 * Default CredFlow AppRole seeders (mirrors QuikScale seedAdminAppRole pattern).
 * Uses CredFlow's own app_quikcredflow RBAC tables via the qcf* delegates.
 */
import { getQuikcredflowAppId } from "@/lib/api/quikcredflow-app";
import { isCrmRbacClientReady, rbacDb } from "@/lib/api/crm-rbac-client";
import { allCrmPermissionPairs } from "@/lib/api/permissions-registry";
import {
  FINANCE_USER_GRANTS,
  MARKETING_USER_GRANTS,
  SALES_MANAGER_GRANTS,
  SALES_USER_GRANTS,
  type Grant,
} from "@/lib/auth/role-grants";

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
    description: "Full CRM access - auto-seeded. Permissions editable; rename/delete protected.",
    isSystem: true,
    isDefault: false,
    grants: "all",
  },
  {
    name: "sales-user",
    description: "Default sales rep - core CRM modules.",
    isSystem: false,
    isDefault: true,
    grants: SALES_USER_GRANTS,
  },
  {
    name: "sales-manager",
    description: "Sales manager - export/delete plus quotes and reports.",
    isSystem: false,
    isDefault: false,
    grants: SALES_MANAGER_GRANTS,
  },
  {
    name: "marketing-user",
    description: "Marketing - leads and campaigns.",
    isSystem: false,
    isDefault: false,
    grants: MARKETING_USER_GRANTS,
  },
  {
    name: "finance-user",
    description: "Finance - quotes and reporting.",
    isSystem: false,
    isDefault: false,
    grants: FINANCE_USER_GRANTS,
  },
];

async function seedRole(orgId: string, appId: string, spec: RoleSpec): Promise<string> {
  const client = rbacDb();
  if (!client) throw new Error("CRM RBAC client not ready");

  const existing = await client.qcfAppRole.findFirst({
    where: { orgId, appId, name: spec.name },
    select: { id: true },
  });

  if (!spec.isSystem && spec.isDefault && !existing) {
    await client.qcfAppRole.updateMany({
      where: { orgId, appId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const role =
    existing ??
    (await client.qcfAppRole.create({
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

  const grantCount = await client.qcfRolePermission.count({ where: { roleId: role.id } });
  if (grantCount > 0) return role.id;

  const pairs =
    spec.grants === "all"
      ? allCrmPermissionPairs()
      : spec.grants.map((g) => ({ resource: g.resource, action: g.action }));

  await client.qcfRolePermission.createMany({
    data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
    skipDuplicates: true,
  });

  return role.id;
}

async function backfillAdminPermissions(orgId: string, appId: string): Promise<void> {
  const client = rbacDb();
  if (!client) return;

  const admin = await client.qcfAppRole.findFirst({
    where: { orgId, appId, isSystem: true, name: "admin" },
    select: { id: true, permissions: { select: { resource: true, action: true } } },
  });
  if (!admin) return;

  const have = new Set(admin.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = allCrmPermissionPairs().filter(
    (p) => !have.has(`${p.resource}:${p.action}`),
  );
  if (missing.length === 0) return;

  await client.qcfRolePermission.createMany({
    data: missing.map((p) => ({ roleId: admin.id, resource: p.resource, action: p.action })),
    skipDuplicates: true,
  });
}

const seededOrgs = new Map<string, number>();
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;

export async function seedAllDefaultCrmRoles(
  orgId: string,
): Promise<{ adminRoleId: string; defaultRoleId: string }> {
  if (!isCrmRbacClientReady()) {
    throw new Error(
      "CRM RBAC tables are not available - run prisma generate (stop dev server first on Windows).",
    );
  }

  const cached = seededOrgs.get(orgId);
  const now = Date.now();
  if (cached && now - cached < SEED_CACHE_TTL_MS) {
    const appId = await getQuikcredflowAppId();
    if (appId && isCrmRbacClientReady()) {
      const client = rbacDb();
      if (client) {
        const [admin, def] = await Promise.all([
          client.qcfAppRole.findFirst({ where: { orgId, appId, name: "admin" }, select: { id: true } }),
          client.qcfAppRole.findFirst({
            where: { orgId, appId, isDefault: true },
            select: { id: true },
          }),
        ]);
        if (admin && def) return { adminRoleId: admin.id, defaultRoleId: def.id };
      }
    }
  }

  const appId = await getQuikcredflowAppId();
  if (!appId) throw new Error("CredFlow App not registered in quikit.App");

  const ids: string[] = [];
  for (const spec of ROLE_SPECS) {
    ids.push(await seedRole(orgId, appId, spec));
  }
  await backfillAdminPermissions(orgId, appId);

  seededOrgs.set(orgId, now);
  const adminRoleId = ids[0]!;
  const client = rbacDb();
  const defaultRoleId =
    (await client?.qcfAppRole.findFirst({
      where: { orgId, appId, isDefault: true },
      select: { id: true },
    }))?.id ?? ids[1]!;
  return { adminRoleId, defaultRoleId };
}