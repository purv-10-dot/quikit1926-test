/**
 * Import / sync all standard roles (super_admin, hr_admin, hr_manager, manager,
 * employee, recruiter, finance_admin, it_admin, …) and their permissions into
 * the database pointed to by DATABASE_URL. Idempotent — safe to re-run.
 * Marks `employee` as the default role. Does NOT change any user's assignment.
 *
 * Run (writes to whatever DATABASE_URL in .env points to — i.e. Neon/prod):
 *   npx dotenv -e .env.local -- tsx prisma/import-roles.ts
 */
import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";
import { PERMISSIONS, DEFAULT_ROLES } from "../lib/rbac/permissions";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

const APP_ID = "quikhrms";

function splitCode(code: string): { resource: string; action: string } {
  const lastDot = code.lastIndexOf(".");
  if (lastDot < 0) return { resource: code, action: "*" };
  return { resource: code.slice(0, lastDot), action: code.slice(lastDot + 1) };
}

async function seedRolesForTenant(orgId: string) {
  console.log(`\n── Tenant ${orgId} ──`);
  for (const r of DEFAULT_ROLES) {
    const isSystem = r.code === "super_admin";
    const isDefault = r.code === "employee";
    const role = await prisma.hrmsAppRole.upsert({
      where: { orgId_appId_name: { orgId: orgId, appId: APP_ID, name: r.code } },
      create: {
        orgId: orgId, appId: APP_ID, name: r.code,
        description: r.description, isSystem, isDefault, createdBy: "system",
      },
      update: { description: r.description, isSystem, isDefault },
    });

    const targetCodes = r.permissions === "*" ? PERMISSIONS.map((p) => p.code) : r.permissions;
    await prisma.hrmsRolePermission.deleteMany({ where: { roleId: role.id } });
    if (targetCodes.length > 0) {
      await prisma.hrmsRolePermission.createMany({
        data: targetCodes.map(splitCode).map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
        skipDuplicates: true,
      });
    }
    console.log(`  ${r.code}: ${targetCodes.length} perms${isDefault ? " (DEFAULT)" : ""}`);
  }
}

async function main() {
  // Seed roles for every tenant that has employees (covers your live tenant).
  const tenants = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: { orgId: true },
    distinct: ["orgId"],
  });
  let ids = tenants.map((t) => t.orgId);
  if (ids.length === 0) ids = ["tenant_dev_001"]; // fallback if no employees yet

  for (const orgId of ids) await seedRolesForTenant(orgId);

  console.log(`\n✅ Imported ${DEFAULT_ROLES.length} roles for ${ids.length} tenant(s).`);
  console.log("   Roles list is cached ~10 min — wait or hard-refresh; new roles then appear in the Invite dialog.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
