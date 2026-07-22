import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";
import { PERMISSIONS, DEFAULT_ROLES } from "../lib/rbac/permissions";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();
const TENANT = "tenant_dev_001";
const ADMIN = "user_dev_001";
const APP_ID = "quikhrms";

function splitCode(code: string): { resource: string; action: string } {
  const lastDot = code.lastIndexOf(".");
  if (lastDot < 0) return { resource: code, action: "*" };
  return { resource: code.slice(0, lastDot), action: code.slice(lastDot + 1) };
}

async function seed() {
  console.log("🌱 Minimal seed starting...");

  // ── 1. RBAC v2: AppRole + RolePermission ────────
  console.log("  Roles...");
  for (const r of DEFAULT_ROLES) {
    const isSystem = r.code === "super_admin";
    const isDefault = r.code === "employee";
    const role = await prisma.hrmsAppRole.upsert({
      where: { orgId_appId_name: { orgId: TENANT, appId: APP_ID, name: r.code } },
      create: {
        orgId: TENANT,
        appId: APP_ID,
        name: r.code,
        description: r.description,
        isSystem,
        isDefault,
        createdBy: ADMIN,
      },
      update: { description: r.description, isSystem, isDefault },
    });

    const targetCodes = r.permissions === "*" ? PERMISSIONS.map((p) => p.code) : r.permissions;
    const existing = await prisma.hrmsRolePermission.count({ where: { roleId: role.id } });
    if (existing === 0 && targetCodes.length > 0) {
      const pairs = targetCodes.map(splitCode);
      await prisma.hrmsRolePermission.createMany({
        data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
        skipDuplicates: true,
      });
    }
  }
  const roles = await prisma.hrmsAppRole.findMany({
    where: { orgId: TENANT, appId: APP_ID },
    select: { id: true, name: true },
  });
  const roleIdByCode = Object.fromEntries(roles.map((r) => [r.name, r.id]));
  console.log(`    ${roles.length} roles`);

  // ── 2. Department (1 default for admin FK) ──────
  console.log("  Default department...");
  const dept = await prisma.department.upsert({
    where: { orgId_code: { orgId: TENANT, code: "ADMIN" } },
    create: {
      orgId: TENANT,
      code: "ADMIN",
      name: "Administration",
      description: "Default admin department",
      status: "Active",
      createdBy: ADMIN,
      updatedBy: ADMIN,
    },
    update: {},
  });

  // ── 3. Designation (1 for admin) ────────────────
  let desig = await prisma.designation.findFirst({
    where: { orgId: TENANT, title: "Administrator", deletedAt: null },
  });
  if (!desig) {
    desig = await prisma.designation.create({
      data: {
        orgId: TENANT,
        title: "Administrator",
        level: 10,
        createdBy: ADMIN,
        updatedBy: ADMIN,
      },
    });
  }

  // ── 4. Office Location ──────────────────────────
  let office = await prisma.officeLocation.findFirst({
    where: { orgId: TENANT, name: "Headquarters", deletedAt: null },
  });
  if (!office) {
    office = await prisma.officeLocation.create({
      data: {
        orgId: TENANT,
        name: "Headquarters",
        isHeadquarter: true,
        country: "India",
        timezone: "Asia/Kolkata",
        createdBy: ADMIN,
        updatedBy: ADMIN,
      },
    });
  }

  // ── 5. Admin Employee ───────────────────────────
  console.log("  Admin user...");
  await prisma.employee.upsert({
    where: { id: ADMIN },
    create: {
      id: ADMIN,
      orgId: TENANT,
      employeeCode: "QK-EMP-0001",
      firstName: "Gourav",
      lastName: "Chandel",
      workEmail: "gourav@quikit.ai",
      jobTitle: "Administrator",
      departmentId: dept.id,
      designationId: desig.id,
      officeLocationId: office.id,
      employmentType: "FullTime",
      workerType: "Permanent",
      workLocation: "Office",
      dateOfJoining: new Date("2024-01-01"),
      status: "Active",
      inviteStatus: "Active",
      createdBy: ADMIN,
      updatedBy: ADMIN,
    },
    update: {},
  });

  // RBAC v2: link admin to super_admin via UserAppRole.
  const superRoleId = roleIdByCode["super_admin"];
  if (superRoleId) {
    await prisma.hrmsUserAppRole.upsert({
      where: {
        userId_orgId_roleId: { userId: ADMIN, orgId: TENANT, roleId: superRoleId },
      },
      create: { userId: ADMIN, orgId: TENANT, roleId: superRoleId, assignedBy: ADMIN },
      update: {},
    });
  }

  console.log("\n✅ Minimal seed complete.\n");
  console.log("Admin login:");
  console.log(`  x-tenant-id: ${TENANT}`);
  console.log(`  x-user-id:   ${ADMIN}`);
  console.log(`  x-user-roles: super_admin`);
  console.log("\nApp ready. Add real employees via UI.\n");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
