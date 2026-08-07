import { db } from "@/lib/db";

// CredFlow's own RBAC delegates live in app_quikcredflow (Qcf*-prefixed models
// mapped to AppRole/RolePermission/UserAppRole/UserPermissionExtra). Previously
// this pointed at app_quikcrm's crm* delegates; repointed to qcf* to complete
// the de-vendor and isolate CredFlow's roles from the monorepo QuikCRM app.
type CrmPermRow = { resource: string; action: string };
type CrmIdRow = { id: string };
type CrmAppRoleRow = { id: string; permissions: CrmPermRow[] };

export type CrmRbacDb = {
  qcfAppRole: {
    findFirst: (args: object) => Promise<CrmAppRoleRow | null>;
    create: (args: object) => Promise<CrmIdRow>;
    updateMany: (args: object) => Promise<{ count: number }>;
  };
  qcfRolePermission: {
    findFirst: (args: object) => Promise<CrmIdRow | null>;
    count: (args: object) => Promise<number>;
    createMany: (args: object) => Promise<{ count: number }>;
  };
  qcfUserPermissionExtra: {
    findFirst: (args: object) => Promise<CrmIdRow | null>;
    findMany: (args: object) => Promise<CrmPermRow[]>;
    deleteMany: (args: object) => Promise<{ count: number }>;
  };
  qcfUserAppRole: {
    findFirst: (args: object) => Promise<CrmIdRow | null>;
    findMany: (args: object) => Promise<Array<{ id: string; userId: string; role: { permissions: CrmPermRow[]; id: string; name: string } }>>;
    create: (args: object) => Promise<CrmIdRow>;
    deleteMany: (args: object) => Promise<{ count: number }>;
  };
};

/** True once the CredFlow RBAC (Qcf*) Prisma delegates are generated. */
export function isCrmRbacClientReady(): boolean {
  const c = db as unknown as Record<string, unknown>;
  return Boolean(
    c["qcfUserAppRole"] &&
      c["qcfRolePermission"] &&
      c["qcfUserPermissionExtra"] &&
      c["qcfAppRole"],
  );
}

export function rbacDb(): CrmRbacDb | null {
  if (!isCrmRbacClientReady()) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[crm-rbac] Prisma client missing CredFlow RBAC delegates — stop dev server, then: cd packages/database && npm run generate",
      );
    }
    return null;
  }
  return db as unknown as CrmRbacDb;
}