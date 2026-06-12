import { db } from "@/lib/db";

type CrmRbacDb = {
  crmUserAppRole: NonNullable<(typeof db)["crmUserAppRole"]>;
  crmRolePermission: NonNullable<(typeof db)["crmRolePermission"]>;
  crmUserPermissionExtra: NonNullable<(typeof db)["crmUserPermissionExtra"]>;
  crmAppRole: NonNullable<(typeof db)["crmAppRole"]>;
};

/** False when Prisma client was not regenerated after CRM RBAC schema landed. */
export function isCrmRbacClientReady(): boolean {
  const c = db as typeof db & {
    crmUserAppRole?: unknown;
    crmRolePermission?: unknown;
    crmUserPermissionExtra?: unknown;
    crmAppRole?: unknown;
  };
  return Boolean(
    c.crmUserAppRole &&
      c.crmRolePermission &&
      c.crmUserPermissionExtra &&
      c.crmAppRole,
  );
}

export function rbacDb(): CrmRbacDb | null {
  if (!isCrmRbacClientReady()) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[crm-rbac] Prisma client missing CRM RBAC delegates — stop dev server, then: cd packages/database && npm run generate",
      );
    }
    return null;
  }
  return db as CrmRbacDb;
}
