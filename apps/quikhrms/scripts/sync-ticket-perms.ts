import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";
import { DEFAULT_ROLES } from "../lib/rbac/permissions";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();
const TENANT = "tenant_dev_001";
const APP_ID = "quikhrms";

const TICKET_PERM_CODES = [
  "hrms.ticket.read",
  "hrms.ticket.read_self",
  "hrms.ticket.read_assigned",
  "hrms.ticket.raise",
  "hrms.ticket.write",
  "hrms.ticket.manage",
  "hrms.ticket.delete",
];

function splitCode(code: string): { resource: string; action: string } {
  const lastDot = code.lastIndexOf(".");
  if (lastDot < 0) return { resource: code, action: "*" };
  return { resource: code.slice(0, lastDot), action: code.slice(lastDot + 1) };
}

async function sync() {
  console.log("Syncing ticket permissions to AppRole rows (RBAC v2)...");

  const roles = await prisma.hrmsAppRole.findMany({
    where: { orgId: TENANT, appId: APP_ID },
    select: { id: true, name: true },
  });

  for (const role of roles) {
    const seedRole = DEFAULT_ROLES.find((r) => r.code === role.name);
    if (!seedRole) continue;

    const desiredCodes =
      seedRole.permissions === "*"
        ? TICKET_PERM_CODES
        : seedRole.permissions.filter((c) => TICKET_PERM_CODES.includes(c));

    if (desiredCodes.length === 0) continue;
    const desiredPairs = desiredCodes.map(splitCode);

    // Check which (resource, action) pairs already exist for this role.
    const existing = await prisma.hrmsRolePermission.findMany({
      where: {
        roleId: role.id,
        OR: desiredPairs.map((p) => ({ resource: p.resource, action: p.action })),
      },
      select: { resource: true, action: true },
    });
    const existingKey = new Set(existing.map((e) => `${e.resource}:${e.action}`));
    const missing = desiredPairs.filter((p) => !existingKey.has(`${p.resource}:${p.action}`));

    if (missing.length > 0) {
      await prisma.hrmsRolePermission.createMany({
        data: missing.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
        skipDuplicates: true,
      });
      console.log(`  ${role.name}: added ${missing.length} ticket perm(s)`);
    } else {
      console.log(`  ${role.name}: up to date`);
    }
  }

  console.log("Done.");
}

sync()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
