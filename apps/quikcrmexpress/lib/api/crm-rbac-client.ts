import { db } from "@/lib/db";

// CrmExpress's own RBAC delegates live in app_quikcrmexpress (Qce*-prefixed models
// mapped to AppRole/RolePermission/UserAppRole/UserPermissionExtra). Previously
// this pointed at app_quikcrm's crm* delegates; repointed to qce* to complete
// the de-vendor and isolate CrmExpress's roles from the monorepo QuikCRM app.
type CrmPermRow = { resource: string; action: string };
type CrmIdRow = { id: string };
type CrmAppRoleRow = { id: string; permissions: CrmPermRow[] };

export type CrmRbacDb = {
  qceAppRole: {
    findFirst: (args: object) => Promise<CrmAppRoleRow | null>;
    create: (args: object) => Promise<CrmIdRow>;
    updateMany: (args: object) => Promise<{ count: number }>;
  };
  qceRolePermission: {
    findFirst: (args: object) => Promise<CrmIdRow | null>;
    count: (args: object) => Promise<number>;
    createMany: (args: object) => Promise<{ count: number }>;
  };
  qceUserPermissionExtra: {
    findFirst: (args: object) => Promise<CrmIdRow | null>;
    findMany: (args: object) => Promise<CrmPermRow[]>;
    deleteMany: (args: object) => Promise<{ count: number }>;
  };
  qceUserAppRole: {
    findFirst: (args: object) => Promise<CrmIdRow | null>;
    findMany: (args: object) => Promise<Array<{ id: string; userId: string; role: { permissions: CrmPermRow[]; id: string; name: string } }>>;
    create: (args: object) => Promise<CrmIdRow>;
    deleteMany: (args: object) => Promise<{ count: number }>;
  };
};

/** True once the CrmExpress RBAC (Qce*) Prisma delegates are generated. */
export function isCrmRbacClientReady(): boolean {
  const c = db as unknown as Record<string, unknown>;
  return Boolean(
    c["qceUserAppRole"] &&
      c["qceRolePermission"] &&
      c["qceUserPermissionExtra"] &&
      c["qceAppRole"],
  );
}

export function rbacDb(): CrmRbacDb | null {
  if (!isCrmRbacClientReady()) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[crm-rbac] Prisma client missing CrmExpress RBAC delegates — stop dev server, then: cd packages/database && npm run generate",
      );
    }
    return null;
  }
  return db as unknown as CrmRbacDb;
}