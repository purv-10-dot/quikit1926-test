import { PrismaClient } from "@quikit/database";
import pg from "pg";

const url = "postgresql://postgres:sa@123@localhost:5433/quikit_dev";
const pool = new pg.Pool({ connectionString: url });
const prisma = new PrismaClient();

(async () => {
  const t = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='quikhrms' ORDER BY table_name`,
  );
  console.log(`quikhrms schema (${t.length} tables):`);
  console.log(t.map((r) => r.table_name));
  await prisma.$disconnect();
  await pool.end();
})();
