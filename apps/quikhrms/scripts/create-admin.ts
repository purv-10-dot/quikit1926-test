import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PERMISSIONS, DEFAULT_ROLES } from "../lib/rbac/permissions";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

// ── EDIT THESE ──────────────────────────────────────────
const TENANT = "tenant_dev_001";
const EMAIL = "gourav1231997@gmail.com";
const PASSWORD = "SuperAdmin@2026";
const FIRST = "Super";
const LAST = "Admin";
const EMP_CODE = "QK-ADMIN-001";
const APP_ID = "quikhrms";
// ────────────────────────────────────────────────────────

function splitCode(code: string): { resource: string; action: string } {
  const lastDot = code.lastIndexOf(".");
  if (lastDot < 0) return { resource: code, action: "*" };
  return { resource: code.slice(0, lastDot), action: code.slice(lastDot + 1) };
}

async function main() {
  const email = EMAIL.trim().toLowerCase();
  console.log(`Creating super admin: ${email}`);

  // 1) Ensure the super_admin role + its permissions exist for this tenant.
  const def = DEFAULT_ROLES.find((r) => r.code === "super_admin")!;
  const role = await prisma.hrmsAppRole.upsert({
    where: { orgId_appId_name: { orgId: TENANT, appId: APP_ID, name: "super_admin" } },
    create: {
      orgId: TENANT, appId: APP_ID, name: "super_admin",
      description: def.description, isSystem: true, isDefault: false,
      createdBy: "system",
    },
    update: { isSystem: true },
  });

  const codes = def.permissions === "*" ? PERMISSIONS.map((p) => p.code) : def.permissions;
  const existing = await prisma.hrmsRolePermission.count({ where: { roleId: role.id } });
  if (existing === 0) {
    const pairs = codes.map(splitCode);
    await prisma.hrmsRolePermission.createMany({
      data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
      skipDuplicates: true,
    });
  }

  // 2) Create or update the employee with a hashed login password.
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const emp = await prisma.employee.upsert({
    where: { orgId_employeeCode: { orgId: TENANT, employeeCode: EMP_CODE } },
    create: {
      orgId: TENANT, employeeCode: EMP_CODE,
      firstName: FIRST, lastName: LAST,
      workEmail: email, passwordHash,
      status: "Active", inviteStatus: "Active",
      dateOfJoining: new Date(),
      mustChangePassword: false,
      createdBy: "system", updatedBy: "system",
    },
    update: {
      workEmail: email, passwordHash,
      status: "Active", inviteStatus: "Active",
      mustChangePassword: false,
      failedLoginAttempts: 0, lockedUntil: null,
    },
  });

  // 3) Assign the super_admin role to the employee.
  await prisma.hrmsUserAppRole.upsert({
    where: { userId_orgId_roleId: { userId: emp.id, orgId: TENANT, roleId: role.id } },
    create: { userId: emp.id, orgId: TENANT, roleId: role.id, assignedBy: "system" },
    update: {},
  });

  console.log("✅ Super admin ready");
  console.log(`   email:    ${email}`);
  console.log(`   password: ${PASSWORD}`);
  console.log(`   tenant:   ${TENANT}`);
  console.log(`   id:       ${emp.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
