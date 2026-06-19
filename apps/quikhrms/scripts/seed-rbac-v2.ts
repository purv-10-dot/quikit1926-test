// Seed RBAC v2 (quikscale-mirror) for a tenant.
//
// Creates the 9 system roles from DEFAULT_ROLES with their seeded permissions,
// marks `employee` as isDefault, and links the existing QK-EMP-0001 dev seed
// employee to super_admin (if present).
//
// Run:  npx dotenv-cli -e .env.local -- tsx prisma/seed-rbac-v2.ts --tenant <orgId>
//
// Idempotent: re-running won't duplicate AppRole/RolePermission/UserAppRole rows.

import { PrismaClient } from "@quikit/database";
import pg from "pg";
import { PERMISSIONS, DEFAULT_ROLES } from "../lib/rbac/permissions";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();
const APP_ID = "quikhrms";

function splitCode(code: string): { resource: string; action: string } {
  const lastDot = code.lastIndexOf(".");
  if (lastDot < 0) return { resource: code, action: "*" };
  return { resource: code.slice(0, lastDot), action: code.slice(lastDot + 1) };
}

function expandPerms(perms: string[] | "*"): string[] {
  if (perms === "*") return PERMISSIONS.map((p) => p.code);
  return perms;
}

async function seedRolesForTenant(orgId: string) {
  console.log(`[seed-rbac-v2] tenant=${orgId}`);

  for (const seed of DEFAULT_ROLES) {
    const isSystem = seed.code === "super_admin";
    const isDefault = seed.code === "employee";

    const role = await prisma.hrmsAppRole.upsert({
      where: { orgId_appId_name: { orgId: orgId, appId: APP_ID, name: seed.code } },
      create: {
        orgId: orgId,
        appId: APP_ID,
        name: seed.code,
        description: seed.description,
        isSystem,
        isDefault,
        createdBy: "system-seed",
      },
      update: {
        description: seed.description,
        isSystem,
        isDefault,
      },
    });

    // Wipe + re-create permissions only if empty (don't blow away admin un-ticks).
    const existing = await prisma.hrmsRolePermission.count({ where: { roleId: role.id } });
    if (existing === 0) {
      const codes = expandPerms(seed.permissions);
      const pairs = codes.map(splitCode);
      if (pairs.length > 0) {
        await prisma.hrmsRolePermission.createMany({
          data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
          skipDuplicates: true,
        });
      }
      console.log(`  [${seed.code}] created ${pairs.length} permission rows`);
    } else {
      console.log(`  [${seed.code}] skipped — already has ${existing} permission rows`);
    }
  }

  // Link QK-EMP-0001 to super_admin if both exist.
  const superRole = await prisma.hrmsAppRole.findFirst({
    where: { orgId: orgId, appId: APP_ID, name: "super_admin" },
    select: { id: true },
  });
  const devEmp = await prisma.employee.findFirst({
    where: { orgId, employeeCode: "QK-EMP-0001", deletedAt: null },
    select: { id: true },
  });
  if (superRole && devEmp) {
    await prisma.hrmsUserAppRole.upsert({
      where: {
        userId_orgId_roleId: {
          userId: devEmp.id,
          orgId: orgId,
          roleId: superRole.id,
        },
      },
      create: {
        userId: devEmp.id,
        orgId: orgId,
        roleId: superRole.id,
        assignedBy: "system-seed",
      },
      update: {},
    });
    console.log(`  [link] QK-EMP-0001 → super_admin`);
  } else {
    console.log(`  [link] skipped (super_admin role or QK-EMP-0001 not found)`);
  }
}

async function main() {
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant="));
  const tenantFlag = process.argv.findIndex((a) => a === "--tenant");
  const orgId = tenantArg
    ? tenantArg.split("=")[1]
    : tenantFlag > -1
      ? process.argv[tenantFlag + 1]
      : null;

  if (orgId) {
    await seedRolesForTenant(orgId);
  } else {
    const tenants = await prisma.employee.findMany({
      distinct: ["orgId"],
      select: { orgId: true },
    });
    if (tenants.length === 0) {
      console.log("[seed-rbac-v2] no tenants found; pass --tenant <id> to bootstrap one");
      return;
    }
    for (const t of tenants) {
      await seedRolesForTenant(t.orgId);
    }
  }
}

main()
  .catch((err) => {
    console.error("[seed-rbac-v2] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
