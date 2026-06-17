/**
 * Diagnostic: dump every AppRole row (orgId, appId, name, perm count) and the
 * tenant(s) of existing employees. Read-only.
 *
 * Run:  npx dotenv -e .env.local -- tsx prisma/list-roles.ts
 */
import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log("DB host:", url.replace(/:[^:@/]+@/, ":***@").split("@")[1]?.split("/")[0] ?? "(unknown)");

  const roles = await prisma.hrmsAppRole.findMany({
    select: { id: true, orgId: true, appId: true, name: true, isDefault: true, _count: { select: { permissions: true } } },
    orderBy: [{ orgId: "asc" }, { appId: "asc" }, { name: "asc" }],
  });
  console.log(`\nAppRole rows: ${roles.length}`);
  for (const r of roles) {
    console.log(`  org=${r.orgId}  app=${r.appId}  name=${r.name}  perms=${r._count.permissions}${r.isDefault ? "  (DEFAULT)" : ""}`);
  }

  const tenants = await prisma.employee.findMany({
    where: { deletedAt: null }, select: { orgId: true }, distinct: ["orgId"],
  });
  console.log(`\nEmployee tenant(s): ${tenants.map((t) => t.orgId).join(", ") || "(none)"}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
