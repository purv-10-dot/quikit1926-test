import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
  );
  const names = rows.map((r) => r.table_name);
  console.log("Total tables:", names.length);
  const wanted = ["AppRole", "RolePermission", "UserAppRole", "UserPermissionExtra", "RoleNavigation"];
  for (const w of wanted) {
    console.log(`  ${w}: ${names.includes(w) ? "✓" : "✗ MISSING"}`);
  }
  console.log("\nAll tables starting with App/Role/User:");
  console.log(names.filter((n) => /^(App|Role|User|Permission)/.test(n)));
  await prisma.$disconnect();
  await pool.end();
})();
