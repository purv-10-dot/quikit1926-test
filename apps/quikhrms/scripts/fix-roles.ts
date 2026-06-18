/**
 * One-time fix for the "everyone sees everything" data-segregation bug.
 *
 *  1. Seeds the standard roles (super_admin, hr_admin, manager, employee, …)
 *     with their correct permissions. Marks `employee` as the DEFAULT role so
 *     new hires get self-service-only access.
 *  2. Demotes every employee currently on `super_admin` down to `employee`
 *     — EXCEPT the protected admin email below. Re-promote specific people
 *     later from Settings → Users.
 *
 * Run:  npx dotenv -e .env.local -- tsx prisma/fix-roles.ts
 */
import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";
import { PERMISSIONS, DEFAULT_ROLES } from "../lib/rbac/permissions";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

const APP_ID = "quikhrms";
// This account stays super_admin. Everyone else on super_admin is demoted.
const PROTECT_EMAIL = "gourav1231997@gmail.com";

function splitCode(code: string): { resource: string; action: string } {
  const lastDot = code.lastIndexOf(".");
  if (lastDot < 0) return { resource: code, action: "*" };
  return { resource: code.slice(0, lastDot), action: code.slice(lastDot + 1) };
}

async function seedRolesForTenant(orgId: string) {
  console.log(`\n── Tenant ${orgId} ──`);
  const roleIdByCode: Record<string, string> = {};

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
    roleIdByCode[r.code] = role.id;

    // Sync permissions to match the definition exactly (wipe + re-add).
    const targetCodes = r.permissions === "*" ? PERMISSIONS.map((p) => p.code) : r.permissions;
    await prisma.hrmsRolePermission.deleteMany({ where: { roleId: role.id } });
    if (targetCodes.length > 0) {
      const pairs = targetCodes.map(splitCode);
      await prisma.hrmsRolePermission.createMany({
        data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
        skipDuplicates: true,
      });
    }
    console.log(`  role ${r.code}: ${targetCodes.length} perms${isDefault ? " (DEFAULT)" : ""}`);
  }

  return roleIdByCode;
}

async function demoteWrongSuperAdmins(orgId: string, roleIdByCode: Record<string, string>) {
  const superId = roleIdByCode["super_admin"];
  const empId = roleIdByCode["employee"];
  if (!superId || !empId) return;

  const assigns = await prisma.hrmsUserAppRole.findMany({
    where: { orgId: orgId, roleId: superId },
    select: { id: true, userId: true },
  });

  let demoted = 0;
  for (const a of assigns) {
    const emp = await prisma.employee.findFirst({
      where: { id: a.userId, orgId },
      select: { workEmail: true, firstName: true, lastName: true },
    });
    const email = emp?.workEmail?.toLowerCase() ?? "";
    if (email === PROTECT_EMAIL.toLowerCase()) {
      console.log(`  keep super_admin: ${email}`);
      continue;
    }

    // Move this assignment to the employee role (or drop it if already present).
    const already = await prisma.hrmsUserAppRole.findFirst({
      where: { userId: a.userId, orgId: orgId, roleId: empId },
      select: { id: true },
    });
    if (already) {
      await prisma.hrmsUserAppRole.delete({ where: { id: a.id } });
    } else {
      await prisma.hrmsUserAppRole.update({ where: { id: a.id }, data: { roleId: empId } });
    }
    demoted++;
    console.log(`  demoted → employee: ${emp?.firstName ?? "?"} ${emp?.lastName ?? ""} <${email || a.userId}>`);
  }
  console.log(`  demoted ${demoted} account(s)`);
}

async function main() {
  // Cover every tenant that has employees (usually just one).
  const tenants = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: { orgId: true },
    distinct: ["orgId"],
  });
  const orgIds = tenants.map((t) => t.orgId);
  if (orgIds.length === 0) {
    console.log("No employees found — nothing to fix.");
    return;
  }

  for (const orgId of orgIds) {
    const roleIdByCode = await seedRolesForTenant(orgId);
    await demoteWrongSuperAdmins(orgId, roleIdByCode);
  }
  console.log("\n✅ Roles fixed. New hires default to 'employee'. Re-promote specific people in Settings → Users.");
  console.log("   (Permission cache may take up to ~5 min to refresh; affected users should re-login.)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
