/**
 * QuikConstruction — Prisma Seed Script
 *
 * Seeds only what the system needs to boot:
 *   1. RBAC permission catalog (module-scoped keys)
 *   2. System roles + role → permission assignments
 *   3. Super-admin user — single login-capable account, env-driven via
 *      SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD (and friends). All other
 *      tenant users are invited via Settings → Users at runtime.
 *
 * No master data (companies, projects, UOMs, GST/TDS codes, T&C templates)
 * is seeded — every tenant creates their own through the Masters UI.
 *
 * Run with:  pnpm --filter @quikit/quikconstruction prisma db seed
 * or:        npx ts-node prisma/seed.ts  (from apps/quikconstruction)
 *
 * Idempotent: every record uses upsert so running the script twice is safe.
 */

// Import from the custom Prisma output path — see schema.prisma generator
// block. The default "@prisma/client" resolves to the shared pnpm virtual
// store which gets clobbered by root workspace generates.
import { PrismaClient } from "../node_modules/.prisma-qc/client";
import { scryptSync, randomBytes } from "crypto";

// Pull all RBAC constants from the single source of truth. The seed never
// hardcodes permission keys — it materializes exactly what the app imports.
import { PERMISSION_CATALOG } from "../src/lib/rbac/permissions";
import { ROLE_DEFINITIONS as RBAC_ROLES } from "../src/lib/rbac/roles";

const db = new PrismaClient();

const T = "default"; // tenantId
const O = "default"; // orgId
const U = "demo-user-1"; // userId (audit stamp for seed records)

// ─── Password hashing — scrypt via node:crypto (no bcrypt dependency) ──
// Stored format: "<salt_hex>:<hash_hex>". Verify path mirrors this in
// app/api/auth/[...nextauth]/route.ts.
function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// ─── Super-admin — sole seeded login-capable account ──────────────────
// Credentials read from env (SUPERADMIN_*) so they can be rotated per
// environment without a code change. The seed upserts by email and
// removes any other CnDemoUser rows so the table converges to exactly
// one account: the one defined in .env.
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? "";
const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME ?? "Super Admin";
const SUPERADMIN_ROLE_KEY = process.env.SUPERADMIN_ROLE_KEY ?? "platform_super_admin";
const SUPERADMIN_DISPLAY_ROLE = process.env.SUPERADMIN_DISPLAY_ROLE ?? "SUPER_ADMIN";
const SUPERADMIN_DEPARTMENT = process.env.SUPERADMIN_DEPARTMENT ?? "Engineering";
const SUPERADMIN_ID = process.env.SUPERADMIN_ID ?? "usr-superadmin";

if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
  console.error(
    "SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in .env. " +
      "Aborting seed — refusing to create the super-admin without explicit credentials."
  );
  process.exit(1);
}

// ─── Main seed ──────────────────────────────────────────────────────

async function main() {
  console.log("── QuikConstruction seed ──");

  // 1. Permissions — pulled from PERMISSION_CATALOG in src/lib/rbac/permissions.ts
  console.log(`  · permissions (${PERMISSION_CATALOG.length})`);
  for (const p of PERMISSION_CATALOG) {
    await db.cnPermission.upsert({
      where: { key: p.key },
      create: { key: p.key, name: p.name, module: p.module, description: p.description },
      update: { name: p.name, module: p.module, description: p.description },
    });
  }

  // 2. Roles + role-permission assignments — pulled from ROLE_DEFINITIONS
  console.log(`  · roles (${RBAC_ROLES.length})`);
  for (const role of RBAC_ROLES) {
    const created = await db.cnRole.upsert({
      where: { tenantId_key: { tenantId: T, key: role.key } },
      create: {
        tenantId: T,
        orgId: O,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        createdBy: U,
        updatedBy: U,
      },
      update: {
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
      },
    });

    // Clear existing role↔perm assignments and re-insert (idempotent).
    await db.cnRolePermission.deleteMany({ where: { roleId: created.id } });

    if (role.permissions === "*") {
      // Materialize the wildcard as concrete rows — every current permission
      // gets attached. This means `permissions.has('boq.lock')` works for
      // super/tenant admins with no special-case branch at runtime.
      const allPerms = await db.cnPermission.findMany();
      for (const p of allPerms) {
        await db.cnRolePermission.create({
          data: { roleId: created.id, permissionId: p.id },
        });
      }
    } else {
      for (const key of role.permissions) {
        const perm = await db.cnPermission.findUnique({ where: { key } });
        if (!perm) {
          console.warn(`     ! permission ${key} not found (role ${role.key}), skipped`);
          continue;
        }
        await db.cnRolePermission.create({
          data: { roleId: created.id, permissionId: perm.id },
        });
      }
    }
  }

  // 3. Super-admin — single env-driven login-capable account
  console.log(`  · super-admin: ${SUPERADMIN_EMAIL}`);
  const passwordHash = hashPassword(SUPERADMIN_PASSWORD);
  await db.cnDemoUser.upsert({
    where: { email: SUPERADMIN_EMAIL },
    create: {
      id: SUPERADMIN_ID,
      tenantId: T,
      orgId: O,
      email: SUPERADMIN_EMAIL,
      passwordHash,
      name: SUPERADMIN_NAME,
      displayRole: SUPERADMIN_DISPLAY_ROLE,
      roleKey: SUPERADMIN_ROLE_KEY,
      department: SUPERADMIN_DEPARTMENT,
    },
    update: {
      passwordHash,
      name: SUPERADMIN_NAME,
      displayRole: SUPERADMIN_DISPLAY_ROLE,
      roleKey: SUPERADMIN_ROLE_KEY,
      department: SUPERADMIN_DEPARTMENT,
    },
  });

  // Drop any prior demo-user rows (legacy amit/priya/rajesh/sanjay/rakesh
  // accounts) so the table converges to exactly the env-driven admin.
  const stale = await db.cnDemoUser.deleteMany({
    where: { email: { not: SUPERADMIN_EMAIL } },
  });
  if (stale.count > 0) {
    console.log(`  · removed ${stale.count} stale demo user(s)`);
  }

  console.log("── seed done ──");
  console.log("");
  console.log("Super-admin login:");
  console.log(`  ${SUPERADMIN_EMAIL.padEnd(30)}  ${SUPERADMIN_ROLE_KEY}  (${SUPERADMIN_DISPLAY_ROLE})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
